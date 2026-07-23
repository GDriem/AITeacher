import socket
import threading
import time

import httpx
import pytest
import uvicorn

from agent_app.api.main import create_app as create_agent_app
from agent_app.config import Settings
from agent_app.providers.mock import MockModelProvider
from agent_app.services.learning_tools import RemoteMcpLearningTools
from mcp_learning_server.server import create_app as create_mcp_app


@pytest.fixture
def running_mcp_url(learning_service):
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]
    config = uvicorn.Config(
        create_mcp_app(learning_service),
        host="127.0.0.1",
        port=port,
        log_level="warning",
    )
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    deadline = time.monotonic() + 5
    while not server.started and time.monotonic() < deadline:
        time.sleep(0.01)
    if not server.started:
        server.should_exit = True
        thread.join(timeout=2)
        pytest.fail("El servidor MCP local no inició")
    yield f"http://127.0.0.1:{port}/mcp/"
    server.should_exit = True
    thread.join(timeout=5)


@pytest.mark.integration
@pytest.mark.asyncio
async def test_agent_calls_independent_mcp_over_streamable_http(running_mcp_url) -> None:
    settings = Settings(
        mcp_use_local_adapter=False,
        mcp_server_url=running_mcp_url,
    )
    remote_tools = RemoteMcpLearningTools(running_mcp_url)
    app = create_agent_app(settings, remote_tools, MockModelProvider())
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://agent.local"
    ) as client:
        topics = await client.get(
            "/api/topics", params={"student_id": "remote-student"}
        )
        response = await client.post(
            "/api/chat",
            json={
                "student_id": "remote-student",
                "message": "Explícame embeddings y comprueba primero mi progreso",
            },
        )
    assert topics.status_code == 200, topics.text
    assert topics.json()["total_topics"] == 23
    assert topics.json()["topics"][0]["category"] == "fundamentos"
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["topic"] == "embeddings"
    assert any(
        event["action"] == "get_student_progress" for event in payload["trace"]
    )
    assert any(
        event["action"] == "search_learning_content" for event in payload["trace"]
    )

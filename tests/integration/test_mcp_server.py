import httpx
import pytest

from mcp_learning_server.server import create_app


HEADERS = {
    "accept": "application/json, text/event-stream",
    "content-type": "application/json",
}


async def rpc(
    client: httpx.AsyncClient, method: str, params: dict, request_id: int = 1
) -> dict:
    response = await client.post(
        "/mcp/",
        headers=HEADERS,
        json={
            "jsonrpc": "2.0",
            "id": request_id,
            "method": method,
            "params": params,
        },
    )
    assert response.status_code == 200, response.text
    return response.json()


@pytest.mark.integration
@pytest.mark.asyncio
async def test_health_check(learning_service) -> None:
    app = create_app(learning_service)
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://localhost:8001",
        ) as client:
            response = await client.get("/healthz")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "learning-mcp"}


@pytest.mark.integration
@pytest.mark.asyncio
async def test_mcp_lists_and_calls_structured_tools(learning_service) -> None:
    app = create_app(learning_service)
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://localhost:8001",
        ) as client:
            initialized = await rpc(
                client,
                "initialize",
                {
                    "protocolVersion": "2025-06-18",
                    "capabilities": {},
                    "clientInfo": {"name": "pytest", "version": "1.0"},
                },
            )
            assert "result" in initialized
            listed = await rpc(client, "tools/list", {}, 2)
            names = {tool["name"] for tool in listed["result"]["tools"]}
            assert names == {
                "get_student_progress",
                "search_learning_content",
                "get_learning_path",
                "save_learning_result",
                "find_practical_example",
                "list_available_topics",
            }
            resources = await rpc(client, "resources/list", {}, 3)
            assert {
                resource["uri"] for resource in resources["result"]["resources"]
            } == {"learning://topics"}
            called = await rpc(
                client,
                "tools/call",
                {
                    "name": "search_learning_content",
                    "arguments": {"topic": "embeddings", "level": "beginner"},
                },
                4,
            )
            assert called["result"]["isError"] is False
            assert called["result"]["structuredContent"]["result"][0]["source"]


@pytest.mark.integration
@pytest.mark.asyncio
async def test_mcp_rejects_unknown_host_by_default(learning_service) -> None:
    """Sin MCP_ALLOWED_HOSTS, un host distinto de localhost debe rechazarse.

    Reproduce el 421 Misdirected Request observado en docker-compose cuando
    el cliente llama al servicio por su nombre interno (p. ej. mcp-server).
    """
    app = create_app(learning_service)
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://mcp-server:8080",
        ) as client:
            response = await client.post(
                "/mcp/",
                headers=HEADERS,
                json={
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "initialize",
                    "params": {
                        "protocolVersion": "2025-06-18",
                        "capabilities": {},
                        "clientInfo": {"name": "pytest", "version": "1.0"},
                    },
                },
            )
    assert response.status_code == 421


@pytest.mark.integration
@pytest.mark.asyncio
async def test_mcp_allows_configured_extra_host(learning_service) -> None:
    app = create_app(learning_service, allowed_hosts=["mcp-server:8080"])
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://mcp-server:8080",
        ) as client:
            initialized = await rpc(
                client,
                "initialize",
                {
                    "protocolVersion": "2025-06-18",
                    "capabilities": {},
                    "clientInfo": {"name": "pytest", "version": "1.0"},
                },
            )
    assert "result" in initialized


@pytest.mark.integration
@pytest.mark.asyncio
async def test_mcp_rejects_invalid_tool_input(learning_service) -> None:
    app = create_app(learning_service)
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://localhost:8001",
        ) as client:
            await rpc(
                client,
                "initialize",
                {
                    "protocolVersion": "2025-06-18",
                    "capabilities": {},
                    "clientInfo": {"name": "pytest", "version": "1.0"},
                },
            )
            called = await rpc(
                client,
                "tools/call",
                {
                    "name": "save_learning_result",
                    "arguments": {
                        "student_id": "student-1",
                        "topic": "rag",
                        "score": 120,
                        "feedback": "No debe persistirse",
                    },
                },
                2,
            )
    assert called["result"]["isError"] is True

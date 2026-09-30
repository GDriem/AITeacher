import pytest
from fastapi import WebSocket
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from agent_app.api import main as api_main
from agent_app.api.main import create_app
from agent_app.config import Settings
from agent_app.providers.mock import MockModelProvider
from agent_app.services.learning_tools import LocalLearningTools


class HoldingVoiceBridge:
    """Mantiene la sesión viva hasta que el cliente de prueba se desconecta."""

    def __init__(self, settings: Settings, session_context: str = "") -> None:
        pass

    async def run(self, websocket: WebSocket) -> None:
        await websocket.send_json({"type": "ready"})
        await websocket.receive_text()


def build_voice_app(learning_service, monkeypatch):
    monkeypatch.setattr(api_main, "GeminiLiveBridge", HoldingVoiceBridge)
    return create_app(
        Settings(voice_max_concurrent_sessions_per_student=1),
        tools=LocalLearningTools(learning_service),
        provider=MockModelProvider(),
    )


@pytest.mark.integration
def test_first_voice_connection_is_allowed(learning_service, monkeypatch) -> None:
    app = build_voice_app(learning_service, monkeypatch)

    with TestClient(app) as client:
        with client.websocket_connect("/ws/live?student_id=alumno-uno") as websocket:
            assert websocket.receive_json() == {"type": "ready"}


@pytest.mark.integration
def test_concurrent_voice_connection_is_rejected_at_limit(
    learning_service, monkeypatch
) -> None:
    app = build_voice_app(learning_service, monkeypatch)

    with TestClient(app) as client:
        with client.websocket_connect("/ws/live?student_id=alumno-uno") as first:
            assert first.receive_json() == {"type": "ready"}
            with pytest.raises(WebSocketDisconnect) as rejected:
                with client.websocket_connect("/ws/live?student_id=alumno-uno"):
                    pass

    assert rejected.value.code == 4429


@pytest.mark.integration
def test_voice_capacity_is_released_after_disconnect(
    learning_service, monkeypatch
) -> None:
    app = build_voice_app(learning_service, monkeypatch)

    with TestClient(app) as client:
        with client.websocket_connect("/ws/live?student_id=alumno-uno") as first:
            assert first.receive_json() == {"type": "ready"}
        with client.websocket_connect("/ws/live?student_id=alumno-uno") as second:
            assert second.receive_json() == {"type": "ready"}


@pytest.mark.integration
def test_voice_capacity_is_isolated_between_students(
    learning_service, monkeypatch
) -> None:
    app = build_voice_app(learning_service, monkeypatch)

    with TestClient(app) as client:
        with client.websocket_connect("/ws/live?student_id=alumno-uno") as first:
            assert first.receive_json() == {"type": "ready"}
            with client.websocket_connect("/ws/live?student_id=alumno-dos") as second:
                assert second.receive_json() == {"type": "ready"}

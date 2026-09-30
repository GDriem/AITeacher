from unittest.mock import Mock, sentinel

import pytest

from agent_app.config import Settings
from mcp_learning_server import server


@pytest.mark.parametrize(
    ("port", "app_port", "expected"),
    [
        ("9090", "8080", 9090),
        (None, "8080", 8080),
        (None, None, 8000),
    ],
)
def test_settings_resuelve_puerto_por_prioridad(
    monkeypatch: pytest.MonkeyPatch,
    port: str | None,
    app_port: str | None,
    expected: int,
) -> None:
    monkeypatch.delenv("PORT", raising=False)
    monkeypatch.delenv("APP_PORT", raising=False)
    if port is not None:
        monkeypatch.setenv("PORT", port)
    if app_port is not None:
        monkeypatch.setenv("APP_PORT", app_port)

    assert Settings().app_port == expected


@pytest.mark.parametrize(
    ("port", "mcp_port", "expected"),
    [
        ("9090", "8080", 9090),
        (None, "8080", 8080),
        (None, None, 8001),
    ],
)
def test_mcp_resuelve_puerto_por_prioridad(
    monkeypatch: pytest.MonkeyPatch,
    port: str | None,
    mcp_port: str | None,
    expected: int,
) -> None:
    monkeypatch.delenv("PORT", raising=False)
    monkeypatch.delenv("MCP_PORT", raising=False)
    if port is not None:
        monkeypatch.setenv("PORT", port)
    if mcp_port is not None:
        monkeypatch.setenv("MCP_PORT", mcp_port)
    monkeypatch.setattr(server, "create_app", lambda: sentinel.app)
    run = Mock()
    monkeypatch.setattr(server.uvicorn, "run", run)

    server.main()

    run.assert_called_once_with(sentinel.app, host="0.0.0.0", port=expected)

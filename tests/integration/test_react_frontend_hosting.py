from pathlib import Path

import httpx
import pytest

import agent_app.api.main as api_main
from agent_app.config import ModelProviderName, Settings
from agent_app.providers.mock import MockModelProvider
from agent_app.services.learning_tools import LocalLearningTools
from agent_app.services.sessions import LocalSessionRepository


def _build_app(
    learning_service,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
):
    dist = tmp_path / "dist"
    assets = dist / "assets"
    assets.mkdir(parents=True)
    (dist / "index.html").write_text(
        '<!doctype html><div id="root">React R11</div>',
        encoding="utf-8",
    )
    (assets / "app-r1.js").write_text("export {};", encoding="utf-8")
    monkeypatch.setattr(api_main, "REACT_DIST_DIR", dist)

    settings = Settings(
        model_provider=ModelProviderName.MOCK,
        mcp_use_local_adapter=True,
        google_client_id=None,
        app_session_secret=None,
        app_sessions_path=str(tmp_path / "sessions.json"),
    )
    return settings, api_main.create_app(
        settings,
        tools=LocalLearningTools(learning_service),
        provider=MockModelProvider(),
        sessions=LocalSessionRepository(tmp_path / "sessions.json"),
    )


@pytest.mark.integration
@pytest.mark.asyncio
async def test_react_serves_root_deep_and_unknown_routes(
    learning_service,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    _, app = _build_app(learning_service, monkeypatch, tmp_path)

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://agent.local",
    ) as client:
        root = await client.get("/")
        deep_route = await client.get("/tutor")
        unknown_route = await client.get("/una-ruta-desconocida")
        asset = await client.get("/assets/app-r1.js")

    assert root.status_code == 200
    assert "React R11" in root.text
    assert root.text == deep_route.text == unknown_route.text
    assert root.headers["cache-control"] == "no-cache"
    assert asset.status_code == 200
    assert asset.headers["cache-control"] == "public, max-age=31536000, immutable"

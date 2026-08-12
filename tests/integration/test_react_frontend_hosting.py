from pathlib import Path

import httpx
import pytest

import agent_app.api.main as api_main
from agent_app.config import ModelProviderName, Settings
from agent_app.providers.mock import MockModelProvider
from agent_app.services.learning_tools import LocalLearningTools
from agent_app.services.sessions import LocalSessionRepository


@pytest.mark.integration
@pytest.mark.asyncio
async def test_react_build_coexists_with_legacy_ui(
    learning_service,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    dist = tmp_path / "dist"
    assets = dist / "assets"
    assets.mkdir(parents=True)
    (dist / "index.html").write_text(
        '<!doctype html><div id="root">React R1</div>',
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
    app = api_main.create_app(
        settings,
        tools=LocalLearningTools(learning_service),
        provider=MockModelProvider(),
        sessions=LocalSessionRepository(tmp_path / "sessions.json"),
    )

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://agent.local",
    ) as client:
        legacy = await client.get("/")
        react = await client.get("/app")
        deep_route = await client.get("/app/catalogo")
        asset = await client.get("/app/assets/app-r1.js")

    assert legacy.status_code == 200
    assert "React R1" not in legacy.text
    assert react.status_code == 200
    assert react.text == deep_route.text
    assert react.headers["cache-control"] == "no-cache"
    assert asset.status_code == 200
    assert asset.headers["cache-control"] == "public, max-age=31536000, immutable"


def test_legacy_ui_accepts_explicit_react_session_handoff() -> None:
    script = (api_main.STATIC_DIR / "app.js").read_text(encoding="utf-8")

    assert 'new URLSearchParams(location.search).get("session")' in script
    assert 'cleanUrl.searchParams.delete("session")' in script

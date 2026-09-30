import asyncio
from unittest.mock import AsyncMock

import pytest

from agent_app.services.learning_tools import RemoteMcpLearningTools


@pytest.mark.asyncio
async def test_identity_token_is_cached_until_its_expiration(monkeypatch) -> None:
    now = [1_000.0]
    client = RemoteMcpLearningTools(
        "https://mcp.example/mcp/",
        auth_audience="https://mcp.example",
        clock=lambda: now[0],
    )
    fetch_token = AsyncMock(side_effect=["primer-token", "segundo-token"])
    monkeypatch.setattr(client, "_fetch_identity_token", fetch_token)

    assert await client._identity_token() == "primer-token"
    assert await client._identity_token() == "primer-token"
    assert fetch_token.await_count == 1

    now[0] += client._TOKEN_LIFETIME_SECONDS + 1

    assert await client._identity_token() == "segundo-token"
    assert fetch_token.await_count == 2


@pytest.mark.asyncio
async def test_identity_token_is_refreshed_inside_five_minute_margin(
    monkeypatch,
) -> None:
    now = [1_000.0]
    client = RemoteMcpLearningTools(
        "https://mcp.example/mcp/",
        auth_audience="https://mcp.example",
        clock=lambda: now[0],
    )
    fetch_token = AsyncMock(side_effect=["primer-token", "segundo-token"])
    monkeypatch.setattr(client, "_fetch_identity_token", fetch_token)

    assert await client._identity_token() == "primer-token"
    now[0] += (
        client._TOKEN_LIFETIME_SECONDS - client._TOKEN_REFRESH_MARGIN_SECONDS - 1
    )
    assert await client._identity_token() == "primer-token"

    now[0] += 2

    assert await client._identity_token() == "segundo-token"
    assert fetch_token.await_count == 2


@pytest.mark.asyncio
async def test_concurrent_identity_token_requests_share_one_fetch(monkeypatch) -> None:
    client = RemoteMcpLearningTools(
        "https://mcp.example/mcp/",
        auth_audience="https://mcp.example",
        clock=lambda: 1_000.0,
    )
    fetch_started = asyncio.Event()
    allow_fetch_to_finish = asyncio.Event()
    fetch_count = 0

    async def fetch_token() -> str:
        nonlocal fetch_count
        fetch_count += 1
        fetch_started.set()
        await allow_fetch_to_finish.wait()
        return "token-compartido"

    monkeypatch.setattr(client, "_fetch_identity_token", fetch_token)

    requests = [asyncio.create_task(client._identity_token()) for _ in range(10)]
    await fetch_started.wait()
    allow_fetch_to_finish.set()

    assert await asyncio.gather(*requests) == ["token-compartido"] * 10
    assert fetch_count == 1


@pytest.mark.asyncio
async def test_http_client_is_reused_and_closed() -> None:
    tools = RemoteMcpLearningTools("https://mcp.example/mcp/")

    first = tools._get_http_client()
    second = tools._get_http_client()

    assert second is first
    await tools.aclose()
    assert first.is_closed

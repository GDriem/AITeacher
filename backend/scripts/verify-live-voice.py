#!/usr/bin/env python3
"""Opt-in synthetic provider check; uses .env/ADC and incurs voice-model usage.

Exercises the existing Python bridge, not browser microphone, Google login,
distributed quotas or the future Azure network. Never saves audio/transcripts.
"""
import argparse
import asyncio
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from agent_app.config import Settings  # noqa: E402
from agent_app.services.live_voice import GeminiLiveBridge  # noqa: E402


class SyntheticBrowser:
    def __init__(self, turns: int):
        self.incoming = asyncio.Queue()
        self.target = turns
        self.completed = 0
        self.audio_bytes = 0
        self.ready = False
        self.started = time.monotonic()
        self.first_audio_ms = None

    async def send_json(self, value):
        if value["type"] == "ready":
            self.ready = True
            await self.prompt("Explica en una frase qué es un vector.")
        elif value["type"] == "turn_complete":
            self.completed += 1
            if self.completed < self.target:
                await self.prompt("Dame un ejemplo breve con dos características.")
            else:
                await self.incoming.put({"type": "websocket.disconnect"})
        elif value["type"] in ("error", "unavailable"):
            raise RuntimeError("Voice provider unavailable")

    async def send_bytes(self, value):
        self.audio_bytes += len(value)
        if self.first_audio_ms is None:
            self.first_audio_ms = round((time.monotonic() - self.started) * 1000)

    async def receive(self):
        return await self.incoming.get()

    async def prompt(self, text):
        await self.incoming.put({"text": json.dumps({"type": "text", "text": text})})


async def verify():
    settings = Settings()
    reports = []
    for turns in (2, 1):
        browser = SyntheticBrowser(turns)
        bridge = GeminiLiveBridge(settings, session_context="Ensayo sintético sin datos de alumnos.", session_topic="vectors")
        try:
            await asyncio.wait_for(bridge.run(browser), timeout=60)
        finally:
            await bridge.client.aio.aclose()
            bridge.client.close()
        if not browser.ready or browser.completed != turns or browser.audio_bytes == 0:
            raise RuntimeError("Incomplete voice check")
        reports.append({"completedTurns": browser.completed, "audioBytesDiscarded": browser.audio_bytes,
                        "firstAudioMs": browser.first_audio_ms})
    print(json.dumps({"passed": True, "model": settings.resolved_gemini_live_model,
                      "provider": "vertex" if settings.google_genai_use_vertexai else "gemini",
                      "twoTurnsAndReconnect": reports, "syntheticInputOnly": True,
                      "microphoneLoginInterruptionAndAzureNotVerified": True}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run", action="store_true", required=True, help="Explicitly enable model usage")
    parser.parse_args()
    try:
        asyncio.run(verify())
    except Exception as error:
        print(json.dumps({"passed": False, "errorType": type(error).__name__, "privatePayloadOmitted": True}))
        raise SystemExit(2)

"""Puente de audio; las credenciales Gemini nunca llegan al navegador."""

from __future__ import annotations

import asyncio
import json
import logging

from fastapi import WebSocket, WebSocketDisconnect
from google import genai
from google.genai import types

from agent_app.config import Settings

logger = logging.getLogger(__name__)


class VoiceUnavailable(RuntimeError):
    pass


class GeminiLiveBridge:
    def __init__(self, settings: Settings) -> None:
        if not settings.voice_enabled:
            raise VoiceUnavailable("Gemini Live API no está configurada")
        if settings.google_genai_use_vertexai:
            self.client = genai.Client(
                vertexai=True,
                project=settings.google_cloud_project,
                location=settings.google_cloud_location,
            )
        else:
            self.client = genai.Client(api_key=settings.google_api_key)
        self.model = settings.gemini_live_model
        self.voice = settings.gemini_live_voice

    async def run(self, websocket: WebSocket) -> None:
        config = types.LiveConnectConfig(
            response_modalities=["AUDIO"],
            speech_config=types.SpeechConfig(
                voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(
                        voice_name=self.voice
                    )
                )
            ),
            input_audio_transcription=types.AudioTranscriptionConfig(),
            output_audio_transcription=types.AudioTranscriptionConfig(),
            system_instruction=(
                "Eres la interfaz de voz de un tutor de IA. Responde en español, de "
                "forma breve y didáctica. La experiencia principal y el progreso se "
                "gestionan por texto; no afirmes haber guardado resultados."
            ),
        )
        async with self.client.aio.live.connect(model=self.model, config=config) as session:
            await websocket.send_json({"type": "ready", "sample_rate": 24000})
            browser_task = asyncio.create_task(self._browser_to_model(websocket, session))
            model_task = asyncio.create_task(self._model_to_browser(websocket, session))
            done, pending = await asyncio.wait(
                {browser_task, model_task}, return_when=asyncio.FIRST_COMPLETED
            )
            for task in pending:
                task.cancel()
            await asyncio.gather(*pending, return_exceptions=True)
            for task in done:
                error = task.exception()
                if error and not isinstance(error, WebSocketDisconnect):
                    raise error

    @staticmethod
    async def _browser_to_model(websocket: WebSocket, session) -> None:
        while True:
            message = await websocket.receive()
            if message.get("type") == "websocket.disconnect":
                return
            if audio := message.get("bytes"):
                await session.send_realtime_input(
                    audio=types.Blob(
                        data=audio, mime_type="audio/pcm;rate=16000"
                    )
                )
                continue
            text = message.get("text")
            if not text:
                continue
            command = json.loads(text)
            if command.get("type") == "stop_audio":
                await session.send_realtime_input(audio_stream_end=True)
            elif command.get("type") == "text" and command.get("text"):
                await session.send_realtime_input(text=command["text"])

    @staticmethod
    async def _model_to_browser(websocket: WebSocket, session) -> None:
        async for message in session.receive():
            content = message.server_content
            if content is None:
                continue
            if content.input_transcription and content.input_transcription.text:
                await websocket.send_json(
                    {
                        "type": "transcript",
                        "role": "user",
                        "text": content.input_transcription.text,
                    }
                )
            if content.output_transcription and content.output_transcription.text:
                await websocket.send_json(
                    {
                        "type": "transcript",
                        "role": "tutor",
                        "text": content.output_transcription.text,
                    }
                )
            if content.model_turn:
                for part in content.model_turn.parts or []:
                    if part.inline_data and part.inline_data.data:
                        await websocket.send_bytes(part.inline_data.data)
            if content.interrupted:
                await websocket.send_json({"type": "interrupted"})
            if content.turn_complete:
                await websocket.send_json({"type": "turn_complete"})


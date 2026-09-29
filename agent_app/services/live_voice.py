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
    def __init__(
        self,
        settings: Settings,
        session_context: str | None = None,
    ) -> None:
        if not settings.voice_enabled:
            raise VoiceUnavailable("Gemini Live API no está configurada")
        if settings.google_genai_use_vertexai:
            self.client = genai.Client(
                vertexai=True,
                project=settings.google_cloud_project,
                location=settings.google_cloud_live_location,
            )
        else:
            self.client = genai.Client(api_key=settings.google_api_key)
        self.model = settings.resolved_gemini_live_model
        self.voice = settings.gemini_live_voice
        self.session_context = (
            " ".join(session_context.split())[:2_000] if session_context else ""
        )

    def _system_instruction(self) -> str:
        instruction = (
            "Eres la interfaz de voz de AITeacher, un tutor de IA. Conversa de "
            "forma natural, cálida y didáctica. Responde normalmente en español, "
            "salvo que el alumno esté practicando inglés o pida otro idioma. Usa "
            "turnos breves de una a tres frases y haz una sola pregunta a la vez; "
            "amplía únicamente cuando te lo pidan. El alumno puede interrumpirte, "
            "así que evita monólogos y no describas formato visual. No afirmes haber "
            "guardado progreso ni resultados: la evaluación curricular se confirma "
            "en el chat de texto."
        )
        if self.session_context:
            instruction += f" Contexto de la sesión actual: {self.session_context}"
        return instruction

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
            system_instruction=self._system_instruction(),
        )
        async with self.client.aio.live.connect(model=self.model, config=config) as session:
            await websocket.send_json(
                {
                    "type": "ready",
                    "sample_rate": 24000,
                    "supports_interruption": True,
                }
            )
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
        while True:
            received_message = False
            # The SDK's receive() iterator covers one model turn only: it stops
            # immediately after yielding turn_complete. Open a fresh iterator so
            # the same Live session remains available for the next user turn.
            async for message in session.receive():
                received_message = True
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
            if not received_message:
                return

"""Capacidades públicas que el frontend puede habilitar de forma segura."""

from pydantic import BaseModel


class AppCapabilities(BaseModel):
    text: bool
    voice: bool
    voice_model: str | None = None
    authoring: bool

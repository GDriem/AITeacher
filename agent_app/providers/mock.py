"""Proveedor determinista para pruebas, modo offline y plan B de la charla."""

import re

from agent_app.providers.base import ModelRequest


class MockModelProvider:
    name = "mock"

    async def generate(self, request: ModelRequest) -> str:
        sources = re.findall(r"FUENTE: ([^\n]+)", request.prompt)
        evidence = re.findall(r"FRAGMENTO: ([^\n]+)", request.prompt)
        if not evidence:
            return "No encontré evidencia suficiente en el contenido educativo disponible."
        source_note = f" Fuente: {sources[0]}." if sources else ""
        return (
            "En pocas palabras: "
            + evidence[0]
            + " La idea clave es conectar el concepto con un ejemplo verificable."
            + source_note
        )


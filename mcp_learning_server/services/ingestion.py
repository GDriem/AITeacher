"""Ingestión: convierte el contenido fuente en modelos validados."""

import json
from pathlib import Path

from pydantic import TypeAdapter

from mcp_learning_server.models import LearningContent

_content_list = TypeAdapter(list[LearningContent])


def load_content(path: str | Path) -> list[LearningContent]:
    source_path = Path(path)
    raw = json.loads(source_path.read_text(encoding="utf-8"))
    chunks = _content_list.validate_python(raw)
    ids = [chunk.id for chunk in chunks]
    if len(ids) != len(set(ids)):
        raise ValueError("Los identificadores de contenido deben ser únicos")
    return chunks


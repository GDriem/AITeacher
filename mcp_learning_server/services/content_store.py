"""Almacenamiento en memoria del corpus; reemplazable por un índice administrado."""

from typing import Protocol, Sequence

from mcp_learning_server.models import LearningContent


class ContentStore(Protocol):
    def replace(self, chunks: Sequence[LearningContent]) -> None: ...

    def all(self) -> tuple[LearningContent, ...]: ...


class InMemoryContentStore:
    def __init__(self) -> None:
        self._chunks: tuple[LearningContent, ...] = ()

    def replace(self, chunks: Sequence[LearningContent]) -> None:
        self._chunks = tuple(chunk.model_copy(deep=True) for chunk in chunks)

    def all(self) -> tuple[LearningContent, ...]:
        return tuple(chunk.model_copy(deep=True) for chunk in self._chunks)


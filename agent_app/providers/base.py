"""Puerto único de modelos para mantener aisladas las APIs de proveedores."""

from typing import Protocol

from pydantic import BaseModel, ConfigDict, Field


class ModelRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    system_instruction: str = Field(min_length=1)
    prompt: str = Field(min_length=1)
    temperature: float = Field(default=0.2, ge=0, le=2)


class ModelProvider(Protocol):
    name: str

    async def generate(self, request: ModelRequest) -> str: ...


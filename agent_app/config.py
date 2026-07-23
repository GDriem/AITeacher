"""Configuración centralizada, sin secretos codificados en fuente."""

from enum import StrEnum

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class ModelProviderName(StrEnum):
    GEMINI = "gemini"
    FOUNDRY = "foundry"
    MOCK = "mock"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    app_host: str = "0.0.0.0"
    app_port: int = Field(default=8000, ge=1, le=65535)
    app_sessions_path: str = ".data/sessions.json"
    app_session_retention_days: int = Field(default=365, ge=1, le=3_650)
    app_sessions_backend: str = Field(default="local", pattern="^(local|firestore)$")
    firestore_sessions_collection: str = "learning_sessions"
    app_authoring_token: str | None = None
    model_provider: ModelProviderName = ModelProviderName.MOCK
    model_timeout_seconds: float = Field(default=20, gt=0, le=120)
    model_input_cost_per_million_usd: float = Field(default=0, ge=0)
    model_output_cost_per_million_usd: float = Field(default=0, ge=0)
    observability_max_latency_samples: int = Field(default=1_000, ge=10, le=10_000)
    mcp_timeout_seconds: float = Field(default=5, gt=0, le=60)
    mcp_server_url: str = "http://localhost:8001/mcp/"
    mcp_authoring_url: str = "http://localhost:8001/admin"
    mcp_authoring_token: str | None = None
    mcp_use_local_adapter: bool = True
    mcp_auth_audience: str | None = None

    gemini_model: str = "gemini-2.5-flash"
    gemini_live_model: str = "gemini-3.1-flash-live-preview"
    gemini_live_voice: str = "Kore"
    google_api_key: str | None = None
    google_cloud_project: str | None = None
    google_cloud_location: str = "us-central1"
    google_genai_use_vertexai: bool = False

    @property
    def voice_enabled(self) -> bool:
        if self.model_provider != ModelProviderName.GEMINI:
            return False
        if self.google_genai_use_vertexai:
            return bool(self.google_cloud_project)
        return bool(self.google_api_key)

    foundry_endpoint: str | None = None
    foundry_model_deployment: str | None = None
    foundry_scope: str = "https://ai.azure.com/.default"

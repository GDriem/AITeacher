"""Configuración centralizada, sin secretos codificados en fuente."""

from enum import StrEnum

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class ModelProviderName(StrEnum):
    GEMINI = "gemini"
    FOUNDRY = "foundry"
    MOCK = "mock"


VERTEX_GEMINI_LIVE_MODEL = "gemini-live-2.5-flash-native-audio"
DEVELOPER_GEMINI_LIVE_MODEL = "gemini-2.5-flash-native-audio-preview-12-2025"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    app_host: str = "0.0.0.0"
    app_port: int = Field(
        default=8000,
        ge=1,
        le=65535,
        validation_alias=AliasChoices("PORT", "APP_PORT", "app_port"),
    )
    app_sessions_path: str = ".data/sessions.json"
    app_session_retention_days: int = Field(default=365, ge=1, le=3_650)
    app_sessions_backend: str = Field(default="local", pattern="^(local|firestore)$")
    firestore_sessions_collection: str = "learning_sessions"
    app_student_profiles_backend: str = Field(
        default="local", pattern="^(local|firestore)$"
    )
    app_student_profiles_path: str = ".data/student_profiles.json"
    firestore_student_profiles_collection: str = "student_profiles"
    google_client_id: str | None = None
    app_session_secret: str | None = None
    app_auth_session_days: int = Field(default=7, ge=1, le=30)
    app_auth_cookie_secure: bool = False
    app_authoring_token: str | None = None
    model_provider: ModelProviderName = ModelProviderName.MOCK
    model_timeout_seconds: float = Field(default=20, gt=0, le=120)
    model_rate_limit_requests_per_minute: int = Field(
        default=30, ge=0, le=10_000
    )
    voice_max_concurrent_sessions_per_student: int = Field(
        default=1, ge=1, le=10
    )
    model_input_cost_per_million_usd: float = Field(default=0, ge=0)
    model_output_cost_per_million_usd: float = Field(default=0, ge=0)
    observability_max_latency_samples: int = Field(default=1_000, ge=10, le=10_000)
    mcp_timeout_seconds: float = Field(default=5, gt=0, le=60)
    mcp_server_url: str = "http://localhost:8001/mcp/"
    mcp_authoring_url: str = "http://localhost:8001/admin"
    mcp_authoring_token: str | None = None
    mcp_use_local_adapter: bool = True
    mcp_auth_audience: str | None = None

    gemini_model: str = "gemini-3.5-flash-lite"
    # Cuando no se define, se selecciona un identificador compatible con el
    # backend de autenticación. Un valor explícito permite adoptar versiones
    # nuevas sin esperar una actualización de la aplicación.
    gemini_live_model: str | None = None
    gemini_live_voice: str = "Kore"
    google_api_key: str | None = None
    google_cloud_project: str | None = None
    google_cloud_location: str = "us"
    google_cloud_live_location: str = "us-central1"
    google_genai_use_vertexai: bool = False

    @property
    def resolved_gemini_live_model(self) -> str:
        configured = (self.gemini_live_model or "").strip()
        if configured:
            return configured
        if self.google_genai_use_vertexai:
            return VERTEX_GEMINI_LIVE_MODEL
        return DEVELOPER_GEMINI_LIVE_MODEL

    @property
    def voice_enabled(self) -> bool:
        if self.model_provider != ModelProviderName.GEMINI:
            return False
        if self.google_genai_use_vertexai:
            return bool((self.google_cloud_project or "").strip())
        return bool((self.google_api_key or "").strip())

    @property
    def google_auth_enabled(self) -> bool:
        return bool(self.google_client_id)

    foundry_endpoint: str | None = None
    foundry_model_deployment: str | None = None
    foundry_scope: str = "https://ai.azure.com/.default"

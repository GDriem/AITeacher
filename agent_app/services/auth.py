"""Identidad Google, sesiones firmadas y perfiles mínimos de alumnos."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import tempfile
import threading
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any, Protocol

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter, ValidationError

from mcp_learning_server.models import utc_now


class AuthenticationError(ValueError):
    """La credencial o la sesión no pueden considerarse autenticadas."""


class AuthModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class GoogleIdentity(AuthModel):
    subject: str = Field(min_length=1, max_length=255)
    email: str = Field(min_length=3, max_length=320)
    email_verified: bool = True
    display_name: str = Field(min_length=1, max_length=100)
    picture_url: str | None = Field(default=None, max_length=2_048)

    @property
    def student_id(self) -> str:
        digest = hashlib.sha256(self.subject.encode("utf-8")).hexdigest()
        return f"google-{digest[:32]}"


class StudentProfile(AuthModel):
    student_id: str = Field(min_length=1, max_length=100)
    provider: str = "google"
    provider_subject: str = Field(min_length=1, max_length=255)
    email: str = Field(min_length=3, max_length=320)
    email_verified: bool = True
    display_name: str = Field(min_length=1, max_length=100)
    picture_url: str | None = Field(default=None, max_length=2_048)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)
    last_login_at: datetime = Field(default_factory=utc_now)


class AuthSession(AuthModel):
    student_id: str = Field(min_length=1, max_length=100)
    expires_at: datetime


class GoogleLoginRequest(AuthModel):
    credential: str = Field(min_length=100, max_length=8_192)


class PublicStudentProfile(AuthModel):
    student_id: str
    email: str
    display_name: str
    picture_url: str | None

    @classmethod
    def from_profile(cls, profile: StudentProfile) -> "PublicStudentProfile":
        return cls(
            student_id=profile.student_id,
            email=profile.email,
            display_name=profile.display_name,
            picture_url=profile.picture_url,
        )


class AuthStatus(AuthModel):
    enabled: bool
    authenticated: bool
    google_client_id: str | None = None
    profile: PublicStudentProfile | None = None


class GoogleIdentityVerifier(Protocol):
    def verify(self, credential: str) -> GoogleIdentity: ...


class StudentProfileRepository(Protocol):
    def get(self, student_id: str) -> StudentProfile | None: ...

    def upsert_google_identity(self, identity: GoogleIdentity) -> StudentProfile: ...


class GoogleTokenVerifier:
    """Verifica ID tokens con las llaves públicas y validaciones de Google."""

    def __init__(self, client_id: str, request: Any | None = None) -> None:
        self.client_id = client_id
        self._request = request

    def verify(self, credential: str) -> GoogleIdentity:
        if not credential.strip():
            raise AuthenticationError("Google no entregó una credencial válida")
        try:
            from google.auth.transport.requests import Request
            from google.oauth2 import id_token

            claims = id_token.verify_oauth2_token(
                credential,
                self._request or Request(),
                self.client_id,
                clock_skew_in_seconds=10,
            )
        except Exception as exc:
            raise AuthenticationError("La credencial de Google no es válida") from exc

        subject = str(claims.get("sub", "")).strip()
        email = str(claims.get("email", "")).strip()
        name = " ".join(str(claims.get("name", "")).split())
        if not subject or not email or not name:
            raise AuthenticationError("Google no entregó el perfil mínimo requerido")
        if claims.get("email_verified") is not True:
            raise AuthenticationError("La cuenta de Google no tiene correo verificado")
        return GoogleIdentity(
            subject=subject,
            email=email,
            display_name=name,
            picture_url=str(claims.get("picture") or "").strip() or None,
        )


class SessionSigner:
    """Token de sesión compacto firmado con HMAC-SHA256."""

    def __init__(self, secret: str, lifetime_days: int = 7, *, clock=utc_now) -> None:
        if len(secret.encode("utf-8")) < 32:
            raise ValueError("APP_SESSION_SECRET debe tener al menos 32 bytes")
        if lifetime_days < 1 or lifetime_days > 30:
            raise ValueError("La sesión debe durar entre 1 y 30 días")
        self._secret = secret.encode("utf-8")
        self._lifetime = timedelta(days=lifetime_days)
        self._clock = clock

    def issue(self, student_id: str) -> tuple[str, AuthSession]:
        expires_at = self._clock() + self._lifetime
        payload = {"v": 1, "sub": student_id, "exp": int(expires_at.timestamp())}
        encoded = _base64url(json.dumps(payload, separators=(",", ":")).encode())
        signature = _base64url(hmac.new(self._secret, encoded, hashlib.sha256).digest())
        return f"{encoded.decode()}.{signature.decode()}", AuthSession(
            student_id=student_id,
            expires_at=expires_at,
        )

    def verify(self, token: str | None) -> AuthSession:
        try:
            encoded, supplied_signature = (token or "").split(".", maxsplit=1)
            expected_signature = _base64url(
                hmac.new(self._secret, encoded.encode(), hashlib.sha256).digest()
            ).decode()
            if not hmac.compare_digest(supplied_signature, expected_signature):
                raise AuthenticationError("La sesión no es válida")
            payload = json.loads(_decode_base64url(encoded))
            if payload.get("v") != 1:
                raise AuthenticationError("La sesión no es válida")
            expires_at = datetime.fromtimestamp(int(payload["exp"]), tz=UTC)
            if expires_at <= _as_utc(self._clock()):
                raise AuthenticationError("La sesión expiró")
            return AuthSession(student_id=payload["sub"], expires_at=expires_at)
        except AuthenticationError:
            raise
        except (ValueError, TypeError, KeyError, json.JSONDecodeError) as exc:
            raise AuthenticationError("La sesión no es válida") from exc


class AuthService:
    def __init__(
        self,
        verifier: GoogleIdentityVerifier,
        profiles: StudentProfileRepository,
        signer: SessionSigner,
    ) -> None:
        self.verifier = verifier
        self.profiles = profiles
        self.signer = signer

    def login(self, credential: str) -> tuple[str, AuthSession, StudentProfile]:
        identity = self.verifier.verify(credential)
        profile = self.profiles.upsert_google_identity(identity)
        token, session = self.signer.issue(profile.student_id)
        return token, session, profile

    def authenticate(self, token: str | None) -> StudentProfile:
        session = self.signer.verify(token)
        profile = self.profiles.get(session.student_id)
        if profile is None:
            raise AuthenticationError("El perfil de la sesión ya no existe")
        return profile


_profile_map = TypeAdapter(dict[str, StudentProfile])


class InMemoryStudentProfileRepository:
    def __init__(self, *, clock=utc_now) -> None:
        self._items: dict[str, StudentProfile] = {}
        self._clock = clock
        self._lock = threading.RLock()

    def get(self, student_id: str) -> StudentProfile | None:
        with self._lock:
            profile = self._items.get(student_id)
            return profile.model_copy(deep=True) if profile else None

    def upsert_google_identity(self, identity: GoogleIdentity) -> StudentProfile:
        with self._lock:
            profile = _merge_profile(self._items.get(identity.student_id), identity, self._clock())
            self._items[profile.student_id] = profile
            return profile.model_copy(deep=True)


class LocalStudentProfileRepository:
    def __init__(self, path: str | Path, *, clock=utc_now) -> None:
        self.path = Path(path)
        self._clock = clock
        self._lock = threading.RLock()

    def get(self, student_id: str) -> StudentProfile | None:
        with self._lock:
            profile = self._read_all().get(student_id)
            return profile.model_copy(deep=True) if profile else None

    def upsert_google_identity(self, identity: GoogleIdentity) -> StudentProfile:
        with self._lock:
            profiles = self._read_all()
            profile = _merge_profile(profiles.get(identity.student_id), identity, self._clock())
            profiles[profile.student_id] = profile
            self._write_all(profiles)
            return profile.model_copy(deep=True)

    def _read_all(self) -> dict[str, StudentProfile]:
        if not self.path.exists():
            return {}
        try:
            return _profile_map.validate_python(json.loads(self.path.read_text("utf-8")))
        except (OSError, json.JSONDecodeError, ValidationError) as exc:
            raise RuntimeError(f"No se pudieron leer los perfiles en {self.path}") from exc

    def _write_all(self, profiles: dict[str, StudentProfile]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary_path: str | None = None
        try:
            with tempfile.NamedTemporaryFile(
                mode="w",
                encoding="utf-8",
                dir=self.path.parent,
                prefix=f".{self.path.name}.",
                suffix=".tmp",
                delete=False,
            ) as handle:
                json.dump(
                    {key: value.model_dump(mode="json") for key, value in profiles.items()},
                    handle,
                    ensure_ascii=False,
                    indent=2,
                )
                handle.flush()
                os.fsync(handle.fileno())
                temporary_path = handle.name
            os.replace(temporary_path, self.path)
        except OSError as exc:
            if temporary_path:
                Path(temporary_path).unlink(missing_ok=True)
            raise RuntimeError(f"No se pudieron guardar los perfiles en {self.path}") from exc


class FirestoreStudentProfileRepository:
    def __init__(self, client: Any, collection: str = "student_profiles", *, clock=utc_now) -> None:
        self.client = client
        self.collection = collection
        self._clock = clock

    def get(self, student_id: str) -> StudentProfile | None:
        snapshot = self.client.collection(self.collection).document(student_id).get()
        return StudentProfile.model_validate(snapshot.to_dict()) if snapshot.exists else None

    def upsert_google_identity(self, identity: GoogleIdentity) -> StudentProfile:
        document = self.client.collection(self.collection).document(identity.student_id)
        snapshot = document.get()
        existing = StudentProfile.model_validate(snapshot.to_dict()) if snapshot.exists else None
        profile = _merge_profile(existing, identity, self._clock())
        document.set(profile.model_dump(mode="python"))
        return profile.model_copy(deep=True)


def _merge_profile(
    existing: StudentProfile | None,
    identity: GoogleIdentity,
    now: datetime,
) -> StudentProfile:
    return StudentProfile(
        student_id=identity.student_id,
        provider_subject=identity.subject,
        email=identity.email,
        email_verified=identity.email_verified,
        display_name=identity.display_name,
        picture_url=identity.picture_url,
        created_at=existing.created_at if existing else now,
        updated_at=now,
        last_login_at=now,
    )


def _base64url(value: bytes) -> bytes:
    return base64.urlsafe_b64encode(value).rstrip(b"=")


def _decode_base64url(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def _as_utc(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)

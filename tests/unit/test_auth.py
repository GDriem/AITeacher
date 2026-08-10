from datetime import UTC, datetime, timedelta

import pytest

from agent_app.services.auth import (
    AuthService,
    AuthenticationError,
    GoogleIdentity,
    FirestoreStudentProfileRepository,
    InMemoryStudentProfileRepository,
    LocalStudentProfileRepository,
    SessionSigner,
)


class FakeGoogleVerifier:
    def verify(self, credential: str) -> GoogleIdentity:
        if credential != "valid-google-token":
            raise AuthenticationError("Token inválido")
        return GoogleIdentity(
            subject="google-subject-123",
            email="alumna@example.com",
            display_name="Ada Alumna",
            picture_url="https://example.com/ada.jpg",
        )


class FakeSnapshot:
    def __init__(self, data):
        self._data = data
        self.exists = data is not None

    def to_dict(self):
        return self._data


class FakeDocument:
    def __init__(self, store, key):
        self.store = store
        self.key = key

    def get(self):
        return FakeSnapshot(self.store.get(self.key))

    def set(self, data):
        self.store[self.key] = data


class FakeCollection:
    def __init__(self, store):
        self.store = store

    def document(self, key):
        return FakeDocument(self.store, key)


class FakeFirestoreClient:
    def __init__(self):
        self.store = {}

    def collection(self, name):
        assert name == "student_profiles"
        return FakeCollection(self.store)


def test_auth_service_creates_profile_and_recovers_signed_session() -> None:
    now = datetime(2026, 8, 10, 12, tzinfo=UTC)
    profiles = InMemoryStudentProfileRepository(clock=lambda: now)
    service = AuthService(
        FakeGoogleVerifier(),
        profiles,
        SessionSigner("a" * 32, lifetime_days=7, clock=lambda: now),
    )

    token, session, created = service.login("valid-google-token")
    recovered = service.authenticate(token)

    assert session.student_id == created.student_id
    assert created.student_id.startswith("google-")
    assert len(created.student_id) <= 100
    assert recovered.email == "alumna@example.com"
    assert recovered.display_name == "Ada Alumna"
    assert session.expires_at == now + timedelta(days=7)


def test_session_signer_rejects_tampering_and_expiration() -> None:
    now = datetime(2026, 8, 10, 12, tzinfo=UTC)
    signer = SessionSigner("b" * 32, lifetime_days=1, clock=lambda: now)
    token, _ = signer.issue("google-student")

    with pytest.raises(AuthenticationError, match="válida"):
        signer.verify(token + "tampered")

    now += timedelta(days=2)
    with pytest.raises(AuthenticationError, match="expiró"):
        signer.verify(token)


def test_local_profile_repository_persists_and_updates_google_data(tmp_path) -> None:
    now = datetime(2026, 8, 10, 12, tzinfo=UTC)
    repository = LocalStudentProfileRepository(tmp_path / "profiles.json", clock=lambda: now)
    identity = GoogleIdentity(
        subject="stable-subject",
        email="first@example.com",
        display_name="Nombre Inicial",
    )

    created = repository.upsert_google_identity(identity)
    now += timedelta(days=1)
    updated = repository.upsert_google_identity(
        identity.model_copy(
            update={"email": "new@example.com", "display_name": "Nombre Nuevo"}
        )
    )
    restarted = LocalStudentProfileRepository(repository.path)

    assert updated.student_id == created.student_id
    assert updated.created_at == created.created_at
    assert updated.last_login_at == now
    assert restarted.get(created.student_id) == updated


def test_firestore_profile_repository_upserts_by_stable_student_id() -> None:
    repository = FirestoreStudentProfileRepository(FakeFirestoreClient())
    identity = GoogleIdentity(
        subject="firestore-subject",
        email="student@example.com",
        display_name="Firestore Student",
    )

    created = repository.upsert_google_identity(identity)
    recovered = repository.get(created.student_id)

    assert recovered is not None
    assert recovered.provider_subject == "firestore-subject"
    assert recovered.email == "student@example.com"


def test_auth_service_rejects_unknown_profile_and_invalid_google_token() -> None:
    service = AuthService(
        FakeGoogleVerifier(),
        InMemoryStudentProfileRepository(),
        SessionSigner("c" * 32),
    )

    with pytest.raises(AuthenticationError, match="Token inválido"):
        service.login("not-valid")
    token, _ = SessionSigner("c" * 32).issue("missing-profile")
    with pytest.raises(AuthenticationError, match="perfil"):
        service.authenticate(token)

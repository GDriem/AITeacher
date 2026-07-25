"""Adaptador Firestore síncrono; el SDK se inicializa sólo en producción."""

from __future__ import annotations

from typing import Any

from mcp_learning_server.models import (
    Assessment,
    StudentProgress,
    utc_now,
)
from mcp_learning_server.repositories.local_progress import (
    _validate_student_id,
)


class FirestoreProgressRepository:
    def __init__(self, client: Any, collection: str = "student_progress") -> None:
        self.client = client
        self.collection = collection

    def get(self, student_id: str) -> StudentProgress:
        normalized_id = _validate_student_id(student_id)
        snapshot = self.client.collection(self.collection).document(normalized_id).get()
        if not snapshot.exists:
            return StudentProgress(student_id=normalized_id)
        return StudentProgress.model_validate(snapshot.to_dict())

    def save_assessment(
        self, student_id: str, assessment: Assessment
    ) -> StudentProgress:
        normalized_id = _validate_student_id(student_id)
        document = self.client.collection(self.collection).document(normalized_id)
        transaction = self.client.transaction()
        # El SDK de Firestore exige iniciar la transacción (_begin) antes de
        # leer/escribir con ella y confirmarla con _commit (no el `commit`
        # público de WriteBatch, que ignora el id de transacción); ver
        # google.cloud.firestore_v1.transaction.transactional.
        transaction._begin()
        try:
            snapshot = document.get(transaction=transaction)
            progress = (
                StudentProgress.model_validate(snapshot.to_dict())
                if snapshot.exists
                else StudentProgress(student_id=normalized_id)
            )
            progress.assessments.append(assessment)
            if assessment.topic not in progress.studied_topics:
                progress.studied_topics.append(assessment.topic)
            progress.recommendations = (
                progress.recommendations + [assessment.recommendation]
            )[-10:]
            progress.refresh_summary()
            progress.updated_at = utc_now()
            transaction.set(document, progress.model_dump(mode="python"))
            transaction._commit()
        except BaseException:
            transaction._rollback()
            raise
        return progress.model_copy(deep=True)

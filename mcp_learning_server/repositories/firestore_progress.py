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
        transaction.commit()
        return progress.model_copy(deep=True)

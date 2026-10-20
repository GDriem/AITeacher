#!/usr/bin/env python3
"""Validate frozen Python repository maps and preserve their original JSON payloads.

Run from the repository root with the project's Python environment. This script
never opens a repository adapter (which could purge expired conversations),
connects to Firestore, recalculates persisted summaries or overwrites an export.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from uuid import UUID

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from agent_app.services.sessions import StoredConversation  # noqa: E402
from mcp_learning_server.models import StudentProgress  # noqa: E402


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Duplicate JSON property")
        result[key] = value
    return result


def read_map(path: Path) -> dict:
    value = json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=unique_object)
    if not isinstance(value, dict):
        raise ValueError("Expected a repository map")
    return value


def prepare(sessions: dict, progress: dict, source: str, batch_id: UUID) -> dict:
    if not source or source != source.strip() or len(source) > 120 or batch_id.int == 0:
        raise ValueError("Invalid source or batch ID")
    documents = []
    for kind, values, model in (
        ("conversation", sessions, StoredConversation),
        ("progress", progress, StudentProgress),
    ):
        for key, raw in sorted(values.items()):
            # Validation may derive summaries on the model; retain raw, never dump it.
            parsed = model.model_validate(raw)
            owner = raw["student_id"]
            if owner != parsed.student_id or owner != owner.strip():
                raise ValueError("Owner normalization would change source identity")
            if not key or len(key) > 200 or key != (raw["id"] if kind == "conversation" else owner):
                raise ValueError("Source document ID mismatch")
            if kind == "conversation":
                if raw["pending_evaluation"]["student_id"] != owner:
                    raise ValueError("Pending evaluation owner mismatch")
                messages = raw["messages"]
                if len({m["id"] for m in messages}) != len(messages):
                    raise ValueError("Duplicate message ID")
            else:
                # Require the original assessments array, never reconstruct a missing one.
                if not isinstance(raw["assessments"], list):
                    raise ValueError("Missing assessments")
            documents.append({"kind": kind, "id": key, "studentId": owner, "payload": raw})
    if not documents or len(documents) > 100_000:
        raise ValueError("Expected 1..100000 documents")
    return {"schemaVersion": 1, "batchId": str(batch_id), "source": source, "documents": documents}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sessions", required=True, type=Path)
    parser.add_argument("--progress", required=True, type=Path)
    parser.add_argument("--source", required=True)
    parser.add_argument("--batch-id", required=True, type=UUID)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    try:
        snapshot = prepare(read_map(args.sessions), read_map(args.progress), args.source, args.batch_id)
        serialized = json.dumps(snapshot, ensure_ascii=False, allow_nan=False, indent=2)
        # Exclusive creation, owner-only permissions, no accidental overwrite of a snapshot.
        fd = os.open(args.output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            stream.write(serialized + "\n")
            stream.flush()
            os.fsync(stream.fileno())
    except Exception:
        print("Export failed: check frozen inputs, identity, schema and unused output path.", file=sys.stderr)
        return 2
    print(f"Prepared {len(snapshot['documents'])} historical documents.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

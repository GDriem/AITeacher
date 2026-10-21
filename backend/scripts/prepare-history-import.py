#!/usr/bin/env python3
"""Export Python history from frozen maps or an explicit Firestore database.

Run from the repository root with the project's Python environment. This script
never opens a repository adapter (which could purge expired conversations),
recalculates persisted summaries or overwrites an export. Firestore is read-only.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime
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


def firestore_json(value):
    """Convert native timestamps only; reject unsupported/lossy Firestore values."""
    if isinstance(value, datetime):
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("Firestore timestamp must include timezone")
        # DatetimeWithNanoseconds.rfc3339 preserves Firestore nanoseconds.
        return value.rfc3339() if hasattr(value, "rfc3339") else value.isoformat()
    if isinstance(value, dict):
        if any(not isinstance(key, str) for key in value):
            raise ValueError("Expected string property names")
        return {key: firestore_json(item) for key, item in value.items()}
    if isinstance(value, list):
        return [firestore_json(item) for item in value]
    if value is None or isinstance(value, (str, bool, int, float)):
        return value
    raise ValueError("Unsupported Firestore value")


def extract_firestore(client, sessions_collection: str, progress_collection: str,
                      source: str, batch_id: UUID) -> dict:
    """Read both collections in one read-only transaction, without repository hooks."""
    from google.cloud.firestore_v1 import transactional

    names = (sessions_collection, progress_collection)
    if any(not name or name != name.strip() or "/" in name for name in names):
        raise ValueError("Expected top-level collection names")
    if len(set(names)) != 2:
        raise ValueError("Collections must differ")

    @transactional
    def read(transaction):
        maps = []
        count = 0
        for name in names:
            documents = {}
            # No owner/archive/expiration filter: preserve all original rows.
            for snapshot in client.collection(name).stream(transaction=transaction, timeout=60):
                if snapshot.id in documents:
                    raise ValueError("Duplicate source document")
                documents[snapshot.id] = firestore_json(snapshot.to_dict())
                count += 1
                if count > 100_000:
                    raise ValueError("Too many historical documents")
            maps.append(documents)
        return prepare(*maps, source, batch_id)

    return read(client.transaction(read_only=True, max_attempts=1))


def write_snapshot(snapshot: dict, path: Path) -> None:
    serialized = json.dumps(snapshot, ensure_ascii=False, allow_nan=False, indent=2)
    # Publish only a complete, fsynced file, without replacing an existing path.
    import tempfile

    fd, temporary = tempfile.mkstemp(prefix=".history-", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            stream.write(serialized + "\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.link(temporary, path)
    finally:
        os.unlink(temporary)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sessions", type=Path)
    parser.add_argument("--progress", type=Path)
    parser.add_argument("--firestore-project", help="Explicit project; uses Application Default Credentials")
    parser.add_argument("--firestore-database", default="(default)")
    parser.add_argument("--sessions-collection", default="learning_sessions")
    parser.add_argument("--progress-collection", default="student_progress")
    parser.add_argument("--source", required=True)
    parser.add_argument("--batch-id", required=True, type=UUID)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    if args.firestore_project:
        if args.sessions or args.progress:
            parser.error("Choose Firestore or local maps, not both")
    elif not args.sessions or not args.progress:
        parser.error("Provide both --sessions and --progress, or --firestore-project")
    try:
        if args.output.exists():
            raise ValueError("Output exists")
        if args.firestore_project:
            from google.cloud import firestore

            client = firestore.Client(project=args.firestore_project, database=args.firestore_database)
            snapshot = extract_firestore(client, args.sessions_collection,
                                         args.progress_collection, args.source, args.batch_id)
        else:
            snapshot = prepare(read_map(args.sessions), read_map(args.progress), args.source, args.batch_id)
        write_snapshot(snapshot, args.output)
    except Exception:
        print("Export failed: check input schema/identity, Firestore access and unused output path.", file=sys.stderr)
        return 2
    print(f"Prepared {len(snapshot['documents'])} historical documents.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

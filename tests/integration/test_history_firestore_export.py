"""Exercise the real Firestore SDK over local gRPC; no cloud credentials or data.

The server models only this export's wire contract, not a full Firestore emulator.
"""
import copy
import importlib.util
import json
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from uuid import uuid4

import grpc
import pytest
from google.auth.credentials import AnonymousCredentials
from google.api_core.exceptions import PermissionDenied
from google.api_core.datetime_helpers import DatetimeWithNanoseconds
from google.cloud.firestore_v1 import Client, _helpers, types
from google.cloud.firestore_v1.services.firestore import FirestoreClient
from google.cloud.firestore_v1.services.firestore.transports.grpc import FirestoreGrpcTransport
from google.protobuf.empty_pb2 import Empty

from agent_app.services.sessions import _serialize_session
from tests.unit.test_session_repository import make_session

spec = importlib.util.spec_from_file_location(
    "firestore_history_export", Path(__file__).resolve().parents[2] / "backend/scripts/prepare-history-import.py")
export = importlib.util.module_from_spec(spec)
spec.loader.exec_module(export)


@pytest.fixture
def firestore_wire():
    calls = []
    session = _serialize_session(make_session())
    # Preserve archived and expired history; repository reads would purge it.
    session["archived_at"] = "2020-01-01T00:00:00Z"
    session["updated_at"] = "2020-01-01T00:00:00Z"
    state = {"sessions": {session["id"]: session}, "progress": {
        "student-1": {"student_id": "student-1", "assessments": [], "level": "advanced",
                      "recommendations": ["Resumen original"],
                      "updated_at": DatetimeWithNanoseconds.from_rfc3339("2020-01-01T00:00:00.123456Z")}},
        "fail": False}

    def begin(request, context):
        calls.append(("begin", request))
        assert request.options._pb.WhichOneof("mode") == "read_only"
        return types.BeginTransactionResponse(transaction=b"history-read-only")

    def query(request, context):
        calls.append(("query", request))
        assert request.transaction == b"history-read-only"
        assert not request.structured_query.where
        name = request.structured_query.from_[0].collection_id
        if name == "progress" and state["fail"]:
            context.abort(grpc.StatusCode.PERMISSION_DENIED, "No access")
        for key, raw in state[name].items():
            yield types.RunQueryResponse(document=types.Document(
                name=f"{request.parent}/{name}/{key}", fields=_helpers.encode_dict(raw)))

    def commit(request, context):
        calls.append(("commit", request))
        assert request.transaction == b"history-read-only"
        assert not request.writes
        return types.CommitResponse()

    def rollback(request, context):
        calls.append(("rollback", request))
        return Empty()

    handlers = {}
    for name, handler, request_type, response_type in (
        ("BeginTransaction", begin, types.BeginTransactionRequest, types.BeginTransactionResponse),
        ("RunQuery", query, types.RunQueryRequest, types.RunQueryResponse),
        ("Commit", commit, types.CommitRequest, types.CommitResponse),
        ("Rollback", rollback, types.RollbackRequest, Empty),
    ):
        factory = grpc.unary_stream_rpc_method_handler if name == "RunQuery" else grpc.unary_unary_rpc_method_handler
        serializer = Empty.SerializeToString if response_type is Empty else response_type.serialize
        handlers[name] = factory(handler, request_deserializer=request_type.deserialize,
                                 response_serializer=serializer)
    server = grpc.server(ThreadPoolExecutor(max_workers=2))
    server.add_generic_rpc_handlers((grpc.method_handlers_generic_handler("google.firestore.v1.Firestore", handlers),))
    port = server.add_insecure_port("127.0.0.1:0")
    server.start()
    channel = grpc.insecure_channel(f"127.0.0.1:{port}")
    client = Client(project="history-test", credentials=AnonymousCredentials())
    client._firestore_api_internal = FirestoreClient(transport=FirestoreGrpcTransport(channel=channel))
    try:
        yield client, state, calls
    finally:
        channel.close()
        server.stop(0).wait()


def test_export_uses_one_read_only_transaction_and_preserves_source(firestore_wire):
    client, state, calls = firestore_wire
    before = copy.deepcopy(state)
    snapshot = export.extract_firestore(client, "sessions", "progress", "test", uuid4())
    assert snapshot["documents"][0]["payload"] == before["sessions"]["session-1"]
    assert snapshot["documents"][1]["payload"]["level"] == "advanced"
    assert snapshot["documents"][1]["payload"]["updated_at"] == "2020-01-01T00:00:00.123456Z"
    assert state == before
    assert [name for name, _ in calls] == ["begin", "query", "query", "commit"]


def test_export_aborts_on_second_collection_failure(firestore_wire, tmp_path):
    client, state, calls = firestore_wire
    state["fail"] = True
    with pytest.raises(PermissionDenied, match="No access"):
        snapshot = export.extract_firestore(client, "sessions", "progress", "test", uuid4())
        export.write_snapshot(snapshot, tmp_path / "history.json")
    assert [name for name, _ in calls] == ["begin", "query", "query", "rollback"]
    assert list(tmp_path.iterdir()) == []


def test_export_rejects_owner_mismatch_before_writing(firestore_wire):
    client, state, calls = firestore_wire
    state["sessions"]["session-1"]["pending_evaluation"]["student_id"] = "someone-else"
    with pytest.raises(ValueError, match="owner mismatch"):
        export.extract_firestore(client, "sessions", "progress", "test", uuid4())
    assert calls[-1][0] == "rollback"


@pytest.mark.parametrize("names", [("sessions", "sessions"), ("", "progress"),
                                 (" sessions", "progress"), ("parent/doc/sessions", "progress")])
def test_export_rejects_ambiguous_collection_names_without_reading(firestore_wire, names):
    client, _, calls = firestore_wire
    with pytest.raises(ValueError):
        export.extract_firestore(client, *names, "test", uuid4())
    assert calls == []


@pytest.mark.parametrize("fail", [False, True])
def test_firestore_command_publishes_only_complete_valid_snapshot(firestore_wire, tmp_path, monkeypatch, capsys, fail):
    from google.cloud import firestore

    client, state, calls = firestore_wire
    state["fail"] = fail
    path = tmp_path / "history.json"

    def client_factory(*, project, database):
        assert project == "history-test"
        assert database == "(default)"
        return client

    monkeypatch.setattr(firestore, "Client", client_factory)
    monkeypatch.setattr(sys, "argv", ["prepare-history-import.py", "--firestore-project", "history-test",
                                    "--sessions-collection", "sessions", "--progress-collection", "progress",
                                    "--source", "test", "--batch-id", str(uuid4()), "--output", str(path)])
    assert export.main() == (2 if fail else 0)
    output = capsys.readouterr()
    assert "Explícame" not in output.out + output.err
    if fail:
        assert not path.exists()
        assert calls[-1][0] == "rollback"
    else:
        assert len(json.loads(path.read_text())["documents"]) == 2
        assert path.stat().st_mode & 0o777 == 0o600
        # Reusing a path fails before opening a new Firestore transaction.
        count = len(calls)
        assert export.main() == 2
        assert len(calls) == count

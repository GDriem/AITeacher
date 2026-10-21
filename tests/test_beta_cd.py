"""Authorization and failure boundaries for CD, without GitHub/Azure mutations."""
import copy
import importlib.util
import json
import sys
from pathlib import Path

import pytest

SCRIPTS = Path(__file__).resolve().parents[1] / "backend/scripts"
sys.path.insert(0, str(SCRIPTS))
import beta_ci_guard as guard  # noqa: E402

spec = importlib.util.spec_from_file_location("update_beta", SCRIPTS / "update-azure-beta.py")
update = importlib.util.module_from_spec(spec)
spec.loader.exec_module(update)

SHA = "a" * 40
IMAGE = update.REGISTRY + "@sha256:" + "b" * 64


def ci_responses():
    return {
        "workflow": {"id": 10},
        "run": {"id": 20, "workflow_id": 10, "event": "push", "head_branch": "main",
                "head_repository": {"full_name": guard.REPOSITORY}, "head_sha": SHA,
                "status": "completed", "conclusion": "success", "run_attempt": 2},
        "head": {"object": {"sha": SHA}},
        "runs": {"workflow_runs": [{"id": 20}]},
        "jobs": {"jobs": [{"name": name, "status": "completed", "conclusion": "success"}
                          for name in guard.CHECKS]},
    }


def getter(data):
    def get(path):
        if path == "actions/workflows/ci.yml":
            return data["workflow"]
        if path == "actions/runs/20":
            return data["run"]
        if path == "git/ref/heads/main":
            return data["head"]
        if path.startswith("actions/workflows/10/runs?"):
            return data["runs"]
        assert path == "actions/runs/20/attempts/2/jobs?per_page=100&page=1"
        return data["jobs"]
    return get


def test_exact_successful_ci_current_attempt():
    assert guard.validate("20", SHA, get=getter(ci_responses())) == SHA


@pytest.mark.parametrize(("key", "value"), [
    ("event", "pull_request"), ("event", "workflow_dispatch"),
    ("head_branch", "feature"), ("workflow_id", 11),
    ("head_repository", {"full_name": "attacker/AITeacher"}),
    ("conclusion", "failure"), ("conclusion", "cancelled"),
    ("status", "in_progress"), ("head_sha", "invalid"),
])
def test_untrusted_or_unsuccessful_ci_is_rejected(key, value):
    data = ci_responses()
    data["run"][key] = value
    with pytest.raises(ValueError):
        guard.validate("20", get=getter(data))


@pytest.mark.parametrize("case", ["old-main", "newer-run", "missing-job", "skipped-job", "duplicate-job", "other-sha"])
def test_stale_and_incomplete_validation_is_rejected(case):
    data = ci_responses()
    if case == "old-main":
        data["head"]["object"]["sha"] = "c" * 40
    elif case == "newer-run":
        data["runs"]["workflow_runs"].append({"id": 21})
    elif case == "missing-job":
        data["jobs"]["jobs"].pop()
    elif case == "skipped-job":
        data["jobs"]["jobs"][0]["conclusion"] = "skipped"
    elif case == "duplicate-job":
        data["jobs"]["jobs"].append(data["jobs"]["jobs"][0])
    with pytest.raises(ValueError):
        guard.validate("20", "d" * 40 if case == "other-sha" else SHA, get=getter(data))


def job_resource(kind, commands, status="Failed", executed=None):
    template = {"containers": [{"name": kind, "command": ["dotnet", "AITeacher.Api.dll"],
                                "env": [{"name": "DB", "secretRef": "db"}]}]}
    def resource(*args, **kwargs):
        commands.append(args)
        if "start" in args:
            sent = json.loads(Path(args[args.index("--yaml") + 1]).read_text())
            assert sent["containers"][0]["image"] == IMAGE
            assert sent["containers"][0]["env"] == [{"name": "DB", "secretRef": "db"}]
            assert sent["containers"][0]["args"] == ["--migrate" if kind == "migrate" else "--grant-runtime-access"]
            commands.append(("sent", sent))
            return "execution-1"
        if "execution" in args and kwargs.get("query") == "properties.template.containers[0]":
            return executed if executed is not None else dict(
                [item for item in commands if item[0] == "sent"][0][1]["containers"][0])
        if "execution" in args:
            return status
        return copy.deepcopy(template)
    return resource


@pytest.mark.parametrize("kind", ["migrate", "grant"])
def test_job_failure_stops_before_any_application_write(monkeypatch, kind):
    commands = []
    monkeypatch.setattr(update, "resource", job_resource(kind, commands))
    monkeypatch.setattr(update, "note", lambda _: None)
    with pytest.raises(RuntimeError, match="application image was not updated"):
        update.run_job(kind, IMAGE, "--migrate" if kind == "migrate" else "--grant-runtime-access")
    assert "--yaml" in commands[1]
    assert "--bootstrap-data-protection-key" not in str(commands)
    assert all("update" not in command for command in commands)


def test_job_success_requires_executed_override(monkeypatch):
    commands = []
    monkeypatch.setattr(update, "resource", job_resource("migrate", commands, status="Succeeded"))
    monkeypatch.setattr(update, "note", lambda _: None)
    update.run_job("migrate", IMAGE, "--migrate")


@pytest.mark.parametrize("change", ["image", "args", "env"])
def test_job_override_not_applied_stops(monkeypatch, change):
    executed = {"name": "migrate", "image": IMAGE, "args": ["--migrate"],
                "command": ["dotnet", "AITeacher.Api.dll"], "env": [{"name": "DB"}]}
    executed[change] = {"image": "other", "args": ["--bootstrap-data-protection-key", "--migrate"],
                        "env": []}[change]
    monkeypatch.setattr(update, "resource", job_resource("migrate", [], status="Succeeded", executed=executed))
    monkeypatch.setattr(update, "note", lambda _: None)
    with pytest.raises(RuntimeError, match="expected override"):
        update.run_job("migrate", IMAGE, "--migrate")


@pytest.mark.parametrize("template", [
    {"containers": [{"name": "migrate", "volumeMounts": [{"volumeName": "data"}]}]},
    {"containers": [{"name": "migrate"}], "volumes": [{"name": "data"}]},
    {"containers": [{"name": "migrate"}], "initContainers": [{"name": "init"}]},
    {"containers": [{"name": "grant"}]},
    {"containers": [{"name": "migrate"}, {"name": "sidecar"}]},
])
def test_execution_template_that_would_lose_settings_is_rejected(template):
    with pytest.raises(ValueError):
        update.execution_template(template, "migrate")


def test_verify_access_never_mutates(monkeypatch):
    calls = []
    monkeypatch.setattr(update, "preflight", lambda: {"ready": "rev-1", "containers": [{"image": IMAGE}]})
    monkeypatch.setattr(update, "note", lambda _: None)
    def resource(*args, **kwargs):
        calls.append(args)
        return "Healthy" if "revision" in args else {"containers": [{"name": args[args.index("--name") + 1].split("-")[1]}]}
    monkeypatch.setattr(update, "resource", resource)
    monkeypatch.setattr(update, "az", lambda *a, **k: pytest.fail("no direct ARM call"))
    update.verify_access()
    assert all(not {"start", "update", "patch"} & set(command) for command in calls)


@pytest.mark.parametrize("failure", ["migrate", "grant", "stale"])
def test_main_never_publishes_after_migration_or_revalidation_failure(monkeypatch, failure):
    calls = []
    monkeypatch.setenv("IMAGE_DIGEST", IMAGE.split("@")[1])
    monkeypatch.setenv("VALIDATED_SHA", SHA)
    monkeypatch.setenv("CI_RUN_ID", "20")
    state = {"containers": [{"image": IMAGE}], "ready": "revision-1"}
    monkeypatch.setattr(update, "preflight", lambda: copy.deepcopy(state))
    monkeypatch.setattr(update, "note", lambda _: None)
    monkeypatch.setattr(update.shutil, "which", lambda _: "/postman")
    def validate(*args):
        calls.append("validate")
        if failure == "stale" and calls.count("validate") == 2:
            raise ValueError("stale")
    def run_job(kind, *args):
        calls.append(kind)
        if failure == kind:
            raise RuntimeError("job failed")
    monkeypatch.setattr(update, "validate", validate)
    monkeypatch.setattr(update, "run_job", run_job)
    monkeypatch.setattr(update, "app_state", lambda: pytest.fail("must stop before app update"))
    with pytest.raises((RuntimeError, ValueError)):
        update.main()
    assert calls[:2] == ["validate", "migrate"]
    if failure == "migrate":
        assert "grant" not in calls


def test_digest_and_identity_boundaries():
    assert update.immutable(IMAGE)
    assert not update.immutable(update.REGISTRY + ":latest")
    assert not update.immutable(IMAGE.replace("craiteacherbeta8136", "other"))
    identity = {"type": "UserAssigned", "userAssignedIdentities": {
        f"/subscriptions/{update.SUBSCRIPTION}/resourceGroups/{update.GROUP}/providers/"
        f"Microsoft.ManagedIdentity/userAssignedIdentities/id-{update.PREFIX}-migrator": {}}}
    assert update.identity_matches(identity, "migrator")
    assert not update.identity_matches(identity, "runtime")


def test_publish_preserves_settings_and_uses_only_existing_resource_patch(monkeypatch):
    monkeypatch.setenv("GITHUB_RUN_ID", "1234")
    monkeypatch.setenv("GITHUB_RUN_ATTEMPT", "2")
    template = {"containers": [{"name": "api", "image": IMAGE,
                               "env": [{"name": "API", "secretRef": "api"}],
                               "probes": [{"type": "Readiness"}]}],
                "scale": {"minReplicas": 1}, "revisionSuffix": "previous"}
    calls = []
    def az(*args, **kwargs):
        calls.append(args[:3])
        assert args[3:5] == ("--url", update.APP_URL)
        assert f"/resourceGroups/{update.GROUP}/providers/Microsoft.App/containerApps/{update.APP}?" in args[4]
        if args[2] == "get":
            return copy.deepcopy(template)
        assert args[:3] == ("rest", "--method", "patch")
        body = json.loads(Path(args[args.index("--body") + 1][1:]).read_text())
        assert set(body) == {"location", "properties"}
        assert set(body["properties"]) == {"template"}
        assert body["location"] == "mexicocentral"
        expected = copy.deepcopy(template)
        expected["containers"][0]["image"] = IMAGE.replace("b" * 64, "c" * 64)
        expected["revisionSuffix"] = "cd-1234-2"
        assert body["properties"]["template"] == expected
    monkeypatch.setattr(update, "az", az)
    assert update.publish(IMAGE.replace("b" * 64, "c" * 64)) == f"{update.APP}--cd-1234-2"
    assert [call[2] for call in calls] == ["get", "patch"]


def test_wait_revision_requires_the_exact_new_revision(monkeypatch):
    states = iter([{"latest": "old", "ready": "old"}, {"latest": "new", "ready": "old"},
                   {"latest": "new", "ready": "new"}])
    monkeypatch.setattr(update, "app_state", lambda: next(states))
    monkeypatch.setattr(update.time, "sleep", lambda _: None)
    monkeypatch.setattr(update, "note", lambda _: None)
    revisions = []
    def resource(*args, **kwargs):
        revisions.append(args[args.index("--revision") + 1])
        return {"health": "Healthy", "active": True, "images": [IMAGE]}
    monkeypatch.setattr(update, "resource", resource)
    update.wait_revision(IMAGE, "new")
    assert revisions == ["new"]


def test_workflow_actions_are_pinned_to_commits():
    import re
    workflow = (Path(__file__).resolve().parents[1] / ".github/workflows/cd-beta.yml").read_text()
    uses = re.findall(r"uses: ([^@\s]+)@(\S+)", workflow)
    assert uses and all(re.fullmatch(r"[0-9a-f]{40}", ref) for _, ref in uses)
    # v2 tag object 8216e11 is not a commit and cannot be resolved by Actions.
    assert ("azure/login", "7184910d9eb2b1c5e48f7073824a90609bb9b6d6") in uses
    assert "provenance: false" in workflow


def test_success_orders_migrations_revalidation_publish_and_checks(monkeypatch):
    monkeypatch.setenv("IMAGE_DIGEST", IMAGE.split("@")[1])
    monkeypatch.setenv("VALIDATED_SHA", SHA)
    monkeypatch.setenv("CI_RUN_ID", "20")
    state = {"containers": [{"image": IMAGE}], "ready": "revision-1"}
    calls = []
    monkeypatch.setattr(update, "validate", lambda *args: calls.append("validate"))
    monkeypatch.setattr(update, "preflight", lambda: copy.deepcopy(state))
    monkeypatch.setattr(update, "app_state", lambda: copy.deepcopy(state))
    monkeypatch.setattr(update, "note", lambda _: None)
    monkeypatch.setattr(update.shutil, "which", lambda _: "/postman")
    monkeypatch.setattr(update, "run_job", lambda kind, *args: calls.append(kind))
    monkeypatch.setattr(update, "publish", lambda _: calls.append("publish") or "rev")
    monkeypatch.setattr(update, "wait_revision", lambda image, name: calls.append(("ready", name)) or calls.append("ready"))
    monkeypatch.setattr(update.subprocess, "run", lambda args, **kwargs: calls.append(args[0]))
    update.main()
    assert calls == ["validate", "migrate", "grant", "validate", "publish", ("ready", "rev"), "ready", "bash", "/postman"]

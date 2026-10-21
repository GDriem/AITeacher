#!/usr/bin/env python3
"""Update only the existing beta; never provision resources or grant Azure RBAC."""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from beta_ci_guard import validate

SUBSCRIPTION = "1350d930-7008-4b43-923d-6a7cd66701bc"
TENANT = "82090019-87c1-4439-918c-a31932facc9a"
GROUP = "rg-aiteacher-beta-8136"
PREFIX = "aiteacher-beta-8136"
APP = f"ca-{PREFIX}"
HOST = f"{APP}.thankfuldune-75a4eb8a.mexicocentral.azurecontainerapps.io"
REGISTRY = "craiteacherbeta8136.azurecr.io/aiteacher"
ROOT = Path(__file__).resolve().parents[2]
API = "2025-07-01"
APP_URL = (f"https://management.azure.com/subscriptions/{SUBSCRIPTION}/resourceGroups/{GROUP}"
           f"/providers/Microsoft.App/containerApps/{APP}?api-version={API}")
# Fields the CLI execution model keeps; anything else would be dropped silently.
EXECUTION_FIELDS = {"name", "image", "imageType", "command", "args", "env", "resources"}


def az(*args, query=None):
    command = ["az", *args, "--subscription", SUBSCRIPTION, "--only-show-errors", "-o", "json"]
    if query:
        command += ["--query", query]
    # Capture only selected metadata; never print environment variables or secret values.
    result = subprocess.run(command, check=True, capture_output=True, text=True, timeout=300)
    return json.loads(result.stdout) if result.stdout.strip() else None


def resource(*args, **kwargs):
    return az(*args, "--resource-group", GROUP, **kwargs)


def note(message):
    print(message, flush=True)
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a") as output:
            output.write(message + "\n\n")


def immutable(image):
    return re.fullmatch(re.escape(REGISTRY) + r"@sha256:[0-9a-f]{64}", image or "") is not None


def identity_matches(identity, suffix):
    expected = (f"/subscriptions/{SUBSCRIPTION}/resourceGroups/{GROUP}/providers/"
                f"Microsoft.ManagedIdentity/userAssignedIdentities/id-{PREFIX}-{suffix}")
    return (identity.get("type") == "UserAssigned"
            and {key.lower() for key in identity.get("userAssignedIdentities", {})} == {expected.lower()})


def app_state():
    return resource("containerapp", "show", "--name", APP, query=(
        "{identity:identity,mode:properties.configuration.activeRevisionsMode,"
        "ingress:properties.configuration.ingress,containers:properties.template.containers[]."
        "{name:name,image:image},latest:properties.latestRevisionName,ready:properties.latestReadyRevisionName}"
    ))


def preflight():
    account = az("account", "show", query="{id:id,tenantId:tenantId}")
    if account != {"id": SUBSCRIPTION, "tenantId": TENANT}:
        raise ValueError("Unexpected Azure account")
    app = app_state()
    ingress = app["ingress"]
    if (app["mode"] != "Single" or ingress["allowInsecure"] is not False
            or ingress["fqdn"] != HOST or ingress["external"] is not True
            or not identity_matches(app["identity"], "runtime")
            or len(app["containers"]) != 1 or app["containers"][0]["name"] != "api"
            or not immutable(app["containers"][0]["image"])
            or not app["ready"] or app["latest"] != app["ready"]):
        raise ValueError("Beta configuration drift or unfinished revision; review before CD")
    for kind in ("migrate", "grant"):
        job = f"job-{kind}-{PREFIX}"
        state = resource("containerapp", "job", "show", "--name", job, query=(
            "{identity:identity,trigger:properties.configuration.triggerType,"
            "containers:properties.template.containers[].{name:name,command:command}}"
        ))
        if (not identity_matches(state["identity"], "migrator") or state["trigger"] != "Manual"
                or state["containers"] != [{"name": kind, "command": ["dotnet", "AITeacher.Api.dll"]}]):
            raise ValueError(f"Unexpected migration job configuration: {job}")
        executions = resource("containerapp", "job", "execution", "list", "--name", job,
                              query="[].properties.status")
        if any(status not in {"Succeeded", "Failed", "Stopped"} for status in executions):
            raise ValueError(f"Job still executing or in unknown state: {job}")
    return app


def execution_template(template, kind):
    containers = template.get("containers") or []
    if (len(containers) != 1 or containers[0].get("name") != kind
            or template.get("initContainers") or template.get("volumes")
            or not set(containers[0]) <= EXECUTION_FIELDS):
        raise ValueError("Unexpected execution template; an override could drop settings")
    return template


def run_job(kind, image, argument):
    job = f"job-{kind}-{PREFIX}"
    # Start overrides replace the execution template. Copy it in full so env,
    # secretRef, resources and command survive; never update the stored job.
    template = execution_template(
        resource("containerapp", "job", "show", "--name", job, query="properties.template"), kind)
    template["containers"][0].update(image=image, args=[argument])
    expected = {key: template["containers"][0].get(key) for key in ("image", "args", "command")}
    expected["env"] = sorted(item["name"] for item in template["containers"][0].get("env") or [])
    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory) / "execution.json"
        path.write_text(json.dumps(template))  # JSON is also valid YAML.
        path.chmod(0o600)
        execution = resource("containerapp", "job", "start", "--name", job,
                             "--yaml", str(path), query="name")
    if not execution:
        raise ValueError("Azure did not return a job execution")
    note(f"Job `{job}`, execution `{execution}`, image `{image}`.")
    executed = resource("containerapp", "job", "execution", "show", "--name", job,
                        "--job-execution-name", execution, query="properties.template.containers[0]")
    actual = {key: executed.get(key) for key in ("image", "args", "command")}
    actual["env"] = sorted(item["name"] for item in executed.get("env") or [])
    if actual != expected:
        # Fail closed; a running execution must be inspected, never followed by an app update.
        raise RuntimeError(f"Job {execution} did not receive the expected override; application image was not updated")
    deadline = time.monotonic() + 1860
    while time.monotonic() < deadline:
        status = resource("containerapp", "job", "execution", "show", "--name", job,
                          "--job-execution-name", execution, query="properties.status")
        if status == "Succeeded":
            note(f"Job `{execution}`: Succeeded.")
            return
        if status in {"Failed", "Stopped", "Degraded"}:
            raise RuntimeError(f"Job {execution}: {status}; application image was not updated")
        time.sleep(10)
    raise TimeoutError(f"Job {execution} timed out; inspect before retrying; no application update")


def wait_revision(image, expected):
    deadline = time.monotonic() + 600
    while time.monotonic() < deadline:
        state = app_state()
        if state["latest"] == expected and state["ready"] == expected:
            revision = resource("containerapp", "revision", "show", "--name", APP,
                                "--revision", state["ready"], query=(
                                    "{health:properties.healthState,active:properties.active,"
                                    "images:properties.template.containers[].image}"))
            if revision == {"health": "Healthy", "active": True, "images": [image]}:
                note(f"Ready revision: `{state['ready']}`; immutable image verified.")
                return
        time.sleep(10)
    raise TimeoutError("New image did not become the healthy ready revision; inspect beta and rollback compatibility")


def publish(image):
    # Read and write the template with the same API version so no field is lost in translation.
    template = az("rest", "--method", "get", "--url", APP_URL, query="properties.template")
    if len(template["containers"]) != 1 or template["containers"][0]["name"] != "api":
        raise ValueError("Unexpected application template")
    template["containers"][0]["image"] = image
    suffix = f"cd-{os.environ['GITHUB_RUN_ID']}-{os.environ['GITHUB_RUN_ATTEMPT']}"
    template["revisionSuffix"] = suffix
    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory) / "image-update.json"
        path.write_text(json.dumps({"location": "mexicocentral", "properties": {"template": template}}))
        path.chmod(0o600)
        # PATCH only the existing template, without provider registration, identity
        # assignment, secrets/configuration replacement or a resource deployment.
        # ARM may answer 202 without a body; the revision name is derived from the suffix.
        az("rest", "--method", "patch", "--url", APP_URL, "--body", f"@{path}")
    return f"{APP}--{suffix}"


def verify_access():
    """Read-only proof of OIDC, subscription visibility and the role's read actions."""
    app = preflight()
    revision = resource("containerapp", "revision", "show", "--name", APP, "--revision", app["ready"],
                        query="properties.healthState")
    for kind in ("migrate", "grant"):
        execution_template(resource("containerapp", "job", "show", "--name", f"job-{kind}-{PREFIX}",
                                    query="properties.template"), kind)
    note(f"Read access verified. Ready revision `{app['ready']}` ({revision}), image "
         f"`{app['containers'][0]['image']}`. No image, job or application change was made.")


def main():
    image = f"{REGISTRY}@{os.environ['IMAGE_DIGEST']}"
    if not immutable(image):
        raise ValueError("Expected the build's immutable digest in the fixed beta ACR")
    sha = os.environ["VALIDATED_SHA"]
    check_ci = lambda: validate(os.environ["CI_RUN_ID"], sha)
    check_ci()
    previous = preflight()
    postman = shutil.which("postman")
    if not postman:
        raise ValueError("Install Postman CLI before any mutation")
    note(f"Commit `{sha}`; CI `{os.environ['CI_RUN_ID']}`.\n\n"
         f"Previous image: `{previous['containers'][0]['image']}`\n\n"
         f"Previous revision: `{previous['ready']}`\n\nCandidate image: `{image}`")
    # Per-execution overrides preserve VNet, MI, env and secrets; the job template is unchanged.
    # The existing key is already bootstrapped: no Key Vault Crypto Officer or RBAC changes.
    run_job("migrate", image, "--migrate")
    run_job("grant", image, "--grant-runtime-access")
    check_ci()  # A newer main commit may have arrived during build/migrations.
    current = app_state()
    if current != previous:
        raise ValueError("Application changed outside the CD lock; refusing to overwrite it")
    wait_revision(image, publish(image))
    subprocess.run(["bash", str(ROOT / "backend/scripts/verify-azure.sh"), f"https://{HOST}"], check=True)
    subprocess.run([postman, "collection", "run", str(ROOT / "postman/collections/AITeacher Backend Smoke"),
                    "--env-var", f"baseUrl=https://{HOST}", "--no-report-events"], check=True, timeout=300)
    note("HTTPS, readiness, React, worklet, 404 boundaries and existing Postman smoke passed. "
         "Real Google login, voice and AI acceptance remain separate.")


if __name__ == "__main__":
    verify_access() if sys.argv[1:] == ["--verify-access"] else main()

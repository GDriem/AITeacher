#!/usr/bin/env python3
"""Fail closed unless the latest push CI validates the current main commit."""
import json
import os
import re
import urllib.parse
import urllib.request
from pathlib import Path

REPOSITORY = "GDriem/AITeacher"
CHECKS = {
    "Secretos y workflow",
    "Python y scripts",
    "Frontend",
    "Backend PostgreSQL, contratos y recorrido React",
}


def api(path):
    request = urllib.request.Request(
        f"https://api.github.com/repos/{REPOSITORY}/{path}",
        headers={"Authorization": f"Bearer {os.environ['GH_TOKEN']}",
                 "Accept": "application/vnd.github+json",
                 "X-GitHub-Api-Version": "2022-11-28"},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)


def validate(run_id, expected_sha=None, get=api):
    if not re.fullmatch(r"[1-9][0-9]*", str(run_id)):
        raise ValueError("Expected a numeric CI run ID")
    workflow = get("actions/workflows/ci.yml")
    run = get(f"actions/runs/{run_id}")
    sha = run["head_sha"]
    if (run["workflow_id"] != workflow["id"] or run["event"] != "push"
            or run["head_branch"] != "main"
            or run["head_repository"]["full_name"] != REPOSITORY
            or run["status"] != "completed" or run["conclusion"] != "success"
            or not re.fullmatch(r"[0-9a-f]{40}", sha)):
        raise ValueError("CI must be a successful push to main in the owning repository")
    if expected_sha is not None and sha != expected_sha:
        raise ValueError("CI commit differs from the selected commit")
    if get("git/ref/heads/main")["object"]["sha"] != sha:
        raise ValueError("Superseded commit: only the current main head can deploy")
    query = urllib.parse.urlencode({"branch": "main", "event": "push", "head_sha": sha,
                                    "per_page": 100})
    runs = get(f"actions/workflows/{workflow['id']}/runs?{query}")["workflow_runs"]
    if not runs or max(item["id"] for item in runs) != int(run_id):
        raise ValueError("A newer CI run exists for this commit")
    jobs = []
    page = 1
    while True:
        batch = get(f"actions/runs/{run_id}/attempts/{run['run_attempt']}/jobs?per_page=100&page={page}")["jobs"]
        jobs.extend(batch)
        if len(batch) < 100:
            break
        page += 1
    names = [job["name"] for job in jobs]
    if (set(names) != CHECKS or len(names) != len(CHECKS)
            or any(job["status"] != "completed" or job["conclusion"] != "success" for job in jobs)):
        raise ValueError("All four CI jobs must succeed in the current attempt; skipped is not success")
    return sha


def main():
    if os.environ.get("GITHUB_REPOSITORY") != REPOSITORY or os.environ.get("GITHUB_REF") != "refs/heads/main":
        raise ValueError("CD must run from the owning repository on main")
    event = json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text())
    if os.environ["GITHUB_EVENT_NAME"] == "workflow_run":
        run = event["workflow_run"]
        if run["event"] != "push" or run["conclusion"] != "success" or run["head_branch"] != "main":
            raise ValueError("Only successful push CI may trigger CD")
        run_id = str(run["id"])
    elif os.environ["GITHUB_EVENT_NAME"] == "workflow_dispatch":
        run_id = event["inputs"]["ci_run_id"]
    else:
        raise ValueError("Unsupported CD event")
    sha = validate(run_id, os.environ.get("VALIDATED_SHA"))
    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a") as output:
            output.write(f"sha={sha}\nci_run_id={run_id}\n")
    print(f"Validated main commit {sha}, CI run {run_id}")


if __name__ == "__main__":
    main()

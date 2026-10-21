#!/usr/bin/env python3
"""Run local .NET/Postman/browser checks with owned child-process lifecycles.

Requires AITEACHER_TEST_POSTGRES with CREATEDB on a local test server. Uses only
synthetic data. Does not export history, call real models or publish results.
"""
import argparse
import os
import shutil
import signal
import subprocess
import tempfile
import time
import urllib.request
import urllib.error
from pathlib import Path


def wait_for(url, process, any_http=False):
    deadline = time.monotonic() + 60
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError("Local test process exited before readiness")
        try:
            with urllib.request.urlopen(url, timeout=1) as response:
                if response.status == 200:
                    return
        except urllib.error.HTTPError:
            if any_http:
                return
        except (OSError, ValueError):
            pass
        time.sleep(0.2)
    raise RuntimeError("Local test readiness timed out")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--postman", default=os.getenv("POSTMAN_BIN") or shutil.which("postman") or str(Path.home() / ".local/bin/postman"))
    parser.add_argument("--port", type=int, default=4910)
    args = parser.parse_args()
    if not os.getenv("AITEACHER_TEST_POSTGRES"):
        parser.error("Set AITEACHER_TEST_POSTGRES for an isolated local test server")
    root = Path(__file__).resolve().parents[2]
    env = os.environ.copy()
    env["AITEACHER_TEST_AI_URL"] = f"http://127.0.0.1:{args.port}"
    processes = []

    def run(command, cwd=root):
        subprocess.run(command, cwd=cwd, env=env, check=True)

    def start(command, output):
        process = subprocess.Popen(command, cwd=root, env=env, stdout=output, stderr=subprocess.STDOUT, start_new_session=True)
        processes.append(process)
        return process

    # Keep logs ephemeral: test payloads are synthetic, no reports are published.
    with tempfile.TemporaryFile(mode="w+") as simulation_log, tempfile.TemporaryFile(mode="w+") as host_log:
        try:
            simulation = start([args.postman, "simulation", "run", "postman/simulations/tutor.sim.yaml", "--port", str(args.port), "--output", "ndjson"], simulation_log)
            wait_for(f"http://127.0.0.1:{args.port}/azure/", simulation, any_http=True)
            run(["dotnet", "test", "AITeacher.slnx"], root / "backend")
            run(["dotnet", "build", "tests/AITeacher.BrowserHost"], root / "backend")
            host = start(["dotnet", str(root / "backend/tests/AITeacher.BrowserHost/bin/Debug/net11.0/AITeacher.BrowserHost.dll")], host_log)
            wait_for("http://127.0.0.1:5088/health/ready", host)
            run([args.postman, "spec", "lint", "backend/openapi.yaml", "--issueType=syntax"])
            for name in ("AITeacher Backend", "AITeacher Backend Smoke"):
                run([args.postman, "collection", "lint", f"postman/collections/{name}"])
            run([args.postman, "collection", "run", "postman/collections/AITeacher Backend Smoke", "--env-var", "baseUrl=http://127.0.0.1:5088", "--no-report-events"])
            os.killpg(host.pid, signal.SIGTERM)
            host.wait(timeout=20)
            run(["node", "node_modules/@playwright/test/cli.js", "test", "--config", "playwright.backend.config.ts"], root / "frontend")
            simulation_log.seek(0)
            log = simulation_log.read()
            if '"event":"request"' not in log:
                raise RuntimeError("Simulation received no requests; inspect dependency wiring")
            print("Local backend, smoke and browser checks passed; HTTP simulation requests observed.")
        except Exception:
            for title, stream in (("simulation", simulation_log), ("browser host", host_log)):
                stream.seek(0)
                print(f"Local {title} diagnostics:\n{stream.read()[-5000:]}")
            raise
        finally:
            for process in reversed(processes):
                if process.poll() is None:
                    os.killpg(process.pid, signal.SIGTERM)
                    try:
                        process.wait(timeout=20)
                    except subprocess.TimeoutExpired:
                        os.killpg(process.pid, signal.SIGKILL)
                        process.wait()


if __name__ == "__main__":
    main()

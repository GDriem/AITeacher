from pathlib import Path


DISPATCHER = (
    Path(__file__).parents[2]
    / ".claude"
    / "skills"
    / "gcp-readiness"
    / "dispatch-codex.sh"
)


def test_dispatcher_keeps_agent_offline_and_defers_localhost_test() -> None:
    script = DISPATCHER.read_text(encoding="utf-8")

    assert "sandbox_workspace_write.network_access=true" not in script
    assert "sandbox_workspace_write.network_access=false" in script
    assert "tests/integration/test_agent_mcp_remote.py" in script
    assert '"${REPO_ROOT}/.venv/bin/python" -m pytest' not in script
    assert "el orquestador la ejecutará después de revisar tus cambios" in script

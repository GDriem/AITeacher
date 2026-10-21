#!/usr/bin/env python3
"""Execute Azure CLI and append a safe, ordered command transcript (no response bodies)."""
import datetime
import fcntl
import os
from pathlib import Path
import re
import shlex
import shutil
import subprocess
import sys
import time


def safe_args(args):
    result = []
    redact_next = False
    sensitive = re.compile(r"(?i)(password|client.secret|access.token|refresh.token|sas.token|account.key)")
    for arg in args:
        if redact_next:
            result.append("<REDACTED>")
            redact_next = False
        elif sensitive.search(arg):
            if "=" in arg:
                result.append(arg.split("=", 1)[0] + "=<REDACTED>")
            else:
                result.append(arg)
                redact_next = arg.startswith("--")
        else:
            result.append(arg)
    return result


def append(path, value):
    with path.open("a", encoding="utf-8") as stream:
        fcntl.flock(stream, fcntl.LOCK_EX)
        stream.write(value)
        stream.flush()


def main():
    root = Path(__file__).resolve().parents[2]
    path = root / "infra/azure-command-log.md"
    args = sys.argv[1:]
    if not args:
        raise SystemExit("Usage: azure-cli-audit.py <az arguments>")
    if not path.exists():
        append(path, "# Registro de comandos Azure\n\nComandos ejecutados en orden, con estado y sin cuerpos de respuesta ni valores secretos. Las rutas de parámetros locales se recrean con `infra/azure.parameters.example.json`. Una entrada no garantiza éxito: revisar su exit code. No ejecutar comandos de diagnóstico como si fueran pasos obligatorios.\n")
    stamp = datetime.datetime.now(datetime.timezone.utc).isoformat()
    command = shlex.join(["az", *safe_args(args)])
    append(path, f"\n## {stamp}\n\n```bash\n{command}\n```\n")
    started = time.monotonic()
    try:
        code = subprocess.run([shutil.which("az") or "az", *args], cwd=os.getcwd()).returncode
    except BaseException:
        append(path, f"\nResultado del comando iniciado {stamp}: ejecución interrumpida; revisar estado remoto antes de reintentar.\n")
        raise
    append(path, f"\nResultado del comando iniciado {stamp}: exit `{code}`, duración `{time.monotonic() - started:.1f}s`.\n")
    raise SystemExit(code)


if __name__ == "__main__":
    main()

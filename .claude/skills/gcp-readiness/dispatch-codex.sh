#!/usr/bin/env bash
# Despacha una tarea del backlog a Codex en modo no interactivo.
#
#   bash .claude/skills/gcp-readiness/dispatch-codex.sh T02
#   bash .claude/skills/gcp-readiness/dispatch-codex.sh --check
#
# Devuelve por stdout el informe JSON del agente (contrato en
# codex-report.schema.json). El transcript completo queda en runs/<ID>.log y
# nunca se imprime: ese es el punto, que la sesión que orquesta lea 5 líneas
# en vez de 500.
set -uo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SKILL_DIR}/../../.." && pwd)"
SCHEMA="${SKILL_DIR}/codex-report.schema.json"
RUNS="${SKILL_DIR}/runs"
mkdir -p "${RUNS}"

# Por qué cada flag, para que nadie los quite sin saber lo que rompe:
#
#   < /dev/null       Sin esto Codex se queda en "Reading additional input from
#                     stdin..." y cuelga para siempre en modo desatendido.
#   -s workspace-write  Puede editar el repositorio, no el resto del disco.
#   network_access=true `tests/integration/test_agent_mcp_remote.py` levanta un
#                     servidor MCP real y se conecta por localhost. Con el
#                     default (sin red) ese test muere con
#                     "PermissionError: Operation not permitted" y la
#                     verificación de cualquier tarea sale en falso negativo.
#   --output-schema   Obliga al agente a contestar con el contrato JSON. Ojo:
#                     el modo estricto exige que *todas* las propiedades estén
#                     en "required", si no la API responde 400.
#   -C                Raíz de trabajo explícita, no la del shell que invoca.
CODEX_ARGS=(
  exec
  -C "${REPO_ROOT}"
  -s workspace-write
  -c sandbox_workspace_write.network_access=true
  --output-schema "${SCHEMA}"
)

if [ "${1:-}" = "--check" ]; then
  echo "Comprobando la conexión con Codex (sólo lectura, no toca el repo)…" >&2
  codex exec -C "${REPO_ROOT}" -s read-only \
    --output-schema "${SCHEMA}" -o "${RUNS}/check.json" \
    "Prueba de conectividad. No modifiques nada. Cuenta los archivos .md en
     .claude/skills/gcp-readiness/tasks/ y pon el número en 'verificacion'.
     estado=done, archivos_modificados=[], supuestos=[], notas=''." \
    < /dev/null > "${RUNS}/check.log" 2>&1
  status=$?
  cat "${RUNS}/check.json" 2>/dev/null
  echo
  [ $status -eq 0 ] || echo "Falló. Transcript en ${RUNS}/check.log" >&2
  exit $status
fi

TASK_ID="${1:?Uso: dispatch-codex.sh <ID de tarea, p.ej. T02> | --check}"
TASK_FILE="$(ls "${SKILL_DIR}/tasks/${TASK_ID}"-*.md 2>/dev/null | head -1)"
if [ -z "${TASK_FILE}" ]; then
  echo "No existe una tarea ${TASK_ID} en ${SKILL_DIR}/tasks/" >&2
  exit 2
fi
TASK_REL=".claude/skills/gcp-readiness/tasks/$(basename "${TASK_FILE}")"

PROMPT="Estás en el repositorio AITeacher. Lee ${TASK_REL} y ejecútalo completo,
incluida su sección «Verificación».

Reglas que no puedes saltarte:
- No toques archivos fuera de la sección «Archivos que puedes tocar» de la tarea.
- No ejecutes 'gcloud', ni 'infra/cloudrun/deploy.sh', ni nada que cree recursos
  en la nube: genera costos reales en el proyecto del usuario.
- No leas ni modifiques '.env': contiene credenciales del usuario.
- No hagas commit. Deja los cambios en el árbol de trabajo.
- Español en comentarios, mensajes de dominio y documentación, como el resto del
  repositorio.

Responde únicamente con el JSON del esquema. En 'verificacion' pega la salida
literal de los comandos que corriste, no un resumen. Si algo te bloqueó, di
'blocked' y explica qué en 'notas' en vez de inventar un resultado."

echo "→ ${TASK_ID}: $(basename "${TASK_FILE}")" >&2
codex "${CODEX_ARGS[@]}" -o "${RUNS}/${TASK_ID}.json" "${PROMPT}" \
  < /dev/null > "${RUNS}/${TASK_ID}.log" 2>&1
status=$?

if [ -s "${RUNS}/${TASK_ID}.json" ]; then
  cat "${RUNS}/${TASK_ID}.json"
  echo
else
  echo "Codex no produjo informe (exit ${status}). Transcript: ${RUNS}/${TASK_ID}.log" >&2
fi
echo "Transcript completo: ${RUNS}/${TASK_ID}.log" >&2
exit $status

#!/usr/bin/env bash
# Smoke test post-despliegue para learning-agent. No modifica infraestructura;
# sólo hace peticiones HTTP de sólo lectura contra un servicio ya desplegado.
#
# Uso:
#   AGENT_URL="https://learning-agent-xxxx.a.run.app" bash infra/cloudrun/smoke-test.sh
#
# Contra un entorno local (agent_app.api.main corriendo en :8000):
#   AGENT_URL="http://localhost:8000" bash infra/cloudrun/smoke-test.sh
set -uo pipefail

: "${AGENT_URL:?Set AGENT_URL, por ejemplo la URL de Cloud Run o http://localhost:8000}"
AGENT_URL="${AGENT_URL%/}"
failed=0

check() {
  local description="$1" method="$2" path="$3" expected_status="$4"
  shift 4
  local status
  status="$(curl -s -o /tmp/smoke-body.$$ -w '%{http_code}' -X "$method" "${AGENT_URL}${path}" "$@")"
  rm -f /tmp/smoke-body.$$
  if [ "$status" != "$expected_status" ]; then
    echo "✗ ${description}: esperaba ${expected_status}, recibió '${status}' (${path})"
    failed=1
    return
  fi
  echo "✓ ${description} (${status})"
}

check_body_contains() {
  local description="$1" path="$2" needle="$3"
  if ! curl -s "${AGENT_URL}${path}" | grep -qF "$needle"; then
    echo "✗ ${description}: no se encontró \"${needle}\" en ${path}"
    failed=1
    return
  fi
  echo "✓ ${description}"
}

echo "Smoke test contra ${AGENT_URL}"
echo

check "Capacidades responden"             GET "/api/capabilities" 200
check "React sirve la ruta raíz"          GET "/" 200
check "Ruta profunda de React sobrevive al recargar" GET "/tutor" 200
check_body_contains "La raíz entrega el shell de React"   "/" '<div id="root">'

echo
if [ "$failed" -ne 0 ]; then
  echo "El smoke test encontró fallas. Antes de mover tráfico real, revisa el"
  echo "servicio o revierte a la revisión anterior:"
  echo '  gcloud run services update-traffic learning-agent --region "$REGION" --to-revisions REVISION_ANTERIOR=100'
  exit 1
fi

echo "Smoke test completo: React sirve la ruta raíz y las rutas profundas."

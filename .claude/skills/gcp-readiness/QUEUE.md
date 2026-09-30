# Cola de remediación — GCP readiness

Origen: auditoría del 2026-09-28 sobre la rama `codex/react-frontend-r1`.
Estados: `pending` · `running` · `done` · `blocked` · `skipped`.

Los carriles existen para evitar conflictos de archivo entre agentes paralelos.
Dos tareas del mismo carril **nunca** se despachan a la vez.

| ID | Tarea | Archivo en `tasks/` | Carril | Depende de | Prioridad | Estado |
|----|-------|---------------------|--------|-----------|-----------|--------|
| T01 | Crear la base Firestore y endurecer `deploy.sh` | `T01-firestore-y-deploy.md` | infra | — | bloqueante | done |
| T02 | Excluir `y/` y `node_modules` de `.gcloudignore` | `T02-gcloudignore.md` | infra-2 | — | bloqueante | done |
| T03 | Degradar con 503 JSON cuando el MCP no responde | `T03-degradar-sin-mcp.md` | api | — | bloqueante | done |
| T04 | Decidir el destino de `infra/cloudrun/*.yaml` | `T04-manifiestos-cloudrun.md` | infra | T01 | bloqueante | done |
| T05 | Tracebacks y `severity` en el log JSON | `T05-logging-cloud.md` | logging | — | alta | done |
| T06 | Firestore fuera del event loop | `T06-firestore-no-bloqueante.md` | api | T03 | alta | done |
| T07 | Reutilizar cliente MCP y cachear el ID token | `T07-cliente-mcp.md` | mcp-client | — | alta | done |
| T08 | Proteger `/api/observability` | `T08-proteger-observabilidad.md` | api | T06 | media | done |
| T09 | Límite de tasa en los endpoints que llaman al modelo | `T09-limite-de-tasa.md` | api | T08 | media | done |
| T10 | Ampliar `smoke-test.sh` a `/readyz` y al camino MCP | `T10-smoke-test.md` | infra-3 | — | media | done |
| T11 | Honrar el `PORT` que inyecta Cloud Run | `T11-puerto-cloudrun.md` | arranque | T09 | baja | done |
| T12 | Reconciliar README y CLAUDE.md con el repo real | `T12-docs-desincronizados.md` | docs | — | baja | done |

## Notas de estado

Todas cerradas el 2026-09-29, un commit por tarea, suite completa en verde
después de cada una (183 pruebas al final).

- **T01** · Codex. `describe || create` de Firestore, `FIRESTORE_LOCATION=nam5`,
  `--timeout=3600`, `--concurrency=40`, `MCP_TIMEOUT_SECONDS` y
  `MCP_AUTHORING_URL`. Sin desviaciones.
- **T02** · Codex. `y/`, `frontend/node_modules`, `dist`, `coverage`,
  `playwright-report`, `test-results` y `**/*.egg-info`. No se corrió
  `gcloud meta list-files-for-upload`; la comprobación de que `frontend/src`
  sigue subiendo se hizo a mano.
- **T03** · Codex. `LearningToolsUnavailable` + handler 503. Desviación: el
  handler también captura `TimeoutError` global, así que un timeout de
  cualquier origen responde con el mensaje del catálogo. Lo pedía la
  verificación de la tarea.
- **T04** · Subagente. **Opción B**: manifiestos Knative borrados, `deploy.sh`
  queda como fuente única y el README documenta la configuración efectiva.
  Pendiente menor: `docs/react-frontend-migration-plan.md` aún menciona
  `agent-service.yaml` en 3 líneas (archivo fuera de alcance, registro
  histórico).
- **T05** · Codex. `severity`, `exception_type`, traceback y `stack` en el log
  JSON. La unificación de los logs de uvicorn quedó fuera (requiere archivos no
  autorizados).
- **T06** · Subagente. **Camino 1**: helper `_in_thread` en el borde, protocolo
  `SessionRepository` sigue síncrono. Se envuelve también el backend `local`
  para no ramificar por backend. Pruebas portadoras verificadas (fallan al
  revertir el arreglo). Hallazgo fuera de alcance: `LocalLearningTools` llama a
  `LearningService` de forma síncrona desde métodos `async`; sólo afecta a
  `MCP_USE_LOCAL_ADAPTER=true`, no a la ruta de Cloud Run.
- **T07** · Codex. `httpx.AsyncClient` reutilizado + `aclose()` en el lifespan,
  ID token cacheado con margen de 5 min y doble comprobación bajo lock.
  Desviación: el handshake MCP sigue siendo por llamada; el transporte
  instalado no permite reutilizar la sesión limpiamente.
- **T08** · Codex. `/api/observability` exige sesión reutilizando el
  `authenticated_profile` que T06 volvió asíncrono. El frontend no necesitó
  cambios.
- **T09** · Codex. `StudentRateLimiter` + 429 con `Retry-After`,
  `MODEL_RATE_LIMIT_REQUESTS_PER_MINUTE` (default 30). El contador es por
  proceso: el límite efectivo en Cloud Run se multiplica por el número de
  instancias.
- **T10** · Codex. `/healthz`, `/readyz` con reintento por arranque en frío y
  comprobación de capacidades. Verificado contra el stack local con el overlay
  `docker-compose.gcp.yml`, incluido el caso negativo (MCP apagado → salida 1).
- **T11** · Codex. `AliasChoices("PORT", "APP_PORT", "app_port")` en
  `app_port`; el MCP lee `PORT` antes que `MCP_PORT`.
- **T12** · Codex, devuelto como `blocked`. Reconcilió README y CLAUDE.md
  (PDF y `docs/README.md` inexistentes, conteo de pruebas fijo, límite de
  observabilidad por instancia). Se detuvo porque el cuerpo de la tarea pedía
  documentar `AUTHORING_TOKEN` en `.env.example`, archivo ausente de su propia
  lista de «Archivos que puedes tocar» — inconsistencia de la tarea, no del
  ejecutor. El orquestador añadió esa nota a mano tras comprobar el mapeo en
  `docker-compose.yml`. Cerrada como `done`.

## Hallazgos que no generan tarea

- **Métricas en memoria por instancia.** Con `--max-instances 3` el panel de
  observabilidad muestra sólo la instancia que atendió la petición. Arreglarlo
  de verdad significa exportar a Cloud Monitoring, que es desproporcionado para
  este proyecto. Decisión: documentar la limitación en el propio panel (parte
  de T12), no cambiar la arquitectura.
- **Imágenes locales arm64 vs amd64 de Cloud Build.** No es un defecto; sólo
  significa que `docker compose build` en el Mac no valida la imagen que correrá
  en Cloud Run. Se cubre con el primer despliegue real.

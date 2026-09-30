# Cola de remediación — GCP readiness

Origen: auditoría del 2026-09-28 sobre la rama `codex/react-frontend-r1`.
Estados: `pending` · `running` · `done` · `blocked` · `skipped`.

Los carriles existen para evitar conflictos de archivo entre agentes paralelos.
Dos tareas del mismo carril **nunca** se despachan a la vez.

| ID | Tarea | Archivo en `tasks/` | Carril | Depende de | Prioridad | Estado |
|----|-------|---------------------|--------|-----------|-----------|--------|
| T01 | Crear la base Firestore y endurecer `deploy.sh` | `T01-firestore-y-deploy.md` | infra | — | bloqueante | done |
| T02 | Excluir `y/` y `node_modules` de `.gcloudignore` | `T02-gcloudignore.md` | infra-2 | — | bloqueante | running |
| T03 | Degradar con 503 JSON cuando el MCP no responde | `T03-degradar-sin-mcp.md` | api | — | bloqueante | running |
| T04 | Decidir el destino de `infra/cloudrun/*.yaml` | `T04-manifiestos-cloudrun.md` | infra | T01 | bloqueante | pending |
| T05 | Tracebacks y `severity` en el log JSON | `T05-logging-cloud.md` | logging | — | alta | pending |
| T06 | Firestore fuera del event loop | `T06-firestore-no-bloqueante.md` | api | T03 | alta | pending |
| T07 | Reutilizar cliente MCP y cachear el ID token | `T07-cliente-mcp.md` | mcp-client | — | alta | pending |
| T08 | Proteger `/api/observability` | `T08-proteger-observabilidad.md` | api | T06 | media | pending |
| T09 | Límite de tasa en los endpoints que llaman al modelo | `T09-limite-de-tasa.md` | api | T08 | media | pending |
| T10 | Ampliar `smoke-test.sh` a `/readyz` y al camino MCP | `T10-smoke-test.md` | infra-3 | — | media | pending |
| T11 | Honrar el `PORT` que inyecta Cloud Run | `T11-puerto-cloudrun.md` | arranque | T09 | baja | pending |
| T12 | Reconciliar README y CLAUDE.md con el repo real | `T12-docs-desincronizados.md` | docs | — | baja | pending |

## Notas de estado

_(el orquestador escribe aquí una línea por tarea cerrada: fecha, resultado,
desviaciones respecto al plan)_

## Hallazgos que no generan tarea

- **Métricas en memoria por instancia.** Con `--max-instances 3` el panel de
  observabilidad muestra sólo la instancia que atendió la petición. Arreglarlo
  de verdad significa exportar a Cloud Monitoring, que es desproporcionado para
  este proyecto. Decisión: documentar la limitación en el propio panel (parte
  de T12), no cambiar la arquitectura.
- **Imágenes locales arm64 vs amd64 de Cloud Build.** No es un defecto; sólo
  significa que `docker compose build` en el Mac no valida la imagen que correrá
  en Cloud Run. Se cubre con el primer despliegue real.

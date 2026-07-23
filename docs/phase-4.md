# Fase 4 — Persistencia completa de sesiones

La conversación dejó de depender de la memoria del proceso. Agent App guarda
mensajes, tema y evaluación pendiente detrás de `SessionRepository`.

## Datos persistidos

Cada sesión contiene:

- propietario (`student_id`), título y tema;
- mensajes del estudiante, Tutor Agent y Evaluator Agent;
- pregunta pendiente, palabras esperadas privadas y número de ronda;
- fechas de creación, última actividad y archivado.

Las palabras esperadas se necesitan para que el evaluador determinista pueda
reanudar una ronda después de un reinicio. No aparecen en ningún contrato HTTP.

## API

| Operación | Endpoint |
| --- | --- |
| Listar activas | `GET /api/sessions?student_id=...` |
| Incluir archivadas | `GET /api/sessions?student_id=...&include_archived=true` |
| Recuperar detalle | `GET /api/sessions/{id}?student_id=...` |
| Renombrar | `PATCH /api/sessions/{id}` con `student_id` y `title` |
| Archivar/restaurar | `PATCH /api/sessions/{id}` con `student_id` y `archived` |
| Eliminar | `DELETE /api/sessions/{id}?student_id=...` |

Un ID existente con otro propietario responde `403`; un ID inexistente o
vencido responde `404`. Una conversación archivada puede consultarse y
restaurarse, pero no acepta chat ni evaluaciones hasta entonces.

## Adaptadores y despliegue

- Local: `LocalSessionRepository` escribe `APP_SESSIONS_PATH` con archivo
  temporal, `fsync` y reemplazo atómico.
- Docker Compose: `APP_SESSIONS_PATH=/data/sessions.json` vive en el volumen
  `agent-data`.
- Cloud Run: `APP_SESSIONS_BACKEND=firestore` usa la colección configurable
  `FIRESTORE_SESSIONS_COLLECTION`.

La interfaz usa `localStorage` sólo para recordar qué conversación abrir. Al
recargar o cambiar de dispositivo, la lista y el detalle proceden del servidor.

## Retención y eliminación

`APP_SESSION_RETENTION_DAYS` vale 365 por defecto y admite entre 1 y 3650 días.
El plazo se cuenta desde `updated_at`; las consultas purgan sesiones vencidas.
Archivar no reduce el plazo ni borra contenido. `DELETE` elimina inmediatamente
la conversación y su evaluación pendiente; no elimina el progreso académico,
que tiene su propio ciclo de vida en MCP.

## Cobertura

Las pruebas verifican:

- round-trip JSON, escritura atómica y conservación de la pregunta privada;
- adaptador Firestore, listado y mutaciones;
- retención, archivado y eliminación;
- recuperación con una nueva instancia de la aplicación;
- aislamiento por estudiante y continuidad de la evaluación recuperada.

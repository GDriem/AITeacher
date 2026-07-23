# AITeacher

Tutor de IA adaptativo creado originalmente como demo para la charla
"Agent, MCP & Run: de un LLM a un tutor multiagente por voz" (Google I/O
Extended Guatemala City). Guía completa en
`agent-mcp-run-guia-completa.pdf` (18 secciones) — léela para contexto profundo;
este archivo es el resumen operativo para trabajar en el código.

Idea central: **el modelo genera, los agentes deciden y delegan, MCP expone
herramientas y recursos deterministas**. El servidor MCP nunca es tratado como
agente y nunca contiene lógica pedagógica.

## Estructura del repositorio

```
agent_app/            App multiagente (FastAPI + Google ADK 2.x)
  agent.py            root_agent ADK con 3 sub_agents (McpToolset por especialista)
  agents/              orchestrator.py, diagnostic.py, tutor.py, evaluator.py
  api/main.py          Endpoints FastAPI, correlation ID, composición de dependencias
  providers/           ModelProvider: mock.py, gemini.py, foundry.py, factory.py
  services/            learning_tools.py (cliente MCP), live_voice.py (Gemini Live),
                       sessions.py (JSON/Firestore), logging.py
  models/chat.py        Contratos HTTP (ChatRequest/Response, TraceEvent, etc.)
  static/               UI (HTML/CSS/JS servidos por FastAPI)

mcp_learning_server/  Servidor MCP remoto e independiente (FastMCP, Streamable HTTP)
  server.py             Punto de entrada ASGI, monta /mcp, /healthz, /readyz
  content/learning_content.json  Corpus propio: 23 temas y 46 lecciones
  services/             ingestion.py, content_store.py (in-memory), retrieval.py (TF-IDF),
                       learning.py (LearningService), authoring.py (versionado editorial)
  repositories/         base.py (puerto), local_progress.py (JSON atómico),
                       firestore_progress.py, content_authoring.py (JSON atómico)
  tools/learning_tools.py  Registro de las 6 herramientas MCP validadas con Pydantic

tests/                 unit/ (aislado) e integration/ (API + transporte MCP real)
infra/cloudrun/         Dockerfiles, manifiestos Cloud Run, deploy.sh (manual, no automático)
docs/                   architecture.md, demo-script.md, deployment.md, foundry.md, phase-1.md
```

Nota: no es un repositorio git (`git status` fallará aquí); no hay `.env` real,
sólo `.env.example`.

## Conceptos clave (no confundir)

| Concepto | Regla |
|---|---|
| Agente | Interpreta un objetivo y elige el siguiente paso (Orchestrator, Diagnostic, Tutor, Evaluator) |
| Herramienta | Operación acotada y determinista, sin decisión (las 6 tools MCP) |
| MCP | Protocolo de descubrimiento/invocación; el servidor MCP **no decide** flujo pedagógico |
| Subagente | Especialista con `sub_agents` en ADK, cada uno con `McpToolset` filtrado (mínimo privilegio) |

Jerarquía ADK (`agent_app/agent.py`):
```
root_agent
 ├─ diagnostic_agent [single_turn]  → get_student_progress
 ├─ tutor_agent       [task]        → search_learning_content
 └─ evaluator_agent   [task]        → save_learning_result
```

## Herramientas MCP (6 + 1 recurso)

`get_student_progress`, `search_learning_content`, `get_learning_path`,
`save_learning_result`, `find_practical_example`, `list_available_topics`,
recurso `learning://topics`.

## Comandos

```bash
# Instalar (uv o pip)
uv sync --extra dev --extra agents --extra foundry
python -m pip install -e ".[dev,agents,foundry]"

# Modo rápido sin red (Agent App llama LearningService directamente)
$env:MODEL_PROVIDER="mock"; $env:MCP_USE_LOCAL_ADAPTER="true"
python -m agent_app.api.main

# Modo realista: dos procesos vía Streamable HTTP
python -m mcp_learning_server.server                      # terminal 1, puerto 8001
$env:MODEL_PROVIDER="mock"; $env:MCP_USE_LOCAL_ADAPTER="false"
$env:MCP_SERVER_URL="http://localhost:8001/mcp/"
python -m agent_app.api.main                              # terminal 2, puerto 8000

# Pruebas
python -m pytest

# Docker
docker compose up --build
```

Verificación rápida: `curl http://localhost:8001/healthz` (MCP) y
`http://localhost:8000` (UI). MCP Inspector contra `http://localhost:8001/mcp/`.

## Variables de entorno relevantes

- `MODEL_PROVIDER`: `mock` | `gemini` | `foundry` — nunca condicionales dispersos;
  todo pasa por `ModelProvider`/`factory.py`.
- `MCP_USE_LOCAL_ADAPTER`: `true` (adaptador local, sin red) | `false` (Streamable HTTP real).
- `MCP_PROGRESS_BACKEND`: `local` (JSON atómico) | `firestore`.
- `APP_SESSIONS_BACKEND`: `local` (JSON atómico) | `firestore`; controla
  conversaciones, tema y evaluación pendiente.
- Voz (`voice_enabled` en `config.py`): sólo activa si `MODEL_PROVIDER=gemini` y hay
  credenciales (API key o Vertex AI). Con `foundry` la voz se deshabilita a propósito.

## Convenciones y decisiones importantes

- **Español** en docs, mensajes y comentarios de dominio — sigue esa convención al
  editar `docs/*.md`, docstrings de servicios y strings de la UI.
- **Sin chain-of-thought expuesto**: el panel de trazabilidad (`TraceEvent`) muestra
  actor, acción, resumen, duración y éxito — nunca razonamiento interno ni prompts.
- **RAG léxico local es intencional** (TF-IDF, sin embeddings): determinista y sin
  credenciales para la demo. `ContentStore` es la interfaz reemplazable si se migra
  a búsqueda vectorial — no tocar contratos de agentes/MCP al hacerlo.
- **Evaluador determinista** (comparación de palabras clave, no un segundo LLM) —
  a propósito, para poder probarlo sin costo ni red.
- **MCP SDK fijado a `<2`** (`mcp[cli]>=1.27,<2`): la línea 2.x estaba en alfa al
  escribir esto; no subir de mayor versión sin revisar la nota en
  `docs/architecture.md` / sección 16 del PDF.
- **Repositorio JSON atómico**: `LocalProgressRepository` escribe a archivo temporal
  + `os.replace`; no reemplazar por escritura directa.
- **Mínimo privilegio también en el diseño del agente**: cada especialista ADK recibe
  sólo el `McpToolset` filtrado que necesita — no expandir sin razón.
- **Cloud Run**: dos servicios (`learning-agent` público, `learning-mcp` privado),
  auth vía ID token con audiencia = URL del MCP. `infra/cloudrun/deploy.sh` es manual
  y genera costos reales — nunca ejecutarlo sin que el usuario lo confirme
  explícitamente (revisar proyecto, región, cuotas, presupuesto primero).
- **Nunca loguear** ID tokens, secretos, ni audio (voz no se persiste por defecto).
- **`MCP_ALLOWED_HOSTS`**: FastMCP habilita protección anti DNS-rebinding
  automáticamente, pero sólo permite `localhost`/`127.0.0.1`/`::1` por
  defecto. Cualquier despliegue donde el cliente llame al MCP por otro
  nombre de host (`mcp-server` en docker-compose, el dominio real en Cloud
  Run) recibe `421 Misdirected Request` en `/mcp/` si no se agrega ese host
  a `MCP_ALLOWED_HOSTS` (ver `mcp_learning_server/server.py:build_transport_security`).
  `docker-compose.yml` ya lo configura; `infra/cloudrun/deploy.sh` lo resuelve
  automáticamente tras el primer despliegue de `learning-mcp`. Los health
  checks (`/healthz`, `/readyz`) no están afectados: viven fuera del mount
  `/mcp/` y no pasan por esta validación.

## Pruebas

90 pruebas, ninguna llama servicios cloud reales (usan repos temporales, clientes
simulados, y un servidor MCP local real para el transporte). Ver `docs/phase-1.md`
y sección 13 del PDF para el desglose por área. Marker `integration` en pytest para
pruebas que combinan componentes sin credenciales cloud.

## Dónde mirar primero según la tarea

| Tarea | Archivo |
|---|---|
| Routing/delegación del orquestador | `agent_app/agents/orchestrator.py` |
| Jerarquía ADK / tools por especialista | `agent_app/agent.py` |
| Cliente MCP (local vs remoto) | `agent_app/services/learning_tools.py` |
| Voz / Gemini Live | `agent_app/services/live_voice.py` |
| Endpoints y middleware | `agent_app/api/main.py` |
| TF-IDF / recuperación | `mcp_learning_server/services/retrieval.py` |
| Contratos MCP validados | `mcp_learning_server/tools/learning_tools.py` |
| Persistencia JSON | `mcp_learning_server/repositories/local_progress.py` |
| Despliegue reproducible | `infra/cloudrun/deploy.sh` |
| Pruebas manuales de API/MCP | `postman/agent-mcp-run.postman_collection.json` |

## Postman

`postman/agent-mcp-run.postman_collection.json` cubre ambos servicios:
- **MCP Server** (`:8001`): `healthz`/`readyz` y JSON-RPC crudo sobre `/mcp/`
  (`initialize`, `tools/list`, `resources/list`, `resources/read`, y
  `tools/call` para las 6 herramientas, incluyendo un caso de tema
  desconocido). El servidor es stateless (`stateless_http=True`), así que no
  requiere manejar `Mcp-Session-Id`.
- **Agent App** (`:8000`): `healthz`, `capabilities`, UI, y el flujo completo
  `Chat` → `Evaluate` (el request de Chat guarda `session_id` en una variable
  de colección vía test script para que Evaluate lo reutilice automáticamente).

Importar en Postman con "Import" → seleccionar el archivo. Requiere ambos
servicios corriendo localmente.

## Documentación completa

`docs/architecture.md`, `docs/demo-script.md`, `docs/deployment.md`,
`docs/foundry.md`, `docs/phase-1.md`, `docs/phase-2.md`, `docs/phase-3.md`,
`docs/phase-4.md`, `docs/phase-5.md`, `docs/phase-6.md`, `docs/phase-7.md`, y
`agent-mcp-run-guia-completa.pdf`
(guía técnica de 18 secciones con diagramas, decisiones y trade-offs).

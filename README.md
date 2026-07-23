# AITeacher

**AITeacher** es un tutor de IA con aprendizaje adaptativo, agentes
especializados, herramientas MCP y voz opcional. El proyecto nació como la
demostración de la charla **“Agent, MCP & Run: de un LLM a un tutor multiagente
por voz”** del Google I/O Extended Guatemala City.

Repositorio oficial: [GDriem/AITeacher](https://github.com/GDriem/AITeacher).

El repositorio implementa un MVP completo por texto, una interfaz demostrativa,
voz opcional con Gemini Live y artefactos de despliegue. MCP se mantiene como una
frontera de herramientas y recursos deterministas; no se presenta como agente.

## Capacidades

- 23 temas y 46 lecciones curriculares, con fuente, nivel y metadatos.
- Ingestión, almacenamiento y recuperación separados.
- RAG léxico local, determinista y sin servicios externos.
- Repositorio JSON atómico para progreso y evaluaciones.
- Seis herramientas MCP y un recurso de catálogo.
- Streamable HTTP sin estado en `http://localhost:8001/mcp/`.
- Health checks en `/healthz` y `/readyz`.
- Pruebas unitarias y de integración sin credenciales cloud.
- Google ADK 2.x con orquestador y tres subagentes especialistas.
- FastAPI, chat, evaluación y trazabilidad sin chain-of-thought.
- Explorador responsive de los 23 temas con categorías, niveles y progreso.
- Ruta adaptativa con orden, prerrequisitos, motivos y cuatro estados por tema.
- Dominio por tema y concepto con intentos, mejor puntaje y nivel independiente.
- Conversaciones persistentes con recuperación de mensajes, tema y evaluación.
- Historial con apertura, renombrado, archivado y eliminación por estudiante.
- Evaluación híbrida con conceptos esenciales y rúbrica semántica estructurada.
- Fallback determinista y dataset de regresión para respuestas representativas.
- Feedback con acciones directas y práctica adaptativa separada del hilo principal.
- Tres proyectos integradores con rúbricas específicas y evaluación estructurada.
- Panel protegido para crear, previsualizar, publicar y versionar lecciones.
- Borradores aislados del corpus MCP, con despublicación y reversión trazable.
- Navegación accesible por teclado, foco administrado y estados recuperables.
- Panel agregado de salud, latencia, errores, tokens, costos y actividades.
- Compresión, caché versionada y presupuestos de rendimiento del frontend.
- Interfaz para proyección y voz opt-in mediante WebSocket backend.
- Adaptadores JSON/Firestore y dos servicios preparados para Cloud Run.

Las dependencias de ADK, Google Cloud y Foundry están separadas en grupos
opcionales para mantener las pruebas locales ligeras.

## Requisitos

- Python 3.12, 3.13 o 3.14.
- `uv` recomendado, o `pip` como alternativa.

### Instalación con uv

```bash
uv sync --extra dev --extra agents --extra foundry
```

### Instalación con pip

```bash
python -m venv .venv
# PowerShell: .venv\Scripts\Activate.ps1
# macOS/Linux: source .venv/bin/activate
python -m pip install -e ".[dev,agents,foundry]"
```

Copie `.env.example` a `.env` únicamente si desea cambiar los valores por
defecto. Ninguna credencial es necesaria en la Fase 1.

## Ejecutar el servidor MCP

```bash
python -m mcp_learning_server.server
```

Verificación rápida:

```bash
curl http://localhost:8001/healthz
```

También puede conectar MCP Inspector a `http://localhost:8001/mcp/`.

En otra terminal inicie la aplicación:

```bash
python -m agent_app.api.main
```

Abra `http://localhost:8000`. Por defecto se usan proveedor `mock` y adaptador
MCP local para que la demo arranque sin credenciales. Para probar dos procesos,
configure `MCP_USE_LOCAL_ADAPTER=false`.

La aplicación expone `GET /api/topics?student_id=<id>` para consultar el
catálogo, la ruta y el estado del estudiante. La respuesta incluye
`total_topics`, una recomendación explicada y el estado de cada tema
(`blocked`, `available`, `in_progress` o `completed`). Los prerrequisitos
orientan la ruta, pero no impiden estudiar un tema fuera del orden sugerido.
Cada elemento evaluado incluye además su progreso con nivel, mejor puntaje,
intentos y conceptos dominados o pendientes.

La aplicación persiste el historial en `APP_SESSIONS_PATH` y ofrece
`GET /api/sessions?student_id=<id>` para recuperar conversaciones. El navegador
guarda sólo el identificador activo; mensajes, tema y evaluación pendiente se
sincronizan con el backend. `PATCH /api/sessions/{id}` permite renombrar o
archivar y `DELETE /api/sessions/{id}` elimina de inmediato. La retención
predeterminada es de 365 días.

Cada resultado de `POST /api/evaluate` incluye una rúbrica de precisión,
comprensión, aplicación y claridad. Con Gemini, la salida se solicita mediante
un esquema JSON nativo y después se valida; si el proveedor falla o incumple el
contrato, el flujo conserva la misma respuesta estructurada con un fallback
determinista. La rúbrica y la explicación breve quedan guardadas en el progreso.

Desde el feedback se puede solicitar otro ejemplo, una explicación más sencilla,
reintentar o iniciar práctica sobre un concepto pendiente. La práctica usa
`POST /api/practice/start` y `POST /api/practice/evaluate`; su ronda se persiste
sin reemplazar la evaluación principal ni inflar el dominio del tema.

`GET /api/projects` lista tres retos transversales. Cada entrega se evalúa en
`POST /api/projects/{project_id}/evaluate` con una rúbrica propia del proyecto.

El panel de autoría se habilita al configurar `APP_AUTHORING_TOKEN`. En Docker
Compose use `AUTHORING_TOKEN` para proteger tanto Agent App como las rutas
administrativas del MCP. Las lecciones se guardan en
`MCP_CONTENT_AUTHORING_PATH`; sólo el snapshot publicado alimenta la búsqueda del
tutor. Consulte [la guía de Fase 7](docs/phase-7.md) para el flujo y los
contratos.

`GET /healthz` comprueba la vida del proceso y `GET /readyz` valida que Agent
App pueda consultar el catálogo MCP. `GET /api/observability` entrega métricas
agregadas sin contenido del estudiante. El panel **Operación** muestra
peticiones, tasa de error, latencia p95, llamadas al modelo, tokens estimados,
costo y actividades completadas. Configure las tarifas vigentes mediante:

```dotenv
MODEL_INPUT_COST_PER_MILLION_USD=0
MODEL_OUTPUT_COST_PER_MILLION_USD=0
```

Con ambos valores en cero se mide consumo sin atribuir un costo. Las métricas
son locales a cada réplica; consulte [la guía de Fase 8](docs/phase-8.md) para
privacidad, alcance y validación responsive.

## Ejecutar pruebas

```bash
python -m pytest
```

## Docker

```bash
docker compose up --build
```

La interfaz queda en `http://localhost:8000` y MCP en `localhost:8001`. El
progreso queda en `mcp-data` y las conversaciones en `agent-data`; las imágenes
usan usuarios sin privilegios.

Compose toma `MODEL_PROVIDER` y las credenciales desde `.env`. Para usar Google
AI Studio dentro del contenedor:

```dotenv
MODEL_PROVIDER=gemini
GOOGLE_GENAI_USE_VERTEXAI=false
GOOGLE_API_KEY=su-api-key
```

La dirección `MCP_SERVER_URL` se configura internamente como
`http://mcp-server:8080/mcp/`, aunque el servidor MCP se publique en el puerto
`8001` del host.

## Herramientas MCP

- `get_student_progress(student_id)`
- `search_learning_content(topic, level, limit=3)`
- `get_learning_path(student_id)`
- `save_learning_result(student_id, topic, score, feedback, recommendation, mastered_concepts, pending_concepts)`
- `find_practical_example(topic, programming_language)`
- `list_available_topics()`

Consulte [la arquitectura](docs/architecture.md), [el guion de demo](docs/demo-script.md),
[el despliegue](docs/deployment.md), [Foundry](docs/foundry.md),
[la guía de Fase 1](docs/phase-1.md), [la guía de Fase 2](docs/phase-2.md) y
[la guía de Fase 3](docs/phase-3.md), [la guía de Fase 4](docs/phase-4.md) y
[la guía de Fase 5](docs/phase-5.md), [la guía de Fase 6](docs/phase-6.md) y
[la guía de Fase 7](docs/phase-7.md), y
[la guía de Fase 8](docs/phase-8.md).

# AITeacher

**AITeacher** es un tutor multiárea con aprendizaje adaptativo, agentes
especializados, herramientas MCP y voz opcional. El proyecto nació como la
demostración de la charla **“Agent, MCP & Run: de un LLM a un tutor multiagente
por voz”** del Google I/O Extended Guatemala City.

Repositorio oficial: [GDriem/AITeacher](https://github.com/GDriem/AITeacher).

El repositorio implementa el producto definido en las ocho fases de su hoja de
ruta: experiencia completa por texto, interfaz demostrativa, voz opcional con
Gemini Live y artefactos de despliegue. MCP se mantiene como una frontera de
herramientas y recursos deterministas; no se presenta como agente.

## Estado del proyecto

Las ocho fases de producto están completadas. La documentación que permanece
versionada cubre el [currículo de inglés](docs/english-curriculum.md),
[Google Login y perfiles](docs/google-auth-student-profiles-plan.md) y la
[migración del frontend a React](docs/react-frontend-migration-plan.md).

## Capacidades

- 27 temas y 58 lecciones curriculares, con fuente, materia, nivel y metadatos.
- Dos materias: inteligencia artificial e inglés.
- Inglés escrito con saludos, vocabulario, gramática y conversación en tres niveles.
- Ingestión, almacenamiento y recuperación separados.
- RAG léxico local, determinista y sin servicios externos.
- Repositorio JSON atómico para progreso y evaluaciones.
- Seis herramientas MCP y un recurso de catálogo.
- Streamable HTTP sin estado en `http://localhost:8001/mcp/`.
- Health checks en `/health` y `/ready`.
- Pruebas unitarias y de integración sin credenciales cloud.
- Google ADK 2.x con orquestador y tres subagentes especialistas.
- FastAPI, chat, evaluación y trazabilidad sin chain-of-thought.
- Explorador responsive de los 27 temas con filtros de materia, categoría y nivel.
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
- Modo de voz inmersivo y opt-in con subtítulos, interrupción y WebSocket backend.
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
defecto. El proveedor `mock`, el adaptador MCP local y los repositorios JSON
permiten ejecutar el flujo principal y las pruebas sin credenciales.

## Google Login y perfiles de alumnos

Sin `GOOGLE_CLIENT_ID`, la aplicación conserva el modo invitado local. Para
activar cuentas reales, cree un **OAuth 2.0 Client ID** de tipo **Web
application** en Google Cloud Console y agregue los orígenes autorizados, por
ejemplo `http://localhost:8000` y la URL HTTPS de producción. Después configure:

```dotenv
GOOGLE_CLIENT_ID=000000000000-example.apps.googleusercontent.com
APP_SESSION_SECRET=un-secreto-aleatorio-de-al-menos-32-bytes
APP_AUTH_SESSION_DAYS=7
APP_AUTH_COOKIE_SECURE=false
APP_STUDENT_PROFILES_BACKEND=local
APP_STUDENT_PROFILES_PATH=.data/student_profiles.json
```

Use `APP_AUTH_COOKIE_SECURE=true` detrás de HTTPS. En Cloud Run seleccione
`APP_STUDENT_PROFILES_BACKEND=firestore` y guarde `APP_SESSION_SECRET` en Secret
Manager. La cuenta se verifica en FastAPI con las llaves públicas de Google; la
sesión posterior vive en una cookie `HttpOnly` y `SameSite=Lax`.

El perfil guarda únicamente identificador interno, nombre, correo, foto y
marcas de alta/último acceso. El identificador se deriva del `sub` estable de
Google, no del correo. Cuando Login está activo, cualquier `student_id` enviado
por el navegador se ignora: progreso, rutas, chat y conversaciones pertenecen a
la identidad verificada por el servidor.

## Ejecutar el servidor MCP

```bash
python -m mcp_learning_server.server
```

Verificación rápida:

```bash
curl http://localhost:8001/health
```

También puede conectar MCP Inspector a `http://localhost:8001/mcp/`.

En otra terminal inicie la aplicación:

```bash
python -m agent_app.api.main
```

Abra `http://localhost:8000`. Por defecto se usan proveedor `mock` y adaptador
MCP local para que la demo arranque sin credenciales. Para probar dos procesos,
configure `MCP_USE_LOCAL_ADAPTER=false`.

## Conversación por voz

El botón de micrófono abre una conversación continua con Gemini Live. El modo
incluye subtítulos por turno, indicador de actividad, silencio del micrófono,
finalización accesible por teclado y cancelación inmediata del audio cuando el
alumno interrumpe. Si existe una conversación de texto activa, el backend aporta
al modelo su tema, actividad pendiente y última explicación sin exponer la API
key al navegador.

Configure `MODEL_PROVIDER=gemini` y una de estas opciones: `GOOGLE_API_KEY`, o
`GOOGLE_GENAI_USE_VERTEXAI=true` junto con `GOOGLE_CLOUD_PROJECT`. La voz y el
modelo Live se seleccionan con `GEMINI_LIVE_VOICE` y, opcionalmente,
`GEMINI_LIVE_MODEL`. Si no se define el modelo, la aplicación usa
`gemini-2.5-flash-native-audio-preview-12-2025` con Gemini Developer API y
`gemini-live-2.5-flash-native-audio` con Vertex AI. Un override debe ser un
identificador Live válido para el backend elegido. Sin las credenciales del
backend, `/api/capabilities` no anuncia la voz. En
producción el sitio debe servirse por HTTPS para que el navegador permita el
micrófono; `localhost` también se considera un contexto seguro.

En Vertex AI, `GOOGLE_CLOUD_LOCATION` configura el modelo de texto y
`GOOGLE_CLOUD_LIVE_LOCATION` el modelo de voz. Los valores predeterminados son
`us` para `gemini-3.5-flash-lite` y `us-central1` para
`gemini-live-2.5-flash-native-audio`, porque ambos modelos tienen distinta
disponibilidad regional.

La aplicación expone `GET /api/topics` para consultar el
catálogo, la ruta y el estado del estudiante. La respuesta incluye
`total_topics`, una recomendación explicada y el estado de cada tema
(`blocked`, `available`, `in_progress` o `completed`). Los prerrequisitos
orientan la ruta, pero no impiden estudiar un tema fuera del orden sugerido.
Cada tema identifica su `subject` (`artificial-intelligence` o `english`).
Cada elemento evaluado incluye además su progreso con nivel, mejor puntaje,
intentos y conceptos dominados o pendientes. Consulte la
[guía del currículo de inglés](docs/english-curriculum.md) para su enfoque
pedagógico, progresión y límites actuales.

La aplicación persiste el historial en `APP_SESSIONS_PATH` y ofrece
`GET /api/sessions` para recuperar conversaciones. En modo autenticado, el
navegador guarda sólo el identificador activo; mensajes, tema y evaluación pendiente se
sincronizan con el backend. `PATCH /api/sessions/{id}` permite renombrar o
archivar y `DELETE /api/sessions/{id}` elimina de inmediato. La retención
predeterminada es de 365 días.

Los clientes nuevos incluyen un `request_id` único
en cada `POST /api/chat`; Local y Firestore deduplican los reintentos y devuelven
la respuesta persistida, por lo que dejar de esperar en el navegador no crea un
segundo turno ni una segunda llamada al modelo. El campo es opcional para
mantener compatibilidad con clientes anteriores.

Estos registros idempotentes caducan a las 24 horas
(`CHAT_REQUEST_RETENTION_HOURS`), que cubre de sobra un reintento del navegador.
El backend local los purga al leerlos y el de Firestore los retira en cuanto se
consultan. Para que Firestore además los borre por su cuenta, habilite una vez
la política TTL sobre el campo `expires_at` —que se escribe como Timestamp
nativo justamente para eso:

```bash
gcloud firestore fields ttls update expires_at \
  --collection-group=learning_sessions_chat_requests \
  --enable-ttl
```

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
tutor. Los borradores no forman parte del corpus hasta que se publican.

`GET /health` comprueba la vida del proceso y `GET /ready` valida que Agent
App pueda consultar el catálogo MCP. `GET /api/observability` entrega métricas
agregadas sin contenido del estudiante. El panel **Operación** muestra
peticiones, tasa de error, latencia p95, llamadas al modelo, tokens estimados,
costo y actividades completadas. Configure las tarifas vigentes mediante:

```dotenv
MODEL_INPUT_COST_PER_MILLION_USD=0
MODEL_OUTPUT_COST_PER_MILLION_USD=0
```

Con ambos valores en cero se mide consumo sin atribuir un costo. Las métricas
se mantienen en memoria y son locales a cada instancia. En Cloud Run, donde
`learning-agent` admite hasta tres instancias, el panel muestra sólo los datos
de la instancia que atiende esa petición, no el total agregado del servicio. Los
valores también se reinician al reemplazar o reiniciar una instancia.

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

Compose toma `MODEL_PROVIDER` y las credenciales desde `.env`. Para el panel de
autoría, toma `AUTHORING_TOKEN` como valor de origen y lo asigna a
`APP_AUTHORING_TOKEN` y `MCP_AUTHORING_TOKEN` dentro de los dos servicios. Fuera
de Compose, configure directamente las dos variables con el mismo secreto.

Para usar Google AI Studio dentro del contenedor:

```dotenv
MODEL_PROVIDER=gemini
GOOGLE_GENAI_USE_VERTEXAI=false
GOOGLE_API_KEY=su-api-key
# GEMINI_LIVE_MODEL=gemini-2.5-flash-native-audio-preview-12-2025
```

Para usar Vertex AI con las credenciales locales de `gcloud`, cree ADC y use el
archivo Compose adicional. La credencial se monta como sólo lectura y nunca se
copia al repositorio ni a la imagen:

```bash
gcloud auth application-default login
docker compose -f docker-compose.yml -f docker-compose.gcp.yml up --build
```

El montaje busca ADC en `$HOME/.config/gcloud/application_default_credentials.json`.
Defina `GCP_ADC_PATH` en `.env` únicamente si el archivo vive en otra ruta. Para
Vertex AI, configure `MODEL_PROVIDER=gemini`, `GOOGLE_GENAI_USE_VERTEXAI=true` y
`GOOGLE_CLOUD_PROJECT`. Cloud Run fija explícitamente
`gemini-live-2.5-flash-native-audio`; puede reemplazarlo mediante la variable
`GEMINI_LIVE_MODEL` al ejecutar `infra/cloudrun/deploy.sh`.

Las operaciones de texto que invocan al modelo se limitan por alumno mediante
`MODEL_RATE_LIMIT_REQUESTS_PER_MINUTE` (30 por minuto por defecto; `0` lo
desactiva). Las conexiones de voz usan un contador de sesiones activas separado:
`VOICE_MAX_CONCURRENT_SESSIONS_PER_STUDENT` permite una sesión simultánea por
alumno de forma predeterminada. Ambos límites viven en memoria y se aplican por
instancia, por lo que el techo efectivo crece con el número de instancias.

La dirección `MCP_SERVER_URL` se configura internamente como
`http://mcp-server:8080/mcp/`, aunque el servidor MCP se publique en el puerto
`8001` del host.

## Despliegue en Cloud Run

`infra/cloudrun/deploy.sh` es la **única fuente de la configuración de los dos
servicios**: no hay manifiestos declarativos y el script nunca ejecuta
`gcloud run services replace`. Es manual, genera costos reales y debe ejecutarse
sólo tras revisar proyecto, región, cuotas y presupuesto.

El script también crea, de forma idempotente, lo que los servicios necesitan:
APIs habilitadas, base Firestore `(default)`, repositorio de Artifact Registry,
las dos cuentas de servicio con sus roles (`datastore.user`, `aiplatform.user`)
y el secreto `learning-agent-session-secret` con su enlace
`secretmanager.secretAccessor`.

Configuración efectiva de cada servicio (los valores marcados como *default* no
los fija el script; son los predeterminados de Cloud Run):

| Ajuste | `learning-mcp` | `learning-agent` |
|---|---|---|
| Imagen | `…/${REPOSITORY}/mcp-server:${TAG}` | `…/${REPOSITORY}/agent-app:${TAG}` |
| Cuenta de servicio | `learning-mcp@${PROJECT_ID}` | `learning-agent@${PROJECT_ID}` |
| Acceso | `--no-allow-unauthenticated`; sólo `learning-agent` tiene `run.invoker` | `--allow-unauthenticated` (público) |
| Instancias | 0 – 100 (*default*) | 0 – 3 (`--max-instances 3`) |
| Concurrencia | 80 (*default*) | 40 (`--concurrency`) |
| Timeout de request | 300 s (*default*) | 3600 s (el WebSocket de voz supera los 5 min) |
| CPU / memoria | 1 vCPU / 512 MiB (*default*) | 1 vCPU / 512 MiB (*default*) |
| Sondas | startup y liveness `GET /health` | startup y liveness `GET /health` |
| Secretos | — | `APP_SESSION_SECRET` desde Secret Manager (`:latest`) |

Los defaults de memoria bastan: en reposo el agent-app consume ~84 MiB y el
mcp-server ~48 MiB.

Variables de entorno que fija el despliegue:

| Servicio | Variables |
|---|---|
| `learning-mcp` | `MCP_PROGRESS_BACKEND=firestore`, `GOOGLE_CLOUD_PROJECT`, `FIRESTORE_PROGRESS_COLLECTION=student_progress`, `MCP_ALLOWED_HOSTS` |
| `learning-agent` | `MODEL_PROVIDER=gemini`, `GOOGLE_GENAI_USE_VERTEXAI=true`, `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION`, `GOOGLE_CLOUD_LIVE_LOCATION`, `GEMINI_MODEL`, `GEMINI_LIVE_MODEL`, `GEMINI_LIVE_VOICE`, `APP_SESSIONS_BACKEND=firestore`, `FIRESTORE_SESSIONS_COLLECTION=learning_sessions`, `APP_SESSION_RETENTION_DAYS=365`, `APP_STUDENT_PROFILES_BACKEND=firestore`, `FIRESTORE_STUDENT_PROFILES_COLLECTION=student_profiles`, `GOOGLE_CLIENT_ID`, `APP_AUTH_COOKIE_SECURE=true`, `MCP_USE_LOCAL_ADAPTER=false`, `MCP_SERVER_URL`, `MCP_AUTHORING_URL`, `MCP_TIMEOUT_SECONDS`, `MCP_AUTH_AUDIENCE` |

Cloud Run depende deliberadamente de los defaults de la aplicación para
`MODEL_RATE_LIMIT_REQUESTS_PER_MINUTE=30` y
`VOICE_MAX_CONCURRENT_SESSIONS_PER_STUDENT=1`; `deploy.sh` no los duplica. Docker
Compose sí los expone con esos mismos defaults para facilitar ajustes locales.

`MCP_ALLOWED_HOSTS` se aplica en un segundo paso (`gcloud run services update`)
porque el dominio del MCP sólo se conoce después de su primer despliegue; sin
él, la protección anti DNS-rebinding de FastMCP responde `421 Misdirected
Request`. Por la misma razón `learning-mcp` se despliega antes que
`learning-agent`, que recibe la URL resultante en `MCP_SERVER_URL`,
`MCP_AUTHORING_URL` y `MCP_AUTH_AUDIENCE`.

Variables del script que puede sobrescribir en el entorno: `PROJECT_ID`,
`GOOGLE_CLIENT_ID` y `APP_SESSION_SECRET` (obligatorias), más `REGION`,
`FIRESTORE_LOCATION`, `REPOSITORY`, `TAG`, `SESSION_SECRET_NAME`,
`MCP_TIMEOUT_SECONDS`, `GEMINI_MODEL`, `GEMINI_LIVE_MODEL`, `GEMINI_LIVE_VOICE`,
`GEMINI_LOCATION` y `GEMINI_LIVE_LOCATION`.

Tras el despliegue, `infra/cloudrun/smoke-test.sh` verifica el servicio público,
incluidos `/health`, la conexión de Agent App con el MCP mediante `/ready`, las
capacidades y las rutas de React, sin crear recursos. La comprobación de voz es
opcional: use `EXPECT_VOICE=1` cuando el despliegue deba publicar esa capacidad.

## Herramientas MCP

- `get_student_progress(student_id)`
- `search_learning_content(topic, level, limit=3)`
- `get_learning_path(student_id)`
- `save_learning_result(student_id, topic, score, feedback, recommendation, mastered_concepts, pending_concepts)`
- `find_practical_example(topic, programming_language)`
- `list_available_topics()`

## Documentación

La documentación vigente incluye el
[currículo de inglés](docs/english-curriculum.md), el plan de
[Google Login y perfiles](docs/google-auth-student-profiles-plan.md) y el
[plan de migración a React](docs/react-frontend-migration-plan.md).

La evolución de la interfaz se organiza en el
[plan de migración a React](docs/react-frontend-migration-plan.md), con una
sesión independiente por fase y convivencia gradual con la UI vigente.

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

Las ocho fases de producto están completadas. La referencia consolidada está en
la [hoja de ruta](docs/product-roadmap.md) y la navegación de toda la
documentación en el [índice de `docs/`](docs/README.md).

## Capacidades

- 27 temas y 58 lecciones curriculares, con fuente, materia, nivel y metadatos.
- Dos materias: inteligencia artificial e inglés.
- Inglés escrito con saludos, vocabulario, gramática y conversación en tres niveles.
- Ingestión, almacenamiento y recuperación separados.
- RAG léxico local, determinista y sin servicios externos.
- Repositorio JSON atómico para progreso y evaluaciones.
- Seis herramientas MCP y un recurso de catálogo.
- Streamable HTTP sin estado en `http://localhost:8001/mcp/`.
- Health checks en `/healthz` y `/readyz`.
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

## Documentación

Consulte el [índice de documentación](docs/README.md) para navegar la
arquitectura, la hoja de ruta completada, las guías de cada capacidad, el guion
de demo y el despliegue.

La evolución de la interfaz se organiza en el
[plan de migración a React](docs/react-frontend-migration-plan.md), con una
sesión independiente por fase y convivencia gradual con la UI vigente.

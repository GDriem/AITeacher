> Estado vigente 21/10/2026: Tutor y Summary funcionan con Vertex federado en
> Azure, revisión `0000009`. Dos turnos contextuales, fuentes de la publicación
> activa, mensaje guardado y resumen persistente verificados con Google real.
> [Evidencia y pendientes](../docs/azure-tutor-enablement.md). Segunda cuenta,
> fallo/recuperación operativos y voz humana siguen pendientes; voz deshabilitada.

# Tutor y apuntes — hito 4

Actualización de beta, 20 de octubre de 2026: React dispone de un modo .NET
con lectura/práctica/chat, fuentes y apuntes, verificado con navegador y
PostgreSQL reales. La descripción original de abajo conserva el alcance inicial.
El escritor productivo todavía no ha cambiado. Se añadió el adaptador `vertex`
con OAuth/ADC; `azure` y `gemini` conservan su autenticación por clave.

Para reutilizar el proyecto GCP sin API key:

```sh
export AI__Capabilities__Tutor__Provider=vertex
export AI__Capabilities__Tutor__Model=gemini-3.5-flash-lite
export AI__Capabilities__Tutor__StructuredOutput=true
export AI__Providers__vertex__Endpoint=https://aiplatform.googleapis.com/
export AI__Providers__vertex__Project=gen-lang-client-0364164089
export AI__Providers__vertex__Location=global
```

El adaptador usa Application Default Credentials con scope cloud-platform;
Azure requiere configurar explícitamente su identidad federada hacia GCP o el
secreto aprobado, sin copiar credenciales personales dentro de una imagen.
`Summary` se configura por separado. Timeout de 30 segundos incluyendo
obtención del token y lectura de la respuesta. Se mantienen fuentes verificadas,
contexto acotado, ausencia de fallback y logs sin prompts ni credenciales.
El ensayo sintético con el endpoint global fue satisfactorio; `us` lo rechazó.
No se afirma equivalencia ni calidad pedagógica a partir de un smoke.
Referencia: [Vertex generateContent y OAuth](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/start/quickstart).

## Voz en el modo .NET

`GET /api/tutor/voice` informa disponibilidad con sesión. El WebSocket
`/api/tutor/conversations/{id}/voice` exige propietario, publicación vigente y
Origin idéntico al host. React inicia captura con un clic explícito y reutiliza
el worklet PCM servido por el host .NET en `/static/pcm-capture-worklet.js`.

La voz está deshabilitada por defecto. Configuración explícita para Vertex Live:

```sh
export AI__Voice__Enabled=true
export AI__Voice__Project=gen-lang-client-0364164089
export AI__Voice__Location=us-central1
export AI__Voice__Model=gemini-live-2.5-flash-native-audio
export AI__Voice__MaxConcurrentSessions=4
```

Usa ADC y contexto acotado de la unidad/actividad, sin claves privadas ni IDs de
alumno. No persiste audio, transcripciones ni evidencia. Un bloqueo de sesión
PostgreSQL por alumno y un conjunto global de cupos limitan conexiones entre
réplicas; todas deben usar el mismo límite global. Duración máxima 10 minutos,
inicio limitado a 20 segundos. La disponibilidad de cuota de voz no garantiza
capacidad del proveedor. El contrato OpenAPI describe los frames y errores.

Verificación del 20 de octubre: dos turnos sintéticos contra Vertex Live real
desde .NET; audio recibido y descartado. Gateway local: aislamiento de alumnos,
origen, cupos entre hosts, PCM, interrupción de protocolo, cierre y reconexión.
Chromium: micrófono sintético, transcripción y reproducción en React/.NET.
Quedan Google real, micrófono físico e interrupción contra el proveedor real.
No se ha cambiado la ruta de voz productiva Python.

## Contrato inicial del tutor de texto

Contrato implementado, definido antes de desarrollar: API autenticada bajo `/api/tutor`,
CSRF en escrituras, `Cache-Control: no-store`, aislamiento por alumno incluso para
los autores. No cambia el escritor Python ni conecta todavía React.

- `POST /conversations`: `{unitId, mode: chat|reading|practice, activityId?}`.
  Reading/practice exigen el ID de una lectura/ejercicio de la publicación activa.
- `GET /conversations` y `GET /conversations/{id}`: propiedad, versión y paginación.
- `GET /conversations/{id}/messages`: historial persistido paginado, orden secuencial.
- `POST /conversations/{id}/turns`: `{requestId, version, text}`. Respuesta con
  turno, mensaje alumno, respuesta, fuentes y manifiesto. Repetir el mismo cuerpo
  devuelve el turno; reutilizar ID con otro cuerpo o versión obsoleta devuelve 409.
  Solo un turno activo por conversación. Un lease vencido se recupera reenviando
  la misma solicitud. No se promete exactamente una llamada externa tras una caída.
- `POST /notes`: `{kind: student|savedMessage|summary, text?, conversationId?, messageId?}`.
  Student guarda texto del alumno; savedMessage copia un mensaje propio; summary
  genera un resumen acotado de mensajes completados y registra los IDs incluidos.
- `GET /notes` y `GET /notes/{id}`, `PUT /notes/{id}` con `{version,text}`, `DELETE /notes/{id}?version=N`.
  Editar conserva tipo y procedencia; guardar o resumir no genera evidencia de dominio.

Paginación `offset=0`, `limit=50` (máximo 100). Mensajes de entrada hasta 4.000
caracteres, apuntes hasta 12.000. Contexto de tutor limitado a 24.000 caracteres
serializados (cota conservadora de tokens UTF-8), hasta 8 mensajes recientes y
3 fragmentos de lecturas de la publicación activa; incluye objetivos y actividad.
No hay búsqueda vectorial, herramientas con efectos ni corrección de evaluaciones.
Las fuentes son referencias verificadas, no una garantía automática de la veracidad
semántica de la respuesta. Se vuelve a comprobar vigencia antes de guardar la respuesta.
Los mensajes y fuentes históricos se conservan al retirar o sustituir una publicación;
no se recuperan para nuevos prompts fuentes retiradas. Una nueva publicación exige
crear otra conversación para que la actividad y su revisión no cambien silenciosamente.

Capacidades independientes `Tutor` y `Summary`, cada una con `Provider`, `Model`,
`ConfigurationVersion`, `StructuredOutput`. Proveedores `disabled` (predeterminado),
`mock` explícito para desarrollo, `azure`, `gemini`. Sin fallback entre proveedores.
Azure usa Chat Completions v1; Gemini generateContent v1beta. Solo salida JSON
validada `{text,sourceIds}`; no streaming/audio/tools en este adaptador. Timeout
30 segundos, sin reintentos HTTP automáticos, salida 2.048 tokens. Secretos por
entorno; no se envían tokens Google, correos ni IDs de alumno a proveedores.

## Configuración

Ejemplo local explícito; el mock solo está permitido en Development:

```sh
export AI__Capabilities__Tutor__Provider=mock
export AI__Capabilities__Tutor__Model=mock-tutor-v1
export AI__Capabilities__Tutor__StructuredOutput=true
export AI__Capabilities__Summary__Provider=mock
export AI__Capabilities__Summary__Model=mock-summary-v1
export AI__Capabilities__Summary__StructuredOutput=true
```

Para usar proveedores reales, elegir `azure` o `gemini` por capacidad y fijar su
`Model` (deployment Azure o nombre Gemini) y `ConfigurationVersion`. Habilitar
`StructuredOutput` únicamente para deployments que soporten el contrato. Configurar
`AI__Providers__azure__Endpoint=https://<recurso>.openai.azure.com/` y
`AI__Providers__azure__ApiKey` o
`AI__Providers__gemini__Endpoint=https://generativelanguage.googleapis.com/` y
`AI__Providers__gemini__ApiKey`. El endpoint es la raíz, sin `/openai/v1` ni
`/v1beta`; un prefijo adicional permite simulaciones locales. HTTPS es obligatorio
salvo loopback en Development. El cliente no sigue redirects ni hace reintentos.
Nunca guardar las claves en Git. No se configura un modelo real predeterminado.

`ConfigurationVersion`, proveedor/modelo y manifiesto se fijan en cada turno;
la recuperación de un turno conserva esa selección. Un cambio de secretos o
endpoint debe mantener compatibilidad con los turnos pendientes antes de retirar
la configuración anterior. Se registran latencia y tokens cuando el proveedor
los informa, sin texto ni identidad del alumno. No hay tarifas configuradas ni
estimación de costo; los tokens reportados no son un cálculo de facturación.

## Reproducir pruebas

Con PostgreSQL de `compose.yaml`, iniciar en otra terminal, desde la raíz:

```sh
/Users/gadiorellana/.local/bin/postman simulation run postman/simulations/tutor.sim.yaml --port 4900 --no-history --output ndjson
```

Después, desde `backend/`:

```sh
export AITEACHER_TEST_POSTGRES='Host=127.0.0.1;Port=55432;Database=postgres;Username=aiteacher;Password=aiteacher-local'
export AITEACHER_TEST_AI_URL=http://127.0.0.1:4900
dotnet build AITeacher.slnx
dotnet test AITeacher.slnx --no-build
```

Las simulaciones comprueban forma, autenticación y límites de los requests. Se
basan en [Azure Chat Completions v1](https://learn.microsoft.com/en-us/rest/api/microsoft-foundry/azureopenai/chat)
y [Gemini generateContent](https://ai.google.dev/api/generate-content), con
[autenticación Gemini por cabecera](https://ai.google.dev/gemini-api/docs/api-key).
Orbit aportó una referencia inicial de Gemini JSON mode (modelo antiguo y ejemplo
con clave en query); la implementación usa las referencias oficiales actuales,
modelo configurable y clave en cabecera. La búsqueda de mocks del propietario se
omitió porque el CLI Postman no tiene sesión iniciada. Los mocks son locales y
no se publicaron. El handler compartido está en `postman/mocks/ai-providers/`.
Los fixtures no sustituyen el HttpClient: Azure/Gemini recorren HTTP real hacia
las simulaciones y PostgreSQL real. Google sigue usando su puerto de prueba.

Los casos incluyen respuestas correctas, 429, gateway HTML, salida sin candidatos,
fuente inventada, puerto inaccesible y timeout real de 30 segundos, además de
leases vencidos y respuestas tardías descartadas. Las pruebas crean y eliminan
solo su base temporal. Detener la simulación con Ctrl+C; nunca guardar sus logs
con contenidos de usuarios reales en Git.

Para ensayo manual autenticado, usar `postman/collections/AITeacher Backend/api/tutor`
con el flujo Google/CSRF existente y una unidad publicada. Crear conversación,
enviar turno, consultar mensajes y crear apuntes. `turnRequestId` y
`turnRequestVersion` se conservan para reenviar exactamente el mismo turno; vaciar
`turnRequestId` para iniciar otro con la última `conversationVersion`. Las notas
no son idempotentes: repetir su creación crea otra nota.

## Límites de aceptación

La regresión HTTP prueba estos contratos y el manejo de fallos, no la calidad
pedagógica de modelos reales. Quedan pendientes credenciales y deployments reales,
regresión pedagógica por modelo, Google real y conexión React. No hay streaming,
voz, embeddings, RAG global, worker, herramientas con efectos ni migración de datos.
El historial completo se conserva en SQL; solo entra una ventana en los prompts.
Los resúmenes son apuntes explícitos, no memoria automática del tutor. La lectura
y práctica se conectan al chat por IDs editoriales; no corrigen intentos del hito 3.

## Recuperar un turno después de recargar

`GET /api/tutor/conversations/{id}/pending-turn` permite al alumno propietario
recuperar `{ request: { requestId, version, text }, leaseUntil }`; ambos campos son
`null` si no hay reserva pendiente. La respuesta lleva `Cache-Control: no-store`
y devuelve 404 a otras cuentas, incluido el autor. No devuelve tokens de lease.
React consulta esta operación al retomar y ofrece **Recuperar mensaje pendiente**.
Se reenvía el cuerpo original sin cambiar la versión por la versión reservada.
Antes de vencer el lease se mantiene el 409; después se reclama la misma reserva.
El fencing por token descarta respuestas tardías y la solicitud idempotente no
inserta un segundo mensaje del alumno. No requiere migración de datos.

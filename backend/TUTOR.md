# Tutor y apuntes — hito 4

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

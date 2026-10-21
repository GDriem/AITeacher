# Backend .NET de AITeacher

Implementación incremental del [plan aprobado](../docs/backend-architecture-plan.md).
El host ASP.NET Core se ejecuta separado de FastAPI; React y Python siguen usando
sus contratos y escritores actuales. Azure es el destino del despliegue final.

## Estado vigente de la beta, 20 de octubre de 2026

React ya tiene modo .NET: catálogo editorial, unidades/lectura/práctica, evaluaciones
cerradas y abiertas, corrección docente, tutor, apuntes, mapas, repasos e historial.
El despliegue actual sigue usando Python; el nuevo modo se selecciona por build:

```sh
cd frontend
pnpm api:backend:check
pnpm build:backend
# Desarrollo con la API .NET en localhost:5080:
VITE_BACKEND=dotnet pnpm dev
```

En producción el bundle se incorpora a `wwwroot` del host para conservar el mismo
origen de cookies y CSRF. El host sirve el shell de React para rutas de navegación;
no convierte rutas API, WebSocket, health o assets inexistentes en páginas HTML.
El pipeline de imágenes y el proxy Azure todavía deben prepararse y verificarse.

Para la regresión reproducible con PostgreSQL local y dependencias de frontend
instaladas (sin cuenta Google ni modelos reales):

```sh
export AITEACHER_TEST_POSTGRES='Host=127.0.0.1;Port=55432;Database=postgres;Username=aiteacher;Password=aiteacher-local'
.venv/bin/python backend/scripts/run-local-checks.py
```

Ejecutar ese comando desde la raíz del repositorio. Arranca su simulación Postman,
ejecuta .NET, lint de contratos/colecciones, 26 aserciones smoke sobre HTTP y
cinco recorridos Chromium sobre una base aleatoria. Cierra sus procesos y elimina las bases de
prueba. Google se sustituye únicamente en `backend/tests/AITeacher.BrowserHost`;
ese ejecutable no es un destino de despliegue. La CI contiene el mismo recorrido,
sin credenciales cloud ni publicación a un workspace Postman; todavía no se ha
observado una ejecución de GitHub Actions de estos cambios.

Se ensayaron exportación real de Firestore, importación repetida, conciliación y
reversión sobre 128 documentos, sin diferencias ni modificaciones del origen.
Vertex .NET y Gemini Live Python/.NET respondieron a entradas sintéticas reales.
React/.NET incluye voz autenticada con captura de micrófono sintético comprobada;
los límites por alumno y globales usan bloqueos PostgreSQL entre réplicas.
Detalle y límites en [MILESTONE7.md](MILESTONE7.md). El hito 7 sigue abierto por
continuidad editorial, Google real, micrófono físico/interrupción reales y Azure.
La calibración se pospone hasta reunir datos de beta; se conserva `uncalibrated`.
El historial de entregas y resultados anteriores se conserva debajo; este apartado
es el estado más reciente.

## Ejecutar los hitos 1–7 (hitos 6 y 7 parciales)

Desde `backend/`, con Docker y el SDK fijado en `global.json`:

```sh
docker compose up -d --wait
export ConnectionStrings__Postgres='Host=127.0.0.1;Port=55432;Database=aiteacher;Username=aiteacher;Password=aiteacher-local'
dotnet restore AITeacher.slnx
dotnet build AITeacher.slnx --no-restore
dotnet run --project src/AITeacher.Api --no-build -- --migrate
dotnet run --project src/AITeacher.Api --no-build
```

Las credenciales de Compose sirven únicamente para la base local. El puerto
PostgreSQL se publica en loopback. `docker compose down` conserva el volumen.
La API escucha en `http://localhost:5080` mediante el perfil Development.
`--migrate` aplica las migraciones y termina; el host normal nunca las aplica
por sí solo. Cada módulo conserva su esquema e historial de migraciones.

- `GET /health`: vida del host, independiente de PostgreSQL.
- `GET /health/ready`: conectividad PostgreSQL y migraciones aplicadas.
- [Contrato OpenAPI](openapi.yaml): interfaz implementada, permisos y errores.

## Google, sesiones y autorización

Configure mediante variables de entorno o un almacén de secretos:

```sh
export Authentication__GoogleClientId='<OAuth Web Client ID>'
export Authentication__AuthorGoogleSubjects__0='<sub Google del primer autor>'
```

El Client ID corresponde al usado por Google Identity Services en el navegador.
Los autores se identifican por el `sub` verificado, nunca por correo ni por un rol
enviado por el cliente. Sin Client ID, login devuelve `503`; no existe acceso
invitado ni un bypass de autenticación en este host. Sin autores configurados,
ningún alumno puede editar. Cambiar la lista de autores afecta la próxima solicitud.

Flujo para un cliente del mismo origen, conservando cookies:

1. `GET /api/auth/csrf`: guardar `requestToken`.
2. `POST /api/auth/google` con JSON `{"credential":"<Google ID token>"}` y
   cabecera `X-CSRF-TOKEN: <requestToken>`.
3. Volver a obtener `/api/auth/csrf` después de iniciar sesión o cambiar de usuario.
   El token CSRF queda vinculado a la identidad autenticada.
4. `GET /api/auth/me` devuelve el perfil actual. Enviar el token CSRF en todas las
   escrituras, incluido `POST /api/auth/logout`.

La cookie `ait_dotnet_session` es HttpOnly, SameSite=Lax, Path=/api y Secure
fuera de Development. Es distinta de la cookie Python. La sesión dura siete días,
se guarda únicamente su hash SHA-256 y logout la revoca en PostgreSQL. Login con
una cookie anterior revoca esa sesión antes de emitir otra. El ID del alumno
conserva el algoritmo Python: `google-` más los primeros 32 caracteres hexadecimales
minúsculos de SHA-256 del `sub`. Cambiar el correo no cambia esa identidad.

El adaptador usa `Google.Apis.Auth` para verificar firma, emisor, audiencia y
vigencia; exige correo verificado y perfil mínimo. La espera está limitada a
15 segundos y no hay fallback de identidad. Login admite 20 solicitudes por minuto
por IP en cada instancia. No se ha habilitado CORS; para React se usará un proxy
al mismo origen. La conexión de React a este host queda pendiente. Producción
requiere HTTPS; la configuración del proxy Azure se realizará al preparar el corte.

Referencia: [verificación de ID tokens de Google](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token).

## Catálogo

`/api/catalog/{subjects,categories,scales,levels,topics}` admite:

- `GET`: lista paginada `{items,total,offset,limit}`. `offset=0`, `limit=50` por
  defecto; máximo 100. Orden por `sortOrder` e ID.
- `GET /{id}`: obtener una entrada.
- `POST`: crear; solo autores.
- `PUT /{id}`: editar nombre, slug, orden y disponibilidad; solo autores.
  Requiere `{version,entry}` con la versión leída; conflictos devuelven `409`.

Las lecturas requieren sesión. Es un catálogo editorial compartido, sin datos de
alumnos. Las listas incluyen entradas no disponibles: `isAvailable` es metadato
editorial, no un límite de autorización. Las referencias a padres y el propósito
de una escala se fijan al crear; no hay borrado físico ni cambio de padre en este
hito. Las unidades y revisiones se exponen en `/api/units`; consulte la [guía editorial](EDITORIAL.md). La recuperación RAG sigue pendiente.

Ejemplo para crear una materia:

```json
{"name":"Matemáticas","slug":"matematicas","sortOrder":0,"isAvailable":true}
```

Las demás creaciones contienen `entry` con esos mismos campos:

```json
{"subjectId":"<uuid>","entry":{"name":"Álgebra","slug":"algebra"}}
```

Una escala requiere `purpose` (`difficulty`, `proficiency` o `mastery`), un nivel
requiere `scaleId` y un tema requiere `subjectId`, `categoryId` y opcionalmente
`levelId`. Son registros editables; los niveles educativos no son enums.

Los slugs son únicos en su ámbito: global para materias/escalas, por materia para
categorías, por escala para niveles y por categoría para temas. PostgreSQL
protege esas restricciones, las referencias y la pertenencia de categoría/materia
de cada tema, incluso ante escrituras concurrentes. Los errores usan ProblemDetails
sin exponer SQL, credenciales o detalles internos de PostgreSQL.

## Organización y dependencias

- `src/AITeacher.Api/Features/Identity`: verificador Google, perfiles, sesiones,
  autenticación y persistencia del esquema `identity`.
- `src/AITeacher.Api/Features/Editorial`: unidades, revisiones inmutables, publicación
  e importación JSON del esquema `content`.
- `src/AITeacher.Api/Features/Assessments`: banco, definiciones, intentos y outbox
  de evidencia del esquema `assessments`; consulte [la guía de evaluaciones](ASSESSMENTS.md).
- `src/AITeacher.Api/Features/Tutor`: conversaciones, turnos, mensajes y apuntes
  privados del esquema `conversations`; [guía de tutor](TUTOR.md).
- `src/AITeacher.Api/Features/Graphs`: referencia editorial y mapas privados del
  esquema `graphs`; [guía de grafos](GRAPHS.md).
- `src/AITeacher.Api/Features/Learning`: consumidor deduplicado de evidencias, conceptos
  sin calibrar y repasos explícitos; [evaluación avanzada](MILESTONE6.md).
- `src/AITeacher.Api/Features/Catalog`: endpoints, DTOs y adaptador EF del esquema
  `curriculum`. Son adaptadores del host; el módulo de dominio sigue independiente.
- `src/AITeacher.Modules.Curriculum`: entradas del catálogo, cobertura editorial
  y reglas de prerrequisitos.
- `src/AITeacher.Modules.Assessments`: preguntas cerradas y corrección determinista.
- `src/AITeacher.Modules.Learning`: evidencias con procedencia y ayudas.
- `tests/AITeacher.Domain.Tests`: reglas de dominio del hito 0.
- `tests/AITeacher.Api.Tests`: integración HTTP y PostgreSQL real de los hitos 1–5.

No se consultan tablas ajenas entre módulos. El SDK .NET 11 RC1 se conserva según
el plan; no es una afirmación de release final. EF Core 10.0.1 y Npgsql EF 10.0.0
se restauraron, compilaron y probaron juntos en este SDK; su major no depende del
major del SDK. [Compatibilidad del proveedor](https://www.npgsql.org/efcore/release-notes/10.0.html).

Para nuevas migraciones, `dotnet tool restore` instala la versión local de EF CLI:

```sh
dotnet tool restore
dotnet ef migrations add Nombre --context CatalogDbContext --project src/AITeacher.Api --output-dir Features/Catalog/Migrations
```

Para identidad use `IdentityDbContext` y `Features/Identity/Migrations`; para
unidades, `EditorialDbContext` y `Features/Editorial/Migrations`; para evaluaciones,
`AssessmentDbContext` y `Features/Assessments/Migrations`; para conversaciones,
`TutorDbContext` y `Features/Tutor/Migrations`; para grafos, `GraphDbContext`
y `Features/Graphs/Migrations`. Para aprendizaje, `LearningDbContext` y
`Features/Learning/Migrations`.

## Verificación

Las pruebas requieren PostgreSQL real. La conexión debe tener permiso CREATEDB:
la suite crea una base aleatoria `aiteacher_test_<uuid>` y elimina solo esa base
al terminar. Nunca limpia la base de la aplicación.

```sh
export AITEACHER_TEST_POSTGRES='Host=127.0.0.1;Port=55432;Database=postgres;Username=aiteacher;Password=aiteacher-local'
export AITEACHER_TEST_AI_URL=http://127.0.0.1:4900
# Iniciar primero postman/simulations/tutor.sim.yaml; instrucciones en TUTOR.md.
dotnet test AITeacher.slnx --no-build
```

Verificación al cierre del hito 5: compilación sin advertencias ni errores; nueve pruebas de
dominio y 52 de integración aprobadas contra PostgreSQL real. Además del catálogo,
identidad, sesiones y CSRF, verifican cobertura de publicación, referencias locales,
ciclos, inmutabilidad SQL, revisiones históricas, aislamiento de borradores y criterios
privados, retiro inmediato, carreras de revisión/publicación e importación de las
82 lecturas con deduplicación y rollback de lotes en conflicto. Se verifican además los tres tipos cerrados, fracciones parciales, selección total,
claves ocultas, feedback privado, límites y vencimiento, aislamiento de intentos,
reintentos y carreras de inicio/entrega, rollback y snapshots inmutables. El hito 4 añade aislamiento y persistencia de conversaciones/apuntes,
leases y respuestas tardías, contexto acotado y regresión HTTP Azure/Gemini
contra simulaciones locales, incluidos fallos y timeout real. El hito 5 añade
grafos con procedencia, correcciones, comparación, extracción Unicode idempotente,
concurrencia, historia SQL inmutable y lista HTML accesible. El smoke Postman
aprobó dieciséis aserciones HTTP contra el host real (código de salida 0). OpenAPI y las
dos colecciones se validaron sin errores ni advertencias.

Las pruebas sustituyen únicamente el puerto de verificación Google con un adaptador de prueba, sin bypass en producción. No
verifican comunicación con Google ni acceso con una cuenta real; ese ensayo queda
pendiente de configurar el Client ID y una cuenta autorizada.

Las [solicitudes Postman](../postman/collections/AITeacher%20Backend) se generaron
desde OpenAPI y se ajustaron para cookies y CSRF. Conserve esos ajustes y scripts
al sincronizar futuras revisiones; los ejemplos de cuerpo requieren IDs reales.
No guarde credenciales Google en Git. Las solicitudes de evaluaciones usan la
unidad publicada del ejemplo editorial y sus IDs de objetivo/concepto. Ejecute
crear pregunta, crear definición, iniciar y entregar; sus scripts capturan los IDs.
`attemptRequestId` se conserva para reintentar; vacíelo para iniciar un intento
nuevo. Envíe una nueva revisión usando el mismo ID de recurso y el número siguiente.
El flujo autenticado se verificó en integración con el puerto Google sustituido;
la colección autenticada se validó estructuralmente, sin ensayo con Google real.

Smoke reproducible contra el host real, sin cuenta Google y sin publicar resultados:

```sh
/Users/gadiorellana/.local/bin/postman spec lint openapi.yaml --issueType=syntax
/Users/gadiorellana/.local/bin/postman collection lint '../postman/collections/AITeacher Backend Smoke'
/Users/gadiorellana/.local/bin/postman collection run '../postman/collections/AITeacher Backend Smoke' --no-report-events
```

## Estado y siguiente entrega

Hitos 1–5 implementados en el backend y verificados localmente. El login Google real sigue
pendiente de Client ID y cuenta autorizada; no se usa un bypass en producción.
El [hito editorial](EDITORIAL.md) incluye unidades, objetivos, lectura, práctica,
evaluaciones editoriales privadas, revisiones, cobertura e importación del corpus.
La importación real se ensayó únicamente en una base temporal de pruebas.

El [hito 3](ASSESSMENTS.md) incluye banco y definiciones inmutables, intentos
persistidos, corrección cerrada, protección de claves y entregas idempotentes.
El outbox guarda evidencia transaccional; el incremento del hito 6 incorpora su
consumidor de Aprendizaje y mantiene el dominio sin calibrar. El [hito 4](TUTOR.md) agrega conversaciones y apuntes privados persistidos,
contexto acotado, lectura/práctica/chat vinculados a publicaciones, fuentes
verificadas y adaptadores Azure/Gemini seleccionados por capacidad. Sus
regresiones usan HTTP y PostgreSQL reales contra simulaciones locales de IA;
la aceptación con modelos reales y React continúa pendiente. El incremento del hito 6 añade evaluación avanzada con corrección humana. El [hito 5](GRAPHS.md) incluye
grafos editoriales versionados, mapa conversacional privado con procedencia,
extracción léxica explícita, correcciones inmutables, comparación y lista HTML
accesible. React y la extracción semántica por modelos siguen pendientes. El consumidor optativo de evidencia está disponible; migración y calibración
de dominio siguen pendientes.
No se han creado recursos Azure ni se ha modificado Firestore.


## Incremento del hito 6

[Contrato, operación y límites](MILESTONE6.md): respuestas abiertas, casos y
práctica con rúbricas inmutables y corrección por autor; estado `pendingReview`,
feedback protegido, correcciones idempotentes y evidencia transaccional. Nuevo
consumidor recuperable con `Learning__WorkerEnabled=true` o `--consume-evidence`.
Las evidencias y los repasos son privados; completar un repaso exige un intento
nuevo completamente corregido e iniciado después de la fecha programada.
El dominio permanece `uncalibrated` hasta contar con datos docentes reales.
El hito 6 todavía no está cerrado. No hay migración de producción ni recursos Azure.

Verificación más reciente (incremento del hito 6): compilación sin advertencias
ni errores, 9 pruebas de dominio y 57 de integración aprobadas con PostgreSQL real
más simulaciones HTTP de IA; 19 aserciones smoke Postman aprobadas (salida 0).
OpenAPI y ambas colecciones validados sin incidencias. Véase la guía del hito 6
para alcance y aceptación pendiente.


## Incremento del hito 7

[Contrato, ensayo y límites de aceptación](MILESTONE7.md): exportación validada de
mapas JSON Python, archivo histórico privado en PostgreSQL, importación idempotente,
conciliación de huellas/cantidades y reversión transaccional por lote mediante
`--history`. Lecturas paginadas `/api/history` con aislamiento entre alumnos,
sin cuestionarios privados ni reanudación automática de actividades antiguas.
Los resultados históricos no modifican el dominio sin calibrar del hito 6.
Para nuevas migraciones use `HistoryDbContext` y `Features/History/Migrations`.

Validación más reciente: 9 pruebas de dominio, 61 de integración PostgreSQL,
27 Python de exportación/configuración y cupos de voz; 22 aserciones smoke Postman.
El ciclo CLI de importación/repetición/conciliación/reversión se ensayó con datos
sintéticos en una base temporal. Contrato y colecciones validados. No se ha cerrado
el hito 7: faltan datos Firestore reales, continuidad editorial, React y voz real.
Python sigue siendo el escritor de producción y no se han creado recursos Azure.

Ampliación posterior del hito 7: el mismo exportador admite `--firestore-project`
y `--firestore-database`, con colecciones explícitas y una transacción de solo
lectura para conversaciones/progreso. Publica un snapshot completo con permisos
0600 sin sobrescribir archivos; no usa repositorios que purgan sesiones antiguas.
55 pruebas Python aprobadas verifican exportación, SDK sobre gRPC local,
repositorios y regresión de voz. No se accedió a Firestore real ni se repitieron
las pruebas .NET/Postman en esta ampliación. Véanse el comando y la tabla de
aceptación en [MILESTONE7.md](MILESTONE7.md): el hito 7 sigue abierto por datos
reales, continuidad editorial, recorrido React y voz real.

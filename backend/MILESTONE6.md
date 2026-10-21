# Hito 6: contrato de evaluación avanzada

## Aclaración vigente — 21 de octubre de 2026

La interfaz React de pruebas abiertas y corrección humana existe y pasó el
recorrido local .NET/PostgreSQL/Chromium. La referencia antigua a «sin integración
React» más abajo describe el incremento original. El login Google de alumno ya
se verificó en la beta Azure; la autoría y el aislamiento con dos cuentas reales
siguen pendientes. IA/voz en Azure no están configuradas ni aceptadas.

La publicación de 82 lecturas del catálogo no crea rúbricas, objetivos, prácticas
ni evaluaciones y no acredita dominio. Continúan pendientes las muestras docentes
reales, la calibración y la aceptación pedagógica. El hito 6 sigue abierto.
[Estado curricular y evidencia](../docs/curriculum-continuity.md).


Incremento de evaluación con corrección por autor. Los tipos `openResponse`,
`caseAnalysis` y `practicalExercise` usan `scoringPolicy: rubric`, opciones y claves
vacías y una `rubric` obligatoria. La rúbrica queda embebida en la revisión
inmutable de pregunta: `version`, `criteria` (`id`, `description`, `maxPoints`)
y `privateGuidance`. Se conserva para siempre la revisión fijada por el intento.
No se ejecuta código de ejercicios prácticos.

Cada respuesta añade `text` opcional (máximo 20000 caracteres); las preguntas
cerradas rechazan texto y las abiertas rechazan opciones. Omitir una respuesta
abierta equivale a texto vacío y debe corregirse explícitamente.

La entrega de una prueba con abiertas queda `pendingReview`. No publica nota ni
emite evidencia hasta que un autor complete la corrección de todas las abiertas.
Las entregas cerradas conservan el contrato anterior. El autor consulta
`GET /api/assessments/attempts/{id}/review` y entrega
`POST /api/assessments/attempts/{id}/review` con `requestId` y `grades`:
`questionRevisionId`, `criteria` (`criterionId`, `points`) y `feedback`.
Debe incluir exactamente una puntuación por criterio y todas las preguntas
abiertas. La fracción es suma de puntos / suma de máximos. Se rechazan puntos
fuera de rango y feedback vacío. El evaluador queda registrado como autor humano.
No hay evaluador IA ni una política de fallback implícita.

La revisión es final, inmutable y transaccional; se serializa con bloqueo del
intento. El reenvío con mismo requestId y contenido normalizado devuelve el
resultado; cualquier otra corrección devuelve 409. La entrega original permanece
inmutable. El alumno ve puntuaciones y feedback solo si la definición permite
`afterSubmission`, una vez corregido el intento completo. No ve rúbricas privadas,
claves, identidad del corrector ni la cola de revisión. Otros alumnos reciben 404.
Todas las escrituras requieren sesión y CSRF; la revisión requiere rol de autor.

## Dominio y repasos

Las políticas de dominio requieren datos reales etiquetados y evaluación de
calibración. No hay datos aprobados en este repositorio y no se fijan umbrales por
intuición. Esta entrega no acredita dominio ni cierra la aceptación de calibración
del hito 6. El consumidor durable y los repasos explícitos se incluyen abajo. Quedan
calibración con datos reales y aceptación pedagógica.

## Evidencias y repasos explícitos

Un consumidor local habilitado con `Learning:WorkerEnabled=true` copia lotes de
outbox a `learning.evidence`, deduplica por ID de evento y confirma después de
persistir. Si cae antes de confirmar, el reintento conserva la misma evidencia.
Sin habilitarlo se puede ejecutar `--consume-evidence` tras aplicar migraciones.
Los endpoints no dependen de que el worker esté activo.

`GET /api/learning/evidence?offset=0&limit=50` devuelve evidencia solo del alumno.
`GET /api/learning/concepts` agrupa evidencia por revisión editorial/concepto y
expone `masteryStatus: uncalibrated`. Una media de puntuaciones no acredita dominio.

`POST /api/learning/reviews` permite al alumno programar un repaso explícito con
`requestId`, `evidenceId`, `definitionRevisionId` y `dueAt` futuro (máximo un año).
La definición debe evaluar el mismo concepto y revisión editorial de la evidencia.
`GET /api/learning/reviews` lista sus repasos. Para completarlo se envía
`POST /api/learning/reviews/{id}/complete` con `attemptId`; el intento debe ser
propio, de esa definición, iniciado desde la fecha prevista y completamente
corregido. No basta marcar una casilla ni una conversación. Repetir la misma
programación o finalización es idempotente; cambiar su contenido devuelve 409.
Los repasos no fijan automáticamente intervalos ni umbrales de dominio.

## Operación local

Aplicar migraciones con `--migrate` antes de arrancar. Se añade una tabla de
correcciones, confirmaciones del outbox y el esquema `learning`; no se actualizan
snapshots históricos. El worker está deshabilitado por defecto:

```sh
export Learning__WorkerEnabled=true
# O consumir el backlog una sola vez, con el host detenido:
dotnet run --project src/AITeacher.Api --no-build -- --consume-evidence
```

El consumidor procesa hasta 100 eventos por lote y sondea cada cinco segundos.
La evidencia se confirma después de persistir; las caídas y consumidores
concurrentes no duplican filas. Un fallo conserva el evento para reintento; el
worker registra el fallo sin contenido sensible. Un evento incompatible bloquea
su lote hasta resolverlo: no existe todavía cola de fallos ni backoff por evento.
No hay transacciones abiertas durante llamadas a proveedores externos.

Para el ensayo manual Postman, usar `Create rubric question` en lugar de la
pregunta cerrada, crear la definición e iniciar el intento con el flujo existente.
Luego `Submit rubric answer`, `Read rubric review` y `Finalize rubric review`.
Conservar `rubricReviewRequestId` entre reintentos; generar un UUID antes de la
primera corrección. Rúbrica de ejemplo con un criterio de dos puntos. Para repasos,
consumir primero evidencias, obtener `evidenceId` y fijar `reviewDueAt` en UTC,
`learningReviewRequestId` UUID y `learningReviewId` con la respuesta de programación.
Estos ejemplos no forman una colección completa ejecutable en orden lineal: las
variantes cerradas y abiertas son recorridos alternativos y requieren Google real.
La colección autenticada tiene validación estructural; el comportamiento se prueba
en integración con PostgreSQL real y Google sustituido por el puerto de pruebas.

## Aceptación pendiente

No hay muestras docentes etiquetadas ni políticas de dominio calibradas. No hay
corrección por modelos reales, ejecución de programas enviados, recomendaciones
automáticas de intervalos, variantes de transferencia ni integración React. La
corrección humana es final; revisar una nota emitida requiere una futura operación
versionada que rectifique también la evidencia, no una edición SQL. El hito 6
permanece abierto. Google real y aceptación de proveedores siguen pendientes.

## Validación local

Validación del incremento del hito 6: compilación sin advertencias ni errores,
nueve pruebas de dominio y 57 de integración aprobadas contra PostgreSQL real.
Cinco casos nuevos (tres tipos de rúbrica, recuperación del consumidor/repasos y
validación/omisiones/correcciones concurrentes) cubren feedback privado, rúbricas
históricas, rollback, idempotencia, permisos/CSRF, aislamiento, inmutabilidad SQL,
caída entre persistencia/confirmación y finalización de repasos con un intento nuevo.
Se conservó la regresión HTTP Azure/Gemini contra simulaciones locales. Postman
aprobó 19 aserciones smoke contra el host HTTP y base temporal, salida 0; OpenAPI
y ambas colecciones validaron sin incidencias. Se verificaron las migraciones y
el comando de consumo local. Google se sustituye solo en integración; modelos
reales y flujo autenticado Postman no se ensayaron. No hay datos de calibración.

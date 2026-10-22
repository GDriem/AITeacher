> Estado vigente del tutor, 21/10/2026: Vertex con federación Azure → Google
> habilitado en revisión `0000009`; texto, fuentes y Summary/apuntes verificados
> con Google real. Identidad, red y SQL sin cambios. [Evidencia](azure-tutor-enablement.md).
> Segunda cuenta/autoría, recuperación de fallos, voz y aceptaciones 6/7/8 abiertas.

# Backend de AITeacher: arquitectura y ejecución

## Estado curricular vigente — 21 de octubre de 2026

La beta México ya contiene el currículo original: 3 materias, 9 categorías,
35 temas y 82 lecturas publicadas, con 3 niveles originales y 42 relaciones
entre temas conservadas en el manifiesto versionado. Conciliación y repetición
reales sin diferencias ni duplicados; navegación por materia/categoría/tema/nivel
verificada con Google de alumno en Chrome real. No se migraron datos de alumnos.

Se añade material explícito `reading`, publicable sin inventar objetivos o
actividades: exige lecturas válidas y prohíbe conceptos/objetivos/ejercicios/pruebas.
`learningUnit` mantiene su cobertura completa. Las revisiones y publicaciones
siguen inmutables. El nivel de cada lectura se conserva como procedencia pública
acotada; no se asigna un nivel único artificial a todo el tema ni se infiere dominio.
Las relaciones entre temas son orientación original, no puertas de progreso.

IA/voz de la beta siguen sin configurar y su aceptación está abierta. También
siguen abiertos equivalencias de actividades, proyectos, recomendaciones
adaptativas, Google de autor/dos cuentas reales, calibración, restauración y corte.
Los hitos 6/7 no se cierran. [Evidencia vigente](curriculum-continuity.md).
Las descripciones con fecha anterior se conservan como historia de implementación.


Estado: dirección aprobada por el usuario; implementación incremental.
Este documento incluye las ampliaciones aprobadas de evaluaciones, unidades
editoriales, apuntes y grafos. Es la referencia para las entregas del backend.
Actualización aprobada: Azure será el destino principal de infraestructura,
aprovechando los créditos disponibles, con proveedores de IA mixtos.

## Continuación vigente — 20 de octubre de 2026

La salida acordada es una beta pública en Azure. El usuario confirmó que todavía
no hay muestras docentes para calibrar dominio; esa validación se hará cuando
existan, manteniendo `uncalibrated` y sin inventar umbrales. Esto no elimina la
validación técnica de Google, aislamiento, proveedores, datos y reversión.

Entregas de esta continuación:

- Ensayo autorizado con Firestore real: 128 documentos (111 conversaciones,
  312 mensajes, 17 progresos y 31 evaluaciones históricas). Importación repetida
  y conciliación de IDs/propietarios/huellas/cantidades sin diferencias. Reversión
  idempotente conserva otro lote; reactivar el lote revertido se rechaza. Base
  aleatoria de ensayo eliminada, snapshot privado 0600 fuera de Git. No hubo
  congelación de producción; se requiere un snapshot nuevo al corte.
- Modo React `.NET` por build, con tipos OpenAPI y CSRF. Catálogo/unidad editorial,
  publicación, lectura/práctica, evaluaciones cerradas y abiertas, corrección
  docente, tutor, apuntes, grafos con corrección, repasos e historial privado.
  Listas nuevas de intentos propios y entregas para autores evitan IDs manuales
  sin exponer respuestas, puntuaciones ni identidades en sus metadatos.
- Recorrido Chromium aprobado contra HTTP/.NET/PostgreSQL reales, con Google
  sustituido solo en el host de pruebas y proveedores IA simulados por HTTP.
  Incluye dos alumnos y autoría; WCAG A/AA y 2.1 AA sin infracciones a
  320/768/1024/1440px, sin desbordamientos ni errores de página.
- Adaptador Vertex OAuth/ADC en .NET con fuentes y salida validadas. Smoke
  real sintético aprobado con endpoint global y modelo configurado. Puente
  Python de Gemini Live real: dos turnos y reconexión aprobados. El nuevo protocolo
  .NET completó también dos turnos contra Vertex Live real, sin retener audio ni
  transcripciones. Gateway .NET autenticado con contexto de unidad, un cupo por
  alumno y límite global entre réplicas mediante PostgreSQL; aislamiento, audio,
  interrupción de protocolo y reconexión comprobados localmente. Chromium verificó
  captura con micrófono sintético, envío y reproducción en el flujo React nuevo.
  Faltan login Google, micrófono físico e interrupción contra el proveedor real.
- Runner local y job de CI para .NET, PostgreSQL, simulación HTTP Postman,
  lint OpenAPI/colecciones, 25 aserciones smoke y navegador. La ejecución local
  completa pasó; GitHub Actions todavía no se ha ejecutado con estos cambios.

Pendientes que continúan abiertos: continuidad editorial
de actividades antiguas sin inventar equivalencias; micrófono físico e interrupción
con voz real; ingestión durable, originales/Blob, embeddings/pgvector y
evaluación híbrida; streaming; costos de IA por operación; aceptación de contenido
y calidad pedagógica por proveedor; infraestructura Azure, observabilidad,
backup/restauración y corte con conservación de escrituras nuevas en una reversión.
No se declara cerrado el hito 7 ni se han retirado escritores o recursos GCP.

Azure: suscripción activa identificada, precios minoristas consultados y restricciones
de PostgreSQL revisadas en eastus/eastus2/centralus. `eastus` es provisional:
cuota de entornos disponible y PostgreSQL 17/B1ms admitido, pero varias cuotas
numéricas no pudieron verificarse. Créditos y capacidad total no confirmados.
Todavía no se han generado IaC ni provisionado recursos.

Las secciones de estado por hito que siguen conservan la historia de aceptación.
Para el estado vigente de migración consulte también `backend/MILESTONE7.md`.

## Objetivo y decisiones

Construir un backend en .NET 11 con ASP.NET Core, monolito modular y funcionalidades
verticales. PostgreSQL será la fuente de verdad, EF Core el acceso transaccional,
pgvector el índice de embeddings y almacenamiento de objetos guardará originales.
Un worker procesará trabajos durables de ingestión e indexación. La elección de
paquetes EF Core/Npgsql se verificará antes de agregar persistencia; no se asume
que el número de versión del SDK obliga a usar el mismo major de cada biblioteca.

Se conservan React, Python y voz mientras se migran funcionalidades. Un módulo
tendrá un único escritor de datos durante cada etapa; no habrá sincronización
bidireccional permanente con Firestore. El destino de infraestructura cambia de
GCP a Azure; el despliegue y el corte de producción se harán en el hito final.
Los adaptadores y la configuración necesarios se diseñan desde los primeros hitos.

Patrones: DDD selectivo para invariantes, CQRS ligero sobre la misma base, puertos
y adaptadores para dependencias externas, Strategy para corrección/recuperación,
outbox transaccional, idempotencia y concurrencia optimista. EF Core puede usarse
directamente en casos sencillos. No se introducen microservicios, event sourcing,
repositorios genéricos ni una base de grafos sin una necesidad comprobada.

## Límites y propiedad de datos

| Módulo | Datos y operaciones propias |
| --- | --- |
| Identidad | Usuario, identidad Google, roles y sesiones de autenticación |
| Currículo | Materias, categorías, escalas/niveles, temas, unidades, objetivos y conceptos |
| Contenido | Fuentes, lecciones, revisiones, originales, fragmentos e indexación |
| Evaluaciones | Banco versionado, definiciones, preguntas, intentos, respuestas y políticas |
| Aprendizaje | Evidencias, dominio por concepto, repasos y grafo del alumno |
| Conversaciones | Hilos, mensajes, turnos, actividades pendientes, resúmenes y apuntes |
| IA | ContextBuilder, skills versionadas, herramientas, proveedores y manifiestos de contexto |

Una base con esquemas por módulo. Las referencias entre módulos usan IDs
estables y contratos; no se navegan entidades EF ajenas. Publicación y resultados
emiten eventos mediante outbox cuando se requiere trabajo asíncrono. Cada consumidor
deduplica eventos y los trabajos tienen reintentos, lease y estado de fallo.

## Currículo y contenido coherentes

Materias, categorías, temas y niveles son datos editables, no enums. Las escalas
de nivel distinguen dificultad del contenido, competencia educativa y dominio
del alumno. Los estados operativos cerrados sí pueden representarse con enums.
React recibe nombres, orden y disponibilidad desde el backend.

`LearningUnit` agrupa objetivos observables, conceptos, lectura, ejemplos,
ejercicios y evaluación. Cada objetivo debe tener cobertura en lectura, práctica
y evaluación. La publicación verifica que las referencias existan, pertenezcan
al ámbito autorizado y apunten a revisiones publicables. Los prerrequisitos no
pueden formar ciclos. Otras relaciones conceptuales sí pueden tenerlos.

Las revisiones publicadas son inmutables. El índice RAG es derivado y reconstruible.
Un trabajo extrae, fragmenta e indexa una revisión; la versión anterior permanece
activa hasta completar la nueva. Despublicar excluye inmediatamente el contenido
de recuperación mediante filtros de vigencia, aunque el borrado físico del índice
sea asíncrono. Los fragmentos registran fuente, revisión, idioma, conceptos,
modelo y versión de embeddings; no se comparan vectores de espacios incompatibles.
Se evalúa recuperación híbrida frente al buscador léxico actual con consultas
representativas, relevancia y fuentes, antes de sustituirlo.

## Evaluaciones y evidencia

Tipos: opción única, selección múltiple, verdadero/falso, respuesta abierta,
análisis de caso y ejercicio práctico. Los tres primeros usan corrección
determinista; los demás requieren rúbrica versionada y validación de resultados.
Una definición de prueba fija objetivos, composición, dificultad, selección,
ayudas permitidas, reintentos, tiempo y momento de revelar feedback.

Cada intento fija las revisiones de preguntas, rúbricas y política de puntuación,
además del orden presentado. El servidor controla inicio, vencimiento y entrega;
reenviar una entrega no crea un segundo intento ni una segunda evidencia. El
cliente no recibe claves ni criterios privados antes del feedback autorizado.
Los cambios editoriales no alteran intentos históricos. La puntuación parcial
se declara por pregunta; nunca se premia seleccionar todas las opciones.

Práctica y evaluación son modos explícitos. Las evidencias conservan alumno,
concepto, resultado, fuente, revisión, fecha y ayudas. No se afirma detectar
copia: se verifica transferencia con variantes, aplicación, justificación y
repaso diferido. Una respuesta con solución revelada no equivale a desempeño
independiente. Las reglas de dominio deben calibrarse con evidencias reales;
los umbrales todavía no están definidos ni implementados.

## Contexto y skills

ContextBuilder combina reglas pedagógicas, unidad/actividad actual, progreso
relevante, resumen, mensajes recientes, fragmentos autorizados y skills aplicables.
Cada proveedor aporta procedencia, prioridad y presupuesto. El historial completo
se conserva fuera del prompt. El contenido recuperado es evidencia, no autoridad
para cambiar instrucciones ni permisos.

Una skill versionada define instrucciones, condiciones, herramientas permitidas
y contrato de salida. Las herramientas registradas y el servidor autorizan efectos;
el modelo no decide permisos ni modifica directamente progreso. MCP se usa como
frontera con agentes/herramientas externos. Los módulos internos se llaman mediante
contratos de aplicación. Se evalúa Microsoft.Extensions.AI para proveedores; voz
puede requerir un adaptador específico.

## Azure y proveedores mixtos

La infraestructura principal se alojará en Azure. El proveedor de infraestructura,
el proveedor de identidad de alumnos y los proveedores de IA son decisiones
independientes. Se conserva el acceso con Google y su identidad estable aunque
el backend deje de ejecutarse en GCP; no se exige migrar alumnos a Entra ID.

Propuesta de servicios para concretar al preparar el despliegue:

| Necesidad | Destino propuesto |
| --- | --- |
| API y servicios Python durante la transición | Azure Container Apps |
| Procesamiento durable | Worker en Container Apps; Jobs para ejecuciones acotadas cuando corresponda |
| Datos y vectores | Azure Database for PostgreSQL Flexible Server con pgvector |
| Documentos originales | Azure Blob Storage |
| Imágenes de contenedor | Azure Container Registry |
| Credenciales de infraestructura | Managed Identity y Azure Key Vault para secretos restantes |
| Trazas, métricas y logs | OpenTelemetry con Azure Monitor/Application Insights |
| Modelos de IA en Azure | Adaptador Azure OpenAI/Microsoft Foundry según capacidad requerida |

La selección de región, tamaños, modelos y modalidades de facturación queda
pendiente de verificar cuota, elegibilidad de los créditos y costos estimados.
No se asume que todos los modelos del catálogo consuman los mismos créditos.
Se mantiene PostgreSQL/pgvector como diseño inicial; no se añade Azure AI Search
ni una cola administrada mientras el outbox y los trabajos durables cubran el caso.

El proveedor se configura por capacidad: tutor de texto, evaluación por rúbrica,
embeddings y voz. Azure será la opción preferida cuando esté validada para esa
capacidad; Gemini puede mantenerse para voz y otras capacidades elegidas.
El adaptador mock permanece disponible para desarrollo y pruebas. No hay un
único selector global que obligue a cambiar todas las capacidades a la vez.

Cada adaptador declara streaming, herramientas, salida estructurada y audio
cuando los soporte. La aplicación verifica esos requisitos antes de ejecutar
una operación. Una abstracción común no implica que los modelos sean equivalentes.
Las trazas registran proveedor, modelo/deployment, versión de configuración,
latencia, tokens y costo cuando pueda calcularse. Los prompts, skills y rúbricas
pertenecen a la aplicación y tienen pruebas de regresión por proveedor.

Los fallbacks serán explícitos por operación, con proveedores permitidos,
timeouts y presupuestos de reintento. No se reenvían automáticamente conversaciones
a otro proveedor sin una política habilitada; un intento evaluado conserva el
modelo y la rúbrica usados. Cambiar embeddings requiere reindexar y activar una
versión compatible, no alternar modelos sobre el mismo índice.

La convivencia Azure/Gemini es una combinación de servicios, no una réplica activa
de datos entre nubes. PostgreSQL en Azure será el escritor principal después del
corte; Firestore queda como origen de migración y reversión temporal. Si voz sigue
usando Gemini desde Azure se validan autenticación, latencia, tráfico entre nubes,
interrupciones y contexto. No se requiere mantener Cloud Run solo por usar Gemini.

Referencias de viabilidad: [Container Apps](https://learn.microsoft.com/en-us/azure/container-apps/overview),
[identidades administradas](https://learn.microsoft.com/en-us/azure/container-apps/managed-identity),
[PostgreSQL y pgvector](https://learn.microsoft.com/en-au/azure/postgresql/flexible-server/how-to-use-pgvector)
y [modelos de Foundry](https://learn.microsoft.com/en-us/azure/foundry/concepts/foundry-models-overview).

## Conversaciones, apuntes y grafos

Mensajes como filas paginadas, turnos idempotentes por alumno/request_id y control
de concurrencia por conversación. La llamada al modelo ocurre fuera de transacciones
largas. Un lease permite recuperar trabajos; si el proveedor respondió antes de una
caída, no se promete exactamente una llamada externa sin soporte del proveedor.
Las sesiones de autenticación son distintas de las conversaciones educativas.

Los apuntes pueden ser del alumno, mensajes guardados o resúmenes generados,
siempre distinguidos y vinculados a su origen. Guardarlos no aporta dominio.

El grafo curricular es una referencia editorial versionada: requiere, explica,
aplica y se diferencia de. El grafo del alumno conserva menciones y relaciones con
mensaje o evidencia de origen, confianza y estado de validación. Se distinguen
mención, exploración, comprensión y dominio. Una inferencia del modelo no modifica
la referencia curricular y una corrección editorial no reescribe evidencia histórica.

La comparación identifica cobertura, posibles confusiones, prerrequisitos y
transferencia. Cambiar de tema puede ser una exploración útil; no penaliza por sí
solo. Las inferencias deben poder corregirse. Ambos grafos comienzan como tablas
de nodos y relaciones en PostgreSQL. React tendrá mapa conversacional, mapa de
aprendizaje y alternativa accesible en lista, con enlaces a mensajes/evidencias.

## Entregas y criterios de aceptación

| Hito | Resultado verificable |
| --- | --- |
| 0. Fundaciones | Solución .NET compilable, host aislado, reglas de dominio probadas y plan versionado |
| 1. Catálogo | Auth Google y autorización; crear materia/categoría/escala/tema sin editar código; migraciones PostgreSQL y pruebas contra base real |
| 2. Unidad editorial | Crear objetivos, lectura y ejercicios; impedir publicación incompleta; preservar revisiones e importar el corpus JSON |
| 3. Pruebas cerradas | Banco, definiciones e intentos persistidos; opción única/V-F y selección múltiple; no filtrar claves; reintentos idempotentes |
| 4. Tutor y apuntes | Contexto acotado, lectura/práctica/chat conectados, fuentes verificables y apuntes persistidos; adaptadores Azure/Gemini y selección por capacidad con regresión |
| 5. Grafos | Referencia editorial y mapa conversacional con procedencia; comparación y corrección de inferencias, vista accesible |
| 6. Evaluación avanzada | Casos, abiertas y práctica con rúbricas; políticas de dominio calibradas y repasos |
| 7. Migración completa | Conversaciones/progreso migrados y conciliados; voz validada y retiro gradual de los escritores Python |
| 8. Azure y corte de producción | Infraestructura reproducible, costos/créditos/cuotas verificados, datos conciliados, proveedores mixtos validados y corte con reversión ensayada |

En el hito 7 se preparan y ensayan importación, conciliación y reversión en un
entorno de prueba. El cambio del escritor de producción y el retiro de servicios
GCP ocurren en el hito 8, después de validar el despliegue Azure.

El hito 8 incluye infraestructura como código, CI/CD, secretos e identidades,
backups y restauración probada, health/readiness, presupuesto y observabilidad.
Primero se despliega en un entorno de prueba; luego se ensayan Google Login,
aislamiento de alumnos, pruebas, chat/streaming, ingestión, grafos y voz con los
proveedores elegidos. El corte evita escrituras simultáneas en Firestore y SQL,
contempla una ventana de migración y define cómo conservar las escrituras nuevas
si hay que volver atrás. GCP se retira cuando termine esa ventana de reversión.
Antes de provisionar se presenta la infraestructura y su estimación concreta
para revisar el uso de créditos. Esta actualización documental no crea recursos.

El primer recorrido de producto completo atraviesa los hitos 1–5: crear una unidad,
publicarla, leer, practicar, rendir prueba, conversar, guardar un apunte y consultar
conceptos con evidencia. El setup inicial no equivale a ese recorrido terminado.

Validación transversal: integración PostgreSQL, aislamiento entre alumnos,
concurrencia en entregas/turnos, contratos OpenAPI sin claves, publicación/indexación
con fallos y rollback, trazas/tokens/costos sin contenido sensible y flujo React.
La migración concilia IDs, propiedad, cantidades de mensajes/intentos y resultados;
cada corte conserva una ruta de reversión antes de retirar el escritor anterior.

## Estado implementado

Hito 0 conservado: host aislado, proyectos por módulo, corrección cerrada,
cobertura de objetivos, ciclos de prerrequisitos y evidencia.

Hito 1 implementado y verificado localmente:

- PostgreSQL 17 local, EF Core 10.0.1 y Npgsql EF 10.0.0 sobre el SDK .NET 11 RC1
  fijado. Los módulos de dominio permanecen independientes de estos adaptadores.
- Esquemas `identity` y `curriculum`, con DbContext e historial de migraciones por
  módulo. `--migrate` aplica migraciones explícitamente; el arranque no las aplica.
- Adaptador Google con verificación de firma, emisor, audiencia, vigencia y correo
  verificado. Se conserva el algoritmo `student_id` del Python real, derivado del
  `sub`; el correo no define identidad.
- Sesiones de siete días guardadas por hash, revocables, con cookie independiente
  del host Python, protección CSRF y límites de login. No hay modo invitado.
- Catálogo compartido persistido: materias, categorías, escalas, niveles y temas.
  Alumnos autenticados consultan; autores configurados por `sub` crean y editan.
  Nombre, slug, orden y disponibilidad se editan sin cambiar código. Los padres y
  el propósito de escala se fijan al crear; no hay borrado físico en este hito.
- Integridad referencial, slugs únicos por ámbito y concurrencia optimista con
  respuesta `409`. Las relaciones se protegen también con restricciones SQL.
- OpenAPI actualizado y validado, solicitudes Postman locales y smoke con seis
  aserciones aprobadas contra el host real.

Validación al cerrar el hito 1: compilación sin advertencias ni errores, nueve pruebas
de dominio y catorce pruebas de integración contra una base PostgreSQL real aislada.
Las pruebas recrean el host y verifican persistencia, permisos, aislamiento de
perfiles, CSRF, revocación/vencimiento, referencias y ediciones concurrentes.
El adaptador Google se sustituye por un puerto de prueba en esta suite. La
validación con cuentas Google reales se completó el 22 de octubre de 2026 en la
beta de Azure: dos cuentas, autor resuelto por `sub` y 404 en acceso cruzado
(ver `docs/azure-beta-acceptance.md`).

Hito 2 implementado y verificado localmente:

- Esquema `content`, migración explícita y readiness del módulo editorial.
  Unidades asociadas al catálogo mediante contrato de aplicación, sin navegar
  entidades EF de otro módulo.
- Cada guardado crea un snapshot inmutable completo con autor y fecha. Los
  objetivos/conceptos y su material usan IDs locales a la revisión. Las revisiones
  y la procedencia de primera publicación están protegidas también por triggers
  SQL. El puntero activo solo puede señalar una revisión de la misma unidad.
- Crear objetivos, lecturas, ejercicios y material de evaluación editorial;
  validar referencias, IDs y DAG de prerrequisitos. Publicar requiere lectura,
  práctica, conceptos y evaluación para cada objetivo. El material evaluativo
  conserva criterios privados; el banco ejecutable y la corrección son el hito 3.
- Publicar, revisar y retirar usan concurrencia optimista por unidad. La revisión
  nueva no reemplaza la publicación activa. Los alumnos solo reciben la publicación
  activa, sin borradores, historial, evaluaciones ni criterios privados. Retirar
  excluye inmediatamente de las lecturas; no hay todavía índice RAG ni worker.
- Importación atómica de las 82 lecturas JSON, mapa explícito al catálogo,
  procedencia completa y deduplicación por ID/hash. Se importan como borradores,
  sin inventar objetivos, ejercicios o evaluación. Un origen o mapping cambiado
  devuelve conflicto sin sobrescribir ediciones ni confirmar parte del lote.
- OpenAPI y solicitudes Postman actualizados. Guía de uso e importación en
  `backend/EDITORIAL.md` y generador de payload local en `backend/scripts/`.

Última validación conjunta: compilación sin advertencias ni errores, nueve pruebas
de dominio y 23 de integración aprobadas con PostgreSQL real. Incluyen publicación,
cobertura, permisos/CSRF, referencias y ciclos, historia/inmutabilidad SQL, carreras
de escritura, importación completa y conflictos sin escrituras parciales. Ocho
aserciones smoke Postman aprobadas contra HTTP real, y lint de OpenAPI y ambas
colecciones sin incidencias. El puerto Google se sustituye solo en las pruebas;
no se ha completado el ensayo con Google real ni la conexión de React.

Hito 3 implementado y verificado localmente:

- Esquema `assessments`, migración explícita y readiness. Preguntas y definiciones
  como snapshots inmutables, protegidos por triggers SQL. Referencias a objetivos
  y conceptos de revisiones editoriales publicadas por contrato de aplicación.
- Opción única, verdadero/falso y selección múltiple con coincidencia exacta o
  puntuación parcial declarada; seleccionar todas las opciones no da puntos.
  Definiciones con composición y orden fijos, cobertura de objetivos, modo,
  límite de tiempo, máximo de intentos y política de feedback. Solo ayuda `none`.
- Intentos por alumno con revisiones fijadas y tiempos controlados por servidor.
  Inicio idempotente por alumno/requestId, límite entre revisiones de una misma
  definición y serialización de carreras en PostgreSQL. La entrega fija respuestas
  normalizadas y resultados: reenvío igual devuelve el resultado; cambiado, `409`.
- Proyecciones de alumno sin claves ni criterios privados, acceso a intentos solo
  del propietario y `no-store`. Feedback posterior o nunca; nunca oculta también
  la nota agregada. Las revisiones históricas conservan enunciado, clave y política.
- Evidencia por pregunta/concepto guardada en outbox en la misma transacción, sin
  duplicados por reintentos. El consumidor de Aprendizaje y su política de dominio
  quedan pendientes; no se afirma haber actualizado dominio.
- OpenAPI y solicitudes Postman locales actualizados; guía en
  `backend/ASSESSMENTS.md`. La definición se hace disponible al crearla; no hay
  borradores, selección aleatoria ni ayudas en esta entrega.

Validación al cerrar el hito 3: compilación con cero advertencias y errores,
nueve pruebas de dominio y 30 de integración aprobadas contra PostgreSQL real.
Las siete pruebas nuevas cubren corrección cerrada, privacidad, permisos/CSRF,
aislamiento, reintentos, límites, vencimiento, carreras, rollback y protección SQL
de snapshots. Once aserciones smoke Postman aprobadas contra el host HTTP real en
base temporal, salida 0. OpenAPI y ambas colecciones validados sin incidencias.
La colección autenticada fue validada estructuralmente; el flujo autenticado se
ensayó en integración con el puerto Google de prueba. Google real y React siguen
pendientes.

Hito 4: implementación de backend y regresión local (aceptación externa pendiente):

- Esquema `conversations`, migración explícita y readiness. Conversaciones por
  alumno, con revisión editorial y actividad fijadas; lectura, práctica y chat
  usan únicamente la publicación activa mediante un contrato editorial seguro.
- Turnos idempotentes por alumno/requestId, hash de cuerpo y versión, reserva
  transaccional con bloqueo corto y lease. La llamada IA ocurre fuera de la
  transacción; recuperar el lease invalida respuestas tardías. Mensajes paginados
  inmutables también en SQL, con fuentes históricas y sin claves privadas.
- ContextBuilder acotado: actividad, objetivos, hasta ocho mensajes y tres
  fragmentos, con manifiesto de procedencia, versión de skill y cota de tokens
  UTF-8. Se validan IDs citados y vigencia antes de guardar la respuesta; retirar
  o cambiar la publicación impide nuevos turnos sobre esa revisión.
- Apuntes del alumno, mensajes guardados y resúmenes explícitos, con procedencia
  conservada al editar, concurrencia optimista y aislamiento incluso ante autores.
  No generan evidencias ni dominio. Los resúmenes no son memoria automática.
- Adaptadores HTTP Azure Chat Completions v1 y Gemini generateContent, selección
  independiente para tutor y resúmenes, salida estructurada validada y timeout.
  Sin fallback; IA deshabilitada por defecto y mock explícito solo en desarrollo.
  Se fijan proveedor/modelo/configuración y registran latencia y tokens disponibles;
  no hay tarifas configuradas para calcular costos.
- OpenAPI y colecciones Postman actualizados; guía en `backend/TUTOR.md` y
  simulaciones locales versionadas. No se han publicado recursos Postman.

Validación del backend del hito 4: compilación sin advertencias ni errores,
nueve pruebas de dominio y 46 de integración aprobadas. PostgreSQL real y
simulaciones HTTP locales de ambos proveedores, con casos de 429, HTML de gateway,
salida inválida, fuentes inventadas, conexión rechazada y timeout real de 30 segundos.
Incluye persistencia tras reinicio, aislamiento, CSRF, notas con procedencia,
inmutabilidad SQL, idempotencia, carreras y recuperación de leases, descarte de
respuestas tardías y retiro durante generación. Trece aserciones smoke Postman
aprobadas contra host HTTP real en base temporal, salida 0. OpenAPI y ambas
colecciones validados sin incidencias. La colección autenticada solo se validó
estructuralmente; el flujo autenticado se ejecutó en integración con Google sustituido.

La regresión local valida contratos HTTP de ambos adaptadores contra simulaciones,
no calidad pedagógica ni comunicación con Azure/Gemini reales. Quedan pendientes
credenciales/deployments y regresión pedagógica real por modelo, Google real y
conexión de React. La lectura/práctica se conecta al tutor por contrato API; no
se afirma haber terminado el recorrido de producto en la UI. No hay streaming,
voz ni recuperación vectorial en esta entrega.

Hito 5: backend de grafos y alternativa accesible implementados y verificados localmente:

- Esquema `graphs`, migración explícita y readiness. Snapshots editoriales completos
  con nodos y relaciones normalizados, IDs estables y procedencia a conceptos de
  revisiones publicadas del mismo tema mediante contrato de aplicación. Relaciones
  requiere, explica, aplica y se diferencia de; solo requiere impide ciclos.
- Mapa conversacional privado con revisión curricular fijada y mensaje del alumno
  como origen. Propuestas explícitas y extracción léxica Unicode `name-match-v1`,
  con deduplicación transaccional incluso ante extracciones concurrentes. No se
  atribuyen propuestas del alumno a un modelo ni respuestas del tutor al alumno.
- Mención, exploración y comprensión declarada separadas de dominio. Validación
  pendiente/aceptada/rechazada; cada corrección crea una revisión inmutable con
  motivo, concurrencia optimista e historial. Rechazar excluye de la comparación,
  sin borrar la observación original ni su procedencia. Triggers SQL protegen las
  cinco tablas de snapshots e historial frente a actualización y borrado.
- Comparación de menciones/cobertura aceptada, conceptos sin mención, prerrequisitos
  sin cobertura y relaciones propuestas ausentes de la referencia. Son señales
  para revisión, no diagnósticos de confusión ni acreditación de transferencia.
- Lista HTML accesible con procedencia enlazada, texto escapado, sesión privada,
  CSP y `no-store`; disponible en el host sin depender de React. OpenAPI y Postman
  actualizados; guía en `backend/GRAPHS.md`.

Validación conjunta: compilación sin advertencias ni errores, nueve pruebas de
dominio y 52 de integración aprobadas con PostgreSQL real y las simulaciones HTTP
locales de ambos proveedores. Seis pruebas nuevas cubren grafos, procedencia,
aislamiento, permisos/CSRF, revisión y extracción concurrentes, correcciones,
comparación, rechazo, persistencia/retiro, Unicode e inmutabilidad SQL. Dieciséis
aserciones smoke Postman aprobadas contra host HTTP real en base temporal, salida 0.
OpenAPI y ambas colecciones sin incidencias. La lista generada se verificó en
Chromium a 320/768/1024/1440 píxeles, sin desbordamiento, con foco de teclado y cero
infracciones axe WCAG A/AA y 2.1 AA. Google se sustituye solo en integración; la
colección autenticada tiene validación estructural, sin ensayo con Google real.

No hay extracción semántica por modelos ni inferencia automática de relaciones;
la extracción léxica crea candidatos pendientes, sin acreditar comprensión. Tampoco
hay agregador de mapas de todas las conversaciones, mapa visual React ni conexión
de React al host .NET. El recorrido de producto completo sigue pendiente de esa
integración y de la aceptación externa de Google y proveedores reales.

Al cierre del hito 5 no había worker, consumidor del outbox, evaluadores por rúbrica
ni política de dominio. El incremento del hito 6 descrito abajo incorpora los tres
primeros con corrección humana; la calibración de dominio sigue pendiente.
Los conceptos locales del contenido siguen perteneciendo a sus snapshots; los nodos
del grafo compartido los referencian sin reescribir contenido ni evidencia histórica.
No se han creado recursos Azure, modificado Firestore ni migrado escritores. El
corpus se importó en una base temporal de prueba, no como migración de producción.

Hito 6: incremento implementado; aceptación de calibración pendiente:

- Abiertas, casos y ejercicios prácticos con rúbrica versionada embebida en cada
  pregunta inmutable. Respuestas textuales acotadas y corrección por autor humano;
  no se ejecuta código ni se delega la nota a un modelo.
- Entregas mixtas `pendingReview`, sin feedback ni evidencia hasta corrección
  completa. Rúbrica fijada históricamente, criterios/puntos validados, corrección
  final inmutable, serializada e idempotente; evidencia y nota se confirman juntas.
- Esquema `learning`, consumidor optativo con deduplicación durable y confirmación
  posterior a persistencia. Recupera caídas entre persistencia y confirmación.
  Evidencia privada con procedencia; proyecciones sin puntuaciones ni payloads
  impiden eludir feedback `never`.
- Repasos programados explícitamente por el alumno para un concepto/revisión;
  completar requiere intento propio, nuevo, de la definición fijada, iniciado
  desde la fecha prevista y completamente corregido. No fija intervalos automáticos.
- Conceptos con estado `uncalibrated`. No hay muestras reales etiquetadas ni
  umbrales aprobados; no se inventa una política de dominio. Guía y límites en
  `backend/MILESTONE6.md`. No se declara cerrado el hito 6.


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

Hito 7: incremento de ensayo histórico implementado y verificado localmente:

- Exportador de mapas JSON Python congelados que valida con los modelos existentes
  y conserva los payloads originales sin recalcular resúmenes ni purgar sesiones.
- Archivo privado `history` en PostgreSQL con procedencia, IDs y propietarios
  originales, mensajes, fuentes, actividades pendientes y resultados históricos.
  Las filas son inmutables mediante trigger SQL; no se inventan revisiones,
  intentos ni evidencia calibrada para datos antiguos.
- Comandos locales `--history import|reconcile|rollback`, limitados a Development.
  Huellas SHA-256, validación completa, transacción y bloqueo entre procesos;
  reintentos idempotentes, conflictos sin escrituras parciales y reversión por lote.
- Lecturas privadas paginadas `/api/history` con `no-store`, aislamiento por alumno
  y proyección que excluye cuestionarios pendientes y respuestas de chat cacheadas.
  No hay escrituras HTTP ni reanudación automática de actividades históricas.
- Guía operativa y aceptación pendiente en `backend/MILESTONE7.md`. Firestore,
  escritores Python y recursos Azure permanecen sin cambios. El hito 7 no se cierra:
  faltan exportación Firestore autorizada, datos reales conciliados, continuidad
  editorial, React y voz real; la calibración del hito 6 sigue pendiente.

Validación del incremento del hito 7: compilación sin errores ni advertencias;
9 pruebas de dominio y 61 de integración aprobadas con PostgreSQL real y
simulaciones HTTP locales de IA. Se repitieron las 4 pruebas de historial tras
agregar la comprobación de inmutabilidad SQL, todas aprobadas. 27 pruebas Python
aprobadas cubren exportación y configuración/cupos de voz con un puente de prueba.
22 aserciones smoke Postman aprobaron contra el host real y una base temporal;
OpenAPI y ambas colecciones validaron sin incidencias. Se ensayaron por CLI
exportación, migraciones, importación, repetición, conciliación y reversión sobre
un snapshot sintético; la conciliación posterior detectó la ausencia con salida 2.
No se ensayaron login Google ni proveedores de voz reales.

Ampliación al retomar el hito 7:

- Extracción directa de las colecciones Firestore de conversaciones y progreso
  mediante una transacción de solo lectura, con proyecto/base explícitos y ADC.
  Preserva sesiones archivadas/vencidas y payloads sin recalcular resúmenes;
  no abre repositorios con efectos de purga ni modifica datos Firestore.
- La salida validada se publica completa con permisos 0600, sin sobrescritura.
  Fallos de lectura, esquema o propiedad cancelan el snapshot.
- 55 pruebas Python aprobadas de exportación, repositorios y configuración/cupos
  de voz. Incluyen el SDK Firestore real sobre gRPC local con datos sintéticos,
  error de permisos en la segunda colección y rollback; no validan IAM ni datos
  reales. No se repitieron .NET ni Postman en esta ampliación.
- Tabla de aceptación para pasar al hito 8 en `backend/MILESTONE7.md`. Continúan
  pendientes proyecto/base confirmados y snapshot real, conciliación/reversión
  de ese snapshot, equivalencia editorial, React sobre .NET y voz real.
  No se declara cerrado el hito 7 ni se cambia el escritor productivo.

## Retomar en otra sesión

Consultar primero `git status`, este documento y `backend/README.md`. Los cambios
locales existentes deben conservarse. El plan,
el backend y las colecciones pueden seguir sin commit; no se presupone una rama
limpia ni se preparan commits automáticamente.

Para reproducir la validación, iniciar PostgreSQL con `backend/compose.yaml`,
configurar `ConnectionStrings__Postgres`, compilar y ejecutar `--migrate`. Las
pruebas requieren `AITEACHER_TEST_POSTGRES` con permiso CREATEDB y la simulación
Postman local con `AITEACHER_TEST_AI_URL`; crean y eliminan solo su base aleatoria.
Las instrucciones completas están en `backend/README.md`.

Aceptación externa del hito 1 cerrada el 22 de octubre de 2026: login con Google
real en dos cuentas, `sub` del autor resuelto (`canAuthor` solo en A) y acceso
cruzado rechazado con 404 en la beta; detalle en `docs/azure-beta-acceptance.md`.
Los hitos 2 y 3 están verificados localmente; consulte `backend/EDITORIAL.md`
y `backend/ASSESSMENTS.md`. El backend del hito 4 está implementado con regresión
local; consulte `backend/TUTOR.md` para configuración, simulaciones y aceptación
externa pendiente. El hito 5 tiene backend y lista accesible verificados localmente; consulte
`backend/GRAPHS.md`. La calibración del hito 6 requiere datos docentes reales y validación pedagógica;
consulte `backend/MILESTONE6.md`. El hito 7 tiene un ensayo histórico local, con
aceptación pendiente en `backend/MILESTONE7.md`. El despliegue/corte Azure sigue
en el hito 8.

Solicitud sugerida para continuar:

> Lee docs/backend-architecture-plan.md, backend/README.md, backend/EDITORIAL.md,
> backend/ASSESSMENTS.md, backend/TUTOR.md y backend/GRAPHS.md. Conserva los cambios
> locales existentes y consulta backend/MILESTONE7.md. Continúa el hito 7 desde
> el ensayo histórico ya implementado: extracción Firestore autorizada, conciliación
> con datos reales, continuidad editorial, integración React y validación de voz.
> Mantén pendiente la calibración del hito 6 sin inventar umbrales de dominio.
> Conserva las revisiones, intentos, conversaciones y fuentes históricas.

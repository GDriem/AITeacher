# Backend de AITeacher: arquitectura y ejecución

Estado: dirección aprobada por el usuario; implementación incremental.
Este documento incluye las ampliaciones aprobadas de evaluaciones, unidades
editoriales, apuntes y grafos. Es la referencia para las entregas del backend.
Actualización aprobada: Azure será el destino principal de infraestructura,
aprovechando los créditos disponibles, con proveedores de IA mixtos.

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
validación con una cuenta Google real queda pendiente de configurar el Client ID
y los autores; no se afirma haber completado ese ensayo ni integrado React.

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

No hay worker, consumidor del outbox, evaluadores por
rúbrica, grafo del alumno ni política de dominio implementados. Los conceptos y
prerrequisitos editoriales son locales al snapshot; el grafo curricular compartido
versionado sigue en el hito 5. No se han creado recursos Azure, modificado Firestore
ni migrado escritores. El corpus se importó en una base temporal de prueba, no
como una migración de datos de producción.

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

Pendiente de aceptación externa del hito 1: probar login con Google real y el `sub`
de un autor. La API está lista para ese ensayo; el frontend continúa en Python.
Los hitos 2 y 3 están verificados localmente; consulte `backend/EDITORIAL.md`
y `backend/ASSESSMENTS.md`. El backend del hito 4 está implementado con regresión
local; consulte `backend/TUTOR.md` para configuración, simulaciones y aceptación
externa pendiente. La entrega siguiente de backend es el hito 5, grafos. El
despliegue/corte Azure sigue en el hito 8.

Solicitud sugerida para continuar:

> Lee docs/backend-architecture-plan.md, backend/README.md, backend/EDITORIAL.md,
> backend/ASSESSMENTS.md y backend/TUTOR.md. Conserva los cambios locales existentes
> y continúa con el hito 5: grafos con procedencia y corrección de inferencias.
> Conserva las revisiones, intentos, conversaciones y fuentes históricas.

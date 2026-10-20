# Hito 5: grafos con procedencia

Contrato implementado: `/api/graphs/revisions` crea y lista snapshots compartidos por
`topicId`; crear requiere autor y CSRF. Cada snapshot usa `graphId`, `number`,
`topicId`, `title`, `nodes` y `edges`. Los nodos tienen un ID estable y una referencia
`unitId`, `unitRevisionId`, `conceptId` a un concepto publicado del mismo tema.
El nombre se obtiene del snapshot editorial, no del cliente. Las aristas son
`requires`, `explains`, `applies`, `differsFrom`; solo `requires` exige DAG.
Los snapshots completos son inmutables y una revisión nueva conserva el tema.
Se consulta una revisión concreta por `/api/graphs/revisions/{id}`.

`/api/graphs/conversations/{id}/observations` permite registrar menciones o
relaciones propuestas por el alumno con `graphRevisionId`, `messageId`, `fromNodeId`,
`toNodeId`, `relation`, `stage`, `confidence`. El mensaje debe ser del propio alumno
(en esa conversación); la revisión debe incluir la unidad y revisión de origen.
La procedencia `student` no se presenta como una inferencia del modelo. Los estados
son `pending`, `accepted`, `rejected`; las etapas `mention`, `exploration`,
`understanding`. Ninguna de ellas acredita dominio.

`POST /api/graphs/conversations/{id}/extract` con `graphRevisionId` y `messageId`
extrae menciones mediante coincidencia literal de nombres con límites de palabra,
solo del mensaje del alumno. Conserva algoritmo `name-match-v1`, confianza y origen.
No ejecuta IA ni detecta comprensión. Repetir la extracción deduplica por
mensaje/revisión/nodo. Las relaciones pueden registrarse explícitamente.

`POST /api/graphs/observations/{id}/corrections` recibe la `version` actual,
`fromNodeId`, `toNodeId`, `relation`, `stage`, `confidence`, `status`, `reason`.
Añade una corrección inmutable, sin borrar la inferencia ni su mensaje de origen.
Un conflicto devuelve 409. Solo el propietario puede leer o corregir; ser autor no
da acceso a conversaciones ajenas. Rechazar conserva la historia y excluye la
observación de la comparación.

`GET /api/graphs/conversations/{id}?graphRevisionId=...` presenta nodos, relaciones,
observaciones vigentes e historial de correcciones. Incluye comparación de cobertura
pendiente/aceptada, conceptos sin mención, prerrequisitos sin cobertura aceptada y
relaciones propuestas que difieren de la referencia. Son señales para revisión,
no diagnósticos de confusión, dominio o transferencia. No se penalizan desvíos.
`GET /api/graphs/conversations/{id}/list?graphRevisionId=...` ofrece una página HTML
accesible con listas semánticas y enlaces a los mensajes de origen. Texto escapado,
`no-store`, sin scripts. Las lecturas y comparaciones históricas sobreviven al retiro
de una unidad y nunca muestran criterios privados.

Todas las rutas requieren sesión; las escrituras requieren CSRF. Las listas de
revisiones usan `offset=0`, `limit=50` (máximo 100). Cada grafo admite 200 nodos y
500 aristas; la vista conversacional admite 1000 observaciones por revisión y
conversación, con 100 correcciones por observación. La extracción es explícita;
no hay worker ni extracción automática de todo el historial.

## Uso y verificación

Ejecutar las migraciones como indica el README; el esquema `graphs` tiene historial
propio y participa en readiness. Los cinco tipos de filas son inmutables mediante
triggers SQL: revisiones editoriales, nodos, relaciones, observaciones y revisiones
de observaciones. Los puertos editoriales y de conversaciones conservan los límites
entre módulos; no hay navegación EF a tablas de otros módulos.

En Postman, usar `api/graphs` después del flujo Google/CSRF, crear/publicar una
unidad y enviar un turno. El turno conserva `graphMessageId` del mensaje del alumno.
`conceptId` trae el concepto del ejemplo editorial; cambiarlo para otra unidad.
Crear grafo genera `graphId` si está vacío y guarda `graphRevisionId`. El ejemplo
contiene un solo nodo; agregar nodos/aristas para comparar relaciones. Para una
revisión nueva conservar `graphId` y aumentar `number`; vaciarlo para otro grafo.
La extracción solo produce resultados si el mensaje menciona un nombre exacto
(por ejemplo «Contexto» en el ejemplo editorial). Si no hay coincidencias devuelve
una lista vacía; puede registrarse una observación explícita. Las correcciones
capturan la versión nueva; leer antes de reintentar tras un 409.

El enlace de procedencia devuelve JSON por defecto y HTML accesible cuando el
navegador envía `Accept: text/html`, con `Vary: Accept`. La lista usa los colores y
tipografía del proyecto, foco visible, estructura semántica y CSP con hash del CSS.

Validación local: compilación sin advertencias ni errores; nueve pruebas de dominio
y 52 de integración aprobadas contra PostgreSQL real. Seis pruebas nuevas cubren
snapshots, referencias, DAG, permisos/CSRF, aislamiento incluso ante autores,
procedencia, extracción Unicode y deduplicación concurrente, correcciones en carrera,
comparación, rechazo, retiro, reinicio e inmutabilidad SQL. La regresión del tutor
usa las simulaciones HTTP locales existentes de Azure/Gemini. Dieciséis aserciones
smoke Postman aprobadas contra host HTTP real en una base temporal. OpenAPI y las
dos colecciones validados. La colección autenticada tiene validación estructural;
el flujo autenticado se ejecutó en integración con Google sustituido.

La lista HTML generada por el endpoint se revisó con Chromium a 320, 768, 1024 y
1440 píxeles, sin desbordamiento horizontal; axe no reportó infracciones WCAG A/AA
ni 2.1 AA y se verificó el foco por teclado en el enlace de procedencia. Para
reproducir artefactos de las pruebas, fijar `AITEACHER_TEST_ARTIFACTS` a una carpeta
local y ejecutar `--filter FullyQualifiedName~GraphApiTests`.

Límites: no hay extracción semántica con modelos, inferencia automática de
relaciones, acreditación de comprensión/dominio, cálculo de transferencia ni un
agregador de todos los mapas del alumno. Se implementa el mapa conversacional con
referencia fijada. El mapa visual y la conexión de React a .NET siguen pendientes;
la alternativa accesible funciona directamente en este host con su propia sesión.
Google real, modelos reales y despliegue Azure conservan sus pendientes anteriores.

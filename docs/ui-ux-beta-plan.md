# Plan de UI/UX para lanzar la beta

Estado: fases 1–3 implementadas. Fase 4 en curso (PR 8): textos, tema claro y enlace de comentarios hechos; LCP medido en teléfono BVL-N49 (medianas: Inicio 1,59 s, tutor 1,66 s). Corrección de CLS implementada y validada en producción local; pendientes: verificarla desplegada en teléfono real y cubrir el requisito de gama media. La aceptación final por el propietario sigue pendiente; el recorrido asistido de fase 3 está registrado en `beta-review-pr29.md`.
Fecha: 22 de octubre de 2026
Alcance: la interfaz React del build `.NET` (`VITE_BACKEND=dotnet`,
`frontend/src/features/backend/`), que es la que sirve la beta de Azure. No
cambia contratos de API, backend ni infraestructura.

## Diagnóstico

Al conectar React con el host .NET se priorizó cubrir contratos, permisos,
recuperación de turnos y accesibilidad. El resultado funciona y pasa axe, pero
es andamiaje: correcto, no usable como producto.

Medido en el código actual:

- **Dos interfaces.** El build Python (`LegacyApp`) tiene router, `AppShell`,
  CSS Modules (~4 000 líneas), tarjetas de tema, pantalla de tutor, cajón de
  sesiones y diálogo de voz trabajados. El build .NET son ~1 000 líneas de TSX
  y **28 líneas de CSS** (`Backend.css`); casi todo es `backend-panel` + botón.
- **Sin URLs.** La navegación es `useState` en `LearningSpace` y
  `CurriculumExplorer`. Recargar devuelve al catálogo, Atrás sale de la app y no
  se puede compartir ni retomar una unidad, conversación o intento.
- **Unidad como página única.** `UnitSpace` apila objetivos, lecturas,
  ejercicios, evaluaciones, intentos anteriores, tutor y mapa conceptual en una
  sola columna. El tutor aparece al final, debajo de todo el contenido.
- **Tutor como formulario.** Las conversaciones se eligen en un `<select>`
  con fecha y modo crudo (`chat`, `reading`), los mensajes se paginan de 20 en
  20 con Anterior/Siguiente, cada mensaje lleva un botón «Guardar mensaje en
  apuntes», el compositor no queda fijo y el mapa conceptual va debajo del chat.
- **Catálogo como filtros.** Cuatro `<select>` encadenados sobre 82 lecturas,
  sin búsqueda, sin progreso ni «continuar donde lo dejé».
- **Estados mínimos.** `Busy` es «Cargando…» y `Failure` un párrafo con
  Reintentar; no hay esqueletos, estados vacíos con siguiente paso ni avisos.
- **Sin inicio.** El alumno aterriza en el catálogo; no ve su última unidad,
  conversaciones, repasos ni evaluaciones pendientes.

Lo que se conserva: contratos OpenAPI tipados, React Query, CSRF, recuperación
de turnos pendientes, idempotencia de intentos, accesibilidad probada (axe
WCAG A/AA a 320/768/1024/1440 px) y presupuestos de bundle.

## Decisiones

1. **Un solo sistema visual, reutilizando el del build Python.** Los tokens
   (`styles/tokens.css`), `AppShell`, `TopicCard`, `TutorMessage`,
   `TutorComposer`, `TutorMarkdown` y el diálogo de voz ya están diseñados y
   probados. Se extraen a `frontend/src/ui/` como componentes sin dependencia del
   API Python y se alimentan con los tipos .NET. No se diseña desde cero.
2. **El build Python queda congelado.** No recibe mejoras de UI; se retira con
   el corte del hito 8. No se intenta mantener ambos a la par.
3. **Rutas reales con React Router**, ya instalado.
4. **Primero el recorrido del alumno**, después autoría. La beta se lanza para
   alumnos; los autores son pocos y pueden tolerar una UI más austera una semana más.
5. **Sin cambios de API** en este plan. Si una pantalla necesita un dato
   agregado (p. ej. «última actividad»), se arma en el cliente con endpoints
   existentes; un endpoint nuevo se propone aparte.

## Arquitectura de información

```
/                              Inicio: continuar, repasos de hoy, evaluaciones abiertas
/catalogo                      Materias → categorías → temas (búsqueda + filtros)
/temas/:topicId                Tema: descripción, prerrequisitos, unidades por nivel
/unidades/:unitId              Unidad con pestañas: Aprender · Practicar · Evaluar
/unidades/:unitId/tutor        Tutor de la unidad (nueva conversación)
/unidades/:unitId/tutor/:convId  Conversación concreta
/evaluaciones/:attemptId       Intento a pantalla completa, una pregunta por paso
/apuntes  /repasos  /historial Espacios personales
/autoria                       Lista de unidades, búsqueda y estado editorial
/autoria/unidades/nueva        Crear unidad
/autoria/unidades/:unitId      Editor por pasos (?paso=...)
/autoria/unidades/:unitId/evaluaciones Banco y definición de evaluaciones
/autoria/correcciones[/:attemptId] Cola y entrega abierta (?pagina=...)
/autoria/catalogo              Administración del catálogo
```

Navegación principal: Inicio · Catálogo · Apuntes · Repasos · Historial
(+ Autoría si `canAuthor`). En móvil, barra inferior; en escritorio, barra superior.

## Fases

### Fase 1 — Fundaciones (2–3 días)

- `frontend/src/ui/`: Button (primario/secundario/fantasma/peligro), Card,
  PageHeader con migas, Tabs, EmptyState, Skeleton, ErrorState con `traceId`,
  Toast/aviso en vivo, Dialog, Badge. Basados en los tokens existentes.
- Router .NET con las rutas de arriba, `AppShell` adaptado (perfil, cerrar
  sesión, navegación, enlace «Saltar al contenido», foco al cambiar de ruta con
  `useRouteFocus`).
- `Backend.css` se reemplaza por CSS Modules por pantalla.

Aceptación: recargar o usar Atrás mantiene la vista; e2e de navegación por
teclado; presupuesto `backendBeta` revisado y justificado.

### Fase 2 — Recorrido del alumno (5–7 días) · bloquea el lanzamiento

- **Inicio**: «Continuar» con la última conversación o unidad (desde
  `/api/tutor/conversations` e intentos propios), repasos programados y
  evaluaciones en curso. Primer uso: tres pasos explicando cómo funciona.
- **Catálogo y tema**: tarjetas de tema por materia y categoría, búsqueda por
  texto, filtro de nivel como chips, contador de lecturas; la página de tema
  muestra prerrequisitos como enlaces y unidades agrupadas por nivel.
- **Unidad**: cabecera con tema, tipo y nivel; pestañas Aprender (objetivos y
  lecturas con índice lateral), Practicar (ejercicios) y Evaluar (definiciones e
  intentos propios). Botón fijo «Preguntar al tutor» con el contexto de la
  lectura o ejercicio visible.
- **Tutor**: vista de chat a altura completa reutilizando `TutorScreen`:
  compositor fijo, desplazamiento automático, carga de mensajes anteriores al
  subir en lugar de paginación, fuentes como chips desplegables, «Guardar en
  apuntes» como acción secundaria del mensaje, indicador de escritura, aviso de
  turno pendiente como banner con «Recuperar». Lista de conversaciones de la
  unidad en panel lateral con título legible («Lectura: …», «Práctica: …»).
  Mapa conceptual en panel lateral plegable; en móvil, hoja inferior.
- **Evaluación**: pantalla dedicada, una pregunta por paso, progreso, tiempo
  restante si aplica, confirmación antes de enviar y resultado con feedback
  según la política (`never`, posterior, inmediato). El contrato sólo define
  `afterSubmission` y `never`: `afterSubmission` sin rúbrica muestra la nota al
  entregar (inmediato); con rúbrica queda «Pendiente de corrección docente» y la
  nota llega al corregir (posterior); `never` registra la entrega sin nota ni
  aciertos.
- **Apuntes, repasos e historial**: listas con estado vacío útil y enlace de
  vuelta al origen (mensaje, unidad o conversación).
- **Voz**: botón solo si `/api/tutor/voice` la habilita; mientras siga apagada
  en la beta, ningún control ni petición de micrófono.

Aceptación: las secciones 1, 2, 3, 5 y 6 de `docs/azure-beta-acceptance.md`
se pueden ejecutar sin instrucciones previas; e2e `backend.spec.ts` ampliado a
Inicio → unidad → tutor → apunte → evaluación → historial con dos alumnos;
axe sin infracciones a 320/768/1024/1440 px.

### Fase 3 — Autoría (3–4 días)

- Editor de unidad por pasos (datos, objetivos, lecturas, ejercicios), vista
  previa tal como la verá el alumno y publicación con confirmación y diff de
  revisión.
- Editor de evaluaciones con banco de preguntas y cola de corrección con
  rúbrica visible al lado de la respuesta.

Aceptación: sección 6 del checklist ejecutada por el autor real en la beta.

### Fase 4 — Pulido y lanzamiento (2 días)

- Revisión de textos en español (tono, errores, mensajes de error con acción).
- Tema claro además del oscuro actual, siguiendo `prefers-color-scheme`.
- Medición en dispositivo real (móvil de gama media): LCP del inicio y del
  tutor, tamaño de bundle frente a presupuesto.
- Enlace visible «Enviar comentarios de la beta».

## Fuera de alcance

Nuevos endpoints, streaming de respuestas, cambios al modelo de datos, el
build Python, calibración (hito 6) y activación de voz (requiere aprobación
de Azure aparte).

## Riesgos

- **Reutilizar componentes Python acopla tipos**: se mitiga extrayendo a
  `ui/` componentes presentacionales que reciben props, sin importar `api/`.
- **Pruebas e2e frágiles al cambiar el DOM**: se actualizan en la misma PR que
  cada pantalla; los selectores siguen roles y nombres accesibles.
- **Datos agregados para Inicio**: varias consultas en paralelo; si la latencia
  en la beta es mala, se propone un endpoint de resumen en PR aparte.

## Orden de PRs sugerido

1. `ui/` + router + shell (fase 1).
2. Catálogo y tema.
3. Unidad con pestañas.
4. Tutor.
5. Evaluación.
6. Inicio, apuntes, repasos e historial.
7. Autoría.
8. Pulido.

Cada PR pasa `typecheck`, `lint`, `test`, `test:backend`, `budget:check` y
deja la beta desplegable por el CD.

## Cierre técnico de la fase 2 — PR 6 (23 de octubre de 2026)

Base: `main` con evaluación #26 mergeada. El último cambio incorpora Inicio,
Apuntes, Repasos e Historial al sistema `ui/`, con CSS Modules por pantalla.

- Inicio consulta conversaciones, intentos propios y repasos en paralelo,
  recorriendo las páginas existentes. «Continuar» compara la creación de la
  conversación con el inicio o entrega del intento más reciente. El contrato no
  expone la última interacción de una conversación; no se presenta como tal.
  Para volver desde un intento a su unidad se consulta la lista **pública** de
  definiciones, incluidas las revisiones históricas.
- Repasos conserva el intento en línea y «Completar con el intento seleccionado».
  `intento` y `pregunta` sobreviven a recargar y Atrás. Un enlace adicional abre
  `/evaluaciones/:id`; Atrás recupera la selección del repaso. Las páginas de
  evidencias, definiciones e intentos y la evidencia elegida viven en la URL.
- Apuntes conserva página y editor abierto en la URL y enlaza a la conversación
  de origen de mensajes guardados y resúmenes. Los apuntes personales se crean
  sin origen de tutor, conforme al contrato.
- Historial muestra conversaciones e intentos actuales con enlaces para abrirlos,
  además del archivo importado. La conversación importada abierta y las páginas
  de cada lista se conservan en la URL.
- No hay endpoints nuevos ni cambios de tipos generados. Las cuatro pantallas
  se cargan de forma diferida (`backendPersonal`, 12,9/18 kB gzip);
  `backendBeta` queda en 110,8/120 kB, incluidos los chunks compartidos nuevos.

Aceptación local completada:

| Comprobación | Resultado |
|---|---|
| Typecheck y lint | Sin errores ni advertencias |
| Vitest | 84 pruebas, 17 archivos |
| `test:backend` | 7 escenarios seriales, .NET y PostgreSQL con IA/Google simulados mediante Postman |
| Build `VITE_BACKEND=dotnet` y `budget:check` | Correctos; todos los chunks asignados |
| Recorrido e aislamiento | Inicio → unidad → tutor → apunte → evaluación → historial; dos alumnos con datos propios y acceso cruzado 404 a conversaciones e intentos |
| Accesibilidad | Axe WCAG A/AA sin infracciones a 320/768/1024/1440 px en los cuatro espacios, con contenido y vacíos; sin desbordamiento horizontal |
| Teclado y restauración | Navegación, editor de apunte, inicio de repaso, recarga de intento/archivo y Atrás; pruebas de páginas y selecciones por URL |

Las secciones 1, 2, 3, 5 y 6 del checklist de Azure ahora explican las rutas y
controles actuales. Se corrigió el destino del historial en 2.4 y se documentó
cómo preparar la unidad y evaluación necesarias para 3 y 6. La ejecutabilidad de
la UI queda cubierta localmente; la nueva ejecución del propietario en Azure
sigue pendiente y no se sustituye por simulaciones. El checklist conserva el
alcance y los límites de la evidencia real del 22 de octubre.

## Cierre técnico de la fase 3 — PR 7 (23 de octubre de 2026)

Autoría usa rutas propias para lista, alta, editor, evaluaciones y corrección.
Los pasos, búsqueda, filtros, página y entrega abierta se conservan en la URL.
El permiso `canAuthor` protege las herramientas; las rutas directas sin permiso
explican cómo continuar en el catálogo.

- El editor separa Datos → Conceptos y objetivos → Lecturas → Ejercicios →
  Evaluaciones editoriales → Revisión. Valida antes de avanzar, asocia errores
  a los campos y señala objetivos sin lectura, ejercicio o evaluación. Solo
  lectura conserva Datos, Lecturas y Revisión. Los borradores se conservan en
  `sessionStorage`, separados por autor y unidad, con la versión original; salir
  con cambios requiere confirmación y no elimina el borrador de esta pestaña.
- `UnitPresentation` comparte Aprender y Practicar con `UnitSpace` y
  `EvaluationList` comparte la presentación de Evaluar con `Assessments`. La
  vista previa no monta consultas de alumno, tutor ni intentos;
  Evaluar explica que las evaluaciones entregables se crean para una revisión
  publicada. No expone los criterios editoriales privados en la vista del alumno.
- Publicar compara el último borrador guardado con la revisión publicada,
  consultada mediante el GET existente. El diff puro muestra añadidos, quitados
  y modificados por sección, título, tipo, procedencia y referencias con nombres
  legibles. Publicar y retirar requieren un diálogo de confirmación; retirar
  explica el 404 para alumnos. Los conflictos de versión permiten recargar sin
  reintentar una escritura automáticamente.
- Las preguntas se filtran por objetivo/tipo y se crean o editan en un diálogo.
  Editar añade una revisión del mismo recurso: no cambia las preguntas fijadas
  en una evaluación anterior. La definición muestra las preguntas elegidas,
  orden, duración, intentos y política de resultados: inmediato sin rúbrica,
  pendiente de corrección con rúbrica y sin nota/aciertos para `never`.
- Corrección lista solo pendientes, con respuesta y rúbrica en dos columnas
  desde 768 px y apiladas en móvil. La confirmación final conserva el `requestId`
  para reintentos idempotentes y abre la siguiente entrega pendiente.
- El estado Retirada se obtiene del historial existente (`publishedAt`) cuando
  no hay publicación activa. Búsqueda, filtros y cola recorren las páginas del
  contrato antes de filtrar en el cliente. No hay endpoints nuevos ni cambios
  al backend, tipos generados, build Python o infraestructura.

Bundles medidos con `build:backend` y `budget:check` (gzip):

| Grupo | Base `origin/main` | PR 7 | Presupuesto |
|---|---:|---:|---:|
| `backendAuthoring` | 15,39 kB | 28,15 kB | 30 kB (antes 20) |
| `backendBeta` | 110,79 kB | 67,52 kB | 120 kB, sin aumento |
| `markdownShared` | Incluido en `BackendApp` | 44,58 kB | 70 kB |
| `backendPersonal` | 13,04 kB | 13,05 kB | 18 kB |

El aumento editorial se justifica en `bundle-budget.json`: añade el editor por
pasos, persistencia, diff y los dos espacios de evaluación/corrección. Lista,
editor, evaluaciones, catálogo y corrección se descargan por subruta. La bajada
de `backendBeta` no se atribuye a eliminar código: Markdown se separa en un chunk
compartido y ahora se carga al mostrar texto, con `Suspense` y `Skeleton`, en lugar
de descargarse con Inicio/Catálogo. La presentación compartida no importa clientes
Python ni modifica ese build.

Aceptación local:

| Comprobación | Resultado |
|---|---|
| Typecheck y lint | Sin errores ni advertencias |
| Vitest | 104 pruebas, 19 archivos. Validación por pasos, referencias y ciclos; diff puro; persistencia por autor/unidad, ruta directa, Atrás y navegación después de crear |
| `test:backend` | 8 escenarios seriales sobre .NET y PostgreSQL reales con la simulación Postman existente; incluye diff frente a publicación existente, persistencia y conflictos de versión |
| Edición y publicación | Borrador oculto con 404, publicación explícita, revisiones de preguntas, evaluación con rúbrica, corrección, nota y retiro con 404 |
| Accesibilidad | Axe WCAG A/AA a 320/768/1024/1440 px en lista, todos los pasos, tres pestañas de vista previa, diff, diálogo de pregunta, evaluaciones y corrección; sin desbordamiento horizontal |
| Teclado y restauración | Foco al cambiar de paso, foco dentro del diálogo, Escape y devolución al control; recarga de borrador, filtros y entrega; Atrás y confirmación al salir |
| Build .NET y `budget:check` | Subrutas diferidas del editor y evaluaciones; todos los chunks asignados a sus grupos |

La sección 6 de `docs/azure-beta-acceptance.md` incluye los controles actuales,
la receta de evaluación con rúbrica y las dos confirmaciones. **La aceptación
de fase 3 por el autor real en la beta sigue pendiente.** La evidencia local no
sustituye esa ejecución. Esta PR no despliega ni modifica Azure.

## Avance de la fase 4 — PR 8 (23 de octubre de 2026)

- **Textos.** Los errores del cliente .NET salen del estado HTTP con una
  acción («Recarga la página…», «Espera unos minutos…»), porque los
  `ProblemDetails` traen `title` en inglés y a veces identificadores en
  `detail`. Las pantallas de ruta ya no muestran «404: Not Found». Se
  quitaron jerga y anglicismos («venza su reserva», «inmutable», «Feedback al
  alumno», «tokens»), se añadió acción a vencimiento de intento, unidad sin
  publicar y tutor no disponible, y las fechas usan `es` sin depender del
  idioma del navegador.
- **Tema claro.** Paleta AA bajo `prefers-color-scheme: light`, sólo en el
  build .NET (`data-theme="auto"`); el build Python sigue en oscuro. Los
  colores fijos de `ui/` y `features/backend/` pasaron a tokens.
- **Comentarios de la beta.** Pie con «Enviar comentarios de la beta» desde
  `VITE_BETA_FEEDBACK_URL` (`https://` o `mailto:`); vacío lo oculta. El CD lo
  recibe de la variable de repositorio `BETA_FEEDBACK_URL`.

| Comprobación | Resultado |
|---|---|
| Typecheck y lint | Sin errores ni advertencias |
| Vitest | 114 pruebas, 21 archivos; incluye mapeo de estados y validación del enlace |
| `run-local-checks.py` | 104 pruebas .NET, smoke Postman y 8 escenarios `test:backend` aprobados |
| Accesibilidad | Las auditorías axe de `backend.spec.ts` recorren tema claro y oscuro a 320/768/1024/1440 px |
| Build .NET y `budget:check` | Todas las rutas dentro de presupuesto |

LCP de Inicio y del tutor medido en el teléfono BVL-N49 contra la beta:
medianas 1,59 s y 1,66 s. Los desplazamientos de carga (CLS mediano 0,21 y
0,26) tienen corrección local: contener el margen del arranque, reservar el
espacio del marco y montar Inicio/migas del tutor con sus datos iniciales
resueltos. Regresión de producción local: 36 recargas, CLS 0 y LCP máximo
1,44 s, con demoras artificiales de respuestas; no equivale al teléfono real.
Pendientes de la fase: verificar la corrección desplegada, repetir la serie
real y cubrir el requisito de móvil de gama media. `BETA_FEEDBACK_URL` está
configurada y el enlace se verificó en la beta tras el despliegue de la PR #29. Quedan fuera de esta PR,
por ser decisiones de producto: unificar el aviso repetido sobre dominio no
calibrado, separar «evaluación editorial» de la evaluación entregable en
autoría y valorar la navegación del enlace «Consultar mensaje de origen» de
Apuntes. La revisión en navegador confirmó que, aunque su URL está bajo
`/api`, abre HTML legible mediante negociación de contenido, no JSON.

Evidencia del recorrido editorial, evaluación y revisión visual posterior al
despliegue: [revisión de la beta tras PR #29](beta-review-pr29.md). La unidad
de prueba quedó retirada y su resultado se conserva en Historial. La evidencia
incluye las seis cargas medidas en el teléfono real y los límites de esa serie.

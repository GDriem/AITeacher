# U0 — Base de UI y UX de AITeacher

Auditoría del 8 de noviembre de 2026. Interfaz observada: `80fe1d4`
(el código de interfaz no cambió respecto de `8235807`). Rama de trabajo:
`docs/ui-ux-u0-baseline`. Este documento desarrolla U0 del
[plan vigente](ui-ux-improvement-plan.md); no es un plan alternativo.

## Decisiones y límites

Se conserva la prioridad **alumno primero y evolución de la identidad existente**.
U0 registra evidencia y delimita U1; no modifica componentes, CSS, contratos,
autenticación ni datos de producción. Las modificaciones ejecutables son
la captura opcional de evidencias en los recorridos E2E existentes y el apagado
ordenado de BrowserHost para eliminar su base sintética.

Método: dos evaluaciones independientes, diseño (Assessment A) y detector/código
(Assessment B), sintetizadas después de cerrar A. Impeccable `context` permitió
la revisión acotada del sistema existente (`SCOPED_EXISTING_ALLOWED`). No se
activó `init`, `shape` ni un rediseño: no hacen falta archivos `PRODUCT.md` o
`DESIGN.md` para este flujo. El contexto de producto y diseño se registra debajo,
con el código como fuente de verdad y sin duplicar tokens.

A (`/root/design_review`) y B (`/root/technical_audit`) revisaron la primera
serie. Se regeneró la serie definitiva con los mismos guiones y código de UI
para esperar el Markdown cargado, distinguir los repasos cerrado/con rúbrica y
añadir metadatos de estilos/foco. La integración contrastó las capturas finales;
los UUID y horas de las bases aisladas no son una identidad persistente del dato.

El acceso al navegador nativo respondió «The browser access host is unavailable».
La evidencia visual procede de Chromium mediante Playwright, sobre la aplicación
real y un host de pruebas .NET con PostgreSQL aislado. Se inspeccionan las imágenes
renderizadas; no hay overlay de Impeccable ni afirmación de prueba en dispositivo
físico. Google, IA y voz se sustituyen solo dentro del entorno de pruebas existente.

## Contexto de producto observado

AITeacher es una aplicación web de aprendizaje en español. El alumno encuentra
material por materia, tema y nivel; lee, consulta un tutor contextual, guarda
apuntes, entrega evaluaciones y programa repasos a partir de evidencia. El autor
prepara unidades, guarda borradores, publica revisiones, crea evaluaciones
entregables y corrige respuestas abiertas. Estas capacidades se observaron en
el código y los recorridos; no se infieren edades ni necesidades de usuarios
que no han sido entrevistados.

Modos de uso: operación en Inicio, catálogo, evaluaciones, apuntes, repasos y
autoría; lectura en las unidades y mensajes del tutor. Predominan tareas repetidas
y lectura prolongada. El nivel describe material, no dominio acreditado. Una
lectura migrada puede carecer de práctica y evaluación; la evaluación editorial
de una unidad no es automáticamente una evaluación que pueda entregar el alumno.

Invariantes: permisos de autor, criterios privados, revisiones históricas,
guardado local de respuestas en la sesión del navegador, borradores recuperables,
confirmación de entregas/publicación, regreso por URL y contexto del tutor.
No prometer sincronización entre dispositivos ni convertir conversación en
certificación de dominio. El backend observado es el build `VITE_BACKEND=dotnet`;
los componentes compartidos también tienen consumidores Python.

## Sistema visual existente

| Aspecto | Fuente de verdad y comportamiento actual |
| --- | --- |
| Color | [`tokens.css`](../frontend/src/styles/tokens.css): tokens semánticos `canvas`, `surface`, `content`, `border`, `action`, `status` y `focus`. Base oscura azul; tema claro mediante preferencia del sistema y `data-theme="auto"` solo en .NET. |
| Tipografía | `--font-body`: Segoe UI Variable, Segoe UI, system-ui; escala `xs` a `xl`, título fluido. [`global.css`](../frontend/src/styles/global.css) fija cuerpo de 1 rem y altura de línea 1,5. |
| Espaciado y forma | Escala `--space-*`, radios `--radius-*` y ancho `--content-max` en tokens. Superficies sobrias con borde y fondo; no se propone otra paleta ni fuente. |
| Acciones | [`Button.module.css`](../frontend/src/ui/Button.module.css): primary, secondary, ghost, danger; mínimo normal 44 px y pequeño 36 px. `buttonClass` comparte estilos con enlaces. |
| Navegación | [`BackendShell`](../frontend/src/features/backend/BackendShell.tsx): cinco destinos para alumno, sexto para autor; barra inferior móvil, migas, salto al contenido y foco por ruta. |
| Formularios y estados | [`Shared.tsx`](../frontend/src/features/backend/Shared.tsx), ErrorState, EmptyState, Skeleton y Toast. Etiquetas visibles y ayudas asociadas; cargas, fallos recuperables y confirmaciones. |
| Interacción | Foco global visible; cambios de estado mayormente inmediatos; scroll suave y regla global de movimiento reducido. No existe un patrón `:active` común en Button. |

El azul de acción y los colores de guía, evidencia y atención conservan sus roles.
No se normaliza todo a partir de un detector: un valor literal, un control de
36 px o una lista extensa no demuestran por sí mismos una infracción o un problema
de producto. La consulta local Pro Max «touch target spacing» confirmó que deben
separarse el objetivo táctil del proyecto y las condiciones de accesibilidad web.

## Reproducción

Requisitos: dependencias de `frontend/`, SDK fijado en `backend/global.json`,
Chromium de Playwright, Docker/PostgreSQL y Postman CLI local. No se necesita
cuenta Google real ni claves de un modelo. No ejecutar otro runner en los mismos
puertos durante esta captura.

1. Desde `backend/`, ejecutar `docker compose up -d --wait postgres`.
2. Desde la raíz, iniciar la simulación existente:

   ```sh
   /Users/gadiorellana/.local/bin/postman simulation run \
     postman/simulations/tutor.sim.yaml --port 4910 --no-history --output ndjson
   ```

3. En otra terminal, desde `frontend/`, usar un directorio nuevo para cada serie:

   ```sh
   AITEACHER_TEST_POSTGRES='Host=127.0.0.1;Port=55432;Database=postgres;Username=aiteacher;Password=aiteacher-local' \
   AITEACHER_TEST_AI_URL=http://127.0.0.1:4910 \
   AITEACHER_TEST_PREVIEW=1 \
   AITEACHER_UI_BASELINE_DIR="$(pwd)/../docs/ui-ux-baseline/$(git rev-parse --short HEAD)" \
   corepack pnpm test:backend
   ```

4. Finalizar la simulación con Ctrl+C y detener PostgreSQL si se inició para esta
   auditoría. Playwright administra el host y el preview; BrowserHost elimina la
   base aleatoria al terminar. No eliminar volúmenes existentes.

El helper [`uiBaseline.ts`](../frontend/e2e/uiBaseline.ts) solo actúa al definir
`AITEACHER_UI_BASELINE_DIR`. Espera la carga de las vistas habituales y registra
explícitamente el estado «cargando». `manifest.jsonl` relaciona cada imagen con
commit, fecha, ruta exacta, tema, viewport y geometría de controles. Los UUID son
de datos sintéticos; los pasos y nombres permanecen iguales al recrear la base.
Una captura `fullPage` puede mostrar la barra fija en medio de una imagen larga:
su posición corresponde al viewport, no al final del documento completo.

## Cinco tareas comparables

Todas son **pruebas asistidas por guion**, no observaciones de personas. No se
cuantifican ayuda humana ni tiempo de comprensión. Los tiempos del runner miden
la automatización y las auditorías, no eficiencia de aprendizaje.

| Tarea | Perfil y datos fijos | Pasos reproducibles y comprobaciones |
| --- | --- | --- |
| Alumno nuevo | `student-a`, antes de crear su primera conversación/intento | Inicio → Explorar catálogo → Vectores Beta → Unidad Beta de vectores. El recorrido adicional de OSPF distingue lectura sin actividades. |
| Alumno que regresa | `student-a` con conversación; `student-b` con intento activo | Volver a Inicio → Continuar con el tutor; crear intento de Evaluación cerrada beta → Inicio → Retomar esa evaluación. Se comprueba el destino exacto. |
| Lectura y tutor | Unidad Beta de vectores; lectura OSPF; unidad de tres lecturas | Preguntar con contexto → enviar → guardar mensaje → Apuntes → conversación de origen → Atrás. También se recarga y recupera un turno reservado sin duplicarlo. |
| Evaluación y repaso | Evaluación cerrada beta, abierta beta y revisiones R1/R2 | Responder → confirmar entrega → resultado o corrección pendiente; recargar respuestas; programar/iniciar/completar repaso de R1 después de publicar R2. |
| Autor | `author`, Curso/Fundamentos/Vectores Beta | Crear → recuperar borrador → previsualizar → comparar/publicar → crear evaluación entregable → corregir respuesta abierta. Se comprueban conflicto, retiro y privacidad. |

Los guiones viven en [`backend.spec.ts`](../frontend/e2e/backend.spec.ts). Los
retrocesos y recargas son pasos intencionales con aserciones; no representan
errores de navegación observados en una persona. Los errores inyectados se
registran como escenarios de recuperación, no como fallos espontáneos.

## Hallazgos confirmados y backlog

Prioridades: P1 afecta de forma importante la percepción o comprensión de una
acción; P2 tiene salida pero añade dificultad. No se observaron bloqueos P0 de
los recorridos ejecutados. Cada fila distingue el hecho observado del efecto
que motiva el cambio; no se atribuyen errores a usuarios que no participaron.

| ID / prioridad / fase | Ruta y estado | Evidencia | Impacto y criterio de cierre |
| --- | --- | --- | --- |
| F01 · P1 · U1 | `/apuntes`, campo vacío activo; también formularios y compositor | `Shared.module.css:25–35`, tokens `surface-sunken` y `border-default`; imágenes `apuntes-vacios-*`; [cálculo de contraste](ui-ux-baseline/80fe1d4/contrast.json) | El límite que permite localizar el área editable tiene 1,53–1,91:1 según fondo/tema; el relleno tampoco lo distingue suficientemente. Separar borde de control y borde estructural; comprobar ≥3:1 sobre fondos reales en ambos temas, incluido tutor. |
| F02 · P1 · U4 | `/repasos`, intento en curso seleccionado | `LearningReviews.tsx:47–67`; `repasos-con-contenido-rubrica-light-320.png`: «Completar con el intento seleccionado» habilitado sobre un intento con 0/1 respuestas | El botón permite pedir completar sin haber satisfecho la condición explicada de intento corregido. Mostrar título/estado del intento junto a la acción, identificar a qué repaso se aplica y prevenir o explicar selección no elegible. Probar varios repasos e intentos en curso, pendientes y corregidos. No se afirma que el backend acepte una asociación inválida. |
| F03 · P2 · U1 | `/autoria`, seis destinos a 320 px | `BackendShell.module.css:288–309`; `autoria-lista-light-320.png`; áreas de 53,33 × 56 px y cuatro etiquetas con elipsis | Se pierden nombres visibles aunque permanecen nombres accesibles y áreas táctiles suficientes. Conservar reconocimiento de todos los destinos a 320 px y reflujo/zoom, URLs y ubicación actual. Los cinco destinos del alumno sí caben. |
| F04 · P2 · U1 | `/autoria/unidades/nueva`, paso Evaluaciones editoriales a 320 px | `Tabs.tsx`, `Tabs.module.css`; `autoria-evaluacion-editorial-light-320.png`: panel actual visible, pestaña activa fuera del tramo mostrado | Al avanzar cambia el contenido sin conservar visible la ubicación en la secuencia. Mantener visible la selección tras Siguiente/Anterior, recarga, URL y teclado, sin mover innecesariamente la página; comprobar etiquetas largas y movimiento reducido. |
| F05 · P2 · U1 | `/catalogo`, filtros seleccionados y puntero sobre otra opción; navegación de escritorio | `Button.module.css:44–48` agrupa hover/pressed/current; `BackendShell.module.css:131–135` agrupa hover/current | Una opción bajo el puntero recibe la misma apariencia que la seleccionada. Diferenciar selección/ubicación de hover, conservar foco independiente y limitar hover a dispositivos compatibles. Es una equivalencia verificada en CSS; no una medición de confusión humana. |
| F06 · P2 · U4; patrón en U1 | `/apuntes`, crear/editar/eliminar | `Notes.tsx:23–27,41–56`; `apuntes-con-contenido-light-1440.png`; etiquetas estáticas durante mutación y eliminación con estilo secundario | El resultado se deduce del cambio de lista, pero no tiene la confirmación explícita del tutor/evaluación. Adoptar pendiente/éxito y jerarquía destructiva comunes, preservar texto en fallo y verificar foco/anuncio al eliminar. No se confirmó pérdida de datos. |
| F07 · P2 · U4 | `/repasos`, sin evidencias ni repasos | `LearningReviews.tsx:51,61`; `repasos-vacios-light-320.png` | «Elige una evidencia y una fecha en el formulario» remite a un formulario ausente. Mostrar solo instrucciones realizables en ese estado y recuperar las de programación cuando haya evidencia. |

F01 aplica a campos vacíos que dependen del límite o relleno para identificar su
área editable. No se exige contraste 3:1 a todos los bordes decorativos o botones
con texto identificable. Es el criterio de
[contraste no textual explicado por W3C](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).
Los valores se calcularon con composición alfa y luminancia sRGB del CSS,
no muestreando píxeles de las capturas. Axe no acredita por sí solo este criterio.

### Hipótesis y límites que se conservan abiertos

- La barra de acciones del tutor ocupa espacio antes del intercambio en móvil.
  La densidad es visible; no se probó que el teclado físico tape Enviar ni que
  provoque abandono. Verificar en U3 con dispositivo y teclado reales.
- «Continuar» puede necesitar más contexto de unidad cuando hay conversaciones
  de nombres parecidos. El orden actual usa creación de conversación, no una
  fecha de última actividad que el contrato no expone. Revisar en U2 con varias
  conversaciones y un intento activo.
- La explicación sobre dominio aparece en varias pantallas. La repetición está
  confirmada; su interferencia con la comprensión necesita validación humana.
- Los botones `sm` miden 36 px y no tienen `:active` común. Es una oportunidad
  de comodidad/respuesta, no una infracción automática. No agrandar todos los
  enlaces inline ni añadir animación a cada acción.
- El outline exterior de Tabs puede ser recortado por su contenedor con scroll.
  La captura `unidad-pestana-foco-*` confirma foco programático en «Aprender»,
  pero su estilo computado es `outline-style: none`: tras interacción de puntero,
  ese foco no activa `:focus-visible`. No sirve para concluir recorte del foco de
  teclado. Comprobarlo con entrada real por Tab/flechas en U1 antes de modificarlo.
- El foco al guardar/eliminar un apunte requiere comprobación dirigida. El
  desmontaje del editor no basta para afirmar un fallo con lector de pantalla.
- La regla global de movimiento reducido usa `0.01ms`; no se confirmó que
  suprima información necesaria. No convertir una preferencia de implementación
  en un fallo funcional.

### Revisión de diseño e interacción

La composición conserva identidad propia en el material, las evidencias y el
tutor contextual, sobre una base visual sobria. No se propone un nuevo estilo.
La evaluación individual delimita bien pregunta, progreso, entrega y corrección
pendiente. URL, migas, filtros y regreso mantienen orientación; los dos temas
conservan jerarquía y legibilidad textual en las muestras revisadas.

En Repasos conviven programación, lista, selección e intento incrustado; la
memoria necesaria para relacionarlos es el principal punto de fricción. Para
primera visita, F07 es una instrucción imposible; para autor móvil, F03/F04
debilitan orientación. La navegación del alumno tiene cinco destinos, pero
el número por sí mismo no justifica reorganizarla. Para teclado/lector de
pantalla, el guion acredita navegación y diálogos; los anuncios y foco de
Apuntes aún necesitan revisión manual.

| Before | After esperado | Why |
| --- | --- | --- |
| Bordes de campos y estructura comparten token tenue | Borde de control distinguible, estructura discreta | F01: encontrar el área editable |
| Elipsis en destinos del autor; pestaña seleccionada fuera de vista | Nombres reconocibles y selección visible | F03/F04: conservar orientación |
| Hover, selección y ubicación comparten apariencia | Estados perceptibles por separado; foco independiente | F05: mostrar qué permanece seleccionado |
| Respuesta de acciones depende de cada pantalla | Patrón de pendiente, éxito y destructiva documentado | F06: consistencia sin movimiento ornamental |

Puntuaciones heurísticas orientativas de A, anteriores a conocer el detector:

| Heurística | Nota / 4 | Observación |
| --- | --- | --- |
| Estado del sistema | 3 | Evaluación y tutor claros; feedback de Apuntes desigual |
| Lenguaje del alumno | 3 | Evidencias identificadas por número/fecha |
| Control y libertad | 3 | Regreso, URL y cancelaciones disponibles |
| Consistencia | 2 | Pestañas y feedback divergentes |
| Prevención de errores | 3 | Entrega protegida; completar repaso mejorable |
| Reconocimiento | 2 | Selección distante y etiquetas recortadas |
| Eficiencia | 3 | Búsqueda, filtros, teclado y acceso directo |
| Jerarquía y sencillez | 3 | Buena base, ruido en Repasos |
| Recuperación | 3 | Reintentos y conservación de trabajo |
| Ayuda contextual | 3 | Buena en evaluación; vacío contradictorio en Repasos |
| **Total** | **28/40** | Buena base; no equivale a aceptación de usuarios |

La revisión técnica B puntúa accesibilidad 2/4, rendimiento 3/4, temas 3/4,
responsive 3/4 e integridad 3/4: **14/20**. Son escalas de revisión, no una
certificación ni una comparación de velocidad entre versiones.

El [detector](ui-ux-baseline/80fe1d4/detector.json) terminó con código 2 y **un**
aviso `side-tab` en `UnitEditor.module.css:6`. Describe el borde lateral de
`.notice`, que comunica objetivos sin cobertura con texto explícito. Se descarta
su clasificación estética como defecto: cumple una función real. No se
repite el detector ni se confunde su resultado con los hallazgos manuales.

## U1 delimitada

Un PR de controles y navegación, con estas cuatro unidades verificables:

1. **Límites de campos (F01):** introducir un token semántico de borde de control
   y aplicarlo en `Shared.module.css` y el compositor. Mantener la paleta y los
   bordes de estructura. Verificar contraste sobre fondos reales, ambos temas
   y consumidores Python si se modifica un recurso compartido.
2. **Navegación del autor (F03):** resolver los seis destinos a 320 px, preservando
   el reconocimiento de nombres y las rutas. Conservar la estructura del alumno
   salvo evidencia nueva. No reducir la letra para esconder el problema.
3. **Pestañas (F04):** garantizar visibilidad del elemento activo y del foco sin
   saltos de página. Probar avance, URL, recarga, flechas/Home/End, etiquetas
   largas y movimiento reducido en autoría, unidad y consumidores Python.
4. **Estados comunes (F05, base de F06):** distinguir hover/selected/current/focus
   y documentar uso de pendiente, éxito y destructiva en los componentes
   existentes. Respuesta inmediata de pulsación si ayuda; sin nueva librería.
   La revisión completa de mutaciones y foco de Apuntes permanece en U4.

Archivos previstos: `styles/tokens.css`, `ui/Button*`, `ui/Tabs*`,
`features/backend/BackendShell*`, `Shared.module.css` y los estilos del compositor,
todos bajo `frontend/src/`. Ampliar esa lista solo por un consumidor real del
componente compartido; no incorporar contratos, backend o una nueva identidad.

Aceptación: 320, 768, 1024 y 1440 px, ambos temas, navegación con teclado y foco
restaurado; zoom/reflujo al 200 % y movimiento reducido; contraste de campos
vacíos; destinos reconocibles; selección y foco visibles. Conservar axe,
presupuestos, LCP/CLS y pruebas funcionales. Verificar anuncio de los estados
modificados con lector de pantalla, indicando por separado cualquier límite
del entorno. Completar comprobaciones de consumidores Python si se cambian
tokens o componentes que usa ese build.

Las intervenciones recomendadas corresponden a `adapt`/`harden` para navegación
y pestañas, `clarify` para estados y `polish` al cierre. F02/F07 se priorizan en
U4; Inicio y tutor quedan en U2/U3. No se requieren decisiones de paleta ni
metáforas visuales para empezar U1.

## Evidencia y validación final

- [Índice de 186 capturas / 40 estados](ui-ux-baseline/80fe1d4/index.md), ambos
  temas, sobre la misma interfaz `80fe1d4`.
- [Manifest de 346 registros](ui-ux-baseline/80fe1d4/manifest.jsonl), con rutas,
  fechas, tamaños, geometría, estilos y elemento enfocado. Anchos: 320, 768,
  1024 y 1440 px; adicionalmente 390 px en las superficies capturadas por el
  helper ampliado. Desbordamiento horizontal máximo observado: **0 px**.
- [Resultados y 36 muestras de carga](ui-ux-baseline/80fe1d4/validation.json) y
  [salida del runner](ui-ux-baseline/80fe1d4/browser-run.txt).
- [Detector](ui-ux-baseline/80fe1d4/detector.json) y
  [contraste de límites de campos](ui-ux-baseline/80fe1d4/contrast.json).

| Comprobación | Resultado de esta sesión |
| --- | --- |
| `corepack pnpm typecheck` | Aprobado |
| `corepack pnpm lint` | Aprobado |
| Build .NET frontend | Aprobado; `test:backend` con `AITEACHER_TEST_PREVIEW=1` ejecutó `build:backend` y sirvió el preview |
| `corepack pnpm budget:check` | Aprobado; todas las rutas dentro del presupuesto |
| `corepack pnpm test:backend` con captura opcional | **10 aprobadas en 3,4 min**: nueve regresiones y un caso de evidencia de carga/error/recuperación |
| Axe | Sin violaciones en los estados auditados por los recorridos; no se ejecuta automáticamente sobre cada captura adicional |
| Simulación HTTP | Se observaron 34 eventos `request` en el log local de Postman entre ambas series; el tutor devolvió la respuesta sintética esperada |
| Cierre del host | Un recorrido adicional de catálogo aprobado en 12,8 s; el inventario de bases antes/después fue idéntico con el apagado corregido |

Las mediciones usan preview, caché desactivada y respuestas reales de la API local
demoradas 200/450/650 ms según consulta. Hay tres muestras a 320 px por tema y
escenario, y una a cada otro ancho. No son percentiles de usuarios reales.

| Escenario | Muestras | CLS máximo | LCP mínimo–máximo |
| --- | ---: | ---: | ---: |
| Inicio sin actividad del perfil | 12 | 0 | 536–1012 ms |
| Inicio con actividad | 12 | 0 | 536–1012 ms |
| Tutor sin conversación seleccionada | 12 | 0 | 1404–1432 ms |

Runtime: Node 24.21.0, pnpm 11.16.0, SDK .NET
11.0.100-rc.1.26425.128 y Chromium 151.0.7922.34. La captura definitiva abarca
22:24:44–22:26:49 UTC del 8 de noviembre; el test de carga termina después.

No se ejecutó de nuevo toda la batería de backend/Postman ni Vitest: no se
modificó lógica de aplicación o contratos. Sí se recorrieron HTTP, persistencia,
permisos, tutor, evaluaciones y autoría mediante las regresiones integradas.
El build Python no recibió cambios de UI; su validación será obligatoria si U1
modifica recursos compartidos. Quedan pendientes dispositivo/teclado físicos,
lector de pantalla manual, zoom al 200 %, proveedores reales y evaluación de
comprensión por usuarios. U0 no declara cubiertas esas verificaciones.

La serie preliminar se reemplazó para corregir la captura antes de terminar la
carga de Markdown y evitar nombres de imagen compartidos entre los dos casos de
repaso. No se cambiaron componentes ni CSS para obtener el resultado.

La comprobación de limpieza detectó que el `SIGKILL` predeterminado de Playwright
impedía ejecutar el `finally` de BrowserHost. Se añadió `gracefulShutdown` con
`SIGTERM` y 20 s en `playwright.backend.config.ts`; BrowserHost ya manejaba esa
señal. El recorrido adicional verificó que no quedara una base nueva. Las dos
bases creadas por las series anteriores se identificaron cotejando los UUID de
sus unidades con ambos manifests y se eliminaron específicamente. Se conservaron
las bases antiguas y el volumen. Simulación, host, preview y PostgreSQL quedan
detenidos. La garantía de cierre comprobada corresponde a macOS; Playwright
ignora esas señales en Windows.

**Cierre de U0:** backlog con evidencia y criterios de cierre, cinco tareas
reproducibles, contexto de producto/sistema y alcance U1 registrados. La siguiente
acción es implementar F01/F03/F04/F05 en un cambio revisable conforme a U1.

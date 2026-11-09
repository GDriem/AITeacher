# Plan de mejora de UI y UX de AITeacher

Fecha: 8 de noviembre de 2026. Estado: **U0–U6 completadas localmente; U7 preparada, pendientes integración por CI/CD, aceptación humana y verificaciones físicas**.
Base original del plan: `main`, commit `8235807`; U1 parte de `81a7aef`; U2 parte de `10cc3c2`; U3 parte de `fa9843c`; U4 parte de `71bde90`; U5 parte de `af70987`; U6 parte de `22b7aa2`.
Las skills están instaladas y sus
criterios se describen en [ui-skills.md](ui-skills.md).

El objetivo es que el alumno encuentre qué estudiar, continúe sin perder el
contexto y entienda qué pasó después de cada acción. Para el autor, el objetivo
es preparar, publicar y corregir material distinguiendo con claridad cada etapa.
El acabado visual debe apoyar esos recorridos y resultar cómodo en sesiones largas.

Prioridad mantenida al retomar U0: **alumno primero y evolución de la
identidad existente**. No hay una nueva paleta, composición o dirección visual
aprobada. La auditoría y el alcance de U1 están en
[ui-ux-baseline.md](ui-ux-baseline.md); su implementación y verificaciones están
en [ui-ux-u1-validation.md](ui-ux-u1-validation.md).

## Alcance y punto de partida

El alcance principal es el build React para .NET (`VITE_BACKEND=dotnet`),
especialmente `frontend/src/features/backend/`, sus CSS Modules y `frontend/src/ui/`.
Se conservan React Router, TanStack Query, contratos de API, autenticación,
permisos, reglas de evaluación e historial. Los componentes y tokens compartidos
también pueden afectar al build Python: comprobar sus consumidores antes de cambiarlos.

La beta ya tiene rutas, navegación móvil, búsqueda con filtros en URL, pestañas,
tutor contextual, estados vacíos, borradores y comprobaciones de accesibilidad.
No repetir las fases ya implementadas de [ui-ux-beta-plan.md](ui-ux-beta-plan.md).
El usuario indicó que el estado anterior le parecía bien y decidió continuar
desde main; las mediciones históricas no se presentan como mediciones nuevas.

La planificación original se apoyó en código y en [la revisión anterior](beta-review-pr29.md).
U0 añadió capturas actuales de Chromium, auditoría independiente de diseño y
revisión técnica sobre `80fe1d4`, con datos sintéticos locales. Las hipótesis
no confirmadas siguen separadas de los defectos en la base; no se realizó un
estudio con usuarios.

| Evidencia actual | Mejora propuesta | Prioridad |
| --- | --- | --- |
| `HomeRoute.tsx`, `CurriculumExplorer.tsx`, `Notes.tsx` y `LearningReviews.tsx` repiten explicaciones sobre dominio o niveles. | Unificar vocabulario y colocar cada aclaración donde se interprete un resultado, manteniendo el rigor pedagógico. | Alta |
| Inicio diferencia primer uso y retorno; Continuar usa fechas de conversación e intento. | Jerarquizar la siguiente acción y revisar casos con intento activo, conversación antigua y varios repasos. No prometer «última actividad» si el contrato solo aporta creación. | Alta |
| La navegación muestra cinco destinos para alumno y seis para autor; en móvil las etiquetas admiten elipsis. | Comprobar reconocimiento y espacio a 320 px; reorganizar solo si la prueba demuestra fricción. | Alta, por validar |
| `Button.module.css` define 44 px mínimos y 36 px para tamaño pequeño; existen estados hover sin un patrón común de pulsación. | Revisar área táctil real, espaciado y respuesta de controles frecuentes. El tamaño pequeño no demuestra por sí solo una infracción de accesibilidad. | Media |
| El tutor combina conversaciones, voz, resumen, mapa, fuentes y guardado de mensajes. | Dar prioridad al intercambio y al contexto de lectura; comprobar competencia de acciones y comportamiento con teclado móvil. | Alta, por validar |
| Apuntes ofrece origen HTML en otra pestaña y regreso a la conversación. | Aclarar la diferencia entre ambos enlaces y preservar el regreso. El origen ya es HTML legible, no un error de JSON. | Media |
| Repasos combina selección de evidencia, programación, lista e intento incrustado. | Hacer evidente qué evidencia se repasa y cuál es el siguiente paso, evitando acciones ambiguas entre elementos. | Alta, por validar |
| La evaluación editorial del documento y la evaluación que entrega el alumno viven en flujos distintos. | Explicar la distinción y conectar publicación con creación de la evaluación entregable. | Alta |
| Evaluaciones conservan respuestas en `sessionStorage`; autoría conserva borradores y controla conflictos. | Mantener información veraz sobre guardado y recuperación. No insinuar sincronización entre dispositivos. | Invariante |

## Resultados que deben poder comprobarse

Usar los mismos datos y tareas antes y después. Registrar finalización, errores,
retrocesos y ayuda necesaria; medir tiempos como comparación orientativa, sin
inventar una mejora porcentual ni presentar pruebas asistidas como estudios independientes.

| Recorrido | Resultado esperado |
| --- | --- |
| Alumno nuevo | Encuentra una lectura o unidad y distingue qué actividades ofrece, sin esperar prácticas inexistentes. |
| Alumno que regresa | Identifica una acción principal útil y retoma el intento o conversación correcto. |
| Lectura y tutor | Pregunta sobre el material visible, guarda una idea y regresa conservando contexto. |
| Evaluación y repaso | Comprende el guardado local, entrega una sola vez y distingue resultado, corrección pendiente y repaso programado. |
| Autor | Distingue borrador, publicación de unidad, evaluación entregable y corrección; puede recuperar cambios sin perderlos. |

## Fases y entregables

Orden recomendado: **U0 → U1 → U2 → U3 → U4 → U5 → U6 → U7**.
Cada fase produce un cambio revisable y un commit separado. Una fase puede ocupar
más de una sesión; no avanzar dejando fallos conocidos en el recorrido afectado.
Los números indican secuencia, no días estimados. U0 fija el tamaño de los PR
después de confirmar los problemas.

### U0 — Confirmar prioridades y registrar la base

Resultado: backlog priorizado con evidencia y alcance cerrado para U1.

- Revisar este plan y confirmar alumno primero y evolución de identidad, o
  registrar la corrección del usuario sin reabrir decisiones ya respondidas.
- Ejecutar el build .NET en entorno local con datos sintéticos y perfiles de
  alumno y autor. Reutilizar `AITeacher.BrowserHost` y los recorridos de
  `frontend/e2e/backend.spec.ts`; no crear material en producción para la auditoría.
- Capturar Inicio, catálogo, unidad, tutor, evaluación, apuntes, repasos y autoría
  en ambos temas. Registrar estados vacío, habitual, cargando y error relevantes.
- Revisar con Impeccable `audit`/`critique` por recorrido y Emil para interacción.
  Cada hallazgo debe indicar ruta, estado, evidencia, impacto y criterio de cierre.
  No convertir preferencias del detector en errores automáticamente.
- Documentar producto y sistema existente bajo `docs/`, referenciando los tokens
  actuales. Si se activa un flujo formal de Impeccable que exige `PRODUCT.md` y
  `DESIGN.md`, resolver su ubicación y lectura desde `frontend/` sin duplicar
  fuentes de verdad; completar su captura de contexto antes de ese flujo.
- Guardar resultados en `docs/ui-ux-baseline.md` y actualizar la tabla de avance.

Aceptación: problemas confirmados separados de hipótesis; cinco tareas anteriores
reproducibles; imágenes ligadas a commit, ruta, tema y viewport; U1 delimitada.
No es necesario rediseñar una pantalla para cerrar U0.

### U1 — Coherencia de controles y navegación

Resultado: una base de interacción uniforme sin cambiar la identidad por accidente.

Alcance confirmado por U0: contraste de límites de campos (F01), nombres de
navegación del autor a 320 px (F03), visibilidad de la pestaña activa (F04) y
distinción entre hover/selección/foco (F05). Un PR acotado; archivos y criterios
de cierre en [la base, sección U1](ui-ux-baseline.md#u1-delimitada). La aplicación
completa del patrón de feedback a Apuntes (F06) queda en U4 junto con los
problemas de Repasos (F02/F07). No ampliar U1 a Inicio o tutor salvo sus controles.

Archivos principales: `styles/tokens.css`, `styles/global.css`, `ui/`,
`features/backend/Shared*` y `BackendShell*`, todos bajo `frontend/src/`.

- Revisar jerarquía de acciones primaria, secundaria y destructiva; estados
  pendiente, deshabilitado, seleccionado, foco y error; mensajes de confirmación.
- Ajustar densidad, escala tipográfica y espaciado solo donde U0 muestre problemas.
  Conservar tokens semánticos, fuentes del sistema y compatibilidad entre temas.
- Verificar navegación de alumno y autor, área segura, zoom y etiquetas largas.
  Mantener URLs, Atrás, enlace de salto y foco al cambiar de ruta.
- Definir movimiento por propósito: respuesta inmediata y transiciones discretas
  donde ayuden. Evitar esperas en tareas frecuentes; respetar movimiento reducido
  y separar hover de la interacción táctil. No añadir una librería por defecto.

Aceptación: controles consistentes y accesibles; ninguna acción depende solo de
hover; navegación utilizable a 320 px; diálogos devuelven el foco; muestras en
ambos temas. Cambios compartidos comprobados también en consumidores del build Python.

### U2 — Inicio, descubrimiento y lectura

Resultado: recorrido claro desde «qué hago ahora» hasta el contenido adecuado.

Archivos principales: `HomeRoute*`, `CurriculumExplorer*`, `TopicPage*`,
`UnitSpace*`, `UnitPresentation.tsx` y sus consultas existentes.

- Mejorar la prioridad de Continuar, evaluaciones activas y repasos sin inventar
  actividad reciente, progreso o recomendaciones que el backend no proporciona.
- Simplificar primer uso, metadatos y avisos repetidos; explicar niveles y tipos
  de material donde importan para elegir.
- Mejorar lectura, índice y acceso contextual al tutor; mantener búsqueda,
  filtros y selección en URL. Las lecturas siguen sin actividades ficticias.

Aceptación: primer uso y retorno tienen una acción principal reconocible;
filtros sobreviven a recarga y regreso; lectura larga y títulos extensos no
desbordan; no reaparecen los saltos de carga corregidos en Inicio.

### U3 — Tutor y continuidad de conversación

Resultado: conversar se siente directo y el contexto se conserva.

Archivos principales: `Tutor*`, `UnitTutor.tsx`, `tutorQueries.ts`,
`features/tutor/TutorMarkdown*` y, solo si corresponde, `features/voice/`.

- Ordenar acciones de conversación y de mensaje según frecuencia y relevancia,
  preservando acceso por teclado y tacto a fuentes, resumen, mapa y voz.
- Comprobar el compositor con teclado móvil abierto, texto multilínea, mensajes
  extensos y paginación; conservar posición cuando el alumno lee mensajes anteriores.
- Afinar señales de envío, espera, fallo, recuperación y guardado sin afirmar
  streaming, cancelación o capacidades que el contrato no expone.
- Mantener el material de referencia visible o recuperable y el regreso a la unidad.

Aceptación: teclado móvil no tapa enviar; el texto se conserva ante fallo;
recuperar un turno no duplica mensajes; el scroll no arrastra al alumno fuera de
lo que lee; mapa y voz gestionan el foco. Probar voz con el proveedor simulado;
una validación real posterior se registra por separado.

### U4 — Evaluaciones, apuntes, repasos e historial

Resultado: acciones, evidencia y siguiente paso se entienden como un recorrido.

Archivos principales: `AttemptRoute.tsx`, `Attempt.module.css`, `Assessments.tsx`,
`Notes*`, `LearningReviews*`, `Archive*` y `personalQueries.ts`.

- Aclarar progreso del intento, conservación local, confirmación de entrega y
  resultado. Mantener políticas de visibilidad y ausencia de ayudas durante el intento.
- Diferenciar apunte propio, mensaje guardado y resumen; aclarar origen y regreso.
  Mejorar edición y eliminación sin introducir deshacer si no existe soporte real.
- Separar con claridad programar, iniciar y completar un repaso; mostrar su
  evidencia y evaluación asociadas. Priorizar lo pendiente sobre información secundaria.
- Unificar vocabulario de estados en Inicio, Repasos e Historial sin confundir
  finalización con dominio acreditado.

Aceptación: recarga mantiene respuestas dentro del alcance actual; un reintento
de entrega no duplica operaciones; resultado pendiente no aparenta una nota;
origen y regreso funcionan; estados vacíos, listas largas y errores tienen salida.

### U5 — Autoría y corrección

Resultado: el autor entiende qué está preparando, qué está publicado y qué verá el alumno.

Archivos principales: `AuthorSpace*`, `AuthorUnitRoute.tsx`, `UnitEditor*`,
`UnitPreview.tsx`, `Publication*`, `AssessmentAuthor*`, `ReviewQueue*` y
`authoringModel.ts` cuando la mejora lo requiera.

- Distinguir evaluación editorial de evaluación entregable con nombres, contexto
  y enlace al paso siguiente; preservar criterios privados fuera de la vista del alumno.
- Mejorar lectura de pasos, errores asociados a campos, guardado local/remoto,
  vista previa y comparación previa a publicar.
- Afinar la cola de corrección y la relación entre respuesta, rúbrica y resultado.
  Mantener confirmación y claridad en publicar, retirar y calificar.

Aceptación: recorrido de crear → guardar → previsualizar → publicar → evaluar →
corregir completo; borradores sobreviven a recarga; conflictos no sobrescriben
trabajo; el alumno no recibe guías privadas; los cambios no alteran revisiones históricas.

### U6 — Validación integral y cierre

Resultado: experiencia coherente y evidencia reproducible de los cambios.

- Repetir las cinco tareas con los mismos datos de U0 y comparar ayuda requerida,
  errores, retrocesos y tiempos. Registrar qué mejoró y qué sigue sin validación humana.
- Aplicar `break-ui`, revisión de movimiento y comprobación táctil a lo cambiado.
  Resolver defectos confirmados; no abrir una nueva dirección estética en esta fase.
- Ejecutar comprobaciones completas, presupuestos y revisión visual final; dejar
  evidencias en `docs/ui-ux-validation.md`, con versión y límites de cada prueba.
- Mantener el despliegue como paso separado del cierre local. Documentar por
  separado aceptación del propietario y verificaciones posteriores al despliegue.

Aceptación: ningún bloqueo de tareas o regresión conocida sin resolver;
pendientes menores explícitos; pruebas exigidas aprobadas; resultados locales,
reales y asistidos claramente diferenciados. No declarar aceptación humana por simulación.

### U7 — Aceptación humana y verificación del despliegue

Resultado: verificar la versión desplegada y registrar las pruebas humanas y
físicas pendientes de U6. El usuario confirmó este alcance al retomar y recordó
que la aplicación tiene CI/CD. Separar evidencia local y desplegada no requiere
un despliegue manual adicional.

1. Preparar la integración de U0–U6 por PR, revisar el diff y comprobar su CI.
   Al integrar en `main`, otro CI aprobado dispara `CD Azure beta`, que valida
   el SHA y despliega los cambios de aplicación con `BETA_CD_ENABLED=true`,
   sujeto a las reglas del environment `beta`. Reutilizar ese flujo.
2. Comprobar CD, SHA, imagen y revisión servida antes del recorrido en beta.
   CI de PR aprobado no acredita despliegue; cambios solo documentales pueden
   omitir publicación y ejecutar únicamente el smoke de la versión existente.
3. Ejecutar las cinco tareas y la tabla de
   [aceptación humana de U6](ui-ux-validation.md#aceptación-humana-y-posterior-al-despliegue).
   Registrar versión, entorno, perfil, dispositivo, SO, navegador, finalización,
   ayuda, errores, retrocesos y tiempos observados. Cubrir teléfono/teclado
   físicos, zoom nativo al 200 % y VoiceOver/TalkBack. La voz real depende de su
   disponibilidad; no activarla como parte de U7 ni sustituirla por simulación.
4. Corregir defectos confirmados con validación dirigida y repetir el caso sobre
   la versión publicada por CI/CD. Registrar los casos no ejecutados como
   pendientes y la aceptación explícita del propietario.

Aceptación: versión servida identificada, recorridos y verificaciones físicas
registrados, aceptación del propietario y pendientes con decisión documentada.
La preparación de esta fase no equivale a su cierre.

Estado de GitHub consultado el 8 de noviembre de 2026:

| Comprobación | Evidencia |
| --- | --- |
| Interruptor de CD | `BETA_CD_ENABLED=true` |
| `main` remoto | `513fe730f60fad757941f0bc69a1fe565e415b58` (PR #30) |
| CI de ese SHA | [40059493319](https://github.com/GDriem/AITeacher/actions/runs/40059493319), aprobado |
| CD de ese SHA | [40060041818](https://github.com/GDriem/AITeacher/actions/runs/40060041818), aprobado |
| Trabajo local | U0–U6 culminan en `313b830`; aún no integradas en ese `main` remoto |

La consulta acredita el estado de GitHub, no la revisión servida actualmente por
Azure. Verificarla antes del recorrido. La siguiente acción es la integración
por PR y CI/CD; probar la beta anterior no valida U0–U6.

Integración preparada en [PR #31](https://github.com/GDriem/AITeacher/pull/31).
El primer CI descubrió dos hashes de integridad interpretados como claves; se
verificaron contra Git y se exceptuaron solo sus fingerprints históricos en
`.gitleaksignore`. El siguiente CI confirmó un recorte de navegación del alumno
con la fuente de Linux: los destinos ahora reparten ancho desde el nombre, en
lugar de recibir cinco anchos iguales. La regresión U1 añade una fuente más
ancha a 320 px y conserva la aserción de etiquetas completas. Pasan TypeScript,
lint y los dos recorridos locales afectados (editorial/alumno y U1); se revisó
la captura actual de Apuntes a 320 px. Pendiente confirmar el CI completo de esa
corrección. El propietario realizará el bypass de revisión al ser el único
contribuidor; no se cambian las reglas del repositorio.

## Validación transversal

- Tamaños: 320, 768, 1024 y 1440 px; ambos temas. Añadir una anchura de teléfono
  habitual y teclado real para tutor/formularios. Una emulación no acredita dispositivo real.
- Acceso: teclado completo, foco visible y restaurado, zoom al 200 %, contenido
  refluido, movimiento reducido y comprobaciones manuales de lector de pantalla
  en navegación, mensajes de estado y formularios modificados. Conservar axe sin
  violaciones en los recorridos cubiertos; axe no demuestra por sí solo conformidad total.
- Datos: cero, uno y muchos elementos; títulos y nombres largos; palabras sin
  espacios; contenido Markdown extenso; errores, falta de red y respuesta lenta.
- Rendimiento: conservar `bundle-budget.json` y la regresión de estabilidad de
  carga; comparar mediciones con igual build, dispositivo y condiciones.
  Objetivos de aceptación del proyecto: LCP ≤ 2,5 s y CLS ≤ 0,1 en las series
  registradas. No presentar esas series como percentiles de usuarios reales.
- No cambiar contratos ni backend para resolver un detalle visual. Si U0 identifica
  una carencia de producto que los requiere, abrir trabajo separado y explicar su impacto.

Comandos existentes, desde `frontend/`, según el alcance del cambio:

```sh
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm test
corepack pnpm build:backend
corepack pnpm budget:check
corepack pnpm test:backend
```

Para la validación integrada, desde la raíz:

```sh
.venv/bin/python backend/scripts/run-local-checks.py
```

El runner detecta Postman en `/Users/gadiorellana/.local/bin/postman`. Comprobar
prerrequisitos de `backend/README.md`; no ejecutar en paralelo runners que
compartan servidores o puertos. Reutilizar pruebas existentes y agregar solo
cobertura de comportamiento nuevo o de regresiones reales. Un cambio documental
como este plan requiere revisar contenido, enlaces y diff, no ejecutar toda la app.

## Reparto de trabajo para próximas sesiones

| Modelo propuesto | Responsabilidad |
| --- | --- |
| Astra | Orquestar, priorizar, mantener coherencia de producto y revisar la integración y el resultado visual. |
| Terra | Implementar una superficie o componentes asignados con alcance y archivos delimitados. |
| SOL | Implementación alternativa, pruebas de interacción o revisión técnica independiente según la tarea. |
| Luna | Inventario, revisión de textos, enlaces, estados y comparación de evidencias con instrucciones precisas. |

Es una preferencia de organización del usuario, sujeta a disponibilidad al retomar.
No se activaron agentes para elaborar este plan. Con cuatro plazas, usar como
máximo un orquestador y tres tareas simultáneas. No dividir el criterio visual
entre agentes ni asignarles el mismo archivo. U1 se integra antes de paralelizar
superficies; los cambios de tokens, navegación y componentes compartidos tienen
un solo responsable. Toda delegación lleva objetivo, archivos, restricciones,
comprobación y evidencia de cierre.

## Estado y cómo retomar

| Fase | Estado | Evidencia o commit |
| --- | --- | --- |
| Preparación de skills | Completada | `8235807`; `ui-skills.md` y lock |
| Plan | Validación local completada; cierre humano pendiente | Este documento y [validación integral](ui-ux-validation.md) |
| U0 | Completada | [Auditoría, capturas y validaciones](ui-ux-baseline.md), interfaz `80fe1d4`; commit de cierre U0 en la rama `docs/ui-ux-u0-baseline` |
| U1 | Implementada y validada localmente | F01/F03/F04/F05; [cambios, pruebas y capturas](ui-ux-u1-validation.md); rama `feat/ui-ux-u1-controls`, commit de cierre de esta fase |
| U2 | Implementada y validada localmente | Inicio, catálogo y lectura; [pruebas y capturas](ui-ux-u2-validation.md); rama `feat/ui-ux-u2-discovery`, commit de cierre de esta fase |
| U3 | Implementada y validada localmente | Tutor, material de referencia, recuperación, scroll y foco; [pruebas y capturas](ui-ux-u3-validation.md); rama `feat/ui-ux-u3-tutor`, commit de cierre de esta fase |
| U4 | Implementada y validada localmente | Evaluaciones, apuntes, repasos e historial; [pruebas y capturas](ui-ux-u4-validation.md); rama `feat/ui-ux-u4-learning`, commit de cierre de esta fase |
| U5 | Implementada y validada localmente | Autoría, publicación y corrección; [pruebas y capturas](ui-ux-u5-validation.md); rama `feat/ui-ux-u5-authoring`, commit de cierre de esta fase |
| U6 | Validada localmente; aceptación humana/física pendiente | [Validación integral, capturas, comparación U0 y pendientes](ui-ux-validation.md); rama `feat/ui-ux-u6-validation`, commit de cierre local de esta fase |
| U7 | Preparada; integración y aceptación pendientes | Alcance y estado remoto en esta fase; pruebas humanas pendientes en [validación integral](ui-ux-validation.md) |

Al comenzar una sesión: leer este archivo y `ui-skills.md`, comprobar rama y
cambios del usuario, comparar la base con el HEAD vigente y continuar desde la
primera fase pendiente. Crear una rama de trabajo para la implementación; no
suponer que los commits locales ya están en el remoto. Si la base cambió, ajustar
solo los hallazgos afectados. Al cerrar, registrar fase, commit, verificaciones,
decisiones, pendientes y siguiente acción. Actualizar este documento, sin crear
un plan competidor por cada sesión.

Cierre de U1: límites de campos, navegación estrecha del autor, pestañas y
estados comunes implementados en un cambio local. La altura de navegación se
propaga al tutor y avisos para evitar solapamientos. Se conservan identidad,
contratos y recorridos; el patrón de feedback queda documentado para U4.
Verificaciones físicas y humanas transversales permanecen explícitas para U6.
No hay despliegue ni aceptación humana implícita. El commit de implementación
incluye este registro y la evidencia; comprobar el remoto antes de abrir el PR.

Cierre de U2: Inicio prioriza intentos abiertos y repasos pendientes antes de
retomar conversaciones o unidades; primer uso y estados vacíos se simplifican.
El catálogo explica niveles junto al filtro y distingue las actividades de cada
material. La lectura conserva contexto del tutor, limita el índice al viewport
y admite contenido extenso sin desbordar. Pasan 119 pruebas de componentes,
12 recorridos de navegador, build, presupuesto, lint y detector. Las 36 muestras
de carga mantienen CLS 0. Evidencia y límites en [U2](ui-ux-u2-validation.md).

Cierre de U3: tutor con material de referencia recuperable, compositor adaptado
al viewport visual, señales de fallo y guardado junto a su acción, recuperación
sin burbujas duplicadas, scroll anclado y foco de mapa/voz restaurado. Pasan
121 pruebas de componentes, 13 recorridos .NET, regresiones finales del tutor,
9 pruebas de voz del consumidor Python, builds, presupuestos, lint y detector.
Las 36 muestras de carga mantienen CLS 0. Evidencia y límites en
[U3](ui-ux-u3-validation.md). Teclado físico, lector de pantalla y proveedor de
voz real quedan explícitos para U6. No se despliega esta fase.

Cierre de U4: elegibilidad y origen del repaso visibles; pendientes priorizados;
apuntes con feedback, protección de versiones y foco; alcance del guardado local
y recuperación de entrega explícitos; fechas de inicio en Historial. F02, F06
y F07 cerrados localmente. Pasan 130 pruebas de componentes, 14 recorridos .NET,
build, presupuestos, TypeScript, lint y detector. Las 36 muestras de carga
mantienen CLS 0. Evidencia y límites en [U4](ui-ux-u4-validation.md).
No hay despliegue ni aceptación humana implícita.

Cierre de U5: guardado local/remoto veraz, pasos y errores asociados, descarte
confirmado, distinción editorial/entregable, evaluación ligada a la revisión
publicada y corrección con recuperación explícita. Pasan 135 pruebas de
componentes, 15 recorridos .NET y 3 regresiones finales, TypeScript, lint,
build y presupuestos. Autoría queda en 29,97/30 kB gzip. Las 36 muestras de
carga mantienen CLS 0. Evidencia, aviso preexistente del detector y límites en
[U5](ui-ux-u5-validation.md). No se despliega esta fase.

Cierre local de U6: los cinco recorridos se repiten con los datos sintéticos de
U0. Se corrigen el desbordamiento de Apuntes con código largo y el acceso por
teclado a ese código; se simplifica el movimiento del progreso y de la carga.
Pasan 135 pruebas de componentes, 104 .NET, 26 aserciones HTTP, 16 recorridos
integrados y 50 del frontend Python, TypeScript, lint, ambos builds y presupuestos.
Las 36 muestras mantienen CLS 0 y LCP 1000–1444 ms. Se conservan 254 capturas;
453 registros de geometría tienen desbordamiento 0. No se declara mejora de
velocidad ni comprensión humana. Tablas densas a 320 px quedan como detalle
menor explícito. Evidencia y criterios de cierre humano en
[ui-ux-validation.md](ui-ux-validation.md). No se despliega esta fase.

Solicitud sugerida para retomar:

> Retomemos U7. U6 está validada localmente en `313b830`; preparemos la integración
> por PR y comprobemos CI/CD y la versión servida antes de las pruebas en beta.
> Conservá alumno primero e identidad actual; registremos teléfono/teclado físico,
> zoom nativo, lector de pantalla, disponibilidad de voz real y aceptación de las
> cinco tareas, manteniendo separados resultados locales y humanos.

# U6 — Validación integral de UI y UX

Fecha: 8 de noviembre de 2026 (America/Tegucigalpa). Base: `22b7aa2` (U5).
Rama: `feat/ui-ux-u6-validation`. Estado: **validación local completada;
aceptación humana y verificaciones físicas pendientes**.
Este documento cierra la evidencia del [plan vigente](ui-ux-improvement-plan.md);
no sustituye la aceptación del propietario ni las pruebas con personas.

## Alcance y cambios

Se mantiene alumno primero, identidad, contratos, backend, permisos y datos de
producción. La revisión usa Chromium, BrowserHost, PostgreSQL aislado y la
simulación Postman existente. Google, IA y micrófono son sintéticos.

La revisión de movimiento con `review-animations` encontró dos simplificaciones:

| Antes | Después | Motivo |
| --- | --- | --- |
| `Attempt.module.css`: transición de `inline-size` al responder | Progreso actualizado inmediatamente | Es información funcional frecuente; evita layout por frame y demora al usar teclado. |
| `Skeleton.module.css`: animación de `background-position` | Pulso de opacidad sobre el mismo fondo | Conserva la señal de carga sin desplazar el fondo ni repintarlo en cada frame. |

La prueba con datos extremos confirmó y corrigió además:

| Severidad | Campo/caso | Fallo observado | Corrección |
| --- | --- | --- | --- |
| Bloqueante para el layout | Código con URL larga en un apunte | La lista ensanchaba el documento 819 px a 320 px | `Notes.module.css`: mínimo de tamaño inline cero en pantalla, lista e hijos de lista; el código conserva scroll interno. |
| Accesibilidad seria (axe) | Bloque `pre` con scroll | No tenía acceso explícito por teclado; regla `scrollable-region-focusable` | `TutorMarkdown.tsx`: región «Bloque de código» con `tabIndex=0`. La regresión comprueba scroll con flecha derecha. |

Se conserva el contenido completo en ambos casos. El renderer Markdown y el
indicador de carga son compartidos: se comprueba también el build Python.
[Registro de reproducción y regresión](ui-ux-u6/regressions.json).

El pulso sigue la duración existente de 1,4 s, porque comunica espera y no
retrasa una acción. La regla global de movimiento reducido limita su duración
y repetición. Tutor mantiene sus puntos de espera por transform/opacity y su
regla de movimiento reducido. Tabs, diálogos y controles frecuentes no reciben
animaciones nuevas. La voz conserva su movimiento de estado existente; no se
afirma una mejora de FPS medida ni uso de micrófono físico.

**Veredicto de movimiento: aprobado para los cambios revisados**, con respuesta
inmediata en progreso y espera conservada por opacidad. No equivale a una
medición de rendimiento gráfico en dispositivo real.

El detector de Impeccable se ejecutó una vez, con el contexto existente permitido
por `SCOPED_EXISTING_ALLOWED`. Conserva el aviso `side-tab` del borde de aviso de
`UnitEditor.module.css:6`, ya justificado en U0/U5. No es un defecto nuevo ni
motivo para alterar la identidad. [Resultado](ui-ux-u6/detector.json).
Esta ejecución precede las correcciones de cuadrícula y foco del código;
su verificación final procede del navegador, axe y la inspección de capturas.

## Cinco tareas frente a U0

Se reutilizan perfiles, contenido y guiones de [U0](ui-ux-baseline.md#cinco-tareas-comparables):
Curso/Fundamentos/Vectores Beta, Unidad Beta de vectores, evaluaciones cerrada y
abierta beta, lectura OSPF y revisiones R1/R2. Los UUID y fechas de cada base
aislada cambian. Las fixtures extremas adicionales no reemplazan esos datos.

| Tarea | Resultado verificable después de U1–U5 | Comparación y límite |
| --- | --- | --- |
| Alumno nuevo | Catálogo → tema → unidad; lectura sin actividades ficticias; filtros en URL | Conserva finalización del guion U0; nombres y explicación del nivel quedan junto a la elección. |
| Alumno que regresa | Continuar apunta al intento activo; después al repaso pendiente o conversación correcta | U2 añade prioridad comprobable y no inventa fecha de última actividad. |
| Lectura y tutor | Pregunta contextual, guardado, origen y regreso; recuperación sin duplicados, foco y scroll | U3 conserva lectura y borrador ante fallos; el teclado móvil físico sigue pendiente. |
| Evaluación y repaso | Recarga local, confirmación, recuperación de entrega, corrección pendiente y repaso de R1 tras publicar R2 | F02/F06/F07 tienen estados y acciones explícitos. No se equipara completar con dominio. |
| Autor | Crear, recuperar, previsualizar, publicar, evaluar y corregir; conflicto y guías privadas | U5 separa guardado local/remoto, revisión publicada y editorial/entregable. |

**Ayuda requerida, errores de comprensión, retrocesos involuntarios y tiempos
humanos: no medidos, tanto en U0 como en U6.** Las recargas, Atrás y fallos de
red del guion son intencionales. Los tiempos del runner incluyen axe, capturas y
esperas; no sirven para afirmar que una persona completa una tarea más rápido.
No se inventan porcentajes de mejora ni una nueva puntuación de aceptación.

## Datos extremos y límites

`break-ui` se aplica mediante fixtures de API y los recorridos existentes. La
nueva fixture está en [uiStressNotes.ts](../frontend/e2e/uiStressNotes.ts).
Su selección `?datos=demo|empty|one|boundary|many` existe solo dentro de la
intercepción Playwright: no añade controles ni datos de prueba a producción.
El runner cambia entre estados; no queda un demo público funcionando.

| Valor visible | Fuente y límite | Casos |
| --- | --- | --- |
| Texto del apunte | `TutorNote.text`; frontend, servicio y BD: 1–12000 caracteres | `J`, nombre con diacríticos, CJK, emoji, correo y URL largos, Markdown con tabla/código, texto de 12000 caracteres. |
| Tipo/título del apunte | Enum `student`, `savedMessage`, `summary`; textos fijos | Personal en U6; mensaje guardado, origen y resumen en el recorrido editorial/tutor. |
| Fechas | `createdAt`/`updatedAt`, date-time | Fecha sintética fija; versiones concurrentes en U4/U5. No se modifican formatos. |
| Versión e identificadores | `version` positivo, UUID; acciones y URL | Versiones válidas y conflictos en U4/U5. No se imprimen IDs como títulos nuevos. |
| Origen opcional | `conversationId`, `messageId`, `origin` | Ausentes en personal; presentes y navegables en mensajes/resúmenes del recorrido existente. |
| Lista, total y página | 20 resultados por consulta | 0, 1, 2, 21 y 1000; se renderiza una página, se navega y recarga el offset. |
| Lecturas/tutor/autoría | Fixtures U2–U5, conservadas | Índice extenso, palabras sin espacios, código, mensajes largos, almacenamiento fallido y respuesta de corrección perdida. |

El caso de 1000 apuntes comprueba paginación y contenido visible, no renderiza
1000 tarjetas simultáneas ni acredita una prueba de carga del servidor. Se
conservan pruebas de ambos temas, 320/390/768/1024/1440 px, tacto emulado, foco
y movimiento reducido. El aumento de fuente raíz al 200 % a 768 px es una
prueba de texto ampliado, **no zoom nativo del navegador**.

Pendiente menor de lectura: a 320 px una tabla de dos columnas con URL extensa
parte «Método» y «Recuperación espaciada» en varias líneas. El contenido y las
acciones permanecen disponibles; no hay desbordamiento del documento. Se
conserva el renderer actual y se deja el reparto de columnas para una revisión
de tablas Markdown, sin ampliar U6 a un rediseño de lectura. No hay un bloqueo
de tarea demostrado por este detalle.

## Resultados de ejecución

| Comprobación final | Resultado |
| --- | --- |
| TypeScript y ESLint | Aprobados |
| Vitest | 135 pruebas / 23 archivos aprobados |
| .NET | 9 pruebas de dominio + 95 de API aprobadas |
| Postman | OpenAPI y ambas colecciones sin problemas de lint; 26/26 aserciones HTTP aprobadas |
| Runner integrado | Completado; 16/16 recorridos Chromium en 4,4 min, sobre preview de producción; solicitudes HTTP a la simulación observadas |
| Consumidor Python | Build y 50/50 recorridos del frontend en 15,7 s; APIs simuladas del harness, no backend Python real |
| Presupuestos .NET y Python | Todos aprobados; Autoría .NET sigue en 29,97/30 kB gzip |
| Axe, foco, contraste y geometría | Sin violaciones en las auditorías ejecutadas; 453 registros con desbordamiento horizontal 0 |

Los builds, lint y pruebas corresponden a los cambios finales. La regresión
dirigida de datos extremos pasó antes de la serie integral y volvió a pasar en
ella. No hay bloqueo de los recorridos probados pendiente de corregir. El
margen de Autoría sigue siendo pequeño: conservar su presupuesto al ampliarla.

Evidencia: [salida del runner](ui-ux-u6/validation-run.txt),
[resultados](ui-ux-u6/validation.json), [frontend Python](ui-ux-u6/python-e2e-run.txt),
[presupuesto .NET](ui-ux-u6/budget-dotnet.txt) y
[presupuesto Python](ui-ux-u6/budget-python.txt).

Se conservan **254 imágenes**: 243 del [manifest](ui-ux-u6/manifest.jsonl)
(57 estados etiquetados), 10 de las cinco fixtures de Apuntes con su
[manifest separado](ui-ux-u6/stress-manifest.json) y un
[recorte del teclado simulado](ui-ux-u6/viewport-clip.json). El
[índice](ui-ux-u6/index.md) enlaza cada captura. Hay geometría en los cinco
anchos previstos y una captura adicional al ancho predeterminado de 1280 px.
Axe se ejecuta en los estados auditados por los tests, no sobre cada imagen.

Muestras inspeccionadas: [Inicio nuevo](ui-ux-u6/inicio-primer-uso-light-1440.png),
[retorno](ui-ux-u6/inicio-con-actividad-dark-1440.png),
[lectura](ui-ux-u6/unidad-lectura-dark-390.png),
[tutor](ui-ux-u6/tutor-conversacion-dark-320.png),
[resultado](ui-ux-u6/evaluacion-resultado-light-320.png),
[repaso](ui-ux-u6/repasos-con-contenido-cerrada-light-320.png),
[corrección](ui-ux-u6/autoria-correccion-dark-320.png) y
[código con foco](ui-ux-u6/u6-apuntes-many-dark-320.png).
La comparación visual con U0 confirma que se conserva la identidad y que
los límites del campo vacío son más distinguibles. No se presenta como un
estudio independiente de usabilidad.

Al terminar no quedaron listeners en 4910, 5088, 4183 ni 4173. Se detuvo el
PostgreSQL local iniciado para esta sesión, conservando el volumen. El build
local final vuelve a ser .NET. No se modificaron datos de producción.

Las [36 muestras de carga](ui-ux-u6/performance.json) cumplen LCP ≤ 2500 ms y
CLS ≤ 0,1. Mantienen el método U0: preview de producción, caché desactivada,
demoras de API local 200/450/650 ms, tres muestras por escenario/tema a 320 px
y una por cada otro ancho de medición (768, 1024, 1440).

| Escenario | Muestras U6 | LCP U0, ms | LCP U6, ms | CLS máximo U6 |
| --- | ---: | ---: | ---: | ---: |
| Inicio sin actividad | 12 | 536–1012 | 1000–1036 | 0 |
| Inicio con actividad | 12 | 536–1012 | 1000–1024 | 0 |
| Tutor sin conversación | 12 | 1404–1432 | 1408–1444 | 0 |

Son rangos de series locales, no percentiles de usuarios reales. No demuestran
una mejora de velocidad frente a U0 ni permiten atribuir diferencias a U6.
No se aumenta ningún presupuesto. Versiones y hashes de los archivos probados
en [source.json](ui-ux-u6/source.json); el manifest referencia U5 porque las
capturas preceden al commit local de cierre.

## Reproducción

Preparar PostgreSQL y `AITEACHER_TEST_POSTGRES` según la
[base U0](ui-ux-baseline.md#reproducción). Desde la raíz, usar un directorio
nuevo para conservar separadas las series:

```sh
AITEACHER_TEST_PREVIEW=1 \
AITEACHER_UI_BASELINE_DIR=/private/tmp/aiteacher-u6-new \
.venv/bin/python backend/scripts/run-local-checks.py
```

El runner inicia y cierra su simulación Postman, BrowserHost y preview. No
ejecutar otro runner sobre sus puertos. Postman se resuelve en la ruta instalada
`/Users/gadiorellana/.local/bin/postman`; no publica resultados en un workspace.
Desde `frontend/`, las comprobaciones complementarias son:

```sh
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm test
corepack pnpm build
corepack pnpm budget:check
corepack pnpm test:e2e
corepack pnpm build:backend
corepack pnpm budget:check
```

La prueba aislada se selecciona con `corepack pnpm test:backend --grep 'U6:'`,
manteniendo PostgreSQL, simulación y `AITEACHER_TEST_AI_URL` de U0.
Las capturas de página completa ubican la barra fija según el viewport del
momento; verla en medio de una imagen larga no acredita un solapamiento físico.

## Aceptación humana y posterior al despliegue

Estas comprobaciones siguen **pendientes**, con criterio concreto para retomarlas:

| Verificación | Criterio de cierre |
| --- | --- |
| Teléfono y teclado reales | En tutor, apunte y autoría, abrir teclado, escribir varias líneas, enviar/guardar y cerrar teclado; sin controles tapados ni texto perdido. Registrar dispositivo, SO y navegador. |
| Zoom nativo 200 % | Navegar los cinco recorridos con zoom del navegador, sin pérdida de contenido/acciones; comprobar foco y barra inferior. Registrar viewport y navegador. |
| VoiceOver/TalkBack | Recorrer navegación, pestañas, errores asociados, confirmaciones y estados de guardado; anuncios comprensibles y foco restaurado. Axe no sustituye esta prueba. |
| Voz real | Permisos, micrófono físico, interrupción y retorno de foco con proveedor real; registrar entorno y resultado separado de la simulación. |
| Comprensión y aceptación del propietario | Ejecutar las cinco tareas con los datos descritos, registrar finalización, ayuda, errores, retrocesos y tiempo; confirmar distinción entre guardado local/remoto, publicación y evaluación. |
| Después de desplegar | Verificar versión servida, rutas directas/recarga/Atrás, sesión real, assets, permisos de alumno/autor y recorridos principales; comparar rendimiento en ese entorno. |

No se despliega ni se presume aceptación por terminar la batería local. La
continuación es [U7 del plan vigente](ui-ux-improvement-plan.md#u7--aceptación-humana-y-verificación-del-despliegue).
Usar esta tabla para registrar evidencia física/humana después de comprobar la
versión integrada mediante el CI/CD existente. Cierre local y despliegue son
hitos distintos; no se requiere un despliegue manual adicional. Al preparar U7,
`main` remoto sigue en `513fe73` y U0–U6 aún no están integradas allí.

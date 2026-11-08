# U3 — Tutor y continuidad de conversación

Fecha: 8 de noviembre de 2026. Base: `fa9843c` (U2).
Rama de implementación: `feat/ui-ux-u3-tutor`.

## Cambios y decisiones

| Before | After | Why |
| --- | --- | --- |
| Nueva conversación conservaba el énfasis primario incluso dentro de un chat; resumen ocupaba una etiqueta larga. | Nueva conversación es secundaria al conversar; voz, mapa y resumen mantienen acceso directo con una etiqueta visible más breve. | Priorizar el intercambio sin esconder herramientas tras un menú. |
| El material solo se recuperaba saliendo de la conversación. | Lectura o ejercicio desplegable dentro del tutor, únicamente si coincide la publicación. Regreso explícito a la unidad y a Practicar según la conversación confirmada. | Conservar contexto sin atribuir material vigente a una conversación histórica. |
| El compositor podía crecer y los avisos de recuperación ocupaban su zona fija. | Contador y Enviar comparten fila; altura del campo acotada; avisos fuera del compositor fijo. El viewport visual aporta el espacio que deja el teclado, también al pasar del campo al botón. | Mantener Enviar accesible y dejar espacio a los mensajes. El zoom no se interpreta como teclado. |
| El campo deshabilitado perdía interacción durante el envío. | Campo de solo lectura durante el turno: mantiene texto y permite seleccionarlo. Enter conserva saltos de línea; Ctrl/⌘+Enter envía, salvo composición IME. | No perder el borrador ni interferir con la escritura. |
| El tamaño del chat disparaba seguimiento automático, incluso al abrir una fuente. | Seguimiento inmediato al recibir turnos solo desde el final; paginación anclada al mensaje visible; botón para volver al último mensaje con foco en él. | Conservar la posición de lectura y evitar saltos por expandir contenido. |
| Recuperar podía representar dos veces el mensaje reservado durante la espera. | Se reutiliza la solicitud y la burbuja persistida, identificada por su secuencia. | Una recuperación no aparenta otro envío. El backend mantiene la idempotencia existente. |
| Errores de guardado aparecían lejos del mensaje. | Error y reintento junto al mensaje; el resumen tiene su propio error. | Hacer evidente qué falló y dónde recuperarlo. |
| El mapa móvil se superponía sin hacer inerte el fondo; voz no restauraba foco en .NET. | Mapa como diálogo nativo bajo 1024 px y columna en escritorio; Escape y cierre restauran foco. Voz también devuelve foco y explica sus límites dentro del diálogo. | Mantener navegación por teclado y contexto al cerrar. |

Se mantienen tokens, paleta, URLs, permisos, autenticación y contratos. No hay
streaming ni cancelación nuevos. No se cambia backend, paginación de API ni
reglas de evaluación. La voz sigue cargándose bajo demanda. Su diálogo es el
único componente de aplicación modificado con consumidor Python.

## Validación

La serie integral .NET aprobó **13/13 recorridos** en 4,0 minutos, sobre build
de producción y PostgreSQL aislado. Las 121 pruebas Vitest (21 archivos),
ESLint y TypeScript también aprobaron. El detector de Impeccable se ejecutó
una vez, sin hallazgos; los hooks no están conectados y no se modificó su configuración.

Las 36 muestras locales de carga registraron **CLS 0 y LCP 984–1440 ms**;
[datos completos](ui-ux-u3/performance.json). No son percentiles de alumnos
reales ni una mejora porcentual atribuida a U3.

Después de los ajustes menores finales, volvieron a pasar el recorrido editorial
y la recuperación del tutor; U3 pasó de forma independiente incluyendo el fallo
de paginación y su recuperación sin salto. El consumidor Python del diálogo
compartido aprobó **9/9 pruebas de voz**: ambos temas, cuatro anchos,
reconexión, limpieza y vuelta al texto. Builds .NET y Python y ambos
presupuestos aprobados. Tutor .NET: **14,43/16 kB gzip**; voz: **7,11/14 kB**.

**U3 implementada y validada localmente.** No se ejecutó la batería completa
del backend/Postman porque no cambiaron sus contratos ni implementación.

La regresión U3 crea contenido sintético mediante la API local. Comprueba
conservación del borrador y cuerpo del reintento tras 503, guardado fallido y
recuperación junto al mensaje, referencia extensa sin desbordamiento, mapa,
voz, lectura mientras llega una respuesta y fuentes desplegables. Se ejecuta
con Chromium en ambos temas a 320, 390, 768, 1024 y 1440 px, con axe y movimiento
reducido. Los recorridos existentes comprueban recuperación tras recarga,
idempotencia persistida y carga de páginas anteriores.

La prueba del teclado sustituye `VisualViewport.height` por 410 px sobre un
layout de 390 × 844 px y comprueba que campo y Enviar permanecen en esa zona,
incluso al enfocar Enviar. Es una simulación geométrica: **no acredita teclado
ni teléfono físicos**. La implementación usa altura y desplazamiento visual
según [VisualViewport de MDN](https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport).

Voz se prueba con micrófono sintético de Chromium y el WebSocket simulado de
`AITeacher.BrowserHost`. El texto utiliza los mocks locales existentes de
Postman; se comprueban sus llamadas en el log. No se contactan proveedores
reales ni se afirma validación de calidad pedagógica o reconocimiento de voz.

La prueba de scroll identifica el mensaje por ID: el primer elemento de la lista
cambia al cargar una página anterior y no sirve como ancla de comparación.
La prueba de recuperación ahora espera la respuesta antes de buscar Reintentar;
el estado de espera se comprueba expresamente para detectar burbujas duplicadas.
Una prueba antigua de `SessionDrawer` empezaba a escribir antes de la selección
programada con `requestAnimationFrame`, perdiendo el primer carácter. Ahora
espera esa selección; no cambia el componente ni su criterio de aceptación.
El diálogo nativo puede ceder foco a la interfaz del navegador: la prueba
comprueba Tab y que el fondo de la aplicación no pueda recibir foco, sin exigir
capturar los controles del propio navegador.

## Evidencia y reproducción

Usar PostgreSQL y la simulación descritos en la
[base U0](ui-ux-baseline.md#reproducción). Desde `frontend/`, ejecutar
`AITEACHER_TEST_PREVIEW=1 corepack pnpm test:backend` con las variables de
conexión de esa base. `-g 'U3:'` reproduce la nueva prueba de forma independiente.
`AITEACHER_UI_BASELINE_DIR` activa las capturas y el manifest; usar un directorio
nuevo en cada serie. El proveedor WebSocket de voz lo administra BrowserHost.

Las capturas de página completa ubican los elementos sticky según la posición
observada y no representan una pantalla física con teclado. Consultar la
geometría del manifest y las aserciones del test para interpretar ese escenario.

Se conservan **41 registros y 26 capturas** en
[el manifest](ui-ux-u3/manifest.jsonl), con desbordamiento horizontal 0 en los
estados registrados. [source.json](ui-ux-u3/source.json) identifica los archivos
finales mediante SHA-256; las capturas preceden al commit de cierre y por eso
el manifest referencia la base U2. La serie integral de rendimiento precede
al ajuste del guard de foco y del aviso de chat vacío; las comprobaciones
acotadas finales cubren la superficie afectada. [Detector](ui-ux-u3/detector.json).

Muestras revisadas:

- [Conversación, claro, 320 px](ui-ux-u3/u3-conversacion-light-320.png).
- [Lectura de referencia, oscuro, 1440 px](ui-ux-u3/u3-material-dark-1440.png).
- [Área visible con teclado simulado, oscuro, 390 × 410 px](ui-ux-u3/u3-teclado-area-visible-dark-390.png).
- [Recuperación, oscuro, 390 px](ui-ux-u3/tutor-fallo-recuperable-dark-390.png).

## Límites y siguiente fase

Quedan para la validación humana de U6: teclado móvil físico, VoiceOver/TalkBack,
zoom nativo al 200 %, comprensión del alumno y voz con proveedor real. No se
considera aceptación humana una prueba asistida ni se despliega esta fase.
La siguiente fase del plan es U4: evaluaciones, apuntes, repasos e historial.

# U4 — Evaluaciones, apuntes, repasos e historial

Fecha: 8 de noviembre de 2026. Base: `71bde90` (U3).
Rama: `feat/ui-ux-u4-learning`.

## Cambios y decisiones

| Before | After | Why |
| --- | --- | --- |
| Completar repaso se habilitaba con cualquier intento seleccionado. | Cada repaso muestra título, estado y motivo de elegibilidad del intento. Se impide completar con intentos en curso, pendientes de corrección, vencidos, de otra revisión, anteriores a la fecha o ya usados. | Cerrar F02 sin modificar las reglas del servidor, que sigue siendo la autoridad. |
| La programación precedía a los repasos y el origen dependía de la página de evidencias abierta. | Pendientes antes que completados; programación en una sección separada; evaluación y origen junto a cada repaso, con consulta paginada de todas las evidencias. | Reconocer qué repasar y distinguir iniciar, entregar y completar. |
| El vacío remitía a un formulario ausente. | Las instrucciones dependen de si hay evidencia; siempre existe una salida al catálogo o a la lista. | Cerrar F07. |
| Crear y editar apuntes solo cambiaba la lista; eliminar usaba confirmación inline. | Estados de guardado, confirmación de éxito, diálogo destructivo y error junto a la acción. El foco vuelve a Editar, Eliminar al cancelar, o Nuevo apunte tras borrar. | Cerrar F06 y facilitar teclado y anuncios. |
| La clave del apunte incluía su versión; una actualización podía desmontar el editor. | Identidad estable, texto conservado y versión capturada al editar o confirmar eliminación. Un conflicto no sobrescribe la actualización externa. | Conservar trabajo y evitar cambios sobre una versión no revisada. |
| La conservación local se afirmaba incluso si escribir en sessionStorage fallaba. | Se explica el alcance de la pestaña y aparece un aviso de pérdida al recargar si falla el guardado. El texto sigue en memoria. | Informar del estado real sin prometer sincronización. |
| Una entrega fallida no explicaba el bloqueo de respuestas. | Reintentar confirma la misma entrega; el texto explica por qué las respuestas siguen bloqueadas. Escape no cierra la confirmación mientras se entrega. | Evitar cambios ambiguos durante la recuperación. |
| Historial no distinguía fechas entre intentos con el mismo título. | Muestra la fecha de inicio y conserva los estados compartidos de Inicio y Repasos. | Identificar el intento sin inventar actividad reciente. |

Se conserva la identidad, los tokens, las rutas, los permisos, el backend y los
contratos. No hay dependencias nuevas ni componentes compartidos modificados
con consumidores Python. Apuntes distingue apunte personal, mensaje guardado
y resumen generado; el enlace al mensaje avisa que abre otra pestaña y el
regreso a la conversación conserva su ruta histórica.

La nota solo aparece con estado entregado y una política que permite mostrarla.
Las preguntas siguen sin ayudas. Las respuestas siguen almacenándose únicamente
en la pestaña; no se añade guardado remoto ni deshacer para los apuntes.

## Validación

TypeScript, ESLint y **130 pruebas Vitest en 22 archivos** aprobados.
El detector de Impeccable se ejecutó una vez, sin hallazgos; no se activaron hooks.
La batería integral .NET aprobó **14/14 recorridos en 4,0 minutos** sobre build
de producción y PostgreSQL aislado. Ambos temas y anchos 320, 768, 1024 y
1440 px; la regresión nueva de Apuntes también incluye 390 px y movimiento
reducido. Axe no reportó violaciones en los recorridos cubiertos.

Build .NET y todos los presupuestos aprobados: espacios personales
**15,76/18 kB gzip**; evaluación **7,78/10 kB**. Las 36 muestras locales de carga
de Inicio y tutor registraron **CLS 0 y LCP 996–1444 ms**;
[datos completos](ui-ux-u4/performance.json). No representan percentiles de
alumnos reales ni una mejora atribuible a U4.

**U4 implementada y validada localmente.** No se ejecutó la batería completa
del backend/Postman ni el build Python: no cambiaron backend, contratos ni
componentes con consumidores Python. Se reutilizó el mock Azure local y se
verificaron sus llamadas 200 en el log de simulación; no se contactaron
proveedores reales. [Contexto de simulación](../postman/simulations/tutor.context.yaml).

Las regresiones nuevas comprueban elegibilidad del repaso, conservación de
texto y versión ante conflictos, fallos de almacenamiento local y reutilización
del cuerpo de entrega tras 503. La prueba U4 de navegador inyecta fallos de
crear, editar y eliminar apuntes, comprueba conservación, recuperación, foco,
ambos temas, cinco anchos y axe. Los recorridos históricos ejercitan evaluación
cerrada y rúbrica de R1 después de publicar R2 con PostgreSQL real.

Dos selectores antiguos se ajustan al recorrido comprobado: la corrección final
se verifica por su respuesta y salida de la cola, sin exigir navegación cuando
no existe otra entrega; la selección del intento se acota a «Mis intentos
anteriores», porque el título ahora también aparece en la tarjeta del repaso.

## Evidencia y reproducción

Usar PostgreSQL y la simulación local descritos en la
[base U0](ui-ux-baseline.md#reproducción). Desde `frontend/`, ejecutar
`AITEACHER_TEST_PREVIEW=1 corepack pnpm test:backend` con las variables de esa
base. `-g 'U4:|repaso histórico'` ejecuta las tres regresiones afectadas.
`AITEACHER_UI_BASELINE_DIR` activa capturas; usar un directorio nuevo por serie.

Se conservan **83 registros y 47 capturas** en
[el manifest](ui-ux-u4/manifest.jsonl), con desbordamiento horizontal 0.
[source.json](ui-ux-u4/source.json) identifica los archivos finales mediante
SHA-256; el manifest referencia U3 porque la captura precede al commit de
cierre. [Detector](ui-ux-u4/detector.json).

Muestras revisadas:

- [Repaso con intento en curso, claro, 320 px](ui-ux-u4/repasos-con-contenido-rubrica-light-320.png).
- [Corrección pendiente, oscuro, 1440 px](ui-ux-u4/u4-repaso-pendiente-de-correccion-dark-1440.png).
- [Apunte editado y texto extenso, claro, 320 px](ui-ux-u4/u4-apunte-editado-light-320.png).
- [Eliminación fallida, oscuro, 390 px](ui-ux-u4/u4-eliminacion-fallida-dark-390.png).
- [Historial, oscuro, 320 px](ui-ux-u4/historial-con-contenido-dark-320.png).

Las capturas de página completa representan el scroll observado: las barras
sticky pueden aparecer en mitad de la imagen. No equivalen a una pantalla
física. Se conservan únicamente estados relevantes para U4; la batería integral
incluye además las regresiones U1–U3.

## Límites y siguiente fase

La emulación de Chromium y axe no acreditan uso en teléfono físico ni lector
de pantalla. VoiceOver/TalkBack, zoom nativo al 200 %, comprensión del alumno
y aceptación humana quedan explícitos para U6. No se desplegó esta fase.
El siguiente bloque del plan es U5: autoría y corrección.

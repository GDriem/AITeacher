# U5 — Autoría y corrección

Fecha: 8 de noviembre de 2026. Base: `af70987` (U4).
Rama: `feat/ui-ux-u5-authoring`.

## Cambios y decisiones

| Antes | Después | Motivo |
| --- | --- | --- |
| El editor afirmaba que la copia local estaba conservada incluso si fallaba el almacenamiento. Una unidad nueva aparecía como guardada. | Estado de servidor separado de la copia de pestaña, aviso ante fallo y salida sin promesa de conservación. La unidad nueva indica que aún no está guardada. | Informar del estado real del trabajo. |
| Los errores de selección de conceptos y objetivos eran párrafos sueltos. | Grupos con leyenda y descripción asociada, campos inválidos, aviso del paso y foco en el primer control inválido disponible. | Localizar lo que impide avanzar o guardar. |
| Descartar un borrador en conflicto recargaba directamente. | Confirmación destructiva, posibilidad de volver al editor y eliminación local comprobada antes de recargar. | Evitar perder cambios por una pulsación accidental. |
| La distinción entre evaluación editorial y entregable se explicaba principalmente en la vista previa. | Contexto junto a las consignas, privacidad junto al criterio, enlace tras publicar y banco/selección ordenados por pasos. | Entender qué está preparando el autor y qué puede entregar el alumno. |
| La vista previa y la publicación no distinguían suficientemente el documento local del publicado. | Vista previa del borrador actual; estado de revisión publicada; comparación reservada al autor, con efecto sobre entregas anteriores explícito. | Revisar antes de publicar sin confundirlo con la vista vigente del alumno. |
| El tipo del borrador decidía si se podían editar evaluaciones de una publicación anterior. | La ruta consulta el tipo de la revisión publicada. Una publicación de solo lectura explica por qué no tiene evaluaciones. | Mantener independientes borrador y publicación. |
| Publicar una evaluación la habilitaba inmediatamente desde el formulario. | Confirmación con título, revisión, cantidad de preguntas, tiempo, intentos y visibilidad del resultado; cancelar conserva la selección. | Revisar qué verá el alumno antes de habilitar los intentos. |
| La cola repetía títulos y la corrección aplanaba saltos de línea. | Fecha de entrega, elemento actual marcado, foco en la revisión, texto con saltos de línea y guía privada plegable. | Reconocer la entrega y leer respuesta y rúbrica juntas. |
| Borrar puntos los convertía en cero; tras un fallo, los campos se bloqueaban sin explicar el reintento. | El campo vuelve a vacío; el fallo explica la recuperación del mismo envío y conserva su identificador y cuerpo. | Evitar ceros involuntarios y aclarar cómo confirmar sin duplicar la corrección. |

Se conservan rutas, contratos, backend, permisos, identidad visual y reglas de
publicación/corrección. No hay dependencias nuevas ni cambios en componentes
compartidos con el build Python. Los borradores de unidad siguen siendo de
`sessionStorage`, por autor y unidad; banco, selección de evaluación y corrección
explican que sus campos pendientes no se recuperan al salir o recargar.

La implementación unifica los campos repetidos de ejercicios y consignas
editoriales. La compilación automática de React se omite únicamente en la
función principal `UnitEditor`: su documento controlado cambia en cada edición
y la caché generada aumentaba el código del formulario. Vista previa y controles
compartidos conservan su compilación. El presupuesto de Autoría sigue en 30 kB;
no se modifica la configuración del compilador ni se excluyen chunks del cálculo.

## Validación

**U5 implementada y validada localmente.** La batería integral .NET aprobó
**15/15 recorridos en 4,2 minutos**, sobre build de producción y PostgreSQL
aislado. Después del ajuste de texto del contador se repitieron el recorrido
editorial, los conflictos y U5: **3/3 en 1,6 minutos**. Esa última serie añade
la recuperación de una corrección realmente registrada cuya respuesta se pierde:
el reintento envía el mismo identificador y cuerpo y recupera la corrección final.

Ambos temas y anchos 320, 768, 1024 y 1440 px, teclado, foco y axe sin
violaciones en las superficies cubiertas. La batería completa conserva además
las regresiones táctiles y de movimiento reducido de U1–U4.

TypeScript, ESLint y 135 pruebas Vitest en 23 archivos aprobados. Las cinco
regresiones nuevas cubren fallo de almacenamiento, ambos cruces de tipo entre
borrador y publicación, confirmación/cancelación/fallo de evaluación y corrección
con puntos vacíos y recuperación del mismo envío tras 503. Los tests existentes
siguen comprobando cambios escritos durante el guardado y versiones concurrentes.

Build .NET y presupuestos aprobados: Autoría **29,97/30 kB gzip**. El margen
es pequeño y se debe comprobar de nuevo al ampliar esta superficie.

Las 36 muestras locales de carga de Inicio y tutor registraron **CLS 0** y
**LCP 996–1436 ms**; [datos completos](ui-ux-u5/performance.json). No representan
percentiles de usuarios reales ni una mejora atribuible a U5. Las mediciones
preceden al ajuste de texto del contador de confirmación de evaluación.

No se ejecutó el runner completo de backend/Postman ni el build Python: no
cambiaron backend, contratos ni consumidores compartidos. BrowserHost verificó
los flujos contra PostgreSQL real y la simulación Azure local existente;
no se contactaron proveedores reales.

El detector de Impeccable se ejecutó una vez. Señaló el borde lateral de 3 px de
`.notice`, que ya existía en U4 para los avisos de objetivos sin cobertura. Se
conserva el patrón existente: no es un defecto nuevo de U5 ni una razón para
cambiar la identidad. No se activaron hooks.

## Evidencia y reproducción

Usar PostgreSQL, simulación local y variables de la
[base U0](ui-ux-baseline.md#reproducción). Desde `frontend/`, ejecutar
`AITEACHER_TEST_PREVIEW=1 corepack pnpm test:backend`.
`AITEACHER_UI_BASELINE_DIR` activa capturas. La prueba U5 depende del catálogo
sintético creado por el recorrido editorial inicial; ejecutarlos juntos.

Se conservan **112 registros y 56 capturas**, con desbordamiento horizontal 0,
en [el manifest](ui-ux-u5/manifest.jsonl). Se guardó la última muestra de cada
superficie, tema y ancho de la serie final. [source.json](ui-ux-u5/source.json)
identifica los archivos finales por SHA-256; el manifest referencia U4 porque
las capturas preceden al commit de cierre. [Detector](ui-ux-u5/detector.json).

Muestras revisadas:

- [Estado del borrador, claro, 320 px](ui-ux-u5/autoria-datos-light-320.png).
- [Consigna editorial y privacidad, claro, 1440 px](ui-ux-u5/autoria-evaluacion-editorial-light-1440.png).
- [Confirmación de evaluación, claro, 320 px](ui-ux-u5/u5-confirmar-evaluacion-light-320.png).
- [Respuesta y rúbrica, claro, 320 px](ui-ux-u5/autoria-correccion-light-320.png).
- [Respuesta de corrección perdida, oscuro, 1440 px](ui-ux-u5/u5-correccion-respuesta-perdida-dark-1440.png).
- [Copia local fallida, oscuro, 1440 px](ui-ux-u5/u5-copia-local-fallida-dark-1440.png).

Las capturas de página completa pueden mostrar la navegación fija a mitad de
la imagen: representan el scroll del navegador, no una pantalla física.

## Límites y siguiente fase

Chromium y axe no acreditan uso en teléfono físico, lector de pantalla ni
comprensión humana. Esas verificaciones y el cierre integral quedan para U6.
No se despliega esta fase ni se presupone aceptación humana.

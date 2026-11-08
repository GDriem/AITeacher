# U2 — Inicio, descubrimiento y lectura

Fecha: 8 de noviembre de 2026. Base: `10cc3c2` (U1).
Rama de implementación: `feat/ui-ux-u2-discovery`.

## Cambios y decisiones

| Antes | Después | Motivo |
| --- | --- | --- |
| Continuar comparaba fechas de conversación e intento, aunque hubiera un intento abierto. | Prioridad: intento en curso más recientemente iniciado → repaso pendiente con fecha más antigua ya alcanzada → conversación o entrega según sus fechas disponibles → catálogo. | Dar acceso directo al trabajo pendiente. No se presenta la creación de una conversación como última actividad. |
| El primer acceso acumulaba tres pasos y dos tarjetas de estados vacíos. | Una introducción breve y una acción principal al catálogo; los espacios personales siguen accesibles. | Facilitar la primera elección sin prometer prácticas en todas las lecturas. |
| Inicio mostraba listas completas sin ordenar los repasos. | Hasta tres elementos por lista, intentos ordenados por inicio y repasos por fecha, con acceso al resto. | Evitar que un historial largo desplace el siguiente paso. No se pierden páginas de la API. |
| El aviso sobre niveles se repetía en Inicio, catálogo, tema y lectura. | Explicación junto al filtro de nivel, tipos y actividades al elegir material, metadatos de la unidad bajo su título. | Mantener la precisión pedagógica donde sirve para decidir. |
| La descripción de una unidad prometía práctica y evaluación. | Se invita a consultar sus actividades disponibles; una lectura se identifica explícitamente como material sin prácticas ni evaluaciones. | No afirmar disponibilidad que el catálogo no conoce. |
| Índice alto sin límite y salto suave heredado al usar teclado. | Índice lateral limitado al viewport y desplazable; salto inmediato con foco en el título y contexto del tutor conservado. | Permitir recorrer índices largos y evitar esperas en navegación frecuente. |
| Lectura con ancho fijo amplio. | Medida máxima de 75ch, reflujo de títulos y código largo, tablas con desplazamiento local. | Mantener lectura y navegación a 320 px sin desbordar la página. |

Se conservan tokens, componentes, identidad, rutas, filtros en URL y el estado
que devuelve al catálogo. Las consultas de Inicio continúan en paralelo y su
contenido espera las listas y la definición necesaria antes de aparecer, como
en la corrección de estabilidad anterior. Un intento abierto ya no requiere
consultar definiciones para poder retomarlo. Los repasos se comparan con la
hora del dispositivo al entrar y cada minuto; no se modifica su estado ni se
inicia una evaluación desde Inicio.

No cambiaron backend, contratos, autenticación, permisos ni reglas de evaluación.
Los cambios de presentación están en el build .NET; `UnitPresentation` también
se utiliza en la vista previa del autor, cubierta por el recorrido editorial.

## Validación

**U2 implementada y validada localmente.** La serie final completa aprobó
12/12 recorridos Playwright en 3,8 minutos, sobre build de producción .NET,
PostgreSQL aislado y simulación del tutor. Incluye la regresión U1 y la nueva U2.
Axe no encontró violaciones en los estados cubiertos; teclado, foco, contexto del
tutor y desbordamiento se comprobaron a 320/768/1024/1440 px y en ambos temas.
Los filtros sobreviven a recargar el catálogo, recargar el tema y regresar desde
la lectura. No se repitió la batería Python porque no se modificaron sus
componentes, tokens ni CSS compartido; tampoco backend/Postman sin cambios de
contratos.

- Vitest: 119 pruebas en 21 archivos aprobadas. Cobertura nueva de prioridad de
  intentos, orden y límite de repasos, conversaciones con fecha de inicio,
  retorno a entregas y fallos parciales.
- ESLint, TypeScript, build .NET y presupuesto aprobados. Beta: 68,88/120 kB gzip;
  espacios personales: 13,23/18 kB; autoría: 28,26/30 kB.
- La regresión U2 usa una lectura sintética publicada mediante la API local,
  18 entradas de índice, un título sin espacios y Markdown largo. Los escenarios
  aislados de prioridad en Inicio usan respuestas simuladas de listas, señaladas
  en el test; los recorridos existentes siguen ejercitando API y PostgreSQL reales.

Las pruebas locales con Chromium no acreditan un estudio con alumnos ni uso en
un teléfono físico. Lector de pantalla manual, zoom nativo, teclado móvil real
y aceptación de comprensión siguen pendientes para U6. No se despliega esta fase.

## Reproducción y límites

Usar el PostgreSQL local y la simulación del tutor descritos en la
[base U0](ui-ux-baseline.md#reproducción). Desde `frontend/`, ejecutar
`test:backend` con `AITEACHER_TEST_PREVIEW=1` y un directorio nuevo en
`AITEACHER_UI_BASELINE_DIR`. El filtro `-g 'U2:'` reproduce de forma independiente
la prueba de contenido extremo y prioridad; `-g 'catálogo migrado'` reproduce
la conservación de filtros y las lecturas sin actividades.

La identidad de los archivos de aplicación y pruebas usados para capturar se
registra por SHA-256 en [source.json](ui-ux-u2/source.json). El commit del manifest
es la base U1 porque las capturas preceden al commit de cierre de U2.
[El detector](ui-ux-u2/detector.json) terminó sin hallazgos y se ejecutó una vez.
Los hooks no están conectados al entorno; no se modificó su configuración.

Las series preliminares permitieron ajustar el guion: comprobar foco antes de
la recarga, usar coincidencia exacta para el aviso de lectura y respetar el máximo
de 150 caracteres de título que valida la API. La comprobación heredada de U1
ahora espera el estilo `:focus-visible` tras las flechas, igual que ya esperaba el
foco; conserva el criterio de contorno interior. Ninguno de estos ajustes cambia
la lógica del producto ni relaja los criterios de accesibilidad.


## Evidencia conservada

Se conservan **64 registros y 32 capturas** de las superficies afectadas en
[el manifest](ui-ux-u2/manifest.jsonl). Las 36 muestras locales registran
**CLS 0 y LCP 996–1440 ms**;
[datos completos](ui-ux-u2/performance.json). Son mediciones locales reproducibles,
no percentiles de usuarios reales ni una mejora porcentual atribuida a U2.

Muestras revisadas en ambos temas, con recortes locales adicionales para
inspeccionar la parte superior de las capturas largas:

- [Primer uso, claro, 320 px](ui-ux-u2/inicio-primer-uso-light-320.png).
- [Retorno con conversación, oscuro, 1440 px](ui-ux-u2/inicio-con-actividad-dark-1440.png).
- [Catálogo, claro, 320 px](ui-ux-u2/catalogo-habitual-light-320.png).
- [Intento y varios repasos, claro, 320 px](ui-ux-u2/u2-inicio-pendientes-light-320.png).
- [Lectura extensa e índice, oscuro, 1440 px](ui-ux-u2/u2-lectura-extensa-dark-1440.png).
- [Lectura extensa, claro, 320 px](ui-ux-u2/u2-lectura-extensa-light-320.png).

La siguiente fase es U3, tutor y continuidad de conversación. U2 queda cerrada
localmente, sin despliegue ni aceptación humana implícita.

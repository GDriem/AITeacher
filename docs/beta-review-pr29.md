# Revisión de la beta tras PR #29

Fecha: 24 de octubre de 2026, aproximadamente 01:57–02:14 UTC.
Medición posterior en teléfono real: aproximadamente 02:50–03:00 UTC.
Entorno: beta Azure; autor en Comet y alumno en Chrome, con sesiones separadas.
Revisión por navegador asistida, usando las sesiones reales del propietario.
No equivale a una aceptación independiente por el propietario ni a una auditoría
completa de accesibilidad o seguridad.

## Despliegue

- Commit: `2812a6b5f19f7ba9b619ccda3d4c527dd0c88d76`.
- [CD 40051509145](https://github.com/GDriem/AITeacher/actions/runs/40051509145): success.
- Revisión verificada por CD: `ca-aiteacher-beta-8136--cd-40051509145-1`.
- Imagen: `sha256:7d33e5ae5ee269a73e607a15e165ac2ed2e03d757977461406c1dc99460ee577`.
- CI de main: success. CD comprobó HTTPS, readiness, shell React, worklet y
  fronteras 404; smoke Postman: 26 aserciones, 0 fallos.
- La revisión y el digest proceden del log del CD; no se consultó otra vez el
  estado de Azure durante el recorrido manual.

## Evaluación y flujo editorial

Material sintético: `PRUEBA ACEPTACIÓN 2026-10-24 PR29`, tema Tokens.
Unidad: `27034f8c-f1dc-41ad-855b-6360b0bc227c`.
Intento: `dc21a36e-feac-41ac-bc97-bebadda31b89`.

| Paso | Evidencia observada en la beta | Resultado |
|---|---|---|
| 6.1 | Editor por pasos: datos, concepto, objetivo, lectura, ejercicio y evaluación editorial; guardar borrador y recargar la ruta de revisión | Aprobado |
| Vista previa | Aprender y Practicar muestran el material; Evaluar explica que las evaluaciones entregables se crean después de publicar; no muestra criterios privados | Aprobado |
| 6.2 | Alumno abre `/api/units/{unitId}` antes de publicar: ProblemDetails con `status:404`, sin contenido del borrador | Aprobado para acceso directo; no se inspeccionó la lista antes de publicar |
| 6.3 | Autor revisa el diff y confirma publicación; alumno ve la unidad en Catálogo → Tokens y la abre | Aprobado |
| 6.4 / 3.1–3.2 | Autor crea pregunta abierta con guía privada y rúbrica de 1 punto, publica evaluación; alumno inicia, responde y confirma entrega | Aprobado |
| Antes de corregir | Alumno ve «Pendiente de corrección docente», sin nota ni guía privada; autor ve la entrega en su cola | Aprobado |
| 6.5 / 3.3 | Autor asigna 1/1 y comentario sintético, confirma; alumno ve 100 % y comentario; Historial → Consultar evaluación conserva el resultado | Aprobado |
| Cola tras corregir | «No hay entregas pendientes»; corrección registrada, campos deshabilitados | Aprobado |
| 6.6 | Tras autorización explícita del propietario, autor confirma retiro y ve «Publicación retirada»; alumno recibe 404 al abrir la unidad y el tema Tokens ya solo lista su lectura original; Historial conserva la evaluación con 100 % y comentario | Aprobado |

404 del borrador: `traceId 00-a1c3cf0bc8c4366473ea4c25646e4776-293cf147b00b1728-02`.
Entrega observada a las 02:04 UTC; corrección final a las 02:05 UTC.
Retiro y comprobaciones posteriores completados aproximadamente a las 02:13–02:14 UTC.
404 tras retiro: `traceId 00-cb05b55328bd19e45980dbea48929656-5fbd2ab9e283500b-02`.
Se registran estados de interfaz; no se capturaron códigos HTTP de las escrituras.
No se probaron en este recorrido opción única, política `never`, vencimiento,
reintentos ni todas las rutas de aislamiento entre cuentas.

## Revisión visual

- Inicio en oscuro y claro: tarjetas, textos, botones y enlaces legibles, sin
  desbordamiento visible en las vistas inspeccionadas.
- Tutor sin conversación: claro en escritorio y oscuro a 400 × 775 CSS px,
  mediante emulación responsive de Chrome, sin throttling. Título largo y
  navegación inferior se acomodan. No se enviaron turnos nuevos al tutor.
- Apuntes en oscuro a 400 px: tarjeta, acciones y pie de comentarios visibles.
- Esquemas comprobados con `prefers-color-scheme` en DevTools; no es una nueva
  certificación WCAG ni una prueba de todos los tamaños y estados.
- «Enviar comentarios de la beta» está presente en ambas sesiones y su destino
  es el `mailto:` configurado. No se envió correo ni se comprobó su entrega.

## Producto: observación y propuesta

| Tema | Estado observado | Propuesta pendiente de decisión |
|---|---|---|
| Aviso sobre dominio | Aparece en Inicio, Catálogo, tema, Apuntes e Historial con redacciones distintas | Mantener la explicación completa en un lugar y usar avisos breves donde el usuario interprete resultados |
| Evaluación editorial | El editor contiene consigna y criterios privados; la evaluación que inicia el alumno se publica en otra pantalla | Explicar la diferencia dentro del paso editorial y ofrecer un enlace a las evaluaciones entregables después de publicar |
| Mensaje de origen | El enlace de Apuntes abre una nueva pestaña bajo `/api/graphs/.../messages/...`, pero muestra HTML legible titulado «Mensaje de origen» | Corregir el pendiente que afirmaba que abre JSON; valorar navegación de regreso o integración en la app como mejora aparte |

El formato HTML del origen también está respaldado por `GraphEndpoints`:
negocia `Accept: text/html`, y `GraphService` usa `GraphHtml.Source`.
No se copiaron conversaciones ni información de las cuentas a esta evidencia.

## Rendimiento en teléfono real

Se completaron tres recargas completas por ruta en el dispositivo USB
`BVL-N49`, Chrome Android `155.0.8059.84`, con sesión de autor autenticada y
tema oscuro. El modelo corresponde a
[HONOR Magic6 Pro](https://www.honor.com/latam/support/phones/honor-magic6-pro/).
El propietario confirmó conexión **5G** y una velocidad indicada de **175**
(unidad y sentido de transferencia no especificados). Es un dato comunicado
por el propietario, no una prueba de velocidad capturada durante las seis
cargas. La versión de Android no quedó registrada.

Condiciones: caché de red desactivada mientras DevTools estaba abierto,
CPU y red sin throttling, screencast apagado durante las muestras. Se usó
«Record and reload» de Performance y se esperó a finalizar cada captura,
sin interacción con la página. Las seis sesiones quedaron en el historial
temporal del inspector (#1–#6); no se exportaron trazas con datos de cuenta.
El inspector que correspondía a la versión remota quedó vacío; las capturas
se hicieron con la opción «inspect fallback» de Chrome de escritorio.

Rutas:

- Inicio: `/`.
- Tutor: `/unidades/69b352a3-1840-4d5f-913c-0fcd3a01838d/tutor`,
  «Texto convertido en tokens», sin conversación iniciada.

| Ruta | LCP 1 | LCP 2 | LCP 3 | Mediana LCP | CLS 1 | CLS 2 | CLS 3 | Mediana CLS |
|---|---|---|---|---|---|---|---|---|
| Inicio | 1,59 s | 1,52 s | 1,76 s | **1,59 s** | 0,21 | 0,21 | 0,26 | **0,21** |
| Tutor sin conversación | 1,65 s | 1,66 s | 1,86 s | **1,66 s** | 0,35 | 0,26 | 0,26 | **0,26** |

Los valores son los redondeados mostrados por DevTools. Todas las muestras
de LCP están por debajo de la referencia de 2,5 s de
[web.dev](https://web.dev/articles/lcp). Es una serie local de seis cargas;
no representa el percentil 75 de la población de usuarios ni mide la latencia
de las respuestas de IA. INP no se midió porque no se interactuó durante las
capturas. La revisión de despliegue de referencia es la indicada al principio
del documento; no se volvió a consultar Azure durante las mediciones.

### Hallazgo: estabilidad visual

La mediana CLS de Inicio (0,21) necesita mejora y la del tutor (0,26) es mala
según los umbrales de [CLS](https://web.dev/articles/cls): bueno ≤0,1 y malo
>0,25. En la tercera captura de Inicio, DevTools identifica el peor grupo de
desplazamientos alrededor de 1,18 s y muestra «Animation» entre las causas
señaladas. Eso orienta la investigación; no demuestra por sí solo qué regla
de CSS o cambio de contenido provoca los movimientos.

Pendiente: identificar y corregir esos desplazamientos de carga, y repetir
la serie después del arreglo. El plan pide específicamente móvil de gama
media; esta medición acredita el dispositivo BVL-N49 disponible, sin demostrar
equivalencia con esa categoría. Por esos límites y el hallazgo CLS no se
declara cerrada la fase 4.

La unidad sintética quedó retirada; se conservan el borrador, las revisiones y
la entrega. El recorrido editorial de creación a retiro quedó comprobado.
Las decisiones de producto anteriores son propuestas, sin cambios de
implementación en esta revisión.


## Corrección local de estabilidad de carga (24 de octubre de 2026)

Rama de trabajo: `fix/beta-loading-layout-shifts`. Se conservaron los cambios
locales previos de `.gitignore`, este documento, `azure-beta-acceptance.md` y
`ui-ux-beta-plan.md`. Al preparar la PR se actualizó `origin/main` por terminal
hasta el merge desplegado `2812a6b5f19f7ba9b619ccda3d4c527dd0c88d76` y se
rebasó la corrección sin conflictos. La comparación de GitHub confirmó que
ese merge no cambia archivos respecto a `5c8223b`, la base de las pruebas.
El diff contra main contiene solo la corrección, las pruebas y la evidencia.
No se hizo merge de esta corrección ni se desplegó.

### Causas identificadas

Se instrumentaron recargas completas con `PerformanceObserver` para
`layout-shift` (sin entradas con interacción reciente) y
`largest-contentful-paint`, sobre Chromium local y el host .NET de pruebas.
La primera reproducción, con Vite de desarrollo a 400 × 850 CSS px, oscuro,
obtuvo CLS **0,381 en Inicio** y **0,304 en tutor**. Es diagnóstico local,
no una repetición ni una comparación controlada con las muestras del HONOR.

- **Arranque compartido:** el margen superior de 4 rem de `.boot` colapsaba
  a través de `#root` hasta `body`. Las fuentes del desplazamiento registraron
  `BODY` pasando de y=0 a aproximadamente 63/64 px y de vuelta a y=0 al montar
  la sesión. Cada movimiento aportó aproximadamente 0,075 a CLS. Se contiene
  ese margen con `display: flow-root` en `#root`.
- **Inicio:** el skeleton de Continuar se reemplazaba por un primer recorrido
  mucho más alto. En la reproducción, `.spaces` bajó de y=442,7 a y=694,9;
  también se desplazaban la segunda tarjeta y los accesos inferiores. Las
  consultas de repasos e intentos podían resolver por separado y volver a
  cambiar las alturas. Ahora el encabezado aparece pronto y el bloque de
  contenido se monta una vez resueltas las consultas iniciales necesarias,
  incluyendo la definición cuando se retoma una evaluación. Se mantienen las
  consultas independientes en paralelo y los errores con reintento.
- **Tutor:** durante la consulta de unidad/disponibilidad, el pie ocupaba el
  hueco del contenido (y=196 en la reproducción) y después salía de la vista;
  su entrada aportó aproximadamente 0,144. El marco reserva al menos la altura
  de la ventana pequeña menos la cabecera (4 rem móvil / 5 rem escritorio),
  de modo que el pie no se adelanta al contenido pendiente.
- **Migas asíncronas:** «Tema» se reemplazaba por el nombre real del tema;
  las migas largas cambiaban de línea. Se registraron dos `LI` moviéndose y
  una contribución de aproximadamente 0,010. El tutor resuelve también el
  tema antes de montar el encabezado. Si falla, conserva la miga genérica.

Las fuentes son locales/del sistema (`Segoe UI`, `system-ui`); no hay descarga
ni intercambio de webfonts en estas rutas. El shimmer anima
`background-position`, sin cambiar dimensiones; los puntos del tutor animan
opacidad/transform y no aparecen en el tutor vacío. La pista «Animation» de
la captura real no demuestra que esas animaciones causaran el CLS. La
corrección mantiene las animaciones y la preferencia de movimiento reducido;
las fuentes registradas localmente fueron las indicadas arriba.

### Validación y reproducción

La regresión `estabilidad de carga: Inicio y tutor sin conversación` en
`frontend/e2e/backend.spec.ts` mide ventanas CLS de hasta 5 s, separadas por
1 s sin desplazamientos, además de LCP. Usa APIs .NET y PostgreSQL reales con
cuentas y contenido sintéticos del host existente. `route.fetch()` obtiene
las respuestas reales; su entrega se demora 200 ms, 450 ms para repasos y
650 ms para el tema, para separar las transiciones. Son demoras artificiales
de respuesta, no una simulación de 5G. La caché se desactiva con CDP; no hay
throttling de CPU/red. Se comprueban ambos temas y 320/768/1024/1440 × 850 px,
con tres muestras a 320 px y una en los demás tamaños por escenario/tema.
Incluye Inicio inicial, Inicio con conversación y tutor sin conversación;
axe, overflow horizontal y errores de JavaScript forman parte de la prueba.

El modo `AITEACHER_TEST_PREVIEW=1` de `playwright.backend.config.ts` construye
la aplicación y sirve sus assets de producción local con Vite preview.
Reproducción desde `frontend/`, con PostgreSQL local y las variables
`AITEACHER_TEST_POSTGRES` y `AITEACHER_TEST_AI_URL` del host documentadas en
`backend/README.md` / `backend/TUTOR.md`:

```sh
# Antes, desde la raíz, iniciar la simulación existente:
/Users/gadiorellana/.local/bin/postman simulation run postman/simulations/tutor.sim.yaml --port 4900 --output ndjson
# En otra terminal, desde frontend/:
AITEACHER_TEST_PREVIEW=1 corepack pnpm test:backend --grep 'estabilidad de carga'
```

Se usó la skill `postman:api-simulation`
para reutilizar la simulación versionada de proveedores. El frontend y la API
se ejecutan realmente; esta prueba de carga vacía no invoca generación de IA.
Las pruebas funcionales del tutor sí requieren ese proveedor simulado. No se
prueba aquí latencia ni calidad del proveedor de IA real.

Resultados de la ejecución aislada sobre producción local:

| Escenario | Cargas | CLS (todas) | Rango LCP |
|---|---|---|---|
| Inicio, primer uso | 12 | 0 | 0,536–1,044 s |
| Inicio, con conversación | 12 | 0 | 0,532–1,004 s |
| Tutor sin conversación abierta | 12 | 0 | 1,404–1,440 s |

Las 24 combinaciones escenario/tema/ancho pasaron axe WCAG 2 A/AA y 2.1 AA,
sin overflow horizontal ni errores de JavaScript. Se inspeccionaron capturas
completas de Inicio móvil (primer uso oscuro y con actividad claro) y tutor
móvil oscuro/escritorio claro. Son capturas locales con datos sintéticos;
las capturas temporales están bajo `/tmp/aiteacher-cls-*`.

`typecheck`, `lint`, 114 tests Vitest en 21 archivos, `build:backend` y
`budget:check` pasaron. Todas las rutas quedaron dentro de presupuesto.
El bloque de Inicio espera a la consulta inicial más lenta; el encabezado y
el marco permanecen visibles, y no se añade ninguna espera por temporizador
al producto. La consulta de tema añade dependencia al contenido del tutor:
es el coste deliberado de evitar que las migas cambien de altura. La LCP
local con su respuesta demorada 650 ms se mantuvo bajo el objetivo.

La suite completa final sobre el mismo modo de producción local pasó:
**9 tests Playwright en 3,2 minutos**, incluyendo teclado/foco/Atrás,
publicación/evaluación/retiro, repaso histórico, recuperación del tutor sin
duplicados y compositor visible sobre la barra móvil. Su nueva serie de
36 cargas obtuvo CLS 0 en todas; LCP: Inicio inicial 0,544–1,012 s,
Inicio con conversación 0,536–1,004 s y tutor 1,412–1,436 s. En esa ejecución
Inicio inicial puede contener la actividad creada por los tests anteriores;
el primer uso se cubrió en la ejecución aislada de la tabla. El log de la
simulación registró 17 solicitudes reales a los proveedores simulados durante
los recorridos funcionales, sin llamar a IA externa.

### Límites y aceptación pendiente

Chrome mostraba información USB antigua del BVL-N49; al actualizar
`chrome://inspect/#devices` ya no listó el teléfono. No se pudo medir el
arreglo en ese dispositivo. Las cifras locales no acreditan rendimiento en
Android ni cobertura de gama media. Para aceptar la corrección desplegada:

1. Revisar la nueva PR, ejecutar CI y desplegar solo con autorización posterior.
2. Registrar commit/revisión desplegados y repetir tres recargas completas de
   cada URL del apartado anterior en el HONOR, con sesión de autor, oscuro,
   caché desactivada, sin throttling y screencast apagado, sin interacción.
3. Conservar LCP y CLS por muestra, medianas y fuentes de cualquier salto;
   objetivo CLS ≤0,1 y LCP ≤2,5 s en ambas rutas bajo condiciones comparables.
4. Cubrir además un teléfono de gama media y documentar modelo/Android/red.
   La fase 4 y la aceptación final del propietario siguen abiertas.

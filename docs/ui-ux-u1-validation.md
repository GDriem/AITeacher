# U1 — Controles y navegación

Implementación del 8 de noviembre de 2026, en `feat/ui-ux-u1-controls`, sobre
`81a7aef`. Desarrolla U1 del [plan vigente](ui-ux-improvement-plan.md).
La [base U0](ui-ux-baseline.md) conserva el registro anterior.

## Cambios y criterios

| Hallazgo | Resolución |
| --- | --- |
| F01 · límites de campos | `--border-control` separa los controles de los bordes estructurales. Se aplica a input/select/textarea de Shared y al compositor .NET. |
| F03 · nombres del autor | A menos de 28 rem, los seis destinos del autor forman dos filas de tres. Se conserva la letra, el texto, las URLs y la navegación de cinco destinos del alumno. |
| F04 · pestaña activa | Tabs desplaza únicamente su barra al cambiar selección o tamaño. La etiqueta larga admite reflujo y el foco se dibuja dentro del área visible. Autoría conserva el foco de flechas/Home/End; Siguiente/Anterior enfocan el título del paso. |
| F05 · estados | Hover queda limitado a punteros compatibles. Selección y ubicación añaden borde de acción y subrayado; foco conserva su outline independiente. La pulsación tiene respuesta inmediata sin mover el control. |

La altura móvil compartida también gobierna el acceso fijo al tutor, su aviso de
fallo, compositor, mapa, pie y avisos. La primera ejecución integrada detectó el
solapamiento del acceso al tutor con la segunda fila; se corrigieron todos los
consumidores de la altura anterior antes de repetir la validación.
`UnitEditor.tsx`, `UnitSpace.module.css` y `Toast.module.css` amplían la lista
inicial de archivos por estas dependencias reales, sin cambiar los recorridos
ni los contratos. No se modifica Inicio ni la composición del tutor.

Contraste calculado por luminancia sRGB a partir de tokens opacos; la regresión
E2E además compone los fondos reales de los campos visibles y compara borde con
interior y exterior. Los bordes de estructura permanecen iguales.

| Tema | Borde / interior | Borde / lienzo | Borde / superficie | Borde / superficie elevada |
| --- | ---: | ---: | ---: | ---: |
| Oscuro | 4,95:1 | 5,19:1 | 4,75:1 | 4,29:1 |
| Claro | 3,31:1 | 3,44:1 | 3,73:1 | 3,22:1 |

## Patrón compartido para acciones

- **Primaria:** siguiente acción principal del contexto. **Secundaria:** acciones
  alternativas; **ghost:** acciones de menor énfasis. **Danger:** confirmar una
  operación destructiva, con su consecuencia expresada en texto.
- **Pendiente:** usar el estado de la mutación real para deshabilitar el envío y
  cambiar la etiqueta («Guardando…», «Preparando respuesta…»); marcar `aria-busy`
  en la región afectada. No añadir una espera mínima ni borrar el texto antes del
  éxito. `aria-disabled` por sí solo no impide activar un enlace.
- **Éxito:** anunciar el resultado en una `ToastRegion` montada antes del cambio;
  conservar la información de guardado junto al contenido cuando sea persistente.
  Describir el alcance real: borrador de esta pestaña o respuesta del servidor.
- **Error:** mantener datos editables y mostrar recuperación con `Failure` o
  `ErrorState`. Los errores de campo conservan etiqueta, ayuda y `aria-invalid`.
- **Confirmación:** usar el `Dialog` existente para decisiones que lo necesitan;
  Escape cancela y el foco regresa al control que lo abrió. Conservar el control
  que recibe el foco o elegir un destino lógico si desaparece tras la operación.
- **Selección/foco/pulsación:** atributos ARIA describen el estado persistente;
  el hover no lo simula. El foco no depende de hover. No se añade animación ni
  dependencia; las pestañas cambian de inmediato también con movimiento reducido.

Este patrón prepara F06. Aplicarlo a crear, editar y eliminar Apuntes, y resolver
F02/F07 en Repasos, corresponde a U4.

## Validación y evidencias

| Comprobación | Resultado |
| --- | --- |
| TypeScript, ESLint y diff | Aprobados |
| Vitest | 114 pruebas, 21 archivos, aprobados |
| Build .NET y presupuesto | Aprobados; beta 68,86/120 kB gzip; autoría 28,25/30 kB |
| Playwright .NET | Los 10 recorridos previos aprobados en la serie integrada; U1 y su preparación editorial aprobados en la repetición dirigida (2/2, 1,3 min) |
| Axe | Sin violaciones en los estados cubiertos por los recorridos existentes |
| Geometría y contraste | Campos reales, nombres completos y pestaña activa comprobados a 320/768/1024/1440 px, ambos temas; compositor también en contexto táctil emulado |
| Teclado y tacto | Flechas/Home/End, Siguiente/Anterior, URL/recarga, foco interior, etiqueta larga, movimiento reducido, diálogos y seis destinos con tap, aprobados |
| Build Python y presupuesto | Aprobados; shell 57,02/70 kB gzip |
| Playwright Python | 50/50 aprobados en 30,5 s; dos workers, puerto y resultados separados del runner .NET |
| Detector de archivos modificados | Aprobado, sin hallazgos (`[]`); se ejecutó una vez |

La serie integrada terminó con los diez casos existentes aprobados y una
aserción incorrecta del guion nuevo: pulsar Inicio estando en Inicio no cambia
la ruta ni debe volver a enfocar el título. Se ajustó el orden para visitar
rutas distintas; la repetición dirigida terminó 2/2. No fue necesaria otra
modificación de aplicación después de esa serie. Los 11 recorridos quedan
cubiertos entre las dos ejecuciones; no se presenta como una única ejecución
11/11. La serie Python utiliza respuestas simuladas de sus pruebas existentes.

Las 36 muestras locales de carga mantienen **CLS 0**, con **LCP 536–1432 ms**.
[Datos de rendimiento](ui-ux-u1/performance.json). No son percentiles de usuarios
reales ni una mejora atribuible a U1.

Se conservan 21 imágenes y 51 registros de geometría en
[el manifest](ui-ux-u1/manifest.jsonl), con
[identidad de fuentes](ui-ux-u1/source.json) y
[resultado del detector](ui-ux-u1/detector.json). Muestras inspeccionadas:

- Autoría y pestaña editorial: [claro, 320 px](ui-ux-u1/autoria-evaluacion-editorial-light-320.png),
  [oscuro, 320 px](ui-ux-u1/autoria-evaluacion-editorial-dark-320.png).
- Navegación de escritorio: [claro, 1440 px](ui-ux-u1/autoria-lista-light-1440.png).
- Foco de teclado con movimiento reducido: [Revisión, 320 px](ui-ux-u1/u1-pestana-foco-reduce-light-320.png).
- Compositor sobre la navegación del autor: [claro, 320 px](ui-ux-u1/u1-compositor-autor-tactil-light-320.png).

Para reproducir, usar los prerrequisitos y comandos de la
[base U0](ui-ux-baseline.md#reproducción), con un directorio de evidencias nuevo.
La regresión U1 queda en `backend.spec.ts` y `uiControls.ts`; ejecutar la batería
completa conserva la preparación de datos de todos los casos. La repetición
dirigida usó `test:backend -g 'recorrido editorial|U1:'`.

Los consumidores de Button/Tabs y Toast del código actual están en el build
.NET. Python comparte los tokens, pero no utiliza estos controles; mantiene su
tema oscuro y sus componentes existentes. Se comprueban su build y recorridos
para detectar efectos compartidos accidentales.

Las capturas se toman en Chromium local con BrowserHost, PostgreSQL aislado y
la simulación HTTP existente. No acreditan pruebas en un teléfono físico ni un
estudio con personas. `manifest.jsonl` registra rutas, temas y tamaños; el campo
`commit` es la base previa al cambio. `source.json` identifica los archivos de UI
exactos por SHA-256 porque la captura precede al commit de cierre. Una imagen
fullPage incluye la barra fija en la posición del viewport de captura.

No se repite toda la batería de backend/Postman: no cambiaron backend ni
contratos. Los recorridos integrados sí ejercitan API local, persistencia,
permisos, evaluación, tutor y recuperación.

Quedan para U6/dispositivo real: zoom nativo al 200 %, lector de pantalla manual,
teclado móvil físico y aceptación de comprensión por personas. El reflujo local
a 320 px, el foco programático y axe no se presentan como sustitutos de esas
comprobaciones. No se desplegó esta fase.

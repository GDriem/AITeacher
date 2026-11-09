# Skills de UI para AITeacher

Decisión del 8 de noviembre de 2026: usar las skills de Emil Kowalski como
referencia principal de interacción y acabado, Impeccable para revisión y
pulido por superficie, y UI UX Pro Max como consulta de patrones. Esta
instalación prepara el trabajo futuro; no inicia un rediseño.

El trabajo previsto se organiza en el
[plan de mejora de UI y UX](ui-ux-improvement-plan.md), preparado para retomarse
por fases en una próxima sesión.

## Selección y encaje

| Fuente | Uso recomendado en AITeacher | Límite |
| --- | --- | --- |
| [Emil Kowalski](https://github.com/emilkowalski/skills) | Detalles de controles, movimiento, tacto, rendimiento y contenido extremo. Es la mejor coincidencia con una aplicación de aprendizaje usada repetidamente. | Sus preferencias estéticas son criterios para evaluar, no requisitos universales. |
| [Impeccable](https://github.com/pbakaus/impeccable) | Revisar una ruta o componente con `audit` y `critique`; aplicar `polish` cuando se solicite. Distingue superficies de operación y lectura de las de marketing. | Incluye un motor ejecutable y flujos que pueden editar archivos; instalarlo no equivale a ejecutar esos flujos. |
| [UI UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) | Consultar referencias concretas de UX, accesibilidad, tipografía y React mediante su buscador local. | Un catálogo no decide por sí solo la identidad del producto; evitar generar un sistema visual nuevo para cada pantalla. |

Skills de Emil instaladas: `emil-design-eng`, `animate`, `review-animations`,
`remove-animations`, `animation-performance`, `mobile-native` y `break-ui`.
Las últimas seis se cargan cuando la tarea las requiere. No se instalaron
las específicas de Swift, Expo o Sonner, ni todas las herramientas de
exploración: el proyecto utiliza React con Vite, CSS y componentes propios.

Se conservan `frontend-design`, `frontend-ui-engineering` y
`vercel-react-best-practices`. La primera sirve para dirección visual cuando
se pida; las otras dos siguen cubriendo implementación, accesibilidad y
rendimiento. Cargar todas las skills a la vez produciría duplicación y
criterios contradictorios.

## Prioridad para el trabajo futuro

1. El pedido del usuario, el flujo de aprendizaje y el comportamiento
   establecido de AITeacher delimitan el cambio.
2. Accesibilidad, teclado, foco, movimiento reducido, legibilidad y estabilidad
   de carga prevalecen sobre efectos estéticos. Mantener los presupuestos de
   rendimiento y las comprobaciones de ambos temas.
3. Conservar los tokens y componentes actuales en tareas de pulido. Un cambio
   de identidad requiere una tarea de rediseño explícita.
4. Usar Emil para decidir si una interacción necesita movimiento y cómo
   ejecutarlo. Por ejemplo, Pro Max desaconseja cambios instantáneos de forma
   amplia, mientras Emil recomienda eliminar animación en acciones frecuentes:
   resolver según el uso real, sin añadir demoras a tareas repetidas.
5. Usar Impeccable para una revisión acotada y Pro Max para una consulta
   concreta. Sus recomendaciones no sustituyen observar el resultado ni
   probar teclado, móvil y lectores de pantalla cuando corresponda.

No se agregan Motion, GSAP, Tailwind ni librerías de componentes por instalar
estas skills. Cualquier dependencia futura debe justificarse por la tarea.

## Instalación y mantenimiento

Las nueve skills se encuentran en `.agents/skills/`, versionadas con el
proyecto. `ui-skills.lock.json` registra repositorios, commits, rutas de origen,
licencias y adaptaciones. Se utilizó el instalador de skills de Codex con
commits fijos; para Impeccable se eligió la distribución para Codex que su
README permite copiar manualmente. No se usó el marketplace de Claude.

Las licencias MIT de Emil y Pro Max y Apache-2.0 de Impeccable, junto con su
NOTICE, acompañan las copias. Se adaptaron los ejemplos de Pro Max para
resolver el directorio de la skill en Codex. El buscador usa Python y datos
locales, sin añadir dependencias al frontend.

Al preparar la integración de U7 se eliminaron espacios finales y una línea
vacía final en cuatro archivos importados, registrados con sus hashes nuevos
en el lock. `.gitattributes` reconoce CRLF en el launcher Windows de Impeccable
sin modificarlo ni desactivar las demás comprobaciones de whitespace.

Impeccable conserva su launcher y manifiesto de checksums. Su motor fijado es
`0.1.19`; la primera ejecución lo descarga a la caché de usuario y verifica
SHA-256. El launcher local establece `IMPECCABLE_LIVE_COPY_AGENT=chat` por
defecto: según su README, el modo Live sin esta configuración puede iniciar
un agente CLI externo con el sandbox y las aprobaciones desactivados. Mantener
el valor `chat` u `off` en este proyecto. La telemetría está desactivada en
`.impeccable/config.json`. No se activaron hooks automáticos ni se registraron
subagentes propios de Impeccable; sus plantillas vienen incluidas en la copia.

Para actualizar, revisar el diff del proveedor, instalar el commit elegido
en un directorio temporal, conservar las adaptaciones y licencias, actualizar
el lock y repetir las verificaciones de instalación. No reemplazar las copias
con `latest` sin revisar los cambios.

## Organización futura con modelos

Preferencia del usuario: cuando comience la fase de diseño, Astra dirige la
evaluación global, las decisiones y la integración; Terra o SOL pueden
implementar tareas delimitadas, y Luna puede apoyar con inventarios o
comprobaciones mecánicas. Esta es una distribución de trabajo propuesta,
no una afirmación de superioridad medida entre modelos.

Seleccionar los modelos disponibles al iniciar esa fase. Cada tarea delegada
debe tener alcance, archivos y criterio de aceptación propios; la revisión
final de coherencia queda con quien orquesta. No se cambiaron modelos ni se
iniciaron agentes durante la instalación.

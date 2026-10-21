# CI y revisión de confidencialidad — 21 de octubre de 2026

La entrega conserva los 15 commits locales anteriores y agrega los cambios
pendientes de React/.NET, pruebas e infraestructura. La PR incluye ese historial;
no cierra los hitos ni acredita las aceptaciones pendientes de la beta.

## Comprobaciones automáticas

`.github/workflows/ci.yml` corre en pull requests, pushes a `main` y ejecución
manual. Tiene permisos de lectura del repositorio y cancela ejecuciones superadas
de la misma rama. No despliega, no publica contratos y no usa secretos cloud.

- Gitleaks 8.30.1 revisa el historial completo con resultados redactados.
- actionlint 1.7.12 valida GitHub Actions. Se deshabilita su integración opcional
  con ShellCheck; los scripts de despliegue tienen validación `bash -n` separada.
- Ambas herramientas se descargan de sus releases oficiales, con versión y
  SHA-256 fijados y verificados antes de ejecutar.
- Python instala los extras de pruebas y ejecuta la suite completa.
- React valida tests, TypeScript, ESLint, builds Python/.NET, tamaños de bundles
  y sincronización de tipos del contrato .NET.
- .NET usa PostgreSQL 17 efímero, proveedores HTTP simulados por Postman, lint
  de OpenAPI/colecciones, smoke HTTP y dos recorridos Chromium. Los usuarios y
  datos son sintéticos; las bases aleatorias se eliminan al terminar.
- Postman se fija en 1.75.0, sin login ni publicación a workspaces. La simulación
  no guarda historial; el smoke deshabilita el envío de eventos de reportes.

## Confidencialidad

Se escanearon los commits anteriores y el contenido exacto preparado en Git.
No se encontraron credenciales reales con Gitleaks. El historial completo produjo
una alerta sobre una instrucción de sustitución en español de `APP_SESSION_SECRET`
en un ejemplo antiguo del README. `.gitleaksignore` exceptúa únicamente el
fingerprint de esa línea de ese commit; no exceptúa el archivo ni la regla.

Se revisaron además patrones de claves privadas, tokens y correos en los archivos
de la entrega. Los correos de las pruebas son ficticios (`example.test`). Los IDs
de recursos, tenant, aplicaciones y proyectos que documentan la beta son metadatos
de configuración, no credenciales. Se conservan para reproducir la infraestructura.

`.env`, credenciales ADC, parámetros privados, estado `.azure/`, sesiones
`.copilot-azure/`, `.aws/`, claves y certificados quedan fuera de Git. `.azure/`
se preserva localmente. El registro de comandos conserva comandos/estados y
sustituye las rutas personales por variables; no contiene respuestas, tokens,
cookies ni conversaciones de alumnos.

La comprobación es detección de secretos y revisión de la entrega; no equivale
a una auditoría exhaustiva de seguridad de toda la aplicación.

## Incidencia encontrada en el primer CI remoto

Linux expuso dos pruebas sensibles a la precisión de reloj: PostgreSQL persiste
`timestamp with time zone` con microsegundos, mientras `DateTimeOffset` puede
llevar ticks de 100 ns. Las respuestas JSON de un intento cambiaban en el reintento
y un `DueAt` recuperado de la base difería del valor enviado, provocando `409`.
`PostgresTimestamp` recorta los tiempos escritos a microsegundos y los dos casos
reproducen el reloj sub-microsegundo explícitamente. La semántica observable del
API ahora es estable entre escritor, PostgreSQL y reintento.

## Resultado local

- Python: 274 pruebas aprobadas (tres advertencias de dependencias).
- Frontend: 44 pruebas aprobadas; typecheck, lint, ambos builds, budgets y tipos
  OpenAPI aprobados.
- .NET: 90 pruebas API y 9 de dominio aprobadas, sin omisiones; host de navegador
  compilado sin errores ni advertencias.
- Postman: OpenAPI y ambas colecciones sin incidencias; 25/25 aserciones smoke.
- Chromium: dos recorridos aprobados sobre PostgreSQL real y proveedores simulados.
- actionlint, `bash -n`, escaneo de secretos y `git diff --check`: aprobados.

Estos resultados se obtuvieron localmente. La ejecución remota de GitHub Actions
se comprueba en la PR; no se confunde con la validación local.

## Estado funcional que se conserva

Tutor de texto y Summary verificados en Azure, revisión `0000009`, con Vertex
federado. Voz deshabilitada. Segunda identidad Google, fallo/recuperación operativos,
autoría y voz humana siguen pendientes. El rediseño UI/UX queda para otra entrega.
Ver [evidencia vigente del tutor](azure-tutor-enablement.md).

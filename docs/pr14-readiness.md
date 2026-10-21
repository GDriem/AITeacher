# Correcciones y auditoría de la PR #14

Head inicial: `92ecdbefcd6a59b3e792802b1022fb4286e9731c`.
Revisiones y todos los comentarios consultados antes de editar: dos hilos bloqueantes,
sin comentarios de conversación adicionales. CI inicial: cuatro checks aprobados.

## Fases

1. Recuperación del tutor: contrato autenticado del turno pendiente, recuperación en
   React y pruebas de caída/recarga, lease, aislamiento, idempotencia y fencing.
2. Repasos históricos: iniciar la definición fijada con requestId estable, abrir el
   intento y comprobar R1 → evidencia → repaso → R2 → vencimiento → entrega/corrección
   → finalización, con permisos y límites existentes.
3. Validación y auditoría final: revisar diff completo contra merge base y delta de
   correcciones, ejecutar suites locales con PostgreSQL y simulaciones Postman,
   subir commits sin force-push, verificar CI y responder/resolver hilos verificados.

Cada fase se valida y se registra en un commit separado. No se despliega ni se
utilizan proveedores cloud reales. La auditoría final no aprueba ni fusiona la PR.

## Fase 1 verificada

- 18/18 pruebas API del tutor con PostgreSQL y simulación HTTP Postman.
- Caída simulada después de reserva y respuesta HTTP: reinicio del host, lectura
  autenticada, rechazo durante lease, recuperación tras vencimiento y replay sin
  duplicados. Anónimo 401 y otras cuentas/autor 404.
- Prueba existente de respuesta tardía actualizada para recuperar desde el nuevo GET.
- Prueba React de remontaje con caché nueva y reintento 409: 1/1.
- TypeScript y ESLint sin incidencias; OpenAPI y ambas colecciones Postman válidos.
- Diff revisado, sin migración requerida.

## Fase 2 verificada

- Inicio desde el repaso con su definición exacta y requestId estable entre
  reintentos; se selecciona y abre el intento devuelto y se actualiza el historial.
- La acción se habilita al llegar a dueAt sin recargar.
- 2/2 pruebas API históricas (cerrada y rúbrica), más 6/6 pruebas avanzadas
  existentes: R1, evidencia, repaso, publicación R2, inicio desde dueAt, entrega,
  corrección cuando corresponde y finalización idempotente.
- Se verifican límite de intentos, propietario, permisos docentes y rechazo de
  intentos anteriores, de R2, sin corrección o ya usados en otro repaso.
- React: 2/2 pruebas nuevas; TypeScript y ESLint sin incidencias.
- Chromium: 5/5 recorridos contra .NET/PostgreSQL y simulación HTTP reales,
  incluidos caída/recarga del tutor y ambos tipos de repaso histórico.
- Colecciones Postman válidas; recorrido histórico documentado. No cambia el
  contrato de inicio de intentos ni requiere migraciones.

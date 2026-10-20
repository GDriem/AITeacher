# Hito 7: ensayo de migración histórica

Incremento local: importar snapshots congelados de conversaciones y progreso Python
en PostgreSQL, conciliarlos y revertir exclusivamente el lote del ensayo.
El escritor de producción continúa en Python hasta el hito 8.

## Contrato y decisiones

Snapshot JSON v1: `{schemaVersion:1,batchId:<uuid>,source:<nombre>,documents:[]}`.
Cada documento contiene `{kind,id,studentId,payload}`; `kind` es `conversation`
o `progress`, `id` es el ID original y `studentId` debe coincidir con
`payload.student_id`. Para conversaciones también coincide `payload.id`.
Se conservan el JSON original, IDs, propietarios, mensajes, fuentes, fechas,
evaluaciones y resultados; no se recalculan resúmenes durante la exportación.
El exportador valida con los modelos Python existentes sin serializarlos de nuevo.

Importar valida todo el lote antes de escribir, usa una transacción y guarda
huellas SHA-256 canónicas (objetos ordenados, orden de arrays conservado).
Repetir el mismo lote es idempotente. Cambiar su contenido o reutilizar IDs de
la misma fuente en otro lote activo produce conflicto sin escrituras parciales.
Cada lote tiene propiedad exclusiva de sus filas; la reversión mantiene su recibo
y elimina solo sus documentos. Un lote revertido no se reactiva: se usa otro ID.
Conciliar vuelve a comparar propietario, IDs, huellas y cantidades de documentos,
mensajes y evaluaciones; una diferencia debe impedir continuar al corte.

Lecturas con sesión y `Cache-Control: no-store`:

- `GET /api/history/conversations?offset=0&limit=50`: página de metadatos históricos.
- `GET /api/history/conversations/{id}`: metadatos, sin cuestionarios privados.
- `GET /api/history/conversations/{id}/messages?offset=0&limit=50`: mensajes
  originales ordenados, con IDs, contenido, etiquetas, fuentes y fechas.
- `GET /api/history/progress?offset=0&limit=50`: documentos de progreso originales
  del alumno, etiquetados `legacyUncalibrated`; no generan evidencia moderna.

`id` en estas rutas es el UUID interno del archivo; las respuestas incluyen
`source` y `sourceId` para conservar la identidad original. Paginación máxima 100,
offset no negativo; errores 400, 401 y 404 mediante ProblemDetails. Un autor no
puede leer el historial ajeno. No existen escrituras HTTP de historial.

Las conversaciones antiguas no tienen revisiones editoriales ni IDs de intentos
compatibles. Se conservan como historial privado de solo lectura. Las actividades
pendientes y las respuestas idempotentes originales permanecen en el archivo
administrativo y nunca se entregan al navegador ni se ejecutan automáticamente.
Continuar esas actividades necesita una decisión explícita de equivalencia editorial.
Las notas/relaciones que puedan existir en mensajes se preservan como datos originales.

## Aceptación todavía pendiente

Este incremento no cierra el hito 7: faltan snapshot de Firestore autorizado y
congelado, conciliación con datos reales, continuidad editorial de actividades,
integración React y voz con modelos reales. No se modifica Firestore ni Azure.
La calibración docente del hito 6 permanece pendiente.

El ensayo de corte debe detener entradas nuevas, drenar chat/entregas/voz y confirmar
que no quedan leases activos antes de tomar el snapshot. Los registros temporales
`*_chat_requests` no se trasladan como leases ejecutables. Se conserva un backup
de esas colecciones antes del corte real. Un export entre colecciones sin congelar
es solo un ensayo, no un snapshot transaccional de producción.

Voz sigue en el servicio Python: validar login real, aislamiento del contexto,
dos turnos, interrupción, reconexión, liberación de cupos y fallo del proveedor.
Registrar proveedor/modelo, fecha y latencias sin audio ni texto sensible.
Retirar escritores por funcionalidad solo después de activar su ruta .NET y
verificar lecturas/escrituras. No retirar Python mientras aloje voz o actividades
sin equivalencia. La reversión del archivo de ensayo no transforma escrituras
nuevas de .NET a Firestore; esa reversión de producción pertenece al hito 8.

## Reproducir el ensayo

Trabajar sobre copias congeladas de los mapas JSON de `LocalSessionRepository`
(`id → StoredConversation`) y `LocalProgressRepository` (`student_id → StudentProgress`).
Un backup nativo de Firestore no tiene ese formato: falta implementar/validar su
extracción autorizada a mapas. No abrir el repositorio de sesiones para exportar:
una lectura normal puede purgar conversaciones vencidas. Se incluyen archivadas.

Desde la raíz, con el entorno Python del proyecto:

```sh
.venv/bin/python backend/scripts/prepare-history-import.py \
  --sessions /ruta/privada/sessions.json --progress /ruta/privada/progress.json \
  --source ensayo-local --batch-id 10000000-0000-0000-0000-000000000007 \
  --output /ruta/privada/history.json
```

El archivo se crea con permisos 0600 y no sobrescribe archivos existentes.
Guardar snapshots fuera de Git; contienen cuestionarios privados y datos de alumnos.
La exportación exige ambos mapas; usar `{}` explícitamente para uno sin documentos.
No puede importar un lote completamente vacío.

Desde `backend/`, configurar `ConnectionStrings__Postgres` para una base de ensayo
vacía y `ASPNETCORE_ENVIRONMENT=Development`. No usar la base productiva.

```sh
dotnet run --project src/AITeacher.Api --no-build --no-launch-profile -- --migrate
dotnet run --project src/AITeacher.Api --no-build --no-launch-profile -- --history import /ruta/privada/history.json
dotnet run --project src/AITeacher.Api --no-build --no-launch-profile -- --history reconcile /ruta/privada/history.json
# Repetir import con el mismo archivo conserva IDs y cantidades.
dotnet run --project src/AITeacher.Api --no-build --no-launch-profile -- --history rollback 10000000-0000-0000-0000-000000000007
```

Los comandos históricos están limitados a Development; importar no aplica
migraciones implícitas. Import/reconcile emiten únicamente un informe con
`matches`, cantidades esperadas y reales; salida 2 para error o discrepancia.
Tras rollback, reconcile debe salir 2. Rollback es idempotente y conserva el recibo.
Los comandos usan el acceso administrativo a PostgreSQL, no permisos del navegador.
El bloqueo transaccional serializa las operaciones de migración entre procesos;
las actualizaciones SQL de documentos históricos también se impiden por trigger.

Para ensayar HTTP, arrancar el host sobre esa base e iniciar sesión con Google.
La colección `api/history` captura `historyConversationId` de la primera fila;
si está vacía, importar primero un historial que pertenezca a esa identidad.
Los mensajes están paginados para no enviar conversaciones completas por defecto.

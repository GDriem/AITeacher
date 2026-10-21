> Estado vigente del tutor, 21/10/2026: texto/Summary habilitados en Azure con
> WIF, dos turnos, fuentes válidas y apuntes persistentes con una cuenta Google real.
> [Evidencia y pendientes](../docs/azure-tutor-enablement.md). El hito 7 sigue abierto:
> faltan segunda identidad real, autoría, fallos operativos, voz y continuidad editorial.

# Hito 7: ensayo de migración histórica

## Estado vigente: corpus publicado y recorrido de lectura — 21 de octubre de 2026

El hito 7 **permanece abierto**. Esta continuación cierra la importación/publicación
del corpus y su descubrimiento en la beta, no la continuidad de actividades,
la aceptación completa de IA/voz ni el corte productivo. Las descripciones con
fecha anterior que siguen son evidencia histórica.

| Criterio | Evidencia real | Estado |
| --- | --- | --- |
| Catálogo y corpus | Destino inspeccionado dos veces: vacío. Se crearon 3 materias, 9 categorías, 35 temas, una escala y 3 niveles; 82 lecturas importadas y publicadas | Aprobado en Azure |
| Conciliación y repetición | 82 IDs de unidad y 35 IDs de tema conservados; repetición requiere 0 entradas y 0 publicaciones nuevas; `matches=true`, sin conflictos | Aprobado en Azure |
| Recorrido de lectura | Chrome real con Google: filtros materia/categoría/tema/nivel, textos/fuentes y regreso conservando filtros; muestras de Redes, Inglés e IA | Aprobado para lectura |
| Permisos | Alumno real sin herramientas de autoría; revisiones editoriales 403 y publicación legible con `origin: null`; Postman anónimo 25/25 | Aprobado para los límites probados; dos cuentas Google reales/autoría pendientes |
| Actividades antiguas | El corpus no contiene objetivos, ejercicios ni evaluaciones. Se publican como material `reading`, sin fabricar cobertura | Equivalencias/curación y proyectos siguen pendientes |
| IA y voz | La beta indica tutor no configurado; no se ofrecen como actividades disponibles | Credenciales/federación, configuración y aceptación de proveedores/micrófono/interrupción pendientes |
| Hito 6 | No se traslada progreso ni se infiere dominio; `uncalibrated` se conserva | Calibración pendiente de muestras docentes reales |
| Corte y operación | No cambian escritores Python, Firestore ni GCP; sin ampliación IAM/red | Observabilidad, restauración, reversión y corte del hito 8 abiertos |

Beta: https://ca-aiteacher-beta-8136.thankfuldune-75a4eb8a.mexicocentral.azurecontainerapps.io

Revisión `ca-aiteacher-beta-8136--0000008`; imagen por digest
`sha256:eec351672dbaa63c26d561307977363c6892e74651454f7f49b9c5cbf4d10e8a`.
El job existente ejecutó importación/publicación en una transacción serializable;
su definición permaneció idéntica. No se aplicaron migraciones de esquema ni
se trasladaron datos personales, historial o progreso en esta continuación.

[Informe completo, diferencias y comandos](../docs/curriculum-continuity.md).
[Conciliación Azure](../docs/curriculum-evidence/azure-reconcile.json) y
[repetición](../docs/curriculum-evidence/azure-repeat.json) contienen los IDs fuente/destino.
Las 42 relaciones originales entre temas se conservan en un manifiesto versionado
servido con sesión; el modelo no las representa como prerrequisitos conceptuales.
Los niveles pertenecen a cada lectura, no a una competencia o dominio acreditado.

Validación: 9 pruebas de dominio, 80 de integración PostgreSQL, 5 Python de
preservación/manifiesto y recuperación de informes; 25/25 aserciones Postman locales
y nuevamente 25/25 reales en Azure, salida 0; dos recorridos Chromium locales
con IA simulada. Axe sin infracciones a 320/768/1024/1440px. Google de alumno y
muestras de lectura se probaron en Chrome real en Azure, sin simular proveedor.
Esta evidencia no acredita ejecución de IA/voz ni equivalencia pedagógica.


Estado al 20 de octubre de 2026: ensayo real conciliado y revertido; recorrido
React/.NET verificado localmente. Todavía no se declara cerrado el hito ni se
cambia el escritor productivo. La tabla de aceptación es el estado vigente;
las descripciones del incremento inicial se conservan como contexto.

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

Faltan continuidad editorial de actividades antiguas, Google real contra .NET,
interrupción contra el proveedor real, micrófono físico y ensayo en Azure.
La voz ya está integrada en React/.NET y comprobada con micrófono sintético.
La calibración docente del hito 6 se pospone para después de reunir muestras
docentes reales durante la beta, según instrucción del usuario. Se conserva
`uncalibrated`; no es un requisito de datos inventados antes de abrir la beta.
No se modifica Firestore ni se han provisionado recursos Azure.

El ensayo de corte debe detener entradas nuevas, drenar chat/entregas/voz y confirmar
que no quedan leases activos antes de tomar el snapshot. Los registros temporales
`*_chat_requests` no se trasladan como leases ejecutables. Se conserva un backup
de esas colecciones antes del corte real. Un export entre colecciones sin congelar
es solo un ensayo, no un snapshot transaccional de producción.

Voz productiva sigue en el servicio Python. El gateway .NET ya valida origen,
propietario y contexto de unidad; limita cupos entre réplicas y no guarda audio
ni transcripciones. Hay pruebas locales de dos turnos, interrupción de protocolo,
reconexión y liberación de cupos, y dos turnos sintéticos contra Vertex Live real.
Faltan login real, micrófono físico, interrupción y fallo contra el proveedor real.
Registrar proveedor/modelo, fecha y latencias sin audio ni texto sensible.
Retirar escritores por funcionalidad solo después de activar su ruta .NET y
verificar lecturas/escrituras. No retirar Python mientras aloje voz o actividades
sin equivalencia. La reversión del archivo de ensayo no transforma escrituras
nuevas de .NET a Firestore; esa reversión de producción pertenece al hito 8.

## Reproducir el ensayo

Trabajar sobre copias congeladas de los mapas JSON de `LocalSessionRepository`
(`id → StoredConversation`) y `LocalProgressRepository` (`student_id → StudentProgress`).
Un backup nativo de Firestore no tiene ese formato: no se pasa directamente al
importador. El exportador también admite lectura directa de Firestore, como se
describe abajo. No abrir el repositorio de sesiones para exportar:
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

### Extracción directa de Firestore

Alternativa a los mapas locales, con las dependencias Python `cloud` instaladas
y Application Default Credentials con acceso de lectura a la base elegida:

```sh
.venv/bin/python backend/scripts/prepare-history-import.py \
  --firestore-project '<proyecto-confirmado>' --firestore-database '(default)' \
  --sessions-collection learning_sessions --progress-collection student_progress \
  --source '<proyecto-base-y-ensayo>' \
  --batch-id 10000000-0000-0000-0000-000000000007 \
  --output /ruta/privada/history.json
```

Confirmar proyecto, base y nombres de colecciones con la configuración del
despliegue; los valores por defecto no demuestran que sean los de producción.
El comando no carga `.env` ni deduce el proyecto de las credenciales. No combinar
esta modalidad con `--sessions`/`--progress`. El archivo resultante usa el mismo
contrato v1 y se importa/concilia con los comandos .NET existentes.

Ambas colecciones se leen en una única transacción de solo lectura, sin filtros
por alumno, archivo o vencimiento. No se instancian repositorios que purgan
sesiones ni se consultan perfiles o leases `*_chat_requests`. Los timestamps
nativos se representan como cadenas ISO con zona; los demás payloads originales
se conservan sin recalcular los resúmenes validados. Valores Firestore que no
tienen representación JSON prevista, propietarios inconsistentes y más de
100000 documentos cancelan la exportación. No se omiten silenciosamente filas.

Se publica el archivo completo con permisos 0600 después de validarlo y
sin reemplazar una ruta existente. Un fallo de lectura/validación/serialización
no publica el snapshot. Un error devuelve salida 2 y un mensaje sin payloads
ni credenciales. Un fallo de proceso puede dejar un temporal privado `.history-*`
en el directorio de destino, que debe tratarse como dato sensible.

La transacción evita mezclar lecturas de ambas colecciones en momentos distintos;
no detiene a los escritores ni a los proveedores de voz. Para el corte todavía
se necesita congelar entradas, drenar operaciones y respaldar los leases.
Si la lectura excede los límites de una transacción Firestore, el ensayo falla:
no se degrada a lecturas independientes. En ese caso se necesita preparar una
extracción de mayor volumen con un instante de lectura fijo antes de continuar.

Referencia del SDK: [transacciones de Firestore](https://docs.cloud.google.com/python/docs/reference/firestore/latest/google.cloud.firestore_v1.transaction.Transaction).

Verificación de esta ampliación: 55 pruebas Python aprobadas de exportación,
repositorios y configuración/cupos de voz. Incluyen el SDK real sobre gRPC en
loopback con servidor de contrato sintético: transacción de solo lectura compartida,
ninguna escritura en el commit, datos archivados/vencidos conservados, timestamps
nativos y resumen original, rechazo de propietario incorrecto y rollback ante
permiso denegado en la segunda colección. También verifican permisos 0600,
no sobrescritura y ausencia de salida parcial por serialización inválida.
Este servidor no es un emulador completo ni valida IAM, límites o datos reales.
No se repitió la suite .NET ni el smoke Postman en esta ampliación del exportador.

### Puerta de aceptación para pasar al hito 8

| Requisito | Evidencia necesaria | Estado |
| --- | --- | --- |
| Extracción reproducible | Comando, proyecto/base/colecciones y snapshot privado | Verificada con Firestore real; snapshot privado 0600 fuera de Git |
| Conciliación real | Importar dos veces, mismos IDs/propietarios/huellas/cantidades, informe sin diferencias | Aprobada: 128 documentos, 111 conversaciones, 312 mensajes, 17 progresos y 31 evaluaciones |
| Reversión del ensayo | Revertir solo el lote, conservar otros datos y comprobar discrepancia posterior | Aprobada con datos reales; lote sintético independiente conservado, reversión repetida idempotente y reactivación rechazada |
| Continuidad editorial | Tabla explícita de actividades antiguas y publicaciones/definiciones nuevas equivalentes; decisión sobre las que no tienen equivalencia | Pendiente; no fabricar revisiones ni reanudar cuestionarios privados |
| Recorrido React sobre .NET | Google, catálogo/unidad, práctica/prueba, chat/apunte, grafos e historial con aislamiento entre dos alumnos | Implementado y aprobado con Chromium + HTTP/.NET/PostgreSQL reales; Google sustituido solo en host de pruebas, IA en simulación HTTP local |
| Voz real | Google, contexto privado, dos turnos, interrupción, reconexión, cupos y fallo de proveedor; registrar fecha/modelo/latencias | Python: dos turnos + reconexión reales. Protocolo .NET: dos turnos reales. Gateway: aislamiento, cupos entre réplicas, audio, interrupción y reconexión locales. React: micrófono sintético aprobado. Google, micrófono físico e interrupción/fallo reales pendientes |
| Escritor por funcionalidad | Inventario de rutas y responsables; ensayar activación .NET sin escritura simultánea en Python | Pendiente; cambio productivo y retiro GCP en hito 8 |
| Dependencia del hito 6 | Muestras docentes etiquetadas y política de dominio aprobada | Pospuesta hasta obtener datos de beta por instrucción del usuario; mantener `uncalibrated` |

Se puede preparar el diseño y presupuesto de Azure en paralelo, pero esta tabla
impide declarar finalizada la migración o autorizar el corte por tener solo
pruebas sintéticas. Se extrajeron datos reales con autorización explícita; no
se han cambiado escritores. La base de ensayo real se eliminó al concluir.

## Evidencia de la continuación

Última regresión local del 20 de octubre: 66 pruebas .NET de integración y
9 de dominio; lint OpenAPI y ambas colecciones Postman; 25 solicitudes/aserciones
smoke; recorrido Chromium completo con dos alumnos, autoría, aislamiento,
accesibilidad y voz con micrófono sintético. Todo aprobado. Frontend: 44 pruebas,
TypeScript, ESLint y build/budget .NET aprobados. La CI se preparó, pero no se
afirma una ejecución remota de GitHub Actions.

El despliegue privado fue autorizado y aprovisionado en México Central en la
suscripción MVP `1350d930-7008-4b43-923d-6a7cd66701bc`, grupo
`rg-aiteacher-beta-8136`. Bicep y guía reproducible están en `infra/`;
`infra/azure-command-log.md` registra los comandos y sus códigos de salida.
Infraestructura, bootstrap privado de clave, migraciones y permisos SQL de runtime
terminaron correctamente. HTTPS/readiness/React/worklet y límites API/WebSocket
pasaron en Azure. CSRF quedó corregido al configurar el rango interno de proxies aprobado
`100.100.0.0/17` y su mapeo IPv6, un salto y sin X-Forwarded-Host. La colección
real en Azure aprobó 25 de 25 aserciones. La aceptación sigue abierta. Google real, voz/IA en Azure y las demás validaciones siguen pendientes.
La voz y los proveedores de IA permanecen deshabilitados en esta beta hasta completar
la configuración de credenciales/federación. No se ha realizado corte productivo.

Origen confirmado por `.env`, CLI GCP y configuración efectiva de Cloud Run:
proyecto `gen-lang-client-0364164089`, base `(default)` en `us-central1`,
colecciones `learning_sessions` y `student_progress`. Se tomó el snapshot privado
`history-20261019.json` con lote `10000000-0000-0000-0000-000000000019`.
SHA-256: `ba462b2ec6dd822d3a83a98dab26febad78c848bb9f01e0bcf329474a89f78dc`.
No se copian payloads, identidades ni mensajes a esta guía o al repositorio.
El recibo privado está en `.data/migration-rehearsal/` junto al snapshot.
La lectura fue consistente dentro de la transacción, pero no se congeló la
producción: sigue siendo un ensayo y se requiere un snapshot nuevo al corte.

El modo React se selecciona para todo el build con `VITE_BACKEND=dotnet`.
Usa tipos derivados de `backend/openapi.yaml`, cookies y CSRF del mismo origen;
no mezcla escritores Python/.NET ni interpreta historial antiguo como intentos nuevos.
`frontend/e2e/backend.spec.ts` prueba por UI la creación de catálogo y unidad,
cobertura/publicación, preguntas cerradas y abiertas, definición/entrega/corrección,
chat con fuentes, apunte guardado y personal, mapa/mención/corrección, historial
privado y cambio entre dos alumnos. Axe WCAG A/AA y 2.1 AA pasó a 320, 768,
1024 y 1440px, sin desbordamiento ni errores de página. No es login Google real.

Vertex texto .NET: una pregunta sintética sobre vectores aprobó con ADC y el
endpoint global, modelo `gemini-3.5-flash-lite` (123 tokens de entrada, 36 de
salida); el endpoint `us` rechazó la llamada. El modelo se configura, no se
deduce ni se cambia automáticamente de proveedor. No acredita calidad pedagógica.

Voz Python real: `backend/scripts/verify-live-voice.py --run` aprobó dos turnos
y una conexión nueva con `gemini-live-2.5-flash-native-audio`, ADC/Vertex,
primer audio a 2617ms y 1964ms respectivamente. Audio y transcripciones se
descartaron. Entrada sintética de texto; no verifica micrófono ni interrupción.

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

# CD de la beta de Azure

## Comportamiento implementado

`cd-beta.yml` escucha únicamente la finalización de `CI` y permite ejecución
manual desde `main`. No dispara CI, crea commits ni modifica la protección de
la rama. Un CI de PR, fork, otra rama o ejecución manual de CI no habilita CD.
Se requiere el **CI de push a main del SHA integrado**, no el SHA sintético del PR.

`beta_ci_guard.py` consulta GitHub con `contents: read` y `actions: read`:
comprueba el ID del workflow `ci.yml`, repositorio, evento, rama, SHA completo,
estado exitoso, última ejecución del SHA y los cuatro jobs exitosos de su intento
actual. Rechaza checks omitidos, cancelados, duplicados o ausentes. El SHA debe
seguir siendo la punta de `main`. Manualmente se proporciona el ID del CI, nunca
una rama o imagen arbitraria.

La ejecución manual tiene dos operaciones, ambas tras el mismo guard y el
environment `beta`: `deploy` (requiere `BETA_CD_ENABLED=true`) y `verify-access`,
que solo inicia sesión por OIDC, obtiene token de ACR y lee app, revisión, jobs y
ejecuciones. `verify-access` no construye, no inicia jobs ni escribe en Azure;
sirve para comprobar federación y propagación de RBAC antes de activar el CD.

El job de despliegue usa el environment `beta`, adquiere el grupo exclusivo
`aiteacher-azure-beta` con `cancel-in-progress: false` y vuelve a validar después
de esperar. Construye el checkout exacto validado, desde `backend/Dockerfile.azure`,
en el runner Linux amd64 y publica en el ACR existente. Las Actions están fijadas
a commits. No descarga artefactos ni cachés de workflows de PR.
La etiqueta incluye SHA, run y attempt para trazabilidad; **solo el digest
devuelto por el build** llega a los jobs y a la aplicación. Provenance y SBOM de
buildx están desactivados para publicar un manifiesto simple linux/amd64, igual
que las imágenes previas de `az acr build`, y no un índice con atestaciones.

Antes de migrar se comprueban tenant, suscripción, destino HTTPS fijo, modo
Single, revisión lista e identidades esperadas. Tras las migraciones se vuelve
a comprobar CI/main y que la aplicación no haya cambiado fuera del lock.
El lock cubre build, jobs, actualización y verificaciones: un commit antiguo
no puede publicar después de otro nuevo mediante este workflow. Los operadores
deben respetarlo también para cambios externos.

GitHub conserva como máximo un job pendiente en este grupo y puede reemplazarlo
por otro pendiente; el orden no está garantizado. Los guards rechazan commits
obsoletos, aunque ello puede exigir reintentar el CI/CD actual manualmente en
casos de cola/cancelación. No cancelar a mano durante migraciones: una cancelación
del runner no garantiza que Azure detenga un job ya iniciado. El siguiente intento
rechaza ejecuciones aún activas; revisar su resultado primero. Un main nuevo
puede llegar durante una migración: la base puede quedar adelantada, pero se
rechaza publicar el SHA superado. Entre la última lectura de main y el PATCH hay
una ventana inevitable; el lock evita que ese PATCH sustituya un despliegue más
nuevo del mismo workflow.

### Omisión de despliegues sin cambios desplegables

`workflow_run` no admite filtros de rutas. Por eso, **después** del lock, de la
revalidación y del login OIDC, el paso `--scope` de `update-azure-beta.py` decide
en solo lectura si hace falta publicar:

1. Lee la app: debe tener un solo contenedor, imagen por digest del ACR fijo y
   `latestRevisionName == latestReadyRevisionName`.
2. Lee la etiqueta OCI `org.opencontainers.image.revision` de esa imagen (la
   escribe el build del CD) con el token de pull ya obtenido.
3. Si ese SHA es ancestro del SHA validado, calcula `git diff --name-only
   --no-renames` entre ambos (checkout con historial completo).
4. Omite build, migraciones, PATCH y smoke solo si ningún archivo empieza por
   `backend/`, `frontend/`, `agent_app/static/`, ni es `.dockerignore`,
   `.github/workflows/cd-beta.yml` o la colección `AITeacher Backend Smoke`.

Cualquier duda despliega: imagen sin etiqueta (las de `az acr build`), etiqueta
que no es un SHA completo, SHA que no es ancestro (p. ej. tras un rollback manual
a otra rama), app inestable o varios contenedores. Un despliegue **manual**
(`workflow_dispatch`) siempre publica. Se compara contra lo que corre en Azure, no
contra el commit padre: si un CD de código falló antes de publicar, el siguiente
commit de docs incluye esos cambios en el diff y sí despliega. La validación de
SHA/CI, el lock y la revalidación no cambian. El resumen de Actions registra la
decisión y el motivo.

## Reutilización del despliegue existente

| Pieza | Función y uso en CD |
|---|---|
| `backend/scripts/deploy-azure.sh` | Aprovisionamiento completo: registra proveedores, despliega Bicep por suscripción, inicializa clave y cambia RBAC temporalmente. **No se llama desde CD**, tampoco con resume. |
| `infra/main.bicep`, módulos | Red, PostgreSQL, ACR, identidades, Key Vault, entorno y jobs. Se conservan; CD no ejecuta ARM/Bicep/azd. |
| `backend/Dockerfile.azure` | Mismo build React/.NET existente. |
| Jobs `job-migrate-aiteacher-beta-8136` y `job-grant-aiteacher-beta-8136` | Misma red privada, entorno e identidad migradora, con la imagen candidata por digest. Se ejecutan en ese orden y se espera `Succeeded` de ambos. |
| `backend/scripts/verify-azure.sh` | HTTPS con certificado verificado, readiness con reintentos, shell React, worklet y fronteras 404 API/WebSocket. |
| `postman/collections/AITeacher Backend Smoke` | Colección existente, CLI 1.75.0 y `--no-report-events`, sin login ni publicación de resultados a Postman. |

`update-azure-beta.py` copia **la plantilla completa** del job a un archivo temporal
privado y modifica solo imagen y argumentos de esa ejecución. Esto conserva
variables, referencias a secretos, recursos y comando; los overrides de ejecución
reemplazan la plantilla, no deben enviarse solo imagen/args. La plantilla almacenada
del job no cambia. Antes de iniciar se rechaza una plantilla con campos que el
modelo de ejecución del CLI descartaría en silencio (volúmenes, montajes,
contenedores init o adicionales). Después de iniciar se lee la ejecución y se
exige que imagen, argumentos, comando y nombres de variables coincidan con lo
enviado; si no, se detiene sin publicar. Este mecanismo `--yaml` es el mismo que
`run-curriculum-azure.py` ya usó con éxito en la beta. Migración usa únicamente `--migrate`: la clave Data Protection
ya existe, por lo que se omite `--bootstrap-data-protection-key` y no se requiere
Crypto Officer. El segundo job ejecuta `--grant-runtime-access` con los permisos
SQL de la identidad migradora existente. Runtime conserva su identidad SQL limitada.
Un fallo, estado terminal de error o timeout impide publicar la nueva app.

El PATCH de Container Apps lee y escribe la plantilla con la misma versión de API
(`2025-07-01`), conserva la plantilla completa, cambia la imagen
de `api` y usa el sufijo de revisión `cd-RUN-ATTEMPT` para evitar colisiones;
incluye la ubicación existente requerida por el contrato REST. No envía configuración,
secretos, ingress, identidad ni tráfico. Se
espera exactamente la revisión `ca-aiteacher-beta-8136--cd-RUN-ATTEMPT`, Healthy y
activa con el digest nuevo, como `latestRevision` y `latestReadyRevision`
y se ejecutan los checks anteriores contra el hostname HTTPS fijo. Los smoke
comprueban salud, CSRF y límites de autenticación; no prueban Google real, micrófono,
tutor IA ni aislamiento entre dos cuentas. Un fallo posterior a publicar marca CD
fallido y requiere evaluación operativa; **no revierte automáticamente la base**.
El resumen de Actions conserva SHA/CI, digest/revisión anterior, digest candidato,
IDs/resultados de los jobs y revisión nueva, incluso si falla una etapa posterior.

## Environment y variables

Environment exacto: `beta`, con política de ramas seleccionadas que solo admite
la **rama** `main` (ningún tag). La protección de main permanece: PR, una
aprobación y los cuatro checks requeridos. No se añade aprobación por despliegue
para permitir automatización después de la activación inicial aprobada.

| Ubicación | Variable | Valor |
|---|---|---|
| Repository Actions variable | `BETA_CD_ENABLED` | `false` hasta aprobación; `true` activa publicación y despliegue. Ausente también deshabilita. |
| Environment `beta` | `AZURE_TENANT_ID` | `82090019-87c1-4439-918c-a31932facc9a` |
| Environment `beta` | `AZURE_SUBSCRIPTION_ID` | `1350d930-7008-4b43-923d-6a7cd66701bc` |
| Environment `beta` | `AZURE_CLIENT_ID` | Client ID público de la nueva identidad federada, pendiente de aprobación/creación. |

No se crean GitHub Secrets. Los secretos de ejecución permanecen en Key Vault,
referencias de Container Apps, identidades administradas y mecanismos actuales
de Azure/Google. No se copian parámetros privados a GitHub ni al contexto Docker.

## Configuración de Azure aplicada

Aprobada por el propietario y aplicada el 21 de octubre de 2026:

| Elemento | Valor real |
|---|---|
| Identidad | `id-aiteacher-beta-8136-github-cd`, client ID `1e65d0e9-851d-4cf3-b0a3-b287ada635c2`, principal `6befc0f2-2101-4f3a-92c4-c215be16f9a4` |
| Federación | `github-aiteacher-beta`, subject inmutable de abajo |
| Rol personalizado | `AITeacher Beta CD`, ID `fd5f6715-1f84-49c1-b737-db8da5064d34` |
| Asignaciones | Exactamente las cuatro de abajo; sin heredadas (`--include-inherited`) |
| GitHub | `AZURE_CLIENT_ID` en el environment `beta` |

Para revocar el acceso del CD sin tocar runtime ni migrador: eliminar las cuatro
asignaciones o la credencial federada; `BETA_CD_ENABLED=false` detiene el CD sin
cambios en Azure.

## Diseño de la identidad federada

Destino: suscripción y grupo anteriores, `mexicocentral`. Crear una identidad
administrada de usuario **`id-aiteacher-beta-8136-github-cd`** separada de runtime
y migrador. Añadir una sola credencial federada desde
[`github-beta-federation.json`](../infra/github-beta-federation.json):

- Issuer: `https://token.actions.githubusercontent.com`.
- Audience: `api://AzureADTokenExchange`.
- Subject: `repo:GDriem@34953083/AITeacher@1310182865:environment:beta`.

El repositorio usa `use_default: true`, `use_immutable_subject: true`; prefijo
confirmado vía API el 21 de octubre de 2026. No usar el formato antiguo
`repo:GDriem/AITeacher:environment:beta`. La política de environment limita la
rama porque el subject con environment no incluye la rama. No añadir federaciones
para PR, tags, otras ramas o repositorios.

Crear el rol personalizado de
[`github-beta-cd-role.json`](../infra/github-beta-cd-role.json), asignándolo
**solo a estos cuatro recursos**, no al grupo ni a la suscripción:

```text
/subscriptions/1350d930-7008-4b43-923d-6a7cd66701bc/resourceGroups/rg-aiteacher-beta-8136/providers/Microsoft.ContainerRegistry/registries/craiteacherbeta8136
/subscriptions/1350d930-7008-4b43-923d-6a7cd66701bc/resourceGroups/rg-aiteacher-beta-8136/providers/Microsoft.App/containerApps/ca-aiteacher-beta-8136
/subscriptions/1350d930-7008-4b43-923d-6a7cd66701bc/resourceGroups/rg-aiteacher-beta-8136/providers/Microsoft.App/jobs/job-migrate-aiteacher-beta-8136
/subscriptions/1350d930-7008-4b43-923d-6a7cd66701bc/resourceGroups/rg-aiteacher-beta-8136/providers/Microsoft.App/jobs/job-grant-aiteacher-beta-8136
```

El rol permite lectura/push/pull ACR, lectura/escritura de la app y lectura de
revisiones, lectura/inicio de jobs y lectura de ejecuciones. Sus Actions no son
comodines, no incluyen delete, listSecrets, listCredentials, roleAssignments,
SQL, Key Vault ni asignación de identidades. ACR usa `LegacyRegistryPermissions`,
confirmado en lectura; las acciones push/pull corresponden a ese modo. Si se
migra a ABAC hay que revisar los permisos con condición de repositorio, no ampliar
el rol ciegamente. `AssignableScopes` limita dónde puede asignarse el rol, pero
**no es la asignación**: esta debe hacerse en los cuatro IDs completos.

Límite de Azure RBAC: `containerApps/write` también permite otros cambios en esa
app y `jobs/start/action` permite ejecutar código con la identidad migradora.
Azure no limita esas acciones al campo imagen/argumentos. El código revisado,
la protección de main, environment y OIDC constituyen esa frontera de confianza.
Un administrador de repositorio o de Azure sigue siendo de confianza. No se
concede Contributor/Owner ni permisos de administración de acceso al workflow.

No se aprovisionan recursos de cómputo/red/datos ni se modifica producción.
Consumo adicional variable: build en GitHub, almacenamiento de imágenes en el
ACR existente, dos ejecuciones Consumption (configuración actual: 0.5 vCPU/1 GiB
por job, hasta 30 minutos cada uno), arranque temporal de revisión y logs/red.
No se usan ACR Tasks ni se agrega un SKU o servicio con costo fijo. No se ha
cotizado un importe incremental: depende de duración, franquicias, retención y
facturación. La estimación de infraestructura de `infra/README.md` es histórica,
no un presupuesto nuevo ni un límite de gasto. Revisar esos consumos al aprobar.

## Activación y primer despliegue: intervención pendiente

1. Revisar/aprobar expresamente la propuesta anterior: identidad, federación,
   cuatro asignaciones del rol, consumos variables y primer despliegue beta.
   **Estos cambios Azure no se ejecutan en esta entrega.**
2. Un administrador autorizado crea identidad/federación/rol y asignaciones
   descritas. Confirmar propagación y ausencia de roles heredados más amplios;
   no modificar runtime ni migrador. Guardar el client ID público en `beta`.
3. Revisar las migraciones nuevas: deben tolerar que la app anterior siga
   funcionando durante la migración. Confirmar backup/restauración operativos
   y que no haya jobs/actualizaciones externos en curso.
4. Integrar la PR por el proceso protegido. Mientras `BETA_CD_ENABLED=false`,
   puede correr el guard de CD, pero no se construye/publica ni se accede a Azure.
5. Ejecutar `verify-access` con el ID del CI push de main. Si falla, revisar la
   operación concreta denegada antes de cambiar permisos:

   ```bash
   gh workflow run cd-beta.yml --repo GDriem/AITeacher --ref main \
     -f ci_run_id=ID_CI_PUSH_MAIN -f operation=verify-access
   ```

6. Tras aprobación, poner `BETA_CD_ENABLED=true` y ejecutar el primer CD manual
   desde main con el ID de su CI **push** exitoso:

   ```bash
   gh workflow run cd-beta.yml --repo GDriem/AITeacher --ref main \
     -f ci_run_id=ID_CI_PUSH_MAIN -f operation=deploy
   ```

7. Verificar OIDC/RBAC con esa identidad, digest publicado, ambos jobs Succeeded,
   nueva revisión Healthy y smoke. Revisar que secretos, identidades, ingress,
   configuración de IA y datos permanezcan como antes. Desde entonces los
   siguientes CI push exitosos de main disparan el CD automáticamente.

Si faltan permisos, detenerse y revisar la llamada concreta; no conceder roles
amplios para hacer pasar el primer despliegue. El candidato conocido no incluido
es `Microsoft.App/managedEnvironments/join/action`: la documentación lo describe
para crear apps en el entorno y el PATCH no envía `environmentId`. Si ARM lo
exigiera, requeriría una asignación adicional sobre el entorno administrado,
fuera de los cuatro recursos aprobados, y una nueva aprobación. Una ejecución manual obsoleta o
desde otra rama se rechaza incluso si el operador puede iniciarla.

## Volver a la imagen anterior

Antes de intervenir, poner `BETA_CD_ENABLED=false`, esperar el job de CD activo
y comprobar en Azure que las ejecuciones migradoras terminaron. Evitar cambios
concurrentes de otros operadores. Guardar el resumen de la ejecución fallida y
el digest de `Previous image`; conservar imágenes anteriores en ACR hasta cerrar
la ventana de rollback. No hay política nueva de borrado ni de retención automática.

**No toda imagen anterior es compatible con el esquema actual.** EF aplica
migraciones de varios contextos en secuencia: un fallo puede dejar cambios
parciales ya confirmados. Revertir imagen no deshace SQL, claves, blobs ni datos.
Preferir migraciones expand/contract compatibles; si no lo son, aplicar corrección
hacia adelante o restauración a un punto en tiempo en un procedimiento separado
y aprobado, con evaluación de pérdida de escrituras. No ejecutar migraciones
Down ni restauraciones destructivas desde este CD.

Después de comprobar compatibilidad, un operador autorizado puede volver a
publicar el digest anterior en la misma app:

```bash
# DIGEST_ANTERIOR: solo los 64 hex de Previous image (sin el prefijo sha256:); nunca una etiqueta.
# Confirmar antes que el manifiesto sigue en ACR:
az acr manifest show-metadata --subscription 1350d930-7008-4b43-923d-6a7cd66701bc --registry craiteacherbeta8136 \
  --name aiteacher@sha256:DIGEST_ANTERIOR --query "{digest:digest,tags:tags}" -o json
az containerapp update --subscription 1350d930-7008-4b43-923d-6a7cd66701bc \
  --resource-group rg-aiteacher-beta-8136 --name ca-aiteacher-beta-8136 \
  --container-name api --image craiteacherbeta8136.azurecr.io/aiteacher@sha256:DIGEST_ANTERIOR \
  --revision-suffix rollback-AAAAMMDDhhmm --output none
bash backend/scripts/verify-azure.sh https://ca-aiteacher-beta-8136.thankfuldune-75a4eb8a.mexicocentral.azurecontainerapps.io
postman collection run 'postman/collections/AITeacher Backend Smoke' \
  --env-var baseUrl=https://ca-aiteacher-beta-8136.thankfuldune-75a4eb8a.mexicocentral.azurecontainerapps.io \
  --no-report-events
```

Comprobar además que `latestReadyRevisionName` sea `ca-aiteacher-beta-8136--rollback-…`,
Healthy, con ese digest, y que escala (1–2 réplicas, una regla), nombres de
variables, identidad e ingress sigan iguales. Registrar motivo y resultado.

Con la extensión `containerapp` 1.3.0b5, `--image` envía un PATCH que solo
contiene `template.containers` (copiados de la app, con variables, recursos y
sondas) y el sufijo; no envía configuración, secretos, ingress, escala ni
identidad. El CD usa en cambio GET/PATCH REST de la plantilla completa con la API
`2025-07-01`; ambos caminos crean una revisión nueva en modo Single. No activar
revisiones inactivas antiguas: en modo Single no reciben tráfico y conservan su
configuración de entonces.

Tras un rollback, la omisión por alcance compara contra la etiqueta de la imagen
restaurada: un main posterior que toque código desplegable vuelve a publicarse
(por eso se pone antes `BETA_CD_ENABLED=false`); si solo hay docs, la imagen
restaurada se mantiene, lo cual es correcto porque su código coincide. Este rollback operativo no pasa
por la entrada manual de CD, que solo admite la punta de main validada. Para
reactivar automatización, corregir/revertir el código por PR, esperar el CI push
del nuevo main y revisar antes de cambiar `BETA_CD_ENABLED=true`; reactivar sin
corregir puede volver a publicar la versión fallida.

## Activación y primer despliegue: resultados reales

22 de octubre de 2026 (UTC), PR #15 integrada como `7e5f749a0a32ffd22b927e0c782bae27551f56a0`.

| Paso | Evidencia |
|---|---|
| CI push de main | Run `39696683397`, los cuatro jobs `success` |
| CD automático con switch en `false` | Run `39697073610`: `validate` aceptó el SHA; `deploy` omitido |
| `verify-access` con la identidad federada | Run `39697130748`: OIDC y selección de suscripción correctos con roles solo por recurso, token ACR, lecturas de app/revisión/jobs. Sin cambios |
| `BETA_CD_ENABLED` | Cambiado a `true` tras la verificación, con aprobación del propietario |
| Primer `deploy` manual | Run `39697255534`, `success` |
| Imagen | `craiteacherbeta8136.azurecr.io/aiteacher@sha256:d9b83ab660e228ea24081e7cbcbb3a650269ae53242d743dfc44fa0eaf4bea55`, manifiesto OCI simple, etiqueta `git-7e5f749…-39697255534-1` |
| Migración | `job-migrate-aiteacher-beta-8136-yvdmuw8`, args `--migrate`, `Succeeded` (00:04:19–00:04:51) |
| Permisos SQL | `job-grant-aiteacher-beta-8136-dv6u5s2`, args `--grant-runtime-access`, `Succeeded` (00:04:56–00:05:26) |
| Revisión | `ca-aiteacher-beta-8136--cd-39697255534-1`, activa, Healthy, 100 % del tráfico; la anterior era `--0000009` con `sha256:038a8ada…` |
| Verificaciones | `verify-azure.sh` aprobado en el run y repetido localmente; smoke Postman: 26 requests, 26 tests, 0 fallos |
| Conservación | Identidad runtime y del registro, ingress externo solo HTTPS, escala mínima y variables de la app sin cambios; plantillas almacenadas de ambos jobs intactas (siguen con su imagen y args originales) |

No hizo falta ningún permiso adicional: `managedEnvironments/join/action` no fue
requerido por el PATCH. Desde este punto, cada CI push exitoso de main despliega
automáticamente. Hasta la omisión por alcance (sección anterior), eso incluía
cambios solo de documentación: el merge de la PR #16 (`c73386b`, solo
`docs/azure-beta-cd.md`) disparó el run `39698729310`, que reconstruyó, migró y
creó `ca-aiteacher-beta-8136--cd-39698729310-1` (Healthy, smoke 26/26) con una
imagen de código idéntico a la anterior.

Siguen fuera de este CD las comprobaciones manuales de login real con Google,
micrófono/voz, tutor IA y aislamiento entre cuentas; ver
[azure-beta-acceptance.md](azure-beta-acceptance.md).

## Operación posterior a la activación

Revisión del 22 de octubre de 2026 (UTC), en solo lectura salvo donde se indica.

### Gobernanza de main

El propietario reactivó `enforce_admins`. Comprobado vía API: `enforce_admins`
activo, una aprobación requerida con descarte de aprobaciones obsoletas, los
cuatro checks requeridos en modo estricto, sin force push ni borrado y sin
rulesets. Con un único colaborador que no puede aprobar sus propias PR, cada
merge necesita un segundo revisor con permiso de escritura o un cambio de
protección aprobado expresamente; no hay bypass.

### Retención de imágenes en ACR

Inventario real (`craiteacherbeta8136`, SKU Basic, repositorio único `aiteacher`):

| Digest | Etiqueta | Creado (UTC) | Referencias |
|---|---|---|---|
| `4920860d…08275` | `beta-privatekey-20261020` | 2026-10-20 23:55 | Plantillas almacenadas de ambos jobs; `infra/recreate-azure.md`; revisiones inactivas `ro9dwpb`, `0000001` |
| `5eeae7a0…dc2df3` | `beta-diagnostics-20261021` | 2026-10-21 00:44 | Revisiones inactivas `0000002`–`0000007` |
| `eec35167…10e8a` | `curriculum-20261021-v1` | 2026-10-21 02:47 | Revisión inactiva `0000008` |
| `038a8ada…73e34` | `tutor-wif-20261021` | 2026-10-21 16:24 | Revisión inactiva `0000009`; evidencia de activación del tutor |
| `d9b83ab6…bea55` | `git-7e5f749…-39697255534-1` | 2026-10-22 00:04 | **Anterior** (`cd-39697255534-1`) |
| `529e5c4b…e38da` | `git-c73386b…-39698729310-1` | 2026-10-22 00:17 | **Actual** (`cd-39698729310-1`, 100 %) |

Cada manifiesto declara ~116–118 MB, pero comparten capas: el uso real es
193,7 MB de 10 GiB (1,8 %). No hay manifiestos sin etiqueta. La política de
retención de ACR (`retentionPolicy`) y el soft delete están deshabilitados; la
retención automática de manifiestos sin etiqueta es exclusiva de Premium y
`acr purge` requiere ACR Tasks con costo por ejecución.

Política propuesta, **no aplicada** (todo borrado requiere aprobación del propietario):

- Conservar siempre: la imagen de la revisión activa, la `Previous image` del
  último CD exitoso, todo digest referenciado por las plantillas almacenadas de
  los jobs o por documentación operativa de recreación (hoy `4920860d`) y la
  última imagen previa al CD (`038a8ada`) hasta cerrar su ventana de rollback.
- Conservar además las cinco imágenes `git-*` más recientes.
- Candidatas a borrar, solo cuando el uso supere 5 GiB o haya más de 20
  manifiestos: el resto, tras confirmar que ninguna revisión activa ni job las
  usa. Hoy serían `5eeae7a0` y `eec35167`, con un ahorro mínimo por capas compartidas,
  así que **no se recomienda borrar nada ahora**.
- Proceso manual del propietario: listar con `az acr manifest list-metadata`,
  revisar referencias (`az containerapp revision list --all`, `job show`) y borrar
  por digest con `az acr manifest delete`. La identidad CD no tiene `delete` y
  no debe recibirlo.
- Opcional, requiere aprobación porque cambia Azure: bloquear el borrado de los
  digests protegidos con `az acr repository update --image aiteacher@sha256:… --delete-enabled false`.

### Simulacro de rollback (sin ejecutar)

Validado contra el estado real, sin cambiar la app:

| Elemento | Resultado |
|---|---|
| Actual | `cd-39698729310-1`, `sha256:529e5c4b…`, etiqueta OCI `revision=c73386b` |
| Anterior | `cd-39697255534-1`, `sha256:d9b83ab660e228ea24081e7cbcbb3a650269ae53242d743dfc44fa0eaf4bea55`, presente en ACR |
| Diferencia de código | `7e5f749..c73386b` solo cambia `docs/azure-beta-cd.md`: la imagen anterior es funcionalmente idéntica |
| Previa al CD | `038a8ada…`, presente en ACR, sin etiqueta OCI de revisión |
| Plantilla de la app | Un contenedor `api` (imagen, env, recursos, sondas), escala 1–2 con una regla, sin volúmenes |

**Rollback de imagen**: cambia solo el binario que sirve tráfico; es rápido y
reversible republicando otro digest. **Migraciones**: el último cambio en
`backend/src/**/Migrations` es `6d0dbe9` (19 de octubre de 2026), anterior a las
seis imágenes del ACR, de modo que hoy todas comparten el mismo conjunto de
migraciones EF y un rollback de imagen no enfrenta incompatibilidad de esquema.
Cuando una PR añada migraciones, esa compatibilidad deja de estar garantizada:
revertir la imagen no deshace SQL ni datos; la base solo se recupera con
corrección hacia adelante o restauración a un punto en tiempo de PostgreSQL
(retención de backup de 7 días), en un procedimiento separado y aprobado.

Correcciones aplicadas al procedimiento: el marcador del digest era ambiguo
(`sha256:` duplicado si se pegaba el valor completo), se añadió la verificación
de presencia en ACR y un sufijo `rollback-…` trazable. El comando se validó
leyendo el código de la extensión instalada, **no ejecutándolo**.

### Evidencia de esta revisión

- Comprobado realmente: protección de main, variables, runs `39697255534` y
  `39698729310`, revisiones, plantillas de jobs, inventario y uso del ACR, y
  presencia de `d9b83ab6…` con `az acr manifest show-metadata`.
- `--scope` ejecutado localmente en solo lectura contra la app y el ACR con la
  cuenta del propietario: leyó `revision=c73386b` y decidió omitir (diff vacío).
  Contra el historial real, la PR #16 se habría omitido y la #15 desplegado.
- Probado localmente: 35 pruebas nuevas en `tests/test_beta_cd.py` (59 en el
  archivo) y la suite Python completa sin fallos; `actionlint 1.7.12` y
  `git diff --check` aprobados.
- Pendiente: primera omisión real en GitHub Actions (el merge de esta PR toca
  `cd-beta.yml` y `backend/`, así que **desplegará**; la omisión se observará en
  el siguiente merge solo de docs), la aceptación manual y cualquier borrado o
  bloqueo en ACR.

## Correcciones de la revisión previa a la activación

Revisión del 21 de octubre de 2026, antes de crear permisos en Azure:

- `azure/login` estaba fijado a `8216e11…`, que es el **objeto del tag anotado**
  `v2`, no un commit; Actions no puede resolverlo. Se fijó al commit
  `7184910d9eb2b1c5e48f7073824a90609bb9b6d6` (`v2` = `v2.3.1`). Las demás Actions
  se comprobaron como commits de sus tags.
- Build con provenance/SBOM desactivados (ver arriba).
- Validación de plantilla antes del override y de la ejecución real después.
- GET/PATCH con la misma versión de API y espera de la revisión exacta.
- Operación manual `verify-access`, de solo lectura.
- `--verify-access` se ejecutó localmente contra Azure con la cuenta del
  propietario (no con la identidad de CD): aprobado, revisión `0000009` Healthy.

## Fuentes y alcance de la evidencia

Diseño contrastado con documentación oficial de
[workflow_run](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_run),
[OIDC Azure](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-azure),
[environments](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments),
[jobs](https://learn.microsoft.com/en-us/azure/container-apps/jobs),
[PATCH Container Apps](https://learn.microsoft.com/en-us/rest/api/resource-manager/containerapps/container-apps/update?view=rest-resource-manager-containerapps-2025-07-01)
y [permisos ACR](https://learn.microsoft.com/en-us/azure/container-registry/container-registry-rbac-built-in-roles-directory-reference).
La versión de actionlint usada por CI (1.7.12) no acepta `queue: max`; se conserva
la concurrencia tradicional y sus límites documentados arriba.

La validación local del código de orquestación no demuestra federación, permisos
efectivos, push a ACR ni migraciones/despliegue reales. El estado previo observado
en Azure fue revisión `0000009`, Healthy, digest
`sha256:038a8ada25c68338f619bdfc64770dcdd6bb7a923f6f906146e357ebe8573e34`;
esta lectura no es una ejecución del nuevo CD.

Evidencia de esta entrega, 21 de octubre de 2026:

- `actionlint 1.7.12`, sintaxis Bash existente y `git diff --check`: aprobados localmente.
- 24 pruebas de controles de CI, secuencia de actualización y fallos: aprobadas
  localmente; Azure/GitHub se sustituyen por respuestas controladas en esas pruebas.
- Suite Python completa: 298 pruebas aprobadas, tres advertencias de dependencias.
  La primera ejecución restringida tuvo diez errores al abrir puertos locales;
  la repetición con permiso para esos fixtures terminó sin errores.
- Gitleaks 8.30.1: historial completo (98 commits previos) y archivos de la entrega
  sin hallazgos. El escaneo de entrega se limitó a esos archivos, sin caches locales.
- Guard probado contra la API real de GitHub: aceptó el CI push `39691077252`
  para `cdc0e65a4904530971c5640689ae309a1ae00a7c`, con los cuatro jobs exitosos.
- Preflight del script nuevo ejecutado en **solo lectura** contra Azure: aprobado;
  app Single/HTTPS/lista e identidades/jobs existentes coinciden.
- Environment `beta`, política exclusiva rama `main`, variables de tenant y
  suscripción y switch de repositorio `BETA_CD_ENABLED=false`: creados y releídos
  realmente mediante GitHub API. `AZURE_CLIENT_ID` sigue ausente.
- En la entrega inicial no se creó identidad/federación/rol Azure; se crearon
  después, tras aprobación (ver «Configuración de Azure aplicada»).

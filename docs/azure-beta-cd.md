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

El job de despliegue usa el environment `beta`, adquiere el grupo exclusivo
`aiteacher-azure-beta` con `cancel-in-progress: false` y vuelve a validar después
de esperar. Construye el checkout exacto validado, desde `backend/Dockerfile.azure`,
en el runner Linux amd64 y publica en el ACR existente. Las Actions están fijadas
a commits. No descarga artefactos ni cachés de workflows de PR.
La etiqueta incluye SHA, run y attempt para trazabilidad; **solo el digest
devuelto por el build** llega a los jobs y a la aplicación.

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
del job no cambia. Migración usa únicamente `--migrate`: la clave Data Protection
ya existe, por lo que se omite `--bootstrap-data-protection-key` y no se requiere
Crypto Officer. El segundo job ejecuta `--grant-runtime-access` con los permisos
SQL de la identidad migradora existente. Runtime conserva su identidad SQL limitada.
Un fallo, estado terminal de error o timeout impide publicar la nueva app.

El PATCH de Container Apps conserva la plantilla completa, cambia la imagen
de `api` y usa el sufijo de revisión `cd-RUN-ATTEMPT` para evitar colisiones;
incluye la ubicación existente requerida por el contrato REST. No envía configuración,
secretos, ingress, identidad ni tráfico. Se
espera una revisión Healthy/activa con el digest nuevo como `latestReadyRevision`
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

## Propuesta concreta de Azure: pendiente de aprobación

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
5. Tras aprobación, poner `BETA_CD_ENABLED=true` y ejecutar el primer CD manual
   desde main con el ID de su CI **push** exitoso:

   ```bash
   gh workflow run cd-beta.yml --repo GDriem/AITeacher --ref main -f ci_run_id=ID_CI_PUSH_MAIN
   ```

6. Verificar OIDC/RBAC con esa identidad, digest publicado, ambos jobs Succeeded,
   nueva revisión Healthy y smoke. Revisar que secretos, identidades, ingress,
   configuración de IA y datos permanezcan como antes. Desde entonces los
   siguientes CI push exitosos de main disparan el CD automáticamente.

Si faltan permisos, detenerse y revisar la llamada concreta; no conceder roles
amplios para hacer pasar el primer despliegue. Una ejecución manual obsoleta o
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
# Sustituir DIGEST_ANTERIOR por el sha256 de Previous image; no usar una etiqueta.
az containerapp update --subscription 1350d930-7008-4b43-923d-6a7cd66701bc \
  --resource-group rg-aiteacher-beta-8136 --name ca-aiteacher-beta-8136 \
  --container-name api --image craiteacherbeta8136.azurecr.io/aiteacher@sha256:DIGEST_ANTERIOR \
  --output none
bash backend/scripts/verify-azure.sh https://ca-aiteacher-beta-8136.thankfuldune-75a4eb8a.mexicocentral.azurecontainerapps.io
postman collection run 'postman/collections/AITeacher Backend Smoke' \
  --env-var baseUrl=https://ca-aiteacher-beta-8136.thankfuldune-75a4eb8a.mexicocentral.azurecontainerapps.io \
  --no-report-events
```

Comprobar además que `latestReadyRevisionName` corresponda a una revisión Healthy
con ese digest. Registrar motivo y resultado. Este rollback operativo no pasa
por la entrada manual de CD, que solo admite la punta de main validada. Para
reactivar automatización, corregir/revertir el código por PR, esperar el CI push
del nuevo main y revisar antes de cambiar `BETA_CD_ENABLED=true`; reactivar sin
corregir puede volver a publicar la versión fallida.

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
- No se creó identidad/federación/rol Azure, no se publicó imagen, no se ejecutaron
  jobs ni se actualizó la beta con este CD. OIDC, RBAC efectivo, migraciones y
  verificación posterior al despliegue están pendientes del primer run aprobado.

# Recreación de la beta privada en Azure

Destino aprobado: suscripción `1350d930-7008-4b43-923d-6a7cd66701bc` (Driem-Sub-Test), región `mexicocentral`, grupo `rg-aiteacher-beta-8136`.

El historial real, incluyendo diagnósticos/reintentos y sus exit codes, se agrega automáticamente a [azure-command-log.md](azure-command-log.md). Los parámetros locales de OAuth y autores están fuera de Git; usar `azure.parameters.example.json` para recrearlos. No copiar tokens, contraseñas o claves a esta guía.

Estado de esta sesión: el usuario confirmó explícitamente el despliegue, costo, consumos excluidos, siete excepciones y migraciones. La infraestructura y aplicación terminaron Succeeded; migración/bootstrap y permisos SQL Succeeded; 25/25 aserciones Postman reales aprobadas; consultar `.azure/deploy-result.json` y el historial para conocer el resultado real de cada operación.

## Secuencia reproducible

1. Autenticarse con `az login --tenant 82090019-87c1-4439-918c-a31932facc9a --use-device-code` si la sesión expiró. Confirmar la suscripción con `az account show --subscription 1350d930-7008-4b43-923d-6a7cd66701bc`.
2. Instalar Bicep (`az bicep install`) y compilar `infra/main.bicep`.
3. Preparar parámetros no versionados desde el ejemplo, con el Client ID público y los subjects de autores verificados.
4. Ejecutar preview del script; revisar creaciones, identidades aún no resolubles y cambios dentro del grupo aislado.
5. Con la aprobación de costo/riesgo, ejecutar el script en modo deploy. Registra proveedores, provisiona red/datos/identidades/registro/entorno, construye la imagen y fija su digest.
6. El script asigna temporalmente Key Vault Crypto Officer a la identidad migradora, ejecuta el job que inicializa la clave por el endpoint privado y aplica migraciones, y revoca ese permiso incluso ante un fallo. Después ejecuta el job de permisos SQL limitados de runtime. Publica la aplicación únicamente si ambos terminan satisfactoriamente.
7. Verificar HTTPS/readiness/React/worklet. Registrar el origen HTTPS resultante en el cliente OAuth existente; completar federación Google/IA y aceptación de voz real por separado.

```bash
python3 backend/scripts/azure-cli-audit.py account show --subscription 1350d930-7008-4b43-923d-6a7cd66701bc --query '{id:id,name:name,tenantId:tenantId}' -o json
bash backend/scripts/deploy-azure.sh /ruta/privada/azure.parameters.json preview
export AITEACHER_AZURE_DEPLOY_APPROVED='1350d930-7008-4b43-923d-6a7cd66701bc:private-beta'
bash backend/scripts/deploy-azure.sh /ruta/privada/azure.parameters.json deploy
```

Los nombres globales pueden necesitar otro sufijo si se recrea en otra suscripción. El script fija el destino actual y rechaza discrepancias; cambiar parámetros y restricciones del script explícitamente para otro entorno. No ejecutar modoComplete ni borrar recursos ajenos. KeyVault tiene protección contra purga90días; borrar el grupo no permite reutilizar inmediatamente su nombre sin recuperación. Revisar los comandos fallidos del historial antes de repetir operaciones largas.

## Inicialización de la clave privada

La creación de `Microsoft.KeyVault/vaults/keys` por ARM falló con `ForbiddenByConnection` bajo `publicNetworkAccess: Disabled` y `bypass: None`. El Bicep conserva la clave como referencia existente y el job migrador la crea mediante identidad administrada dentro de la VNet. Conserva las versiones existentes y aplica rotación cada 90 días. El acceso de runtime al cifrado se concede en la etapa app, después de crear la clave. La asignación temporal del migrador usa un ID determinista; si falla su revocación, el script se detiene y debe completarse antes de publicar.

## Reutilizar una imagen verificada

Para reanudar sin reconstruir, el script admite `AITEACHER_AZURE_IMAGE_DIGEST` con una referencia inmutable del registro aprobado. La imagen del ajuste privado terminó en ACR run `nj1`:

```bash
export AITEACHER_AZURE_IMAGE_DIGEST='craiteacherbeta8136.azurecr.io/aiteacher@sha256:4920860da1af31f8a379e97aed64dd1150f0ff1ccc1eecf8119fc349ddf08275'
```

Esto evita otro build; no evita los previews ni la comprobación de destino. El entorno debe alcanzar `Succeeded` antes de iniciar los jobs. Una lectura `Waiting` o una respuesta sin error no demuestra que esté listo. Consultar el historial y el estado de despliegue antes de repetir una operación todavía abierta.

Si `aiteacher-private-foundation` ya terminó Succeeded y el proceso local se interrumpió antes de los jobs, usar `AITEACHER_AZURE_RESUME_AFTER_FOUNDATION=1` junto al digest verificado. El script consulta ese estado antes de reanudar; no omite el preview de migraciones/app. No editar el archivo Bash mientras está ejecutándose: el proceso puede leer segmentos posteriores con desplazamientos antiguos.

## Proxy HTTPS y CSRF verificados

La beta usa el rango reservado `100.100.0.0/17` y su equivalente IPv6 `::ffff:100.100.0.0/113`, autorizado explícitamente por el usuario después del rechazo automático del rango más amplio /16 (que no se ejecutó). La confianza inicial en la subred VNet no cubría el proxy interno: se observó `::ffff:100.100.0.26`, esquema HTTP y rechazo de cookie segura. La IP única no bastó; el rango aprobado pasó 25/25 aserciones reales, incluido CSRF200. Se conserva `ForwardLimit=1`, cookies SecureAlways y no se procesa X-Forwarded-Host. Revalidar el rango y su autorización al recrear el entorno.

Última imagen desplegada, build ACR `nj2`: `craiteacherbeta8136.azurecr.io/aiteacher@sha256:5eeae7a0a0baa41865e8855a26b19fd0e5d4f63b14fb1b7f76c50005c8dc2df3`. Reemplazar el digest previo al reanudar. No dar por aceptado Google real ni voz: la IA permanece deshabilitada hasta completar federación/configuración.

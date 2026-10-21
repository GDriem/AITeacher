# Beta privada de AITeacher en Azure

Para actualizar automáticamente la beta existente, ver [CD de beta](../docs/azure-beta-cd.md).
El CD tiene su propia ruta de actualización; no ejecuta el aprovisionamiento de esta guía.

Destino fijo: **Driem-Sub-Test** `1350d930-7008-4b43-923d-6a7cd66701bc`, `mexicocentral`, grupo `rg-aiteacher-beta-8136`.

La web es pública por HTTPS. PostgreSQL tiene acceso público deshabilitado y subred delegada independiente. Blob y Key Vault tienen endpoints privados; la aplicación usa identidad administrada y claves Data Protection compartidas/cifradas. Las migraciones usan otra identidad, con privilegios que no recibe el proceso HTTP. Los recursos Foundry existentes se conservan fuera de este despliegue.

ACR Basic conserva acceso público autenticado, administrador y anónimos deshabilitados. Monitor conserva ingestión/consulta pública autenticada; la instrumentación completa y la exclusión de datos sensibles siguen pendientes de aceptación. Estas excepciones evitan Premium/AMPLS. No hay VPN, NAT Gateway ni Firewall dedicados. El entorno de Container Apps crea balanceador e IPs administrados que sí generan cargos.

## Costo revisado

Estimación mensual, una réplica 8h activas/16h inactivas por día:

| Concepto | USD/mes |
|---|---:|
| Servicios del plan público con franquicias | 38.74 |
| Balanceador administrado | 18.25 |
| Dos IPv4 administradas | 7.30 |
| Dos endpoints privados Blob/Key Vault | 14.60 |
| Tres zonas DNS y 100 mil consultas | 1.54 |
| Total con franquicias | **80.43** |
| Total sin franquicias | **87.50** |

Actividad continua: USD100.30 con franquicias o USD107.37 sin ellas. No es un máximo. Disponibilidad de franquicias/créditos sin confirmar. IA, transferencia, procesamiento de datos de red, builds, impuestos, segunda réplica y excesos de almacenamiento/versiones/backups/retención quedan fuera. Purge protection de Key Vault conserva restricciones de recuperación durante90días. El costo real de infraestructura administrada debe reconciliarse con la factura después del despliegue.

El diseño privado completo aumenta el costo respecto de la estimación pública; **USD0.54 era solo una zona DNS, no toda la red**. Tarifas consultadas en Azure Retail Prices API el20octubre2026: LB0.025/h, IPv4México0.005/h cada una, PE0.01/h cada uno. Base/evidencia regional en la sesión local `.copilot-azure/`.

## Preparación y validación

El plan revisable está en `.azure/infrastructure-plan.json`. Bicep se genera bajo `infra/`. El usuario aprobó explícitamente el despliegue de la beta privada, el rango USD80.43–87.50/mes, los consumos excluidos, las siete excepciones y las migraciones. La aceptación y el corte productivo siguen pendientes.

```bash
az bicep build --file infra/main.bicep --outfile /tmp/aiteacher-main.json
bash -n backend/scripts/deploy-azure.sh backend/scripts/verify-azure.sh
checkov -d infra/ --framework bicep --skip-download
```

Checkov3.3.30 no interpreta todo el Bicep (un error de parsing); escanear también el ARM compilado. Las excepciones se detallan en `security-exceptions.md`; no confundirlas con controles aplicados.

Copiar `infra/azure.parameters.example.json` a un archivo **no versionado** fuera del contexto Docker. Completar Google Web ClientID y al menos un subject de autor. `appEnvironment` admite configuración pública; `secretEnvironment` contiene nombres de secretos KeyVault existentes, nunca valores. Las claves de plataforma están protegidas contra sobrescritura.

La federación Google ADC, proveedores de IA y configuración real de voz aún deben prepararse antes de afirmar aceptación de voz en Azure. No insertar credenciales en la imagen ni usar tokens estáticos. La imagen de prueba mantiene voz deshabilitada hasta completar esa configuración.

## Preview y despliegue

```bash
bash backend/scripts/deploy-azure.sh /ruta/privada/azure.parameters.json preview
```

Revisar `what-if`: las creaciones y actualizaciones se limitan al grupo aislado de la beta. No se permiten eliminaciones ni cambios en recursos referenciados fuera del grupo. Si cambia el target, aparece un reemplazo o un recurso ajeno, detenerse.

Solo después de aprobación final informada de costo/riesgos:

```bash
export AITEACHER_AZURE_DEPLOY_APPROVED='1350d930-7008-4b43-923d-6a7cd66701bc:private-beta'
bash backend/scripts/deploy-azure.sh /ruta/privada/azure.parameters.json deploy
```

El script registra proveedores, crea infraestructura, construye ACR, fija digest, asigna temporalmente permisos de gestión de claves al migrador, inicializa la clave por el endpoint privado y ejecuta `--migrate`, revoca el permiso temporal y ejecuta `--grant-runtime-access`, publica la app y verifica HTTPS/readiness/React/worklet/404. Si cualquier job falla, se detiene; no publica la aplicación nueva. No ejecuta rollback destructivo automático. Requiere permisos de despliegue y asignación RBAC; cuotas no expuestas deben comprobarse de nuevo antes de provisionar.

Para actualizar una beta ya desplegada, revisar el `what-if` de **cada etapa** antes de usar este script; la revisión inicial cubre solo infraestructura, no el cambio de imagen final. La estrategia de reversión que conserva escrituras y restauración debe ensayarse antes de producción.

## Aceptación pendiente

Google real, micrófono físico/interrupciones, continuidad editorial, provisión/SQL/identidad/DNS en Azure, telemetría, RAG durable, streaming y costos de IA, restauración y reversión. Las comprobaciones locales no cierran esas aceptaciones. No cambiar tráfico de producción al aprobar esta beta.

Documentación: [VNet Container Apps](https://learn.microsoft.com/azure/container-apps/custom-virtual-networks), [PostgreSQL privado](https://learn.microsoft.com/azure/postgresql/network/concepts-networking-private), [identidad PostgreSQL](https://learn.microsoft.com/azure/postgresql/security/security-connect-with-managed-identity).

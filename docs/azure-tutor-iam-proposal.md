# Propuesta de federación para el tutor beta

Estado: **preparada, pendiente de aprobación; no ejecutada**. Véase el
[diagnóstico verificado](azure-tutor-enablement.md). La regla del usuario exige
propuesta revisable antes de ampliar IAM, infraestructura o costos fuera del alcance.

## Alcance de aprobación

Reutilizar la identidad runtime Azure y el proyecto Vertex existentes. Crear una
aplicación Entra de audiencia dedicada, su service principal, un pool/proveedor
WIF y un rol GCP con únicamente `aiplatform.endpoints.predict`, asignado al
principal federado exacto. Habilitar STS si sigue deshabilitado. No conceder
permisos Firestore ni impersonación de cuentas existentes; sin claves privadas,
tokens estáticos, nuevos servidores o cambio de modelo.

La identidad runtime podrá invocar inferencia de modelos del proyecto GCP; este
permiso IAM no está limitado al nombre de modelo elegido por la aplicación.
La configuración de aplicación fija Tutor/Summary a `gemini-3.5-flash-lite`,
`global`. El endpoint global puede procesar fuera de México. Envía lecturas y
mensajes de la ventana acotada, sin correos, cookies, tokens Google de alumnos ni
IDs de alumno. El historial y apuntes se guardan normalmente en PostgreSQL Azure.

Costos variables en GCP, no créditos Azure: [tarifa oficial consultada el 21 de
octubre de 2026](https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing),
estándar/global, USD0.30 por millón de tokens de entrada y USD2.50 de salida
(incluye razonamiento). Ejemplo, no predicción ni tope: 8000 entrada + 2000 salida
cuesta USD0.0074 por operación; 1000 operaciones USD7.40. Summary es otra operación.
No se habilita prioridad, grounding externo ni caché pagada. El consumo real,
impuestos, transferencia y builds ACR son adicionales; no hay tope monetario
implementado. Texto conserva timeout 30s y salida 2048 tokens por llamada.
La aprobación solicitada incluye configurar texto/Summary en esta beta y ejecutar
el recorrido de aceptación; voz permanece deshabilitada para una fase posterior.

## Secuencia IAM propuesta

Los comandos siguientes son para ejecutar **después** de aprobar. Fallar ante
cualquier conflicto o error; no reemplazar recursos existentes para forzar éxito.
Reconsultar tenant, identidad, pool, rol y revisión activa; detenerse si difieren
del diagnóstico. Los IDs generados se conservan como configuración pública, no
secreto. No pegar JWT en webs ni imprimir cuerpos de endpoints de tokens.

```bash
# Tenant esperado: 82090019-87c1-4439-918c-a31932facc9a.
# Aplicación de audiencia, sin password/certificado, sin permisos Graph.
tutor_app_id=$(az ad app create --display-name aiteacher-beta-vertex \
  --sign-in-audience AzureADMyOrg --query appId -o tsv)
az ad app update --id "$tutor_app_id" --identifier-uris "api://$tutor_app_id"
az ad sp create --id "$tutor_app_id" --query id -o tsv

gcloud services enable sts.googleapis.com --project=gen-lang-client-0364164089
gcloud iam workload-identity-pools create aiteacher-beta \
  --project=gen-lang-client-0364164089 --location=global \
  --display-name='AITeacher Azure beta'
gcloud iam workload-identity-pools providers create-oidc azure-runtime \
  --project=gen-lang-client-0364164089 --location=global \
  --workload-identity-pool=aiteacher-beta \
  --issuer-uri='https://sts.windows.net/82090019-87c1-4439-918c-a31932facc9a/' \
  --allowed-audiences="api://$tutor_app_id" \
  --attribute-mapping='google.subject=assertion.oid' \
  --attribute-condition="assertion.tid == '82090019-87c1-4439-918c-a31932facc9a' && assertion.oid == '9ab5894a-f252-4dc6-9aab-abcec7740613' && assertion.appid == '5af2d939-6b87-40e5-af8c-f4981681ae57'"
gcloud iam roles create vertexBetaPredict --project=gen-lang-client-0364164089 \
  --title='AITeacher beta inference' --stage=GA \
  --permissions=aiplatform.endpoints.predict
gcloud projects add-iam-policy-binding gen-lang-client-0364164089 \
  --member='principal://iam.googleapis.com/projects/930398712637/locations/global/workloadIdentityPools/aiteacher-beta/subject/9ab5894a-f252-4dc6-9aab-abcec7740613' \
  --role='projects/gen-lang-client-0364164089/roles/vertexBetaPredict' \
  --condition=None
```

Verificar en memoria los claims de un token real de la identidad runtime: issuer,
audiencia, tid, oid y appid. Si el formato es v2 u otro distinto, detener la
activación y ajustar la propuesta explícitamente; no relajar las condiciones.
El binding es de sujeto individual; no usar `principalSet` con comodín.
Validar el permiso del rol contra `GenerateContent` antes de aplicarlo:
[referencia oficial](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/reference/rpc/google.cloud.aiplatform.v1).
No se añade `roles/aiplatform.user`, `roles/iam.workloadIdentityUser` ni
`roles/iam.serviceAccountTokenCreator`.

## Activación y aceptación después de IAM

El [ejemplo público](../backend/configuration/vertex-azure.example.json) requiere
reemplazar su appId por el generado, no usar el placeholder. La identidad
`Azure__ManagedIdentityClientId` ya existe en la app y no cambia. Convertir las
claves anidadas a variables `__` de Container Apps; no configurar
`GOOGLE_APPLICATION_CREDENTIALS`, claves ni `StsEndpoint` en Azure.

1. Construir imagen desde el árbol local revisado, preservando los cambios de
   sesiones anteriores. Registrar diff de esta sesión y digest; no atribuirse
   archivos previos. Revisar la imagen/variables efectivas antes de actualizar.
2. Reconsultar revisión activa (`0000008` fue la observada, no una suposición
   permanente). Cambiar únicamente imagen y variables de IA de la app beta.
   No ejecutar el script de despliegue completo, migraciones o importación curricular.
3. Verificar readiness y que no cambien identidad, red, SQL ni recursos restantes.
   Disponibilidad `enabled` por sí sola no acredita STS o Vertex.
4. Google real: abrir una lectura publicada; crear conversación `reading` con
   su activityId, dos turnos y manifest/source IDs de la revisión activa; guardar
   mensaje como apunte y generar Summary. Verificar persistencia con recarga.
5. Segunda cuenta Google: conversación, mensajes y apunte ajenos deben ser 404;
   sin sesión 401; escritura sin CSRF rechazada. No usar el host de pruebas en Azure.
6. Fallo controlado reversible: probar configuración inválida en un entorno de
   ensayo autorizado, obtener error sanitizado y recuperar la conversación sin
   fuentes inventadas ni respuesta falsa. Los fallos HTTP locales no sustituyen
   esta prueba operativa. No revocar permisos de identidades compartidas para simularlo.
7. Registrar fecha, revisión/digest, capability, modelo, config, latencia/tokens,
   estados HTTP y comprobaciones de referencias; no textos ni identidades de alumnos.

La siguiente fase de voz exige validar WIF contra Live real antes de activarla,
presupuestar audio y distinguir entrada sintética de micrófono físico e
interrupción humana. No queda cubierta por aprobar este cambio de texto.

## Reversión conservadora

Primero deshabilitar `AI__Capabilities__Tutor__Provider` y
`AI__Capabilities__Summary__Provider` (`disabled`) en la app; voz continúa false.
Conservar conversaciones y apuntes; ninguna reversión borra datos. Si la imagen
falla, recuperar el digest previo registrado. No tocar revisión/publicación del
currículo. Revocar solo el binding del principal exacto y deshabilitar el
proveedor WIF dedicado si se necesita cortar confianza. No deshabilitar Vertex,
Firestore ni otras APIs compartidas. La limpieza definitiva de los nuevos objetos
IAM exige comprobar que ninguna otra aplicación los esté usando.

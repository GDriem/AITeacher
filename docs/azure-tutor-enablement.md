# Tutor real de la beta Azure

## Fase 1 — diagnóstico verificado, 21 de octubre de 2026

Se leyeron las instrucciones de colaboración, continuidad curricular, hitos 6/7,
TUTOR, estado vigente de arquitectura e infra/README. No se repitió la importación
ni el ensayo Vertex local documentado. Los cambios anteriores del árbol se conservan.

Consultas de solo lectura realizadas con Azure CLI y gcloud:

- Suscripción `1350d930-7008-4b43-923d-6a7cd66701bc`, grupo
  `rg-aiteacher-beta-8136`, app `ca-aiteacher-beta-8136`.
- Latest y ready: `ca-aiteacher-beta-8136--0000008`, digest
  `sha256:eec351672dbaa63c26d561307977363c6892e74651454f7f49b9c5cbf4d10e8a`.
- Identidad runtime existente: client `5af2d939-6b87-40e5-af8c-f4981681ae57`,
  object `9ab5894a-f252-4dc6-9aab-abcec7740613`; tenant
  `82090019-87c1-4439-918c-a31932facc9a`.
- Solo aparece `AI__Voice__Enabled=false`; Tutor/Summary y ADC no configurados.
- Proyecto GCP `gen-lang-client-0364164089`, número `930398712637`:
  lista de pools WIF vacía. Vertex AI e IAM Credentials habilitados;
  STS no aparece en la consulta de servicios habilitados.
- `learning-agent` tiene `roles/aiplatform.user` y `roles/datastore.user`.
  Impersonarla trasladaría también permisos de datos ajenos al tutor.
  `learning-mcp` tiene acceso a Datastore; no resuelve la brecha.
- No existe aplicación Entra con displayName `aiteacher-beta-vertex` en la
  consulta realizada. El nombre por sí solo no garantiza unicidad futura.

El contrato ya exige sesión, CSRF, propiedad, revisión publicada vigente,
contexto acotado y fuentes verificadas. `savedMessage` y `student` no requieren
Summary; `summary` sí lo requiere. Disponibilidad valida configuración, no hace
una llamada al proveedor y no demuestra credenciales funcionales.

Brecha mínima: credencial renovable desde la identidad runtime de Container Apps,
confianza y permiso Vertex en GCP, configuración explícita Tutor/Summary con el
modelo ya probado `gemini-3.5-flash-lite`, ubicación `global`. Sin fallback.
ADC local no demuestra autenticación en Azure. El endpoint IMDS para VM del
ejemplo Google no corresponde a Container Apps: usar Azure.Identity con la
identidad asignada, que resuelve su endpoint local.

Orbit se consultó para el intercambio STS; devolvió Akamai, HSM y GitLab, sin
contrato aplicable. Se usan las referencias oficiales y el SDK instalado:
[federación Google](https://docs.cloud.google.com/iam/docs/workload-identity-federation-with-other-clouds),
[identidad Container Apps](https://learn.microsoft.com/en-us/azure/container-apps/managed-identity).

## Fases siguientes y puertas

2. Preparar credencial programática Azure → Google STS, pruebas HTTP sintéticas,
   configuración pública y propuesta IAM revisable. Commit propio separado.
3. Solo con aprobación IAM: crear confianza restringida, activar texto/Summary,
   verificar desde Azure y actualizar evidencia. Reconsultar revisión antes de escribir.
4. Recorrido Google real: lectura, conversación, fuentes, apunte, errores y
   aislamiento con dos cuentas. No copiar cookies ni mensajes a Git o logs.
5. Voz después de texto: dos turnos, reconexión, cupos, fallo e interrupción;
   aceptación con micrófono físico separada de cualquier entrada sintética.

Hitos 6/7 y aceptaciones operativas del 8 abiertos. Dominio `uncalibrated`;
sin muestras docentes ni actividades inventadas. Sin corte, migración personal,
retiro de GCP o cambios de escritores Python.

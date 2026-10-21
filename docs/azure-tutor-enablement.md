# Tutor real de la beta Azure

## Continuación autorizada — 21/10/2026

**Tutor de texto y Summary ya funcionan en Azure** en la revisión `0000009`.
Build ACR `nj4`, digest
`sha256:038a8ada25c68338f619bdfc64770dcdd6bb7a923f6f906146e357ebe8573e34`.
Se verificó igualdad de identidad, configuración de plataforma y template ajeno
a imagen/variables IA antes y después de actualizar; sin migraciones/importación.
[Informe de activación](tutor-evidence/azure-activation-20261021.json).

Primera cuenta Google real en Chrome: lectura OSPF publicada, dos turnos con
continuidad, fuente RFC 2328 desplegada, mensaje guardado y Summary generado.
GET autenticados en navegador confirmaron modo reading/activityId, versión de
conversación 3, cuatro mensajes, lease liberado y que todos los source IDs,
unit IDs y revision IDs coinciden con la lectura/publicación activa. El origen
editorial permanece oculto. Summary registra exactamente esos cuatro message IDs
y ninguna fuente nueva; ambos apuntes persisten al recargar.
[Evidencia sin textos ni identidades](tutor-evidence/azure-reading-text-20261021.json).

Vertex real desde Azure registró latencias de 2188ms y 1074ms para los turnos,
1170ms para Summary; 1635 tokens de entrada y 326 de salida en total.
[Métricas sanitizadas](tutor-evidence/azure-text-metrics-20261021.json).
No se decodificó ni exportó un JWT: el intercambio STS y respuesta Vertex reales
demuestran aceptación de issuer/audience/condiciones configuradas, que permanecen
sin relajar. Es evidencia operativa, no aceptación pedagógica.

Postman real anónimo pasó 25/25 aserciones, salida 0, incluyendo readiness,
sesión obligatoria y límites de rutas API. Siguen pendientes segunda cuenta
Google, fallo controlado/recuperación en Azure, autoría y voz humana. La voz
permanece deshabilitada.

El usuario aprobó explícitamente la propuesta IAM y activación de texto/Summary.
Se volvió a comprobar revisión `0000008`, digest e identidad runtime sin cambios,
tenant correcto y ausencia de colisiones antes de crear objetos.

Fase IAM aplicada y verificada: app Entra `78c6aa25-8499-40fc-b1d9-8d81a9948f40`,
audiencia propia, service principal, STS habilitado, pool `aiteacher-beta`,
proveedor `azure-runtime` y rol `vertexBetaPredict`. Condiciones por tenant,
objectId y clientId exactos; binding individual con una sola permission
`aiplatform.endpoints.predict`. Sin claves, permisos Graph, impersonación ni
permisos de datos. No se cambiaron identidad, red ni SQL de Azure.
[Informe IAM sin credenciales](tutor-evidence/azure-iam-20261021.json).

La aprobación ya no es el bloqueo de esta fase. Despliegue, STS/Vertex y recorrido
de una cuenta ya se comprobaron; quedan las aceptaciones indicadas arriba.
La voz continúa false.
Las secciones de diagnóstico siguientes describen el estado previo.

Estado de privacidad tras el recorrido: los GET anónimos sobre la conversación,
sus mensajes y un apunte existentes devolvieron 401. Chrome solo ofreció una
cuenta Google. Se cerró la sesión de la beta para intentar la segunda identidad;
la revisión automática rechazó volver a seleccionar la cuenta disponible porque
lo interpretó como sustitución del ensayo con dos cuentas. No se reintentó ni se
eludió la revisión. Se dejó el selector Google para intervención del usuario.
[Registro sin identidades](tutor-evidence/azure-privacy-status-20261021.json).

La segunda identidad real, autoría, CSRF autenticado y fallo/recuperación reales
siguen abiertos. No se inyectó una configuración defectuosa sin poder completar
el turno autenticado y su recuperación. La app quedó saludable en `0000009`,
Tutor/Summary `vertex`, `azureFederation`, voz `false`; sin variables de claves
ni `GOOGLE_APPLICATION_CREDENTIALS`. El cierre de sesión del navegador no
deshabilita el servicio. El usuario puede continuar el login en la ventana abierta.

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

## Fase 2 — implementación y evidencia local

`ConfiguredVertexCredential` añade modo explícito `azureFederation`, sin fallback
a ADC al fallar. Reutiliza Azure.Identity con clientId runtime y
`ProgrammaticExternalAccountCredential` de Google.Apis.Auth 1.77.0 ya instalado.
El SDK obtiene/renueva tokens temporales en memoria; no se añaden paquetes,
archivos de tokens, claves privadas ni secretos. ADC se conserva para el modo
local existente. El selector nuevo se registra después del registro previo de
Vertex, preservando ese trabajo local anterior sin incluirlo en el commit.

El endpoint STS está fijo en producción; loopback HTTP se admite solo en
Development para la simulación. Se rechazan otras URLs y redirects; audience y
recurso Entra se validan antes de solicitar un token. Los errores SDK de identidad
y STS se transforman en `TutorUnavailableException` sin mensajes/cuerpos originales,
para recorrer el 503 sanitizado y limpieza de turnos ya existentes. La cancelación
usa el presupuesto de operación existente. El token Entra se pide para la audiencia
dedicada, no para ARM ni PostgreSQL. La misma interfaz sirve a voz, sin habilitarla.

Verificación ejecutada:

- Build .NET: cero errores y cero advertencias; conserva el SDK preview del proyecto.
- 90 pruebas API + 9 de dominio aprobadas, sin omisiones. PostgreSQL local real;
  proveedores Google de alumno e IA sintéticos. Incluye fuentes, apuntes,
  aislamiento, fallos y voz del gateway local ya existentes.
- 10 pruebas nuevas de federación: SDK real sobre HTTP hacia Postman STS;
  intercambio, caché concurrente, scope de audiencia, rechazo de confianza,
  cancelación, redirects y configuración insegura. La fuente de token Azure es
  sintética; esto no acredita Managed Identity ni confianza STS reales en Azure.
- Postman emitió eventos request para POST `/v1/token`: éxito 200, rechazo 400,
  redirect 307 y dependencia lenta. No se siguió el redirect. Logs efímeros;
  solo tokens ficticios. Mock derivado de la referencia STS oficial, no publicado.
- OpenAPI sin incidencias de sintaxis; `node --check` del mock, JSON de configuración
  y `git diff --check` aprobados. No cambia el contrato HTTP público.

Reproducción de las pruebas nuevas (dos terminales, raíz del repo):

```sh
/Users/gadiorellana/.local/bin/postman simulation run postman/simulations/vertex-federation.sim.yaml --port 4910 --no-history --output ndjson
AITEACHER_TEST_STS_URL=http://127.0.0.1:4910/sts/v1/token dotnet test backend/tests/AITeacher.Api.Tests --filter FullyQualifiedName~VertexFederationTests
```

La simulación de tutor existente incluye ahora STS; la suite completa reutiliza
`AITEACHER_TEST_AI_URL` y PostgreSQL del procedimiento de TUTOR.md.

La [propuesta IAM](azure-tutor-iam-proposal.md) incluye comandos, confianza por
tenant/object/client exactos, rol de una sola permission de inferencia, consumo
de texto/Summary, configuración pública, reversión y puerta de aceptación.
Se preparó un ejemplo público; no se ejecutaron esos comandos ni se desplegó imagen.
El commit de implementación depende del trabajo previo presente en el árbol
(VertexCredential, AzureHosting y referencias de paquetes); no lo incorpora ni
pretende que una clonación de HEAD sin esos archivos reproduzca toda la beta.

## Pendientes por hito después de esta fase

| Hito | Avance verificable | Pendiente |
| --- | --- | --- |
| 4 / tutor | Autenticación federada preparada y HTTP sintético probado; Tutor/Summary configurables por separado | Aprobar IAM, activar en Azure, conversación contextual, fuentes y apuntes reales |
| 6 | Sin cambios en políticas ni evaluación | Muestras docentes y calibración; mantener `uncalibrated` |
| 7 | Brecha de tutor identificada sin reimportar las 82 lecturas; se conserva aislamiento local probado | Dos Google reales, autoría, calidad pedagógica, continuidad de actividades y voz humana |
| 8 | Revisión/identidad efectivas consultadas y propuesta reversible | IAM aprobado, despliegue/aceptación de texto, costos reales, telemetría, restauración, reversión y corte |

Bloqueo concreto de activación: no existe confianza WIF y requiere cambios IAM
fuera de la autorización previa de despliegue. No hay error de cuota/proveedor
Vertex medido desde Azure porque aún no puede autenticarse. El tutor de texto
real y Summary **no están habilitados ni aceptados en Azure** en esta fase.

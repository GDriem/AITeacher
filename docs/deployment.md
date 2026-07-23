# Despliegue en Google Cloud Run

Esta guía prepara dos servicios independientes. **No ejecute los comandos sin
revisar proyecto, región, cuotas y presupuesto:** Cloud Build, Artifact Registry,
Cloud Run, Vertex AI y Firestore pueden generar costos.

## Arquitectura de despliegue

- `learning-agent`: interfaz pública, ADK/agentes, Gemini y WebSocket de voz.
- `learning-mcp`: servicio privado con herramientas y Firestore.
- `learning-agent` obtiene un ID token de su identidad de servicio y usa como
  audiencia la URL base de `learning-mcp`.
- Sólo la cuenta `learning-agent` recibe `roles/run.invoker` sobre MCP.
- Agent App guarda conversaciones en la colección Firestore
  `learning_sessions`; su cuenta recibe `roles/datastore.user`.

Se recomienda desplegar ambos servicios en la misma región. Cloud Run recomienda
cuentas administradas por el usuario y mínimo privilegio para comunicación entre
servicios.

## Prerrequisitos

1. Proyecto GCP con facturación y `gcloud` autenticado.
2. Base Firestore creada en Native mode en la región elegida.
3. Cuota de Vertex AI/Gemini Live API confirmada.
4. Permisos para habilitar APIs, Cloud Build, Artifact Registry, IAM y Cloud Run.

## Despliegue reproducible

El script es deliberadamente manual y no se ejecuta desde la aplicación:

```bash
export PROJECT_ID="mi-proyecto"
export REGION="us-central1"
export TAG="demo-001"
bash infra/cloudrun/deploy.sh
```

El script habilita APIs, crea repositorio y cuentas si no existen, asigna los
roles mínimos, construye dos imágenes, despliega MCP privado, concede invocación
al Agent App y despliega la interfaz pública con Vertex AI.

Los manifiestos en `infra/cloudrun/*-service.yaml` son plantillas auditables.
Reemplace `PROJECT_ID`, `REGION`, `TAG`, `MCP_SERVICE_URL` y `MCP_SERVICE_HOST`
antes de aplicarlos. `MCP_SERVICE_HOST` es el hostname (sin `https://`) que
Cloud Run asigna a `learning-mcp`; sólo se conoce después de su primer
despliegue. `deploy.sh` ya lo resuelve automáticamente con
`gcloud run services update learning-mcp --update-env-vars MCP_ALLOWED_HOSTS=...`.
Sin este valor, la protección anti DNS-rebinding de FastMCP (habilitada por
defecto sólo para `localhost`) rechaza con `421` cualquier llamada
`learning-agent → learning-mcp`, porque el `Host` header real nunca es
`localhost`.

## Secret Manager

El despliegue predeterminado usa identidad de servicio y Vertex AI, por lo que no
necesita una API key. Si usa Gemini Developer API, guarde `GOOGLE_API_KEY` en
Secret Manager y vincúlelo con `--set-secrets`; conceda
`roles/secretmanager.secretAccessor` únicamente al Agent App.

Para Foundry, almacene `AZURE_TENANT_ID`, `AZURE_CLIENT_ID` y
`AZURE_CLIENT_SECRET` como secretos del Agent App. Los datos enviados al modelo
saldrán de GCP hacia Azure; revise residencia, red y cumplimiento.

## Verificación

```bash
AGENT_URL="$(gcloud run services describe learning-agent \
  --region "$REGION" --format='value(status.url)')"
curl "$AGENT_URL/healthz"
curl "$AGENT_URL/api/capabilities"
```

MCP debe responder `403` sin identidad. Para una prueba autenticada:

```bash
MCP_URL="$(gcloud run services describe learning-mcp \
  --region "$REGION" --format='value(status.url)')"
curl -H "Authorization: Bearer $(gcloud auth print-identity-token \
  --audiences="$MCP_URL")" "$MCP_URL/healthz"
```

No registre ID tokens, secretos ni audio.

## Rollback

```bash
gcloud run revisions list --service learning-agent --region "$REGION"
gcloud run services update-traffic learning-agent --region "$REGION" \
  --to-revisions REVISION_ANTERIOR=100
```

Repita para `learning-mcp` si cambió su contrato. Las evaluaciones están en
Firestore y las conversaciones en `learning_sessions`; no se eliminan al volver
una revisión. Para rollback de esquema, prepare una migración compatible; no
borre documentos desde el despliegue.

## Eliminación controlada

Revise dependencias antes de eliminar servicios e imágenes. Firestore contiene
progreso y debe conservarse o exportarse según la política del evento. No se
incluye un script destructivo automático.


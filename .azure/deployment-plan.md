# Azure App Service deployment plan

Status: Planning (guide only; deployment execution is not authorized)

## Objective

Document a manual Azure CLI deployment of `agent_app` to Azure App Service. Continuous deployment is out of scope. The private MCP service, Firestore, Vertex AI/Gemini, Google Login, and their data remain in Google Cloud.

## Application analysis

- Path: modernize an existing non-Azure application by adding an Azure hosting target.
- Runtime: Python 3.13, FastAPI.
- Packaging: `pyproject.toml` with optional dependency groups `agents`, `cloud`, and `foundry`.
- Container: `agent_app/Dockerfile` already builds the required application image.
- Process: `python -m agent_app.api.main`.
- HTTP port: 8080 in the container.
- Health endpoints: `/healthz` for liveness and `/readyz` for the MCP dependency.
- Voice mode uses WebSockets and requires HTTPS.

## Deployment architecture

| Component | Location after deployment | Notes |
|---|---|---|
| `agent_app` web/API | Azure App Service (Linux custom container) | Only component moved to Azure |
| Container image | Azure Container Registry | Manually built and tagged; no webhook/CD |
| `mcp_learning_server` | Existing private Google Cloud Run service | App Service calls its `/mcp/` endpoint |
| Student progress | Existing Google Firestore | Accessed through MCP |
| Sessions and student profiles | Existing Google Firestore | Accessed directly by `agent_app` |
| Gemini / Vertex AI | Existing Google Cloud project | No model migration |
| Google Login | Existing Google OAuth client | Add the Azure HTTPS origin |

## Azure resources

The minimum Azure inventory is one resource group, one Basic Azure Container Registry, one Linux App Service plan, and one Web App. A system-assigned managed identity is used only to pull the image from ACR. Subscription, location, naming, policy, quota, and final SKU must be confirmed before execution.

## Google authentication prerequisite

The current Cloud Run deployment receives Google Application Default Credentials from its attached service account. App Service does not receive those credentials automatically. For a first manual/POC upload, use a dedicated least-privilege Google service account key supplied at runtime and rotate it afterward. The target production design is Workload Identity Federation; it requires adapting the current App Service token acquisition and the Cloud Run ID-token generation path, so it is a separate hardening change rather than part of the first upload.

Required Google permissions for the dedicated identity:

- `roles/aiplatform.user` in the Google project.
- `roles/datastore.user` in the Google project.
- `roles/run.invoker` on the private `learning-mcp` Cloud Run service.

## Application configuration

Required non-secret settings include `WEBSITES_PORT=8080`, `APP_PORT=8080`, `MODEL_PROVIDER=gemini`, Vertex AI project/location settings, Firestore backends and collection names, the MCP URL/audience, secure cookies, and WebSockets. Secret values include the Google service-account credential, `APP_SESSION_SECRET`, and optional authoring tokens; none are stored in this plan.

## Manual deployment procedure

1. Confirm Azure subscription, region, globally unique Web App name, and ACR name.
2. Confirm the existing Cloud Run MCP URL and dedicated Google service account.
3. Create the resource group, ACR, Linux App Service plan, and Web App with Azure CLI.
4. Build `agent_app/Dockerfile` with `az acr build` and a versioned tag.
5. Grant the Web App system identity `AcrPull` on ACR.
6. Configure application settings and the temporary Google credential materialization step.
7. Explicitly keep container continuous deployment disabled.
8. Restart and validate `/healthz`, `/readyz`, Google Login, text chat, Firestore persistence, and voice WebSocket behavior.
9. For later manual releases, build a new immutable image tag and point the Web App at that tag.

## Validation and rollback

- Stream container logs with Azure CLI if startup or readiness fails.
- `/healthz` verifies that the process is alive; `/readyz` additionally verifies the private Cloud Run MCP call.
- Rollback is performed by changing the Web App container image back to the previous immutable ACR tag and restarting the app.

## Out of scope

- Continuous integration or continuous deployment.
- Migration of Google services or data to Azure.
- Workload Identity Federation implementation.
- Deployment execution, subscription policy checks, and quota checks during this guide-only phase.

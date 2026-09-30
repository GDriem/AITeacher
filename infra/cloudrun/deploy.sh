#!/usr/bin/env bash
set -euo pipefail

# Este script es la única fuente de la configuración de learning-mcp y
# learning-agent: no existen manifiestos Knative y nunca se usa
# `gcloud run services replace`. La configuración efectiva resultante está
# resumida en la sección "Despliegue en Cloud Run" del README; si cambia algo
# aquí, actualice esa tabla.

# En proyectos creados desde 2024, Cloud Build puede usar una cuenta de servicio
# predeterminada distinta; el primer builds submit puede requerir permisos de
# Artifact Registry o la opción --service-account.

: "${PROJECT_ID:?Set PROJECT_ID}"
: "${GOOGLE_CLIENT_ID:?Set GOOGLE_CLIENT_ID}"
: "${APP_SESSION_SECRET:?Set APP_SESSION_SECRET}"
REGION="${REGION:-us-central1}"
FIRESTORE_LOCATION="${FIRESTORE_LOCATION:-nam5}"
REPOSITORY="${REPOSITORY:-agent-mcp-run}"
TAG="${TAG:-$(date +%Y%m%d-%H%M%S)}"
SESSION_SECRET_NAME="${SESSION_SECRET_NAME:-learning-agent-session-secret}"
MCP_TIMEOUT_SECONDS="${MCP_TIMEOUT_SECONDS:-20}"
GEMINI_MODEL="${GEMINI_MODEL:-gemini-3.5-flash-lite}"
GEMINI_LIVE_MODEL="${GEMINI_LIVE_MODEL:-gemini-live-2.5-flash-native-audio}"
GEMINI_LIVE_VOICE="${GEMINI_LIVE_VOICE:-Kore}"
GEMINI_LOCATION="${GEMINI_LOCATION:-us}"
GEMINI_LIVE_LOCATION="${GEMINI_LIVE_LOCATION:-us-central1}"

gcloud config set project "${PROJECT_ID}"
gcloud services enable run.googleapis.com artifactregistry.googleapis.com \
  cloudbuild.googleapis.com firestore.googleapis.com aiplatform.googleapis.com \
  secretmanager.googleapis.com

gcloud firestore databases describe --database='(default)' >/dev/null 2>&1 || \
  gcloud firestore databases create --database='(default)' \
    --location="${FIRESTORE_LOCATION}" --type=firestore-native

gcloud artifacts repositories describe "${REPOSITORY}" --location "${REGION}" \
  >/dev/null 2>&1 || gcloud artifacts repositories create "${REPOSITORY}" \
  --repository-format docker --location "${REGION}"

gcloud iam service-accounts describe "learning-mcp@${PROJECT_ID}.iam.gserviceaccount.com" \
  >/dev/null 2>&1 || gcloud iam service-accounts create learning-mcp
gcloud iam service-accounts describe "learning-agent@${PROJECT_ID}.iam.gserviceaccount.com" \
  >/dev/null 2>&1 || gcloud iam service-accounts create learning-agent

gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member "serviceAccount:learning-mcp@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role roles/datastore.user
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member "serviceAccount:learning-agent@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role roles/aiplatform.user
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member "serviceAccount:learning-agent@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role roles/datastore.user

gcloud secrets describe "${SESSION_SECRET_NAME}" >/dev/null 2>&1 || \
  gcloud secrets create "${SESSION_SECRET_NAME}" --replication-policy automatic
printf '%s' "${APP_SESSION_SECRET}" | \
  gcloud secrets versions add "${SESSION_SECRET_NAME}" --data-file=-
gcloud secrets add-iam-policy-binding "${SESSION_SECRET_NAME}" \
  --member "serviceAccount:learning-agent@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role roles/secretmanager.secretAccessor

MCP_IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/mcp-server:${TAG}"
AGENT_IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/agent-app:${TAG}"
gcloud builds submit --config infra/cloudrun/build-images.yaml \
  --substitutions "_MCP_IMAGE=${MCP_IMAGE},_AGENT_IMAGE=${AGENT_IMAGE}" .

gcloud run deploy learning-mcp --image "${MCP_IMAGE}" --region "${REGION}" \
  --service-account "learning-mcp@${PROJECT_ID}.iam.gserviceaccount.com" \
  --no-allow-unauthenticated --set-env-vars \
"MCP_PROGRESS_BACKEND=firestore,GOOGLE_CLOUD_PROJECT=${PROJECT_ID},FIRESTORE_PROGRESS_COLLECTION=student_progress" \
  --startup-probe httpGet.path=/healthz --liveness-probe httpGet.path=/healthz

MCP_URI="$(gcloud run services describe learning-mcp --region "${REGION}" --format='value(status.url)')"

# El Host header de las llamadas MCP entre servicios sólo se conoce una vez
# desplegado learning-mcp (Cloud Run asigna el dominio en este paso). Sin
# este allowlist, la protección anti DNS-rebinding de FastMCP responde 421
# Misdirected Request a cualquier host distinto de localhost.
MCP_HOST="${MCP_URI#https://}"
MCP_HOST="${MCP_HOST#http://}"
gcloud run services update learning-mcp --region "${REGION}" \
  --update-env-vars "MCP_ALLOWED_HOSTS=${MCP_HOST}"

gcloud run services add-iam-policy-binding learning-mcp --region "${REGION}" \
  --member "serviceAccount:learning-agent@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role roles/run.invoker

# El WebSocket de voz puede mantener sesiones de más de cinco minutos.
gcloud run deploy learning-agent --image "${AGENT_IMAGE}" --region "${REGION}" \
  --service-account "learning-agent@${PROJECT_ID}.iam.gserviceaccount.com" \
  --allow-unauthenticated --max-instances 3 --concurrency=40 \
  --timeout=3600 \
  --set-secrets "APP_SESSION_SECRET=${SESSION_SECRET_NAME}:latest" \
  --set-env-vars \
"MODEL_PROVIDER=gemini,GOOGLE_GENAI_USE_VERTEXAI=true,GOOGLE_CLOUD_PROJECT=${PROJECT_ID},GOOGLE_CLOUD_LOCATION=${GEMINI_LOCATION},GOOGLE_CLOUD_LIVE_LOCATION=${GEMINI_LIVE_LOCATION},GEMINI_MODEL=${GEMINI_MODEL},GEMINI_LIVE_MODEL=${GEMINI_LIVE_MODEL},GEMINI_LIVE_VOICE=${GEMINI_LIVE_VOICE},APP_SESSIONS_BACKEND=firestore,FIRESTORE_SESSIONS_COLLECTION=learning_sessions,APP_SESSION_RETENTION_DAYS=365,APP_STUDENT_PROFILES_BACKEND=firestore,FIRESTORE_STUDENT_PROFILES_COLLECTION=student_profiles,GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID},APP_AUTH_COOKIE_SECURE=true,MCP_USE_LOCAL_ADAPTER=false,MCP_SERVER_URL=${MCP_URI}/mcp/,MCP_AUTHORING_URL=${MCP_URI}/admin,MCP_TIMEOUT_SECONDS=${MCP_TIMEOUT_SECONDS},MCP_AUTH_AUDIENCE=${MCP_URI}" \
  --startup-probe httpGet.path=/healthz --liveness-probe httpGet.path=/healthz

gcloud run services describe learning-agent --region "${REGION}" --format='value(status.url)'

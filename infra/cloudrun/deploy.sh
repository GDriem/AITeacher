#!/usr/bin/env bash
set -euo pipefail

: "${PROJECT_ID:?Set PROJECT_ID}"
REGION="${REGION:-us-central1}"
REPOSITORY="${REPOSITORY:-agent-mcp-run}"
TAG="${TAG:-$(date +%Y%m%d-%H%M%S)}"

gcloud config set project "${PROJECT_ID}"
gcloud services enable run.googleapis.com artifactregistry.googleapis.com \
  cloudbuild.googleapis.com firestore.googleapis.com aiplatform.googleapis.com

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

gcloud run deploy learning-agent --image "${AGENT_IMAGE}" --region "${REGION}" \
  --service-account "learning-agent@${PROJECT_ID}.iam.gserviceaccount.com" \
  --allow-unauthenticated --max-instances 3 --set-env-vars \
"MODEL_PROVIDER=gemini,GOOGLE_GENAI_USE_VERTEXAI=true,GOOGLE_CLOUD_PROJECT=${PROJECT_ID},GOOGLE_CLOUD_LOCATION=${REGION},GEMINI_LIVE_MODEL=gemini-live-2.5-flash-native-audio,APP_SESSIONS_BACKEND=firestore,FIRESTORE_SESSIONS_COLLECTION=learning_sessions,APP_SESSION_RETENTION_DAYS=365,MCP_USE_LOCAL_ADAPTER=false,MCP_SERVER_URL=${MCP_URI}/mcp/,MCP_AUTH_AUDIENCE=${MCP_URI}" \
  --startup-probe httpGet.path=/healthz --liveness-probe httpGet.path=/healthz

gcloud run services describe learning-agent --region "${REGION}" --format='value(status.url)'

#!/usr/bin/env bash
# No destructive/Complete-mode deployment; requires a reviewed parameter file.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# Record every Azure command, including polling, without logging response bodies.
az() { python3 "$root/backend/scripts/azure-cli-audit.py" "$@"; }
subscription='1350d930-7008-4b43-923d-6a7cd66701bc'
region='mexicocentral'
group='rg-aiteacher-beta-8136'
prefix='aiteacher-beta-8136'
registry='craiteacherbeta8136'
parameters="${1:?Usage: deploy-azure.sh /absolute/path/azure.parameters.json preview|deploy}"
mode="${2:-preview}"
[[ "$mode" == preview || "$mode" == deploy ]] || exit 2
[[ "$parameters" == /* && -f "$parameters" ]] || { echo 'Provide an existing absolute parameter-file path.' >&2; exit 2; }
python3 - "$parameters" <<'PY'
import json,sys,re
p=json.load(open(sys.argv[1]))['parameters']
for key,expected in [('location','mexicocentral'),('resourceGroupName','rg-aiteacher-beta-8136'),('resourcePrefix','aiteacher-beta-8136')]:
    if p.get(key,{}).get('value',expected)!=expected: raise SystemExit('Parameter target differs from approved plan: '+key)
reserved=('ConnectionStrings__','Azure__','Database__','DataProtection__','Proxy__','ASPNETCORE_')
for section in ['appEnvironment','secretEnvironment']:
    for key,value in p.get(section,{}).get('value',{}).items():
        if key.startswith(reserved) or key.startswith('Authentication__'): raise SystemExit('Reserved environment setting: '+key)
        if section=='appEnvironment' and re.search(r'(ApiKey|Secret|Password|Token|Credential)',key,re.I): raise SystemExit('Use Key Vault references for '+key)
        if section=='secretEnvironment' and not re.fullmatch(r'[A-Za-z0-9-]{1,127}',str(value)): raise SystemExit('Expected Key Vault secret NAME for '+key)
cid=p.get('googleClientId',{}).get('value','')
if not cid or 'REPLACE' in cid: raise SystemExit('Configure a real Google Web client ID first.')
if not p.get('authorGoogleSubjects',{}).get('value'): raise SystemExit('Configure at least one editorial author Google subject.')
PY
actual="$(az account show --subscription "$subscription" --query id -o tsv)"
[[ "$actual" == "$subscription" ]] || exit 2
az bicep build --file "$root/infra/main.bicep" --stdout >/dev/null
common=(--subscription "$subscription" --location "$region" --template-file "$root/infra/main.bicep" --parameters "@$parameters")
preview_file="$(mktemp)"
bootstrap_role_id=''
cleanup() {
  local code=$?
  if [[ -n "$bootstrap_role_id" ]]; then
    az role assignment delete --subscription "$subscription" --ids "$bootstrap_role_id" --output none || code=1
  fi
  rm -f "$preview_file"
  exit "$code"
}
trap cleanup EXIT
preview_stage() {
  az deployment sub what-if "${common[@]}" --parameters "$@" --no-pretty-print --output json > "$preview_file"
  python3 - "$preview_file" "$subscription" "$group" <<'PY'
import json,sys,collections
d=json.load(open(sys.argv[1]));scope=f'/subscriptions/{sys.argv[2]}/resourceGroups/{sys.argv[3]}'
if d.get('status')!='Succeeded': raise SystemExit('Azure preview did not succeed.')
for change in d.get('changes',[]):
    kind=change.get('changeType');rid=change.get('resourceId','')
    if kind not in ['Create','Modify','NoChange','Ignore','Unsupported']: raise SystemExit('Preview proposes a removal; stop and review: '+rid)
    if not rid.startswith('[') and not (rid==scope or rid.startswith(scope+'/')): raise SystemExit('Preview includes a resource outside the beta group.')
print('Azure preview:',dict(collections.Counter(x['changeType'] for x in d.get('changes',[]))))
print('Only the isolated beta group may be updated; referenced resources elsewhere and deletions are rejected.')
PY
}
if [[ "$mode" == preview ]]; then
  preview_stage deployStage=infrastructure
  exit
fi
[[ "${AITEACHER_AZURE_DEPLOY_APPROVED:-}" == '1350d930-7008-4b43-923d-6a7cd66701bc:private-beta' ]] || {
  echo 'Deployment requires the explicit final private-beta approval documented in infra/README.md.' >&2; exit 2;
}
if [[ "${AITEACHER_AZURE_RESUME_AFTER_FOUNDATION:-}" == 1 ]]; then
  state="$(az deployment sub show --subscription "$subscription" --name aiteacher-private-foundation --query properties.provisioningState -o tsv)"
  [[ "$state" == Succeeded ]] || { echo 'Foundation deployment has not succeeded; cannot resume.' >&2; exit 2; }
else
  for provider in Microsoft.App Microsoft.DBforPostgreSQL Microsoft.Network Microsoft.ManagedIdentity Microsoft.ContainerRegistry Microsoft.Storage Microsoft.KeyVault Microsoft.OperationalInsights Microsoft.Insights Microsoft.AlertsManagement; do
    az provider register --subscription "$subscription" --namespace "$provider" --wait --output none
  done
  preview_stage deployStage=infrastructure
  az deployment sub create "${common[@]}" --name aiteacher-private-foundation --parameters deployStage=infrastructure --output none
fi
image="${AITEACHER_AZURE_IMAGE_DIGEST:-}"
if [[ -n "$image" ]]; then
  [[ "$image" =~ ^craiteacherbeta8136\.azurecr\.io/aiteacher@sha256:[a-f0-9]{64}$ ]] || { echo 'Expected immutable image in the approved beta registry.' >&2; exit 2; }
else
  tag="beta-$(date -u +%Y%m%d%H%M%S)"
  az acr build --subscription "$subscription" --registry "$registry" --image "aiteacher:$tag" --file "$root/backend/Dockerfile.azure" "$root" --output none
  digest="$(az acr repository show --subscription "$subscription" --name "$registry" --image "aiteacher:$tag" --query digest -o tsv)"
  [[ "$digest" == sha256:* ]] || { echo 'Image digest not returned.' >&2; exit 1; }
  image="$registry.azurecr.io/aiteacher@$digest"
fi
preview_stage deployStage=migrate containerImage="$image"
az deployment sub create "${common[@]}" --name aiteacher-private-migrate --parameters deployStage=migrate containerImage="$image" --output none
run_job() {
  local name="$1" execution status deadline
  execution="$(az containerapp job start --subscription "$subscription" --resource-group "$group" --name "$name" --query name -o tsv)"
  [[ -n "$execution" ]] || return 1
  deadline=$((SECONDS+1800))
  while (( SECONDS < deadline )); do
    status="$(az containerapp job execution show --subscription "$subscription" --resource-group "$group" --name "$name" --job-execution-name "$execution" --query properties.status -o tsv)"
    case "$status" in Succeeded) return 0;; Failed|Stopped|Degraded) echo "Job $name failed: $status" >&2; return 1;; esac
    sleep 10
  done
  echo "Job $name timed out." >&2; return 1
}
# Temporary, explicitly revoked key-management access for the private migration job.
# Runtime keeps only wrap/unwrap on the single key; no Key Vault public access is enabled.
migrator_oid="$(az identity show --subscription "$subscription" --resource-group "$group" --name "id-$prefix-migrator" --query principalId -o tsv)"
vault_scope="/subscriptions/$subscription/resourceGroups/$group/providers/Microsoft.KeyVault/vaults/kv-$prefix"
bootstrap_role_name="$(python3 - "$vault_scope" "$migrator_oid" <<'PYROLE'
import sys,uuid
print(uuid.uuid5(uuid.NAMESPACE_URL, sys.argv[1] + '/private-bootstrap/' + sys.argv[2]))
PYROLE
)"
bootstrap_role_id="$vault_scope/providers/Microsoft.Authorization/roleAssignments/$bootstrap_role_name"
az role assignment create --subscription "$subscription" --name "$bootstrap_role_name" --assignee-object-id "$migrator_oid" --assignee-principal-type ServicePrincipal --role 'Key Vault Crypto Officer' --scope "$vault_scope" --output none
run_job "job-migrate-$prefix"
az role assignment delete --subscription "$subscription" --ids "$bootstrap_role_id" --output none
bootstrap_role_id=''

run_job "job-grant-$prefix"
preview_stage deployStage=app containerImage="$image"
az deployment sub create "${common[@]}" --name aiteacher-private-app --parameters deployStage=app containerImage="$image" --output none
fqdn="$(az containerapp show --subscription "$subscription" --resource-group "$group" --name "ca-$prefix" --query properties.configuration.ingress.fqdn -o tsv)"
bash "$root/backend/scripts/verify-azure.sh" "https://$fqdn"
printf 'Beta URL: https://%s\nImage: %s\n' "$fqdn" "$image"

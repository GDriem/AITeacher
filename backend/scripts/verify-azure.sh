#!/usr/bin/env bash
set -euo pipefail
url="${1:?Usage: verify-azure.sh https://application-host}"
[[ "$url" == https://* && "$url" != *'?'* ]] || { echo 'Expected HTTPS application URL.' >&2; exit 2; }
url="${url%/}"
curl --fail --silent --show-error --retry 12 --retry-delay 5 --retry-all-errors --max-time 20 "$url/health/ready" >/dev/null
curl --fail --silent --show-error --max-time 20 "$url/" >/dev/null
curl --fail --silent --show-error --max-time 20 "$url/static/pcm-capture-worklet.js" >/dev/null
for path in /api/does-not-exist /ws/does-not-exist; do
  status="$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' --max-time 20 "$url$path")"
  [[ "$status" == 404 ]] || { echo "Unexpected status $status for $path" >&2; exit 1; }
done
echo 'HTTPS readiness, React shell, voice worklet and API/WebSocket 404 boundaries passed.'
echo 'Real Google login, microphone, editorial continuity and AI acceptance remain separate checks.'

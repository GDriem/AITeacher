# T01 — Crear la base Firestore y endurecer `deploy.sh`

**Carril:** infra · **Depende de:** — · **Prioridad:** bloqueante

## Contexto

`infra/cloudrun/deploy.sh` habilita `firestore.googleapis.com` pero nunca crea la
base de datos. Habilitar la API no crea la base: en un proyecto nuevo, la primera
escritura de sesión o de progreso falla con `NOT_FOUND` y se cae todo el flujo
(`APP_SESSIONS_BACKEND=firestore`, `MCP_PROGRESS_BACKEND=firestore`).

Además el script deja tres valores por defecto que no sirven en Cloud Run:

- No pasa `--timeout`, así que `learning-agent` hereda 300 s y el WebSocket de
  voz (`/ws/live`) se corta a los 5 minutos.
- No pasa `MCP_TIMEOUT_SECONDS`, así que el cliente MCP usa 5 s
  (`agent_app/config.py`). `learning-mcp` arranca en `minScale 0`, y el primer
  chat tras un rato inactivo tiene que absorber el arranque en frío dentro de
  esos 5 s.
- No pasa `MCP_AUTHORING_URL`, que queda en `http://localhost:8001/admin`. Hoy no
  rompe nada porque la autoría está deshabilitada (sin `MCP_AUTHORING_TOKEN`),
  pero es una bomba de tiempo para quien la habilite.

## Archivos que puedes tocar

- `infra/cloudrun/deploy.sh`
- `README.md` (sólo si documentas un requisito nuevo)

## Cambios

1. **Crear la base Firestore, idempotente**, después de `gcloud services enable`
   y antes de desplegar nada. Usa el mismo patrón `describe || create` que ya
   usa el script para el repositorio de Artifact Registry y las cuentas de
   servicio. La base `(default)` en modo nativo:

   ```bash
   gcloud firestore databases describe --database='(default)' >/dev/null 2>&1 || \
     gcloud firestore databases create --database='(default)' \
       --location="${FIRESTORE_LOCATION}" --type=firestore-native
   ```

   Añade `FIRESTORE_LOCATION="${FIRESTORE_LOCATION:-nam5}"` a las variables del
   principio, junto a `REGION`. No uses `REGION` directamente: las ubicaciones de
   Firestore son un conjunto distinto al de regiones de Cloud Run, y una base mal
   ubicada no se puede mover después — sólo borrar y recrear.

2. **`--timeout=3600`** en el `gcloud run deploy` de `learning-agent`, para que
   una sesión de voz larga no muera a los 5 minutos. Déjalo comentado en una
   línea: es por el WebSocket, no por las peticiones HTTP.

3. **`MCP_TIMEOUT_SECONDS=20`** dentro del `--set-env-vars` de `learning-agent`.
   Hazlo parametrizable arriba (`MCP_TIMEOUT_SECONDS="${MCP_TIMEOUT_SECONDS:-20}"`).

4. **`MCP_AUTHORING_URL=${MCP_URI}/admin`** en el mismo `--set-env-vars`, al lado
   de `MCP_SERVER_URL`.

5. **`--concurrency=40`** en `learning-agent`. El default de Cloud Run es 80 y el
   repositorio de sesiones de Firestore es síncrono dentro de handlers `async`
   (eso lo arregla T06; mientras tanto, bajar la concurrencia contiene el daño).

6. Si el script no lo menciona ya, añade un comentario al principio avisando de
   que en proyectos creados desde 2024 la cuenta de servicio por defecto de
   Cloud Build cambió y el primer `gcloud builds submit` puede necesitar
   `--service-account` o permisos de Artifact Registry.

## Lo que NO debes hacer

- **No ejecutes `deploy.sh`, ni `gcloud`, ni ningún comando que cree recursos.**
  Genera costos reales en el proyecto del usuario y requiere confirmación
  explícita suya cada vez. Esta tarea sólo edita el script.
- No cambies el modelo, la región de Vertex (`GOOGLE_CLOUD_LOCATION=us`) ni
  `GOOGLE_CLOUD_LIVE_LOCATION=us-central1`: están verificados y funcionan.

## Verificación

```bash
bash -n infra/cloudrun/deploy.sh                       # sintaxis
grep -n "firestore databases" infra/cloudrun/deploy.sh # el paso nuevo existe
grep -n "timeout\|MCP_TIMEOUT_SECONDS\|MCP_AUTHORING_URL\|concurrency" \
  infra/cloudrun/deploy.sh
```

Además, relee el script completo y confirma que `set -euo pipefail` sigue en la
primera línea y que ningún comando nuevo puede abortar el script cuando el
recurso ya existe.

## Commit sugerido

`Crear la base Firestore y ajustar tiempos en el despliegue`

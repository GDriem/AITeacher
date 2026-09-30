# T10 — Ampliar `smoke-test.sh` a `/ready` y al camino MCP

**Carril:** infra-3 · **Depende de:** — · **Prioridad:** media

## Contexto

`infra/cloudrun/smoke-test.sh` comprueba cuatro cosas: `/api/capabilities`, `/`,
una ruta profunda de React, y que la raíz contenga `<div id="root">`. Todas pasan.

Pero no toca **nada de lo que realmente se rompe en un despliegue**: la
conectividad entre `learning-agent` y `learning-mcp`. Los tres fallos más
probables del primer despliegue —`MCP_ALLOWED_HOSTS` sin el host de Cloud Run
(`421 Misdirected Request`), IAM sin `run.invoker` (`403`), arranque en frío
pasándose del timeout— **dan verde en el smoke test actual**, porque `/` y
`/api/capabilities` no llaman al MCP.

`/ready` sí lo llama: devuelve 503 con `{"status":"not_ready","dependency":"learning-mcp"}`
cuando el MCP no responde. No está en el script.

## Archivos que puedes tocar

- `infra/cloudrun/smoke-test.sh`
- `README.md`

## Cambios

Añade, usando los helpers `check` y `check_body_contains` que ya existen:

1. **`GET /health` → 200.** Barato y confirma que el servicio arrancó.
2. **`GET /ready` → 200.** Es *la* comprobación que falta: si da 503, el camino
   al MCP está roto y el despliegue no sirve, por muy bien que se vea la UI.
3. **`GET /api/capabilities` con verificación del cuerpo**, no sólo del 200.
   Debe traer `"text":true`. Si se despliega con voz, también `"voice":true`;
   hazlo condicional a una variable de entorno (`EXPECT_VOICE=1`) para que el
   script sirva en despliegues sin voz.

Sobre `/ready` y el arranque en frío: con `learning-mcp` en `minScale 0`, la
primera llamada puede tardar. Dale al `curl` de `/ready` un timeout holgado
(`--max-time 30`) y, si falla, **reinténtalo una vez** antes de darlo por
perdido. Un solo reintento: si hacen falta más, es que hay un problema de verdad
y el script debe decirlo.

Mantén el estilo actual: `set -uo pipefail`, salida con `✓`/`✗`, `failed=1`, y el
bloque final que recuerda cómo revertir el tráfico. Todo en español.

## Verificación

```bash
bash -n infra/cloudrun/smoke-test.sh
```

Contra el stack local, que replica la topología de Cloud Run (agent → MCP remoto
por Streamable HTTP):

```bash
docker compose -f docker-compose.yml -f docker-compose.gcp.yml up -d
AGENT_URL=http://localhost:8000 bash infra/cloudrun/smoke-test.sh   # todo ✓
```

Y comprueba que **falla** cuando debe:

```bash
docker compose stop mcp-server
AGENT_URL=http://localhost:8000 bash infra/cloudrun/smoke-test.sh   # ✗ en /ready, exit 1
docker compose -f docker-compose.yml -f docker-compose.gcp.yml up -d
```

Ese segundo caso es el que justifica la tarea: si no falla, el script sigue sin
servir. Deja el stack levantado **con el overlay `docker-compose.gcp.yml`** al
terminar: sin él, el agent-app pierde las credenciales ADC y todo `/api/chat`
devuelve 500.

## Commit sugerido

`Verificar el camino al MCP en el smoke test de despliegue`

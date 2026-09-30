# T07 — Reutilizar cliente MCP y cachear el ID token

**Carril:** mcp-client · **Depende de:** — · **Prioridad:** alta

## Contexto

Medido en la auditoría: **un turno de chat genera 8 POST HTTP a `/mcp/`**.

La causa está en `RemoteMcpLearningTools._call`
(`agent_app/services/learning_tools.py:100-130`). Cada llamada lógica a una
herramienta:

1. pide un ID token nuevo (`_identity_token` → `id_token.fetch_id_token`, que
   crea credenciales desde cero y va al metadata server);
2. abre un `httpx.AsyncClient` nuevo → handshake TLS nuevo;
3. rehace el handshake MCP completo (`initialize` + `notifications/initialized`)
   antes del `tools/call`.

O sea ~3-4 viajes HTTP por cada llamada de herramienta. En local con Docker son
milisegundos. Entre dos servicios de Cloud Run, con TLS y autenticación IAM en
cada uno, se nota — y el `MCP_TIMEOUT_SECONDS` (20 s tras T01) cubre todo eso
junto.

El servidor es `stateless_http=True`, así que el handshake por llamada no aporta
nada: no hay sesión que preservar.

## Archivos que puedes tocar

- `agent_app/services/learning_tools.py`
- `agent_app/api/main.py` (sólo si hace falta cerrar el cliente en el shutdown)
- `tests/`

## Cambios

1. **Un `httpx.AsyncClient` por instancia**, creado perezosamente y reutilizado,
   en vez de uno por llamada. Eso conserva el pool de conexiones y evita rehacer
   TLS. Añade un `aclose()` y engánchalo al `shutdown` de FastAPI si el ciclo de
   vida lo permite; si no encaja limpio, deja el cliente vivo y anótalo.

2. **Cachea el ID token.** Los ID tokens de Google duran ~1 hora. Guarda token y
   expiración, y refresca sólo cuando falten menos de ~5 minutos. Protege el
   refresco con un `asyncio.Lock` para que varias peticiones concurrentes no
   disparen N refrescos simultáneos.

   Ojo con el orden actual: `_identity_token()` se llama **fuera** del
   `asyncio.timeout(self.timeout_seconds)`, así que hoy el fetch del token no
   consume el presupuesto de tiempo. Si mueves código, no rompas eso.

3. **No caches el resultado de las herramientas.** El progreso del alumno cambia
   entre llamadas; cachearlo introduciría bugs de datos obsoletos.

4. Si `streamable_http_client` permite reutilizar la sesión MCP entre llamadas
   sin romper el modelo stateless, considéralo — pero **sólo si sale limpio**. La
   ganancia grande está en 1 y 2; no fuerces 4 ni reescribas el transporte.

## Cuidado con los secretos

El ID token es una credencial. **Nunca** lo escribas en un log, ni en un mensaje
de excepción, ni en un `repr`. Es una regla explícita del proyecto
(`.claude/CLAUDE.md`): «Nunca loguear ID tokens, secretos, ni audio». Si añades
logs de diagnóstico, que registren sólo si el token venía de caché o se refrescó.

## Verificación

- `python -m pytest -q` sin regresiones.
- Test del caché con un reloj inyectable: dos llamadas seguidas piden el token
  una sola vez; pasada la expiración, lo vuelven a pedir.
- Test de concurrencia: N llamadas simultáneas con el caché frío producen **un**
  solo fetch.
- `tests/integration/test_agent_mcp_remote.py` levanta un servidor MCP real; debe
  seguir en verde.

Medición opcional, si el stack local está levantado con
`docker compose -f docker-compose.yml -f docker-compose.gcp.yml up -d`:

```bash
MARK=$(date -u +%Y-%m-%dT%H:%M:%S); sleep 1
curl -s -o /dev/null -X POST http://localhost:8000/api/chat \
  -H 'content-type: application/json' \
  -d '{"student_id":"perf","message":"Quiero aprender sobre RAG"}'
sleep 1; docker compose logs --since "${MARK}Z" mcp-server | grep -c 'POST /mcp/'
```

Antes: 8. Apunta el número que obtengas después.

## Commit sugerido

`Reutilizar la conexión al MCP y cachear el ID token`

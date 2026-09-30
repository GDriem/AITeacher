# T03 — Degradar con 503 JSON cuando el MCP no responde

**Carril:** api · **Depende de:** — · **Prioridad:** bloqueante

## Contexto

`agent_app/agents/orchestrator.py` llama a las herramientas MCP sin `try/except`
(líneas ~113, ~126, ~248, ~336, ~384). Si `learning-mcp` no responde —arranque en
frío con `minScale 0`, `421 Misdirected Request` por `MCP_ALLOWED_HOSTS` mal
configurado, `403` por IAM— la excepción sube sin capturar.

`agent_app/api/main.py` registra manejadores para `AuthenticationError`,
`ValueError`, `KeyError` y `PermissionError`, pero no para `TimeoutError` ni
`RuntimeError`, que son justamente lo que levanta `RemoteMcpLearningTools`
(`asyncio.timeout` → `TimeoutError`; error del servidor → `RuntimeError`).

Comportamiento reproducido con el MCP simulado caído:

```
ready  -> 503 {"status":"not_ready",...}      correcto
health -> 200                                  Cloud Run sigue enviando tráfico
chat    -> 500 Internal Server Error            texto plano, ni JSON
```

El frontend espera JSON en todos los errores, así que el usuario ve un fallo
opaco. Y como `/health` no mira el MCP, Cloud Run nunca retira la instancia.

## Archivos que puedes tocar

- `agent_app/api/main.py`
- `agent_app/services/learning_tools.py` (sólo para introducir la excepción de dominio)
- `tests/unit/` y/o `tests/integration/` (tests nuevos)

## Cambios

1. **Una excepción de dominio.** En `agent_app/services/learning_tools.py`, define
   algo como `LearningToolsUnavailable(RuntimeError)` y haz que
   `RemoteMcpLearningTools._call` envuelva en ella los fallos de transporte:
   `TimeoutError`, `httpx.HTTPError` y el `RuntimeError` que ya levanta cuando
   `result.isError`. Conserva la causa con `raise ... from exc`.

   Distingue bien: un `RuntimeError` porque la herramienta MCP devolvió un error
   de negocio (tema inexistente, por ejemplo) **no** es lo mismo que el servidor
   caído. Si no puedes distinguirlos con la información disponible, trátalos
   todos como no disponible y anótalo como supuesto en tu respuesta.

2. **Un manejador en `create_app`**, junto a los otros `@app.exception_handler`:

   ```python
   @app.exception_handler(LearningToolsUnavailable)
   async def learning_tools_unavailable(_: Request, exc) -> JSONResponse:
       return JSONResponse(status_code=503, content={"detail": "..."})
   ```

   El `detail` va en español, dirigido al alumno, y no filtra la URL interna del
   MCP ni el texto crudo de la excepción. Algo del tipo: «El catálogo de
   aprendizaje no está disponible en este momento. Vuelve a intentarlo en unos
   segundos.»

3. **Registra el fallo con traza.** En el manejador, `logger.exception(...)` con
   el `correlation_id` de `request.state`. (T05 arregla que la traza sobreviva al
   formateador; no dependas de esa tarea, sólo escribe el log bien.)

4. **No cambies `/health`.** Es la sonda de arranque y de vida de Cloud Run: si
   empieza a depender del MCP, un MCP caído reinicia en bucle el agent-app y
   pierdes también el chat. `/ready` ya cubre la dependencia y está bien como está.

## Verificación

Escribe un test que sustituya las herramientas por un doble que levante
`TimeoutError`, y que compruebe:

- `POST /api/chat` → **503**, cuerpo JSON con clave `detail`
- `GET /health` → **200** (no debe cambiar)
- `GET /ready` → **503**

`create_app` acepta `tools=` por parámetro, así que puedes inyectar el doble sin
tocar red. Mira cómo lo hacen los tests existentes en `tests/` antes de inventar
un patrón nuevo.

```bash
python -m pytest -q
```

## Commit sugerido

`Responder 503 en JSON cuando el servidor MCP no está disponible`

# T05 — Tracebacks y `severity` en el log JSON

**Carril:** logging · **Depende de:** — · **Prioridad:** alta

## Contexto

`agent_app/services/logging.py` define un `JsonFormatter` que arma el payload a
mano y **nunca añade `exc_info`**. Comprobado:

```python
try: raise RuntimeError("fallo MCP simulado")
except Exception: log.exception("http_request_failed", extra={...})
```
```json
{"timestamp":"...","level":"ERROR","logger":"demo","message":"http_request_failed",
 "correlation_id":"abc","route":"/api/chat","status_code":500}
```

Ni el tipo de excepción ni la traza. Afecta a todos los `logger.exception` de la
app: `voice_session_failed`, `readiness_dependency_failed`,
`voice_session_context_unavailable` y los `except` del chat. En los 500 la traza
sí aparece, pero porque uvicorn la imprime aparte y en texto plano.

Segundo problema: Cloud Logging clasifica por el campo **`severity`**, no por
`level`. Con el nombre actual, todo aterriza como `DEFAULT` y un ERROR no se
distingue de un INFO al filtrar en la consola de GCP.

## Archivos que puedes tocar

- `agent_app/services/logging.py`
- `tests/unit/` (test nuevo)

## Cambios

1. **`severity`.** Emite el nivel bajo la clave `severity` con el valor que
   espera Cloud Logging (`DEBUG`, `INFO`, `WARNING`, `ERROR`, `CRITICAL`).
   `record.levelname` ya usa esos nombres salvo `WARN`/`FATAL`, que Python no
   genera por defecto. Mantén también `level` si quieres no romper nada que lo
   lea, pero `severity` es el que importa.

2. **La traza.** Cuando `record.exc_info` esté presente, añade el tipo de la
   excepción y la traza formateada. `logging.Formatter` ya trae
   `self.formatException(record.exc_info)`; úsalo en vez de escribir uno propio.
   Mete el resultado en una clave propia (por ejemplo `exception`) para no
   ensuciar `message`. Cubre también `record.stack_info`.

3. **Los logs de uvicorn siguen en texto plano.** `uvicorn.run()` reconfigura sus
   propios loggers después de `configure_logging()`, así que en el contenedor
   conviven líneas JSON y líneas como
   `INFO:     192.168.65.1:21395 - "POST /api/chat HTTP/1.1" 200 OK`.
   Unificarlo requiere pasarle un `log_config` a `uvicorn.run` en
   `agent_app/api/main.py:main()` y en `mcp_learning_server/server.py:main()`.
   **Esto es opcional**: hazlo sólo si sale limpio, y si no, déjalo y anótalo en
   tu respuesta como trabajo pendiente. No rompas el arranque por esto.

## Verificación

Test que capture la salida del formateador y compruebe:

- un `log.exception` produce JSON con la clave de traza, y el texto de la traza
  contiene el nombre de la excepción original
- `severity` vale `ERROR` en ese caso y `INFO` en un `log.info`
- el resultado sigue siendo JSON parseable con `json.loads` (el formateador ya
  usa `ensure_ascii=False`; los mensajes del proyecto llevan acentos)

```bash
python -m pytest -q
```

Comprobación manual rápida:

```bash
python -c "
import logging
from agent_app.services.logging import configure_logging
configure_logging()
try: raise RuntimeError('prueba')
except Exception: logging.getLogger('x').exception('fallo')
"
```

## Commit sugerido

`Conservar la traza y usar severity en el log estructurado`

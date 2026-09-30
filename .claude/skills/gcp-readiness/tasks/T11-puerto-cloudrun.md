# T11 — Honrar el `PORT` que inyecta Cloud Run

**Carril:** arranque · **Depende de:** T09 · **Prioridad:** baja

## Contexto

Cloud Run **siempre** inyecta la variable `PORT` en el contenedor y espera que el
proceso escuche ahí. Ninguno de los dos servicios la lee:

- `agent_app/config.py` → `app_port: int = 8000`, poblado desde `APP_PORT`
- `mcp_learning_server/server.py:main()` → `int(os.getenv("MCP_PORT", "8001"))`

Hoy funciona por coincidencia: los dos `Dockerfile` fijan `ENV APP_PORT=8080` /
`MCP_PORT=8080` y el default de Cloud Run también es 8080. Se rompe en cuanto
alguien despliegue con `--port` distinto, o use una plataforma que asigne el
puerto dinámicamente.

No es urgente. Es una trampa silenciosa: el contenedor arranca, escucha en 8080,
Cloud Run sondea otro puerto, y el despliegue falla con un error de salud que no
apunta a la causa.

## Archivos que puedes tocar

- `agent_app/config.py`
- `agent_app/api/main.py`
- `mcp_learning_server/server.py`
- `tests/`

## Cambios

Haz que `PORT`, cuando esté presente, tenga prioridad sobre `APP_PORT` /
`MCP_PORT`. El orden que quieres es: `PORT` → la variable específica → el default.

En `agent_app`, la configuración pasa toda por `Settings` (pydantic-settings), que
es la fuente única del proyecto: resuélvelo ahí, no con un `os.getenv` suelto en
`main()`. `pydantic-settings` admite varios alias para un mismo campo
(`AliasChoices`); mira cómo están declarados los demás campos antes de elegir la
forma.

En `mcp_learning_server/server.py` no hay `Settings`, así que el `os.getenv` es
el patrón local correcto; sólo añade `PORT` delante con el mismo orden.

Mantén los defaults actuales (8000 y 8001) para que el flujo local documentado en
`README.md` y el de `docker-compose.yml` no cambien.

## Verificación

- Test: con `PORT=9090` y `APP_PORT=8080`, `Settings` resuelve 9090.
- Test: sin `PORT`, con `APP_PORT=8080`, resuelve 8080.
- Test: sin ninguna, resuelve el default.
- Lo mismo para el MCP.
- `python -m pytest -q`

Cuidado: los tests del proyecto se aíslan del `.env` local a propósito (commit
`adf08c0`). Sigue ese patrón — mira cómo lo hacen los tests existentes antes de
escribir los tuyos — y **no toques `.env`**, que tiene credenciales del usuario.

Comprobación manual:

```bash
PORT=9090 MODEL_PROVIDER=mock MCP_USE_LOCAL_ADAPTER=true \
  python -c "from agent_app.config import Settings; print(Settings().app_port)"
```

## Commit sugerido

`Honrar la variable PORT que inyecta Cloud Run`

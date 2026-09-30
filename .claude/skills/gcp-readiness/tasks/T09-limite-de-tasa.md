# T09 — Límite de tasa en los endpoints que llaman al modelo

**Carril:** api · **Depende de:** T08 · **Prioridad:** media

## Contexto

`learning-agent` es público (`--allow-unauthenticated`) y cada `POST /api/chat`,
`/api/evaluate`, `/api/practice/*` y `/api/projects/*/evaluate` dispara una
llamada de pago a Gemini. No hay ningún límite por usuario ni por IP.

`--max-instances 3` pone un techo al gasto, pero no protege: un bucle desde un
solo cliente consume la capacidad de las tres instancias y deja fuera a los
alumnos reales.

Mitigación parcial que ya existe: con `GOOGLE_CLIENT_ID` configurado, todos esos
endpoints exigen sesión de Google (verificado: 401 sin cookie). Así que el
atacante necesita al menos una cuenta Google. Eso acota el problema, no lo
elimina.

## Archivos que puedes tocar

- `agent_app/api/main.py`
- `agent_app/config.py` (para los parámetros nuevos)
- `agent_app/services/` (si el contador merece módulo propio)
- `tests/`

## Cambios

Un límite por `student_id` sobre los endpoints que invocan al modelo. Mantenlo
**simple y en memoria**: ventana deslizante o token bucket, con un `Lock`, del
mismo estilo que `ObservabilityRegistry` en
`agent_app/services/observability.py`. No metas Redis ni una dependencia nueva.

Consecuencia que debes aceptar y documentar: con varias instancias de Cloud Run,
el límite es *por instancia*, así que el techo real es N×límite. Para este
proyecto es suficiente; escribir eso en el código como comentario vale más que
una solución distribuida que nadie va a operar.

Parámetros nuevos en `Settings`, con defaults generosos para no estorbar a un
alumno real ni romper la demo (algo como 30 peticiones por minuto por alumno).
Un valor de `0` debe desactivar el límite; así el guion de demo y los tests no
dependen de él.

Al exceder el límite: **429** con cuerpo JSON `{"detail": "..."}` en español y
cabecera `Retry-After`. Reutiliza el patrón de `@app.exception_handler` que ya
hay en `create_app`.

No apliques el límite a `/healthz`, `/readyz`, `/api/capabilities`,
`/api/auth/*`, `/static/*` ni `/assets/*`.

## Verificación

- Test: superar el límite devuelve 429 con `Retry-After`.
- Test: el límite es por alumno, no global — dos `student_id` distintos no se
  estorban.
- Test: con el límite en `0`, mil peticiones pasan.
- Test: `/healthz` y `/api/capabilities` nunca reciben 429.
- `python -m pytest -q`

## Commit sugerido

`Limitar la tasa de peticiones que invocan al modelo`

# T08 — Proteger `/api/observability`

**Carril:** api · **Depende de:** T06 · **Prioridad:** media

## Contexto

`learning-agent` se despliega con `--allow-unauthenticated` (es la UI pública), y
`GET /api/observability` no exige nada. Verificado con `GOOGLE_CLIENT_ID`
configurado y sin cookie de sesión:

```
POST /api/chat            -> 401
GET  /api/sessions        -> 401
GET  /api/observability   -> 200   ← expone tokens, costo estimado y latencias
GET  /api/capabilities    -> 200   ← correcto, el frontend lo necesita sin sesión
GET  /api/auth/status     -> 200   ← correcto
```

El endpoint no filtra contenido ni identificadores de alumnos —el módulo está
escrito con ese cuidado— pero sí revela volumen de uso, costo acumulado y
latencias p95 de un servicio que cualquiera puede sondear.

## Archivos que puedes tocar

- `agent_app/api/main.py`
- `frontend/src/features/observability/` (si el panel necesita ajustarse)
- `tests/`

## Cambios

Exige sesión autenticada en `GET /api/observability`, con la misma mecánica que
ya usan el resto de endpoints (`resolve_student_id` / `authenticated_profile`).

Detalle que importa: cuando `auth_service is None` (desarrollo local sin
`GOOGLE_CLIENT_ID`, y el modo en que corren los tests y la demo) **el endpoint
debe seguir abierto**. Si lo cierras también ahí, rompes el flujo local y el
guion de demo. La condición es «si la autenticación está habilitada, exígela».

Revisa `frontend/src/features/observability/HealthPanel.tsx`: si hoy consulta el
endpoint antes de que el usuario inicie sesión, ahora recibirá 401. Haz que
maneje ese caso sin romper la pantalla — ocultar el panel o mostrar un aviso
breve, lo que encaje con el diseño existente.

## Verificación

- Test: con `GOOGLE_CLIENT_ID` configurado y sin cookie → **401**.
- Test: sin `GOOGLE_CLIENT_ID` → **200** (comportamiento local intacto).
- Test: con cookie válida → **200**.
- `python -m pytest -q`
- Si tocas el frontend: `cd frontend && corepack pnpm test` y
  `corepack pnpm build`.

## Commit sugerido

`Exigir sesión para consultar las métricas de observabilidad`

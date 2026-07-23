# Guion de demo

## Preparación

```bash
python -m mcp_learning_server.server
# En otra terminal
MODEL_PROVIDER=mock MCP_USE_LOCAL_ADAPTER=false \
MCP_SERVER_URL=http://localhost:8001/mcp/ python -m agent_app.api.main
```

En PowerShell, asigne esas variables con `$env:NOMBRE="valor"`. Abra
`http://localhost:8000` y confirme `/healthz` en ambos servicios.

## Recorrido principal (8–10 minutos)

1. Muestre la interfaz y diga: “El modelo genera; los agentes deciden y delegan;
   MCP ofrece operaciones deterministas”.
2. Pregunte: **“Explícame qué son los embeddings, pero primero comprueba cuánto
   sé”**.
3. Señale la delegación a `diagnostic_agent` y `get_student_progress`.
4. Muestre que `tutor_agent` llama `search_learning_content` y recibe fragmentos
   con fuente. Destaque que el tutor no inventa referencias.
5. Lea la explicación adaptada y la pregunta corta del `evaluator_agent`.
6. Responda: **“Un embedding es un vector de significado y la similitud permite
   comparar elementos cercanos.”**
7. Muestre `save_learning_result`, el puntaje y el progreso actualizado.
8. Abra Cloud Run y explique que MCP es privado y se invoca con ID token.
9. Opcional: cambie `MODEL_PROVIDER=foundry`; recalque que la app sigue en GCP y
   la inferencia cruza hacia Azure.

El panel muestra eventos, decisiones resumidas, herramientas, resultados y
duración; nunca chain-of-thought.

## Voz

Si Gemini Live está configurado, pulse el micrófono, conceda permiso y formule la
pregunta. La API key permanece en el backend. Termine pulsando de nuevo. Continúe
la evaluación por texto para enseñar el fallback deliberado.

## Plan B

- **Sin credenciales/modelo:** `MODEL_PROVIDER=mock`.
- **Sin red:** `MCP_USE_LOCAL_ADAPTER=true`; no requiere el segundo proceso.
- **Sin voz/micrófono:** el botón queda deshabilitado y todo funciona por texto.
- **Sin Cloud Run:** enseñe la arquitectura, manifiestos y health checks locales.
- **MCP remoto falla:** reinicie sólo `mcp_learning_server`.


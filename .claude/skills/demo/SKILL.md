---
name: demo
description: Launch the Agent, MCP & Run demo locally (mcp_learning_server + agent_app), verify health, and walk through the recommended demo conversation from docs/demo-script.md. Use when the user wants to run, start, demo, or try out the teacher-mcp project.
trigger: /demo
---

# /demo — Agent, MCP & Run

Levanta la demo local completa siguiendo `docs/demo-script.md`: servidor MCP
(`mcp_learning_server`) + Agent App (`agent_app`), sin credenciales cloud.

## Antes de ejecutar

1. Verifica que existe `.venv` en la raíz del proyecto (`teacher-mcp/`). Si no
   existe, créalo e instala dependencias:
   ```powershell
   python -m venv .venv
   .venv\Scripts\Activate.ps1
   python -m pip install -e ".[dev,agents,foundry]"
   ```
   Si ya existe `.venv`, actívalo y continúa (no reinstales salvo que falte un
   paquete).
2. Confirma que los puertos 8000 y 8001 están libres antes de lanzar procesos
   nuevos (evita procesos huérfanos de una corrida anterior).

## Modo por defecto: dos procesos con MCP real

Este es el modo recomendado para la charla (modo realista, sección 15.3 del
PDF / `docs/demo-script.md`). Usa `MODEL_PROVIDER=mock` para no requerir
credenciales de Gemini.

**Terminal / proceso 1 — servidor MCP (puerto 8001):**
```powershell
python -m mcp_learning_server.server
```

**Terminal / proceso 2 — Agent App (puerto 8000):**
```powershell
$env:MODEL_PROVIDER="mock"
$env:MCP_USE_LOCAL_ADAPTER="false"
$env:MCP_SERVER_URL="http://localhost:8001/mcp/"
python -m agent_app.api.main
```

Lanza ambos como procesos en background (no bloqueantes) para poder verificar
salud después. Si el usuario pide explícitamente "modo rápido sin red", usa en
su lugar un solo proceso:
```powershell
$env:MODEL_PROVIDER="mock"
$env:MCP_USE_LOCAL_ADAPTER="true"
python -m agent_app.api.main
```

## Verificación de salud

```powershell
curl http://localhost:8001/healthz   # MCP Server
curl http://localhost:8000/healthz   # Agent App
```

Ambos deben responder `{"status": "ok", ...}`. Si `8001/healthz` falla,
reinicia solo el proceso de `mcp_learning_server` (no el Agent App) — así lo
indica el plan B del guion de demo.

## Recorrido de la conversación (docs/demo-script.md)

Una vez ambos servicios respondan, abre `http://localhost:8000` e indica al
usuario que puede probar:

1. **Pregunta:** "Explícame qué son los embeddings, pero primero comprueba
   cuánto sé."
2. Señala en el panel de trazabilidad la delegación: `diagnostic_agent` →
   `get_student_progress`, luego `tutor_agent` → `search_learning_content`
   (fragmentos con fuente), luego la pregunta corta de `evaluator_agent`.
3. **Respuesta de evaluación sugerida:** "Un embedding es un vector de
   significado y la similitud permite comparar elementos cercanos."
4. Señala `save_learning_result` y el progreso actualizado tras responder.

## Plan B (si algo falla)

- Sin modelo/credenciales: ya cubierto por `MODEL_PROVIDER=mock`.
- Sin red: usa el modo rápido de un solo proceso (`MCP_USE_LOCAL_ADAPTER=true`).
- Sin voz/micrófono: el botón queda deshabilitado; todo funciona por texto.
- MCP remoto falla: reinicia únicamente `mcp_learning_server`, no el Agent App.

## Notas

- Nunca ejecutes `infra/cloudrun/deploy.sh` como parte de esta skill — es un
  script manual que genera costos reales en GCP y requiere confirmación
  explícita del usuario, revisión de proyecto/región/cuotas/presupuesto.
- No se necesita `.env` para este modo; `.env.example` documenta las variables
  pero ninguna es obligatoria con `MODEL_PROVIDER=mock`.

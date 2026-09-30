---
name: gcp-readiness
description: Ejecuta por partes el backlog de remediación previo al despliegue en GCP (Cloud Run + Firestore + Vertex AI) de AITeacher. Despacha cada tarea a un agente aparte para no consumir el contexto de la sesión principal. Úsala cuando el usuario pida arreglar los hallazgos de la auditoría, avanzar el backlog de despliegue, "siguiente tarea", o preparar el proyecto para subirlo a GCP.
trigger: /gcp-readiness
---

# /gcp-readiness

Cola de remediación derivada de la auditoría del 2026-09-28. Cada tarea es un
archivo autocontenido en `tasks/`. **Esta skill orquesta; no edita código.** El
trabajo lo hace un ejecutor por tarea —Codex por defecto— con su propio
contexto, para que la sesión principal no cargue diffs ni transcripts.

## Uso

```
/gcp-readiness                 # muestra la cola y despacha el siguiente lote listo
/gcp-readiness status          # sólo la cola, sin despachar
/gcp-readiness T03             # despacha una tarea concreta
/gcp-readiness next 3          # despacha hasta 3 tareas listas en paralelo
/gcp-readiness codex T03       # ejecuta con Codex (por defecto)
/gcp-readiness agente T03      # ejecuta con un subagente de Claude
/gcp-readiness headless T03    # ejecuta con claude -p en otra terminal
/gcp-readiness verify T03      # sólo corre los criterios de aceptación de T03
```

## Cómo despachar

Tres ejecutores. El trabajo es el mismo; cambia quién lo hace y dónde corre.

### Codex (por defecto)

Claude orquesta, Codex ejecuta. Un comando por tarea:

```bash
bash .claude/skills/gcp-readiness/dispatch-codex.sh T02
```

Devuelve por stdout el informe JSON del contrato `codex-report.schema.json`
—estado, archivos tocados, salida de verificación, supuestos— y **sólo eso**.
El transcript completo queda en `runs/<ID>.log` y no entra nunca en esta sesión:
ahí está el ahorro. Léelo únicamente si el informe dice `blocked` o `partial`.

Varias tareas de carriles distintos: lánzalas en un solo mensaje con varias
llamadas a Bash y `run_in_background: true`.

Antes de la primera tarea del día, `dispatch-codex.sh --check` confirma la
conexión sin tocar el repositorio (~10 s).

El script encierra varios detalles que costaron descubrir; si algo falla, el
motivo suele estar ahí y está comentado en el propio archivo. El resumen: Codex
cuelga si no le cierras stdin y el esquema estricto exige *todas* las
propiedades en `required`. El agente siempre trabaja sin red para que el checkout
y la salida a Internet nunca compartan el mismo límite de seguridad. La prueba
de transporte MCP que abre un servidor efímero en localhost queda fuera de su
verificación. El orquestador revisa primero el diff y luego ejecuta la suite
completa como paso separado; no se ejecuta código recién escrito por el agente
con red antes de esa revisión.

### Subagente de Claude

Cuando la tarea necesite juicio sobre el diseño del proyecto —T04 y T06 tienen
decisión abierta— o cuando Codex devuelva `blocked`. Un `Agent` por tarea, en un
solo mensaje si son varias:

```
subagent_type: "general-purpose"
description: "<ID> <slug>"
prompt: "Estás en /Users/gadiorellana/Source/AITeacher.
         Lee .claude/skills/gcp-readiness/tasks/<ID>-<slug>.md y ejecútalo
         completo, incluida la sección «Verificación». No toques archivos fuera
         de «Archivos que puedes tocar». Responde sólo con: archivos
         modificados, salida de los comandos de verificación, y cualquier
         supuesto que hayas tenido que asumir."
```

El agente lee el archivo de tarea por su cuenta: el cuerpo nunca entra aquí.

### Claude headless

Otra terminal, fuera de esta sesión:

```bash
claude -p "Lee y ejecuta .claude/skills/gcp-readiness/tasks/<ID>-<slug>.md
completo, incluida su sección Verificación." \
  --permission-mode acceptEdits > /tmp/gcp-readiness-<ID>.log 2>&1
```

Con `run_in_background: true`. Aplica ediciones sin preguntar.

### Lo que comparten los tres

Ninguno pide confirmación antes de editar. Por eso, **antes de despachar**: el
árbol de trabajo limpio (`git status --short`), o confirmación explícita del
usuario de que no importa. Así `git diff` muestra exactamente lo que hizo el
agente y revertir es `git checkout -- <archivo>`.

## Reglas de despacho

1. **Respeta `Depende de`.** Una tarea sólo se despacha si sus dependencias
   están en `done`. La razón real son los conflictos de archivo, no el orden
   lógico: varias tareas tocan `agent_app/api/main.py` y no pueden correr a la vez.
2. **Máximo 3 agentes en paralelo**, y sólo entre carriles distintos
   (columna `Carril` de la cola).
3. **El ejecutor nunca hace commit**; deja los cambios en el árbol. Commitea el
   orquestador, después de verificar, un commit por tarea, en español, con el
   mensaje que sugiere la tarea y sin líneas de atribución. Si el usuario no ha
   pedido commits, deja el árbol sucio y dilo.
4. **Antes de despachar**: `git status --short` debe estar limpio, o el usuario
   debe confirmar que no importa.
5. **Después de cada tarea**: revisa el diff completo y sólo entonces corre
   `.venv/bin/python -m pytest -q` desde el orquestador. Ese paso separado cubre
   `tests/integration/test_agent_mcp_remote.py`, que necesita localhost y nunca
   se habilita dentro del agente. Actualiza `QUEUE.md` con `done` o `blocked` +
   una línea de motivo. No te fíes sólo del informe del ejecutor: verifica.

## Cola

Lee y actualiza `QUEUE.md`. Es la única fuente de estado. No dupliques el estado
en tu respuesta al usuario: muéstrala tal cual, resumida.

## Qué NO hacer

- No ejecutes `infra/cloudrun/deploy.sh` ni ningún `gcloud` que cree recursos.
  Genera costos reales y requiere confirmación explícita del usuario cada vez.
- No toques `.env` (tiene credenciales locales del usuario).
- No recrees el stack de `docker compose` sin el overlay
  `docker-compose.gcp.yml`: el agent-app pierde las credenciales ADC y todo
  `/api/chat` devuelve 500.

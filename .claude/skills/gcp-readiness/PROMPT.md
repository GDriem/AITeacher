# Prompt para una sesión nueva

Reutilizable: `QUEUE.md` guarda el estado, así que pegar esto otra vez despacha
el siguiente lote, no repite lo hecho. Copia desde aquí:

---

Trabaja en `/Users/gadiorellana/Source/AITeacher` (rama `codex/react-frontend-r1`).

Invoca la skill `gcp-readiness` y avanza la cola de remediación para GCP.

**Paso 0 — baseline.** `git status --short` va a mostrar la skill sin commitear
(`?? .claude/skills/gcp-readiness/` y ` M .claude/CLAUDE.md`). Commitea eso solo,
primero, con el mensaje `Añadir la skill de preparación para GCP` y sin líneas de
atribución. Así el `git diff` posterior muestra únicamente lo que hagan los
ejecutores. Si el árbol ya está limpio, salta este paso.

**Paso 1 — despacha.** Lee `QUEUE.md`, toma las tareas en `pending` cuyas
dependencias estén en `done`, máximo 3 y de carriles distintos. Lánzalas en
paralelo, en un solo mensaje, cada una con `run_in_background: true`:

```bash
bash .claude/skills/gcp-readiness/dispatch-codex.sh <ID>
```

Excepción: **T04 y T06** tienen decisión de diseño abierta, no ejecución
mecánica. Esas van a un subagente de Claude, no a Codex; la skill explica cómo.

**Paso 2 — verifica.** Codex devuelve un JSON pequeño. No abras
`runs/<ID>.log` salvo que el estado sea `blocked` o `partial`. Por cada tarea que
vuelva `done`:

- `git diff --stat` — ¿tocó sólo los archivos que la tarea autorizaba?
- `.venv/bin/python -m pytest -q`
- si ambos están bien, commit propio con el mensaje que sugiere la tarea
- actualiza `QUEUE.md` a `done`, o a `blocked` con una línea de motivo

No te fíes del informe del ejecutor: verifica tú.

**Límites que no se cruzan:**

- No ejecutes `gcloud` ni `infra/cloudrun/deploy.sh`. Crean recursos en la nube y
  cuestan dinero real; requieren confirmación explícita del usuario cada vez.
- No leas ni modifiques `.env`: tiene credenciales del usuario.
- Si levantas el stack local, siempre con el overlay:
  `docker compose -f docker-compose.yml -f docker-compose.gcp.yml up -d`.
  Sin él, el agent-app pierde las credenciales ADC y todo `/api/chat` da 500.

Al terminar, dime en pocas líneas: qué tareas cerraste, cuáles quedaron
bloqueadas y por qué, y qué queda pendiente en la cola.

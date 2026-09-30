# T12 — Reconciliar README y CLAUDE.md con el repo real

**Carril:** docs · **Depende de:** — · **Prioridad:** baja

## Contexto

El commit `8fa03d3` («Reorganiza instrucciones de agente y deja de versionar
docs/») eliminó del control de versiones catorce archivos: `docs/README.md`,
`architecture.md`, `demo-script.md`, `deployment.md`, `foundry.md`,
`product-roadmap.md` y `phase-1.md`…`phase-8.md`.

Nadie actualizó lo que los referencia:

- **`README.md`** cierra con «Consulte el [índice de documentación](docs/README.md)»
  — enlace roto. La sección de despliegue también apunta a ese índice.
- **`.claude/CLAUDE.md`** describe `docs/` con esos catorce archivos, y cita
  `agent-mcp-run-guia-completa.pdf` en la raíz. **El PDF tampoco existe**
  (`ls *.pdf` no devuelve nada).
- `docs/` hoy sólo contiene `english-curriculum.md`,
  `google-auth-student-profiles-plan.md` y `react-frontend-migration-plan.md`.

Un agente que lea `CLAUDE.md` va a buscar documentación que no está, y perder
tiempo o inventar contexto.

## Archivos que puedes tocar

- `README.md`
- `.claude/CLAUDE.md`
- `docs/` (si decides reconstruir un índice mínimo)

## Cambios

1. **`.claude/CLAUDE.md`**: que el árbol de `docs/` y la sección «Documentación
   completa» describan lo que hay. Si el PDF ya no está, quita la referencia o
   di explícitamente que es histórico y no se versiona. Este archivo lo lee cada
   agente que trabaje en el repo: la exactitud es su única función.

2. **`README.md`**: arregla el enlace roto. O reconstruyes un `docs/README.md`
   corto que indexe los tres documentos que quedan, o reemplazas el enlace por
   una referencia directa a esos tres. Elige y aplica.

3. **La limitación del panel de observabilidad.** Las métricas de
   `agent_app/services/observability.py` viven en memoria, por instancia. Con
   `--max-instances 3`, el panel muestra sólo la instancia que atendió esa
   petición concreta, no el total del servicio. No es un defecto a corregir
   —exportar a Cloud Monitoring sería desproporcionado— pero sí a documentar,
   porque los números se leen mal sin saberlo. Ponlo donde el README habla del
   panel, y considera una nota breve en la propia UI
   (`frontend/src/features/observability/`) si encaja sin rediseñar nada.

4. Mientras estás ahí: `.env` local define `AUTHORING_TOKEN`, pero el código lee
   `APP_AUTHORING_TOKEN` y `MCP_AUTHORING_TOKEN` (`.env.example` los nombra bien,
   y `docker-compose.yml` mapea `AUTHORING_TOKEN` a ambos). No rompe nada hoy
   porque está vacío, pero es confuso. Documenta en `.env.example` que Compose
   usa `AUTHORING_TOKEN` como origen de los dos. **No toques `.env`**: tiene
   credenciales del usuario.

## Verificación

```bash
# Ningún enlace relativo del README apunta a un archivo inexistente:
grep -oE '\]\(([^)#][^)]*)\)' README.md | tr -d '](' | tr -d ')' \
  | grep -v '^http' | while read -r f; do [ -e "$f" ] || echo "ROTO: $f"; done
```

Y relee `.claude/CLAUDE.md` entero comparando cada ruta que menciona contra el
árbol real. Es documentación para agentes: si afirma algo falso, causa daño
directo.

## Commit sugerido

`Reconciliar la documentación con el estado real del repositorio`

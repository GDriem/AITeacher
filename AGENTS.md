# Instrucciones de colaboración

## Flujo de trabajo por fases

- Divide el trabajo en fases con un resultado verificable.
- Antes de cerrar una fase, ejecuta las validaciones pertinentes y revisa el diff.
- Al final de cada fase completada, crea un commit separado antes de comenzar la siguiente.
- Usa un mensaje de commit breve que describa el resultado de la fase.
- No mezcles en el mismo commit cambios ajenos a la fase actual.

## Planes y documentación importante

- Guarda planes persistentes, roadmaps y decisiones técnicas bajo `docs/` para que queden versionados.
- Mantén `README.md`, `AGENTS.md`, `CLAUDE.md` y las habilidades compartidas dentro del repositorio.
- No guardes planes ni documentación fuente en `.data/`, `output/` o `tmp/`; esas rutas están ignoradas porque contienen estado local o artefactos generados.
- Conserva secretos y configuración local únicamente en `.env`; publica sólo ejemplos sin credenciales en `.env.example`.

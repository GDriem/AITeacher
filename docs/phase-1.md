# Fase 1 — Explorador de temas y base local

La primera fase estableció el servidor MCP local y eliminó la necesidad de
adivinar temas desde el chat. El explorador consulta el catálogo curricular,
combina cada tema con el progreso del estudiante y permite iniciar una
conversación desde una tarjeta.

## Explorador

`GET /api/topics?student_id=<id>` es la fuente del catálogo mostrado por Agent
App. La respuesta entrega:

- los 23 temas con título, categoría y niveles disponibles;
- `total_topics`, usado como denominador del progreso;
- estado y progreso del estudiante cuando existen evaluaciones;
- datos de ruta y recomendación incorporados en fases posteriores.

La interfaz permite filtrar por categoría o nivel e iniciar cualquier tema. El
identificador curricular viaja al chat; no se mantiene una lista duplicada ni
un total fijo en JavaScript.

## Cómo verificar

1. Instale el grupo `dev` descrito en el README.
2. Ejecute `python -m pytest`.
3. Inicie `python -m mcp_learning_server.server` y, en otra terminal,
   `python -m agent_app.api.main`.
4. Abra `http://localhost:8000` y compruebe que el explorador muestra 23 temas.
5. Filtre el catálogo e inicie una conversación desde una tarjeta.
6. Abra `http://localhost:8001/healthz`.
7. Conecte MCP Inspector a `http://localhost:8001/mcp/` y llame:
   `search_learning_content` con `topic="embeddings"` y
   `level="beginner"`.
8. Llame `save_learning_result` y después `get_student_progress` con el mismo
   estudiante para observar persistencia local.

## Contenido y recuperación

El archivo `mcp_learning_server/content/learning_content.json` es contenido
breve y propio. La ingestión valida todos los registros. El almacenamiento en
memoria conserva los modelos y el recuperador puntúa coincidencias con TF-IDF,
priorizando tema y nivel. Cada resultado incluye `source`.

La alternativa local es deliberadamente limitada: no crea embeddings, no
captura sinónimos fuera del catálogo y no está diseñada para grandes corpus.
Para producción se reemplaza `ContentStore` y, si hace falta, el recuperador,
manteniendo estable `LearningService` y los contratos MCP.

## Evolución completada

Las fases posteriores agregaron la ruta adaptativa, dominio por concepto,
sesiones persistentes, evaluación híbrida, práctica, autoría, accesibilidad y
observabilidad. Consulte el [índice de documentación](README.md) y la
[hoja de ruta cerrada](product-roadmap.md) para seguir esas capacidades.


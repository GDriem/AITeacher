# Fase 1: base local

## Cómo verificar

1. Instale el grupo `dev` descrito en el README.
2. Ejecute `python -m pytest`.
3. Inicie `python -m mcp_learning_server.server`.
4. Abra `http://localhost:8001/healthz`.
5. Conecte MCP Inspector a `http://localhost:8001/mcp/` y llame:
   `search_learning_content` con `topic="embeddings"` y
   `level="beginner"`.
6. Llame `save_learning_result` y después `get_student_progress` con el mismo
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

## Pendientes de fases siguientes

- Fase 2: ADK 2.x, proveedores, orquestador y tres especialistas por texto.
- Fase 3: interfaz y trazabilidad visible.
- Fase 4: Gemini Live API con fallback de texto.
- Fase 5: Firestore, Cloud Run, autenticación e infraestructura.
- Fase 6: Foundry mediante la Responses API vigente.


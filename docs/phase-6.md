# Fase 6 — Feedback accionable y modo práctica

Cada evaluación ofrece ahora una actividad concreta para continuar aprendiendo,
sin convertir el feedback en un callejón sin salida.

## Acciones inmediatas

El resultado expone los conceptos apropiados para practicar y la interfaz ofrece:

- **Ver otro ejemplo**, que conserva el tema y pide al Tutor Agent un caso nuevo;
- **Explícamelo más fácil**, que solicita una analogía sin reiniciar la sesión;
- **Intentar de nuevo**, que recupera la siguiente pregunta adaptada;
- **Practicar esto**, junto a cada aspecto por mejorar.

Las solicitudes al Tutor Agent mantienen la pregunta principal pendiente. El
estudiante puede pedir ayuda antes de volver a responder.

## Modo práctica

El modo práctica usa un estado separado (`pending_practice`) dentro de la
conversación. Nunca reemplaza `pending_evaluation`, por lo que volver a la
explicación guiada recupera exactamente la pregunta y ronda anteriores.

| Operación | Endpoint |
| --- | --- |
| Iniciar o enfocar práctica | `POST /api/practice/start` |
| Evaluar el ejercicio | `POST /api/practice/evaluate` |

Los ejercicios se enfocan en conceptos pendientes y aumentan de dificultad:

1. fundamentos: relacionar ideas y explicar para qué sirven;
2. aplicación: resolver una situación con un ejemplo justificado;
3. desafío: detectar un error, corregirlo y considerar un caso límite.

La dificultad combina los intentos académicos previos con la ronda de práctica.
La siguiente ronda se persiste en JSON o Firestore y puede recuperarse después
de reiniciar. La nota de práctica no modifica el mejor puntaje del tema: dominar
un ejercicio enfocado no equivale a dominar todo el tema.

## Proyectos integradores

`GET /api/projects` entrega tres proyectos:

- **Asistente RAG confiable**: embeddings, RAG, evaluación y seguridad;
- **Agente MCP observable**: agentes, tool calling, MCP y observabilidad;
- **Experiencia multimodal responsable**: multimodalidad, IA responsable,
  producción y observabilidad.

Cada proyecto define reto, entregables, duración y cuatro criterios propios.
`POST /api/projects/{project_id}/evaluate` solicita JSON estructurado al modelo,
valida que conserve exactamente esos criterios y usa un fallback determinista
si el proveedor falla. Las notas de proyecto no se reparten entre temas porque
una evaluación transversal no demuestra por sí sola el dominio individual de
cada concepto.

## Cobertura

Las pruebas verifican:

- separación y recuperación del estado de práctica;
- adaptación por concepto, ronda e intentos previos;
- conservación de la pregunta principal;
- catálogo de tres proyectos con rúbricas diferentes;
- JSON validado, fallback y límite para listas de términos;
- contratos HTTP e interfaz de acciones, práctica y proyectos.

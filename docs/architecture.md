# Arquitectura

## Conceptos y fronteras

- **Modelo:** transforma entradas en salidas probabilísticas; Gemini será el
  predeterminado y Foundry será un proveedor opcional.
- **Agente:** combina modelo, instrucciones, estado y herramientas para decidir
  el siguiente paso hacia un objetivo.
- **Subagente:** agente especialista al que otro agente delega una
  responsabilidad con capacidad de decisión propia.
- **Herramienta:** operación acotada y validada, como buscar o guardar. No toma
  el rol de un agente.
- **MCP:** protocolo que estandariza cómo descubrir e invocar herramientas y
  leer recursos. El servidor MCP de este proyecto no es un agente.

## Componentes objetivo

```mermaid
flowchart LR
  U["Navegador: texto y voz"] --> A["Agent App en Cloud Run"]
  A --> O["Root Orchestrator"]
  O --> D["Diagnostic Agent"]
  O --> T["Tutor Agent"]
  O --> E["Evaluator Agent"]
  D & T & E --> C["Cliente MCP"]
  C -->|"Streamable HTTP + ID token"| M["MCP Server en Cloud Run"]
  M --> R["Contenido / índice RAG"]
  M --> P["Repositorio de progreso"]
  P -. "local" .-> J["JSON"]
  P -. "producción" .-> F["Firestore"]
  A --> G["Gemini en Google Cloud"]
  A -. "opcional" .-> AZ["Microsoft Foundry en Azure"]
  A --> S["Repositorio de sesiones"]
  S -. "local" .-> SJ["JSON atómico"]
  S -. "producción" .-> SF["Firestore"]
```

La Fase 1 implementa la parte MCP, el índice local y el repositorio JSON. El
servidor se ejecuta como servicio remoto independiente mediante Streamable
HTTP sin estado y respuestas JSON.

## Secuencia objetivo de aprendizaje

```mermaid
sequenceDiagram
  participant U as Usuario
  participant O as Orquestador
  participant D as Diagnostic Agent
  participant T as Tutor Agent
  participant E as Evaluator Agent
  participant M as MCP Server
  U->>O: Quiero aprender embeddings
  O->>D: Diagnosticar
  D->>M: get_student_progress
  M-->>D: progreso estructurado
  O->>T: Explicar según nivel
  T->>M: search_learning_content
  M-->>T: fragmentos y fuentes
  T-->>U: explicación fundamentada
  O->>E: evaluación corta
  E-->>U: pregunta
  U-->>E: respuesta
  E->>M: save_learning_result
  M-->>E: progreso actualizado
```

La futura interfaz mostrará estos eventos resumidos, herramientas, duración y
resultado, pero nunca razonamiento interno ni chain-of-thought.

## Decisiones de Fase 1

1. **MCP SDK estable 1.x.** La línea 2.x está en alfa; se usa el límite `<2`
   para evitar una actualización incompatible.
2. **Streamable HTTP sin estado.** Es el transporte recomendado para servicios
   remotos y encaja con escalado horizontal en Cloud Run. La persistencia se
   mantiene fuera del proceso.
3. **RAG léxico local.** Un índice TF-IDF pequeño permite explicar y probar la
   recuperación sin credenciales, red ni costo. No pretende sustituir un índice
   vectorial de producción.
4. **Puerto de almacenamiento.** `ContentStore` separa recuperación de
   almacenamiento y `ProgressRepository` separa dominio de persistencia. En
   producción se agregarán adaptadores administrados sin cambiar herramientas.
5. **ADK como dependencia opcional.** ADK 2.x se incorporará al proceso del
   Agent App en Fase 2; no debe contaminar el servidor determinista MCP.
6. **Dos servicios Cloud Run.** El Agent App será público y el MCP privado. El
   primero invocará al segundo con una cuenta de servicio de mínimo privilegio
   y un ID token con la audiencia del servicio MCP.
7. **Multi-cloud explícito.** Si `MODEL_PROVIDER=foundry`, la aplicación sigue
   alojada en GCP y consume el modelo remotamente en Azure. La abstracción del
   proveedor evitará condicionales distribuidos.

## Decisiones de Fase 2

1. **Currículo como grafo acíclico ordenado.** `curriculum.py` es la fuente
   única de títulos, categorías, orden y prerrequisitos. La validación al
   importar exige que cada tema aparezca una vez y que sus dependencias estén
   antes en la ruta.
2. **Dominio mínimo de 80 puntos.** Un tema queda `completed` cuando alguna
   evaluación alcanza 80/100. Si existen intentos sin ese resultado queda
   `in_progress`; el mejor puntaje evita que un intento posterior reduzca un
   dominio ya demostrado.
3. **Prerrequisitos orientativos.** Un tema sin sus dependencias se muestra
   `blocked`, pero la API de chat continúa aceptándolo. La ruta guía al
   estudiante sin convertir el currículo en una barrera.
4. **Recomendación determinista y explicable.** Se priorizan temas en progreso
   y luego temas disponibles según el orden curricular. Cada recomendación
   incluye un motivo derivado de puntaje o prerrequisitos, sin razonamiento
   interno generado por un modelo.
5. **Compatibilidad del progreso.** `studied_topics` conserva su significado de
   temas evaluados. Los estados de fase 2 se derivan de las evaluaciones
   existentes.

## Decisiones de Fase 3

1. **Evaluaciones como fuente de verdad.** `topic_progress`, `studied_topics` y
   el nivel global se derivan del historial de `assessments`. El progreso por
   tema registra intentos, mejor puntaje, nivel, dominio y detalle por concepto
   sin crear una segunda fuente mutable.
2. **Nivel independiente por tema.** El mejor puntaje del tema determina su
   nivel: principiante por debajo de 60, intermedio desde 60 y avanzado desde
   85. El diagnóstico y la recuperación de contenido usan ese nivel específico,
   no el resumen global.
3. **Conceptos acumulativos.** Cada intento guarda conceptos acertados y
   pendientes. Un concepto queda dominado cuando aparece acertado al menos una
   vez; los intentos posteriores no eliminan dominio ya demostrado.
4. **Resumen global derivado.** El nivel global se calcula con el promedio de
   los mejores puntajes de los temas evaluados. Sirve como resumen de panel,
   pero no decide la profundidad de una explicación.
5. **Migración al leer.** Los campos nuevos tienen valores predeterminados. Al
   leer JSON o Firestore anteriores, los resúmenes por tema se reconstruyen de
   las evaluaciones históricas; el detalle por concepto comienza a poblarse con
   el siguiente intento. El primer guardado posterior persiste el formato nuevo.

## Decisiones de Fase 4

1. **Estado de conversación en Agent App.** Mensajes, tema y evaluación
   pendiente pertenecen al flujo de coordinación, no al dominio académico del
   MCP. Por eso usan un repositorio propio sin ampliar las herramientas MCP.
2. **Servidor como fuente de verdad.** El navegador conserva sólo el ID de la
   conversación activa. Al abrir la aplicación obtiene mensajes y pregunta
   pendiente mediante la API, evitando divergencia entre dispositivos.
3. **Pregunta privada durable.** El repositorio conserva las palabras esperadas
   por el evaluador determinista; los modelos de respuesta pública exponen sólo
   la pregunta y el número de ronda.
4. **Dos adaptadores.** JSON atómico y un volumen nombrado cubren desarrollo y
   Docker Compose. Firestore permite reinicios y varias réplicas en Cloud Run.
5. **Retención explícita.** Se conservan 365 días desde la última actividad,
   configurable entre 1 y 3650. Los registros vencidos se purgan al consultar;
   archivar es reversible y `DELETE` realiza borrado inmediato.
6. **Aislamiento por propietario.** Todas las operaciones sobre un ID de sesión
   validan el `student_id` y responden 403 ante cruces. En un producto público,
   ese ID deberá proceder de una identidad autenticada y no del cuerpo del
   cliente.

## Decisiones de Fase 5

1. **Dos señales complementarias.** La cobertura determinista conserva el
   control de conceptos esenciales y la rúbrica semántica reconoce comprensión
   expresada con otras palabras. La nota pondera ambas señales 20/80.
2. **Rúbrica estable.** Precisión, comprensión, aplicación y claridad se
   califican de 0 a 4 y siempre incluyen una explicación acotada.
3. **JSON validado.** Gemini recibe un JSON Schema nativo. Pydantic rechaza
   salidas incompletas, valores fuera de rango y campos no previstos antes de
   que puedan afectar el progreso.
4. **Degradación segura.** Errores, timeouts o JSON inválido producen la misma
   estructura mediante reglas deterministas; nunca cambian el contrato HTTP.
5. **Respuesta no confiable.** El prompt delimita la respuesta del estudiante
   como datos. Además, listas de términos sin explicación e intentos explícitos
   de manipulación no pueden alcanzar 50 puntos.
6. **Evolución compatible.** Rúbrica y explicación se agregan como campos
   opcionales de `Assessment`, por lo que los documentos JSON y Firestore
   existentes continúan cargando sin migración manual.

## Decisiones de Fase 6

1. **Dos estados de actividad.** `pending_evaluation` representa la explicación
   guiada y `pending_practice` la microactividad opcional. Ambos se persisten,
   pero cambiar de modo no reemplaza el estado del otro.
2. **Adaptación explicable.** Los conceptos pendientes determinan el foco; los
   intentos académicos y la ronda determinan dificultad de fundamentos,
   aplicación o desafío.
3. **Práctica sin dominio artificial.** El resultado de una microactividad se
   devuelve al estudiante, pero no se guarda como evaluación completa del tema.
4. **Ayuda dentro del hilo.** Otro ejemplo y una explicación más fácil usan el
   Tutor Agent dentro de la misma conversación, conservando la pregunta del
   Evaluator Agent.
5. **Proyectos con rúbricas propias.** Los tres proyectos tienen criterios
   diferentes y validan que el modelo devuelva exactamente esos identificadores.
6. **Progreso individual intacto.** Una nota transversal no se copia a cada
   tema del proyecto; hacerlo confundiría integración con dominio individual.

## Reemplazos para producción

| Pieza local | Adaptador futuro | Motivo |
|---|---|---|
| `LocalProgressRepository` | `FirestoreProgressRepository` | concurrencia y durabilidad |
| `LocalSessionRepository` | `FirestoreSessionRepository` | sesiones entre réplicas y dispositivos |
| `InMemoryContentStore` | índice administrado o vector store en GCP | volumen y búsqueda semántica |
| JSON curricular empaquetado | Google Cloud Storage + pipeline de ingestión | actualización independiente |

Firestore no debe ser llamado directamente desde agentes: seguirá detrás de
las herramientas MCP. El audio no se persistirá de forma predeterminada.

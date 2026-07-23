# Hoja de ruta de producto — AITeacher

Esta hoja de ruta divide las mejoras del producto en sesiones independientes. Cada
fase debe poder desarrollarse, probarse y entregarse sin depender del contexto de
la conversación anterior.

## Estado general

| Fase | Objetivo | Estado |
| --- | --- | --- |
| 1 | Explorador de temas | Completada |
| 2 | Ruta de aprendizaje adaptativa | Completada |
| 3 | Dominio y nivel por tema | Completada |
| 4 | Persistencia completa de sesiones | Completada |
| 5 | Evaluación híbrida con rúbricas | Completada |
| 6 | Feedback accionable y modo práctica | Pendiente |
| 7 | Panel de autoría de contenido | Pendiente |
| 8 | Accesibilidad, observabilidad y pulido | Pendiente |

## Fase 1 — Explorador de temas

**Objetivo:** permitir que el estudiante descubra los 23 temas sin tener que
adivinar qué escribir en el chat.

### Alcance

- Exponer un endpoint de la app para consultar los temas del MCP.
- Mostrar un catálogo con título, niveles disponibles y estado del estudiante.
- Permitir filtrar por nivel o categoría.
- Agregar una acción para comenzar un tema desde su tarjeta.
- Obtener dinámicamente el total de temas y eliminar el valor fijo del frontend.
- Mantener el diseño responsive.

### Criterios de terminado

- Los 23 temas aparecen en la interfaz.
- Elegir un tema inicia una conversación válida sobre él.
- El progreso visual usa el total entregado por la API.
- Existen pruebas del endpoint y de la interacción principal.

### Decisiones implementadas

- `TopicSummary` expone una categoría curricular y los niveles disponibles; el
  endpoint `GET /api/topics?student_id=...` combina esos datos del MCP con el
  progreso del estudiante.
- Las cinco categorías actuales sirven para exploración y filtrado. La fase 2
  podrá agregar orden y prerrequisitos sin cambiar los identificadores de tema.
- En esta fase, una tarjeta está `available` o `completed`, según
  `studied_topics`. Los estados bloqueado y en progreso se incorporarán junto
  con las reglas adaptativas de la fase 2.
- `total_topics` es la única fuente del denominador usado por la interfaz; el
  frontend no conserva un total fijo.

### Prompt para iniciar la sesión

> Continuemos AITeacher implementando la fase 1 de
> `docs/product-roadmap.md`: Explorador de temas.

## Fase 2 — Ruta de aprendizaje adaptativa

**Objetivo:** recomendar qué estudiar después usando prerrequisitos y progreso.

### Alcance

- Definir categorías, orden y prerrequisitos del currículo.
- Ampliar la ruta de aprendizaje para explicar por qué recomienda un tema.
- Mostrar “Continuar aprendiendo” en la interfaz.
- Diferenciar temas bloqueados, disponibles, en progreso y completados.
- Permitir estudiar fuera del orden recomendado sin bloquear el chat.

### Criterios de terminado

- Un estudiante nuevo recibe una ruta inicial coherente.
- Después de una evaluación, la recomendación cambia cuando corresponde.
- La interfaz comunica el siguiente paso y su motivo.
- Las reglas de prerrequisitos cuentan con pruebas unitarias.

### Decisiones implementadas

- `mcp_learning_server/curriculum.py` centraliza los 23 temas, categorías,
  orden y prerrequisitos en un grafo validado al importar.
- Un tema está completado cuando su mejor evaluación alcanza 80/100. Un intento
  inferior lo deja en progreso; el mejor resultado conserva el dominio ya
  demostrado.
- La ruta prioriza temas en progreso y después temas disponibles. Cada
  recomendación incluye un motivo derivado del puntaje o de los prerrequisitos
  completados.
- Los prerrequisitos son orientación pedagógica: un tema bloqueado conserva la
  acción “Estudiar de todos modos” y el chat continúa aceptándolo.
- `studied_topics` sigue representando temas evaluados para mantener
  compatibilidad. La fase 3 incorporará progreso persistido por tema y concepto.
- `GET /api/topics` combina catálogo, progreso y ruta; la interfaz muestra
  “Continuar aprendiendo” y los estados bloqueado, disponible, en progreso y
  completado.

### Prompt para iniciar la sesión

> Continuemos AITeacher implementando la fase 2 de
> `docs/product-roadmap.md`: Ruta de aprendizaje adaptativa.

## Fase 3 — Dominio y nivel por tema

**Objetivo:** evitar que un único nivel global represente conocimientos diferentes.

### Alcance

- Crear progreso por tema y por concepto.
- Registrar intentos, mejor puntaje, nivel y estado de dominio.
- Conservar un resumen global derivado del progreso individual.
- Mostrar conceptos dominados y pendientes.
- Diseñar compatibilidad o migración para el progreso ya guardado.

### Criterios de terminado

- Un estudiante puede ser avanzado en RAG y principiante en seguridad.
- Las explicaciones se adaptan al nivel específico del tema.
- Los datos existentes continúan siendo legibles.
- El panel de progreso muestra dominio por tema.

### Decisiones implementadas

- `StudentProgress.topic_progress` contiene intentos, mejor puntaje, nivel,
  estado de dominio y progreso por concepto para cada tema evaluado.
- Las evaluaciones siguen siendo la fuente de verdad. Los resúmenes por tema,
  `studied_topics` y el nivel global se derivan de ellas para evitar estados
  contradictorios.
- El nivel de un tema usa su mejor puntaje: principiante por debajo de 60,
  intermedio desde 60 y avanzado desde 85. El diagnóstico y el tutor usan el
  nivel del tema solicitado.
- El evaluador guarda en cada intento conceptos acertados y pendientes. Un
  concepto ya dominado no retrocede por un intento posterior.
- Los documentos JSON y Firestore de fases anteriores se aceptan sin migración
  manual. Sus resúmenes se reconstruyen al leerlos y el detalle por concepto se
  completa desde la siguiente evaluación.
- `GET /api/topics` incluye el progreso del tema en cada tarjeta. El panel
  muestra nivel, intentos, mejor puntaje y conceptos dominados o pendientes.

### Prompt para iniciar la sesión

> Continuemos AITeacher implementando la fase 3 de
> `docs/product-roadmap.md`: Dominio y nivel por tema.

## Fase 4 — Persistencia completa de sesiones

**Objetivo:** recuperar conversación, tema y evaluación después de reiniciar la
aplicación o cambiar de dispositivo.

### Alcance

- Persistir sesiones y mensajes en el backend.
- Persistir la pregunta de evaluación pendiente y su número de ronda.
- Crear endpoints para listar, recuperar, renombrar y archivar conversaciones.
- Sincronizar el historial local actual con el servidor.
- Definir retención y eliminación de datos.

### Criterios de terminado

- Reiniciar Docker no pierde la conversación ni la evaluación pendiente.
- El estudiante puede abrir una conversación anterior.
- Las sesiones están aisladas por estudiante.
- Existen pruebas de recuperación y autorización.

### Decisiones implementadas

- Agent App persiste cada conversación completa, su tema y la evaluación
  pendiente. La pregunta interna conserva las palabras esperadas para poder
  evaluar después de un reinicio, pero la API nunca las expone.
- `LocalSessionRepository` usa JSON atómico y el volumen `agent-data` de Docker
  Compose. Cloud Run usa `FirestoreSessionRepository`, por lo que las sesiones
  no dependen de una réplica específica.
- `GET /api/sessions` lista conversaciones; el detalle, renombrado, archivado,
  restauración y borrado se realizan sobre `/api/sessions/{session_id}`. Cada
  operación comprueba que el `student_id` sea el propietario.
- La interfaz conserva únicamente el identificador activo en `localStorage`.
  Los mensajes y la evaluación se recuperan siempre del servidor, que es la
  fuente de verdad, y las conversaciones anteriores pueden abrirse desde el
  selector.
- Las sesiones se conservan 365 días desde su última actividad por defecto.
  La lectura elimina registros vencidos y `DELETE` ofrece eliminación inmediata;
  archivar sólo oculta una conversación y es reversible.

### Prompt para iniciar la sesión

> Continuemos AITeacher implementando la fase 4 de
> `docs/product-roadmap.md`: Persistencia completa de sesiones.

## Fase 5 — Evaluación híbrida con rúbricas

**Objetivo:** evaluar comprensión real sin depender únicamente de palabras clave.

### Alcance

- Mantener la comprobación determinista de conceptos esenciales.
- Agregar una evaluación estructurada mediante Gemini.
- Usar una rúbrica con precisión, comprensión, aplicación y claridad.
- Exigir salida JSON validada y definir fallback cuando el modelo falle.
- Guardar la rúbrica y una explicación breve del resultado.
- Crear un dataset de respuestas representativas para regresión.

### Criterios de terminado

- Mencionar palabras clave sin explicarlas no produce una nota alta.
- Una paráfrasis correcta puede obtener una buena evaluación.
- El resultado siempre cumple el contrato estructurado.
- Las pruebas cubren respuestas correctas, parciales, vacías y adversariales.

### Decisiones implementadas

- La nota combina 20 % de cobertura determinista de conceptos esenciales y
  80 % de una rúbrica semántica con precisión, comprensión, aplicación y
  claridad, calificadas de 0 a 4.
- Gemini recibe un esquema JSON nativo y la respuesta se valida estrictamente
  con Pydantic. Una salida vacía, inválida o un error del proveedor activa la
  misma rúbrica mediante un fallback determinista.
- Enumerar términos sin explicar relaciones, o intentar manipular al evaluador,
  limita el resultado a 49/100 incluso si la rúbrica del modelo fuera alta.
- Cada evaluación persiste la rúbrica, su modo (`hybrid_model` o
  `deterministic_fallback`) y una explicación breve. Los registros anteriores
  siguen siendo legibles porque los campos nuevos son opcionales.
- La API y la interfaz muestran las cuatro dimensiones. El dataset
  `tests/fixtures/evaluation_responses.json` cubre respuestas correctas,
  parafraseadas, parciales, vacías, adversariales y listas de palabras clave.

### Prompt para iniciar la sesión

> Continuemos AITeacher implementando la fase 5 de
> `docs/product-roadmap.md`: Evaluación híbrida con rúbricas.

## Fase 6 — Feedback accionable y modo práctica

**Objetivo:** transformar cada resultado en una actividad educativa concreta.

### Alcance

- Agregar acciones “Ver otro ejemplo”, “Explícamelo más fácil” e “Intentar de nuevo”.
- Generar ejercicios breves según los conceptos faltantes.
- Crear un modo práctica separado de la explicación guiada.
- Incorporar proyectos pequeños que combinen varios temas.
- Evaluar proyectos con rúbricas específicas.

### Criterios de terminado

- Cada aspecto por mejorar ofrece una acción inmediata.
- El estudiante puede practicar sin perder el hilo principal.
- Los ejercicios se adaptan a sus intentos previos.
- Al menos tres proyectos integradores están disponibles.

### Prompt para iniciar la sesión

> Continuemos AITeacher implementando la fase 6 de
> `docs/product-roadmap.md`: Feedback accionable y modo práctica.

## Fase 7 — Panel de autoría

**Objetivo:** administrar el currículo sin editar manualmente el archivo JSON.

### Alcance

- Crear una interfaz protegida para listar y editar lecciones.
- Validar identificadores, niveles, fuentes, texto y palabras clave.
- Ofrecer vista previa antes de publicar.
- Mantener historial o versionado de cambios.
- Preparar importación posterior desde Markdown o documentos.

### Criterios de terminado

- Una lección puede crearse, editarse y despublicarse desde la interfaz.
- El contenido inválido no puede publicarse.
- Los cambios tienen trazabilidad y pueden revertirse.
- El MCP utiliza el contenido publicado.

### Prompt para iniciar la sesión

> Continuemos AITeacher implementando la fase 7 de
> `docs/product-roadmap.md`: Panel de autoría.

## Fase 8 — Accesibilidad, observabilidad y pulido

**Objetivo:** preparar una experiencia confiable y medible para usuarios reales.

### Alcance

- Revisar navegación por teclado, foco, contraste y lectores de pantalla.
- Mejorar estados vacíos, carga, errores y reconexión.
- Medir latencia, errores, tokens, costos y finalización de actividades.
- Agregar pruebas responsive y de accesibilidad.
- Revisar rendimiento y dependencias del frontend.

### Criterios de terminado

- Los flujos principales pueden completarse usando teclado.
- Los errores ofrecen recuperación clara.
- Existe un panel mínimo de salud y uso.
- Las pruebas automatizadas cubren tamaños móvil y escritorio.

### Prompt para iniciar la sesión

> Continuemos AITeacher implementando la fase 8 de
> `docs/product-roadmap.md`: Accesibilidad, observabilidad y pulido.

## Regla de cierre de cada fase

Al terminar una fase:

1. Actualizar su estado en esta hoja de ruta.
2. Ejecutar todas las pruebas.
3. Reconstruir Docker Compose.
4. Validar el flujo principal en la aplicación.
5. Documentar cualquier decisión que afecte las fases siguientes.

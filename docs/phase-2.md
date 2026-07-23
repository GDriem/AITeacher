# Fase 2: ruta de aprendizaje adaptativa

## Comportamiento

El currículo define los 23 temas como un grafo dirigido y acíclico. Cada nodo
incluye título, categoría, posición y prerrequisitos. Para cada estudiante,
`get_learning_path` deriva cuatro estados:

- `blocked`: faltan uno o más prerrequisitos;
- `available`: puede iniciarse según la ruta;
- `in_progress`: existe una evaluación, pero el mejor puntaje es menor que 80;
- `completed`: al menos una evaluación alcanzó 80/100.

Los estados sirven para orientar, no para autorizar. La interfaz mantiene activa
la acción de un tema bloqueado con el texto “Estudiar de todos modos”, y el chat
lo procesa normalmente.

## Recomendaciones

La ruta prioriza primero los temas en progreso y después los disponibles, ambos
en orden curricular. Devuelve hasta tres recomendaciones estructuradas con
tema, título y motivo. La interfaz presenta la primera en “Continuar
aprendiendo”.

Para un estudiante nuevo, el punto de partida es Inteligencia artificial.
Después de dominarlo se habilitan Machine Learning, procesamiento de lenguaje
natural e IA responsable. Una evaluación parcial conserva el mismo tema como
siguiente paso y explica el puntaje requerido.

## Contratos

`list_available_topics` agrega `order` y `prerequisites`.
`get_learning_path` conserva `recommended_topics` y añade:

- listas de temas completados, en progreso, disponibles y bloqueados;
- recomendaciones explicadas;
- el estado y los prerrequisitos pendientes de cada tema.

`GET /api/topics?student_id=<id>` combina ambos contratos con el progreso y
entrega los conteos, el porcentaje completado y la recomendación principal.

## Cómo verificar

1. Ejecute `python -m pytest`.
2. Inicie la aplicación con `MODEL_PROVIDER=mock`.
3. Abra `http://localhost:8000` con un estudiante nuevo.
4. Compruebe que “Continuar aprendiendo” recomienda Inteligencia artificial.
5. Evalúe ese tema con 80 puntos o más.
6. Compruebe que la recomendación cambia a Machine Learning y que aparecen tres
   temas disponibles.
7. Abra un tema bloqueado y verifique que la conversación comienza sin error.

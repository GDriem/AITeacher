# Fase 3: dominio y nivel por tema

## Modelo de progreso

Cada evaluación conserva el resultado general y agrega dos listas:
`mastered_concepts` y `pending_concepts`. A partir del historial se deriva un
`TopicProgress` por tema con:

- cantidad de intentos y mejor puntaje;
- nivel específico (`beginner`, `intermediate` o `advanced`);
- estado de dominio (`developing` o `mastered`);
- conceptos dominados y pendientes;
- intentos, aciertos y estado de cada concepto.

Una evaluación de 80 puntos o más domina el tema. El nivel se calcula con el
mejor puntaje: principiante por debajo de 60, intermedio desde 60 y avanzado
desde 85. Por eso un estudiante puede tener, por ejemplo, RAG avanzado y
seguridad de IA principiante.

El campo global `level` sigue disponible, pero ahora es únicamente un resumen
derivado del promedio de los mejores puntajes por tema. El agente de diagnóstico
elige siempre el nivel del tema solicitado y el tutor recupera contenido para
ese nivel.

## Compatibilidad

Las evaluaciones son la fuente de verdad. Al cargar un documento de una fase
anterior:

1. Pydantic acepta la ausencia de los campos de concepto y progreso por tema.
2. Se reconstruyen intentos, mejor puntaje, nivel y dominio desde
   `assessments`.
3. `studied_topics` y el nivel global se vuelven a derivar.
4. El detalle por concepto queda vacío hasta la siguiente evaluación.
5. El siguiente guardado atómico o transaccional escribe el formato completo.

No se necesita un script de migración destructivo y el mismo comportamiento se
aplica al repositorio JSON y al adaptador Firestore.

## Contratos e interfaz

`save_learning_result` acepta opcionalmente conceptos dominados y pendientes.
`get_student_progress` expone `topic_progress`, y cada elemento de
`GET /api/topics?student_id=<id>` incluye su progreso o `null` si todavía no hay
una evaluación.

El explorador muestra nivel, mejor puntaje e intentos en las tarjetas
evaluadas. El panel “Dominio por tema” desglosa conceptos dominados y pendientes,
mientras el indicador superior conserva el porcentaje global de temas
completados.

## Cómo verificar

1. Ejecute `python -m pytest`.
2. Inicie la aplicación con `MODEL_PROVIDER=mock`.
3. Evalúe RAG con una respuesta completa y seguridad de IA con una parcial.
4. Compruebe que el panel presenta niveles diferentes para ambos temas.
5. Vuelva a responder un concepto pendiente y confirme que deja de aparecer
   como pendiente sin perder los conceptos ya dominados.
6. Inicie cada tema de nuevo y compruebe en la insignia del chat que la
   explicación usa su nivel específico.

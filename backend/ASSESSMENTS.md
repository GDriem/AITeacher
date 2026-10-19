# Hito 3: pruebas cerradas

Contrato de implementación: `/api/assessments/questions` y `/definitions` permiten
crear snapshots inmutables (solo autores). Para una nueva revisión se envía el
mismo `id` y el `number` siguiente; un número ocupado o una carrera devuelve 409.
No hay actualización ni borrado de snapshots. Los GET por ID de revisión son
solo para autores; las listas de definiciones ofrecen metadatos públicos.

Una pregunta fija `unitId`, `unitRevisionId`, conceptos y objetivos de una revisión
editorial publicada. Una definición fija revisiones de preguntas de esa misma
unidad, orden explícito, cobertura de objetivos, modo (`assessment`/`practice`),
tiempo (1–1440 minutos), máximo de intentos (1–100), ayudas (`none` en este hito)
y feedback (`afterSubmission`/`never`). Crear una definición la hace disponible.
Se permite evaluar revisiones publicadas históricas: retirar la lectura no borra
ni reescribe evaluaciones. No hay selección aleatoria en este hito.

`POST /api/assessments/attempts` recibe `definitionRevisionId` y `requestId` UUID.
El servidor fija alumno, inicio y vencimiento. Repetir alumno/requestId devuelve
el mismo intento incluso después de agotado el límite; cambiar la definición
con esa clave devuelve 409. El límite se aplica a todas las revisiones de la
misma definición, incluyendo intentos vencidos. Se serializan inicios por alumno.

`GET /api/assessments/attempts/{id}` solo permite al propietario. Antes de entregar
solo muestra enunciados, opciones, conceptos, política y orden; nunca claves,
puntuaciones ni resultados. El vencimiento lo calcula el servidor. No hay guardado
parcial ni ampliación de tiempo. Una entrega vencida devuelve 409.

`POST /api/assessments/attempts/{id}/submit` recibe `answers`, una entrada por
pregunta: `questionRevisionId` y `selectedOptionIds`. Se permiten omisiones
(se puntúan cero), se rechazan IDs ajenos, duplicados y cardinalidad inválida.
La primera entrega válida fija respuestas y resultados en una transacción.
Repetir la misma respuesta normalizada devuelve el resultado persistido; cambiarla
tras entregar devuelve 409. La puntuación es la media por pregunta. Seleccionar
todo en selección múltiple obtiene cero. El feedback `afterSubmission` muestra
fracciones y aciertos; `never` oculta también la nota agregada. No se devuelven
claves en ninguna proyección de alumno.

Cada concepto evaluado produce un evento durable de evidencia con alumno,
intento, pregunta/revisión, revisión editorial, modo, fecha, fracción y ayuda
`none`. Se guarda en el outbox del módulo en la misma transacción, con identidad
única por intento/pregunta/concepto. El consumidor de Aprendizaje y los umbrales
de dominio son entregas posteriores; no se afirma haber actualizado dominio.

Todas las escrituras usan sesión y CSRF. Los intentos de otros alumnos devuelven
404, incluso a autores. Las listas admiten `offset`/`limit` (máximo 100).

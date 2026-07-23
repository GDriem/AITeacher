# Fase 5 — Evaluación híbrida con rúbricas

AITeacher dejó de convertir coincidencias de palabras en una nota final. Cada
respuesta combina la cobertura determinista de conceptos esenciales con una
rúbrica semántica estructurada.

## Contrato de evaluación

La rúbrica califica de 0 a 4 cuatro dimensiones:

- precisión: exactitud conceptual;
- comprensión: relaciones y significado expresados con palabras propias;
- aplicación: conexión con un uso, consecuencia o ejemplo;
- claridad: coherencia de la explicación.

Cada dimensión incluye su puntaje y una explicación breve. La respuesta pública
incluye `rubric` y `result_explanation`; la misma información se persiste en el
`Assessment` del estudiante.

## Cálculo híbrido

La nota combina:

- 20 % de cobertura determinista de los conceptos esenciales;
- 80 % del total normalizado de la rúbrica.

Los alias deterministas siguen identificando conceptos y alimentando el dominio
por concepto. La señal semántica permite reconocer paráfrasis que no repiten el
vocabulario esperado. Una enumeración de términos sin explicación y los intentos
explícitos de manipular al evaluador tienen un límite de 49/100, aunque el modelo
devuelva una rúbrica inflada.

## Salida estructurada y fallback

Evaluator Agent envía a Gemini una entrada JSON donde la respuesta del estudiante
se trata como contenido no confiable. `ModelRequest.response_json_schema` hace
que Gemini solicite `application/json` con el esquema nativo de la rúbrica.
Pydantic rechaza criterios fuera de 0–4, explicaciones vacías, campos adicionales
o cualquier salida que no sea JSON.

Si el proveedor falla, vence el tiempo o incumple el contrato, la evaluación no
falla ni devuelve una forma distinta. Se construye la misma rúbrica con reglas
deterministas basadas en cobertura, relaciones explicativas, aplicación y
claridad. El campo `evaluation_mode` distingue `hybrid_model` de
`deterministic_fallback`. El proveedor `mock` usa intencionalmente este fallback
para mantener la demo offline y sin credenciales.

## Persistencia y compatibilidad

La herramienta MCP `save_learning_result` acepta opcionalmente `rubric` y
`result_explanation`. Los registros de fases anteriores siguen siendo válidos
porque ambos campos son opcionales al leer JSON o Firestore. Todo intento nuevo
guarda el contrato completo.

## Dataset de regresión

`tests/fixtures/evaluation_responses.json` contiene respuestas correctas,
parafraseadas, parciales, vacías, adversariales y listas de palabras clave. Las
pruebas verifican límites de puntaje, contrato estructurado, fallback, persistencia
y configuración de salida JSON nativa de Gemini.

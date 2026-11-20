# Curso de lanzamiento: Microsoft Azure Fundamentals (AZ-900)

Paquete versionado del curso piloto. Sigue el [temario oficial vigente desde el
20 de julio de 2026](https://learn.microsoft.com/en-us/credentials/certifications/resources/study-guides/az-900)
y la estructura del curso [AZ-900T00](https://learn.microsoft.com/en-us/training/courses/az-900t00):
tres dominios, once módulos y una unidad integradora de simulacro.

El texto es original y en español; cada lectura cita la página de Microsoft Learn
que la respalda. No se copian contenidos ni preguntas del examen real.

## Qué crea en la plataforma

| Recurso de la plataforma | Uso en el curso |
| --- | --- |
| Materia, categorías y temas del catálogo | Materia AZ-900, una categoría por dominio (con su peso) y una para el examen; un tema por módulo con descripción |
| Unidad `learningUnit` publicada | Conceptos, objetivos, lecturas, ejercicios de estudio, evaluaciones editoriales y prerrequisitos conceptuales |
| Banco de preguntas | Selección única, selección múltiple (exacta o con crédito parcial), verdadero/falso y tres tipos con rúbrica: respuesta abierta, análisis de caso y ejercicio práctico |
| Definiciones de prueba | Por módulo: práctica libre, quiz cronometrado y evaluación abierta corregida por docente. Simulacro: diagnóstico, práctica por dominio y simulacro completo |
| Mapa conceptual editorial | Un grafo por tema con relaciones `requires`, `explains`, `applies` y `differsFrom` |
| Tutor, voz, apuntes, repasos e historial | Funcionan sobre las lecturas y pruebas publicadas; no requieren datos adicionales |

## Formato

`course.json` define materia, categorías y el orden de los módulos. Cada archivo
de `modules/` describe un tema con **claves** en kebab-case; el cargador deriva
UUIDv5 estables a partir de `namespace`, el slug del tema y la clave. Nunca
renombres una clave publicada: cambiaría la identidad de objetivos, conceptos,
preguntas o pruebas.

```jsonc
{
  "slug": "computacion-en-la-nube",          // slug del tema (único en su categoría)
  "name": "Computación en la nube",           // nombre visible, ≤150
  "category": "conceptos-de-nube",
  "sortOrder": 1,
  "profile": "module",                         // "module" o "exam"
  "description": "…",                          // ≤600, texto plano para el alumno
  "outline": ["Define cloud computing", "…"],  // viñetas del temario cubiertas (trazabilidad)
  "unit": {
    "title": "…",
    "concepts":   [{"key": "modelo-responsabilidad-compartida", "name": "…"}],
    "objectives": [{"key": "…", "description": "…", "concepts": ["…"]}],
    "readings":   [{"key": "…", "title": "…", "text": "…", "source": "https://learn.microsoft.com/…", "objectives": ["…"]}],
    "exercises":  [{"key": "…", "prompt": "…", "objectives": ["…"]}],
    "assessments":[{"key": "…", "prompt": "…", "privateCriteria": "…", "objectives": ["…"]}],
    "prerequisites": [{"concept": "…", "requires": "…"}]
  },
  "questions": [
    {"key": "…", "type": "singleChoice", "prompt": "…", "objectives": ["…"], "concepts": ["…"],
     "options": [{"key": "a", "text": "…", "correct": true}, {"key": "b", "text": "…"}]},
    {"key": "…", "type": "multipleChoice", "scoringPolicy": "partialCredit", "prompt": "… Selecciona dos.", "…": "…"},
    {"key": "…", "type": "trueFalse", "options": [{"key": "verdadero", "text": "Verdadero"}, {"key": "falso", "text": "Falso", "correct": true}], "…": "…"},
    {"key": "…", "type": "caseAnalysis", "prompt": "…", "objectives": ["…"], "concepts": ["…"],
     "rubric": {"privateGuidance": "…", "criteria": [{"key": "…", "description": "…", "maxPoints": 2}]}}
  ],
  "tests": [
    {"key": "practica", "title": "…", "mode": "practice", "timeLimitMinutes": 20,
     "maxAttempts": 100, "feedback": "afterSubmission", "questions": ["…"]}
  ],
  "graph": {"title": "…", "edges": [{"from": "…", "to": "…", "relation": "requires"}]}
}
```

Reglas que el validador comprueba antes de escribir:

- Publicación: cada objetivo tiene conceptos, lectura, ejercicio y evaluación
  editorial; todo concepto pertenece a algún objetivo; prerrequisitos sin ciclos.
- Preguntas: los conceptos pertenecen a sus objetivos y representan a cada uno.
  Selección única y verdadero/falso con una sola correcta; selección múltiple con
  al menos dos correctas, un distractor y el número a elegir en el enunciado
  («Selecciona dos.»); el crédito parcial sólo en selección múltiple.
  Las preguntas con rúbrica no llevan opciones.
- Pruebas: 1–100 preguntas de la propia unidad; los objetivos de la definición
  se derivan de sus preguntas. Toda pregunta forma parte de alguna prueba.
- Mapa: los nodos son todos los conceptos; `requires` no forma ciclos.
- Perfil `module`: ≥3 lecturas de ≥1200 caracteres, ≥3 ejercicios, ≥12 preguntas
  cerradas de los tres tipos, ≥3 por objetivo, los tres tipos con rúbrica y ≥3 pruebas.
  Perfil `exam`: ≥55 cerradas, ≥15 por objetivo y ≥4 pruebas.
- Advertencias de calidad: claves de respuesta concentradas en una posición, la
  opción correcta como la más larga, claves verdadero/falso uniformes, conceptos
  aislados en el mapa.

## Validar y cargar

```sh
# Sin red: valida el paquete e imprime advertencias.
python3 backend/scripts/load-course.py --check

# Contra un host: prueba en seco por defecto; --apply escribe.
export AITEACHER_SESSION='<cookie ait_dotnet_session de un autor>'
python3 backend/scripts/load-course.py --base-url https://<host>
python3 backend/scripts/load-course.py --base-url https://<host> --apply
```

La carga es repetible. Reutiliza materia, categorías y temas por slug sin
sobrescribirlos; identifica la unidad del curso por tema y título; agrega una
revisión sólo si el documento cambió y publica esa revisión. Preguntas, pruebas
y mapas usan IDs deterministas y reciben una revisión nueva sólo cuando su
contenido o la revisión de unidad fijada cambian. No toca datos de alumnos.

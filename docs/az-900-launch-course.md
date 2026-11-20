# Curso de lanzamiento: Microsoft Azure Fundamentals (AZ-900)

## Alcance y decisión (20 de noviembre de 2026)

Piloto completo de un curso en la beta: **AZ-900**, alineado con el
[temario oficial vigente desde el 20 de julio de 2026](https://learn.microsoft.com/en-us/credentials/certifications/resources/study-guides/az-900)
y con la estructura del curso [AZ-900T00](https://learn.microsoft.com/en-us/training/courses/az-900t00).

El curso vive en el backend .NET, que es el único con banco de preguntas,
pruebas, rúbricas, corrección docente, mapas, repasos e historial. El servidor
MCP Python y su corpus de 82 lecturas no cambian.

El contenido está en el paquete versionado `backend/configuration/courses/az-900/`.
[Su README](../backend/configuration/courses/az-900/README.md) describe el formato
y las reglas. Se carga con `backend/scripts/load-course.py` a través de la API de
autoría, igual que lo haría un autor.

## Contenido

Hay tres dominios con su peso en el examen, 11 módulos y una unidad integradora
de simulacro. El texto es original y en español; cada lectura cita la página de
Microsoft Learn que la respalda. No se usaron preguntas de exámenes reales.

| # | Tema | Conceptos | Lecturas | Ejercicios | Cerradas (única/múltiple/V-F) | Con rúbrica | Pruebas |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Computación en la nube | 8 | 4 | 4 | 6/4/5 | 3 | 3 |
| 2 | Beneficios de la nube | 8 | 4 | 4 | 6/4/5 | 3 | 3 |
| 3 | Tipos de servicio en la nube | 8 | 4 | 4 | 6/4/5 | 3 | 3 |
| 4 | Componentes de arquitectura de Azure | 8 | 4 | 4 | 7/4/5 | 3 | 3 |
| 5 | Cómputo y redes en Azure | 9 | 4 | 4 | 8/4/4 | 3 | 3 |
| 6 | Almacenamiento en Azure | 8 | 4 | 4 | 6/4/5 | 3 | 3 |
| 7 | Identidad, acceso y seguridad en Azure | 9 | 4 | 4 | 6/4/5 | 3 | 3 |
| 8 | Administración de costos en Azure | 7 | 4 | 4 | 6/4/5 | 3 | 3 |
| 9 | Gobernanza y cumplimiento en Azure | 7 | 4 | 4 | 5/4/5 | 3 | 3 |
| 10 | Herramientas para administrar e implementar recursos | 7 | 4 | 4 | 5/4/5 | 3 | 3 |
| 11 | Herramientas de supervisión en Azure | 8 | 4 | 4 | 6/4/5 | 3 | 3 |
| 12 | Simulacro del examen AZ-900 | 11 | 4 | 4 | 36/12/12 | 0 | 6 |

**Totales:** 48 lecturas, 48 ejercicios, 258 preguntas y 39 pruebas.

- Las 258 preguntas son 225 cerradas y 33 con rúbrica: 11 de respuesta abierta,
  11 de análisis de caso y 11 de ejercicio práctico.
- Hay un mapa conceptual por tema, con 12 en total.

## Tipos de prueba

| Prueba | Modo | Política | Propósito |
| --- | --- | --- | --- |
| Práctica libre (por módulo) | práctica | 20 min, 100 intentos, nota inmediata | Recuperación activa sin presión |
| Quiz cronometrado (por módulo) | evaluación | 8 preguntas, 10 min, 3 intentos | Comprobar el módulo bajo tiempo |
| Evaluación abierta (por módulo) | evaluación | 3 preguntas con rúbrica, 45 min, 2 intentos | Explicar, analizar un caso y diseñar una solución; corrige un docente |
| Diagnóstico inicial | práctica | 15 preguntas (5 por dominio), 20 min | Detectar áreas débiles al empezar |
| Práctica por dominio (×3) | práctica | Todas las preguntas del dominio, 30 min | Repaso dirigido por dominio |
| Simulacro rápido | evaluación | 20 preguntas, 20 min, 5 intentos | Ensayo corto ponderado |
| Simulacro completo | evaluación | 50 preguntas intercaladas (14/19/17 = 28/38/34 %), 45 min, 3 intentos | Ensayo en condiciones de examen |

## Formas de estudio en la plataforma

- **Aprender:** lecturas con tablas comparativas, un ejemplo práctico y una
  sección "Para recordar en el examen".
- **Practicar:** ejercicios de estudio, como explicarle al tutor, decidir en un
  escenario, completar una tabla comparativa, tarjetas de memoria y un laboratorio
  opcional con aviso de costos.
- **Tutor por texto o voz:** conversa sobre la unidad y cita sus lecturas como
  fuente. Permite guardar apuntes y resúmenes.
- **Mapa de conceptos:** compara lo que el alumno menciona en el tutor con el
  mapa editorial del tema.
- **Repasos:** repetición espaciada programada por el alumno a partir de la
  evidencia de una prueba corregida.
- **Historial:** conversaciones y entregas anteriores.

## Cambios de plataforma necesarios para el lanzamiento

Con 39 pruebas nuevas, la pestaña **Evaluar** de una unidad pedía la lista global
de definiciones de 20 en 20 y la filtraba en el navegador. En la mayoría de las
unidades la primera página quedaba vacía. **Repasos** tenía el mismo problema al
elegir la evaluación de un repaso.

La solución tiene tres partes:

- `GET /api/assessments/definitions` admite `unitId` y `unitRevisionId`. El
  filtro se resuelve en PostgreSQL mediante contención `jsonb` y no requiere
  migración.
- **Evaluar** pide sólo las pruebas de su unidad y muestra primero la práctica.
- **Repasos** pide las pruebas de la revisión de unidad de la evidencia elegida.

## Validación local (20 de noviembre de 2026)

- `load-course.py --check`: el paquete es válido, sin errores ni advertencias. Se
  revisa la posición de la clave, la respuesta más larga, la uniformidad de
  verdadero/falso, los conceptos aislados y los enunciados repetidos entre módulos.
- Carga real contra `AITeacher.BrowserHost` con PostgreSQL aislado: se crearon
  1 materia, 4 categorías, 12 temas, 12 unidades publicadas, 258 preguntas,
  39 pruebas y 12 mapas en 1,6 s. Repetir la carga no produce cambios.
- Recorrido en Chromium como alumno y como autor:
  1. Catálogo filtrado por la materia.
  2. Unidad del simulacro con sus 6 pruebas en orden.
  3. Diagnóstico de 15 preguntas, corregido al entregar.
  4. Evaluación abierta, que queda pendiente de corrección.
  5. Tutor que responde citando la lectura de redundancia.
  6. Corrección por rúbrica del autor; la entrega pasa a "Entregada".
  7. Historial.
  8. Repasos con las pruebas de la unidad de la evidencia.
- Pruebas:
  - .NET: 9 de dominio y 95 de integración.
  - Python: todas las pruebas, incluidas 18 nuevas del paquete y del cargador.
  - Frontend: 85 pruebas, más typecheck y lint.
  - OpenAPI: lint sin incidencias.

## Pendiente antes de abrirlo a alumnos

1. **Revisión pedagógica humana** del contenido y de las claves de respuesta,
   idealmente por alguien con la certificación. Los autores verificaron los hechos
   contra Microsoft Learn, pero algunos datos estables no se confirmaron palabra
   por palabra:
   - los nombres en español de los niveles de acceso y de los bloqueos;
   - las versiones de API en los ejemplos Bicep;
   - que un bloqueo `ReadOnly` impide listar las claves de una cuenta de almacenamiento;
   - las cifras de SLA calculadas.
2. **Carga en la beta Azure:** desplegar primero el backend y el frontend con el
   filtro nuevo. Después, ejecutar `load-course.py --base-url https://<beta>` en
   seco con una sesión de autor real, revisar el plan y repetirlo con `--apply`.
   Requiere confirmación explícita, porque publica para todos los alumnos.
3. **Aceptación con modelos reales:** el tutor y la voz en Azure (con proveedor
   real) y la corrección de las evaluaciones abiertas por un docente real.
4. **Limitaciones conocidas:**
   - las preguntas no muestran una explicación de la respuesta, porque el
     contrato no la tiene;
   - el orden de preguntas y opciones es fijo, porque no hay aleatorización;
   - Repasos ofrece todas las pruebas de la unidad, aunque el servidor rechaza
     las que no evalúan el concepto de la evidencia;
   - el dominio sigue `uncalibrated`.

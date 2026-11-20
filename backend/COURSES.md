# Cursos, avance y diplomas

Un **curso** es una materia disponible del catálogo (p. ej. «Microsoft Azure
Fundamentals (AZ-900)»). Sus categorías son las secciones del curso.

## Qué cuenta para el avance

- Cuenta cada unidad publicada (no lectura suelta) con al menos una prueba en
  modo `assessment` y feedback `afterSubmission`.
- Las unidades sólo con práctica, o cuyas pruebas ocultan la nota (`never`),
  quedan fuera: no podrían completarse y bloquearían el diploma.
- Una unidad está **completada** con un intento entregado y corregido con nota
  ≥ 70 % (`CourseService.PassingFraction`). Las pruebas con rúbrica cuentan
  cuando un docente las corrige.
- **En curso** significa que hay algún intento en esa unidad, incluso de práctica.
- El avance se calcula al consultar, a partir de los intentos de Evaluaciones.
  No depende del procesador de evidencias.

## Contrato

Todo bajo `/api/learning` requiere sesión, y las escrituras requieren CSRF.

| Método y ruta | Uso |
|---|---|
| `GET /courses` | Cursos con inscripción, avance y diploma del alumno |
| `GET /courses/{subjectId}` | Avance por sección y unidad, siguiente unidad y nota mínima |
| `PUT /courses/{subjectId}/enrollment` | Inscribirse; es idempotente y conserva la fecha original |
| `DELETE /courses/{subjectId}/enrollment` | Salir; conserva intentos y diplomas |
| `POST /courses/{subjectId}/certificate` | Emitir el diploma (201). Si ya existe devuelve 200 y, si falta alguna unidad, 409 |
| `GET /certificates` | Diplomas propios |
| `GET /api/certificates/{code}` | Verificación pública, anónima y limitada a 30 por minuto por IP |

El diploma guarda una copia del nombre del alumno y del curso al momento de
emitirse. El código (`XXXX-XXXX-XXXX`) usa caracteres no ambiguos. La
verificación pública muestra sólo lo impreso, sin el promedio.

## Interfaz

- **Catálogo**: sin filtros muestra los cursos y materias. Los temas aparecen al
  elegir uno o al buscar. Con un curso elegido se ven su avance, la inscripción y
  los filtros por categoría.
- **Inicio → Mis cursos**: cursos inscritos o ya empezados, con su avance.
- **`/cursos/:id`**: siguiente paso, avance por sección y el botón del diploma.
- **`/diplomas/:code`**: diploma imprimible. **`/verificar/:code`**: página
  pública, sin sesión.
- **Practicar** de cada unidad enlaza a los quizzes de selección múltiple de
  **Evaluar**.

Persistencia: tablas `learning.enrollments` y `learning.certificates`, creadas
por la migración `CoursesAndCertificates` de `LearningDbContext`.

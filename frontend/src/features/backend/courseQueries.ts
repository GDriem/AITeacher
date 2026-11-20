import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { backend, result, type Schema } from "./client";

export type CourseSummary = Schema["CourseSummary"];
export type CourseUnit = Schema["CourseUnitProgress"];

/** Cursos con inscripción, avance y diploma del alumno. Inicio, catálogo y curso comparten esta caché. */
export function useCourses() {
  return useQuery({ queryKey: ["courses"], queryFn: async ({ signal }) => result(await backend.GET("/api/learning/courses", { signal })).items });
}
export function useCourse(subjectId: string) {
  return useQuery({ queryKey: ["courses", subjectId], queryFn: async ({ signal }) =>
    result(await backend.GET("/api/learning/courses/{subjectId}", { signal, params: { path: { subjectId } } })) });
}
export function useCertificates() {
  return useQuery({ queryKey: ["certificates"], queryFn: async ({ signal }) => result(await backend.GET("/api/learning/certificates", { signal })).items });
}

/** Inscribirse o salir de un curso. Salir conserva intentos y diplomas: sólo deja de aparecer en Inicio. */
export function useEnrollment(subjectId: string) {
  const queries = useQueryClient();
  return useMutation({
    mutationFn: async (enrolled: boolean) => {
      const path = { params: { path: { subjectId } } };
      if (enrolled) { result(await backend.PUT("/api/learning/courses/{subjectId}/enrollment", path)); return; }
      const response = await backend.DELETE("/api/learning/courses/{subjectId}/enrollment", path);
      if (!response.response.ok) result(response);
    },
    onSettled: () => queries.invalidateQueries({ queryKey: ["courses"] }),
  });
}
export function useIssueCertificate(subjectId: string) {
  const queries = useQueryClient();
  return useMutation({
    mutationFn: async () => result(await backend.POST("/api/learning/courses/{subjectId}/certificate", { params: { path: { subjectId } } })),
    onSuccess: () => Promise.all([queries.invalidateQueries({ queryKey: ["courses"] }), queries.invalidateQueries({ queryKey: ["certificates"] })]),
  });
}

/** Cursos que el alumno ya empezó: inscritos o con actividad aunque no se haya inscrito. */
export const startedCourses = (courses: CourseSummary[]) => courses.filter((course) => course.enrolledAt != null || course.startedCount > 0)
  .sort((left, right) => recency(right) - recency(left));
function recency(course: CourseSummary) {
  const time = Date.parse(course.lastActivityAt ?? course.enrolledAt ?? "");
  return Number.isNaN(time) ? 0 : time;
}

export const coursePath = (subjectId: string) => `/cursos/${encodeURIComponent(subjectId)}`;
export const diplomaPath = (code: string) => `/diplomas/${encodeURIComponent(code)}`;
export const verificationPath = (code: string) => `/verificar/${encodeURIComponent(code)}`;
/** En curso se retoma en Evaluar; una unidad nueva empieza por sus lecturas. */
export const unitStepPath = (unit: CourseUnit) => `/unidades/${encodeURIComponent(unit.unitId)}${unit.status === "inProgress" ? "?pestana=evaluar" : ""}`;
export const unitStatusLabel: Record<CourseUnit["status"], string> = { notStarted: "Sin empezar", inProgress: "En curso", completed: "Completada" };

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { http, HttpResponse } from "msw";
import { expect, it } from "vitest";
import { server } from "../../test/server";
import { ProfileContext } from "./profile";
import { HomeRoute } from "./HomeRoute";
import { CurriculumExplorer } from "./CurriculumExplorer";
import { CourseRoute } from "./CourseRoute";
import { VerifyRoute } from "./DiplomaRoute";
import type { Schema } from "./client";

const origin = window.location.origin;
function mount(path: string, initial: string, element: React.ReactNode) {
  const queries = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<MemoryRouter initialEntries={[initial]}><QueryClientProvider client={queries}>
    <ProfileContext value={{ studentId: "a", displayName: "Ana", email: "ana@example.test", canAuthor: false }}>
      <Routes><Route path={path} element={element} /><Route path="*" element={<p>Otra pantalla</p>} /></Routes>
    </ProfileContext>
  </QueryClientProvider></MemoryRouter>);
}
const course = (extra: Partial<Schema["CourseSummary"]> = {}): Schema["CourseSummary"] => ({
  subjectId: "az900", slug: "az-900", name: "Azure Fundamentals", enrolledAt: null, unitCount: 4, completedCount: 0,
  startedCount: 0, percent: 0, lastActivityAt: null, certificate: null, ...extra,
});
const entry = (id: string, name: string, extra: Partial<Schema["EntryResponse"]> = {}): Schema["EntryResponse"] =>
  ({ id, name, slug: id, sortOrder: 0, isAvailable: true, version: 1, ...extra });
const page = (items: unknown[]) => HttpResponse.json({ items, total: items.length });
function catalog() {
  server.use(
    http.get(`${origin}/api/catalog/subjects`, () => page([entry("az900", "Azure Fundamentals"), entry("redes", "Redes", { sortOrder: 2 })])),
    http.get(`${origin}/api/catalog/categories`, () => page([entry("nube", "Conceptos de nube", { subjectId: "az900", sortOrder: 1 }),
      entry("gobierno", "Gobernanza", { subjectId: "az900", sortOrder: 2 }), entry("enr", "Enrutamiento", { subjectId: "redes" })])),
    http.get(`${origin}/api/catalog/topics`, () => page([entry("iaas", "Tipos de servicio", { subjectId: "az900", categoryId: "nube" }),
      entry("politicas", "Azure Policy", { subjectId: "az900", categoryId: "gobierno" }), entry("ospf", "OSPF", { subjectId: "redes", categoryId: "enr" })])),
    http.get(`${origin}/api/units`, () => page(["iaas", "politicas", "ospf"].map((topicId, index) => ({ id: `u-${topicId}`, topicId, title: `Unidad ${topicId}`,
      number: index + 1, version: 1, publishedRevisionId: "r", revisionId: "r", kind: "learningUnit", readingProvenance: null })))),
    http.get(`${origin}/api/catalog/source-curriculum`, () => HttpResponse.json({ source: "beta", topics: [], levels: [] })),
    http.get(`${origin}/api/auth/csrf`, () => HttpResponse.json({ requestToken: "test" })),
  );
}

it("muestra en Inicio sólo los cursos empezados, con su avance y el siguiente paso", async () => {
  for (const path of ["tutor/conversations", "assessments/attempts", "learning/reviews"])
    server.use(http.get(`${origin}/api/${path}`, () => page([])));
  server.use(http.get(`${origin}/api/learning/courses`, () => HttpResponse.json({ items: [
    course({ enrolledAt: "2026-11-01T10:00:00Z", completedCount: 1, startedCount: 2, percent: 25 }),
    course({ subjectId: "otro", name: "Curso sin empezar" }),
  ] })));
  mount("/", "/", <HomeRoute />);
  const mine = await screen.findByRole("region", { name: "Mis cursos" });
  expect(await within(mine).findByRole("link", { name: "Azure Fundamentals" })).toHaveAttribute("href", "/cursos/az900");
  expect(within(mine).getByRole("progressbar", { name: "Avance en Azure Fundamentals" })).toHaveAttribute("aria-valuenow", "25");
  expect(within(mine).getByText("1 de 4 unidades completadas · 25 %")).toBeVisible();
  expect(within(mine).getByRole("link", { name: "Continuar curso" })).toHaveAttribute("href", "/cursos/az900");
  expect(within(mine).queryByText("Curso sin empezar")).not.toBeInTheDocument();
});

it("abre el catálogo con los cursos y muestra los temas sólo al elegir uno", async () => {
  catalog();
  let enrolled = false;
  server.use(
    http.get(`${origin}/api/learning/courses`, () => HttpResponse.json({ items: [course({ enrolledAt: enrolled ? "2026-11-20T10:00:00Z" : null })] })),
    http.put(`${origin}/api/learning/courses/az900/enrollment`, () => { enrolled = true; return HttpResponse.json({ subjectId: "az900", enrolledAt: "2026-11-20T10:00:00Z" }); }),
  );
  mount("/catalogo", "/catalogo", <CurriculumExplorer />);
  const user = userEvent.setup();
  const courses = await screen.findByRole("region", { name: "Cursos y materias" });
  expect(screen.queryByRole("link", { name: /Tipos de servicio/ })).not.toBeInTheDocument();
  // Una materia sin quizzes calificados se explora, pero no ofrece inscripción.
  expect(within(courses).getByRole("button", { name: "Ver temas (1)" })).toBeEnabled();

  await user.click(await within(courses).findByRole("button", { name: "Inscribirme" }));
  expect(await within(courses).findByRole("link", { name: "Mi avance" })).toHaveAttribute("href", "/cursos/az900");
  expect(within(courses).getByText("Inscrito")).toBeVisible();

  await user.click(within(courses).getByRole("button", { name: "Ver temas (2)" }));
  expect(await screen.findByRole("link", { name: /Tipos de servicio/ })).toBeVisible();
  expect(screen.queryByRole("region", { name: "Cursos y materias" })).not.toBeInTheDocument();
  await user.click(within(screen.getByRole("group", { name: "Categoría" })).getByRole("button", { name: "Gobernanza" }));
  expect(await screen.findByRole("link", { name: /Azure Policy/ })).toBeVisible();
  expect(screen.queryByRole("link", { name: /Tipos de servicio/ })).not.toBeInTheDocument();
});

it("lleva al siguiente paso del curso y genera el diploma al completarlo", async () => {
  let complete = false; let certificate: Schema["Certificate"] | null = null;
  const unit = (unitId: string, status: Schema["CourseUnitProgress"]["status"], bestPercent: number | null) =>
    ({ unitId, title: `Unidad ${unitId}`, topicId: "t", topicName: "Tema", status, bestPercent, completedAt: null });
  server.use(
    http.get(`${origin}/api/learning/courses/az900`, () => HttpResponse.json({
      course: course({ completedCount: complete ? 2 : 1, unitCount: 2, percent: complete ? 100 : 50, certificate }),
      sections: [{ categoryId: "nube", name: "Conceptos de nube", units: [unit("u1", "completed", 90), unit("u2", complete ? "completed" : "inProgress", complete ? 80 : 40)] }],
      nextUnitId: complete ? null : "u2", passingPercent: 70,
    })),
    http.get(`${origin}/api/auth/csrf`, () => HttpResponse.json({ requestToken: "test" })),
    http.post(`${origin}/api/learning/courses/az900/certificate`, () => {
      certificate = { code: "ABCD-EFGH-JKMN", studentName: "Ana", courseName: "Azure Fundamentals", unitCount: 2, averagePercent: 85, issuedAt: "2026-11-20T10:00:00Z" };
      return HttpResponse.json(certificate, { status: 201 });
    }),
  );
  const view = mount("/cursos/:subjectId", "/cursos/az900", <CourseRoute />);
  expect(await screen.findByText(/Tu mejor resultado es 40 %/)).toBeVisible();
  expect(screen.getByRole("link", { name: "Ir a los quizzes" })).toHaveAttribute("href", "/unidades/u2?pestana=evaluar");
  expect(screen.getByRole("heading", { name: "Conceptos de nube 1/2" })).toBeVisible();
  view.unmount();

  complete = true;
  mount("/cursos/:subjectId", "/cursos/az900", <CourseRoute />);
  await userEvent.setup().click(await screen.findByRole("button", { name: "Obtener diploma" }));
  expect(await screen.findByRole("link", { name: "Ver diploma" })).toHaveAttribute("href", "/diplomas/ABCD-EFGH-JKMN");
});

it("verifica un diploma sin sesión e informa un código inexistente", async () => {
  server.use(http.get(`${origin}/api/certificates/:code`, ({ params }) => params.code === "ABCD-EFGH-JKMN"
    ? HttpResponse.json({ code: "ABCD-EFGH-JKMN", studentName: "Ana Pérez", courseName: "Azure Fundamentals", unitCount: 12, issuedAt: "2026-11-20T10:00:00Z" })
    : HttpResponse.json({}, { status: 404 })));
  const view = mount("/verificar/:code", "/verificar/ABCD-EFGH-JKMN", <VerifyRoute />);
  expect(await screen.findByText("Diploma válido, emitido por AITeacher.")).toBeVisible();
  expect(screen.getByText("Ana Pérez")).toBeVisible();
  expect(screen.queryByText(/promedio/)).not.toBeInTheDocument();
  view.unmount();
  mount("/verificar/:code", "/verificar/ZZZZ", <VerifyRoute />);
  expect(await screen.findByRole("heading", { name: "Código no válido" })).toBeVisible();
});

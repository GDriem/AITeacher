import axe from "axe-core";
import { http, HttpResponse } from "msw";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { authoredContentFixture, authoringLessonsFixture, publishedLessonFixture } from "../../test/fixtures/authoring";
import { renderAuthoring } from "../../test/renderAuthoring";
import { server } from "../../test/server";

async function enterAuthoring(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText("Nombre del editor"), "Ana Editora");
  await user.type(screen.getByLabelText("Credencial de acceso"), "panel-secret");
  await user.click(screen.getByRole("button", { name: "Acceder a las lecciones" }));
}

describe("AuthoringScreen", () => {
  it("mantiene la credencial en el gate, recupera un error y presenta el estado vacío", async () => {
    let calls = 0;
    server.use(http.get("http://localhost:4173/api/authoring/lessons", () => {
      calls += 1;
      return calls === 1
        ? HttpResponse.json({ detail: "Credencial de autoría inválida" }, { status: 401 })
        : HttpResponse.json([]);
    }));
    const user = userEvent.setup();
    renderAuthoring();

    await enterAuthoring(user);
    expect(await screen.findByRole("alert")).toHaveTextContent("Credencial de autoría inválida");
    expect(screen.queryByText("Accede para continuar")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Acceder a las lecciones" }));
    expect(await screen.findByText("El archivo está vacío")).toBeVisible();
    expect(await screen.findByRole("heading", { name: "Nueva lección" })).toHaveFocus();
  });

  it("busca, abre y previsualiza una lección con semántica accesible", async () => {
    server.use(http.get("http://localhost:4173/api/authoring/lessons", () => HttpResponse.json(authoringLessonsFixture)));
    const user = userEvent.setup();
    const { container } = renderAuthoring();
    await enterAuthoring(user);

    const search = await screen.findByLabelText("Buscar por título o identificador");
    await user.type(search, "embeddings");
    expect(screen.getByText("1 de 2 lecciones")).toBeVisible();
    await user.click(screen.getByRole("button", { name: /Embeddings con evidencia/ }));
    expect(await screen.findByRole("heading", { name: "Embeddings con evidencia" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Vista previa" }));
    const preview = screen.getByRole("article", { name: "Embeddings con evidencia" });
    expect(within(preview).getByText(/representan significado/)).toBeVisible();
    expect(within(preview).getByText("Equipo curricular AITeacher")).toBeVisible();
    expect((await axe.run(container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  });

  it("bloquea contenido inválido y publica una lección válida en una sola intención", async () => {
    let createCalls = 0;
    let publishCalls = 0;
    server.use(
      http.get("http://localhost:4173/api/authoring/lessons", () => HttpResponse.json([])),
      http.post("http://localhost:4173/api/authoring/lessons", async ({ request }) => {
        createCalls += 1;
        const body = await request.json() as { content: typeof authoredContentFixture };
        return HttpResponse.json({ ...publishedLessonFixture, id: body.content.id, draft: body.content, published_content: null, published: false, version: 1, revisions: [publishedLessonFixture.revisions[0]] }, { status: 201 });
      }),
      http.post("http://localhost:4173/api/authoring/lessons/:lessonId/publish", async ({ request }) => {
        publishCalls += 1;
        const body = await request.json() as { author: string };
        return HttpResponse.json({ ...publishedLessonFixture, revisions: publishedLessonFixture.revisions.map((revision) => ({ ...revision, author: body.author })) });
      }),
    );
    const user = userEvent.setup();
    renderAuthoring();
    await enterAuthoring(user);
    await screen.findByText("El archivo está vacío");
    await screen.findByRole("heading", { name: "Nueva lección" });

    fireEvent.change(screen.getByLabelText("Identificador"), { target: { value: "embeddings-evidence" } });
    await user.selectOptions(screen.getByLabelText("Tema"), "embeddings");
    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Embeddings con evidencia" } });
    fireEvent.change(screen.getByLabelText("Fuente"), { target: { value: "Equipo curricular AITeacher" } });
    fireEvent.change(screen.getByLabelText(/^Palabras clave/), { target: { value: "vectores, VECTORES" } });
    fireEvent.change(screen.getByLabelText(/^Contenido/), { target: { value: authoredContentFixture.text } });
    await user.click(screen.getByRole("button", { name: "Guardar y publicar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("no pueden repetirse");
    expect(createCalls).toBe(0);

    fireEvent.change(screen.getByLabelText(/^Palabras clave/), { target: { value: "vectores, similitud" } });
    await user.click(screen.getByRole("button", { name: "Guardar y publicar" }));
    expect(await screen.findByText("Lección publicada. Versión 2.")).toBeVisible();
    expect(createCalls).toBe(1);
    expect(publishCalls).toBe(1);
  });

  it("exige confirmación para despublicar y revertir", async () => {
    let unpublishCalls = 0;
    let revertCalls = 0;
    server.use(
      http.get("http://localhost:4173/api/authoring/lessons", () => HttpResponse.json([publishedLessonFixture])),
      http.post("http://localhost:4173/api/authoring/lessons/:lessonId/unpublish", () => {
        unpublishCalls += 1;
        return HttpResponse.json({ ...publishedLessonFixture, published: false, published_content: null, version: 3 });
      }),
      http.post("http://localhost:4173/api/authoring/lessons/:lessonId/revert", () => {
        revertCalls += 1;
        return HttpResponse.json({ ...publishedLessonFixture, version: 3 });
      }),
    );
    const user = userEvent.setup();
    renderAuthoring();
    await enterAuthoring(user);
    await user.click(await screen.findByRole("button", { name: /Embeddings con evidencia/ }));

    const unpublish = screen.getByRole("button", { name: "Despublicar" });
    await user.click(unpublish);
    const confirmation = screen.getByRole("alertdialog", { name: "¿Retirar esta lección del catálogo?" });
    expect(within(confirmation).getByRole("button", { name: "Sí, despublicar" })).toHaveFocus();
    await user.click(within(confirmation).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(unpublish).toHaveFocus());
    expect(unpublishCalls).toBe(0);

    await user.click(screen.getByRole("button", { name: "Revertir a la versión 1" }));
    await user.click(screen.getByRole("button", { name: "Sí, revertir a v1" }));
    await waitFor(() => expect(revertCalls).toBe(1));
  });
});

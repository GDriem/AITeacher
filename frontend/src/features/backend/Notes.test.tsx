import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { http, HttpResponse } from "msw";
import { expect, it } from "vitest";
import { server } from "../../test/server";
import { Notes } from "./Notes";

it("conserva el borrador y su versión ante una actualización externa y un conflicto", async () => {
  const origin = window.location.origin;
  const note = { id: "n", kind: "student", text: "Mi idea", version: 1, updatedAt: "2026-01-01T00:00:00Z" };
  let sent: unknown;
  server.use(
    http.get(`${origin}/api/tutor/notes`, () => HttpResponse.json({ items: [note], total: 1 })),
    http.get(`${origin}/api/auth/csrf`, () => HttpResponse.json({ requestToken: "test" })),
    http.put(`${origin}/api/tutor/notes/n`, async ({ request }) => { sent = await request.json(); return HttpResponse.json({}, { status: 409 }); }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<MemoryRouter><QueryClientProvider client={client}><Notes /></QueryClientProvider></MemoryRouter>);
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Editar" }));
  const editor = screen.getByLabelText("Editar apunte");
  expect(editor).toHaveFocus();
  await user.clear(editor); await user.type(editor, "Mi borrador nuevo");
  act(() => { client.setQueryData(["notes", 0], { items: [{ ...note, version: 2, text: "Cambio desde otra pestaña" }], total: 1 }); });
  expect(editor).toHaveValue("Mi borrador nuevo");
  await user.click(screen.getByRole("button", { name: "Guardar cambios" }));
  await screen.findByText("No se guardaron los cambios");
  expect(sent).toEqual({ version: 1, text: "Mi borrador nuevo" });
  expect(editor).toHaveValue("Mi borrador nuevo");
  await user.click(screen.getByRole("button", { name: "Cancelar" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Editar" })).toHaveFocus());
  await user.click(screen.getByRole("button", { name: "Editar" }));
  expect(screen.getByLabelText("Editar apunte")).toHaveValue("Cambio desde otra pestaña");
});

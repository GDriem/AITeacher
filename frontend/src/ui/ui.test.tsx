import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { Badge, Button, Dialog, EmptyState, ErrorState, PageHeader, Skeleton, Tabs, Toast, ToastRegion, TopicCard } from ".";

// jsdom no implementa <dialog> modal; el navegador real se cubre en e2e (foco atrapado y Escape).
beforeAll(() => {
  if ("showModal" in HTMLDialogElement.prototype) return;
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { value(this: HTMLDialogElement) { this.setAttribute("open", ""); } },
    close: { value(this: HTMLDialogElement) { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); } },
  });
});

describe("ui", () => {
  it("Button es type=button por defecto y respeta submit", () => {
    render(<form><Button>Guardar</Button><Button type="submit" variant="primary">Enviar</Button></form>);
    expect(screen.getByRole("button", { name: "Guardar" })).toHaveAttribute("type", "button");
    expect(screen.getByRole("button", { name: "Enviar" })).toHaveAttribute("type", "submit");
  });

  it("PageHeader marca la página actual en las migas y tiene un único h1", () => {
    render(<MemoryRouter><PageHeader title="Vectores" breadcrumbs={[{ label: "Catálogo", to: "/catalogo" }, { label: "Vectores" }]} /></MemoryRouter>);
    const crumbs = screen.getByRole("navigation", { name: "Migas de pan" });
    expect(crumbs.querySelector("a")).toHaveAttribute("href", "/catalogo");
    expect(screen.getAllByText("Vectores").find((node) => node.getAttribute("aria-current") === "page")).toBeDefined();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("Tabs cambia con flechas, Inicio y Fin y deja una sola parada de tabulación", async () => {
    const user = userEvent.setup();
    render(<Tabs label="Unidad" items={[{ id: "a", label: "Aprender", content: "Lecturas" }, { id: "p", label: "Practicar", content: "Ejercicios" }, { id: "e", label: "Evaluar", content: "Intentos" }]} />);
    await user.tab();
    expect(screen.getByRole("tab", { name: "Aprender" })).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Practicar" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Ejercicios");
    await user.keyboard("{End}");
    expect(screen.getByRole("tab", { name: "Evaluar" })).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Aprender" })).toHaveFocus();
    expect(screen.getAllByRole("tab").filter((tab) => tab.tabIndex === 0)).toHaveLength(1);
  });

  it("ErrorState muestra el código de seguimiento y reintenta", async () => {
    const retry = vi.fn();
    render(<ErrorState message="El servicio no respondió." traceId="00-abc-01" onRetry={retry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Si el problema continúa, comparte este código con el responsable de la beta: 00-abc-01");
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("Skeleton anuncia la carga sin leer los marcadores", () => {
    render(<Skeleton label="Cargando unidad…" />);
    expect(screen.getByRole("status")).toHaveTextContent("Cargando unidad…");
  });

  it("EmptyState, Badge y Toast exponen su texto", async () => {
    const dismiss = vi.fn();
    render(<><EmptyState title="Sin apuntes" description="Guarda un mensaje del tutor." /><Badge tone="success">Publicada</Badge>
      <ToastRegion><Toast onDismiss={dismiss}>Apunte guardado.</Toast></ToastRegion></>);
    expect(screen.getByRole("heading", { name: "Sin apuntes" })).toBeInTheDocument();
    expect(screen.getByText("Publicada")).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Avisos" })).toHaveTextContent("Apunte guardado.");
    await userEvent.click(screen.getByRole("button", { name: "Cerrar aviso" }));
    expect(dismiss).toHaveBeenCalledOnce();
  });

  it("Dialog se abre como modal, cierra al cancelar y devuelve el foco", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [open, setOpen] = useState(false);
      return <><Button onClick={() => setOpen(true)}>Eliminar apunte</Button>
        <Dialog open={open} title="¿Eliminar este apunte?" onClose={() => setOpen(false)} actions={<Button variant="danger" onClick={() => setOpen(false)}>Sí, eliminar</Button>} /></>;
    }
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Eliminar apunte" }));
    expect(screen.getByRole("dialog", { name: "¿Eliminar este apunte?" })).toBeInTheDocument();
    fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Eliminar apunte" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Eliminar apunte" }));
    await user.click(screen.getByRole("button", { name: "Sí, eliminar" }));
    expect(screen.getByRole("button", { name: "Eliminar apunte" })).toHaveFocus();
  });

  it("TopicCard enlaza por el título y describe material y niveles", () => {
    render(<MemoryRouter><ul><TopicCard title="OSPF" to="/temas/ospf" eyebrow="Redes" summary="2 lecturas" levels={["Principiante", "Avanzado"]} /></ul></MemoryRouter>);
    const link = screen.getByRole("link", { name: "OSPF" });
    expect(link).toHaveAttribute("href", "/temas/ospf");
    expect(link).toHaveAccessibleDescription("2 lecturas Principiante Avanzado");
    expect(screen.getByRole("list", { name: "Niveles disponibles" })).toBeInTheDocument();
  });
});

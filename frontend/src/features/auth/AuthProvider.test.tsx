import axe from "axe-core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse, delay } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getTopicCatalog } from "../catalog/catalogApi";
import { capabilitiesFixture, server } from "../../test/server";
import { AuthProvider } from "./AuthProvider";
import { useAppSession } from "./appSession";
import { StudentAccount } from "./StudentAccount";

const profile = {
  student_id: "google-student-r3",
  email: "student@example.com",
  display_name: "Estudiante Verificada",
  picture_url: null,
};

function SessionProbe() {
  const { studentId } = useAppSession();
  return <p>Identidad activa: {studentId}</p>;
}

function UnauthorizedProbe() {
  const { studentId } = useAppSession();
  return (
    <button type="button" onClick={() => void getTopicCatalog(studentId).catch(() => undefined)}>
      Cargar datos protegidos
    </button>
  );
}

function renderAuth(children: React.ReactNode = <SessionProbe />) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const result = render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>,
  );
  return { ...result, queryClient };
}

function installGoogleButton() {
  let credentialCallback: ((response: { credential: string }) => void) | null = null;
  const disableAutoSelect = vi.fn();
  window.google = {
    accounts: {
      id: {
        initialize: (options) => {
          credentialCallback = options.callback;
        },
        renderButton: (parent) => {
          const button = document.createElement("button");
          button.type = "button";
          button.textContent = "Continuar con Google";
          button.addEventListener("click", () => credentialCallback?.({ credential: `credential-${"x".repeat(100)}` }));
          parent.append(button);
        },
        disableAutoSelect,
      },
    },
  };
  return disableAutoSelect;
}

afterEach(() => {
  delete window.google;
});

describe("AuthProvider", () => {
  it("inicia capacidades y autenticación en paralelo y permite identidad local", async () => {
    let started = 0;
    let release: () => void = () => undefined;
    const bothStarted = new Promise<void>((resolve) => { release = resolve; });
    const markStarted = async () => {
      started += 1;
      if (started === 2) release();
      await bothStarted;
    };
    server.use(
      http.get("http://localhost:4173/api/capabilities", async () => {
        await markStarted();
        return HttpResponse.json(capabilitiesFixture);
      }),
      http.get("http://localhost:4173/api/auth/status", async () => {
        await markStarted();
        return HttpResponse.json({ enabled: false, authenticated: false, google_client_id: null, profile: null });
      }),
    );

    renderAuth();

    expect(await screen.findByText(/Identidad activa: alumno-/)).toBeVisible();
    expect(started).toBe(2);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("presenta el gate, contiene el foco e inicia sesión sin persistir PII", async () => {
    installGoogleButton();
    let requestBody: unknown;
    server.use(
      http.get("http://localhost:4173/api/auth/status", () =>
        HttpResponse.json({ enabled: true, authenticated: false, google_client_id: "client.apps.googleusercontent.com", profile: null }),
      ),
      http.post("http://localhost:4173/api/auth/google", async ({ request }) => {
        requestBody = await request.json();
        return HttpResponse.json(profile);
      }),
    );
    const user = userEvent.setup();
    const { container } = renderAuth();

    const heading = await screen.findByRole("heading", { name: "Continúa con tu cuenta" });
    expect(heading).toHaveFocus();
    const googleButton = await screen.findByRole("button", { name: "Continuar con Google" });
    googleButton.focus();
    await user.tab();
    expect(googleButton).toHaveFocus();
    expect((await axe.run(container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);

    await user.click(googleButton);

    expect(await screen.findByText("Identidad activa: google-student-r3")).toBeVisible();
    expect(requestBody).toEqual({ credential: `credential-${"x".repeat(100)}` });
    const storedValues = Array.from({ length: window.localStorage.length }, (_, index) => {
      const key = window.localStorage.key(index);
      return key ? window.localStorage.getItem(key) : null;
    }).join(" ");
    expect(storedValues).not.toContain(profile.email);
    expect(storedValues).not.toContain(profile.display_name);
  });

  it("recupera un 401 con el gate uniforme y restaura el foco tras autenticarse", async () => {
    installGoogleButton();
    server.use(
      http.get("http://localhost:4173/api/auth/status", () =>
        HttpResponse.json({ enabled: true, authenticated: true, google_client_id: "client.apps.googleusercontent.com", profile }),
      ),
      http.get("http://localhost:4173/api/topics", () => HttpResponse.json({ detail: "La sesión expiró" }, { status: 401 })),
      http.post("http://localhost:4173/api/auth/google", () => HttpResponse.json(profile)),
    );
    const user = userEvent.setup();
    renderAuth(<UnauthorizedProbe />);

    const trigger = await screen.findByRole("button", { name: "Cargar datos protegidos" });
    await user.click(trigger);
    expect(await screen.findByRole("heading", { name: "Continúa con tu cuenta" })).toHaveFocus();

    await user.click(await screen.findByRole("button", { name: "Continuar con Google" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it("muestra perfil y cierra sesión regresando al gate", async () => {
    const disableAutoSelect = installGoogleButton();
    server.use(
      http.get("http://localhost:4173/api/auth/status", () =>
        HttpResponse.json({ enabled: true, authenticated: true, google_client_id: "client.apps.googleusercontent.com", profile }),
      ),
      http.post("http://localhost:4173/api/auth/logout", () => new HttpResponse(null, { status: 204 })),
    );
    const user = userEvent.setup();
    renderAuth(<StudentAccount />);

    await user.click(await screen.findByRole("button", { name: "Estudiante Verificada" }));
    expect(screen.getByRole("menu")).toHaveTextContent(profile.email);
    await user.click(screen.getByRole("menuitem", { name: "Cerrar sesión" }));

    expect(await screen.findByRole("heading", { name: "Continúa con tu cuenta" })).toHaveFocus();
    expect(disableAutoSelect).toHaveBeenCalledOnce();
  });

  it("recupera un fallo de bootstrap con reintento explícito", async () => {
    let calls = 0;
    server.use(http.get("http://localhost:4173/api/capabilities", async () => {
      calls += 1;
      await delay(1);
      return calls === 1
        ? HttpResponse.json({ detail: "Servicio no disponible" }, { status: 503 })
        : HttpResponse.json(capabilitiesFixture);
    }));
    const user = userEvent.setup();
    renderAuth();

    expect(await screen.findByRole("heading", { name: "No pudimos preparar AITeacher." })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText(/Identidad activa: alumno-/)).toBeVisible();
  });
});

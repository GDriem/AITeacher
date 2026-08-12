interface GoogleCredentialResponse {
  credential: string;
}

interface GoogleIdentityApi {
  initialize(options: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
    auto_select: boolean;
    cancel_on_tap_outside: boolean;
  }): void;
  renderButton(parent: HTMLElement, options: Record<string, string | number>): void;
  disableAutoSelect(): void;
}

declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleIdentityApi } };
  }
}

let scriptPromise: Promise<GoogleIdentityApi> | null = null;
let initializedApi: GoogleIdentityApi | null = null;
let initializedClientId: string | null = null;
let credentialHandler: ((credential: string) => void) | null = null;

function googleApi() {
  return window.google?.accounts?.id;
}

function loadGoogleIdentity() {
  const ready = googleApi();
  if (ready) return Promise.resolve(ready);
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.id = "google-identity-services";
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => {
      const api = googleApi();
      if (api) resolve(api);
      else {
        scriptPromise = null;
        script.remove();
        reject(new Error("Google Identity no quedó disponible."));
      }
    };
    script.onerror = () => {
      scriptPromise = null;
      script.remove();
      reject(new Error("No se pudo cargar Google Identity Services."));
    };
    document.head.append(script);
  });
  return scriptPromise;
}

export async function renderGoogleSignIn(
  parent: HTMLElement,
  clientId: string,
  onCredential: (credential: string) => void,
) {
  const api = await loadGoogleIdentity();
  parent.replaceChildren();
  credentialHandler = onCredential;
  if (initializedApi !== api || initializedClientId !== clientId) {
    api.initialize({
      client_id: clientId,
      callback: (response) => credentialHandler?.(response.credential),
      auto_select: false,
      cancel_on_tap_outside: false,
    });
    initializedApi = api;
    initializedClientId = clientId;
  }
  api.renderButton(parent, {
    type: "standard",
    theme: "outline",
    size: "large",
    text: "continue_with",
    shape: "rectangular",
    logo_alignment: "left",
    width: 300,
  });
}

export function disableGoogleAutoSelect() {
  googleApi()?.disableAutoSelect();
}

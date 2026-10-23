/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BACKEND?: string;
  /** Formulario o correo de comentarios de la beta (build .NET); vacío oculta el enlace. */
  readonly VITE_BETA_FEEDBACK_URL?: string;
}

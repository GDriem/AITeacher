import { Component, type ErrorInfo, type ReactNode } from "react";

import styles from "./ErrorBoundary.module.css";

interface Props {
  children: ReactNode;
}

interface State {
  failed: boolean;
}

export class AppErrorBoundary extends Component<Props, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("app_render_failed", error, info);
  }

  override render() {
    if (this.state.failed) {
      return (
        <main className={styles.page}>
          <section className={styles.boundary} role="alert">
            <p className={styles.eyebrow}>La aplicación necesita reiniciarse</p>
            <h1>No pudimos mostrar tu ruta de aprendizaje.</h1>
            <p>Recarga la página. Tu progreso permanece guardado en el servidor.</p>
            <button type="button" onClick={() => window.location.reload()}>
              Recargar AITeacher
            </button>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}

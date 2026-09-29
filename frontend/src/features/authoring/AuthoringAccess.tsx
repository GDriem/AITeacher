import { useState, type SyntheticEvent } from "react";
import { useMutation } from "@tanstack/react-query";

import { ApiError } from "../../api/ApiError";
import { listAuthoredLessons, type AuthoredLesson } from "./authoringApi";
import styles from "./AuthoringScreen.module.css";

export interface AuthoringCredential {
  author: string;
  token: string;
}

export function AuthoringAccess({
  onAccess,
}: {
  onAccess: (credential: AuthoringCredential, lessons: AuthoredLesson[]) => void;
}) {
  const [author, setAuthor] = useState("");
  const [token, setToken] = useState("");
  const access = useMutation({
    mutationFn: async (credential: AuthoringCredential) => ({
      credential,
      lessons: await listAuthoredLessons(credential.token),
    }),
    onSuccess: ({ credential, lessons }) => onAccess(credential, lessons),
  });

  const submit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    access.mutate({ author: author.trim(), token });
  };

  return (
    <section className={styles.access} aria-labelledby="authoring-access-title">
      <div className={styles.accessCopy}>
        <p className={styles.eyebrow}>Acceso editorial</p>
        <h2 id="authoring-access-title">Abre una sesión de autoría</h2>
        <p>La credencial se conserva sólo mientras esta ruta permanece abierta. No se guarda en el navegador.</p>
      </div>
      <form onSubmit={submit} aria-busy={access.isPending}>
        <label>
          <span>Nombre del editor</span>
          <input
            autoComplete="name"
            maxLength={100}
            minLength={1}
            required
            value={author}
            onChange={(event) => setAuthor(event.target.value)}
          />
        </label>
        <label>
          <span>Credencial de acceso</span>
          <input
            autoComplete="current-password"
            required
            type="password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
          />
        </label>
        <button type="submit" disabled={access.isPending}>
          {access.isPending ? "Verificando acceso…" : "Acceder a las lecciones"}
        </button>
        {access.isError ? <p className={styles.formError} role="alert">{errorCopy(access.error)}</p> : null}
      </form>
    </section>
  );
}

function errorCopy(error: Error) {
  return error instanceof ApiError ? error.message : "No pudimos verificar la credencial. Intenta nuevamente.";
}

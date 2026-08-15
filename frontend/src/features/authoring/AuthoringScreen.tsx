import { lazy, Suspense, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { ApiError } from "../../api/ApiError";
import { topicCatalogOptions } from "../catalog/catalogQueries";
import { AuthoringAccess, type AuthoringCredential } from "./AuthoringAccess";
import type { AuthoredLesson, Topic } from "./authoringApi";
import { authoredLessonsKey, authoredLessonsOptions } from "./authoringQueries";
import { LessonBrowser } from "./LessonBrowser";
import styles from "./AuthoringScreen.module.css";

const LessonEditor = lazy(() => import("./LessonEditor"));

export function AuthoringScreen({ studentId }: { studentId: string }) {
  const queryClient = useQueryClient();
  const [credential, setCredential] = useState<AuthoringCredential | null>(null);

  const grantAccess = (next: AuthoringCredential, lessons: AuthoredLesson[]) => {
    queryClient.setQueryData(authoredLessonsKey, lessons);
    setCredential(next);
  };

  const lockWorkspace = () => {
    queryClient.removeQueries({ queryKey: authoredLessonsKey });
    setCredential(null);
  };

  return (
    <article className={styles.authoring}>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>Currículo versionado</p>
          <h1>Mesa editorial AITeacher</h1>
          <p>Prepara borradores, revisa cada cambio y publica contenido trazable directamente en el MCP.</p>
        </div>
        <div className={styles.heroLedger} aria-hidden="true">
          <span>idea</span><i /><span>borrador</span><i /><strong>publicado</strong>
        </div>
      </header>
      {credential ? (
        <AuthoringWorkspace studentId={studentId} credential={credential} onLock={lockWorkspace} />
      ) : (
        <AuthoringAccess onAccess={grantAccess} />
      )}
    </article>
  );
}

function AuthoringWorkspace({
  studentId,
  credential,
  onLock,
}: {
  studentId: string;
  credential: AuthoringCredential;
  onLock: () => void;
}) {
  const queryClient = useQueryClient();
  const lessonsQuery = useQuery(authoredLessonsOptions(credential.token));
  const topicsQuery = useQuery(topicCatalogOptions(studentId));
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newEditorKey, setNewEditorKey] = useState(0);
  const [workspaceNotice, setWorkspaceNotice] = useState<string | null>(null);

  if (lessonsQuery.isPending) return <WorkspaceLoading />;
  if (lessonsQuery.isError) {
    return <WorkspaceError error={lessonsQuery.error} retrying={lessonsQuery.isFetching} onRetry={() => void lessonsQuery.refetch()} onLock={onLock} />;
  }

  const normalizedQuery = query.trim().toLocaleLowerCase("es");
  const lessons = lessonsQuery.data;
  const filtered = lessons.filter((lesson) => `${lesson.id} ${lesson.draft.title}`.toLocaleLowerCase("es").includes(normalizedQuery));
  const selected = lessons.find((lesson) => lesson.id === selectedId) ?? null;
  const topics = topicOptions(topicsQuery.data?.topics ?? [], lessons);

  const updateLesson = (updated: AuthoredLesson) => {
    queryClient.setQueryData<AuthoredLesson[]>(authoredLessonsKey, (current = []) => {
      const remaining = current.filter((lesson) => lesson.id !== updated.id);
      return [...remaining, updated].sort((left, right) => left.id.localeCompare(right.id));
    });
    setSelectedId(updated.id);
    setWorkspaceNotice(`${updated.published ? "Lección publicada" : "Borrador actualizado"}. Versión ${String(updated.version)}.`);
  };

  const startNew = () => {
    setSelectedId(null);
    setNewEditorKey((value) => value + 1);
  };

  return (
    <section className={styles.workspace} aria-label="Espacio de autoría">
      <div className={styles.workspaceBar}>
        <p><span aria-hidden="true" /> Sesión editorial de <strong>{credential.author}</strong></p>
        <button type="button" onClick={onLock}>Cerrar autoría</button>
      </div>
      {topicsQuery.isError && topics.length === 0 ? (
        <p className={styles.topicWarning} role="alert">No pudimos cargar los temas. Reintenta antes de crear una lección nueva.</p>
      ) : null}
      {workspaceNotice ? <p className={styles.formNotice} role="status">{workspaceNotice}</p> : null}
      <div className={styles.workspaceGrid}>
        <LessonBrowser
          lessons={filtered}
          total={lessons.length}
          query={query}
          selectedId={selectedId}
          onQueryChange={setQuery}
          onCreate={startNew}
          onSelect={(lessonId) => setSelectedId(lessonId)}
        />
        <Suspense fallback={<EditorLoading />}>
          <LessonEditor
            key={selected ? selected.id : `new-${String(newEditorKey)}`}
            lesson={selected}
            topics={topics}
            author={credential.author}
            token={credential.token}
            studentId={studentId}
            onUpdated={updateLesson}
          />
        </Suspense>
      </div>
    </section>
  );
}

function topicOptions(
  catalog: { topic: Topic; title: string }[],
  lessons: AuthoredLesson[],
) {
  const options = new Map<Topic, string>(catalog.map((item) => [item.topic, item.title]));
  for (const lesson of lessons) {
    if (!options.has(lesson.draft.topic)) options.set(lesson.draft.topic, lesson.draft.topic);
  }
  return [...options].map(([topic, title]) => ({ topic, title }));
}

function WorkspaceLoading() {
  return <section className={styles.workspaceState} aria-busy="true" aria-label="Cargando lecciones"><span /><p>Abriendo el archivo curricular…</p></section>;
}

function EditorLoading() {
  return <section className={styles.editorLoading} aria-busy="true" aria-label="Cargando editor"><span /><span /><span /></section>;
}

function WorkspaceError({ error, retrying, onRetry, onLock }: { error: Error; retrying: boolean; onRetry: () => void; onLock: () => void }) {
  const message = error instanceof ApiError ? error.message : "No pudimos cargar las lecciones.";
  return (
    <section className={styles.workspaceError} role="alert">
      <p className={styles.eyebrow}>Archivo interrumpido</p>
      <h2>No pudimos abrir la mesa editorial.</h2>
      <p>{message}</p>
      <div><button type="button" disabled={retrying} onClick={onRetry}>{retrying ? "Reintentando…" : "Reintentar"}</button><button type="button" onClick={onLock}>Usar otra credencial</button></div>
    </section>
  );
}

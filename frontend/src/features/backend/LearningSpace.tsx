import { useState } from "react";
import { type Schema } from "./client";
import { CurriculumExplorer } from "./CurriculumExplorer";
import { Archive } from "./Archive";
import { Notes } from "./Notes";
import { AuthorSpace } from "./AuthorSpace";
import { LearningReviews } from "./LearningReviews";

type View = "units" | "notes" | "history" | "reviews" | "author";
export function LearningSpace({ profile, logout, pending, error }: {
  profile: Schema["StudentProfile"]; logout: () => void; pending: boolean; error: string | null;
}) {
  const [view, setView] = useState<View>("units");
  const [catalogVisit, setCatalogVisit] = useState(0);
  const tabs: [View, string][] = [["units", "Catálogo"], ["notes", "Apuntes"], ["reviews", "Repasos"], ["history", "Historial"]];
  if (profile.canAuthor) tabs.push(["author", "Autoría"]);
  return <div className="backend-app">
    <a href="#learning-content" className="backend-skip">Saltar al contenido</a>
    <header className="backend-header"><div><a href="/" className="backend-brand">AITeacher</a><p>Tu espacio de aprendizaje</p></div>
      <div><span>{profile.displayName}</span> <button type="button" onClick={logout} disabled={pending}>Cerrar sesión</button></div></header>
    <nav className="backend-tabs" aria-label="Navegación principal">{tabs.map(([id, title]) =>
      <button key={id} type="button" aria-current={view === id ? "page" : undefined} onClick={() => setView(id)}>{title}</button>)}</nav>
    {error ? <p role="alert">{error}</p> : null}
    <main id="learning-content" tabIndex={-1}>
      {view === "units" ? <CurriculumExplorer key={catalogVisit} /> : null}
      {view === "notes" ? <Notes /> : null}
      {view === "history" ? <Archive startNew={() => { setCatalogVisit((value) => value + 1); setView("units"); }} /> : null}
      {view === "reviews" ? <LearningReviews /> : null}
      {view === "author" && profile.canAuthor ? <AuthorSpace /> : null}
    </main>
  </div>;
}

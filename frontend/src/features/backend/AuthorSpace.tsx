import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { backend, result } from "./client";
import { Busy, Failure, Field, Pages } from "./Shared";
import { Badge, Button, EmptyState, PageHeader, buttonClass } from "../../ui";
import { useProfile } from "./profile";
import { usePersonalUrl } from "./usePersonalUrl";
import { authorPages, authorPath } from "./authorQueries";
import styles from "./AuthorSpace.module.css";

const tools = [{ to: "/autoria", label: "Unidades", end: true }, { to: "/autoria/catalogo", label: "Catálogo" }, { to: "/autoria/correcciones", label: "Corregir entregas" }];
export function AuthorSpace() {
  const profile = useProfile();
  if (!profile.canAuthor) return <EmptyState title="Autoría requiere permiso de autor" description="Tu cuenta puede consultar las unidades publicadas. Solicita el permiso al responsable de la beta para crear material." action={<Link to="/catalogo" className={buttonClass()}>Explorar el catálogo</Link>} />;
  return <section><PageHeader title="Autoría" />
    <nav className={styles.tools} aria-label="Herramientas de autoría"><ul>{tools.map((tool) => <li key={tool.to}>
      <NavLink className={({ isActive }) => buttonClass(isActive ? "secondary" : "ghost", "md", styles.tool)} to={tool.to} end={tool.end}>{tool.label}</NavLink>
    </li>)}</ul></nav><Outlet /></section>;
}
export function AuthorUnits() {
  const navigate = useNavigate();
  const url = usePersonalUrl();
  const offset = url.page("pagina");
  const search = url.search.get("buscar") ?? "";
  const units = useQuery({ queryKey: ["author-units", "all"], queryFn: async ({ signal }) => {
    const items = await authorPages((offset) => backend.GET("/api/units", { signal, params: { query: { offset, limit: 100 } } }).then(result));
    return Promise.all(items.map(async (item) => {
      if (item.publishedRevisionId) return { ...item, status: "Publicada" };
      const history = await authorPages((offset) => backend.GET("/api/units/{unitId}/revisions", { signal, params: { path: { unitId: item.id }, query: { offset, limit: 100 } } }).then(result));
      return { ...item, status: history.some((revision) => revision.publishedAt) ? "Retirada" : "Borrador" };
    }));
  } });
  const filtered = units.data?.filter((item) => item.title.toLocaleLowerCase().includes(search.toLocaleLowerCase())) ?? [];
  return <><h2>Unidades editoriales</h2><Button onClick={() => void navigate("/autoria/unidades/nueva")}>Crear unidad</Button>
    <Field title="Buscar unidades"><input type="search" value={search} onChange={(event) => url.setSearch((previous) => { previous.set("buscar", event.target.value); previous.delete("pagina"); return previous; }, { replace: true })} /></Field>
    {units.isPending ? <Busy /> : units.isError ? <Failure error={units.error} retry={() => void units.refetch()} /> : filtered.length === 0 ? <EmptyState title="No hay unidades" description="Crea material para compartir con tus alumnos o cambia la búsqueda." action={<Link className={buttonClass()} to="/autoria/unidades/nueva">Crear la primera unidad</Link>} /> : <>
      <ul className={styles.units}>{filtered.slice(offset, offset + 20).map((item) => <li key={item.id}><Link to={authorPath(item.id)}>{item.title}</Link> <Badge>{item.status}</Badge>{item.publishedRevisionId && item.publishedRevisionId !== item.revisionId ? <span> · Borrador con cambios</span> : null}</li>)}</ul>
      <Pages offset={offset} total={filtered.length} change={(next) => url.set("pagina", next)} /></>}
  </>;
}

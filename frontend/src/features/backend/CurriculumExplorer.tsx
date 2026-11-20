import { useId } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { Button, Card, EmptyState, PageHeader, TopicCard, buttonClass, cardClass } from "../../ui";
import { Busy, Failure, Field } from "./Shared";
import { catalogTopics, excerpt, filterCatalog, groupCatalog, materialCount, useCatalog } from "./catalogQueries";
import { CourseCard, CourseProgress, CourseStatus, EnrollButton } from "./CourseCard";
import { coursePath, useCourses } from "./courseQueries";
import styles from "./CurriculumExplorer.module.css";
import courseStyles from "./CourseCard.module.css";

export function CurriculumExplorer() {
  // Búsqueda y filtros viven en la URL: recargar o volver desde un tema o una unidad conserva la selección.
  const [search, setSearch] = useSearchParams();
  const location = useLocation();
  const subject = search.get("materia") ?? "";
  const category = search.get("categoria") ?? "";
  const level = search.get("nivel") ?? "";
  const text = search.get("q") ?? "";
  // flushSync: React Router aplica la navegación en una transición, y la búsqueda controlada por la URL perdería el cursor.
  const filter = (changes: Record<string, string>) => setSearch((previous) => {
    const next = new URLSearchParams(previous);
    for (const [key, value] of Object.entries(changes)) if (value) next.set(key, value); else next.delete(key);
    return next;
  }, { replace: true, flushSync: true });
  const clear = () => setSearch(new URLSearchParams(), { replace: true });
  const subjectLabel = useId();
  const levelLabel = useId();
  const categoryLabel = useId();
  const query = useCatalog();
  // El avance no bloquea el catálogo: si falla o tarda, las materias se muestran sin él.
  const courses = useCourses();
  if (query.isPending) return <Busy />;
  if (query.isError) return <Failure error={query.error} retry={() => void query.refetch()} />;
  const data = query.data;
  const all = catalogTopics(data);
  const subjects = [...new Map(all.map((topic) => [topic.subject.id, topic.subject])).values()].sort((left, right) => left.sortOrder - right.sortOrder);
  const selectedCategory = all.find((topic) => topic.category.id === category)?.category;
  const levelNames = new Map(data.source.levels.map((entry) => [entry.slug, entry.name]));
  const shown = filterCatalog(all, { subject, category, level, text });
  const groups = groupCatalog(shown);
  const count = shown.reduce((total, topic) => total + topic.units.length, 0);
  const filtered = Boolean(subject || category || level || text.trim());
  const courseOf = (id: string) => courses.data?.find((course) => course.subjectId === id);
  const selectedCourse = subject ? courseOf(subject) : undefined;
  const subjectCategories = [...new Map(all.filter((topic) => topic.subject.id === subject).map((topic) => [topic.category.id, topic.category])).values()]
    .sort((left, right) => left.sortOrder - right.sortOrder);

  return <section>
    <PageHeader title="Explora el catálogo"
      description="Elige un curso para ver sus temas y seguir tu avance, o busca directamente un tema o lectura." />
    <div className={styles.toolbar}>
      <Field title="Buscar temas o lecturas">
        <input type="search" value={text} placeholder="Por ejemplo: OSPF, subredes, vectores" autoComplete="off"
          onChange={(event) => filter({ q: event.target.value })} />
      </Field>
      {subjects.length > 1 ? <div className={styles.chipRow}>
        <span id={subjectLabel} className={styles.chipLabel}>Materia</span>
        <div className={styles.chips} role="group" aria-labelledby={subjectLabel}>
          <Button size="sm" aria-pressed={!subject} onClick={() => filter({ materia: "", categoria: "" })}>Todas</Button>
          {subjects.map((entry) => <Button key={entry.id} size="sm" aria-pressed={subject === entry.id}
            onClick={() => filter({ materia: subject === entry.id ? "" : entry.id, categoria: "" })}>{entry.name}</Button>)}
        </div>
      </div> : null}
      <div className={styles.chipRow}>
        <span id={levelLabel} className={styles.chipLabel}>Nivel de lectura</span>
        <p className={styles.help}>El nivel describe el material, no tu dominio del tema. Elige el que quieras consultar.</p>
        <div className={styles.chips} role="group" aria-labelledby={levelLabel}>
          <Button size="sm" aria-pressed={!level} onClick={() => filter({ nivel: "" })}>Todos</Button>
          {data.source.levels.map((entry) => <Button key={entry.slug} size="sm" aria-pressed={level === entry.slug}
            onClick={() => filter({ nivel: level === entry.slug ? "" : entry.slug })}>{entry.name}</Button>)}
        </div>
      </div>
      {subjectCategories.length > 1 ? <div className={styles.chipRow}>
        <span id={categoryLabel} className={styles.chipLabel}>Categoría</span>
        <div className={styles.chips} role="group" aria-labelledby={categoryLabel}>
          <Button size="sm" aria-pressed={!category} onClick={() => filter({ categoria: "" })}>Todas</Button>
          {subjectCategories.map((entry) => <Button key={entry.id} size="sm" aria-pressed={category === entry.id}
            onClick={() => filter({ categoria: category === entry.id ? "" : entry.id })}>{entry.name}</Button>)}
        </div>
      </div> : selectedCategory ? <div className={styles.chips}>
        <Button size="sm" variant="ghost" onClick={() => filter({ categoria: "" })}>Categoría: {selectedCategory.name} <span aria-hidden="true">×</span><span className={styles.visuallyHidden}>(quitar)</span></Button>
      </div> : null}
    </div>
    {selectedCourse ? <Card className={styles.course}>
      <div className={styles.courseHead}><h2>{selectedCourse.name}</h2><CourseStatus course={selectedCourse} /></div>
      <CourseProgress course={selectedCourse} />
      <div className={styles.courseActions}>
        <Link className={buttonClass(selectedCourse.enrolledAt ? "primary" : "secondary", "sm")} to={coursePath(selectedCourse.subjectId)}>Ver mi avance</Link>
        {selectedCourse.enrolledAt ? null : <EnrollButton course={selectedCourse} size="sm" />}
      </div>
    </Card> : null}
    {!filtered && all.length > 0 ? <section aria-labelledby="catalog-courses" className={styles.courses}>
      <h2 id="catalog-courses" className={styles.subjectTitle}>Cursos y materias</h2>
      <ul className={courseStyles.list}>{subjects.map((entry) => {
        const course = courseOf(entry.id);
        const topics = all.filter((topic) => topic.subject.id === entry.id).length;
        const explore = <Button size="sm" onClick={() => filter({ materia: entry.id, categoria: "" })}>Ver temas ({topics})</Button>;
        return course ? <CourseCard key={entry.id} course={course} actions={<>{explore}
          {course.enrolledAt ? <Link className={buttonClass("primary", "sm")} to={coursePath(course.subjectId)}>Mi avance</Link> : <EnrollButton course={course} size="sm" />}</>} />
          : <li key={entry.id} className={cardClass(false, courseStyles.card)}>
            <h3 className={courseStyles.title}>{entry.name}</h3>
            <p className={courseStyles.count}>{topics} {topics === 1 ? "tema" : "temas"} con material publicado</p>
            <div className={courseStyles.actions}>{explore}</div>
          </li>;
      })}</ul>
      <p className={styles.help}>Inscríbete en un curso para verlo en Inicio con tu avance. Para buscar un tema concreto usa el buscador.</p>
    </section> : null}
    {filtered ? <div className={styles.summary}>
      <p role="status">{shown.length} {shown.length === 1 ? "tema" : "temas"} · {count} {count === 1 ? "material publicado" : "materiales publicados"}</p>
      {groups.length > 0 ? <Button size="sm" variant="ghost" onClick={clear}>Quitar filtros</Button> : null}
    </div> : null}
    {all.length === 0 ? <EmptyState title="Todavía no hay material publicado"
      description="Cuando tu docente publique lecturas o unidades aparecerán aquí. Mientras tanto, revisa tus apuntes o repasos."
      action={<Link className={buttonClass("primary")} to="/">Volver al inicio</Link>} />
      : !filtered ? null : groups.length === 0 ? <EmptyState title="No encontramos temas con estos filtros"
        description={text.trim() ? `Nada coincide con «${text.trim()}». Revisa la ortografía, prueba con otra palabra o quita los filtros.` : "Ningún tema tiene material publicado con esta combinación. Prueba con otro nivel o quita los filtros."}
        action={<Button variant="primary" onClick={clear}>Quitar filtros</Button>} />
        : groups.map((group) => <section key={group.subject.id} className={styles.subject} aria-labelledby={`subject-${group.subject.id}`}>
          <h2 id={`subject-${group.subject.id}`} className={styles.subjectTitle}>{group.subject.name}</h2>
          {group.categories.map((section) => <section key={section.category.id} aria-labelledby={`category-${section.category.id}`}>
            <h3 id={`category-${section.category.id}`} className={styles.categoryTitle}>{section.category.name}</h3>
            <ul className={styles.grid}>{section.topics.map((topic) => <TopicCard key={topic.entry.id} headingLevel={4} title={topic.entry.name}
              to={`/temas/${encodeURIComponent(topic.entry.id)}`} state={{ catalogSearch: location.search }}
              eyebrow={materialCount(topic.units)} summary={excerpt(topic.entry.description)}
              levels={(level ? [level] : topic.levels).map((slug) => levelNames.get(slug) ?? slug)}
              note={topic.prerequisites.length ? `Antes se recomienda: ${topic.prerequisites.map((item) => item.name).join(", ")}.` : null} />)}</ul>
          </section>)}
        </section>)}
  </section>;
}

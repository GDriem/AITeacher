import { useEffect, useState } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import { TutorMarkdown } from "../tutor/TutorMarkdown";
import { Badge, PageHeader, Tabs, buttonClass, cardClass } from "../../ui";
import { required, type Schema } from "./client";
import { Busy, Failure } from "./Shared";
import { Assessments } from "./Assessments";
import { topicPath, tutorPath, unitCrumbs, useCatalogLevel, useSourceLevels, useStudyUnit, useTutorAvailability, useUnitTopic, type TutorMode } from "./unitQueries";
import { useMedia } from "./useMedia";
import styles from "./UnitSpace.module.css";

type UnitDocument = Schema["UnitResponse"]["revision"]["document"];
type TabId = "aprender" | "practicar" | "evaluar";
const isTab = (value: string | null): value is TabId => value === "aprender" || value === "practicar" || value === "evaluar";
/** Contexto que el botón del tutor lleva a la conversación: la lectura o el ejercicio que el alumno tiene a la vista. */
interface Visible { mode: TutorMode; id: string; title: string }

const readingAnchor = (id: string) => `lectura-${id}`;
const article = cardClass(false, styles.item);

export function UnitSpace() {
  const unitId = required(useParams().unitId);
  const state: unknown = useLocation().state;
  // La pestaña vive en la URL; `replace` evita que cada cambio de pestaña sume una entrada al historial.
  const [search, setSearch] = useSearchParams();
  const requested = search.get("pestana");
  const availability = useTutorAvailability();
  const unit = useStudyUnit(unitId);
  const topic = useUnitTopic(unit.data?.topicId);
  const sourceLevels = useSourceLevels(unit.data?.revision.document.readingProvenance?.level);
  const catalogLevel = useCatalogLevel(topic.data?.levelId ?? undefined);
  const loaded = unit.data?.revision.document;
  const tabs: TabId[] = !loaded ? [] : loaded.kind === "reading" ? ["aprender"] : ["aprender", ...(loaded.exercises.length ? ["practicar" as const] : []), "evaluar"];
  const tab = isTab(requested) && tabs.includes(requested) ? requested : "aprender";
  const candidates = contextItems(loaded, tab);
  const [current, choose] = useVisible(candidates.map((item) => item.id));
  const visible = candidates.find((item) => item.id === current);
  if (unit.isPending) return <Busy />;
  if (unit.isError) return <Failure error={unit.error} retry={() => void unit.refetch()} />;
  const document = unit.data.revision.document;
  const reading = document.kind === "reading";
  const select = (id: string) => setSearch((previous) => {
    const next = new URLSearchParams(previous);
    if (id === "aprender") next.delete("pestana"); else next.set("pestana", id);
    return next;
  }, { replace: true, state });
  const provenance = document.readingProvenance?.level;
  // El slug solo se muestra si el currículo de origen ya respondió sin ese nivel: mientras carga no hay insignia.
  const level = provenance ? sourceLevels.data?.find((entry) => entry.slug === provenance)?.name ?? (sourceLevels.isPending ? undefined : provenance) : catalogLevel.data?.name;
  const tutor = visible ? tutorPath(unitId, visible.mode, visible.id) : tutorPath(unitId);

  const learn = <Learn document={document} current={current} choose={choose} />;
  return <section className={styles.unit}>
    <PageHeader title={document.title} breadcrumbs={[...unitCrumbs(state, unit.data.topicId, topic.data?.name), { label: document.title }]}
      eyebrow={<span className={styles.meta}>
        {topic.data ? <span>Tema: <Link to={topicPath(unit.data.topicId)} state={state}>{topic.data.name}</Link></span> : null}
        <Badge tone="info">{reading ? "Lectura" : "Unidad"}</Badge>
        {level ? <Badge>{`Nivel: ${level}`}</Badge> : null}
      </span>}
      description={reading ? "Material de lectura. No incluye prácticas ni evaluaciones y no acredita dominio." : undefined}
      actions={<Link className={buttonClass("ghost")} to={topicPath(unit.data.topicId)} state={state}>Volver al tema</Link>} />
    {reading ? learn : <Tabs label="Secciones de la unidad" selectedId={tab} onSelect={select} items={[
      { id: "aprender", label: "Aprender", content: learn },
      ...(document.exercises.length ? [{ id: "practicar", label: "Practicar", content: <Practice document={document} unitId={unitId} state={state}
        tutorEnabled={Boolean(availability.data?.enabled)} /> }] : []),
      { id: "evaluar", label: "Evaluar", content: <Assessments unit={unit.data} /> },
    ]} />}
    {availability.data?.enabled ? <Link className={buttonClass("primary", "md", styles.tutor)} to={tutor} state={state}>
      Preguntar al tutor<span className={styles.context}>{visible ? ` sobre «${visible.title}»` : " sobre esta unidad"}</span>
    </Link> : availability.isError ? <div className={styles.tutorFailure}>
      {/* Un fallo transitorio no deja la unidad sin tutor: el aviso ocupa el sitio del botón y permite reintentar. */}
      <Failure title="No pudimos comprobar el tutor" error={availability.error} retry={() => void availability.refetch()} />
    </div> : null}
  </section>;
}

/**
 * Salta a una lectura sin sumar el ancla al historial: Atrás sigue volviendo a la
 * pantalla anterior. La lectura elegida pasa a ser la actual aunque el scroll no
 * pueda subirla hasta arriba (una última lectura corta).
 */
function jump(id: string, choose: (id: string) => void) {
  const target = document.getElementById(readingAnchor(id));
  target?.scrollIntoView({ block: "start" });
  target?.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
  choose(id);
}

/** Lecturas o ejercicios de la pestaña activa que pueden dar contexto al tutor; Evaluar no aporta ninguno. */
function contextItems(document: UnitDocument | undefined, tab: TabId): Visible[] {
  if (!document || tab === "evaluar") return [];
  if (tab === "practicar") return document.exercises.map((exercise, index) => ({ mode: "practice", id: exercise.id, title: `Ejercicio ${String(index + 1)}` }));
  return document.readings.map((reading) => ({ mode: "reading", id: reading.id, title: reading.title }));
}

function Learn({ document, current, choose }: { document: UnitDocument; current: string | null; choose: (id: string) => void }) {
  const items = document.readings;
  const wide = useMedia("(min-width: 64rem)");
  // El índice solo orienta cuando hay más de una lectura.
  const index = items.length > 1 ? <ol className={styles.indexList}>{items.map((item) => <li key={item.id}>
    <a href={`#${readingAnchor(item.id)}`} aria-current={current === item.id ? "true" : undefined} onClick={(event) => { event.preventDefault(); jump(item.id, choose); }}>{item.title}</a>
  </li>)}</ol> : null;
  return <div className={index ? styles.withIndex : undefined}>
    {index ? wide
      ? <nav className={styles.index} aria-label="Lecturas de la unidad"><h2 className={styles.indexTitle}>Lecturas</h2>{index}</nav>
      : <nav className={styles.index} aria-label="Lecturas de la unidad"><details><summary>Lecturas ({items.length})</summary>{index}</details></nav>
      : null}
    <div className={styles.content}>
      {document.objectives.length ? <section aria-labelledby="unit-objectives">
        <h2 id="unit-objectives">Qué vas a aprender</h2>
        <ul>{document.objectives.map((objective) => <li key={objective.id}>{objective.description}</li>)}</ul>
      </section> : null}
      {document.readings.map((reading) => <article key={reading.id} id={readingAnchor(reading.id)} data-visible={reading.id} className={article}>
        <h2 tabIndex={-1}>{reading.title}</h2>
        <TutorMarkdown>{reading.text}</TutorMarkdown>
        <p className={styles.source}>Fuente: {reading.source}</p>
      </article>)}
    </div>
  </div>;
}

function Practice({ document, unitId, state, tutorEnabled }: { document: UnitDocument; unitId: string; state: unknown; tutorEnabled: boolean }) {
  return <div className={styles.content}>
    {document.exercises.map((exercise, index) => <article key={exercise.id} data-visible={exercise.id} className={article} aria-labelledby={`exercise-${exercise.id}`}>
      <h2 id={`exercise-${exercise.id}`}>Ejercicio {index + 1}</h2>
      <TutorMarkdown>{exercise.prompt}</TutorMarkdown>
      {tutorEnabled ? <Link className={buttonClass()} to={tutorPath(unitId, "practice", exercise.id)} state={state}>Practicar con el tutor</Link> : null}
    </article>)}
  </div>;
}

/** Gestos con los que el alumno desplaza la página por su cuenta. */
const scrollKeys = new Set(["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "]);

/**
 * Elemento `[data-visible]` que el alumno tiene a la vista: el primero, en orden
 * del documento, que asoma en los dos tercios superiores de la pantalla; tras
 * desplazarse hasta el final de la página, el último de ellos, porque ya no puede
 * subir más. Sin ninguno
 * visible (o sin IntersectionObserver) vale null: conversación libre.
 *
 * `choose` fija un elemento como actual (un salto desde el índice) hasta que el
 * alumno vuelve a desplazarse por su cuenta.
 */
function useVisible(ids: string[]) {
  const [observed, setObserved] = useState<string | null>(null);
  const [chosen, setChosen] = useState<{ id: string; key: string } | null>(null);
  const key = ids.join(",");
  useEffect(() => {
    const order = key ? key.split(",") : [];
    if (!order.length || typeof IntersectionObserver === "undefined") return;
    const shown = new Set<string>();
    const pick = () => {
      const visible = order.filter((id) => shown.has(id));
      // Solo cuenta el final si hubo desplazamiento: una pestaña que cabe en pantalla sigue empezando por el primero.
      const bottom = window.scrollY > 0 && window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 1;
      setObserved((bottom ? visible.at(-1) : visible[0]) ?? null);
    };
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const id = entry.target instanceof HTMLElement ? entry.target.dataset.visible ?? "" : "";
        if (entry.isIntersecting) shown.add(id); else shown.delete(id);
      }
      pick();
    }, { rootMargin: "0px 0px -33% 0px" });
    for (const id of order) {
      const node = document.querySelector(`[data-visible="${CSS.escape(id)}"]`);
      if (node) observer.observe(node);
    }
    // Llegar al final no siempre cambia qué elementos cortan la zona observada.
    window.addEventListener("scroll", pick, { passive: true });
    return () => { observer.disconnect(); window.removeEventListener("scroll", pick); };
  }, [key]);
  useEffect(() => {
    if (!chosen) return;
    // El salto se desplaza solo (y con suavidad): se suelta con el siguiente gesto del alumno, no con ese scroll.
    const release = () => setChosen(null);
    const onKey = (event: KeyboardEvent) => { if (scrollKeys.has(event.key)) release(); };
    const events = ["wheel", "touchmove"] as const;
    for (const name of events) window.addEventListener(name, release, { passive: true });
    window.addEventListener("keydown", onKey);
    return () => {
      for (const name of events) window.removeEventListener(name, release);
      window.removeEventListener("keydown", onKey);
    };
  }, [chosen]);
  const current = chosen?.key === key ? chosen.id : observed;
  // Un id de otra pestaña ya no cuenta: el panel saliente se desmontó.
  return [current && ids.includes(current) ? current : null, (id: string) => setChosen({ id, key })] as const;
}

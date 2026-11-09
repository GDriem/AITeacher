import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { formatDateTime } from "./labels";
import { Card, PageHeader, buttonClass } from "../../ui";
import { useProfile } from "./profile";
import { Busy, Failure } from "./Shared";
import { attemptPath, conversationLabel, conversationPath, useAttemptUnit, usePersonalAttempts, usePersonalConversations, usePersonalReviews } from "./personalQueries";
import styles from "./HomeRoute.module.css";

export function HomeRoute() {
  const profile = useProfile();
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  // Las tres consultas siguen siendo independientes y se inician en paralelo.
  const conversations = usePersonalConversations();
  const attempts = usePersonalAttempts();
  const reviews = usePersonalReviews();
  const active = attempts.data?.filter((item) => item.status === "inProgress")
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt)) ?? [];
  const pending = reviews.data?.filter((item) => !item.completedAt)
    .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt)) ?? [];
  const due = pending.find((item) => Date.parse(item.dueAt) <= now);
  const latestConversation = conversations.data?.slice().sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
  const latestAttempt = attempts.data?.slice().sort((a, b) => Date.parse(b.submittedAt ?? b.startedAt) - Date.parse(a.submittedAt ?? a.startedAt))[0];
  const useConversation = latestConversation && (!latestAttempt || Date.parse(latestConversation.createdAt) >= Date.parse(latestAttempt.submittedAt ?? latestAttempt.startedAt));
  const resumeUnit = conversations.isSuccess && attempts.isSuccess && !active.length && !due && !useConversation ? latestAttempt : undefined;
  const definition = useAttemptUnit(resumeUnit?.definitionRevisionId);
  // Resolver la forma completa antes de pintar: conserva la estabilidad de carga de Inicio.
  const loading = conversations.isPending || attempts.isPending || reviews.isPending
    || Boolean(resumeUnit && definition.isPending && definition.fetchStatus !== "idle");
  const firstUse = conversations.isSuccess && attempts.isSuccess && reviews.isSuccess
    && !conversations.data.length && !attempts.data.length && !reviews.data.length;
  const reviewPath = (id: string) => `/repasos?repaso=${encodeURIComponent(id)}`;
  return <section className={styles.screen}>
    <PageHeader title={greeting(profile.displayName)} />
    {loading ? <Busy /> : <>
      <Card className={styles.next}>
        <h2>{firstUse ? "Tu primer recorrido" : "Continuar"}</h2>
        {active[0] ? <>
          <p className={styles.title}>{active[0].title}</p>
          <p>Tienes una evaluación en curso. Retoma el intento que ya iniciaste.</p>
          <Link className={buttonClass("primary")} to={attemptPath(active[0].id)}>Continuar evaluación</Link>
        </> : due ? <>
          <p className={styles.title}>Tienes un repaso pendiente</p>
          <p>Programado para el {formatDateTime(due.dueAt)}. Revisa su evidencia antes de empezar.</p>
          <Link className={buttonClass("primary")} to={reviewPath(due.id)}>Abrir repaso pendiente</Link>
        </> : conversations.isError || attempts.isError ? <>
          <Failure error={conversations.error ?? attempts.error} retry={() => { void conversations.refetch(); void attempts.refetch(); }} />
          <Link className={buttonClass("primary")} to="/catalogo">Explorar el catálogo</Link>
        </> : useConversation ? <>
          <p className={styles.title}>{conversationLabel(latestConversation)}</p>
          <p>Conversación iniciada el {formatDateTime(latestConversation.createdAt)}.</p>
          <Link className={buttonClass("primary")} to={conversationPath(latestConversation)}>Continuar con el tutor</Link>
        </> : resumeUnit ? <>
          <p className={styles.title}>{resumeUnit.title}</p>
          <p>Vuelve a la unidad para consultar tus evaluaciones.</p>
          {definition.isError ? <><Failure error={definition.error} retry={() => void definition.refetch()} /><Link to="/historial">Consultar historial</Link></>
            : definition.data ? <Link className={buttonClass("primary")} to={`/unidades/${encodeURIComponent(definition.data.unitId)}?pestana=evaluar`}>Continuar en la unidad</Link> : <Busy />}
        </> : <>
          <p className={styles.title}>Elige qué quieres aprender</p>
          <p>Busca un tema y abre una lectura o unidad. Cada material indica las actividades disponibles.</p>
          <Link className={buttonClass("primary")} to="/catalogo">Explorar el catálogo</Link>
        </>}
      </Card>
      {!firstUse ? <div className={styles.spaces}>
        <section className={styles.space} aria-labelledby="home-attempts"><h2 id="home-attempts">Evaluaciones en curso</h2>
          {attempts.isError ? <Failure error={attempts.error} retry={() => void attempts.refetch()} /> : active.length ? <>
            <ul>{active.slice(0, 3).map((item) => <li key={item.id}><Link to={attemptPath(item.id)}>Retomar {item.title}</Link></li>)}</ul>
            {active.length > 3 ? <Link to="/historial">Ver las {active.length} evaluaciones en curso en el historial</Link> : null}
          </> : <p>No hay evaluaciones en curso. Puedes consultar las disponibles en cada unidad.</p>}
        </section>
        <section className={styles.space} aria-labelledby="home-reviews"><h2 id="home-reviews">Repasos programados</h2>
          {reviews.isError ? <Failure error={reviews.error} retry={() => void reviews.refetch()} /> : pending.length ? <>
            <ul>{pending.slice(0, 3).map((item) => <li key={item.id}><Link to={reviewPath(item.id)}>Repaso del {formatDateTime(item.dueAt)}</Link></li>)}</ul>
            {pending.length > 3 ? <Link to="/repasos">Ver los {pending.length} repasos pendientes</Link> : null}
          </> : <p>No tienes repasos pendientes. Puedes programarlos a partir de tus evidencias en Repasos.</p>}
        </section>
      </div> : null}
      <nav aria-label="Tus espacios" className={styles.shortcuts}><Link to="/apuntes">Abrir apuntes</Link><Link to="/repasos">Ver repasos</Link><Link to="/historial">Consultar historial</Link></nav>
    </>}
  </section>;
}
function greeting(name: string) { const first = name.trim().split(/\s+/)[0]; return first ? `Hola, ${first}` : "Hola de nuevo"; }

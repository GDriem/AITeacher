import { Link } from "react-router-dom";
import { Card, EmptyState, PageHeader, buttonClass } from "../../ui";
import { useProfile } from "./profile";
import { Busy, Failure } from "./Shared";
import { attemptPath, conversationLabel, conversationPath, useAttemptUnit, usePersonalAttempts, usePersonalConversations, usePersonalReviews } from "./personalQueries";
import styles from "./HomeRoute.module.css";

export function HomeRoute() {
  const profile = useProfile();
  // Consultas independientes en paralelo; sin endpoint agregado.
  const conversations = usePersonalConversations();
  const attempts = usePersonalAttempts();
  const reviews = usePersonalReviews();
  const latestConversation = conversations.data?.slice().sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
  const latestAttempt = attempts.data?.slice().sort((a, b) => Date.parse(b.submittedAt ?? b.startedAt) - Date.parse(a.submittedAt ?? a.startedAt))[0];
  const useConversation = latestConversation && (!latestAttempt || Date.parse(latestConversation.createdAt) >= Date.parse(latestAttempt.submittedAt ?? latestAttempt.startedAt));
  const definition = useAttemptUnit(!useConversation ? latestAttempt?.definitionRevisionId : undefined);
  const pending = reviews.data?.filter((item) => !item.completedAt) ?? [];
  const active = attempts.data?.filter((item) => item.status === "inProgress") ?? [];
  const firstUse = conversations.isSuccess && attempts.isSuccess && !conversations.data.length && !attempts.data.length;
  return <section className={styles.screen}>
    <PageHeader eyebrow="Inicio" title={`Hola, ${firstName(profile.displayName)}`} description="Retoma tu aprendizaje. Los niveles describen el material; no acreditan dominio." />
    {firstUse ? <Card><h2>Tu primer recorrido</h2><ol className={styles.steps}>
      <li><h3>Elige una unidad</h3><p>Explora el catálogo y lee el material a tu ritmo.</p></li>
      <li><h3>Pregunta y guarda tus ideas</h3><p>Conversa con el tutor y guarda los mensajes que quieras repasar.</p></li>
      <li><h3>Practica y vuelve a repasar</h3><p>Entrega una evaluación y programa repasos a partir de tus evidencias.</p></li>
    </ol><Link className={buttonClass("primary")} to="/catalogo">Explorar el catálogo</Link></Card> : <Card>
      <h2>Continuar</h2>
      {conversations.isPending || attempts.isPending ? <Busy /> : conversations.isError || attempts.isError ? <Failure error={conversations.error ?? attempts.error} retry={() => { void conversations.refetch(); void attempts.refetch(); }} />
        : useConversation ? <><p>{conversationLabel(latestConversation)}</p><Link className={buttonClass("primary")} to={conversationPath(latestConversation)}>Continuar con el tutor</Link></>
          : latestAttempt ? <><p>{latestAttempt.title}</p>{definition.isPending ? <Busy /> : definition.isError ? <Failure error={definition.error} retry={() => void definition.refetch()} /> : <Link className={buttonClass("primary")} to={`/unidades/${encodeURIComponent(definition.data.unitId)}?pestana=evaluar`}>Continuar en la unidad</Link>}</> : null}
    </Card>}
    <div className={styles.spaces}>
      <Card className={styles.space}><h2>Repasos programados</h2>
        {reviews.isPending ? <Busy /> : reviews.isError ? <Failure error={reviews.error} retry={() => void reviews.refetch()} /> : pending.length ? <ul>{pending.map((item) => <li key={item.id}><Link to={`/repasos?repaso=${encodeURIComponent(item.id)}`}>Repaso del {new Date(item.dueAt).toLocaleString()}</Link></li>)}</ul> : <EmptyState headingLevel={3} title="No tienes repasos pendientes" description="Después de evaluar lo aprendido, elige una evidencia para programar un repaso." action={<Link to="/repasos">Preparar un repaso</Link>} />}
      </Card>
      <Card className={styles.space}><h2>Evaluaciones en curso</h2>
        {attempts.isPending ? <Busy /> : attempts.isError ? <Failure error={attempts.error} retry={() => void attempts.refetch()} /> : active.length ? <ul>{active.map((item) => <li key={item.id}><Link to={attemptPath(item.id)}>Retomar {item.title}</Link></li>)}</ul> : <EmptyState headingLevel={3} title="No hay evaluaciones en curso" description="Las evaluaciones están en la pestaña Evaluar de cada unidad." action={<Link to="/catalogo">Elegir una unidad</Link>} />}
      </Card>
    </div>
    <nav aria-label="Tus espacios" className={styles.shortcuts}><Link to="/apuntes">Abrir apuntes</Link><Link to="/repasos">Ver repasos</Link><Link to="/historial">Consultar historial</Link></nav>
  </section>;
}
function firstName(name: string) { return name.trim() === "" ? "de nuevo" : (name.trim().split(/\s+/)[0] ?? "de nuevo"); }

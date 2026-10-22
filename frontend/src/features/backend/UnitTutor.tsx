import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { EmptyState, PageHeader } from "../../ui";
import { required } from "./client";
import { Busy, Failure } from "./Shared";
import { Tutor } from "./Tutor";
import { tutorPath, unitCrumbs, useStudyUnit, useTutorAvailability, useTutorConversation, useUnitTopic, type TutorMode } from "./unitQueries";

const modes: Record<TutorMode, string> = { chat: "Conversación libre sobre la unidad", reading: "Consulta sobre una lectura", practice: "Práctica guiada" };
const isMode = (value: string | null): value is TutorMode => value === "chat" || value === "reading" || value === "practice";

/** Tutor de una unidad en su propia ruta; la conversación abierta vive en la URL. */
export function UnitTutor() {
  const params = useParams();
  const unitId = required(params.unitId);
  const conversationId = params.conversationId ?? null;
  const [search] = useSearchParams();
  const state: unknown = useLocation().state;
  const navigate = useNavigate();
  const requestedMode = search.get("modo");
  const mode: TutorMode = isMode(requestedMode) ? requestedMode : "chat";
  const activityId = search.get("actividad") ?? undefined;
  const unit = useStudyUnit(unitId);
  const availability = useTutorAvailability();
  const topic = useUnitTopic(unit.data?.topicId);
  // El encabezado describe la conversación abierta, aunque la URL traiga otro `modo`.
  const conversation = useTutorConversation(conversationId);
  if (unit.isPending || availability.isPending) return <Busy />;
  if (unit.isError) return <Failure error={unit.error} retry={() => void unit.refetch()} />;
  if (availability.isError) return <Failure error={availability.error} retry={() => void availability.refetch()} />;
  const title = unit.data.revision.document.title;
  // La miga vuelve a la pestaña de origen: la práctica guiada sale de Practicar.
  return <section>
    <PageHeader title={`Tutor: ${title}`} eyebrow={modes[conversation.data?.mode ?? mode]}
      breadcrumbs={[...unitCrumbs(state, unit.data.topicId, topic.data?.name), { label: title, to: `/unidades/${encodeURIComponent(unitId)}${mode === "practice" ? "?pestana=practicar" : ""}`, state }, { label: "Tutor" }]} />
    {availability.data.enabled
      // Cada conversación monta su propio Tutor: cambiarla descarta solicitudes en memoria, pero el turno pendiente se recupera del servidor.
      ? <Tutor key={conversationId ?? "nueva"} unit={unit.data} mode={mode} activityId={activityId} conversationId={conversationId}
        // Desde el tutor vacío, la conversación nueva reemplaza esa entrada para que Atrás vuelva a la unidad.
        openConversation={(id) => void navigate(tutorPath(unitId, mode, activityId, id ?? undefined), { state, replace: conversationId === null })} />
      : <EmptyState title="El tutor no está disponible" description="El tutor de IA todavía no está configurado en esta beta. Puedes leer el material completo." />}
  </section>;
}

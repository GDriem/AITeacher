import type { ConversationDetail, ConversationListResponse } from "../../features/sessions/sessionsApi";

export const sessionSummaries = [
  {
    id: "session-vectors",
    title: "Vectores semánticos",
    topic: "embeddings",
    message_count: 6,
    pending_quiz: { question: "¿Qué representa un embedding?", attempt: 1 },
    created_at: "2026-08-09T15:00:00Z",
    updated_at: "2026-08-12T15:00:00Z",
    archived_at: null,
  },
  {
    id: "session-agents",
    title: "Agentes y herramientas",
    topic: "agents",
    message_count: 4,
    pending_quiz: { question: "¿Qué puede hacer un agente?", attempt: 2 },
    created_at: "2026-08-08T15:00:00Z",
    updated_at: "2026-08-11T15:00:00Z",
    archived_at: null,
  },
  {
    id: "session-archived",
    title: "Introducción a IA",
    topic: "artificial-intelligence",
    message_count: 2,
    pending_quiz: { question: "¿Qué es IA?", attempt: 1 },
    created_at: "2026-08-01T15:00:00Z",
    updated_at: "2026-08-02T15:00:00Z",
    archived_at: "2026-08-03T15:00:00Z",
  },
] satisfies ConversationListResponse["sessions"];

export const sessionsFixture = {
  sessions: sessionSummaries,
  retention_days: 365,
} satisfies ConversationListResponse;

export function sessionDetail(sessionId: string): ConversationDetail {
  const session = sessionSummaries.find((item) => item.id === sessionId) ?? sessionSummaries[0];
  if (!session) throw new Error("La fixture requiere al menos una conversación.");
  return {
    ...session,
    student_id: "student-test",
    messages: [
      {
        id: `${session.id}-user-1`,
        role: "user",
        label: "Tú",
        content: "Explícame los embeddings",
        sources: [],
        note: "",
        created_at: "2026-08-12T15:00:00Z",
      },
      {
        id: `${session.id}-assistant-1`,
        role: "assistant",
        label: "Tutor Agent",
        content: "## Idea central\n\nUn **embedding** representa significado con números.\n\n<script>window.__xss = true</script>\n\n[Enlace bloqueado](javascript:alert(1))",
        sources: ["Currículo AITeacher · Embeddings"],
        note: "Continúa con un ejemplo propio.",
        created_at: "2026-08-12T15:00:01Z",
      },
    ],
    pending_practice: null,
  };
}

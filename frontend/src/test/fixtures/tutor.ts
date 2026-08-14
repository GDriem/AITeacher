import type { ChatResponse } from "../../features/tutor/tutorApi";
import { catalogFixture } from "./catalog";

export const chatResponseFixture = {
  correlation_id: "correlation-tutor-1",
  session_id: "session-vectors",
  topic: "embeddings",
  level: "beginner",
  answer: "## Una representación útil\n\nUn **embedding** convierte significado en números.\n\n- conserva relaciones\n- permite comparar similitud\n\n[Referencia segura](https://example.com/embeddings)",
  sources: ["Currículo AITeacher · Embeddings"],
  progress: catalogFixture.progress,
  quiz: { question: "¿Qué conserva un embedding?" },
  quiz_attempt: 1,
  trace: [
    {
      kind: "user_message",
      actor: "user",
      action: "send_message",
      summary: "El estudiante envió una pregunta.",
      duration_ms: 0,
      success: true,
      timestamp: "2026-08-13T16:00:00Z",
    },
    {
      kind: "response",
      actor: "orchestrator",
      action: "final_response",
      summary: "La explicación quedó preparada.",
      duration_ms: 18,
      success: true,
      timestamp: "2026-08-13T16:00:01Z",
    },
  ],
} satisfies ChatResponse;

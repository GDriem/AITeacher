import type { EvaluationResponse, StudentProgress } from "../../features/evaluation/evaluationApi";
import type { PracticeEvaluationResponse, PracticeExercise, PracticeStartResponse } from "../../features/practice/practiceApi";

export const learningProgressFixture = {
  student_id: "student-test",
  level: "intermediate",
  studied_topics: ["embeddings"],
  recommendations: ["Practica similitud vectorial con un caso propio."],
  topic_progress: [
    {
      topic: "embeddings",
      attempts: 2,
      best_score: 82,
      level: "intermediate",
      mastery_status: "developing",
      mastered_concepts: ["representación numérica"],
      pending_concepts: ["similitud vectorial"],
      concepts: [],
      updated_at: "2026-08-14T16:00:00Z",
    },
  ],
} satisfies StudentProgress;

export const rubricFixture = {
  precision: { score: 3, explanation: "Define la representación con vocabulario preciso." },
  comprehension: { score: 3, explanation: "Relaciona significado y distancia." },
  application: { score: 2, explanation: "Falta aplicar la similitud a un caso concreto." },
  clarity: { score: 4, explanation: "La explicación se entiende y mantiene el hilo." },
  evaluation_mode: "hybrid_model",
} as const;

export const evaluationFixture = {
  correlation_id: "evaluation-correlation-1",
  session_id: "session-vectors",
  topic: "embeddings",
  score: 82,
  status: "progressing",
  attempt: 1,
  feedback: "Comprendes la representación; conecta ahora la distancia con la similitud.",
  rubric: rubricFixture,
  result_explanation: "La respuesta cubrió tres de cuatro dimensiones.",
  strengths: ["Distingues texto y vector."],
  improvements: ["Explica cómo una distancia menor indica mayor similitud."],
  practice_concepts: ["similitud vectorial"],
  learning_context: "Usa un ejemplo de búsqueda semántica para fijar la relación.",
  recommendation: "Continúa con una aplicación breve.",
  next_quiz: { question: "¿Cómo usarías la similitud para recuperar un documento?" },
  progress: learningProgressFixture,
  trace: [
    {
      kind: "response",
      actor: "evaluator",
      action: "evaluate_answer",
      summary: "La respuesta se comparó con la rúbrica pública.",
      duration_ms: 24,
      success: true,
      timestamp: "2026-08-14T16:00:00Z",
    },
  ],
} satisfies EvaluationResponse;

export const practiceExerciseFixture = {
  id: "embeddings-practice-1",
  topic: "embeddings",
  round: 1,
  based_on_attempts: 1,
  difficulty: "foundation",
  focus_concepts: ["similitud vectorial"],
  title: "Compara dos intenciones",
  prompt: "Explica cuál de dos consultas debería quedar más cerca de un documento sobre vectores.",
  hint: "Piensa en significado, no sólo en palabras repetidas.",
} satisfies PracticeExercise;

export const nextPracticeExerciseFixture = {
  ...practiceExerciseFixture,
  id: "embeddings-practice-2",
  round: 2,
  based_on_attempts: 2,
  difficulty: "application",
  title: "Diseña una búsqueda semántica",
} satisfies PracticeExercise;

export const practiceStartFixture = {
  session_id: "session-vectors",
  exercise: practiceExerciseFixture,
  main_quiz: evaluationFixture.next_quiz,
} satisfies PracticeStartResponse;

export const practiceEvaluationFixture = {
  session_id: "session-vectors",
  exercise: practiceExerciseFixture,
  score: 88,
  status: "progressing",
  feedback: "Aplicaste la relación entre cercanía y significado.",
  rubric: rubricFixture,
  next_exercise: nextPracticeExerciseFixture,
  main_quiz: evaluationFixture.next_quiz,
  progress: {
    ...learningProgressFixture,
    topic_progress: learningProgressFixture.topic_progress.map((topic) => ({ ...topic, attempts: 3, best_score: 88 })),
  },
} satisfies PracticeEvaluationResponse;

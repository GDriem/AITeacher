import type { AuthoredLesson, LearningContent } from "../../features/authoring/authoringApi";

export const authoredContentFixture: LearningContent = {
  id: "embeddings-evidence",
  topic: "embeddings",
  title: "Embeddings con evidencia",
  level: "beginner",
  text: "Los embeddings representan significado mediante vectores y permiten comparar elementos por similitud con evidencia verificable.",
  source: "Equipo curricular AITeacher",
  keywords: ["vectores", "similitud"],
};

export const publishedLessonFixture: AuthoredLesson = {
  id: authoredContentFixture.id,
  draft: authoredContentFixture,
  published_content: authoredContentFixture,
  published: true,
  version: 2,
  created_at: "2026-08-10T14:00:00Z",
  updated_at: "2026-08-11T14:00:00Z",
  revisions: [
    {
      version: 1,
      action: "created",
      author: "Ana Editora",
      draft: authoredContentFixture,
      published: false,
      published_content: null,
      created_at: "2026-08-10T14:00:00Z",
      reverted_from: null,
    },
    {
      version: 2,
      action: "published",
      author: "Ana Editora",
      draft: authoredContentFixture,
      published: true,
      published_content: authoredContentFixture,
      created_at: "2026-08-11T14:00:00Z",
      reverted_from: null,
    },
  ],
};

export const draftLessonFixture: AuthoredLesson = {
  id: "ai-introduction-notes",
  draft: {
    id: "ai-introduction-notes",
    topic: "artificial-intelligence",
    title: "Notas para introducir IA",
    level: "beginner",
    text: "La inteligencia artificial reúne técnicas para resolver tareas mediante modelos, datos y criterios de evaluación explícitos.",
    source: "Guía docente AITeacher",
    keywords: ["modelos", "evaluación"],
  },
  published_content: null,
  published: false,
  version: 1,
  created_at: "2026-08-12T14:00:00Z",
  updated_at: "2026-08-12T14:00:00Z",
  revisions: [
    {
      version: 1,
      action: "created",
      author: "Ana Editora",
      draft: {
        id: "ai-introduction-notes",
        topic: "artificial-intelligence",
        title: "Notas para introducir IA",
        level: "beginner",
        text: "La inteligencia artificial reúne técnicas para resolver tareas mediante modelos, datos y criterios de evaluación explícitos.",
        source: "Guía docente AITeacher",
        keywords: ["modelos", "evaluación"],
      },
      published: false,
      published_content: null,
      created_at: "2026-08-12T14:00:00Z",
      reverted_from: null,
    },
  ],
};

export const authoringLessonsFixture = [draftLessonFixture, publishedLessonFixture];

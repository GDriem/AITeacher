import type { AuthoredLesson, LearningContent, LearningLevel, Topic } from "./authoringApi";

export interface LessonFormValues {
  id: string;
  topic: Topic | "";
  title: string;
  level: LearningLevel;
  text: string;
  source: string;
  keywords: string;
}

export function lessonFormValues(lesson: AuthoredLesson | null): LessonFormValues {
  if (!lesson) {
    return {
      id: "",
      topic: "",
      title: "",
      level: "beginner",
      text: "",
      source: "",
      keywords: "",
    };
  }
  return { ...lesson.draft, keywords: (lesson.draft.keywords ?? []).join(", ") };
}

export function lessonContent(values: LessonFormValues): { content: LearningContent | null; error: string | null } {
  const keywords = values.keywords.split(",").map((keyword) => keyword.trim()).filter(Boolean);
  if (!values.topic) return { content: null, error: "Selecciona el tema de la lección." };
  if (keywords.length > 20) return { content: null, error: "Usa como máximo 20 palabras clave." };
  if (keywords.some((keyword) => keyword.length < 2 || keyword.length > 60)) {
    return { content: null, error: "Cada palabra clave debe tener entre 2 y 60 caracteres." };
  }
  const normalized = keywords.map((keyword) => keyword.toLocaleLowerCase("es"));
  if (new Set(normalized).size !== normalized.length) {
    return { content: null, error: "Las palabras clave no pueden repetirse." };
  }
  return {
    content: {
      id: values.id.trim(),
      topic: values.topic,
      title: values.title.trim(),
      level: values.level,
      text: values.text.trim(),
      source: values.source.trim(),
      keywords,
    },
    error: null,
  };
}

export function sameLessonContent(left: LearningContent, right: LearningContent) {
  return JSON.stringify(left) === JSON.stringify(right);
}

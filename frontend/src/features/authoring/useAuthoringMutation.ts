import { useMutation, useQueryClient } from "@tanstack/react-query";

import { topicCatalogKey } from "../catalog/catalogQueries";
import {
  createAuthoredLesson,
  publishAuthoredLesson,
  revertAuthoredLesson,
  unpublishAuthoredLesson,
  updateAuthoredLesson,
  type AuthoredLesson,
  type LearningContent,
} from "./authoringApi";

type AuthoringCommand =
  | { type: "save"; content: LearningContent; lesson: AuthoredLesson | null }
  | { type: "publish"; content: LearningContent; lesson: AuthoredLesson | null }
  | { type: "unpublish"; lesson: AuthoredLesson }
  | { type: "revert"; lesson: AuthoredLesson; version: number };

export function useAuthoringMutation({
  author,
  token,
  studentId,
  onUpdated,
}: {
  author: string;
  token: string;
  studentId: string;
  onUpdated: (lesson: AuthoredLesson) => void;
}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (command: AuthoringCommand) => {
      if (command.type === "save") return saveDraft(token, author, command.lesson, command.content);
      if (command.type === "publish") {
        const saved = await saveDraft(token, author, command.lesson, command.content, true);
        return publishAuthoredLesson(token, author, saved.id);
      }
      if (command.type === "unpublish") return unpublishAuthoredLesson(token, author, command.lesson.id);
      return revertAuthoredLesson(token, author, command.lesson.id, command.version);
    },
    onSuccess: async (lesson, command) => {
      onUpdated(lesson);
      if (command.type !== "save") {
        await queryClient.invalidateQueries({ queryKey: topicCatalogKey(studentId) });
      }
    },
  });
}

async function saveDraft(
  token: string,
  author: string,
  lesson: AuthoredLesson | null,
  content: LearningContent,
  skipUnchanged = false,
) {
  if (lesson && skipUnchanged && JSON.stringify(lesson.draft) === JSON.stringify(content)) return lesson;
  return lesson
    ? updateAuthoredLesson(token, author, lesson.id, content)
    : createAuthoredLesson(token, author, content);
}

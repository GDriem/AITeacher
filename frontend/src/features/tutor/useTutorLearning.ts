import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { topicCatalogKey } from "../catalog/catalogQueries";
import type { EvaluationResponse, StudentProgress } from "../evaluation/evaluationApi";
import { sessionDetailKey, sessionListKey } from "../sessions/sessionsQueries";
import type { TraceEvent } from "./tutorApi";

interface Options {
  studentId: string;
  activeSessionId: string | null;
  initialProgress: StudentProgress | null;
  onTrace: (events: TraceEvent[]) => void;
}

export function useTutorLearning({ studentId, activeSessionId, initialProgress, onTrace }: Options) {
  const queryClient = useQueryClient();
  const [learningBusy, setLearningBusy] = useState(false);
  const [latestProgress, setLatestProgress] = useState<StudentProgress | null>(initialProgress);

  const refreshLearningData = async (sessionId: string) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: sessionListKey(studentId) }),
      queryClient.invalidateQueries({ queryKey: sessionDetailKey(studentId, sessionId) }),
      queryClient.invalidateQueries({ queryKey: topicCatalogKey(studentId) }),
    ]);
  };
  const completeEvaluation = async (result: EvaluationResponse) => {
    onTrace(result.trace);
    setLatestProgress(result.progress);
    await refreshLearningData(result.session_id);
  };
  const completePractice = async (progress: StudentProgress) => {
    setLatestProgress(progress);
    if (activeSessionId) await refreshLearningData(activeSessionId);
  };

  return {
    learningBusy,
    latestProgress,
    setLearningBusy,
    setLatestProgress,
    refreshLearningData,
    completeEvaluation,
    completePractice,
  };
}

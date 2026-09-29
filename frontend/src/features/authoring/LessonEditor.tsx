import { useEffect, useRef, useState, type ReactNode, type SyntheticEvent } from "react";

import { ApiError } from "../../api/ApiError";
import { ActionConfirmation } from "./ActionConfirmation";
import type { AuthoredLesson, LearningContent, LearningLevel, Topic } from "./authoringApi";
import { authoringLevelLabel } from "./authoringLabels";
import { lessonContent, lessonFormValues, type LessonFormValues } from "./lessonForm";
import { LessonHistory } from "./LessonHistory";
import { LessonPreview } from "./LessonPreview";
import { useAuthoringMutation } from "./useAuthoringMutation";
import styles from "./AuthoringScreen.module.css";

interface TopicOption { topic: Topic; title: string }
type Confirmation = { type: "unpublish" } | { type: "revert"; version: number };

export function LessonEditor({
  lesson,
  topics,
  author,
  token,
  studentId,
  onUpdated,
}: {
  lesson: AuthoredLesson | null;
  topics: TopicOption[];
  author: string;
  token: string;
  studentId: string;
  onUpdated: (lesson: AuthoredLesson) => void;
}) {
  const [values, setValues] = useState<LessonFormValues>(() => lessonFormValues(lesson));
  const [preview, setPreview] = useState<LearningContent | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const returnFocusRef = useRef<HTMLButtonElement | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const mutation = useAuthoringMutation({
    author,
    token,
    studentId,
    onUpdated: (updated) => {
      setValues(lessonFormValues(updated));
      setConfirmation(null);
      setNotice(`${updated.published ? "Lección publicada" : "Borrador actualizado"}. Versión ${String(updated.version)}.`);
      onUpdated(updated);
    },
  });
  const pending = mutation.isPending;
  const topicTitle = topics.find((item) => item.topic === preview?.topic)?.title ?? preview?.topic ?? "Tema";

  const validatedContent = () => {
    setLocalError(null);
    setNotice(null);
    mutation.reset();
    if (!formRef.current?.reportValidity()) return null;
    const result = lessonContent(values);
    if (result.error) setLocalError(result.error);
    return result.content;
  };

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  const save = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const content = validatedContent();
    if (content) mutation.mutate({ type: "save", content, lesson });
  };

  const publish = () => {
    const content = validatedContent();
    if (content) mutation.mutate({ type: "publish", content, lesson });
  };

  const requestConfirmation = (next: Confirmation, trigger: HTMLButtonElement) => {
    returnFocusRef.current = trigger;
    setConfirmation(next);
  };

  const cancelConfirmation = () => {
    setConfirmation(null);
    requestAnimationFrame(() => returnFocusRef.current?.focus());
  };

  const confirmAction = () => {
    if (!lesson || !confirmation) return;
    mutation.mutate(confirmation.type === "unpublish"
      ? { type: "unpublish", lesson }
      : { type: "revert", lesson, version: confirmation.version });
  };

  const update = <K extends keyof LessonFormValues>(key: K, value: LessonFormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    setNotice(null);
  };

  return (
    <section className={styles.editor} aria-labelledby="lesson-editor-title">
      <form ref={formRef} onSubmit={save} aria-busy={pending}>
        <header className={styles.editorHeading}>
          <div>
            <p className={styles.eyebrow}>Borrador estructurado</p>
            <h2 ref={titleRef} id="lesson-editor-title" tabIndex={-1}>{lesson?.draft.title ?? "Nueva lección"}</h2>
          </div>
          <span className={styles.lessonStatus} data-published={lesson?.published ?? false}>
            {lesson ? `${lesson.published ? "Publicada" : "Borrador"} · v${String(lesson.version)}` : "Sin guardar"}
          </span>
        </header>

        <div className={styles.fields}>
          <Field label="Identificador">
            <input required minLength={3} maxLength={100} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="rag-ranking-basics" disabled={Boolean(lesson) || pending} value={values.id} onChange={(event) => update("id", event.target.value)} />
          </Field>
          <Field label="Tema">
            <select required disabled={pending || topics.length === 0} value={values.topic} onChange={(event) => update("topic", event.target.value as Topic)}>
              <option value="">Selecciona un tema</option>
              {topics.map((item) => <option key={item.topic} value={item.topic}>{item.title}</option>)}
            </select>
          </Field>
          <Field label="Nivel">
            <select disabled={pending} value={values.level} onChange={(event) => update("level", event.target.value as LearningLevel)}>
              {(["beginner", "intermediate", "advanced"] as const).map((level) => <option key={level} value={level}>{authoringLevelLabel(level)}</option>)}
            </select>
          </Field>
          <Field label="Título" wide><input required minLength={3} maxLength={120} disabled={pending} value={values.title} onChange={(event) => update("title", event.target.value)} /></Field>
          <Field label="Fuente" wide><input required minLength={3} maxLength={200} placeholder="Documento o URL verificable" disabled={pending} value={values.source} onChange={(event) => update("source", event.target.value)} /></Field>
          <Field label="Palabras clave" hint="Separadas por comas; máximo 20." wide><input disabled={pending} placeholder="recuperación, ranking, evidencia" value={values.keywords} onChange={(event) => update("keywords", event.target.value)} /></Field>
          <Field label="Contenido" hint={`${String(values.text.length)} de 2,000 caracteres`} wide><textarea required rows={10} minLength={40} maxLength={2000} disabled={pending} value={values.text} onChange={(event) => update("text", event.target.value)} /></Field>
        </div>

        {localError || mutation.isError ? <p className={styles.formError} role="alert">{localError ?? errorCopy(mutation.error)}</p> : null}
        {notice ? <p className={styles.formNotice} role="status">{notice}</p> : null}
        <div className={styles.editorActions}>
          <button type="button" disabled={pending} onClick={() => { const content = validatedContent(); if (content) setPreview(content); }}>Vista previa</button>
          <button type="submit" disabled={pending}>{pending ? "Guardando cambio…" : "Guardar borrador"}</button>
          <button className={styles.primaryButton} type="button" disabled={pending} onClick={publish}>{lesson ? "Publicar cambios" : "Guardar y publicar"}</button>
          <button type="button" disabled={pending || !lesson?.published} onClick={(event) => requestConfirmation({ type: "unpublish" }, event.currentTarget)}>Despublicar</button>
        </div>
      </form>

      {confirmation ? (
        <ActionConfirmation
          title={confirmation.type === "unpublish" ? "¿Retirar esta lección del catálogo?" : `¿Recuperar la versión ${String(confirmation.version)}?`}
          detail={confirmation.type === "unpublish" ? "El borrador y su historial se conservan, pero el contenido dejará de estar disponible para estudiantes." : "Se creará una versión nueva con el contenido y estado público de esa revisión."}
          confirmLabel={confirmation.type === "unpublish" ? "Sí, despublicar" : `Sí, revertir a v${String(confirmation.version)}`}
          pending={pending}
          onConfirm={confirmAction}
          onCancel={cancelConfirmation}
        />
      ) : null}
      {preview ? <LessonPreview content={preview} topicTitle={topicTitle} /> : null}
      {lesson ? <LessonHistory lesson={lesson} disabled={pending} onRequestRevert={(version, trigger) => requestConfirmation({ type: "revert", version }, trigger)} /> : null}
    </section>
  );
}

function Field({ label, hint, wide = false, children }: { label: string; hint?: string; wide?: boolean; children: ReactNode }) {
  return <label className={wide ? styles.wideField : undefined}><span>{label}</span>{children}{hint ? <small>{hint}</small> : null}</label>;
}

function errorCopy(error: Error | null) {
  return error instanceof ApiError ? error.message : "No pudimos completar el cambio. Intenta nuevamente.";
}

export default LessonEditor;

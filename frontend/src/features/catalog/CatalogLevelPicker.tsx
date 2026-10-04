import { useId, useState } from "react";

import type { LearningLevel } from "./catalogApi";
import { learningLevels } from "./catalogFilterState";
import { levelLabel } from "./catalogLabels";
import styles from "./CatalogScreen.module.css";

const descriptions: Record<LearningLevel, string> = {
  beginner: "Conceptos y ejemplos paso a paso",
  intermediate: "Aplicación y práctica con contexto",
  advanced: "Mayor profundidad y retos",
};

export function CatalogLevelPicker({ level, available, onChange }: {
  level: LearningLevel | "";
  available: LearningLevel[];
  onChange: (level: LearningLevel | "") => void;
}) {
  const id = useId();
  const [expanded, setExpanded] = useState(false);
  const choices: (LearningLevel | "")[] = ["", ...learningLevels];
  const selectedIndex = choices.indexOf(level);
  const enabledIndexes = choices.flatMap((value, index) => !value || available.includes(value) ? [index] : []);
  const selected = level || "adaptive";
  const description = level ? descriptions[level] : "Según tu progreso en cada tema";
  const selectIndex = (index: number) => {
    const value = choices[index];
    if (value !== undefined) onChange(value);
  };
  return (
    <fieldset className={styles.levelPicker} aria-describedby={`${id}-hint`}>
      <legend id={`${id}-title`}>¿A qué nivel quieres aprender?</legend>
      <p id={`${id}-hint`}>El nivel se aplica a los temas y a las explicaciones del tutor.</p>
      <div className={styles.levelSummary}>
        <p id={`${id}-description`} className={styles.levelDescription} data-level={selected} aria-live="polite">
          <span aria-hidden="true" /><span><strong>{level ? levelLabel(level) : "Adaptado a ti"}</strong>{" "}<span className={styles.levelSummaryHint}>{description}</span></span>
        </p>
        <button type="button" className={styles.levelToggle} aria-expanded={expanded}
          aria-controls={`${id}-controls`} onClick={() => setExpanded((value) => !value)}>
          {expanded ? "Ocultar selector" : level ? "Cambiar nivel" : "Elegir nivel"}
          <span aria-hidden="true">{expanded ? "−" : "+"}</span>
        </button>
      </div>
      <div id={`${id}-controls`} hidden={!expanded}>
        <div className={styles.levelThermometer}>
          <div className={styles.levelSlider} data-selection={selected} data-level={selected}>
            <div className={styles.levelTrack} aria-hidden="true"><span /></div>
            <input type="range" min={0} max={3} step={1} value={selectedIndex}
              aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}
              aria-orientation="vertical" aria-valuetext={level ? levelLabel(level) : "Adaptado a ti"}
              onChange={(event) => {
                const requested = Number(event.currentTarget.value);
                const closest = enabledIndexes.reduce((best, index) =>
                  Math.abs(index - requested) < Math.abs(best - requested) ? index : best);
                event.currentTarget.value = String(closest);
                selectIndex(closest);
              }}
              onKeyDown={(event) => {
                const forward = ["ArrowRight", "ArrowUp", "PageUp"].includes(event.key);
                const backward = ["ArrowLeft", "ArrowDown", "PageDown"].includes(event.key);
                if (!forward && !backward && event.key !== "Home" && event.key !== "End") return;
                event.preventDefault();
                const next = event.key === "Home" ? enabledIndexes[0]
                  : event.key === "End" ? enabledIndexes[enabledIndexes.length - 1]
                  : forward ? enabledIndexes.find((index) => index > selectedIndex)
                  : enabledIndexes.findLast((index) => index < selectedIndex);
                if (next !== undefined) selectIndex(next);
              }} />
          </div>
          <div className={styles.levelStops}>
            {choices.map((value) => (
              <button type="button" key={value || "adaptive"} className={styles.levelStop} data-level={value || "adaptive"}
                aria-label={`${value ? levelLabel(value) : "Adaptado a ti"}${value && !available.includes(value) ? ": Sin temas" : ""}`}
                aria-pressed={level === value} disabled={Boolean(value && !available.includes(value))}
                onClick={() => onChange(value)}>
                <span aria-hidden="true">{value ? levelLabel(value) : "Adaptado a ti"}</span>
                {value && !available.includes(value) ? <small>Sin temas</small> : null}
              </button>
            ))}
          </div>
        </div>
        <p className={styles.levelHelp}>Desliza hacia arriba para aumentar el nivel o pulsa una opción.</p>
      </div>
    </fieldset>
  );
}

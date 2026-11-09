import { useState } from "react";
import { Tabs } from "../../ui";
import { EvaluationList } from "./EvaluationList";
import { Learn, Practice } from "./UnitPresentation";
import type { Document } from "./authoringModel";
export function UnitPreview({ document }: { document: Document }) {
  const [tab, setTab] = useState("aprender");
  const [current, setCurrent] = useState<string | null>(null);
  const learn = <Learn document={document} current={current} choose={setCurrent} />;
  return <section aria-label="Vista previa como alumno"><h2>{document.title || "Unidad sin título"}</h2><p>Vista previa del borrador actual, incluidos los cambios sin guardar. El alumno verá la revisión publicada. Los criterios privados quedan fuera de esta vista.</p>
    {document.kind === "reading" ? learn : <Tabs label="Secciones de la unidad" selectedId={tab} onSelect={setTab} items={[
      { id: "aprender", label: "Aprender", content: learn },
      { id: "practicar", label: "Practicar", content: <Practice document={document} unitId="" state={null} tutorEnabled={false} /> },
      { id: "evaluar", label: "Evaluar", content: <><EvaluationList items={[]} /><p>Las evaluaciones entregables se crean para una revisión publicada. Esta vista previa no inicia intentos.</p></> },
    ]} />}
  </section>;
}

import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { backend, result } from "./client";
import { Busy, Failure } from "./Shared";
import { buttonClass } from "../../ui";
import { UnitEditor } from "./UnitEditor";
import { Publication } from "./Publication";
import { authorPages, authorPath, useAuthorUnit } from "./authorQueries";
export function AuthorUnitRoute() {
  const { unitId } = useParams();
  const [dirty, setDirty] = useState(false);
  const unit = useAuthorUnit(unitId);
  const queries = useQueryClient();
  const navigate = useNavigate();
  const topics = useQuery({ queryKey: ["author-topics", "all"], queryFn: ({ signal }) => authorPages((offset) => backend.GET("/api/catalog/topics", { signal, params: { query: { offset, limit: 100 } } }).then(result)) });
  if (topics.isPending || (unitId && unit.isPending)) return <Busy />;
  if (topics.isError) return <Failure error={topics.error} retry={() => void topics.refetch()} />;
  if (unitId && unit.isError) return <Failure error={unit.error} retry={() => void unit.refetch()} />;
  return <><UnitEditor key={unitId ?? "nueva"} unit={unit.data} topics={topics.data} onDirty={setDirty} saved={(value) => {
    queries.setQueryData(["author-unit", value.id], value);
    if (!unitId) void navigate(`${authorPath(value.id)}?paso=revision`, { replace: true, state: { savedUnit: value.id } });
  }} />{unit.data ? <Publication unit={unit.data} dirty={dirty} /> : null}
    {unit.data?.publishedRevisionId && unit.data.revision.document.kind !== "reading" ? <Link className={buttonClass()} to={`${authorPath(unit.data.id)}/evaluaciones`}>Editar evaluaciones</Link> : null}
  </>;
}

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Button, EmptyState, PageHeader, buttonClass } from "../../ui";
import { ApiError } from "../../api/ApiError";
import { backend, result, type Schema } from "./client";
import { Busy, Failure } from "./Shared";
import { useCertificates, verificationPath } from "./courseQueries";
import styles from "./DiplomaRoute.module.css";

const longDate = new Intl.DateTimeFormat("es", { dateStyle: "long" });
type Printed = Pick<Schema["Certificate"], "code" | "studentName" | "courseName" | "unitCount" | "issuedAt"> & { averagePercent?: number };

/** El diploma tal como se imprime: sólo datos que también muestra la verificación pública, más el promedio para su dueño. */
function Diploma({ certificate }: { certificate: Printed }) {
  const verification = `${window.location.origin}${verificationPath(certificate.code)}`;
  return <article className={styles.diploma} aria-label={`Diploma de ${certificate.studentName}`}>
    <p className={styles.brand}>AITeacher</p>
    <p className={styles.kicker}>Diploma de finalización</p>
    <p className={styles.lead}>Se otorga a</p>
    <p className={styles.name}>{certificate.studentName}</p>
    <p className={styles.lead}>por completar el curso</p>
    <p className={styles.course}>{certificate.courseName}</p>
    <p className={styles.detail}>{certificate.unitCount} {certificate.unitCount === 1 ? "unidad aprobada" : "unidades aprobadas"}
      {certificate.averagePercent != null ? ` · promedio ${String(certificate.averagePercent)} %` : ""} · {longDate.format(new Date(certificate.issuedAt))}</p>
    <p className={styles.code}>Código de verificación <strong>{certificate.code}</strong><br /><span>{verification}</span></p>
  </article>;
}

export function DiplomaRoute() {
  const code = useParams().code ?? "";
  const certificates = useCertificates();
  if (certificates.isPending) return <Busy />;
  if (certificates.isError) return <Failure error={certificates.error} retry={() => void certificates.refetch()} />;
  const certificate = certificates.data.find((item) => item.code === code);
  if (!certificate) return <EmptyState title="No encontramos este diploma" description="Revisa el enlace o abre tus cursos para ver los diplomas que obtuviste."
    action={<Link className={buttonClass("primary")} to="/">Volver al inicio</Link>} />;
  return <section className={styles.screen}>
    <PageHeader title="Tu diploma" breadcrumbs={[{ label: "Inicio", to: "/" }, { label: certificate.courseName }]}
      description="Compártelo con el código de verificación: cualquiera puede comprobarlo sin iniciar sesión."
      actions={<Button variant="primary" onClick={() => window.print()}>Imprimir o guardar PDF</Button>} />
    <Diploma certificate={certificate} />
  </section>;
}

/** Verificación pública: no requiere sesión y muestra sólo lo impreso en el diploma. */
export function VerifyRoute() {
  const code = useParams().code ?? "";
  const [state, setState] = useState<{ certificate?: Schema["CertificateVerification"]; error?: unknown } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void backend.GET("/api/certificates/{code}", { signal: controller.signal, params: { path: { code } } }).then(result)
      .then((certificate) => setState({ certificate }), (error: unknown) => { if (!controller.signal.aborted) setState({ error }); });
    return () => controller.abort();
  }, [code]);
  return <main className={styles.public}>
    <PageHeader title="Verificación de diploma" />
    {!state ? <Busy /> : state.certificate ? <>
      <p className={styles.valid} role="status">Diploma válido, emitido por AITeacher.</p>
      <Diploma certificate={state.certificate} />
    </> : state.error instanceof ApiError && state.error.status === 404
      ? <EmptyState title="Código no válido" description={`No existe un diploma con el código «${code}». Revisa que esté escrito como aparece impreso.`} />
      : <Failure error={state.error} />}
  </main>;
}

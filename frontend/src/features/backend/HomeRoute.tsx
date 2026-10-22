import { Link } from "react-router-dom";
import { Card, PageHeader, buttonClass } from "../../ui";
import { useProfile } from "./profile";
import styles from "./HomeRoute.module.css";

const spaces = [
  { to: "/catalogo", title: "Catálogo", description: "Elige una materia, un tema y una lectura o unidad publicada.", action: "Explorar el catálogo" },
  { to: "/apuntes", title: "Apuntes", description: "Tus ideas, mensajes guardados y resúmenes de conversaciones.", action: "Abrir apuntes" },
  { to: "/repasos", title: "Repasos", description: "Programa repasos a partir de tus evidencias y complétalos con un intento nuevo.", action: "Ver repasos" },
  { to: "/historial", title: "Historial", description: "Conversaciones y resultados conservados de la versión anterior.", action: "Consultar historial" },
];

/** Inicio provisional: orienta hacia cada espacio. «Continuar donde lo dejé» llega en la fase 2. */
export function HomeRoute() {
  const profile = useProfile();
  return <section>
    <PageHeader eyebrow="Inicio" title={`Hola, ${firstName(profile.displayName)}`}
      description="Elige por dónde seguir. Los niveles describen el material; no acreditan dominio." />
    <ul className={styles.spaces}>{spaces.map((space) => <Card as="li" key={space.to} className={styles.space}>
      <h2>{space.title}</h2><p>{space.description}</p>
      <Link className={buttonClass(space.to === "/catalogo" ? "primary" : "secondary")} to={space.to}>{space.action}</Link>
    </Card>)}</ul>
  </section>;
}

function firstName(name: string) {
  const [first = ""] = name.trim().split(/\s+/);
  return first === "" ? "de nuevo" : first;
}

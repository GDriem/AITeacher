import type { HTMLAttributes } from "react";
import { cardClass } from "./cardClass";

type CardElement = "div" | "section" | "article" | "li" | "aside";

export type CardProps = HTMLAttributes<HTMLElement> & { as?: CardElement; compact?: boolean };

/** Superficie elevada para agrupar contenido relacionado. */
export function Card({ as: Element = "div", compact = false, className, ...props }: CardProps) {
  return <Element className={cardClass(compact, className)} {...props} />;
}

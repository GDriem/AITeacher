import { CatalogScreen } from "../features/catalog/CatalogScreen";
import { useAppSession } from "../features/auth/appSession";

export function Component() {
  const { studentId } = useAppSession();
  return <CatalogScreen studentId={studentId} />;
}

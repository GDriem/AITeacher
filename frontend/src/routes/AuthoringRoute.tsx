import { Navigate } from "react-router-dom";

import { useAppSession } from "../features/auth/appSession";
import { AuthoringScreen } from "../features/authoring/AuthoringScreen";

export function Component() {
  const { capabilities, studentId } = useAppSession();
  if (!capabilities.authoring) return <Navigate to="/" replace />;
  return <AuthoringScreen studentId={studentId} />;
}

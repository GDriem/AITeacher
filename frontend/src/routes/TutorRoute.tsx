import { useAppSession } from "../features/auth/appSession";
import { TutorScreen } from "../features/tutor/TutorScreen";

export function Component() {
  const { studentId } = useAppSession();
  return <TutorScreen studentId={studentId} />;
}

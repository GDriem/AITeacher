import { ProjectsScreen } from "../features/projects/ProjectsScreen";
import { useAppSession } from "../features/auth/appSession";

export function Component() {
  const { studentId } = useAppSession();
  return <ProjectsScreen studentId={studentId} />;
}

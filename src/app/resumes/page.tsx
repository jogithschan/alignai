import { getResumes } from "./actions";
import { ResumeManager } from "./ResumeManager";

export const dynamic = "force-dynamic";

export default async function ResumesPage() {
  const resumes = await getResumes();

  return <ResumeManager initialResumes={resumes} />;
}

import { requireRole, apiGet } from "@/lib/session";
import Shell from "@/components/shell";
import ClassworkPanel from "./classwork-panel";

interface Assignment {
  id: string; title: string; instructions: string | null; dueAt: string | null;
  attachmentFileId: string | null; filename: string | null; submissionCount: number;
}
interface Material {
  id: string; title: string; description: string | null; url: string | null;
  fileId: string | null; filename: string | null; bytes: number | null; createdAt: string;
}

export default async function TeacherClasswork({ params }: { params: Promise<{ sectionId: string }> }) {
  const session = await requireRole("teacher", "teacher_assistant");
  const { sectionId } = await params;
  const [assignments, materials, sections] = await Promise.all([
    apiGet<{ data: Assignment[] }>(`/sections/${sectionId}/assignments`),
    apiGet<{ data: Material[] }>(`/sections/${sectionId}/materials`),
    apiGet<{ data: { id: string; name: string }[] }>("/classwork/my-sections"),
  ]);
  const name = (sections?.data ?? []).find((s) => s.id === sectionId)?.name ?? "section";

  return (
    <Shell session={session}>
      <ClassworkPanel
        sectionId={sectionId}
        sectionName={name}
        assignments={assignments?.data ?? []}
        materials={materials?.data ?? []}
      />
    </Shell>
  );
}

/* Browser tab + document title. The root layout owns the "%s · <school>" template. */
export const metadata = { title: "Classwork" };

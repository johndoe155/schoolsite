import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireRole, apiGet, publicSchool } from "@/lib/session";
import PrintActions from "@/components/print-actions";
import ReportCardSheet, { type ReportCardSnapshot, type Pupil } from "@/components/report-card-sheet";

/**
 * /print/report-card/[studentId] — the report card as a document.
 *
 * Access is not re-implemented here: the page fetches the snapshot through the
 * same API as the on-screen card, so the API's own rule (the pupil, a verified
 * guardian, or an administrator) decides. A guardian who pastes another
 * family's child id gets a 404 from the API and a 404 page from this route.
 *
 * Administrators can print for any pupil; pupils and guardians get their own
 * details resolved from endpoints they may already read, so nothing here can be
 * used to look up a name the caller could not otherwise see.
 */
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Report card — School Portal" };

interface ReportCard { id: string; snapshot: ReportCardSnapshot }
interface Child { studentUserId: string; admissionNo: string; gradeLevel: number; displayName: string; verified: string | null }
interface Profile { userId: string; displayName: string; admissionNo?: string; gradeLevel?: number }

export default async function ReportCardPrint(
  { params, searchParams }: { params: Promise<{ studentId: string }>; searchParams: Promise<{ term?: string }> },
) {
  const session = await requireRole("student", "parent", "super_admin", "school_admin", "registrar");
  const { studentId } = await params;
  const { term } = await searchParams;

  const school = await publicSchool();
  const query = term ? `?term_id=${encodeURIComponent(term)}` : "";
  const card = await apiGet<{ data: ReportCard[] }>(`/students/${studentId}/report-card${query}`);
  if (!card?.data?.length) notFound();

  /* Who the sheet is about. A pupil is their own session; a guardian reads it
     from the children list; an administrator from the directory. */
  let pupil: Pupil | null = null;
  if (session.activeRole === "student" && session.userId === studentId) {
    const me = await apiGet<Profile>("/student/profile");
    pupil = { displayName: me?.displayName ?? session.displayName, admissionNo: me?.admissionNo, gradeLevel: me?.gradeLevel };
  } else if (session.activeRole === "parent") {
    const kids = await apiGet<{ data: Child[] }>("/parent/children");
    const child = kids?.data.find((c) => c.studentUserId === studentId);
    if (!child) notFound();
    pupil = { displayName: child.displayName, admissionNo: child.admissionNo, gradeLevel: child.gradeLevel };
  } else {
    const profile = await apiGet<Profile & { admissionNo: string; gradeLevel: number }>(`/students/${studentId}`);
    pupil = profile
      ? { displayName: profile.displayName, admissionNo: profile.admissionNo, gradeLevel: profile.gradeLevel }
      : null;
  }
  if (!pupil) notFound();

  const backHref = session.activeRole === "parent" ? `/parent/${studentId}` : "/student/grades";
  /* Most recent snapshot first: a pupil can have several terms on file and the
     printed sheet should default to what the family is asking for. */
  const latest = [...card.data].sort((a, b) =>
    (b.snapshot.generatedAt ?? "").localeCompare(a.snapshot.generatedAt ?? ""))[0];

  return (
    <>
      <PrintActions backHref={backHref} backLabel="Back"
        printLabel="Print / Save as PDF" />
      <ReportCardSheet school={school.name} pupil={pupil} snapshot={latest.snapshot}
        address={school.address ?? null} />
    </>
  );
}

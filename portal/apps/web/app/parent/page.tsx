import Link from "next/link";
import { requireRole, apiGet } from "@/lib/session";
import Shell from "@/components/shell";
import NextUp, { type NextItem } from "@/components/next-up";
import EmptyState from "@/components/empty-state";

interface Child { studentUserId: string; admissionNo: string; gradeLevel: number; displayName: string; relationship: string
  verified?: string | null;
}

export default async function ParentHome() {
  const session = await requireRole("parent");
  const res = await apiGet<{ data: Child[] }>("/parent/children");
  const children = res?.data ?? [];
  const unverified = children.filter((c) => !c.verified);
  const nextItems: NextItem[] = [];
  if (unverified.length > 0) {
    nextItems.push({
      label: "Action needed",
      value: `${unverified.length} link${unverified.length === 1 ? "" : "s"} pending verification`,
      href: "/parent/verify",
    });
  } else if (children.length > 0) {
    nextItems.push({ label: "Linked children", value: `${children.length}` });
  }
  return (
    <Shell session={session}>
      <header className="page-head">
        <span className="eyebrow">Guardian</span>
        <h1>My children</h1>
        <p className="lede">Read-only view of released grades and attendance for each linked child.</p>
      </header>
      <NextUp items={nextItems} />
      {children.length === 0 && (
        <EmptyState icon="◍" title="No children linked yet">
          Ask the school office to link your account with your child&apos;s admission number.
          The confirmation email then lands here.
        </EmptyState>
      )}
      <div className="grid cols2">
        {children.map((c) => (
          <Link className="card link-card" key={c.studentUserId} href={!c.verified ? "/parent/verify" : `/parent/${c.studentUserId}`}>
            <h2>{c.displayName}</h2>
            <div className="muted">{c.admissionNo} · Grade {c.gradeLevel} · your {c.relationship}</div>
            {!c.verified ? (
              <div className="verification-note">
                Link pending — check your email for the school&apos;s verification link, or ask the office to confirm it.
              </div>
            ) : (
              <div className="card-note">View grades &amp; attendance →</div>
            )}
          </Link>
        ))}
      </div>
    </Shell>
  );
}

/* Browser tab + document title. The root layout owns the "%s · <school>" template. */
export const metadata = { title: "Children" };

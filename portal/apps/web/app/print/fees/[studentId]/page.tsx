import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireRole, apiGet, publicSchool } from "@/lib/session";
import PrintActions from "@/components/print-actions";
import type { Pupil } from "@/components/report-card-sheet";

/**
 * /print/fees/[studentId] — fee receipts and a statement of account.
 *
 * "Receipts" in the school's world is a folded duplicate book in the bursar's
 * office: whatever the portal showed, the parent who paid from Lagos and wanted
 * a record had to ask for one. This page turns the ledger into the document
 * the school would otherwise write by hand: one receipt per successful payment,
 * followed by the running account.
 *
 * Guardians and pupils only — the API endpoints behind it are the guardian and
 * self ledgers, so a parent can print a statement for their own child and a
 * pupil for themselves. Office staff already have the ledger screen.
 */
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Fee statement — School Portal" };

interface Invoice { id: string; label: string; amountKobo: number; status: string; dueDate: string | null; termId: string }
interface Payment {
  id: string; invoiceId: string; amountKobo: number; channel: string;
  gatewayRef: string | null; status: string; currency: string;
  createdAt: string; paidAt: string | null;
}
interface Child { studentUserId: string; admissionNo: string; gradeLevel: number; displayName: string }
interface Profile { userId: string; displayName: string; admissionNo?: string | null; gradeLevel?: number | null }

const naira = (kobo: number) => `₦${(kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;
const day = (iso: string | null) => (iso ? iso.slice(0, 10) : "—");

export default async function FeeStatementPrint({ params }: { params: Promise<{ studentId: string }> }) {
  const session = await requireRole("parent", "student");
  const { studentId } = await params;

  const school = await publicSchool();

  let pupil: Pupil | null = null;
  let ledger: { invoices: Invoice[]; payments: Payment[] } | null = null;

  if (session.activeRole === "parent") {
    const [kids, fees] = await Promise.all([
      apiGet<{ data: Child[] }>("/parent/children"),
      apiGet<{ data: { invoices: Invoice[]; payments: Payment[] } }>(`/parent/children/${studentId}/fees`),
    ]);
    const child = kids?.data.find((c) => c.studentUserId === studentId);
    if (!child) notFound();
    pupil = { displayName: child.displayName, admissionNo: child.admissionNo, gradeLevel: child.gradeLevel };
    ledger = fees?.data ?? null;
  } else {
    /* A pupil may only print their own statement — the endpoint has no id. */
    if (session.userId !== studentId) notFound();
    const [me, fees] = await Promise.all([
      apiGet<Profile>("/student/profile"),
      apiGet<{ data: { invoices: Invoice[]; payments: Payment[] } }>("/fees/my"),
    ]);
    pupil = { displayName: me?.displayName ?? session.displayName, admissionNo: me?.admissionNo, gradeLevel: me?.gradeLevel };
    ledger = fees?.data ?? null;
  }
  if (!pupil || !ledger) notFound();

  const paid = ledger.payments.filter((p) => p.status === "success");
  const paidByInvoice = new Map<string, Payment[]>();
  for (const p of paid) {
    const list = paidByInvoice.get(p.invoiceId) ?? [];
    list.push(p);
    paidByInvoice.set(p.invoiceId, list);
  }
  const outstanding = ledger.invoices
    .filter((i) => i.status !== "void")
    .reduce((acc, inv) => {
      const got = (paidByInvoice.get(inv.id) ?? []).reduce((s, p) => s + p.amountKobo, 0);
      return acc + Math.max(0, inv.amountKobo - got);
    }, 0);

  const backHref = session.activeRole === "parent" ? `/parent/${studentId}` : "/student";

  return (
    <>
      <PrintActions backHref={backHref} backLabel="Back" printLabel="Print / Save as PDF" />
      <article className="sheet">
        <header className="sheet__head">
          <div>
            <div className="sheet__school">{school.name}</div>
            {school.address ? <div className="sheet__address">{school.address}</div> : null}
          </div>
          <div className="sheet__doc">
            <div className="sheet__doc-title">Receipts &amp; statement</div>
            <div className="sheet__doc-meta">Printed {new Date().toISOString().slice(0, 10)}</div>
          </div>
        </header>

        <div className="sheet__facts">
          <div><span className="sheet__label">Pupil</span><strong>{pupil.displayName}</strong></div>
          {pupil.admissionNo ? (
            <div><span className="sheet__label">Admission no.</span><strong>{pupil.admissionNo}</strong></div>
          ) : null}
          <div><span className="sheet__label">Outstanding</span><strong>{naira(outstanding)}</strong></div>
        </div>

        <section className="sheet__block">
          <div className="sheet__block-head"><strong>Receipts</strong></div>
          {paid.length === 0 ? (
            <p className="sheet__muted">No payment has been received on this account yet.</p>
          ) : paid.map((p) => {
            const inv = ledger.invoices.find((i) => i.id === p.invoiceId);
            const got = (paidByInvoice.get(p.invoiceId) ?? []).reduce((s, x) => s + x.amountKobo, 0);
            const balance = Math.max(0, (inv?.amountKobo ?? 0) - got);
            return (
              <div key={p.id} className="receipt">
                <div className="receipt__head">
                  <strong>Receipt {p.gatewayRef ?? p.id.slice(0, 8).toUpperCase()}</strong>
                  <span className="sheet__label">{day(p.paidAt ?? p.createdAt)}</span>
                </div>
                <table>
                  <tbody>
                    <tr><td>Received from</td><td>{pupil.displayName}{pupil.admissionNo ? ` (${pupil.admissionNo})` : ""}</td></tr>
                    <tr><td>Being payment for</td><td>{inv?.label ?? "School fees"}</td></tr>
                    <tr><td>Amount</td><td><strong>{naira(p.amountKobo)} {p.currency}</strong></td></tr>
                    <tr><td>Method</td><td>{p.channel === "manual" ? "Recorded by the office" : p.channel}</td></tr>
                    <tr><td>Reference</td><td>{p.gatewayRef ?? "—"}</td></tr>
                    <tr><td>Balance on this invoice</td><td>{balance === 0 ? "Paid in full" : naira(balance)}</td></tr>
                  </tbody>
                </table>
              </div>
            );
          })}
        </section>

        <section className="sheet__block">
          <div className="sheet__block-head"><strong>Account</strong></div>
          <table>
            <thead>
              <tr><th>Invoice</th><th>Due</th><th>Amount</th><th>Paid</th><th>Balance</th><th>Status</th></tr>
            </thead>
            <tbody>
              {ledger.invoices.map((inv) => {
                const got = (paidByInvoice.get(inv.id) ?? []).reduce((s, p) => s + p.amountKobo, 0);
                const balance = Math.max(0, inv.amountKobo - got);
                return (
                  <tr key={inv.id}>
                    <td>{inv.label}</td>
                    <td>{inv.dueDate ?? "—"}</td>
                    <td>{naira(inv.amountKobo)}</td>
                    <td>{naira(got)}</td>
                    <td>{naira(balance)}</td>
                    <td>{inv.status}</td>
                  </tr>
                );
              })}
              {ledger.invoices.length === 0 && (
                <tr><td colSpan={6} className="sheet__muted">No invoices on this account.</td></tr>
              )}
            </tbody>
          </table>
        </section>

        <p className="sheet__note">
          Payments are collected through the school&rsquo;s payment provider or recorded by the
          bursary. A reference that does not appear here has not been confirmed by the school —
          please check with the office before paying twice.
        </p>

        <div className="sheet__signatures">
          <div>Bursar</div>
          <div>Date</div>
        </div>
      </article>
    </>
  );
}

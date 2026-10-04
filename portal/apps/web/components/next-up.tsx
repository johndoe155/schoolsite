/**
 * "Next" strip — PORTAL-UX-AUDIT.md feature #5.
 *
 * A dashboard's job is to answer "what now?", and the data a dashboard already
 * fetched usually holds the answer: the next exam, the unpaid invoice, the
 * link that still needs verifying. This strip surfaces those one at a time so
 * nobody has to scan five cards to find the thing that is due.
 *
 * It renders only what the caller passes — pages build the items from data
 * they already have, so the strip costs no extra request. Server component.
 */
import Link from "next/link";

export interface NextItem {
  label: string;
  value: string;
  href?: string;
}

export default function NextUp({ items, date }: { items: NextItem[]; date?: string }) {
  if (items.length === 0) return null;
  return (
    <section className="today" aria-label="What is next">
      {date ? <span className="today__date">{date}</span> : null}
      <ul className="today__list">
        {items.map((item) => (
          <li className="today__item" key={`${item.label}-${item.value}`}>
            {item.label}:{" "}
            {item.href ? (
              <Link href={item.href}><strong>{item.value}</strong></Link>
            ) : (
              <strong>{item.value}</strong>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

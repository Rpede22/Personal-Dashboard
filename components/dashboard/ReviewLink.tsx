import Link from "next/link";

/**
 * Small always-visible link to the rolling 7-day review page. Previously
 * gated to Thu–Sun (waiting for the week to accumulate data), but with a
 * rolling window it's useful any day.
 */
export default function ReviewLink() {
  return (
    <div className="mb-4 flex justify-start">
      <Link
        href="/review"
        className="text-xs px-3 py-1.5 rounded-lg inline-flex items-center gap-2 hover:brightness-110"
        style={{ background: "var(--surface)", border: "1px solid var(--accent-cyan)55", color: "var(--accent-cyan)" }}
      >
        <span>🗓️</span>
        <span>Review last 7 days</span>
        <span aria-hidden>→</span>
      </Link>
    </div>
  );
}

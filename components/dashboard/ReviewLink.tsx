"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * Small link to the weekly review page. Only surfaces Thu → Sun (JS days 4-6, 0)
 * when there's enough data in the week to be worth recapping. Hidden Mon-Wed.
 * Rendered under the TodayBriefing card.
 */
export default function ReviewLink() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const day = new Date().getDay(); // 0=Sun … 6=Sat
    setVisible(day === 0 || day >= 4);
  }, []);

  if (!visible) return null;

  return (
    <div className="mb-4 flex justify-start">
      <Link
        href="/review"
        className="text-xs px-3 py-1.5 rounded-lg inline-flex items-center gap-2 hover:brightness-110"
        style={{ background: "var(--surface)", border: "1px solid var(--accent-cyan)55", color: "var(--accent-cyan)" }}
      >
        <span>🗓️</span>
        <span>Review week</span>
        <span aria-hidden>→</span>
      </Link>
    </div>
  );
}

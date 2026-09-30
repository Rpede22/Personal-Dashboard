"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { loadReviewEnabled, useSettingsTick } from "@/lib/dashboard-settings";

/**
 * Small always-visible links under the dashboard header. Since the Electron
 * window has no URL bar, these pills are the only way to reach the day view
 * (`/today`) and the rolling 7-day review (`/review`). The review pill hides
 * when the review is turned off in Settings.
 */
export default function ReviewLink() {
  const tick = useSettingsTick();
  const [reviewEnabled, setReviewEnabled] = useState(true);
  useEffect(() => { setReviewEnabled(loadReviewEnabled()); }, [tick]);

  return (
    <div className="mb-4 flex justify-start gap-2 flex-wrap">
      <Link
        href="/today"
        className="text-xs px-3 py-1.5 rounded-lg inline-flex items-center gap-2 hover:brightness-110"
        style={{ background: "var(--surface)", border: "1px solid var(--accent-cyan)55", color: "var(--accent-cyan)" }}
      >
        <span>☀️</span>
        <span>Today in full</span>
        <span aria-hidden>→</span>
      </Link>
      {reviewEnabled && (
        <Link
          href="/review"
          className="text-xs px-3 py-1.5 rounded-lg inline-flex items-center gap-2 hover:brightness-110"
          style={{ background: "var(--surface)", border: "1px solid var(--accent-cyan)55", color: "var(--accent-cyan)" }}
        >
          <span>🗓️</span>
          <span>Review last 7 days</span>
          <span aria-hidden>→</span>
        </Link>
      )}
    </div>
  );
}

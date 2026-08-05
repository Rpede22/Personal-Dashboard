"use client";

import { useEffect, useState } from "react";

/** Live "Today" date under the dashboard title. Server-rendered dates went
 *  stale in the packaged Electron app because the Next process is long-lived
 *  and served a cached HTML for the same route across midnight rolls. */
export default function TodayDate() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const iv = setInterval(() => setNow(new Date()), 60 * 1000);
    return () => clearInterval(iv);
  }, []);

  if (!now) return <span>&nbsp;</span>; // avoid hydration mismatch on first paint

  return (
    <span>
      {now.toLocaleDateString("en-GB", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      })}
    </span>
  );
}

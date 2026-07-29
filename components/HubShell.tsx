import Link from "next/link";
import type { ReactNode } from "react";

interface Props {
  title: string;
  emoji?: string;
  color?: string;
  backHref?: string;
  backLabel?: string;
  /** Extra content below the title row (tab switcher, filter chips, etc). */
  tabs?: ReactNode;
  /** Additional classes on the outer <main>-style wrapper. */
  className?: string;
  children: ReactNode;
}

/**
 * Sticky-header shell shared by hubs (currently GameHub; WoWHub/LoLHub always
 * render inside GameHub with their own headers hidden).
 *
 * Provides: page-bg outer wrapper, sticky bar under the 28px Electron titlebar,
 * back link, emoji + title, optional secondary row (tabs/filters), and a
 * children slot for the hub body.
 */
export default function HubShell({
  title, emoji, color = "var(--text)",
  backHref = "/", backLabel = "← Dashboard",
  tabs, className = "", children,
}: Props) {
  return (
    <div className={`min-h-screen p-6 page-bg ${className}`}>
      <div className="sticky top-[28px] z-10 -mx-6 px-6 pt-5 pb-3 mb-4 page-bg">
        <div className={`flex items-center gap-4 ${tabs ? "mb-3" : ""}`}>
          <Link href={backHref} className="text-sm hover:underline" style={{ color: "var(--text-muted)" }}>
            {backLabel}
          </Link>
          <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color }}>
            {emoji && <span>{emoji}</span>}
            <span>{title}</span>
          </h1>
        </div>
        {tabs}
      </div>
      {children}
    </div>
  );
}

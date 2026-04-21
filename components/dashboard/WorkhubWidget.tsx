"use client";

import Card, { CardHeader } from "@/components/Card";

export default function WorkhubWidget() {
  return (
    <Card accentColor="var(--accent-cyan)">
      <CardHeader
        icon="💼"
        title="Work Hours"
        subtitle="Daily reminder"
        accentColor="var(--accent-cyan)"
        showArrow={false}
      />
      <div className="flex flex-col items-center gap-2">
        <p className="text-sm text-center" style={{ color: "var(--text-muted)" }}>
          Remember to log your work hours today
        </p>
        <a
          href="https://profil.cand.dk/work/register"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-semibold px-3 py-1.5 rounded-lg transition-all"
          style={{
            background: "var(--accent-cyan)22",
            color: "var(--accent-cyan)",
            border: "1px solid var(--accent-cyan)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          Register hours →
        </a>
      </div>
    </Card>
  );
}

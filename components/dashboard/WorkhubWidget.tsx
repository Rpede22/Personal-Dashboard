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
      <div className="flex justify-around items-end w-full">
        <div className="flex flex-col items-center gap-1.5">
          <p className="text-xs text-center" style={{ color: "var(--text-muted)" }}>
            Remember to log your hours
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
        <div className="flex flex-col items-center gap-1.5">
          <p className="text-xs text-center" style={{ color: "var(--text-muted)" }}>
            View your payslips
          </p>
          <a
            href="https://intect.app/selfservice/payslip"
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
            View payslips →
          </a>
        </div>
      </div>
    </Card>
  );
}

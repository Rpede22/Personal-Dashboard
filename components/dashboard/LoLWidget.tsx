"use client";

import { useEffect, useState } from "react";
import Card, { CardHeader } from "@/components/Card";

interface LolAccount {
  id: number;
  gameName: string;
  tagLine: string;
  region: string;
}

export default function LoLWidget() {
  const [accounts, setAccounts] = useState<LolAccount[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/lol/account")
      .then((r) => r.json())
      .then((d) => setAccounts(d.accounts ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <Card accentColor="var(--accent-blue)">
      <CardHeader icon="⚔️" title="League of Legends" subtitle="Match history · ranks" accentColor="var(--accent-blue)" />

      {loading ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>Loading…</p>
      ) : accounts.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          No accounts yet — click through to add your Riot ID.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {accounts.slice(0, 3).map((a) => (
            <li
              key={a.id}
              className="rounded-lg px-2.5 py-1.5 flex items-center justify-between"
              style={{ background: "var(--surface-2)" }}
            >
              <span className="text-sm font-medium truncate">
                {a.gameName}
                <span style={{ color: "var(--text-muted)" }}>#{a.tagLine}</span>
              </span>
              <span
                className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full"
                style={{ background: "var(--accent-blue)22", color: "var(--accent-blue)" }}
              >
                {a.region}
              </span>
            </li>
          ))}
          {accounts.length > 3 && (
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              +{accounts.length - 3} more
            </p>
          )}
        </ul>
      )}
    </Card>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { GAMES, GameKey, loadEnabledGames, saveEnabledGames, useEnabledGames } from "@/lib/games-visibility";

/**
 * Games panel for the unified Settings modal:
 *  1. per-game **show/hide** toggles (WoW / LoL / CS2), live via lib/games-visibility.
 *  2. per-game **account management** (add/remove) for each shown game, so you
 *     can manage accounts without opening the hub. CS2 (FACEIT) is file-based;
 *     LoL/WoW are DB-backed (their add/list may 500 in the dev arch, fine in prod).
 */

type Item = Record<string, unknown>;

interface AcctConfig {
  key: GameKey;
  listUrl: string;
  listKey: string;
  addUrl: string;
  deleteUrl: (id: string | number) => string;
  rowLabel: (i: Item) => string;
  fields: { name: string; placeholder: string; def?: string; grow?: boolean }[];
  toBody: (v: Record<string, string>) => unknown;
  note?: string;
}

const ACCT: Record<GameKey, AcctConfig> = {
  cs2: {
    key: "cs2", listUrl: "/api/faceit/accounts", listKey: "accounts",
    addUrl: "/api/faceit/accounts", deleteUrl: (id) => `/api/faceit/accounts?id=${encodeURIComponent(String(id))}`,
    rowLabel: (i) => String(i.nickname ?? ""),
    fields: [{ name: "nickname", placeholder: "FACEIT nickname", grow: true }],
    toBody: (v) => ({ nickname: v.nickname }),
  },
  lol: {
    key: "lol", listUrl: "/api/lol/account", listKey: "accounts",
    addUrl: "/api/lol/account", deleteUrl: (id) => `/api/lol/account?id=${encodeURIComponent(String(id))}`,
    rowLabel: (i) => `${i.gameName ?? ""}#${i.tagLine ?? ""} · ${i.region ?? ""}`,
    fields: [
      { name: "gameName", placeholder: "Game name", grow: true },
      { name: "tagLine", placeholder: "Tag (EUW)" },
      { name: "region", placeholder: "euw1", def: "euw1" },
    ],
    toBody: (v) => ({ gameName: v.gameName, tagLine: v.tagLine.replace(/^#/, ""), region: v.region || "euw1" }),
  },
  tft: {
    key: "tft", listUrl: "/api/tft/accounts", listKey: "accounts",
    addUrl: "/api/tft/accounts", deleteUrl: (id) => `/api/tft/accounts?id=${encodeURIComponent(String(id))}`,
    rowLabel: (i) => `${i.gameName ?? ""}#${i.tagLine ?? ""} · ${i.region ?? ""}`,
    fields: [
      { name: "gameName", placeholder: "Game name", grow: true },
      { name: "tagLine", placeholder: "Tag" },
      { name: "region", placeholder: "euw1", def: "euw1" },
    ],
    toBody: (v) => ({ gameName: v.gameName, tagLine: v.tagLine.replace(/^#/, ""), region: v.region || "euw1" }),
  },
  wow: {
    key: "wow", listUrl: "/api/wow/character", listKey: "characters",
    addUrl: "/api/wow/character", deleteUrl: (id) => `/api/wow/character?id=${encodeURIComponent(String(id))}`,
    rowLabel: (i) => `${i.name ?? ""} · ${i.realm ?? ""} (${i.region ?? ""})`,
    fields: [
      { name: "name", placeholder: "Character", grow: true },
      { name: "realm", placeholder: "Realm" },
      { name: "region", placeholder: "eu", def: "eu" },
    ],
    toBody: (v) => ({ name: v.name, realm: v.realm, region: v.region || "eu" }),
  },
};

function AccountManager({ cfg, color }: { cfg: AcctConfig; color: string }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(cfg.listUrl);
      if (!res.ok) { setItems([]); return; }
      const j = await res.json();
      setItems(Array.isArray(j[cfg.listKey]) ? j[cfg.listKey] : []);
    } catch { setItems([]); }
  }, [cfg]);
  useEffect(() => { load(); }, [load]);

  async function add() {
    const primary = cfg.fields[0].name;
    if (!vals[primary]?.trim()) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch(cfg.addUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cfg.toBody(vals)) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setError(j.error ?? "Couldn't add (the hub's database may be unavailable in dev)."); return; }
      setVals({});
      await load();
    } catch { setError("Network error."); }
    finally { setBusy(false); }
  }
  async function remove(id: string | number) {
    setBusy(true);
    try { await fetch(cfg.deleteUrl(id), { method: "DELETE" }); await load(); }
    finally { setBusy(false); }
  }

  const inputStyle = { background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)" } as const;

  return (
    <div className="mt-2 space-y-1.5">
      {items && items.length > 0 && (
        <div className="space-y-1">
          {items.map((it, idx) => (
            <div key={String(it.id ?? idx)} className="flex items-center gap-2 text-xs px-2 py-1 rounded" style={{ background: "var(--surface-2)" }}>
              <span className="flex-1 min-w-0 truncate">{cfg.rowLabel(it)}</span>
              <button onClick={() => remove(it.id as string | number)} disabled={busy} style={{ color: "var(--accent-red)" }} title="Remove">✕</button>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        {cfg.fields.map((f) => (
          <input
            key={f.name}
            type="text"
            placeholder={f.placeholder}
            value={vals[f.name] ?? ""}
            onChange={(e) => setVals((v) => ({ ...v, [f.name]: e.target.value }))}
            onKeyDown={(e) => { if (e.key === "Enter") add(); }}
            className={`text-xs px-2 py-1 rounded ${f.grow ? "flex-1 min-w-[8rem]" : "w-20"}`}
            style={inputStyle}
          />
        ))}
        <button onClick={add} disabled={busy} className="text-xs px-2.5 py-1 rounded" style={{ background: `${color}22`, color, border: `1px solid ${color}` }}>+ Add</button>
      </div>
      {error && <div className="text-[11px]" style={{ color: "var(--accent-red)" }}>{error}</div>}
      {cfg.note && <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{cfg.note}</div>}
    </div>
  );
}

export default function GamesSettings() {
  const enabled = useEnabledGames();

  function toggle(key: GameKey) {
    const next = new Set(loadEnabledGames());
    if (next.has(key)) next.delete(key); else next.add(key);
    if (next.size === 0) return;
    saveEnabledGames(next);
  }

  return (
    <div className="space-y-5">
      {/* Visibility */}
      <section>
        <h3 className="text-xs uppercase tracking-wide mb-1" style={{ color: "var(--text-muted)" }}>Visible games</h3>
        <p className="text-xs mb-2" style={{ color: "var(--text-muted)" }}>Hide the ones you don&apos;t play — they disappear from the Games hub + widget. At least one stays visible.</p>
        <div className="space-y-1">
          {GAMES.map((g) => {
            const on = enabled.has(g.key);
            return (
              <button key={g.key} onClick={() => toggle(g.key)}
                className="w-full text-left px-3 py-2 rounded-lg flex items-center justify-between"
                style={{ background: on ? `${g.color}22` : "var(--surface-2)", color: on ? g.color : "var(--text-muted)", border: `1px solid ${on ? g.color : "var(--border)"}` }}>
                <span className="text-sm flex items-center gap-2"><span>{g.emoji}</span>{g.label}</span>
                <span className="text-xs">{on ? "✓ shown" : "hidden"}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Accounts (per visible game) */}
      <section>
        <h3 className="text-xs uppercase tracking-wide mb-1" style={{ color: "var(--text-muted)" }}>Accounts</h3>
        <p className="text-xs mb-2" style={{ color: "var(--text-muted)" }}>Add or remove accounts here or in each game hub — both use the same data.</p>
        <div className="space-y-3">
          {GAMES.filter((g) => enabled.has(g.key)).map((g) => (
            <div key={g.key} className="rounded-lg p-3" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              <div className="text-sm font-medium flex items-center gap-2" style={{ color: g.color }}><span>{g.emoji}</span>{g.label}</div>
              <AccountManager cfg={ACCT[g.key]} color={g.color} />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

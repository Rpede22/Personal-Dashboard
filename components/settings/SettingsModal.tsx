"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  type Theme, type Density, type WidgetSlug, type SectionSlug,
  loadTheme, loadDensity, setTheme, setDensity,
  WIDGET_META, loadWidgetEnabled, saveWidgetEnabled,
  loadWidgetOrder, saveWidgetOrder, DEFAULT_WIDGET_ORDER,
  SECTION_META, loadSections, saveSections,
  useSettingsTick, WIDGET_META_BY_SLUG, OPEN_ONBOARDING_EVENT,
  CURRENCIES, loadCurrency, setCurrency,
  LANGUAGES, loadLanguage, setLanguage, type Language,
  type BriefingRow, BRIEFING_ROW_META, loadBriefingRows, saveBriefingRows,
  type ReviewSection, REVIEW_SECTION_META, loadReviewSections, saveReviewSections, loadReviewEnabled, setReviewEnabled,
  type TodaySection, TODAY_SECTION_META, loadTodaySections, saveTodaySections,
  type ReviewGame, loadReviewAccount, setReviewAccount, loadReviewWowChars, setReviewWowChars,
} from "@/lib/dashboard-settings";
import { REFRESH_OPTIONS_MIN, loadRefreshOverrides, saveRefreshOverride } from "@/lib/refresh";

/**
 * Unified settings modal. A left-rail of sections; the right pane renders the
 * active section's panel. **General** is built in here (theme, density,
 * dashboard sections, widget visibility, refresh intervals). Per-hub panels
 * are passed in via `extraSections` as they're built — each is just a
 * `{ id, label, icon, render }` entry, so the modal is a shell that mounts
 * whatever settings a hub owns.
 */

export interface SettingsSection {
  id: string;
  label: string;
  icon: string;
  render: () => ReactNode;
  /** Optional left-rail grouping header (e.g. "Hubs"). Sections with the same
   *  group are listed together under one header, in first-seen order. */
  group?: string;
}

export default function SettingsButton({ extraSections = [] }: { extraSections?: SettingsSection[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs px-3 py-1.5 rounded-md inline-flex items-center gap-2 hover:brightness-110"
        style={{ background: "var(--surface)", color: "var(--text-muted)", border: "1px solid var(--border)" }}
        title="Settings"
      >
        <span>⚙️</span><span>Settings</span>
      </button>
      {open && <SettingsModal onClose={() => setOpen(false)} extraSections={extraSections} />}
    </>
  );
}

function SettingsModal({ onClose, extraSections }: { onClose: () => void; extraSections: SettingsSection[] }) {
  const sections: SettingsSection[] = [
    { id: "general", label: "General", icon: "🎛️", group: "Dashboard", render: () => <GeneralSettings onClose={onClose} /> },
    ...extraSections,
  ];
  const [active, setActive] = useState(sections[0].id);

  // Group sections by their `group` header, preserving first-seen order.
  const groups: { group: string; items: SettingsSection[] }[] = [];
  for (const s of sections) {
    const g = s.group ?? "";
    let bucket = groups.find((x) => x.group === g);
    if (!bucket) { bucket = { group: g, items: [] }; groups.push(bucket); }
    bucket.items.push(s);
  }
  const showGroupHeaders = groups.some((g) => g.group) && groups.length > 1;

  // Lock body scroll + close on Escape.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; document.removeEventListener("keydown", onKey); };
  }, [onClose]);

  const activeSection = sections.find((s) => s.id === active) ?? sections[0];

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.55)" }}
      onClick={onClose}
    >
      <div
        className="rounded-2xl overflow-hidden flex w-full max-w-3xl shadow-2xl"
        style={{ background: "var(--surface)", border: "1px solid var(--border)", height: "min(80vh, 640px)", marginTop: 28 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left rail */}
        <div
          className="w-48 flex-shrink-0 flex flex-col p-3 gap-1 overflow-y-auto"
          style={{ background: "var(--surface-2)", borderRight: "1px solid var(--border)" }}
        >
          <div className="text-xs uppercase tracking-wide px-2 mb-1" style={{ color: "var(--text-muted)" }}>Settings</div>
          {groups.map((grp, gi) => (
            <div key={grp.group || `g${gi}`} className={gi > 0 ? "mt-2" : undefined}>
              {showGroupHeaders && grp.group && (
                <div className="text-[10px] uppercase tracking-wide px-2 mb-0.5 mt-1" style={{ color: "var(--text-muted)", opacity: 0.7 }}>{grp.group}</div>
              )}
              {grp.items.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setActive(s.id)}
                  className="w-full text-left text-sm px-3 py-2 rounded-lg flex items-center gap-2 transition-colors"
                  style={{
                    background: active === s.id ? "var(--surface)" : "transparent",
                    color: active === s.id ? "var(--text)" : "var(--text-muted)",
                    border: active === s.id ? "1px solid var(--border)" : "1px solid transparent",
                  }}
                >
                  <span>{s.icon}</span><span>{s.label}</span>
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* Right pane */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center justify-between px-5 py-3 flex-shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
            <h2 className="font-semibold flex items-center gap-2">
              <span>{activeSection.icon}</span>{activeSection.label}
            </h2>
            <button onClick={onClose} className="text-lg opacity-60 hover:opacity-100" title="Close (Esc)">✕</button>
          </div>
          <div className="flex-1 overflow-y-auto p-5">
            {activeSection.render()}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── General settings panel ──────────────────────────────────────────────────
function SettingRow({ title, desc, children }: { title: string; desc?: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
      <div className="min-w-0">
        <div className="text-sm font-medium">{title}</div>
        {desc && <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{desc}</div>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: Array<{ v: T; label: string }>; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
      {options.map((o) => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          className="text-xs px-3 py-1.5"
          style={{
            background: value === o.v ? "var(--accent-cyan)22" : "var(--surface-2)",
            color: value === o.v ? "var(--accent-cyan)" : "var(--text-muted)",
          }}
        >{o.label}</button>
      ))}
    </div>
  );
}

/** A dropdown of one game's accounts for the weekly review — which account that
 *  game's review section summarises. Fetches the hub's own accounts endpoint;
 *  "First saved (auto)" leaves the choice unset so the review uses the first. */
function ReviewAccountPicker({ game, label, endpoint, listKey, idKey, nameOf }: {
  game: ReviewGame; label: string; endpoint: string; listKey: string; idKey: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  nameOf: (a: any) => string;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [accounts, setAccounts] = useState<any[]>([]);
  const [value, setValue] = useState<string>(loadReviewAccount(game) ?? "");
  const [err, setErr] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch(endpoint).then((r) => r.json()).then((d) => { if (alive) setAccounts(Array.isArray(d?.[listKey]) ? d[listKey] : []); })
      .catch(() => { if (alive) setErr(true); });
    return () => { alive = false; };
  }, [endpoint, listKey]);
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-24 shrink-0" style={{ color: "var(--text-muted)" }}>{label}</span>
      <select
        value={value}
        onChange={(e) => { setValue(e.target.value); setReviewAccount(game, e.target.value || null); }}
        className="flex-1 rounded-md px-2 py-1"
        style={{ background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)" }}
      >
        <option value="">First saved (auto)</option>
        {accounts.map((a) => (
          <option key={String(a[idKey])} value={String(a[idKey])}>{nameOf(a)}</option>
        ))}
      </select>
      {err && <span style={{ color: "var(--accent-orange)" }} title="Couldn't load accounts (may be a dev-only DB issue)">⚠</span>}
    </div>
  );
}

/** Multi-select of WoW characters for the review — you may play several, so the
 *  review can summarise more than one (round-4). Empty = the first saved char. */
function ReviewWowPicker() {
  const [chars, setChars] = useState<Array<{ id: number; name: string; realm: string }>>([]);
  const [sel, setSel] = useState<string[]>(loadReviewWowChars());
  const [err, setErr] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch("/api/wow/character").then((r) => r.json()).then((d) => { if (alive) setChars(Array.isArray(d?.characters) ? d.characters : []); })
      .catch(() => { if (alive) setErr(true); });
    return () => { alive = false; };
  }, []);
  function toggle(id: string) {
    const next = sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id];
    setSel(next); setReviewWowChars(next);
  }
  return (
    <div className="flex items-start gap-2 text-xs">
      <span className="w-24 shrink-0 pt-1" style={{ color: "var(--text-muted)" }}>WoW</span>
      <div className="flex-1">
        {chars.length === 0 ? (
          <span style={{ color: "var(--text-muted)" }}>{err ? "⚠ couldn't load characters (dev DB)" : "First saved (auto)"}</span>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {chars.map((c) => {
              const id = String(c.id);
              const on = sel.includes(id);
              return (
                <button key={id} onClick={() => toggle(id)} className="px-2 py-1 rounded-md"
                  style={{ background: on ? "var(--accent-cyan)22" : "var(--surface-2)", color: on ? "var(--accent-cyan)" : "var(--text-muted)", border: `1px solid ${on ? "var(--accent-cyan)" : "var(--border)"}` }}>
                  {on ? "✓ " : ""}{c.name}-{c.realm}
                </button>
              );
            })}
            <span className="w-full text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>{sel.length === 0 ? "None picked → uses your first character" : `${sel.length} selected`}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function GeneralSettings({ onClose }: { onClose?: () => void }) {
  useSettingsTick(); // re-render on external changes
  const [theme, setThemeState] = useState<Theme>("dark");
  const [density, setDensityState] = useState<Density>("comfortable");
  const [currency, setCurrencyState] = useState("DKK");
  const [language, setLanguageState] = useState<Language>("en");
  const [enabled, setEnabled] = useState<Set<WidgetSlug>>(new Set());
  const [order, setOrder] = useState<WidgetSlug[]>(DEFAULT_WIDGET_ORDER);
  const [sections, setSections] = useState<Set<SectionSlug>>(new Set());
  const [refreshOverrides, setRefreshOverrides] = useState<Record<string, number>>({});
  const [briefingRows, setBriefingRows] = useState<Set<BriefingRow>>(new Set());
  const [todaySections, setTodaySections] = useState<Set<TodaySection>>(new Set());
  const [reviewSections, setReviewSections] = useState<Set<ReviewSection>>(new Set());
  const [reviewOn, setReviewOn] = useState(true);

  useEffect(() => {
    setThemeState(loadTheme());
    setDensityState(loadDensity());
    setCurrencyState(loadCurrency());
    setLanguageState(loadLanguage());
    setEnabled(loadWidgetEnabled());
    setOrder(loadWidgetOrder());
    setSections(loadSections());
    setRefreshOverrides(loadRefreshOverrides());
    setBriefingRows(loadBriefingRows());
    setTodaySections(loadTodaySections());
    setReviewSections(loadReviewSections());
    setReviewOn(loadReviewEnabled());
  }, []);

  function toggleBriefingRow(slug: BriefingRow) {
    setBriefingRows((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug); else next.add(slug);
      saveBriefingRows(next);
      return next;
    });
  }
  function toggleTodaySection(slug: TodaySection) {
    setTodaySections((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug); else next.add(slug);
      saveTodaySections(next);
      return next;
    });
  }
  function toggleReviewSection(slug: ReviewSection) {
    setReviewSections((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug); else next.add(slug);
      saveReviewSections(next);
      return next;
    });
  }

  function toggleWidget(slug: WidgetSlug) {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug); else next.add(slug);
      saveWidgetEnabled(next);
      return next;
    });
  }
  function toggleSection(slug: SectionSlug) {
    setSections((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug); else next.add(slug);
      saveSections(next);
      return next;
    });
  }
  function setRefresh(slug: WidgetSlug, minutes: number, def: number) {
    saveRefreshOverride(slug, minutes === def ? null : minutes);
    setRefreshOverrides(loadRefreshOverrides());
  }
  const isCustomOrder = order.some((s, i) => s !== DEFAULT_WIDGET_ORDER[i]);

  return (
    <div className="space-y-5">
      {/* Appearance */}
      <section>
        <h3 className="text-xs uppercase tracking-wide mb-1" style={{ color: "var(--text-muted)" }}>Appearance</h3>
        <SettingRow title="Theme">
          <Segmented value={theme} options={[{ v: "dark", label: "🌙 Dark" }, { v: "light", label: "☀️ Light" }]} onChange={(v) => { setTheme(v); setThemeState(v); }} />
        </SettingRow>
        <SettingRow title="Density" desc="Compact tightens padding + font size.">
          <Segmented value={density} options={[{ v: "comfortable", label: "▥ Comfortable" }, { v: "compact", label: "▤ Compact" }]} onChange={(v) => { setDensity(v); setDensityState(v); }} />
        </SettingRow>
        <SettingRow title="Currency" desc="Used everywhere money is shown (Work, Budget, Subscriptions).">
          <select
            value={currency}
            onChange={(e) => { setCurrency(e.target.value); setCurrencyState(e.target.value); }}
            className="text-xs rounded-lg px-2 py-1.5"
            style={{ background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)" }}
          >
            {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.label}</option>)}
          </select>
        </SettingRow>
        <SettingRow title="Language" desc="English unlocks the international recipe search in Meals; Danish uses your own added dishes. (More of the app will follow this setting over time.)">
          <Segmented value={language} options={LANGUAGES.map((l) => ({ v: l.code, label: l.label }))} onChange={(v) => { setLanguage(v as "en" | "da"); setLanguageState(v as "en" | "da"); }} />
        </SettingRow>
      </section>

      {/* Dashboard sections */}
      <section>
        <h3 className="text-xs uppercase tracking-wide mb-1" style={{ color: "var(--text-muted)" }}>Top-of-dashboard sections</h3>
        <div className="flex flex-wrap gap-2 pt-2">
          {SECTION_META.map(({ slug, label }) => {
            const on = sections.has(slug);
            return (
              <button
                key={slug}
                onClick={() => toggleSection(slug)}
                className="text-xs px-3 py-1.5 rounded-lg"
                style={{
                  background: on ? "var(--accent-cyan)22" : "var(--surface-2)",
                  color: on ? "var(--accent-cyan)" : "var(--text-muted)",
                  border: `1px solid ${on ? "var(--accent-cyan)" : "var(--border)"}`,
                }}
              >{on ? "✓ " : ""}{label}</button>
            );
          })}
        </div>
      </section>

      {/* Today briefing rows */}
      <section>
        <h3 className="text-xs uppercase tracking-wide mb-1" style={{ color: "var(--text-muted)" }}>Today briefing rows</h3>
        <p className="text-xs mb-2" style={{ color: "var(--text-muted)" }}>Which rows show in the Today card at the top of the dashboard.</p>
        <div className="flex flex-wrap gap-2">
          {BRIEFING_ROW_META.map(({ slug, label }) => {
            const on = briefingRows.has(slug);
            return (
              <button key={slug} onClick={() => toggleBriefingRow(slug)} className="text-xs px-3 py-1.5 rounded-lg"
                style={{ background: on ? "var(--accent-cyan)22" : "var(--surface-2)", color: on ? "var(--accent-cyan)" : "var(--text-muted)", border: `1px solid ${on ? "var(--accent-cyan)" : "var(--border)"}` }}>
                {on ? "✓ " : ""}{label}
              </button>
            );
          })}
        </div>
      </section>

      {/* Today in full (/today page) */}
      <section>
        <h3 className="text-xs uppercase tracking-wide mb-1" style={{ color: "var(--text-muted)" }}>Today in full</h3>
        <p className="text-xs mb-2" style={{ color: "var(--text-muted)" }}>Which sections show on the full ☀️ Today page (reached from the dashboard pill). Each still only appears when it has something for today.</p>
        <div className="flex flex-wrap gap-2">
          {TODAY_SECTION_META.map(({ slug, label }) => {
            const on = todaySections.has(slug);
            return (
              <button key={slug} onClick={() => toggleTodaySection(slug)} className="text-xs px-3 py-1.5 rounded-lg"
                style={{ background: on ? "var(--accent-cyan)22" : "var(--surface-2)", color: on ? "var(--accent-cyan)" : "var(--text-muted)", border: `1px solid ${on ? "var(--accent-cyan)" : "var(--border)"}` }}>
                {on ? "✓ " : ""}{label}
              </button>
            );
          })}
        </div>
      </section>

      {/* Weekly review */}
      <section>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-xs uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Weekly review</h3>
          <Segmented value={reviewOn ? "on" : "off"} options={[{ v: "on", label: "On" }, { v: "off", label: "Off" }]} onChange={(v) => { const on = v === "on"; setReviewEnabled(on); setReviewOn(on); }} />
        </div>
        <p className="text-xs mb-2" style={{ color: "var(--text-muted)" }}>The `/review` page + its pill under the header. Pick which sections it shows.</p>
        <div className="flex flex-wrap gap-2" style={{ opacity: reviewOn ? 1 : 0.4, pointerEvents: reviewOn ? "auto" : "none" }}>
          {REVIEW_SECTION_META.map(({ slug, label }) => {
            const on = reviewSections.has(slug);
            return (
              <button key={slug} onClick={() => toggleReviewSection(slug)} className="text-xs px-3 py-1.5 rounded-lg"
                style={{ background: on ? "var(--accent-cyan)22" : "var(--surface-2)", color: on ? "var(--accent-cyan)" : "var(--text-muted)", border: `1px solid ${on ? "var(--accent-cyan)" : "var(--border)"}` }}>
                {on ? "✓ " : ""}{label}
              </button>
            );
          })}
        </div>
        {/* Per-game account pickers — which account each game section summarises. */}
        {reviewOn && (reviewSections.has("lol") || reviewSections.has("faceit") || reviewSections.has("wow")) && (
          <div className="mt-3 space-y-2" style={{ opacity: reviewOn ? 1 : 0.4 }}>
            <div className="text-[11px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Which account feeds each game</div>
            {reviewSections.has("lol") && <ReviewAccountPicker game="lol" label="League" endpoint="/api/lol/account" listKey="accounts" idKey="id" nameOf={(a) => `${a.gameName}#${a.tagLine}`} />}
            {reviewSections.has("faceit") && <ReviewAccountPicker game="faceit" label="CS2 / FACEIT" endpoint="/api/faceit/accounts" listKey="accounts" idKey="id" nameOf={(a) => String(a.nickname)} />}
            {reviewSections.has("wow") && <ReviewWowPicker />}
          </div>
        )}
      </section>

      {/* Widgets */}
      <section>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-xs uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Widgets ({enabled.size}/{WIDGET_META.length})</h3>
          {isCustomOrder && (
            <button
              onClick={() => { saveWidgetOrder(DEFAULT_WIDGET_ORDER); setOrder(DEFAULT_WIDGET_ORDER); }}
              className="text-[11px] px-2 py-0.5 rounded"
              style={{ background: "var(--surface-2)", color: "var(--text-muted)", border: "1px solid var(--border)" }}
            >Reset order</button>
          )}
        </div>
        <p className="text-xs mb-2" style={{ color: "var(--text-muted)" }}>Toggle visibility and set each widget's auto-refresh. Drag to reorder happens on the dashboard itself.</p>
        <div className="space-y-1">
          {order.map((slug) => {
            const meta = WIDGET_META_BY_SLUG[slug];
            const on = enabled.has(slug);
            const def = meta.defaultRefreshMin ?? 0;
            const effective = refreshOverrides[slug] ?? def;
            const canRefresh = def > 0 || slug in refreshOverrides;
            return (
              <div key={slug} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg" style={{ background: "var(--surface-2)" }}>
                <label className="flex items-center gap-2 cursor-pointer flex-1 min-w-0">
                  <input type="checkbox" checked={on} onChange={() => toggleWidget(slug)} />
                  <span className="text-sm">{meta.label}</span>
                  {meta.size === "wide" && <span className="text-[10px] px-1 rounded" style={{ background: "var(--border)", color: "var(--text-muted)" }}>wide</span>}
                </label>
                {canRefresh && (
                  <select
                    value={effective}
                    onChange={(e) => setRefresh(slug, Number(e.target.value), def)}
                    className="text-xs rounded px-1.5 py-1"
                    style={{ background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)" }}
                    title="Auto-refresh interval"
                  >
                    {REFRESH_OPTIONS_MIN.map((m) => (
                      <option key={m} value={m}>{m === 0 ? "Off" : `${m} min`}{m === def ? " (default)" : ""}</option>
                    ))}
                  </select>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Setup */}
      <section id="general-setup">
        <h3 className="text-xs uppercase tracking-wide mb-1" style={{ color: "var(--text-muted)" }}>Setup</h3>
        <SettingRow title="Re-run first-time setup" desc="Reopen the guided onboarding wizard. Won't wipe anything you've configured.">
          <button
            onClick={() => { onClose?.(); window.dispatchEvent(new Event(OPEN_ONBOARDING_EVENT)); }}
            className="text-xs px-3 py-1.5 rounded-lg"
            style={{ background: "var(--accent-cyan)22", color: "var(--accent-cyan)", border: "1px solid var(--accent-cyan)" }}
          >Re-run setup</button>
        </SettingRow>
      </section>
    </div>
  );
}

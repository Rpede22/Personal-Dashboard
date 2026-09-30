"use client";

import { useCallback, useEffect, useState } from "react";
import HubShell from "@/components/HubShell";
import type { SteamWishlist, WishlistItem, SteamProfile, SteamGame } from "@/lib/steam";
import { steamCapsule, steamStoreUrl, formatPlaytime } from "@/lib/steam";

const ACCENT = "var(--accent-blue)";

export default function SteamHub() {
  const [steamId, setSteamId] = useState<string | null>(null);
  const [hasKey, setHasKey] = useState(false);
  const [wishlist, setWishlist] = useState<SteamWishlist | null>(null);
  const [profile, setProfile] = useState<SteamProfile | null>(null);
  const [loadingWishlist, setLoadingWishlist] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftId, setDraftId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadWishlist = useCallback(async () => {
    setLoadingWishlist(true);
    try {
      const res = await fetch("/api/steam/wishlist");
      setWishlist(await res.json());
    } catch { setWishlist(null); }
    finally { setLoadingWishlist(false); }
  }, []);

  const loadProfile = useCallback(async () => {
    try {
      const res = await fetch("/api/steam/profile");
      setProfile(await res.json());
    } catch { setProfile(null); }
  }, []);

  const loadAll = useCallback(() => { loadWishlist(); loadProfile(); }, [loadWishlist, loadProfile]);

  useEffect(() => {
    fetch("/api/steam/config").then((r) => r.json()).then((c) => {
      setSteamId(c.steamId ?? "");
      setHasKey(!!c.hasKey);
      setDraftId(c.steamId ?? "");
      if (c.steamId) loadAll();
    }).catch(() => setSteamId(""));
  }, [loadAll]);

  async function saveId() {
    const id = draftId.trim();
    setSaving(true); setError(null);
    try {
      const res = await fetch("/api/steam/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ steamId: id }),
      });
      const j = await res.json();
      if (!res.ok) { setError(j.error ?? "Couldn't save that SteamID."); return; }
      setSteamId(j.steamId);
      setDraftId(j.steamId ?? "");
      setEditing(false);
      if (j.steamId) loadAll(); else { setWishlist(null); setProfile(null); }
    } catch { setError("Network error."); }
    finally { setSaving(false); }
  }

  const inputStyle = { background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)" } as const;
  const showSetup = steamId === "" || editing;

  return (
    <HubShell title="Steam" emoji="🎮" color={ACCENT}
      tabs={
        <div className="flex items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
          {wishlist && !wishlist.needsId && <span>{wishlist.items.length} wishlisted</span>}
          {wishlist && wishlist.onSaleCount > 0 && (
            <span className="font-bold px-1.5 py-0.5 rounded" style={{ background: "var(--accent-green)", color: "#fff" }}>{wishlist.onSaleCount} on sale</span>
          )}
        </div>
      }
    >
      <div className="space-y-5 max-w-4xl mx-auto">
        {steamId === null ? (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>Loading…</p>
        ) : showSetup ? (
          <div className="rounded-2xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
            <div className="text-xs uppercase tracking-wide mb-2" style={{ color: "var(--text-muted)" }}>Your SteamID</div>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text" placeholder={hasKey ? "SteamID64, profile URL, or custom-URL name" : "SteamID64 — a 17-digit number (7656…)"}
                value={draftId} onChange={(e) => setDraftId(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") saveId(); }}
                className="text-sm px-2 py-1.5 rounded-md flex-1" style={inputStyle}
              />
              <button onClick={saveId} disabled={saving} className="text-sm px-4 py-1.5 rounded-md disabled:opacity-40"
                style={{ background: `${ACCENT}22`, color: ACCENT, border: `1px solid ${ACCENT}` }}>{saving ? "Saving…" : "Save"}</button>
              {editing && <button onClick={() => { setEditing(false); setDraftId(steamId ?? ""); }} className="text-sm px-3 py-1.5 rounded-md" style={{ color: "var(--text-muted)" }}>Cancel</button>}
            </div>
            {error && <div className="text-xs mt-2" style={{ color: "var(--accent-red)" }}>{error}</div>}
            <div className="text-[11px] mt-2" style={{ color: "var(--text-muted)" }}>
              {hasKey ? (
                <>Paste your <strong>profile URL</strong>, custom-URL name, or SteamID64 — all work. </>
              ) : (
                <>Find your SteamID64 at{" "}
                <a href="https://steamdb.info/calculator/" target="_blank" rel="noreferrer" className="underline" style={{ color: ACCENT }}>steamdb.info/calculator</a>{" "}
                (paste your profile URL). </>
              )}
              Your Steam profile <strong>and</strong> game details must be set to public for the wishlist + playtime to load{hasKey ? "." : " — no login or API key needed."}
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 text-sm">
              {profile?.persona?.avatar && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.persona.avatar} alt="" className="w-8 h-8 rounded" style={{ border: "1px solid var(--border)" }} />
              )}
              <span style={{ color: "var(--text)" }}>
                {profile?.persona?.personaName ?? "Steam profile"}
                <span className="ml-2 text-xs" style={{ color: "var(--text-muted)" }}>{steamId}</span>
              </span>
              <button onClick={() => { setEditing(true); setDraftId(steamId ?? ""); }} className="text-xs" style={{ color: ACCENT }}>Change</button>
              <button onClick={loadAll} disabled={loadingWishlist} className="text-xs ml-auto" style={{ color: ACCENT }}>{loadingWishlist ? "Refreshing…" : "⟳ Refresh"}</button>
            </div>

            {!hasKey && (
              <div className="rounded-xl p-3 text-xs" style={{ background: "var(--surface)", border: "1px dashed var(--border)", color: "var(--text-muted)" }}>
                🔑 <strong style={{ color: "var(--text)" }}>Recently-played + playtime stats need a Steam Web API key.</strong> It&apos;s free — grab one at{" "}
                <a href="https://steamcommunity.com/dev/apikey" target="_blank" rel="noreferrer" className="underline" style={{ color: ACCENT }}>steamcommunity.com/dev/apikey</a>{" "}
                and add it as <code style={{ color: "var(--text)" }}>STEAM_API_KEY</code> in <code style={{ color: "var(--text)" }}>.env.local</code>, then relaunch. The wishlist below works without it.
              </div>
            )}

            {/* Recently played (keyed) */}
            {profile && profile.recentlyPlayed.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold mb-2" style={{ color: "var(--text)" }}>Recently played <span className="text-xs font-normal" style={{ color: "var(--text-muted)" }}>· past 2 weeks</span></h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {profile.recentlyPlayed.map((g) => <PlayedCard key={g.appid} g={g} recent />)}
                </div>
              </section>
            )}

            {/* Playtime stats (keyed) */}
            {profile && (profile.gameCount > 0 || profile.topPlayed.length > 0) && (
              <section>
                <div className="flex items-baseline gap-3 mb-2">
                  <h2 className="text-sm font-semibold" style={{ color: "var(--text)" }}>Library</h2>
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {profile.gameCount.toLocaleString()} games · {formatPlaytime(profile.totalPlaytimeMin)} total
                  </span>
                </div>
                {profile.topPlayed.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {profile.topPlayed.map((g) => <PlayedCard key={g.appid} g={g} />)}
                  </div>
                )}
              </section>
            )}
            {hasKey && profile?.error && profile.recentlyPlayed.length === 0 && profile.topPlayed.length === 0 && (
              <div className="rounded-xl p-3 text-xs" style={{ background: "var(--surface)", border: "1px dashed var(--border)", color: "var(--accent-orange)" }}>{profile.error}</div>
            )}

            {/* Achievements for recently-played games (#6, keyed) */}
            {profile?.achievements && profile.achievements.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold mb-2" style={{ color: "var(--text)" }}>
                  Achievements <span className="text-xs font-normal" style={{ color: "var(--text-muted)" }}>· recently played</span>
                </h2>
                <div className="space-y-2">
                  {profile.achievements.map((a) => {
                    const done = a.pct >= 100;
                    return (
                      <a key={a.appid} href={steamStoreUrl(a.appid)} target="_blank" rel="noreferrer"
                        className="block rounded-xl p-3 hover:brightness-110" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                        <div className="flex items-center justify-between text-sm mb-1.5">
                          <span className="font-medium truncate">{a.name}</span>
                          <span className="text-xs shrink-0 ml-2" style={{ color: done ? "var(--accent-green)" : "var(--text-muted)" }}>
                            {done ? "✓ 100%" : `${a.achieved}/${a.total} · ${a.pct}%`}
                          </span>
                        </div>
                        <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--surface-2)" }}>
                          <div className="h-full rounded-full" style={{ width: `${a.pct}%`, background: done ? "var(--accent-green)" : ACCENT }} />
                        </div>
                      </a>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Backlog — owned games never launched (#6, keyed) */}
            {profile && profile.unplayedCount > 0 && (
              <section>
                <div className="flex items-baseline gap-3 mb-2">
                  <h2 className="text-sm font-semibold" style={{ color: "var(--text)" }}>Backlog</h2>
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {profile.unplayedCount.toLocaleString()} never-played game{profile.unplayedCount === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {profile.unplayed.map((g) => (
                    <a key={g.appid} href={steamStoreUrl(g.appid)} target="_blank" rel="noreferrer"
                      className="text-xs px-2 py-1 rounded-lg hover:brightness-110" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-muted)" }}
                      title={g.name}>
                      {g.name.length > 28 ? g.name.slice(0, 27) + "…" : g.name}
                    </a>
                  ))}
                  {profile.unplayedCount > profile.unplayed.length && (
                    <span className="text-xs px-2 py-1" style={{ color: "var(--text-muted)" }}>+{profile.unplayedCount - profile.unplayed.length} more</span>
                  )}
                </div>
              </section>
            )}

            <h2 className="text-sm font-semibold pt-1" style={{ color: "var(--text)" }}>Wishlist</h2>

            {loadingWishlist && !wishlist ? (
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>Loading wishlist + prices…</p>
            ) : wishlist?.error ? (
              <div className="rounded-2xl p-6 text-center text-sm" style={{ background: "var(--surface)", border: "1px dashed var(--border)", color: "var(--accent-orange)" }}>{wishlist.error}</div>
            ) : wishlist && wishlist.items.length === 0 ? (
              <div className="rounded-2xl p-6 text-center text-sm" style={{ background: "var(--surface)", border: "1px dashed var(--border)", color: "var(--text-muted)" }}>
                Wishlist is empty (or not public).
              </div>
            ) : wishlist ? (
              <>
                {wishlist.onSaleCount > 0 && (
                  <div className="rounded-xl p-3 text-sm font-medium" style={{ background: "var(--accent-green)18", color: "var(--accent-green)", border: "1px solid var(--accent-green)" }}>
                    🏷️ {wishlist.onSaleCount} item{wishlist.onSaleCount === 1 ? "" : "s"} on your wishlist {wishlist.onSaleCount === 1 ? "is" : "are"} on sale
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {wishlist.items.map((item) => <GameCard key={item.appid} item={item} />)}
                </div>
              </>
            ) : null}
          </>
        )}
      </div>
    </HubShell>
  );
}

function PlayedCard({ g, recent }: { g: SteamGame; recent?: boolean }) {
  return (
    <a href={steamStoreUrl(g.appid)} target="_blank" rel="noreferrer"
      className="rounded-xl overflow-hidden flex items-center gap-3 p-2 hover:brightness-110"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={steamCapsule(g.appid)} alt="" className="rounded object-cover shrink-0" style={{ width: 92, height: 35 }} onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate">{g.name}</div>
        <div className="text-xs" style={{ color: "var(--text-muted)" }}>
          {recent && g.playtimeRecentMin != null ? (
            <><span style={{ color: ACCENT }}>{formatPlaytime(g.playtimeRecentMin)}</span> recent · {formatPlaytime(g.playtimeForeverMin)} total</>
          ) : (
            <>{formatPlaytime(g.playtimeForeverMin)} played</>
          )}
        </div>
      </div>
    </a>
  );
}

function GameCard({ item }: { item: WishlistItem }) {
  return (
    <a href={`https://store.steampowered.com/app/${item.appid}`} target="_blank" rel="noreferrer"
      className="rounded-xl overflow-hidden flex flex-col hover:brightness-110"
      style={{ background: "var(--surface)", border: `1px solid ${item.onSale ? "var(--accent-green)" : "var(--border)"}` }}>
      {item.header && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.header} alt="" className="w-full object-cover" style={{ aspectRatio: "460/215" }} />
      )}
      <div className="p-2 flex items-center gap-2">
        <span className="text-sm font-medium flex-1 min-w-0 truncate">{item.name}</span>
        {item.onSale && (
          <span className="text-[11px] font-bold px-1.5 py-0.5 rounded shrink-0" style={{ background: "var(--accent-green)", color: "#fff" }}>−{item.discountPct}%</span>
        )}
      </div>
      <div className="px-2 pb-2 text-xs flex items-baseline gap-2">
        {item.isFree ? (
          <span style={{ color: "var(--accent-green)" }}>Free</span>
        ) : (
          <>
            {item.priceInitial && <span className="line-through" style={{ color: "var(--text-muted)" }}>{item.priceInitial}</span>}
            <span className="font-semibold" style={{ color: item.onSale ? "var(--accent-green)" : "var(--text)" }}>{item.priceFinal ?? "—"}</span>
          </>
        )}
      </div>
    </a>
  );
}

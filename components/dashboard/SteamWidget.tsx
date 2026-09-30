"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Card, { CardHeader } from "@/components/Card";
import type { SteamWishlist, SteamProfile } from "@/lib/steam";
import { formatPlaytime } from "@/lib/steam";
import { useRefreshMs } from "@/lib/useRefreshMs";

/** Steam: recently-played + library stats (when keyed) + wishlist sales. Links to /steam. */
export default function SteamWidget() {
  const [wishlist, setWishlist] = useState<SteamWishlist | null>(null);
  const [profile, setProfile] = useState<SteamProfile | null>(null);
  const refreshMs = useRefreshMs("steam", 60);

  async function load() {
    try {
      const res = await fetch("/api/steam/wishlist");
      setWishlist(await res.json());
    } catch { setWishlist(null); }
    try {
      const p = await fetch("/api/steam/profile");
      setProfile(p.ok ? await p.json() : null);
    } catch { setProfile(null); }
  }
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (refreshMs === 0) return;
    const iv = setInterval(load, refreshMs);
    return () => clearInterval(iv);
  }, [refreshMs]);

  const onSale = wishlist?.items.filter((i) => i.onSale) ?? [];
  const top = (onSale.length > 0 ? onSale : wishlist?.items ?? []).slice(0, 3);
  const hasProfile = profile && !profile.needsId && !profile.needsKey && (profile.gameCount > 0 || profile.recentlyPlayed.length > 0);
  const recent = profile?.recentlyPlayed?.[0];

  return (
    <Card accentColor="var(--accent-blue)">
      <CardHeader
        icon="🎮"
        title="Steam"
        subtitle={wishlist && !wishlist.needsId ? `${wishlist.items.length} wishlisted${wishlist.onSaleCount ? ` · ${wishlist.onSaleCount} on sale` : ""}` : "Wishlist sales"}
        accentColor="var(--accent-blue)"
      />
      {/* Profile: recently played + library stats (keyed) */}
      {hasProfile && (
        <div className="mb-2 space-y-1.5">
          {recent && (
            <div className="text-sm flex items-center gap-2 rounded-md px-2 py-1" style={{ background: "var(--surface-2)" }}>
              <span className="shrink-0">🕹️</span>
              <span className="flex-1 min-w-0 truncate">{recent.name}</span>
              <span className="text-xs shrink-0" style={{ color: "var(--accent-blue)" }}>{formatPlaytime(recent.playtimeRecentMin ?? 0)} · 2 wks</span>
            </div>
          )}
          <div className="text-[11px] flex flex-wrap gap-x-3" style={{ color: "var(--text-muted)" }}>
            <span>{profile!.gameCount.toLocaleString()} games</span>
            <span>{formatPlaytime(profile!.totalPlaytimeMin)} total</span>
            {profile!.unplayedCount > 0 && <span>{profile!.unplayedCount} unplayed</span>}
          </div>
        </div>
      )}
      {wishlist === null ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>Loading…</p>
      ) : wishlist.needsId ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>Add your SteamID in the hub to track wishlist sales.</p>
      ) : top.length === 0 ? (
        !hasProfile ? <p className="text-sm" style={{ color: "var(--text-muted)" }}>Wishlist is empty or not public.</p> : null
      ) : (
        <ul className="space-y-1.5">
          {top.map((item) => (
            <li key={item.appid} className="text-sm flex items-center gap-2 rounded-md px-2 py-1" style={{ background: item.onSale ? "var(--accent-green)18" : "var(--surface-2)" }}>
              <span className="flex-1 min-w-0 truncate">{item.name}</span>
              {item.onSale && <span className="text-[10px] font-bold px-1 rounded shrink-0" style={{ background: "var(--accent-green)", color: "#fff" }}>−{item.discountPct}%</span>}
              <span className="text-xs shrink-0" style={{ color: item.onSale ? "var(--accent-green)" : "var(--text-muted)" }}>{item.isFree ? "Free" : item.priceFinal ?? ""}</span>
            </li>
          ))}
        </ul>
      )}
      <Link href="/steam" className="block text-[11px] mt-2" style={{ color: "var(--accent-blue)" }}>Open hub →</Link>
    </Card>
  );
}

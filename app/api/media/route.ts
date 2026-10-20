import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/** Danish TV show tracker — manual entry. Zero-schema-magic:
 *    GET  /api/media                 → list shows
 *    POST /api/media                 → create { title, channel?, airDays?, airTime?, notes?, active? }
 *    PATCH /api/media                → update { id, ...fields } (also handles sortOrder + episodesSeen)
 *    DELETE /api/media?id=X          → remove a show
 */

function normDays(v: unknown): string {
  if (Array.isArray(v)) return v.map((n) => Math.max(0, Math.min(6, Math.floor(Number(n))))).filter((n) => Number.isFinite(n)).sort().join(",");
  if (typeof v === "string") return v.split(",").map((s) => s.trim()).filter(Boolean).join(",");
  return "";
}

/** Monday of the current local week as YYYY-MM-DD (the weekly check-off key). */
function currentMonday(now = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const off = (d.getDay() + 6) % 7; // Mon = 0
  d.setDate(d.getDate() - off);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Watched weekday numbers for THIS week only — [] if the stored record is from
 *  a previous week (auto-reset each Monday). */
function watchedThisWeek(json: string | null | undefined, monday: string): number[] {
  if (!json) return [];
  try {
    const p = JSON.parse(json);
    if (p?.week !== monday || !Array.isArray(p?.days)) return [];
    return p.days.filter((n: unknown) => Number.isInteger(n)).map((n: number) => Math.max(0, Math.min(6, n)));
  } catch { return []; }
}

export async function GET() {
  const shows = await prisma.mediaShow.findMany({ orderBy: [{ sortOrder: "asc" }, { id: "asc" }] });
  const monday = currentMonday();
  // Attach each show's valid-for-this-week watched days (so the client doesn't
  // have to re-implement the reset logic).
  const withWatched = shows.map((s) => ({ ...s, watchedThisWeek: watchedThisWeek(s.weeklyWatchedJson, monday) }));
  return NextResponse.json({ shows: withWatched, weekMonday: monday });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const title = String(body.title ?? "").trim();
  if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });
  const airDays = normDays(body.airDays);
  const airTime = /^\d{2}:\d{2}$/.test(String(body.airTime ?? "")) ? String(body.airTime) : "";
  // maxEpisodes: null (no cap) or a positive int. Empty/undefined → null.
  const maxRaw = body.maxEpisodes;
  const maxEpisodes = maxRaw === "" || maxRaw == null
    ? null
    : Number.isInteger(Number(maxRaw)) && Number(maxRaw) > 0 ? Math.floor(Number(maxRaw)) : null;
  const show = await prisma.mediaShow.create({
    data: {
      title,
      channel: String(body.channel ?? "").trim(),
      airDays,
      airTime,
      active: body.active === undefined ? true : Boolean(body.active),
      notes: String(body.notes ?? ""),
      maxEpisodes,
    },
  });
  return NextResponse.json(show);
}

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => ({}));
  const id = Number(body.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "id required" }, { status: 400 });
  const data: Record<string, unknown> = {};
  if ("title" in body) data.title = String(body.title ?? "").trim();
  if ("channel" in body) data.channel = String(body.channel ?? "").trim();
  if ("airDays" in body) data.airDays = normDays(body.airDays);
  if ("airTime" in body) {
    const t = String(body.airTime ?? "");
    data.airTime = /^\d{2}:\d{2}$/.test(t) ? t : "";
  }
  if ("active" in body) data.active = Boolean(body.active);
  if ("notes" in body) data.notes = String(body.notes ?? "");
  if ("sortOrder" in body) data.sortOrder = Number(body.sortOrder) || 0;
  if ("episodesSeen" in body) data.episodesSeen = Math.max(0, Number(body.episodesSeen) || 0);
  if ("maxEpisodes" in body) {
    const v = body.maxEpisodes;
    data.maxEpisodes = v === "" || v == null
      ? null
      : Number.isInteger(Number(v)) && Number(v) > 0 ? Math.floor(Number(v)) : null;
  }
  // Weekly episode check-off: toggle a weekday for the current week (auto-reset
  // if the stored record is from a previous week).
  const monday = currentMonday();
  if ("toggleDay" in body) {
    const day = Math.max(0, Math.min(6, Math.floor(Number(body.toggleDay))));
    const existing = await prisma.mediaShow.findUnique({ where: { id } });
    const cur = watchedThisWeek(existing?.weeklyWatchedJson, monday);
    const next = cur.includes(day) ? cur.filter((d) => d !== day) : [...cur, day].sort((a, b) => a - b);
    data.weeklyWatchedJson = JSON.stringify({ week: monday, days: next });
  }
  const show = await prisma.mediaShow.update({ where: { id }, data });
  return NextResponse.json({ ...show, watchedThisWeek: watchedThisWeek(show.weeklyWatchedJson, monday) });
}

export async function DELETE(request: Request) {
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id)) return NextResponse.json({ error: "id required" }, { status: 400 });
  await prisma.mediaShow.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

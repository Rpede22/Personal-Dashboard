import { NextResponse } from "next/server";
import { SPORTS_TEAMS } from "@/lib/sports-config";

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0 Safari/537.36";

const cache = new Map<string, { data: unknown; ts: number }>();
const TTL = 60 * 60 * 1000; // 1 h — finished match goals never change

// Slugs with ESPN coverage — everything else falls back to Sofascore
const SLUG_TO_ESPN: Record<string, string> = {
  "barcelona": "ESP.1", // La Liga
};

export interface GoalEvent {
  minute: number;
  extraMinute: number | null;
  scorer: string;
  assist: string | null;
  type: "REGULAR" | "PENALTY" | "OWN_GOAL";
  isHome: boolean;
  homeScore: number;
  awayScore: number;
}

// ── ESPN source ───────────────────────────────────────────────────────────────
async function fetchFromESPN(espnLeague: string, date: string, keyword: string): Promise<GoalEvent[] | null> {
  const dateStr = date.replace(/-/g, "");
  const boardRes = await fetch(`${ESPN_BASE}/${espnLeague}/scoreboard?dates=${dateStr}`);
  if (!boardRes.ok) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const board: any = await boardRes.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const events: any[] = board.events ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const event = events.find((ev: any) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ev.competitions?.[0]?.competitors?.some((c: any) =>
      (c.team?.displayName ?? "").toLowerCase().includes(keyword) ||
      (c.team?.shortDisplayName ?? "").toLowerCase().includes(keyword)
    )
  );
  if (!event) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const competitors: any[] = event.competitions?.[0]?.competitors ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const homeTeamId: string = competitors.find((c: any) => c.homeAway === "home")?.team?.id ?? "";

  const summaryRes = await fetch(`${ESPN_BASE}/${espnLeague}/summary?event=${event.id}`);
  if (!summaryRes.ok) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const summary: any = await summaryRes.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scoringEvents = (summary.keyEvents ?? []).filter((e: any) => e.scoringPlay === true);

  let homeGoals = 0;
  let awayGoals = 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return scoringEvents.map((ev: any) => {
    const clockStr = (ev.clock?.displayValue ?? "0").replace(/'/g, "").trim();
    const [minStr, extraStr] = clockStr.split("+");
    const minute = parseInt(minStr, 10) || 0;
    const extraMinute = extraStr ? parseInt(extraStr, 10) || null : null;
    const typeCode: string = ev.type?.type ?? "";
    const type: GoalEvent["type"] =
      typeCode.includes("own") ? "OWN_GOAL" : typeCode.includes("penalty") ? "PENALTY" : "REGULAR";
    const scorer = ev.participants?.[0]?.athlete?.displayName ?? "Unknown";
    const isHome = ev.team?.id === homeTeamId;
    if (type !== "OWN_GOAL") { if (isHome) homeGoals++; else awayGoals++; }
    else { if (isHome) awayGoals++; else homeGoals++; }
    return { minute, extraMinute, scorer, assist: null, type, isHome, homeScore: homeGoals, awayScore: awayGoals };
  });
}

// ── FotMob source (no key required) ───────────────────────────────────────────
// FotMob's matchDetails payload embeds the goal timeline under several keys
// depending on the match (`content.matchFacts.events.events`, per-player event
// lists, header summaries, …). Naively walking the whole payload double-counts
// the same goal from multiple paths and matches aggregate objects that have
// `type: "Goal"` but no real scorer or minute. We accept only nodes that
// carry BOTH a scorer name AND a real minute, then dedupe by (minute+scorer+isHome).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function walkForFotMobGoals(root: any): GoalEvent[] | null {
  interface Raw { minute: number; extraMinute: number | null; scorer: string; assist: string | null; type: GoalEvent["type"]; isHome: boolean }
  const raw: Raw[] = [];
  const seen = new WeakSet<object>();

  function extractMinute(obj: Record<string, unknown>): { minute: number; extraMinute: number | null } | null {
    // FotMob variants: `time` can be a number OR an object like { minutes, addedMinutes }.
    const t = obj.time;
    if (typeof t === "number") return { minute: t, extraMinute: typeof obj.overloadTime === "number" ? (obj.overloadTime as number) : null };
    if (t && typeof t === "object") {
      const to = t as Record<string, unknown>;
      if (typeof to.minutes === "number") {
        return { minute: to.minutes, extraMinute: typeof to.addedMinutes === "number" ? (to.addedMinutes as number) : null };
      }
    }
    if (typeof obj.minute === "number") {
      return { minute: obj.minute as number, extraMinute: typeof obj.minuteAddition === "number" ? (obj.minuteAddition as number) : null };
    }
    if (typeof obj.timeStr === "string") {
      const m = /^(\d+)(?:\+(\d+))?/.exec(obj.timeStr);
      if (m) return { minute: parseInt(m[1], 10), extraMinute: m[2] ? parseInt(m[2], 10) : null };
    }
    return null;
  }

  function extractScorer(obj: Record<string, unknown>): string | null {
    const p = asObj(obj.player);
    if (p && typeof p.name === "string" && p.name.trim()) return p.name;
    if (typeof obj.playerName === "string" && (obj.playerName as string).trim()) return obj.playerName as string;
    if (typeof obj.nameStr === "string" && (obj.nameStr as string).trim()) return obj.nameStr as string;
    return null;
  }

  function visit(node: unknown): void {
    if (!node || typeof node !== "object") return;
    if (seen.has(node as object)) return;
    seen.add(node as object);
    if (Array.isArray(node)) { for (const child of node) visit(child); return; }
    const obj = node as Record<string, unknown>;
    const typeRaw = (obj.type ?? obj.typeOfEvent ?? obj.eventType);
    const typeStr = typeof typeRaw === "string" ? typeRaw.toLowerCase() : null;
    if (typeStr && (typeStr === "goal" || typeStr === "own goal" || typeStr === "penalty" || typeStr === "penalty goal")) {
      const time = extractMinute(obj);
      const scorer = extractScorer(obj);
      // Skip aggregate/summary nodes that lack real per-event data.
      if (time && scorer) {
        const assistObj = asObj(obj.assistPlayer) ?? asObj(obj.assist);
        const assist = assistObj && typeof assistObj.name === "string" ? assistObj.name : null;
        const type: GoalEvent["type"] =
          typeStr === "own goal" ? "OWN_GOAL" :
          typeStr.includes("penalty") ? "PENALTY" : "REGULAR";
        raw.push({ minute: time.minute, extraMinute: time.extraMinute, scorer, assist, type, isHome: obj.isHome === true });
      }
    }
    for (const v of Object.values(obj)) visit(v);
  }
  visit(root);
  if (raw.length === 0) return null;

  // Dedupe: same minute + scorer + side = same real-world goal captured from
  // more than one payload path. Prefer the row that has an assist over one
  // that doesn't.
  const byKey = new Map<string, Raw>();
  for (const g of raw) {
    const key = `${g.minute}-${g.extraMinute ?? ""}-${g.scorer}-${g.isHome ? "h" : "a"}`;
    const prev = byKey.get(key);
    if (!prev || (!prev.assist && g.assist)) byKey.set(key, g);
  }
  const deduped = [...byKey.values()];

  deduped.sort((a, b) => (a.minute - b.minute) || ((a.extraMinute ?? 0) - (b.extraMinute ?? 0)));

  let h = 0, aw = 0;
  const out: GoalEvent[] = [];
  for (const g of deduped) {
    const creditHome = g.type === "OWN_GOAL" ? !g.isHome : g.isHome;
    if (creditHome) h++; else aw++;
    out.push({ ...g, homeScore: h, awayScore: aw });
  }
  return out;
}

async function fetchFromFotMob(matchId: string): Promise<GoalEvent[] | null> {
  if (!matchId) return null;
  try {
    const res = await fetch(`https://www.fotmob.com/api/data/matchDetails?matchId=${matchId}`, {
      headers: { "User-Agent": UA, "Accept": "application/json" },
    });
    if (!res.ok) return null;
    const j = await res.json();
    return walkForFotMobGoals(j);
  } catch { return null; }
}

function asObj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

// ── SportAPI7 (Sofascore-compatible) source ───────────────────────────────────
const SA7_BASE = "https://sportapi7.p.rapidapi.com";
const SA7_HOST = "sportapi7.p.rapidapi.com";

// Map sports-config `sport` values → SportAPI7 URL slugs
const SA7_SPORT: Record<string, string> = {
  football:  "football",
  icehockey: "ice-hockey",
};

async function fetchFromSportAPI7(slug: string, date: string): Promise<GoalEvent[] | null> {
  const key = process.env.RAPIDAPI_KEY;
  if (!key) return null;

  const team = SPORTS_TEAMS[slug];
  if (!team) return null;

  const headers = {
    "Content-Type": "application/json",
    "x-rapidapi-host": SA7_HOST,
    "x-rapidapi-key":  key,
  };

  // Step 1: get all events for this sport on this date and find our team's match
  const sportSlug = SA7_SPORT[team.sport ?? "football"] ?? "football";
  const schedRes = await fetch(`${SA7_BASE}/api/v1/sport/${sportSlug}/scheduled-events/${date}`, { headers });
  if (!schedRes.ok) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const schedData: any = await schedRes.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allEvents: any[] = schedData.events ?? [];

  const keyword = (team.matchKeyword ?? slug.replace(/-/g, " ")).toLowerCase();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const event = allEvents.find((ev: any) =>
    (ev.homeTeam?.name ?? "").toLowerCase().includes(keyword) ||
    (ev.awayTeam?.name  ?? "").toLowerCase().includes(keyword)
  );
  if (!event) return null;

  // Step 2: get incidents for this event
  const incRes = await fetch(`${SA7_BASE}/api/v1/event/${event.id}/incidents`, { headers });
  if (!incRes.ok) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const incData: any = await incRes.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const incidents: any[] = incData.incidents ?? [];

  let homeGoals = 0;
  let awayGoals = 0;

  const goals: GoalEvent[] = [];
  for (const inc of incidents) {
    if (inc.incidentType !== "goal") continue;
    const cls: string = (inc.incidentClass ?? "").toLowerCase();
    const type: GoalEvent["type"] =
      cls.includes("own")     ? "OWN_GOAL" :
      cls.includes("penalty") ? "PENALTY"  : "REGULAR";
    const isHome: boolean = inc.isHome === true;
    if (type !== "OWN_GOAL") { if (isHome) homeGoals++; else awayGoals++; }
    else                     { if (isHome) awayGoals++; else homeGoals++; }
    goals.push({
      minute:      inc.time      ?? 0,
      extraMinute: inc.addedTime ?? null,
      scorer:      inc.player?.name  ?? "Unknown",
      assist:      inc.assist1?.name ?? null,
      type,
      isHome,
      homeScore: homeGoals,
      awayScore: awayGoals,
    });
  }
  return goals;
}

// ── Route ─────────────────────────────────────────────────────────────────────
// GET /api/sports/goals?matchId=<fotmob-id>&date=YYYY-MM-DD&slug=barcelona
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const matchId = searchParams.get("matchId") ?? "";
  const date    = searchParams.get("date") ?? "";
  const slug    = searchParams.get("slug") ?? "";

  if (!date || !slug) {
    return NextResponse.json({ error: "date and slug required" }, { status: 400 });
  }

  const cacheKey = matchId || `${slug}-${date}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < TTL) return NextResponse.json(cached.data);

  try {
    let goals: GoalEvent[] | null = null;

    const espnLeague = SLUG_TO_ESPN[slug];
    if (espnLeague) {
      const keyword = slug.replace(/-/g, " ").toLowerCase();
      goals = await fetchFromESPN(espnLeague, date, keyword);
    }

    // Fall back to FotMob's matchDetails (free, covers everything FotMob knows
    // about — including Danish 1. Division for EFB). Needs the FotMob matchId
    // from the fixture row.
    if ((!goals || goals.length === 0) && matchId) {
      goals = await fetchFromFotMob(matchId);
    }

    // Final fall back to SportAPI7 (paid).
    if (!goals || goals.length === 0) {
      goals = await fetchFromSportAPI7(slug, date);
    }

    const payload = { goals: goals ?? [] };
    if (goals && goals.length > 0) cache.set(cacheKey, { data: payload, ts: Date.now() });
    return NextResponse.json(payload);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

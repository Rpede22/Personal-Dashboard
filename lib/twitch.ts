/**
 * Twitch "who's live" — client-safe types + a keyless GQL client (no `fs`).
 *
 * Fully keyless: Twitch's public GraphQL endpoint reads live status with the
 * long-standing public web `Client-Id` — no OAuth, no app credentials. So
 * "which followed streamers are live" needs no key (unlike the official Helix
 * API). Channel storage lives in the route (fs); this module stays client-safe.
 */

export interface TwitchChannel {
  login: string;        // lowercase channel name
  displayName?: string; // filled from GQL on add
  addedAt: string;      // ISO
}

export interface TwitchLive {
  login: string;
  displayName: string;
  avatar?: string;
  live: boolean;
  title?: string;
  viewers?: number;
  game?: string;
  preview?: string;
  isRerun?: boolean;
}

const GQL = "https://gql.twitch.tv/gql";
const PUBLIC_CLIENT_ID = "kimne78kx3ncx6brgo4mv6wki5h1ko";

/** Pull a channel login out of a raw name or a twitch.tv/NAME URL. */
export function extractLogin(input: string): string | null {
  const m = input.trim().match(/(?:twitch\.tv\/)?@?([A-Za-z0-9_]{2,25})\/?$/i);
  return m ? m[1].toLowerCase() : null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toLive(login: string, u: any): TwitchLive {
  const s = u?.stream;
  return {
    login,
    displayName: u?.displayName ?? login,
    avatar: u?.profileImageURL ?? undefined,
    live: !!s,
    title: s?.title ?? undefined,
    viewers: typeof s?.viewersCount === "number" ? s.viewersCount : undefined,
    game: s?.game?.displayName ?? undefined,
    preview: s?.previewImageURL ?? undefined,
    isRerun: s?.type ? s.type !== "live" : undefined,
  };
}

const USER_FIELDS =
  'login displayName profileImageURL(width: 70) stream { title viewersCount type game { displayName } previewImageURL(width: 320, height: 180) }';

async function gqlQuery(query: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(GQL, {
      method: "POST",
      headers: { "Client-Id": PUBLIC_CLIENT_ID, "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
      next: { revalidate: 120 },
    });
    if (!res.ok) return null;
    const j = await res.json();
    return (j?.data ?? null) as Record<string, unknown> | null;
  } catch {
    return null;
  }
}

/** Live status for one channel (used to validate + name a channel on add). */
export async function fetchOne(login: string): Promise<TwitchLive | null> {
  const data = await gqlQuery(`query { user(login: "${login}") { ${USER_FIELDS} } }`);
  const u = data?.user;
  if (!u) return null;
  return toLive(login, u);
}

/** Live status for many channels via one aliased GQL query. */
export async function fetchLiveStatuses(logins: string[]): Promise<Record<string, TwitchLive>> {
  const clean = logins.filter((l) => /^[a-z0-9_]{2,25}$/.test(l));
  if (clean.length === 0) return {};
  const aliased = clean.map((l, i) => `_${i}: user(login: "${l}") { ${USER_FIELDS} }`).join("\n");
  const data = await gqlQuery(`query {\n${aliased}\n}`);
  const out: Record<string, TwitchLive> = {};
  clean.forEach((l, i) => {
    const u = data?.[`_${i}`];
    if (u) out[l] = toLive(l, u);
  });
  return out;
}

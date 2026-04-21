@AGENTS.md
@PROJECT_STRUCTURE.md

# Project Architecture

Personal dashboard app: Next.js 16.2.3 (App Router, Turbopack) + Electron + SQLite (Prisma 7).
Local only — no deployment. Owner is an EDM (Edmonton Oilers) fan, also follows Esbjerg fB, FC Barcelona, Esbjerg Energy.

## Tech Stack
- **Runtime**: Next.js 16.2.3 App Router with Turbopack dev server
- **Desktop**: Electron (`electron/main.js`), window draggable via `-webkit-app-region: drag`
- **DB**: SQLite via `better-sqlite3`, Prisma 7 with driver adapter. Schema at `prisma/schema.prisma`
- **Generated client**: `app/generated/prisma/` — run `npx prisma generate` after schema changes
- **Stale cache fix**: If API routes 500 after schema changes, delete `.next/` and re-run `npx prisma generate`

## File Map

### Dashboard (front page)
- `app/page.tsx` — 2-column grid (`items-start`, `repeat(2, minmax(420px, 1fr))`). Row1: Sports+School. Row2: WoW+Running. Row3: Calendar+Workhub.
- `components/Card.tsx` — Reusable Card + CardHeader component. Full accent-color border all 4 sides (3px top, 2px rest). `showArrow` prop.
- `components/dashboard/SportsWidget.tsx` — 2×2 grid: EDM, Esbjerg fB, FC Barcelona, Esbjerg Energy. Each box links to its hub. "Next:" shows date + opponent + CEST time. Outer card uses `GradientBorder` with rainbow stripe; each team box uses club-colour gradient border (real kit colours). `GradientBorder` component uses wrapper-div trick (gradient bg + inner surface div) to achieve gradient borders with border-radius.
- `components/dashboard/WoWWidget.tsx` — WoW summary: ilvl (from RIO), rio, M+/boss/custom-task counts per char
- `components/dashboard/RunningWidget.tsx` — Stats boxes: this week / last 30 days / days to race. Recent runs, plans, 7-day planner.
- `components/dashboard/SchoolWidget.tsx` — Upcoming deadlines with DONE button, overdue glow. Shows exact countdown (e.g. "2d 14h") when dueTime is set.
- `components/dashboard/WorkhubWidget.tsx` — Work hours reminder, links to profil.cand.dk (no hub, showArrow=false)
- `components/dashboard/CalendarWidget.tsx` — iCloud calendar: next 5 days of events grouped by day. Error shown if CalDAV fails.

### NHL (EDM)
- `app/api/nhl/standings/route.ts` — Fetches from `api-web.nhle.com/v1/standings/now`, 10min cache
- `app/api/nhl/probability/route.ts` — Monte Carlo simulation wrapper, 15min cache. **Filters gameType===2** (regular season only — playoff games must NOT be counted)
- `app/api/nhl/playoffs/route.ts` — Bracket builder with H2H from team schedule API, 15min cache
- `app/api/nhl/schedule/route.ts` — EDM schedule (recent + next 5)
- `lib/nhl-probability.ts` — Monte Carlo engine (20k iterations), weighted home-ice model. Division/conference rank sort uses regulation wins + alphabetical tiebreaker
- `components/nhl/NHLHub.tsx` — Tabs: standings, predicted (all divisions), schedule (CEST), playoffs. Rank% shows 100% when gamesAhead===0

### Sports (Esbjerg fB, FC Barcelona, Esbjerg Energy)
- `lib/sports-config.ts` — Team configs. IDs used across three sources:
  - Esbjerg fB: TSDB=133939, FotMob team=8285 / league=85 (1. Division). `leagueAutoDetect: true`
  - FC Barcelona: TSDB=133739, FotMob team=8634 / league=87 (La Liga)
  - Esbjerg Energy: TSDB=140920, league=4930 (Metal Ligaen). No FotMob (minor hockey). Uses TSDB.
  - `LEAGUE_MAPPINGS` maps TheSportsDB league names → league IDs for Esbjerg fB (handles promotion/relegation)
- `lib/fotmob.ts` — **Primary source for football.** FotMob unofficial API (free, no key). Requires `User-Agent` header. Handles split leagues: Danish 1st Div returns 3 sub-tables (`Promotion Group`/`Relegation Group`/`1. Division`). Fixtures in `fixtures.allMatches[]`. Cached 30 min. Fixtures DON'T expose team IDs on home/away — match by `matchKeyword` substring.
- `lib/api-football.ts` — Kept as fallback. Requires `RAPIDAPI_KEY` (free tier 100/day). Not used when FotMob responds.
- `app/api/sports/route.ts` — **Source priority: FotMob → API-Football → TheSportsDB.** Payload includes `subTables` (populated for Danish 1st Div). Caches 30 min for FotMob/API-Football, 10 min for TSDB. TSDB events always filtered by `matchKeyword`.
- `components/sports/SportsTeamHub.tsx` — Shared hub: standings / schedule / playoffs (hockey only). Standings tab renders "Regular Season" main table + any `subTables` (Oprykningsspil/Nedrykningsspil) as separate tables below. Fixture dates/times converted to `Europe/Copenhagen` via `toCopenhagenTime/Date`. Source badge shows FotMob/API-Football/TheSportsDB.
- `app/sports/esbjerg-fb/page.tsx`, `app/sports/barcelona/page.tsx`, `app/sports/esbjerg-energy/page.tsx` — Team hub pages

### WoW
- `app/api/wow/character/route.ts` — CRUD chars + stats lookup (Blizzard API + Raider.IO with gear fallback for ilvl). Fetches raid_progression
- `app/api/wow/checklist/route.ts` — Weekly checklist, auto-seeds from templates, resets Wed 06:00 UTC
- `app/api/wow/sync/route.ts` — Auto-sync M+ run count + raid boss kills from Raider.IO. **Baseline key includes raid tier**: `{char}-{realm}-{region}-{weekKey}-{CURRENT_RAID_TIER}` — changing the tier constant forces a fresh baseline automatically. `POST` = sync, `DELETE ?characterId=X` = reset this week's baseline (use when baseline was set incorrectly). Returns `lastCrawledAt` from Raider.IO for freshness info. Update `CURRENT_RAID_TIER` when a new raid releases.
- `components/wow/WoWHub.tsx` — Character list, CheckGrid (28px boxes), M+/boss/custom tasks. "⟳ Sync" button auto-ticks from Raider.IO
- `prisma/seed.ts` — Seeds 35 checklist templates (8 M+ + 27 boss kills — 9 bosses per difficulty for Midnight S1, `tier-mn-1`)

### Running
- `app/api/running/route.ts` — CRUD run logs
- `app/api/running/summary/route.ts` — Recent 3 runs (excl. today), weekly km, upcoming 7-day plans, race date
- `app/api/running/plans/route.ts` + `[id]/route.ts` — CRUD run plans
- `app/api/strava/route.ts` — Strava connection status + disconnect. Tokens in `.strava-config.json`
- `app/api/strava/auth/route.ts` — OAuth redirect to Strava
- `app/api/strava/callback/route.ts` — OAuth callback, stores tokens
- `app/api/strava/sync/route.ts` — Import last 30 days of Strava runs into RunLog (deduplicates by date+distance)
- `components/running/RunningHub.tsx` — Run log, planner, race date, Strava connect/sync panel. Shows 3-step setup guide (with link) when credentials missing.
- `.race-config.json` — Stores race date (filesystem KV store)
- `.strava-config.json` — Stores Strava OAuth tokens (access_token, refresh_token, expires_at)
- **Env vars needed**: `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`

### School
- `app/api/school/route.ts` — GET auto-marks overdue (past dueDate+dueTime) without user action. POST accepts `dueTime` (HH:MM string).
- `app/api/school/[id]/route.ts` — PATCH/DELETE. Overdue can only be cleared by setting status=done.
- `components/school/SchoolHub.tsx` — Full school page. Status filter includes "overdue". Overdue rows have red border. Overdue dot glows. Status selector hidden for overdue (shows badge instead). Done button clears overdue.
- `components/dashboard/SchoolWidget.tsx` — Shows overdue items first, glowing red dot for overdue.
- **Assignment model**: `dueDate DateTime` + `dueTime String?` (HH:MM local time). Status: `pending | in_progress | done | overdue`.

### Workhub
- `components/dashboard/WorkhubWidget.tsx` — Small reminder widget (no hub page, not link-wrapped)
- Links to `https://profil.cand.dk/work/register` for daily work hour registration
- Placed to the right of the School widget on the dashboard grid

## Key Patterns
- **UTC dates**: Runs/plans stored as UTC midnight. Use `toUTCDateStr()` (getUTC* methods) for display
- **Timezone**: NHL schedule displayed in CEST (Europe/Berlin). Sports fixtures displayed in Europe/Copenhagen (CET/CEST) via `toCopenhagenTime/Date` in `SportsTeamHub`. WoW reset at Wed 06:00 UTC.
- **CSS variables**: `--background`, `--surface`, `--surface-2`, `--border`, `--text`, `--text-muted`, `--accent-{blue,green,orange,purple,red,indigo,pink,cyan}`. Each widget has a unique accent: Sports outer=rainbow gradient, EDM=blue, EFB=blue/white, FCB=red/blue, EEN=yellow/blue, WoW=purple, School=indigo, Running=green, Calendar=pink, Workhub=cyan. Background is a multi-radial gradient on `html` (not `body`).
- **Gradient borders**: Use the `GradientBorder` wrapper component in `SportsWidget.tsx` — outer div has gradient bg + padding, inner div has surface bg. This is the only reliable way to get gradient borders with `border-radius` in React inline styles.
- **Button hover glow**: Global CSS in `app/globals.css` adds brightness + box-shadow on hover
- **Titlebar drag**: Fixed 28px strip at top for Electron window dragging
- **CheckGrid**: Reusable numbered box grid with `allowDelete` prop (false for template tasks, true for custom)
- **EDM highlight**: NHL tables/cards highlight Edmonton rows/matchups in accent-blue
- **CardHeader arrow**: `showArrow` prop (default true) — set false for non-navigable widgets like Workhub
- **NHL predictor**: Only counts gameType===2 (regular season). gameType===3 = playoffs, must be excluded or finished teams show <100%
- **TheSportsDB**: Free API key `3` in URL path. `eventslast` returns `results` key, `eventsnext` returns `events` key
- **TheSportsDB data bugs**: League IDs 4683 (Danish 1st Div) and 4335 (La Liga) have corrupted `eventspastleague`/`eventsnextleague` endpoints that return English League One games. Only Metal Ligaen (4930) league events work. Football teams use team-level `eventslast`/`eventsnext`. `leagueEventsWork: false` in config skips these broken endpoints. **All events always filtered by `matchKeyword`** — TheSportsDB's team-level endpoints sometimes return wrong team's fixtures; matchKeyword filter removes them.
- **TheSportsDB standings**: Free tier caps standings at 5 rows. Full table needs a paid account or use API-Football. Season format tried in order: "2025-2026", "2026", "2025", "2025/2026".
- **FotMob (primary for football)**: Free, no key. Endpoint `https://www.fotmob.com/api/data/leagues?id=<leagueId>`. Requires `User-Agent` header (we send Chrome-like UA). Cached 30 min. Split leagues (Danish 1st Div post-round 22) return `table[0].data.tables[]` with 3 sub-tables — Promotion Group / Relegation Group / 1. Division. Non-split leagues return `table[0].data.table.all` as a single list. Fixtures at `fixtures.allMatches[]`.
- **API-Football (RapidAPI, fallback)**: Only used when FotMob returns empty. Set `RAPIDAPI_KEY` in `.env.local`. Free tier: 100 req/day. Currently empty/unused.
- **WoW raid baseline**: `.wow-raid-baseline.json` key now includes tier slug (e.g. `...-liberation-of-undermine`). Changing `CURRENT_RAID_TIER` forces fresh baseline on next sync. Use "↺ Reset" button in WoW hub to clear this week's baseline if it was set with wrong data — then click Sync BEFORE raiding to set a clean 0-baseline. Raider.IO may cache data for several hours — `lastCrawledAt` in sync response shows when RIO last indexed the character.
- **Sports league auto-detect**: Esbjerg fB has `leagueAutoDetect: true`. On each fetch (cached 1h), `lookupteam.php?id=133939` is called and the returned `strLeague` is looked up in `LEAGUE_MAPPINGS["133939"]` to get the correct leagueId. If promoted to Superliga (4337) or relegated to 2nd Division (4684), the config auto-updates. Add new leagues to `LEAGUE_MAPPINGS` in `lib/sports-config.ts` as needed.
- **WoW raid sync**: `.wow-raid-baseline.json` stores kill counts at first sync of each WoW week. Delta (current − baseline) = this week's kills. First sync sets baseline with 0 new kills; re-sync after raiding shows the delta. **When a new raid tier releases, update `CURRENT_RAID_TIER` in `app/api/wow/sync/route.ts` and update boss count in `prisma/seed.ts`, then re-run `npx prisma db seed`.**
- **Strava setup**: Create app at strava.com/settings/api, set Authorization Callback Domain to `localhost`, add `STRAVA_CLIENT_ID` + `STRAVA_CLIENT_SECRET` to `.env.local`. UI shows 3-step setup instructions (with clickable link) if credentials are missing.
- **NHL schedule**: Uses `club-schedule/{team}/month/now` (not `week/now`) so sparse playoff scheduling still returns 4-5 upcoming games.
- **School overdue**: GET `/api/school` auto-updates status to `overdue` for any non-done assignment where `now > dueDate (combined with dueTime if set)`. Only clearing: set status to `done`. `dueTime` is stored as HH:MM string in local time.
- **WoW ilvl**: sourced from Raider.IO `gear.item_level_equipped` (integer). No Blizzard API. Displayed via `.toFixed(2)`. Server-side `lookupCache` (1h TTL) in `app/api/wow/character/route.ts`.
- **WoW sync result**: format is `"Charactername-realm: M+: X/8 · N: Y/9 · H: Z/9 · M: W/9"` so you know which char was synced.

## Future Features

### Goal Scorer Timeline — other 3 sports (Esbjerg fB, FC Barcelona, Esbjerg Energy)
NHL goal timeline is done. Add the same expand-on-click timeline to `SportsTeamHub.tsx` for the remaining teams.

**Status per team**:
- **FC Barcelona (La Liga)**: `football-data.org` free tier covers La Liga. Register → add `FOOTBALL_DATA_KEY` to `.env.local`. `GET /v4/matches/{id}` returns goals with scorer/assist/minute. Barcelona team ID = 81. Match IDs: cross-reference by date+teams from FotMob fixtures.
- **Esbjerg fB (Danish 1st Division)**: No free server-side API. FotMob `/api/matchDetails?matchId=X` returns HTML (browser-session protected).
- **Esbjerg Energy (Metal Ligaen)**: TSDB free tier has no event-level data. Needs paid tier or alternative source.

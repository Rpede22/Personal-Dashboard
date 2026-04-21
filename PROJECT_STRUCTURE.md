# Project Structure (token-saver map)

Read this file FIRST before exploring the codebase. It lists every source file with a one-line summary of what it does + key symbols/env vars. Saves you from round-tripping through Read/Grep for orientation. **Update this file whenever you add/remove/significantly change a source file** — otherwise it drifts.

Stack: Next.js 16.2.3 App Router · Turbopack · React 19 · Electron · SQLite (better-sqlite3) · Prisma 7 (driver adapter).

## Root

| file | purpose |
| ---- | ------- |
| `CLAUDE.md`            | Project guidance for Claude (imports AGENTS.md) |
| `AGENTS.md`            | Reminder that Next.js 16 has breaking changes |
| `PROJECT_STRUCTURE.md` | **This file** — map of all source files |
| `prisma/schema.prisma` | DB schema (SQLite). Models: `WowCharacter`, `WowChecklist`, `WowChecklistTemplate`, `RunLog`, `RunPlan`, `Assignment` |
| `prisma/seed.ts`       | Seeds 35 WoW templates: 8 M+ runs + 9 bosses × 3 difficulties. Run after schema changes. |
| `electron/main.js`     | BrowserWindow loads `http://localhost:3000` (dev) / 3001 (prod). 28px titlebar drag strip. `waitForServer` timeout 30s. |
| `.env.local`           | `RAPIDAPI_KEY`, `STRAVA_CLIENT_ID/SECRET`, `ICLOUD_CALDAV_USER/PASS` |
| `.wow-raid-baseline.json` | Weekly raid kill baselines; key = `{char}-{realm}-{region}-{weekKey}-{raidTier}` |
| `.race-config.json`    | Running: race date |
| `.strava-config.json`  | Strava OAuth tokens |
| `dev.db`               | Active SQLite file (project root, not `prisma/dev.db`) |

## app/ (pages — App Router)

| route | file | purpose |
| ----- | ---- | ------- |
| `/`                       | `app/page.tsx`                       | Dashboard grid: Sports 2×2 / School + [Workhub+Calendar stacked] / WoW / Running |
| `/calendar`               | `app/calendar/page.tsx`              | Loads `CalendarHub` |
| `/layout.tsx`             | `app/layout.tsx`                     | Root layout, fonts, global CSS |
| `/nhl`                    | `app/nhl/page.tsx`                   | Loads `NHLHub` |
| `/school`                 | `app/school/page.tsx`                | Loads `SchoolHub` |
| `/running`                | `app/running/page.tsx`               | Loads `RunningHub` |
| `/wow`                    | `app/wow/page.tsx`                   | Loads `WoWHub` |
| `/sports/barcelona`       | `app/sports/barcelona/page.tsx`      | `<SportsTeamHub teamSlug="barcelona" />` |
| `/sports/esbjerg-fb`      | `app/sports/esbjerg-fb/page.tsx`     | `<SportsTeamHub teamSlug="esbjerg-fb" />` |
| `/sports/esbjerg-energy`  | `app/sports/esbjerg-energy/page.tsx` | `<SportsTeamHub teamSlug="esbjerg-energy" />` |

## app/api/ (route handlers)

### NHL
| endpoint | file | notes |
| -------- | ---- | ----- |
| `GET /api/nhl/standings`   | `app/api/nhl/standings/route.ts`   | `api-web.nhle.com/v1/standings/now`, 10 min cache |
| `GET /api/nhl/probability` | `app/api/nhl/probability/route.ts` | Monte Carlo (20k iters), 15 min cache. **Filters `gameType===2`** only |
| `GET /api/nhl/playoffs`    | `app/api/nhl/playoffs/route.ts`    | Bracket builder with H2H from team schedule, 15 min cache |
| `GET /api/nhl/bracket`     | `app/api/nhl/bracket/route.ts`     | Live bracket from `api-web.nhle.com/v1/playoff-bracket/{year}`, 5 min cache |
| `GET /api/nhl/goals?gameId=X` | `app/api/nhl/goals/route.ts`    | Goal scorer timeline from `gamecenter/{id}/play-by-play`. Event type "goal", player names from rosterSpots. `strength` parsed from `situationCode` (`EV`/`PP1`/`PP2`/`SH`/`EN`/`SO`) from scoring team's POV. 1h cache (completed games). |
| `GET /api/calendar`           | `app/api/calendar/route.ts`     | **Dual source**: (1) ICS feeds via HTTP GET (`CALENDAR_SDU_URL`, `CALENDAR_CAND_URL`, `CALENDAR_ARBEJDE_URL`). (2) iCloud CalDAV for Arbejde/Skolerelateret/Kalender/Cand (PROPFIND discovery + REPORT). Parses ICS with `node-ical`. 15 min cache. Window: **31 days back → 92 days ahead** (enables 1-month back navigation in CalendarHub). Returns `{ configured, events[] }`. |
| `GET /api/nhl/schedule`    | `app/api/nhl/schedule/route.ts`    | EDM schedule (recent + next 5). Uses `club-schedule/{team}/month/now` |

### Sports (football/hockey for 4 teams)
| endpoint | file | notes |
| -------- | ---- | ----- |
| `GET /api/sports?team=<slug>` | `app/api/sports/route.ts` | **Source priority: FotMob → API-Football → TheSportsDB.** Returns `{ config, standing, last5, next5, allStandings, subTables, source }`. FotMob for Barca + Esbjerg fB, TSDB for Esbjerg Energy. `subTables` contains Danish split groups (Promotion/Relegation) when applicable. |

### WoW
| endpoint | file | notes |
| -------- | ---- | ----- |
| `GET /api/wow/character` (list) or `?name&realm&region` (lookup) | `app/api/wow/character/route.ts` | Raider.IO only. ilvl from RIO `gear.item_level_equipped`. No Blizzard API needed. |
| `POST/DELETE/PATCH /api/wow/character` | same | CRUD + reorder |
| `GET /api/wow/checklist?characterId=X` | `app/api/wow/checklist/route.ts` | Weekly checklist; auto-seeds templates at Wed 06:00 UTC reset |
| `POST /api/wow/sync` | `app/api/wow/sync/route.ts` | Sync M+ + raid kills from RIO. `CURRENT_RAID_TIER = "tier-mn-1"` (Midnight S1, 9 bosses combined across 3 raids). Baseline delta system. Returns `lastCrawledAt` |
| `DELETE /api/wow/sync?characterId=X` | same | Reset this week's baseline |

### Running
| endpoint | file | notes |
| -------- | ---- | ----- |
| `GET/POST /api/running` (+ `[id]`) | `app/api/running/route.ts`, `[id]/route.ts` | Run log CRUD |
| `GET/POST /api/running/plans` (+ `[id]`) | `app/api/running/plans/route.ts`, `[id]/route.ts` | Plan CRUD |
| `GET /api/running/summary` | `app/api/running/summary/route.ts` | Recent 3 runs (excl. today), `weeklyKm`, `monthlyKm` (30d), `thisMonthKm` (calendar month), `thisYearKm`, `totalKm`, `totalRuns`, `raceDate`, `upcomingPlans` |
| `GET/DELETE /api/strava` | `app/api/strava/route.ts` | Status + disconnect |
| `GET /api/strava/auth` | `app/api/strava/auth/route.ts` | OAuth redirect |
| `GET /api/strava/callback` | `app/api/strava/callback/route.ts` | Stores tokens in `.strava-config.json` |
| `POST /api/strava/sync` | `app/api/strava/sync/route.ts` | Import last 30 days (deduplicates by date+distance) |

### School
| endpoint | file | notes |
| -------- | ---- | ----- |
| `GET/POST /api/school` | `app/api/school/route.ts` | GET auto-marks `overdue` when `now > dueDate+dueTime`. POST takes `dueTime` HH:MM string |
| `PATCH/DELETE /api/school/[id]` | `app/api/school/[id]/route.ts` | Only setting `status=done` clears overdue |

## components/

### Dashboard widgets (`components/dashboard/`)
| file | purpose |
| ---- | ------- |
| `SportsWidget.tsx`  | 2×2 grid: EDM, Esbjerg fB, Barcelona, Esbjerg Energy. Outer card has rainbow gradient border; each team box has club-colour gradient border via `GradientBorder` wrapper component. |
| `WoWWidget.tsx`     | Per-char summary: ilvl (2 dp) · rio · M+/N/H/M counts · custom tasks |
| `RunningWidget.tsx` | Recent runs + 7-day planner + weekly km |
| `SchoolWidget.tsx`  | Upcoming deadlines. Overdue glow, DONE button. |
| `WorkhubWidget.tsx`  | Reminder → `https://profil.cand.dk/work/register`. `showArrow={false}` |
| `CalendarWidget.tsx` | 7-day square grid (next 7 days). Each cell: day name + date + event text labels (colored). Reads `calendarFilter` from localStorage to match hub filter. Multi-day events expanded across all days. |
| `NHLWidget.tsx`     | (legacy/unused if EDM moved into SportsWidget — check before editing) |

### Hub pages
| file | purpose |
| ---- | ------- |
| `components/Card.tsx`                  | `<Card>` + `<CardHeader>` reusable. `showArrow` prop (default true). |
| `components/nhl/NHLHub.tsx`            | Tabs: standings / schedule / playoffs (live bracket) / predicted / playoff predicted. EDM row highlight. Controls only shown in standings tab. |
| `components/sports/SportsTeamHub.tsx`  | Tabs: standings / schedule / playoffs (hockey only). Renders `subTables` under main "Regular Season" (Oprykningsspil + Nedrykningsspil for Esbjerg fB). Header rank badge shows **Oprykningsspil rank** when promotion subtable exists (matches front-page logic), otherwise main league rank. Times converted to Copenhagen via `toCopenhagenTime/Date`. |
| `components/wow/WoWHub.tsx`            | Character list, CheckGrid (28px), M+/boss/custom tasks, Sync/Reset buttons. ilvl `.toFixed(2)`. |
| `components/running/RunningHub.tsx`    | Run log, planner, race date, Strava panel |
| `components/school/SchoolHub.tsx`      | Status filter includes "overdue". Overdue rows have red border; DONE clears. |
| `components/calendar/CalendarHub.tsx`  | Monthly calendar grid (Mon–Sun). Month navigation (‹ ›). Click day → detail panel with full time range + description. Filter toggle buttons (localStorage key `calendarFilter`). Multi-day events expanded. 92-day API window lets you navigate ~3 months ahead. |

## lib/

| file | purpose | key exports |
| ---- | ------- | ----------- |
| `lib/prisma.ts`          | Prisma client with `better-sqlite3` adapter, singleton | `prisma` |
| `lib/nhl-probability.ts` | Monte Carlo engine (20k iters), home-ice weighted, div/conf rank with regulation-wins tiebreak | `runSimulation`, `*Standing` types |
| `lib/sports-config.ts`   | Team configs + `LEAGUE_MAPPINGS` for Esbjerg fB promotion/relegation | `SPORTS_TEAMS`, `TeamConfig`, `SPORTS_DB_BASE` |
| `lib/api-football.ts`    | RapidAPI client (`RAPIDAPI_KEY` required; free 100/day) | `afFetchStandings`, `afFetchLast5`, `afFetchNext5` |
| `lib/fotmob.ts`          | FotMob unofficial API (free, no key). Handles split leagues (`subTables`). **Requires `User-Agent` header.** | `fmFetchLeague`, `fmTeamFixtures`, `FMLeagueData`, `FMStandingRow`, `FMFixture`, `FMSubTable` |

### Known IDs (cross-reference)
- FotMob leagues: Danish 1st Div = **85**, La Liga = **87**, Superliga = 46
- FotMob teams: Barcelona = **8634**, Esbjerg fB = **8285**
- TheSportsDB teams: Esbjerg fB = 133939, Barcelona = 133739, Esbjerg Energy = 140920
- TheSportsDB leagues: Danish 1st Div = 4683, La Liga = 4335, Metal Ligaen = 4930 (the only one with working league endpoints)
- API-Football (if ever re-enabled): Barca=529/La Liga=140, Esbjerg fB=1366 (⚠ unverified) / Dan 1st Div=120

## Key design decisions (read before changing)

1. **DB path:** `file:./dev.db` resolved from `process.cwd()`. Dev server resolves to project root.
2. **Stale Prisma cache:** after `schema.prisma` changes, delete `.next/` AND run `npx prisma generate`. Otherwise API routes 500.
3. **Generated Prisma client:** `app/generated/prisma/` — imported by `lib/prisma.ts` and `prisma/seed.ts`.
4. **UTC dates:** Run entries stored as UTC midnight. Display via `getUTC*`.
5. **Timezones:**
   - NHL schedule displayed in **CEST** (`Europe/Berlin`).
   - Sports fixtures displayed in **CET/Copenhagen** (`Europe/Copenhagen`) via `toCopenhagenTime/Date` in `SportsTeamHub`.
   - WoW reset at **Wed 06:00 UTC**.
6. **CSS tokens:** `--background`, `--surface`, `--surface-2`, `--border`, `--text`, `--text-muted`, `--accent-{blue,green,orange,purple,red,indigo,pink,cyan}`. Page background is a multi-radial gradient on `html` (not `body` — `body` has no background set).
7. **Electron dev:** ONE `npm run electron:dev` at a time. If port 3000 is busy, kill stale node/electron processes first.
8. **WoW raid sync:** baseline captured on first sync of the WoW week. Sync BEFORE raiding; delta from subsequent syncs auto-ticks bosses. `↺ Reset` clears the baseline if set incorrectly.
9. **Match filtering:** TheSportsDB events always filtered by `matchKeyword` (it returns wrong-team events for some IDs).
10. **FotMob fixtures don't expose team IDs on home/away** — we match by `matchKeyword` substring in team name.
11. **WoW ilvl**: sourced from Raider.IO `gear.item_level_equipped` (integer). No Blizzard API needed. Displayed via `.toFixed(2)`.
12. **Running km stats**: `GET /api/running/summary` returns `weeklyKm`, `monthlyKm` (30d), `thisMonthKm` (calendar month), `thisYearKm`, `totalKm`, `totalRuns`. Widget shows 5 km stats in compact grid + total runs + days to race. Hub stats bar has 7 columns.
13. **School time remaining**: `SchoolWidget.dueLabel` shows exact countdown (`2d 14h`, `3h 20m`) when `dueTime` is set; otherwise shows day count.
14. **Dashboard layout**: 2-column `items-start` grid (`repeat(2, minmax(420px, 1fr))`). Row 1: Sports + School. Row 2: WoW + Running. Row 3: Calendar + Workhub. `items-start` prevents Link wrappers from stretching beyond widget height.
16. **Gradient borders**: Use `GradientBorder` wrapper component (defined in `SportsWidget.tsx`) — outer div carries gradient bg + padding, inner div has surface bg. Required because CSS `border-image` doesn't respect `border-radius` and the `padding-box/border-box` background trick doesn't work in React inline styles.
17. **Widget accent colours**: Each of the 10 widgets has a unique colour. Sports outer = rainbow stripe; team boxes use real club colours. Other widgets: WoW=purple, School=indigo, Running=green, Calendar=pink, Workhub=cyan.
15. **Electron dock**: `app.setName("Dashboard")` + `app.dock.setIcon()` set in `electron/main.js`. Icon at `public/icon.png` (512×512 PNG, 80% scale with padding).

## Future Features

### Goal Scorer Timeline — other 3 sports (Esbjerg fB, FC Barcelona, Esbjerg Energy)
NHL goal timeline (with strength badges) is live. Add the same expand-on-click pattern to `SportsTeamHub.tsx` for remaining teams.

**Status per team**:
- **FC Barcelona (La Liga)**: `football-data.org` free tier covers La Liga. Register → add `FOOTBALL_DATA_KEY` to `.env.local`. `GET /v4/matches/{id}` returns goals with scorer/assist/minute. Barcelona team ID = 81. Cross-reference match IDs from FotMob fixtures by date+teams. New route: `GET /api/sports/goals?team=barcelona&matchDate=YYYY-MM-DD`.
- **Esbjerg fB (Danish 1st Division)**: No free server-side API. FotMob `/api/matchDetails?matchId=X` is browser-session protected.
- **Esbjerg Energy (Metal Ligaen)**: TSDB free tier has no event-level data. Needs paid tier or alternative source.

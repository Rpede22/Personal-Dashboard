# Personal Dashboard — Vibe Coded

A local-only personal dashboard desktop app built with **Next.js 16 + Electron**. It aggregates sports scores, WoW weekly progress, school deadlines, running training, and your iCloud calendar into a single always-available dark-themed window — no browser, no cloud, no accounts needed beyond the optional integrations you configure.

---

## Dashboard overview

The home screen is a 2-column grid of widgets, each linking to a full hub page:

| Widget | Accent | What it shows |
|--------|--------|---------------|
| 🏆 **Sports** | Rainbow stripe | 2×2 grid of live data for EDM, Esbjerg fB, FC Barcelona, Esbjerg Energy |
| 📚 **School** | Indigo | Upcoming deadlines sorted by urgency; overdue items glow red |
| 🧙 **World of Warcraft** | Purple | Per-character ilvl, RIO score, weekly M+/raid/custom task progress |
| 🏃 **Running** | Green | This week's km, last 30-day km, recent runs, 7-day plan, days to race, race distance |
| 📅 **Calendar** | Pink | Upcoming events pulled live from iCloud CalDAV |
| 💼 **Work Hours** | Cyan | Two links side by side: register daily hours at profil.cand.dk and view payslips at intect.app |

---

## Architecture

```
┌─────────────────────────────────────┐
│  Electron (electron/main.js)        │  ← Desktop wrapper, custom 28px titlebar drag strip
│  Loads http://localhost:3000        │
└────────────────┬────────────────────┘
                 │
┌────────────────▼────────────────────┐
│  Next.js 16 App Router (Turbopack)  │  ← UI + API routes in one process
│  React 19 · TypeScript             │
│                                     │
│  /app/page.tsx          Dashboard   │
│  /app/api/**            API routes  │
│  /components/**         UI          │
└────────────────┬────────────────────┘
                 │
┌────────────────▼────────────────────┐
│  SQLite (dev.db at project root)    │  ← Prisma 7 + better-sqlite3 driver adapter
│  Models: WowCharacter, WowChecklist │
│          RunLog, RunPlan, Assignment│
└─────────────────────────────────────┘
```

Everything runs locally. No data leaves your machine except outbound API calls to sports/WoW/Strava services.

---

## Sports

Four teams are tracked. Each has a widget box on the dashboard and a full hub page (`/sports/<team>`).

| Team | Sport | Data source |
|------|-------|-------------|
| Edmonton Oilers | NHL | Official NHL API (`api-web.nhle.com`) — free, no key |
| Esbjerg fB | Football (Danish 1st Div) | **FotMob** unofficial API — free, no key |
| FC Barcelona | Football (La Liga) | **FotMob** — free, no key |
| Esbjerg Energy | Ice hockey (Metal Ligaen) | TheSportsDB — free |

**Source priority for football standings:** FotMob → TheSportsDB.

**Match of the week highlight** on the dashboard: whenever any of the four teams plays a top-3 league opponent within the next 7 days, a small orange strip appears above the sports grid — team badge, home/away, opponent name, opponent's league rank, and kickoff time. Each row links straight to that team's hub.

**Esbjerg Energy uses [Metal Ligaen's own JSON](https://s3.dualstack.eu-west-1.amazonaws.com/den.hokejovyzapis.cz)** (via [lib/metalligaen.ts](lib/metalligaen.ts)) instead of TheSportsDB. This is the same data feed metalligaen.dk uses on its own site through the icestats.at widgets. It gives us proper standings, a full match schedule, **and a live playoff bracket** (see the Playoffs tab → Live sub-tab) — with best-of-7 pip rows, per-game scores, and OT/SO markers. The fetch walks back up to two seasons if the current one hasn't been populated yet (Metal Ligaen sometimes publishes an empty pre-season roster months before the opener), and the Esbjerg Energy widget row shows `W-L-OTL` instead of `W-D-L` since hockey games don't draw in regulation.

**Danish 1st Division split table:** After round 22, FotMob returns three sub-tables (Promotion Group / Relegation Group / 1. Division). The hub and widget both display the team's Oprykningsspil rank when available.

**Match reports.** For finished football matches (Barcelona + Esbjerg fB), clicking a match expands a stats panel above the goal timeline: ball possession, total shots, shots on target, expected goals, and each side's starting formation. Data comes from FotMob's `matchDetails` endpoint (free, no key) and is cached for 1 h. Every field is null-safe — if FotMob doesn't return a stat for a given match, the row is silently skipped rather than 500'ing the panel.

**Goal timelines:** Click any finished match to expand a goal-by-goal timeline with scorer, assist, and running score.
- **NHL:** Uses the free NHL play-by-play API. Includes strength indicator (EV / PP1 / PP2 / SH / EN / SO).
- **Barcelona:** ESPN hidden API (`site.api.espn.com`) — free, no key.
- **Esbjerg fB:** FotMob `matchDetails` (free, no key). A recursive walker extracts goal events and computes the running score itself. ESPN doesn't carry Danish 1. Division and SportAPI7 incidents were often empty — this used to leave EFB matches showing "No goals recorded" even when goals were scored.
- **Esbjerg Energy:** SportAPI7 via RapidAPI (`RAPIDAPI_KEY`). Searches all matches for the date, then fetches incidents. Requires a free SportAPI7 subscription.

**Auto-refresh:** The sports widget on the dashboard and every team hub page automatically re-fetch data every 5 minutes while the app is open — no manual refresh needed.

**NHL Playoff Predicted** (tab in the NHL hub) is always populated — the bracket loads on mount using regular-season standings + Monte Carlo win probabilities. Head-to-head records feeding the prediction are filtered to `gameType === 2` (regular season) so live playoff results never bias the pre-playoff forecast.

**Team box gradient borders** use real club colours — the GradientBorder wrapper component (outer div = gradient background + 3 px padding, inner div = surface colour) is the only reliable way to get gradient borders with `border-radius` in React inline styles.

**Dashboard widget heights** are equalised per row — CSS grid stretches each pair of widgets to match the taller one so neither column looks sparse.

**Drag-to-reorder widgets.** Grab the small ⋮⋮ handle in any widget's top-right corner and drop it on another widget to swap positions. The hover target gets a blue outline while dragging. Your custom order persists to `localStorage["dashboard.widgetOrder"]` and survives reloads; a "Reset widget order" button appears below the grid whenever the order differs from the default.

**Loading skeletons.** While widget data loads, each card shows shape-appropriate pulsing skeleton blocks (rows for lists, a 2×2 grid for Sports, a 3-stat strip for Running) instead of a "Loading…" text — no more blank cards on first paint.

**Today briefing** sits at the very top of the dashboard: a single card showing every calendar event that lands on today's local day, any tracked-team matches whose kickoff is today or inside the next 24 h (including matches already in progress — the widget keeps showing them until they're marked finished), today's planned run, and the next school deadline. Multiple calendar events collapse into one box (`TODAY · N events` header + `first title` + `HH.mm · started — then HH.mm Title · …`) so a busy day doesn't blow up the widget height. Empty slots collapse. Auto-refreshes every 5 min.

**Race countdown** appears as a dedicated card below the Today briefing whenever a race date + distance are set — big countdown number, Riegel-predicted finish time, pace, colour-coded confidence badge, and current week km. Unmounts the day after the race.

**Week-ahead heatmap** — a 7-cell strip sitting under the top cards. Each cell splits vertically into planned **school** hours (top, indigo) and **calendar-busy** hours (bottom, pink). Bars scale against a 12 h waking-hours ceiling; the cell outline goes green (≤ 8 h), orange (> 8 h) or red (> 12 h). Today gets a coloured border. Click the top half to jump to School; click the bottom half to open the calendar hub **straight to that specific day** (`/calendar?date=YYYY-MM-DD` — the hub reads the query param via `useSearchParams` and preselects the day). Answers "when is next week going to be a grind?" at one glance.

**Weekly review** (`/review`) — auto-generated recap of the current Mon–Sun week: km vs plan, LoL wins/losses across every account + top champion, school assignments completed, calendar hours booked, and each followed team's results. One screen, no editing. Surfaced through a small **"🗓️ Review week →"** pill under the dashboard header that only appears **Thu–Sun** — the week doesn't have enough data to be worth recapping earlier. Hidden the rest of the week.

**Playoff race tracker.**
- **NHL Hub → Playoffs tab** now leads with a compact race panel for EDM: division rank, points, games remaining, margin over the current 9th-place team in the conference, **magic number** to clinch a playoff spot, and elimination number. Formulas assume 2 pts per win and ignore the regulation-win tiebreaker, so it's a rough guide, not a perfect one.
- **Football team hubs (Barca / Esbjerg fB)** get a title-race panel above the standings: current position, points, "behind leader" or "ahead of 2nd", "above drop" gap to the third-from-bottom, and max possible points if the team wins out.

**Sticky headers** — every hub page and the dashboard itself has a sticky header that stays pinned below the Electron title bar (`top: 28px`) while you scroll. Headers use a viewport-anchored background gradient (`background-attachment: fixed`) that matches the page background exactly, making them visually seamless rather than showing as a solid box.

---

## World of Warcraft

Characters are stored in SQLite and enriched via **Raider.IO** (public API, no key) and the **Blizzard API** (optional key, recommended).

- **ilvl** — primary source is the Blizzard equipment API (true decimal average, shown to 2 dp). Falls back to RIO `gear.item_level_equipped` if Blizzard credentials are not set.
- The **weekly checklist** auto-seeds from templates every Wednesday at 06:00 UTC (EU reset). Templates: 8 M+ runs + 9 bosses × 3 difficulties for the current raid tier (`CURRENT_RAID_TIER` constant in `app/api/wow/sync/route.ts`).
- **Auto-sync** (`⟳ Sync` button) — primary source is the Blizzard API per-boss `last_kill_timestamp`. Falls back to a RIO cumulative delta against a baseline captured at the start of each WoW week (stored in `.wow-raid-baseline.json`, git-ignored).
- **Raid tier changes:** update `CURRENT_RAID_TIER` + `CURRENT_TIER_INSTANCES` + `CURRENT_TIER_BOSS_COUNT` in `app/api/wow/sync/route.ts`, update `CURRENT_RAID_TIER` in `app/api/wow/character/route.ts`, update boss count in `prisma/seed.ts`, then `npx prisma db seed`.
- **Gear wishlist** — below the weekly checklist, a panel shows all 16 gear slots (Head, Neck, Shoulders, Back, Chest, Wrists, Main Hand, Off Hand on the left; Hands, Waist, Legs, Feet, Ring 1, Ring 2, Trinket 1, Trinket 2 on the right). Type an item name into any slot, then click ✓ to mark it as obtained. The ✓ button is disabled until an item name is entered. Persists to SQLite per character.
- **Character notes** — a free-text notes area below the gear wishlist, saved automatically on blur. Stored on the `WowCharacter` record so notes are per-character and persist across sessions.

---

## Games — WoW + League of Legends

Both games share a `/games` hub with a WoW/LoL tab switcher. `/wow` and `/lol` are aliases that open the same hub on the right tab, so old bookmarks and dashboard widget links keep working.

### League of Legends

Add accounts as `gameName#tagLine` + platform region (`euw1`, `na1`, `kr`, …). With `RIOT_API_KEY` set, the detail pane shows:

- **Profile** — icon + summoner level. (An earlier live-game badge was removed — Riot's spectator endpoint reported stale sessions as "live" too often to be useful.)
- **Ranked cards** — Solo/Duo + Flex tier (iron → challenger) with **rank emblem icon**, LP, wins/losses, win-rate.
- **Match list** — filter by champion (dropdown of champs actually in the loaded matches) **and** by queue (**All / Solo / Flex / ARAM / Other**). Each row shows W/L color bar, champion icon, **summoner-spell icons (D/F)**, KDA + KDA ratio, CS + CS/min, duration, and time ago. **Click any row** for a full match popover with both team scoreboards (10 players, KDA, CS, gold, damage, vision — your player's row highlighted).
- **Load more** — "Load 10 more" button under the match list; automatically stops when there are no more matches.
- **Session view (per day)** — the match list is grouped by local calendar day (`Today`, `Yesterday`, `Sat 20 Jul`, …), with a per-day header showing W-L record (colour-coded) and total time played.
- **Top champions panel** in the sidebar (under the accounts list) shows the top 6 champions by games with KDA + win rate, aggregated across the full recent ranked history (up to 40 solo + 20 flex matches via `/api/lol/season-champs`) — not just the 10 matches loaded in the detail pane.
- **Rank history sparkline** in the detail pane plots your LP over the last 60 days per queue. Snapshots are written as a side effect of every summary fetch (throttled to once every 6 h per queue), so history builds up naturally without any cron job. The line uses a monotonic LP-equivalent scale (Iron IV 0 LP = 0, Diamond IV 0 LP = 2400, Master+ = 2800 + LP) so tier boundaries don't create fake jumps.
- `⟳ Refresh` re-fetches. Errors surface with actionable hints (missing key / rate limit / expired key).

Get a Riot dev key at [developer.riotgames.com](https://developer.riotgames.com/) (24-hour dev key or apply for production). Dev tier rate limits: 20 req / 1 s and 100 req / 2 min. Set `RIOT_API_KEY` in `.env.local` and rebuild.

### Dashboard widget

Row 2 of the dashboard shows a single **`GamesWidget`** with a WoW/LoL tab bar at the top — only one game is visible at a time and the active tab is persisted to localStorage. Clicking the widget body opens the matching hub.

The **LoL widget** has one expandable card per account. The collapsed header shows *Riot ID · region · short tier (e.g. `E IV`) · W/L · WR* (green ≥ 55% / red < 45%). Click the header to expand: a full **rank card with emblem icon** appears, plus the **last 5 games** with champion icon, K/D/A, KDA ratio, and CS. Expand state is remembered across dashboard reloads.

---

## Running

Run logs and training plans are stored in SQLite. Strava sync is optional.

- **Manual logging:** add runs directly in the hub.
- **Strava sync:** connects via OAuth (tokens stored in `.strava-config.json`, git-ignored). Imports the last 30 days of activities, deduplicates by date + distance, and stores the Strava activity ID (`stravaId`) on each run. When a Strava run is synced for a day that already has a run plan, the plan is automatically removed.
The Running Hub has three tabs:
- **Overview** — training progress charts, race config, Strava integration, run planner.
- **Run Log** — the full run table with `+ Log Run` button. Shows 5 most recent by default; click **All Runs (N)** to see the full history. Click any row to open the run detail popup.
- **Training** — data-driven weekly plan built from your actual run log:
  - Last-completed-week + this-week snapshots (km, run count, longest run, avg pace).
  - 8-week volume bar chart with next-week target overlaid in orange.
  - Automatic warnings if last week looked off (only 1 run, no long run, long run > 55% of volume).
  - Next-week target: **+10%** on your **rolling 3-week average** (much more stable than "last week" when training is uneven — a skipped week or one big burst doesn't whipsaw the target), **−25% cutback** after 3 up-weeks, or conservative starter volume if the avg is below ~5 km/week. Both the rolling average and last-week totals are shown so you can see what the plan is built on.
  - Suggested sessions split by 80/20 (~30% long, 10% speed, 15% tempo, ~45% easy over 2–3 days), each with target distance and coaching notes.
  - **Mon–Sun weekly grid** shows exactly which day each session belongs on. Standard 5-day week: `Mon Easy · Tue Speed · Wed Easy · Thu Tempo · Fri Rest · Sat Rest · Sun Long`. Rule enforced by the planner: never two hard sessions in a row.
  - **Customise the plan** — override the weekly target km (auto-suggested as placeholder) and pick 3/4/5/6 run days per week. Templates: 3 (beginner — build the base, no quality), 4 (add one tempo session), 5 (standard 80/20), 6 (advanced). Auto-picks based on volume when left as "auto" — start at 3–4 days if you're building back, bump to 5–6 once you feel steady.
  - **"Apply to next week's planner" button** — writes each non-rest session into next week's `RunPlan` rows so it shows up in the Overview tab planner. Existing next-week plans are replaced.
  - **Drag-drop day swap** in the Overview tab's week view — grab any plan chip and drop it on a different day card (green dashed highlight while hovering). Useful for varying which day is a rest day week to week without deleting/re-adding.
  - All logic lives in [lib/training-planner.ts](lib/training-planner.ts) — pure functions, easy to tweak the framework.

- **Run detail popup:** for Strava-imported runs, shows a large Leaflet route map (400 px tall with a **⛶ Fullscreen** button that expands to the full viewport). Fullscreen has a solid black background, a bright red **✕ Exit fullscreen** button (always visible over any map colour), locks body scroll while active, and swallows wheel/touch events so the modal underneath doesn't scroll behind. Escape also exits. The map uses a `ResizeObserver` to re-invalidate Leaflet's tile layout whenever the container resizes, which fixes the half-loaded / partial-tile bug during fullscreen transitions. Popup also shows core stats (distance, duration, pace, elevation), heart rate and cadence (if recorded), and a per-km splits table. Manually logged runs show basic stats only. Fixed header (title + close button always visible), rest scrolls below.
- **Strava errors** are shown with actionable hints — 403 (missing scope, reconnect Strava), 401 (token expired), 429 (rate limit).
- **Training progress:** two bar charts appear once you have runs logged — *Weekly Kilometers* (last 12 weeks, current week highlighted; label shows the Mon–Sun date range, e.g. `18 May – 24 May`) and *Longest Run* (best run per month for the last 6 months; label is just the month name, e.g. `Dec`).
- **Stats bar** at the top of the hub (This week / Last 30 days / etc.) is shown to 2 decimals so nothing is rounded away.
- **Race target:** set a race date and/or race distance in the hub. The widget and stats bar show days remaining and the target distance label.
- **Race predictor** (Training tab): once a race distance is set, projects a finish time from your last 90 days of training via the **Riegel formula** (`T2 = T1·(D2/D1)^1.06`). Anchors on the fastest projection across every qualifying run (≥ max(3 km, 20% of race distance)), so it reflects current fitness — not just what you ran last time. Shows predicted finish, race pace, the anchor run, weeks-to-race, and a colour-coded confidence badge (high = anchor ≥ 60% of race distance + ≥ 3 qualifying runs; medium = ≥ 35% + ≥ 2; low = big extrapolation).
- **7-day planner:** assign `easy` / `tempo` / `long` / `rest` days with optional target distance. Switch to **Month view** for a full calendar overview. Plans on days where a run has been logged are automatically cleared on sync.

### Strava setup
1. Create an app at [strava.com/settings/api](https://www.strava.com/settings/api). Set **Authorization Callback Domain** to exactly `localhost` (no port, no protocol, no slash).
2. Add `STRAVA_CLIENT_ID` and `STRAVA_CLIENT_SECRET` to `.env.local`.
3. Click **Connect Strava** in the Running hub — you'll always see the consent screen (Strava OAuth is called with `approval_prompt=force`); tick **View data about your private activities** and Authorize.
4. After first sync, click **Sync runs** once more — this backfills the Strava activity ID on runs that were imported before the detail popup was added.

**Note on API access:** Strava is gating public API access behind a paid subscription. If Connect Strava logs in but nothing happens afterwards, or you see a message about *"API adgang kun for abonnenter"*, that's Strava's paywall — you'll need an eligible subscription for the sync to work.

**How the OAuth callback URL is built:** both `/api/strava/auth` and `/api/strava/callback` derive the origin from the request's `Host` header (not `NEXT_PUBLIC_BASE_URL` or `request.url`) so the callback works on whichever port Next.js is actually running on — 3000 in dev, 3001 in the packaged Electron app. Do NOT set `NEXT_PUBLIC_BASE_URL` for this to work.

---

## School

Assignments are stored in SQLite with an optional due time (`HH:MM` local time).

- `GET /api/school` auto-marks any non-done assignment as **overdue** the moment its deadline passes (date + time combined), with no manual action needed.
- The widget shows overdue items first with a glowing red dot. The due-date label shows an exact countdown (`2d 14h`, `3h 20m`) when a due time is set.
- Overdue status can only be cleared by marking the assignment **Done**.
- **Estimated hours** — optionally set how many hours an assignment will take when creating it (editable inline on non-done tasks).
- **Hours spent** — log actual hours spent so far on in-progress tasks directly in the School Hub. The scheduler subtracts spent hours from the estimate and reschedules automatically.
- **Study days** — toggle which days of the week count as study days (Mon–Sun, indigo = active). Non-study days are skipped entirely by the scheduler. Persists to `.school-settings.json`.
- **Hours per day** — set your preferred daily study target with the **h/day** input next to the day toggles (default 3 h, step 0.5). This becomes the scheduler's soft cap. Days in the Work Plan are green when at or under the target, red when over.
- **Work Plan** — when at least one assignment has an estimated hours value, a Work Plan section appears in both the hub and the dashboard widget. A sequential scheduler completes one assignment fully before scheduling the next (sorted by deadline). If an assignment finishes with time left on its last day, the next one begins that same day. **Look-ahead:** before scheduling each assignment the scheduler checks whether future assignments can fit at the configured h/day rate after it finishes at its natural pace. If they can't, the current assignment is automatically compressed to a higher daily rate, freeing the extra days for later tasks. The cap escalates smoothly up to 10 h/day as the absolute maximum. All displayed hours are rounded up to the nearest 0.5 h. The last scheduled day for each assignment is shown as "Est. done".
- **Finish-early buffer** — the scheduler never puts work on the deadline itself. If no due time is set, the last scheduled day is the day *before* `dueDate`. If a due time is set, the due day is capped at `(dueHour − 1 − 9)` hours instead of `(dueHour − 9)`, leaving a one-hour safety margin (change `BUFFER_HOURS` in `lib/load-distributor.ts` to widen or shrink the margin).
- **Schedule-aware colours** — priority dots reflect the schedule: green = fits within the h/day target, orange = tight (needs hard cap), red = overdue. Tasks without estimates use days-to-deadline proximity instead.
- **Dashboard widget** mirrors the full hub view (estimated hours, due date, countdown, read-only hours spent) — navigate to the hub only to add tasks or update hours spent. Work Plan day colours always match the hub: the widget reads `hoursPerDay` from the API (not a hardcoded value).

---

## Calendar

Events are pulled from **iCloud CalDAV** using Apple's PROPFIND/REPORT protocol. No third-party calendar service is involved.

- **Sources & names shown in the app:**
  - iCloud CalDAV: whitelisted via `CALDAV_INCLUDE` in `app/api/calendar/route.ts` (prefix match against iCloud display names). Current list: `Arbejde` (remapped to `Jennifer_arbejde` via `CALDAV_DISPLAY_NAME`), `Kalender`, `Rasmus*` (any iCloud calendar starting with `Rasmus`, remapped to `Rasmus_arbejde` so it merges cleanly with the ICS feed of the same name). Extend the array to surface additional iCloud calendars. The quick-add picker is driven by the API's `writableCalendars` field, which returns only these CalDAV names — ICS feeds are read-only by nature and never appear in the picker.
  - Public ICS URLs: `CALENDAR_SDU_URL` → `Rasmus_skole`, `CALENDAR_CAND_URL` → `Cand`, `CALENDAR_ARBEJDE_URL` → `Rasmus_arbejde`.
  - **CalDAV wins over ICS on name collision.** CalDAV is fetched first; any ICS feed whose name is already provided by a CalDAV calendar is skipped entirely (both events and the filter chip). This keeps `Rasmus_arbejde` writeable via the iCloud copy instead of leaving a read-only ICS duplicate that would double-count in the Week Ahead heatmap.
- **Window: 31 days back → 365 days ahead** — long-lead events like exam dates months out show up immediately.
- **Recurring events (`RRULE`) are expanded** — a weekly event whose base `DTSTART` is outside the window still produces all its individual occurrences inside the window (previously only the base date was checked, so recurring events silently disappeared).
- **All configured calendars get a filter chip** even if they currently have zero events in the window — the API returns a `calendars[]` list that the hub uses to build the chip row. Empty semester-break feeds like `Rasmus_skole` therefore stay visible instead of vanishing until events return.
- **Renaming migration:** the hub's stored `calendarFilter` (localStorage) is auto-migrated when a calendar is renamed in the code — known names retain their on/off state and new/renamed names default to enabled.
- **Auto-sync every hour** — the hub and the dashboard widget both re-fetch (`?bust=1` to skip the server cache) every 60 min, so calendars added upstream never lag behind by more than an hour without a manual reload.
- **Add + delete events** — the hub has a `+ Add event` button that PUTs a new VEVENT to a picked writeable calendar via `POST /api/calendar/add`. Each event in the day-detail panel whose calendar is CalDAV-writeable also gets a red `✕` — click → confirm → `POST /api/calendar/delete` (server does a `calendar-query` REPORT by UID to find the exact `.ics` href, then `DELETE`s it). ICS-feed events (Rasmus_skole, Cand, etc.) don't render the button since they're not deletable from here.
- **App-specific password required** — never use your main Apple ID password. Generate one at [appleid.apple.com](https://appleid.apple.com) → Security → App-Specific Passwords.

---

## Setup

### Prerequisites
- **Node.js 22 (arm64)** via nvm — required for correct native module compilation on Apple Silicon
- macOS Apple Silicon (arm64). Other platforms may need adjustments to the Electron titlebar drag strip.

### Install

```bash
nvm use 22
git clone https://github.com/Rpede22/Personal-Dashboard.git
cd Personal-Dashboard
npm install
cp .env.example .env.local   # fill in your credentials
npx prisma generate
npx prisma db push
npx prisma db seed           # seeds WoW checklist templates
```

### Run

```bash
npm run electron:dev   # starts Next.js + Electron together (recommended)
# or separately:
npm run dev            # Next.js only on :3000
```

### Build (Electron app bundle)

```bash
nvm use 22 && npm run electron:build
# Output: dist/Dashboard-0.1.0-arm64.dmg
```

**Must use Node 22 (arm64).** The system Homebrew Node runs under Rosetta (x64) and would produce the wrong binary. The build command runs four steps automatically:

1. `next build` — compile the Next.js app
2. `scripts/prepare-build.js` — copy static files, download the Electron arm64 prebuilt of `better-sqlite3` into standalone, merge Turbopack hashed modules, bundle `.env.local` and `dev.db`
3. `electron-builder` — package the DMG
4. `scripts/restore-dev-binary.js` — restore the Node 22 arm64 binary in the project root so dev mode keeps working after the build

After switching Node versions for the first time, run `npm install` once to reinstall native deps for arm64.

---

## Environment variables

Copy `.env.example` to `.env.local`:

| Variable | Required | Description |
|----------|----------|-------------|
| `ICLOUD_CALDAV_USER` | For calendar | Apple ID email |
| `ICLOUD_CALDAV_PASS` | For calendar | App-specific password (not your Apple ID password) |
| `STRAVA_CLIENT_ID` | For Strava sync | From strava.com/settings/api |
| `STRAVA_CLIENT_SECRET` | For Strava sync | From strava.com/settings/api |
| `RAPIDAPI_KEY` | For goal timelines | SportAPI7 on RapidAPI (free plan). Used for Esbjerg fB and Esbjerg Energy goal timelines. Subscribe at rapidapi.com → search "SportAPI7". |
| `BLIZZARD_CLIENT_ID` | For WoW ilvl + raid sync | From develop.battle.net → Create Client |
| `BLIZZARD_CLIENT_SECRET` | For WoW ilvl + raid sync | From develop.battle.net → Create Client |

Sports (NHL, FotMob, TheSportsDB, ESPN) and WoW (Raider.IO) use free public APIs — no keys needed.

### Rotating keys without a rebuild

The packaged app layers env files at startup:

1. **Bundled** `.env.local` — baked into the app at build time.
2. **Runtime** `~/Library/Application Support/Dashboard/.env.local` — read on every launch; **values override the bundled ones**.

So if you need to rotate a short-lived key (Riot dev keys expire every 24 h), just:

```bash
# create/edit the runtime override — same file format as .env.local
mkdir -p ~/Library/Application\ Support/Dashboard
cat > ~/Library/Application\ Support/Dashboard/.env.local <<'EOF'
RIOT_API_KEY=RGAPI-abc-123-new-key
EOF
```

Then quit and relaunch the app — no rebuild needed. The startup log (`~/Library/Application Support/Dashboard/server.log`) shows how many bundled vars and how many runtime overrides were loaded.

---

## Database

SQLite file lives at `dev.db` in the project root. Prisma schema: `prisma/schema.prisma`.

**Dev vs. app data are separate.** Dev mode reads/writes `dev.db` in the project root. The packaged app reads/writes `dashboard.db` in `~/Library/Application Support/Dashboard/` — this file is created once on first launch and reused on every subsequent launch, so your data persists. Data entered in the app does **not** flow back to `dev.db` automatically. To carry app data back into dev mode:

```bash
cp ~/Library/Application\ Support/Dashboard/dashboard.db /path/to/project/dev.db
```

**Auto-migration.** On every launch, the packaged app runs `electron/migrate-schema.js` to bring `dashboard.db` up to the bundled `seed.db`. It only makes additive changes (new tables, new columns, new indexes) — user data is never touched. That means adding a new Prisma model or column no longer requires a manual `prisma db push` on the packaged DB after each rebuild; just rebuild + relaunch. Column renames/removals still need manual handling.

**Widget error boundaries.** Each dashboard card is wrapped in [components/WidgetErrorBoundary.tsx](components/WidgetErrorBoundary.tsx). A rendering crash inside one widget shows a small red fallback card with the error message and a `↻ Retry` button; every other widget on the dashboard keeps working. Async/promise errors still need to be handled inside the widget (React error boundaries don't catch those).

After any schema change:
```bash
npx prisma generate
npx prisma db push
rm -rf .next/          # clear Next.js cache — stale Prisma client causes 500 errors
```

---

## Runtime files (git-ignored)

Created automatically on first use:

| File | Contents |
|------|----------|
| `.strava-config.json` | Strava OAuth tokens |
| `.wow-raid-baseline.json` | Weekly raid kill baselines |
| `.race-config.json` | Running race target date and distance |
| `.school-settings.json` | School scheduler settings: study days + h/day soft cap |

---

## Security

Dependencies are kept up to date. As of the last audit:

| Package | Status |
|---------|--------|
| `next` | Updated to 16.2.6 — patches DoS (Server Components) and XSS (CSP nonces) CVEs |
| transitive deps (`axios`, `@xmldom/xmldom`, `fast-uri`, `hono`, `ip-address`) | Patched via `npm audit fix` |
| `postcss` inside Next.js | Moderate — awaiting a Next.js upstream release |
| `@hono/node-server` inside Prisma CLI | Moderate — awaiting a Prisma 7.x upstream release; only reachable locally via `npx prisma` commands, not in runtime |

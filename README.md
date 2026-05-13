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

**Danish 1st Division split table:** After round 22, FotMob returns three sub-tables (Promotion Group / Relegation Group / 1. Division). The hub and widget both display the team's Oprykningsspil rank when available.

**Goal timelines:** Click any finished match to expand a goal-by-goal timeline with scorer, assist, and running score.
- **NHL:** Uses the free NHL play-by-play API. Includes strength indicator (EV / PP1 / PP2 / SH / EN / SO).
- **Barcelona:** ESPN hidden API (`site.api.espn.com`) — free, no key.
- **Esbjerg fB / Esbjerg Energy:** SportAPI7 via RapidAPI (`RAPIDAPI_KEY`). Searches all matches for the date, then fetches incidents. Requires a free SportAPI7 subscription.

**Auto-refresh:** The sports widget on the dashboard and every team hub page automatically re-fetch data every 5 minutes while the app is open — no manual refresh needed.

**Team box gradient borders** use real club colours — the GradientBorder wrapper component (outer div = gradient background + 3 px padding, inner div = surface colour) is the only reliable way to get gradient borders with `border-radius` in React inline styles.

**Dashboard widget heights** are equalised per row — CSS grid stretches each pair of widgets to match the taller one so neither column looks sparse.

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

## Running

Run logs and training plans are stored in SQLite. Strava sync is optional.

- **Manual logging:** add runs directly in the hub.
- **Strava sync:** connects via OAuth (tokens stored in `.strava-config.json`, git-ignored). Imports the last 30 days of activities, deduplicates by date + distance, and stores the Strava activity ID (`stravaId`) on each run. When a Strava run is synced for a day that already has a run plan, the plan is automatically removed.
- **Run log:** shows the 5 most recent runs by default. Click **All Runs (N)** to see the full history. Click any row to open the run detail popup.
- **Run detail popup:** for Strava-imported runs, shows a Leaflet route map (decoded from the encoded polyline), core stats (distance, duration, pace, elevation), heart rate and cadence (if recorded), and a per-km splits table. Manually logged runs show basic stats only. The popup has a fixed header (title + close button always visible) with the rest scrollable below. Hit **Sync runs** once after updating to backfill `stravaId` on existing Strava imports.
- **Training progress:** two bar charts appear once you have runs logged — *Weekly Kilometers* (last 12 weeks, current week highlighted) and *Longest Run* (best run per month for the last 6 months).
- **Race target:** set a race date and/or race distance in the hub. The widget and stats bar show days remaining and the target distance label.
- **7-day planner:** assign `easy` / `tempo` / `long` / `rest` days with optional target distance. Switch to **Month view** for a full calendar overview. Plans on days where a run has been logged are automatically cleared on sync.

### Strava setup
1. Create an app at [strava.com/settings/api](https://www.strava.com/settings/api). Set **Authorization Callback Domain** to `localhost`.
2. Add `STRAVA_CLIENT_ID` and `STRAVA_CLIENT_SECRET` to `.env.local`.
3. Click **Connect Strava** in the Running hub.
4. After first sync, click **Sync runs** once more — this backfills the Strava activity ID on runs that were imported before the detail popup was added.

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
- **Work Plan** — when at least one assignment has an estimated hours value, a Work Plan section appears in both the hub and the dashboard widget. A sequential scheduler completes one assignment fully before scheduling the next (sorted by deadline). If an assignment finishes with time left on its last day, the next one begins that same day. **Look-ahead:** before scheduling each assignment the scheduler checks whether future assignments can fit at the configured h/day rate after it finishes at its natural pace. If they can't, the current assignment is automatically compressed to a higher daily rate, freeing the extra days for later tasks. The cap escalates smoothly up to 10 h/day as the absolute maximum. All displayed hours are rounded up to the nearest 0.5 h. The last scheduled day for each assignment is shown as "Est. done". Due-time cap: if a due time is set, the due day itself is capped at `(dueHour − 9)` available hours.
- **Schedule-aware colours** — priority dots reflect the schedule: green = fits within the h/day target, orange = tight (needs hard cap), red = overdue. Tasks without estimates use days-to-deadline proximity instead.
- **Dashboard widget** mirrors the full hub view (estimated hours, due date, countdown, read-only hours spent) — navigate to the hub only to add tasks or update hours spent. Work Plan day colours always match the hub: the widget reads `hoursPerDay` from the API (not a hardcoded value).

---

## Calendar

Events are pulled from **iCloud CalDAV** using Apple's PROPFIND/REPORT protocol. No third-party calendar service is involved.

- Fetches calendars named: `Arbejde`, `Skolerelateret`, `Kalender`, `Cand` (configurable in `app/api/calendar/route.ts`).
- Window: 31 days back → 92 days ahead (supports 3 months of navigation in the hub).
- **App-specific password required** — never use your main Apple ID password. Generate one at [appleid.apple.com](https://appleid.apple.com) → Security → App-Specific Passwords.
- Public ICS feed URLs (`CALENDAR_SDU_URL`, `CALENDAR_CAND_URL`, `CALENDAR_ARBEJDE_URL`) are also supported as a simpler alternative.

---

## Setup

### Prerequisites
- Node.js 20+
- macOS (Electron titlebar drag is macOS-specific; other OS may need adjustments)

### Install

```bash
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
npm run build          # Next.js production build
npm run electron:build # packages into /dist
```

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

---

## Database

SQLite file lives at `dev.db` in the project root. Prisma schema: `prisma/schema.prisma`.

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

# Personal Dashboard

A local-only personal dashboard desktop app built with **Next.js 16 + Electron**. It aggregates sports scores, WoW weekly progress, school deadlines, running training, and your iCloud calendar into a single always-available dark-themed window — no browser, no cloud, no accounts needed beyond the optional integrations you configure.

---

## Dashboard overview

The home screen is a 2-column grid of widgets, each linking to a full hub page:

| Widget | Accent | What it shows |
|--------|--------|---------------|
| 🏆 **Sports** | Rainbow stripe | 2×2 grid of live data for EDM, Esbjerg fB, FC Barcelona, Esbjerg Energy |
| 📚 **School** | Indigo | Upcoming deadlines sorted by urgency; overdue items glow red |
| 🧙 **World of Warcraft** | Purple | Per-character ilvl, RIO score, weekly M+/raid/custom task progress |
| 🏃 **Running** | Green | This week's km, last 30-day km, recent runs, 7-day plan, days to race |
| 📅 **Calendar** | Pink | Upcoming events pulled live from iCloud CalDAV |
| 💼 **Work Hours** | Cyan | One-click link to register daily hours at profil.cand.dk |

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

**Source priority for football:** FotMob → API-Football (RapidAPI fallback, optional key) → TheSportsDB.

**Danish 1st Division split table:** After round 22, FotMob returns three sub-tables (Promotion Group / Relegation Group / 1. Division). The hub and widget both display the team's Oprykningsspil rank when available.

**NHL goal timeline:** Click any recent game in the NHL hub to expand a goal-by-goal timeline with scorer, assist(s), strength indicator (EV / PP1 / PP2 / SH / EN / SO), and running score. Uses the free NHL play-by-play API.

**Team box gradient borders** use real club colours — the GradientBorder wrapper component (outer div = gradient background + 3 px padding, inner div = surface colour) is the only reliable way to get gradient borders with `border-radius` in React inline styles.

---

## World of Warcraft

Characters are stored in SQLite and looked up via **Raider.IO** (public API, no key needed).

- **ilvl** is sourced from `gear.item_level_equipped` in the RIO response.
- The **weekly checklist** auto-seeds from templates every Wednesday at 06:00 UTC (EU reset). Templates: 8 M+ runs + 9 bosses × 3 difficulties for the current raid tier (`CURRENT_RAID_TIER` constant in `app/api/wow/sync/route.ts`).
- **Auto-sync** (`⟳ Sync` button): hits RIO for current M+ run count and raid kill count, compares against a baseline captured at the start of each WoW week, and auto-ticks completed items. Baseline is stored in `.wow-raid-baseline.json` (git-ignored).
- **Raid tier changes:** update `CURRENT_RAID_TIER` in `app/api/wow/sync/route.ts`, update boss count in `prisma/seed.ts`, then `npx prisma db seed`.

---

## Running

Run logs and training plans are stored in SQLite. Strava sync is optional.

- **Manual logging:** add runs directly in the hub.
- **Strava sync:** connects via OAuth (tokens stored in `.strava-config.json`, git-ignored). Imports last 30 days of activities, deduplicates by date + distance.
- **Race countdown:** set a race date in the hub; the widget shows days remaining.
- **7-day planner:** assign `easy` / `tempo` / `long` / `rest` days with optional target distance. Shown as a mini weekly grid on both the widget and hub.

### Strava setup
1. Create an app at [strava.com/settings/api](https://www.strava.com/settings/api). Set **Authorization Callback Domain** to `localhost`.
2. Add `STRAVA_CLIENT_ID` and `STRAVA_CLIENT_SECRET` to `.env.local`.
3. Click **Connect Strava** in the Running hub.

---

## School

Assignments are stored in SQLite with an optional due time (`HH:MM` local time).

- `GET /api/school` auto-marks any non-done assignment as **overdue** the moment its deadline passes (date + time combined), with no manual action needed.
- The widget shows overdue items first with a glowing red dot. The due-date label shows an exact countdown (`2d 14h`, `3h 20m`) when a due time is set.
- Overdue status can only be cleared by marking the assignment **Done**.

---

## Calendar

Events are pulled from **iCloud CalDAV** using Apple's PROPFIND/REPORT protocol. No third-party calendar service is involved.

- Fetches calendars named: `Arbejde`, `Skolerelateret`, `Kalender`, `Cand` (configurable in `app/api/calendar/route.ts`).
- Window: 31 days back → 92 days ahead (supports 3 months of navigation in the hub).
- **App-specific password required** — never use your main Apple ID password. Generate one at [appleid.apple.com](https://appleid.apple.com) → Security → App-Specific Passwords.
- ICS feed URLs (`CALENDAR_SDU_URL` etc.) are also supported as a simpler alternative.

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
| `RAPIDAPI_KEY` | Optional | API-Football fallback (100 req/day free). FotMob is used first. |

Sports (NHL, FotMob, TheSportsDB) and WoW (Raider.IO) use free public APIs — no keys needed.

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
| `.race-config.json` | Running race target date |

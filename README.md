# Personal Dashboard — Vibe Coded

A local-only personal dashboard desktop app built with **Next.js 16 + Electron**. It aggregates sports scores, WoW weekly progress, LoL rank history, school deadlines, running training, work hours, weather, TV news, and your iCloud calendar into a single always-available dark-themed window — no browser, no cloud, no accounts needed beyond the optional integrations you configure. A Today Briefing pins the day's calendar / sport / run / school / media rows above the grid, and a 7-day Week-ahead heatmap sits below it.

---

## Dashboard overview

The home screen is a 2-column grid of drag-reorderable widgets, each linking to a full hub page. Widgets are toggled on/off and their auto-refresh cadence set from the unified **⚙️ Settings** modal in the header.

| Widget | Accent | What it shows |
|--------|--------|---------------|
| 🏆 **Sports** | Rainbow stripe | 2×2 grid of live data for EDM, Esbjerg fB, FC Barcelona, Esbjerg Energy — last 5 results, next fixture, rank + delta chip, match-of-the-week strip |
| 📚 **School** | Indigo | Upcoming deadlines sorted by urgency; hoursSpent progress rings; overdue items glow red |
| ✅ **Tasks** | Indigo | Quick prioritised todos — the top 5 open by priority (high/medium/low), each with an inline tick to complete; an optional day/time when you want a little precision, but no heavy scheduling |
| 🎮 **Games** | Purple / Blue / Orange | Tab switcher — WoW: per-character ilvl / RIO / weekly M+/raid progress · LoL: expandable per-account cards with rank, W/L, recent matches · CS2: FACEIT accounts sidebar + rank/elo, last-30 stats, match history → click a match for the full scoreboard |
| 🏃 **Running** | Green | This week's km vs plan, recent runs, 7-day plan, race countdown, recovery-day dot |
| 🍽️ **Meals** | Orange | "What's for dinner" — the next few planned dinners with thumbnails (Tonight / Tomorrow / weekday) |
| 📅 **Calendar** | Pink | 7-day grid pulled live from iCloud CalDAV + configured ICS feeds |
| 💼 **Work Hours** | Cyan | Manual session log, current pay-term totals (`Xh Ym`), estimated net kr after AM-bidrag (8%) + A-skat (38%). **Pay-term** and **payday** are independent: the term flips on a configurable day-of-month (default 23), the payday countdown targets the last weekday of the month by default |
| 📰 **News** | Orange | Latest 10 headlines from your chosen source (TV2 / DR / BBC / Guardian) with section chip and relative timestamps; **Live** articles get a 🔴 red accent; click opens the article in a new tab |
| 📺 **Media** | Purple | "Next up" — 3 soonest-airing shows with next-episode number and countdown; auto-hides shows once you've watched every known episode; `🎧 N new podcast episodes` / `▶️ N new videos` / `🟣 N live now` lines when followed podcasts, YouTube channels, or Twitch streamers have something on |
| 🎮 **Steam** | Blue | Wishlist sale watcher — the games on your Steam wishlist that just went on sale (name · discount · price), on-sale first |
| 🌦️ **Weather** | Cyan | Current temp + today's hi/lo + **rain in mm** (like dmi.dk), a 6-block 24 h forecast strip, and a best-run-window pill scored against the current season |
| 💳 **Subscriptions** | Cyan | Recurring-spend tracker — total per month + the next few charges (name · amount · when), each normalised from its billing cycle |
| 📊 **Budget** | Green | A monthly **planning** budget (no per-purchase logging). The Overview frames the month as **Income → Planned expenses → Left to save**, with a "where your income goes" bar (expenses · goals · free) and a category pie (each as a % of income). A **Goals** tab tracks savings goals — set a target + a monthly amount and it shows progress and *when* you'll reach it. A **Year** tab has a yearly stats strip, per-category table, and click-a-month bar chart. The Plan tab has a **Variable expenses** section for costs that change monthly (fuel, power), and Settings has a **roll-over** option (carry unspent income into next month) with plain Yes/No buttons |
| 📈 **Watchlist** | Indigo | Stocks, **ETFs/funds** & crypto — price, daily % change, and a green/red sparkline per ticker (Yahoo Finance, keyless). The hub's add box is a **search-as-you-type** picker — type a name (e.g. "Vanguard", "Apple") and pick from ETF/stock/crypto matches, no need to know the exact ticker. **Click any ticker for a full chart popup** — range segments (1M/6M/1Y/5Y/Max) and a Yahoo/Google-style **hover-the-line** readout that shows the exact price + date on any day, with the range's start + end dates labelled under the chart |

---

## Architecture

```
┌─────────────────────────────────────────┐
│  Electron (electron/main.js)            │  ← Desktop wrapper, custom 28px titlebar drag strip
│  Loads http://localhost:3000            │     Auto-migrates dashboard.db on launch
└────────────────┬────────────────────────┘
                 │
┌────────────────▼────────────────────────┐
│  Next.js 16 App Router (Turbopack)      │  ← UI + API routes in one process
│  React 19 · TypeScript                  │
│                                         │
│  /app/page.tsx           Dashboard      │
│  /app/api/**             API routes     │
│  /components/**          UI             │
└────────────────┬────────────────────────┘
                 │
┌────────────────▼────────────────────────┐
│  SQLite (dev.db at project root)        │  ← Prisma 7 + better-sqlite3 driver adapter
│  Models: WowCharacter, WowChecklist,    │
│    WowChecklistTemplate, WowGearWishlist│
│    LolAccount, LolRankSnapshot          │
│    RunLog, RunPlan, Shoe, Assignment    │
│    MediaShow                            │
└─────────────────────────────────────────┘
```

Everything runs locally. No data leaves your machine except outbound API calls to the third-party services you opt into (Strava, Riot, Blizzard, FotMob, TV2, open-meteo, DMI, iCloud CalDAV).

---

## Sports

**Followed teams are configurable** — pick who you follow in ⚙️ Settings › Teams, no code edits. It's a two-step **League → Team** picker: choose a league, then one of its teams (teams are pulled live from that league's current standings, so there's nothing to hardcode). Reorder or remove from the same panel; up to 6 teams. Your list is saved to `followed-teams.json` and drives the dashboard widget, the per-team hubs (`/sports/<slug>`, a single dynamic route), and every sports API. Defaults are Esbjerg fB, FC Barcelona, and Esbjerg Energy.

**US sports (NHL / NBA / NFL) get the full EDM treatment.** Since American standings work by conference + playoff seed rather than a single league table, a followed US team shows its **conference playoff seed** in the dashboard box (like "#1 seed") and its hub renders **standings you can switch between Division / Conference / League views** (Pacific, Central, … · East/West · one flat table) with the team highlighted — matching how the dedicated Oilers hub looks. During the postseason the box swaps that line for the team's **live playoff series** (round + series score, e.g. `🏆 R1 · CAR 3–1 NJ · lead 3–1`), just like the Oilers box. Each US team's hub also gets a **Playoffs tab** with a **playoff-race strip** (conference seed, games remaining, margin to the cutoff, magic number, elimination number, clinched / in-the-race / eliminated) and a **Projected / Live** sub-tab. **Projected** is a bracket seeded from current standings (NHL & NBA 1v8…4v5, the NFL's #1-seed bye, and the NBA's play-in field seeds 7–10). **Live** shows the *real* playoff bracket as it unfolds — the official NHL API for NHL, and reconstructed from ESPN's postseason data for NBA (best-of-7 series) and NFL (single-elimination rounds), with seeds, series scores, and winners highlighted; outside the postseason it says so and points you back to Projected. Everything the Oilers hub has except the Monte-Carlo predictor, which stays EDM-only. **Before the season starts** a followed US team's box and hub show a clear **Preseason** state (the box: "🏁 Preseason · Season starts soon"; the hub: a preseason banner on Standings and "the playoff picture opens once the season starts" on Playoffs) instead of a meaningless "#12 · 0-0" rank and an empty bracket — the schedule tab still lists the upcoming fixtures. The next-match line is also robust to a team that was added during the summer gap (the ESPN team id is re-resolved from the standings if it wasn't captured at add-time).

Available leagues:

| League | Sport | Data source |
|--------|-------|-------------|
| Premier League · LaLiga · Serie A · Bundesliga · Ligue 1 | Football | **FotMob** — free, no key |
| Superligaen · 1. Division (Denmark) | Football | **FotMob** — free, no key |
| Metal Ligaen (Denmark) | Ice hockey | [Metal Ligaen's own JSON](https://s3.dualstack.eu-west-1.amazonaws.com/den.hokejovyzapis.cz) |
| NBA · NFL · NHL | Basketball · American football · Ice hockey | **ESPN** hidden API — free, no key |

US-sports hubs adapt automatically: standings become a **win-loss** table (`GP · W · L · [T for NFL] · Pct`, NHL keeps its `OTL · Pts` layout since it has real standings points) grouped by division, and the widget shows a plain record (`56-26`) instead of points. The per-sport playoff rules (spots per conference, play-in, byes, points-vs-wins) live in one place — [`lib/playoff-rules.ts`](lib/playoff-rules.ts) — so the race math and bracket shape are correct for each league rather than assuming NHL's format.

The **Edmonton Oilers (NHL)** keep their own dedicated hub (`/nhl`, official `api-web.nhle.com`) with a Monte-Carlo playoff predictor + bracket — a special experience separate from the configurable list. NHL in the picker is for following *other* teams.

**Match of the week highlight** on the dashboard: whenever any followed team (or EDM) plays a top-3 league opponent within the next 7 days, a small orange strip appears above the sports grid — team badge, home/away, opponent name, opponent's league rank, and kickoff time. Each row links straight to that team's hub.

**Goalscorers + last-5 detail.** The Top-scorers tab works for Metal Ligaen again (its stats endpoint is flaky and 500s the first several hits, so the app now retries), and it has a **League ⇄ this-team toggle** so you can see just your club's scorers, not only the league top-25. Every last-5 result row is now **expandable**: football shows goals + match stats, followed US teams (NHL/NFL) show the game's **scoring plays** (scorer + assists + running score), and Metal Ligaen shows the **per-period scores**.

**Esbjerg Energy uses [Metal Ligaen's own JSON](https://s3.dualstack.eu-west-1.amazonaws.com/den.hokejovyzapis.cz)** (via [lib/metalligaen.ts](lib/metalligaen.ts)) instead of TheSportsDB. This is the same data feed metalligaen.dk uses on its own site through the icestats.at widgets. It gives us proper standings, a full match schedule, **and a live playoff bracket** (see the Playoffs tab → Live sub-tab) — with best-of-7 pip rows, per-game scores, and OT/SO markers. The fetch walks back up to two seasons if the current one hasn't been populated yet (Metal Ligaen sometimes publishes an empty pre-season roster months before the opener), and the Esbjerg Energy widget row shows `W-L-OTL` instead of `W-D-L` since hockey games don't draw in regulation.

**Danish 1st Division split table:** After round 22, FotMob returns three sub-tables (Promotion Group / Relegation Group / 1. Division). The hub and widget both display the team's Oprykningsspil rank when available.

**Match reports.** For finished football matches (Barcelona + Esbjerg fB), clicking a match expands a stats panel above the goal timeline: ball possession, total shots, shots on target, expected goals, and each side's starting formation. Data comes from FotMob's `matchDetails` endpoint (free, no key) and is cached for 1 h. Every field is null-safe — if FotMob doesn't return a stat for a given match, the row is silently skipped rather than 500'ing the panel.

**Goal timelines:** Click any finished match to expand a goal-by-goal timeline with scorer, assist, and running score.
- **NHL:** Uses the free NHL play-by-play API. Includes strength indicator (EV / PP1 / PP2 / SH / EN / SO).
- **Barcelona:** ESPN hidden API (`site.api.espn.com`) — free, no key.
- **Esbjerg fB:** FotMob `matchDetails` (free, no key). A recursive walker extracts goal events and computes the running score itself. ESPN doesn't carry Danish 1. Division and SportAPI7 incidents were often empty — this used to leave EFB matches showing "No goals recorded" even when goals were scored.
- **Esbjerg Energy:** SportAPI7 via RapidAPI (`RAPIDAPI_KEY`). Searches all matches for the date, then fetches incidents. Requires a free SportAPI7 subscription.

**Auto-refresh:** The sports widget on the dashboard and every team hub page automatically re-fetch data every 5 minutes while the app is open — no manual refresh needed.

**Sports widget extras:**
- **Colour-coded record** — each team box's `W-D-L` / `W-L-OTL` line colours the numbers by outcome (wins green, draws/ties orange, losses red, OT losses blue) so the record is readable at a glance instead of a flat grey string.
- **Result badge** — the last-5 row on each team box surfaces the **actual score** (`us–them`) coloured by outcome — green win / red loss / grey draw / orange OTL — for 24 h after a finish. Replaced the earlier ✕/✓ icons since the score is more informative at the same footprint.
- **Standings-delta chip** — each team's rank is snapshotted to localStorage. When the position moves, a `+2 places` / `−1` chip appears next to the rank label, so the "since we last spoke" delta is always visible.
- **Kickoff countdown** — inside 12 h of a fixture, the next-fixture row appends `in Xh Ym`.

**NHL Playoff Predicted** (tab in the NHL hub) is always populated — the bracket loads on mount using regular-season standings + Monte Carlo win probabilities. Head-to-head records feeding the prediction are filtered to `gameType === 2` (regular season) so live playoff results never bias the pre-playoff forecast.

**Team box gradient borders** use real club colours — the GradientBorder wrapper component (outer div = gradient background + 3 px padding, inner div = surface colour) is the only reliable way to get gradient borders with `border-radius` in React inline styles.

**Dashboard widget heights** are equalised per row — CSS grid stretches each pair of widgets to match the taller one so neither column looks sparse.

**Live date under the headline.** The date shown under "Dashboard" is a small client component (`TodayDate`) that mounts on first paint and ticks every minute. It used to be rendered server-side in `app/page.tsx`, but the packaged Electron app kept the same Next.js process alive for days at a time and served the same cached HTML across midnight rolls, so the date only refreshed on a full app restart. Now it always reflects the current day without a reboot.

**Drag-to-reorder widgets.** Grab the small ⋮⋮ handle in any widget's top-right corner and drop it on another widget to swap positions. The hover target gets a blue outline while dragging. Your custom order persists to `localStorage["dashboard.widgetOrder"]` and survives reloads; a "Reset widget order" button appears below the grid whenever the order differs from the default.

**Loading skeletons.** While widget data loads, each card shows shape-appropriate pulsing skeleton blocks (rows for lists, a 2×2 grid for Sports, a 3-stat strip for Running) instead of a "Loading…" text — no more blank cards on first paint.

**Settings** — one **⚙️ Settings** button in the header opens a single modal (left-rail of sections, right pane). The rail is **grouped to match the dashboard's category chips** — **Dashboard** · **Sports** · **Finance** · **Health** · **Productivity** · **At a glance** · **Entertainment** · **App** — so a panel sits under the same heading its widget does. Panels that are just a list of your own content (Tasks, Countdowns, Watchlist, Subscriptions) show a short "manage this in the hub" placeholder instead of duplicating the hub. This replaced the old scattered toolbar menus:
- **General** panel — **theme** (Dark/Light, flips `data-theme` on `<html>`), **density** (Compact/Comfortable, flips `data-density`), **top-of-dashboard sections** on/off (Countdown / Today briefing / Week-ahead), and **widgets** — visibility toggle + per-widget auto-refresh dropdown (Off / 1 / 2 / 5 / 15 / 30 / 60 min). Widget drag-reorder still happens on the dashboard itself; `wide`-size widgets (e.g. Calendar) span two columns.
- **Per-hub panels** — each hub that owns settings adds its own section (currently 🏟️ **Teams**, 💼 **Work**, 📰 **News**, 🎮 **Games** (show/hide the WoW/LoL/CS2 tabs), 🌦️ **Weather** (city list + geocode search, shared with the WeatherHub picker), 📅 **Calendar**, 💬 **Feedback** (compose a bug/suggestion → prefilled email), and 💾 **Backup** (export/import your view preferences); more as they're built). This is the extensible pattern: a hub exports an `<XSettings />` panel and it plugs into the modal.
- Changes apply **live** — a shared settings store broadcasts an event so the grid/header re-render immediately. Everything persists (dashboard prefs to localStorage; hub configs to their JSON files). Disabling a widget/section *sticks* (a companion "known" list prevents it resurrecting on reload while still defaulting genuinely-new items on).
- **Today-briefing rows** — choose which rows (Calendar / Sport / Run / School / Media) appear in the Today card at the top of the dashboard.
- **Today in full** — pick which sections show on the full ☀️ Today page (Agenda / Tasks / Dinner / Run / Deadlines / Tonight); each still only appears when it has something for today.
- **Weekly review** — turn the whole `/review` recap on or off (off also hides its header pill), and pick which sections it shows (Running / **CS2 FACEIT** / **World of Warcraft** / LoL / School / Work / Calendar / Followed teams). For the game sections you also **choose which account** feeds each one (League / FACEIT / WoW), so the recap summarises the right account — and for **WoW you can pick several characters** at once (a card each), handy when you raid on more than one.
- **Backup / Share** — the 💾 **Backup** panel exports your dashboard **view preferences** (theme, density, currency, widget layout + refresh, sections, category, weather cities, Today-briefing rows, weekly-review sections, calendar filter) as a JSON blob you can copy and share, and imports one back (overwrites the matching settings on this device, then reloads). It only touches `dashboard.*` localStorage prefs — **no passwords, API keys, or accounts** are ever included, so an export is always safe to hand to someone else.
- **Display currency** — pick your currency (DKK, EUR, USD, GBP, SEK, NOK, CHF, AUD, CAD, JPY) in the General panel; everything money-related (Work, Budget, Subscriptions, the weekly review) reformats instantly. Amounts aren't converted — only the formatting/symbol changes — so enter values in your chosen currency. Asset prices in the Watchlist keep their own native currency.
- **Re-run setup** — the General panel has a button to reopen the first-run onboarding wizard any time (it never wipes what you've already configured).

**First-run onboarding.** On a genuinely fresh install (no config yet), a short, **fully-skippable** wizard walks you through the essentials — it opens with a **“Choose your widgets”** step (per-hub on/off, so you decide which widgets you actually want), then followed teams, work hours, news source, weather city, personal calendars, connecting Strava — plus a final **“More widgets”** step that bundles the optional setups (budget, running goal, watchlist, Steam, transit, subscriptions, tasks) behind one tab picker so nothing balloons the wizard. It reuses the exact same settings panels from the modal (so nothing is duplicated). Skip any step, or skip the whole thing; the app boots fully usable with sensible defaults regardless. Once finished or skipped it never auto-shows again (existing installs with any config are treated as already set up).

**Plain-language help, everywhere.** Every settings panel opens with a short intro (what it does, why, what you need), and the fiddly ones have a “Where do I get this?” expander. The **Calendar** panel in particular walks a non-technical user through the whole iCloud connection: what an ICS feed is versus an iCloud calendar, and a numbered guide to generating an **app-specific password** at appleid.apple.com (with the direct link and an explanation of why it’s not your normal Apple password). Anything that stores a secret says so — it’s kept only on your computer. **Every configurable widget now has a Settings panel** (Budget, Running, Steam, Transit, Watchlist, Countdowns, plus the existing Teams/Work/News/Games/Weather/Calendar), each also reachable from onboarding.

**Category filter.** When your enabled widgets span more than one category, a chip row above the grid lets you focus the dashboard on one theme at a time — **Sports · Finance · Health · Productivity · At a glance · Entertainment** (or **All**). Each widget declares one primary category; your pick persists across reloads.

**Today briefing** sits at the very top of the dashboard, with a **weather line** (icon, label, low/high, rain in mm) rendered under the date pill — pulled live from open-meteo (no API key required) for **Aarhus C** and refreshed hourly. Each row (calendar / sport / run / school) has a small ⋮⋮ drag handle so you can reorder them however you want — the order is persisted per kind, so tomorrow's rows keep the same layout. **Sports rows swap to the score once a today-match finishes** — before kickoff you see the fixture + countdown; the moment the final whistle lands (or FotMob flips `finished` / both scores appear), the same row switches to `us–them vs opp` coloured green (won) / red (lost) / muted (drew). Three extra rows are **opt-in** (off by default, toggle them in Settings → General → Today-briefing rows): **News** (latest headline), **Transit** (next departures from your home stop), and **Tasks** (your top open task + open count). Each only appears when it actually has something for today. (There's no separate Weather *row* — the weather line above always shows it.)

The briefing itself: a single card showing every calendar event that lands on today's local day, any tracked-team matches whose kickoff is on the same local day (kept visible after kickoff until finished — a 13.00 game doesn't disappear at 13.01), today's planned run, and the next school deadline. Fixture times are parsed as UTC (FotMob's raw format) and displayed via `toLocaleTimeString` so the local time is always right — an earlier version treated the UTC HH:MM as local and showed CEST games at the UTC hour. NHL gets a special-case rule: if EDM's next game kicks off between 00:00 and 07:00 tomorrow local, it's surfaced the evening before so overnight puck-drops aren't missed. Multiple calendar events collapse into one box (`TODAY · N events` header + `first title` + `HH.mm · started — then HH.mm Title · …`) so a busy day doesn't blow up the widget height. Empty slots collapse. Auto-refreshes every 5 min.

**Race countdown** appears as a dedicated card below the Today briefing whenever a race date + distance are set — big countdown number, Riegel-predicted finish time, pace, colour-coded confidence badge, and current week km. Unmounts the day after the race.

**Week-ahead heatmap** — a 7-cell strip sitting under the top cards. Each cell splits vertically into planned **school** hours (top, indigo) and **calendar-busy** hours (bottom, pink). Busy hours count the **union** of overlapping events — two events at 10–12 and 10–16 fill the bar as 10–16 (6 h), not 8 h — so a double-booked slot isn't counted twice (the hover tooltip still lists each event's own duration). Bars scale against a 12 h waking-hours ceiling; the cell outline goes green (≤ 8 h), orange (> 8 h) or red (> 12 h). Today gets a coloured border. Click the top half to jump to School; click the bottom half to open the calendar hub **straight to that specific day** (`/calendar?date=YYYY-MM-DD` — the hub reads the query param via `useSearchParams` and preselects the day). **Hover any cell** for a floating tooltip listing the individual assignments (with hours) and events (with time ranges) that make up the day's totals. Days with a planned run get a small 🏃 (or 😴 for rest days), colour-coded by session type (easy/tempo/speed/long). Answers "when is next week going to be a grind?" at one glance.

**Today in full** (`/today`) — a single-screen day overview that expands the dashboard's Today Briefing. It pulls together today's **agenda** (calendar events with times), open **tasks** (by priority, with an inline complete tick), tonight's planned **dinner**, any planned **run**, **deadlines** due in the next few days, and what's on **tonight** (TV shows airing + new podcast episodes). Only the sections with something in them show up; a genuinely empty day says so. Reached via a **"☀️ Today in full →"** pill under the dashboard header.

**Last 7 days review** (`/review`) — auto-generated recap of a **rolling 7-day window** (`today − 6 days at midnight` → tomorrow midnight): km vs plan, LoL wins/losses + top champion (Swimmingfizz account only — pooling smurfs muddied the recap), school assignments completed, calendar hours booked, and each followed team's results. One screen, no editing. Surfaced through a small **"🗓️ Review last 7 days →"** pill under the dashboard header — always visible now that the window rolls.

**Playoff race tracker.**
- **NHL Hub → Playoffs tab** now leads with a compact race panel for EDM: division rank, points, games remaining, margin over the current 9th-place team in the conference, **magic number** to clinch a playoff spot, and elimination number. Formulas assume 2 pts per win and ignore the regulation-win tiebreaker, so it's a rough guide, not a perfect one.
- **Football team hubs (Barca / Esbjerg fB)** get a title-race panel above the standings: current position, points, "behind leader" or "ahead of 2nd", "above drop" gap to the third-from-bottom, and max possible points if the team wins out.

**Sticky headers** — every hub page and the dashboard itself has a sticky header that stays pinned below the Electron title bar (`top: 28px`) while you scroll. Headers use a viewport-anchored background gradient (`background-attachment: fixed`) that matches the page background exactly, making them visually seamless rather than showing as a solid box.

---

## World of Warcraft

Characters are stored in SQLite and enriched via **Raider.IO** (public API, no key) and the **Blizzard API** (optional key, recommended).

- **ilvl** — primary source is the Blizzard equipment API (true decimal average, shown to 2 dp). Falls back to RIO `gear.item_level_equipped` if Blizzard credentials are not set.
- **This week, at a glance** — each character card shows its **highest M+ key this reset** (`+15 this week`), a 3-slot **Great Vault (M+)** row (the reward key level you've earned at 1 / 4 / 8 runs, `–` for slots not yet unlocked), a 3-slot **Great Vault (raid)** row (✓ at 2 / 4 / 6 bosses killed this reset), and your **tier-set count** (`Tier 4/5`, green at 5/5). Tier detection is generic — it reads the Blizzard equipment set data and picks whichever set fills the most of your 5 tier slots, so it never needs updating when a new tier releases.
- The **weekly checklist** auto-seeds from templates every Wednesday at 06:00 UTC (EU reset). Templates: 8 M+ runs + one entry per raid boss × 3 difficulties for the current tier (Midnight S2 = 10 bosses across Venomous Abyss, Tidebound Grotto, and The Unbinding of Kith'ix), all defined in `wow-tier.json`.
- **Auto-sync** (`⟳ Sync` button) — primary source is the Blizzard API per-boss `last_kill_timestamp`. Falls back to a RIO cumulative delta against a baseline captured at the start of each WoW week (stored in `.wow-raid-baseline.json`, git-ignored).
- **Raid tier changes:** update `CURRENT_RAID_TIER` + `CURRENT_TIER_INSTANCES` + `CURRENT_TIER_BOSS_COUNT` in `app/api/wow/sync/route.ts`, update `CURRENT_RAID_TIER` in `app/api/wow/character/route.ts`, update boss count in `prisma/seed.ts`, then `npx prisma db seed`.
- **Gear wishlist** — below the weekly checklist, a panel shows all 16 gear slots (Head, Neck, Shoulders, Back, Chest, Wrists, Main Hand, Off Hand on the left; Hands, Waist, Legs, Feet, Ring 1, Ring 2, Trinket 1, Trinket 2 on the right). Type an item name into any slot, then click ✓ to mark it as obtained. The ✓ button is disabled until an item name is entered. Persists to SQLite per character.
- **Character notes** — a free-text notes area below the gear wishlist, saved automatically on blur. Stored on the `WowCharacter` record so notes are per-character and persist across sessions.

---

## Games — WoW + League of Legends + CS2 + TFT

All four games share a `/games` hub with a WoW / LoL / CS2 / TFT tab switcher. `/wow`, `/lol`, `/cs2`, and `/tft` are aliases that open the same hub on the right tab, so old bookmarks and dashboard widget links keep working. Don't play one of them? Hide its tab (everywhere) in **⚙️ Settings › Games** — the same panel also lets you add/remove each game's accounts (FACEIT nickname, Riot ID, WoW character) without opening the hub.

**TFT (Teamfight Tactics)** shows each Riot ID's rank + last-10 placements (avg placement, top-4 %, firsts). Because Riot production keys are **per-product** (you pick a game when applying), TFT uses its own **`RIOT_TFT_API_KEY`** — separate from the LoL `RIOT_API_KEY` — and falls back to `RIOT_API_KEY` only when that's blank (e.g. a 24 h dev key, which grants all products). Until a TFT-capable key is present, the tab shows a "needs TFT product access" banner; Riot IDs are still saved and light up the moment the key can read TFT.

### League of Legends

Add accounts as `gameName#tagLine` + platform region (`euw1`, `na1`, `kr`, …). With `RIOT_API_KEY` set, the detail pane shows:

- **Profile** — icon + summoner level. (An earlier live-game badge was removed — Riot's spectator endpoint reported stale sessions as "live" too often to be useful.)
- **Ranked cards** — Solo/Duo + Flex tier (iron → challenger) with **rank emblem icon**, LP, wins/losses, win-rate.
- **Match list** — filter by champion (dropdown of champs actually in the loaded matches) **and** by queue (**All / Solo / Flex / ARAM / Other**). Each row shows W/L color bar, champion icon, **summoner-spell icons (D/F)**, KDA + KDA ratio, CS + CS/min, duration, and time ago. **Click any row** for a full match popover with both team scoreboards (10 players, KDA, CS, gold, damage, vision — your player's row highlighted).
- **Load more** — "Load 10 more" button under the match list; automatically stops when there are no more matches.
- **Session view (per day)** — the match list is grouped by local calendar day (`Today`, `Yesterday`, `Sat 20 Jul`, …), with a per-day header showing W-L record (colour-coded) and total time played.
- **Top champions panel** in the sidebar (under the accounts list) shows the top 6 champions by games with KDA + win rate, aggregated across the full recent ranked history (up to 40 solo + 20 flex matches via `/api/lol/season-champs`) — not just the 10 matches loaded in the detail pane.
- **Rank history sparkline** in the sidebar plots your LP over the last 60 days per queue. Snapshots are written as a side effect of every summary fetch (throttled to once every 6 h per queue), so history builds up naturally without any cron job. The line uses a monotonic LP-equivalent scale (Iron IV 0 LP = 0, Diamond IV 0 LP = 2400, Master+ = 2800 + LP) so tier boundaries don't create fake jumps. Tier-emblem icons sit on the Y-axis at each visible tier boundary, and hovering the chart snaps a dashed guide + focus dot to the nearest point with a floating tooltip (date, tier + LP, W-L).
- `⟳ Refresh` re-fetches. Errors surface with actionable hints (missing key / rate limit / expired key).

Get a Riot dev key at [developer.riotgames.com](https://developer.riotgames.com/) (24-hour dev key or apply for production). Dev tier rate limits: 20 req / 1 s and 100 req / 2 min. Set `RIOT_API_KEY` in `.env.local` and rebuild.

### Counter-Strike 2 (FACEIT)

A full **LoL-style hub** — accounts sidebar on the left, the selected account's detail on the right. With `FACEIT_API_KEY` set you get:

- **Sidebar** — each saved account with avatar, nickname, **skill level** (1–10, colour-coded the FACEIT way — grey → green → yellow → orange → red), and **elo**. Click to select.
- **Header** — the selected account's avatar, level, region, and elo, plus an **↻ Update** button that refreshes that account's stats + matches on the spot (no need to switch accounts to force a refresh).
- **Last 30 matches** — win %, W-L, average K/D, ADR, and headshot %.
- **Match history** — a row per recent match (map · WIN/LOSS + round score · K/D/A · KDA · ADR · when). **Click a match** for the full **scoreboard** — both teams, every player's K/D/A, K/D, ADR, HS %, and MVPs, with your row highlighted.

Accounts are stored by nickname in `faceit-accounts.json` (no database). The API key is the **author's**, bundled like the Riot key — users only add their FACEIT nickname. You can add nicknames before the key is set; they'll light up once it is. Get a free key at [developers.faceit.com](https://developers.faceit.com/) (create an app → API keys → **Server-side**) and set `FACEIT_API_KEY` in `.env.local`. Until then the CS2 tab shows an "add a key" banner but still lets you save nicknames.

### Dashboard widget

Row 2 of the dashboard shows a single **`GamesWidget`** with a WoW / LoL / CS2 tab bar at the top — only one game is visible at a time and the active tab is persisted to localStorage. Clicking the widget body opens the matching hub.

The **LoL widget** has one expandable card per account. The collapsed header shows *Riot ID · region · short tier (e.g. `E IV`) · W/L · WR* (green ≥ 55% / red < 45%). Click the header to expand: the rank card has a **130 px emblem** rendered natively (sharp) — sized to match the 4-line text stack next to it so the card doesn't grow beyond what the text already needs. Plus the **last 5 games** with a **44×44 champion icon**, K/D/A, KDA ratio, and CS. Expand state is remembered across dashboard reloads.

The **LoL hub** goes deeper: rank card uses a **220 px emblem** (again sized to fill the text stack, no upscale — earlier `transform: scale` tricks looked blurry), and each **session day-header** in the match list gets a **most-played-champion-of-session pill** (icon + W/L + KDA, ranked by games → win-rate → KDA, shown whenever that day had ≥ 2 games). (The per-session LP chip was removed — rank snapshots are only taken every ~6 h, so the delta rarely lined up with the actual games played and could show numbers like `−11 LP` next to a session that went 1W 1L.)

---

## Running

Run logs and training plans are stored in SQLite. Strava sync is optional.

- **Manual logging:** add runs directly in the hub.
- **Strava sync:** connects via OAuth (tokens stored in `.strava-config.json`, git-ignored). Imports the last 30 days of activities, deduplicates by date + distance, and stores the Strava activity ID (`stravaId`) on each run. Each new activity's `best_efforts` (400m / 5k / 10k / half / marathon splits) is also pulled and cached on the run so the PR grid can use real splits instead of full-run averages. When a Strava run is synced for a day that already has a run plan, the plan is automatically removed (its distance is first snapshotted onto the run so the week-vs-plan target survives).
- **Sync PRs button** (Strava panel): backfills `best_efforts` for every Strava-imported run that doesn't have them yet — batches of 40 per click, loops until done. Only needed once to enrich your history; new sync runs pick them up automatically.
- **Personal Records grid** (Overview tab): 400m / 5k / 10k / Half / Marathon + **Longest ever**. The time buckets come **only** from Strava splits; a bucket without a real split renders "—" rather than back-computing from a whole run. Each cell shows time + pace/km + date so you can compare across efforts at a glance. The **Longest ever** box sits right after Marathon and scans your entire run log (no time window) for the single longest run — it shows distance up top with avg pace + date below.
The Running Hub has three tabs:
- **Overview** — training progress charts, race config, Strava integration, run planner.
- **Run Log** — the full run table with `+ Log Run` button. Shows 5 most recent by default; click **All Runs (N)** to see the full history. Click any row to open the run detail popup.
- **Training** — data-driven weekly plan built from your actual run log:
  - Last-completed-week + this-week snapshots (km, run count, longest run, avg pace).
  - 8-week volume bar chart with next-week target overlaid in orange.
  - Automatic warnings if last week looked off (only 1 run, no long run, long run > 55% of volume).
  - Next-week target: **+10%** on your **rolling 3-week average** (the three most recent **completed** weeks — the current in-progress week is excluded so a half-finished week never skews it), **−25% cutback** after 3 up-weeks, or conservative starter volume if the avg is below ~5 km/week. The cutback never chains — once you're inside a cutback week the next suggestion goes back to building, so the rhythm is 3× build → 1× cutback → repeat. Both the rolling average and last-week totals are shown so you can see what the plan is built on.
  - Suggested sessions follow fixed distance rules: **long ≥ 1.4 × easy** (the long is always the biggest run of the week), **tempo = min(easy, 6 km)** (sustained "comfortably hard" beyond 6 km stops being a tempo — the surplus rolls into the long run so the target is still hit), and **speed = fixed 7 km** (3 km warm-up + 10 × 400 m intervals + short cool-down — intervals are a stimulus, not a mileage bucket). Easy distance is solved back from the weekly target so everything adds up exactly.
  - **Mon–Sun weekly grid** shows exactly which day each session belongs on. Standard 5-day week: `Mon Easy · Tue Speed · Wed Easy · Thu Tempo · Fri Rest · Sat Rest · Sun Long`. Rule enforced by the planner: never two hard sessions in a row.
  - **Customise the plan** — override the weekly target km (auto-suggested as placeholder) and pick 3/4/5/6 run days per week. Templates: 3 (Easy + Tempo + Long — a proper quality week with a big weekend long), 4 (add a second easy), 5 (add a speed session — standard 80/20), 6 (advanced). Auto-picks based on volume when left as "auto": ≤ 30 km → 3 days, ≤ 40 km → 4, ≤ 50 km → 5, > 50 km → 6 — the bands lean toward fewer days so each run carries enough km for a real long run (a 3-day 30 km week gives you a ~15 km Sunday long). A true starter (barely any recent running) still gets 3 easy runs with no quality.
  - **Custom composition** — a 4-counter panel (Easy / Tempo / Speed / Long, each with +/− and a live "N / 7 runs" total) lets you handpick exactly what next week looks like instead of accepting the template. Setting any counter overrides the runDays picker; distances are still solved from the weekly target using the same base-unit math (long = 1.4·easy, tempo = min(easy, 6 km) with the surplus rolled into the long, speed fixed 7 km), and sessions are laid out on Mon–Sun with the same "no two hard days in a row" rule. "Reset to template" restores the auto shape.
  - **"Apply to next week's planner" button** — writes each non-rest session into next week's `RunPlan` rows so it shows up in the Overview tab planner. Existing next-week plans are replaced.
  - **Drag-drop day swap** in the Overview tab's week view — grab any plan chip and drop it on a different day card (green dashed highlight while hovering). Useful for varying which day is a rest day week to week without deleting/re-adding.
  - All logic lives in [lib/training-planner.ts](lib/training-planner.ts) — pure functions, easy to tweak the framework.

- **Run detail popup:** for Strava-imported runs, shows a large Leaflet route map (400 px tall with a **⛶ Fullscreen** button that expands to the full viewport). Fullscreen has a solid black background, a bright red **✕ Exit fullscreen** button (always visible over any map colour), locks body scroll while active, and swallows wheel/touch events so the modal underneath doesn't scroll behind. Escape also exits. The map uses a `ResizeObserver` to re-invalidate Leaflet's tile layout whenever the container resizes, which fixes the half-loaded / partial-tile bug during fullscreen transitions. Popup also shows core stats (distance, duration, pace, elevation), heart rate and cadence (if recorded), and a per-km splits table. Manually logged runs show basic stats only. Fixed header (title + close button always visible), rest scrolls below.
- **Weather-at-run overlay:** every Strava-imported run stores the historic weather at its start (open-meteo archive endpoint — free, no key; uses the activity's `start_latlng`, falls back to Aarhus for manual runs). Displayed in the Run Detail popup as `☀️ Clear · 15° (feels 13°) · 💨 2.3 m/s · ☔ 0.4 mm`. Backfill button `Sync weather` in the Strava panel batches 40 per click until all runs are stamped.
- **HR-zone breakdown:** Strava's raw HR + time streams are bucketed into Z1..Z5 (60/70/80/90 % of an estimated max) and cached per-run. Run Detail shows a stacked bar + per-zone `seconds · %` cards. Backfill button `Sync HR zones` in the Strava panel. Runs recorded without a HR sensor get a sentinel so we don't keep asking.
- **Shoe-mileage tracker:** add pairs to the `👟 My shoes` panel; a green→orange→red progress bar tracks each pair against **600 km** (rotate warning) and **800 km** (retire). Every logged/synced run auto-picks the last-used non-retired shoe (Strava sync too); each row in the Run Log has a `Shoe` cell you can change to fix mistakes. Retiring a shoe hides it from the log form's default without deleting historical mileage.
- **Shoe picker on sync:** if you rotate between **two or more pairs**, a Strava sync pops a quick prompt listing the runs it just imported so you can set which shoe each was run in (they default to your last-used pair). A "Set all to" selector handles a whole batch at once, and "Skip" keeps the defaults. With a single pair (or none) there's nothing to choose, so the prompt doesn't appear.
- **Strava errors** are shown with actionable hints — 403 (missing scope, reconnect Strava), 401 (token expired), 429 (rate limit).
- **Training progress:** two bar charts appear once you have runs logged — *Weekly Kilometers* (last 12 weeks, current week highlighted; label shows the Mon–Sun date range, e.g. `18 May – 24 May`) and *Longest Run* (best run per month for the last 6 months; label is just the month name, e.g. `Dec`).
- **Stats bar** at the top of the hub (This week / Last 30 days / etc.) is shown to 2 decimals so nothing is rounded away.
- **Race target:** set a race date and/or race distance in the hub. The widget and stats bar show days remaining and the target distance label.
- **Race predictor** (Training tab): once a race distance is set, projects a finish time from your last 90 days of training via the **Riegel formula** (`T2 = T1·(D2/D1)^1.06`). Anchors on the fastest projection across every qualifying run (≥ max(3 km, 20% of race distance)), so it reflects current fitness — not just what you ran last time. Shows predicted finish, race pace, the anchor run, weeks-to-race, and a colour-coded confidence badge (high = anchor ≥ 60% of race distance + ≥ 3 qualifying runs; medium = ≥ 35% + ≥ 2; low = big extrapolation).
- **7-day planner:** assign `easy` / `tempo` / `long` / `rest` days with optional target distance. Switch to **Month view** for a full calendar overview. Plans on days where a run has been logged are automatically cleared on sync.
- **Recovery indicator** in the dashboard widget — small green/orange/red dot + label based on days since the last hard session (≥ 10 km OR pace < 5:00/km), so it's obvious when a rest day is overdue vs when you should be ready to push.

### Strava setup
1. Create an app at [strava.com/settings/api](https://www.strava.com/settings/api). Set **Authorization Callback Domain** to exactly `localhost` (no port, no protocol, no slash).
2. Add `STRAVA_CLIENT_ID` and `STRAVA_CLIENT_SECRET` to `.env.local`.
3. Click **Connect Strava** in the Running hub — you'll always see the consent screen (Strava OAuth is called with `approval_prompt=force`); tick **View data about your private activities** and Authorize.
4. After first sync, click **Sync runs** once more — this backfills the Strava activity ID on runs that were imported before the detail popup was added.

**For end users it's one click** — the app author's `STRAVA_CLIENT_ID`/`SECRET` are bundled, so users just hit **Connect Strava** (in the onboarding wizard or the Running hub), log in, and approve. No Strava developer account on their side.

**If you distribute this:** a fresh Strava API app is capped at **1 authenticated athlete** until you request a rate-limit/athlete increase from Strava — fine for personal use, but you'd need that bump before more than one person could connect.

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
- **Schedule-aware colours** — priority dots reflect the schedule: green = fits within the h/day target, orange = tight (needs hard cap), red = overdue. Tasks without estimates use days-to-deadline proximity instead. **Confidence dot** blends in the load-plan's estimated finish date vs the deadline — orange/red when the plan finishes too close to (or past) the deadline.
- **Progress ring per assignment** — when `estimatedHours` is set, the priority dot is replaced by a small SVG ring filled by `hoursSpent / estimatedHours`, visible in both the hub and the dashboard widget.
- **Dashboard widget** mirrors the full hub view (estimated hours, due date, countdown, read-only hours spent) — navigate to the hub only to add tasks or update hours spent. Work Plan day colours always match the hub: the widget reads `hoursPerDay` from the API (not a hardcoded value).

---

## Steam

A wishlist **sale tracker** — "something on your wishlist is on sale". Fully **keyless**: it uses Steam's public wishlist + store price endpoints, so all it needs is your **SteamID64** (a 17-digit number) and a public profile — no API key, no login.

- **Setup** — paste your SteamID64 (find it at [steamdb.info/calculator](https://steamdb.info/calculator/) from your profile URL). Your profile and game details must be set to public.
- **Wishlist grid** — every game on your wishlist with its store image, current price, and a **−X% discount badge** (with the original price struck through) for anything on sale. On-sale games are highlighted and sorted first, and a banner tells you how many there are.
- **Dashboard widget** — with a key + SteamID it leads with your **most-recently-played game** and a `N games · Xh total · N unplayed` line, then the top wishlist sales (`N wishlisted · M on sale`).

**With a `STEAM_API_KEY`** (free from [steamcommunity.com/dev/apikey](https://steamcommunity.com/dev/apikey)) the hub adds keyed sections — a **persona header** (avatar + name), **Recently played** (your past-2-weeks games with recent + total hours), **Library** (game count + total hours + your top-6 most-played), **Achievements** (completion-% progress bars for the games you've played recently), and **Backlog** (how many owned games you've never launched, with a sample list) — and the setup box then also accepts a **profile URL or custom-URL name** (resolved to a SteamID for you), not just the raw SteamID64. The wishlist works without the key; a 🔑 banner explains adding it.

Only your SteamID is stored (in `steam.json`); everything else is fetched live and cached.

---

## Transit

A live **public-transit departure board** for a home stop, powered by **[Rejseplanen API 2.0](https://labs.rejseplanen.dk/)** (the Danish national journey planner). Needs a free `REJSEPLANEN_API_KEY`; until it's set, the hub + widget show an "add a key" banner.

- **Pick your stop** — search any stop or station by name; the match is saved to `transit.json`.
- **Favourite lines** — in Settings › Transit, save up to 3 lines you ride most (e.g. `2A`, `Bus 5`). The board **pins them to the top with a ★**, so you don't have to scan for them.
- **Departures** — the next departures with a mode icon (🚌 bus / 🚆 S-train / Ⓜ️ metro / 🚂 train), line + direction, scheduled time with a **realtime delay** (`+3 min`, green when early), platform, and a `now` / `X min` / `HH:MM` countdown (orange within 2 minutes). Cancellations are flagged. Auto-refreshes every 30 s.
- **Dashboard widget** — the next few departures at a glance (category *At a glance*).

---

## Meals

A weekly dinner planner with a "what can I make tonight?" recipe finder. International recipe data comes from **[TheMealDB](https://www.themealdb.com/)** — free and keyless (no signup).

- **Your dishes** — add your **own** dishes (any language): a name is all that's required, with an optional recipe (free-text steps *or* a link), ingredients, and image. They're assignable to any day just like online recipes, and this is the reliable **Danish** path (no good keyless Danish recipe API exists yet).
- **Language** — set English or Danish in ⚙️ Settings › General. **English** unlocks the international recipe search (TheMealDB is English-only); **Danish** hides it and leans on your own added dishes. Your dishes show either way.
- **This week** — a Mon–Sun grid, one dinner per day. Click a day to plan it; assigned meals show their photo + name with a ✕ to clear and a click-through to the full recipe.
- **Find by ingredients** — **tick what's in your kitchen** from a categorised checklist (Produce, Protein, Dairy, Pantry, Herbs & spices), with an "add other" box for anything not listed, and get recipes ranked by how much of your pantry they use. Each result shows `X/Y on hand` and a **"Buy:" list** of the ingredients you're missing — with the "you only need 1–2 more" meals surfaced first.
- **Find by name** — a normal recipe search. The two finders are separate, clearly-labelled tabs so it's obvious which one you're using.
- **Recipe view** — a modal with the photo, ingredient list + measures, full instructions, and source/video links.
- **Assign to a day** — every result (and the recipe modal) has a "+ <day>" button that drops the meal onto the day you're planning.
- **Dashboard widget** — "what's for dinner": tonight's planned meal plus the next couple of days.

Plans are stored in `meal-plan.json` (no database) — only the day→meal mapping is saved; the recipe details are fetched live.

---

## Tasks

A lightweight todo list — deliberately simpler than School: no load-distribution, just quick tasks with a priority you tick off, plus an **optional day/time** when you want a bit of precision without the full calendar. File-based (`tasks.json`), so no database.

- **Add** — type a task, pick **High / Medium / Low**, optionally set a **📅 day (+ time)**, hit Enter (or Add).
- **Active list** — sorted highest-priority first, then oldest-first within a priority (so long-standing todos surface). Each row has a coloured left border by priority, a tick to complete, an inline priority switcher, an optional inline day/time (shows an overdue flag when past), double-click-to-rename, and delete.
- **Completed** — a collapsible section at the bottom; reopen a task with its green ✓, or "Clear completed" to wipe them all.
- **Dashboard widget** — the top 5 open tasks by priority with an inline tick to complete without opening the hub; the header shows `N open · M high`.

---

## Work

The Work widget is a small summary that links into a full `/work` hub.

- **Widget** — current pay-term total (bold), days-to-payday, an `≈ N kr net` tint under the hours whenever any session in the term carries a rate, `Last pay-term Xh Ym ≈ N kr` line (visible for a few days after payday so you can still eyeball the payslip total), and the last few logged sessions. All totals show as `Xh Ym` — never a raw decimal like `1.5h`. No editing from the widget.
- **Hub** — two tabs:
  - **Overview** — current pay-term (range + total), last pay-term summary, optional "next pay-term (already logged)" line for sessions logged after payday, a session log form (date + **separate h / m inputs** + a **kr/h rate** field that defaults to the last-used rate + optional note — no more fiddly decimal hours; 1h 30m = "1" + "30"), and the sessions-this-term list. When any session in the current or last pay-term carries a rate, a **compact earnings breakdown** appears under the hours total: `Gross · AM-bidrag (−8%) · A-skat (−38%) · Net`. Same on the last-pay-term card. Per-session rows show `@ rate kr/h · gross`. **Every hour value** on this page reads as `Xh Ym` (`45m`, `2h`, `1h 30m`) — never a raw decimal; every kr amount reads in Danish locale (`1.234 kr`). Payday editor supports **off / day-of-month / last-weekday**.
  - **Entries** — all-time table with Date · Hours · Rate · Gross · Note columns, plus running totals for both hours and gross.
- **Rate history preserved** — the hourly rate is stamped into each session on write. Getting a raise doesn't rewrite past pay: old sessions stay at the old rate; new ones use the new one.
- **Pay cycle** — the default payday is the **23rd**, matching the Cand cycle (term = the 24th → the 23rd of the following month). Change it at any time from the payday editor.
- **Danish tax model** — fixed-percentage: 8% AM-bidrag off the top, then 38% A-skat on what remains. Not a full tax calc (no fradrag, no personal deductions) — but honest enough for a paycheck preview.
- **Multiple income sources** — got more than just the hourly job (e.g. Danish **SU**)? Flip **"Do you have more than one income?"** in ⚙️ Settings › Work and add fixed monthly incomes. Each is marked **net** (already after tax, like SU — added straight to your net) or **gross** (taxed like job pay). The Work income the Budget hub pulls in then reflects the *combined* monthly total (`Job X + SU Y = Z net`), not just the job. Unchecked keeps the simple single-job view.
- **Disable-able** — don't log hours? Turn hour tracking **off** in ⚙️ Settings › Work. The hub + widget collapse to a "💤 tracking off" state and anything that needs a monthly-hours figure (future budget) assumes a flat fallback (default **160 h/month**, editable). Turn it back on any time.
- **Editable links** — the "Register hours" / "View payslips" buttons are configurable URLs (Settings › Work); blank hides the button. Defaults point at the Cand/Intect sites.
- Everything persists to `.work-config.json` via `GET/POST /api/work`.

---

## News

- **Pick your source** in ⚙️ Settings › News: **TV2** or **DR** (Danish), **BBC** or **The Guardian** (English). Selection is saved to `news-config.json`. TV2 has no public RSS so it's scraped; DR/BBC/Guardian are real RSS feeds. The News widget + hub both follow the selected source.
- **Section filters work for every source.** DR's "all news" RSS carries no categories, so it's pulled from DR's **per-section feeds** (Indland/Udland/Penge/Kultur/Viden) with each article tagged by its feed; BBC adds World/Business/Technology feeds; Guardian carries its own. So switching to DR (or BBC) keeps the section chips, not just TV2.
- **Widget** — latest 10 headlines: section chip · headline (2-line clamp) · relative timestamp. **Live** TV2 articles get a 🔴 red accent. Clicking opens the article in a new tab. Auto-refresh every 15 min.
- **Hub** — full list of the last ~50 headlines with a section filter row and a **Flat / Grouped** view toggle (grouped is the default — one card per section, capped at 5 headlines each, Live pinned to the top). The footer names the current source. For TV2, the route scrapes both `nyheder.tv2.dk` + `sport.tv2.dk` front pages (anchors matching `/(<section>(/<subsection>)?/)?YYYY-MM-DD-<slug>`; the two-segment path surfaces `/live/krimi/…` articles), strips section prefixes, and enriches the top-20 timestamps from each article's JSON-LD. Cached 15 min per source.

---

## Weather

- **Header strip** — the small icon + high/low + rain-% line at the top of the Today briefing (`components/dashboard/WeatherLine.tsx`) now doubles as the entry point to the full hub. Click anywhere on the strip → opens `/weather`.
- **Hub (`/weather`)** — a single-column, single-city view (defaults to Aarhus C but the city is user-selectable — see below):
  - **Now** — big current temperature + `feels-like` + wind (m/s) + UV + today's high/low, decoded from open-meteo's WMO code table (`☀️ 🌤️ ☁️ 🌫️ 🌦️ 🌧️ 🌨️ ⛈️`).
  - **Best run window today** — scores every 06:00–22:00 hour with **season-aware** rules (summer favours warm sun but penalises peak heat, fall wants warm + dry with rain weighted heavier, winter wants the warmest hour with no snow, spring just wants warmth) and picks the best 2h block. The dashboard Weather widget and the Week-ahead heatmap use the exact same scoring (`seasonFor` + `scoreHourForRunning`), so the "best window" agrees everywhere.
  - **Today hourly** + **Tomorrow hourly** — scrollable 24-cell strips with icon + °C + rain in mm; hovering a cell reveals feels-like + wind. Every relative label carries the calendar date (`Today · 24 Aug`, `Tomorrow · 25 Aug`) so there's no confusion about which day a strip is.
  - **Next 7 days** — icon + high/low + rain in mm + max UV per day, today outlined in cyan and labelled `Today · <date>`. **Tap any day → a full hour-by-hour popup** (like a weather app): the day's summary up top (high/low, condition, rain in mm, UV, sunrise/sunset) then every hour with temp/feels, the rain amount in mm and wind. It reuses the already-loaded hourly data — so Danish cities show **DMI** values on the near-term days (a 🇩🇰 DMI badge marks them), open-meteo beyond that.
  - **Sunrise / sunset / daylight** — plus a `± N min vs yesterday` delta (approximated as `tomorrow − today`, since open-meteo's forecast starts from today and there's no yesterday row in the response).
- **City picker** in the hub header — chips for every stored city (defaults: Aarhus C, Copenhagen, Esbjerg, Odense, Aalborg) plus a search box that geocodes new cities via open-meteo (no key). Selecting a chip re-fetches immediately and the header WeatherLine on the dashboard follows the same selection (persisted to `localStorage["dashboard.weather.city"]`).
- **Data sources — DMI for Denmark, open-meteo everywhere.** Weather goes through a small server proxy (`/api/weather`). For **Danish cities** it overlays **[DMI](https://opendatadocs.dmi.govcloud.dk/)** — the Danish Meteorological Institute's HARMONIE model (keyless since 2026) — onto the near-term temperature, wind and conditions, since it's the more trusted local short-range forecast; the WeatherHub shows a **🇩🇰 DMI** badge when it's active. DMI is short-range (~2.5 days) and doesn't publish UV / rain-probability / sunrise / 7-day, so [open-meteo](https://open-meteo.com/) still supplies those and the full 7-day tail, and drives every non-Danish city. Both are free and need **no API key**. Refreshes every 60 min in both the strip and the hub.

---

## Media (TV shows + Podcasts + YouTube + Twitch)

The hub has four tabs: **📺 TV shows** (a manual Danish-TV tracker — no scrape, no account), **🎧 Podcasts** (keyless RSS — follow any public feed and get told when a new episode drops), **▶️ YouTube** (keyless — follow channels and see who just uploaded), and **🟣 Twitch** (keyless — see which followed streamers are live right now).

On the **dashboard widget**, tapping a YouTube video opens its watch page, a Twitch streamer opens their `twitch.tv` channel, and a podcast opens the episode — each in a new tab, instead of dumping you into the hub's TV tab.

### TV shows

- **Widget** — tonight's chips (one per show airing on today's weekday), sorted by air time. Rows within the next 2 h are tinted purple; aired shows fade. `HH:MM · title · channel · in Xh Ym`.
- **Hub tab** — three sections:
  - **Tonight** — the same today-chips as the widget with the addition of a `🔴 N shows within the next 2h` badge.
  - **This week** — a Mon–Sun grid, one card per day listing the shows on it. Today's card is outlined in the purple accent.
  - **All shows** — every tracked show as a row you can inline-edit, mark on hiatus, delete, or bump `+1 ep` on for the running episode counter. The counter is **capped at the episode total** (no more `11/10`), and once a show hits its last episode a green **Done ✓** button appears to remove it from your list.
- **Add form** — title (required) + optional channel + air time (`HH:MM`; leave blank if it varies) + weekday multi-select chips + optional notes.
- **Schema** — a single `MediaShow` model with `airDays` stored as a comma-separated string of JS day numbers (`0=Sun … 6=Sat`) so SQLite doesn't need JSON columns. CRUD via `GET/POST/PATCH/DELETE /api/media`.

### Podcasts

- **Follow a feed** — paste a podcast's public RSS URL (most directories — Apple Podcasts, Pocket Casts, Overcast — list it). Title and cover art are pulled from the feed automatically; no key or login. Each podcast card shows its 6 most-recent episodes with duration + relative date.
- **"New episode dropped"** — any episode published after you last opened the podcast shows a **NEW** badge (pink dot + bold row). The Podcasts tab carries a count pill, and the dashboard Media widget adds a `🎧 N new podcast episodes` line — a glance, no push notifications. **Mark all seen** clears them.
- **Keyless + file-based** — stored in `podcasts.json` (per-podcast `feedUrl` + `lastSeenAt`), not the database, so it works for anyone and survives rebuilds. `GET/POST/PATCH/DELETE /api/podcasts`.

### YouTube

- **Follow a channel** — paste a **`@handle`** (e.g. `@mkbhd`), a channel URL, or the `UC…` channel id. Handles are resolved to the channel automatically; the name + thumbnails come from the channel's public RSS feed — all **keyless**, no API key.
- **Who just uploaded** — each channel shows its latest videos as a thumbnail grid; anything posted since you last looked gets a **NEW** badge (red border + dot). The YouTube tab carries a count pill, and the dashboard Media widget adds a `▶️ N new videos` line. **Mark all seen** clears them.
- **Keyless + file-based** — stored in `youtube-channels.json`. `GET/POST/PATCH/DELETE /api/youtube`.

### Twitch

- **Follow a channel** — type its name (or a `twitch.tv/name` URL). **No key, no login** — live status comes from Twitch's public API.
- **Who's live** — live channels sort to the top with a red ● LIVE badge, the stream's preview thumbnail, viewer count, game, and title; offline channels are greyed below. Cards open the stream on Twitch. The Twitch tab shows an `N live` pill and the dashboard Media widget adds a `🟣 N live now` line.
- **Keyless + file-based** — stored in `twitch-channels.json`. `GET/POST/DELETE /api/twitch`.

---

## Calendar

Events are pulled from **iCloud CalDAV** using Apple's PROPFIND/REPORT protocol. No third-party calendar service is involved.

- **Configured in ⚙️ Settings › Calendar** (no code edits). The panel edits three things, all saved to `calendar-feeds.json` (gitignored): the **ICS feed list** (name + URL rows), your **iCloud CalDAV credentials** (Apple ID + app-specific password — the password is write-only, blank on save keeps the stored one), and the **iCloud calendar include-list** (prefix `match` → optional `display` rename). If you never open the panel, the old `.env.local` vars (`CALENDAR_*_URL`, `ICLOUD_CALDAV_USER/PASS`) are used as fallbacks, so existing installs keep working until you migrate.
- **Sources & names shown in the app:**
  - iCloud CalDAV: whitelisted via the include-list (prefix match against iCloud display names, first-match-wins/longest-prefix-first). Default list: `Kalender Rasmus`, `Kalender` → `Kalender Jennifer`, `Arbejde` → `Jennifer_arbejde`, `Rasmus` → `Rasmus_arbejde` (merges cleanly with the ICS feed of the same name). Add a row to surface more. The quick-add picker is driven by the API's `writableCalendars` field, which returns only these CalDAV names — ICS feeds are read-only by nature and never appear in the picker.
  - Public ICS URLs: default `Rasmus_skole` (SDU timetable), `Cand`, `Rasmus_arbejde`.
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
cp .env.example .env.local   # fill in your credentials (API keys only)
npx prisma generate
npx prisma db push
npx prisma db seed           # seeds WoW checklist templates
```

There is **no `.env` file** — the SQLite path is resolved in code (`lib/prisma.ts` → `./dev.db`) and `prisma.config.ts` falls back to `file:./dev.db`, so `DATABASE_URL` isn't required. `.env.local` holds only the optional API keys/credentials.

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
2. `scripts/prepare-build.js` — copy static files, download the Electron arm64 prebuilt of `better-sqlite3` into standalone, merge Turbopack hashed modules, bundle `.env.local`, and build the seed DB via `scripts/make-seed.js` (a **scrubbed** copy of `dev.db` — every personal table emptied, only the shareable WoW checklist templates kept — so a stranger's first-run install doesn't ship with the owner's data). Run standalone with `npm run make-seed`.
3. `electron-builder` — package the DMG
4. `scripts/restore-dev-binary.js` — restore the Node 22 arm64 binary in the project root so dev mode keeps working after the build

After switching Node versions for the first time, run `npm install` once to reinstall native deps for arm64.

---

## Environment variables

Copy `.env.example` to `.env.local`:

| Variable | Required | Description |
|----------|----------|-------------|
| `ICLOUD_CALDAV_USER` | Calendar (optional) | Apple ID email. **Legacy fallback** — prefer ⚙️ Settings › Calendar, which saves to `calendar-feeds.json`. |
| `ICLOUD_CALDAV_PASS` | Calendar (optional) | App-specific password (not your Apple ID password). **Legacy fallback** — prefer ⚙️ Settings › Calendar. |
| `CALENDAR_SDU_URL` / `CALENDAR_CAND_URL` / `CALENDAR_ARBEJDE_URL` | Calendar (optional) | ICS feed URLs. **Legacy fallback** — prefer adding feeds in ⚙️ Settings › Calendar. |
| `STRAVA_CLIENT_ID` | For Strava sync | From strava.com/settings/api |
| `STRAVA_CLIENT_SECRET` | For Strava sync | From strava.com/settings/api |
| `RAPIDAPI_KEY` | For goal timelines | SportAPI7 on RapidAPI (free plan). Used for Esbjerg fB and Esbjerg Energy goal timelines. Subscribe at rapidapi.com → search "SportAPI7". |
| `BLIZZARD_CLIENT_ID` | For WoW ilvl + raid sync | From develop.battle.net → Create Client |
| `BLIZZARD_CLIENT_SECRET` | For WoW ilvl + raid sync | From develop.battle.net → Create Client |
| `RIOT_API_KEY` | For LoL stats | From developer.riotgames.com (24 h dev key or production). Users only add their Riot ID. |
| `RIOT_TFT_API_KEY` | For TFT stats | Riot **production keys are per-product** — you pick a game when applying — so TFT needs its own key, separate from the LoL `RIOT_API_KEY`. The TFT tab falls back to `RIOT_API_KEY` when this is blank (covers a 24 h dev key, which grants all products); until a TFT-capable key is present it shows a "needs TFT product access" banner. |
| `FACEIT_API_KEY` | For CS2 (FACEIT) stats | Free server-side key from developers.faceit.com (create an app → API keys → Server-side). Users only add their FACEIT nickname; the CS2 tab shows an "add a key" banner until it's set. |
| `STEAM_API_KEY` | For Steam recently-played + playtime | Free from steamcommunity.com/dev/apikey. The wishlist + sale tracker work **without** it; the key adds recently-played, playtime stats, and custom-URL → SteamID resolution. Steam hub shows an "add a key" banner until it's set. |
| `REJSEPLANEN_API_KEY` | For Transit departures | Free from labs.rejseplanen.dk (Rejseplanen API 2.0). The Transit hub/widget show an "add a key" banner until it's set. |

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
| `.work-config.json` | Work: payday day-of-month + per-day sessions |
| `tasks.json` | Quick-tasks / todo list (title · priority · done) |
| `podcasts.json` | Followed podcast feeds + last-seen episode markers |
| `youtube-channels.json` | Followed YouTube channels + last-seen upload markers |
| `twitch-channels.json` | Followed Twitch channels (live-status tracker) |
| `faceit-accounts.json` | CS2 / FACEIT accounts (nicknames) |
| `meal-plan.json` | Weekly meal plan (day → chosen recipe) |
| `steam.json` | Steam hub: your SteamID64 + store region |
| `feedback.json` | Feedback panel: the email address feedback is composed to |

**Where they live** — in a **`config/` sub-folder** of the base dir (dev: `<repo>/config/`; packaged app: `~/Library/Application Support/Dashboard/config/`), keeping the project root and user-data dir tidy. Existing installs are migrated automatically on first run (loose files in the base are moved into `config/`; the tracked `wow-tier.json` stays in the repo root). The **packaged app** base is `~/Library/Application Support/Dashboard/` so config **survives a rebuild** — earlier versions kept them inside the app bundle, which got wiped every time you reinstalled the DMG. On first launch after upgrading, Electron auto-migrates any legacy files from the standalone dir into the user-data location.

---

## Security

Dependencies are kept up to date. As of the last audit:

| Package | Status |
|---------|--------|
| `next` | Updated to 16.2.6 — patches DoS (Server Components) and XSS (CSP nonces) CVEs |
| transitive deps (`axios`, `@xmldom/xmldom`, `fast-uri`, `hono`, `ip-address`) | Patched via `npm audit fix` |
| `postcss` inside Next.js | Moderate — awaiting a Next.js upstream release |
| `@hono/node-server` inside Prisma CLI | Moderate — awaiting a Prisma 7.x upstream release; only reachable locally via `npx prisma` commands, not in runtime |

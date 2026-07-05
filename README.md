# League History

A self-hosted replacement for MFLHistory.com-style league history/records
sites, importing directly from MyFantasyLeague's export API. Built with
Next.js, but **deployed as plain static HTML/CSS/JS** (`output: "export"`)
— no server process, no database server anywhere at runtime. Meant to be
deployed on Vercel (see below), but the same static output also works on
ordinary file-only shared hosting with no Node.js at all, if you ever need
that instead.

## Requirements to build it

- Node.js 20+ on whatever machine you *build* the site on — your own laptop,
  a CI runner, anything. This does **not** need to be your web host.
- No native modules, no compiler toolchain needed. Storage uses
  [sql.js](https://sql.js.org) (SQLite compiled to WebAssembly) purely as a
  build-time data store — it's read once at build time to generate the
  static pages, then isn't needed at all once the site is deployed.

## Setup (run this on your own computer, not the host)

```bash
npm install
npm run import -- --league 67102 --start 2003 --end 2025
npm run dev
```

Open http://localhost:3000 to preview.

- `--league` is your league's *current* MFL league ID (from the URL, e.g.
  `myfantasyleague.com/2026/home/67102` → `67102`).
- Older seasons that used a different MFL league ID (common before MFL let you
  keep one ID across years) are resolved automatically from that league's
  "history" data — you don't need to hunt down each year's ID by hand.
- Re-running `npm run import` is safe — it upserts, so you can re-import a
  single season (`--start 2025 --end 2025`) any time to pick up new games.

Imported data lives in `data/league.db` (SQLite file, gitignored). Delete it
and re-run the import to start fresh.

## Deploying to Vercel (recommended)

There's a `vercel.json` in this repo that sets the build command to
`npm run import && npm run build` — meaning **every deploy re-fetches fresh
data from MyFantasyLeague automatically**, no manual import/rebuild/reupload
step ever. Vercel's build servers have normal internet access, so the import
script runs there just like it does on your laptop.

Two ways to connect this project to Vercel:

1. **Git-based (recommended):** push this project to a GitHub (or
   GitLab/Bitbucket) repo, then in the Vercel dashboard choose **Add New →
   Project** and import that repo. Vercel auto-detects Next.js and picks up
   `vercel.json`'s build command automatically. Every future `git push`
   triggers a new deploy — and a fresh data import — with no other action
   needed.
2. **CLI-based (no Git required):** install the Vercel CLI (`npm i -g
   vercel`), run `vercel login`, then from inside this project run `vercel`
   (preview) or `vercel --prod` (production). Re-run `vercel --prod` any
   time you want to redeploy with fresh data.

Since the site builds as a static export (`output: "export"` in
`next.config.ts`), Vercel serves it from its CDN with no serverless function
involved on the read path — fast, and nothing to misconfigure.

Want it to refresh on a schedule too (say, every night during the season)
instead of only when you trigger a deploy? Vercel supports Cron Jobs that
can hit a redeploy hook — ask and I'll wire that up.

## Alternative: deploying to a plain (no Node.js) shared host

If you ever want a copy running on ordinary shared hosting instead of (or
alongside) Vercel — the common case for budget shared hosting and most
cPanel resellers without a Node.js option — the same static export works
there too, just with a manual upload step instead of Vercel's automatic
one.

1. **Build the static site** on your own computer:
   ```bash
   npm run import -- --league 67102 --start 2003 --end 2025
   npm run build
   ```
   This produces an `out/` folder full of plain `.html`, `.css`, and `.js`
   files — a complete, self-contained copy of the site. Every team page and
   every season's standings page is pre-rendered into its own file at build
   time (that's what `generateStaticParams` in the team/season routes is
   for), so nothing needs to run on the server afterward.
2. **Upload the *contents* of `out/`** (not the folder itself) to your host,
   normally into `public_html` (or a subfolder if the site lives at
   `yoursite.com/history`). Either:
   - cPanel **File Manager**: zip the contents of `out/` locally, upload the
     zip, then use File Manager's "Extract" — much faster than uploading
     hundreds of files individually, or
   - **FTP/SFTP** (FileZilla, Cyberduck, etc.) if your host gives you
     credentials — drag the contents of `out/` into `public_html`.
3. **That's it.** No build step, no `npm install`, no process to keep
   running — it's the same as uploading any other static website.
4. **Updating later**: whenever you want fresh data (new week's scores, a
   completed season), on your own computer run
   `npm run import -- --start 2025 --end 2025` then `npm run build` again,
   and re-upload the contents of `out/` (overwriting what's there).

Two config details worth knowing about, both in `next.config.ts`:
`output: "export"` is what makes `npm run build` produce the static `out/`
folder instead of requiring a Node server, and `trailingSlash: true` makes
every page its own folder with an `index.html` inside (e.g.
`out/standings/2025/index.html`) so a plain Apache host serves
`/standings/2025/` correctly with zero server configuration — no `.htaccess`
rewrite rules needed.

If it later turns out your host (or a future one) *does* support Node.js and
you'd rather have live/on-demand pages instead of rebuild-and-reupload, this
can be switched back to a normal server-rendered Next.js app by removing
`output: "export"` — ask me and I'll walk it back.

## What's here

- `lib/mfl-client.ts` — thin wrapper around MFL's export API (`TYPE=league`,
  `TYPE=weeklyResults`).
- `lib/db.ts` — sql.js-backed SQLite schema (teams, seasons, team_seasons,
  games, champions) plus a `team_games` view that unpivots each game into
  one row per team, so record queries don't have to juggle home/away by
  hand. Reads are free; anything that writes must call `db.save()` to flush
  the in-memory database to `data/league.db`.
- `scripts/import.ts` — pulls franchises, standings-relevant data, and every
  week's scores for each season and loads them into SQLite.
- `lib/records.ts` — all the derived record queries (single game, single
  season, career, standings).
- `app/` — pages: Standings (`/standings` for the latest season,
  `/standings/[season]` for every other year, each pre-rendered at build
  time), Single Game Records, Single Season Records, Career Records,
  Postseason, Teams (`/teams` list + `/teams/[id]` detail, also pre-rendered
  per team).
- `components/StandingsView.tsx` — the shared standings table/season-picker
  UI, reused by both standings routes.

## Known limitations (v1)

- **Playoff vs. toilet bowl vs. regular season**: MFL's own data doesn't
  distinguish these — the import script defaults every game past the regular
  season to `game_type = 'playoff'`. If your league has a toilet bowl or
  consolation bracket, edit the `game_type` column on those games directly in
  `data/league.db` (any SQLite browser works, e.g. `DB Browser for SQLite`).
- **League/division/toilet bowl champions**: not computed automatically
  (MFLHistory's admin panel has you enter these by hand too, for the same
  reason). Fill in `data/champions.json` — one entry per season with
  `leagueChampion`, `runnerUp`, `toiletBowlChampion` (team names, matched
  case-insensitively against the `teams` table). This file is committed to
  git (unlike `data/league.db`, which is rebuilt from scratch on every
  deploy) and gets loaded into the `champions` table automatically as part
  of `npm run import`, so just edit it and redeploy.
- **Team identity across name changes**: teams are matched by exact name
  (case-insensitive). If an owner renamed their team mid-history and you want
  the career record to follow them, merge the two `teams` rows manually (move
  `team_seasons` and `games` references to one `team_id`, then delete the
  duplicate).
- **No player-level stats** (rosters, weekly player scores). MFLHistory tracks
  these; this v1 focuses on team/game records only, per project scope. The
  data's available from `TYPE=weeklyResults` (already being fetched — see the
  `player` array in each franchise entry) if you want to extend this later.

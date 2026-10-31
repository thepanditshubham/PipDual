# Pip Duel

**Same chart. Two traders. One winner.**

Pip Duel is a free-to-play, 1v1 virtual trading duel: two players read the same
synthetic market for 5, 10 or 15 minutes, place long and short entries from a
$10,000 practice balance, and the server re-scores the winner from the trade log.
It is a game about reading price and managing risk — not a broker, not an
investment product, and not connected to any live order book.

> **Free-to-play. Virtual currency only.**
> Coins are earned by playing and in missions; they are never bought, transferred
> or cashed out. This repository has no deposits, withdrawals, wallet addresses or
> payment rails. See [docs/OSS_AUDIT.md](docs/OSS_AUDIT.md) for the audit and
> [docs/OSS_RELEASE_REPORT.md](docs/OSS_RELEASE_REPORT.md) for the release record.

---

## Screenshots

Screenshots are added at release time. Placeholders to fill:

| Screen | File |
|---|---|
| Lobby and match ticket | `docs/assets/TODO_REPLACE_ME_lobby.png` |
| Trading terminal | `docs/assets/TODO_REPLACE_ME_terminal.png` |
| Result and equity curves | `docs/assets/TODO_REPLACE_ME_result.png` |

---

## Features

- **Deterministic market engine** — seeded price walks, regime shifts, next-tick
  fills, stop-loss / take-profit, forced close at the end of the window.
- **Two ways to play** — a real 1v1 table over Supabase Realtime, or Practice vs
  Bot with no account required.
- **Full terminal** — candlesticks, EMA/RSI, trade markers, hotkeys, position
  sizing, SL/TP drag handles.
- **Lobby** — match ticket, posted challenges, private tables with invite codes,
  friends list, mailbox, announcements.
- **Progression** — XP, ranks, seasons, daily/weekly missions, achievements,
  in-app leaderboard and profile pages.
- **Result screen** — settled P&L, score, dual equity curves, shareable result.
- **Free-to-play economy** — coins are virtual score-keeping units, Demo is
  always free, and Live tickets use virtual coins only.
- **Themed UI** — indigo surfaces with an amber accent, dark by default.

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router), React 19, TypeScript |
| Styling | Tailwind CSS 4, CSS variables in `src/app/globals.css` |
| Client state | Zustand with `persist` |
| Charts | `lightweight-charts` (Apache-2.0) |
| Backend | Next.js route handlers |
| Database / auth / realtime | Supabase (Postgres, RLS, GoTrue, Realtime) |
| Tests | Vitest (unit), Playwright (e2e, configured) |
| Package manager | npm |

The market itself is generated in `src/lib/engine/`; no vendor price feed is
required or bundled.

---

## Quick start

Requirements: **Node.js 20.9+** (22 LTS recommended) and npm.

```bash
# 1. Clone
git clone TODO_REPLACE_ME_GITHUB_REPO_URL pip-duel
cd pip-duel

# 2. Install dependencies
npm install

# 3. Create your local env file
cp .env.example .env.local

# 4. Start the dev server
npm run dev

# 5. Open the game
# http://localhost:3000
```

Without real Supabase credentials the app runs in local guest mode: Practice vs
Bot, the terminal, the engine and the marketing pages all work. Auth, friends and
real 1v1 matchmaking need a Supabase project (next section).

### Tests and checks

```bash
npm run lint          # ESLint
npm run typecheck     # tsc --noEmit
npm test              # Vitest
npm run build         # production build
```

Playwright is configured but the suite is empty in this snapshot; the first
smoke test is a listed starter issue.

---

## How multiplayer works locally

1. Start the dev server.
2. Open `http://localhost:3000/play` in two browser windows.
3. Sign in as a guest in each window (or use two registered accounts).
4. Pick the same duration and press **Find Match** in both.

Realtime matchmaking uses Supabase Broadcast/Presence channels. To run it end to
end, create a Supabase project, run the SQL in `supabase/setup.sql`, and set
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local`.
No service-role key is needed by the application.

### Synthetic sample data

The game never needs a downloaded price file. If you want a frozen sample for a
demo, a notebook or a test fixture:

```bash
npm run seed            # writes data/sample-candles.json
node scripts/seed-sample-data.mjs --bars 200 --out /tmp/sample.json
```

The generated file is deterministic, marked as synthetic, and is **not** real
market data.

---

## Project structure

```text
src/
  app/                 Next.js routes (marketing, auth, play, admin, legal)
  components/          UI: terminal, lobby, wallet, progress, site chrome
  lib/
    engine/            Deterministic market, candles, simulation, scoring, bot
    matchmaking/       Realtime queue
    challenges/        Posted-challenge board
    tables/            Private tables and invite codes
    rooms/             Match session handoff
    progress/          XP, ranks, missions, achievements, stats
    economy/           Coin/ticket rules (real-money paths are being removed)
    supabase/          Client, wallet, friends, mail, announcements, admin reads
    auth/              Guest and profile store
supabase/
  setup.sql            Full local schema
  migrations/          Incremental changes
scripts/               Developer utilities
docs/                  Architecture, roadmap, audit, release report
public/                Static assets
```

---

## Roadmap

See [ROADMAP.md](ROADMAP.md). The short version: finish the free-to-play
hardening, add a Practice/Chart Replay mode, then a Battle Royale format.

---

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) and
[docs/GOOD_FIRST_ISSUES.md](docs/GOOD_FIRST_ISSUES.md). This project uses the
Developer Certificate of Origin — sign every commit with `git commit -s`.

- Code of Conduct: [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
- Security reports: [SECURITY.md](SECURITY.md) — never in a public issue
- Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

---

## License

The source is licensed under the **GNU Affero General Public License v3.0 only**
(`AGPL-3.0-only`). See [LICENSE](LICENSE). If you run a modified version as a
network service, section 13 requires you to offer its source to users.

Third-party packages keep their own licences; see `THIRD_PARTY_NOTICES.md` for the
attribution notices (Apache-2.0, LGPL-3.0, CC-BY-4.0, OFL).

## Trademark

The **Pip Duel** name and logo are reserved. The licence grants rights to the code,
not to the brand. Forks must use a different name and must not imply endorsement.
See [TRADEMARK.md](TRADEMARK.md).

## Community

- Discussions: TODO_REPLACE_ME_DISCUSSIONS_URL
- Telegram: TODO_REPLACE_ME_TELEGRAM_URL
- Contact: TODO_REPLACE_ME_MAINTAINER_EMAIL

Originally built by the Forexwala community (Pune, India).

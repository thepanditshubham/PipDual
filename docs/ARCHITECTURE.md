# Architecture

Pip Duel is a Next.js application with a Supabase backend. There is no separate
game server process: the market is simulated deterministically on both clients
and re-simulated by a route handler for scoring, while Supabase carries the
social and matchmaking state.

```text
┌──────────────── Browser ────────────────┐        ┌──────────── Next.js ────────────┐
│ Next.js App Router (React 19)            │        │ /api/auth/callback              │
│  ├─ src/lib/engine  (deterministic)      │        │ /api/matches/submit             │
│  └─ Supabase JS (anon key)               │ ─────► └─────────────────────────────────┘
│                                           │
│  Realtime: presence / broadcast           │        ┌──────────────── Supabase ───────┐
└───────────────────────────────────────────┘ ◄────► │ Postgres + RLS                  │
                                                      │ GoTrue (email, Google)          │
                                                      │ Realtime (Broadcast/Presence)   │
                                                      └─────────────────────────────────┘
```

## Client

- **`src/app/`** — App Router pages. Marketing and legal pages are server-rendered;
  the lobby and terminal are client components because they own clocks, canvas
  charts and realtime channels.
- **`src/lib/engine/`** — pure TypeScript. `synthetic-market.ts` derives a day of
  1-minute bars from `(salt, dayIndex)`; `market-feed.ts` derives the duel window
  from the ticket start time; `live-market.ts` runs the same generator at 1× for a
  watched chart; `simulate.ts` replays actions with next-tick fills, SL/TP and a
  forced close; `bot.ts` produces a rival.
- **State** — Zustand with `persist`: `src/lib/auth/store.ts` (session, guest
  wallet, history) and `src/lib/progress/store.ts` (XP, ranks, missions,
  achievements, pinned badges).
- **Supabase client** — `src/lib/supabase/client.ts` returns `null` when the URL
  or anon key is missing or still a placeholder, so guest and bot play work with
  no backend.

## Match lifecycle

1. The player picks a duration and mode on `/play`.
2. **Live** ticket → `src/lib/matchmaking/matchmaker.ts` joins
   `pipduel_queue_v4_<scope>_<duration>` and broadcasts a queue record; both tabs
   receive the same match payload. **Demo** uses a separate scope so paid and free
   tables can never pair.
3. A match is sealed with a room code and a shared `startAt` timestamp; the owner
   writes the room session in `src/lib/rooms/session.ts`.
4. The lobby shows a two-beat ready check and routes to `/play/[room]`.
5. Both terminals simulate the same market window locally and post the trade log
   to `/api/matches/submit`. The handler re-derives the window, re-simulates and
   returns `verified` plus the score. **It persists nothing today.**
6. The result modal renders both equity curves. The entry and the virtual pot are settled in the browser; server-side settlement is a roadmap item.

## Realtime channels

| Channel | Owner | Purpose |
|---|---|---|
| `pipduel_lobby_presence` | `src/app/play/page.tsx` | Online count, queue pool size |
| `pipduel_queue_v4_<scope>_<duration>` | `src/lib/matchmaking/matchmaker.ts` | Broadcast queue, seal a pair, ready handshake |
| `pipduel_room_<room>` | `src/app/play/[room]/page.tsx` | Ready check, match start, rival presence |
| `pipduel_challenges_v1` | `src/lib/challenges/challenge-board.ts` | Posted challenges by stake and duration |
| `pipduel_table_<code>` | `src/lib/tables/private-table.ts` | Private-table presence and knock-to-join |
| `pipduel_friends_presence` | `src/lib/friends/realtime.ts` | Online friends |
| `pipduel_friends_invites` | `src/lib/friends/realtime.ts` | Duel invites |

All channels are Supabase Broadcast/Presence with RLS-backed tables where state
must survive a refresh. There is no custom WebSocket server.

## Server

| Route | Responsibility | Notes |
|---|---|---|
| `src/app/api/auth/callback/route.ts` | Exchange the Supabase OAuth code for a session | Needed for Google sign-in |
| `src/app/api/matches/submit/route.ts` | Validate the submitted action log, re-derive the market, score it | Unauthenticated, in-memory rate limit; persists nothing |
| `src/app/api/player/[username]/route.ts` | Read the public profile projection and save owner edits | Bearer session; ownership re-checked; stats never accepted |
| `src/app/api/player/[username]/actions/route.ts` | Follow, connect, endorse, skills and inbox messages | Rate-limited; privacy checked through SQL helpers |
| `src/app/api/player/[username]/media/route.ts` | Validate and upload avatar/cover images | Magic-byte check, 2/5 MB caps, owner-scoped storage path |

Database work is done from the browser through PostgREST with the anon key. The
real authorization boundary is therefore **RLS**, not the UI. Profile routes
use the caller's bearer token, so they run as that user and add validation and
rate limits without introducing a service-role key. Operator tools are not part
of this repository and would live in a private deployment.

## Data model

Core game tables in `supabase/setup.sql`:

```text
profiles              player identity, role, rating, status
profile_details       bio, cover, privacy switches, verification, last seen
profile_portfolio     self-reported trading background and social links
profile_follows       follower graph
profile_skills        declared skills; profile_skill_endorsements holds counts
player_balances       virtual coin balance, scoped to auth.uid()
player_friends        friendship pairs
seasons, player_progress, rank_state
match_results, matches, match_actions, trade_events, match_flags
missions_catalog, user_missions
achievements_catalog, user_achievements
leaderboard_snapshots, ratings_history
segments              market segments (read-only for players)
player_mails, announcements
```

## Trust boundaries

- **Browser → PostgREST.** The anon key is public. Every table grant and policy is
  the API. Anything writable by `authenticated` is writable from the console, so
  policies scope rows to `auth.uid()`.
- **`player_balances`.** A game credit, not money. RLS scopes reads and writes to
  the signed-in player; guests keep their balance on the device.
- **`/api/matches/submit`.** Re-simulates but does not persist. Do not build
  settlement on it until submissions are bound to a server-issued ticket.
- **`get_player_profile()`.** A SECURITY DEFINER projection is the only path to
  another player's aggregates, achievements, skills and portfolio. It applies
  visibility/privacy rules and never returns trade events or private profile
  columns. The underlying tables stay owner-scoped.
- **Operator tools.** Not part of the public build. There is no `/admin` route and
  no admin RPC in `supabase/setup.sql`; publishing and moderation live in the
  private deployment.

## Public vs private

| Public repository | Operator-only / private |
|---|---|
| Engine, bot, terminal, lobby, progress, friends, private tables, marketing, docs, F2P schema | Operator console, production RLS/RPC hardening, settlement service, anti-abuse tuning |
| Tests, sample-data script, CI | Deployment configs, secrets, runbooks, security audit internals |

The public contract is the game and a local schema. Operator tooling, production
hardening and any future monetisation belong to a separate, private deployment.

## Running without a backend

With `.env.local` copied from `.env.example` and left as placeholders:

- marketing pages, auth screens, `/play`, the terminal and Practice vs Bot work;
- guest progress is kept in `localStorage`;
- realtime features (friends, live queue, mail, leaderboard) are unavailable
  until a Supabase project is configured.

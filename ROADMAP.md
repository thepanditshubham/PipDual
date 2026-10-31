# Roadmap

Status legend: **Shipped** — in this tree and usable · **Partial** — some code
exists but the feature is not complete · **Planned** — not implemented.

The roadmap is a direction, not a promise. Open an issue before starting a large
item.

## MVP — 1v1 duel, bots, leaderboard, replay

| Item | Status | Notes |
|---|---|---|
| Deterministic synthetic market | Shipped | Seeded walk, regime shifts, 1-minute candles, per-session live seed |
| 1v1 duel, 5 / 10 / 15 minutes | Shipped | Match ticket, ready check, arena handoff |
| Terminal (candles, EMA/RSI, SL/TP, hotkeys) | Shipped | `src/components/terminal/` |
| Practice vs Bot | Shipped | No account required |
| Lobby, challenges, private tables | Shipped | Invite codes, knock-to-join |
| Friends, mail, announcements | Shipped | Supabase Realtime + tables |
| XP, ranks, seasons, missions, achievements | Shipped | `src/lib/progress/` |
| Trader profiles and match history | Shipped | `/player/[username]`, `/history` |
| Result screen with equity curves | Shipped | `result-modal.tsx` |
| Global leaderboard route | **Partial** | `LeaderboardTab` exists but is not routed; `/leaderboard` is linked in the footer and 404s |
| Replay a past match | **Partial** | The history "Replay" link opens a fresh bot room; it does not replay the recorded chart |
| Admin console | Moved private | The public build ships no admin routes; operator tooling lives in the private deployment |

## Next — free-to-play hardening and practice tools

| Item | Status | Notes |
|---|---|---|
| Remove real-money modules | **Shipped** | Deposits, withdrawals, chain checks, the QR asset, IB payouts and the admin money desks are removed from this tree |
| Virtual-only wallet | **Shipped** | Coins are a non-purchasable game credit; no $ peg, no cash-out, starting balance 1,000 |
| Server-side settlement | **Planned** | Persist matches, issue server tickets, settle via RPC; today the browser settles its own pot |
| Tighten RLS | **Shipped** | `player_balances` and `player_friends` are scoped to `auth.uid()`; guest balances stay on the device |
| Public leaderboard route | **Planned** | Wire `LeaderboardTab` into `/leaderboard` |
| Practice / Chart Replay mode | **Partial** | A wall-clock chart already streams in the terminal; scrubbing a recorded window is not built |
| Auth hardening | **Partial** | Email + Google + guest work; the no-op middleware was removed, and RLS is the authorization boundary |

## Later — Battle Royale

| Item | Status | Notes |
|---|---|---|
| Battle Royale format (many players, one market, eliminations) | **Planned** | Not present in the engine or lobby |
| Spectator mode | **Planned** | Not implemented |
| Seasons with rewards | **Partial** | Season math exists; reward cosmetics are not built |
| Mobile order dock polish | Shipped | `src/components/terminal/mobile-order-dock.tsx` |
| Accessibility pass | **Planned** | Keyboard traps, icon-button labels, reduced motion audit |
| Internationalisation | **Planned** | A language selector exists in Settings; no translated message catalogs are wired |

## How to propose a roadmap change

Open a `feature_request` issue with the problem, the smallest useful version, and
what it would touch. Large items should start as a discussion before code.

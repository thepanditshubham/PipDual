# Pip Duel — Open-Source Readiness Audit

**Date:** 2026-10-31
**Branch:** `chore/open-source-prep` (created from `security/audit-2026-10-29`)
**Scope:** the whole working tree, every local ref, and the reachable git history.
**Status:** internal working document — contains pre-publication risk notes. Do not publish it as-is.

> No secret value is reproduced in this document. Findings name the file, line and
> secret type only, which is enough to rotate or remove it.

---

## 0. Verdict

**No-go for a public release today.**

The public branches contain no API keys, JWTs or private keys, but they do contain:

1. a complete real-money gambling feature set (crypto deposits, custody-style balances,
   withdrawals, house cut, affiliate commission) — explicitly out of scope for a
   free-to-play open-source release;
2. a live USDT-BEP20 house deposit address in two committed test files and in a
   committed deposit QR image;
3. an "official MW3 Lobby" audio file and a third-party broker's logo + affiliate
   referral link;
4. documented-but-open database authorization holes (`player_balances` and
   `player_friends` are world-readable and world-writable);
5. a security audit report on `origin/main` that describes those holes and the
   money RPCs in detail.

None of these is fixed in this step. Step 2 only prepares documentation and repo
hygiene; the removals need your decision first (see §8).

---

## 1. Stack

| Layer | What is actually in the repo |
|---|---|
| Framework | Next.js `16.4.3`, App Router, React `19.3.0`, TypeScript `5` |
| Styling | Tailwind CSS `4` through `@tailwindcss/turbopack`; tokens in `src/app/globals.css` |
| Package manager | npm (`package-lock.json`); no `packageManager` or `engines` field |
| Runtime | Node.js (dev machine: 24.22); Next 16 requires Node `>=20.9` |
| Client state | Zustand `5` with `persist` (`src/lib/auth/store.ts`, `src/lib/progress/store.ts`) |
| Charts | `lightweight-charts` `5.2.1` (Apache-2.0) |
| Icons | `lucide-react` (ISC) |
| Font | IBM Plex Mono via `next/font/google` (SIL OFL) |
| Backend | 3 Next.js route handlers + Supabase (Postgres, GoTrue, PostgREST, Realtime) |
| Database | Supabase Postgres; `supabase/setup.sql` (2,995 lines) + 13 migrations |
| Realtime | Supabase Broadcast / Presence channels, no separate socket server |
| Auth | Supabase Auth (email + Google OAuth callback) |
| Tests | Vitest (`vitest.config.mts`), Playwright (`playwright.config.ts`) |
| CI | none (`.github/` is absent) |
| Analytics | none found (no GA, GTM, PostHog, Sentry, Mixpanel, Vercel Analytics) |
| External data | none for market data; public BSC/ETH JSON-RPC only for money verification |

### Architecture and data flow

```text
Browser A ── local deterministic engine ──┐
                                           ├─ Supabase Realtime: presence / broadcast
Browser B ── local deterministic engine ──┘   (pipduel_lobby_presence,
                                                pipduel_queue_v4_*,
                                                pipduel_room_*, challenges,
                                                friends, invites)

Terminal ── POST /api/matches/submit ──► re-simulate actions, score, return veredict
                                          (persists nothing)

Admin ─── GET /api/chain/tx ──────────► public JSON-RPC → USDT Transfer log
                                          (real-money deposit review)

Wallet / admin desks ── Supabase RPCs ──► SECURITY DEFINER functions with is_admin()
Postgres ── RLS policies ──► the API surface for the anon key
```

The market is generated, not downloaded: `src/lib/engine/synthetic-market.ts`,
`market-feed.ts` and `live-market.ts` build a seeded, deterministic price walk from
`(salt, dayIndex)`; `fixtures.ts` generates 100 synthetic segments for tests and bots.
No historical forex candles, tick archives or provider keys are bundled.

### Repository shape

- 195 tracked files, 49 `page.tsx` routes, 3 route handlers, 13 migrations.
- `src/lib/` is split by domain: `engine`, `economy`, `matchmaking`, `challenges`,
  `rooms`, `tables`, `progress`, `admin`, `supabase`, `friends`.
- Public assets: 7 files in `public/` (images, one MP3, one AVIF).
- No `LICENSE`, no `.github/`, no `docs/`, no `CONTRIBUTING.md`, no `SECURITY.md`.

---

## 2. Secrets scan

### Method

- `gitleaks 8.30.1` (installed with `winget install Gitleaks.Gitleaks`).
- History: `gitleaks git . --log-opts=--all --redact` and `--log-opts=main --redact`.
- Working tree: `gitleaks dir` over `src/`, `supabase/`, `.env`, `.env.local`.
- Targeted `git log -S` checks for the live deposit address and the Supabase service
  role value, plus `git grep` against `HEAD`.
- `npm audit --omit=dev`: 0 vulnerabilities in the production tree.

### Results

| ID | Severity | Location | Type | In git? | Action |
|---|---|---|---|---|---|
| SEC-01 | **High** | `src/lib/economy/__tests__/economy.test.ts:75` | Live USDT-BEP20 house deposit address (40-hex) | **Yes**, `main` history (commit `8354e50`) | Replace with a dummy address; stop using that wallet for deposits; treat the address as public forever |
| SEC-02 | **High** | `src/lib/economy/__tests__/etherscan.test.ts:15` | Same live house address | **Yes**, `main` history | Same as SEC-01 |
| SEC-03 | **High** | `public/deposit-qr-usdt-bep20.jpg` | QR image wired as the BEP20 deposit QR (`src/lib/economy/config.ts:114`) | **Yes**, every clone | Delete from the public tree; generate a new QR only for a new address, at runtime |
| SEC-04 | **High** | `.rea-cathode/chrome-profile/Default/{Cookies, Login Data, Web Data, History, Local State}` | Captured Chrome profile (cookies, saved logins, history), 74 MB / 589 files on disk | **Local checkpoint refs only**: `refs/cline/checkpoints/1793291227023_i75dx/1` (`0cdc2a41`), `/2` (`c0bc6a0c`). Not on `origin`. 28 gitleaks hits, all in this profile | Delete the directory and prune the checkpoint refs; if the profile ever left this machine, rotate every account session it held. Never `git push --mirror` this repo as-is |
| SEC-05 | **Medium** | `.env:21`, `.env.local:19` | Etherscan API key | **No** (ignored, never committed) | Revoke it; the key is not used anywhere in `src/` (chain reads use public JSON-RPC) |
| SEC-06 | **Medium** | `.env:3-4`, `.env.local:3-4` | Supabase anon JWT and **service-role JWT** | **No** (ignored) | Keep out of git. Rotate the service-role key if the file was ever shared, zipped or synced. The anon key is public by design |
| SEC-07 | **Medium** | `.env:10` | Live USDT-BEP20 house address | **No** (ignored) | Rotate the destination as part of SEC-01/SEC-03 |
| SEC-08 | Info | `src/lib/economy/etherscan.ts:44` | BSC USDT token contract address, flagged by the `generic-api-key` heuristic | Yes | False positive: on-chain contract address, public by design. Add a gitleaks allowlist entry rather than rotating |
| SEC-09 | Info | `.env.example` | Placeholders only (`your-anon-key`, `0xYourHouseAddress`) | Yes | Safe to publish; rewrite in Step 2 for a free-to-play build |
| SEC-10 | Info | whole public history | No JWT, private key, Stripe/Razorpay key, AWS key or bearer token found | — | Keep the secret-scan workflow from Step 2 on every PR |
| SEC-11 | Info | `src/` | `SUPABASE_SERVICE_ROLE_KEY` is never read by application code; admin work goes through the anon client + RLS/RPC | — | Drop the variable from `.env.example` unless a future server job needs it |

History summary from gitleaks: **29 findings**. 28 are inside the captured Chrome
profile reachable only from local `refs/cline/*`; 1 is the public token contract. The
only `.env*` file ever committed is `.env.example` (36 lines, placeholders).

### Keys and credentials to rotate

| Credential | Where it lives | Rotate? | Why |
|---|---|---|---|
| Supabase **service-role** key | `.env`, `.env.local` (untracked) | **Rotate if the folder or the captured profile was ever shared.** Otherwise no rotation strictly required, but rotate before announcing | Full database authority; also see SEC-04 |
| Supabase **anon** key | `.env`, `.env.local`, plus shipped to the browser by design | Not a secret | Rotate only if you need to invalidate sessions |
| **Etherscan** API key | `.env:21`, `.env.local:19` | **Revoke** | Unused; reduces blast radius |
| **USDT-BEP20 deposit address** | tests, QR image, `.env` | **Retire and replace** | Already in public git history; a fresh deposit address is the only clean way to stop linking future deposits to it |
| Accounts logged into the captured Chrome profile | local `.rea-cathode` | **Sign out everywhere / rotate** | The profile contains cookie and login databases |

---

## 3. Environment files, URLs, analytics

- **Committed env files:** none. Only `.env.example` (placeholders) is tracked.
  `.gitignore` line 34 covers `.env*` with an explicit `!.env.example`.
- **Local env files:** `.env` (21 lines) and `.env.local` (19 lines). Both ignored,
  neither present in any commit. Variables present, names only:
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_URL`,
  `NEXT_PUBLIC_DEPOSIT_USDT_TRC20|BEP20|ERC20`,
  `NEXT_PUBLIC_DEPOSIT_BTC|ETH|SOL|XRP`, `ETHERSCAN_API_KEY`.
  Only the BEP20 deposit variable is non-empty.
- **Production identifiers in local env:** a hosted Supabase project host
  (`<ref>.supabase.co`, untracked) and a production site URL. Untracked but present
  on disk; do not include the folder in any release archive.
- **Internal/third-party URLs hardcoded in source:**
  - `t.me/forexwala` — auth shell, contact, support, footer, legal pages.
  - `youtube.com/@forexwala`, `instagram.com/forexwala` — footer.
  - `pipduel.com/play/<code>` — invite text in `src/components/lobby/friends-panel.tsx:622`.
  - `ib.ecmarkets.co/PL/2/<IB-CODE>` — third-party broker **IB affiliate link**
    (`src/app/play/page.tsx:2339`) plus a hotlinked logo
    (`file.ecmarkets.com/...`, line 2345).
  - Public BSC/ETH JSON-RPC endpoints in `src/app/api/chain/tx/route.ts:30-41`.
- **Analytics IDs:** none. No analytics SDK in `package.json`.
- **Personal/org data in content:** `Forexwala Community (Pune, India)` appears in the
  legal pages; `Forexwala` is also in metadata, README and community links. This is
  brand/company information, not user PII, but it must be a deliberate decision before
  publishing under a different maintainer.

---

## 4. Market data

- **No bundled historical forex/price data.** `git ls-files` contains no CSV, JSONL,
  Parquet or vendor export.
- **No data-provider API key.** Prices are generated locally:
  - `src/lib/engine/synthetic-market.ts` — day candles from `(salt, dayIndex)`.
  - `src/lib/engine/market-feed.ts` — match window from the ticket start time.
  - `src/lib/engine/live-market.ts` — 1× wall-clock generator with a per-session seed.
  - `src/lib/engine/fixtures.ts` — 100 generated test segments.
- **Redistribution:** safe. There is nothing licensed to redistribute.
- **Fetch script:** not needed for prices. `scripts/seed-sample-data.*` (Step 2) will
  simply freeze a set of deterministic candles so the app runs without Supabase.
- **Only network dependency in this area:** `/api/chain/tx` reads public blockchains
  for deposit review. That is money infrastructure, not market data, and belongs on the
  removal list in §8.

---

## 5. Third-party assets and branding

| Asset | Evidence | Risk | Action |
|---|---|---|---|
| `public/mw3-lobby.mp3` | `src/components/terminal/sound.ts:2` says "official MW3 Lobby sound asset"; played on lobby entry (lines 69, 137) | **High** — copyrighted game audio, no licence in repo | Remove the file and the loader; replace with a generated WebAudio jingle |
| EC Markets logo + affiliate link | `src/app/play/page.tsx:2339` (`ib.ecmarkets.co/...` referral code), `:2345` (hotlinked `file.ecmarkets.com` PNG) | **High** — third-party trademark, commercial affiliate identifier, no permission recorded | Remove the banner block; do not ship the referral code |
| `public/lobby-arena-bg.jpg` and `.webp` | Bull-vs-bear trading artwork, displayed as a lobby card background (`src/components/lobby/lobby-rail.tsx:80`) | **Medium** — provenance unknown; the JPG looks like a video still (player glyph in the bottom-right) | Replace with original art, or obtain a written licence and add it to a NOTICE file |
| `public/match-ticket-bg.avif` | Used as the match-ticket artwork | **Medium** — provenance unknown | Same as above |
| `public/coin.png` | In-UI coin icon | **Low–Medium** — provenance unknown | Replace with an original icon |
| `public/default-avatar.png` | Fallback avatar | **Low** — provenance unknown | Replace with an original or generated avatar |
| `src/app/favicon.ico` | Next.js default-style favicon | **Low** — may be framework default | Replace with original artwork |
| IBM Plex Mono | `next/font/google` | None — SIL OFL | Keep the OFL attribution |
| `lightweight-charts` | npm package, attributed with a "tv" text badge (`trading-chart.tsx:1100-1104`) | **Low** — Apache-2.0 requires attribution; the badge must not imply TradingView endorsement | Keep attribution, make it a link, avoid official logos |
| `lucide-react` icons | npm package | None — ISC | Keep licence notice |
| Gameplay/layout inspiration (bustabit-like field, TradingView-like toolbar, battle-game flows) | No copied code or art identified beyond the items above | Low | Allowed as inspiration; do not import their logos or assets |

---

## 6. Dependency licenses

`license-checker --production` over 73 packages:

| Licence | Count | Notes |
|---|---|---|
| MIT | 52 | Compatible |
| Apache-2.0 | 11 | Compatible; keep NOTICE/attribution |
| ISC | 3 | Compatible |
| BSD-3-Clause | 2 | Compatible |
| Apache-2.0 AND LGPL-3.0-or-later | 1 | `@img/sharp-win32-x64` (libvips). LGPL-3.0 can be combined with AGPL-3.0; ship the LGPL notice and keep the library dynamically linked |
| Apache-2.0 AND MIT | 1 | `@swc/core-win32-x64-msvc`; compatible |
| CC-BY-4.0 | 1 | `caniuse-lite` (browser data). Attribution required in a NOTICE file |
| 0BSD | 1 | Compatible |
| UNLICENSED | 1 | The project itself (`package.json` has no `license` field) |

**Conclusion:** no GPL-2.0-only, SSPL, BUSL or proprietary production dependency was
found. The tree is AGPL-3.0 compatible. Add `"license": "AGPL-3.0-only"` to
`package.json` in Step 2, and add a `THIRD_PARTY_NOTICES.md` for Apache-2.0, LGPL,
CC-BY-4.0 and OFL notices. `npm audit --omit=dev` reports **0** vulnerabilities.

---

## 7. Private / server-only logic and the open-core split

| Area | Files | Public or private? | Why |
|---|---|---|---|
| Deterministic engine, synthetic market, bot, candles | `src/lib/engine/**` | **Public** | The game itself; clients must re-simulate to play. Hiding it is not a security control |
| Client UI, terminal, marketing, auth screens | `src/app/**` (except admin money), `src/components/**` (except wallet money + admin money) | **Public** | The product |
| Progression, ranks, missions, achievements | `src/lib/progress/**`, `src/components/progress/**` | **Public** | Non-monetary, contributes to the F2P game |
| Lobby realtime: matchmaking, challenges, private tables, friends, invites | `src/lib/matchmaking/**`, `src/lib/challenges/**`, `src/lib/tables/**`, `src/lib/friends/**`, `src/lib/rooms/**` | **Public (client side)** | Broadcast topology is already visible in the browser; tuning constants can stay public |
| Match submit + scoring verification | `src/app/api/matches/submit/route.ts`, `src/lib/engine/simulate.ts` | **Public in F2P; private if it ever settles value** | It persists nothing today. Any value-bearing settlement must live in a private service with server-issued tickets |
| Real-money wallet, deposits, withdrawals, on-chain check, IB rebates | `src/lib/economy/**`, `src/components/wallet/**`, `src/app/api/chain/tx/**`, `src/app/admin/{deposits,withdrawals,ledger}/**`, `src/components/admin/onchain-check.tsx`, `src/lib/supabase/{wallet,referrals}.ts` money paths, money SQL | **Private / not shipped** | Explicitly out of scope for a free-to-play public repo; also the highest-risk code in the tree |
| Admin console (players, announcements, segments, reports) | `src/app/admin/**`, `src/lib/admin/**`, `src/components/admin/**` | **Private (recommended)** | Admin UI plus RPC wrappers are an attack surface; RLS must remain the real boundary either way |
| Database schema for the F2P game | `supabase/setup.sql` minus money tables, `supabase/migrations/*` minus money migrations | **Public after stripping money** | Contributors need a schema to run locally |
| Production RLS/RPC hardening, settlement, deployment, runbooks | `supabase/migrations/20261101120000_security_hardening.sql`, future settlement service | **Private** | Operational security; publish the F2P core schema instead |
| `SECURITY_AUDIT_REPORT.md` | root | **Private until PD-003/004/006/008 are closed** | It is already on `origin/main` and describes open holes and money RPCs |

**Recommended open-core boundary:** `pip-duel` (public) = free-to-play client, engine,
lobby, progression, docs and a local Supabase schema. `pipduel-server` (private) = any
operator deployment that touches value: payments, settlement, admin money desks,
anti-abuse tuning, production RLS/RPCs and secrets.

---

## 8. Removal list — real-money features (flag only, nothing deleted)

The product currently implements real-money gambling. This conflicts with the
"free-to-play, virtual currency only" release rule.

| # | File / area | What it does |
|---|---|---|
| RM-01 | `src/lib/economy/config.ts` | `COINS_PER_USD = 100` ($1 = 100 coins), USD deposit packs, withdrawal fee, `HOUSE_CUT = 0.15`, payout rails |
| RM-02 | `src/lib/economy/{deposit,deposit-store}.ts`, `src/components/wallet/deposit-form.tsx` | Crypto deposit flow: package + rail + TxID, pending review |
| RM-03 | `src/lib/economy/{withdraw,withdraw-store}.ts`, `src/components/wallet/withdraw-form.tsx` | Crypto payout requests, escrow, fee, address validation |
| RM-04 | `src/lib/economy/etherscan.ts`, `src/app/api/chain/tx/route.ts`, `src/components/admin/onchain-check.tsx` | On-chain verification of USDT transfers against a house address |
| RM-05 | `src/app/admin/deposits/page.tsx`, `src/app/admin/withdrawals/page.tsx`, `src/app/admin/ledger/page.tsx` | Deposit approval, payout signing, manual balance adjustments |
| RM-06 | `src/lib/supabase/wallet.ts`, `src/lib/supabase/referrals.ts`, `src/app/admin/referrals/page.tsx`, `src/app/affiliate/page.tsx`, `transferDeskToWallet` in `src/app/play/page.tsx` | Wallet RPC wrappers, IB commission desk and desk-to-wallet transfers |
| RM-07 | `supabase/migrations/20261031120000_crypto_deposits.sql`, `20261031130000_deposit_reviewer_amount.sql`, `20261031180000_crypto_withdrawals.sql`, `20261101090000_admin_operations.sql`, money sections of `supabase/setup.sql` | `crypto_deposits`, `crypto_withdrawals`, `wallet_ledger`, `approve_crypto_deposit`, `request/approve/reject_crypto_withdraw`, `admin_adjust_coins`, `ib_config` |
| RM-08 | `public/deposit-qr-usdt-bep20.jpg` | Deposit QR for a live BEP20 address |
| RM-09 | `.env.example` deposit rails; `.env` / `.env.local` house address; `NEXT_PUBLIC_DEPOSIT_*` | House wallet configuration |
| RM-10 | `src/app/legal/aml-kyc/page.tsx`, `src/app/legal/responsible-trading/page.tsx`, money claims in `terms`, `privacy`, `risk`, `disclaimer`, `README.md`, `/pricing` | Legal copy that describes deposits, payouts, KYC and gambling |
| RM-11 | `src/app/play/page.tsx` (Live entry charging, pot payout), `src/lib/economy/stakes.ts` | Real-money stake/pot settlement on the client |
| RM-12 | `SECURITY_AUDIT_REPORT.md` money sections (PD-002, withdrawal/deposit RPC controls) | Operational detail about moving value |

**Keep if the economy is made virtual-only:** the Live/Demo ticket split, fees in
coins, bot practice, ranks, progression, leaderboard and the pot math — as long as coins
can never be bought or cashed out and no deposit/withdraw UI remains.

---

## 9. Security posture relevant to publication

The repo already contains a security audit (`SECURITY_AUDIT_REPORT.md`, on
`origin/main` and `security/audit-2026-10-29`). Its findings still matter for a public
release:

| ID | Severity | Status | Relevance |
|---|---|---|---|
| PD-001 profile role escalation | Critical | Fixed in `supabase/setup.sql:2855-2888` (column grants + `trg_profile_authority`) | The fix is only effective if `setup.sql` is executed end-to-end or the migration is applied; verify before exposing the schema |
| PD-002 wallet was proof of funds | Critical | Mitigated (payouts read `wallet_ledger`) | Goes away with the money feature removal |
| PD-003 `player_balances` world read/write | High | **Open** (`setup.sql:261-266`, `using (true)`) | Any visitor can inflate or zero any wallet; game-integrity issue that becomes embarrassing in public |
| PD-004 `player_friends` world read/write | Medium | **Open** | Griefing/privacy issue |
| PD-006 `/api/matches/submit` unauthenticated, in-memory rate limit | Medium | **Open** | CPU burn; do not build settlement on it |
| PD-008 `/admin` guarded only client-side; `src/middleware.ts` is a no-op | Low | **Open** | RLS is the real guard; a public repo makes the admin routes discoverable |
| PD-005 security headers | Medium | Fixed in `next.config.ts` | Keep |

For the F2P public repo: move guest wallets to `localStorage`, scope
`player_balances` to authenticated owners, tighten `player_friends`, and either fix or
remove admin money routes. Do not publish the audit report until PD-003/004/006/008 are
closed or explicitly accepted.

---

## 10. Findings by severity (roll-up)

**Critical**
- Real-money gambling feature set (deposits, custody-style coin balances, cash-outs,
  house cut, IB commissions) — release-policy conflict and jurisdictional risk.

**High**
- Live house deposit address committed in tests and a QR image (SEC-01/02/03/07).
- Captured Chrome profile with cookies and saved logins in local checkpoint refs
  (SEC-04) — one `git push --mirror` away from exposure.
- Copyrighted "official MW3 Lobby" audio (asset audit).
- EC Markets trademark + affiliate referral link.
- Open world-writable wallet/friends policies (PD-003/PD-004).

**Medium**
- `SECURITY_AUDIT_REPORT.md` on the remote describing open holes and money RPCs.
- Etherscan key present locally but unused (revoke).
- Service-role key and production Supabase host in local env files (untracked).
- Asset provenance unknown for lobby/match-ticket/coin/avatar art.
- Outdated README (documents routes that do not exist, real-money claims, old palette).

**Low**
- Next.js default-style favicon.
- `pipduel.com` hardcoded in invite copy.
- `AGENTS.md` agent instructions shipped in the repo.
- "tv" text badge imitating TradingView attribution.
- gitleaks false positive on the USDT contract address.

---

## 11. Publication checklist (what Step 2+ must deliver)

1. Remove or gate every RM-* item; replace the wallet with a virtual, non-purchasable
   balance; keep Demo/Live tickets but make Live stakes virtual.
2. Replace the committed house address with dummy data; delete the QR; retire that
   wallet.
3. Delete `mw3-lobby.mp3`, the EC Markets banner/referral link; replace or license the
   art assets.
4. Fix or explicitly accept PD-003/PD-004; decide whether the admin console ships.
5. Clean local checkpoint refs and `.rea-cathode`; never mirror-push.
6. Add `LICENSE` (AGPL-3.0), `README`, `CONTRIBUTING`, `CODE_OF_CONDUCT`, `SECURITY`,
   `TRADEMARK`, `ROADMAP`, `.github/`, `docs/ARCHITECTURE.md`, `docs/GOOD_FIRST_ISSUES.md`,
   `scripts/seed-sample-data.*`, `scripts/setup-github.sh`.
7. Verify a clean clone installs, lints, type-checks, tests and builds.
8. Re-run gitleaks on the working tree and the full history before flipping visibility.

---

## 12. TODO_REPLACE_ME inventory (initial)

| Placeholder | Used for |
|---|---|
| `TODO_REPLACE_ME_MAINTAINER_NAME` | Maintainer name in `package.json`, `CODEOWNERS`, DCO examples |
| `TODO_REPLACE_ME_MAINTAINER_EMAIL` | Maintainer and DCO contact |
| `TODO_REPLACE_ME_SECURITY_EMAIL` | Private vulnerability reporting in `SECURITY.md` |
| `TODO_REPLACE_ME_GITHUB_OWNER` | `CODEOWNERS` handle and repo URLs |
| `TODO_REPLACE_ME_GITHUB_REPO_URL` | README clone/issue links |
| `TODO_REPLACE_ME_DOMAIN` | Public project domain (currently `pipduel.com` in code) |
| `TODO_REPLACE_ME_DISCUSSIONS_URL` | `.github/ISSUE_TEMPLATE/config.yml` |
| `TODO_REPLACE_ME_TELEGRAM_URL` | Community link (currently `t.me/forexwala`) |
| `TODO_REPLACE_ME_COC_CONTACT` | Contributor Covenant enforcement contact |
| `TODO_REPLACE_ME_TRADEMARK_OWNER` | Legal owner in `TRADEMARK.md` |

---

## 13. Audit limitations

- The Supabase project was not queried; SQL review is static. "Fixed" means the fix is
  present in `setup.sql` / migrations, not that it has been executed in production.
- No network licence verification was possible for the art assets; provenance is marked
  unknown rather than assumed clean.
- The captured Chrome profile was deliberately not opened. Its presence, size and file
  names are enough to classify it as sensitive.
- gitleaks uses its default rule set plus entropy heuristics; a custom rule set may find
  more. Add `.gitleaks.toml` allowlists in Step 2.
- `npm audit` covers the npm advisory database only, at the lockfile's resolution date.

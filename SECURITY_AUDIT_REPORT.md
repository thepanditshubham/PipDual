# Pip Duel — Security Audit

**Date:** 2026-10-29 · **Branch:** `security/audit-2026-10-29` · **Scope:** the Next.js app in this repository and the Supabase schema it ships (`supabase/setup.sql` + `supabase/migrations/`).

This file consolidates the requested artifacts: scope and architecture, threat model, findings, remediation log, test plan and baseline. One document rather than five so the repository stays readable — the findings are the deliverable, not the paperwork.

---

## 1. Stack and trust boundaries

| Layer | What runs there |
|---|---|
| Browser | Next.js 16 App Router (React 19), zustand stores, Supabase JS with the **public anon key** |
| Next server | 3 route handlers: `/api/auth/callback`, `/api/matches/submit`, `/api/chain/tx` |
| Supabase | Postgres + GoTrue + PostgREST. 56 RLS policies, 18 `SECURITY DEFINER` functions |
| Chain | Public JSON-RPC nodes, read-only, admin-triggered |

Boundaries that matter, in order of severity:

1. **Browser → PostgREST.** The anon key is public by design, so every table grant and RLS policy *is* the API. Anything writable by `authenticated` is writable by an attacker with a browser console.
2. **Browser → definer functions.** `approve_crypto_deposit`, `approve_crypto_withdraw`, `admin_adjust_coins` move real value. All of them gate on `is_admin()`, which reads `profiles.role`.
3. **`player_balances`.** Deliberately client-authoritative ("the app owns its wallet row") so guest and demo play work offline. It is *not* a trustworthy record of money — but it was being used as one.

## 2. Threat model (abridged)

| Actor | Capability | Highest-value target |
|---|---|---|
| Anonymous visitor | anon key, can call any `GRANT`ed table/RPC | public tables; deposit insert |
| Signed-in player | own JWT; RLS applies | own profile row, own wallet, withdrawal desk |
| Malicious player | everything above + devtools | **privilege escalation → payout approval** |
| Compromised dependency | build-time | secrets, supply chain |

Attack tree for the worst case, as found: `PATCH profiles {role:'admin'}` → `is_admin()` true → `approve_crypto_withdraw` on a self-filed payout → USDT leaves the house wallet. Second path: `PATCH player_balances` → `request_crypto_withdraw` → same desk.

## 3. Findings

| ID | Severity | Finding | Status |
|---|---|---|---|
| PD-001 | **Critical** | Any player could set their own `profiles.role = 'admin'` | **FIXED** (not executed — see §6) |
| PD-002 | **Critical** | `player_balances` writable by any client; withdrawals trusted it as proof of funds | **Mitigated** (payout path fixed), root cause OPEN |
| PD-003 | High | `player_balances` readable and writable for *every* row | OPEN |
| PD-004 | Medium | `player_friends` policies are `using (true)` for all four verbs | OPEN |
| PD-005 | Medium | No security headers (framing, MIME sniffing, referrer) | **FIXED AND VERIFIED** |
| PD-006 | Medium | `/api/matches/submit` is unauthenticated, rate-limits on a spoofable header | OPEN (no money impact — it persists nothing) |
| PD-007 | Low | `profiles` readable by everyone, including `role`, `country`, `language` | Accepted (usernames are public by design) |
| PD-008 | Low | `/admin` is guarded only in the client; middleware is a no-op | OPEN (data still protected by RLS) |
| PD-009 | Info | `/api/chain/tx` reads `role` with the anon client — works only because `profiles` is public | OPEN |

### PD-001 — profile privilege escalation (Critical)

`supabase/setup.sql:87-95`

```sql
create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id) with check (auth.uid() = id);
```

RLS scopes the **row**, not the **columns**. `role`, `status`, `rating` and `risk_rating` were all updatable by their owner. `public.is_admin()` (`setup.sql`, `crypto_deposits` section) is `exists(select 1 from profiles where id = auth.uid() and role = 'admin')`, so the escalation is a single request with the anon key that already ships to the browser:

```
PATCH /rest/v1/profiles?id=eq.<me>   {"role":"admin"}
```

Everything gated on `is_admin()` then opens: `admin_adjust_coins`, `approve_crypto_deposit`, `approve_crypto_withdraw`, `reject_crypto_withdraw`, `admin_set_player_status`, the announcement and IB admin RPCs.

**Fix** — `migrations/20261101120000_security_hardening.sql`:
- Column grants: `revoke update on profiles` then `grant update (username, display_name, avatar_url, country, language)`. A patch naming `role` now fails at the privilege check before RLS is consulted.
- Defense in depth: `trg_profile_authority` compares the protected keys as `jsonb` and raises `42501` if any changed, unless the caller is an admin or `auth.uid()` is null (service role, SQL editor — the path that appoints the first admin).

### PD-002 — the wallet was the proof of funds (Critical)

`upsertCoins()` (`src/lib/supabase/wallet.ts:70`) writes `player_balances.virtual_balance` from the browser. RLS allowed it (`using (true)`), and `request_crypto_withdraw` used the same column to decide what could be paid out:

```sql
if v_balance < p_coins then raise exception ...
```

So: pad the balance, request a payout, wait for approval. The dual-approval threshold (5000 coins) does not help — an attacker who is admin (PD-001) can promote a second account.

**Fix** — the payout desk no longer trusts the wallet. `wallet_ledger` has **no client write path at all** (no INSERT/UPDATE/DELETE policy; `record_ledger` is revoked from `public` and only called inside definer functions), so its sum is the only trustworthy statement of money in:

```sql
select coalesce(sum(coins), 0) into v_earned
  from public.wallet_ledger where player_id = p_player_id;
if v_earned < p_coins then raise exception ... end if;
```

`deposit` is +, `adjustment` ±, `payout` −, `payout_refund` +, so the sum is exactly "paid in or won, minus already withdrawn". Coins minted in a browser have no ledger row and cannot reach the payout desk.

**Residual (OPEN):** the wallet remains client-authoritative, which is a *game-integrity* problem, not a money one — a player can still inflate play coins and win pots they should not. Closing it needs server-side settlement, which this app does not have yet: `/api/matches/submit` re-simulates one player's actions and returns a score, but nothing persists a match, so there is no server-held record for an RPC to settle against. Recommended sequence: persist matches + both action sets on submit → `settle_match()` definer function that debits the stake and credits the pot → then `revoke update, insert on player_balances from authenticated`.

### PD-003 — every wallet readable and writable (High)

`balances_read_own` / `balances_upsert_own` / `balances_update_own` are all `using (true)` / `with check (true)`. Any client reads the whole table and can zero out or inflate any row by `player_id`.

Not fixed here because the same policy is what lets guests (non-UUID ids, no JWT) hold a wallet. The scoping that works for signed-in players breaks demo play, so it needs the guest wallet moved to local storage first. Documented as a release blocker for any real-money launch beyond PD-002's compensation.

### PD-004 — friends graph (Medium)

`setup.sql:310-313`: `select/insert/update/delete ... using (true)`. Anyone can read, forge, accept or delete any friendship pair. No money impact; a griefing and privacy issue. Same guest-id constraint as PD-003.

### PD-005 — security headers (Medium) — fixed

`next.config.ts` had none. Added and verified live:

```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
Content-Security-Policy: frame-ancestors 'none'; base-uri 'self'; object-src 'none'
```

Deliberately partial CSP: no `script-src`, because a wrong one takes down the Next bootstrap. A nonce-based `script-src` is the follow-up.

### PD-006 — match submit (Medium)

No auth, `x-forwarded-for` key for the limiter, in-memory map (resets per instance, bypassable by rotating the header). It persists nothing and returns `verified: true` for any well-formed body, so the impact is CPU burn on re-simulation and a false sense of verification for anything that later trusts it. Do not build settlement on this endpoint as it stands: bind submissions to a server-issued ticket id and a JWT.

## 4. Controls verified as sound

- **Withdrawal RPC**: ownership (`auth.uid() = p_player_id`), row-lock before read, address regex per rail, fee floor, escrow on request, refund on reject, dual approval above 5000 with a distinct second admin. Sound except for the funds check, now fixed.
- **Deposit RPC**: admin-only, `for update`, refuses to pay a TxID twice (`guard_deposit_txid` trigger + unique index), credits and writes the ledger in one transaction.
- **`record_ledger`**: revoked from `public`, writes `actor_id` only for adjustments.
- **`player_mails`**: read/update/delete all scoped to `auth.uid()::text = player_id`; no INSERT policy.
- **Secrets**: `.env*` is git-ignored, only `.env.example` is tracked. No service-role key anywhere in `src/` — the app never ships one to the client.
- **XSS surface**: no `dangerouslySetInnerHTML` found; React escapes by default.

## 5. Not tested (blind spots)

- Live JWT configuration (expiry, refresh rotation, revocation) — dashboard setting, not in the repo.
- Storage buckets and their policies — none created in `setup.sql`.
- CI/CD — no workflow files in the repo.
- Rate limits at the edge, WAF, TLS configuration — deployment concerns.
- The SQL in this change was **not executed**: no Postgres, Docker or Supabase CLI is available in this environment.

## 6. Verification status

| Change | Evidence |
|---|---|
| PD-005 headers | live `200` response from `next dev` carrying all five headers |
| PD-001, PD-002 SQL | static review only — **not executed**. Run `supabase/tests/20261101_security_hardening_test.sql` in a staging project |
| TypeScript | `tsc --noEmit` clean, `eslint` clean |

## 7. Rollback

```
git checkout main                 # branch only carries this change set
```

Database: both fixes are additive or narrower than what they replace.

```sql
-- PD-001
drop trigger if exists trg_profile_authority on public.profiles;
revoke update on public.profiles from authenticated;
grant update on public.profiles to authenticated;

-- PD-002: restore the previous request_crypto_withdraw definition from
-- supabase/migrations/20261031180000_crypto_withdrawals.sql
```

## 8. Baseline going forward

1. Every new table: `enable row level security`, and a policy that names `auth.uid()` — `using (true)` only for genuinely public catalogues.
2. Never let a client write a number that a payout reads. If a value must be client-authoritative, it must not be money.
3. Authority lives in columns no client grant touches (`role`, `status`, `rating`), and a trigger holds the line behind the grants.
4. New definer functions: `set search_path = public, pg_temp`, `revoke all from public`, `grant execute to authenticated`, and an `is_admin()` check as the first statement.
5. Run the header check and the SQL test file before any release that touches `setup.sql`.

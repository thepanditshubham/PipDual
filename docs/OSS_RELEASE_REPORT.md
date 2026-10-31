# Pip Duel — Open-source release report

**Date:** 2026-10-31
**Branch:** `chore/open-source-prep`
**Scope:** free-to-play remediation, docs, CI and onboarding.
**Mode:** working tree only — no force-push, `main` untouched, history not rewritten.

Companion: [OSS_AUDIT.md](OSS_AUDIT.md) (findings and evidence),
[ARCHITECTURE.md](ARCHITECTURE.md), [GOOD_FIRST_ISSUES.md](GOOD_FIRST_ISSUES.md).

---

## 1. Verdict

**Go for a public release of this tree, after the manual checklist in §8.**

All Critical, High and Medium findings from the audit were removed or fixed in
the working tree:

- no deposits, withdrawals, crypto rails, chain checks, wallet addresses, QR
  images, IB commissions or money admin desks;
- no copyrighted MW3 audio, EC Markets banner or unknown-origin art;
- no public admin console and no no-op middleware;
- wallet and friends are scoped by RLS; guest balances stay on the device;
- the captured Chrome profile and its local checkpoint refs were deleted.

What remains is operational: rotate the old keys, fill the TODO placeholders,
decide whether to purge old history, run the GitHub setup, and push.

---

## 2. What changed

| Area | Change |
|---|---|
| Money stack | Deleted deposits, withdrawals, deposit/withdraw stores, on-chain verification, `/api/chain/tx`, wallet forms/card/panel, admin deposits/withdrawals/ledger/referrals, IB/referral client, money SQL and the money migrations |
| Coins | Virtual credits only. Starting balance 1,000 for a new account. Ranked entry and the virtual pot remain; a 15% sink removes credits from circulation. No purchase, transfer or cash-out |
| Admin | The public admin console (`/admin/**`, admin components/data module) was removed; operator tooling is private. Announcements are read-only in the public schema |
| RLS | `player_balances` and `player_friends` policies now require `auth.uid()::text = player_id` / requester/addressee; guest balances are local |
| Legal/marketing | Pricing is a free-to-play page; FAQ, glossary, proof, security, status, support, terms, privacy, disclaimer, risk and responsible-trading copy rewritten. Removed `/affiliate` and `/legal/aml-kyc` routes and links |
| Assets | Deleted `mw3-lobby.mp3`, the deposit QR, the bull/bear and ticket art, `coin.png`, `default-avatar.png` and the Next favicon. Added an original SVG app icon and inline SVG avatar; coins use the Lucide icon |
| Sound | MW3 loader/playback removed; hover uses the synthesized WebAudio tick |
| Auth | Referral-code lookup removed from signup; input validation unchanged |
| DB schema | `supabase/setup.sql` no longer creates money tables/functions or admin announcement writers; money migrations and the money SQL test were deleted |
| Local evidence | `.rea-cathode/` deleted; both `refs/cline/checkpoints/*` refs pruned; reflog expired. `git gc` reported exit 128 in the sandbox and can be re-run |
| Secrets | `.gitleaks.toml` and `SECURITY_AUDIT_REPORT.md` deleted; local `.env`/`.env.local` reduced to Supabase URL, anon key and site URL |
| Docs | Audit carries a remediation table; README, roadmap, security, notices and architecture updated |

### Commits on this branch

Earlier prep commits remain; the remediation adds:

- `refactor: remove real-money features and the public admin console`
- `docs: describe the free-to-play build and remediation`
- `docs: add the free-to-play release report` (this file)

---

## 3. Verification

### Clean clone (README steps)

Cloned `chore/open-source-prep` into a fresh temp directory, copied
`.env.example` to `.env.local`, then:

| Step | Result |
|---|---|
| `npm ci` | OK |
| `npm run lint` | **0 errors**, 47 warnings |
| `npm run typecheck` | OK |
| `npm test` | **73 tests / 5 files passed** |
| `npm run build` | OK |
| `npm start` + GET `/`, `/play`, `/pricing`, `/legal/terms`, `/login` | **200** |
| GET `/affiliate`, `/admin`, `/legal/aml-kyc` | **404** (routes removed) |

The app boots with placeholder Supabase values; guest/practice play works
without a backend.

### Secrets scan after changes

| Scope | Findings |
|---|---|
| Working tree (`src`) | **0** |
| Full local history (`gitleaks git --all`) | **1** — the public USDT contract address in an old commit; not a credential |
| Captured Chrome profile | **0** — directory deleted and refs pruned |

No API key, JWT, service-role key or private key is present in the current tree.
Older commits still contain the deleted security report, the old house address in
two test files and the QR blob; purging them requires a history rewrite (§8).

### Dependency and licence checks

- `npm audit --omit=dev`: **0 vulnerabilities**.
- Production licences remain AGPL-3.0-compatible; see `THIRD_PARTY_NOTICES.md`.
- `LICENSE` is the official AGPL-3.0 text; `package.json` declares
  `AGPL-3.0-only`.

---

## 4. Findings resolved

| Severity | Finding | Resolution |
|---|---|---|
| Critical | Real-money gambling feature set | Removed; coins are virtual credits |
| High | Live USDT-BEP20 address in tests + QR | Removed with the money tests and QR |
| High | Captured Chrome profile in local refs | Directory deleted; refs pruned |
| High | Official MW3 lobby audio | Asset and loader removed |
| High | EC Markets logo + IB affiliate link | Banner and link removed |
| High | World-writable wallet/friends | RLS scoped to `auth.uid()` |
| High | Security audit with open exploit notes | File deleted from the tree; history decision in §8 |
| Medium | Local Etherscan/service-role/deposit env | Removed from local env; rotate keys |
| Medium | Unknown-origin art/favicon | Removed; original SVG replacements |
| Medium | Public admin console / no-op middleware | Removed |
| Medium | Money-era legal and marketing copy | Rewritten |

**Low items left as-is:** 47 ESLint warnings (unused vars, `<img>` advisories),
the `tv` attribution badge, and `AGENTS.md`. They are not release blockers.

---

## 5. Keys to rotate

| Credential | Status | Action |
|---|---|---|
| Etherscan API key | Removed from local env; no code uses it | **Revoke** |
| USDT-BEP20 house address | Removed from code, tests and QR | **Retire**; create a new address only if a private money product continues |
| Supabase service-role key | Removed from local env | **Rotate if** it ever left the machine |
| Supabase anon key | Still in local env; public by design | No rotation required |
| Accounts in the captured Chrome profile | Profile deleted | Sign out / rotate sessions if the profile left the machine |

---

## 6. Removal list — executed

RM-01 to RM-12 from the audit are now deleted or rewritten:

- economy config/peg/packs/fees, deposit and withdrawal stores, chain reader,
  wallet forms, admin money desks, referrals/IB, money SQL migrations, deposit
  QR, deposit env vars, AML/KYC page, money marketing copy and the money sections
  of the legal pages.

**Kept:** the deterministic engine, virtual tickets, the 15% sink, bots,
progression, leaderboard data, private tables, friends and mail.

---

## 7. `TODO_REPLACE_ME` placeholders

| Placeholder | Files |
|---|---|
| `TODO_REPLACE_ME_MAINTAINER_NAME` | `docs/OSS_AUDIT.md` |
| `TODO_REPLACE_ME_MAINTAINER_EMAIL` | `README.md`, `TRADEMARK.md` |
| `TODO_REPLACE_ME_SECURITY_EMAIL` | `SECURITY.md` |
| `TODO_REPLACE_ME_GITHUB_OWNER` | `.github/CODEOWNERS`, `.github/ISSUE_TEMPLATE/config.yml`, `scripts/setup-github.sh` |
| `TODO_REPLACE_ME_REPO` | `.github/ISSUE_TEMPLATE/config.yml`, `scripts/setup-github.sh` |
| `TODO_REPLACE_ME_GITHUB_REPO_URL` | `README.md`, `CONTRIBUTING.md`, `SECURITY.md` |
| `TODO_REPLACE_ME_DOMAIN` | `docs/OSS_AUDIT.md` |
| `TODO_REPLACE_ME_DISCUSSIONS_URL` | `README.md`, `.github/ISSUE_TEMPLATE/config.yml` |
| `TODO_REPLACE_ME_TELEGRAM_URL` | `README.md`, `.github/ISSUE_TEMPLATE/config.yml` |
| `TODO_REPLACE_ME_COC_CONTACT` | `CODE_OF_CONDUCT.md` |
| `TODO_REPLACE_ME_TRADEMARK_OWNER` | `TRADEMARK.md` |

Screenshot placeholders remain in the README table.

---

## 8. Manual steps, in order

1. **Rotate/revoke:** Etherscan key; retire the old BEP20 address; rotate the
   Supabase service-role key if it was ever shared or synced. Sign out any
   account that used the captured profile.
2. **Decide on history cleanup.** No API key/JWT is in history, so a rewrite is
   not required for credentials. It is the only way to remove the deleted
   security report, the old house address in test files and the QR blob from old
   commits. If you choose to:
   - back up the repository (all refs),
   - use `git filter-repo --path SECURITY_AUDIT_REPORT.md --invert-paths`,
     remove the QR/tests or `--replace-text` the address,
   - force-push and tell every collaborator to re-clone.
   This is destructive and has **not** been run.
3. **Fill the placeholders** in §7 and add the three screenshots.
4. **Confirm the local cleanup:** `.rea-cathode/` is gone and
   `git for-each-ref refs/cline` is empty. Re-run `git gc --prune=now` if you
   want to compact the object store.
5. **Push the branch** and open a PR. Confirm CI (`quality`, `DCO sign-off`,
   `gitleaks`) is green.
6. **Run the GitHub setup:** edit `OWNER`/`REPO` in `scripts/setup-github.sh`,
   review it, run it, then run its printed branch-protection command.
7. **Make the repository public** only after the PR is merged and the
   placeholders are filled.
8. **Announce** with the Discussions/Telegram links.

---

## 9. Go / no-go

**Go**, conditional on §8 steps 1–3. The tree no longer contains money features,
third-party assets, a public admin console or the captured profile. The remaining
work is configuration and key hygiene, not code.

Do not re-add deposits, withdrawals, cash-out or paid value. If a monetised
product is ever built, keep it in a separate private deployment and re-run the
audit.

---

## 10. Limitations

- No production Supabase instance was available; `setup.sql` was reviewed
  statically and the app was built with placeholder credentials. Apply the schema
  to a staging project before launch.
- The SQL rewrite removes money tables from new installs but does not drop them
  from an existing database; archive/drop those manually.
- `git gc` exited 128 in the sandbox; refs are pruned but unreachable objects may
  remain until it is re-run locally.
- Older history still contains the removed report/address/QR until a rewrite.
- `scripts/setup-github.sh` was not executed and `bash` is unavailable locally.

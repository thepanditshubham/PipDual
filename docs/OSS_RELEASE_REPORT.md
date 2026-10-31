# Pip Duel — Open-source release report

**Date:** 2026-10-31
**Branch:** `chore/open-source-prep` (not pushed)
**Scope:** open-source readiness, docs, CI and onboarding. No code deletion, no
history rewrite, no visibility change, no publish.

Companion documents: [OSS_AUDIT.md](OSS_AUDIT.md) (findings and evidence),
[ARCHITECTURE.md](ARCHITECTURE.md), [GOOD_FIRST_ISSUES.md](GOOD_FIRST_ISSUES.md).

---

## 1. Verdict

**No-go for a public release today.**

The repository is now structurally ready — license, policies, README, CI,
templates, onboarding — and a clean clone installs, lints, type-checks, tests and
builds. But the public release is blocked by product content, not paperwork:

- the real-money wallet stack is still in the tree (deposits, withdrawals, chain
  verification, house cut, IB payouts);
- a live USDT-BEP20 house address is committed in two test files and a QR image;
- the lobby ships copyrighted MW3 audio and an EC Markets logo + IB affiliate
  link with unknown permission;
- `player_balances` and `player_friends` are world-readable/writable (audit
  PD-003/PD-004), and `origin/main` already carries the audit that explains them.

Fix those, then the go/no-go flips. See §11.

---

## 2. What changed

Commits on `chore/open-source-prep`, oldest first:

| Commit | Subject |
|---|---|
| `ae2b303` | `docs: add open-source readiness audit` |
| `e9ee2a3` | `style(theme): adopt indigo and amber palette` |
| `0b4efe2` | `docs: add AGPL license and project policies` |
| `4fd33c2` | `chore: add env template, package metadata and sample-data tooling` |
| `a006f63` | `chore(github): add templates, CI, DCO, secret scan and dependabot` |
| `546a317` | `docs: add architecture overview` |
| `4fded7b` | `docs: rewrite README for the public free-to-play build` |
| `503946f` | `docs: add starter issues and GitHub setup script` |

### Files added

- `LICENSE` — verbatim GNU AGPL-3.0 text (SPDX `AGPL-3.0-only`).
- `TRADEMARK.md`, `THIRD_PARTY_NOTICES.md`.
- `README.md` — rewritten for the free-to-play scope.
- `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` (Contributor Covenant v2.1),
  `SECURITY.md`, `ROADMAP.md`.
- `.env.example` — free-to-play variables only.
- `.gitleaks.toml` — scoped allowlist for public USDT contract addresses.
- `docs/ARCHITECTURE.md`, `docs/GOOD_FIRST_ISSUES.md`,
  `docs/OSS_AUDIT.md`, `docs/OSS_RELEASE_REPORT.md`.
- `scripts/seed-sample-data.mjs` — deterministic synthetic candles.
- `scripts/setup-github.sh` — labels, starter issues, printed branch-protection
  command. **Not run.**
- `.github/ISSUE_TEMPLATE/{bug_report,feature_request,config}.yml`,
  `.github/PULL_REQUEST_TEMPLATE.md`, `.github/CODEOWNERS`,
  `.github/dependabot.yml`,
  `.github/workflows/{ci,dco,secret-scan}.yml`.

### Files modified

- `package.json` — `license: AGPL-3.0-only`, `engines.node >= 20.9`,
  `typecheck` and `seed` scripts.
- `.gitignore` — ignores generated `/data/`.
- `eslint.config.mjs` — ignores local `.rea-cathode/`, coverage and test output.
- `src/app/api/matches/submit/route.ts`, `src/components/terminal/trading-chart.tsx`
  — removed `any`; typed chart time as `UTCTimestamp`.
- `src/components/theme-provider.tsx`, `src/app/play/page.tsx`,
  `src/app/play/[room]/page.tsx` — targeted `react-hooks/set-state-in-effect`
  disables on the game-clock/theme-sync effects (with rationale comments).
- `src/app/legal/terms/page.tsx` — escaped an apostrophe.
- The 36-file indigo/amber theme change set (`globals.css` plus pages and
  components) is included in `e9ee2a3`. It also contains pre-existing uncommitted
  UI edits that were in the working tree when this task started
  (`result-modal.tsx` and a few others). If you want those separated, split the
  commit before publishing.

**Not changed:** no money module was deleted, no asset was removed, no history
was rewritten, no branch was pushed, no repository setting was touched.

---

## 3. Verification

### Clean-clone test (README steps)

Cloned `chore/open-source-prep` into a fresh temp directory, copied
`.env.example` to `.env.local`, and ran the documented commands:

| Step | Result |
|---|---|
| `git clone --branch chore/open-source-prep <local repo>` | OK |
| `npm ci` | OK — 433 packages, ~52 s |
| `cp .env.example .env.local` | OK |
| `npm run lint` | **0 errors**, 51 warnings |
| `npm run typecheck` | OK |
| `npm test` | **149 tests / 8 files passed** |
| `npm run build` | OK — all routes compiled |
| `npm run dev` + GET `/`, `/login`, `/play` | **200 / 200 / 200** with placeholder Supabase env |

The app boots without a backend because `getSupabase()` returns `null` for the
placeholder URL. Guest and bot play therefore work from the quick start; auth,
friends, mail and 1v1 matching need a Supabase project.

### Tooling checks

- **Seed script:** generated 60 candles across 3 pairs; byte-identical on a
  second run; metadata marks the data synthetic.
- **YAML:** all `.github` YAML parses cleanly.
- **Shell:** `bash` is not installed on this Windows host, so
  `scripts/setup-github.sh` was not syntax-checked locally. Run `bash -n` before
  executing it.
- **Dependencies:** `npm audit --omit=dev` reports **0 vulnerabilities**.
- **Secrets:** see below.

### Secrets scan after changes

| Scope | Findings |
|---|---|
| Working tree (`src`, `docs`, `scripts`, `.github`, root docs) | 0 |
| Git history, all refs (`gitleaks git --all`) | **28** |
| Public branches (`main`, `security/audit-2026-10-29`) | 0 |

All 28 remaining findings are inside `.rea-cathode/chrome-profile/**`, reachable
only from local `refs/cline/checkpoints/*` commits — never pushed. The former
false positive on the public USDT contract address is now scoped out by
`.gitleaks.toml`; a real key in the same file would still be reported.

---

## 4. Findings by severity

### Critical

1. **Real-money gambling is still implemented.** Crypto deposits, custody-style
   coin balances pegged at $1 = 100 coins, USDT/BTC/ETH/SOL/XRP deposit rails,
   USDT withdrawals with a fee, 15% house cut, IB commission desk, on-chain
   verification. This contradicts the free-to-play release rule and creates
   legal exposure in most jurisdictions. See §6.

### High

1. **Live USDT-BEP20 house address committed** in
   `src/lib/economy/__tests__/economy.test.ts:75` and
   `etherscan.test.ts:15` (on `main` since `8354e50`), and in
   `public/deposit-qr-usdt-bep20.jpg`.
2. **Captured Chrome profile** (Cookies, Login Data, Web Data, History, Local
   State) in `.rea-cathode/` and in two local checkpoint commits. 74 MB / 589
   files. Not on origin; must never be mirror-pushed.
3. **Copyrighted audio:** `public/mw3-lobby.mp3` is described in
   `src/components/terminal/sound.ts` as the official MW3 lobby asset.
4. **Third-party brand and affiliate:** EC Markets logo hotlink and an IB
   referral link in `src/app/play/page.tsx` (line ~2339).
5. **Open database authorization holes:** `player_balances` is world-readable
   and world-writable (`supabase/setup.sql:261-266`, PD-003);
   `player_friends` is world-writable (PD-004).
6. **The security audit is already on `origin/main`.** It documents PD-003,
   PD-004, PD-006 and the money RPCs. Publishing the repository publishes the
   exploit notes.

### Medium

1. Local `.env` / `.env.local` contain a Supabase service-role JWT, the anon JWT,
   an Etherscan key and the live deposit address. Ignored by git, never
   committed; keep them out of archives.
2. Etherscan key is unused by the application; revoke it.
3. Asset provenance unknown for `lobby-arena-bg.jpg/.webp`,
   `match-ticket-bg.avif`, `coin.png`, `default-avatar.png`, `favicon.ico`.
4. Admin console and legal pages still describe deposits, KYC and gambling.
5. `src/middleware.ts` is a no-op; `/admin` is client-guarded only (PD-008).
6. The admin console ships in the public tree; hiding it is not security, but it
   widens the attack surface.

### Low

1. Invite text displays a hardcoded `pipduel.com` instead of the real origin
   (`friends-panel.tsx:622`).
2. `LeaderboardTab` exists but is not routed; the footer `/leaderboard` link 404s.
3. "tv" attribution badge is text-only and must not imply TradingView
   endorsement.
4. `AGENTS.md` (agent instructions) ships in the repo.
5. 51 ESLint warnings remain (unused vars, `<img>` usage, compiler advisories).
6. `SECURITY_AUDIT_REPORT.md` and `AGENTS.md` are root-level clutter for a public
   repo; consider moving the former to the private repo.

---

## 5. Keys and credentials

| Credential | Status | Action |
|---|---|---|
| Etherscan API key | Local `.env:21`, `.env.local:19`; unused by code | **Revoke** |
| USDT-BEP20 house deposit address | Tests + QR + local env | **Retire and replace**; treat as public forever |
| Supabase **service-role** key | Local `.env:4`, `.env.local:4`; not in git | **Rotate if** the file or the captured Chrome profile ever left the machine. The app does not use it |
| Supabase **anon** key | Local env; public by design | Not a secret; rotate only to invalidate sessions |
| Accounts logged into the captured Chrome profile | Local `.rea-cathode/` | Sign out everywhere / rotate |
| Any API keys in the money modules | None found in code; chain reads use public RPC | — |

**No API key, JWT, private key or bearer token was found in public git history.**
Only `.env.example` (placeholders) was ever committed.

---

## 6. Removal list (not executed)

Flagged, not deleted. Full detail in [OSS_AUDIT.md](OSS_AUDIT.md) §8.

| ID | Area |
|---|---|
| RM-01 | Coin peg, USD packs, withdrawal fee, house cut, payout rails (`src/lib/economy/config.ts`) |
| RM-02 | Deposit flow and store (`economy/deposit*.ts`, `wallet/deposit-form.tsx`) |
| RM-03 | Withdrawal flow and store (`economy/withdraw*.ts`, `wallet/withdraw-form.tsx`) |
| RM-04 | On-chain verification (`economy/etherscan.ts`, `/api/chain/tx`, `onchain-check.tsx`) |
| RM-05 | Admin money desks (`/admin/deposits`, `/admin/withdrawals`, `/admin/ledger`) |
| RM-06 | Wallet RPC wrappers, referrals/IB, `transferDeskToWallet` |
| RM-07 | Money SQL migrations + `setup.sql` money sections (`crypto_*`, `wallet_ledger`, `ib_*`) |
| RM-08 | `public/deposit-qr-usdt-bep20.jpg` |
| RM-09 | Deposit env vars in `.env.example` (already removed from the template) and local `.env` |
| RM-10 | AML/KYC, responsible-trading, money claims in legal pages and README |
| RM-11 | Live stake charging / pot payout in `src/app/play/page.tsx`, `economy/stakes.ts` |
| RM-12 | Money details in `SECURITY_AUDIT_REPORT.md` |

Keep the virtual ticket split, fees in coins, bots, ranks and progression once
coins cannot be bought or cashed out.

---

## 7. `TODO_REPLACE_ME` placeholders

| Placeholder | Files | Fill with |
|---|---|---|
| `TODO_REPLACE_ME_MAINTAINER_NAME` | `docs/OSS_AUDIT.md` | Your name / handle |
| `TODO_REPLACE_ME_MAINTAINER_EMAIL` | `README.md`, `TRADEMARK.md` | Public contact email |
| `TODO_REPLACE_ME_SECURITY_EMAIL` | `SECURITY.md` | Private security inbox |
| `TODO_REPLACE_ME_GITHUB_OWNER` | `.github/CODEOWNERS`, `.github/ISSUE_TEMPLATE/config.yml`, `scripts/setup-github.sh` | GitHub user/org handle |
| `TODO_REPLACE_ME_REPO` | `.github/ISSUE_TEMPLATE/config.yml`, `scripts/setup-github.sh` | Repository name |
| `TODO_REPLACE_ME_GITHUB_REPO_URL` | `README.md`, `CONTRIBUTING.md`, `SECURITY.md` | Full HTTPS clone URL |
| `TODO_REPLACE_ME_DOMAIN` | `docs/OSS_AUDIT.md` | Public domain (currently `pipduel.com` in code) |
| `TODO_REPLACE_ME_DISCUSSIONS_URL` | `README.md`, `.github/ISSUE_TEMPLATE/config.yml` | GitHub Discussions URL |
| `TODO_REPLACE_ME_TELEGRAM_URL` | `README.md`, `.github/ISSUE_TEMPLATE/config.yml` | Community invite (currently `t.me/forexwala`) |
| `TODO_REPLACE_ME_COC_CONTACT` | `CODE_OF_CONDUCT.md:40` | CoC enforcement contact |
| `TODO_REPLACE_ME_TRADEMARK_OWNER` | `TRADEMARK.md` | Legal owner of the mark |
| `TODO_REPLACE_ME_lobby/terminal/result` | `README.md` screenshot table | Screenshot file names under `docs/assets/` |

---

## 8. Manual steps, in order

1. **Rotate / revoke.**
   - Revoke the Etherscan key.
   - Stop using the current USDT-BEP20 deposit wallet; create a new address only
     if the paid product continues privately.
   - Rotate the Supabase service-role key if `.env*` or the captured Chrome
     profile ever left your machine.
   - Sign out accounts used in the captured Chrome profile.
2. **Decide history cleanup.** No API key/JWT is in public history, so a rewrite
   is not required for credentials. It *is* the only way to remove the committed
   house address (tests + QR). If you choose to:
   - back up the repo (including all refs),
   - `git filter-repo --path public/deposit-qr-usdt-bep20.jpg --invert-paths`,
   - replace the address in the two test files before rewriting, or use
     `--replace-text`,
   - force-push and tell every collaborator to re-clone.
   This is destructive; it has **not** been run.
3. **Prune local evidence (destructive, local only).** After a backup:
   `git update-ref -d refs/cline/checkpoints/1793291227023_i75dx/1`,
   the same for `/2`, then `git reflog expire --expire=now --all` and
   `git gc --prune=now`. Delete `.rea-cathode/`. Do this before any
   `git push --mirror`.
4. **Remove or move the real-money stack** (RM-01…RM-12) and replace the test
   addresses with dummies. If you keep the paid product, create a private
   `pipduel-server` repository and move the wallet, chain, admin money desks and
   money SQL there, then strip them from the public tree.
5. **Remove the third-party assets:** `mw3-lobby.mp3`, the EC Markets banner and
   referral link; replace or license the lobby/ticket art.
6. **Fix or explicitly accept PD-003/PD-004**, and decide whether
   `SECURITY_AUDIT_REPORT.md` ships. Recommended: keep it private until those
   are closed.
7. **Fill the placeholders** in §7.
8. **Run the GitHub setup.** Edit `OWNER`/`REPO` in
   `scripts/setup-github.sh`, review it, then run it. It creates labels and the
   12 starter issues and prints the branch-protection command.
9. **Push the branch and open a PR.** CI must be green: lint, typecheck, tests,
   build, DCO and gitleaks. Merge only after review.
10. **Enable branch protection** with the printed `gh api` command. Confirm the
    check names (`quality`, `DCO sign-off`, `gitleaks`) on the first PR.
11. **Make the repository public** only after §11 passes.
12. **Announce** with the Discussions link and the roadmap.

---

## 9. CI notes

- **Workflows:** `ci.yml` (Node 22, `npm ci`, lint, typecheck, test, build),
  `dco.yml` (Signed-off-by on every non-merge commit), `secret-scan.yml`
  (gitleaks action), `dependabot.yml` (npm + actions, weekly).
- `ci.yml` uses placeholder Supabase env values; the app treats them as “no
  backend”, so the build needs no secrets.
- The DCO check is the enforcement mechanism. GitHub's “require signed commits”
  is GPG signing, not DCO.
- `gitleaks-action@v2` is free for personal accounts; an organization-owned repo
  needs a `GITLEAKS_LICENSE` secret (commented in the workflow).
- No Playwright specs exist yet, so CI does not run e2e. Adding the first spec
  is a listed starter issue.
- Local lint still reports 51 warnings (0 errors). CI does not fail on warnings.

---

## 10. Commit authorship

The local git `user.name` is unset, so commits were made with a one-off identity,
**Pip Duel Maintainers**, using the email already configured in git. All commits
are signed off (`git commit -s`). Before pushing:

```bash
git config user.name "Your Name"
# Re-author only this branch's commits, not the published base history.
git rebase --exec 'git commit --amend --reset-author --no-edit' 98e985e
```

`98e985e` is the branch point. Do **not** use `--root`: that would rewrite the
published history and force a coordinated force-push.

---

## 11. Go / no-go

**No-go today.** The repository can be published the day these are true:

- [ ] Money modules, money SQL, deposit UI, chain verification, QR asset and
      house addresses are removed from the public tree (or moved private).
- [ ] The two test files use dummy addresses.
- [ ] `mw3-lobby.mp3` and the EC Markets banner/referral link are gone; the
      remaining art is original or licensed.
- [ ] PD-003 and PD-004 are fixed or accepted in writing; PD-008 is understood.
- [ ] `.rea-cathode/` is deleted and local checkpoint refs are pruned; a final
      `gitleaks git --all` shows only known, accepted findings.
- [ ] All placeholders are filled; `scripts/setup-github.sh` has been reviewed
      and run; branch protection is on.
- [ ] A clean clone passes lint, typecheck, tests and build; the first PR is
      green on CI.
- [ ] Legal review of the free-to-play claim (no cash value, no payouts).

Until then, keep the repository private and do not deploy this snapshot as a
money service.

---

## 12. Limitations

- No production Supabase access: RLS findings are static-review only.
- Asset provenance cannot be verified without the owner; unknown-origin assets
  are flagged, not cleared.
- The captured Chrome profile was not opened; its sensitivity is based on file
  names and size.
- `setup-github.sh` was not executed and `bash` was unavailable for a local
  syntax check.
- The theme commit contains pre-existing uncommitted UI edits from before this
  task; authorship is preserved as one maintainer commit.

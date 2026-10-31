# Contributing to Pip Duel

Thanks for helping. This project is a free-to-play game; the public scope is
virtual currency only. Read the [Code of Conduct](CODE_OF_CONDUCT.md) and
[SECURITY.md](SECURITY.md) before you start.

## Local setup

```bash
git clone TODO_REPLACE_ME_GITHUB_REPO_URL pip-duel
cd pip-duel
npm install
cp .env.example .env.local
npm run dev
```

Open <http://localhost:3000>. Guest play, Practice vs Bot and the terminal work
without Supabase. Sign-in, friends, mail, the global leaderboard and real 1v1
matchmaking need a Supabase project with `supabase/setup.sql` applied (see
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)).

Requirements: Node.js **20.9+** (22 LTS recommended), npm.

## Checks before you open a PR

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

All four must pass. CI runs the same set on Node 22.

## Branches

`main` is protected. Work on a branch from `main`:

```text
feat/<short-slug>        new player-facing behaviour
fix/<short-slug>         bug fix
docs/<short-slug>        documentation only
test/<short-slug>        tests only
refactor/<short-slug>    no behaviour change
chore/<short-slug>       tooling, deps, housekeeping
```

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/):

```text
feat(lobby): keep private tables visible until a rival sits
fix(engine): clamp stop-loss to the next tick
docs: describe the realtime channels
test(challenges): cover stake + duration pairing
chore(deps): bump lucide-react
```

Rules:

- One logical change per commit; keep unrelated formatting out.
- Reference an issue when one exists (`Closes #123`).
- **Sign off every commit** with the Developer Certificate of Origin:

  ```bash
  git commit -s -m "fix(engine): clamp stop-loss to the next tick"
  ```

  The sign-off certifies you wrote the change or have the right to submit it.
  There is no CLA. A PR with unsigned commits fails the `DCO` check (the workflow
  explains how to fix it with `git rebase --signoff`).

## Pull request checklist

- [ ] The change is scoped to one thing and has a clear description.
- [ ] `npm run lint`, `npm run typecheck`, `npm test` and `npm run build` pass.
- [ ] Tests cover new behaviour; bug fixes include a regression test.
- [ ] No secrets, tokens, keys, `.env` files or private URLs are added.
- [ ] No third-party assets without a recorded licence (art, audio, fonts, code).
- [ ] No real-money feature: no deposits, withdrawals, cash-outs, crypto rails,
      paid entry, house cut or affiliate payouts.
- [ ] No scraped or redistributed market data; the synthetic generator is the
      only price source.
- [ ] Every commit is signed off (`git commit -s`).
- [ ] Docs updated when behaviour, config or routes change.
- [ ] UI changes respect `prefers-reduced-motion` and keyboard navigation.

## Picking a starter issue

The curated list is [docs/GOOD_FIRST_ISSUES.md](docs/GOOD_FIRST_ISSUES.md).
Look for `good first issue` and `help wanted` labels. Comment on the issue before
starting so two people do not take the same one.

## Code style

- TypeScript strict mode; no `any` unless a third-party type forces it, and then
  narrow it immediately.
- Match the surrounding code: the project uses a mono typeface, token-based
  colours (`var(--term-*)`, `var(--accent)`), and square corners for panels.
- Comments explain *why* a decision was made, not what the line does.
- Prefer the existing helpers in `src/lib/` over new abstractions.

## Database changes

`supabase/setup.sql` is the single source of truth for a fresh local database,
and `supabase/migrations/` carries incremental changes.

- Every new table: `enable row level security` and a policy that names
  `auth.uid()`. `using (true)` is only for genuinely public catalogues.
- Never let a client write a number that a score or a ranking reads.
- New `SECURITY DEFINER` function: `set search_path = public, pg_temp`,
  `revoke all from public`, `grant execute` to the smallest role that needs it,
  and an authority check as the first statement.
- Add a SQL test under `supabase/tests/` and run it against a staging project.

## What we will not accept

- Real-money features of any kind: deposits, withdrawals, cash-outs, crypto or
  fiat rails, staking, paid entry with withdrawable value, affiliate payouts.
- Copied third-party assets: game audio, broker logos, screenshots, fonts or
  code without a compatible licence and attribution.
- Scraped, purchased or redistributed market data, or vendor API keys.
- Secrets in any file, including tests and docs.
- Drive-by refactors that mix formatting with behaviour.
- Changes that hide security problems instead of fixing them.

## Reporting security issues

Do **not** open a public issue. Follow [SECURITY.md](SECURITY.md).

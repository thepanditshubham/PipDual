# Good first issues

Twelve scoped starter tasks, derived from the code in this repository. Each one
has a clear file list and a testable definition of done. Comment on the issue
before starting; first come, first served.

Labels: `good first issue` for a first contribution, `help wanted` for a larger
task that still has a narrow scope.

---

## 1. Use the real origin in the invite-link display

**Label:** `good first issue` · **Difficulty:** easy · **Files:**
`src/components/lobby/friends-panel.tsx` (around line 622)

**Problem:** The copy button copies `${window.location.origin}/play/<code>`, but
the text beside it is hardcoded to `pipduel.com/play/<code>`. On localhost or a
self-hosted deployment the two disagree.

**Acceptance criteria**

- The displayed URL uses the same origin as the copied URL.
- Works during server render without a hydration mismatch (read the origin in an
  effect or guard with `typeof window`).
- No new dependency.

---

## 2. Add a gitleaks allowlist for the USDT contract address

**Label:** `good first issue` · **Difficulty:** easy · **Files:** new
`.gitleaks.toml`, `.github/workflows/secret-scan.yml`

**Problem:** `src/lib/economy/etherscan.ts:44` contains the public BSC USDT
contract address. Gitleaks reports it as a `generic-api-key` false positive,
which hides real findings.

**Acceptance criteria**

- A `.gitleaks.toml` extends the default rules and allowlists only that exact
  address (not the whole file, not a regex that matches any 40-hex string).
- `gitleaks dir src --redact` returns zero findings on a clean tree.
- The workflow picks the config up automatically (gitleaks reads
  `.gitleaks.toml` from the repo root).

---

## 3. Clear the unused-import lint warnings

**Label:** `good first issue` · **Difficulty:** easy · **Files:**
`src/app/history/page.tsx`, `src/app/how-to-play/page.tsx`,
`src/components/terminal/order-panel.tsx`,
`src/components/terminal/result-modal.tsx`

**Problem:** `npm run lint` reports unused imports (`Shield`, `Filter`,
`ExternalLink`, `Flame`, `Check`, `Layers`, `Swords`, `Zap`). They add noise and
hide real warnings.

**Acceptance criteria**

- The named files import only what they use.
- `npm run lint` shows no new warnings and the listed warnings are gone.
- No behaviour change; no unrelated formatting.

---

## 4. Give the chart tool strip accessible names

**Label:** `good first issue` · **Difficulty:** easy · **Files:**
`src/components/terminal/trading-chart.tsx` (the left tool strip, around lines
1057–1100)

**Problem:** The icon-only buttons have a `title` but no `aria-label`. Screen
readers announce "button" with no name.

**Acceptance criteria**

- Every icon-only button in the strip has an `aria-label` matching its tool.
- Decorative icons get `aria-hidden="true"`.
- Keyboard focus is visible (the existing `focus-visible` ring is acceptable).
- No visual change.

---

## 5. Add a clipboard fallback for the invite copy button

**Label:** `good first issue` · **Difficulty:** easy–medium · **Files:**
`src/components/lobby/friends-panel.tsx` (`copyLink`, around line 304)

**Problem:** If `navigator.clipboard` is missing (older browser, insecure
context, permission denied), the handler returns silently. The user gets no
feedback and no way to copy the link.

**Acceptance criteria**

- On failure, select the URL or show it in a temporary input so the user can copy
  it manually.
- The button reports success/failure through visible text, not only a colour.
- `navigator.clipboard` success path is unchanged.

---

## 6. Document the design tokens

**Label:** `good first issue` · **Difficulty:** easy · **Files:** new
`docs/DESIGN_TOKENS.md`; source of truth `src/app/globals.css`

**Problem:** The palette is centralised but undocumented. New contributors guess
between `--term-*`, `--ui-*`, `--fin-*` and `--accent`.

**Acceptance criteria**

- Lists the surface ladder, text ladder, accent, semantic green/red and the
  terminal tokens, with current hex values.
- Explains which namespace to use where (site chrome, terminal, lobby, auth).
- States the rule: solid amber/green fills use dark ink (`var(--term-canvas)`).
- Links to the file and mentions that the light "paper" theme is not offered.

---

## 7. Add the first Playwright smoke test

**Label:** `help wanted` · **Difficulty:** medium · **Files:** new
`e2e/smoke.spec.ts`, `playwright.config.ts`

**Problem:** `npm run test:e2e` is configured but there are no specs.

**Acceptance criteria**

- One spec that starts the dev server (or uses `webServer` in the config) and
  checks that `/` renders the hero and that `/login` shows the email field.
- Runs headless in CI with no Supabase credentials.
- `npm run test:e2e` passes locally on a clean clone.
- No screenshots committed.

---

## 8. Add the missing `/leaderboard` route

**Label:** `help wanted` · **Difficulty:** medium · **Files:** new
`src/app/leaderboard/page.tsx`, `src/components/progress/leaderboard-tab.tsx`,
`src/components/layout-shell.tsx` if the page needs the app chrome

**Problem:** The footer links to `/leaderboard`, but no route exists, so the link
404s. `LeaderboardTab` is implemented and unused.

**Acceptance criteria**

- `/leaderboard` renders `LeaderboardTab` inside the normal site shell.
- Signed-out users see a clear guest/empty state instead of an error.
- The footer link resolves; no console errors when Supabase is unconfigured.
- A page test (or the Playwright smoke suite) covers the route.

---

## 9. Stop the marketing header wrapping between 901 and 1100 px

**Label:** `help wanted` · **Difficulty:** medium · **Files:**
`src/app/globals.css` (`.lp-nav`, `.lp-nav-links`, `.lp-nav-right .lp-btn`)

**Problem:** The burger appears only below 900 px. Between 901 and roughly
1100 px the link row and the two CTAs compete for space: "Log In" wraps and
"Enter the Arena" becomes three lines.

**Acceptance criteria**

- At 901, 965, 1024, 1100 and 1440 px the header is one row, with no wrapped CTA.
- The burger breakpoint is raised or the link spacing shrinks; document the
  choice in a comment.
- No horizontal scrollbar and no overlap at any of those widths.

---

## 10. Test the challenge-board pairing rule

**Label:** `help wanted` · **Difficulty:** medium · **Files:**
`src/lib/challenges/challenge-board.ts`, new
`src/lib/challenges/__tests__/challenge-board.test.ts`

**Problem:** A duel pairs only when the stake and duration match and the
challenger is not the poster. That predicate is inline in the module and has no
test.

**Acceptance criteria**

- Extract the pure predicate into an exported function (no Supabase imports in
  the function).
- Tests cover: same stake + same duration pairs; different stake does not;
  different duration does not; own challenge is never selected; expired
  challenge is skipped.
- Existing callers use the extracted function; no behaviour change.

---

## 11. Test the private-table lifecycle

**Label:** `help wanted` · **Difficulty:** medium · **Files:**
`src/lib/tables/private-table.ts`, new
`src/lib/tables/__tests__/private-table.test.ts`

**Problem:** The private table joins a presence channel, publishes a seat, and
must leave and unsubscribe on unmount. None of that is covered.

**Acceptance criteria**

- With a mocked Supabase channel, the test asserts: one subscribe per table,
  presence is tracked, and `leave()` removes the channel exactly once.
- A second `leave()` call does not throw.
- No network calls in the test.

---

## 12. Rename or implement the history "Replay" action

**Label:** `help wanted` · **Difficulty:** medium · **Files:**
`src/app/history/page.tsx` (around line 170), optionally
`src/lib/engine/live-market.ts`

**Problem:** The "Replay" link opens a fresh bot room
(`/play/<room>?mode=...&opponent=bot`). It does not replay the recorded chart,
so the label is misleading.

**Acceptance criteria**

- Either (a) rename the action and its icon to make clear it starts a new bot
  match, with a tooltip, or (b) implement a true replay that re-derives the
  recorded window from the stored start time and seed.
- Whichever path is chosen, the roadmap entry is updated.
- A test or a clear manual verification note is added to the PR.

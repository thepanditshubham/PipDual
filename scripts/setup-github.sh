#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# REVIEW BEFORE RUNNING.
#
# This script creates labels and the 12 starter issues on an existing GitHub
# repository, then PRINTS the branch-protection commands. It does not push
# code, change repository visibility, delete anything or run the protection
# commands itself.
#
# Requirements:
#   - gh CLI installed and authenticated:  gh auth login
#   - admin permission on the repository
#   - OWNER and REPO below edited to real values
#
# Running it twice creates duplicate issues. Labels are updated in place.
# ---------------------------------------------------------------------------

set -euo pipefail

OWNER="TODO_REPLACE_ME_GITHUB_OWNER"
REPO="TODO_REPLACE_ME_REPO"
REPO_SLUG="$OWNER/$REPO"

if [[ "$OWNER" == TODO_* || "$REPO" == TODO_* ]]; then
  echo "Edit OWNER and REPO at the top of this script before running it." >&2
  exit 1
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "gh CLI is not installed: https://cli.github.com/" >&2
  exit 1
fi

echo "Checking access to $REPO_SLUG ..."
gh repo view "$REPO_SLUG" --json nameWithOwner --jq '.nameWithOwner' >/dev/null

# --- Labels ---------------------------------------------------------------
while IFS='|' read -r name color description; do
  [[ -z "$name" ]] && continue
  gh label create "$name" \
    --repo "$REPO_SLUG" \
    --color "$color" \
    --description "$description" \
    --force
done <<'LABELS'
good first issue|7057ff|Scoped for a first contribution
help wanted|008672|Extra attention or a maintainer would welcome help
bug|d73a4a|Something is not working
enhancement|a2eeef|New feature or request
docs|0075ca|Documentation only
security|b60205|Security-sensitive work; do not discuss exploits publicly
needs-triage|fbca04|Awaiting maintainer triage
LABELS

# --- Issues ---------------------------------------------------------------
# Bodies stay short on purpose; the full scope is in docs/GOOD_FIRST_ISSUES.md.

gh issue create --repo "$REPO_SLUG" \
  --title "Use the real origin in the invite-link display" \
  --label "good first issue" \
  --body "The copy button copies the real origin, but the text beside it is hardcoded to pipduel.com. See docs/GOOD_FIRST_ISSUES.md #1.

Files: src/components/lobby/friends-panel.tsx
Acceptance: displayed and copied URLs match; no hydration mismatch."

gh issue create --repo "$REPO_SLUG" \
  --title "Add a gitleaks allowlist for the USDT contract address" \
  --label "good first issue,security" \
  --body "The public BSC USDT contract address trips the generic-api-key rule. See docs/GOOD_FIRST_ISSUES.md #2.

Files: .gitleaks.toml, .github/workflows/secret-scan.yml
Acceptance: only that exact address is allowlisted; gitleaks is clean on src."

gh issue create --repo "$REPO_SLUG" \
  --title "Clear the unused-import lint warnings" \
  --label "good first issue" \
  --body "Remove unused imports in history, how-to-play, order-panel and result-modal. See docs/GOOD_FIRST_ISSUES.md #3.

Acceptance: the listed warnings are gone; no behaviour change."

gh issue create --repo "$REPO_SLUG" \
  --title "Give the chart tool strip accessible names" \
  --label "good first issue" \
  --body "The icon-only chart tool buttons have a title but no aria-label. See docs/GOOD_FIRST_ISSUES.md #4.

Files: src/components/terminal/trading-chart.tsx
Acceptance: every icon button has a name; decorative icons are aria-hidden."

gh issue create --repo "$REPO_SLUG" \
  --title "Add a clipboard fallback for the invite copy button" \
  --label "good first issue" \
  --body "When navigator.clipboard is unavailable the handler returns silently. See docs/GOOD_FIRST_ISSUES.md #5.

Files: src/components/lobby/friends-panel.tsx
Acceptance: visible success/failure; manual copy path when the API is missing."

gh issue create --repo "$REPO_SLUG" \
  --title "Document the design tokens" \
  --label "good first issue,docs" \
  --body "Write docs/DESIGN_TOKENS.md from src/app/globals.css. See docs/GOOD_FIRST_ISSUES.md #6.

Acceptance: surface/text/accent/semantic ladders, namespace guidance, amber+dark-ink rule."

gh issue create --repo "$REPO_SLUG" \
  --title "Add the first Playwright smoke test" \
  --label "help wanted" \
  --body "The e2e runner is configured but there are no specs. See docs/GOOD_FIRST_ISSUES.md #7.

Files: e2e/smoke.spec.ts, playwright.config.ts
Acceptance: landing and login checks pass headless with no Supabase credentials."

gh issue create --repo "$REPO_SLUG" \
  --title "Add the missing /leaderboard route" \
  --label "help wanted" \
  --body "The footer links to /leaderboard, which 404s; LeaderboardTab is unused. See docs/GOOD_FIRST_ISSUES.md #8.

Acceptance: route renders the tab in the site shell; guest state is handled."

gh issue create --repo "$REPO_SLUG" \
  --title "Stop the marketing header wrapping between 901 and 1100 px" \
  --label "help wanted" \
  --body "The burger appears only below 900 px, so the CTA wraps in between. See docs/GOOD_FIRST_ISSUES.md #9.

Files: src/app/globals.css
Acceptance: one row at 901/965/1024/1100/1440 px; no overlap or scrollbar."

gh issue create --repo "$REPO_SLUG" \
  --title "Test the challenge-board pairing rule" \
  --label "help wanted" \
  --body "Extract the pure pairing predicate and cover stake, duration, own challenge and expiry. See docs/GOOD_FIRST_ISSUES.md #10.

Files: src/lib/challenges/challenge-board.ts plus a new test file."

gh issue create --repo "$REPO_SLUG" \
  --title "Test the private-table lifecycle" \
  --label "help wanted" \
  --body "Cover subscribe, presence and idempotent leave with a mocked channel. See docs/GOOD_FIRST_ISSUES.md #11.

Files: src/lib/tables/private-table.ts plus a new test file."

gh issue create --repo "$REPO_SLUG" \
  --title "Rename or implement the history Replay action" \
  --label "help wanted" \
  --body "The Replay link starts a fresh bot room; it does not replay the chart. See docs/GOOD_FIRST_ISSUES.md #12.

Acceptance: rename with a tooltip, or implement a true replay; update the roadmap."

# --- Branch protection (printed, not executed) ----------------------------
cat <<EOF

Labels and issues are done.

Branch protection is NOT enabled. Review the JSON below, confirm the check
names after the first CI run (Settings -> Branches), then run it manually:

gh api -X PUT "repos/$REPO_SLUG/branches/main/protection" \\
  -H "Accept: application/vnd.github+json" \\
  --input - <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["quality", "DCO sign-off", "gitleaks"]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": true,
    "required_approving_review_count": 1
  },
  "restrictions": null,
  "required_linear_history": false,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_conversation_resolution": true
}
JSON

Notes:
- DCO is enforced by the DCO workflow as the "DCO sign-off" check. GitHub's
  "require signed commits" setting is GPG signing, which is a different thing.
- If your check names differ, copy them from the first PR's Checks tab.
- After protection is on, enable "Require a pull request before merging" for
  admins too (enforce_admins above), and keep force-push disabled.
EOF

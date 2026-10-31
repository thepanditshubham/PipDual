# Security policy

## Supported versions

Pip Duel is pre-1.0. Security fixes land on `main` and are released as a new
commit/tag; only the latest `main` is supported.

## Reporting a vulnerability

**Do not open a public issue, discussion or PR for a security problem.**

Use one of these private channels:

1. **GitHub Security Advisories** (preferred):
   `TODO_REPLACE_ME_GITHUB_REPO_URL/security/advisories/new`
2. **Email:** `TODO_REPLACE_ME_SECURITY_EMAIL`

Include:

- a short description and the affected area (client, engine, Supabase RLS, API);
- reproduction steps or a proof of concept;
- the impact you believe it has;
- the commit or version you tested;
- whether you want public credit.

Do not include real credentials, other people's data, or a working exploit
against a live deployment in the first message.

## What is in scope

- Application code in this repository (`src/`, `supabase/`, `scripts/`).
- Authentication and authorization mistakes, especially Supabase RLS policies
  and `SECURITY DEFINER` functions.
- Client/server trust mistakes: anything the browser can write that the server
  treats as authoritative.
- Deterministic-engine or scoring flaws that let a player fake a result.
- Secret exposure in the repository or its history.
- Dependency vulnerabilities that are exploitable in this app.

## Out of scope

- Vulnerabilities in Supabase, Next.js or another dependency that are already
  reported upstream and have no app-specific exploit.
- Missing hardening with no demonstrated impact (for example, a header that is
  merely absent).
- Denial of service by raw traffic volume, spam or resource exhaustion.
- Social engineering, phishing, and physical attacks.
- Reports from automated scanners without a reproducible impact.

## Response timeline

| Stage | Target |
|---|---|
| Acknowledgement | 48 hours |
| Initial triage and severity | 5 business days |
| Fix or mitigation plan | 30 days for High/Critical, next release for others |
| Coordinated disclosure | 90 days after the report, or earlier by agreement |

If a fix takes longer, we will say so and agree on a disclosure date. We will
credit reporters in the advisory unless you ask us not to. There is no bug
bounty.

## Safe harbour

We will not pursue legal action for good-faith research that stays within this
scope, avoids privacy violations, avoids degrading the service, and gives us a
reasonable window to fix the issue before disclosure.

## Before you deploy

This snapshot is being prepared for a public release. Do not deploy it as a
money service. See [docs/OSS_RELEASE_REPORT.md](docs/OSS_RELEASE_REPORT.md) for
open security items and [docs/OSS_AUDIT.md](docs/OSS_AUDIT.md) for the audit.

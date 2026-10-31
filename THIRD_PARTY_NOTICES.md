# Third-party notices

Pip Duel is licensed under AGPL-3.0-only. The packages and assets below carry
their own licences. This file lists the notices that matter for redistribution;
the complete licence text for every npm package is shipped in its
`node_modules/<package>/` directory and can be regenerated with
`npx license-checker --production`.

## Direct dependencies

| Package | Licence | Copyright / notice |
|---|---|---|
| `next` | MIT | © Vercel, Inc. |
| `react`, `react-dom` | MIT | © Meta Platforms, Inc. and affiliates |
| `@supabase/supabase-js`, `@supabase/ssr` | MIT | © Supabase, Inc. |
| `zustand` | MIT | © Paul Henschel and contributors |
| `lightweight-charts` | Apache-2.0 | © TradingView, Inc. Attribution is shown in the terminal ("tv" badge). This project is not affiliated with or endorsed by TradingView |
| `lucide-react` | ISC | © Lucide contributors |
| `react-hook-form` | MIT | © Beier Luo |
| `@hookform/resolvers` | MIT | © react-hook-form contributors |
| `zod` | MIT | © Colin McDonnell |
| `next-intl` | MIT | © Jan Amann |

## Transitive dependencies that need attribution

| Package | Licence | Notice |
|---|---|---|
| `@img/sharp-*` (libvips) | Apache-2.0 AND LGPL-3.0-or-later | The prebuilt binary is dynamically loaded by Next.js. LGPL-3.0 permits use with AGPL-3.0; the library's own notice and source offer must be preserved. See <https://github.com/lovell/sharp> and <https://www.libvips.org/> |
| `@swc/core-*` | Apache-2.0 AND MIT | © SWC contributors |
| `caniuse-lite` | CC-BY-4.0 | Browser support data, © Browserlist contributors. Attribution required; see <https://github.com/browserslist/caniuse-lite> |

## Fonts

- **IBM Plex Mono**, © IBM, licensed under the SIL Open Font License 1.1.
  Loaded through `next/font/google` and self-hosted at build time.

## Assets

- UI icons: `lucide-react` (ISC), see above.
- The synthetic market generator and all sample candles are original to this
  project and covered by AGPL-3.0-only.
- The app icon (`src/app/icon.svg`) and the fallback avatar (inline SVG in
  `src/lib/auth/avatar.ts`) are original to this project.
- `public/` ships no third-party art or audio. Any asset added later must have its
  licence and source recorded here before it is merged.

## Security audit of licences

`npm audit --omit=dev` reports 0 vulnerabilities for the production lockfile at
the time of this notice. Re-run it before a release.

#!/usr/bin/env node
/**
 * seed-sample-data.mjs
 *
 * Generates a small, deterministic OHLCV sample so a contributor can demo the
 * UI, write a test fixture or record a screenshot without any paid price feed.
 *
 * This is NOT the game's market engine. The canonical generator lives in
 * `src/lib/engine/synthetic-market.ts` and runs in the browser; this script is a
 * standalone, dependency-free approximation with the same shape (1-minute bars,
 * session volatility, occasional regime changes).
 *
 * The output is synthetic and is not market data. Do not present it as such.
 *
 * Usage:
 *   node scripts/seed-sample-data.mjs
 *   node scripts/seed-sample-data.mjs --bars 200 --out /tmp/sample.json
 *   node scripts/seed-sample-data.mjs --seed 42 --pairs XAU/USD,EUR/USD
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const DEFAULTS = {
  bars: 500,
  seed: 20260105,
  out: 'data/sample-candles.json',
  pairs: ['XAU/USD', 'EUR/USD', 'BTC/USD'],
};

const PAIR_SPECS = {
  'XAU/USD': { base: 2350, decimals: 2, volatility: 0.0009 },
  'EUR/USD': { base: 1.085, decimals: 5, volatility: 0.0004 },
  'XTI/USD': { base: 78.4, decimals: 2, volatility: 0.0012 },
  'BTC/USD': { base: 64000, decimals: 1, volatility: 0.0021 },
  'US30': { base: 39200, decimals: 1, volatility: 0.0008 },
};

const START_ISO = '2026-01-05T00:00:00.000Z';

function parseArgs(argv) {
  const args = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === '--bars' && value) {
      args.bars = Number.parseInt(value, 10);
      i += 1;
    } else if (flag === '--seed' && value) {
      args.seed = Number.parseInt(value, 10);
      i += 1;
    } else if (flag === '--out' && value) {
      args.out = value;
      i += 1;
    } else if (flag === '--pairs' && value) {
      args.pairs = value.split(',').map((pair) => pair.trim()).filter(Boolean);
      i += 1;
    } else if (flag === '--help' || flag === '-h') {
      console.log('Usage: node scripts/seed-sample-data.mjs [--bars N] [--seed N] [--out FILE] [--pairs A,B]');
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${flag}`);
      process.exit(2);
    }
  }

  if (!Number.isFinite(args.bars) || args.bars < 10 || args.bars > 20000) {
    console.error('--bars must be an integer between 10 and 20000');
    process.exit(2);
  }
  if (!Number.isFinite(args.seed)) {
    console.error('--seed must be an integer');
    process.exit(2);
  }
  for (const pair of args.pairs) {
    if (!PAIR_SPECS[pair]) {
      console.error(`Unknown pair "${pair}". Known: ${Object.keys(PAIR_SPECS).join(', ')}`);
      process.exit(2);
    }
  }

  return args;
}

/** Mulberry32 — small, fast, deterministic. Same family the engine uses. */
function mulberry32(seed) {
  let state = seed >>> 0;
  return function random() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function round(value, decimals) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function generatePair(pair, spec, bars, seed) {
  const random = mulberry32(seed);
  const candles = [];
  const start = Date.parse(START_ISO);
  let price = spec.base;
  let drift = 0;
  let volatility = spec.volatility;

  for (let i = 0; i < bars; i += 1) {
    // A regime shift every 40–70 bars: new drift and volatility, still seeded.
    if (i === 0 || (i % Math.round(40 + random() * 30) === 0)) {
      drift = (random() - 0.5) * spec.volatility * 0.6;
      volatility = spec.volatility * (0.6 + random() * 1.2);
    }

    const open = price;
    // Three small shocks per bar read more like a market than one Gaussian step.
    const shock =
      (random() - 0.5) * volatility +
      (random() - 0.5) * volatility +
      (random() - 0.5) * volatility;
    const close = Math.max(spec.base * 0.2, open * (1 + drift + shock));
    const wick = volatility * (0.3 + random() * 1.1);
    const high = Math.max(open, close) * (1 + wick);
    const low = Math.min(open, close) * (1 - wick);
    const volume = Math.round(200 + random() * 1800);

    candles.push({
      t: new Date(start + i * 60_000).toISOString(),
      o: round(open, spec.decimals),
      h: round(high, spec.decimals),
      l: round(low, spec.decimals),
      c: round(close, spec.decimals),
      v: volume,
    });

    price = close;
  }

  return {
    symbol: pair,
    decimals: spec.decimals,
    candles,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const pairs = args.pairs.map((pair, index) => generatePair(pair, PAIR_SPECS[pair], args.bars, args.seed + index * 7919));

  const payload = {
    meta: {
      generator: 'scripts/seed-sample-data.mjs',
      synthetic: true,
      notMarketData: true,
      license: 'AGPL-3.0-only',
      seed: args.seed,
      bars: args.bars,
      timeframe: '1m',
      start: START_ISO,
      note: 'Deterministic synthetic candles for demos and tests. Not real market data.',
    },
    pairs,
  };

  const outPath = resolve(process.cwd(), args.out);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  const total = pairs.reduce((sum, pair) => sum + pair.candles.length, 0);
  console.log(`Wrote ${total} synthetic candles across ${pairs.length} pair(s) to ${outPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

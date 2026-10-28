import { NextResponse } from 'next/server';
import { z } from 'zod';
import { MAX_ACTION_TICK, ALLOWED_SIZES, MAX_ACTIONS, battleStartFor } from '@/lib/engine/constants';
import { generateBattleMarket } from '@/lib/engine/market-feed';
import { simulate, score } from '@/lib/engine/simulate';
import { ActionSchema } from '@/lib/engine/types';

const SubmitMatchSchema = z.object({
  room: z.string().min(3).max(16),
  /**
   * The ticket's shared start time, in epoch ms. Both terminals hold the same value,
   * and the market window is derived from it — so this is what tells the server which
   * chart the players actually traded. The seed no longer picks a market.
   */
  startAt: z.number().int().positive(),
  seed: z.number().int().optional(),
  mode: z.enum(['standard', 'risk']),
  actions: z.array(ActionSchema).max(MAX_ACTIONS),
});

/**
 * How far from server time a submitted match may be anchored. This bounds how far a
 * doctored `startAt` can reach, but it cannot remove the reach: the series is computable
 * from its formula alone, so a prepared player can study any window that already exists.
 * Closing that needs an anchor the server issues and the client never chooses.
 */
const MAX_ANCHOR_SKEW_MS = 24 * 60 * 60 * 1000;

// Simple in-memory rate limiter (per IP or token)
const rateLimitMap = new Map<string, { count: number; lastReset: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip) || { count: 0, lastReset: now };

  if (now - entry.lastReset > 60000) {
    entry.count = 0;
    entry.lastReset = now;
  }

  entry.count += 1;
  rateLimitMap.set(ip, entry);

  return entry.count > 30; // Max 30 submissions per minute
}

export async function POST(request: Request) {
  try {
    const ip = request.headers.get('x-forwarded-for') || '127.0.0.1';

    if (isRateLimited(ip)) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please wait a moment.' },
        { status: 429 }
      );
    }

    const body = await request.json();
    const parsed = SubmitMatchSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid submission payload', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { room, startAt, seed, mode, actions } = parsed.data;

    // A match may only be anchored near the present; the window itself is public.
    if (Math.abs(Date.now() - startAt) > MAX_ANCHOR_SKEW_MS) {
      return NextResponse.json(
        { error: 'Match start time is too far from server time' },
        { status: 400 }
      );
    }

    // Additional strict validation per engine spec:
    // Reject actions with t outside the battle, non-integer sizes, or sizes not in allowed set
    for (const act of actions) {
      if (act.t < 0 || act.t > MAX_ACTION_TICK) {
        return NextResponse.json(
          { error: `Action tick ${act.t} out of range [0, ${MAX_ACTION_TICK}]` },
          { status: 400 }
        );
      }
      if (!ALLOWED_SIZES.includes(act.size as any)) {
        return NextResponse.json(
          { error: `Disallowed lot size: ${act.size}` },
          { status: 400 }
        );
      }
    }

    // Check for suspicious speed (e.g. more than 3 actions at the exact same tick)
    const tickCounts = new Map<number, number>();
    let suspicious = false;
    for (const act of actions) {
      const cnt = (tickCounts.get(act.t) || 0) + 1;
      tickCounts.set(act.t, cnt);
      if (cnt > 2) {
        suspicious = true;
        break;
      }
    }

    // The server regenerates the exact market the clients traded: the same global
    // series, the same window, derived from the same start time. It used to call
    // makeTicks(), which is a different price series from the one on the player's
    // screen — so this route was verifying a chart nobody had played.
    const market = generateBattleMarket(battleStartFor(startAt));

    // Server re-runs the simulation independently – NEVER TRUST CLIENT SCORE
    const simResult = simulate(market.liveTicks, actions, MAX_ACTION_TICK);
    const scoreResult = score(simResult, mode);

    return NextResponse.json({
      verified: true,
      room,
      startAt,
      seed: seed ?? null,
      mode,
      instrument: market.instrument,
      marketSession: market.battleSessionLabel,
      score: scoreResult.score,
      pnl: scoreResult.pnl,
      maxDrawdown: scoreResult.maxDrawdown,
      tradeCount: scoreResult.tradeCount,
      flagged: suspicious,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Match verification error:', error);
    return NextResponse.json(
      { error: 'Internal server error verifying match result' },
      { status: 500 }
    );
  }
}

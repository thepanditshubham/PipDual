import { NextResponse } from 'next/server';
import { z } from 'zod';
import { TICKS, ALLOWED_SIZES, MAX_ACTIONS } from '@/lib/engine/constants';
import { makeTicks } from '@/lib/engine/market';
import { simulate, score } from '@/lib/engine/simulate';
import { ActionSchema } from '@/lib/engine/types';

const SubmitMatchSchema = z.object({
  room: z.string().min(3).max(16),
  seed: z.number().int(),
  mode: z.enum(['standard', 'risk']),
  actions: z.array(ActionSchema).max(MAX_ACTIONS),
});

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

    const { room, seed, mode, actions } = parsed.data;

    // Additional strict validation per engine spec:
    // Reject actions with t outside [0, TICKS-2], non-integer sizes, or sizes not in allowed set
    for (const act of actions) {
      if (act.t < 0 || act.t > TICKS - 2) {
        return NextResponse.json(
          { error: `Action tick ${act.t} out of range [0, ${TICKS - 2}]` },
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

    // Server independently generates prices from seed
    const prices = makeTicks(seed);

    // Server re-runs the simulation independently – NEVER TRUST CLIENT SCORE
    const simResult = simulate(prices, actions);
    const scoreResult = score(simResult, mode);

    return NextResponse.json({
      verified: true,
      room,
      seed,
      mode,
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

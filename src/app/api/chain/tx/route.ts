import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  coinsFromUnits,
  explorerFor,
  railFor,
  unitsToHouse,
  usdtFromUnits,
  type ChainCheckResult,
  type RpcLog,
} from '@/lib/economy/etherscan';

/**
 * /api/chain/tx?asset=usdt-bep20&txid=0x…
 *
 * Answers the three questions the deposit desk asks before it credits a coin:
 * did this hash happen, did the USDT land on the house address, and how much
 * was it.
 *
 * The chain is read over plain JSON-RPC, straight from a node. Etherscan's v2
 * free plan covers Ethereum mainnet only and refuses BSC outright — a public
 * node answers both, needs no key, and has no plan to upgrade.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TXID_RE = /^0x[0-9a-fA-F]{64}$/;

/** Nodes to try per rail, in order. No key, no account. */
const RPC_ENDPOINTS: Record<string, readonly string[]> = {
  'usdt-bep20': [
    'https://bsc-dataseed.binance.org',
    'https://bsc-rpc.publicnode.com',
    'https://bsc-dataseed1.bnbchain.org',
  ],
  'usdt-erc20': [
    'https://ethereum-rpc.publicnode.com',
    'https://rpc.flashbots.net',
    'https://eth.drpc.org',
  ],
};

/** Optional override, e.g. CHAIN_RPC_BEP20=https://your-own-node */
const RPC_ENV_KEYS: Record<string, string> = {
  'usdt-bep20': 'CHAIN_RPC_BEP20',
  'usdt-erc20': 'CHAIN_RPC_ERC20',
};

function endpointsFor(assetId: string): string[] {
  const envKey = RPC_ENV_KEYS[assetId];
  const override = envKey ? process.env[envKey]?.trim() : '';
  const publicUrls = RPC_ENDPOINTS[assetId] ?? [];
  return override ? [override, ...publicUrls.filter((url) => url !== override)] : [...publicUrls];
}

/** One reviewer cannot sit on a public node's patience. */
const hits = new Map<string, { count: number; reset: number }>();

function rateLimited(userId: string): boolean {
  const now = Date.now();
  const entry = hits.get(userId) ?? { count: 0, reset: now };

  if (now - entry.reset > 60_000) {
    entry.count = 0;
    entry.reset = now;
  }

  entry.count += 1;
  hits.set(userId, entry);
  return entry.count > 20;
}

type AdminCheck =
  | { ok: true; userId: string }
  | { ok: false; status: number; error: string };

async function requireAdmin(request: Request): Promise<AdminCheck> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';

  if (!url || !anon) {
    return { ok: false, status: 503, error: 'Supabase is not configured on the server.' };
  }
  if (!token) {
    return { ok: false, status: 401, error: 'Sign in as an admin to check a transaction.' };
  }

  const supabase = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    return { ok: false, status: 401, error: 'That session is no longer valid — sign in again.' };
  }

  // profiles is readable by every signed-in caller, so the caller's own token
  // is enough to learn whether this account is an admin.
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if ((profile as { role?: string } | null)?.role !== 'admin') {
    return { ok: false, status: 403, error: 'Admin access only.' };
  }

  return { ok: true, userId: user.id };
}

/** One JSON-RPC call, with the node's error text surfaced as a throw. */
async function rpc(endpoint: string, method: string, params: unknown[]): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      cache: 'no-store',
      signal: controller.signal,
    });

    if (!response.ok) throw new Error(`The node returned HTTP ${response.status}.`);

    const payload = (await response.json()) as {
      result?: unknown;
      error?: { message?: string };
    };

    if (payload.error) throw new Error(payload.error.message ?? 'The node rejected the call.');
    return payload.result;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Ask the first endpoint that answers. A dead or rate-limited public node
 * should not fail the check when the next one would have answered; a `null`
 * result is a real answer (unknown hash) and stops the walk.
 */
async function rpcFirst(assetId: string, method: string, params: unknown[]): Promise<unknown> {
  const endpoints = endpointsFor(assetId);
  let lastError: unknown = null;

  for (const endpoint of endpoints) {
    try {
      return await rpc(endpoint, method, params);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('No RPC endpoint answered.');
}

/**
 * When the block was mined. The desk shows it next to the amount so a transfer
 * from two days ago cannot pass as today's deposit. Failing to read the block
 * is not a failed check — the time is simply left out.
 */
async function blockTimeFor(assetId: string, blockNumber: string): Promise<string | null> {
  try {
    const block = (await rpcFirst(assetId, 'eth_getBlockByNumber', [blockNumber, false])) as {
      timestamp?: string;
    } | null;
    if (!block?.timestamp) return null;

    const seconds = Number.parseInt(block.timestamp, 16);
    return Number.isFinite(seconds) ? new Date(seconds * 1000).toISOString() : null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const assetId = (url.searchParams.get('asset') ?? '').trim();
  const txid = (url.searchParams.get('txid') ?? '').trim();
  const rail = railFor(assetId);

  if (!rail) {
    return NextResponse.json(
      { error: 'That rail cannot be checked automatically — verify it on its own explorer.' },
      { status: 400 },
    );
  }
  if (!TXID_RE.test(txid)) {
    return NextResponse.json({ error: 'That is not a transaction hash.' }, { status: 400 });
  }

  const admin = await requireAdmin(request);
  if (!admin.ok) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }
  if (rateLimited(admin.userId)) {
    return NextResponse.json(
      { error: 'Too many chain checks in a minute — wait a moment.' },
      { status: 429 },
    );
  }

  const house = (process.env[rail.addressEnv] ?? '').trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(house)) {
    return NextResponse.json(
      { error: `No house address is configured for ${rail.assetId}.` },
      { status: 409 },
    );
  }

  try {
    const tx = (await rpcFirst(rail.assetId, 'eth_getTransactionByHash', [txid])) as {
      blockNumber?: string | null;
      from?: string;
    } | null;

    if (!tx) {
      const missing: ChainCheckResult = {
        assetId: rail.assetId,
        chainId: rail.chainId,
        found: false,
        confirmed: false,
        blockNumber: null,
        blockTime: null,
        from: null,
        toHouse: false,
        units: null,
        usdt: null,
        coins: null,
        explorer: explorerFor(rail.chainId, txid),
      };
      return NextResponse.json(missing);
    }

    // The amount is in the receipt's Transfer log; the transaction itself
    // carries `value: 0` for a token transfer.
    const receipt = (await rpcFirst(rail.assetId, 'eth_getTransactionReceipt', [txid])) as {
      status?: string;
      blockNumber?: string | null;
      logs?: RpcLog[];
    } | null;

    const units = unitsToHouse(receipt?.logs ?? [], rail, house);
    const confirmed = receipt?.status === '0x1';
    const blockNumber = receipt?.blockNumber ?? tx.blockNumber ?? null;
    const blockTime = blockNumber ? await blockTimeFor(rail.assetId, blockNumber) : null;

    const result: ChainCheckResult = {
      assetId: rail.assetId,
      chainId: rail.chainId,
      found: true,
      confirmed,
      blockNumber: blockNumber ? Number.parseInt(blockNumber, 16) : null,
      blockTime,
      from: tx.from ?? null,
      toHouse: units > BigInt(0),
      units: units > BigInt(0) ? units.toString() : null,
      usdt: units > BigInt(0) ? usdtFromUnits(units, rail.decimals) : null,
      coins: units > BigInt(0) ? coinsFromUnits(units, rail.decimals) : null,
      explorer: explorerFor(rail.chainId, txid),
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error('[chain] check failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'The chain read failed.' },
      { status: 502 },
    );
  }
}

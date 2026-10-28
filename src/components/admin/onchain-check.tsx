'use client';

/**
 * onchain-check.tsx
 * The "did this transfer really land?" strip inside the deposit approval row.
 * It runs as soon as the row opens, so the reviewer sees the truth before
 * typing an amount: does the hash exist, is it confirmed, did the USDT reach
 * the house address, and how much was it.
 *
 * The chain is read by /api/chain/tx, which holds the Etherscan key. Nothing
 * here credits anything — it only offers the amount it found, and the reviewer
 * still confirms the approval by hand.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import { getSupabase } from '@/lib/supabase/client';
import { railFor, type ChainCheckResult } from '@/lib/economy/etherscan';
import { Pill, when } from '@/components/admin/admin-bits';

type CheckState =
  | { status: 'checking' }
  | { status: 'error'; message: string }
  | { status: 'done'; result: ChainCheckResult };

export function OnChainCheck({
  assetId,
  txid,
  onUse,
}: {
  assetId: string;
  txid: string;
  /** Receives the coins the transfer is worth, so the amount is never retyped. */
  onUse: (coins: number) => void;
}) {
  const rail = railFor(assetId);
  const [state, setState] = useState<CheckState>({ status: 'checking' });
  const started = useRef(false);

  const run = useCallback(async () => {
    setState({ status: 'checking' });

    try {
      const supabase = getSupabase();
      const session = supabase ? (await supabase.auth.getSession()).data.session : null;

      if (!session?.access_token) {
        setState({
          status: 'error',
          message: 'Sign in again — the chain check needs your admin session.',
        });
        return;
      }

      const query = new URLSearchParams({ asset: assetId, txid });
      const response = await fetch(`/api/chain/tx?${query.toString()}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const payload = (await response.json()) as Partial<ChainCheckResult> & { error?: string };

      if (!response.ok || typeof payload.error === 'string') {
        setState({
          status: 'error',
          message: payload.error ?? `The chain check failed (${response.status}).`,
        });
        return;
      }

      // A 2xx is always the result shape; the route never answers a partial one.
      const result = payload as ChainCheckResult;
      setState({ status: 'done', result });

      // The reviewer should not retype what the chain just told us: a
      // confirmed transfer to the house address names the coin amount itself.
      if (
        result.found &&
        result.confirmed &&
        result.toHouse &&
        typeof result.coins === 'number' &&
        result.coins > 0
      ) {
        onUse(result.coins);
      }
    } catch (error) {
      setState({
        status: 'error',
        message: error instanceof Error ? error.message : 'The chain check failed.',
      });
    }
  }, [assetId, txid, onUse]);

  useEffect(() => {
    // One read per open of the row; StrictMode's double mount is ignored.
    if (!rail || started.current) return;
    started.current = true;
    void run();
  }, [rail, run]);

  if (!rail) {
    return (
      <p className="border border-[var(--border)] bg-[var(--surface)] p-2.5 text-[11px] text-[var(--text-muted)]">
        {assetId.toUpperCase()} is not on an EVM chain the desk can read — verify this transfer on
        its own explorer before crediting.
      </p>
    );
  }

  return (
    <div className="space-y-1.5 border border-[var(--border)] bg-[var(--surface)] p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
          On-chain
        </span>

        {state.status === 'checking' && (
          <span className="flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)]">
            <Loader2 size={11} className="animate-spin" /> Reading the chain…
          </span>
        )}

        {state.status === 'error' && (
          <>
            <Pill tone="bad">Check failed</Pill>
            <span className="text-[11px] text-[var(--down)]">{state.message}</span>
            <Retry onClick={() => void run()} />
          </>
        )}

        {state.status === 'done' && <Outcome result={state.result} onRetry={run} />}
      </div>
    </div>
  );
}

function Retry({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 border border-[var(--border)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)] hover:text-[var(--text)] cursor-pointer"
    >
      <RefreshCw size={10} /> Retry
    </button>
  );
}

function Explorer({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-[10px] font-bold text-[var(--purple)] hover:underline"
    >
      Explorer <ExternalLink size={10} />
    </a>
  );
}

function Outcome({
  result,
  onRetry,
}: {
  result: ChainCheckResult;
  onRetry: () => Promise<void>;
}) {
  if (!result.found) {
    return (
      <>
        <Pill tone="bad">Not found</Pill>
        <span className="text-[11px] text-[var(--text-secondary)]">
          No transaction with that hash on this chain. Wrong hash, or the transfer was sent on
          another network.
        </span>
        <Explorer href={result.explorer} />
        <Retry onClick={() => void onRetry()} />
      </>
    );
  }

  if (!result.confirmed) {
    return (
      <>
        <Pill tone="pending">Unconfirmed</Pill>
        <span className="text-[11px] text-[var(--text-secondary)]">
          Found{result.blockNumber ? ` in block ${result.blockNumber.toLocaleString()}` : ''}
          {result.blockTime ? ` on ${when(result.blockTime)}` : ''}, but the transaction has not
          succeeded. Do not credit it yet.
        </span>
        <Explorer href={result.explorer} />
        <Retry onClick={() => void onRetry()} />
      </>
    );
  }

  if (!result.toHouse || result.coins === null) {
    return (
      <>
        <Pill tone="bad">Not to us</Pill>
        <span className="text-[11px] text-[var(--text-secondary)]">
          Confirmed, but it carries no USDT transfer to the house address
          {result.from ? ` (sent by ${`${result.from.slice(0, 6)}…${result.from.slice(-4)}`})` : ''}.
          Nothing to credit.
        </span>
        <Explorer href={result.explorer} />
        <Retry onClick={() => void onRetry()} />
      </>
    );
  }

  return (
    <>
      <Pill tone="ok">Confirmed</Pill>
      <span className="font-mono text-[11px] font-bold text-[var(--text)]">
        {result.usdt?.toFixed(2)} USDT
      </span>
      <span className="text-[11px] text-[var(--text-secondary)]">
        to the house address
        {result.blockNumber ? ` · block ${result.blockNumber.toLocaleString()}` : ''}
        {result.blockTime ? ` · ${when(result.blockTime)}` : ''}
      </span>
      <span className="border border-[var(--up)]/40 bg-[var(--up)]/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--up)]">
        {result.coins.toLocaleString()} coins filled
      </span>
      <Explorer href={result.explorer} />
      <Retry onClick={() => void onRetry()} />
    </>
  );
}

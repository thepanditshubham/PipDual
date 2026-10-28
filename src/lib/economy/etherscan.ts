/**
 * etherscan.ts
 * Reading a deposit off the chain.
 *
 * Two rails can be answered: USDT on BNB Smart Chain (chain 56) and USDT on
 * Ethereum (chain 1). Tron, Bitcoin, Solana and XRP are not EVM chains, so the
 * deposit desk keeps its manual explorer check for those.
 *
 * A stablecoin transfer carries no `value` — the amount and the recipient live
 * in the token's Transfer log, which is why the receipt is read as well as the
 * transaction. Everything here is pure so it can be tested without a network;
 * the transport lives in /api/chain/tx.
 */
import { COINS_PER_USD } from './config';

/** A rail the deposit desk can read on its own. */
export interface EvmRail {
  assetId: string;
  /** Etherscan v2 `chainid`. */
  chainId: '1' | '56';
  /** The token contract on that chain, lower case. */
  token: string;
  /**
   * Decimals the contract reports. They are NOT the same across chains:
   * Binance-Peg BSC-USD (the "USDT" of BSC) uses 18, Ethereum's USDT uses 6.
   * Dividing a BSC amount by 10^6 would report a trillion times too much.
   */
  decimals: number;
  /** Env var holding the house address for this rail. */
  addressEnv: 'NEXT_PUBLIC_DEPOSIT_USDT_BEP20' | 'NEXT_PUBLIC_DEPOSIT_USDT_ERC20';
}

export const EVM_RAILS: Record<string, EvmRail> = {
  'usdt-bep20': {
    assetId: 'usdt-bep20',
    chainId: '56',
    token: '0x55d398326f99059ff775485246999027b3197955',
    decimals: 18,
    addressEnv: 'NEXT_PUBLIC_DEPOSIT_USDT_BEP20',
  },
  'usdt-erc20': {
    assetId: 'usdt-erc20',
    chainId: '1',
    token: '0xdac17f958d2ee523a2206206994597c13d831ec7',
    decimals: 6,
    addressEnv: 'NEXT_PUBLIC_DEPOSIT_USDT_ERC20',
  },
};

/** keccak256("Transfer(address,address,uint256)"). */
export const TRANSFER_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

/** A log as the JSON-RPC proxy returns it. */
export interface RpcLog {
  address?: string;
  topics?: string[];
  data?: string;
}

/** What the desk needs to know about one hash. */
export interface ChainCheckResult {
  assetId: string;
  chainId: string;
  /** Does Etherscan know this hash at all? */
  found: boolean;
  /** Mined and successful (`receipt.status === 0x1`). */
  confirmed: boolean;
  blockNumber: number | null;
  /** When the block was mined, ISO — the moment the transfer really happened. */
  blockTime: string | null;
  /** Whoever signed the transaction. */
  from: string | null;
  /** Did a matching token transfer land on the house address? */
  toHouse: boolean;
  /** Raw token units as a string — bigint does not survive JSON. */
  units: string | null;
  usdt: number | null;
  coins: number | null;
  explorer: string;
}

/** The rail for an asset id, or undefined when Etherscan cannot read it. */
export function railFor(assetId: string): EvmRail | undefined {
  return EVM_RAILS[assetId.trim().toLowerCase()];
}

/** An indexed address topic, back to a 0x address. */
export function topicAddress(topic: string | undefined): string | null {
  if (!topic || !/^0x[0-9a-fA-F]{64}$/.test(topic)) return null;
  return `0x${topic.slice(26).toLowerCase()}`;
}

/**
 * Units of the rail's token that the receipt moved to the house address.
 * A log only counts when it comes from the USDT contract, is a Transfer, and
 * names the house address in `topics[2]`. Several transfers in one
 * transaction are summed; a zero-value transfer contributes nothing.
 */
export function unitsToHouse(logs: RpcLog[], rail: EvmRail, house: string): bigint {
  const wanted = house.trim().toLowerCase();
  if (!wanted) return BigInt(0);

  let total = BigInt(0);
  for (const log of logs) {
    if ((log.address ?? '').toLowerCase() !== rail.token) continue;
    const topics = log.topics ?? [];
    if ((topics[0] ?? '').toLowerCase() !== TRANSFER_TOPIC) continue;
    if (topicAddress(topics[2]) !== wanted) continue;

    // ABI pads the amount to 32 bytes; BigInt reads it as-is, so there is no
    // need to trim zeros (and no precision loss like parseInt would have).
    const data = log.data ?? '';
    if (!/^0x[0-9a-fA-F]+$/.test(data)) continue;
    total += BigInt(data);
  }
  return total;
}

/** Token units as the stablecoin amount a reviewer would read. */
export function usdtFromUnits(units: bigint, decimals: number): number {
  if (units <= BigInt(0)) return 0;
  const amount = Number(units) / 10 ** decimals;
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
}

/** The coins that amount buys at the flat peg, rounded down like every credit. */
export function coinsFromUnits(units: bigint, decimals: number): number {
  if (units <= BigInt(0)) return 0;
  const amount = Number(units) / 10 ** decimals;
  if (!Number.isFinite(amount)) return 0;
  return Math.max(0, Math.floor(amount * COINS_PER_USD));
}

/** Where a reviewer can read the same transaction themselves. */
export function explorerFor(chainId: string, txid: string): string {
  return chainId === '56' ? `https://bscscan.com/tx/${txid}` : `https://etherscan.io/tx/${txid}`;
}

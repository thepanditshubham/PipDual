/**
 * config.ts
 * Every number the economy runs on, in one place: the price of a coin, the
 * Live entry fees per ticket length, the house cut, the deposit packs, and
 * the crypto rails the arena accepts payment on.
 */
import type { MatchDurationId } from '@/lib/engine/constants';
import type { CoinPackDef, CryptoAssetDef } from './types';

/**
 * Coins per US dollar. Deposits are crypto and crypto is quoted in dollars,
 * so the peg is a dollar rather than a rupee. Deliberately flat — a bigger
 * pack does not get a better rate, so the price of a Live entry never moves
 * underneath a player.
 */
export const COINS_PER_USD = 100;

/**
 * Entry fee for a Live duel, in coins, by ticket length. Longer duels cost
 * more because more of the player's time and rank rating is on the line.
 * Demo is always free; this table only applies to Live.
 */
export const LIVE_FEES: Record<MatchDurationId, number> = {
  '5m': 100,
  '10m': 250,
  '15m': 500,
};

/**
 * Share of the pot the arena burns instead of paying to the winner. Two
 * entrants put in `stake` each, so the winner receives
 * `2 * stake * (1 - HOUSE_CUT)` and the fee funds the reward pool itself.
 */
export const HOUSE_CUT = 0.1;

/** Highest Live fee, used to warn a player before they queue. */
export const MAX_LIVE_FEE = Math.max(...Object.values(LIVE_FEES));

/** Coin value of the smallest and largest single deposit. */
export const MIN_DEPOSIT_USD = 5;
export const MAX_DEPOSIT_USD = 1000;

/**
 * Preset coin tiers, smallest first. Fixed amounts rather than a free-form
 * figure: a reviewer comparing a pasted TxID against a declared amount needs
 * the expected value to be unambiguous.
 */
export const COIN_PACKS: readonly CoinPackDef[] = [
  { id: 'tacker', label: 'Tacker', coins: 500, usd: 5 },
  { id: 'scalper', label: 'Scalper', coins: 1_000, usd: 10 },
  { id: 'swing', label: 'Swing', coins: 2_500, usd: 25 },
  { id: 'position', label: 'Position', coins: 5_000, usd: 50 },
  { id: 'whale', label: 'Whale', coins: 10_000, usd: 100 },
];

/**
 * Withdrawal floor and the on-chain fee taken off the payout, in US dollars.
 * The fee comes off what the player receives rather than being charged up
 * front, so a player never has to hold gas on a chain they are being paid on.
 * These two numbers are mirrored in `request_crypto_withdraw()` — the SQL is
 * what actually moves coins, so change both or neither.
 */
export const MIN_WITHDRAW_USD = 5;
export const WITHDRAW_FEE_USD = 1;

/**
 * Rails the arena pays out on. Deliberately narrower than the deposit list:
 * payouts are stablecoins on chains the operator already holds funds on, so
 * nobody is waiting for a market sale before their money moves.
 */
export const WITHDRAW_RAIL_IDS = ['usdt-bep20', 'usdt-trc20'] as const;

/**
 * House addresses, one per rail. Read as literal env lookups because Next
 * inlines `NEXT_PUBLIC_*` at build time — a dynamic `process.env[key]` would
 * be undefined in the browser. Changing any of these needs a dev-server
 * restart, not just a page refresh. They are read on demand rather than at
 * module load so the rails can be tested without a fake environment.
 */
const ADDRESS_READERS: Record<string, () => string> = {
  'usdt-trc20': () => process.env.NEXT_PUBLIC_DEPOSIT_USDT_TRC20 ?? '',
  'usdt-bep20': () => process.env.NEXT_PUBLIC_DEPOSIT_USDT_BEP20 ?? '',
  'usdt-erc20': () => process.env.NEXT_PUBLIC_DEPOSIT_USDT_ERC20 ?? '',
  btc: () => process.env.NEXT_PUBLIC_DEPOSIT_BTC ?? '',
  eth: () => process.env.NEXT_PUBLIC_DEPOSIT_ETH ?? '',
  sol: () => process.env.NEXT_PUBLIC_DEPOSIT_SOL ?? '',
  xrp: () => process.env.NEXT_PUBLIC_DEPOSIT_XRP ?? '',
};

/** Rail metadata, minus the address, which comes from the readers above. */
const ASSET_DEFS: readonly Omit<CryptoAssetDef, 'address'>[] = [
  {
    id: 'usdt-trc20',
    symbol: 'USDT',
    name: 'Tether USD',
    network: 'TRC20',
    memoRequired: false,
    stable: true,
    decimals: 2,
    explorerTx: (txid) => `https://tronscan.org/#/transaction/${txid}`,
  },
  {
    id: 'usdt-bep20',
    symbol: 'USDT',
    name: 'Tether USD',
    network: 'BEP20 (BSC)',
    memoRequired: false,
    stable: true,
    decimals: 2,
    qr: '/deposit-qr-usdt-bep20.jpg',
    explorerTx: (txid) => `https://bscscan.com/tx/${txid}`,
  },
  {
    id: 'usdt-erc20',
    symbol: 'USDT',
    name: 'Tether USD',
    network: 'ERC20',
    memoRequired: false,
    stable: true,
    decimals: 2,
    explorerTx: (txid) => `https://etherscan.io/tx/${txid}`,
  },
  {
    id: 'btc',
    symbol: 'BTC',
    name: 'Bitcoin',
    network: 'Bitcoin',
    memoRequired: false,
    stable: false,
    decimals: 6,
    explorerTx: (txid) => `https://mempool.space/tx/${txid}`,
  },
  {
    id: 'eth',
    symbol: 'ETH',
    name: 'Ethereum',
    network: 'Ethereum',
    memoRequired: false,
    stable: false,
    decimals: 5,
    explorerTx: (txid) => `https://etherscan.io/tx/${txid}`,
  },
  {
    id: 'sol',
    symbol: 'SOL',
    name: 'Solana',
    network: 'Solana',
    memoRequired: false,
    stable: false,
    decimals: 4,
    explorerTx: (txid) => `https://solscan.io/tx/${txid}`,
  },
  {
    id: 'xrp',
    symbol: 'XRP',
    name: 'XRP Ledger',
    network: 'XRPL',
    memoRequired: true,
    stable: false,
    decimals: 2,
    explorerTx: (txid) => `https://xrpscan.com/tx/${txid}`,
  },
];

/**
 * Every rail the arena knows about, each with its current house address. An
 * address that comes back empty means the rail is not accepting deposits, and
 * `acceptedAssets()` hides it — showing a blank field a player could send to
 * is the one mistake this screen cannot undo.
 */
export function cryptoAssets(): CryptoAssetDef[] {
  return ASSET_DEFS.map((def) => ({
    ...def,
    address: ADDRESS_READERS[def.id]?.().trim() ?? '',
  }));
}

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import {
  COINS_PER_USD,
  COIN_PACKS,
  HOUSE_CUT,
  LIVE_FEES,
  MAX_DEPOSIT_USD,
  MIN_DEPOSIT_USD,
  MIN_WITHDRAW_USD,
  WITHDRAW_FEE_USD,
} from '@/lib/economy/config';
import {
  acceptedAssets,
  assetFor,
  coinsFor,
  expectedAmountText,
  explorerUrl,
  formatUsd,
  memoForUser,
  newCryptoDeposit,
  newDeposit,
  packFor,
  usdFor,
  validateAsset,
  validateMemo,
  validatePack,
  validateTxId,
} from '@/lib/economy/deposit';
import {
  MIN_WITHDRAW_COINS,
  newWithdrawRequest,
  railFor,
  validatePayoutAddress,
  validatePayoutMemo,
  validateWithdraw,
  withdrawalBreakdown,
  withdrawRails,
} from '@/lib/economy/withdraw';
import {
  houseBurnFor,
  liveFeeFor,
  netFor,
  payoutFor,
  potFor,
} from '@/lib/economy/stakes';

/** A 64-character hash, the shape every EVM-style rail reports. */
const HASH_64 = 'a'.repeat(64);
const EVM_HASH = `0x${'b'.repeat(64)}`;

/** Well-formed receiving addresses for the two payout rails. */
const EVM_ADDRESS = `0x${'c'.repeat(40)}`;
const TRON_ADDRESS = `T${'a'.repeat(33)}`;

/**
 * House addresses the rail registry reads from env. Set here rather than in a
 * fixture because the readers are lazy — assigning `process.env` before the
 * call is enough, and the deposit maths stays testable without a real wallet.
 */
const ADDRESS_VARS = {
  'usdt-trc20': 'NEXT_PUBLIC_DEPOSIT_USDT_TRC20',
  'usdt-bep20': 'NEXT_PUBLIC_DEPOSIT_USDT_BEP20',
  'usdt-erc20': 'NEXT_PUBLIC_DEPOSIT_USDT_ERC20',
  btc: 'NEXT_PUBLIC_DEPOSIT_BTC',
  eth: 'NEXT_PUBLIC_DEPOSIT_ETH',
  sol: 'NEXT_PUBLIC_DEPOSIT_SOL',
  xrp: 'NEXT_PUBLIC_DEPOSIT_XRP',
} as const;

/** Stand-in house addresses, keyed by the env var the rail reads. */
const TEST_ADDRESSES: Record<string, string> = {
  NEXT_PUBLIC_DEPOSIT_USDT_TRC20: 'TTestDepositAddressXXXXXXXXXXXXXXXXX',
  NEXT_PUBLIC_DEPOSIT_USDT_BEP20: '0x6b7F04AF72902c1d547a561465Aa91559FEcB4ca',
  NEXT_PUBLIC_DEPOSIT_USDT_ERC20: '0xtestdepositaddress000000000000000000000000',
  NEXT_PUBLIC_DEPOSIT_BTC: 'bc1qtestdepositaddress0000000000000000000000',
  NEXT_PUBLIC_DEPOSIT_ETH: '0xtestdepositaddress000000000000000000000000',
  NEXT_PUBLIC_DEPOSIT_SOL: 'TestDepositAddressXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
  NEXT_PUBLIC_DEPOSIT_XRP: 'rTestDepositAddressXXXXXXXXXXXXXXXXX',
};

const savedEnv: Record<string, string | undefined> = {};

beforeAll(() => {
  for (const variable of Object.values(ADDRESS_VARS)) {
    savedEnv[variable] = process.env[variable];
    process.env[variable] = TEST_ADDRESSES[variable];
  }
});

afterAll(() => {
  for (const [variable, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[variable];
    else process.env[variable] = value;
  }
});

describe('coin price', () => {
  it('prices coins in dollars, flat', () => {
    expect(COINS_PER_USD).toBe(100);
    expect(coinsFor(10)).toBe(1_000);
    expect(coinsFor(1)).toBe(100);
  });

  it('rounds down and never goes negative', () => {
    expect(coinsFor(9.999)).toBe(999);
    expect(coinsFor(0)).toBe(0);
    expect(coinsFor(-50)).toBe(0);
    expect(coinsFor(Number.NaN)).toBe(0);
  });

  it('converts back to the dollar value of a balance', () => {
    expect(usdFor(2_500)).toBe(25);
    expect(usdFor(0)).toBe(0);
    expect(usdFor(-10)).toBe(0);
  });

  it('labels dollars without cents', () => {
    expect(formatUsd(1_000)).toBe('$1,000');
    expect(formatUsd(5)).toBe('$5');
  });
});

describe('coin packs', () => {
  it('make every pack worth exactly its dollar value in coins', () => {
    for (const pack of COIN_PACKS) {
      expect(pack.coins).toBe(pack.usd * COINS_PER_USD);
      expect(pack.usd).toBeGreaterThanOrEqual(MIN_DEPOSIT_USD);
      expect(pack.usd).toBeLessThanOrEqual(MAX_DEPOSIT_USD);
      expect(validatePack(pack.id)).toBeNull();
    }
  });

  it('have unique ids and are ordered smallest first', () => {
    expect(new Set(COIN_PACKS.map((pack) => pack.id)).size).toBe(COIN_PACKS.length);
    const values = COIN_PACKS.map((pack) => pack.usd);
    expect(values).toEqual([...values].sort((a, b) => a - b));
  });

  it('refuse a pack id that is not on the menu', () => {
    expect(packFor('nope')).toBeNull();
    expect(validatePack('nope')).toMatch(/Choose a coin pack/);
  });
});

describe('deposit rails', () => {
  it('expose the configured house address for every rail', () => {
    expect(acceptedAssets()).toHaveLength(Object.keys(ADDRESS_VARS).length);
    expect(assetFor('btc')?.address).toBe(TEST_ADDRESSES.NEXT_PUBLIC_DEPOSIT_BTC);
  });

  it('hide a rail the moment its address is removed', () => {
    process.env.NEXT_PUBLIC_DEPOSIT_BTC = '';
    expect(acceptedAssets().some((asset) => asset.id === 'btc')).toBe(false);
    expect(validateAsset('btc')).toMatch(/not accepting deposits yet/);

    process.env.NEXT_PUBLIC_DEPOSIT_BTC = TEST_ADDRESSES.NEXT_PUBLIC_DEPOSIT_BTC;
    expect(validateAsset('btc')).toBeNull();
    expect(validateAsset('nope')).toMatch(/Choose a coin and network/);
  });

  it('link each rail to its own explorer', () => {
    expect(explorerUrl('usdt-trc20', HASH_64)).toContain('tronscan.org');
    expect(explorerUrl('usdt-bep20', EVM_HASH)).toContain('bscscan.com');
    expect(explorerUrl('eth', EVM_HASH)).toContain('etherscan.io');
    expect(explorerUrl('sol', '5'.repeat(40))).toContain('solscan.io');
    expect(explorerUrl('nope', HASH_64)).toBe('');
    expect(explorerUrl('btc', '   ')).toBe('');
  });

  it('only the shared-address rail demands a memo', () => {
    expect(assetFor('xrp')?.memoRequired).toBe(true);
    expect(assetFor('usdt-trc20')?.memoRequired).toBe(false);
    expect(assetFor('usdt-bep20')?.network).toBe('BEP20 (BSC)');
    expect(assetFor('usdt-bep20')?.qr).toBe('/deposit-qr-usdt-bep20.jpg');
    expect(validateMemo('usdt-trc20', '')).toBeNull();
    expect(validateMemo('xrp', '')).toMatch(/memo/);
    expect(validateMemo('xrp', '4242')).toBeNull();
  });

  it('derive a stable numeric tag per account', () => {
    const tag = memoForUser('8f14e45f-ceea-467a-9c8b-1f2b3a4d5e6f');
    expect(tag).toBe(memoForUser('8f14e45f-ceea-467a-9c8b-1f2b3a4d5e6f'));
    expect(tag).toMatch(/^[1-9][0-9]*$/);
    expect(memoForUser('another-player')).not.toBe(tag);
  });
});

describe('amounts a depositor must send', () => {
  it('quotes a stablecoin in exact units', () => {
    const usdt = assetFor('usdt-trc20');
    expect(usdt && expectedAmountText(usdt, 10)).toBe('10.00 USDT');
  });

  it('quotes a volatile asset in dollars, because its unit amount moves', () => {
    const btc = assetFor('btc');
    expect(btc && expectedAmountText(btc, 10)).toBe('≈ $10 worth of BTC');
  });
});

describe('txid shape checks', () => {
  it('demand a hash before recording anything', () => {
    expect(validateTxId('btc', '')).toMatch(/Paste the transaction hash/);
    expect(validateTxId('btc', '   ')).toMatch(/Paste the transaction hash/);
    expect(validateTxId('btc', `${HASH_64} `)).toBeNull();
  });

  it('reject a hash with inner spaces or the wrong alphabet', () => {
    expect(validateTxId('btc', `${HASH_64.slice(0, 32)} ${HASH_64.slice(32)}`)).toMatch(/spaces/);
    expect(validateTxId('btc', 'not-a-hash')).toMatch(/does not look like a BTC/);
    expect(validateTxId('eth', HASH_64)).toMatch(/does not look like a ETH/);
    expect(validateTxId('eth', EVM_HASH)).toBeNull();
    expect(validateTxId('sol', '5'.repeat(40))).toBeNull();
    // base58 leaves out 0, I, O and l
    expect(validateTxId('sol', '0Ill'.repeat(10))).toMatch(/does not look like a SOL/);
  });

  it('are a shape check only, never a credit', () => {
    expect(validateTxId('usdt-trc20', HASH_64)).toBeNull();
    expect(validateTxId('usdt-bep20', EVM_HASH)).toBeNull();
    expect(validateTxId('usdt-bep20', HASH_64)).toMatch(/does not look like a USDT/);
    expect(validateTxId('usdt-trc20', '1'.repeat(21))).toMatch(/does not look like a USDT/);
  });
});

describe('crypto deposits', () => {
  it('start pending with the pack, rail and address recorded', () => {
    const deposit = newCryptoDeposit(
      { packId: 'swing', assetId: 'xrp', txid: ` ${HASH_64} `, memo: ' 4242 ' },
      new Date('2026-10-27T12:00:00.000Z'),
    );

    expect(deposit).toMatchObject({
      packId: 'swing',
      coins: 2_500,
      assetId: 'xrp',
      symbol: 'XRP',
      network: 'XRPL',
      expectedUsd: 25,
      address: TEST_ADDRESSES.NEXT_PUBLIC_DEPOSIT_XRP,
      memo: '4242',
      txid: HASH_64,
      status: 'pending',
      note: null,
      reviewedAt: null,
      createdAt: '2026-10-27T12:00:00.000Z',
    });
    expect(deposit.id).toMatch(/^dep_/);
  });

  it('drop the memo on rails that do not use one', () => {
    const deposit = newCryptoDeposit({ packId: 'tacker', assetId: 'btc', txid: HASH_64, memo: 'ignored' });
    expect(deposit.memo).toBeNull();
  });

  it('refuse to build a row nobody could review', () => {
    expect(() => newCryptoDeposit({ packId: 'nope', assetId: 'btc', txid: HASH_64 })).toThrow(/Unknown coin pack/);
    expect(() => newCryptoDeposit({ packId: 'tacker', assetId: 'nope', txid: HASH_64 })).toThrow(/Unknown deposit asset/);

    process.env.NEXT_PUBLIC_DEPOSIT_SOL = '';
    expect(() => newCryptoDeposit({ packId: 'tacker', assetId: 'sol', txid: '5'.repeat(40) })).toThrow(/not configured/);
    process.env.NEXT_PUBLIC_DEPOSIT_SOL = TEST_ADDRESSES.NEXT_PUBLIC_DEPOSIT_SOL;
  });
});

describe('reviewer-named deposits', () => {
  it('queue a claim with no amount attached', () => {
    const deposit = newDeposit(
      { assetId: 'usdt-bep20', txid: EVM_HASH },
      new Date('2026-10-27T12:00:00.000Z'),
    );
    expect(deposit).toMatchObject({
      packId: 'custom',
      coins: null,
      expectedUsd: null,
      assetId: 'usdt-bep20',
      status: 'pending',
    });
  });

  it('snap the tag on shared-address rails, drop it elsewhere', () => {
    expect(newDeposit({ assetId: 'xrp', txid: HASH_64, memo: ' 42 ' }).memo).toBe('42');
    expect(newDeposit({ assetId: 'usdt-bep20', txid: EVM_HASH, memo: 'ignored' }).memo).toBeNull();
  });

  it('refuse an unconfigured rail rather than write a blind row', () => {
    expect(() => newDeposit({ assetId: 'nope', txid: HASH_64 })).toThrow(/Unknown deposit asset/);
  });
});

describe('live entry fees', () => {
  it('scale with the ticket length', () => {
    expect(liveFeeFor('5m')).toBe(LIVE_FEES['5m']);
    expect(liveFeeFor('10m')).toBe(LIVE_FEES['10m']);
    expect(liveFeeFor('15m')).toBe(LIVE_FEES['15m']);
    expect(liveFeeFor('5m')).toBeLessThan(liveFeeFor('10m'));
    expect(liveFeeFor('10m')).toBeLessThan(liveFeeFor('15m'));
  });

  it('prices unknown lengths as the cheapest ticket rather than zero', () => {
    expect(liveFeeFor(null)).toBe(LIVE_FEES['5m']);
    expect(liveFeeFor('20m')).toBe(LIVE_FEES['5m']);
    expect(liveFeeFor(undefined)).toBe(LIVE_FEES['5m']);
  });

  it('stay affordable at the coin price on the menu', () => {
    // The smallest pack has to cover at least the cheapest Live ticket, or a
    // new deposit could not buy a duel.
    expect(COIN_PACKS[0].coins).toBeGreaterThanOrEqual(liveFeeFor('5m'));
  });
});

describe('the pot', () => {
  it('pools both entries and burns only the house cut', () => {
    const stake = LIVE_FEES['5m'];
    expect(potFor(stake)).toBe(Math.floor(2 * stake * (1 - HOUSE_CUT)));
    expect(houseBurnFor(stake)).toBe(2 * stake - potFor(stake));
    expect(potFor(stake) + houseBurnFor(stake)).toBe(2 * stake);
  });

  it('pays nothing when nothing was staked', () => {
    expect(potFor(0)).toBe(0);
    expect(potFor(-100)).toBe(0);
    expect(houseBurnFor(0)).toBe(0);
  });

  it('gives the winner the pot, refunds a draw, and pays a loss nothing', () => {
    const stake = LIVE_FEES['10m'];
    expect(payoutFor('win', stake)).toBe(potFor(stake));
    expect(payoutFor('draw', stake)).toBe(stake);
    expect(payoutFor('loss', stake)).toBe(0);
  });

  it('nets out to the entry change across the match', () => {
    const stake = LIVE_FEES['15m'];
    expect(netFor('win', stake)).toBe(potFor(stake) - stake);
    expect(netFor('draw', stake)).toBe(0);
    expect(netFor('loss', stake)).toBe(-stake);
  });

  it('never pays a free table', () => {
    for (const outcome of ['win', 'draw', 'loss'] as const) {
      expect(payoutFor(outcome, 0)).toBe(0);
    }
  });
});

describe('payout rails', () => {
  it('offer only the stablecoin networks the arena can send on', () => {
    expect(withdrawRails().map((rail) => rail.id)).toEqual(['usdt-bep20', 'usdt-trc20']);
    expect(railFor('usdt-bep20')?.symbol).toBe('USDT');
    expect(railFor('btc')).toBeUndefined();
  });

  it('close a rail the moment its funding wallet is unconfigured', () => {
    const configured = process.env.NEXT_PUBLIC_DEPOSIT_USDT_BEP20;
    process.env.NEXT_PUBLIC_DEPOSIT_USDT_BEP20 = '';

    expect(withdrawRails().some((rail) => rail.id === 'usdt-bep20')).toBe(false);
    expect(validateWithdraw(1_000, 'usdt-bep20', EVM_ADDRESS, 5_000)).toMatch(/not accepting payouts/);

    process.env.NEXT_PUBLIC_DEPOSIT_USDT_BEP20 = configured;
  });
});

describe('withdrawal maths', () => {
  it('takes the network fee off the payout instead of charging it on top', () => {
    expect(withdrawalBreakdown(1_000)).toEqual({
      coins: 1_000,
      grossUsd: 10,
      feeUsd: WITHDRAW_FEE_USD,
      netUsd: 10 - WITHDRAW_FEE_USD,
      belowFloor: false,
    });
  });

  it('sets the floor in coins from the dollar minimum', () => {
    expect(MIN_WITHDRAW_COINS).toBe(MIN_WITHDRAW_USD * COINS_PER_USD);
    expect(withdrawalBreakdown(MIN_WITHDRAW_COINS).belowFloor).toBe(false);
    expect(withdrawalBreakdown(MIN_WITHDRAW_COINS - 1).belowFloor).toBe(true);
    expect(validateWithdraw(100, 'usdt-bep20', EVM_ADDRESS, 5_000)).toMatch(/minimum withdrawal/);
  });

  it('rounds to whole coins and never goes negative', () => {
    expect(withdrawalBreakdown(1_000.6).coins).toBe(1_001);
    expect(withdrawalBreakdown(-5).coins).toBe(0);
    expect(withdrawalBreakdown(Number.NaN).coins).toBe(0);
  });

  it('refuses to send out more coins than the wallet holds', () => {
    expect(validateWithdraw(2_000, 'usdt-bep20', EVM_ADDRESS, 1_500)).toMatch(/You hold 1,500 coins/);
    expect(validateWithdraw(0, 'usdt-bep20', EVM_ADDRESS, 5_000)).toMatch(/Enter an amount/);
  });
});

describe('payout addresses', () => {
  it('have to belong to the chain being paid', () => {
    expect(validatePayoutAddress('usdt-bep20', EVM_ADDRESS)).toBeNull();
    expect(validatePayoutAddress('usdt-trc20', TRON_ADDRESS)).toBeNull();
    expect(validatePayoutAddress('usdt-bep20', TRON_ADDRESS)).toMatch(/BEP20/);
    expect(validatePayoutAddress('usdt-trc20', EVM_ADDRESS)).toMatch(/TRC20/);
    expect(validatePayoutAddress('usdt-bep20', '')).toMatch(/Enter the address/);
    expect(validatePayoutAddress('usdt-bep20', `0x${'c'.repeat(39)}`)).toMatch(/42-character/);
  });

  it('never let the arena pay itself', () => {
    expect(validatePayoutAddress('usdt-bep20', TEST_ADDRESSES.NEXT_PUBLIC_DEPOSIT_USDT_BEP20)).toMatch(
      /own deposit address/
    );
  });

  it('cap an optional memo at what a chain can carry', () => {
    expect(validatePayoutMemo('')).toBeNull();
    expect(validatePayoutMemo('8899')).toBeNull();
    expect(validatePayoutMemo('x'.repeat(33))).toMatch(/too long/);
  });
});

describe('withdrawal rows', () => {
  it('escrow coins and record the split the reviewer will pay against', () => {
    const withdrawal = newWithdrawRequest(
      { coins: 2_500, assetId: 'usdt-trc20', address: ` ${TRON_ADDRESS} `, memo: ' 8899 ' },
      new Date('2026-10-27T12:00:00.000Z')
    );

    expect(withdrawal).toMatchObject({
      coins: 2_500,
      grossUsd: 25,
      feeUsd: 1,
      netUsd: 24,
      assetId: 'usdt-trc20',
      symbol: 'USDT',
      network: 'TRC20',
      address: TRON_ADDRESS,
      memo: '8899',
      status: 'pending',
      note: null,
      reviewedAt: null,
      createdAt: '2026-10-27T12:00:00.000Z',
    });
    expect(withdrawal.id).toMatch(/^wd_/);
  });

  it('refuse to build a payout nobody could honour', () => {
    expect(() =>
      newWithdrawRequest({ coins: 100, assetId: 'usdt-bep20', address: EVM_ADDRESS })
    ).toThrow(/minimum/);
    expect(() =>
      newWithdrawRequest({ coins: 1_000, assetId: 'btc', address: EVM_ADDRESS })
    ).toThrow(/Unknown payout rail/);
    expect(() =>
      newWithdrawRequest({ coins: 1_000, assetId: 'usdt-bep20', address: 'nope' })
    ).toThrow(/not valid/);
  });
});

describe('what the database enforces', () => {
  /**
   * The SQL re-derives every payout number, so the client and the migration
   * hold the same constants twice. These assertions fail if one side is edited
   * without the other — a silent drift would quote a player one thing and pay
   * another.
   */
  it('mirrors the coin price, floor and fee the client quotes', () => {
    const sql = readFileSync(
      'supabase/migrations/20261031180000_crypto_withdrawals.sql',
      'utf8'
    );
    expect(sql).toContain(`p_coins < ${MIN_WITHDRAW_COINS}`);
    expect(sql).toContain(`ROUND(p_coins / ${COINS_PER_USD}.0, 2)`);
    expect(sql).toContain(`v_gross - ${WITHDRAW_FEE_USD.toFixed(2)}`);
  });

  it('keeps both money tables writable only through definer functions', () => {
    const withdrawals = readFileSync(
      'supabase/migrations/20261031180000_crypto_withdrawals.sql',
      'utf8'
    );
    const deposits = readFileSync(
      'supabase/migrations/20261031120000_crypto_deposits.sql',
      'utf8'
    );

    expect(withdrawals).not.toMatch(/POLICY .*FOR (INSERT|UPDATE|DELETE)/);
    expect(deposits).toMatch(/POLICY crypto_deposits_insert_pending/);
    expect(deposits).not.toMatch(/POLICY .*FOR (UPDATE|DELETE)/);
  });
});

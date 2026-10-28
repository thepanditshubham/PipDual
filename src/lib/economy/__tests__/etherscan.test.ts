import { describe, expect, it } from 'vitest';

import {
  EVM_RAILS,
  TRANSFER_TOPIC,
  coinsFromUnits,
  explorerFor,
  railFor,
  topicAddress,
  unitsToHouse,
  usdtFromUnits,
} from '@/lib/economy/etherscan';

/** The real house address used by the deposit desk. */
const HOUSE = '0x6b7F04AF72902c1d547a561465Aa91559FEcB4ca';
const SENDER = '0x2b1dFBAB2A451B80D4b5737E96B1ddE30747AD1F';
const OTHER = '0x00192fb10df37c9fb26829eb2cc623cd1bf599e8';

/** An indexed address topic, padded the way a node returns it. */
const topic = (address: string) => `0x${'0'.repeat(24)}${address.slice(2).toLowerCase()}`;

/** A Transfer log with a 32-byte `data` word, like a real receipt. */
const transfer = (input: {
  token?: string;
  from?: string;
  to?: string;
  units?: bigint;
  selector?: string;
}) => ({
  address: input.token ?? EVM_RAILS['usdt-bep20'].token,
  topics: [
    input.selector ?? TRANSFER_TOPIC,
    topic(input.from ?? SENDER),
    topic(input.to ?? HOUSE),
  ],
  data: `0x${(input.units ?? BigInt('150000000000000000000')).toString(16).padStart(64, '0')}`,
});

describe('rails Etherscan can read', () => {
  it('knows USDT on BSC and Ethereum', () => {
    expect(railFor('usdt-bep20')?.chainId).toBe('56');
    expect(railFor('usdt-erc20')?.chainId).toBe('1');
    expect(railFor(' USDT-BEP20 ')?.assetId).toBe('usdt-bep20');
  });

  it('uses 18 decimals on BSC and 6 on Ethereum', () => {
    expect(railFor('usdt-bep20')?.decimals).toBe(18);
    expect(railFor('usdt-erc20')?.decimals).toBe(6);
  });

  it('leaves the chains Etherscan does not index to the manual check', () => {
    expect(railFor('usdt-trc20')).toBeUndefined();
    expect(railFor('btc')).toBeUndefined();
    expect(railFor('sol')).toBeUndefined();
  });

  it('links the hash to the right explorer', () => {
    expect(explorerFor('56', '0xabc')).toContain('bscscan.com');
    expect(explorerFor('1', '0xabc')).toContain('etherscan.io');
  });
});

describe('indexed addresses', () => {
  it('strips the padding back to a 0x address', () => {
    expect(topicAddress(topic(HOUSE))).toBe(HOUSE.toLowerCase());
    expect(topicAddress('0x1234')).toBeNull();
    expect(topicAddress(undefined)).toBeNull();
  });
});

describe('reading the transfer', () => {
  const rail = EVM_RAILS['usdt-bep20'];

  it('reads the 150 USDT transfer the desk was built for', () => {
    // The exact log from BscScan: data 0x0000…821ab0d4414980000.
    const log = transfer({ units: BigInt('150000000000000000000') });
    expect(log.data).toBe(
      '0x00000000000000000000000000000000000000000000000821ab0d4414980000',
    );
    expect(unitsToHouse([log], rail, HOUSE)).toBe(BigInt('150000000000000000000'));
    expect(usdtFromUnits(BigInt('150000000000000000000'), rail.decimals)).toBe(150);
    expect(coinsFromUnits(BigInt('150000000000000000000'), rail.decimals)).toBe(15_000);
  });

  it('sums only the USDT transfers that reached the house address', () => {
    const logs = [
      transfer({ units: BigInt('25000000000000000000') }),
      transfer({ units: BigInt('5000000000000000000') }),
      transfer({ to: OTHER, units: BigInt('999000000000000000000') }),
      transfer({ token: OTHER, units: BigInt('999000000000000000000') }),
      transfer({ selector: `0x${'1'.repeat(64)}`, units: BigInt('999000000000000000000') }),
    ];
    expect(unitsToHouse(logs, rail, HOUSE)).toBe(BigInt('30000000000000000000'));
  });

  it('compares addresses and contracts without caring about case', () => {
    expect(unitsToHouse([transfer({ to: HOUSE.toUpperCase() })], rail, HOUSE)).toBe(
      BigInt('150000000000000000000'),
    );
    expect(unitsToHouse([transfer({ token: rail.token.toUpperCase() })], rail, HOUSE)).toBe(
      BigInt('150000000000000000000'),
    );
  });

  it('credits nothing when the transfer went elsewhere or nowhere', () => {
    expect(unitsToHouse([transfer({ to: OTHER })], rail, HOUSE)).toBe(BigInt(0));
    expect(unitsToHouse([], rail, HOUSE)).toBe(BigInt(0));
    expect(unitsToHouse([transfer({})], rail, '')).toBe(BigInt(0));
    expect(unitsToHouse([transfer({ units: BigInt(0) })], rail, HOUSE)).toBe(BigInt(0));
  });

  it('ignores a malformed data field instead of throwing', () => {
    const broken = { ...transfer({}), data: '0xnot-hex' };
    expect(unitsToHouse([broken], rail, HOUSE)).toBe(BigInt(0));
  });
});

describe('amounts', () => {
  it('reads units as the stablecoin amount', () => {
    expect(usdtFromUnits(BigInt('25000000000000000000'), 18)).toBe(25);
    expect(usdtFromUnits(BigInt(1234567), 6)).toBe(1.23);
    expect(usdtFromUnits(BigInt(0), 18)).toBe(0);
  });

  it('prices the amount in coins at the flat peg, rounded down', () => {
    expect(coinsFromUnits(BigInt('150000000000000000000'), 18)).toBe(15_000);
    expect(coinsFromUnits(BigInt(1234567), 6)).toBe(123);
    expect(coinsFromUnits(BigInt(999999), 6)).toBe(99);
    expect(coinsFromUnits(BigInt(0), 18)).toBe(0);
  });

  it('would be a trillion times too large with the wrong decimals', () => {
    // Guards the BSC (18) versus Ethereum (6) trap in one assertion.
    expect(coinsFromUnits(BigInt('150000000000000000000'), 6)).toBeGreaterThan(10_000_000_000_000);
  });
});

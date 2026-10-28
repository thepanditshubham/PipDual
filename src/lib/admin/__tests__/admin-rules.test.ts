import { describe, expect, it } from 'vitest';

import {
  DUAL_APPROVAL_COINS,
  addressHistory,
  filterLedger,
  findTxidConflict,
  inDateRange,
  needsDualApproval,
  sumByDirection,
  textMatches,
} from '@/lib/admin/rules';

const tx = (id: string, txid: string, status: string) => ({ id, txid, status });
const pay = (id: string, address: string, status: string) => ({ id, address, status });

describe('dual approval', () => {
  it('asks for a second signature only at or above the threshold', () => {
    expect(needsDualApproval(DUAL_APPROVAL_COINS - 1)).toBe(false);
    expect(needsDualApproval(DUAL_APPROVAL_COINS)).toBe(true);
    expect(needsDualApproval(DUAL_APPROVAL_COINS * 4)).toBe(true);
  });

  it('never asks for a second signature on a bad number', () => {
    expect(needsDualApproval(Number.NaN)).toBe(false);
    expect(needsDualApproval(0)).toBe(false);
    expect(needsDualApproval(-5_000)).toBe(false);
  });
});

describe('duplicate TxID', () => {
  const rows = [
    tx('dep_1', '0xaaaa', 'pending'),
    tx('dep_2', '0xbbbb', 'paid'),
    tx('dep_3', '0xcccc', 'rejected'),
  ];

  it('finds the row that already claims the hash', () => {
    expect(findTxidConflict(rows, '0xbbbb')?.id).toBe('dep_2');
    expect(findTxidConflict(rows, '0xaaaa')?.id).toBe('dep_1');
  });

  it('ignores a rejected claim, so the hash can be resubmitted', () => {
    expect(findTxidConflict(rows, '0xcccc')).toBeNull();
  });

  it('does not flag a row against itself', () => {
    expect(findTxidConflict(rows, '0xaaaa', 'dep_1')).toBeNull();
  });

  it('compares hashes ignoring case and padding', () => {
    expect(findTxidConflict(rows, '  0xBBBB  ')?.id).toBe('dep_2');
    expect(findTxidConflict(rows, '')).toBeNull();
  });
});

describe('payout address reuse', () => {
  const rows = [
    pay('wd_1', '0xABC', 'paid'),
    pay('wd_2', '0xabc', 'rejected'),
    pay('wd_3', '0xdef', 'pending'),
  ];

  it('counts every earlier request to the same address', () => {
    expect(addressHistory(rows, '0xabc')).toEqual({ total: 2, paid: 1 });
  });

  it('keeps the current request out of its own history', () => {
    expect(addressHistory(rows, '0xabc', 'wd_2')).toEqual({ total: 1, paid: 1 });
  });

  it('reports nothing for a first-time address or a blank one', () => {
    expect(addressHistory(rows, '0x999')).toEqual({ total: 0, paid: 0 });
    expect(addressHistory(rows, '  ')).toEqual({ total: 0, paid: 0 });
  });
});

describe('date range', () => {
  const noon = '2026-10-27T12:00:00.000Z';

  it('keeps everything when neither bound is set', () => {
    expect(inDateRange(noon, '', '')).toBe(true);
  });

  it('treats both bounds as inclusive days', () => {
    expect(inDateRange(noon, '2026-10-27', '2026-10-27')).toBe(true);
    expect(inDateRange(noon, '2026-10-28', '')).toBe(false);
    expect(inDateRange(noon, '', '2026-10-26')).toBe(false);
  });

  it('drops rows with no usable timestamp once a bound is set', () => {
    expect(inDateRange(null, '2026-10-01', '')).toBe(false);
    expect(inDateRange('not-a-date', '2026-10-01', '')).toBe(false);
  });
});

describe('text matching', () => {
  it('matches everything on an empty needle', () => {
    expect(textMatches('', 'anything')).toBe(true);
    expect(textMatches('   ', null)).toBe(true);
  });

  it('ignores case and tolerates a missing field', () => {
    expect(textMatches('ALPHA', 'trader_alpha', null)).toBe(true);
    expect(textMatches('alpha', null, undefined)).toBe(false);
  });
});

describe('ledger filter', () => {
  const rows = [
    { kind: 'deposit' as const, playerId: 'p1', createdAt: '2026-10-27T10:00:00.000Z', reason: 'Deposit' },
    { kind: 'payout' as const, playerId: 'p2', createdAt: '2026-10-26T10:00:00.000Z', reason: 'Payout escrowed' },
    { kind: 'adjustment' as const, playerId: 'p1', createdAt: '2026-10-25T10:00:00.000Z', reason: 'Goodwill' },
  ];

  it('narrows by type', () => {
    expect(filterLedger(rows, { kind: 'payout', player: '', from: '', to: '' })).toHaveLength(1);
    expect(filterLedger(rows, { kind: 'all', player: '', from: '', to: '' })).toHaveLength(3);
  });

  it('narrows by player and by reason', () => {
    const p1 = filterLedger(rows, { kind: 'all', player: 'p1', from: '', to: '' });
    expect(p1).toHaveLength(2);

    const goodwill = filterLedger(rows, { kind: 'all', player: 'goodwill', from: '', to: '' });
    expect(goodwill).toHaveLength(1);
    expect(goodwill[0].kind).toBe('adjustment');
  });

  it('matches a resolved username as well as the raw id', () => {
    const names = { p1: 'trader_alpha', p2: 'trader_beta' };
    const found = filterLedger(rows, {
      kind: 'all',
      player: 'alpha',
      from: '',
      to: '',
      names,
    });
    expect(found).toHaveLength(2);
    expect(found.every((row) => row.playerId === 'p1')).toBe(true);
  });

  it('narrows by date window', () => {
    expect(
      filterLedger(rows, { kind: 'all', player: '', from: '2026-10-26', to: '' }),
    ).toHaveLength(2);
  });

  it('splits credited from debited coins', () => {
    expect(sumByDirection([{ coins: 500 }, { coins: -200 }, { coins: 300 }])).toEqual({
      credited: 800,
      debited: 200,
    });
    expect(sumByDirection([])).toEqual({ credited: 0, debited: 0 });
  });
});

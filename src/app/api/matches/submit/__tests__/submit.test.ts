import { describe, it, expect } from 'vitest';
import { TICKS } from '@/lib/engine/constants';
import { POST } from '../route';

describe('/api/matches/submit API endpoint', () => {
  it('verifies valid match actions independently on server', async () => {
    const payload = {
      room: 'ABCDE',
      seed: 4242,
      mode: 'standard',
      actions: [
        { t: 10, type: 'buy', size: 1 },
        { t: 25, type: 'close', size: 1 },
      ],
    };

    const req = new Request('http://localhost:3000/api/matches/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.verified).toBe(true);
    expect(typeof data.score).toBe('number');
    expect(typeof data.pnl).toBe('number');
    expect(data.tradeCount).toBe(1);
    expect(data.flagged).toBe(false);
  });

  it('rejects payload with invalid lot size', async () => {
    const payload = {
      room: 'ABCDE',
      seed: 4242,
      mode: 'standard',
      actions: [
        { t: 10, type: 'buy', size: 7 }, // 7 is not in ALLOWED_SIZES [1,2,3,4]
      ],
    };

    const req = new Request('http://localhost:3000/api/matches/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('rejects actions exceeding TICKS - 2', async () => {
    const payload = {
      room: 'ABCDE',
      seed: 4242,
      mode: 'standard',
      actions: [
        { t: TICKS, type: 'buy', size: 1 }, // Exceeds TICKS - 2, must be rejected
      ],
    };

    const req = new Request('http://localhost:3000/api/matches/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

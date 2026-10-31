import { describe, expect, it } from 'vitest';
import { detectImageMime } from '@/lib/profile/media';
import { consumeRateLimit, resetRateLimits } from '@/lib/profile/rate-limit';

describe('upload signature validation', () => {
  it('accepts JPEG, PNG and WebP signatures', () => {
    expect(detectImageMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))?.mime).toBe('image/jpeg');
    expect(
      detectImageMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))?.mime,
    ).toBe('image/png');
    expect(
      detectImageMime(
        new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]),
      )?.mime,
    ).toBe('image/webp');
  });

  it('rejects SVG, GIF and arbitrary payloads even when a client claims an image type', () => {
    expect(
      detectImageMime(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>')),
    ).toBeNull();
    expect(detectImageMime(new TextEncoder().encode('GIF89a'))).toBeNull();
    expect(detectImageMime(new TextEncoder().encode('not an image'))).toBeNull();
  });
});

describe('profile rate limiter', () => {
  it('allows a bounded burst and then rejects until the window resets', () => {
    resetRateLimits();
    const now = 1_000_000;
    expect(consumeRateLimit('update:user', 2, 60_000, now).allowed).toBe(true);
    expect(consumeRateLimit('update:user', 2, 60_000, now + 1).allowed).toBe(true);
    const blocked = consumeRateLimit('update:user', 2, 60_000, now + 2);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(consumeRateLimit('update:user', 2, 60_000, now + 60_001).allowed).toBe(true);
  });
});

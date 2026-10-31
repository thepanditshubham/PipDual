import { describe, expect, it } from 'vitest';
import {
  ProfileAccessError, assertNonSelf, assertProfileOwner, canViewProfile,
} from '@/lib/profile/access';

const OWNER = '11111111-1111-4111-8111-111111111111';
const VIEWER = '22222222-2222-4222-8222-222222222222';

describe('profile access', () => {
  it('always lets the owner view their own profile', () => {
    expect(
      canViewProfile({
        viewerId: OWNER,
        ownerId: OWNER,
        visibility: 'private',
        isFollowing: false,
      }),
    ).toBe(true);
  });

  it('allows anyone to view a public profile', () => {
    expect(
      canViewProfile({
        viewerId: null,
        ownerId: OWNER,
        visibility: 'public',
        isFollowing: false,
      }),
    ).toBe(true);
  });

  it('gates a followers-only profile on an accepted follow', () => {
    expect(
      canViewProfile({
        viewerId: VIEWER,
        ownerId: OWNER,
        visibility: 'followers',
        isFollowing: false,
      }),
    ).toBe(false);
    expect(
      canViewProfile({
        viewerId: VIEWER,
        ownerId: OWNER,
        visibility: 'followers',
        isFollowing: true,
      }),
    ).toBe(true);
  });

  it('never exposes a private profile to another viewer or anonymous visitor', () => {
    for (const viewerId of [VIEWER, null]) {
      expect(
        canViewProfile({ viewerId, ownerId: OWNER, visibility: 'private', isFollowing: true }),
      ).toBe(false);
    }
  });
});

describe('profile ownership', () => {
  it('rejects an anonymous editor with 401', () => {
    expect(() => assertProfileOwner(null, OWNER)).toThrow(ProfileAccessError);
    try {
      assertProfileOwner(null, OWNER);
    } catch (error) {
      expect((error as ProfileAccessError).status).toBe(401);
    }
  });

  it('rejects editing another account with 403', () => {
    try {
      assertProfileOwner(VIEWER, OWNER);
      throw new Error('expected assertProfileOwner to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ProfileAccessError);
      expect((error as ProfileAccessError).status).toBe(403);
    }
  });

  it('accepts the owner', () => {
    expect(() => assertProfileOwner(OWNER, OWNER)).not.toThrow();
  });

  it('blocks self-targeted social actions', () => {
    expect(() => assertNonSelf(OWNER, OWNER, 'follow')).toThrow(ProfileAccessError);
  });
});

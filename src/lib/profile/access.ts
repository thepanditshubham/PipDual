import type { ProfileVisibility } from './types';

export class ProfileAccessError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ProfileAccessError';
    this.status = status;
  }
}

/** Server-side ownership gate. The database repeats the check through RLS. */
export function assertProfileOwner(viewerId: string | null, ownerId: string): void {
  if (!viewerId) throw new ProfileAccessError('Sign in to edit a profile.', 401);
  if (viewerId !== ownerId) {
    throw new ProfileAccessError('You can only edit your own profile.', 403);
  }
}

/**
 * The same visibility rule get_player_profile() applies. Kept here so the UI
 * and tests can explain a restriction without ever reading private rows.
 */
export function canViewProfile(input: {
  viewerId: string | null;
  ownerId: string;
  visibility: ProfileVisibility;
  isFollowing: boolean;
}): boolean {
  if (input.viewerId === input.ownerId) return true;
  if (input.visibility === 'public') return true;
  if (input.visibility === 'followers') return input.isFollowing;
  return false;
}

export function assertNonSelf(viewerId: string | null, targetId: string, action: string): void {
  if (!viewerId) throw new ProfileAccessError('Sign in to continue.', 401);
  if (viewerId === targetId) {
    throw new ProfileAccessError(`You cannot ${action} your own profile.`, 400);
  }
}

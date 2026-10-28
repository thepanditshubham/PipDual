'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, Check, X, Swords, UserPlus, Loader2, Search } from 'lucide-react';
import { generateRoomCode } from '@/lib/matchmaking/matchmaker';
import { DEFAULT_MATCH_DURATION } from '@/lib/engine/constants';
import { stashRoomSession } from '@/lib/rooms/session';
import {
  fetchFriends,
  searchPlayers,
  sendFriendRequest,
  respondToRequest,
  removeFriendship,
  type FriendEntry,
  type PlayerSummary,
} from '@/lib/supabase/friends';
import { openInviteChannel, subscribePresence, type DuelInvite, type InviteChannel } from '@/lib/friends/realtime';
import {
  LOCAL_FRIENDS_NOTICE,
  applyLocalMessage,
  localAliases,
  localRemove,
  localRespond,
  localSendRequest,
  playerFromUsername,
  readLocalFriends,
  searchLocalContacts,
  subscribeLocalBus,
  type LocalIdentity,
} from '@/lib/friends/local';
import { sound } from '@/components/terminal/sound';
import type { UserProfile } from '@/lib/auth/types';
import { DEFAULT_AVATAR } from '@/lib/auth/avatar';

interface FriendsPanelProps {
  user: UserProfile | null;
  /** Shareable room link shown at the bottom of the card. */
  inviteCode: string;
}

/** The default silhouette every friend row wears until avatars sync. */
function Avatar({ name }: { name: string }) {
  return (
    <img
      src={DEFAULT_AVATAR}
      alt={name}
      className="w-6 h-6 shrink-0 border border-[var(--term-border-hi)] bg-[var(--term-raised)] object-cover"
    />
  );
}

export function FriendsPanel({ user, inviteCode }: FriendsPanelProps) {
  const router = useRouter();

  const [expanded, setExpanded] = useState(false);
  const [friends, setFriends] = useState<FriendEntry[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  // True when Supabase has no friends tables yet — the card runs on localStorage.
  const [localMode, setLocalMode] = useState(false);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlayerSummary[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState('');

  const [online, setOnline] = useState<Set<string>>(new Set());
  const [invite, setInvite] = useState<DuelInvite | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const selfId = user?.id ?? '';
  const displayName = user?.displayName || user?.username || 'Trader';
  // Guests have no row in `profiles`, so nobody can look them up by username.
  const searchable = !!user && !user.isGuest;

  const inviteSenderRef = useRef<InviteChannel['sendInvite'] | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const accepted = friends.filter((entry) => entry.relation === 'friend');
  const incoming = friends.filter((entry) => entry.relation === 'incoming');
  const outgoing = friends.filter((entry) => entry.relation === 'outgoing');
  const onlineFriends = accepted.filter((entry) => isOnline(entry)).length;

  /** Presence reports account ids and username aliases; match either. */
  function isOnline(entry: FriendEntry): boolean {
    return (
      online.has(entry.id) ||
      online.has(entry.username.toLowerCase()) ||
      online.has(entry.displayName.toLowerCase())
    );
  }

  /** Identity broadcast with presence, requests and accepts. */
  const identity: LocalIdentity = {
    id: selfId,
    username: user?.username || displayName,
    displayName,
    rating: user?.rating ?? 1200,
  };

  // ── Load the friends list (and again after every mutation) ──
  useEffect(() => {
    if (!selfId) return;
    let cancelled = false;

    (async () => {
      const { entries, error } = await fetchFriends(selfId);
      if (cancelled) return;

      if (error) {
        // Table missing (or Supabase unconfigured) — fall back to this browser.
        setLocalMode(true);
        setFriends(readLocalFriends(selfId));
        return;
      }

      setLocalMode(false);
      setFriends(entries);
    })();

    return () => {
      cancelled = true;
    };
  }, [selfId, reloadKey]);

  // ── Friend requests / accepts arriving from another tab ──
  useEffect(() => {
    if (!selfId || !user || !localMode) return;
    const mine = localAliases(identity);
    return subscribeLocalBus((message) => {
      if (applyLocalMessage(selfId, mine, message)) setReloadKey((key) => key + 1);
    });
    // `identity` is rebuilt every render; its tokens are what matter here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selfId, user, localMode, displayName]);

  // ── Presence: who of these players is online right now ──
  useEffect(() => {
    if (!selfId || !user) return;
    return subscribePresence(
      selfId,
      { username: displayName, rating: user.rating },
      setOnline,
    );
  }, [selfId, user, displayName]);

  // ── Duel invites addressed to me ──
  useEffect(() => {
    if (!selfId) return;
    const channel = openInviteChannel(
      selfId,
      { username: displayName, rating: user?.rating ?? 1200 },
      (payload) => {
        setInvite(payload);
        sound.playAlert();
      },
    );
    inviteSenderRef.current = channel.sendInvite;

    return () => {
      inviteSenderRef.current = null;
      channel.cleanup();
    };
  }, [selfId, displayName, user]);

  useEffect(() => {
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, []);

  // ── Search (debounced from the input handler, no effect churn) ──
  const runSearch = useCallback(
    (term: string) => {
      setQuery(term);
      if (searchTimer.current) clearTimeout(searchTimer.current);

      const value = term.trim();
      if (value.length < 2 || !selfId) {
        setResults([]);
        setSearching(false);
        setSearched('');
        return;
      }

      setSearching(true);
      searchTimer.current = setTimeout(async () => {
        if (localMode) {
          setResults(searchLocalContacts(selfId, value));
          setSearched(value);
          setSearching(false);
          return;
        }

        const { players, error } = await searchPlayers(value, selfId);
        setResults(players);
        setSearched(value);
        setSearching(false);
        if (error) setNotice(error);
      }, 280);
    },
    [selfId, localMode],
  );

  // ── Mutations ──
  const addFriend = async (player: PlayerSummary) => {
    sound.playClick();
    setBusyId(player.id);
    setNotice(null);

    const result = localMode
      ? localSendRequest(selfId, identity, player)
      : await sendFriendRequest(selfId, player.id);
    setBusyId(null);

    if (!result.ok) {
      setNotice(result.error ?? 'Could not send the request.');
      return;
    }

    setNotice(`Request sent to ${player.displayName}`);
    setResults((prev) => prev.filter((entry) => entry.id !== player.id));
    setReloadKey((key) => key + 1);
  };

  const answerRequest = async (entry: FriendEntry, accept: boolean) => {
    sound.playClick();
    setBusyId(entry.friendshipId);
    const result = localMode
      ? localRespond(selfId, identity, entry.friendshipId, accept)
      : await respondToRequest(entry.friendshipId, accept);
    setBusyId(null);

    if (!result.ok) {
      setNotice(result.error ?? 'Could not update the request.');
      return;
    }
    setNotice(accept ? `${entry.displayName} is now your friend` : 'Request declined');
    setReloadKey((key) => key + 1);
  };

  const removeFriend = async (entry: FriendEntry) => {
    sound.playClick();
    setBusyId(entry.friendshipId);
    const result = localMode
      ? localRemove(selfId, entry.friendshipId)
      : await removeFriendship(entry.friendshipId);
    setBusyId(null);

    if (!result.ok) {
      setNotice(result.error ?? 'Could not remove that friend.');
      return;
    }
    setNotice(`${entry.displayName} removed`);
    setReloadKey((key) => key + 1);
  };

  // ── Invite a friend into a fresh room (both land on the same seeded market) ──
  const inviteFriend = (entry: FriendEntry) => {
    sound.playClick();
    const room = generateRoomCode();
    const duration = DEFAULT_MATCH_DURATION;

    stashRoomSession(room, {
      mode: 'standard',
      opponent: 'live',
      duration,
      rivalName: entry.displayName,
      rivalRating: entry.rating,
      invitedBy: displayName,
    });

    inviteSenderRef.current?.(entry.id, {
      fromId: selfId,
      fromName: displayName,
      room,
      duration,
    });

    router.push(`/play/${room}`);
  };

  const joinInvite = () => {
    if (!invite) return;
    sound.playClick();
    stashRoomSession(invite.room, {
      mode: 'standard',
      opponent: 'live',
      duration: invite.duration,
      rivalName: invite.fromName,
      invitedBy: invite.fromName,
    });
    const { room } = invite;
    setInvite(null);
    router.push(`/play/${room}`);
  };

  const copyLink = () => {
    sound.playClick();
    if (typeof navigator === 'undefined' || !navigator.clipboard) return;
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    navigator.clipboard.writeText(`${origin}/play/${inviteCode}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const statusDot = (entry: FriendEntry) => (
    <span
      className={`absolute -bottom-0.5 -right-0.5 w-1.5 h-1.5 rounded-full border border-[var(--term-surface)] ${
        isOnline(entry) ? 'bg-[var(--term-buy-bright)]' : 'bg-[var(--term-border-hover)]'
      }`}
    />
  );

  // Offline mode: any typed username can be added, even without a directory.
  const typedPlayer =
    localMode && query.trim().length >= 2 ? playerFromUsername(query) : null;
  const typedKnown =
    !!typedPlayer &&
    (friends.some(
      (entry) =>
        entry.id === typedPlayer.id || entry.username.toLowerCase() === typedPlayer.username,
    ) ||
      results.some((player) => player.id === typedPlayer.id));

  return (
    <div className="bg-[var(--term-surface)]/70 backdrop-blur-md border border-[var(--term-border)] rounded-lg p-3.5 space-y-2.5">
      {/* Header: count, online friends, expand toggle */}
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-bold text-[var(--term-strong)] uppercase font-mono tracking-wider text-xs">Friends</span>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--term-raised)] border border-[var(--term-border-hi)] text-[var(--term-label)] whitespace-nowrap">
            {accepted.length}
            {onlineFriends > 0 && <span className="text-[var(--term-buy-bright)]"> · {onlineFriends} online</span>}
          </span>
        </div>

        <button
          onClick={() => {
            sound.playClick();
            setExpanded((value) => !value);
          }}
          title={expanded ? 'Collapse' : 'Expand'}
          aria-label={expanded ? 'Collapse friends' : 'Expand friends'}
          className="w-6 h-6 rounded bg-[var(--term-raised)] hover:bg-[var(--term-raised-hi)] border border-[var(--term-border-hi)] hover:border-[var(--term-accent)] flex items-center justify-center text-[var(--term-label)] hover:text-[var(--term-strong)] transition-all cursor-pointer shadow-sm active:scale-95 shrink-0"
        >
          <ChevronDown
            size={14}
            className={`transition-transform duration-200 text-[var(--term-soft)] hover:text-[var(--term-strong)] ${
              expanded ? 'rotate-180' : 'rotate-0'
            }`}
          />
        </button>
      </div>

      {/* Incoming duel invite */}
      {invite && (
        <div className="rounded border border-[var(--term-accent)]/50 bg-[var(--term-accent)]/10 p-2 space-y-1.5">
          <div className="flex items-start gap-2">
            <Swords size={14} className="text-[var(--term-accent)] mt-0.5 shrink-0" />
            <p className="text-[11px] text-[var(--term-text)] leading-snug flex-1">
              <span className="font-bold text-[var(--term-strong)]">{invite.fromName}</span> invited you to a {invite.duration} duel
            </p>
            <button
              onClick={() => setInvite(null)}
              aria-label="Dismiss invite"
              className="text-[var(--term-soft)] hover:text-[var(--term-strong)] transition-colors cursor-pointer"
            >
              <X size={12} />
            </button>
          </div>
          <button
            onClick={joinInvite}
            className="w-full h-7 rounded bg-[var(--term-accent)] hover:bg-[var(--term-accent-hi)] text-white text-[11px] font-bold cursor-pointer transition-colors"
          >
            Join duel
          </button>
        </div>
      )}

      {/* Body */}
      {expanded && (
        <div className="space-y-2 animate-in fade-in duration-150">
          {searchable ? (
            <>
              <div className="relative">
                <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--term-muted)]" />
                <input
                  value={query}
                  onChange={(event) => runSearch(event.target.value)}
                  placeholder="Add friend by username"
                  spellCheck={false}
                  className="w-full h-8 pl-7 pr-7 rounded bg-[var(--term-raised)] border border-[var(--term-border-hi)] focus:border-[var(--term-accent)] outline-none text-[11px] font-mono text-[var(--term-strong)] placeholder:text-[var(--term-dim)]"
                />
                {searching && (
                  <Loader2 size={11} className="absolute right-2 top-1/2 -translate-y-1/2 animate-spin text-[var(--term-soft)]" />
                )}
              </div>

              {results.length > 0 && (
                <ul className="space-y-1">
                  {results.map((player) => (
                    <li
                      key={player.id}
                      className="flex items-center gap-2 rounded bg-[var(--term-raised)]/70 border border-[var(--term-border-hi)] px-2 py-1.5"
                    >
                      <Avatar name={player.displayName} />
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] text-[var(--term-strong)] font-semibold truncate">{player.displayName}</p>
                        <p className="text-[10px] font-mono text-[var(--term-soft)] truncate">
                          {player.rating} ELO · @{player.username}
                        </p>
                      </div>
                      <button
                        onClick={() => void addFriend(player)}
                        disabled={busyId === player.id}
                        className="h-6 px-2 rounded bg-[var(--term-accent)] hover:bg-[var(--term-accent-hi)] disabled:opacity-50 text-white text-[10px] font-bold cursor-pointer transition-colors shrink-0"
                      >
                        {busyId === player.id ? '…' : 'Add'}
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {!searching && searched.length >= 2 && results.length === 0 && !typedPlayer && (
                <p className="text-[10px] font-mono text-[var(--term-muted)] px-1">No player found for “{searched}”.</p>
              )}

              {typedPlayer && !typedKnown && (
                <button
                  onClick={() => void addFriend(typedPlayer)}
                  disabled={busyId === typedPlayer.id}
                  className="w-full flex items-center gap-2 rounded bg-[var(--term-accent)]/10 border border-[var(--term-accent)]/40 px-2 py-1.5 text-left hover:bg-[var(--term-accent)]/20 disabled:opacity-50 cursor-pointer transition-colors"
                >
                  <Avatar name={typedPlayer.displayName} />
                  <span className="min-w-0 flex-1 text-[11px] text-[var(--term-strong)] font-semibold truncate">
                    Add “{typedPlayer.displayName}”
                  </span>
                  <UserPlus size={12} className="text-[var(--term-accent)] shrink-0" />
                </button>
              )}

              {incoming.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--term-soft)]">
                    Requests · {incoming.length}
                  </p>
                  {incoming.map((entry) => (
                    <div
                      key={entry.friendshipId}
                      className="flex items-center gap-2 rounded bg-[var(--term-raised)]/70 border border-[var(--term-accent)]/30 px-2 py-1.5"
                    >
                      <Avatar name={entry.displayName} />
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] text-[var(--term-strong)] font-semibold truncate">{entry.displayName}</p>
                        <p className="text-[10px] font-mono text-[var(--term-soft)] truncate">wants to be friends</p>
                      </div>
                      <button
                        onClick={() => void answerRequest(entry, true)}
                        disabled={busyId === entry.friendshipId}
                        title="Accept"
                        className="w-6 h-6 rounded bg-[var(--term-buy-bright)]/15 border border-[var(--term-buy-bright)]/40 text-[var(--term-buy-bright)] hover:bg-[var(--term-buy-bright)]/25 disabled:opacity-50 flex items-center justify-center cursor-pointer transition-colors"
                      >
                        <Check size={12} />
                      </button>
                      <button
                        onClick={() => void answerRequest(entry, false)}
                        disabled={busyId === entry.friendshipId}
                        title="Decline"
                        className="w-6 h-6 rounded bg-[var(--term-raised)] border border-[var(--term-border-hi)] text-[var(--term-soft)] hover:text-[var(--term-sell)] hover:border-[var(--term-sell)]/40 disabled:opacity-50 flex items-center justify-center cursor-pointer transition-colors"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {accepted.length + outgoing.length === 0 && incoming.length === 0 ? (
                <div className="py-2.5 px-2 text-center text-[10px] text-[var(--term-muted)] font-mono border border-dashed border-[var(--term-border)] rounded-lg">
                  <UserPlus size={14} className="mx-auto mb-1 opacity-50" />
                  No friends yet — search a username above
                </div>
              ) : (
                <ul className="space-y-1">
                  {accepted.map((entry) => (
                    <li
                      key={entry.friendshipId}
                      className="group flex items-center gap-2 rounded border border-transparent hover:border-[var(--term-border-hi)] hover:bg-[var(--term-raised)]/70 px-2 py-1.5 transition-colors"
                    >
                      <span className="relative">
                        <Avatar name={entry.displayName} />
                        {statusDot(entry)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] text-[var(--term-strong)] font-semibold truncate">{entry.displayName}</p>
                        <p className="text-[10px] font-mono text-[var(--term-soft)] truncate">
                          {entry.rating} ELO{isOnline(entry) ? ' · online' : ''}
                        </p>
                      </div>
                      <button
                        onClick={() => inviteFriend(entry)}
                        title={`Invite ${entry.displayName} to a duel`}
                        className="w-6 h-6 rounded bg-[var(--term-raised)] border border-[var(--term-border-hi)] text-[var(--term-label)] hover:text-[var(--term-accent)] hover:border-[var(--term-accent)]/50 flex items-center justify-center cursor-pointer transition-colors"
                      >
                        <Swords size={12} />
                      </button>
                      <button
                        onClick={() => void removeFriend(entry)}
                        disabled={busyId === entry.friendshipId}
                        title="Remove friend"
                        className="w-6 h-6 rounded bg-[var(--term-raised)] border border-[var(--term-border-hi)] text-[var(--term-label)] hover:text-[var(--term-sell)] hover:border-[var(--term-sell)]/50 disabled:opacity-50 flex items-center justify-center cursor-pointer transition-colors"
                      >
                        <X size={12} />
                      </button>
                    </li>
                  ))}

                  {outgoing.map((entry) => (
                    <li
                      key={entry.friendshipId}
                      className="flex items-center gap-2 rounded border border-transparent px-2 py-1.5"
                    >
                      <span className="relative">
                        <Avatar name={entry.displayName} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] text-[var(--term-label)] font-semibold truncate">{entry.displayName}</p>
                        <p className="text-[10px] font-mono text-[var(--term-muted)] truncate">request pending</p>
                      </div>
                      <button
                        onClick={() => void removeFriend(entry)}
                        disabled={busyId === entry.friendshipId}
                        title="Cancel request"
                        className="w-6 h-6 rounded bg-[var(--term-raised)] border border-[var(--term-border-hi)] text-[var(--term-soft)] hover:text-[var(--term-sell)] hover:border-[var(--term-sell)]/50 disabled:opacity-50 flex items-center justify-center cursor-pointer transition-colors"
                      >
                        <X size={12} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <div className="py-2.5 px-2 text-center text-[10px] text-[var(--term-muted)] font-mono border border-dashed border-[var(--term-border)] rounded-lg">
              <UserPlus size={14} className="mx-auto mb-1 opacity-50" />
              Sign in with an account to add friends
            </div>
          )}
        </div>
      )}

      {localMode && !notice && (
        <p className="text-[10px] font-mono text-[var(--term-muted)] leading-snug">{LOCAL_FRIENDS_NOTICE}</p>
      )}
      {notice && <p className="text-[10px] font-mono text-[var(--term-amber)] leading-snug">{notice}</p>}

      {/* Shareable room link */}
      <div className="pt-1 flex items-center justify-between text-[11px] font-mono text-[var(--term-soft)]">
        <span className="truncate">pipduel.com/play/{inviteCode}</span>
        <button
          onClick={copyLink}
          className="text-[var(--term-accent)] hover:underline cursor-pointer shrink-0 ml-1.5 font-bold"
        >
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

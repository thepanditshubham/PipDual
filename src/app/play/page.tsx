'use client';

import { useCallback, useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Swords, Bot, KeyRound, Trophy, HelpCircle, Crosshair,
  Settings as SettingsIcon, Mail, Gift, Headphones,
  Shield, Coins, ChevronDown,
  Volume2, VolumeX, Clock, ArrowLeft, AlertCircle, CheckCircle2,
  ExternalLink, User, Ticket, Pencil, LogIn, LogOut,
  AlertTriangle
} from 'lucide-react';
import { useAuthStore } from '@/lib/auth/store';
import { DEFAULT_AVATAR } from '@/lib/auth/avatar';
import { getSupabase } from '@/lib/supabase/client';
import { sound } from '@/components/terminal/sound';
import { joinMatchmakingQueue, generateRoomCode, type QueuePlayer, type QueueScope, type MatchFoundPayload } from '@/lib/matchmaking/matchmaker';
import {
  joinChallengeBoard, makeChallengeId, CHALLENGE_MAX_STAKE,
  withDemoChallenges, isDemoChallenge,
  type DuelChallenge, type ChallengeBoardHandle, type ChallengeMatchPayload,
} from '@/lib/challenges/challenge-board';
import { MATCH_DURATIONS, DEFAULT_MATCH_DURATION, type MatchDurationId } from '@/lib/engine/constants';
import { stashRoomSession } from '@/lib/rooms/session';
import { FriendsPanel } from '@/components/lobby/friends-panel';
import { WalletCard, WalletPanel, WALLET_TABS, type WalletTab } from '@/components/wallet';
import { TerminalModeToggle, useTerminalMode } from '@/components/terminal/theme-mode';
import { ProgressPanel, ProgressCelebrations } from '@/components/progress';
import { useProgressStore } from '@/lib/progress/store';
import { rankPosition } from '@/lib/progress/rank';
import { levelFromXp } from '@/lib/progress/xp';
import { claimableMissionCount } from '@/lib/progress/missions';
import { ACHIEVEMENTS } from '@/lib/progress/config';
import { liveFeeFor, potFor } from '@/lib/economy/stakes';
import {
  fetchMyMails,
  formatMailStamp,
  markMailRead,
  readCachedMails,
  saveMailCache,
  type PlayerMail,
} from '@/lib/supabase/mail';

const PAIRS = [
  { symbol: 'XAU/USD', name: 'Gold / US Dollar', spread: '0.3' },
  { symbol: 'GBP/USD', name: 'British Pound / US Dollar', spread: '0.9' },
  { symbol: 'USD/JPY', name: 'US Dollar / Japanese Yen', spread: '0.8' },
  { symbol: 'BTC/USD', name: 'Bitcoin / US Dollar', spread: '2.0' },
];

// Ticket duration options are derived from the engine's match-length table so the
// ticket and the battle timer can never drift apart.
const DURATIONS: { id: MatchDurationId; label: string }[] = (
  Object.keys(MATCH_DURATIONS) as MatchDurationId[]
).map((id) => ({ id, label: id.replace('m', ' min') }));

// Timestamp source kept at module scope: a render-defined handler calling
// Date.now() reads to the React purity lint as an impure call during render,
// but funnelling it through this helper keeps the call out of the component.
const epochMs = () => Date.now();

function getTierBadge(rating: number) {
  if (rating >= 1600) return { label: 'Grandmaster', color: '#f59e0b' };
  if (rating >= 1500) return { label: 'Master', color: '#a855f7' };
  if (rating >= 1400) return { label: 'Diamond', color: '#38bdf8' };
  if (rating >= 1300) return { label: 'Platinum', color: '#2dd4bf' };
  if (rating >= 1250) return { label: 'Gold', color: '#fb923c' };
  return { label: 'Silver II', color: '#94a3b8' };
}

function PlayLobbyContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, logout, syncFromSupabase, addCoins, spendCoins, history } = useAuthStore();
  const [mounted, setMounted] = useState(false);

  // Core Ticket Configuration
  const [selectedPair] = useState('XAU/USD');
  const [selectedDuration, setSelectedDuration] = useState<MatchDurationId>(DEFAULT_MATCH_DURATION);
  /** Live stake in coins, editable in the ticket. Defaults to the 100-coin entry;
   *  raising it (in steps of 100) turns the button into a challenge post. */
  const [stakeInput, setStakeInput] = useState('100');
  /** Live charges a coin entry and pays the pot; Demo and bot are free. */
  const [mode, setMode] = useState<'live' | 'demo' | 'bot'>('live');
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [showCodeInput, setShowCodeInput] = useState(false);

  // Matchmaking Queue
  const [queueing, setQueueing] = useState(false);
  const [queueTimer, setQueueTimer] = useState(0);
  // Unique session ID per tab (stable for lifetime of this page load)
  const [sessionId] = useState<string>(() => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return 'ply_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 11);
  });
  const [queueStatus, setQueueStatus] = useState<'searching' | 'matched'>('searching');
  /** Why a Live queue could not be entered (short wallet), shown under the button. */
  const [queueNotice, setQueueNotice] = useState<string | null>(null);
  const [matchedRival, setMatchedRival] = useState<QueuePlayer | null>(null);
  const [activeQueueCount, setActiveQueueCount] = useState<number>(0);
  const [matchFoundData, setMatchFoundData] = useState<{ payload: import('@/lib/matchmaking/matchmaker').MatchFoundPayload; mode: string } | null>(null);
  const [matchFoundCountdown, setMatchFoundCountdown] = useState(5);
  const matchCdTimerRef = useRef<NodeJS.Timeout | null>(null);
  // Stable refs so the queue effect doesn't restart on every user/mode state change
  const userRef = useRef(user);
  const modeRef = useRef(mode);
  useEffect(() => { userRef.current = user; }, [user]);
  useEffect(() => { modeRef.current = mode; }, [mode]);
  const [friendsInviteCode] = useState<string>(() => generateRoomCode());
  // Live lobby online count via Supabase Realtime Presence
  const [onlineCount, setOnlineCount] = useState<number>(0);

  // Challenge board — open duels above the fixed Live entry, published on the
  // same Realtime channel the queue uses. `challenges` is the shared board;
  // `myChallenge` is this tab's own posted card (null when nothing is open).
  // Seeded with demo opponents so an empty board still reads as a busy lobby.
  const [challenges, setChallenges] = useState<DuelChallenge[]>(() => withDemoChallenges([]));
  const [myChallenge, setMyChallenge] = useState<DuelChallenge | null>(null);
  // id of the challenge this tab has asked to accept, while we await the host.
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const boardRef = useRef<ChallengeBoardHandle | null>(null);
  // Pending simulated accept against a demo opponent (no real host to answer).
  const demoAcceptRef = useRef<NodeJS.Timeout | null>(null);

  // Center column tab: the Match Ticket, the Progress screen (5 sub-tabs), or
  // one of the utility screens the rail and the wallet card open. Money is a
  // center-column screen too — the wallet card only points at it.
  const [centerTab, setCenterTab] = useState<
    'ticket' | 'progress' | 'settings' | 'mail' | 'redeem' | 'support' | 'wallet'
  >('ticket');
  // Which half of the money flow the wallet card asked for.
  const [walletTab, setWalletTab] = useState<WalletTab>('deposit');

  const openWallet = (tab: WalletTab) => {
    sound.playClick();
    setWalletTab(tab);
    setCenterTab('wallet');
  };

  // Mailbox. Letters are written server-side by the deposit and payout
  // triggers, so the same inbox follows the player across devices.
  const [mailItems, setMailItems] = useState<PlayerMail[]>([]);
  const [mailUnavailable, setMailUnavailable] = useState(false);
  const [expandedMailId, setExpandedMailId] = useState<string | null>(null);
  const mailUserId = user && !user.isGuest ? user.id : '';

  // Redeem Promo
  const [redeemCode, setRedeemCode] = useState('');
  const [redeemFeedback, setRedeemFeedback] = useState<{ status: 'success' | 'error' | ''; msg: string }>({ status: '', msg: '' });

  // Sound
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Shared terminal light/dark mode (same switch as the battle terminal)
  const themeMode = useTerminalMode();

  const currentUser = mounted ? user : null;
  const userRating = currentUser?.rating ?? 1200;
  const tier = getTierBadge(userRating);

  // Economy — one currency, derived from the Supabase-synced wallet
  const userCoins = Math.floor(currentUser?.virtualBalance ?? 0);
  const [balanceSyncing, setBalanceSyncing] = useState(true);

  // Progress system (local snapshot, mirrored to Supabase when available)
  const progressUserId = useProgressStore((s) => s.userId);
  const progressXp = useProgressStore((s) => s.xp);
  const progressRank = useProgressStore((s) => s.rank);
  const progressStats = useProgressStore((s) => s.stats);
  const progressMissions = useProgressStore((s) => s.missions);
  const progressPinned = useProgressStore((s) => s.pinned);
  const progressTitle = useProgressStore((s) => s.activeTitle);
  const bindProgress = useProgressStore((s) => s.bindUser);

  /*
   * Live prices the ticket, Demo never does. The entry is charged the moment a
   * rival is matched (before the room opens), so queueing while broke is free —
   * and the affordability check below stops that player from queueing at all.
   */
  const entryFee = mode === 'live' ? liveFeeFor(selectedDuration) : 0;
  const ticketFee = liveFeeFor(selectedDuration);
  const ticketPot = potFor(ticketFee);
  const canAffordEntry = userCoins >= entryFee;

  /*
   * Ticket stake drives the challenge flow. At the standard entry the Live
   * button quick-matches; any multiple of 100 above it turns that button into a
   * challenge post, and the lobby waits for a rival to accept it.
   */
  const ticketStake = Math.floor(Number(stakeInput));
  const isChallengeMode = mode === 'live' && Number.isFinite(ticketStake) && ticketStake > ticketFee;
  const challengeValid =
    Number.isFinite(ticketStake) && ticketStake > ticketFee && ticketStake <= CHALLENGE_MAX_STAKE;
  const challengeAffordable = Number.isFinite(ticketStake) && ticketStake <= userCoins;
  const clampStake = (n: number) =>
    Number.isFinite(n)
      ? Math.max(ticketFee, Math.min(CHALLENGE_MAX_STAKE, Math.round(n / 100) * 100))
      : ticketFee;

  const level = levelFromXp(progressXp);
  const rankPositionValue = rankPosition(progressRank.rp);
  const progressPlayed = progressStats.matches;
  const progressWinRate = progressPlayed > 0 ? Math.round((progressStats.wins / progressPlayed) * 100) : 0;
  const claimableMissions = claimableMissionCount(progressMissions);
  const progressReady = mounted && Boolean(progressUserId);
  const unreadMailCount = mailItems.filter((m) => !m.read).length;

  const mailFetchedAt = useRef(0);

  const loadMail = useCallback(async (playerId: string) => {
    // The mount read, the tab-open read and a realtime push can land within
    // the same second; one round trip is enough for all three.
    const now = Date.now();
    if (now - mailFetchedAt.current < 2500) return;
    mailFetchedAt.current = now;

    const mails = await fetchMyMails(playerId);
    if (mails === null) {
      setMailUnavailable(true);
      return;
    }

    setMailUnavailable(false);
    setMailItems(mails);
  }, []);

  // Paint the cached inbox immediately; the network read replaces it when it
  // lands. On a slow link this is the difference between an empty mailbox and
  // the letters the player already received.
  useEffect(() => {
    if (!mailUserId) return;
    const cached = readCachedMails(mailUserId);
    if (cached.length === 0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMailItems(cached);
  }, [mailUserId]);

  // The rail badge needs the unread count before the mailbox is opened.
  useEffect(() => {
    if (!mailUserId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadMail(mailUserId);
  }, [mailUserId, loadMail]);

  // Re-read on every open so an approval that landed while the lobby was open
  // arrives without a page refresh.
  useEffect(() => {
    if (centerTab !== 'mail' || !mailUserId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadMail(mailUserId);
  }, [centerTab, mailUserId, loadMail]);

  // Realtime push: a trigger-written letter appears while the player watches.
  useEffect(() => {
    if (!mailUserId) return;
    const supabase = getSupabase();
    if (!supabase) return;

    const channel = supabase
      .channel(`player-mail:${mailUserId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'player_mails',
          filter: `player_id=eq.${mailUserId}`,
        },
        () => {
          mailFetchedAt.current = 0;
          void loadMail(mailUserId);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [mailUserId, loadMail]);

  // Realtime needs the table in the supabase_realtime publication. Until that
  // is applied, poll while the mailbox is open so a decision still lands.
  useEffect(() => {
    if (centerTab !== 'mail' || !mailUserId) return;
    const timer = setInterval(() => {
      mailFetchedAt.current = 0;
      void loadMail(mailUserId);
    }, 15000);
    return () => clearInterval(timer);
  }, [centerTab, mailUserId, loadMail]);

  const [authChecked, setAuthChecked] = useState(false);

  // Mount-only: reset stale match/queue state + fetch live leaderboard (runs once)
  useEffect(() => {
    setMounted(true);
    setMatchFoundData(null);
    setMatchedRival(null);
    setQueueing(false);
    setQueueStatus('searching');

    const modeParam = searchParams.get('mode');
    // Older links carry friendly/ranked; they map onto Demo/Live. 'standard' and
    // 'risk' name the scoring rules, not the staking table, so they are ignored.
    if (modeParam === 'demo' || modeParam === 'friendly') setMode('demo');
    if (modeParam === 'live' || modeParam === 'ranked') setMode('live');
    if (modeParam === 'bot') setMode('bot');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live lobby presence: track this visitor so the online counter is real
  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;

    const presenceKey = sessionId;
    const lobbyChannel = supabase.channel('pipduel_lobby_presence', {
      config: { presence: { key: presenceKey } },
    });

    const countPresence = () => {
      const state = lobbyChannel.presenceState();
      // Each key is one browser tab; count unique keys
      const count = Object.keys(state).length;
      setOnlineCount(Math.max(1, count));
    };

    lobbyChannel
      .on('presence', { event: 'sync' }, countPresence)
      .on('presence', { event: 'join' }, countPresence)
      .on('presence', { event: 'leave' }, countPresence)
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await lobbyChannel.track({ userId: user?.id ?? presenceKey, at: Date.now() });
          countPresence();
        }
      });

    return () => {
      lobbyChannel.untrack().catch(() => {});
      supabase.removeChannel(lobbyChannel);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Auth check: runs when user changes (Zustand rehydration / login / logout)
  useEffect(() => {
    const verifyAuth = async () => {
      if (user) {
        setAuthChecked(true);
        syncFromSupabase(user.id)
          .catch(() => {})
          .finally(() => setBalanceSyncing(false));
        return;
      }

      // Check if Zustand rehydrates from localStorage
      if (typeof window !== 'undefined') {
        const stored = localStorage.getItem('pip-duel-auth-storage');
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            if (parsed?.state?.user) {
              setAuthChecked(true);
              setBalanceSyncing(false);
              return;
            }
          } catch {}
        }
      }

      // Check if Supabase has an active session
      const supabase = getSupabase();
      if (supabase) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          setAuthChecked(true);
          return;
        }
      }

      // No user session found anywhere
      router.push('/login');
    };

    verifyAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Bind the persisted progress snapshot to the signed-in account.
  useEffect(() => {
    if (!user?.id) return;
    bindProgress(user.id);
  }, [user?.id, bindProgress]);

  // Matchmaking Queue listener — only re-runs when queueing toggles
  useEffect(() => {
    if (!queueing) {
      setQueueStatus('searching');
      setMatchedRival(null);
      setQueueTimer(0);
      return;
    }

    // Read latest values from refs (stable — won't cause re-runs)
    const currentUser = userRef.current;

    // Live and Demo never share a queue: a coin pot must not settle against an
    // opponent who chose the free table.
    const scope: QueueScope = modeRef.current === 'demo' ? 'demo' : 'live';
    const entry = scope === 'live' ? liveFeeFor(selectedDuration) : 0;

    const timerInterval = setInterval(() => {
      setQueueTimer((prev) => prev + 1);
    }, 1000);

    const player: QueuePlayer = {
      id: sessionId,
      userId: currentUser?.id,
      username: currentUser?.username || 'Trader_' + sessionId.slice(-4),
      rating: currentUser?.rating || 1200,
      duration: selectedDuration,
      joinedAt: Date.now(),
    };

    const cleanupQueue = joinMatchmakingQueue({
      scope,
      duration: selectedDuration,
      player,
      onStatusChange: (status, count) => {
        setQueueStatus(status);
        setActiveQueueCount(count);
      },
      onMatchFound: (match: MatchFoundPayload) => {
        setQueueStatus('matched');
        setMatchedRival(match.rival);
        sound.playAlert();
        // Show 5-second opponent reveal modal before navigating
        setMatchFoundData({ payload: match, mode: 'standard' });
        setMatchFoundCountdown(5);
        let count = 5;

        if (matchCdTimerRef.current) clearInterval(matchCdTimerRef.current);
        matchCdTimerRef.current = setInterval(() => {
          count -= 1;
          setMatchFoundCountdown(count);
          if (count <= 0) {
            if (matchCdTimerRef.current) {
              clearInterval(matchCdTimerRef.current);
              matchCdTimerRef.current = null;
            }

            /*
             * The entry is charged here, not when the queue started: leaving a
             * queue costs nothing. Reading the wallet at the last moment also
             * means a deposit made mid-queue is honoured by this match.
             */
            if (entry > 0 && !spendCoins(entry)) {
              setQueueNotice(
                `Live entry needs ${entry.toLocaleString()} coins and the wallet fell short. Deposit or drop to Demo.`,
              );
              setQueueing(false);
              return;
            }

            // Navigate directly without clearing matchFoundData first so the
            // Match Found screen stays smoothly visible until the terminal page mounts.
            setQueueing(false);

            // Store match details in sessionStorage to keep the URL ultra clean: /play/ABCDE-FGHIJ
            stashRoomSession(match.roomCode, {
              mode: 'standard',
              opponent: 'live',
              seed: match.seed,
              startAt: match.startAt,
              duration: selectedDuration,
              rivalName: match.rival.username,
              rivalRating: match.rival.rating,
              ranked: scope === 'live',
              stake: entry > 0 ? entry : undefined,
            });

            // Clean short URL
            router.push(`/play/${match.roomCode}`);
          }
        }, 1000);
      },
      onError: (err) => {
        console.warn('Realtime matchmaking error:', err);
      },
    });

    return () => {
      clearInterval(timerInterval);
      if (matchCdTimerRef.current) {
        clearInterval(matchCdTimerRef.current);
        matchCdTimerRef.current = null;
      }
      cleanupQueue();
    };
    // Only re-run when queueing toggles or the ticket duration changes — user/mode read from refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queueing, selectedDuration]);

  const handleLaunchBotMatch = () => {
    sound.playClick();
    const botRoom = generateRoomCode();
    // Practice matches always run the 5-minute format, whatever the ticket says.
    stashRoomSession(botRoom, {
      mode: 'standard',
      opponent: 'bot',
      duration: DEFAULT_MATCH_DURATION,
      ranked: false,
    });
    router.push(`/play/${botRoom}`);
  };

  const handleJoinWithCode = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    sound.playClick();
    if (roomCodeInput.length === 5) {
      const code = roomCodeInput.toUpperCase();
      stashRoomSession(code, { duration: selectedDuration, ranked: false });
      router.push(`/play/${code}`);
    }
  };

  const handleFindMatch = () => {
    sound.playClick();
    if (mode === 'bot') {
      handleLaunchBotMatch();
      return;
    }
    // Blocked before queueing so nobody ever gets matched into a table they
    // cannot pay for — the charge itself happens on pairing.
    if (mode === 'live' && !canAffordEntry) {
      setQueueNotice(
        `Live entry is ${entryFee.toLocaleString()} coins · you hold ${userCoins.toLocaleString()}. Deposit coins or drop to Demo.`,
      );
      return;
    }
    setQueueNotice(null);
    setQueueing(true);
  };

  /* ──────────────────────────────────────────────────────────
     CHALLENGE BOARD — post a stake above the Live entry, accept another
     trader's, and drop straight into a duel at that stake (no queue).
  ────────────────────────────────────────────────────────── */
  // Stake that starts a duel: reuse the Match Found reveal, then charge both
  // entrants and open the room. Everything here is stable setters/refs, so the
  // board can capture it once without going stale.
  const startChallengeMatch = (match: ChallengeMatchPayload) => {
    if (matchCdTimerRef.current) clearInterval(matchCdTimerRef.current);
    if (demoAcceptRef.current) {
      clearTimeout(demoAcceptRef.current);
      demoAcceptRef.current = null;
    }
    // Leave the normal queue if one is running: the challenge owns the reveal
    // timer now, and we must not be paired into two matches at once.
    setQueueing(false);
    setSelectedDuration(match.duration);

    const rival: QueuePlayer = {
      id: `chalrival_${match.roomCode}`,
      username: match.rival.username,
      rating: match.rival.rating,
      duration: match.duration,
      joinedAt: epochMs(),
    };
    setMatchedRival(rival);
    setMatchFoundData({
      payload: { roomCode: match.roomCode, seed: match.seed, startAt: match.startAt, rival },
      mode: 'standard',
    });
    setMatchFoundCountdown(5);
    setAcceptingId(null);
    sound.playAlert();

    let count = 5;
    matchCdTimerRef.current = setInterval(() => {
      count -= 1;
      setMatchFoundCountdown(count);
      if (count > 0) return;
      if (matchCdTimerRef.current) {
        clearInterval(matchCdTimerRef.current);
        matchCdTimerRef.current = null;
      }

      // The stake is only charged here — backing out (or a short wallet) before
      // this point costs nothing, mirroring the Live queue.
      if (!spendCoins(match.stake)) {
        setMatchFoundData(null);
        setQueueNotice(
          `That duel needs ${match.stake.toLocaleString()} coins and the wallet fell short. Deposit more.`,
        );
        return;
      }

      stashRoomSession(match.roomCode, {
        mode: 'standard',
        opponent: 'live',
        seed: match.seed,
        startAt: match.startAt,
        duration: match.duration,
        rivalName: match.rival.username,
        rivalRating: match.rival.rating,
        ranked: true,
        stake: match.stake,
      });
      setMyChallenge(null);
      boardRef.current?.retract();
      router.push(`/play/${match.roomCode}`);
    }, 1000);
  };

  const handlePostChallengeFromTicket = () => {
    sound.playClick();
    const stake = ticketStake;
    // Snap a hand-typed value back to a multiple of 100 before anything else.
    if (Number.isFinite(stake) && stake > ticketFee && stake % 100 !== 0) {
      setStakeInput(String(clampStake(stake)));
      setQueueNotice('Challenge stakes move in steps of 100 coins.');
      return;
    }
    if (!challengeValid) {
      setQueueNotice(
        `A challenge must beat the ${ticketFee.toLocaleString()}-coin entry and stay at or under ${CHALLENGE_MAX_STAKE.toLocaleString()} coins.`,
      );
      return;
    }
    if (!challengeAffordable) {
      setQueueNotice(
        `You hold ${userCoins.toLocaleString()} coins — a ${stake.toLocaleString()}-coin challenge is out of reach.`,
      );
      return;
    }
    if (!boardRef.current) {
      setQueueNotice('The challenge board is offline right now.');
      return;
    }
    setQueueNotice(null);
    const challenge: DuelChallenge = {
      id: makeChallengeId(),
      posterId: sessionId,
      username: user?.username || 'Trader_' + sessionId.slice(-4),
      rating: user?.rating || 1200,
      stake,
      duration: selectedDuration,
      createdAt: epochMs(),
    };
    boardRef.current.post(challenge);
    setMyChallenge(challenge);
  };

  const handleCancelChallenge = () => {
    sound.playClick();
    boardRef.current?.retract();
    setMyChallenge(null);
  };

  const handleAcceptChallenge = (challenge: DuelChallenge) => {
    sound.playClick();
    if (challenge.stake > userCoins) {
      setQueueNotice(
        `Accepting needs ${challenge.stake.toLocaleString()} coins · you hold ${userCoins.toLocaleString()}.`,
      );
      return;
    }
    setQueueNotice(null);

    // Demo opponents have no real tab to answer — simulate the host accepting
    // back after a short beat so the whole flow can be exercised solo.
    if (isDemoChallenge(challenge.id)) {
      setAcceptingId(challenge.id);
      if (demoAcceptRef.current) clearTimeout(demoAcceptRef.current);
      demoAcceptRef.current = setTimeout(() => {
        demoAcceptRef.current = null;
        startChallengeMatch({
          roomCode: generateRoomCode(),
          seed: Math.floor(100000 + Math.random() * 900000),
          startAt: epochMs() + 8000,
          stake: challenge.stake,
          duration: challenge.duration,
          rival: { username: challenge.username, rating: challenge.rating },
        });
      }, 1400);
      return;
    }

    if (!boardRef.current) {
      setQueueNotice('The challenge board is offline right now.');
      return;
    }
    setAcceptingId(challenge.id);
    boardRef.current.accept(challenge);
  };

  // Stay on the board for the whole session so the list is live and an accepted
  // challenge can reach us. Only the identity we publish matters for reconnects.
  useEffect(() => {
    if (!mounted || !user) return;
    const handle = joinChallengeBoard({
      me: {
        sessionId,
        userId: user.id ?? null,
        username: user.username || 'Trader_' + sessionId.slice(-4),
        rating: user.rating || 1200,
      },
      onBoard: (live) => setChallenges(withDemoChallenges(live)),
      onMatchFound: startChallengeMatch,
      onError: (err) => console.warn('Challenge board error:', err),
    });
    boardRef.current = handle;
    return () => {
      handle.close();
      boardRef.current = null;
      if (demoAcceptRef.current) {
        clearTimeout(demoAcceptRef.current);
        demoAcceptRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, user?.id, user?.username, user?.rating]);

  // If a host never replies (they closed the tab, or the accept missed them),
  // release the "Waiting…" state so the board stays usable.
  useEffect(() => {
    if (!acceptingId) return;
    const t = setTimeout(() => {
      setAcceptingId(null);
      setQueueNotice('No answer from that trader yet — try another challenge.');
    }, 20000);
    return () => clearTimeout(t);
  }, [acceptingId]);

  const handleRedeemSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sound.playClick();
    const clean = redeemCode.trim().toUpperCase();
    if (clean === 'PIPDUEL2026' || clean === 'BULLRUN' || clean === 'WELCOME100') {
      // Credit 1,000 coins to the Supabase-backed wallet
      addCoins(1000);
      setRedeemFeedback({ status: 'success', msg: 'Code redeemed. +1,000 coins deposited.' });
      setRedeemCode('');
    } else {
      setRedeemFeedback({ status: 'error', msg: 'Invalid or expired redemption code.' });
    }
  };

  /* ──────────────────────────────────────────────────────────
     MAIN LOBBY DASHBOARD — Clean, Simple, Authentic Terminal UI
  ────────────────────────────────────────────────────────── */
  if (!authChecked && !user) {
    return (
      <div className="min-h-screen bg-[var(--term-bg)] flex items-center justify-center text-[var(--term-muted)] font-mono text-xs">
        Verifying Session…
      </div>
    );
  }

  return (
    <div
      data-theme={themeMode}
      data-lobby
      className="term-theme relative isolate min-h-screen w-full text-[var(--term-text)] flex flex-col select-none text-sm overflow-hidden font-sans"
    >
      {/* ── Blurred ambient background layers ── */}
      {/* NOTE: `isolate` on the page root keeps these -z-10 layers above the opaque bg-bg of <main>. */}
      <div className="fixed inset-0 bg-[var(--term-canvas)] -z-10" />
      {/* Colour field only: green left, red right, purple through the middle — no photo */}
      <div className="lobby-glow-veil fixed inset-0 -z-10 pointer-events-none" aria-hidden="true" />
      <div className="fixed top-[-15%] left-[-8%] w-[600px] h-[600px] rounded-full bg-[var(--term-accent)]/16 blur-[140px] -z-10 pointer-events-none" />
      <div className="fixed bottom-[-20%] right-[-5%] w-[500px] h-[500px] rounded-full bg-[var(--term-buy)]/14 blur-[130px] -z-10 pointer-events-none" />
      <div className="fixed top-[35%] right-[20%] w-[350px] h-[350px] rounded-full bg-[var(--term-purple)]/14 blur-[110px] -z-10 pointer-events-none" />
      <div className="fixed top-[60%] left-[30%] w-[280px] h-[280px] rounded-full bg-[var(--term-purple)]/10 blur-[100px] -z-10 pointer-events-none" />

      {/* ── Bottom bull/bear gradient — green → red trading aura ── */}
      <div
        className="fixed bottom-0 inset-x-0 h-[46vh] -z-10 pointer-events-none"
        style={{
          background:
            'linear-gradient(90deg, rgba(8,153,129,0.38) 0%, rgba(8,153,129,0.14) 26%, rgba(13,15,18,0) 48%, rgba(242,54,69,0.14) 72%, rgba(242,54,69,0.38) 100%)',
          WebkitMaskImage: 'linear-gradient(to top, #000 0%, rgba(0,0,0,0.55) 40%, transparent 100%)',
          maskImage: 'linear-gradient(to top, #000 0%, rgba(0,0,0,0.55) 40%, transparent 100%)',
        }}
      />
      {/* Baseline glow separating both sides, like a price axis sitting on the floor */}
      <div className="fixed bottom-0 inset-x-0 h-px -z-10 pointer-events-none bg-gradient-to-r from-[var(--term-buy)]/70 via-[var(--term-border)] to-[var(--term-sell)]/70" />
      <div className="fixed bottom-[-18%] left-[-6%] w-[420px] h-[420px] rounded-full bg-[var(--term-sell)]/10 blur-[130px] -z-10 pointer-events-none" />

      {/* ── Match Found Opponent Reveal Modal ── */}
      {matchFoundData && (() => {
        const rival = matchFoundData.payload.rival;
        const rivalTier = getTierBadge(rival.rating);
        const rivalInitials = rival.username.slice(0, 2).toUpperCase();
        const dashOffset = 163 - (163 * (5 - matchFoundCountdown)) / 5;
        return (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-[var(--term-canvas)] px-4">
            {/* no blur, clean dark bg */}

            {/* Spinning border wrapper */}
            <div className="relative w-full max-w-lg p-[2px] rounded-xl overflow-hidden">
              {/* Spinning conic gradient border */}
              <div className="absolute inset-[-100%] animate-[spin_3s_linear_infinite] bg-[conic-gradient(from_0deg,#089981,#f23645,#089981)] pointer-events-none" />

              {/* Ticket card */}
              <div className="relative w-full bg-[var(--term-surface)] rounded-[10px] overflow-hidden">
              <div className="grid grid-cols-1 md:grid-cols-12 relative">

                {/* Left Section col-span-8 */}
                <div className="md:col-span-8 p-5 space-y-4">
                  {/* Header */}
                  <div className="flex items-center justify-between pb-3 border-b border-[var(--term-border)]">
                    <span className="text-sm font-bold uppercase tracking-wider text-[var(--term-strong)] font-mono">MATCH FOUND</span>
                    <span className="text-xs font-mono font-medium text-[var(--term-sell)] flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-[var(--term-sell)] animate-pulse" />
                      Opponent Located
                    </span>
                  </div>

                  {/* VS row */}
                  <div className="flex items-center gap-3">
                    {/* You */}
                    <div className="flex-1 flex flex-col items-center gap-1.5 p-3 rounded-lg bg-[var(--term-bg)] border border-[var(--term-accent)]/20">
                      <div className="w-11 h-11 rounded-full overflow-hidden bg-[var(--term-accent)]/20 border-2 border-[var(--term-accent)]/50">
                        <img
                          src={currentUser?.avatarUrl || DEFAULT_AVATAR}
                          alt={currentUser?.username ?? 'You'}
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <span className="text-xs font-bold text-[var(--term-strong)] truncate max-w-[80px] text-center">{currentUser?.username ?? 'You'}</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ color: tier.color, background: tier.color + '15', border: `1px solid ${tier.color}35` }}>{tier.label}</span>
                      <span className="text-[10px] font-mono text-[var(--term-soft)]">{userRating} ELO</span>
                    </div>
                    {/* VS */}
                    <span className="text-lg font-black text-[var(--term-border-hi)] shrink-0">VS</span>
                    {/* Rival */}
                    <div className="flex-1 flex flex-col items-center gap-1.5 p-3 rounded-lg bg-[var(--term-bg)] border border-[var(--term-sell)]/20">
                      <div className="w-11 h-11 rounded-full bg-[var(--term-sell)]/20 border-2 border-[var(--term-sell)]/50 flex items-center justify-center text-base font-black text-[var(--term-sell)]">
                        {rivalInitials}
                      </div>
                      <span className="text-xs font-bold text-[var(--term-strong)] truncate max-w-[80px] text-center">{rival.username}</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ color: rivalTier.color, background: rivalTier.color + '15', border: `1px solid ${rivalTier.color}35` }}>{rivalTier.label}</span>
                      <span className="text-[10px] font-mono text-[var(--term-soft)]">{rival.rating} ELO</span>
                    </div>
                  </div>

                  {/* Info strip */}
                  <div className="p-3 rounded bg-[var(--term-bg)] border border-[var(--term-border)] flex items-center justify-between text-xs font-mono text-[var(--term-label)]">
                    <div className="flex items-center gap-2">
                      <span className="text-[var(--term-strong)] font-bold">XAU/USD</span>
                      <span>·</span>
                      <span className="text-[var(--term-buy)] font-bold">$10,000 Balance</span>
                    </div>
                    <span className="text-[var(--term-text)] font-semibold">{selectedDuration} game</span>
                  </div>
                </div>

                {/* Perforated Stub col-span-4 */}
                <div className="md:col-span-4 p-5 bg-[var(--term-panel-deep)] md:border-l md:border-dashed md:border-[var(--term-border-hi)] flex flex-col items-center justify-center gap-3 relative">
                  {/* Semicircle notch cutouts */}
                  <div className="hidden md:block absolute -top-3 -left-3 w-6 h-6 rounded-full bg-[var(--term-bg)] border border-[var(--term-border)] shadow-inner pointer-events-none" />
                  <div className="hidden md:block absolute -bottom-3 -left-3 w-6 h-6 rounded-full bg-[var(--term-bg)] border border-[var(--term-border)] shadow-inner pointer-events-none" />

                  {/* SVG countdown ring */}
                  <div className="relative w-16 h-16">
                    <svg className="w-16 h-16 -rotate-90" viewBox="0 0 56 56">
                      <circle cx="28" cy="28" r="26" fill="none" stroke="var(--term-border)" strokeWidth="3" />
                      <circle
                        cx="28" cy="28" r="26"
                        fill="none"
                        stroke={matchFoundCountdown <= 2 ? '#f23645' : '#089981'}
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeDasharray="163"
                        strokeDashoffset={dashOffset}
                        style={{ transition: 'stroke-dashoffset 0.9s linear, stroke 0.3s' }}
                      />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center text-2xl font-black text-[var(--term-strong)]">
                      {matchFoundCountdown}
                    </span>
                  </div>
                  <div className="text-center space-y-0.5">
                    <p className="text-xs font-bold text-[var(--term-strong)] font-mono">Entering Arena</p>
                    <p className="text-[10px] font-mono text-[var(--term-soft)] tracking-widest">in {matchFoundCountdown}s…</p>
                  </div>
                </div>

              </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Top Terminal Header (Tradovate / TradingView dark theme exact) ── */}
      <header className="h-12 shrink-0 bg-[var(--term-surface)]/80 backdrop-blur-xl border-b border-[var(--term-border)] px-4 flex items-center justify-between text-sm sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-7 h-7 rounded bg-[var(--term-accent)]/20 text-[var(--term-accent)] border border-[var(--term-accent)]/40 flex items-center justify-center font-black text-sm">
              <Swords size={15} />
            </div>
            <span className="font-bold text-sm uppercase tracking-wider text-[var(--term-strong)]">
              Pip Duel
            </span>
          </Link>
          <span className="text-[var(--term-muted)] font-mono text-xs">|</span>
          <span className="text-[var(--term-soft)] text-xs font-mono hidden sm:inline">
            ARENA LOBBY
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Online count */}
          <div className="flex items-center gap-1.5 px-3 py-1 rounded bg-[var(--term-raised)] border border-[var(--term-border)] text-xs font-mono">
            <span className="w-2 h-2 rounded-full bg-[var(--term-buy)]" />
            <span className="text-[var(--term-label)]">{onlineCount.toLocaleString()} online</span>
          </div>

          {/* Light / dark switch — shared with the battle terminal */}
          <TerminalModeToggle
            className="w-8 h-8 rounded bg-[var(--term-raised)] border border-[var(--term-border)] hover:border-[var(--term-border-hi)] text-[var(--term-label)] hover:text-[var(--term-strong)] shrink-0"
          />

          {/* Sound Toggle */}
          <button
            onClick={() => {
              const next = !soundEnabled;
              setSoundEnabled(next);
              sound.setEnabled(next);
              if (next) sound.playClick();
            }}
            title={soundEnabled ? 'Mute' : 'Unmute'}
            className="w-8 h-8 rounded bg-[var(--term-raised)] border border-[var(--term-border)] hover:border-[var(--term-border-hi)] flex items-center justify-center text-[var(--term-label)] hover:text-[var(--term-strong)] transition-colors cursor-pointer"
          >
            {soundEnabled ? <Volume2 size={15} /> : <VolumeX size={15} className="text-[var(--term-sell)]" />}
          </button>

          {/* Authenticated Account Badge & Logout */}
          {currentUser && (
            <div className="flex items-center gap-1.5">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[var(--term-raised)] border border-[var(--term-raised-hi)] text-xs font-mono text-[var(--term-text)]">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--term-buy)]" />
                <span className="font-semibold max-w-[120px] truncate">{currentUser.displayName || currentUser.username}</span>
              </div>
              <button
                onClick={async () => {
                  sound.playClick();
                  try {
                    const supabase = getSupabase();
                    if (supabase) await supabase.auth.signOut();
                  } catch {}
                  logout();
                  router.push('/login');
                }}
                title="Log Out"
                className="w-8 h-8 rounded bg-[var(--term-raised)] border border-[var(--term-border)] hover:border-[var(--term-sell)]/40 text-[var(--term-label)] hover:text-[var(--term-sell)] flex items-center justify-center transition-colors cursor-pointer"
              >
                <LogOut size={14} />
              </button>
            </div>
          )}

        </div>
      </header>

      {/* ── Main 3-Column Content ── */}
      <main className="flex-1 max-w-[1280px] w-full mx-auto p-4 md:p-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">

          {/* ══════════════════════════════════════════════════════════
              LEFT COLUMN: Profile Card, Friends Card, Action Buttons
          ══════════════════════════════════════════════════════════ */}
          <div className="lg:col-span-3 space-y-3.5">

            {/* Profile Card with Bright Red-Green Gradient Cover and Zero-Corner Square Avatar */}
            <div className="bg-[var(--term-surface)]/70 backdrop-blur-md border border-[var(--term-border)] rounded-xl overflow-hidden">
              {/* Cover Banner: Bright Direct Red to Green Gradient (No Black in Between) */}
              <div className="relative h-20 w-full overflow-hidden bg-gradient-to-r from-[var(--term-sell-2)] via-[var(--term-sell)] to-[var(--term-buy-bright)]">
                <span className="absolute top-2 right-2 text-[10px] font-mono px-2 py-0.5 rounded bg-[var(--term-bg)]/80 backdrop-blur-sm border border-[var(--term-border)] text-[var(--term-strong)] font-bold">
                  PRO SCALE
                </span>
              </div>

              {/* Profile Details with Zero-Corner Square Profile Picture */}
              <div className="p-4 pt-0 space-y-3.5 relative">
                <div className="flex items-end justify-between -mt-8 gap-3 relative z-10">
                  {/* Square Profile Picture */}
                  <div className="w-[72px] h-[72px] shrink-0 bg-[var(--term-panel)] border border-[var(--term-border-hi)] flex items-center justify-center relative group overflow-hidden">
                    <img
                      src={currentUser?.avatarUrl || DEFAULT_AVATAR}
                      alt={currentUser?.displayName ?? currentUser?.username ?? 'Player'}
                      className="relative z-10 h-full w-full object-cover"
                    />
                    <div className="absolute bottom-0 inset-x-0 z-20 h-1 bg-[var(--term-buy-bright)]" />
                  </div>

                  {/* Edit Profile Button pinned flush to the right border */}
                  <div className="relative group/edit -mr-4 -mt-2">
                    <button
                      onClick={() => {
                        sound.playClick();
                        setCenterTab('settings');
                      }}
                      aria-label="Edit Profile"
                      className="w-8 h-8 rounded-none bg-[var(--term-raised)] hover:bg-[var(--term-raised-hi)] border-y border-l border-r-0 border-[var(--term-border-hi)] hover:border-[var(--term-accent)] flex items-center justify-center text-[var(--term-label)] hover:text-[var(--term-strong)] transition-all cursor-pointer shadow-sm active:scale-95"
                    >
                      <Pencil size={13} />
                    </button>

                    {/* Tooltip */}
                    <div className="absolute right-2 -top-8 px-2 py-1 rounded bg-[var(--term-raised)] border border-[var(--term-border-hi)] text-[11px] font-mono text-[var(--term-strong)] whitespace-nowrap shadow-lg opacity-0 group-hover/edit:opacity-100 pointer-events-none transition-opacity z-20">
                      Edit Profile
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="font-bold text-base text-[var(--term-strong)] truncate">
                    {currentUser?.displayName || 'Trader'}
                  </h3>
                  <p className="text-xs font-mono text-[var(--term-soft)] mt-0.5">
                    Lv. {progressReady ? level.level : '—'} · {progressReady ? rankPositionValue.tierLabel : 'Unranked'} · {progressWinRate}% Win Rate
                  </p>
                  {progressTitle && (
                    <p className="text-[10px] font-mono text-[var(--term-amber)] mt-0.5 truncate">“{progressTitle}”</p>
                  )}
                </div>

                {/* XP Bar — fed by the progress system */}
                <div className="space-y-1.5 pt-2 border-t border-[var(--term-border)]">
                  <div className="flex justify-between text-xs font-mono text-[var(--term-soft)]">
                    <span>XP Progress</span>
                    <span className="text-[var(--term-label)] font-semibold">
                      {progressReady ? `${level.intoLevel.toLocaleString()} / ${level.needed.toLocaleString()}` : '0 / 100'}
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-[var(--term-raised)] overflow-hidden">
                    <div className="h-full rounded-full bg-[var(--term-accent)] transition-all duration-500" style={{ width: `${progressReady ? level.percent : 0}%` }} />
                  </div>
                  <button
                    onClick={() => { sound.playClick(); setCenterTab('progress'); }}
                    className="w-full flex items-center justify-between text-[10px] font-mono text-[var(--term-muted)] hover:text-[var(--term-strong)] transition-colors cursor-pointer pt-0.5"
                  >
                    <span className="flex items-center gap-1" style={{ color: progressReady ? rankPositionValue.color : 'var(--term-soft)' }}>
                      <Shield size={10} /> {progressReady ? `${progressRank.rp.toLocaleString()} RP` : 'Placement pending'}
                    </span>
                    <span>View progress ›</span>
                  </button>
                </div>

                {progressPinned.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {progressPinned.map((id) => (
                      <span key={id} className="px-1.5 py-0.5 rounded border border-[var(--term-amber)]/40 bg-[var(--term-amber)]/10 text-[9px] font-mono font-bold text-[var(--term-amber)]">
                        {ACHIEVEMENTS.find((entry) => entry.id === id)?.name ?? id}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Friends Card: add by username, requests, presence, duel invites */}
            <FriendsPanel user={currentUser} inviteCode={friendsInviteCode} />

            {/* Vertical Action Buttons: [ Settings ] [ Mail ] [ Redeem ] [ Support ] */}
            <div className="space-y-2">
              <button
                onClick={() => {
                  sound.playClick();
                  setCenterTab('settings');
                }}
                className={`w-full h-10 px-3.5 rounded backdrop-blur-sm border text-sm font-semibold flex items-center justify-between transition-all cursor-pointer ${
                  centerTab === 'settings'
                    ? 'bg-[var(--term-raised)] border-[var(--term-primary)] text-[var(--term-strong)]'
                    : 'bg-[var(--term-surface)]/70 hover:bg-[var(--term-raised)] border-[var(--term-border)] hover:border-[var(--term-border-hi)] text-[var(--term-text)]'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <SettingsIcon size={16} className={centerTab === 'settings' ? 'text-[var(--term-primary)]' : 'text-[var(--term-muted)]'} />
                  <span>Settings</span>
                </div>
                <span className={centerTab === 'settings' ? 'text-[var(--term-primary)]' : 'text-[var(--term-muted)]'}>›</span>
              </button>

              <button
                onClick={() => {
                  sound.playClick();
                  setCenterTab('mail');
                }}
                className={`w-full h-10 px-3.5 rounded backdrop-blur-sm border text-sm font-semibold flex items-center justify-between transition-all cursor-pointer ${
                  centerTab === 'mail'
                    ? 'bg-[var(--term-raised)] border-[var(--term-primary)] text-[var(--term-strong)]'
                    : 'bg-[var(--term-surface)]/70 hover:bg-[var(--term-raised)] border-[var(--term-border)] hover:border-[var(--term-border-hi)] text-[var(--term-text)]'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Mail size={16} className={centerTab === 'mail' ? 'text-[var(--term-primary)]' : 'text-[var(--term-muted)]'} />
                  <span>Mail</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {unreadMailCount > 0 && (
                    <span className="px-2 py-0.5 rounded bg-[var(--term-primary)] text-white text-xs font-mono font-bold">
                      {unreadMailCount}
                    </span>
                  )}
                  <span className={centerTab === 'mail' ? 'text-[var(--term-primary)]' : 'text-[var(--term-muted)]'}>›</span>
                </div>
              </button>

              <button
                onClick={() => {
                  sound.playClick();
                  setCenterTab('redeem');
                }}
                className={`w-full h-10 px-3.5 rounded backdrop-blur-sm border text-sm font-semibold flex items-center justify-between transition-all cursor-pointer ${
                  centerTab === 'redeem'
                    ? 'bg-[var(--term-raised)] border-[var(--term-primary)] text-[var(--term-strong)]'
                    : 'bg-[var(--term-surface)]/70 hover:bg-[var(--term-raised)] border-[var(--term-border)] hover:border-[var(--term-border-hi)] text-[var(--term-text)]'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Gift size={16} className={centerTab === 'redeem' ? 'text-[var(--term-primary)]' : 'text-[var(--term-muted)]'} />
                  <span>Redeem</span>
                </div>
                <span className="text-xs font-mono font-bold text-[var(--term-primary)]">CODE</span>
              </button>

              <button
                onClick={() => {
                  sound.playClick();
                  setCenterTab('support');
                }}
                className={`w-full h-10 px-3.5 rounded backdrop-blur-sm border text-sm font-semibold flex items-center justify-between transition-all cursor-pointer ${
                  centerTab === 'support'
                    ? 'bg-[var(--term-raised)] border-[var(--term-primary)] text-[var(--term-strong)]'
                    : 'bg-[var(--term-surface)]/70 hover:bg-[var(--term-raised)] border-[var(--term-border)] hover:border-[var(--term-border-hi)] text-[var(--term-text)]'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <HelpCircle size={16} className={centerTab === 'support' ? 'text-[var(--term-primary)]' : 'text-[var(--term-muted)]'} />
                  <span>How to Play</span>
                </div>
                <span className={centerTab === 'support' ? 'text-[var(--term-primary)]' : 'text-[var(--term-muted)]'}>›</span>
              </button>
            </div>

          </div>

          {/* ══════════════════════════════════════════════════════════
              CENTER COLUMN: [ Match Ticket ] [ Progress ]
                             MATCH TICKET (Perforated Pass)
                             — or, opened from the wallet card:
                             [ Deposit ] [ Withdraw ]
          ══════════════════════════════════════════════════════════ */}
          <div className="lg:col-span-6 space-y-3.5">

            {/* Top Navigation Tabs: [ Match Ticket ] [ Progress ] — always
                present, so opening the wallet never hides the arena's own tabs */}
            <div className="grid grid-cols-2 gap-2.5">
              <button
                onClick={() => {
                  sound.playClick();
                  setCenterTab('ticket');
                }}
                className={`h-10 rounded backdrop-blur-sm border text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  centerTab === 'ticket'
                    ? 'bg-[var(--term-raised)] border-[var(--term-primary)] text-[var(--term-strong)]'
                    : 'bg-[var(--term-surface)]/70 border-[var(--term-border)] hover:border-[var(--term-border-hi)] text-[var(--term-text)] hover:text-[var(--term-strong)]'
                }`}
              >
                <Ticket size={16} className={centerTab === 'ticket' ? 'text-[var(--term-primary)]' : 'text-[var(--term-muted)]'} />
                <span className="truncate">Match Ticket</span>
              </button>

              <button
                onClick={() => {
                  sound.playClick();
                  setCenterTab('progress');
                }}
                className={`h-10 rounded backdrop-blur-sm border text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer relative ${
                  centerTab === 'progress'
                    ? 'bg-[var(--term-raised)] border-[var(--term-primary)] text-[var(--term-strong)]'
                    : 'bg-[var(--term-surface)]/70 border-[var(--term-border)] hover:border-[var(--term-border-hi)] text-[var(--term-text)] hover:text-[var(--term-strong)]'
                }`}
              >
                <Trophy size={16} className={centerTab === 'progress' ? 'text-[var(--term-primary)]' : 'text-[var(--term-muted)]'} />
                <span>Progress</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--term-bg)] border border-[var(--term-border)] text-[var(--term-soft)]">
                  Lv. {progressReady ? level.level : '—'}
                </span>
                {claimableMissions > 0 && (
                  <span className="w-2 h-2 rounded-full bg-[var(--term-buy)] absolute top-2 right-2.5 animate-pulse" />
                )}
              </button>
            </div>

            {centerTab === 'wallet' && (
              <div className="bg-[var(--term-surface)]/70 backdrop-blur-md border border-[var(--term-border)] rounded-xl p-4 space-y-4 animate-in fade-in duration-200">
                <div className="flex items-center justify-between gap-3 pb-2.5 border-b border-[var(--term-border)]">
                  <div className="flex items-center gap-2 min-w-0">
                    <Coins size={16} className="text-[var(--term-amber)] shrink-0" />
                    <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--term-strong)] font-mono truncate">
                      {WALLET_TABS.find((entry) => entry.id === walletTab)?.label ?? 'Wallet'}
                    </h3>
                    {/* The right-column wallet buttons pick the direction; this
                        is the same control, so it is not repeated as tabs. */}
                    <button
                      onClick={() => {
                        sound.playClick();
                        setWalletTab(walletTab === 'deposit' ? 'withdraw' : 'deposit');
                      }}
                      className="text-[10px] font-mono uppercase tracking-wide text-[var(--term-muted)] hover:text-[var(--term-primary)] cursor-pointer"
                    >
                      switch
                    </button>
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0">
                    <span className="text-xs font-mono font-bold text-[var(--term-strong)] hidden sm:inline">
                      {(balanceSyncing && mounted ? 0 : userCoins).toLocaleString()} coins
                    </span>
                    <button
                      onClick={() => setCenterTab('ticket')}
                      className="text-xs font-mono text-[var(--term-muted)] hover:text-[var(--term-strong)] flex items-center gap-1 cursor-pointer"
                    >
                      ✕ Close
                    </button>
                  </div>
                </div>

                <WalletPanel
                  coins={balanceSyncing && mounted ? 0 : userCoins}
                  tab={walletTab}
                />
              </div>
            )}

            {/* ── TAB CONTENT: MATCH TICKET ── */}
            {centerTab === 'ticket' && (
              <div id="match-ticket-card" className="bg-[var(--term-surface)]/70 backdrop-blur-md border border-[var(--term-border)] rounded-xl overflow-hidden relative animate-in fade-in duration-200">
                <div className="grid grid-cols-1 md:grid-cols-12 relative">

                  {/* Left Ticket Section (col-span-8) - Clean & Simplified */}
                  <div className="md:col-span-8 p-4 space-y-3">
                    {/* Header */}
                    <div className="flex items-center justify-between pb-2 border-b border-[var(--term-border)]">
                      <span className="text-sm font-bold uppercase tracking-wider text-[var(--term-strong)] font-mono">
                        MATCH TICKET
                      </span>
                      <span className="text-xs font-mono font-medium text-[var(--term-buy)] flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-[var(--term-buy)]" />
                        {onlineCount.toLocaleString()} online
                      </span>
                    </div>

                    {/* GAME TIME DURATION: 5m, 10m, 15m */}
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-[var(--term-label)] uppercase tracking-wider font-mono leading-none">
                          GAME TIME DURATION
                        </label>
                        <span className="text-xs font-mono font-semibold text-[var(--term-accent)] leading-none">
                          + 1 min lobby time
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {DURATIONS.map((d) => {
                          // Only the 5-min ticket ships today; longer brackets
                          // are reserved and shown as "coming soon" so the
                          // queue and the battle timer never promise a length
                          // the engine will not start.
                          const soon = d.id !== '5m';
                          const active = selectedDuration === d.id;
                          return (
                            <button
                              key={d.id}
                              aria-disabled={soon}
                              onClick={() => {
                                sound.playClick();
                                if (soon) {
                                  setQueueNotice(`${d.label} matches are coming soon — pick 5 min to duel now.`);
                                  return;
                                }
                                setSelectedDuration(d.id);
                                setQueueNotice(null);
                              }}
                              className={`relative h-9 rounded text-sm font-bold font-mono transition-all duration-150 ${
                                soon
                                  ? 'cursor-not-allowed bg-[var(--term-bg)] text-[var(--term-dim)] border border-dashed border-[var(--term-border)]'
                                  : active
                                    ? 'bg-[var(--term-primary)] text-white border border-[var(--term-primary)] cursor-pointer'
                                    : 'bg-[var(--term-bg)] text-[var(--term-muted)] border border-[var(--term-border)] hover:border-[var(--term-primary)]/40 hover:text-[var(--term-primary)] cursor-pointer'
                              }`}
                            >
                              <span className={soon ? 'opacity-60' : undefined}>{d.label}</span>
                              {soon && (
                                <span className="absolute top-1 right-1.5 text-[8px] font-mono uppercase tracking-wider text-[var(--term-amber)]">
                                  Soon
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* MODE: Live (coin entry) / Demo (free) */}
                    <div className="space-y-2.5">
                      <label className="block text-xs font-bold text-[var(--term-label)] uppercase tracking-wider font-mono leading-none">
                        MODE
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { id: 'live', label: 'Live (coin entry)' },
                          { id: 'demo', label: 'Demo (free)' },
                        ].map((m) => {
                          const active = mode === m.id;
                          const isLive = m.id === 'live';
                          return (
                            <button
                              key={m.id}
                              onClick={() => {
                                sound.playClick();
                                setMode(m.id as 'live' | 'demo' | 'bot');
                                setQueueNotice(null);
                              }}
                              className={`h-9 rounded text-sm font-semibold transition-all duration-150 cursor-pointer ${
                                active
                                  ? isLive
                                    ? 'bg-[var(--term-sell)] text-white border border-[var(--term-sell)]'
                                    : 'bg-[var(--term-primary)] text-white border border-[var(--term-primary)]'
                                  : isLive
                                    ? 'bg-[var(--term-bg)] text-[var(--term-muted)] border border-[var(--term-border)] hover:border-[var(--term-sell)]/40 hover:text-[var(--term-sell)]'
                                    : 'bg-[var(--term-bg)] text-[var(--term-muted)] border border-[var(--term-border)] hover:border-[var(--term-primary)]/40 hover:text-[var(--term-primary)]'
                              }`}
                            >
                              {m.label}
                            </button>
                          );
                        })}
                      </div>

                      {/* What the chosen mode costs, before the player commits */}
                      {mode === 'live' ? (
                        isChallengeMode ? (
                          <div className="rounded border border-[var(--term-amber)]/40 bg-[var(--term-amber)]/10 px-3 py-2 space-y-1">
                            {!challengeAffordable && (
                              <p className="text-[10px] font-mono text-[var(--term-sell)]">
                                Wallet holds {userCoins.toLocaleString()} · lower the stake or deposit.
                              </p>
                            )}
                            {challengeAffordable && (
                              <p className="text-[10px] font-mono text-[var(--term-soft)]">
                                Searching for a rival at this stake — we pair you automatically if someone is already waiting.
                              </p>
                            )}
                          </div>
                        ) : (
                          !canAffordEntry && (
                            <p className="text-[10px] font-mono text-[var(--term-sell)]">
                              ▸ Live entry is {entryFee.toLocaleString()} coins · you hold {userCoins.toLocaleString()}. Deposit below or drop to Demo.
                            </p>
                          )
                        )
                      ) : (
                        <p className="text-[11px] font-mono text-[var(--term-soft)]">
                          No coins at risk. Demo pays XP only — no rank RP and no pot.
                        </p>
                      )}
                    </div>

                    {/* STAKE: the default Live entry, or a bigger challenge in
                        steps of 100 — past the entry the button turns into a post */}
                    {mode === 'live' && (
                      <div className="space-y-2.5">
                        <label className="flex items-center gap-1.5 text-xs font-bold text-[var(--term-label)] uppercase tracking-wider font-mono leading-none">
                          <img src="/coin.png" alt="" className="w-3.5 h-3.5 shrink-0" />
                          Coins
                        </label>
                        <div className="flex items-stretch gap-1.5">
                          <button
                            type="button"
                            disabled={myChallenge !== null}
                            onClick={() => { sound.playClick(); setStakeInput(String(clampStake((Number.isFinite(ticketStake) ? ticketStake : ticketFee) - 100))); }}
                            className="w-10 shrink-0 rounded bg-[var(--term-raised)] border border-[var(--term-border)] text-[var(--term-strong)] text-lg font-bold hover:bg-[var(--term-raised-hi)] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                            aria-label="Decrease stake by 100"
                          >
                            −
                          </button>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={stakeInput}
                            disabled={myChallenge !== null}
                            onChange={(e) => setStakeInput(e.target.value.replace(/[^0-9]/g, ''))}
                            onBlur={() => setStakeInput(String(clampStake(Number(stakeInput) || ticketFee)))}
                            className="flex-1 h-9 min-w-0 bg-[var(--term-bg)] border border-[var(--term-border)] focus:border-[var(--term-primary)] rounded px-3 text-center text-base font-mono font-bold text-[var(--term-strong)] focus:outline-none disabled:opacity-60"
                          />
                          <button
                            type="button"
                            disabled={myChallenge !== null}
                            onClick={() => { sound.playClick(); setStakeInput(String(clampStake((Number.isFinite(ticketStake) ? ticketStake : ticketFee) + 100))); }}
                            className="w-10 shrink-0 rounded bg-[var(--term-raised)] border border-[var(--term-border)] text-[var(--term-strong)] text-lg font-bold hover:bg-[var(--term-raised-hi)] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                            aria-label="Increase stake by 100"
                          >
                            +
                          </button>
                        </div>
                        <p className={`text-[10px] font-mono ${isChallengeMode ? 'text-[var(--term-amber)]' : 'text-[var(--term-soft)]'}`}>
                          {isChallengeMode
                            ? `Above the ${ticketFee.toLocaleString()}-coin entry — the button posts a challenge instead of instant matching.`
                            : `Default is ${ticketFee.toLocaleString()} coins. Raise it in steps of 100 to challenge for a bigger stake.`}
                        </p>
                      </div>
                    )}

                    {/* Clean Preset Info Summary */}
                    <div className="p-2.5 rounded bg-[var(--term-bg)] border border-[var(--term-border)] flex items-center justify-between text-xs font-mono text-[var(--term-label)]">
                      <div className="flex items-center gap-2">
                        <span className="text-[var(--term-strong)] font-bold">XAU/USD</span>
                        <span>·</span>
                        <span className="text-[var(--term-buy)] font-bold">$10,000 Balance</span>
                      </div>
                      <span className="text-[var(--term-text)] font-semibold">1m Lobby Prep</span>
                    </div>
                  </div>

                  {/* Actions stub — dashed perforation line, poster anchored to the bottom edge.
                      No space-y here: its margin offsets absolutely positioned children
                      inside a flex column, which pulled the bottom notch up off the edge. */}
                  <div className="md:col-span-4 p-4 bg-[var(--term-panel-deep)] md:border-l md:border-dashed md:border-[var(--term-border-hi)] flex flex-col justify-between relative">
                    {/* Lightning poster behind the actions. The mask takes it to zero
                        alpha exactly at the panel's bottom edge, so the artwork melts
                        into the panel instead of ending on a hard light line. */}
                    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
                      <div
                        className="absolute inset-0 bg-cover bg-top bg-no-repeat opacity-60"
                        style={{
                          backgroundImage: "url('/match-ticket-bg.avif')",
                          WebkitMaskImage:
                            'linear-gradient(to top, transparent 0%, rgba(0,0,0,0.35) 7%, rgba(0,0,0,0.8) 14%, #000 24%)',
                          maskImage:
                            'linear-gradient(to top, transparent 0%, rgba(0,0,0,0.35) 7%, rgba(0,0,0,0.8) 14%, #000 24%)',
                        }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-b from-[var(--term-panel-deep)]/70 via-[var(--term-panel-deep)]/20 to-[var(--term-panel-deep)]/45" />
                    </div>

                    {/* Semicircle cutouts centred on the dashed perforation line */}
                    <div className="hidden md:block absolute -top-3 -left-3 w-6 h-6 rounded-full bg-[var(--term-bg)] border border-[var(--term-border)] shadow-inner pointer-events-none" />
                    <div className="hidden md:block absolute -bottom-3 -left-3 w-6 h-6 rounded-full bg-[var(--term-bg)] border border-[var(--term-border)] shadow-inner pointer-events-none" />

                    <div className="relative z-10 space-y-3 my-auto">
                      {/* Primary Button: [ Find Match ] / [ Matching... 00:08 ] with spinning border */}
                      <div className="relative p-[2px] rounded-xl overflow-hidden group">
                        {/* Spinning border background */}
                        <div className="absolute inset-[-100%] animate-[spin_3s_linear_infinite] bg-[conic-gradient(from_0deg,var(--term-primary-deep),var(--term-primary),var(--term-primary-hi))] pointer-events-none opacity-90 group-hover:opacity-100 transition-opacity" />
                        
                        <button
                          id="find-match-btn"
                          disabled={!myChallenge && !queueing && isChallengeMode && (!challengeValid || !challengeAffordable)}
                          onClick={() => {
                            // A challenge already out: this button withdraws it.
                            if (myChallenge) {
                              handleCancelChallenge();
                              return;
                            }
                            // Standard queue running: this button stops it.
                            if (queueing) {
                              sound.playClick();
                              setQueueing(false);
                              setQueueStatus('searching');
                              setMatchedRival(null);
                              setQueueTimer(0);
                              return;
                            }
                            // Custom stake: pair straight with an open rival already
                            // waiting at the same amount; otherwise post our own. Both
                            // read as "Matching…" so the ticket looks like a normal search.
                            if (isChallengeMode) {
                              const rival = challenges.find(
                                (c) =>
                                  c.posterId !== sessionId &&
                                  c.stake === ticketStake &&
                                  c.duration === selectedDuration,
                              );
                              if (rival) {
                                handleAcceptChallenge(rival);
                                return;
                              }
                              handlePostChallengeFromTicket();
                              return;
                            }
                            handleFindMatch();
                          }}
                          className="relative z-10 w-full h-12 text-white font-bold text-base rounded-[10px] flex items-center justify-center gap-2 transition-all shadow-lg active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed bg-[linear-gradient(135deg,var(--term-primary)_0%,var(--term-primary-deep)_100%)] hover:bg-[linear-gradient(135deg,var(--term-primary-hi)_0%,var(--term-primary)_100%)] cursor-pointer"
                        >
                          {myChallenge || queueing ? (
                            <div className="flex flex-col items-center gap-0.5">
                              <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-[var(--term-buy)] animate-ping shrink-0" />
                                <span className="tracking-wide font-bold">
                                  {queueing && queueStatus === 'matched' ? 'Rival Matched!' : 'Matching…'}
                                </span>
                              </div>
                              {myChallenge ? (
                                <span className="text-[10px] font-mono text-white/60 tracking-widest">
                                  {myChallenge.stake.toLocaleString()}-coin match · tap to cancel
                                </span>
                              ) : queueStatus !== 'matched' ? (
                                <span className="text-[10px] font-mono text-white/60 tracking-widest">
                                  {queueTimer < 60
                                    ? `00:${queueTimer.toString().padStart(2, '0')}`
                                    : queueTimer % 60 === 0
                                      ? `${Math.floor(queueTimer / 60)} min`
                                      : `${Math.floor(queueTimer / 60)}m ${(queueTimer % 60).toString().padStart(2, '0')}s`}
                                </span>
                              ) : null}
                            </div>
                          ) : (
                            <>
                              <span className="tracking-wide">
                                {mode === 'bot'
                                  ? 'Practice vs Bot'
                                  : mode === 'live'
                                    ? 'Find Live Match'
                                    : 'Find Demo Match'}
                              </span>
                            </>
                          )}
                        </button>
                      </div>

                      {queueNotice && (
                        <p className="flex items-start gap-1.5 rounded border border-[var(--term-sell)]/30 bg-[var(--term-sell-dim)] px-2.5 py-2 text-[10px] font-mono text-[var(--term-sell)]">
                          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                          {queueNotice}
                        </p>
                      )}

                      <div className="flex items-center justify-between text-xs font-mono text-[var(--term-soft)]">
                        <span>{myChallenge ? `${onlineCount} traders online` : queueing ? `${activeQueueCount} in queue pool` : `About 8s wait · ${activeQueueCount} in queue`}</span>
                        {(queueing || myChallenge) && (
                          <button
                            onClick={() => {
                              sound.playClick();
                              if (myChallenge) {
                                handleCancelChallenge();
                                return;
                              }
                              setQueueing(false);
                              setQueueStatus('searching');
                              setMatchedRival(null);
                              setQueueTimer(0);
                            }}
                            className="text-[var(--term-sell)] hover:underline cursor-pointer font-bold"
                          >
                            Cancel
                          </button>
                        )}
                      </div>

                      <div className="space-y-2 pt-0.5">
                        {/* Button: Practice vs bot */}
                        <button
                          onClick={handleLaunchBotMatch}
                          className="w-full h-9 bg-[var(--term-raised)] hover:bg-[var(--term-raised-hi)] border border-[var(--term-border)] text-[var(--term-text)] hover:text-[var(--term-strong)] text-xs font-semibold rounded flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Bot size={15} className="text-[var(--term-soft)]" />
                          <span>Practice vs bot</span>
                        </button>

                        {/* Button: Join with code */}
                        {!showCodeInput ? (
                          <button
                            onClick={() => {
                              sound.playClick();
                              setShowCodeInput(true);
                            }}
                            className="w-full h-9 bg-[var(--term-raised)] hover:bg-[var(--term-raised-hi)] border border-[var(--term-border)] text-[var(--term-text)] hover:text-[var(--term-strong)] text-xs font-semibold rounded flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                          >
                            <KeyRound size={15} className="text-[var(--term-soft)]" />
                            <span>Join with code</span>
                          </button>
                        ) : (
                          <form onSubmit={handleJoinWithCode} className="flex gap-1.5">
                            <input
                              type="text"
                              value={roomCodeInput}
                              onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 5))}
                              placeholder="CODE"
                              maxLength={5}
                              autoFocus
                              className="w-full h-9 bg-[var(--term-bg)] border border-[var(--term-primary)] rounded px-2.5 text-center text-xs font-mono font-bold uppercase text-[var(--term-strong)] placeholder:text-[var(--term-muted)] focus:outline-none"
                            />
                            <button
                              type="submit"
                              disabled={roomCodeInput.length !== 5}
                              className="h-9 px-3 bg-[var(--term-primary)] hover:bg-[var(--term-primary-hi)] text-white font-bold text-xs rounded cursor-pointer disabled:opacity-40"
                            >
                              Join
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setShowCodeInput(false);
                                setRoomCodeInput('');
                              }}
                              className="h-9 px-2 text-[var(--term-muted)] hover:text-[var(--term-strong)] text-sm"
                            >
                              ✕
                            </button>
                          </form>
                        )}
                      </div>
                    </div>

                    <div className="relative z-10 pt-2 text-center">
                      <span className="text-xs font-mono text-[var(--term-muted)]">
                        PIP DUEL ENGINE v2.4
                      </span>
                    </div>
                  </div>

                </div>
              </div>
            )}

            {/* Partner banner — sits directly under the ticket, on that tab only. */}
            {centerTab === 'ticket' && (
              <a
                href="https://ib.ecmarkets.co/PL/2/9EETK"
                target="_blank"
                rel="noopener noreferrer nofollow sponsored"
                className="block overflow-hidden border border-[var(--term-border)] bg-[var(--term-surface)]/70"
              >
                <img
                  src="https://file.ecmarkets.com/s3-crm-p/operation/c817804ee08bbb3bf5e107fb3979de62.png"
                  alt="ECMarkets"
                  width={1140}
                  height={250}
                  loading="lazy"
                  className="block h-auto w-full"
                />
              </a>
            )}

            {/* Recent duels — the same record the archive page reads, newest first. */}
            {centerTab === 'ticket' && (
              <div className="bg-[var(--term-surface)]/70 backdrop-blur-md border border-[var(--term-border)] overflow-hidden">
                <div className="flex items-center justify-between border-b border-[var(--term-border)] px-4 py-2.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--term-strong)] font-mono">
                    Match History
                  </span>
                  {history.length > 0 && (
                    <Link
                      href="/history"
                      className="text-[10px] font-bold uppercase tracking-wider text-[var(--term-accent)] hover:text-[var(--term-strong)] transition-colors"
                    >
                      View all →
                    </Link>
                  )}
                </div>

                {history.length === 0 ? (
                  <p className="px-4 py-6 text-center text-[11px] text-[var(--term-soft)]">
                    No duels yet — your first result lands here.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left text-[11px]">
                      <thead>
                        <tr className="border-b border-[var(--term-border)] text-[9px] uppercase tracking-wider text-[var(--term-label)]">
                          <th className="px-4 py-2 font-semibold">Result</th>
                          <th className="px-4 py-2 font-semibold">Opponent</th>
                          <th className="px-4 py-2 font-semibold">Mode</th>
                          <th className="px-4 py-2 text-right font-semibold">P&amp;L</th>
                          <th className="px-4 py-2 text-right font-semibold">Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--term-border)]">
                        {history.slice(0, 5).map((item) => (
                          <tr key={item.id} className="hover:bg-[var(--term-raised)]/50 transition-colors">
                            <td className="px-4 py-2">
                              <span
                                className={`font-bold uppercase tracking-wider ${
                                  item.won
                                    ? 'text-[var(--term-buy)]'
                                    : item.isDraw
                                      ? 'text-[var(--term-label)]'
                                      : 'text-[var(--term-sell)]'
                                }`}
                              >
                                {item.won ? 'Win' : item.isDraw ? 'Draw' : 'Loss'}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-[var(--term-strong)] max-w-[160px] truncate">
                              {item.opponentName}
                              {item.opponentIsBot && (
                                <span className="ml-1 text-[var(--term-soft)]">(bot)</span>
                              )}
                            </td>
                            <td className="px-4 py-2 uppercase text-[var(--term-label)]">{item.mode}</td>
                            <td
                              className={`px-4 py-2 text-right font-mono font-bold ${
                                item.userPnl >= 0 ? 'text-[var(--term-buy)]' : 'text-[var(--term-sell)]'
                              }`}
                            >
                              {item.userPnl >= 0 ? '+' : ''}${item.userPnl.toFixed(2)}
                            </td>
                            <td className="px-4 py-2 text-right font-mono text-[var(--term-soft)]">
                              {new Date(item.createdAt).toLocaleDateString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ── TAB CONTENT: PROGRESS (header + Rank / Missions / Achievements / Leaderboard / Stats) ── */}
            {centerTab === 'progress' && <ProgressPanel />}

            {/* ── TAB CONTENT: SETTINGS ── */}
            {centerTab === 'settings' && (
              <div className="bg-[var(--term-surface)]/70 backdrop-blur-md border border-[var(--term-border)] rounded-xl p-4 space-y-3 animate-in fade-in duration-200">
                <div className="flex items-center justify-between gap-3 pb-2.5 border-b border-[var(--term-border)]">
                  <div className="flex items-center gap-2 min-w-0">
                    <SettingsIcon size={16} className="text-[var(--term-accent)] shrink-0" />
                    <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--term-strong)] font-mono truncate">
                      Terminal & Game Preferences
                    </h3>
                  </div>
                  <button
                    onClick={() => setCenterTab('ticket')}
                    className="text-xs font-mono text-[var(--term-muted)] hover:text-[var(--term-strong)] flex items-center gap-1 cursor-pointer shrink-0"
                  >
                    ✕ Close
                  </button>
                </div>

                <div className="space-y-2.5 text-xs">
                  <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-[var(--term-bg)]/80 border border-[var(--term-border)]">
                    <div className="min-w-0">
                      <span className="font-semibold text-[var(--term-strong)] text-sm block leading-tight">Audio Effects & Sound Design</span>
                      <p className="text-[11px] text-[var(--term-soft)] mt-1 leading-snug">Alerts on rival match, trade execution, countdown timers</p>
                    </div>
                    <button
                      onClick={() => {
                        const next = !soundEnabled;
                        setSoundEnabled(next);
                        sound.setEnabled(next);
                        if (next) sound.playClick();
                      }}
                      className={`shrink-0 px-3 py-1.5 rounded font-bold text-xs cursor-pointer transition-colors ${
                        soundEnabled ? 'bg-[var(--term-buy)] text-white' : 'bg-[var(--term-raised)] text-[var(--term-muted)] border border-[var(--term-border)]'
                      }`}
                    >
                      {soundEnabled ? 'ENABLED' : 'MUTED'}
                    </button>
                  </div>

                  <div className="p-3 rounded-lg bg-[var(--term-bg)]/80 border border-[var(--term-border)] space-y-1.5">
                    <p className="font-bold text-[var(--term-strong)] text-sm">Trading Hotkey Map</p>
                    <p className="text-[11px] text-[var(--term-soft)] truncate">Standardized Tradovate / TradingView execution keys</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 pt-1">
                      <div className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-[var(--term-raised)] border border-[var(--term-border)]">
                        <span className="w-5 h-5 rounded bg-[var(--term-bg)] border border-[var(--term-border)] flex items-center justify-center font-mono font-bold text-[11px] text-[var(--term-buy)] shrink-0">B</span>
                        <span className="text-[11px] text-[var(--term-label)] truncate">Buy</span>
                      </div>
                      <div className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-[var(--term-raised)] border border-[var(--term-border)]">
                        <span className="w-5 h-5 rounded bg-[var(--term-bg)] border border-[var(--term-border)] flex items-center justify-center font-mono font-bold text-[11px] text-[var(--term-sell)] shrink-0">S</span>
                        <span className="text-[11px] text-[var(--term-label)] truncate">Sell</span>
                      </div>
                      <div className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-[var(--term-raised)] border border-[var(--term-border)]">
                        <span className="w-5 h-5 rounded bg-[var(--term-bg)] border border-[var(--term-border)] flex items-center justify-center font-mono font-bold text-[11px] text-[var(--term-strong)] shrink-0">C</span>
                        <span className="text-[11px] text-[var(--term-label)] truncate">Close</span>
                      </div>
                      <div className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-[var(--term-raised)] border border-[var(--term-border)]">
                        <span className="w-5 h-5 rounded bg-[var(--term-bg)] border border-[var(--term-border)] flex items-center justify-center font-mono font-bold text-[11px] text-[var(--term-amber)] shrink-0">R</span>
                        <span className="text-[11px] text-[var(--term-label)] truncate">Reverse</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── TAB CONTENT: MAIL ── */}
            {centerTab === 'mail' && (
              <div className="bg-[var(--term-surface)]/70 backdrop-blur-md border border-[var(--term-border)] rounded-xl overflow-hidden animate-in fade-in duration-200">
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <Mail size={16} className="text-[var(--term-accent)] shrink-0" />
                    <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--term-strong)] font-mono truncate">
                      Trading Desk Mailbox
                    </h3>
                  </div>
                  <button
                    onClick={() => setCenterTab('ticket')}
                    className="text-xs font-mono text-[var(--term-muted)] hover:text-[var(--term-strong)] flex items-center gap-1 cursor-pointer shrink-0"
                  >
                    ✕ Close
                  </button>
                </div>

                {/* Compact strip: mailbox counters */}
                <div className="flex items-center gap-2 px-4 py-1.5 border-y border-[var(--term-border)] bg-[var(--term-panel-deep)]/70 text-[10px] font-mono uppercase tracking-wide text-[var(--term-muted)]">
                  <span className="truncate">
                    Inbox ·{' '}
                    <span className={unreadMailCount > 0 ? 'text-[var(--term-accent)] font-bold' : ''}>
                      {unreadMailCount} unread
                    </span>{' '}
                    / {mailItems.length}
                  </span>
                </div>

                {/* Gmail-style compact rows: click a row to collapse it open */}
                <div className="max-h-[380px] overflow-y-auto divide-y divide-[var(--term-border)]/60">
                  {mailItems.map((item) => {
                    const coins = item.coins ?? 0;
                    const hasCoins = coins > 0;
                    const isOpen = expandedMailId === item.id;
                    const stamp = formatMailStamp(item.createdAt);
                    return (
                      <div key={item.id}>
                        <div
                          onClick={() => {
                            sound.playClick();
                            const opening = expandedMailId !== item.id;
                            setExpandedMailId(opening ? item.id : null);
                            if (opening && !item.read) {
                              const next = mailItems.map((mail) =>
                                (mail.id === item.id ? { ...mail, read: true } : mail),
                              );
                              setMailItems(next);
                              saveMailCache(mailUserId, next);
                              void markMailRead(item.id);
                            }
                          }}
                          className={`flex items-center gap-2.5 px-3 h-10 cursor-pointer transition-colors ${
                            isOpen ? 'bg-[var(--term-panel)]' : item.read ? 'hover:bg-[var(--term-raised)]' : 'bg-[var(--term-raised)]/70 hover:bg-[var(--term-panel)]'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                              item.read ? 'bg-transparent' : 'bg-[var(--term-accent)]'
                            }`}
                          />

                          <span
                            className="w-6 h-6 rounded-full border border-[var(--term-border-hi)] shrink-0 flex items-center justify-center text-[10px] font-bold uppercase"
                            style={{
                              background: item.read ? 'var(--term-bg)' : 'rgba(41,98,255,0.16)',
                              color: item.read ? 'var(--term-label)' : 'var(--term-accent-text)',
                            }}
                          >
                            {item.sender.charAt(0)}
                          </span>

                          <span
                            className={`hidden sm:block w-[104px] shrink-0 truncate text-[11px] ${
                              item.read ? 'text-[var(--term-label)]' : 'text-[var(--term-strong)] font-semibold'
                            }`}
                          >
                            {item.sender}
                          </span>

                          <div className="flex-1 min-w-0 text-xs">
                            <p className={`truncate ${item.read ? 'text-[var(--term-label)]' : 'text-[var(--term-strong)] font-semibold'}`}>
                              {item.subject}
                              <span className="hidden md:inline font-normal text-[var(--term-muted)]"> — {item.preview}</span>
                            </p>
                          </div>

                          {hasCoins && (
                            <span className="hidden sm:flex items-center gap-1.5 shrink-0 text-[10px] font-mono font-bold">
                              <span className="text-[var(--term-amber)]">{coins.toLocaleString()}C</span>
                            </span>
                          )}

                          <span className="w-[46px] shrink-0 text-right text-[10px] font-mono text-[var(--term-muted)]">
                            {stamp}
                          </span>

                          <ChevronDown
                            size={13}
                            className={`shrink-0 text-[var(--term-muted)] transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`}
                          />
                        </div>

                        {isOpen && (
                          <div className="pl-[62px] pr-3 py-3 bg-[var(--term-panel-deep)]/60 border-t border-[var(--term-border)]/60 animate-in fade-in slide-in-from-top-1 duration-150">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pb-2 text-[10px] font-mono uppercase tracking-wide text-[var(--term-muted)]">
                              <span className="text-[var(--term-label)]">{item.sender}</span>
                              <span>·</span>
                              <span>{stamp}</span>
                              <span>·</span>
                              <span>to you</span>
                            </div>
                            <p className="text-xs leading-relaxed text-[var(--term-label)] whitespace-pre-line">{item.body}</p>
                            <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] font-mono uppercase tracking-wide">
                              <span className="text-[var(--term-muted)]">
                                {item.category === 'deposit' ? 'Deposit desk' : item.category === 'withdrawal' ? 'Payout desk' : 'Arena system'}
                              </span>
                              {hasCoins && <span className="font-bold text-[var(--term-amber)]">{coins.toLocaleString()} C</span>}
                              <span className="flex items-center gap-1 text-[var(--term-buy)]">
                                <CheckCircle2 size={11} /> Delivered
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {mailItems.length === 0 && (
                    <div className="px-4 py-8 text-center text-[11px] font-mono leading-relaxed text-[var(--term-muted)]">
                      {mailUnavailable
                        ? 'Mail is unavailable right now — run supabase/setup.sql so the mailbox table exists.'
                        : mailUserId
                          ? 'No mail yet. Deposits and payout requests write a letter here automatically.'
                          : 'Mail is delivered to registered accounts. Guest sessions have no inbox.'}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── TAB CONTENT: REDEEM ── */}
            {centerTab === 'redeem' && (
              <div className="bg-[var(--term-surface)]/70 backdrop-blur-md border border-[var(--term-border)] rounded-xl p-5 space-y-4 animate-in fade-in duration-200">
                <div className="flex items-center justify-between pb-3 border-b border-[var(--term-border)]">
                  <div className="flex items-center gap-2">
                    <Gift size={18} className="text-[var(--term-primary)]" />
                    <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--term-strong)] font-mono">
                      Redeem Promotional Voucher
                    </h3>
                  </div>
                  <button
                    onClick={() => setCenterTab('ticket')}
                    className="text-xs font-mono text-[var(--term-muted)] hover:text-[var(--term-strong)] flex items-center gap-1 cursor-pointer"
                  >
                    ✕ Close
                  </button>
                </div>

                <form onSubmit={handleRedeemSubmit} className="space-y-3.5 px-2 pt-1 text-xs">
                  <div className="space-y-2.5">
                    <label className="block text-xs font-bold font-mono text-[var(--term-label)] uppercase leading-4">Enter Promo Code</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={redeemCode}
                        onChange={(e) => setRedeemCode(e.target.value)}
                        placeholder="e.g. PIPDUEL2026 or BULLRUN"
                        className="flex-1 h-10 px-3 bg-[var(--term-bg)] border border-[var(--term-border)] focus:border-[var(--term-primary)] rounded-lg font-mono uppercase text-sm text-[var(--term-strong)] placeholder:text-[var(--term-muted)] focus:outline-none"
                      />
                      <button
                        type="submit"
                        className="px-5 h-10 rounded-lg text-white font-bold text-xs cursor-pointer transition-all shadow-sm bg-gradient-to-br from-[var(--term-primary)] via-[var(--term-primary)] to-[var(--term-primary-deep)] border border-[var(--term-primary)]/50 hover:brightness-110"
                      >
                        Redeem Code
                      </button>
                    </div>
                  </div>

                  {redeemFeedback.msg && (
                    <div
                      className={`p-3 rounded-lg border text-xs font-mono ${
                        redeemFeedback.status === 'success'
                          ? 'bg-[var(--term-buy)]/15 border-[var(--term-buy)]/40 text-[var(--term-buy)]'
                          : 'bg-[var(--term-sell)]/15 border-[var(--term-sell)]/40 text-[var(--term-sell)]'
                      }`}
                    >
                      {redeemFeedback.msg}
                    </div>
                  )}
                </form>
              </div>
            )}

            {/* ── TAB CONTENT: SUPPORT / HOW TO PLAY ── */}
            {centerTab === 'support' && (
              <div className="bg-[var(--term-surface)]/70 backdrop-blur-md border border-[var(--term-border)] rounded-xl p-4 space-y-4 animate-in fade-in duration-200">
                {/* Header */}
                <div className="flex items-center justify-between gap-3 pb-2.5 border-b border-[var(--term-border)]">
                  <div className="flex items-center gap-2 min-w-0">
                    <HelpCircle size={16} className="text-[var(--term-buy)] shrink-0" />
                    <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--term-strong)] font-mono truncate">How to Play</h3>
                  </div>
                  <button
                    onClick={() => setCenterTab('ticket')}
                    className="text-xs font-mono text-[var(--term-muted)] hover:text-[var(--term-strong)] flex items-center gap-1 cursor-pointer shrink-0"
                  >
                    ✕ Close
                  </button>
                </div>

                {/* Steps */}
                <div className="space-y-2">
                  <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--term-label)]">Match Flow</p>
                  {[
                    { n: '01', title: 'Configure Your Ticket', desc: 'Choose a game duration (5 / 10 / 15 min) and a mode — Live charges a coin entry and pays the pot to the winner, Demo is free and stakes nothing.' },
                    { n: '02', title: 'Enter the Queue', desc: 'Hit Find Match. The engine pairs you with a rival of similar ELO rating within seconds. Both traders see an identical price feed seeded from the same cryptographic entropy.' },
                    { n: '03', title: '1-Minute Lobby Prep', desc: 'Once matched, a 60-second prep window starts. Study the chart, plan your bias — long or short — and set your first order before the clock hits zero.' },
                    { n: '04', title: 'Trade to Win More Pips', desc: 'Use Market, Limit, or Stop orders. Open and close positions freely. The trader with the highest net pip P&L when the timer expires wins the duel.' },
                    { n: '05', title: 'Claim Your ELO & Rewards', desc: 'Win → gain ELO and the Live pot. Lose → lose ELO and your entry. Draw → no change, entry returned. Coins come from reviewed crypto deposits and from pots you win, and any balance can be paid back out as USDT from the wallet.' },
                  ].map((s) => (
                    <div key={s.n} className="flex gap-3 px-3 py-2.5 rounded-md bg-[var(--term-bg)] border border-[var(--term-border)]">
                      <span className="w-5 h-5 rounded bg-[var(--term-accent)]/12 border border-[var(--term-accent)]/25 text-[var(--term-accent-text)] shrink-0 mt-px flex items-center justify-center text-[10px] font-black font-mono">
                        {s.n}
                      </span>
                      <div className="space-y-1 min-w-0">
                        <p className="text-[13px] font-bold text-[var(--term-strong)] leading-snug">{s.title}</p>
                        <p className="text-xs text-[var(--term-label)] leading-relaxed">{s.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Key Rules */}
                <div className="space-y-2">
                  <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--term-label)]">Key Rules</p>
                  {[
                    { icon: '⚖️', rule: 'Equal Starting Balance', detail: 'Both traders start with $10,000 virtual capital — no edge from bankroll size.' },
                    { icon: '📊', rule: 'Same Price Feed', detail: 'You and your rival see an identical market — no information asymmetry.' },
                    { icon: '🚫', rule: 'No Slippage Advantage', detail: 'Orders fill at next tick. Results are mathematically verified and dispute-resistant.' },
                  ].map((r) => (
                    <div key={r.rule} className="flex items-start gap-2.5 px-3 py-2.5 rounded-md bg-[var(--term-canvas)] border border-[var(--term-border)]">
                      <span className="text-sm leading-5 shrink-0">{r.icon}</span>
                      <div className="space-y-1 min-w-0">
                        <p className="text-[13px] font-bold text-[var(--term-text)] leading-snug">{r.rule}</p>
                        <p className="text-xs text-[var(--term-label)] leading-relaxed">{r.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Live Pot Rules — what an entry buys and pays out */}
                <div className="space-y-2">
                  <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--term-label)]">Live Pot Rules</p>
                  <div className="space-y-2 rounded-md bg-[var(--term-bg)] border border-[var(--term-border)] px-3 py-2.5">
                    <ul className="space-y-1.5 text-[11px] font-mono text-[var(--term-soft)]">
                      <li className="flex gap-1.5">
                        <span className="text-[var(--term-sell)] shrink-0">▸</span>
                        Both entrants pay {ticketFee.toLocaleString()} coins on this ticket length.
                      </li>
                      <li className="flex gap-1.5">
                        <span className="text-[var(--term-buy)] shrink-0">▸</span>
                        Winner collects {ticketPot.toLocaleString()} coins · 10% of the pool burns.
                      </li>
                      <li className="flex gap-1.5">
                        <span className="text-[var(--term-amber)] shrink-0">▸</span>
                        A draw returns each entry — nobody profits from a tie.
                      </li>
                      <li className="flex gap-1.5">
                        <span className="text-[var(--term-muted)] shrink-0">▸</span>
                        Demo pays XP only: no entry, no pot, no rank RP.
                      </li>
                    </ul>
                    <p className="text-[10px] font-mono text-[var(--term-dim)] pt-1.5 border-t border-[var(--term-border)]">
                      Entry is charged when a rival is matched, never for queueing.
                    </p>
                  </div>
                </div>
              </div>
            )}

          </div>

          {/* ══════════════════════════════════════════════════════════
              RIGHT COLUMN: Wallet card (balance + deposit / withdraw),
              then the live challenge board (open duels above the entry)
          ══════════════════════════════════════════════════════════ */}
          <div className="lg:col-span-3 space-y-3.5">

            {/* Wallet — the balance and its two buttons; the flow itself opens
                in the center column, the same place the Match Ticket renders */}
            <WalletCard
              coins={balanceSyncing && mounted ? 0 : userCoins}
              onOpen={openWallet}
            />

            {/* Challenges — a stake above the fixed Live entry, published to
                every online trader; accept one to duel at that stake at once */}
            <div className="rounded-xl border border-[var(--term-border)] bg-[var(--term-surface)]/70 backdrop-blur-md overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between gap-2 px-4 py-3">
                <div className="flex items-center gap-2 min-w-0">
                  <Swords size={16} className="text-[var(--term-accent)] shrink-0" />
                  <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--term-strong)] font-mono truncate">Challenges</h3>
                </div>
              </div>

              {/* Board — the latest 8 challenges, newest on top; a new post
                  slides up into view and the oldest drops off the bottom */}
              <div className="max-h-[460px] overflow-y-auto divide-y divide-[var(--term-border)]/50 border-t border-[var(--term-border)]">
                {challenges.length === 0 ? (
                  <p className="px-3 py-6 text-center text-[11px] font-mono text-[var(--term-muted)]">
                    No open challenges. Post one to invite a bigger duel.
                  </p>
                ) : (
                  challenges.slice(0, 8).map((c) => {
                    const mine = c.posterId === sessionId;
                    const waiting = acceptingId === c.id;
                    const short = !mine && c.stake > userCoins;
                    return (
                      <div key={c.id} className="flex items-center gap-2 px-3 py-2 animate-in slide-in-from-bottom-2 duration-300">
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-bold text-[var(--term-strong)] truncate">{c.username}</p>
                          <p className="text-[10px] font-mono text-[var(--term-buy)]">{c.stake.toLocaleString()} coins</p>
                        </div>
                        {mine ? (
                          <span className="text-[10px] font-mono text-[var(--term-accent)] shrink-0">Yours</span>
                        ) : waiting ? (
                          <span className="flex items-center gap-1 text-[10px] font-mono text-[var(--term-amber)] shrink-0">
                            <span className="w-1.5 h-1.5 rounded-full bg-[var(--term-amber)] animate-ping" />
                            Waiting
                          </span>
                        ) : (
                          <button
                            onClick={() => handleAcceptChallenge(c)}
                            disabled={short}
                            className={`h-6 px-2.5 shrink-0 rounded text-[10px] font-bold cursor-pointer transition-colors ${
                              short
                                ? 'bg-[var(--term-bg)] text-[var(--term-muted)] border border-[var(--term-border)] cursor-not-allowed'
                                : 'bg-[var(--term-buy)] text-white hover:brightness-110'
                            }`}
                          >
                            {short ? 'Short' : 'Accept'}
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

          </div>

        </div>
      </main>

      {/* ── Progress celebrations (XP, level up, rank up, missions, achievements) ── */}
      <ProgressCelebrations />

    </div>
  );
}

export default function PlayLobbyPage() {
  return (
    <Suspense
      fallback={
        <div
          className="min-h-screen bg-[var(--term-bg)] flex items-center justify-center text-[var(--term-muted)] font-mono text-xs"
        >
          Loading Pip Duel Lobby…
        </div>
      }
    >
      <PlayLobbyContent />
    </Suspense>
  );
}

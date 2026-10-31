'use client';

import { useCallback, useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Swords, Bot, BarChart3, HelpCircle, Crosshair,
  Settings as SettingsIcon, Mail, Share2, Headphones,
  Coins, ChevronDown, ChevronUp, Flame,
  Volume2, VolumeX, Clock, ArrowLeft, AlertCircle, CheckCircle2,
  ExternalLink, User, Ticket, LogIn, LogOut,
  AlertTriangle, Info, X
} from 'lucide-react';
import { useAuthStore } from '@/lib/auth/store';
import { DEFAULT_AVATAR } from '@/lib/auth/avatar';
import { getSupabase } from '@/lib/supabase/client';
import { fetchPlayerNames } from '@/lib/supabase/wallet';
import { sound } from '@/components/terminal/sound';
import { joinMatchmakingQueue, generateRoomCode, type QueuePlayer, type QueueScope, type MatchFoundPayload } from '@/lib/matchmaking/matchmaker';
import {
  joinChallengeBoard, makeChallengeId,
  withDemoChallenges, isDemoChallenge,
  type DuelChallenge, type ChallengeBoardHandle, type ChallengeMatchPayload,
} from '@/lib/challenges/challenge-board';
import { MATCH_DURATIONS, DEFAULT_MATCH_DURATION, type MatchDurationId } from '@/lib/engine/constants';
import { stashRoomSession } from '@/lib/rooms/session';
import { openPrivateTable } from '@/lib/tables/private-table';
import { FriendsPanel } from '@/components/lobby/friends-panel';
import { LobbyLeftRail, type LobbyTab } from '@/components/lobby/lobby-rail';
import { AnnouncementBar } from '@/components/announcement-bar';
import { WalletCard, WalletPanel, WALLET_TABS, type WalletTab } from '@/components/wallet';
import { TerminalModeToggle, useTerminalMode } from '@/components/terminal/theme-mode';
import { ProgressCelebrations, StatsPanel } from '@/components/progress';
import { useProgressStore } from '@/lib/progress/store';
import { liveFeeFor, potFor, houseBurnFor } from '@/lib/economy/stakes';
import { HOUSE_CUT } from '@/lib/economy/config';
import {
  deleteMails,
  fetchMyMails,
  formatMailStamp,
  markMailRead,
  readCachedMails,
  saveMailCache,
  type PlayerMail,
} from '@/lib/supabase/mail';
import {
  buildInviteLink,
  fetchIbDesk,
  fetchIbLeaderboard,
  transferIbBalance,
  type IbBoardRow,
  type IbDesk,
} from '@/lib/supabase/referrals';

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

// The wait the ticket button prints: plain seconds up to a minute, then a
// minute-first shape. Shared by the queue clock and a posted challenge, so both
// waiting states read the same way.
function formatWait(seconds: number): string {
  if (seconds < 60) return `00:${seconds.toString().padStart(2, '0')}`;
  if (seconds % 60 === 0) return `${Math.floor(seconds / 60)} min`;
  return `${Math.floor(seconds / 60)}m ${(seconds % 60).toString().padStart(2, '0')}s`;
}

/* Room codes are minted as XXXXX-XXXXX. People paste them straight off a
   message, so the box accepts the dashed and the compact form and always hands
   the rest of the page the canonical dashed one. */
function formatRoomCodeInput(raw: string): string {
  const compact = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
  return compact.length > 5 ? `${compact.slice(0, 5)}-${compact.slice(5)}` : compact;
}
function normalizeRoomCode(raw: string): string {
  const compact = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (compact.length === 10) return `${compact.slice(0, 5)}-${compact.slice(5)}`;
  return compact;
}
/** A code is complete when it is the short legacy 5 or a whole table's 10. */
function roomCodeIsComplete(code: string): boolean {
  const compact = code.replace(/[^A-Z0-9]/g, '').length;
  return compact === 5 || compact === 10;
}

// Inbox cleanup window: the mailbox button and the row filter read the same
// number, so the label can never promise a different cut-off than it applies.
const MAIL_STALE_DAYS = 2;
const MAIL_STALE_MS = MAIL_STALE_DAYS * 86_400_000;

// How many duels the Match History card lists before the pager kicks in.
const HISTORY_PAGE_SIZE = 15;

/* The Match Found reveal waits for the rival's tab before it moves on: the
   ready check runs until the other side answers, and READY_CHECK_MS is the
   ceiling past which the rival counts as armed anyway — a tab on an older
   build, or an ack lost on the wire, must never strand the lobby. */
const READY_CHECK_MS = 6000;
// Bar crawl: it reaches 90% quickly, then holds until the answer lands.
const READY_BAR_FILL_MS = 2000;
const READY_BAR_HOLD_PCT = 90;
// Once both sides are armed, the fixed beat for the two terminals to load.
const ARENA_LOAD_SECONDS = 5;

/* Topbar alerts. A lobby notice (short wallet, a stepped-off match, an offline
   board) drops a full-width bar above the menu bar, each one closed by its own
   cross. They expire on their own so a stale warning never parks at the top of
   the lobby. */
const ALERT_TTL_MS = 9000;
const ALERT_STACK_MAX = 3;
type AlertTone = 'danger' | 'warn' | 'success' | 'info';
type LobbyAlert = { id: number; text: string; tone: AlertTone };

/* The bar wears the news: a refused action burns red, a nudge runs amber-orange,
   good news goes green, a plain status update blue — white copy on every one.
   The deep end of each gradient is a token, so the light theme re-inks it. Full
   class strings, never assembled, so Tailwind can see them. */
const ALERT_TONES: Record<AlertTone, { bar: string; Icon: typeof Info }> = {
  danger: {
    bar: 'bg-[linear-gradient(100deg,var(--term-sell),var(--term-sell-deep))]',
    Icon: AlertTriangle,
  },
  warn: {
    bar: 'bg-[linear-gradient(100deg,var(--term-heat-2),var(--term-warn-deep))]',
    Icon: AlertTriangle,
  },
  success: {
    bar: 'bg-[linear-gradient(100deg,var(--term-buy),var(--term-buy-deep))]',
    Icon: CheckCircle2,
  },
  info: {
    bar: 'bg-[linear-gradient(100deg,var(--term-accent),var(--term-accent-deep))]',
    Icon: Info,
  },
};

function getTierBadge(rating: number) {
  if (rating >= 1600) return { label: 'Grandmaster', color: '#f59e0b' };
  if (rating >= 1500) return { label: 'Master', color: '#a855f7' };
  if (rating >= 1400) return { label: 'Diamond', color: '#38bdf8' };
  if (rating >= 1300) return { label: 'Platinum', color: '#2dd4bf' };
  if (rating >= 1250) return { label: 'Gold', color: '#fb923c' };
  return { label: 'Silver II', color: '#94a3b8' };
}

/*
 * Challenge bet chips. No in-between figures like 150, 550 or 650: a wager
 * is a 100 chip, a 200 chip, or a clean jump of 500 (500, 1000, 1500 …).
 * The ticket steppers and the hand-typed input both snap onto this ladder.
 */
function stakeLadderHas(n: number): boolean {
  return n === 100 || n === 200 || (n >= 500 && n % 500 === 0);
}
function snapStakeChip(n: number): number {
  if (n <= 150) return 100;
  if (n <= 350) return 200;
  return Math.max(500, Math.round(n / 500) * 500);
}
/** Smallest chip strictly above n. */
function nextStakeChip(n: number): number {
  if (n < 100) return 100;
  if (n < 200) return 200;
  if (n < 500) return 500;
  return (Math.floor(n / 500) + 1) * 500;
}
/** Largest chip strictly below n; 0 when n is at or under the smallest. */
function prevStakeChip(n: number): number {
  if (n > 500) return n % 500 === 0 ? n - 500 : Math.floor(n / 500) * 500;
  if (n > 200) return 200;
  if (n > 100) return 100;
  return 0;
}

/*
 * Challenge board colour tiers, painted with the terminal's warm heat ramp
 * (--term-heat-1..4) so the board re-inks itself with the light/dark
 * switch like the rest of the lobby. The ticket graphics read one small
 * table: a full gradient rail, a matching badge and Accept button, and a
 * glow that only the top rung lights. Classes (never inline colours) so
 * /35 tints stay theme-aware.
 */
type StakeTier = {
  key: 'standard' | 'elevated' | 'hot' | 'whale';
  label: string;    // tooltip copy
  rail: string;     // left gradient rail + meter fill
  text: string;     // the stake figure
  chip: string;     // avatar initial tile
  glow: string;     // whale-only warm aura behind the card
  action: string;   // Accept button
};
const STAKE_TIERS: StakeTier[] = [
  {
    key: 'standard',
    label: 'Standard',
    rail: 'bg-[linear-gradient(180deg,var(--term-heat-1),var(--term-heat-2))]',
    text: 'text-[var(--term-heat-1)]',
    chip: 'text-[var(--term-heat-1)] ring-[var(--term-heat-1)]/30',
    glow: '',
    action: 'border-[var(--term-heat-1)]/45 bg-[var(--term-heat-1)]/10 text-[var(--term-heat-1)] hover:bg-[var(--term-heat-1)]/18',
  },
  {
    key: 'elevated',
    label: 'Elevated',
    rail: 'bg-[linear-gradient(180deg,var(--term-heat-1),var(--term-heat-2))]',
    text: 'text-[var(--term-heat-2)]',
    chip: 'text-[var(--term-heat-2)] ring-[var(--term-heat-2)]/30',
    glow: '',
    action: 'border-[var(--term-heat-2)]/45 bg-[var(--term-heat-2)]/10 text-[var(--term-heat-2)] hover:bg-[var(--term-heat-2)]/18',
  },
  {
    key: 'hot',
    label: 'Hot',
    rail: 'bg-[linear-gradient(180deg,var(--term-heat-2),var(--term-heat-3))]',
    text: 'text-[var(--term-heat-3)]',
    chip: 'text-[var(--term-heat-3)] ring-[var(--term-heat-3)]/30',
    glow: '',
    action: 'border-[var(--term-heat-3)]/45 bg-[var(--term-heat-3)]/10 text-[var(--term-heat-3)] hover:bg-[var(--term-heat-3)]/18',
  },
  {
    key: 'whale',
    label: 'Whale',
    rail: 'bg-[linear-gradient(180deg,var(--term-heat-3),var(--term-heat-4))]',
    text: 'text-[var(--term-heat-4)]',
    chip: 'text-[var(--term-heat-4)] ring-[var(--term-heat-4)]/40',
    glow: 'shadow-[0_0_22px_-8px_var(--term-heat-4)]',
    action: 'border-[var(--term-heat-4)]/50 bg-[var(--term-heat-4)]/12 text-[var(--term-heat-4)] hover:bg-[var(--term-heat-4)]/20',
  },
];
function stakeTierFor(stake: number, ticketFee: number): StakeTier {
  if (stake >= 10_000) return STAKE_TIERS[3];
  if (stake >= ticketFee * 5) return STAKE_TIERS[2];
  if (stake >= ticketFee * 2) return STAKE_TIERS[1];
  return STAKE_TIERS[0];
}

/** "3m ago" / "just now" — how long a card has been sitting open. */
function elapsedStamp(createdAt: number, now: number): string {
  const secs = Math.max(0, Math.floor((now - createdAt) / 1000));
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

function PlayLobbyContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, logout, syncFromSupabase, spendCoins, history } = useAuthStore();
  const [mounted, setMounted] = useState(false);

  // Core Ticket Configuration
  const [selectedPair] = useState('XAU/USD');
  const [selectedDuration, setSelectedDuration] = useState<MatchDurationId>(DEFAULT_MATCH_DURATION);
  /** Live stake in coins, editable in the ticket. Defaults to the 100-coin entry;
   *  raising it onto the chip ladder (100, 200, then 500s) turns the button into
   *  a challenge post. */
  const [stakeInput, setStakeInput] = useState('100');
  /** Live charges a coin entry and pays the pot; Demo and bot are free. */
  const [mode, setMode] = useState<'live' | 'demo' | 'bot'>('live');
  const [roomCodeInput, setRoomCodeInput] = useState('');
  /* Private table. The coins are frozen the moment the code is minted, so the
     invite link and the host's own seat always quote the same stake. */
  const [tableCoinsInput, setTableCoinsInput] = useState('');
  const [table, setTable] = useState<{ code: string; stake: number; duration: MatchDurationId } | null>(null);
  const [tableCopied, setTableCopied] = useState<'code' | 'link' | null>(null);
  /* The table code this tab is knocking on as a guest. Non-null means we are
     waiting for the host to seat us, which is what the join half paints. */
  const [tableJoinCode, setTableJoinCode] = useState<string | null>(null);
  /* The realtime table room. The host holds it open until a rival sits down;
     the guest holds it while knocking. Both drop it on unmount. */
  const tableChannelRef = useRef<ReturnType<typeof openPrivateTable> | null>(null);
  /* Seat carried by a `?table=` invite link — the whole code, not just the
     first five characters, so the link lands on the table it names. */
  const [linkTable, setLinkTable] = useState<{ code: string; stake: number; duration: MatchDurationId } | null>(null);

  // Matchmaking Queue
  const [queueing, setQueueing] = useState(false);
  const [queueTimer, setQueueTimer] = useState(0);
  // Elapsed wait on a posted challenge: it sits on the board, not in the queue,
  // so the queue clock never runs for it.
  const [challengeTimer, setChallengeTimer] = useState(0);
  // Coarse clock behind the board's "3m ago" stamps — wall time kept in
  // state by an interval, so no impure read slips into the render itself.
  const [boardNow, setBoardNow] = useState(() => Date.now());
  // Unique session ID per tab (stable for lifetime of this page load)
  const [sessionId] = useState<string>(() => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return 'ply_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 11);
  });
  /** Why a Live queue could not be entered, a challenge was refused, a match was
   *  stepped off — stacked as dismissible alerts under the topbar. */
  const [alerts, setAlerts] = useState<LobbyAlert[]>([]);
  const alertSeqRef = useRef(0);
  const alertTimersRef = useRef<Map<number, NodeJS.Timeout>>(new Map());

  const dismissAlert = useCallback((id: number) => {
    const timer = alertTimersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      alertTimersRef.current.delete(id);
    }
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  /* Same call shape as the old single notice — text raises an alert, null wipes
     the strip — so every notice site keeps working in its louder home. Nothing
     worth colouring is left to the default: pass a tone with the text. */
  const setQueueNotice = useCallback((text: string | null, tone: AlertTone = 'danger') => {
    if (text === null) {
      alertTimersRef.current.forEach(clearTimeout);
      alertTimersRef.current.clear();
      setAlerts([]);
      return;
    }
    alertSeqRef.current += 1;
    const id = alertSeqRef.current;
    // A repeat of the line already on screen does not stack twice.
    setAlerts((prev) => [...prev.filter((a) => a.text !== text), { id, text, tone }].slice(-ALERT_STACK_MAX));
    alertTimersRef.current.set(id, setTimeout(() => dismissAlert(id), ALERT_TTL_MS));
  }, [dismissAlert]);

  // Nobody's timer should outlive the lobby.
  useEffect(() => () => {
    alertTimersRef.current.forEach(clearTimeout);
    alertTimersRef.current.clear();
  }, []);
  const [matchedRival, setMatchedRival] = useState<QueuePlayer | null>(null);
  const [activeQueueCount, setActiveQueueCount] = useState<number>(0);
  const [matchFoundData, setMatchFoundData] = useState<{ payload: import('@/lib/matchmaking/matchmaker').MatchFoundPayload; mode: string } | null>(null);
  const [matchFoundCountdown, setMatchFoundCountdown] = useState(ARENA_LOAD_SECONDS);
  // Beat one is the ready check ('arming'), beat two loads both terminals
  // ('loading'). The ticket shows a crawling bar for the first and the ring
  // countdown for the second, so the wait always reads as progress.
  const [revealPhase, setRevealPhase] = useState<'arming' | 'loading'>('arming');
  const [readyPct, setReadyPct] = useState(0);
  const matchCdTimerRef = useRef<NodeJS.Timeout | null>(null);
  const readyBarRef = useRef<NodeJS.Timeout | null>(null);
  const readyCapRef = useRef<NodeJS.Timeout | null>(null);
  // The room the reveal is holding for, and what runs when the countdown lands:
  // the queue and the challenge board each hand in their own commit.
  const revealRoomRef = useRef<string | null>(null);
  const revealCommitRef = useRef<(() => void) | null>(null);
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

  // Center column tab: the Match Ticket, the Stats screen, or one of the
  // utility screens the rail and the wallet card open. Money is a
  // center-column screen too — the wallet card only points at it.
  const [centerTab, setCenterTab] = useState<LobbyTab>('ticket');
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
  const [mailClearing, setMailClearing] = useState(false);
  // Pixels left between the mailbox list's top and the bottom of the screen.
  // Measured when the mailbox opens so the pane stretches to the fold instead
  // of a hard-coded box that cuts a row in half.
  const [mailListMaxH, setMailListMaxH] = useState<number | null>(null);
  const mailListRef = useRef<HTMLDivElement | null>(null);
  const mailUserId = user && !user.isGuest ? user.id : '';

  // Match History never leaves the lobby — the card lists a page of duels and
  // pages through the archive in place.
  const [historyPage, setHistoryPage] = useState(0);
  const historyPages = Math.max(1, Math.ceil(history.length / HISTORY_PAGE_SIZE));
  const historyWindowStart = Math.min(historyPage, historyPages - 1) * HISTORY_PAGE_SIZE;
  const historySlice = history.slice(historyWindowStart, historyWindowStart + HISTORY_PAGE_SIZE);

  // Affiliate desk, forex-broker style: a tiered rebate off the platform fee
  // of every Live duel the downline trades. Reads only — the pairing, the
  // tier, and every commission are decided inside Postgres — with one write:
  // the player's own transfer of the desk balance into the wallet.
  const [affiliateDesk, setAffiliateDesk] = useState<IbDesk | null>(null);
  const [affiliateBoard, setAffiliateBoard] = useState<IbBoardRow[]>([]);
  const [affiliateUnavailable, setAffiliateUnavailable] = useState(false);
  const [affiliateLoading, setAffiliateLoading] = useState(false);
  const [affiliateTransferring, setAffiliateTransferring] = useState(false);
  const [affiliateNotice, setAffiliateNotice] = useState<string | null>(null);
  const [affiliateCopied, setAffiliateCopied] = useState(false);
  // The callsign as the database holds it: a signup whose name was taken got a
  // suffix, and only the stored one resolves an invite link.
  const [affiliateCode, setAffiliateCode] = useState('');

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

  // Progress stats (local snapshot, mirrored to Supabase when available). Only
  // the settled record is surfaced — no levels, XP, rank or missions here.
  const progressStats = useProgressStore((s) => s.stats);
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
   * button quick-matches; a chip-ladder figure above it (100, 200, 500, 1000,
   * 1500 …) turns that button into a challenge post, and the lobby waits for a
   * rival to accept it. No in-between bets: 150, 550, 650 do not exist.
   */
  const ticketStake = Math.floor(Number(stakeInput));
  const isChallengeMode = mode === 'live' && Number.isFinite(ticketStake) && ticketStake > ticketFee;
  /* No house ceiling — a challenge can run all the way to the whole wallet.
     The only rules: it must beat the standard entry, sit on the chip ladder,
     and the poster must be able to cover it. */
  const challengeValid =
    Number.isFinite(ticketStake) && ticketStake > ticketFee && stakeLadderHas(ticketStake) && ticketStake <= userCoins;
  const challengeAffordable = Number.isFinite(ticketStake) && ticketStake <= userCoins;
  const clampStake = (n: number) => {
    if (!Number.isFinite(n)) return ticketFee;
    // Snap onto the chip ladder, then keep it between the smallest bettable
    // chip and the tallest chip the balance covers.
    return Math.max(minChallengeStake, Math.min(maxChipForBalance, snapStakeChip(n)));
  };
  /* Lowest stake the steppers can reach: the entry itself when it is already a
     chip (100/500 fees), otherwise the first chip above it (250 fee → 500). */
  const minChallengeStake = stakeLadderHas(ticketFee) ? ticketFee : nextStakeChip(ticketFee);
  /* Tallest chip the wallet can fully cover; never below the lowest step. */
  const maxChipForBalance = Math.max(minChallengeStake, snapStakeChip(userCoins));
  /* The invite seat only applies while the code box still holds that code. */
  const activeLinkTable = linkTable && linkTable.code === roomCodeInput ? linkTable : null;

  const progressPlayed = progressStats.matches;
  const progressWinRate = progressPlayed > 0 ? Math.round((progressStats.wins / progressPlayed) * 100) : 0;
  const unreadMailCount = mailItems.filter((m) => !m.read).length;
  const staleMailIds = mailItems
    .filter((m) => new Date(m.createdAt).getTime() < epochMs() - MAIL_STALE_MS)
    .map((m) => m.id);

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

  // One-click inbox cleanup. The rows go from the database first, so a reload
  // cannot bring them back; the local list and the device cache follow it.
  const clearStaleMails = async () => {
    if (!mailUserId || staleMailIds.length === 0) return;
    sound.playClick();
    setMailClearing(true);
    const removed = await deleteMails(mailUserId, staleMailIds);
    setMailClearing(false);

    if (removed === null) {
      setQueueNotice('Mailbox cleanup needs the live database — try again when it is reachable.');
      return;
    }

    const next = mailItems.filter((m) => !staleMailIds.includes(m.id));
    setMailItems(next);
    saveMailCache(mailUserId, next);
    setQueueNotice(`Cleared ${removed} stale message${removed === 1 ? '' : 's'}.`, 'success');
    if (expandedMailId && staleMailIds.includes(expandedMailId)) setExpandedMailId(null);
  };

  // Stretch the mailbox list down to the bottom of the screen. The offset is
  // measured, not guessed, so the tab strip above and the page padding below
  // can change without a row ever being clipped mid-height.
  useEffect(() => {
    if (centerTab !== 'mail') return;
    const el = mailListRef.current;
    if (!el) return;
    const measure = () => {
      setMailListMaxH(Math.max(240, Math.round(window.innerHeight - el.getBoundingClientRect().top - 16)));
    };
    // eslint-disable-next-line react-hooks/set-state-in-effect
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [centerTab]);

  const [authChecked, setAuthChecked] = useState(false);

  // Mount-only: reset stale match/queue state + fetch live leaderboard (runs once)
  useEffect(() => {
    // Mount flag: the ticket must render its client-only state after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    setMatchFoundData(null);
    setMatchedRival(null);
    setQueueing(false);

    const modeParam = searchParams.get('mode');
    // Older links carry friendly/ranked; they map onto Demo/Live. 'standard' and
    // 'risk' name the scoring rules, not the staking table, so they are ignored.
    if (modeParam === 'demo' || modeParam === 'friendly') setMode('demo');
    if (modeParam === 'live' || modeParam === 'ranked') setMode('live');
    if (modeParam === 'bot') setMode('bot');

    // `?table=CODE&stake=…&duration=…` is a private-table invite. The code is
    // the whole XXXXX-XXXXX table, so the link lands on the room it names.
    const tableParam = searchParams.get('table');
    if (tableParam) {
      const code = normalizeRoomCode(tableParam);
      const durationParam = searchParams.get('duration');
      if (roomCodeIsComplete(code)) {
        setRoomCodeInput(code);
        setLinkTable({
          code,
          stake: Math.max(0, Math.floor(Number(searchParams.get('stake') ?? 0)) || 0),
          duration: (durationParam && durationParam in MATCH_DURATIONS
            ? durationParam
            : DEFAULT_MATCH_DURATION) as MatchDurationId,
        });
      }
    }
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

  /* ──────────────────────────────────────────────────────────
     MATCH FOUND REVEAL — two beats, both inside the Match Ticket:
     a ready check on the rival's tab (the loading bar), then a fixed
     beat while both terminals load. The owner of the match — the queue or
     the challenge board — hands in the commit that runs at the end.
  ────────────────────────────────────────────────────────── */
  const stopReadyCheck = useCallback(() => {
    if (readyBarRef.current) {
      clearInterval(readyBarRef.current);
      readyBarRef.current = null;
    }
    if (readyCapRef.current) {
      clearTimeout(readyCapRef.current);
      readyCapRef.current = null;
    }
  }, []);

  // Beat two: the bar is full, so both sides are armed and loading.
  const startArenaLoad = useCallback(() => {
    stopReadyCheck();
    setReadyPct(100);
    setRevealPhase('loading');
    setMatchFoundCountdown(ARENA_LOAD_SECONDS);
    let count = ARENA_LOAD_SECONDS;

    if (matchCdTimerRef.current) clearInterval(matchCdTimerRef.current);
    matchCdTimerRef.current = setInterval(() => {
      count -= 1;
      setMatchFoundCountdown(count);
      if (count > 0) return;
      if (matchCdTimerRef.current) {
        clearInterval(matchCdTimerRef.current);
        matchCdTimerRef.current = null;
      }
      revealCommitRef.current?.();
    }, 1000);
  }, [stopReadyCheck]);

  // Beat one: paint the reveal and crawl the bar until the rival answers.
  const beginReveal = useCallback(
    (roomCode: string, commit: () => void, rivalAlreadyArmed = false) => {
      revealRoomRef.current = roomCode;
      revealCommitRef.current = commit;
      stopReadyCheck();
      if (matchCdTimerRef.current) {
        clearInterval(matchCdTimerRef.current);
        matchCdTimerRef.current = null;
      }
      setRevealPhase('arming');
      setReadyPct(0);

      const startedAt = Date.now();
      readyBarRef.current = setInterval(() => {
        const spent = Date.now() - startedAt;
        setReadyPct(Math.min(READY_BAR_HOLD_PCT, Math.round((spent / READY_BAR_FILL_MS) * READY_BAR_HOLD_PCT)));
      }, 80);

      /* A simulated opponent has no second tab to answer, so the bar is only
         given time to visibly finish. A real rival gets the full window. */
      readyCapRef.current = setTimeout(startArenaLoad, rivalAlreadyArmed ? 700 : READY_CHECK_MS);
    },
    [startArenaLoad, stopReadyCheck],
  );

  // The rival's tab answered for the room we are holding — finish the check.
  const handleRivalReady = useCallback(
    (roomCode: string) => {
      if (roomCode !== revealRoomRef.current) return;
      if (!readyBarRef.current) return; // beat one already ended
      startArenaLoad();
    },
    [startArenaLoad],
  );

  // Matchmaking Queue listener — only re-runs when queueing toggles
  useEffect(() => {
    if (!queueing) {
      // Queue teardown: clear the sealed match and its clock.
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
      onStatusChange: (_status, count) => {
        setActiveQueueCount(count);
      },
      onMatchFound: (match: MatchFoundPayload) => {
        setMatchedRival(match.rival);
        sound.playAlert();
        // Reveal the rival inside the Match Ticket, starting the ready check
        setCenterTab('ticket');
        setMatchFoundData({ payload: match, mode: 'standard' });
        beginReveal(match.roomCode, () => {
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

          // Navigate without clearing the reveal first, so the ticket stays
          // painted until the terminal page mounts.
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
        });
      },
      onRivalReady: handleRivalReady,
      onError: (err) => {
        console.warn('Realtime matchmaking error:', err);
      },
    });

    return () => {
      clearInterval(timerInterval);
      cleanupQueue();
    };
    // Only re-run when queueing toggles or the ticket duration changes — user/mode read from refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queueing, selectedDuration]);

  /* The reveal's timers belong to the match, not to the queue effect: accepting
     a challenge stops the queue in the same breath it arms the reveal, so the
     queue teardown must not touch them. This is the one place they are cut. */
  useEffect(
    () => () => {
      stopReadyCheck();
      if (matchCdTimerRef.current) {
        clearInterval(matchCdTimerRef.current);
        matchCdTimerRef.current = null;
      }
    },
    [stopReadyCheck],
  );

  /* A posted challenge waits on the board instead of in the queue, so it ticks
     its own clock — the ticket button prints "Matching…" plus the wait in both
     cases and nothing else. */
  useEffect(() => {
    if (!myChallenge) return;
    const startedAt = myChallenge.createdAt;
    const tick = setInterval(() => {
      setChallengeTimer(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    }, 1000);
    return () => clearInterval(tick);
  }, [myChallenge]);

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

  /** Who this tab is, in the shape the table channel publishes. */
  const tableIdentity = () => ({
    sessionId,
    userId: user?.id ?? null,
    username: user?.username || 'Trader_' + sessionId.slice(-4),
    rating: user?.rating || 1200,
  });

  /** Open the realtime room and wait there; nothing is charged while waiting. */
  const startHostingTable = (entry: { code: string; stake: number; duration: MatchDurationId }) => {
    tableChannelRef.current?.leave();
    tableChannelRef.current = openPrivateTable({
      code: entry.code,
      role: 'host',
      me: tableIdentity(),
      stake: entry.stake,
      duration: entry.duration,
      onRivalJoined: (rival) =>
        setQueueNotice(`${rival.username} sat down at your table — arming the match…`, 'success'),
      onMatchFound: (match) => startChallengeMatch(match),
      onRivalReady: handleRivalReady,
      onError: (err) => console.warn('Private table error:', err),
    });
  };

  const handleJoinWithCode = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    sound.playClick();
    const code = normalizeRoomCode(roomCodeInput);
    const compact = code.replace(/[^A-Z0-9]/g, '');

    /* Your own table: knocking on it would drop the host channel and pair you
       with your own tab. Send the code to a rival instead. */
    if (table && table.code === code) {
      setQueueNotice('That is your own table — send the code to a rival instead.', 'warn');
      return;
    }

    /* Short code: the old free room, kept for links minted before tables had a
       full ten-character code. */
    if (compact.length === 5) {
      const seat = activeLinkTable?.stake ?? 0;
      const duration = activeLinkTable?.duration ?? selectedDuration;
      if (seat > 0) {
        if (seat > userCoins) {
          setQueueNotice(`That seat costs ${seat.toLocaleString()} coins — you hold ${userCoins.toLocaleString()}.`);
          return;
        }
        if (!spendCoins(seat)) {
          setQueueNotice('The wallet fell short of that table — deposit coins first.');
          return;
        }
        stashRoomSession(code, { mode: 'standard', opponent: 'live', duration, ranked: true, stake: seat });
      } else {
        stashRoomSession(code, { duration, ranked: false });
      }
      router.push(`/play/${code}`);
      return;
    }

    if (compact.length !== 10) {
      setQueueNotice('A table code is ten characters — paste the whole thing; the dash is optional.');
      return;
    }

    /* Full table code: knock and wait here. The host names the stake, the seed
       and the shared start, then the ordinary MATCH FOUND reveal takes over. */
    setQueueNotice(null);
    // One tab, one seat: drop any table we were hosting before knocking.
    if (table) {
      tableChannelRef.current?.leave();
      tableChannelRef.current = null;
      setTable(null);
      setTableCopied(null);
    }
    setTableJoinCode(code);
    const handle = openPrivateTable({
      code,
      role: 'guest',
      me: tableIdentity(),
      stake: 0,
      duration: selectedDuration,
      onMatchFound: (match) => {
        setTableJoinCode(null);
        startChallengeMatch(match);
      },
      onRivalReady: handleRivalReady,
      onError: (err) => console.warn('Private table error:', err),
    });
    tableChannelRef.current = handle;
    handle.knock();
  };

  /* Mint a private table at a chip-ladder stake and start waiting on it. The
     seat only leaves the wallet when a rival actually sits down, so a table
     nobody joins costs nothing. */
  const handleGenerateTableCode = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    sound.playClick();
    const stake = clampStake(Number(tableCoinsInput) || ticketFee);
    setTableCoinsInput(String(stake));
    const entry = { code: generateRoomCode(), stake, duration: selectedDuration };
    setTable(entry);
    setTableCopied(null);
    startHostingTable(entry);
    setQueueNotice(
      `Table open at ${stake.toLocaleString()} coins — waiting for a rival. Nothing is charged until someone joins.`,
      'info',
    );
  };

  const tableInviteLink = (entry: { code: string; stake: number; duration: MatchDurationId }) =>
    `${window.location.origin}/play?table=${entry.code}&stake=${entry.stake}&duration=${entry.duration}`;

  const copyTableValue = (kind: 'code' | 'link') => {
    if (!table) return;
    sound.playClick();
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      setQueueNotice('Your browser blocked the clipboard — write the code down by hand.');
      return;
    }
    const text = kind === 'code' ? table.code : tableInviteLink(table);
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setTableCopied(kind);
        setTimeout(() => setTableCopied(null), 1600);
      })
      .catch(() => setQueueNotice('Your browser blocked the clipboard — write the code down by hand.'));
  };

  /** Walk away from a table — as host before anyone sits, or as a knocking guest. */
  const handleCloseTable = () => {
    sound.playClick();
    tableChannelRef.current?.leave();
    tableChannelRef.current = null;
    setTable(null);
    setTableCopied(null);
    setTableJoinCode(null);
    setQueueNotice('Table closed — no coins were charged.', 'info');
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
  // `simulatedRival` is set for a demo opponent — there is no second tab to
  // answer the ready check, so the reveal does not wait for one.
  const startChallengeMatch = (match: ChallengeMatchPayload, simulatedRival = false) => {
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
    // The reveal lives in the ticket, so pull the centre column back to it —
    // a challenge can be accepted by its host while the Stats tab is open.
    setCenterTab('ticket');
    setMatchFoundData({
      payload: { roomCode: match.roomCode, seed: match.seed, startAt: match.startAt, rival },
      mode: 'standard',
    });
    setAcceptingId(null);
    sound.playAlert();

    beginReveal(
      match.roomCode,
      () => {
        // The stake is only charged here — backing out (or a short wallet) before
        // this point costs nothing, mirroring the Live queue.
        if (!spendCoins(match.stake)) {
          stopReadyCheck();
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
      },
      simulatedRival,
    );
  };

  const handlePostChallengeFromTicket = () => {
    sound.playClick();
    const stake = ticketStake;
    // Snap a hand-typed value back onto the chip ladder before anything else.
    if (Number.isFinite(stake) && stake > ticketFee && !stakeLadderHas(stake)) {
      setStakeInput(String(clampStake(stake)));
      setQueueNotice('Bets move on the chip ladder: 100, 200, then 500s.', 'warn');
      return;
    }
    if (!challengeValid) {
      setQueueNotice(
        challengeAffordable
          ? `A challenge must beat the ${ticketFee.toLocaleString()}-coin entry.`
          : `A challenge runs at most to your whole balance — ${userCoins.toLocaleString()} coins.`,
        'warn',
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
    setChallengeTimer(0);
    setMyChallenge(challenge);
    setQueueNotice(`Challenge posted — ${stake.toLocaleString()} coins on the board.`, 'success');
  };

  const handleCancelChallenge = () => {
    sound.playClick();
    boardRef.current?.retract();
    setMyChallenge(null);
    setQueueNotice('Your challenge is off the board.', 'info');
  };

  /* Backing out of a Match Found reveal. The entry is only taken by the commit
     at the end of the countdown, so stopping here costs the wallet nothing —
     the rival's tab simply loads the arena without us. */
  const handleCancelReveal = () => {
    sound.playClick();
    stopReadyCheck();
    if (matchCdTimerRef.current) {
      clearInterval(matchCdTimerRef.current);
      matchCdTimerRef.current = null;
    }
    // Cut the commit loose so a beat already in flight cannot charge or jump.
    revealRoomRef.current = null;
    revealCommitRef.current = null;
    setMatchFoundData(null);
    setRevealPhase('arming');
    setReadyPct(0);
    setMatchedRival(null);
    setQueueing(false);
    // A board slot that paired us is not left hanging for a third trader.
    if (myChallenge) {
      boardRef.current?.retract();
      setMyChallenge(null);
    }
    setQueueNotice('You stepped off the match before it loaded — no coins charged.', 'info');
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
          startAt: epochMs() + 13000,
          stake: challenge.stake,
          duration: challenge.duration,
          rival: { username: challenge.username, rating: challenge.rating },
        }, true);
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
      onRivalReady: handleRivalReady,
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

  // Coarse 15s heartbeat behind the board's elapsed stamps.
  useEffect(() => {
    const t = setInterval(() => setBoardNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  // If a host never replies (they closed the tab, or the accept missed them),
  // release the "Waiting…" state so the board stays usable.
  useEffect(() => {
    if (!acceptingId) return;
    const t = setTimeout(() => {
      setAcceptingId(null);
      setQueueNotice('No answer from that trader yet — try another challenge.', 'warn');
    }, 20000);
    return () => clearTimeout(t);
  }, [acceptingId]);

  /* A guest knocking on a table code gives the host 15s to answer — a typo in
     the code would otherwise leave the box spinning at a table that does not
     exist. */
  useEffect(() => {
    if (!tableJoinCode) return;
    const t = setTimeout(() => {
      tableChannelRef.current?.leave();
      tableChannelRef.current = null;
      setTableJoinCode(null);
      setQueueNotice(`No table answered ${tableJoinCode} — check the code with your rival.`, 'warn');
    }, 15_000);
    return () => clearTimeout(t);
  }, [tableJoinCode]);

  /* Leave whatever table channel this tab holds when the lobby unmounts (a
     match started, or the player navigated away). */
  useEffect(() => (
    () => {
      tableChannelRef.current?.leave();
      tableChannelRef.current = null;
    }
  ), []);

  /* Affiliate: the code is the callsign, so there is nothing to mint here. The
     desk reads what Postgres already paid — tier, balance, every commission —
     and moves no coins of its own. Re-read on every open, the mailbox way. */
  const affiliateUserId = currentUser && !currentUser.isGuest ? currentUser.id : '';

  const loadAffiliate = useCallback(async (playerId: string) => {
    setAffiliateLoading(true);
    const [desk, board, names] = await Promise.all([
      fetchIbDesk(playerId),
      fetchIbLeaderboard(8),
      fetchPlayerNames([playerId]),
    ]);
    setAffiliateDesk(desk);
    setAffiliateUnavailable(desk === null);
    setAffiliateBoard(board ?? []);
    setAffiliateCode(names[playerId] ?? '');
    setAffiliateLoading(false);
  }, []);

  useEffect(() => {
    if (centerTab !== 'affiliate' || !affiliateUserId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadAffiliate(affiliateUserId);
  }, [centerTab, affiliateUserId, loadAffiliate]);

  // "Copied" is a two-second confirmation, not a thing to remember.
  useEffect(() => {
    if (!affiliateCopied) return;
    const t = setTimeout(() => setAffiliateCopied(false), 2000);
    return () => clearTimeout(t);
  }, [affiliateCopied]);

  const copyInviteLink = async () => {
    const link = buildInviteLink(affiliateCode || (currentUser?.username ?? ''));
    if (!link) return;
    sound.playClick();
    try {
      await navigator.clipboard.writeText(link);
      setAffiliateCopied(true);
    } catch {
      setQueueNotice('Your browser blocked the clipboard — select the link and copy it by hand.');
    }
  };

  /* Empty the desk into the game wallet. The coins cross inside Postgres
     (one ledger row, kind 'referral'), so the wallet only becomes truthful
     after a re-sync — then the ordinary withdrawal flow cashes them out. */
  const transferDeskToWallet = async () => {
    if (!affiliateUserId || affiliateTransferring) return;
    sound.playClick();
    setAffiliateTransferring(true);
    setAffiliateNotice(null);
    const moved = await transferIbBalance();
    if (moved === null) {
      setAffiliateNotice('The desk is unreachable right now — try again when the database is back.');
    } else if (moved > 0) {
      await syncFromSupabase(affiliateUserId);
      setAffiliateNotice(`${moved.toLocaleString()} coins moved to the wallet. Withdraw them any time from Money.`);
    }
    const fresh = await fetchIbDesk(affiliateUserId);
    if (fresh) setAffiliateDesk(fresh);
    setAffiliateTransferring(false);
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
      className="term-theme relative isolate min-h-screen w-full text-[var(--term-text)] flex flex-col select-none text-sm overflow-x-clip font-sans"
    >
      {/* ── Flat field — one navy canvas, no texture, no colour wash ── */}
      <div className="fixed inset-0 bg-[var(--term-canvas)] -z-10" />

      {/* ── Announcement strip — the first thing on the page, above the header ── */}
      <AnnouncementBar />

      {/* ── Alert bars — above the menu bar: one solid gradient stripe per
          notice, coloured by what happened, white copy centred, cross on the
          right edge ── */}
      {alerts.length > 0 && (
        <div className="relative z-40 space-y-px">
          {alerts.map((a) => {
            const { bar, Icon } = ALERT_TONES[a.tone];
            return (
              <div
                key={a.id}
                role="status"
                className={`relative flex items-center ${bar} px-11 py-2 text-[11px] font-mono font-bold text-white shadow-md animate-in slide-in-from-top-2 duration-200`}
              >
                <Icon size={13} className="absolute left-3 top-1/2 -translate-y-1/2 shrink-0" aria-hidden="true" />
                <span className="flex-1 text-center leading-snug">{a.text}</span>
                <button
                  onClick={() => { sound.playClick(); dismissAlert(a.id); }}
                  title="Dismiss"
                  aria-label="Dismiss this alert"
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 rounded flex items-center justify-center text-white/75 hover:text-white hover:bg-white/15 transition-colors cursor-pointer"
                >
                  <X size={13} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Top bar — a social shell rather than a terminal strip: brand pinned
          left, section nav centred, account cluster right, and a 2px underline
          marking the screen the center column is showing. ── */}
      <header className="h-14 shrink-0 sticky top-0 z-30 border-b border-[var(--term-border)] bg-[var(--term-surface)]/95 backdrop-blur-xl">
        <div className="mx-auto flex h-full w-full max-w-[1180px] items-center justify-between gap-3 px-3 md:px-4">
          <Link href="/" className="flex shrink-0 items-center gap-2 group">
            <div className="w-8 h-8 rounded bg-[var(--term-accent)]/20 text-[var(--term-accent)] border border-[var(--term-accent)]/40 flex items-center justify-center font-black">
              <Swords size={16} />
            </div>
            <span className="hidden sm:block font-bold text-[13px] uppercase tracking-[0.16em] leading-none text-[var(--term-strong)]">
              Pip Duel
            </span>
          </Link>

          {/* Section nav — icon over label, the open screen carries the rail */}
          <nav aria-label="Lobby sections" className="hidden md:flex h-full items-stretch">
            {([
              ['ticket', 'Battle', Swords],
              ['stats', 'Stats', BarChart3],
              ['wallet', 'Money', Coins],
              ['affiliate', 'Affiliate', Share2],
              ['mail', 'Inbox', Mail],
            ] as const).map(([id, label, Icon]) => {
              const active = centerTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    sound.playClick();
                    setCenterTab(id);
                  }}
                  aria-current={active ? 'page' : undefined}
                  title={id === 'affiliate' ? 'Affiliate — rebate on referred volume' : undefined}
                  className={`relative flex h-full min-w-[64px] flex-col items-center justify-center gap-1 px-2 text-[11px] font-semibold leading-none transition-colors cursor-pointer ${
                    active
                      ? 'text-[var(--term-accent-text)]'
                      : 'text-[var(--term-muted)] hover:text-[var(--term-text)]'
                  }`}
                >
                  <Icon size={16} />
                  <span>{label}</span>
                  <span
                    aria-hidden
                    className={`absolute inset-x-1 bottom-0 h-[2px] transition-colors ${
                      active ? 'bg-[var(--term-accent)]' : 'bg-transparent'
                    }`}
                  />
                </button>
              );
            })}
          </nav>

          <div className="flex items-center gap-1.5">
            {/* Online count */}
            <div className="hidden lg:flex items-center gap-1.5 h-8 px-2.5 rounded bg-[var(--term-raised)] border border-[var(--term-border)] text-[11px] font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--term-buy)]" />
              <span className="text-[var(--term-label)]">{onlineCount.toLocaleString()} online</span>
            </div>

            {/* Balance + Deposit — the one money door, always in the header,
                the way Quotex keeps the account and its top-up side by side */}
            {currentUser && !currentUser.isGuest && (
              <div className="flex items-center gap-1.5">
                <span className="hidden sm:flex h-8 items-center gap-1.5 rounded-lg border border-[var(--term-border)] bg-[var(--term-raised)] px-2.5 text-[11px] font-mono font-bold text-[var(--term-strong)]">
                  <img src="/coin.png" alt="" className="h-3.5 w-3.5 shrink-0 object-contain" />
                  {(balanceSyncing && mounted ? 0 : userCoins).toLocaleString()}
                </span>
                <button
                  onClick={() => {
                    sound.playClick();
                    openWallet('deposit');
                  }}
                  className="h-8 rounded-lg bg-[var(--term-accent)] px-3.5 text-[11px] font-bold tracking-wide text-[var(--term-canvas)] transition-colors hover:bg-[var(--term-accent-hi)] cursor-pointer"
                >
                  Deposit
                </button>
              </div>
            )}

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

            {/* Account — avatar first, the way a social header wears it */}
            {currentUser && (
              <div className="flex items-center gap-1.5">
                <div className="flex items-center gap-1.5 h-8 pl-1 pr-2 rounded-full bg-[var(--term-raised)] border border-[var(--term-raised-hi)]">
                  <img
                    src={currentUser.avatarUrl || DEFAULT_AVATAR}
                    alt=""
                    className="w-6 h-6 rounded-full object-cover shrink-0"
                  />
                  <span className="hidden sm:inline font-semibold text-[11px] max-w-[110px] truncate text-[var(--term-text)]">
                    {currentUser.displayName || currentUser.username}
                  </span>
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
        </div>
      </header>

      {/* ── Main rails — social geometry: a 225px identity rail, a flexible
          feed column capped at 620px, then a 300px widget rail. Below lg the
          rails stack, center column first, so the ticket stays above the fold. ── */}
      <main className="flex-1 w-full">
        <div className="mx-auto flex w-full max-w-[1180px] flex-wrap items-start gap-3 px-3 py-4 md:gap-4 md:px-4 md:py-5">

          {/* ══════════════════════════════════════════════════════════
              LEFT RAIL: identity, season snapshot, referral, rail nav
          ══════════════════════════════════════════════════════════ */}
          <aside className="order-2 w-full shrink-0 lg:order-1 lg:w-[225px]">
            <LobbyLeftRail
              user={currentUser}
              rating={userRating}
              tier={tier}
              winRate={progressWinRate}
              played={progressPlayed}
              wins={progressStats.wins}
              title={progressTitle ?? ''}
              pinned={progressPinned}
              unreadMail={unreadMailCount}
              activeTab={centerTab}
              onNavigate={setCenterTab}
            />
          </aside>

          {/* ══════════════════════════════════════════════════════════
              CENTER COLUMN: [ Battle ] [ Stats ]
                             MATCH TICKET (Perforated Pass)
                             — or, opened from the wallet card:
                             [ Deposit ] [ Withdraw ]
          ══════════════════════════════════════════════════════════ */}
          <div className="order-1 w-full min-w-0 space-y-3 lg:order-2 lg:flex-1 lg:max-w-[620px]">

            {/* Section tabs — a small-screen stand-in for the top bar's nav.
                From md up the header already carries Battle and Stats, so the
                card strip is hidden there and the pair is never shown twice */}
            <div className="md:hidden overflow-hidden rounded-lg border border-[var(--term-border)] bg-[var(--term-panel)]/90 backdrop-blur-md">
              <div className="flex items-stretch">
                {([
                  ['ticket', 'Battle', Ticket],
                  ['stats', 'Stats', BarChart3],
                ] as const).map(([id, label, Icon]) => {
                  const active = centerTab === id;
                  return (
                    <button
                      key={id}
                      onClick={() => {
                        sound.playClick();
                        setCenterTab(id);
                      }}
                      aria-current={active ? 'page' : undefined}
                      className={`relative flex h-11 flex-1 items-center justify-center gap-2 text-[13px] font-bold transition-colors cursor-pointer sm:flex-none sm:px-7 ${
                        active
                          ? 'text-[var(--term-strong)]'
                          : 'text-[var(--term-muted)] hover:text-[var(--term-text)]'
                      }`}
                    >
                      <Icon
                        size={15}
                        className={active ? 'text-[var(--term-accent)]' : 'text-[var(--term-muted)]'}
                      />
                      <span>{label}</span>
                      <span
                        aria-hidden
                        className={`absolute inset-x-0 bottom-0 h-[2px] transition-colors ${
                          active ? 'bg-[var(--term-accent)]' : 'bg-transparent'
                        }`}
                      />
                    </button>
                  );
                })}
                <span className="ml-auto hidden items-center pr-4 text-[10px] font-mono text-[var(--term-dim)] sm:flex">
                  Season 1 · Live
                </span>
              </div>
            </div>

            {centerTab === 'wallet' && (
              <div className="bg-[var(--term-panel)]/90 backdrop-blur-md border border-[var(--term-border)] rounded-lg p-4 space-y-4 animate-in fade-in duration-200">
                <div className="flex items-center justify-between gap-3 pb-2.5 border-b border-[var(--term-border)]">
                  <div className="flex items-center gap-2 min-w-0">
                    <Coins size={16} className="text-[var(--term-amber)] shrink-0" />
                    <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--term-strong)] font-mono truncate">
                      Wallet
                    </h3>
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

                {/* Money lands here from the top bar, so both halves are laid
                    out as tabs — opening the screen never hides one of them
                    behind whichever direction was used last. */}
                <div className="grid grid-cols-2 gap-2">
                  {WALLET_TABS.map((entry) => {
                    const active = walletTab === entry.id;
                    return (
                      <button
                        key={entry.id}
                        onClick={() => {
                          sound.playClick();
                          setWalletTab(entry.id);
                        }}
                        aria-current={active ? 'page' : undefined}
                        className={`h-9 rounded border text-[12px] font-bold transition-colors cursor-pointer ${
                          active
                            ? 'border-[var(--term-primary)] bg-[var(--term-raised)] text-[var(--term-strong)]'
                            : 'border-[var(--term-border)] bg-[var(--term-bg)] text-[var(--term-muted)] hover:border-[var(--term-border-hi)] hover:text-[var(--term-text)]'
                        }`}
                      >
                        {entry.label}
                      </button>
                    );
                  })}
                </div>

                <WalletPanel
                  coins={balanceSyncing && mounted ? 0 : userCoins}
                  tab={walletTab}
                />
              </div>
            )}

            {/* ── TAB CONTENT: MATCH TICKET ──
                A found match does not open a page of its own: the MATCH FOUND
                reveal takes the ticket slot, in the place the player is already
                looking at, and the arena opens from there. */}
            {centerTab === 'ticket' && matchFoundData && (() => {
              const rival = matchFoundData.payload.rival;
              const rivalTier = getTierBadge(rival.rating);
              const rivalInitials = rival.username.slice(0, 2).toUpperCase();
              const dashOffset = 163 - (163 * (5 - matchFoundCountdown)) / 5;
              return (
                <div id="match-ticket-card" className="relative p-[2px] rounded-xl overflow-hidden animate-in fade-in duration-200">
                  {/* Spinning conic border — the same halo as the Find Match button */}
                  <div className="absolute inset-[-100%] animate-[spin_3s_linear_infinite] bg-[conic-gradient(from_0deg,#3ddc84,#ff5f75,#3ddc84)] pointer-events-none" />

                  <div className="relative bg-[var(--term-surface)]/95 backdrop-blur-md rounded-[10px] overflow-hidden">
                    <div className="grid grid-cols-1 md:grid-cols-12 relative">
                      {/* Left: who the duel is against */}
                      <div className="md:col-span-8 p-4 space-y-3">
                        <div className="flex items-center justify-between pb-2 border-b border-[var(--term-border)]">
                          <span className="text-sm font-bold uppercase tracking-wider text-[var(--term-strong)] font-mono">
                            MATCH FOUND
                          </span>
                          <span className="text-xs font-mono font-medium text-[var(--term-sell)] flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-[var(--term-sell)] animate-pulse" />
                            {revealPhase === 'arming' ? 'Verifying Opponent' : 'Arena Opening'}
                          </span>
                        </div>

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

                        <div className="p-2.5 rounded bg-[var(--term-bg)] border border-[var(--term-border)] flex items-center justify-between text-xs font-mono text-[var(--term-label)]">
                          <div className="flex items-center gap-2">
                            <span className="text-[var(--term-strong)] font-bold">XAU/USD</span>
                            <span>·</span>
                            <span className="text-[var(--term-buy)] font-bold">$10,000 Balance</span>
                          </div>
                          <span className="text-[var(--term-text)] font-semibold">{selectedDuration} game</span>
                        </div>

                        {/* Ready check bar: beat one crawls while the rival's tab is
                            asked to arm, beat two sits full while both terminals load. */}
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider">
                            <span className="text-[var(--term-label)]">
                              {revealPhase === 'arming' ? 'Opponent ready check' : 'Both sides armed'}
                            </span>
                            <span className="text-[var(--term-strong)]">{readyPct}%</span>
                          </div>
                          <div className="h-2 overflow-hidden rounded bg-[var(--term-bg)] border border-[var(--term-border)]">
                            <div
                              className={`h-full transition-[width] duration-150 ease-out ${revealPhase === 'arming' ? 'bg-[var(--term-accent)]' : 'bg-[var(--term-buy)]'}`}
                              style={{ width: `${readyPct}%` }}
                            />
                          </div>
                          <p className="text-[10px] font-mono text-[var(--term-soft)]">
                            {revealPhase === 'arming'
                              ? readyPct >= READY_BAR_HOLD_PCT
                                ? `Waiting on ${rival.username}'s tab to arm…`
                                : 'Asking the rival tab to load the match…'
                              : `Loading terminals on both sides — arena opens in ${matchFoundCountdown}s.`}
                          </p>
                        </div>
                      </div>

                      {/* Stub: the ready check spins, the terminal beat counts down */}
                      <div className="md:col-span-4 p-4 bg-[var(--term-panel-deep)] md:border-l md:border-dashed md:border-[var(--term-border-hi)] flex flex-col items-center justify-center gap-3 relative">
                        <div className="hidden md:block absolute -top-3 -left-3 w-6 h-6 rounded-full bg-[var(--term-bg)] border border-[var(--term-border)] shadow-inner pointer-events-none" />
                        <div className="hidden md:block absolute -bottom-3 -left-3 w-6 h-6 rounded-full bg-[var(--term-bg)] border border-[var(--term-border)] shadow-inner pointer-events-none" />

                        {revealPhase === 'arming' ? (
                          <>
                            <div className="relative w-16 h-16">
                              <svg className="w-16 h-16 animate-spin" viewBox="0 0 56 56">
                                <circle cx="28" cy="28" r="26" fill="none" stroke="var(--term-border)" strokeWidth="3" />
                                <circle
                                  cx="28" cy="28" r="26"
                                  fill="none"
                                  stroke="var(--term-buy)"
                                  strokeWidth="3"
                                  strokeLinecap="round"
                                  strokeDasharray="42 121"
                                />
                              </svg>
                            </div>
                            <div className="text-center space-y-0.5">
                              <p className="text-xs font-bold text-[var(--term-strong)] font-mono">Checking Rival</p>
                              <p className="text-[10px] font-mono text-[var(--term-soft)] tracking-widest">holding for reply</p>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="relative w-16 h-16">
                              <svg className="w-16 h-16 -rotate-90" viewBox="0 0 56 56">
                                <circle cx="28" cy="28" r="26" fill="none" stroke="var(--term-border)" strokeWidth="3" />
                                <circle
                                  cx="28" cy="28" r="26"
                                  fill="none"
                                  stroke={matchFoundCountdown <= 2 ? 'var(--term-sell)' : 'var(--term-buy)'}
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
                              <p className="text-xs font-bold text-[var(--term-strong)] font-mono">Loading Terminals</p>
                              <p className="text-[10px] font-mono text-[var(--term-soft)] tracking-widest">both sides · {matchFoundCountdown}s</p>
                            </div>
                          </>
                        )}

                        {/* Way out: both beats happen before the charge, so the
                            ticket always offers a retreat. */}
                        <button
                          onClick={handleCancelReveal}
                          className="text-[10px] font-mono font-bold uppercase tracking-widest text-[var(--term-sell)] hover:underline cursor-pointer"
                          title="Step off before the arena opens — nothing is charged yet"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {centerTab === 'ticket' && !matchFoundData && (
              <div id="match-ticket-card" className="bg-[var(--term-panel)] border border-[var(--term-border)] rounded-lg overflow-hidden relative animate-in fade-in duration-200">
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
                                    ? 'bg-[var(--term-accent)]/12 text-[var(--term-strong)] border border-[var(--term-accent)] cursor-pointer'
                                    : 'bg-[var(--term-bg)] text-[var(--term-muted)] border border-[var(--term-border)] hover:border-[var(--term-accent)]/50 hover:text-[var(--term-accent-text)] cursor-pointer'
                              }`}
                            >
                              <span className={soon ? 'opacity-60' : undefined}>{d.label}</span>
                              {soon && (
                                <span className="absolute top-1 right-1.5 text-[8px] font-mono uppercase tracking-wider text-[var(--term-dim)]">
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
                                    ? 'bg-[var(--term-buy)]/10 text-[var(--term-strong)] border border-[var(--term-buy)]/70'
                                    : 'bg-[var(--term-primary)]/10 text-[var(--term-strong)] border border-[var(--term-primary)]/70'
                                  : isLive
                                    ? 'bg-[var(--term-bg)] text-[var(--term-muted)] border border-[var(--term-border)] hover:border-[var(--term-buy)]/40 hover:text-[var(--term-buy)]'
                                    : 'bg-[var(--term-bg)] text-[var(--term-muted)] border border-[var(--term-border)] hover:border-[var(--term-primary)]/40 hover:text-[var(--term-primary)]'
                              }`}
                            >
                              {m.label}
                            </button>
                          );
                        })}
                      </div>

                      {/* The live ticket stays quiet — no stake warnings, no
                          matching notice. Only Demo gets a one-line explanation. */}
                      {mode !== 'live' && (
                        <p className="text-[11px] font-mono text-[var(--term-soft)]">
                          No coins at risk. Demo pays XP only — no rank RP and no pot.
                        </p>
                      )}
                    </div>

                    {/* STAKE: the default Live entry, or a bigger challenge on
                        the chip ladder — past the entry the button turns into a post */}
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
                            onClick={() => { sound.playClick(); const cur = Number.isFinite(ticketStake) ? ticketStake : ticketFee; setStakeInput(String(cur <= minChallengeStake ? ticketFee : clampStake(prevStakeChip(cur)))); }}
                            className="w-10 shrink-0 rounded bg-[var(--term-raised)] border border-[var(--term-border)] text-[var(--term-strong)] text-lg font-bold hover:bg-[var(--term-raised-hi)] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                            aria-label="One chip lower"
                          >
                            −
                          </button>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={stakeInput}
                            disabled={myChallenge !== null}
                            onChange={(e) => setStakeInput(e.target.value.replace(/[^0-9]/g, ''))}
                            onBlur={() => { const raw = Number(stakeInput); setStakeInput(String(raw > ticketFee ? clampStake(raw) : Math.min(Math.max(raw || ticketFee, ticketFee), maxChipForBalance))); }}
                            className="flex-1 h-9 min-w-0 bg-[var(--term-bg)] border border-[var(--term-border)] focus:border-[var(--term-primary)] rounded px-3 text-center text-base font-mono font-bold text-[var(--term-strong)] focus:outline-none disabled:opacity-60"
                          />
                          <button
                            type="button"
                            disabled={myChallenge !== null}
                            onClick={() => { sound.playClick(); const cur = Number.isFinite(ticketStake) ? ticketStake : ticketFee; setStakeInput(String(cur < minChallengeStake ? minChallengeStake : clampStake(nextStakeChip(cur)))); }}
                            className="w-10 shrink-0 rounded bg-[var(--term-raised)] border border-[var(--term-border)] text-[var(--term-strong)] text-lg font-bold hover:bg-[var(--term-raised-hi)] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                            aria-label="One chip higher"
                          >
                            +
                          </button>
                        </div>
                        <p className="text-[10px] font-mono text-[var(--term-soft)]">
                          Default is {ticketFee.toLocaleString()} coins. Bets come in chips — 100, 200, then jumps of 500.
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

                  {/* Actions half — a plain divider and the one blue button.
                      No perforation, no artwork: the Find Match button owns
                      this half on its own. */}
                  <div className="md:col-span-4 p-4 bg-[var(--term-panel-deep)] md:border-l md:border-[var(--term-border)] flex flex-col justify-center relative">

                    <div className="relative z-10 space-y-3">
                      {/* Primary action — one flat blue button, the way Quotex
                          wears its trade controls: no halo, no spin, no gradient. */}
                      <div>
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
                          className="w-full h-12 rounded-lg bg-[var(--term-accent)] hover:bg-[var(--term-accent-hi)] text-sm font-bold text-[var(--term-canvas)] flex items-center justify-center gap-2 transition-colors active:brightness-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                        >
                          {myChallenge || queueing ? (
                            <div className="flex flex-col items-center gap-0.5">
                              <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full animate-ping shrink-0 bg-[var(--term-buy)]" />
                                <span className="tracking-wide font-bold">Matching…</span>
                              </div>
                              {/* Only the wait, never the stake or the cancel hint:
                                  cancelling lives on the row below the button. */}
                              <span className="text-[10px] font-mono tracking-widest text-[var(--term-canvas)]/70">
                                {formatWait(myChallenge ? challengeTimer : queueTimer)}
                              </span>
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
                      </div>
                    </div>

                  </div>

                </div>
              </div>
            )}

            {/* Private table — the code door, under the ticket. The left half
                knocks on a table code and waits there; the right half mints a
                code and waits for a rival. Neither side opens the arena until
                both tabs are on the channel, and the seat is charged only when
                the rival actually sits down. */}
            {centerTab === 'ticket' && !matchFoundData && (
              <div className="bg-[var(--term-panel)] border border-[var(--term-border)] rounded-lg overflow-hidden animate-in fade-in duration-200">
                <div className="flex items-center justify-between border-b border-[var(--term-border)] px-4 py-2.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--term-strong)] font-mono">
                    Private table
                  </span>
                  <span className="text-[10px] font-mono text-[var(--term-soft)]">
                    Code · coins ride the link
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2">
                  {/* Join half */}
                  <div className="space-y-2 p-4">
                    <label
                      htmlFor="match-code-input"
                      className="block text-[10px] font-mono uppercase tracking-wider text-[var(--term-label)]"
                    >
                      Join with code
                    </label>
                    {tableJoinCode ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 rounded border border-[var(--term-buy)]/40 bg-[var(--term-buy)]/10 px-3 py-2.5">
                          <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-[var(--term-buy)]" />
                          <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-[var(--term-buy)]">
                            Waiting for the host · {tableJoinCode}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={handleCloseTable}
                          className="h-9 w-full rounded border border-[var(--term-border)] bg-[var(--term-raised)] text-[11px] font-semibold text-[var(--term-text)] transition-colors hover:text-[var(--term-strong)] cursor-pointer"
                        >
                          Cancel
                        </button>
                        <p className="text-[10px] font-mono text-[var(--term-soft)]">
                          The host seats you and the match opens — the entry is charged only then.
                        </p>
                      </div>
                    ) : (
                      <>
                        <form onSubmit={handleJoinWithCode} className="flex items-stretch gap-2">
                          <input
                            id="match-code-input"
                            type="text"
                            value={roomCodeInput}
                            onChange={(e) => setRoomCodeInput(formatRoomCodeInput(e.target.value))}
                            placeholder="XXXXX-XXXXX"
                            maxLength={11}
                            autoComplete="off"
                            spellCheck={false}
                            className="flex-1 min-w-0 h-10 bg-[var(--term-bg)] border border-[var(--term-border)] focus:border-[var(--term-primary)] rounded px-3 text-center text-sm font-mono font-bold uppercase tracking-[0.35em] text-[var(--term-strong)] placeholder:text-[var(--term-muted)] focus:outline-none transition-colors"
                          />
                          <button
                            type="submit"
                            disabled={!roomCodeIsComplete(roomCodeInput)}
                            className="h-10 px-5 shrink-0 rounded border border-[var(--term-primary)]/55 bg-[var(--term-primary)]/10 text-[var(--term-strong)] font-bold text-xs uppercase tracking-wider transition-colors hover:bg-[var(--term-primary)]/18 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            Join
                          </button>
                        </form>
                        <p className="text-[10px] font-mono text-[var(--term-soft)]">
                          {activeLinkTable
                            ? activeLinkTable.stake > 0
                              ? `Invite · ${activeLinkTable.stake.toLocaleString()} coins · ${activeLinkTable.duration} — charged when the host seats you.`
                              : `Invite · free · ${activeLinkTable.duration}.`
                            : 'Paste the whole table code — the dash is optional. A five-character code still opens a free room.'}
                        </p>
                      </>
                    )}
                  </div>

                  {/* Create half */}
                  <div className="space-y-2 p-4 border-t border-[var(--term-border)] md:border-t-0 md:border-l">
                    {table ? (
                      <>
                        <div className="flex items-center justify-between">
                          <span className="block text-[10px] font-mono uppercase tracking-wider text-[var(--term-label)]">
                            Table code
                          </span>
                          <button
                            type="button"
                            onClick={handleCloseTable}
                            className="text-[10px] font-mono text-[var(--term-muted)] hover:text-[var(--term-strong)] cursor-pointer"
                          >
                            Close table
                          </button>
                        </div>
                        <div className="flex items-stretch gap-2">
                          <div className="flex h-10 flex-1 min-w-0 items-center justify-center rounded border border-[var(--term-primary)]/40 bg-[var(--term-bg)] font-mono text-sm font-bold tracking-[0.35em] text-[var(--term-strong)]">
                            {table.code}
                          </div>
                          <button
                            type="button"
                            onClick={() => copyTableValue('code')}
                            className="h-10 px-3 shrink-0 bg-[var(--term-raised)] hover:bg-[var(--term-raised-hi)] border border-[var(--term-border)] text-[var(--term-text)] hover:text-[var(--term-strong)] text-xs font-semibold rounded cursor-pointer transition-colors"
                          >
                            {tableCopied === 'code' ? 'Copied' : 'Copy'}
                          </button>
                        </div>
                        <div className="flex items-stretch gap-2">
                          <button
                            type="button"
                            onClick={() => copyTableValue('link')}
                            className="h-10 flex-1 min-w-0 bg-[var(--term-raised)] hover:bg-[var(--term-raised-hi)] border border-[var(--term-border)] text-[var(--term-text)] hover:text-[var(--term-strong)] text-xs font-semibold rounded cursor-pointer transition-colors"
                          >
                            {tableCopied === 'link'
                              ? 'Link copied'
                              : `Copy ${table.stake.toLocaleString()}-coin link`}
                          </button>
                        </div>
                        {/* The host stays here, on the code, until a rival
                            knocks — the arena only opens once both tabs are in */}
                        <div className="flex items-center gap-2 rounded border border-[var(--term-buy)]/40 bg-[var(--term-buy)]/10 px-3 py-2.5">
                          <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-[var(--term-buy)]" />
                          <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-[var(--term-buy)]">
                            Waiting for a rival to join…
                          </span>
                        </div>
                        <p className="text-[10px] font-mono text-[var(--term-soft)]">
                          {table.duration} · {table.stake.toLocaleString()} coins a seat · charged only when someone joins.
                        </p>
                      </>
                    ) : (
                      <>
                        <label
                          htmlFor="table-coins-input"
                          className="block text-[10px] font-mono uppercase tracking-wider text-[var(--term-label)]"
                        >
                          Coins to play for
                        </label>
                        <form onSubmit={handleGenerateTableCode} className="flex items-stretch gap-2">
                          <div className="relative flex-1 min-w-0">
                            <Coins size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--term-muted)]" />
                            <input
                              id="table-coins-input"
                              type="text"
                              inputMode="numeric"
                              value={tableCoinsInput}
                              onChange={(e) => setTableCoinsInput(e.target.value.replace(/[^0-9]/g, ''))}
                              placeholder={String(ticketFee)}
                              className="w-full h-10 bg-[var(--term-bg)] border border-[var(--term-border)] focus:border-[var(--term-primary)] rounded pl-8 pr-3 text-sm font-mono font-bold text-[var(--term-strong)] placeholder:text-[var(--term-muted)] focus:outline-none transition-colors"
                            />
                          </div>
                          <button
                            type="submit"
                            className="h-10 px-4 shrink-0 rounded border border-[var(--term-primary)]/55 bg-[var(--term-primary)]/10 text-[var(--term-strong)] font-bold text-xs uppercase tracking-wider transition-colors hover:bg-[var(--term-primary)]/18 cursor-pointer"
                          >
                            Generate code
                          </button>
                        </form>
                        <p className="text-[10px] font-mono text-[var(--term-soft)]">
                          Chips: 100, 200, then 500s. Same chart and length for both seats.
                        </p>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Partner banner — sits directly under the join card, on that tab only. */}
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

            {/* Recent duels — the same record the archive page reads, newest
                first, expanding downward inside the lobby. */}
            {centerTab === 'ticket' && (
              <div className="bg-[var(--term-surface)]/70 backdrop-blur-md border border-[var(--term-border)] overflow-hidden">
                <div className="flex items-center justify-between border-b border-[var(--term-border)] px-4 py-2.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--term-strong)] font-mono">
                    Match History
                  </span>
                  {history.length > 0 && (
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--term-accent)] font-mono">
                      {history.length} duels
                    </span>
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
                        {historySlice.map((item) => (
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

                {/* Pager — stays inside the card, so reading the archive never
                    means leaving the lobby. */}
                {history.length > HISTORY_PAGE_SIZE && (
                  <div className="flex items-center justify-between gap-2 border-t border-[var(--term-border)] px-4 py-2 text-[10px] font-mono uppercase tracking-wide text-[var(--term-muted)]">
                    <button
                      type="button"
                      onClick={() => {
                        sound.playClick();
                        setHistoryPage((page) => Math.max(0, page - 1));
                      }}
                      disabled={historyWindowStart === 0}
                      className="px-2 py-0.5 rounded border border-[var(--term-border-hi)] text-[var(--term-soft)] hover:text-[var(--term-strong)] hover:border-[var(--term-primary)]/50 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      ‹ Prev
                    </button>
                    <span className="tabular-nums">
                      {historyWindowStart + 1}–{historyWindowStart + historySlice.length} of {history.length}
                      <span className="ml-1.5 text-[var(--term-dim)]">· p {Math.min(historyPage, historyPages - 1) + 1}/{historyPages}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        sound.playClick();
                        setHistoryPage((page) => Math.min(historyPages - 1, page + 1));
                      }}
                      disabled={historyWindowStart + historySlice.length >= history.length}
                      className="px-2 py-0.5 rounded border border-[var(--term-border-hi)] text-[var(--term-soft)] hover:text-[var(--term-strong)] hover:border-[var(--term-primary)]/50 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Next ›
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ── TAB CONTENT: STATS ── */}
            {centerTab === 'stats' && <StatsPanel />}

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
                        soundEnabled ? 'bg-[var(--term-buy)] text-[var(--term-canvas)]' : 'bg-[var(--term-raised)] text-[var(--term-muted)] border border-[var(--term-border)]'
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

                {/* Compact strip: mailbox counters + one-click cleanup */}
                <div className="flex items-center justify-between gap-2 px-4 py-1.5 border-y border-[var(--term-border)] bg-[var(--term-panel-deep)]/70 text-[10px] font-mono uppercase tracking-wide text-[var(--term-muted)]">
                  <span className="truncate">
                    Inbox ·{' '}
                    <span className={unreadMailCount > 0 ? 'text-[var(--term-accent)] font-bold' : ''}>
                      {unreadMailCount} unread
                    </span>{' '}
                    / {mailItems.length}
                  </span>
                  {staleMailIds.length > 0 && (
                    <button
                      type="button"
                      onClick={clearStaleMails}
                      disabled={mailClearing}
                      className="shrink-0 px-2 py-0.5 rounded border border-[var(--term-border-hi)] text-[var(--term-soft)] hover:text-[var(--term-strong)] hover:border-[var(--term-sell)]/50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {mailClearing
                        ? 'Clearing…'
                        : `Delete ${staleMailIds.length} older than ${MAIL_STALE_DAYS} days`}
                    </button>
                  )}
                </div>

                {/* Gmail-style compact rows: click a row to collapse it open.
                    The list stretches to the bottom of the screen, so a row is
                    never cut in half — the cap is measured, not hard coded. */}
                <div
                  ref={mailListRef}
                  style={mailListMaxH ? { maxHeight: `${mailListMaxH}px` } : undefined}
                  className="overflow-y-auto divide-y divide-[var(--term-border)]/60"
                >
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
                              background: item.read ? 'var(--term-bg)' : 'rgba(240,165,58,0.16)',
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

            {/* ── TAB CONTENT: AFFILIATE ── */}
            {centerTab === 'affiliate' && (() => {
              // The code is the callsign the database holds, not the one typed
              // at signup — a clashing name got a suffix, and only the stored
              // spelling resolves an invite link.
              const code = affiliateCode
                || (currentUser && !currentUser.isGuest ? currentUser.username : '');
              const link = buildInviteLink(code);
              const desk = affiliateDesk;
              const tier = desk?.tier ?? null;
              const cfg = desk?.config;
              const nextTier = tier
                ? desk?.tiers.find((t) => t.active && t.level === tier.nextLevel) ?? null
                : null;

              return (
              <div className="bg-[var(--term-panel)]/90 backdrop-blur-md border border-[var(--term-border)] rounded-lg p-4 space-y-4 animate-in fade-in duration-200">
                {/* Header */}
                <div className="flex items-center justify-between gap-3 pb-2.5 border-b border-[var(--term-border)]">
                  <div className="flex items-center gap-2 min-w-0">
                    <Share2 size={16} className="text-[var(--term-primary)] shrink-0" />
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--term-strong)] font-mono">Affiliate desk</h3>
                      {/* What the desk pays and on what: volume, not sign-ups */}
                      <p className="text-[10px] font-mono leading-snug text-[var(--term-muted)]">
                        Rebate on the house fee — your rate follows the volume your invited traders
                        stake, not how many sign up.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setCenterTab('ticket')}
                    className="text-xs font-mono text-[var(--term-muted)] hover:text-[var(--term-strong)] flex items-center gap-1 cursor-pointer shrink-0"
                  >
                    ✕ Close
                  </button>
                </div>

                {!mounted ? null : !currentUser || currentUser.isGuest ? (
                  <div className="space-y-2 rounded-md bg-[var(--term-bg)] border border-[var(--term-border)] px-3 py-3">
                    <p className="text-[11px] font-mono leading-relaxed text-[var(--term-label)]">
                      An invite link is tied to a callsign, and a guest session has no database row
                      to pay. Register and the code becomes your username.
                    </p>
                    <Link
                      href="/register"
                      className="inline-flex items-center gap-1.5 text-[11px] font-mono font-bold text-[var(--term-primary)] hover:text-[var(--term-strong)] cursor-pointer"
                    >
                      Create an account <ArrowLeft size={12} className="rotate-180" />
                    </Link>
                  </div>
                ) : affiliateLoading && !desk ? (
                  <p className="rounded-md bg-[var(--term-bg)] border border-[var(--term-border)] px-3 py-6 text-center text-[11px] font-mono text-[var(--term-muted)]">
                    Opening your desk…
                  </p>
                ) : affiliateUnavailable && !desk ? (
                  <div className="rounded-md bg-[var(--term-bg)] border border-[var(--term-border)] px-3 py-6 text-center text-[11px] font-mono leading-relaxed text-[var(--term-muted)]">
                    The affiliate desk is unreadable right now — run supabase/setup.sql so the
                    affiliate tables exist, then reopen this tab.
                  </div>
                ) : (
                  <>
                    {/* Desk counters */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {[
                        { label: 'Desk balance', value: desk ? desk.balance.toLocaleString() : '—', color: 'text-[var(--term-amber)]' },
                        { label: 'Lifetime earned', value: desk ? desk.lifetime.toLocaleString() : '—', color: 'text-[var(--term-buy)]' },
                        { label: 'Team volume', value: tier ? tier.lifetimeVolume.toLocaleString() : '—', color: 'text-[var(--term-accent-text)]' },
                        { label: 'Your rate', value: tier ? `${tier.ratePer100} / 100` : '—', color: 'text-[var(--term-strong)]' },
                      ].map((s) => (
                        <div key={s.label} className="rounded-md bg-[var(--term-bg)] border border-[var(--term-border)] px-3 py-2">
                          <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--term-muted)]">{s.label}</p>
                          <p className={`text-base font-mono font-bold leading-6 ${s.color}`}>{s.value}</p>
                        </div>
                      ))}
                    </div>

                    {/* Current rung and the climb to the next one */}
                    {tier && (
                      <div className="rounded-md bg-[var(--term-bg)] border border-[var(--term-border)] px-3 py-2.5 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-mono font-bold text-[var(--term-strong)]">
                            {tier.name}
                            <span className="text-[var(--term-muted)] font-normal"> · Level {tier.level}</span>
                          </p>
                          <span className="text-[10px] font-mono text-[var(--term-amber)] shrink-0">
                            {tier.ratePer100} coins per 100 staked{cfg ? ` · fee ${cfg.houseFeePct}%` : ''}
                          </span>
                        </div>
                        {nextTier && tier.nextMinVolume !== null ? (
                          <>
                            <div className="h-1.5 rounded bg-[var(--term-surface)] overflow-hidden">
                              <div
                                className="h-full bg-[var(--term-primary)]"
                                style={{ width: `${Math.min(100, Math.round((tier.lifetimeVolume / Math.max(1, tier.nextMinVolume)) * 100))}%` }}
                              />
                            </div>
                            <p className="text-[10px] font-mono text-[var(--term-muted)]">
                              {tier.needForNext.toLocaleString()} more volume → Level {nextTier.level} ({nextTier.ratePer100} per 100)
                            </p>
                          </>
                        ) : (
                          <p className="text-[10px] font-mono text-[var(--term-muted)]">
                            Top rung of the ladder — this desk already pays the best rate the arena ships.
                          </p>
                        )}
                      </div>
                    )}

                    {/* The one door out of the desk */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void transferDeskToWallet()}
                          disabled={!desk || desk.balance <= 0 || affiliateTransferring}
                          className="flex-1 md:flex-none px-4 h-10 rounded-lg text-xs font-bold cursor-pointer transition-all border border-[var(--term-primary)]/50 bg-[linear-gradient(135deg,var(--term-primary)_0%,var(--term-primary-deep)_100%)] text-[var(--term-canvas)] hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {affiliateTransferring
                            ? 'Moving…'
                            : desk && desk.balance > 0
                              ? `Transfer ${desk.balance.toLocaleString()} to wallet`
                              : 'Desk is empty'}
                        </button>
                        <span className="text-[10px] font-mono text-[var(--term-dim)]">
                          Desk coins sit apart until you move them — then they withdraw like any balance.
                        </span>
                      </div>
                      {cfg && !cfg.enabled && (
                        <p className="rounded-md bg-[var(--term-bg)] border border-[var(--term-amber)]/40 px-3 py-2 text-[10px] font-mono leading-relaxed text-[var(--term-amber)]">
                          The arena has paused new rebate credits. Commissions already on your desk stay
                          yours and still transfer.
                        </p>
                      )}
                      {affiliateNotice && (
                        <p className="rounded-md bg-[var(--term-bg)] border border-[var(--term-border)] px-3 py-2 text-[10px] font-mono leading-relaxed text-[var(--term-soft)]">
                          {affiliateNotice}
                        </p>
                      )}
                    </div>

                    {/* Your link */}
                    <div className="space-y-2">
                      <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--term-label)]">Your invite link</p>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          readOnly
                          value={link}
                          onFocus={(e) => e.currentTarget.select()}
                          className="flex-1 h-10 px-3 bg-[var(--term-bg)] border border-[var(--term-border)] focus:border-[var(--term-primary)] rounded-lg font-mono text-xs text-[var(--term-strong)] focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => void copyInviteLink()}
                          className={`px-4 h-10 rounded-lg text-xs font-bold cursor-pointer transition-all border ${
                            affiliateCopied
                              ? 'border-[var(--term-buy)]/50 bg-[var(--term-buy)]/15 text-[var(--term-buy)]'
                              : 'border-[var(--term-border-hi)] bg-[var(--term-raised)] text-[var(--term-strong)] hover:bg-[var(--term-surface)]'
                          }`}
                        >
                          {affiliateCopied ? 'Copied' : 'Copy'}
                        </button>
                      </div>
                      <p className="text-[10px] font-mono text-[var(--term-dim)]">
                        Code <span className="font-bold text-[var(--term-primary)]">@{code}</span> — every trader who signs up through this link pays you a rebate while they play.
                      </p>
                    </div>

                    {/* How it pays */}
                    <div className="space-y-2">
                      <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--term-label)]">How the rebate pays</p>
                      <ul className="space-y-1.5 rounded-md bg-[var(--term-bg)] border border-[var(--term-border)] px-3 py-2.5 text-[11px] font-mono text-[var(--term-soft)]">
                        <li className="flex gap-1.5">
                          <span className="text-[var(--term-buy)] shrink-0">▸</span>
                          {cfg
                            ? `Every Live duel burns ${cfg.houseFeePct}% of the pooled pot as the platform fee — a 100-coin entry pays a 30-coin fee.`
                            : 'The platform fee per duel loads with the desk.'}
                        </li>
                        <li className="flex gap-1.5">
                          <span className="text-[var(--term-amber)] shrink-0">▸</span>
                          {tier
                            ? `Your slice: ${tier.ratePer100} coins per 100 your trader stakes — every duel they play, not a one-off bonus.`
                            : 'Your tier rate loads with the desk.'}
                        </li>
                        {cfg && (
                          <li className="flex gap-1.5">
                            <span className="text-[var(--term-muted)] shrink-0">▸</span>
                            The house floor keeps its share: at least {cfg.minHousePctOfFee}% of every fee stays with the arena, so a rebate never eats the pot maths.
                          </li>
                        )}
                        <li className="flex gap-1.5">
                          <span className="text-[var(--term-accent-text)] shrink-0">▸</span>
                          Level up on funded downline — invites whose deposit got approved. The ladder below is what the arena ships today.
                        </li>
                        <li className="flex gap-1.5">
                          <span className="text-[var(--term-primary)] shrink-0">▸</span>
                          Commissions land on the desk, not the wallet. Transfer them when you like; from the wallet they withdraw as USDT after review.
                        </li>
                      </ul>
                    </div>

                    {/* The ladder itself */}
                    {desk && desk.tiers.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--term-label)]">Rebate ladder</p>
                        <div className="rounded-md border border-[var(--term-border)] divide-y divide-[var(--term-border)] overflow-hidden">
                          {desk.tiers.map((t) => (
                            <div key={t.level} className={`flex items-center gap-2.5 px-3 py-1.5 bg-[var(--term-bg)] text-xs font-mono ${t.active ? '' : 'opacity-45'}`}>
                              <span className="w-4 shrink-0 text-right text-[var(--term-muted)]">L{t.level}</span>
                              <span className={`min-w-0 flex-1 truncate ${tier && t.level === tier.level ? 'text-[var(--term-primary)] font-bold' : 'text-[var(--term-text)]'}`}>{t.name}</span>
                              <span className="shrink-0 text-[var(--term-amber)]">{t.ratePer100} / 100</span>
                              <span className="shrink-0 text-[var(--term-soft)]">{t.minVolume > 0 ? `${t.minVolume.toLocaleString()} volume` : 'start'}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Recent commissions */}
                    {desk && desk.earnings.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--term-label)]">Recent commissions</p>
                        <div className="rounded-md border border-[var(--term-border)] divide-y divide-[var(--term-border)] overflow-hidden">
                          {desk.earnings.slice(0, 8).map((row) => (
                            <div key={row.id} className="flex items-center gap-2 px-3 py-2 bg-[var(--term-bg)]">
                              <span className="min-w-0 flex-1 truncate text-xs font-mono text-[var(--term-strong)]">@{row.traderName}</span>
                              <span className="text-[10px] font-mono text-[var(--term-muted)] shrink-0">{row.stake.toLocaleString()} in · L{row.tierLevel}</span>
                              <span className="text-[10px] font-mono text-[var(--term-muted)] shrink-0">{formatMailStamp(row.createdAt)}</span>
                              <span className="text-[10px] font-mono font-bold text-[var(--term-buy)] shrink-0">+{row.commission.toLocaleString()}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Who you brought in */}
                    {desk && desk.invites.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--term-label)]">Your downline</p>
                        <div className="rounded-md border border-[var(--term-border)] divide-y divide-[var(--term-border)] overflow-hidden">
                          {desk.invites.slice(0, 8).map((row) => (
                            <div key={row.id} className="flex items-center gap-2 px-3 py-2 bg-[var(--term-bg)]">
                              <span className="min-w-0 flex-1 truncate text-xs font-mono text-[var(--term-strong)]">@{row.username}</span>
                              <span className="text-[10px] font-mono text-[var(--term-muted)] shrink-0">{formatMailStamp(row.createdAt)}</span>
                              <span
                                className={`text-[10px] font-mono font-bold shrink-0 ${row.funded ? 'text-[var(--term-buy)]' : 'text-[var(--term-muted)]'}`}
                                title={row.funded ? 'Deposit approved — counts toward your level' : 'Signed up, no approved deposit yet'}
                              >
                                {row.funded ? 'Funded' : 'New'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* The ladder race */}
                    {affiliateBoard.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--term-label)]">Affiliate ladder</p>
                        <div className="rounded-md border border-[var(--term-border)] divide-y divide-[var(--term-border)] overflow-hidden">
                          {affiliateBoard.map((row, i) => (
                            <div key={row.callsign} className="flex items-center gap-2.5 px-3 py-1.5 bg-[var(--term-bg)] text-xs font-mono">
                              <span className="w-4 shrink-0 text-right text-[var(--term-muted)]">{i + 1}</span>
                              <span className={`min-w-0 flex-1 truncate ${row.callsign === code ? 'text-[var(--term-primary)] font-bold' : 'text-[var(--term-text)]'}`}>@{row.callsign}</span>
                              <span className="shrink-0 text-[var(--term-soft)]">{row.volume.toLocaleString()} vol</span>
                              <span className="shrink-0 text-[var(--term-buy)]">{row.coins.toLocaleString()}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {affiliateLoading && (
                      <p className="text-[10px] font-mono text-[var(--term-dim)]">Refreshing the desk…</p>
                    )}
                  </>
                )}
              </div>
              );
            })()}

            {/* ── TAB CONTENT: SUPPORT / HOW TO PLAY ── */}
            {centerTab === 'support' && (
              <div className="bg-[var(--term-panel)]/90 backdrop-blur-md border border-[var(--term-border)] rounded-lg p-4 space-y-4 animate-in fade-in duration-200">
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
                    { n: '02', title: 'Enter the Queue', desc: 'Hit Find Match. The engine pairs you with a rival of similar ELO rating within seconds. Both traders see an identical price feed — one global market series, and the duel trades the window that opens on the minute it fires, live on the clock.' },
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
                        Winner collects {ticketPot.toLocaleString()} coins · {Math.round(HOUSE_CUT * 100)}% of the pool burns.
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
              RIGHT DOCK: open challenges first, then the wallet, then the
              friends panel — a game-style rail that stays at the edge
          ══════════════════════════════════════════════════════════ */}
          {/* A dock, not a column: on wide screens the rail sticks under the
              top bar and scrolls on its own, the way a game keeps its friends
              and open duels at the right edge while the center scrolls. The
              challenge board itself graduates to a fixed right-edge panel at
              1480px, where the layout leaves a free gutter for it. */}
          <aside className="order-3 w-full shrink-0 space-y-3 md:grid md:grid-cols-2 md:gap-3 md:space-y-0 lg:block lg:w-[300px] lg:space-y-3 xl:sticky xl:top-[72px] xl:max-h-[calc(100vh-88px)] xl:overflow-y-auto xl:pr-1">

            {/* Challenges — first in the dock: a stake above the fixed Live
                entry, published to every online trader; accept one to duel at
                that stake at once. Warm colour carries the size of the ask:
                amber at the entry, orange from 2×, ember red from 5×, deep red
                from the 10k table — and the meter under each stake shows how
                far it sits up the ladder. */}
            {/* On a wide monitor the board tears out of the rail and pins to
                the window's right edge, in the empty gutter beside the 1180px
                column — the way a game parks its friend list. 256px is the
                widest it can be and still clear a centred column, so the
                panel only detaches once the window reaches 1670px; below that
                it stays the rail's first card and nothing is covered. */}
            <div data-challenge-dock className="min-[1670px]:fixed min-[1670px]:right-0 min-[1670px]:top-14 min-[1670px]:bottom-0 min-[1670px]:z-20 min-[1670px]:w-[256px] min-[1670px]:overflow-y-auto min-[1670px]:border-l min-[1670px]:border-[var(--term-border-hi)] min-[1670px]:bg-[var(--term-panel)]/95 min-[1670px]:p-2.5 min-[1670px]:shadow-[-16px_0_32px_-16px_rgba(0,0,0,0.9)] min-[1670px]:backdrop-blur-xl">
              <div className="rounded-lg border border-[var(--term-border)] bg-[var(--term-panel)]/90 backdrop-blur-md overflow-hidden min-[1670px]:rounded-none min-[1670px]:border-0 min-[1670px]:bg-transparent">
              {/* Header — the rail colours speak for the tiers; hover a ticket
                  for the full pot maths */}
              <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-[var(--term-border)] min-[1670px]:sticky min-[1670px]:top-0 min-[1670px]:z-10 min-[1670px]:bg-[var(--term-panel)]/95 min-[1670px]:backdrop-blur-md">
                <div className="flex items-center gap-2 min-w-0">
                  <Swords size={15} className="text-[var(--term-accent)] shrink-0" />
                  <h3 className="text-[13px] font-bold uppercase tracking-wider text-[var(--term-strong)] font-mono truncate">Challenges</h3>
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--term-buy)] shrink-0" aria-hidden="true" />
                </div>
                <span className="text-[10px] font-mono text-[var(--term-dim)] shrink-0">
                  {challenges.length} open
                </span>
              </div>

              {/* Board — the latest 8 challenges as compact duel tickets,
                  newest on top; the dock itself scrolls, so the board is not
                  given a scrollbar of its own */}
              <div className="space-y-1.5 px-2 pt-2 pb-2 border-t border-[var(--term-border)]">
                {challenges.length === 0 ? (
                  <p className="px-3 py-6 text-center text-[11px] font-mono text-[var(--term-muted)]">
                    No open challenges. Post one to invite a bigger duel.
                  </p>
                ) : (
                  challenges.slice(0, 8).map((c) => {
                    const mine = c.posterId === sessionId;
                    const waiting = acceptingId === c.id;
                    const short = !mine && c.stake > userCoins;
                    const tier = stakeTierFor(c.stake, ticketFee);
                    const demo = isDemoChallenge(c.id);
                    return (
                      <div
                        key={c.id}
                        title={`pot ${potFor(c.stake).toLocaleString()} · −${houseBurnFor(c.stake).toLocaleString()} burn${c.duration ? ` · ${c.duration}` : ''}`}
                        className={`group relative overflow-hidden rounded-md border pl-3 pr-1.5 py-1.5 flex items-center gap-2 animate-in slide-in-from-bottom-2 duration-300 transition-all cursor-default ${mine ? '' : tier.glow} ${
                          mine
                            ? 'border-[var(--term-accent)]/45 bg-[var(--term-accent)]/10 hover:bg-[var(--term-accent)]/15 hover:border-[var(--term-accent)]/60'
                            : 'border-[var(--term-border)] bg-[var(--term-raised)]/40 hover:bg-[var(--term-raised)]/70 hover:border-[var(--term-border-hi)]'
                        } ${demo ? 'opacity-80' : ''}`}
                      >
                        {/* Full-height rail — blue on your own card, tier
                            gradient on everyone else's */}
                        <span
                          aria-hidden
                          className={`absolute left-0 top-0 bottom-0 w-1 ${
                            mine ? 'bg-[var(--term-accent)]' : tier.rail
                          }`}
                        />

                        <span className={`grid place-items-center w-6 h-6 min-[1670px]:w-5 min-[1670px]:h-5 shrink-0 rounded font-mono text-[10px] font-bold bg-[var(--term-raised)] ring-1 ${
                          mine ? 'text-[var(--term-accent-text)] ring-[var(--term-accent)]/40' : tier.chip
                        }`}>
                          {(c.username.charAt(0) || '?').toUpperCase()}
                        </span>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <p className="text-[11px] font-bold text-[var(--term-strong)] truncate">{c.username}</p>
                            {!mine && tier.key !== 'standard' && (
                              tier.key === 'whale'
                                ? <Flame size={10} className={`${tier.text} shrink-0 animate-pulse`} />
                                : <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${tier.rail}`} />
                            )}
                          </div>
                          {/* Under the name: just the wait, no meter */}
                          <p className="text-[9px] font-mono text-[var(--term-dim)] leading-[14px] truncate">
                            {elapsedStamp(c.createdAt, boardNow)}
                            {c.duration ? ` · ${c.duration}` : ''}
                            {demo ? ' · demo' : ''}
                          </p>
                        </div>

                        <span className="shrink-0 w-[88px] min-[1670px]:w-[72px] text-right">
                          {mine ? (
                            <>
                              {/* Resting state: an accent status chip. Hover turns
                                  the same slot into the retract action. */}
                              <span className="group-hover:hidden inline-flex items-center gap-1 text-[10px] font-mono font-bold text-[var(--term-accent-text)]">
                                <span className="w-1.5 h-1.5 rounded-full bg-[var(--term-accent)] animate-pulse" />
                                Awaiting
                              </span>
                              <button
                                onClick={handleCancelChallenge}
                                className="hidden group-hover:inline-flex items-center gap-1 h-6 w-full rounded border border-[var(--term-sell)]/40 bg-[var(--term-sell)]/10 text-[10px] font-mono font-bold text-[var(--term-sell)] cursor-pointer hover:bg-[var(--term-sell)]/20 transition-colors justify-center"
                                title="Pull your challenge off the board"
                              >
                                Retract
                              </button>
                            </>
                          ) : waiting ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-mono text-[var(--term-accent-text)]">
                              <span className="w-1.5 h-1.5 rounded-full bg-[var(--term-accent)] animate-ping" />
                              Waiting
                            </span>
                          ) : (
                            <button
                              onClick={() => handleAcceptChallenge(c)}
                              disabled={short}
                              className={`flex items-center justify-center gap-1 h-6 w-full rounded text-[10px] font-mono font-bold cursor-pointer transition-all ${
                                short
                                  ? 'bg-[var(--term-bg)] text-[var(--term-muted)] border border-[var(--term-border)] cursor-not-allowed'
                                  : `border ${tier.action}`
                              }`}
                              title={`Accept the ${c.stake.toLocaleString()}-coin duel`}
                            >
                              {short ? (
                                `Short ${(c.stake - userCoins).toLocaleString()}`
                              ) : (
                                <>
                                  <Swords size={12} />
                                  <span className="tabular-nums">{c.stake.toLocaleString()}</span>
                                </>
                              )}
                            </button>
                          )}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
            </div>

            {/* Wallet — under the board now: the balance and its two buttons;
                the flow itself opens in the center column, the same place the
                Match Ticket renders */}
            <WalletCard
              coins={balanceSyncing && mounted ? 0 : userCoins}
              onOpen={openWallet}
            />

            {/* Friends — the messaging panel closes the rail: masthead, search,
                the All/Online strip, then the conversation list */}
            <div className="md:col-span-2 lg:col-span-1">
              <FriendsPanel user={currentUser} inviteCode={friendsInviteCode} />
            </div>

          </aside>

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

'use client';

import { useEffect, useState, useRef, useCallback, Suspense } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { START_BALANCE, NOTIONAL_PER_SIZE, MAX_ORDERS_PER_MATCH, battleSecondsFor, LOBBY_PREP_SECONDS, DEFAULT_MATCH_DURATION } from '@/lib/engine/constants';
import type { AllowedSize } from '@/lib/engine/constants';
import { simulate, score, determineWinner } from '@/lib/engine/simulate';
import { botActions } from '@/lib/engine/bot';
import {
  generateBattleMarket,
  getCandlesForTimeframe,
  TOTAL_BATTLE_TICKS,
  type Timeframe,
  type MarketDataset,
} from '@/lib/engine/market-feed';
import type { Action, GameMode, SimulationResult } from '@/lib/engine/types';
import { resolveRoomSession, type RoomSession } from '@/lib/rooms/session';
import { payoutFor, type DuelOutcome } from '@/lib/economy';
import { useAuthStore } from '@/lib/auth/store';
import { useProgressStore } from '@/lib/progress/store';
import { XAU_PIP_SIZE } from '@/lib/progress/config';
import type { MatchOutcome, RewardPacket } from '@/lib/progress/types';
import { getSupabase } from '@/lib/supabase/client';
import { sound } from '@/components/terminal/sound';

import { TradingChart } from '@/components/terminal/trading-chart';
import { OrderPanel } from '@/components/terminal/order-panel';
import { RivalPanel } from '@/components/terminal/rival-panel';
import { ResultModal } from '@/components/terminal/result-modal';

import {
  Volume2, VolumeX, Swords, Shield, Clock, ArrowLeft,
  Eye, User, AlertTriangle, X
} from 'lucide-react';

function PlayRoomContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const room = (params.room as string) || 'DUEL1';

  // Session details come from URL params when present (old links, replays) and from
  // sessionStorage otherwise — the URL itself is kept to just the room code.
  const [stashedSession] = useState<RoomSession | null>(() => resolveRoomSession(room, searchParams));

  // The user only ever sees the room code: strip any query string from the address
  // bar. Everything above already holds the resolved ticket, so nothing changes.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.location.search) return;
    window.history.replaceState(null, '', `/play/${room}`);
  }, [room]);

  // Ticket conditions: the lobby stashes them per room code (and older links carry
  // them on the URL, merged into the same state at mount).
  const durationParam = stashedSession?.duration || DEFAULT_MATCH_DURATION;
  // Prep window mirrors the ticket's "+ 1 min lobby time".
  const ANALYSIS_SECONDS = LOBBY_PREP_SECONDS;
  const BATTLE_SECONDS = battleSecondsFor(durationParam);
  // The generated market is a fixed 1,440 one-minute bars; spreading it over the
  // selected match length replays the same day faster or slower per duration.
  // Chart playback speed: the match replays 1/CHART_SLOWDOWN of the generated
  // day, so every 1m bar stays on screen 3× longer for the same match length.
  const CHART_SLOWDOWN = 3;
  /** Bars actually played during the battle (a third of the 1,440-bar day). */
  const PLAY_TICKS = Math.floor(TOTAL_BATTLE_TICKS / CHART_SLOWDOWN);
  const TICK_MS = (BATTLE_SECONDS * 1000) / PLAY_TICKS;

  const mode: GameMode = (stashedSession?.mode as GameMode) || 'standard';
  const opponentParam = stashedSession?.opponent || 'live';
  const isBotOpponent = opponentParam === 'bot';

  const rivalName = stashedSession?.rivalName || (isBotOpponent ? 'Momentum Bot' : 'Rival Trader');
  const rivalRating = stashedSession?.rivalRating || (isBotOpponent ? 1250 : 1200);
  const seedParam = stashedSession?.seed ? String(stashedSession.seed) : null;
  const startAtParam = stashedSession?.startAt ? String(stashedSession.startAt) : null;

  const { user, syncFromSupabase, recordMatch, addCoins } = useAuthStore();
  const [showLeaveModal, setShowLeaveModal] = useState<boolean>(false);

  // ── Progress system ──
  // Live duels settle XP, RP, missions and achievements and pay the coin pot;
  // practice rooms and friend invites never touch the ladder or the wallet.
  const isRankedMatch = stashedSession?.ranked === true;
  /** Coins this player paid to enter the Live table; 0 for Demo / bot / invite. */
  const liveStake = stashedSession?.stake ?? 0;
  const settleMatch = useProgressStore((s) => s.settleMatch);
  const bindProgress = useProgressStore((s) => s.bindUser);
  /** One stable id per room keeps re-settlement idempotent. */
  const [matchId] = useState(
    () => `m_${room}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
  );
  const [rewards, setRewards] = useState<RewardPacket | null>(null);
  /** What the pot paid this player, once settled — shown in the result modal. */
  const [potResult, setPotResult] = useState<{ stake: number; payout: number } | null>(null);

  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    const verifyAuth = async () => {
      if (user) {
        setAuthChecked(true);
        syncFromSupabase(user.id).catch(() => {});
        return;
      }

      if (typeof window !== 'undefined') {
        const stored = localStorage.getItem('pip-duel-auth-storage');
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            if (parsed?.state?.user) {
              setAuthChecked(true);
              return;
            }
          } catch {}
        }
      }

      const supabase = getSupabase();
      if (supabase) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          setAuthChecked(true);
          return;
        }
      }

      router.push('/login');
    };

    verifyAuth();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Bind the persisted progress snapshot to the signed-in account.
  useEffect(() => {
    if (!user?.id) return;
    bindProgress(user.id);
  }, [user?.id, bindProgress]);

  const [matchSeed] = useState<number>(() => {
    if (seedParam) {
      const parsed = parseInt(seedParam, 10);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
    let hash = 0;
    for (let i = 0; i < room.length; i++) {
      hash = (hash << 5) - hash + room.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash) + 2000;
  });

  // Fixed at mount: prep + 3s countdown, then the battle runs unattended to the end.
  const [targetBattleStart] = useState<number>(() => {
    if (startAtParam) {
      const parsed = parseInt(startAtParam, 10);
      if (!isNaN(parsed) && parsed > 0) {
        return parsed + (ANALYSIS_SECONDS + 3) * 1000;
      }
    }
    return Date.now() + (ANALYSIS_SECONDS + 3) * 1000;
  });

  const [market, setMarket] = useState<MarketDataset | null>(null);
  const [timeframe, setTimeframe] = useState<Timeframe>('1m');

  const [phase, setPhase] = useState<'analysis' | 'countdown' | 'live' | 'finished'>('analysis');
  const [analysisRemaining, setAnalysisRemaining] = useState<number>(ANALYSIS_SECONDS);
  const [battleRemaining, setBattleRemaining] = useState<number>(BATTLE_SECONDS);
  const [countdown, setCountdown] = useState<number>(3);

  const [currentTick, setCurrentTick] = useState<number>(0);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);

  const [userActions, setUserActions] = useState<Action[]>([]);
  const [pendingAction, setPendingAction] = useState<boolean>(false);
  const [rivalActions, setRivalActions] = useState<Action[]>([]);

  const [userSim, setUserSim] = useState<SimulationResult>({
    pnl: 0,
    maxDrawdown: 0,
    trades: [],
    equity: [START_BALANCE],
    openPosition: null,
  });

  const [rivalSim, setRivalSim] = useState<SimulationResult>({
    pnl: 0,
    maxDrawdown: 0,
    trades: [],
    equity: [START_BALANCE],
    openPosition: null,
  });

  const [settled, setSettled] = useState<boolean>(false);
  const [forfeitState, setForfeitState] = useState<{ isForfeit: boolean; winner: 'user' | 'rival' } | null>(null);

  // ── Realtime Room Channel for Forfeit / Exit Sync ──
  const roomChannelRef = useRef<ReturnType<NonNullable<ReturnType<typeof getSupabase>>['channel']> | null>(null);

  useEffect(() => {
    if (isBotOpponent) return;
    const supabase = getSupabase();
    if (!supabase) return;

    const channel = supabase.channel(`pipduel_room_${room}`, {
      config: {
        broadcast: { self: false },
        presence: { key: user?.id || 'anon' },
      },
    });

    channel.on('broadcast', { event: 'player_forfeit' }, ({ payload }) => {
      // If rival forfeited, stop chart progress, close room, and award victory to current player!
      sound.playWin();
      setForfeitState({ isForfeit: true, winner: 'user' });
      setPhase('finished');
      setSettled(true);

      // Record victory for staying user
      if (recordMatch && user) {
        recordMatch({
          id: 'm_' + Math.random().toString(36).substring(2, 9),
          room,
          mode,
          opponentName: rivalName,
          opponentRating: rivalRating,
          opponentIsBot: isBotOpponent,
          userScore: 100,
          opponentScore: 0,
          userPnl: userSim.pnl,
          userDrawdown: userSim.maxDrawdown,
          won: true,
          isDraw: false,
          seed: matchSeed,
          createdAt: new Date().toISOString(),
        });
      }
    });

    channel.subscribe();
    roomChannelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      roomChannelRef.current = null;
    };
  }, [room, isBotOpponent, user?.id]);

  useEffect(() => {
    const data = generateBattleMarket(matchSeed);
    setMarket(data);

    if (isBotOpponent) setUserActions([]);

    // Live rooms have no opponent trade feed yet, so the rival trades the same
    // seeded day under a different seed — both players see the same curve.
    setRivalActions(botActions(data.liveTicks, matchSeed + (isBotOpponent ? 0 : 1337)));
  }, [matchSeed, isBotOpponent]);

  useEffect(() => {
    if (!market || phase === 'finished' || settled) return;

    const timer = setInterval(() => {
      const now = Date.now();

      if (now < targetBattleStart - 3000) {
        setPhase('analysis');
        setAnalysisRemaining(Math.max(0, Math.ceil((targetBattleStart - 3000 - now) / 1000)));
      } else if (now < targetBattleStart) {
        setPhase('countdown');
        setCountdown(Math.max(1, Math.ceil((targetBattleStart - now) / 1000)));
      } else {
        setPhase((curr) => {
          if (curr !== 'live' && curr !== 'finished') {
            sound.playAlert();
            return 'live';
          }
          return curr;
        });

        const elapsedMs = Math.max(0, now - targetBattleStart);
        const tick = Math.min(PLAY_TICKS, Math.floor(elapsedMs / TICK_MS));
        setCurrentTick(tick);
        setBattleRemaining(Math.max(0, Math.ceil((PLAY_TICKS - tick) * (TICK_MS / 1000))));

        if (tick >= PLAY_TICKS) {
          clearInterval(timer);
          setPhase('finished');
        }
      }
    }, 40);

    return () => clearInterval(timer);
  }, [market, targetBattleStart, phase, settled, TICK_MS, PLAY_TICKS]);

  useEffect(() => {
    if (!market || phase === 'analysis' || phase === 'countdown') return;

    const uSim = simulate(market.liveTicks, userActions, currentTick);
    setUserSim(uSim);

    // Rival is re-simulated every tick so its P&L and equity curve stay live.
    setRivalSim(simulate(market.liveTicks, rivalActions, currentTick));

    if (pendingAction) {
      setPendingAction(false);
      sound.playFill();
    }
  }, [market, currentTick, userActions, rivalActions, phase, pendingAction]);

  /**
   * Dollar P&L gap → pips for a unit-size position (gold pip = 0.1 USD).
   * Exact at size 1 and monotonic in the real gap, which is all the RP margin
   * bonus and photo-finish detection need.
   */
  const pipMarginBetween = useCallback(
    (a: number, b: number, referencePrice: number) =>
      (Math.abs(a - b) * referencePrice) / (NOTIONAL_PER_SIZE * XAU_PIP_SIZE),
    [],
  );

  /**
   * Live pot settlement. The entry left the wallet on pairing, so this only
   * collects: the winner takes the pooled pot, a draw refunds each player their
   * own entry, a loss collects nothing. One credit per room mount, whichever
   * ending path (clock, rival forfeit, own forfeit) gets here first.
   */
  const potSettledRef = useRef(false);
  const creditPot = useCallback(
    (outcome: DuelOutcome) => {
      if (liveStake <= 0 || potSettledRef.current) return;
      potSettledRef.current = true;
      const payout = payoutFor(outcome, liveStake);
      if (payout > 0) addCoins(payout);
      setPotResult({ stake: liveStake, payout });
    },
    [liveStake, addCoins],
  );

  /** Feed one finished Live duel into the progress pipeline. */
  const settleRanked = useCallback(
    (
      outcome: MatchOutcome,
      finalUser: SimulationResult,
      finalRival: SimulationResult,
      price: number,
    ) => {
      if (!isRankedMatch) return;
      creditPot(outcome);
      const packet = settleMatch({
        matchId,
        room,
        mode: 'ranked',
        pair: 'XAU/USD',
        durationSeconds: BATTLE_SECONDS,
        outcome,
        pipMargin: pipMarginBetween(finalUser.pnl, finalRival.pnl, price),
        opponentRp: rivalRating,
        opponentKey: rivalName.toLowerCase(),
        actions: userActions,
        trades: finalUser.trades,
        equity: finalUser.equity,
        ticksTotal: PLAY_TICKS,
        currentPrice: price,
        openPosition: finalUser.openPosition,
        createdAt: new Date().toISOString(),
      });
      if (packet) setRewards(packet);
    },
    [
      isRankedMatch,
      creditPot,
      settleMatch,
      matchId,
      room,
      BATTLE_SECONDS,
      pipMarginBetween,
      rivalRating,
      rivalName,
      userActions,
      PLAY_TICKS,
    ],
  );

  useEffect(() => {
    if (phase !== 'finished' || settled || !market) return;

    const finalUserSim = simulate(market.liveTicks, userActions, PLAY_TICKS);
    const finalRivalSim = simulate(market.liveTicks, rivalActions, PLAY_TICKS);

    const uScore = score(finalUserSim, mode);
    const rScore = score(finalRivalSim, mode);
    const winnerCode = determineWinner(uScore, rScore);

    if (winnerCode === 1) sound.playWin();
    else if (winnerCode === 2) sound.playLose();

    setSettled(true);

    if (recordMatch && user) {
      recordMatch({
        id: matchId,
        room,
        mode,
        opponentName: rivalName,
        opponentRating: rivalRating,
        opponentIsBot: isBotOpponent,
        userScore: uScore.score,
        opponentScore: rScore.score,
        userPnl: uScore.pnl,
        userDrawdown: uScore.maxDrawdown,
        won: winnerCode === 1,
        isDraw: winnerCode === 0,
        seed: matchSeed,
        createdAt: new Date().toISOString(),
      });
    }

    // Live: XP, RP, missions, achievements and the coin pot from the same result.
    settleRanked(
      winnerCode === 1 ? 'win' : winnerCode === 0 ? 'draw' : 'loss',
      finalUserSim,
      finalRivalSim,
      market.liveTicks[PLAY_TICKS - 1] ?? market.startPrice,
    );
  }, [
    phase,
    settled,
    market,
    userActions,
    rivalActions,
    recordMatch,
    user,
    room,
    rivalName,
    mode,
    matchId,
    rivalRating,
    isBotOpponent,
    matchSeed,
    settleRanked,
    PLAY_TICKS,
  ]);

  // Entries are capped per match — only buy/sell count, closing costs nothing.
  const ordersPlaced = userActions.filter((a) => a.type === 'buy' || a.type === 'sell').length;
  const ordersLeft = Math.max(0, MAX_ORDERS_PER_MATCH - ordersPlaced);

  const handleBuy = useCallback((size: AllowedSize, slPct?: number, tpPct?: number) => {
    if (phase !== 'live' || pendingAction || ordersLeft <= 0) return;
    setPendingAction(true);
    setUserActions((prev) => [
      ...prev,
      { t: currentTick, type: 'buy', size, slPct, tpPct },
    ]);
  }, [phase, pendingAction, ordersLeft, currentTick]);

  const handleSell = useCallback((size: AllowedSize, slPct?: number, tpPct?: number) => {
    if (phase !== 'live' || pendingAction || ordersLeft <= 0) return;
    setPendingAction(true);
    setUserActions((prev) => [
      ...prev,
      { t: currentTick, type: 'sell', size, slPct, tpPct },
    ]);
  }, [phase, pendingAction, ordersLeft, currentTick]);

  const handleClose = useCallback(() => {
    if (phase !== 'live' || pendingAction || !userSim.openPosition) return;
    setPendingAction(true);
    setUserActions((prev) => [
      ...prev,
      { t: currentTick, type: 'close', size: userSim.openPosition?.size || 1 },
    ]);
  }, [phase, pendingAction, userSim.openPosition, currentTick]);

  const handleReverse = useCallback(() => {
    if (phase !== 'live' || pendingAction || !userSim.openPosition || ordersLeft <= 0) return;
    setPendingAction(true);
    const curr = userSim.openPosition;
    const oppType = curr.direction === 'long' ? 'sell' : 'buy';
    setUserActions((prev) => [
      ...prev,
      { t: currentTick, type: 'close', size: curr.size },
      { t: currentTick + 1, type: oppType, size: curr.size as AllowedSize },
    ]);
  }, [phase, pendingAction, userSim.openPosition, ordersLeft, currentTick]);

  // Intercept browser back button and tab close when in active match
  useEffect(() => {
    if (settled) return;

    // Push dummy state so browser 'Back' pops this state first
    window.history.pushState({ inDuel: true }, '');

    const handlePopState = () => {
      // User pressed browser back button
      if (!settled) {
        // Re-push history so they don't leave instantly
        window.history.pushState({ inDuel: true }, '');
        sound.playAlert();
        setShowLeaveModal(true);
      }
    };

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!settled) {
        // Attempt broadcast forfeit on page close/refresh
        try {
          roomChannelRef.current?.send({
            type: 'broadcast',
            event: 'player_forfeit',
            payload: { userId: user?.id, username: user?.username },
          });
        } catch {}
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };

    window.addEventListener('popstate', handlePopState);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [settled, user?.id, user?.username]);

  const handleConfirmLeave = () => {
    // Notify rival that this player has forfeited
    try {
      roomChannelRef.current?.send({
        type: 'broadcast',
        event: 'player_forfeit',
        payload: { userId: user?.id, username: user?.username },
      });
    } catch {}

    // Record forfeit loss locally
    if (recordMatch && user) {
      recordMatch({
        id: matchId,
        room,
        mode,
        opponentName: rivalName,
        opponentRating: rivalRating,
        opponentIsBot: isBotOpponent,
        userScore: userSim.pnl,
        opponentScore: 0,
        userPnl: userSim.pnl,
        userDrawdown: userSim.maxDrawdown,
        won: false,
        isDraw: false,
        seed: matchSeed,
        createdAt: new Date().toISOString(),
      });
    }

    // Live: walking out of a duel counts as a loss, and the entry is already gone.
    if (phase === 'live') {
      settleRanked(
        'loss',
        userSim,
        rivalSim,
        market?.liveTicks[currentTick] ?? market?.startPrice ?? 1000,
      );
    }

    setShowLeaveModal(false);
    router.push('/play');
  };

  // When user drags SL/TP line on chart — re-apply current open action with new pct
  const handleSlChange = useCallback((slPct: number) => {
    if (phase !== 'live' || !userSim.openPosition) return;
    // Close and reopen with new SL pct (simplest model: update via a new action)
    // We mutate userActions to update the most recent buy/sell action's slPct
    setUserActions((prev) => {
      const updated = [...prev];
      // Find last buy or sell action
      for (let i = updated.length - 1; i >= 0; i--) {
        if (updated[i].type === 'buy' || updated[i].type === 'sell') {
          updated[i] = { ...updated[i], slPct: parseFloat(slPct.toFixed(4)) };
          break;
        }
      }
      return updated;
    });
  }, [phase, userSim.openPosition]);

  const handleTpChange = useCallback((tpPct: number) => {
    if (phase !== 'live' || !userSim.openPosition) return;
    setUserActions((prev) => {
      const updated = [...prev];
      for (let i = updated.length - 1; i >= 0; i--) {
        if (updated[i].type === 'buy' || updated[i].type === 'sell') {
          updated[i] = { ...updated[i], tpPct: parseFloat(tpPct.toFixed(4)) };
          break;
        }
      }
      return updated;
    });
  }, [phase, userSim.openPosition]);

  const currentPrice = market
    ? phase === 'analysis'
      ? market.startPrice
      : market.liveTicks[currentTick] ?? market.startPrice
    : 1000;

  const currentCandles = market
    ? getCandlesForTimeframe(market, timeframe, phase === 'analysis' ? 0 : currentTick, market.baseTime)
    : [];

  // A rival forfeit ends the duel outside the clock — settle that ranked result
  // here. The packet is idempotent per matchId, so the ref just saves a call.
  const forfeitSettledRef = useRef(false);
  useEffect(() => {
    if (!forfeitState || forfeitSettledRef.current) return;
    forfeitSettledRef.current = true;
    settleRanked(
      forfeitState.winner === 'user' ? 'win' : 'loss',
      userSim,
      rivalSim,
      currentPrice,
    );
  }, [forfeitState, settleRanked, userSim, rivalSim, currentPrice]);

  const analysisTimerStr = `${analysisRemaining}s`;
  const battleTimerStr = `${Math.floor(battleRemaining / 60)}:${(battleRemaining % 60).toString().padStart(2, '0')}`;
  const isLast30Sec = phase === 'live' && battleRemaining <= 30;

  // Wallet moves only when a trade closes: realized P&L drives the balance, an open
  // position stays unrealised until it is closed out.
  const realizedPnl = userSim.trades.reduce((sum, trade) => sum + trade.pnl, 0);
  const balance = START_BALANCE + realizedPnl;
  const unrealizedPnl = userSim.equity[userSim.equity.length - 1] - balance;
  const isInProfit = realizedPnl >= 0;

  const userScore = score(userSim, mode);
  const rivalScore = score(rivalSim, mode);
  const winnerCode = determineWinner(userScore, rivalScore);

  if (!authChecked && !user) {
    return (
      <div className="h-screen w-screen flex items-center justify-center font-mono text-xs select-none bg-[#111215] text-[#6c7080]">
        Verifying Session…
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden select-none bg-[#111215] text-[#d1d4dc] font-sans">
      {/* ── TOP HEADER (Tradovate / TV Dark Style) ── */}
      <header className="h-10 flex items-center justify-between text-xs shrink-0 z-20 px-3 bg-[#131417] border-b border-[#1f2229]">
        {/* Left: Account Pill & Balances */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              if (settled) {
                router.push('/play');
              } else {
                sound.playAlert();
                setShowLeaveModal(true);
              }
            }}
            className="flex items-center gap-1 text-[#6c7080] hover:text-[#d1d4dc] font-semibold transition-colors mr-1 cursor-pointer"
            title="Leave room"
          >
            <ArrowLeft size={14} />
            <span className="hidden sm:inline uppercase tracking-wider text-[11px]">Leave</span>
          </button>

          {/* Trader Profile Pill */}
          <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#181a20] border border-[#262932] text-[#d1d4dc] text-[11px] font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-[#089981]" />
            <User size={12} className="text-[#6c7080]" />
            <span className="truncate max-w-[130px]">
              {user?.username || user?.displayName || 'Trader'}
            </span>
            <span className="text-[#6c7080]">▾</span>
          </div>

          <div className="hidden md:flex items-center gap-3 text-xs font-mono">
            <div className="flex items-center gap-1.5">
              <span className="text-[#6c7080]">Bal </span>
              <span className="font-semibold text-[#d1d4dc] tabular-nums">
                ${balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div
              className={`flex items-center gap-1.5 px-2 py-0.5 rounded border text-white font-semibold tabular-nums transition-colors ${
                isInProfit
                  ? 'bg-[#089981] border-[#089981]'
                  : 'bg-[#f23645] border-[#f23645]'
              }`}
            >
              <span className="font-sans font-medium opacity-80">RP&L</span>
              <span>
                {isInProfit ? '+' : '-'}${Math.abs(realizedPnl).toFixed(2)}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[#6c7080]">UP&L </span>
              {userSim.openPosition ? (
                <span
                  className={`font-semibold tabular-nums ${unrealizedPnl >= 0 ? 'text-[#089981]' : 'text-[#f23645]'}`}
                >
                  {unrealizedPnl >= 0 ? '+' : '-'}${Math.abs(unrealizedPnl).toFixed(2)}
                </span>
              ) : (
                <span className="font-semibold text-[#d1d4dc]">$--</span>
              )}
            </div>
          </div>
        </div>

        {/* Center: DEMO Badge & Battle Timer */}
        <div className="flex items-center gap-2">
          <div className="px-2.5 py-0.5 rounded bg-[#181a20] border border-[#262932] text-[11px] font-bold text-[#787b86] uppercase tracking-wider">
            DEMO
          </div>

          {phase === 'analysis' ? (
            <div className="flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-semibold uppercase bg-[#2962ff]/10 border border-[#2962ff]/30 text-[#2962ff]">
              <Eye size={12} className="animate-pulse" />
              <span>Analysis ({analysisTimerStr})</span>
            </div>
          ) : (
            <div
              className={`font-mono text-sm font-bold tabular-nums px-2.5 py-0.5 rounded flex items-center gap-1.5 border ${
                isLast30Sec
                  ? 'bg-[#f23645]/15 border-[#f23645]/40 text-[#f23645] animate-countdown'
                  : 'bg-[#181a20] border-[#262932] text-[#d1d4dc]'
              }`}
            >
              <Clock size={12} style={{ color: isLast30Sec ? '#f23645' : '#089981' }} />
              <span>{battleTimerStr}</span>
            </div>
          )}
        </div>

        {/* Right: Mode & Sound */}
        <div className="flex items-center gap-2">
          <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-semibold uppercase px-2 py-0.5 rounded bg-[#2962ff]/10 border border-[#2962ff]/30 text-[#2962ff]">
            <Swords size={11} />{' '}
            {isRankedMatch
              ? liveStake > 0
                ? `Live · ${liveStake.toLocaleString()} coin entry`
                : 'Live Duel'
              : 'Demo Duel'}
          </span>

          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="p-1 rounded bg-[#181a20] border border-[#262932] text-[#6c7080] hover:text-[#d1d4dc] transition-colors"
            title="Toggle Sound"
          >
            {soundEnabled ? <Volume2 size={13} /> : <VolumeX size={13} />}
          </button>
        </div>
      </header>

      {/* ── COUNTDOWN OVERLAY ── */}
      {phase === 'countdown' && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center animate-fade-in pointer-events-none bg-[#111215]/90 backdrop-blur-md">
          <div className="text-8xl md:text-9xl font-black tabular-nums text-[#089981] drop-shadow-[0_0_40px_rgba(8,153,129,0.5)]">
            {countdown}
          </div>
          <span className="text-xs uppercase tracking-[0.25em] font-semibold mt-4 text-[#787b86]">
            Battle Starting
          </span>
        </div>
      )}

      {/* ── MAIN WORKSPACE: CHART + ORDER PANEL + RIVAL PANEL ── */}
      <div className="flex-1 flex overflow-hidden">
        {/* Center Chart */}
        <div className="flex-1 flex flex-col relative overflow-hidden bg-[#111215]">
          <TradingChart
            candles={currentCandles}
            currentPrice={currentPrice}
            position={userSim.openPosition}
            trades={userSim.trades}
            timeframe={timeframe}
            onTimeframeChange={setTimeframe}
            instrument="XAU/USD"
            onSlChange={handleSlChange}
            onTpChange={handleTpChange}
            onClose={handleClose}
          />
        </div>

        {/* Right Sidebar: Order Panel & Rival Status */}
        <div className="w-80 flex flex-col shrink-0 overflow-y-auto bg-[#131417] border-l border-[#1f2229]">
          <OrderPanel
            currentPrice={currentPrice}
            position={userSim.openPosition}
            pendingAction={pendingAction}
            ordersPlaced={ordersPlaced}
            maxOrders={MAX_ORDERS_PER_MATCH}
            onBuy={handleBuy}
            onSell={handleSell}
            onClose={handleClose}
            onReverse={handleReverse}
            onSlChange={handleSlChange}
            onTpChange={handleTpChange}
            disabled={phase !== 'live'}
          />

          <RivalPanel
            name={rivalName}
            rating={rivalRating}
            isBot={isBotOpponent}
            livePnl={rivalScore.pnl}
            equity={rivalSim.equity[rivalSim.equity.length - 1] || START_BALANCE}
            inTrade={!!rivalSim.openPosition}
            equityHistory={rivalSim.equity}
            connected={true}
          />
        </div>
      </div>




      {/* ── RESULT MODAL ── */}
      {settled && (
        <ResultModal
          won={forfeitState ? forfeitState.winner === 'user' : winnerCode === 1}
          isDraw={forfeitState ? false : winnerCode === 0}
          userScore={userScore}
          rivalScore={rivalScore}
          userTrades={userSim.trades}
          rivalName={rivalName}
          userEquity={userSim.equity}
          rivalEquity={rivalSim.equity}
          isForfeit={forfeitState?.isForfeit}
          forfeitWinner={forfeitState?.winner}
          battleSeconds={BATTLE_SECONDS}
          rewards={rewards}
          pot={potResult}
          revealedMarket={{
            title: market?.segmentName || 'Historical Market Match',
            asset: 'XAU/USD Spot Gold',
            tags: [market?.battleDayLabel || 'Spot Gold', market?.contextDayLabel || 'Context'],
            seed: matchSeed,
          }}
          onRematch={() => {
            window.location.reload();
          }}
        />
      )}
      {/* ── LEAVE / FORFEIT CONFIRMATION MODAL ── */}
      {showLeaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0d0f12]/95 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-[#131417] border border-[#2a2e39] rounded-xl max-w-sm w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-[#f23645]/15 border border-[#f23645]/30 flex items-center justify-center text-[#f23645] shrink-0">
                <AlertTriangle size={20} />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                  Leave Running Match?
                </h3>
                <p className="text-xs text-[#9598a1] leading-relaxed">
                  You are currently in an active trading duel against <span className="text-white font-semibold">{rivalName}</span>. Leaving now will forfeit your duel and any active positions.
                </p>
              </div>
            </div>

            <div className="p-2.5 rounded bg-[#181a20] border border-[#1f2229] text-[11px] font-mono text-[#787b86] space-y-1">
              <div className="flex justify-between">
                <span>Room:</span>
                <span className="text-[#d1d4dc]">{room}</span>
              </div>
              <div className="flex justify-between">
                <span>Time Remaining:</span>
                <span className="text-[#f59e0b]">{phase === 'analysis' ? analysisTimerStr : battleTimerStr}</span>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => {
                  sound.playClick();
                  setShowLeaveModal(false);
                }}
                className="flex-1 h-9 rounded bg-[#181a20] hover:bg-[#20242e] border border-[#2a2e39] hover:border-[#3d4250] text-xs font-semibold text-[#d1d4dc] transition-all cursor-pointer"
              >
                Stay in Duel
              </button>
              <button
                onClick={() => {
                  sound.playClick();
                  handleConfirmLeave();
                }}
                className="flex-1 h-9 rounded bg-[#f23645] hover:bg-[#d92d3b] text-white text-xs font-bold transition-all cursor-pointer shadow-md"
              >
                Forfeit & Leave
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


export default function PlayRoomPage() {
  return (
    <Suspense fallback={
      <div className="h-screen w-screen flex items-center justify-center font-mono text-xs" style={{ background: 'var(--term-bg)', color: 'var(--term-muted)' }}>
        Initializing Battle Arena…
      </div>
    }>
      <PlayRoomContent />
    </Suspense>
  );
}

'use client';

import { useEffect, useState, useRef, useCallback, useMemo, Suspense } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { START_BALANCE, NOTIONAL_PER_SIZE, MAX_ORDERS_PER_MATCH, battleSecondsFor, battleStartFor, LOBBY_PREP_SECONDS, DEFAULT_MATCH_DURATION, TICKS_PER_BAR, TICK_SECONDS, battleTicksFor } from '@/lib/engine/constants';
import type { AllowedSize } from '@/lib/engine/constants';
import { simulate, score, determineWinner } from '@/lib/engine/simulate';
import { botActions } from '@/lib/engine/bot';
import {
  generateBattleMarket,
  getCandlesForTimeframe,
  TIMEFRAME_SECONDS,
  type Timeframe,
  type MarketDataset,
} from '@/lib/engine/market-feed';
import { SYNTH_PAIR } from '@/lib/engine/synthetic-market';
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
import { MobileOrderDock } from '@/components/terminal/mobile-order-dock';
import { RivalPanel } from '@/components/terminal/rival-panel';
import { ResultModal } from '@/components/terminal/result-modal';
import { useTerminalMode } from '@/components/terminal/theme-mode';

import {
  Swords, Shield, Clock, ArrowLeft,
  Eye, User, AlertTriangle, X
} from 'lucide-react';

function PlayRoomContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const room = (params.room as string) || 'DUEL1';

  // Same light/dark switch the lobby carries: mounting `.term-theme` here lets
  // the shared tokens repaint the arena too.
  const themeMode = useTerminalMode();

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
  // A duel trades the market at 1×: the ticket's minutes are the market's minutes, so
  // a 15s candle stays open for fifteen real seconds and the countdown on the chart is
  // the match clock. A tick prints every second and is exactly the price an order
  // fills against — the room and the server-side verifier count the same ones.
  const MATCH_TICKS = battleTicksFor(BATTLE_SECONDS);
  const TICK_MS = TICK_SECONDS * 1000;

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
  // The ticket's shared startAt makes this instant identical on both terminals, and it
  // is also what picks the market — see the effect below.
  const [targetBattleStart] = useState<number>(() => {
    if (startAtParam) {
      const parsed = parseInt(startAtParam, 10);
      if (!isNaN(parsed) && parsed > 0) {
        return battleStartFor(parsed);
      }
    }
    return battleStartFor(Date.now());
  });

  const [market, setMarket] = useState<MarketDataset | null>(null);
  const [timeframe, setTimeframe] = useState<Timeframe>('1m');

  const [phase, setPhase] = useState<'analysis' | 'countdown' | 'live' | 'finished'>('analysis');
  const [analysisRemaining, setAnalysisRemaining] = useState<number>(ANALYSIS_SECONDS);
  const [battleRemaining, setBattleRemaining] = useState<number>(BATTLE_SECONDS);
  const [countdown, setCountdown] = useState<number>(3);

  const [currentTick, setCurrentTick] = useState<number>(0);
  /** Price steps printed inside the current bar; 0 until the battle is running. */
  const [subTick, setSubTick] = useState<number>(0);
  /** Engine tick on screen: one per TICK_SECONDS, and the price every order fills against. */
  const engineTick = currentTick * TICKS_PER_BAR + subTick;

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
    // One global series, indexed by UTC time: this battle trades the window that opens
    // on the minute the ticket fires, and it trades it at 1×. Both terminals hold the
    // same startAt, so they derive the same ticks, the same candles and the same fills.
    const data = generateBattleMarket(targetBattleStart, BATTLE_SECONDS);
    // The market is derived once from the ticket, then owned by the tick loop.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMarket(data);

    if (isBotOpponent) setUserActions([]);

    // Live rooms have no opponent trade feed yet, so the rival trades this shared market
    // with its own seeded strategy — same path, different mind. It only sees the ticks
    // the match actually plays, never the bar the final read lands on.
    setRivalActions(botActions(data.tickPath.slice(0, MATCH_TICKS + 1), matchSeed + (isBotOpponent ? 0 : 1337)));
  }, [targetBattleStart, matchSeed, isBotOpponent, BATTLE_SECONDS, MATCH_TICKS]);

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
        // One second is one tick: the bar cursor is the minute the market is printing,
        // and subTick is the print inside it the forming candle has reached. The chart
        // and the engine read the very same cursor.
        const displayTick = Math.min(MATCH_TICKS, Math.floor(elapsedMs / TICK_MS));
        const tick = Math.floor(displayTick / TICKS_PER_BAR);
        setCurrentTick(tick);
        setSubTick(displayTick % TICKS_PER_BAR);
        setBattleRemaining(Math.max(0, Math.ceil((MATCH_TICKS - displayTick) * (TICK_MS / 1000))));

        if (displayTick >= MATCH_TICKS) {
          clearInterval(timer);
          setPhase('finished');
        }
      }
    }, 40);

    return () => clearInterval(timer);
  }, [market, targetBattleStart, phase, settled, TICK_MS, MATCH_TICKS]);

  useEffect(() => {
    if (!market || phase === 'analysis' || phase === 'countdown') return;

    const uSim = simulate(market.tickPath, userActions, engineTick);
    // Sync the per-tick simulation into React state; this is the game clock.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUserSim(uSim);

    // Rival is re-simulated every tick so its P&L and equity curve stay live.
    setRivalSim(simulate(market.tickPath, rivalActions, engineTick));

    if (pendingAction) {
      setPendingAction(false);
      sound.playFill();
    }
  }, [market, engineTick, userActions, rivalActions, phase, pendingAction]);

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
        opponentKey: rivalName,
        actions: userActions,
        trades: finalUser.trades,
        equity: finalUser.equity,
        ticksTotal: MATCH_TICKS,
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
      MATCH_TICKS,
    ],
  );

  useEffect(() => {
    if (phase !== 'finished' || settled || !market) return;

    const finalUserSim = simulate(market.tickPath, userActions, MATCH_TICKS);
    const finalRivalSim = simulate(market.tickPath, rivalActions, MATCH_TICKS);

    const uScore = score(finalUserSim, mode);
    const rScore = score(finalRivalSim, mode);
    const winnerCode = determineWinner(uScore, rScore);

    if (winnerCode === 1) sound.playWin();
    else if (winnerCode === 2) sound.playLose();

    // Settlement is a one-way latch driven by the clock, not derived state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
      market.tickPath[MATCH_TICKS] ?? market.startPrice,
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
    MATCH_TICKS,
  ]);

  // Entries are capped per match — only buy/sell count, closing costs nothing.
  const ordersPlaced = userActions.filter((a) => a.type === 'buy' || a.type === 'sell').length;
  const ordersLeft = Math.max(0, MAX_ORDERS_PER_MATCH - ordersPlaced);

  const handleBuy = useCallback((size: AllowedSize, slPct?: number, tpPct?: number) => {
    if (phase !== 'live' || pendingAction || ordersLeft <= 0) return;
    setPendingAction(true);
    setUserActions((prev) => [
      ...prev,
      { t: engineTick, type: 'buy', size, slPct, tpPct },
    ]);
  }, [phase, pendingAction, ordersLeft, engineTick]);

  const handleSell = useCallback((size: AllowedSize, slPct?: number, tpPct?: number) => {
    if (phase !== 'live' || pendingAction || ordersLeft <= 0) return;
    setPendingAction(true);
    setUserActions((prev) => [
      ...prev,
      { t: engineTick, type: 'sell', size, slPct, tpPct },
    ]);
  }, [phase, pendingAction, ordersLeft, engineTick]);

  const handleClose = useCallback(() => {
    if (phase !== 'live' || pendingAction || !userSim.openPosition) return;
    setPendingAction(true);
    setUserActions((prev) => [
      ...prev,
      { t: engineTick, type: 'close', size: userSim.openPosition?.size || 1 },
    ]);
  }, [phase, pendingAction, userSim.openPosition, engineTick]);

  const handleReverse = useCallback(() => {
    if (phase !== 'live' || pendingAction || !userSim.openPosition || ordersLeft <= 0) return;
    setPendingAction(true);
    const curr = userSim.openPosition;
    const oppType = curr.direction === 'long' ? 'sell' : 'buy';
    setUserActions((prev) => [
      ...prev,
      { t: engineTick, type: 'close', size: curr.size },
      { t: engineTick + 1, type: oppType, size: curr.size as AllowedSize },
    ]);
  }, [phase, pendingAction, userSim.openPosition, ordersLeft, engineTick]);

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
        market?.tickPath[engineTick] ?? market?.startPrice ?? 1000,
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

  const isBattleRunning = phase === 'live' || phase === 'finished';

  // The readout follows the tick path so the price crawls instead of jumping a bar at
  // a time. Settlement reads the same path: a fill is priced by the print the player
  // saw, one second after the click.
  const currentPrice = market
    ? phase === 'analysis' || phase === 'countdown'
      ? market.startPrice
      : market.tickPath[engineTick] ?? market.startPrice
    : 1000;

  // Bar-close clock, TradingView style: the chart axis runs 1× with the match, so a
  // candle seals exactly when the axis crosses its frame boundary.
  const barInterval = TIMEFRAME_SECONDS[timeframe];
  const axisSeconds = market ? market.baseTime + engineTick * TICK_SECONDS : 0;
  const barCloseInSeconds =
    phase === 'live' && market ? barInterval - (axisSeconds % barInterval) : null;

  // Rebuilt only when something that changes the picture actually moves. History is a
  // stable slice; between sub-ticks only the last candle differs.
  const currentCandles = useMemo(
    () => (market
      ? getCandlesForTimeframe(
        market,
        timeframe,
        isBattleRunning ? currentTick : 0,
        market.baseTime,
        phase === 'live' ? subTick : 0,
      )
      : []),
    [market, timeframe, currentTick, subTick, phase, isBattleRunning],
  );

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
      <div className="h-screen w-screen flex items-center justify-center font-mono text-xs select-none bg-[var(--term-bg)] text-[var(--term-muted)]">
        Verifying Session…
      </div>
    );
  }

  /* Compact header keeps the two numbers that matter in view: the running
     result beside the clock. The result is bare text — no box — so it never
     competes for room with the clock's chip. */
  const livePnl = userSim.openPosition ? unrealizedPnl : realizedPnl;
  const pnlChip = (
    <div
      className={`font-mono text-sm font-bold tabular-nums ${
        livePnl > 0
          ? 'text-[var(--term-buy)]'
          : livePnl < 0
            ? 'text-[var(--term-sell)]'
            : 'text-[var(--term-text)]'
      }`}
      title={userSim.openPosition ? 'Open trade P&L' : 'Booked P&L on closed trades'}
    >
      P&L {livePnl > 0 ? '+' : livePnl < 0 ? '−' : ''}${Math.abs(livePnl).toFixed(2)}
    </div>
  );

  /* The clock is one chip in two homes: centred on the laptop bar, and pushed
     to the top-right corner on a phone, where the thumb-adjacent chrome is the
     only thing the header still has room for. */
  const clockChip =
    phase === 'analysis' ? (
      <div className="flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-semibold uppercase bg-[var(--term-primary)]/10 border border-[var(--term-primary)]/30 text-[var(--term-primary)]">
        <Eye size={12} className="animate-pulse" />
        <span>Analysis ({analysisTimerStr})</span>
      </div>
    ) : (
      <div
        className={`font-mono text-sm font-bold tabular-nums px-2.5 py-0.5 rounded flex items-center gap-1.5 border ${
          isLast30Sec
            ? 'bg-[var(--term-sell)]/15 border-[var(--term-sell)]/40 text-[var(--term-sell)]'
            : 'bg-[var(--term-raised)] border-[var(--term-border)] text-[var(--term-text)]'
        }`}
      >
        <Clock size={12} style={{ color: isLast30Sec ? 'var(--term-sell)' : 'var(--term-buy)' }} />
        <span>{battleTimerStr}</span>
      </div>
    );

  return (
    <div data-terminal data-theme={themeMode} className="term-theme flex flex-col h-dvh w-screen overflow-hidden select-none bg-[var(--term-bg)] text-[var(--term-text)] font-sans">
      {/* ── TOP HEADER — the terminal's own chrome, painted with the arena tokens ── */}
      <header className="h-10 flex items-center justify-between text-xs shrink-0 z-20 px-3 bg-[var(--term-surface)] border-b border-[var(--term-border)]">
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
            className="flex items-center gap-1 text-[var(--term-muted)] hover:text-[var(--term-text)] font-semibold transition-colors mr-1 cursor-pointer"
            title="Leave room"
          >
            <ArrowLeft size={14} />
            <span className="hidden sm:inline uppercase tracking-wider text-[11px]">Leave</span>
          </button>

          {/* Trader Profile Pill */}
          <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[var(--term-raised)] border border-[var(--term-border)] text-[var(--term-text)] text-[11px] font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--term-buy)]" />
            <User size={12} className="text-[var(--term-muted)]" />
            <span className="truncate max-w-[86px] sm:max-w-[130px]">
              {user?.username || user?.displayName || 'Trader'}
            </span>
            <span className="text-[var(--term-muted)]">▾</span>
          </div>

          <div className="hidden md:flex items-center gap-3 text-xs font-mono">
            <div className="flex items-center gap-1.5">
              <span className="text-[var(--term-muted)]">Bal </span>
              <span className="font-semibold text-[var(--term-text)] tabular-nums">
                ${balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div
              className={`flex items-center gap-1.5 px-2 py-0.5 rounded border text-[var(--term-strong)] font-semibold tabular-nums transition-colors ${
                isInProfit
                  ? 'bg-[var(--term-buy)] border-[var(--term-buy)]'
                  : 'bg-[var(--term-sell)] border-[var(--term-sell)]'
              }`}
            >
              <span className="font-sans font-medium opacity-80">RP&L</span>
              <span>
                {isInProfit ? '+' : '-'}${Math.abs(realizedPnl).toFixed(2)}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[var(--term-muted)]">UP&L </span>
              {userSim.openPosition ? (
                <span
                  className={`font-semibold tabular-nums ${unrealizedPnl >= 0 ? 'text-[var(--term-buy)]' : 'text-[var(--term-sell)]'}`}
                >
                  {unrealizedPnl >= 0 ? '+' : '-'}${Math.abs(unrealizedPnl).toFixed(2)}
                </span>
              ) : (
                <span className="font-semibold text-[var(--term-text)]">$--</span>
              )}
            </div>
          </div>
        </div>

        {/* Center: DEMO Badge & Battle Timer */}
        <div className="flex items-center gap-2">
          <div className="hidden sm:block px-2.5 py-0.5 rounded bg-[var(--term-raised)] border border-[var(--term-border)] text-[11px] font-bold text-[var(--term-label)] uppercase tracking-wider">
            DEMO
          </div>

          {/* Which slice of the global market this duel is trading — the same one every
              other player in this UTC hour is looking at. */}
          {market && (
            <div
              className="hidden lg:flex items-center px-2.5 py-0.5 rounded bg-[var(--term-raised)] border border-[var(--term-border)] text-[11px] font-semibold text-[var(--term-label)] tracking-wider tabular-nums"
              title="One market, indexed by UTC time. Every duel in this hour trades this window."
            >
              {market.battleSessionLabel}
            </div>
          )}

          {/* Laptop: the clock rides in the middle of the bar */}
          <div className="hidden md:flex">{clockChip}</div>
        </div>

        {/* Right: mode, and on a phone the clock too */}
        <div className="flex items-center gap-2">
          <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-semibold uppercase px-2 py-0.5 rounded bg-[var(--term-primary)]/10 border border-[var(--term-primary)]/30 text-[var(--term-primary)]">
            <Swords size={11} />{' '}
            {isRankedMatch
              ? liveStake > 0
                ? `Live · ${liveStake.toLocaleString()} coin entry`
                : 'Live Duel'
              : 'Demo Duel'}
          </span>

          {/* Phone: the result and the clock own the top-right corner. No P&L
              before the bell — it would sit beside a differently shaped chip */}
          {phase !== 'analysis' && <div className="md:hidden">{pnlChip}</div>}
          <div className="md:hidden">{clockChip}</div>
        </div>
      </header>

      {/* ── COUNTDOWN OVERLAY ── */}
      {phase === 'countdown' && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center animate-fade-in pointer-events-none bg-[var(--term-bg)]/90 backdrop-blur-md">
          <div className="text-8xl md:text-9xl font-black tabular-nums text-[var(--term-buy)] drop-shadow-[0_0_40px_var(--term-buy-dim)]">
            {countdown}
          </div>
          <span className="text-xs uppercase tracking-[0.25em] font-semibold mt-4 text-[var(--term-label)]">
            Battle Starting
          </span>
        </div>
      )}

      {/* ── MAIN WORKSPACE: CHART + ORDER PANEL + RIVAL PANEL ── */}
      <div className="flex-1 flex overflow-hidden">
        {/* Center Chart */}
        <div className="flex-1 flex flex-col relative overflow-hidden bg-[var(--term-bg)]">
          <TradingChart
            candles={currentCandles}
            currentPrice={currentPrice}
            position={userSim.openPosition}
            trades={userSim.trades}
            timeframe={timeframe}
            onTimeframeChange={setTimeframe}
            barCloseInSeconds={barCloseInSeconds}
            instrument={market?.instrument ?? SYNTH_PAIR.symbol}
            digits={market?.digits ?? SYNTH_PAIR.digits}
            onSlChange={handleSlChange}
            onTpChange={handleTpChange}
            onClose={handleClose}
          />
        </div>

        {/* Right Sidebar: Order Panel & Rival Status — desktop only; a phone
            orders from the bottom dock instead */}
        <div className="hidden md:flex w-80 flex-col shrink-0 overflow-y-auto bg-[var(--term-surface)] border-l border-[var(--term-border)]">
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

      {/* ── MOBILE ORDER DOCK ──
          Below md the sidebar above is hidden and this bottom row is the whole
          ticket: SELL | lot size | BUY, one tap to market. */}
      <MobileOrderDock
        digits={market?.digits ?? SYNTH_PAIR.digits}
        currentPrice={currentPrice}
        position={userSim.openPosition}
        pendingAction={pendingAction}
        ordersPlaced={ordersPlaced}
        maxOrders={MAX_ORDERS_PER_MATCH}
        rivalName={rivalName}
        rivalRating={rivalRating}
        rivalPnl={rivalScore.pnl}
        onBuy={handleBuy}
        onSell={handleSell}
        onClose={handleClose}
        onReverse={handleReverse}
        disabled={phase !== 'live'}
      />

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
            title: market?.battleSessionLabel || 'Synthetic Market Match',
            asset: market?.instrument || SYNTH_PAIR.symbol,
            tags: ['Global session', market?.instrumentLabel || SYNTH_PAIR.label],
            session: 'Same window as every duel in this hour',
          }}
          onRematch={() => {
            window.location.reload();
          }}
        />
      )}
      {/* ── LEAVE / FORFEIT CONFIRMATION MODAL ── */}
      {showLeaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--term-panel-deep)]/95 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-[var(--term-surface)] border border-[var(--term-border-hi)] rounded-xl max-w-sm w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-[var(--term-sell)]/15 border border-[var(--term-sell)]/30 flex items-center justify-center text-[var(--term-sell)] shrink-0">
                <AlertTriangle size={20} />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-[var(--term-strong)] uppercase tracking-wider font-mono">
                  Leave Running Match?
                </h3>
                <p className="text-xs text-[var(--term-label)] leading-relaxed">
                  You are currently in an active trading duel against <span className="text-[var(--term-strong)] font-semibold">{rivalName}</span>. Leaving now will forfeit your duel and any active positions.
                </p>
              </div>
            </div>

            <div className="p-2.5 rounded bg-[var(--term-raised)] border border-[var(--term-border)] text-[11px] font-mono text-[var(--term-label)] space-y-1">
              <div className="flex justify-between">
                <span>Room:</span>
                <span className="text-[var(--term-text)]">{room}</span>
              </div>
              <div className="flex justify-between">
                <span>Time Remaining:</span>
                <span className="text-[var(--term-amber)]">{phase === 'analysis' ? analysisTimerStr : battleTimerStr}</span>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => {
                  sound.playClick();
                  setShowLeaveModal(false);
                }}
                className="flex-1 h-9 rounded bg-[var(--term-raised)] hover:bg-[var(--term-raised-hi)] border border-[var(--term-border-hi)] hover:border-[var(--term-border-hover)] text-xs font-semibold text-[var(--term-text)] transition-all cursor-pointer"
              >
                Stay in Duel
              </button>
              <button
                onClick={() => {
                  sound.playClick();
                  handleConfirmLeave();
                }}
                className="flex-1 h-9 rounded bg-[var(--term-sell)] hover:bg-[var(--term-sell-2)] text-[var(--term-canvas)] text-xs font-bold transition-all cursor-pointer shadow-md"
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

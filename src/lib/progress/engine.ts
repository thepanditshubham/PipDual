import { isPhotoFinish, analyzeMatch } from './analysis';
import {
  DISCIPLINE_BONUS_THRESHOLD,
  DISCIPLINE_XP_BONUS,
  PLACEMENT_MATCHES,
  PRACTICE_XP_PER_DAY,
  MAX_SETTLED_IDS,
} from './config';
import {
  advanceAchievements,
  createAchievementState,
} from './achievements';
import {
  advanceMissions,
  createMissionState,
  ensureMissionPeriods,
  missionMetricsFromMatch,
} from './missions';
import {
  createRankState,
  higherTier,
  moveRp,
  payoutMultiplier,
  placementRp,
  rankPosition,
  rpDelta,
  tierForRp,
} from './rank';
import { refreshSeason, seasonAt } from './season';
import { applyMatchToStats, computeDna, emptyStats } from './stats';
import { istDayKey, istWeekKey } from './time';
import { baseMatchXp, levelFromXp } from './xp';
import { unlocksAt, missionDef } from './config';
import type {
  AchievementMetric,
  AchievementTier,
  Celebration,
  MatchRecordInput,
  ProgressData,
  RankPosition,
  RewardPacket,
  SettlementResult,
} from './types';

export function emptyProgressData(userId: string | null, now: Date = new Date()): ProgressData {
  const season = seasonAt(now);
  const stats = emptyStats();
  return {
    userId,
    xp: 0,
    seasonPassXp: 0,
    rank: createRankState(season.id, PLACEMENT_MATCHES),
    stats,
    missions: createMissionState(userId ?? 'guest', now),
    achievements: createAchievementState(),
    pinned: [],
    titles: [],
    activeTitle: null,
    streak: { days: 0, lastLoginDay: '', cycleClaimed: false, pendingRestore: null },
    practice: { dayKey: istDayKey(now), xpEarned: 0 },
    dna: computeDna(stats, now),
    settledMatchIds: [],
    celebrations: [],
    notices: [],
    lastLoginAt: null,
  };
}

function celebrationsFor(
  kind: Celebration['kind'],
  title: string,
  subtitle: string,
  details: string[],
  now: Date,
): Celebration {
  return {
    id: `${kind}-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    title,
    subtitle,
    details,
    at: now.toISOString(),
  };
}

/**
 * The single match-end pipeline. Pure: given the previous snapshot and the
 * verified match facts it returns the next snapshot plus one reward packet.
 * The caller guarantees the match id has not been settled before.
 */
export function applyMatch(
  previous: ProgressData,
  record: MatchRecordInput,
  now: Date = new Date(),
): SettlementResult | null {
  if (previous.settledMatchIds.includes(record.matchId)) return null;

  /* 1. Season + mission periods --------------------------------------------- */
  const season = refreshSeason(previous.rank, now);
  const seasonRolled = season.rolled;
  let rank = season.rank;

  const rolledMissions = ensureMissionPeriods(previous.userId ?? 'guest', previous.missions, now);
  let missions = rolledMissions.state;

  const weekKey = istWeekKey(now);
  if (rank.weeklyKey !== weekKey) {
    rank = { ...rank, weeklyKey: weekKey, weeklyRp: 0 };
  }

  /* 2. Match analysis -------------------------------------------------------- */
  const analysis = analyzeMatch({
    actions: record.actions,
    trades: record.trades,
    equity: record.equity,
    durationSeconds: record.durationSeconds,
    ticksTotal: record.ticksTotal,
    currentPrice: record.currentPrice,
    openPosition: record.openPosition,
    result: record.outcome,
  });

  const ranked = record.mode === 'ranked';
  const rankedWin = ranked && record.outcome === 'win';
  const photoFinish = isPhotoFinish(record.pipMargin, record.outcome);
  const discipline = analysis.discipline.score;

  /* 3. XP ------------------------------------------------------------------- */
  const levelBefore = levelFromXp(previous.xp).level;
  let practice = previous.practice;
  if (practice.dayKey !== istDayKey(now)) practice = { dayKey: istDayKey(now), xpEarned: 0 };

  let xpGain = baseMatchXp(record.mode, record.outcome);
  let xpCapReached = false;
  if (record.mode === 'practice') {
    if (practice.xpEarned >= PRACTICE_XP_PER_DAY) {
      xpGain = 0;
      xpCapReached = true;
    } else {
      practice = { ...practice, xpEarned: practice.xpEarned + 1 };
    }
  }
  if (xpGain > 0 && discipline >= DISCIPLINE_BONUS_THRESHOLD) xpGain += DISCIPLINE_XP_BONUS;

  const totalXp = Math.max(0, previous.xp + xpGain);
  const levelAfter = levelFromXp(totalXp).level;

  /* 4. Coins ---------------------------------------------------------------- */
  let coins = 0;
  if (record.mode === 'ranked') {
    coins = record.outcome === 'win' ? 20 : record.outcome === 'loss' ? 8 : 12;
  } else if (record.mode === 'friendly') {
    coins = 5;
  }

  /* 5. Rank ----------------------------------------------------------------- */
  const rankBefore: RankPosition = rankPosition(rank.rp);
  let promoted = false;
  let demoted = false;
  let shielded = false;
  let placementDone = false;
  let rpGain = 0;
  const celebrations: Celebration[] = [];

  if (ranked) {
    const inPlacement = rank.placementPlayed < rank.placementTarget;

    if (inPlacement) {
      const placementPlayed = rank.placementPlayed + 1;
      const placementWins = rank.placementWins + (record.outcome === 'win' ? 1 : 0);
      rank = {
        ...rank,
        placementPlayed,
        placementWins,
        lastRankedAt: now.toISOString(),
      };

      if (placementPlayed >= rank.placementTarget) {
        rpGain = placementRp(placementWins, placementPlayed);
        rank = {
          ...rank,
          rp: rpGain,
          peakRp: Math.max(rank.peakRp, rpGain),
          highestTier: higherTier(rank.highestTier, tierForRp(rpGain)),
          shieldMatches: 0,
          weeklyRp: rank.weeklyRp + rpGain,
          history: [
            {
              at: now.toISOString(),
              rp: rpGain,
              delta: rpGain,
              outcome: record.outcome,
              matchId: record.matchId,
              opponentKey: record.opponentKey,
            },
            ...rank.history,
          ].slice(0, 12),
        };
        placementDone = true;
        celebrations.push(
          celebrationsFor(
            'rank',
            'Placement Complete',
            `${rankPosition(rpGain).tierLabel} · ${rpGain} RP`,
            ['Your ladder climb starts here.'],
            now,
          ),
        );
      }
    } else {
      let delta = rpDelta(record.outcome, record.pipMargin, rank.rp, record.opponentRp);

      // Anti-boosting: repeated pairs pay 100 / 50 / 25 / 0% inside 24h.
      if (delta > 0 && record.opponentKey) {
        const since = now.getTime() - 24 * 60 * 60 * 1000;
        const prior = rank.history.filter(
          (entry) =>
            entry.opponentKey === record.opponentKey && new Date(entry.at).getTime() >= since,
        ).length;
        delta = Math.round(delta * payoutMultiplier(prior));
      }

      const rpBefore = rank.rp;
      const moved = moveRp(rank, rank.rp + delta, now);
      rank = moved.state;
      promoted = moved.promoted;
      demoted = moved.demoted;
      shielded = moved.shielded;

      const actualDelta = rank.rp - rpBefore;
      rpGain = actualDelta;
      rank = {
        ...rank,
        weeklyRp: rank.weeklyRp + actualDelta,
        history: [
          {
            at: now.toISOString(),
            rp: rank.rp,
            delta: actualDelta,
            outcome: record.outcome,
            matchId: record.matchId,
            opponentKey: record.opponentKey,
          },
          ...rank.history,
        ].slice(0, 12),
      };

      if (promoted) {
        celebrations.push(
          celebrationsFor(
            'rank',
            'Rank Promotion',
            rankPosition(rank.rp).tierLabel,
            ['Promotion shield active for the next 3 matches.'],
            now,
          ),
        );
      } else if (shielded) {
        celebrations.push(
          celebrationsFor(
            'rank',
            'Shield Protected',
            'No demotion this match',
            ['Your promotion shield absorbed the drop.'],
            now,
          ),
        );
      } else if (demoted) {
        celebrations.push(
          celebrationsFor('rank', 'Rank Demotion', rankPosition(rank.rp).tierLabel, [], now),
        );
      }
    }
  }

  const rankAfter = rankPosition(rank.rp);

  /* 6. Stats ---------------------------------------------------------------- */
  const stats = applyMatchToStats(previous.stats, {
    mode: record.mode,
    pair: record.pair,
    outcome: record.outcome,
    pips: analysis.pips,
    discipline,
    opponentKey: record.opponentKey,
    photoFinish,
    analysis,
    createdAt: record.createdAt,
  });

  /* 7. Missions ------------------------------------------------------------- */
  const metrics = missionMetricsFromMatch({
    rankedWin,
    pair: record.pair,
    trades: analysis.trades.length,
    slAlways: analysis.achievements.sl_always === 1,
    discipline,
    durationSeconds: record.durationSeconds,
  });
  const advancedMissions = advanceMissions(missions, metrics);
  missions = advancedMissions.missions;

  for (const missionId of advancedMissions.completedIds) {
    const def = missionDef(missionId);
    if (!def) continue;
    celebrations.push(
      celebrationsFor(
        'mission',
        'Mission Complete',
        def.title,
        ['Claim the reward in the Missions tab.'],
        now,
      ),
    );
  }

  /* 8. Achievements --------------------------------------------------------- */
  const contributions: Partial<Record<AchievementMetric, number>> = {
    ...analysis.achievements,
    gold_master: record.outcome === 'win' && record.pair === 'XAU/USD' ? 1 : 0,
    perfect_pip: photoFinish ? 1 : 0,
  };
  const nemesisBest = Math.max(0, ...Object.values(stats.nemesisWins));
  const absolute: Partial<Record<AchievementMetric, number>> = {
    hot_streak: stats.rankedStreak,
    nemesis: nemesisBest,
  };
  const achievementStep = advanceAchievements(previous.achievements, contributions, absolute);

  let achievements = achievementStep.state;
  const titles = [...previous.titles];
  let activeTitle = previous.activeTitle;
  let achievementCoins = 0;

  for (const unlock of achievementStep.unlocked) {
    const current = achievements[unlock.id] ?? { progress: 0, claimed: {} };
    achievements = {
      ...achievements,
      [unlock.id]: {
        ...current,
        claimed: { ...current.claimed, [unlock.tier as AchievementTier]: true },
      },
    };
    achievementCoins += unlock.coins;
    if (unlock.title && !titles.includes(unlock.title)) {
      titles.push(unlock.title);
      if (!activeTitle) activeTitle = unlock.title;
    }
    celebrations.push(
      celebrationsFor(
        'achievement',
        `${unlock.name} · ${unlock.tier.toUpperCase()}`,
        `+${unlock.coins} coins`,
        unlock.title ? [`Title unlocked: ${unlock.title}`] : [],
        now,
      ),
    );
  }

  coins += achievementCoins;

  /* 9. Season pass, DNA, settled ids --------------------------------------- */
  const dna = computeDna(stats, now);
  const settledMatchIds = [record.matchId, ...previous.settledMatchIds].slice(0, MAX_SETTLED_IDS);

  if (levelAfter > levelBefore) {
    const details: string[] = [];
    for (let level = levelBefore + 1; level <= levelAfter; level += 1) {
      details.push(...unlocksAt(level));
    }
    celebrations.unshift(
      celebrationsFor(
        'level',
        `Level ${levelAfter}`,
        `+${xpGain} XP`,
        details.length > 0 ? details : ['XP is climbing. Keep the streak alive.'],
        now,
      ),
    );
  }

  if (seasonRolled) {
    celebrations.unshift(
      celebrationsFor(
        'season',
        `Season ${season.season.number} Started`,
        `${rankPosition(rank.rp).tierLabel} after soft reset`,
        [`${rank.placementTarget} placement matches to re-enter the ladder.`],
        now,
      ),
    );
  }

  const notices = [...previous.notices];
  if (!xpCapReached && (record.mode !== 'practice' || xpGain > 0)) {
    notices.unshift({
      id: `${record.matchId}-reward`,
      message: `${labelFor(record)} · +${xpGain} XP${rpGain ? ` · ${rpGain > 0 ? '+' : ''}${rpGain} RP` : ''}${
        coins ? ` · +${coins} coins` : ''
      }`,
      tone: record.outcome === 'win' ? 'good' : record.outcome === 'loss' ? 'bad' : 'info',
      at: now.toISOString(),
    });
  }

  const data: ProgressData = {
    ...previous,
    xp: totalXp,
    seasonPassXp: previous.seasonPassXp + xpGain,
    rank,
    stats,
    missions,
    achievements,
    titles,
    activeTitle,
    practice,
    dna,
    settledMatchIds,
    celebrations: [...celebrations, ...previous.celebrations].slice(0, 12),
    notices: notices.slice(0, 12),
  };

  const missionIds = advancedMissions.completedIds;

  const packet: RewardPacket = {
    matchId: record.matchId,
    xp: xpGain,
    rp: rpGain,
    coins,
    discipline,
    result: record.outcome,
    levelBefore,
    levelAfter,
    rankBefore,
    rankAfter,
    placementDone,
    promoted,
    demoted,
    shielded,
    missionIds,
    achievementIds: achievementStep.unlocked.map((unlock) => unlock.id),
    xpCapReached,
  };

  return { data, packet, analysis };
}

export function recordToSettlement(
  data: ProgressData,
  record: MatchRecordInput,
  now: Date = new Date(),
): SettlementResult | null {
  return applyMatch(data, record, now);
}

function labelFor(record: MatchRecordInput): string {
  if (record.mode === 'practice') return 'Practice duel';
  if (record.mode === 'friendly') return record.outcome === 'win' ? 'Friendly win' : 'Friendly duel';
  if (record.outcome === 'win') return 'Ranked win';
  if (record.outcome === 'loss') return 'Ranked loss';
  return 'Ranked draw';
}

import { z } from 'zod';
import { ALLOWED_SIZES, MAX_ACTIONS, TICKS } from './constants';

/** A single player action during a match */
export const ActionSchema = z.object({
  t: z.number().int().min(0).max(TICKS - 2),
  type: z.enum(['buy', 'sell', 'close']),
  size: z.number().int().refine((s) => (ALLOWED_SIZES as readonly number[]).includes(s), {
    message: `Size must be one of ${ALLOWED_SIZES.join(', ')}`,
  }),
  slPct: z.number().min(0).max(10).optional(),
  tpPct: z.number().min(0).max(10).optional(),
});

export type Action = z.infer<typeof ActionSchema>;

export const ActionsArraySchema = z
  .array(ActionSchema)
  .max(MAX_ACTIONS, `Cannot exceed ${MAX_ACTIONS} actions per match`);

/** Open position state during simulation */
export interface Position {
  direction: 'long' | 'short';
  entryPrice: number;
  size: number;
  entryTick: number;
  slPct?: number;
  tpPct?: number;
}

/** A completed trade */
export interface Trade {
  direction: 'long' | 'short';
  entryPrice: number;
  exitPrice: number;
  size: number;
  entryTick: number;
  exitTick: number;
  pnl: number;
  reason: 'close' | 'sl' | 'tp' | 'forced' | 'reverse';
}

/** Result of a simulation run */
export interface SimulationResult {
  pnl: number;
  maxDrawdown: number;
  trades: Trade[];
  equity: number[];
  openPosition: Position | null;
}

/** Candle for charting */
export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

/** Game mode */
export type GameMode = 'standard' | 'risk';

/** Match score result */
export interface ScoreResult {
  score: number;
  pnl: number;
  maxDrawdown: number;
  tradeCount: number;
}

/** Market segment from the database or fixtures */
export interface MarketSegment {
  id: string;
  title: string;
  asset: string;
  tags: string[];
  difficulty: 'easy' | 'medium' | 'hard';
  ticks: number[];
  source: string;
  licenseNote: string;
  enabled: boolean;
}

/** Room message types for Supabase Realtime */
export const HelloMessageSchema = z.object({
  type: z.literal('hello'),
  name: z.string(),
  rating: z.number(),
});

export const StartMessageSchema = z.object({
  type: z.literal('start'),
  seed: z.number(),
  mode: z.enum(['standard', 'risk']),
  startAt: z.number(),
});

export const ActMessageSchema = z.object({
  type: z.literal('act'),
  action: ActionSchema,
});

export const FinalMessageSchema = z.object({
  type: z.literal('final'),
  actions: ActionsArraySchema,
});

export const PingMessageSchema = z.object({
  type: z.literal('ping'),
  t: z.number(),
});

export const PongMessageSchema = z.object({
  type: z.literal('pong'),
  t: z.number(),
  serverT: z.number(),
});

export const LeaveMessageSchema = z.object({
  type: z.literal('leave'),
});

export const RoomMessageSchema = z.discriminatedUnion('type', [
  HelloMessageSchema,
  StartMessageSchema,
  ActMessageSchema,
  FinalMessageSchema,
  PingMessageSchema,
  PongMessageSchema,
  LeaveMessageSchema,
]);

export type RoomMessage = z.infer<typeof RoomMessageSchema>;

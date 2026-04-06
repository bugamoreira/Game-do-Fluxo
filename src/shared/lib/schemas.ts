// ============================================================
// Zod Schemas — validação runtime para dados Supabase
// Previne dados corrompidos no JSONB metrics
// ============================================================

import { z } from 'zod';

// ── Metrics schema (JSONB no game_state) ─────────────────────
export const MetricsSchema = z.object({
  dis: z.number().default(0),
  det: z.number().default(0),
  dth: z.number().default(0),
  cxC: z.number().default(0),
  lw: z.number().default(0),
  off: z.number().default(0),
  soc: z.number().default(0),
  bH: z.number().default(0),
  deOcc: z.number().default(0),
  enfOcc: z.number().default(0),
  utiOcc: z.number().default(0),
  rpaOcc: z.number().default(0),
  boarding: z.number().default(0),
  avgB: z.number().default(0),
  corredor: z.number().default(0),
  altaHosp: z.number().default(0),
  libDE: z.number().default(0),
});

export type ValidatedMetrics = z.infer<typeof MetricsSchema>;

// ── Game state upsert payload ────────────────────────────────
export const GameStateUpsertSchema = z.object({
  team_id: z.string().uuid(),
  room_id: z.string().uuid(),
  round: z.union([z.literal(1), z.literal(2)]),
  sim_minute: z.number().int().min(0).max(1440),
  score: z.number().int().min(0).max(5000),
  metrics: MetricsSchema,
  updated_at: z.string(),
});

export type ValidatedGameStateUpsert = z.infer<typeof GameStateUpsertSchema>;

// ── Game log insert payload ──────────────────────────────────
export const GameLogInsertSchema = z.object({
  team_id: z.string().uuid(),
  room_id: z.string().uuid(),
  round: z.union([z.literal(1), z.literal(2)]),
  events: z.array(z.unknown()).max(50),
  final_score: z.number().int().min(0).max(5000),
  final_stats: z.record(z.string(), z.unknown()),
});

export type ValidatedGameLogInsert = z.infer<typeof GameLogInsertSchema>;

// ── Team insert payload ──────────────────────────────────────
export const TeamInsertSchema = z.object({
  room_id: z.string().uuid(),
  name: z.string().min(2).max(30),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

export type ValidatedTeamInsert = z.infer<typeof TeamInsertSchema>;

// ── Safe parse helper (logs error, returns null if invalid) ──
export function safeParse<T>(schema: z.ZodType<T>, data: unknown, label: string): T | null {
  const result = schema.safeParse(data);
  if (!result.success) {
    console.error(`[Zod] ${label} validation failed:`, result.error.flatten());
    return null;
  }
  return result.data;
}

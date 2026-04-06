// ============================================================
// Supabase table types — match banco de dados
// ============================================================

import type { RoomStatus, Round } from './game';

export interface DbRoom {
  id: string;
  code: string;
  status: RoomStatus;
  round: number;
  allow_late_join: boolean;
  music_muted: boolean;
  full_cap_approved: boolean;
  created_at: string;
}

export interface DbTeam {
  id: string;
  room_id: string;
  name: string;
  color: string | null;
  created_at: string;
}

export interface DbGameState {
  id: string;
  team_id: string;
  room_id: string;
  round: Round;
  sim_minute: number;
  score: number;
  metrics: DbMetrics;
  updated_at: string;
}

export interface DbMetrics {
  dis?: number;
  det?: number;
  dth?: number;
  cxC?: number;
  lw?: number;
  off?: number;
  soc?: number;
  bH?: number;
  deOcc?: number;
  enfOcc?: number;
  utiOcc?: number;
  rpaOcc?: number;
  boarding?: number;
  avgB?: number;
  corredor?: number;
  altaHosp?: number;
  libDE?: number;
}

export interface DbGameLog {
  id: string;
  team_id: string;
  room_id: string;
  round: Round;
  events: unknown[];
  final_score: number;
  final_stats: Record<string, unknown>;
  created_at: string;
}

// Upsert payload (what we send to Supabase)
export interface GameStateUpsert {
  team_id: string;
  room_id: string;
  round: Round;
  sim_minute: number;
  score: number;
  metrics: DbMetrics;
  updated_at: string;
}

// ============================================================
// useGameSync — Supabase game_state upsert with reconnection
// Replaces raw setInterval + alert() pattern
// ============================================================

import { useEffect, useRef } from 'react';
import { sb } from '../lib/supabase';
import { calcScore } from '../lib/game-engine';
import { GameStateUpsertSchema, safeParse } from '../lib/schemas';
import type { Patient, Stats, Round } from '../types/game';

interface SyncConfig {
  teamId: string | null;
  roomId: string | null;
  /** Ref to current patients */
  ptsRef: React.RefObject<Patient[]>;
  /** Ref to current stats */
  stRef: React.RefObject<Stats>;
  /** Ref to current sim minute */
  smRef: React.RefObject<number>;
  /** Ref to current round */
  rndRef: React.RefObject<Round>;
  /** Called when connection status changes */
  onStatusChange: (status: 'online' | 'reconnecting' | 'offline') => void;
  /** Called on unrecoverable FK error (team deleted) */
  onSessionExpired: () => void;
}

export function useGameSync({
  teamId,
  roomId,
  ptsRef,
  stRef,
  smRef,
  rndRef,
  onStatusChange,
  onSessionExpired,
}: SyncConfig) {
  const failCountRef = useRef(0);
  const backoffRef = useRef(1000); // Start at 1s

  useEffect(() => {
    if (!teamId || !roomId) return;

    failCountRef.current = 0;
    backoffRef.current = 1000;
    let currentInterval = 1000;
    let ivId: ReturnType<typeof setTimeout>;

    const doSync = async () => {
      const P = ptsRef.current ?? [];
      const S = stRef.current ?? {} as Stats;
      const m = smRef.current ?? 0;
      const r = rndRef.current ?? 1;

      const brd = P.filter(p => p.sector === 'de' && p.ready && (p.dest === 'enf' || p.dest === 'uti') && !p.dead);
      const avgBrd = brd.length > 0 ? Math.round(brd.reduce((a, p) => a + p.bMin, 0) / brd.length) : 0;

      const payload = {
        team_id: teamId,
        room_id: roomId,
        round: r,
        sim_minute: m,
        score: calcScore({ ...S, isR2: r === 2 }),
        metrics: {
          dis: S.disc ?? 0,
          det: S.dets ?? 0,
          dth: S.deaths ?? 0,
          cxC: S.cxCan ?? 0,
          lw: S.lwbs ?? 0,
          off: S.offS ?? 0,
          soc: S.socB ?? 0,
          bH: S.boardHrs ?? 0,
          deOcc: P.filter(p => p.sector === 'de').length,
          enfOcc: P.filter(p => p.sector === 'enf').length,
          utiOcc: P.filter(p => p.sector === 'uti').length,
          rpaOcc: P.filter(p => p.sector === 'rpa').length,
          boarding: brd.length,
          avgB: avgBrd,
          corredor: P.filter(p => p.sector === 'corredor').length,
          altaHosp: S.altaHosp ?? 0,
          libDE: S.libDE ?? 0,
        },
        updated_at: new Date().toISOString(),
      };

      // Validate with Zod before sending
      const validated = safeParse(GameStateUpsertSchema, payload, 'game_state upsert');
      if (!validated) {
        // Data corrupted locally — log but don't crash
        console.warn('[GameSync] Payload failed validation, skipping upsert');
        scheduleNext(currentInterval);
        return;
      }

      const { error } = await sb.from('game_state').upsert(
        validated,
        { onConflict: 'team_id,round' },
      );

      if (error) {
        failCountRef.current++;
        console.error('[GameSync] Error:', error.message, { failCount: failCountRef.current });

        // FK violation = team deleted by facilitator
        if (error.code === '23503') {
          onSessionExpired();
          return;
        }

        // Exponential backoff: 1s → 2s → 4s → 8s → max 15s
        if (failCountRef.current >= 3) {
          onStatusChange('reconnecting');
        }
        backoffRef.current = Math.min(backoffRef.current * 2, 15000);
        scheduleNext(backoffRef.current);
      } else {
        // Success — reset backoff
        if (failCountRef.current > 0) {
          onStatusChange('online');
        }
        failCountRef.current = 0;
        backoffRef.current = 1000;
        scheduleNext(1000);
      }
    };

    const scheduleNext = (ms: number) => {
      currentInterval = ms;
      ivId = setTimeout(doSync, ms);
    };

    // Start immediately
    doSync();

    return () => clearTimeout(ivId);
  }, [teamId, roomId]);
}

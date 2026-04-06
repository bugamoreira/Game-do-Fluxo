// ============================================================
// useSupabaseRoom — shared Realtime + polling for instructor/projector
// Subscribes to room, teams, game_state changes
// ============================================================

import { useEffect, useRef } from 'react';
import { sb } from '../lib/supabase';
import type { DbRoom, DbTeam, DbGameState } from '../types/supabase';

interface GameStatesMap {
  [teamId: string]: {
    round1?: DbGameState;
    round2?: DbGameState;
  };
}

// Setter type compatible with React useState dispatch
type Setter<T> = (valOrFn: T | ((prev: T) => T)) => void;

interface UseSupabaseRoomConfig {
  roomId: string | null;
  onTeamsUpdate: Setter<DbTeam[]>;
  onGameStatesUpdate: Setter<GameStatesMap>;
  onRoomUpdate?: (room: DbRoom) => void;
  onSimMinUpdate?: (min: number) => void;
}

export function useSupabaseRoom({
  roomId,
  onTeamsUpdate,
  onGameStatesUpdate,
  onRoomUpdate,
  onSimMinUpdate,
}: UseSupabaseRoomConfig) {
  const subRef = useRef<{
    teamSub: ReturnType<typeof sb.channel> | null;
    gsSub: ReturnType<typeof sb.channel> | null;
    roomSub: ReturnType<typeof sb.channel> | null;
    pollIv: ReturnType<typeof setInterval> | null;
  }>({ teamSub: null, gsSub: null, roomSub: null, pollIv: null });

  useEffect(() => {
    if (!roomId) return;

    // Cleanup previous subscriptions
    const prev = subRef.current;
    if (prev.teamSub) sb.removeChannel(prev.teamSub);
    if (prev.gsSub) sb.removeChannel(prev.gsSub);
    if (prev.roomSub) sb.removeChannel(prev.roomSub);
    if (prev.pollIv) clearInterval(prev.pollIv);

    const rid = roomId;

    // Initial fetch
    const fetchInitial = async () => {
      const { data: teams } = await sb.from('teams').select('*').eq('room_id', rid);
      if (teams) onTeamsUpdate(teams);

      const { data: gs } = await sb.from('game_state').select('*').eq('room_id', rid);
      if (gs?.length) {
        const map: GameStatesMap = {};
        gs.forEach((g: DbGameState) => {
          if (!map[g.team_id]) map[g.team_id] = {};
          map[g.team_id]![`round${g.round}` as 'round1' | 'round2'] = g;
        });
        onGameStatesUpdate(map);
        const latest = gs.reduce((a: DbGameState | null, g: DbGameState) =>
          g.sim_minute > (a?.sim_minute ?? 0) ? g : a, null);
        if (latest?.sim_minute && onSimMinUpdate) onSimMinUpdate(latest.sim_minute);
      }
    };

    fetchInitial();

    // Realtime: teams INSERT
    const teamSub = sb.channel(`teams-${rid}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'teams',
        filter: `room_id=eq.${rid}`,
      } as any, (p: any) => {
        onTeamsUpdate((prev: DbTeam[]) => {
          // Deduplicate
          if (Array.isArray(prev) && prev.find((t: DbTeam) => t.id === p.new.id)) return prev;
          return [...(Array.isArray(prev) ? prev : []), p.new];
        });
      })
      .subscribe();

    // Realtime: game_state ALL events
    const gsSub = sb.channel(`gs-${rid}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'game_state',
        filter: `room_id=eq.${rid}`,
      } as any, (p: any) => {
        const gs2 = p.new as DbGameState;
        onGameStatesUpdate((prev: GameStatesMap) => ({
          ...prev,
          [gs2.team_id]: {
            ...(prev[gs2.team_id] || {}),
            [`round${gs2.round}`]: gs2,
          },
        }));
        if (gs2.sim_minute && onSimMinUpdate) onSimMinUpdate(gs2.sim_minute);
      })
      .subscribe();

    // Realtime: room UPDATE (optional)
    let roomSub: ReturnType<typeof sb.channel> | null = null;
    if (onRoomUpdate) {
      roomSub = sb.channel(`room-${rid}`)
        .on('postgres_changes', {
          event: 'UPDATE', schema: 'public', table: 'rooms',
          filter: `id=eq.${rid}`,
        } as any, (p: any) => {
          onRoomUpdate(p.new as DbRoom);
        })
        .subscribe();
    }

    // Polling safety net every 1.5s
    const pollIv = setInterval(async () => {
      const { data: tData } = await sb.from('teams').select('*').eq('room_id', rid);
      if (tData) onTeamsUpdate(tData);

      const { data: gsData } = await sb.from('game_state').select('*').eq('room_id', rid);
      if (gsData?.length) {
        const map: GameStatesMap = {};
        gsData.forEach((gs: DbGameState) => {
          if (!map[gs.team_id]) map[gs.team_id] = {};
          map[gs.team_id]![`round${gs.round}` as 'round1' | 'round2'] = gs;
        });
        onGameStatesUpdate(map);
        const latest = gsData.reduce((a: DbGameState | null, g: DbGameState) =>
          g.sim_minute > (a?.sim_minute ?? 0) ? g : a, null);
        if (latest?.sim_minute && onSimMinUpdate) onSimMinUpdate(latest.sim_minute);
      }

      if (onRoomUpdate) {
        const { data: r2 } = await sb.from('rooms').select('*').eq('id', rid).single();
        if (r2) onRoomUpdate(r2 as DbRoom);
      }
    }, 1500);

    subRef.current = { teamSub, gsSub, roomSub, pollIv };

    return () => {
      if (subRef.current.teamSub) sb.removeChannel(subRef.current.teamSub);
      if (subRef.current.gsSub) sb.removeChannel(subRef.current.gsSub);
      if (subRef.current.roomSub) sb.removeChannel(subRef.current.roomSub);
      if (subRef.current.pollIv) clearInterval(subRef.current.pollIv);
    };
  }, [roomId]);
}

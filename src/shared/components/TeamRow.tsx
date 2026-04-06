import type { DbGameState, DbTeam } from '../types/supabase';
import { getScoreColor } from '../lib/format';
import { ScoreBar } from './ScoreBar';

interface TeamRowProps {
  team: DbTeam;
  gs: DbGameState | undefined;
  rank: number;
}

export function TeamRow({ team, gs, rank }: TeamRowProps) {
  const score = gs?.score ?? 1000;
  const metrics = gs?.metrics ?? {};
  const scoreC = getScoreColor(score);

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '14px 20px', borderRadius: 12, marginBottom: 8,
        background: rank === 1 ? 'rgba(234,179,8,.07)' : 'rgba(255,255,255,.02)',
        border: `1px solid ${rank === 1 ? '#eab30833' : '#1e293b'}`,
        animation: 'slideIn .4s',
        transition: 'all .4s',
      }}
    >
      <div style={{
        width: 28, textAlign: 'center', fontSize: 18, fontWeight: 900, flexShrink: 0,
        color: rank === 1 ? '#eab308' : rank === 2 ? '#94a3b8' : rank === 3 ? '#b45309' : '#475569',
      }}>
        {rank}
      </div>
      <div style={{ width: 10, height: 10, borderRadius: '50%', background: team.color || '#64748b', flexShrink: 0 }} />
      <div style={{ flex: 1, fontWeight: 700, fontSize: 14, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {team.name}
      </div>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexShrink: 0 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 9, color: '#64748b' }}>Boarding</div>
          <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'monospace', color: (metrics.boarding ?? 0) > 3 ? '#ef4444' : (metrics.boarding ?? 0) > 0 ? '#eab308' : '#64748b' }}>
            {metrics.boarding ?? '—'}
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 9, color: '#64748b' }}>Obitos</div>
          <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'monospace', color: (metrics.dth ?? 0) > 0 ? '#ef4444' : '#64748b' }}>
            {metrics.dth ?? '—'}
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 9, color: '#64748b' }}>Altas</div>
          <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'monospace', color: '#22c55e' }}>
            {metrics.dis ?? '—'}
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 9, color: '#64748b' }}>Hosp%</div>
          <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'monospace', color: (metrics.deOcc ?? 0) >= 15 ? '#ef4444' : (metrics.deOcc ?? 0) >= 12 ? '#eab308' : '#64748b' }}>
            {metrics.deOcc != null ? `${Math.round(metrics.deOcc / 15 * 100)}%` : '—'}
          </div>
        </div>
      </div>
      <div style={{ minWidth: 90, textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: 22, fontWeight: 900, fontFamily: 'monospace', color: scoreC }}>{score}</div>
        <ScoreBar score={score} />
      </div>
    </div>
  );
}

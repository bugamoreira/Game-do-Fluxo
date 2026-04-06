import type { DbTeam, DbGameState } from '../types/supabase';
import { getScoreColor } from '../lib/format';

interface GameStatesMap {
  [teamId: string]: {
    round1?: DbGameState;
    round2?: DbGameState;
  };
}

interface PodiumProps {
  teams: DbTeam[];
  gameStates: GameStatesMap;
}

interface RankedEntry {
  team: DbTeam;
  r1: number | null;
  r2: number | null;
  best: number;
  delta: number;
}

export function Podium({ teams, gameStates }: PodiumProps) {
  const ranked: RankedEntry[] = [...teams]
    .map(t => ({
      team: t,
      r1: gameStates[t.id]?.round1?.score ?? null,
      r2: gameStates[t.id]?.round2?.score ?? null,
      best: gameStates[t.id]?.round2?.score ?? gameStates[t.id]?.round1?.score ?? 0,
      delta: (gameStates[t.id]?.round2?.score ?? 0) - (gameStates[t.id]?.round1?.score ?? 0),
    }))
    .sort((a, b) => b.best - a.best);

  const top3 = ranked.slice(0, 3);
  const podiumOrder = top3.length >= 3 ? [top3[1], top3[0], top3[2]] : top3;
  const heights = [140, 180, 110];
  const medalColors = ['#94a3b8', '#eab308', '#b45309'];
  const medalLabels = ['2\u00B0', '1\u00B0', '3\u00B0'];
  const bgGrad = [
    'linear-gradient(180deg, #94a3b8 0%, #64748b 100%)',
    'linear-gradient(180deg, #eab308 0%, #ca8a04 100%)',
    'linear-gradient(180deg, #b45309 0%, #92400e 100%)',
  ];

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.95)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, animation: 'slideIn .5s' }}>
      <div style={{ textAlign: 'center', maxWidth: 700, width: '100%', padding: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', letterSpacing: '.14em', marginBottom: 6, textTransform: 'uppercase' }}>ED Leaders × FLAME 2026</div>
        <div style={{ fontSize: 36, fontWeight: 900, color: '#eab308', marginBottom: 8, animation: 'trophyPulse 2s infinite' }}>PODIO FINAL</div>
        <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 32 }}>Classificação com base no score do Plantão Lean (R2)</div>

        {/* Podium bars */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 12, marginBottom: 24 }}>
          {podiumOrder.map((entry, i) => {
            if (!entry) return null;
            return (
              <div key={entry.team.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 180 }}>
                <div style={{ width: 44, height: 44, borderRadius: '50%', background: medalColors[i], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 900, color: '#fff', marginBottom: 8, boxShadow: `0 0 16px ${medalColors[i]}44` }}>
                  {medalLabels[i]}
                </div>
                <div style={{ fontWeight: 800, fontSize: 16, color: '#e2e8f0', marginBottom: 4, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {entry.team.name}
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 8 }}>
                  R1: <span style={{ color: '#FF3B3B', fontWeight: 700 }}>{entry.r1 ?? '\u2014'}</span>
                  {' \u2192 '}
                  R2: <span style={{ color: '#00d4ff', fontWeight: 700 }}>{entry.r2 ?? '\u2014'}</span>
                  {entry.delta !== 0 && (
                    <span style={{ color: entry.delta > 0 ? '#22c55e' : '#ef4444', fontWeight: 800, marginLeft: 4 }}>
                      ({entry.delta > 0 ? '+' : ''}{entry.delta})
                    </span>
                  )}
                </div>
                <div style={{
                  width: '100%', height: heights[i], background: bgGrad[i],
                  borderRadius: '12px 12px 0 0',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 -4px 20px rgba(0,0,0,.4)',
                }}>
                  <div style={{ fontSize: 40, fontWeight: 900, fontFamily: 'monospace', color: '#fff', textShadow: '0 2px 10px rgba(0,0,0,.5)' }}>
                    {entry.best}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Full ranking table */}
        {ranked.length > 3 && (
          <div style={{ background: '#0f172a', borderRadius: 10, border: '1px solid #1e293b', overflow: 'hidden', marginBottom: 20, textAlign: 'left' }}>
            {ranked.slice(3).map((entry, i) => (
              <div key={entry.team.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderBottom: '1px solid #1e293b' }}>
                <span style={{ width: 24, fontSize: 14, fontWeight: 800, color: '#475569', textAlign: 'center' }}>{i + 4}</span>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: entry.team.color || '#64748b' }} />
                <span style={{ flex: 1, fontWeight: 700, fontSize: 13 }}>{entry.team.name}</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 700, color: getScoreColor(entry.best) }}>{entry.best}</span>
              </div>
            ))}
          </div>
        )}

        <div style={{ fontSize: 14, color: '#94a3b8', lineHeight: 1.7, padding: '16px 20px', background: 'rgba(34,197,94,.06)', borderRadius: 10, border: '1px solid rgba(34,197,94,.2)', marginBottom: 20 }}>
          "O problema nunca foi falta de leito. Era falta de <strong style={{ color: '#22c55e' }}>gestão do fluxo de saída</strong>."
        </div>
      </div>
    </div>
  );
}

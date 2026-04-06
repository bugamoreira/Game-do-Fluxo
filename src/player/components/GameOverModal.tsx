import type { Patient, Stats, Moves, Round } from '../../shared/types/game';

interface R1Results extends Stats {
  score: number;
}

interface GameOverModalProps {
  isR2: boolean;
  score: number;
  st: Stats;
  pts: Patient[];
  moves: Moves;
  r1Results: R1Results | null;
  onRestart: (round: Round) => void;
  onMenu: () => void;
}

export function GameOverModal({ isR2, score, st, pts, moves, r1Results, onRestart, onMenu }: GameOverModalProps) {
  const boarding = pts.filter(p => p.sector === 'de' && p.ready && (p.dest === 'enf' || p.dest === 'uti') && !p.dead);
  const corredor = pts.filter(p => p.sector === 'corredor');
  const maxB = pts.reduce((a, p) => Math.max(a, p.bMin), 0);
  const msg = isR2
    ? (st.deaths === 0 && st.cxCan === 0
      ? 'As ferramentas Lean transformaram o fluxo. Mesma demanda, resultado oposto. O problema nunca foi falta de leito — era falta de gestão.'
      : st.deaths === 0 ? 'As ferramentas reduziram o impacto, mas ainda houve gargalos. Compare com a Rodada 1.'
        : 'Mesmo com ferramentas, o sistema sofreu. Reflita sobre quais ferramentas poderiam ter sido melhor utilizadas.')
    : (st.deaths > 0
      ? 'O congelamento da saída causou óbitos evitáveis. O gargalo não está na porta de entrada — está na porta de saída.'
      : st.cxCan > 0 ? 'Cirurgias canceladas criaram efeito cascata: menos altas, mais boarding, mais congelamento.'
        : st.dets > 0 ? 'Pacientes deterioraram esperando leito. Boarding prolongado tem consequências clínicas reais.'
          : 'Bom gerenciamento! Na Rodada 2 (Plantão Lean), ferramentas Lean melhoram ainda mais.');

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div style={{ background: '#111827', border: '1px solid #1e293b', borderRadius: 16, padding: 32, maxWidth: 560, width: '92%', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,.6)' }}>
        <div style={{ fontSize: 11, fontWeight: 700, padding: '3px 12px', borderRadius: 4, display: 'inline-block', marginBottom: 8,
          background: isR2 ? 'rgba(0,212,255,.12)' : 'rgba(255,59,59,.12)', color: isR2 ? '#00d4ff' : '#FF3B3B' }}>
          {isR2 ? 'SIMULADOR DO PLANTÃO LEAN' : 'SIMULADOR DO PLANTÃO TRAVADO'}
        </div>
        <div style={{ fontSize: 20, fontWeight: 900, color: isR2 ? '#00d4ff' : '#FF3B3B', marginBottom: 8 }}>PLANTÃO ENCERRADO</div>
        <div style={{ fontSize: 48, fontWeight: 900, fontFamily: 'monospace', marginBottom: 16,
          color: score > 700 ? '#22c55e' : score > 400 ? '#eab308' : '#ef4444' }}>
          {score}<span style={{ fontSize: 16, color: '#64748b' }}>/1000</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16, textAlign: 'left' }}>
          {[
            { l: 'Altas', v: st.disc, c: '#22c55e' },
            { l: 'Board. máx', v: `${Math.floor(maxB / 60)}h${String(maxB % 60).padStart(2, '0')}`, c: '#eab308' },
            { l: 'Deteriorações', v: st.dets, c: st.dets > 0 ? '#f97316' : '#22c55e' },
            { l: 'Óbitos', v: st.deaths, c: st.deaths > 0 ? '#ef4444' : '#22c55e' },
            { l: 'Cx canceladas', v: st.cxCan, c: st.cxCan > 0 ? '#ef4444' : '#22c55e' },
            { l: 'LWBS', v: st.lwbs, c: st.lwbs > 0 ? '#ef4444' : '#22c55e' },
            { l: 'Off-service', v: st.offS, c: st.offS > 0 ? '#f97316' : '#22c55e' },
            { l: 'Em boarding', v: boarding.length, c: boarding.length > 0 ? '#ef4444' : '#22c55e' },
            { l: 'Corredor', v: corredor.length, c: corredor.length > 0 ? '#ef4444' : '#22c55e' },
          ].map(({ l, v, c }) => (
            <div key={l} style={{ background: 'rgba(255,255,255,.03)', padding: '6px 10px', borderRadius: 6 }}>
              <div style={{ fontSize: 11, color: '#64748b' }}>{l}</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: c, fontFamily: 'monospace' }}>{typeof v === 'number' ? v : v}</div>
            </div>
          ))}
        </div>
        <div style={{ borderRadius: 10, padding: 12, marginBottom: 16, border: `1px solid ${isR2 ? 'rgba(0,212,255,.15)' : 'rgba(255,59,59,.15)'}`,
          background: isR2 ? 'rgba(0,212,255,.05)' : 'rgba(255,59,59,.06)' }}>
          <p style={{ color: isR2 ? '#7dd3fc' : '#f87171', fontSize: 12, lineHeight: 1.6 }}>{msg}</p>
        </div>

        {isR2 && r1Results && (
          <div style={{ background: 'rgba(0,212,255,.05)', border: '1px solid rgba(0,212,255,.15)', borderRadius: 10, padding: 14, marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#00d4ff', marginBottom: 10, letterSpacing: '.08em' }}>COMPARATIVO: PLANTÃO TRAVADO vs PLANTÃO LEAN</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 60px', gap: 4, fontSize: 11 }}>
              <div style={{ color: '#64748b', fontWeight: 700 }}>Métrica</div>
              <div style={{ color: '#FF3B3B', fontWeight: 700, textAlign: 'right' }}>R1</div>
              <div style={{ color: '#00d4ff', fontWeight: 700, textAlign: 'right' }}>R2</div>
              <div style={{ color: '#22c55e', fontWeight: 700, textAlign: 'right' }}>Delta</div>
              {[
                { l: 'Score', r1: r1Results.score, r2: score, inv: false },
                { l: 'Óbitos', r1: r1Results.deaths, r2: st.deaths, inv: true },
                { l: 'Deteriorações', r1: r1Results.dets, r2: st.dets, inv: true },
                { l: 'Cx canceladas', r1: r1Results.cxCan, r2: st.cxCan, inv: true },
                { l: 'LWBS', r1: r1Results.lwbs, r2: st.lwbs, inv: true },
                { l: 'Altas', r1: r1Results.disc, r2: st.disc, inv: false },
              ].map(({ l, r1, r2, inv }) => {
                const d = r2 - r1;
                const good = inv ? d < 0 : d > 0;
                return [
                  <div key={l + 'l'} style={{ color: '#94a3b8' }}>{l}</div>,
                  <div key={l + 'r1'} style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: '#FF3B3B' }}>{r1}</div>,
                  <div key={l + 'r2'} style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: '#00d4ff' }}>{r2}</div>,
                  <div key={l + 'd'} style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 800, color: d === 0 ? '#64748b' : good ? '#22c55e' : '#ef4444' }}>
                    {d > 0 ? '+' : ''}{d !== 0 ? d : '\u2014'}
                  </div>,
                ];
              })}
            </div>
          </div>
        )}

        {moves && moves.total > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
            <div style={{ background: 'rgba(255,255,255,.03)', padding: '6px 10px', borderRadius: 6, textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: '#64748b' }}>Movimentos</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#00d4ff', fontFamily: 'monospace' }}>{moves.total}</div>
            </div>
            <div style={{ background: 'rgba(34,197,94,.05)', padding: '6px 10px', borderRadius: 6, textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: '#64748b' }}>Produtivos</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#22c55e', fontFamily: 'monospace' }}>{moves.produtivo}</div>
            </div>
            <div style={{ background: 'rgba(239,68,68,.05)', padding: '6px 10px', borderRadius: 6, textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: '#64748b' }}>Reativos</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#ef4444', fontFamily: 'monospace' }}>{moves.reativo}</div>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button onClick={() => onRestart(1)} className="btn" style={{ background: 'linear-gradient(135deg,#FF3B3B,#dc2626)', padding: '10px 22px', fontSize: 13, fontWeight: 800 }}>Plantão Travado</button>
          <button onClick={() => onRestart(2)} className="btn" style={{ background: 'linear-gradient(135deg,#00d4ff,#0891b2)', padding: '10px 22px', fontSize: 13, fontWeight: 800 }}>Plantão Lean</button>
          <button onClick={onMenu} className="btn" style={{ background: '#374151', padding: '10px 22px', fontSize: 13 }}>Menu</button>
        </div>
      </div>
    </div>
  );
}

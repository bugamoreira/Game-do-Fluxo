import type { Patient } from '../../shared/types/game';
import { SEV, BOARD_DET_MIN, BOARD_DEAD_MIN } from '../../shared/lib/constants';
import { PSvg } from '../../shared/components/PSvg';

interface ChipProps {
  p: Patient;
  sel: boolean;
  onClick: (p: Patient) => void;
}

export function Chip({ p, sel, onClick }: ChipProps) {
  const s = SEV[p.sev]!;
  const isR = p.ready || (p.dischReady && p.prep <= 0 && !p.social);
  const minsTodet = p.ready && (p.dest === 'enf' || p.dest === 'uti') && !p.det && !p.dead && p.bMin > 0
    ? Math.max(0, BOARD_DET_MIN - p.bMin) : null;

  return (
    <div className={`chip${sel ? ' selected' : ''}`}
      onClick={e => { e.stopPropagation(); onClick(p); }}
      title={`${p.name} (${s.l})${p.bMin > 0 ? ` | Board: ${Math.floor(p.bMin / 60)}h${String(p.bMin % 60).padStart(2, '0')}` : ''}`}
      style={{
        background: sel ? undefined : 'rgba(255,255,255,.02)',
        border: sel ? undefined : p.dead ? '1px solid #555' : p.det ? '1px solid #ef4444'
          : isR ? `1px solid ${s.c}` : '1px dashed #333',
      }}>
      <PSvg color={s.c} sz={16} dead={p.dead} det={p.det} />
      {p.dead && <span className="badge badge-tr" style={{ color: '#ef4444' }}>X</span>}
      {p.det && !p.dead && <span className="badge badge-tr" style={{ color: '#f97316', animation: 'pulse 1s infinite' }}>!</span>}
      {isR && !p.dead && !p.det && <span className="badge badge-tr" style={{ color: '#22c55e', animation: 'bounce 1.5s infinite', marginTop: 4 }}>OK</span>}
      {p.offSvc && <span className="badge badge-bl" style={{ color: '#f97316', fontSize: 7 }}>OFF</span>}
      {(p.social || p.blocked) && <span className="badge badge-br" style={{ color: '#eab308', fontSize: 7 }}>BL</span>}
      {p.obsProlong && <span className="badge badge-bl" style={{ color: '#a855f7', fontSize: 7 }}>OBS</span>}
      {p.labDelay && <span className="badge badge-bl" style={{ color: '#06b6d4', fontSize: 7 }}>LAB</span>}
      {p.bMin > 0 && !p.dead && (
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, borderRadius: '0 0 5px 5px',
          background: p.bMin >= BOARD_DEAD_MIN ? '#ef4444' : p.bMin >= BOARD_DET_MIN ? '#f97316' : '#eab308' }} />
      )}
      {minsTodet !== null && minsTodet < 60 && (
        <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
          fontSize: 7, fontWeight: 800, color: '#ef4444', whiteSpace: 'nowrap', animation: 'pulse 1s infinite' }}>
          {minsTodet}m!
        </div>
      )}
    </div>
  );
}

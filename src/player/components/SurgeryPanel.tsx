import type { Surgery } from '../../shared/types/game';
import { fmt } from '../../shared/lib/format';

interface SurgeryPanelProps {
  surgeries: Surgery[];
  sm: number;
}

export function SurgeryPanel({ surgeries, sm }: SurgeryPanelProps) {
  return (
    <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 10, padding: 8, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 5, letterSpacing: '.08em', flexShrink: 0 }}>CC — 4 SALAS | {surgeries.length} Cx</div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {surgeries.map(s => {
          const stM = s.stH * 60;
          const enM = stM + s.dur * 60;
          const inP = sm >= stM && sm < enM && s.st === 'scheduled';
          const done = sm >= enM && s.st !== 'cancelled';
          const cn = s.st === 'cancelled';
          const prog = inP ? Math.round((sm - stM) / (enM - stM) * 100) : 0;
          const col = cn ? '#ef4444' : inP ? '#eab308' : done ? '#22c55e' : '#94a3b8';
          return (
            <div key={s.id} style={{
              fontSize: 11, padding: '4px 6px', borderRadius: 5, marginBottom: 2,
              background: cn ? 'rgba(239,68,68,.06)' : inP ? 'rgba(234,179,8,.08)' : done ? 'rgba(34,197,94,.05)' : 'rgba(255,255,255,.02)',
              border: `1px solid ${col}22`, opacity: cn ? 0.5 : 1,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: col, fontWeight: 600 }}>{s.label}</span>
                <span style={{ fontSize: 11, color: '#64748b', fontFamily: 'monospace' }}>
                  {cn ? 'CANCEL' : inP ? `${prog}%` : done ? `>${s.dest === 'uti' ? 'UTI' : 'ENF'}` : fmt(s.stH * 60)}
                </span>
              </div>
              {inP && (
                <div style={{ height: 2, background: '#1e293b', borderRadius: 1, marginTop: 2 }}>
                  <div style={{ width: `${prog}%`, height: '100%', background: '#eab308', borderRadius: 1, transition: 'width 1s' }} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

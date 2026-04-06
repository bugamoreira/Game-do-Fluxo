import type { Patient } from '../../shared/types/game';
import { SEV } from '../../shared/lib/constants';
import { PSvg } from '../../shared/components/PSvg';

interface MiniChipProps {
  p: Patient;
  sel: Patient | null;
  onClick: (p: Patient) => void;
}

export function MiniChip({ p, sel, onClick }: MiniChipProps) {
  const s = SEV[p.sev]!;
  const ready = p.dischReady && p.prep <= 0 && !p.social && !p.blocked;
  const selected = sel?.id === p.id;

  return (
    <div
      onClick={e => { e.stopPropagation(); onClick(p); }}
      title={`${p.name} (${s.l})${ready ? ' — PRONTO ALTA' : ''}${p.blocked ? ' — BLOQUEADO' : ''}${p.social ? ' — SOCIAL' : ''}${p.det ? ' — DETERIOROU' : ''}`}
      style={{
        width: 26, height: 34, borderRadius: 5, cursor: 'pointer', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: selected ? 'rgba(0,212,255,.22)' : ready ? `${s.c}35`
          : p.det ? 'rgba(239,68,68,.25)' : p.blocked ? 'rgba(234,179,8,.12)' : p.social ? 'rgba(168,85,247,.12)'
          : `${s.c}12`,
        border: selected ? '2px solid #00d4ff' : ready ? `1px solid ${s.c}99`
          : p.blocked ? '1px solid #eab30888' : p.social ? '1px solid #a855f788'
          : p.det ? '1px solid #ef444499' : `1px solid ${s.c}33`,
        transition: 'all .15s', position: 'relative',
      }}>
      <PSvg color={s.c} sz={11} dead={p.dead} det={p.det} />
      {ready && <div style={{ position: 'absolute', top: 1, right: 1, width: 5, height: 5, borderRadius: '50%', background: s.c }} />}
      {p.det && <div style={{ position: 'absolute', top: 0, left: 1, fontSize: 7, color: '#ef4444', fontWeight: 900, lineHeight: 1 }}>!</div>}
      {p.social && <div style={{ position: 'absolute', bottom: 0, right: 1, fontSize: 5, color: '#a855f7', fontWeight: 900 }}>S</div>}
    </div>
  );
}

import type { Patient, Severity } from '../../types/game';
import { cx, duracaoCurta } from './cx';
import { Icone, type NomeIcone } from './Icone';

/** Manchester: cor + número de prioridade + nome. Nunca só a cor. */
export const GRAVIDADE: Record<Severity, { prioridade: number; cor: string; nome: string; categoria: string; texto: string }> = {
  red: { prioridade: 1, cor: 'bg-grav-vermelho', nome: 'Vermelho', categoria: 'emergência', texto: 'text-white' },
  orange: { prioridade: 2, cor: 'bg-grav-laranja', nome: 'Laranja', categoria: 'muito urgente', texto: 'text-marinho-profundo' },
  yellow: { prioridade: 3, cor: 'bg-grav-amarelo', nome: 'Amarelo', categoria: 'urgente', texto: 'text-marinho-profundo' },
  green: { prioridade: 4, cor: 'bg-grav-verde', nome: 'Verde', categoria: 'pouco urgente', texto: 'text-marinho-profundo' },
};

/** Limiares de boarding (iguais aos do motor: 3 h deteriora, 6 h óbito evitável). */
const BOARDING_DETERIORA = 180;
const BOARDING_OBITO = 360;

interface EstadoPaciente {
  icone: NomeIcone;
  texto: string;
}

/** Estado mais importante primeiro; o chip mostra só um ícone, o rótulo acessível lista todos. */
function estadosDoPaciente(p: Patient): EstadoPaciente[] {
  const lista: EstadoPaciente[] = [];
  if (p.dead) lista.push({ icone: 'fechar', texto: 'óbito' });
  if (p.det && !p.dead) lista.push({ icone: 'alerta', texto: 'deteriorou' });
  if (p.social || p.blocked) lista.push({ icone: 'cadeado', texto: 'alta bloqueada' });
  if (p.offSvc) lista.push({ icone: 'desvio', texto: 'fora do perfil' });
  if (p.labDelay) lista.push({ icone: 'tubo', texto: 'aguardando exame' });
  if (p.obsProlong) lista.push({ icone: 'obs', texto: 'observação prolongada' });
  const pronto = p.ready || (p.dischReady && p.prep <= 0 && !p.social);
  if (pronto && !p.dead && !p.det) lista.push({ icone: 'check', texto: p.dischReady ? 'pronto para alta' : 'pronto para sair' });
  return lista;
}

export interface PatientChipProps {
  paciente: Patient;
  selecionado?: boolean;
  /** Destino ou paciente que merece atenção agora (contorno amarelo). */
  destacado?: boolean;
  /** Minuto atual do plantão: mostra há quanto tempo o paciente chegou quando não está em boarding. */
  minuto?: number;
  onClick?: (paciente: Patient) => void;
  /** Versão menor, sem nome, para setores com muitos leitos (ENF). */
  compacto?: boolean;
  className?: string;
}

export function PatientChip({
  paciente: p,
  selecionado = false,
  destacado = false,
  minuto,
  onClick,
  compacto = false,
  className,
}: PatientChipProps) {
  const g = GRAVIDADE[p.sev];
  const estados = estadosDoPaciente(p);
  const principal = estados[0];
  const emBoarding = p.bMin > 0 && !p.dead;
  const tempo = emBoarding ? p.bMin : minuto !== undefined ? Math.max(0, minuto - p.arrMin) : null;
  const riscoBoarding = p.bMin >= BOARDING_OBITO ? 'bg-grav-vermelho' : p.bMin >= BOARDING_DETERIORA ? 'bg-grav-laranja' : 'bg-grav-amarelo';
  const progressoBoarding = Math.min(100, Math.round((p.bMin / BOARDING_OBITO) * 100));

  const rotulo = [
    p.name,
    `${g.nome}, prioridade ${g.prioridade}, ${g.categoria}`,
    emBoarding ? `em boarding há ${duracaoCurta(p.bMin)}` : tempo !== null ? `chegou há ${duracaoCurta(tempo)}` : null,
    ...estados.map(e => e.texto),
    selecionado ? 'selecionado' : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <button
      type="button"
      onClick={onClick ? () => onClick(p) : undefined}
      aria-pressed={onClick ? selecionado : undefined}
      aria-label={rotulo}
      title={rotulo}
      className={cx(
        'group relative inline-flex min-h-10 items-center gap-2 rounded-chip border text-left font-sora',
        'motion-safe:transition-[transform,box-shadow,background-color] motion-safe:duration-150',
        compacto ? 'min-w-10 justify-center px-1.5' : 'py-1.5 pr-2.5 pl-1.5',
        selecionado
          ? 'border-marinho bg-marinho text-white shadow-[0_0_0_3px_var(--color-amarelo)] motion-safe:scale-[1.03]'
          : 'border-borda bg-cartao text-texto shadow-[0_1px_3px_rgba(14,24,64,0.08)] hover:border-borda-forte motion-safe:hover:-translate-y-px',
        destacado && !selecionado && 'outline-2 outline-dashed outline-offset-1 outline-amarelo',
        p.dead && 'opacity-60 grayscale-[0.4]',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cx(
          'grid size-7 shrink-0 place-items-center rounded-full font-space-mono text-[13px] font-bold ring-2',
          g.cor,
          g.texto,
          selecionado ? 'ring-white/80' : 'ring-white',
        )}
      >
        {g.prioridade}
      </span>

      {!compacto && (
        <span aria-hidden="true" className="flex min-w-0 flex-col leading-tight">
          <span className="truncate text-sm font-semibold">{p.name}</span>
          {tempo !== null && (
            <span
              className={cx(
                'flex items-center gap-1 font-space-mono text-[11px]',
                selecionado ? 'text-white/85' : 'text-texto-suave',
              )}
            >
              {emBoarding && <Icone nome="ampulheta" tamanho={11} />}
              {duracaoCurta(tempo)}
            </span>
          )}
        </span>
      )}

      {principal && (
        <span
          aria-hidden="true"
          className={cx(
            'grid size-5 shrink-0 place-items-center rounded-full',
            compacto && 'absolute -top-1.5 -right-1.5 size-[18px] ring-2 ring-white',
            selecionado ? 'bg-white text-marinho' : 'bg-marinho text-white',
          )}
        >
          <Icone nome={principal.icone} tamanho={compacto ? 10 : 12} strokeWidth={3} />
        </span>
      )}

      {emBoarding && (
        <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1 overflow-hidden rounded-b-[9px] bg-black/5">
          <span className={cx('block h-full', riscoBoarding)} style={{ width: `${progressoBoarding}%` }} />
        </span>
      )}
    </button>
  );
}

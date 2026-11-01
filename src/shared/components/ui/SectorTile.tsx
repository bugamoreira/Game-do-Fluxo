import { useId, type ReactNode } from 'react';
import { cx } from './cx';
import { Icone } from './Icone';
import type { SetorUi } from './types';

export const SETORES: Record<SetorUi, { sigla: string; nome: string; fundo: string }> = {
  de: { sigla: 'DE', nome: 'Departamento de Emergência', fundo: 'bg-setor-de' },
  enf: { sigla: 'ENF', nome: 'Enfermaria', fundo: 'bg-setor-enf' },
  uti: { sigla: 'UTI', nome: 'Terapia Intensiva', fundo: 'bg-setor-uti' },
  rpa: { sigla: 'RPA', nome: 'Recuperação Pós-Anestésica', fundo: 'bg-setor-rpa' },
  cc: { sigla: 'CC', nome: 'Centro Cirúrgico', fundo: 'bg-setor-cc' },
  triagem: { sigla: 'TRIAGEM', nome: 'Triagem', fundo: 'bg-setor-triagem' },
  corredor: { sigla: 'CORREDOR', nome: 'Corredor', fundo: 'bg-setor-corredor' },
};

/** A partir de quanto a lotação vira risco (texto + barra). */
export const LIMIAR_QUASE_CHEIO = 0.85;

export interface SectorTileProps {
  setor: SetorUi;
  ocupacao: number;
  capacidade: number;
  /** Substitui o nome por extenso. */
  titulo?: string;
  /** Destino possível do paciente selecionado. */
  destacado?: boolean;
  /** Mover o paciente selecionado para cá (só aparece quando destacado). */
  onMover?: () => void;
  /** Conteúdo à direita do cabeçalho (ex.: contador de cirurgias). */
  extra?: ReactNode;
  className?: string;
  children?: ReactNode;
}

function estadoLotacao(ocupacao: number, capacidade: number) {
  const fracao = capacidade > 0 ? ocupacao / capacidade : 0;
  if (fracao >= 1) return { fracao, texto: 'Lotado', barra: 'bg-grav-vermelho', risco: true };
  if (fracao >= LIMIAR_QUASE_CHEIO) return { fracao, texto: 'Quase cheio', barra: 'bg-grav-laranja', risco: true };
  return { fracao, texto: null, barra: 'bg-marinho', risco: false };
}

export function SectorTile({
  setor,
  ocupacao,
  capacidade,
  titulo,
  destacado = false,
  onMover,
  extra,
  className,
  children,
}: SectorTileProps) {
  const idTitulo = useId();
  const info = SETORES[setor];
  const lot = estadoLotacao(ocupacao, capacidade);
  const largura = `${Math.min(100, Math.round(lot.fracao * 100))}%`;
  const podeMover = destacado && onMover !== undefined;

  return (
    <section
      aria-labelledby={idTitulo}
      className={cx(
        'relative flex flex-col gap-3 rounded-cartao p-4 text-texto',
        info.fundo,
        destacado
          ? 'outline-[3px] outline-dashed outline-offset-2 outline-amarelo shadow-[0_0_0_6px_rgba(245,197,24,0.18)]'
          : 'border border-black/[0.04]',
        className,
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {info.sigla.toLowerCase() !== (titulo ?? info.nome).toLowerCase() && (
            <p className="font-space-mono text-rotulo font-bold uppercase tracking-[0.18em] text-texto-suave">
              {info.sigla}
            </p>
          )}
          <h3 id={idTitulo} className="truncate font-sora text-lg font-bold leading-tight">
            {titulo ?? info.nome}
          </h3>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {extra}
          <p className="font-space-mono text-xl font-bold tabular-nums" aria-hidden="true">
            {ocupacao}
            <span className="text-sm font-normal text-texto-suave">/{capacidade}</span>
          </p>
        </div>
      </header>

      <div>
        <div
          role="meter"
          aria-label={`Lotação ${info.sigla}`}
          aria-valuemin={0}
          aria-valuemax={capacidade}
          aria-valuenow={ocupacao}
          aria-valuetext={`${ocupacao} de ${capacidade} leitos${lot.texto ? `, ${lot.texto.toLowerCase()}` : ''}`}
          className="h-2 overflow-hidden rounded-pilula bg-white/80"
        >
          <div
            className={cx('h-full rounded-pilula motion-safe:transition-[width] motion-safe:duration-500', lot.barra)}
            style={{ width: largura }}
          />
        </div>
        {lot.texto && (
          <p className="mt-1.5 flex items-center gap-1 text-xs font-bold text-texto">
            <Icone nome="alerta" tamanho={14} />
            {lot.texto}
          </p>
        )}
      </div>

      {children && <div className="flex flex-wrap content-start gap-2">{children}</div>}

      {podeMover && (
        <button
          type="button"
          onClick={onMover}
          className="mt-auto inline-flex min-h-10 items-center justify-center gap-2 self-start rounded-pilula bg-amarelo px-4 text-sm font-bold text-marinho-profundo focus-visible:outline-marinho-profundo"
        >
          Mover para {info.sigla}
          <Icone nome="setaDireita" tamanho={16} />
        </button>
      )}
    </section>
  );
}

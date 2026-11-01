// Peças comuns da J4 e da J6: números da rodada e a carga do gestor.

import { StatTile } from '../../shared/components/ui';
import type { ResumoRodada } from '../jogo/sincronia';

type ChaveMetrica = 'leitoInadequado' | 'dth' | 'det' | 'bH' | 'cxC' | 'lw' | 'dis' | 'slaPct' | 'decisoes' | 'decisoesReativas' | 'alertas';

interface ItemMetrica {
  chave: ChaveMetrica;
  rotulo: string;
  sentidoBom: 'subir' | 'descer';
  formato?: (v: number) => string;
}

export const METRICAS_CLINICAS: ItemMetrica[] = [
  { chave: 'dth', rotulo: 'Óbitos evitáveis', sentidoBom: 'descer' },
  { chave: 'det', rotulo: 'Deteriorações', sentidoBom: 'descer' },
  { chave: 'bH', rotulo: 'Horas de boarding', sentidoBom: 'descer', formato: v => `${v.toFixed(1).replace('.', ',')} h` },
  { chave: 'cxC', rotulo: 'Cirurgias canceladas', sentidoBom: 'descer' },
  { chave: 'lw', rotulo: 'Saíram sem atendimento', sentidoBom: 'descer' },
  { chave: 'leitoInadequado', rotulo: 'Leito inadequado', sentidoBom: 'descer' },
  { chave: 'dis', rotulo: 'Altas', sentidoBom: 'subir' },
  { chave: 'slaPct', rotulo: 'No tempo-alvo', sentidoBom: 'subir', formato: v => `${Math.round(v)}%` },
];

export const METRICAS_GESTOR: ItemMetrica[] = [
  { chave: 'decisoes', rotulo: 'Decisões do grupo', sentidoBom: 'descer' },
  { chave: 'decisoesReativas', rotulo: 'Decisões reativas', sentidoBom: 'descer' },
  { chave: 'alertas', rotulo: 'Alertas e crises', sentidoBom: 'descer' },
];

function valor(r: ResumoRodada, m: ItemMetrica): number {
  return (r.metricas as unknown as Record<string, number | undefined>)[m.chave] ?? 0;
}

export function exibir(r: ResumoRodada, m: ItemMetrica): string {
  const v = valor(r, m);
  return m.formato ? m.formato(v) : String(Math.round(v));
}

interface GradeMetricasProps {
  itens: ItemMetrica[];
  atual: ResumoRodada;
  /** Para mostrar a variação (ex.: R2 contra R1). */
  referencia?: ResumoRodada | null;
  rotuloReferencia?: string;
}

export function GradeMetricas({ itens, atual, referencia, rotuloReferencia }: GradeMetricasProps) {
  return (
    <div className={itens.length % 4 === 0 ? 'grid grid-cols-2 gap-3 md:grid-cols-4' : 'grid grid-cols-1 gap-3 md:grid-cols-3'}>
      {itens.map(m => {
        const v = valor(atual, m);
        const variacao = referencia ? Math.round((v - valor(referencia, m)) * 10) / 10 : undefined;
        return (
          <StatTile
            key={m.chave}
            rotulo={m.rotulo}
            valor={exibir(atual, m)}
            variacao={variacao}
            sentidoBom={m.sentidoBom}
            referencia={rotuloReferencia}
          />
        );
      })}
    </div>
  );
}

/** Mensagem do fim da rodada, a partir do que mais pesou. */
export function mensagemDaRodada(rodada: 1 | 2, r: ResumoRodada): string {
  const m = r.metricas;
  if (rodada === 2) {
    if (m.dth === 0 && m.cxC === 0) return 'Mesma demanda, outro resultado. As ferramentas Lean fizeram o trabalho repetitivo e o fluxo andou: o problema nunca foi só falta de leito.';
    if (m.dth === 0) return 'As ferramentas reduziram o impacto, mas ainda houve gargalos. Compare com o Plantão Travado.';
    return 'Mesmo com as ferramentas, o sistema sofreu. Quais delas poderiam ter sido usadas antes?';
  }
  if (m.dth > 0) return 'O congelamento da saída causou óbitos evitáveis. O gargalo não está na porta de entrada, está na porta de saída.';
  if (m.cxC > 0) return 'Cirurgias canceladas criaram efeito cascata: menos altas, mais boarding, mais congelamento.';
  if (m.det > 0) return 'Pacientes deterioraram esperando leito. Boarding prolongado tem consequência clínica real.';
  return 'Bom gerenciamento! No Plantão Lean, as ferramentas tiram trabalho repetitivo das suas mãos.';
}

// ============================================================
// Regras do jogo em linguagem simples (design.md §8, item 2).
// Texto escrito a partir das regras vigentes (docs/plano.md, "Decisões do
// Gustavo", e src/shared/lib/simulation/constantes.ts). Os números vêm das
// constantes do motor sempre que possível; a tabela de pontos é conferida
// contra `calcScore` em __tests__/regras.test.ts.
// ============================================================

import { CAP } from '../shared/lib/constants';
import {
  ALVO_ESPERA,
  BLOQUEIO_CASCATA_MIN,
  ENF_EXTRA_VAGAS,
  FAST_TRACK_VAGAS,
  FLUXISTA_INTERVALO_MIN,
  FLUXO_RAPIDO_OCUPACAO,
  LIMIAR_RISCO_BOARDING,
  NIR_ESPERA_MIN,
  NIR_MAX_USOS,
  SALA_VERMELHA_EXTRA,
  TAXA_CHEGADA_POR_HORA,
} from '../shared/lib/simulation/constantes';

export interface BlocoRegra {
  titulo: string;
  paragrafos: string[];
}

const horas = (min: number) => (min % 60 === 0 ? `${min / 60} h` : `${min} min`);

export const CHEGADAS_POR_PLANTAO = Math.round(Object.values(TAXA_CHEGADA_POR_HORA).reduce((a, v) => a + v, 0));

export const REGRAS: BlocoRegra[] = [
  {
    titulo: 'O plantão',
    paragrafos: [
      'Cada grupo coordena o fluxo de pacientes de um hospital das 7h às 19h. Um segundo real equivale a um minuto do plantão, de modo que cada rodada dura 12 minutos.',
      `O hospital já começa cheio: pronto-socorro (DE) com ${CAP.de} macas, enfermaria com ${CAP.enf} leitos, UTI com ${CAP.uti} leitos e recuperação pós-anestésica (RPA) com ${CAP.rpa} vagas, tudo com ocupação alta logo cedo.`,
      'A turma joga duas rodadas: primeiro o Plantão Travado, o hospital como costuma ser; depois do debrief, o Plantão Lean, o mesmo dia com as ferramentas de fluxo funcionando. Todos os grupos jogam as duas.',
    ],
  },
  {
    titulo: 'Chegadas e prioridade',
    paragrafos: [
      `Os pacientes chegam ao longo do dia de forma aleatória, cerca de ${CHEGADAS_POR_PLANTAO} por plantão, com pico entre 11h e 14h e um surto de três pacientes ao meio-dia. A demanda é a mesma nas duas rodadas: a diferença de resultado vem da gestão, não da sorte.`,
      `Na triagem, cada paciente recebe a cor de Manchester, e quem é mais grave entra primeiro. Tempo-alvo até a maca: vermelho, imediato; laranja, ${ALVO_ESPERA.orange} min; amarelo, ${ALVO_ESPERA.yellow} min; verde, ${ALVO_ESPERA.green} min. O vermelho entra mesmo com o DE cheio (sala vermelha, até ${SALA_VERMELHA_EXTRA} pacientes acima da capacidade).`,
      'Com o DE lotado, os pacientes esperam no corredor. Com o corredor cheio, pacientes de baixa complexidade podem ir embora sem atendimento (LWBS).',
    ],
  },
  {
    titulo: 'Decisão, boarding e deterioração',
    paragrafos: [
      'Depois do tempo de avaliação, o paciente fica pronto para um destino: alta do DE, internação na enfermaria ou na UTI. O grupo clica no paciente e depois no destino.',
      `Quem está pronto para internar e continua no DE está em boarding. O risco de deteriorar começa mais cedo para quem é mais grave: depois de ${horas(LIMIAR_RISCO_BOARDING.red)} de boarding para o vermelho, ${horas(LIMIAR_RISCO_BOARDING.orange)} para o laranja, ${horas(LIMIAR_RISCO_BOARDING.yellow)} para o amarelo e ${horas(LIMIAR_RISCO_BOARDING.green)} para o verde. Esperar na triagem além do tempo-alvo também traz risco.`,
      'O óbito evitável só acontece com quem já deteriorou e continua esperando. Internar um paciente de UTI na enfermaria (leito inadequado) libera a maca, mas cerca de um em cada quatro deteriora em quatro horas.',
    ],
  },
  {
    titulo: 'Altas e centro cirúrgico',
    paragrafos: [
      'As altas da enfermaria e da UTI são dos mesmos pacientes nas duas rodadas; o que muda é o horário. No Travado, o round médico libera as altas no fim da manhã e à tarde, com horas de preparo. No Lean, o huddle de leitos antecipa as altas para o começo do dia e o Discharge Lounge libera o leito na hora. Em todos os casos, o grupo clica para efetivar a alta.',
      `Cada cirurgia precisa de vaga na RPA e de leito para o pós-operatório. Sem vaga, ela é cancelada antes de começar, e a alta do paciente que liberaria o leito fica bloqueada por ${horas(BLOQUEIO_CASCATA_MIN)} (efeito cascata). No Lean, a agenda cirúrgica é distribuída ao longo do dia e uma sala fica reservada para emergências.`,
    ],
  },
  {
    titulo: 'NIR e PCP',
    paragrafos: [
      `Alguns pacientes precisam de algo que o hospital não oferece (por exemplo, hemodinâmica). Eles estão fora do perfil e só saem por transferência externa, feita pelo NIR (Núcleo Interno de Regulação). No Lean, o grupo pode acionar o NIR até ${NIR_MAX_USOS} vezes, com intervalo de ${horas(NIR_ESPERA_MIN)}; no Travado, esses pacientes ficam esperando no DE.`,
      `PCP (plano de capacidade plena, ou Full Capacity): no Lean, com autorização da diretoria (o facilitador), o grupo pode internar até ${ENF_EXTRA_VAGAS} pacientes no corredor da enfermaria para desafogar o DE.`,
    ],
  },
  {
    titulo: 'Ferramentas automáticas do Lean',
    paragrafos: [
      'No Lean, o grupo não ganha botões novos além do NIR e do PCP: as ferramentas trabalham sozinhas, e a tarefa do grupo é deixá-las fluir.',
      `Fluxista: alta automática do DE a cada ${FLUXISTA_INTERVALO_MIN} minutos. Fast Track: ${FAST_TRACK_VAGAS} vagas para os pacientes verdes, com decisão mais rápida. Protocolo de fluxo rápido: com o DE acima de ${Math.round(FLUXO_RAPIDO_OCUPACAO * 100)}% de ocupação, as decisões aceleram. Discharge Lounge e huddle de leitos: altas mais cedo e sem espera pelo preparo. Também há manutenção preventiva do tomógrafo, laboratório mais ágil e alta segura para o paciente social.`,
    ],
  },
];

export interface ItemPontuacao {
  item: string;
  pontos: number;
  /** Campo de `ScoreInput` correspondente (para conferência automática). */
  campo: 'boardHrs' | 'dets' | 'deaths' | 'cxCan' | 'lwbs' | 'offS' | 'altaHosp' | 'atendidosNoAlvo';
}

/** Pontuação vigente (`calcScore`, src/shared/lib/game-engine.ts). A mesma fórmula vale nas duas rodadas. */
export const PONTUACAO_INICIAL = 1500;
export const PONTUACAO_MINIMA = 0;
export const BONUS_SEM_OBITO = 150;
export const PONTUACAO: ItemPontuacao[] = [
  { item: 'Cada hora de boarding', pontos: -10, campo: 'boardHrs' },
  { item: 'Deterioração', pontos: -40, campo: 'dets' },
  { item: 'Óbito evitável', pontos: -150, campo: 'deaths' },
  { item: 'Cirurgia cancelada', pontos: -80, campo: 'cxCan' },
  { item: 'Saída sem atendimento (LWBS)', pontos: -40, campo: 'lwbs' },
  { item: 'Internação em leito inadequado', pontos: -25, campo: 'offS' },
  { item: 'Alta hospitalar', pontos: 3, campo: 'altaHosp' },
  { item: 'Paciente atendido dentro do tempo-alvo de Manchester', pontos: 2, campo: 'atendidosNoAlvo' },
];

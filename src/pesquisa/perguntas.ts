// Perguntas da pesquisa, uma seção por tela. Textos sem travessão e sem menção
// a prova de título. Nomes dos blocos: confirmar com o Gustavo (docs/ajustes.md).

export type Pergunta =
  | { tipo: 'nps'; campo: 'nps'; titulo: string; ajuda?: string }
  | { tipo: 'nota'; campo: string; titulo: string; legenda?: [string, string] }
  | { tipo: 'grupo'; titulo: string; ajuda?: string; itens: { campo: string; rotulo: string }[]; legenda?: [string, string] }
  | { tipo: 'opcao'; campo: string; titulo: string; opcoes: { valor: string; rotulo: string }[] }
  | { tipo: 'texto'; campo: string; titulo: string; ajuda?: string }
  | { tipo: 'simnao'; campo: string; titulo: string }
  | { tipo: 'email'; campo: 'email'; titulo: string; ajuda?: string };

export interface Secao {
  titulo: string;
  perguntas: Pergunta[];
}

const RUIM_OTIMO: [string, string] = ['1 = fraco', '5 = excelente'];

export const BLOCOS = [
  { campo: 'bloco_nir_fluxista', rotulo: 'NIR e fluxista' },
  { campo: 'bloco_segmentacao', rotulo: 'Segmentação e fast track' },
  { campo: 'bloco_indicadores', rotulo: 'Indicadores' },
  { campo: 'bloco_capacidade', rotulo: 'Capacidade, demanda e filas' },
  { campo: 'bloco_lean', rotulo: 'Ferramentas Lean' },
];

export const PRATICAS = [
  { campo: 'pratica_dashboard', rotulo: 'Dashboard' },
  { campo: 'pratica_planilha_vsm', rotulo: 'Planilha de VSM' },
  { campo: 'pratica_game_fluxo', rotulo: 'Simulador do Fluxo' },
];

const facilitador = (nome: string, chave: string) => [
  { campo: `${chave}_dominio`, rotulo: 'Domínio do tema' },
  { campo: `${chave}_clareza`, rotulo: 'Clareza' },
  { campo: `${chave}_interacao`, rotulo: 'Interação com a turma' },
].map((i) => ({ ...i, nome }));

export const FAC_GUSTAVO = facilitador('Gustavo Moreira', 'gustavo');
export const FAC_JULIANA = facilitador('Juliana Souza', 'juliana');

export const LOGISTICA = [
  { campo: 'log_sala', rotulo: 'Sala' },
  { campo: 'log_duracao', rotulo: 'Duração das 8 horas' },
  { campo: 'log_ritmo', rotulo: 'Ritmo' },
  { campo: 'log_intervalos', rotulo: 'Intervalos' },
];

export const SECOES: Secao[] = [
  {
    titulo: 'Nota geral',
    perguntas: [
      {
        tipo: 'nps',
        campo: 'nps',
        titulo: 'De 0 a 10, quanto você recomendaria este curso a um colega que trabalha em emergência?',
        ajuda: 'Única pergunta obrigatória.',
      },
      { tipo: 'texto', campo: 'nps_motivo', titulo: 'O que mais pesou na sua nota?', ajuda: 'Opcional.' },
    ],
  },
  {
    titulo: 'Conteúdo',
    perguntas: [
      {
        tipo: 'nota',
        campo: 'aplicabilidade',
        titulo: 'O conteúdo foi aplicável à minha realidade de trabalho.',
        legenda: ['1 = discordo', '5 = concordo totalmente'],
      },
      {
        tipo: 'opcao',
        campo: 'profundidade',
        titulo: 'O nível de profundidade foi:',
        opcoes: [
          { valor: 'basico', rotulo: 'Muito básico' },
          { valor: 'adequado', rotulo: 'Adequado' },
          { valor: 'avancado', rotulo: 'Muito avançado' },
        ],
      },
      { tipo: 'grupo', titulo: 'Avalie cada bloco', itens: BLOCOS, legenda: RUIM_OTIMO },
    ],
  },
  {
    titulo: 'Prática',
    perguntas: [
      { tipo: 'grupo', titulo: 'Quanto cada atividade ajudou a fixar os conceitos?', itens: PRATICAS, legenda: ['1 = pouco', '5 = muito'] },
      {
        tipo: 'opcao',
        campo: 'equilibrio',
        titulo: 'O equilíbrio entre teoria e prática foi:',
        opcoes: [
          { valor: 'teoria_demais', rotulo: 'Teoria demais' },
          { valor: 'equilibrado', rotulo: 'Equilibrado' },
          { valor: 'pratica_demais', rotulo: 'Prática demais' },
        ],
      },
    ],
  },
  {
    titulo: 'Facilitadores',
    perguntas: [
      { tipo: 'grupo', titulo: 'Gustavo Moreira', itens: FAC_GUSTAVO, legenda: RUIM_OTIMO },
      { tipo: 'grupo', titulo: 'Juliana Souza', itens: FAC_JULIANA, legenda: RUIM_OTIMO },
    ],
  },
  {
    titulo: 'Logística',
    perguntas: [{ tipo: 'grupo', titulo: 'Avalie', itens: LOGISTICA, legenda: RUIM_OTIMO }],
  },
  {
    titulo: 'Impacto',
    perguntas: [
      { tipo: 'texto', campo: 'aplicar_30_dias', titulo: 'Qual ferramenta ou ideia você pretende aplicar no seu serviço nos próximos 30 dias?' },
      { tipo: 'texto', campo: 'mudaria', titulo: 'O que você mudaria ou acrescentaria?' },
    ],
  },
  {
    titulo: 'Próximos passos',
    perguntas: [
      { tipo: 'texto', campo: 'temas_futuros', titulo: 'Que temas você gostaria de ver num próximo curso?', ajuda: 'Opcional.' },
      { tipo: 'simnao', campo: 'quer_conteudos', titulo: 'Quer receber conteúdos do ED Leaders?' },
      { tipo: 'email', campo: 'email', titulo: 'Seu e-mail', ajuda: 'Opcional. Usamos só para enviar conteúdos do ED Leaders.' },
      { tipo: 'simnao', campo: 'interesse_consultoria', titulo: 'Seu serviço tem interesse em conversar sobre consultoria em gestão da emergência?' },
    ],
  },
];

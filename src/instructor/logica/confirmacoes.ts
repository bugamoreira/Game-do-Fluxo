// ============================================================
// Quais ações pedem confirmação e com que texto. Puro e testado.
// Regra: ação que não se desfaz (encerrar, remover, nova turma, substituir)
// sempre confirma; iniciar o Lean sempre confirma; iniciar o Travado sempre
// confirma, listando os grupos, porque depois dele nenhum grupo novo entra.
// ============================================================

import { horaDoPlantao } from '../../shared/components/ui/cx';
import { MINUTO_FIM } from '../../shared/hooks/relogio';
import { contarProntos, gruposAtivos, type GrupoPainel } from './fases';
import { listaNatural, plural } from './formato';

export type AcaoConfirmavel =
  | { tipo: 'iniciar'; rodada: 1 | 2; grupos: GrupoPainel[] }
  | { tipo: 'encerrar'; rodada: 1 | 2; minuto: number | null }
  | { tipo: 'removerGrupo'; nome: string }
  | { tipo: 'liberarReconexao'; nome: string }
  | { tipo: 'substituirTurma'; codigo: string; detalhe: string }
  | { tipo: 'novaTurma'; codigo: string };

export interface Confirmacao {
  titulo: string;
  descricao: string;
  rotuloConfirmar: string;
  /** Ação que não se desfaz: botão de confirmar em marinho, nunca verde. */
  destrutiva: boolean;
  /** Confirmação forte: só libera o botão depois de digitar este texto. */
  digitar?: string;
  /** Grupos da sala, para conferir antes de iniciar; `semSinal` vem destacado. */
  grupos?: { id: string; nome: string; cor: string; semSinal: boolean }[];
}

/** Devolve a confirmação a mostrar, ou `null` se a ação pode seguir direto. */
export function confirmacaoPara(acao: AcaoConfirmavel): Confirmacao | null {
  switch (acao.tipo) {
    case 'iniciar': {
      const nome = acao.rodada === 1 ? 'Plantão Travado' : 'Plantão Lean';
      const { conectados, desconectados } = contarProntos(acao.grupos);
      if (acao.rodada === 1) {
        // Decisão do Gustavo: depois do início nenhum grupo novo entra; a sala só
        // começa com todos conectados. Por isso sempre confere a lista antes.
        const semSinal = desconectados.length > 0;
        const nomes = listaNatural(desconectados.map((g) => g.nome));
        return {
          titulo: semSinal
            ? `Iniciar o Plantão Travado com ${plural(desconectados.length, 'grupo', 'grupos')} sem sinal?`
            : 'Iniciar o Plantão Travado?',
          descricao:
            `${plural(conectados, 'grupo conectado', 'grupos conectados')}. Depois de iniciar, nenhum grupo novo poderá entrar.` +
            (semSinal
              ? ` ${desconectados.length === 1 ? 'Está sem sinal' : 'Estão sem sinal'}: ${nomes}; ao voltar, o jogo avança sozinho até o horário da sala.`
              : ''),
          rotuloConfirmar: semSinal ? 'Iniciar mesmo assim' : 'Iniciar Plantão Travado',
          destrutiva: false,
          grupos: gruposAtivos(acao.grupos).map((g) => ({ id: g.id, nome: g.nome, cor: g.cor, semSinal: !g.conectado })),
        };
      }
      if (desconectados.length === 0) {
        // O Lean sempre confirma: um clique por engano encerra o debrief para a turma inteira.
        return {
          titulo: 'Iniciar o Plantão Lean?',
          descricao:
            'O debrief termina e o relógio do Plantão Lean começa a correr em todos os computadores. Não é possível voltar ao debrief.',
          rotuloConfirmar: 'Iniciar Plantão Lean',
          destrutiva: false,
        };
      }
      const nomes = listaNatural(desconectados.map((g) => g.nome));
      return {
        titulo: `Iniciar o ${nome} com ${plural(desconectados.length, 'grupo', 'grupos')} sem conexão?`,
        descricao: `${desconectados.length === 1 ? 'Está sem conexão' : 'Estão sem conexão'}: ${nomes}. O relógio da sala corre para todos; quando ${desconectados.length === 1 ? 'esse grupo voltar' : 'esses grupos voltarem'}, o jogo avança sozinho até o horário da sala.`,
        rotuloConfirmar: `Iniciar mesmo assim`,
        destrutiva: false,
      };
    }
    case 'encerrar': {
      const nome = acao.rodada === 1 ? 'Plantão Travado' : 'Plantão Lean';
      const antes = acao.minuto !== null && acao.minuto < MINUTO_FIM;
      const destino = acao.rodada === 1 ? 'o debrief' : 'o resultado final';
      return {
        titulo: `Encerrar o ${nome}?`,
        descricao: antes
          ? `O plantão ainda está em ${horaDoPlantao(acao.minuto ?? 0)}. Encerrar agora congela o placar de todos os grupos neste horário e leva a turma para ${destino}. Não é possível retomar a rodada.`
          : `O placar de todos os grupos fica congelado e a turma vai para ${destino}. Não é possível retomar a rodada.`,
        rotuloConfirmar: 'Encerrar rodada',
        destrutiva: true,
      };
    }
    case 'removerGrupo':
      return {
        titulo: `Remover o grupo “${acao.nome}”?`,
        descricao:
          'O grupo sai do ranking e do relatório, e o computador dele perde o acesso. Os dados ficam guardados no banco e o nome fica livre para entrar de novo.',
        rotuloConfirmar: 'Remover grupo',
        destrutiva: true,
      };
    case 'liberarReconexao':
      return {
        titulo: `Liberar a reconexão de “${acao.nome}”?`,
        descricao: `Use quando o grupo trocou de computador ou fechou o navegador e perdeu a sessão. O próximo computador que entrar com o nome “${acao.nome}” e o código de acesso reassume o grupo, com o jogo salvo no servidor. A liberação vale para uma única entrada.`,
        rotuloConfirmar: 'Liberar reconexão',
        destrutiva: false,
      };
    case 'substituirTurma':
      return {
        titulo: `O código ${acao.codigo} já está em uso`,
        descricao: `${acao.detalhe} Se substituir, a turma anterior é arquivada com os dados guardados, e os grupos dela precisam entrar de novo.`,
        rotuloConfirmar: 'Substituir turma',
        destrutiva: true,
      };
    case 'novaTurma':
      return {
        titulo: 'Abrir uma nova turma?',
        descricao: `A turma atual sai do painel e os grupos precisam entrar de novo na próxima. Os resultados e o relatório continuam guardados. Para confirmar, digite o código da sala (${acao.codigo}).`,
        rotuloConfirmar: 'Abrir nova turma',
        destrutiva: true,
        digitar: acao.codigo,
      };
  }
}

/** Confirmação forte: compara sem diferenciar maiúsculas e espaços nas pontas. */
export function textoConfere(digitado: string, esperado: string): boolean {
  return digitado.trim().toUpperCase() === esperado.trim().toUpperCase();
}

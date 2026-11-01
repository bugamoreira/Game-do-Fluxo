// ============================================================
// App do jogador na sala (online ou demonstração). Toda tela deriva do status
// da turma, consultado a cada 1 s (docs/design.md §5): aberta → J2, rodada1 → J3,
// debrief → J4, rodada2 → J5, encerrada → J6.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../shared/components/ui';
import type { EstadoSimulacao, Metricas, Rodada } from '../shared/lib/simulation';
import type { EstadoTurma } from '../shared/schemas';
import { SemConexao } from '../shared/services/erros';
import {
  MENSAGEM_SEM_CONSULTA,
  comoEstadoSimulacao,
  decidirRetomada,
  eventosRelevantes,
  minutoAlvo,
  sementeDaTurma,
  tensaoDoPlantao,
  type RespostaServidor,
  type ResumoRodada,
} from './jogo/sincronia';
import { MENSAGEM_ACESSO_PERDIDO, MENSAGEM_TURMA_NOVA, ehStatusFinal, podeReentrarSozinho, tokenParaNome } from './jogo/sessao';
import { resumoDe } from './jogo/storeJogo';
import { storeJogo, useJogo, useRelogioDoJogo } from './jogo/useJogo';
import { useTravaAba } from './jogo/useTravaAba';
import { musica } from './lib/musicaAdapter';
import { useLigarSomNoPrimeiroGesto } from './lib/useLigarSom';
import { TelaPlantao } from './plantao/TelaPlantao';
import { usePorta, type PortaJogo } from './servicos/porta';
import { TelaAviso } from './telas/TelaAviso';
import { TelaEspera } from './telas/TelaEspera';
import { TelaFimRodada } from './telas/TelaFimRodada';
import { TelaNome } from './telas/TelaNome';
import { TelaResultado } from './telas/TelaResultado';

interface GrupoAtivo {
  grupoId: string;
  /** Turma em que o grupo entrou (`undefined`: entrou sem rede, com a sessão antiga). */
  turmaId: string | undefined;
  nome: string;
  cor: string;
  token: string;
  reconectado: boolean;
  /** O que o servidor disse na entrada sobre o jogo salvo da rodada atual (`null`: sem resposta). */
  servidor: RespostaServidor | null;
}

interface AppSalaProps {
  sala: string;
  /** Demonstração: entra direto com este nome. */
  grupoInicial?: string | null;
}

export function AppSala({ sala, grupoInicial = null }: AppSalaProps) {
  useLigarSomNoPrimeiroGesto();
  const porta = usePorta();
  const sessaoInicial = useMemo(() => porta.sessao.ler(sala), [porta, sala]);
  const [grupo, setGrupo] = useState<GrupoAtivo | null>(null);
  const [entrando, setEntrando] = useState(Boolean(sessaoInicial || grupoInicial));
  const [erro, setErro] = useState<string | null>(null);
  const [nomeSugerido, setNomeSugerido] = useState(sessaoInicial?.nome ?? '');
  /** Turma aberta agora com este código (para não reaproveitar sessão de outra turma). */
  const [turmaAtual, setTurmaAtual] = useState<string | null>(null);
  // Um grupo, um motor: a segunda aba do mesmo grupo não roda o jogo.
  const trava = useTravaAba(grupo?.grupoId ?? null);
  useEffect(() => {
    if (trava.situacao === 'outra') storeJogo.getState().descartar();
  }, [trava.situacao]);

  const entrar = useCallback(
    async (nome: string, token: string | null, codigoAcesso: string | null = null) => {
      setEntrando(true);
      setErro(null);
      try {
        const e = await porta.entrar(sala, nome, token, codigoAcesso);
        porta.sessao.salvar({ codigo: sala, turmaId: e.turmaId, grupoId: e.grupo.id, nome: e.grupo.nome, cor: e.grupo.cor, token: e.token });
        setTurmaAtual(e.turmaId);
        setGrupo({
          grupoId: e.grupo.id,
          turmaId: e.turmaId,
          nome: e.grupo.nome,
          cor: e.grupo.cor,
          token: e.token,
          reconectado: e.reconectado,
          servidor: e.rodada !== null ? { rodada: e.rodada, estado: e.estadoSalvo } : null,
        });
      } catch (err) {
        const sessao = porta.sessao.ler(sala);
        if (err instanceof SemConexao && token && sessao?.token === token) {
          // Sem rede, mas este computador já é do grupo: o jogo segue com a cópia local.
          setGrupo({ grupoId: sessao.grupoId, turmaId: sessao.turmaId, nome: sessao.nome, cor: sessao.cor, token, reconectado: true, servidor: null });
        } else {
          setNomeSugerido(nome);
          setErro(err instanceof Error ? err.message : 'Não foi possível entrar. Tente de novo.');
        }
      } finally {
        setEntrando(false);
      }
    },
    [porta, sala],
  );

  // Reentrada automática: só com a sessão da mesma turma (outra turma com o mesmo código vai para a J1).
  const tentouAuto = useRef(false);
  useEffect(() => {
    if (tentouAuto.current) return;
    tentouAuto.current = true;
    if (grupoInicial) {
      void entrar(grupoInicial, null);
      return;
    }
    if (!sessaoInicial) return;
    void porta
      .consultarTurma(sala)
      .then(
        t => t.id as string | null,
        (e: unknown) => (e instanceof SemConexao ? null : undefined),
      )
      .then(atual => {
        if (atual) setTurmaAtual(atual);
        if (atual !== undefined && podeReentrarSozinho(sessaoInicial, atual)) return entrar(sessaoInicial.nome, sessaoInicial.token);
        setEntrando(false);
      });
  }, [entrar, porta, sala, sessaoInicial, grupoInicial]);

  const sair = useCallback(
    (mensagem: string) => {
      porta.sessao.limpar();
      storeJogo.getState().descartar();
      setGrupo(null);
      setErro(mensagem);
    },
    [porta],
  );

  if (!grupo) {
    if (entrando && !erro && (sessaoInicial || grupoInicial)) {
      return <TelaAviso sala={sala} titulo="Reconectando o grupo…">Buscando o jogo salvo deste grupo.</TelaAviso>;
    }
    const sessao = porta.sessao.ler(sala);
    return (
      <TelaNome
        sala={sala}
        nomeInicial={nomeSugerido}
        nomeComSessao={sessao && tokenParaNome(sessao, turmaAtual, sessao.nome) ? sessao.nome : null}
        entrando={entrando}
        erro={erro}
        onEntrar={(nome, codigo) => void entrar(nome, tokenParaNome(porta.sessao.ler(sala), turmaAtual, nome), codigo)}
      />
    );
  }

  if (trava.situacao === 'outra') {
    return (
      <TelaAviso
        sala={sala}
        titulo="Este grupo já está aberto em outra aba"
        acoes={
          <Button variante="amarelo" tamanho="p" onClick={trava.assumir}>
            Assumir aqui
          </Button>
        }
      >
        O jogo do grupo “{grupo.nome}” continua na outra aba deste navegador. Se quiser jogar nesta, clique em “Assumir aqui”: a outra aba
        para.
      </TelaAviso>
    );
  }
  if (trava.situacao === 'verificando') return <TelaAviso sala={sala} titulo="Abrindo o jogo do grupo…" />;

  return <SalaDoGrupo porta={porta} sala={sala} grupo={grupo} onSair={sair} />;
}

interface SalaDoGrupoProps {
  porta: PortaJogo;
  sala: string;
  grupo: GrupoAtivo;
  onSair: (mensagem: string) => void;
}

function rodadaDoStatus(status: EstadoTurma['status'] | undefined): Rodada | null {
  return status === 'rodada1' ? 1 : status === 'rodada2' ? 2 : null;
}

function SalaDoGrupo({ porta, sala, grupo, onSair }: SalaDoGrupoProps) {
  const consulta = porta.useEstadoTurma(sala, 1000, grupo.token);
  const { conexao, minutoServidor } = consulta;
  const minutoTeto = consulta.minutoTeto ?? null;
  const estado = useJogo(s => s.estado);
  const resumos = useJogo(s => s.resumos);
  /** Respostas do servidor sobre o jogo salvo de cada rodada (entrada ou `obter_estado`). */
  const [respostas, setRespostas] = useState<Partial<Record<Rodada, RespostaServidor>>>(() =>
    grupo.servidor ? { [grupo.servidor.rodada]: grupo.servidor } : {},
  );
  const [bloqueio, setBloqueio] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);
  const consultando = useRef<Rodada | null>(null);
  const statusAnterior = useRef<EstadoTurma['status'] | null>(null);
  const viuInicio = useRef<Record<Rodada, boolean>>({ 1: false, 2: false });
  const minutoRef = useRef(minutoServidor);
  const tetoRef = useRef(minutoTeto);
  const [ultimaDaTurma, setUltimaDaTurma] = useState<EstadoTurma | null>(null);

  // A sala pode abrir outra turma com o mesmo código: a tela final da turma do grupo fica parada.
  const daTurma = consulta.turma && (grupo.turmaId === undefined || consulta.turma.id === grupo.turmaId) ? consulta.turma : null;
  const turmaNova = consulta.turma !== null && daTurma === null;
  const finalCongelado = turmaNova && ehStatusFinal(ultimaDaTurma?.status);
  const turma = daTurma ?? (finalCongelado ? ultimaDaTurma : null);

  const status = turma?.status;
  const rodada = rodadaDoStatus(status);
  const pausada = turma?.pausada ?? false;
  const jogando = rodada !== null && estado?.rodada === rodada;

  useEffect(() => {
    minutoRef.current = minutoServidor;
  }, [minutoServidor]);
  useEffect(() => {
    tetoRef.current = minutoTeto;
  }, [minutoTeto]);

  useEffect(() => {
    if (daTurma) setUltimaDaTurma(daTurma);
  }, [daTurma]);

  // O token deixou de valer (grupo removido, ou reassumido em outro computador) ou a sala trocou de turma.
  // Na tela final o grupo não é expulso: o resultado continua na tela.
  useEffect(() => {
    if (turmaNova) {
      if (!finalCongelado) onSair(MENSAGEM_TURMA_NOVA);
      return;
    }
    if (daTurma?.tokenValido === false && !ehStatusFinal(daTurma.status)) onSair(MENSAGEM_ACESSO_PERDIDO);
  }, [turmaNova, finalCongelado, daTurma, onSair]);

  // Sincronização com o servidor: estado completo, série a cada 30 min simulados e eventos marcantes.
  // As assinaturas vêm antes da retomada: a recuperação (carregar) já emite marcos e eventos.
  const sync = porta.useSincronizarJogo(grupo.token, estado, resumoDe);
  const { registrarSerie, registrarEventos } = sync;
  useEffect(
    () =>
      storeJogo.getState().assinarSerie(({ rodada: r, minuto, metricas }) => {
        registrarSerie<Metricas>(r, minuto, metricas);
      }),
    [registrarSerie],
  );
  useEffect(
    () =>
      storeJogo.getState().assinarOcorrencias(({ ocorrencias, rodada: r }) => {
        registrarEventos(r, eventosRelevantes(r, ocorrencias));
      }),
    [registrarEventos],
  );

  // Início ou retomada da rodada (docs/design.md §5, reconexão só com o estado completo).
  useEffect(() => {
    if (!turma) return;
    const anterior = statusAnterior.current;
    statusAnterior.current = turma.status;
    const r = rodadaDoStatus(turma.status);
    const loja = storeJogo.getState();
    if (r !== null) {
      if (anterior === (r === 1 ? 'aberta' : 'debrief')) viuInicio.current[r] = true;
      if (loja.estado?.rodada === r) return;
      const retomada = decidirRetomada({
        rodada: r,
        semente: sementeDaTurma(turma.id),
        local: porta.lerCopia(grupo.token),
        servidor: respostas[r] ?? null,
        podeComecar: !grupo.reconectado || viuInicio.current[r],
      });
      if (retomada.tipo === 'consultar') {
        // O servidor ainda não disse se há jogo salvo desta rodada (o navegador estava fechado no início).
        if (consultando.current === r) return;
        consultando.current = r;
        porta
          .obterEstado(grupo.token, r)
          .then(
            salvo => setRespostas(atual => ({ ...atual, [r]: { rodada: r, estado: salvo } })),
            (e: unknown) => setBloqueio(e instanceof SemConexao || !(e instanceof Error) ? MENSAGEM_SEM_CONSULTA : e.message),
          )
          .finally(() => {
            consultando.current = null;
          });
        return;
      }
      if (retomada.tipo === 'sem_estado') {
        setBloqueio(retomada.mensagem);
        return;
      }
      setBloqueio(null);
      // Começar do zero ou restaurar: o motor avança até o minuto da sala.
      const teto = tetoRef.current;
      const minutoSala = minutoRef.current;
      loja.carregar(retomada.estado, minutoSala !== null && teto !== null ? Math.min(minutoSala, teto) : minutoSala);
    } else if (turma.status !== 'aberta' && !loja.estado) {
      // Depois de recarregar a página no debrief ou no fim: o resumo vem da cópia local.
      const copia = comoEstadoSimulacao(porta.lerCopia(grupo.token)) ?? comoEstadoSimulacao(grupo.servidor?.estado);
      if (copia) loja.carregar(copia);
    }
  }, [turma, porta, grupo, respostas, tentativa]);

  /** "Tentar de novo": pergunta de novo ao servidor pelo jogo salvo desta rodada. */
  const tentarDeNovo = useCallback(() => {
    setBloqueio(null);
    setRespostas(atual => {
      const proximo = { ...atual };
      if (rodada !== null) delete proximo[rodada];
      return proximo;
    });
    setTentativa(t => t + 1);
  }, [rodada]);

  // Relógio: segue o minuto do servidor; pausa do facilitador congela.
  const obterAlvo = useCallback((local: number) => minutoAlvo(local, minutoRef.current, pausada, tetoRef.current), [pausada]);
  useRelogioDoJogo(jogando, obterAlvo);

  // Facilitador liberou ou revogou o PCP (Full Capacity).
  useEffect(() => {
    if (!turma || estado?.rodada !== 2) return;
    if (turma.fullCapacityLiberado && !estado.ferramentas.fcLiberado) storeJogo.getState().liberarFullCapacity();
    else if (!turma.fullCapacityLiberado && estado.ferramentas.fcLiberado) storeJogo.getState().revogarFullCapacity();
  }, [turma, estado]);

  // Música: mudo pelo facilitador; tensão do hospital.
  useEffect(() => {
    musica.definirMudo(turma?.musicaMudo ?? false);
  }, [turma?.musicaMudo]);
  useEffect(() => {
    if (!estado) return;
    musica.atualizar({ rodada: estado.rodada, tensao: tensaoDoPlantao(estado), rodando: jogando && !pausada && estado.minuto < 1140 });
  }, [estado, jogando, pausada]);

  const conexaoTela = conexao === 'online' && sync.conexao !== 'online' ? sync.conexao : conexao;

  if (!turma) {
    return (
      <TelaAviso sala={sala} titulo="Conectando à sala…" conexao={conexao === 'online' ? null : conexao}>
        Assim que o servidor responder, o jogo continua de onde parou.
      </TelaAviso>
    );
  }

  if (status === 'aberta') return <TelaEspera turma={turma} grupoId={grupo.grupoId} conexao={conexaoTela} />;

  if (rodada !== null) {
    if (bloqueio && !jogando) {
      return (
        <TelaAviso
          sala={sala}
          titulo="Não foi possível retomar o jogo"
          conexao={conexaoTela}
          acoes={
            <Button variante="amarelo" tamanho="p" onClick={tentarDeNovo}>
              Tentar de novo
            </Button>
          }
        >
          {bloqueio}
        </TelaAviso>
      );
    }
    if (!jogando) return <TelaAviso sala={sala} titulo="Preparando o plantão…" conexao={conexaoTela} />;
    return <TelaPlantao nomeGrupo={grupo.nome} corGrupo={grupo.cor} conexao={conexaoTela} pausado={pausada} />;
  }

  const r1 = resumos[1] ?? (estado?.rodada === 1 ? resumoDe(estado) : null);
  if (status === 'debrief') {
    return (
      <TelaFimRodada
        sala={sala}
        nomeGrupo={grupo.nome}
        corGrupo={grupo.cor}
        resumo={r1}
        conexao={conexaoTela}
        proximoPasso="Debrief com o facilitador. Em seguida, o Plantão Lean."
      />
    );
  }

  return <ResultadoOnline sala={sala} grupo={grupo} estado={estado} r1Local={r1} r2Local={resumos[2] ?? null} conexao={conexaoTela} />;
}

interface ResultadoOnlineProps {
  sala: string;
  grupo: GrupoAtivo;
  estado: EstadoSimulacao | null;
  r1Local: ResumoRodada | null;
  r2Local: ResumoRodada | null;
  conexao: ReturnType<PortaJogo['useEstadoTurma']>['conexao'];
}

function ResultadoOnline({ sala, grupo, estado, r1Local, r2Local, conexao }: ResultadoOnlineProps) {
  const porta = usePorta();
  const { itens } = porta.useRanking(sala, 5000);
  const doServidor = (rodada: Rodada): ResumoRodada | null => {
    const item = itens.find(i => i.grupoId === grupo.grupoId && i.rodada === rodada);
    return item ? { pontuacao: item.pontuacao, metricas: item.metricas as unknown as Metricas } : null;
  };
  const r2 = r2Local ?? (estado?.rodada === 2 ? resumoDe(estado) : null) ?? doServidor(2);
  const r1 = doServidor(1) ?? r1Local;
  return (
    <TelaResultado
      sala={sala}
      nomeGrupo={grupo.nome}
      corGrupo={grupo.cor}
      r1={r1}
      r2={r2}
      rankingR2={itens.filter(i => i.rodada === 2)}
      grupoId={grupo.grupoId}
      conexao={conexao}
    />
  );
}

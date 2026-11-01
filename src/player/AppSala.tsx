// ============================================================
// App do jogador na sala (online ou demonstração). Toda tela deriva do status
// da turma, consultado a cada 1 s (docs/design.md §5): aberta → J2, rodada1 → J3,
// debrief → J4, rodada2 → J5, encerrada → J6.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../shared/components/ui';
import { metricas, type EstadoSimulacao, type Metricas, type Rodada } from '../shared/lib/simulation';
import type { EstadoTurma } from '../shared/schemas';
import { SemConexao } from '../shared/services/erros';
import { comoEstadoSimulacao, decidirRetomada, eventosRelevantes, marcoDaSerie, minutoAlvo, sementeDaTurma, tensaoDoPlantao, type ResumoRodada } from './jogo/sincronia';
import { resumoDe } from './jogo/storeJogo';
import { storeJogo, useJogo, useRelogioDoJogo } from './jogo/useJogo';
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
  nome: string;
  cor: string;
  token: string;
  reconectado: boolean;
  /** Estado salvo devolvido pelo servidor na entrada (qualquer rodada). */
  estadoSalvo: unknown;
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

  const entrar = useCallback(
    async (nome: string, token: string | null) => {
      setEntrando(true);
      setErro(null);
      try {
        const e = await porta.entrar(sala, nome, token);
        porta.sessao.salvar({ codigo: sala, grupoId: e.grupo.id, nome: e.grupo.nome, cor: e.grupo.cor, token: e.token });
        setGrupo({ grupoId: e.grupo.id, nome: e.grupo.nome, cor: e.grupo.cor, token: e.token, reconectado: e.reconectado, estadoSalvo: e.estadoSalvo });
      } catch (err) {
        const sessao = porta.sessao.ler(sala);
        if (err instanceof SemConexao && token && sessao?.token === token) {
          // Sem rede, mas este computador já é do grupo: o jogo segue com a cópia local.
          setGrupo({ grupoId: sessao.grupoId, nome: sessao.nome, cor: sessao.cor, token, reconectado: true, estadoSalvo: null });
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

  const tentouAuto = useRef(false);
  useEffect(() => {
    if (tentouAuto.current) return;
    tentouAuto.current = true;
    if (sessaoInicial) void entrar(sessaoInicial.nome, sessaoInicial.token);
    else if (grupoInicial) void entrar(grupoInicial, null);
  }, [entrar, sessaoInicial, grupoInicial]);

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
    return <TelaNome sala={sala} nomeInicial={nomeSugerido} entrando={entrando} erro={erro} onEntrar={nome => void entrar(nome, null)} />;
  }

  return <SalaDoGrupo porta={porta} sala={sala} grupo={grupo} onReentrar={() => entrar(grupo.nome, grupo.token)} onSair={sair} />;
}

interface SalaDoGrupoProps {
  porta: PortaJogo;
  sala: string;
  grupo: GrupoAtivo;
  onReentrar: () => Promise<void>;
  onSair: (mensagem: string) => void;
}

function rodadaDoStatus(status: EstadoTurma['status'] | undefined): Rodada | null {
  return status === 'rodada1' ? 1 : status === 'rodada2' ? 2 : null;
}

function SalaDoGrupo({ porta, sala, grupo, onReentrar, onSair }: SalaDoGrupoProps) {
  const { turma, conexao, minutoServidor } = porta.useEstadoTurma(sala, 1000, grupo.token);
  const estado = useJogo(s => s.estado);
  const resumos = useJogo(s => s.resumos);
  const [semEstado, setSemEstado] = useState<string | null>(null);
  const statusAnterior = useRef<EstadoTurma['status'] | null>(null);
  const viuInicio = useRef<Record<Rodada, boolean>>({ 1: false, 2: false });
  const minutoRef = useRef(minutoServidor);

  const status = turma?.status;
  const rodada = rodadaDoStatus(status);
  const pausada = turma?.pausada ?? false;
  const jogando = rodada !== null && estado?.rodada === rodada;

  useEffect(() => {
    minutoRef.current = minutoServidor;
  }, [minutoServidor]);

  // Grupo removido pelo facilitador: o token deixou de valer.
  useEffect(() => {
    if (turma?.tokenValido === false) onSair('Este grupo foi removido da sala pelo facilitador. Entre de novo com um nome.');
  }, [turma?.tokenValido, onSair]);

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
        servidor: grupo.estadoSalvo,
        podeComecar: !grupo.reconectado || viuInicio.current[r],
      });
      if (retomada.tipo === 'sem_estado') {
        setSemEstado(retomada.mensagem);
        return;
      }
      setSemEstado(null);
      loja.carregar(retomada.estado, minutoRef.current);
    } else if (turma.status !== 'aberta' && !loja.estado) {
      // Depois de recarregar a página no debrief ou no fim: o resumo vem da cópia local.
      const copia = comoEstadoSimulacao(porta.lerCopia(grupo.token)) ?? comoEstadoSimulacao(grupo.estadoSalvo);
      if (copia) loja.carregar(copia);
    }
  }, [turma, porta, grupo]);

  // Relógio: segue o minuto do servidor; pausa do facilitador congela.
  const obterAlvo = useCallback((local: number) => minutoAlvo(local, minutoRef.current, pausada), [pausada]);
  useRelogioDoJogo(jogando, obterAlvo);

  // Facilitador liberou o PCP (Full Capacity).
  useEffect(() => {
    if (turma?.fullCapacityLiberado && estado?.rodada === 2 && !estado.ferramentas.fcLiberado) storeJogo.getState().liberarFullCapacity();
  }, [turma?.fullCapacityLiberado, estado]);

  // Sincronização com o servidor: estado completo, série a cada 30 min simulados e eventos marcantes.
  const sync = porta.useSincronizarJogo(grupo.token, estado, resumoDe);
  const { registrarSerie, registrarEventos } = sync;
  const ultimoMarco = useRef<{ rodada: Rodada; minuto: number } | null>(null);
  useEffect(() => {
    if (!estado || !jogando) return;
    const marco = marcoDaSerie(estado.minuto);
    const u = ultimoMarco.current;
    if (u && u.rodada === estado.rodada && u.minuto >= marco) return;
    ultimoMarco.current = { rodada: estado.rodada, minuto: marco };
    registrarSerie<Metricas>(estado.rodada, marco, metricas(estado));
  }, [estado, jogando, registrarSerie]);
  useEffect(
    () =>
      storeJogo.getState().assinarOcorrencias(({ ocorrencias, rodada: r }) => {
        registrarEventos(r, eventosRelevantes(r, ocorrencias));
      }),
    [registrarEventos],
  );

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
    if (semEstado && !jogando) {
      return (
        <TelaAviso
          sala={sala}
          titulo="Não foi possível retomar o jogo"
          conexao={conexaoTela}
          acoes={
            <Button variante="amarelo" tamanho="p" onClick={() => void onReentrar()}>
              Tentar de novo
            </Button>
          }
        >
          {semEstado}
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

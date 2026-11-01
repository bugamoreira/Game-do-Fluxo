// ============================================================
// Painel do facilitador (F0–F5, docs/design.md §5–6).
// Tudo deriva do status da turma, consultado a cada 1 s (sem Realtime).
// O painel só muda o status pelas RPCs do facilitador; as outras telas
// (jogo e telão) acompanham sozinhas.
// ============================================================

import { useCallback, useState } from 'react';
import {
  Button,
  ClockBar,
  ConnectionBanner,
  Icone,
  Sidebar,
  Toast,
  ToastArea,
  type ItemSidebar,
  type TipoToast,
} from '../shared/components/ui';
import type { AbrirTurmaEntrada, EstadoTurma, SessaoFacilitador } from '../shared/schemas';
import { CodigoEmUso, SemConexao, TurmaNaoEncontrada } from '../shared/services/erros';
import { DialogoConfirmacao } from './componentes/DialogoConfirmacao';
import { ModoTelao } from './componentes/ModoTelao';
import { confirmacaoPara, type Confirmacao } from './logica/confirmacoes';
import { mensagemDeErro } from './logica/erros';
import {
  NOME_RODADA,
  contarProntos,
  emRodada,
  faseDoStatus,
  fasesAlcancadas,
  linkRelatorio,
  linkTelao,
  proximaAcao,
  type Fase,
} from './logica/fases';
import type { ServicosFacilitador } from './servicos';
import { AbrirTurma, CODIGO_PADRAO } from './telas/AbrirTurma';
import { AoVivo } from './telas/AoVivo';
import { Debrief } from './telas/Debrief';
import { Login } from './telas/Login';
import { Resultado } from './telas/Resultado';
import { Sala } from './telas/Sala';
import { chaveAcao, type AcaoPainel, type PropsTela } from './tipos';
import { useTurmaFacilitador } from './useTurmaFacilitador';

const CHAVE_CODIGO = 'cbmede.facilitador.codigo';

/** Código da última turma acompanhada neste navegador (conveniência; falha de armazenamento não quebra). */
function lerCodigoGuardado(): string | null {
  try {
    return localStorage.getItem(CHAVE_CODIGO);
  } catch {
    return null;
  }
}

function guardarCodigo(codigo: string): void {
  try {
    localStorage.setItem(CHAVE_CODIGO, codigo);
  } catch {
    /* sem armazenamento: o facilitador digita o código de novo */
  }
}

interface AppProps {
  servicos: ServicosFacilitador;
  /** Modo demonstração: começa já logado e com uma turma. */
  sessaoInicial?: SessaoFacilitador | null;
  codigoInicial?: string | null;
}

export function App({ servicos, sessaoInicial = null, codigoInicial }: AppProps) {
  const [sessao, setSessao] = useState<SessaoFacilitador | null>(sessaoInicial);

  if (!sessao) return <Login servicos={servicos} onEntrar={setSessao} />;
  return (
    <Painel
      servicos={servicos}
      sessao={sessao}
      codigoInicial={codigoInicial === undefined ? lerCodigoGuardado() : codigoInicial}
      onSair={() => {
        void servicos.sair().catch(() => {});
        setSessao(null);
      }}
    />
  );
}

interface ItemToast {
  id: number;
  tipo: TipoToast;
  titulo: string;
  texto?: string;
}

interface Pendente {
  confirmacao: Confirmacao;
  chave: string;
  executar: () => Promise<void>;
}

let proximoToast = 1;

function Painel({
  servicos,
  sessao,
  codigoInicial,
  onSair,
}: {
  servicos: ServicosFacilitador;
  sessao: SessaoFacilitador;
  codigoInicial: string | null;
  onSair: () => void;
}) {
  const origem = window.location.origin;
  const demo = servicos.modo === 'demo';
  const [codigo, setCodigo] = useState<string | null>(codigoInicial);
  const sala = useTurmaFacilitador(servicos, codigo);
  const { turma, grupos, minutoServidor: minuto, registrarAcao } = sala;
  const naoEncontrada = sala.erro instanceof TurmaNaoEncontrada;

  const [vista, setVista] = useState<Fase | null>(null);
  const [statusAnterior, setStatusAnterior] = useState(turma?.status ?? null);
  const [pendente, setPendente] = useState<Pendente | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ItemToast[]>([]);
  const [telao, setTelao] = useState(false);
  const [relatorio, setRelatorio] = useState<{ turmaId: string; slug: string } | null>(null);
  const [abrindo, setAbrindo] = useState(false);
  const [erroAbrir, setErroAbrir] = useState<string | null>(null);
  const [novaTurma, setNovaTurma] = useState(false);

  // Quando o status muda, a tela volta para a fase atual (estado derivado da renderização anterior).
  const statusAtual = turma?.status ?? null;
  if (statusAtual !== statusAnterior) {
    setStatusAnterior(statusAtual);
    setVista(null);
  }

  const avisar = useCallback((tipo: TipoToast, titulo: string, texto?: string) => {
    const id = proximoToast++;
    setToasts((t) => [...t.slice(-2), { id, tipo, titulo, texto }]);
  }, []);

  async function executar(chave: string, fn: () => Promise<EstadoTurma | void>, sucesso?: string): Promise<void> {
    setOcupado(chave);
    try {
      const r = await fn();
      if (r) registrarAcao(r);
      if (sucesso) avisar('sucesso', sucesso);
    } catch (e) {
      avisar('atencao', 'Não foi possível concluir', mensagemDeErro(e));
    } finally {
      setOcupado(null);
    }
  }

  function talvezConfirmar(confirmacao: Confirmacao | null, chave: string, fn: () => Promise<void>) {
    if (confirmacao) setPendente({ confirmacao, chave, executar: fn });
    else void fn();
  }

  async function abrirTurma(entrada: AbrirTurmaEntrada, substituir = false): Promise<void> {
    setAbrindo(true);
    setErroAbrir(null);
    try {
      const nova = await servicos.abrirTurma({ ...entrada, substituir });
      guardarCodigo(nova.codigo);
      setCodigo(nova.codigo);
      registrarAcao(nova);
      setNovaTurma(false);
      setRelatorio(null);
      setVista(null);
      avisar('sucesso', `Turma aberta com o código ${nova.codigo}`, 'Os grupos já podem entrar.');
    } catch (e) {
      if (e instanceof CodigoEmUso && !substituir) {
        setPendente({
          confirmacao: confirmacaoPara({ tipo: 'substituirTurma', codigo: entrada.codigo, detalhe: e.message })!,
          chave: 'abrir',
          executar: () => abrirTurma(entrada, true),
        });
      } else setErroAbrir(mensagemDeErro(e));
    } finally {
      setAbrindo(false);
    }
  }

  function acompanhar(c: string) {
    guardarCodigo(c);
    setCodigo(c);
    setNovaTurma(false);
    setErroAbrir(null);
  }

  function acionar(acao: AcaoPainel) {
    if (!turma) return;
    const id = turma.id;
    const chave = chaveAcao(acao);
    switch (acao.tipo) {
      case 'iniciarR1':
      case 'iniciarR2': {
        const rodada = acao.tipo === 'iniciarR1' ? 1 : 2;
        talvezConfirmar(confirmacaoPara({ tipo: 'iniciar', rodada, grupos }), chave, () =>
          executar(chave, () => servicos.mudarStatus(id, rodada === 1 ? 'rodada1' : 'rodada2')),
        );
        return;
      }
      case 'encerrar': {
        const rodada = turma.status === 'rodada2' ? 2 : 1;
        talvezConfirmar(confirmacaoPara({ tipo: 'encerrar', rodada, minuto }), chave, () =>
          executar(chave, () => servicos.mudarStatus(id, rodada === 1 ? 'debrief' : 'encerrada')),
        );
        return;
      }
      case 'pausar':
        void executar(chave, () => servicos.pausar(id));
        return;
      case 'retomar':
        void executar(chave, () => servicos.retomar(id));
        return;
      case 'musica':
        void executar(chave, () => servicos.alternarMusica(id, !turma.musicaMudo));
        return;
      case 'entrada':
        void executar(
          chave,
          () => servicos.liberarEntrada(id, !turma.entradaLiberada),
          turma.entradaLiberada ? 'Entrada de grupos novos fechada.' : 'Entrada liberada para grupos novos.',
        );
        return;
      case 'liberarFullCapacity':
        void executar(
          chave,
          () => servicos.liberarFullCapacity(id, true),
          'PCP (Full Capacity) liberado para todos os grupos.',
        );
        return;
      case 'revogarFullCapacity':
        void executar(chave, () => servicos.liberarFullCapacity(id, false), 'PCP (Full Capacity) revogado.');
        return;
      case 'reconexao': {
        const { grupo } = acao;
        if (grupo.reconexaoLiberada) {
          void executar(
            chave,
            () => servicos.liberarReconexao(grupo.id, false),
            `Reconexão de “${grupo.nome}” revogada.`,
          );
          return;
        }
        talvezConfirmar(confirmacaoPara({ tipo: 'liberarReconexao', nome: grupo.nome }), chave, () =>
          executar(chave, () => servicos.liberarReconexao(grupo.id, true), `Reconexão de “${grupo.nome}” liberada.`),
        );
        return;
      }
      case 'remover': {
        const { grupo } = acao;
        talvezConfirmar(confirmacaoPara({ tipo: 'removerGrupo', nome: grupo.nome }), chave, () =>
          executar(chave, () => servicos.removerGrupo(grupo.id), `Grupo “${grupo.nome}” removido.`),
        );
        return;
      }
      case 'gerarRelatorio':
        void executar(chave, async () => {
          const { slug } = await servicos.gerarRelatorio(id);
          setRelatorio({ turmaId: id, slug });
          sala.atualizarAgora();
          avisar('sucesso', 'Relatório pronto', 'Copie o link para compartilhar com a turma.');
        });
        return;
      case 'novaTurma':
        talvezConfirmar(confirmacaoPara({ tipo: 'novaTurma', codigo: turma.codigo }), chave, async () => {
          setNovaTurma(true);
          setErroAbrir(null);
        });
        return;
      case 'copiarLink':
        void navigator.clipboard
          ?.writeText(acao.link)
          .then(() => avisar('sucesso', 'Link copiado.'))
          .catch(() => avisar('atencao', 'Não foi possível copiar', 'Selecione o link e copie manualmente.'));
        return;
    }
  }

  function abrirJanelaTelao() {
    if (!codigo) return;
    const janela = window.open(linkTelao(origem, codigo, demo), 'telao-simulador', 'popup,width=1280,height=720');
    if (!janela)
      avisar(
        'atencao',
        'O navegador bloqueou a nova janela',
        'Permita janelas deste site ou use o modo telão nesta janela.',
      );
  }

  // ── O que mostrar ───────────────────────────────────────────
  const mostrarFormulario = !codigo || naoEncontrada || novaTurma;
  const faseAtual: Fase = turma && !mostrarFormulario ? faseDoStatus(turma.status) : 'sala';
  const alcancadas = turma && !mostrarFormulario ? fasesAlcancadas(turma.status) : (['sala'] as Fase[]);
  const fase = vista && alcancadas.includes(vista) ? vista : faseAtual;
  const { conectados, total } = contarProntos(grupos);
  const linkRel = relatorio && turma && relatorio.turmaId === turma.id ? linkRelatorio(origem, relatorio.slug) : null;
  const proxima = turma ? proximaAcao(turma, minuto, grupos, linkRel !== null) : null;

  const itensMenu: ItemSidebar[] = [
    {
      id: 'sala',
      rotulo: 'Sala',
      icone: <Icone nome="sala" />,
      selo: turma && !mostrarFormulario ? `${conectados}/${total}` : undefined,
    },
    {
      id: 'aovivo',
      rotulo: 'Ao vivo',
      icone: <Icone nome="aoVivo" />,
      selo: turma && emRodada(turma.status) && !mostrarFormulario ? `R${turma.rodada ?? 1}` : undefined,
      desabilitado: !alcancadas.includes('aovivo'),
    },
    {
      id: 'debrief',
      rotulo: 'Debrief',
      icone: <Icone nome="debrief" />,
      desabilitado: !alcancadas.includes('debrief'),
    },
    {
      id: 'resultado',
      rotulo: 'Resultado',
      icone: <Icone nome="trofeu" />,
      desabilitado: !alcancadas.includes('resultado'),
    },
  ];

  const conexao =
    sala.conexao === 'offline' || sala.ranking.conexao === 'offline'
      ? 'offline'
      : sala.conexao === 'reconectando' || sala.ranking.conexao === 'reconectando'
        ? 'reconectando'
        : 'online';
  const erroLeitura =
    sala.erro && !naoEncontrada && !(sala.erro instanceof SemConexao) && conexao === 'online'
      ? mensagemDeErro(sala.erro)
      : null;

  const props: PropsTela | null =
    turma && proxima && !mostrarFormulario
      ? {
          turma,
          minuto,
          grupos,
          ranking: sala.ranking.itens,
          proxima,
          ocupado,
          acionar,
          linkRelatorio: linkRel,
          origem,
        }
      : null;

  const titulo = !props
    ? 'Abrir a turma'
    : fase === 'sala'
      ? props.turma.status === 'aberta'
        ? 'Sala de espera'
        : 'Grupos na sala'
      : fase === 'aovivo'
        ? emRodada(props.turma.status)
          ? `${NOME_RODADA[props.turma.rodada ?? 1]} ao vivo`
          : `${NOME_RODADA[props.turma.rodada ?? 1]} encerrado`
        : fase === 'debrief'
          ? 'Debrief do Plantão Travado'
          : 'Resultado da turma';

  return (
    <div className="flex h-screen min-h-0 bg-fundo-app font-sora text-texto-corpo">
      <Sidebar
        itens={itensMenu}
        ativo={fase}
        onSelecionar={(idFase) => setVista(idFase as Fase)}
        cabecalho={
          <div>
            <p className="font-space-mono text-rotulo font-bold uppercase tracking-[0.18em] text-amarelo">
              Facilitador
            </p>
            <p className="mt-1 text-xl leading-tight font-bold">
              Simulador do <span className="text-amarelo">Plantão</span>
            </p>
          </div>
        }
        rodape={
          <div className="flex flex-col gap-3">
            <Button
              variante="contorno"
              sobreEscuro
              tamanho="p"
              larguraTotal
              disabled={!codigo || mostrarFormulario}
              icone={<Icone nome="telao" tamanho={18} />}
              onClick={abrirJanelaTelao}
            >
              Abrir telão
            </Button>
            <Button
              variante="fantasma"
              sobreEscuro
              tamanho="p"
              larguraTotal
              disabled={!codigo || mostrarFormulario}
              onClick={() => setTelao(true)}
            >
              Modo telão nesta janela
            </Button>
            <img src="/img/brand/abramede.png" alt="ABRAMEDE" className="mt-2 w-full rounded-xl" />
            <p className="text-xs text-white/70">CBMEDE 2026 · Rio de Janeiro</p>
            <div className="flex items-center justify-between gap-2 border-t border-white/15 pt-3">
              <p className="min-w-0 truncate text-xs text-white/80" title={sessao.email}>
                {sessao.email}
              </p>
              <button
                type="button"
                onClick={onSair}
                className="min-h-10 shrink-0 rounded-pilula px-3 text-xs font-bold text-white hover:bg-white/10"
              >
                Sair
              </button>
            </div>
          </div>
        }
      />

      <main className="flex min-w-0 flex-1 flex-col gap-6 overflow-y-auto p-8">
        <header className="flex items-end justify-between gap-8">
          <div className="min-w-0 flex-1">
            <p className="truncate font-space-mono text-rotulo font-bold uppercase tracking-[0.18em] text-texto-suave">
              {props
                ? [
                    props.turma.nome,
                    props.turma.evento,
                    `Sala ${props.turma.codigo}`,
                    `${conectados} de ${total} conectados`,
                  ]
                    .filter(Boolean)
                    .join(' · ')
                : 'Painel do facilitador'}
              {demo && (
                <span className="ml-3 rounded-pilula bg-amarelo px-2 py-0.5 tracking-normal text-marinho-profundo normal-case">
                  Modo demonstração
                </span>
              )}
            </p>
            <h1 className="text-titulo-m font-bold text-texto">{titulo}</h1>
          </div>
          {props && emRodada(props.turma.status) && minuto !== null && (
            <ClockBar
              minuto={minuto}
              rotulo={NOME_RODADA[props.turma.rodada ?? 1]}
              pausado={props.turma.pausada}
              className="w-[420px] shrink-0"
            />
          )}
        </header>

        <ConnectionBanner conexao={conexao} simulacaoLocal={false} />
        {erroLeitura && (
          <p
            role="status"
            className="rounded-2xl bg-amarelo-suave px-4 py-3 text-sm font-semibold text-marinho-profundo"
          >
            Não foi possível atualizar os dados: {erroLeitura}
          </p>
        )}

        {mostrarFormulario ? (
          <AbrirTurma
            codigoInicial={codigo ?? CODIGO_PADRAO}
            enviando={abrindo}
            erro={erroAbrir}
            aviso={naoEncontrada && !novaTurma ? `Não há turma com o código ${codigo}. Abra uma nova.` : null}
            onAbrir={(entrada) => void abrirTurma(entrada)}
            onRetomar={acompanhar}
          />
        ) : !props ? (
          <p role="status" className="rounded-cartao bg-cartao px-6 py-10 text-center text-lg shadow-cartao">
            Carregando a turma {codigo}…
          </p>
        ) : fase === 'sala' ? (
          <Sala {...props} />
        ) : fase === 'aovivo' ? (
          <AoVivo {...props} />
        ) : fase === 'debrief' ? (
          <Debrief {...props} />
        ) : (
          <Resultado {...props} />
        )}
      </main>

      <DialogoConfirmacao
        confirmacao={pendente?.confirmacao ?? null}
        carregando={pendente !== null && (ocupado === pendente.chave || (pendente.chave === 'abrir' && abrindo))}
        onCancelar={() => setPendente(null)}
        onConfirmar={() => {
          const p = pendente;
          if (!p) return;
          void p.executar().finally(() => setPendente(null));
        }}
      />

      {telao && codigo && <ModoTelao url={linkTelao(origem, codigo, demo)} onSair={() => setTelao(false)} />}

      <ToastArea>
        {toasts.map((t) => (
          <Toast
            key={t.id}
            tipo={t.tipo}
            titulo={t.titulo}
            duracaoMs={6000}
            onFechar={() => setToasts((lista) => lista.filter((x) => x.id !== t.id))}
          >
            {t.texto}
          </Toast>
        ))}
      </ToastArea>
    </div>
  );
}

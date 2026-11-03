// Relatório da turma (relatorio.html?r=<slug>), só leitura.
// ?demo=1 mostra uma turma de demonstração gerada no motor real, sem servidor.

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Button, Icone } from '../shared/components/ui';
import { DadosRelatorioInvalidos, lerDadosRelatorio } from './dados';
import { montarRelatorio, type RelatorioVista } from './transformar';
import { Logos } from './components/Base';
import { Capa, SecaoCarga, SecaoEvolucao, SecaoGrupos, SecaoMensagens, SecaoRanking, SecaoRegras } from './components/Secoes';

type Estado =
  | { fase: 'carregando' }
  | { fase: 'pronto'; vista: RelatorioVista; demo: boolean }
  | { fase: 'erro'; tipo: 'sem-link' | 'nao-encontrado' | 'sem-conexao' | 'invalido' };

function parametros() {
  const p = new URLSearchParams(window.location.search);
  return { slug: p.get('r')?.trim() ?? '', demo: p.get('demo') === '1' };
}

async function carregar(): Promise<Estado> {
  const { slug, demo } = parametros();
  if (demo) {
    // Gera depois de pintar a tela de espera (o motor leva alguns décimos de segundo).
    await new Promise(r => setTimeout(r, 30));
    const { gerarDadosDemo } = await import('./demo/gerarDemo');
    return { fase: 'pronto', vista: montarRelatorio(lerDadosRelatorio(gerarDadosDemo())), demo: true };
  }
  if (!slug) return { fase: 'erro', tipo: 'sem-link' };
  // Import dinâmico: o modo demonstração não precisa do cliente do Supabase.
  const { relatorioService, RelatorioNaoEncontrado, SemConexao } = await import('../shared/services');
  try {
    const rel = await relatorioService.obter(slug);
    const dados = lerDadosRelatorio(rel.dados);
    return { fase: 'pronto', vista: montarRelatorio(dados), demo: false };
  } catch (e) {
    if (e instanceof RelatorioNaoEncontrado) return { fase: 'erro', tipo: 'nao-encontrado' };
    if (e instanceof SemConexao) return { fase: 'erro', tipo: 'sem-conexao' };
    if (e instanceof DadosRelatorioInvalidos) return { fase: 'erro', tipo: 'invalido' };
    console.error('[relatorio] falha ao carregar', e);
    return { fase: 'erro', tipo: 'sem-conexao' };
  }
}

const ERROS: Record<Extract<Estado, { fase: 'erro' }>['tipo'], { titulo: string; texto: string; tentar: boolean }> = {
  'sem-link': {
    titulo: 'Falta o endereço do relatório',
    texto: 'Este endereço precisa do código do relatório no final (…/relatorio.html?r=…). Peça o link completo ao facilitador da turma.',
    tentar: false,
  },
  'nao-encontrado': {
    titulo: 'Relatório não encontrado',
    texto: 'O link pode ter sido copiado pela metade ou ter algum caractere a mais. Confira o endereço ou peça um novo link ao facilitador.',
    tentar: false,
  },
  'sem-conexao': {
    titulo: 'Sem conexão com o servidor',
    texto: 'Não foi possível buscar o relatório agora. Confira a internet e tente de novo em alguns segundos.',
    tentar: true,
  },
  invalido: {
    titulo: 'Não foi possível montar o relatório',
    texto: 'Os dados desta turma estão incompletos ou num formato que esta página não reconhece. Avise a equipe do Simulador do Fluxo.',
    tentar: false,
  },
};

function TelaSimples({ titulo, texto, children }: { titulo: string; texto: string; children?: ReactNode }) {
  return (
    <main className="grid min-h-screen place-items-center bg-degrade-cbmede px-4 py-12 text-white">
      <div className="flex w-full max-w-xl flex-col gap-6">
        <Logos />
        <div className="rounded-cartao-g border border-white/15 bg-white/6 p-8">
          <p className="mb-2 font-space-mono text-rotulo font-bold uppercase tracking-[0.18em] text-amarelo">Relatório da turma</p>
          <h1 className="font-sora text-titulo-s font-bold">{titulo}</h1>
          <p className="mt-3 leading-relaxed text-white/85">{texto}</p>
          {children && <div className="mt-6 flex flex-wrap gap-3">{children}</div>}
        </div>
      </div>
    </main>
  );
}

function BarraAcoes({ demo }: { demo: boolean }) {
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      window.prompt('Copie o link do relatório:', window.location.href);
    }
  };
  return (
    <div className="nao-imprimir sticky top-0 z-20 border-b border-borda bg-white/92 backdrop-blur">
      <div className="mx-auto flex max-w-[1040px] flex-wrap items-center gap-3 px-4 py-2.5 sm:px-8">
        <p className="mr-auto text-sm text-texto-suave">
          {demo ? (
            <span className="rounded-pilula bg-amarelo-suave px-3 py-1 font-semibold text-texto">Demonstração com dados fictícios</span>
          ) : (
            'Link somente para leitura: quem o recebe vê o relatório, mas não altera nada.'
          )}
        </p>
        <Button variante="contorno" tamanho="p" onClick={() => void copiar()} aria-live="polite">
          {copiado ? 'Link copiado' : 'Copiar link'}
        </Button>
        <Button variante="verde" tamanho="p" icone={<Icone nome="debrief" tamanho={16} />} onClick={() => window.print()}>
          Imprimir / salvar em PDF
        </Button>
      </div>
    </div>
  );
}

const SUMARIO = [
  ['regras', 'Regras'],
  ['ranking', 'Ranking'],
  ['grupos', 'Grupos'],
  ['evolucao', 'Evolução'],
  ['carga', 'Carga do gestor'],
  ['mensagens', 'Mensagens-chave'],
] as const;

function Relatorio({ vista, demo }: { vista: RelatorioVista; demo: boolean }) {
  useEffect(() => {
    document.title = `Relatório · ${vista.turma.nome} · Simulador do Fluxo`;
  }, [vista.turma.nome]);
  const gerado = vista.geradoEm ? new Date(vista.geradoEm) : null;
  return (
    <>
      <BarraAcoes demo={demo} />
      <Capa vista={vista} />
      <nav aria-label="Seções do relatório" className="nao-imprimir border-b border-borda bg-cartao">
        <ul className="mx-auto flex max-w-[1040px] flex-wrap gap-x-5 gap-y-1 px-4 py-3 text-sm font-semibold text-texto sm:px-8">
          {SUMARIO.map(([id, nome]) => (
            <li key={id}><a href={`#${id}`} className="underline-offset-4 hover:underline">{nome}</a></li>
          ))}
        </ul>
      </nav>
      <main className="mx-auto max-w-[1040px] px-4 sm:px-8">
        <SecaoRegras numero={1} />
        <SecaoRanking numero={2} vista={vista} />
        <SecaoGrupos numero={3} vista={vista} />
        <SecaoEvolucao numero={4} vista={vista} />
        <SecaoCarga numero={5} vista={vista} />
        <SecaoMensagens numero={6} vista={vista} />
      </main>
      <footer className="rodape mt-6 border-t border-borda bg-cartao">
        <div className="mx-auto flex max-w-[1040px] flex-wrap justify-between gap-3 px-4 py-6 text-xs text-texto-suave sm:px-8">
          <span>Simulador do Fluxo · ED Leaders · ABRAMEDE · CBMEDE 2026</span>
          <span>
            {gerado && !Number.isNaN(gerado.getTime()) && `Gerado em ${gerado.toLocaleString('pt-BR', { dateStyle: 'long', timeStyle: 'short' })}. `}
            {vista.versaoRegras && `Regras: ${vista.versaoRegras}. `}
            Só nomes de grupo e métricas do jogo; nenhum dado pessoal.
          </span>
        </div>
      </footer>
    </>
  );
}

export function App() {
  const [estado, setEstado] = useState<Estado>({ fase: 'carregando' });
  useEffect(() => {
    void carregar().then(setEstado);
  }, []);
  const iniciar = useCallback(() => {
    setEstado({ fase: 'carregando' });
    void carregar().then(setEstado);
  }, []);

  if (estado.fase === 'carregando') {
    return <TelaSimples titulo="Montando o relatório…" texto="Buscando os resultados da turma." />;
  }
  if (estado.fase === 'erro') {
    const e = ERROS[estado.tipo];
    return (
      <TelaSimples titulo={e.titulo} texto={e.texto}>
        {e.tentar && (
          <Button variante="amarelo" icone={<Icone nome="recarregar" tamanho={18} />} onClick={iniciar}>
            Tentar de novo
          </Button>
        )}
        <a href="relatorio.html?demo=1" className="inline-flex min-h-12 items-center rounded-pilula border-2 border-white/70 px-6 font-bold hover:bg-white/10">
          Ver um relatório de demonstração
        </a>
      </TelaSimples>
    );
  }
  return <Relatorio vista={estado.vista} demo={estado.demo} />;
}

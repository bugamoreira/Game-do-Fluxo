# Contratos — o que os subagentes compartilham

> Interfaces fixadas antes do trabalho paralelo. Quem precisar mudar um contrato para e pede: a mudança passa por mim e é refletida aqui antes de seguir. Código em `src/shared/`; nomes em português nas regras de negócio, como no domínio.

## 1. Motor da simulação (B1) — `src/shared/lib/simulation/`

Funções puras: sem React, sem rede, sem `Math.random` direto.

```ts
type Rodada = 1 | 2;

interface EstadoSimulacao {          // tudo o que é preciso para continuar o jogo de onde parou
  versao: number;                    // incrementa a cada passo ou ação
  rodada: Rodada;
  minuto: number;                    // 420..1140
  rng: number;                       // estado do gerador (mulberry32); garante reprodutibilidade
  pacientes: Patient[];
  cirurgias: Surgery[];
  stats: Stats;
  eventos: Events;
  flags: Record<string, boolean>;    // rounds e mensagens já disparados
  proximaChegada: number;
  ferramentas: { nirUsos: number; nirEspera: number; fcUsos: number; fcLiberado: boolean };
  log: LogEntry[];                   // últimas 60 entradas
}

type Acao =
  | { tipo: 'mover'; pacienteId: number; destino: Sector }
  | { tipo: 'confirmarForaDoPerfil'; pacienteId: number }
  | { tipo: 'nir'; pacienteId: number }
  | { tipo: 'fullCapacity'; pacienteId: number };

interface ResultadoPasso { estado: EstadoSimulacao; ocorrencias: Ocorrencia[] } // ocorrências alimentam log, som e eventos_jogo

criarEstadoInicial(rodada: Rodada, semente: number): EstadoSimulacao
passo(estado: EstadoSimulacao): ResultadoPasso                 // avança 1 minuto
avancarAte(estado: EstadoSimulacao, minuto: number): ResultadoPasso   // reconexão: avança sem decisões
aplicarAcao(estado: EstadoSimulacao, acao: Acao): ResultadoPasso | { erro: string }
destinosPossiveis(estado: EstadoSimulacao, pacienteId: number): Sector[]
pontuacao(estado: EstadoSimulacao): number
metricas(estado: EstadoSimulacao): Metricas                    // o mesmo formato do placar atual
```

Garantia testada: mesma semente + mesmas ações ⇒ mesmo resultado.

## 2. Services (B2) — `src/shared/services/`

Únicos módulos que falam com o Supabase. Toda resposta passa por schema Zod (`src/shared/schemas/`).

Há dois clientes em `src/shared/lib/supabase.ts`, criados só no primeiro uso. O **sem sessão** (`persistSession`, `autoRefreshToken` e `detectSessionInUrl` desligados, `storageKey` própria) atende o grupo, o telão sem login, as orientações e o relatório: não passa pela trava de sessão do auth-js, que no ensaio E2 demorava mais de 5 s sob carga. O **com sessão** atende só o login e as RPCs do facilitador (lista `RPC_COM_SESSAO` em `rpc.ts`, que escolhe o cliente pelo nome da RPC), inclusive o `codigo_acesso_telao` do telão aberto pela janela do facilitador.

```ts
turmaService.estado(codigo): Promise<EstadoTurma>
turmaService.ranking(codigo): Promise<ItemRanking[]>
grupoService.entrar(codigo, nome, tokenLocal?): Promise<Entrada>          // { grupo, token, estadoSalvo? } ou erro tipado
syncService.enviarEstado(token, estado: EstadoSimulacao): Promise<void>
syncService.obterEstado(token, rodada): Promise<EstadoSimulacao | null>
syncService.registrarSerie(token, rodada, minuto, metricas): Promise<void>
syncService.registrarEventos(token, ocorrencias): Promise<void>
facilitadorService.{login, sair, abrirTurma, mudarStatus, pausar, retomar, liberarEntrada,
                    liberarReconexao, liberarFullCapacity, alternarMusica, removerGrupo}
facilitadorService.sessaoAtual(): Promise<SessaoFacilitador | null>     // restaura a sessão do Supabase Auth
facilitadorService.painelTurma(turmaId): Promise<EstadoTurma>           // visão do facilitador (vistoEm, removido...)
facilitadorService.seriesTurma(turmaId, rodada?): Promise<PontoSerieTurma[]>
facilitadorService.eventosTurma(turmaId, { desdeMinuto?, rodada?, limite? }): Promise<EventoTurma[]>
facilitadorService.gerarRelatorio(turmaId, { versaoRegras?, local? }): Promise<{ slug; turma: EstadoTurma }>
relatorioService.gerar(turmaId, versaoRegras?, local?): Promise<{ slug; turma: EstadoTurma }>   // atalho
relatorioService.obter(slug): Promise<Relatorio>
```

Erros tipados (cap. 04, regra 15): `TurmaNaoEncontrada`, `EntradaFechada`, `GrupoJaAtivo`, `TokenInvalido`, `VersaoAntiga`, `SemConexao`.

## 3. Hooks de sincronização (B2) — `src/shared/hooks/`

```ts
useEstadoTurma(codigo, intervaloMs = 1000): {
  turma: EstadoTurma | null;
  conexao: 'online' | 'reconectando' | 'offline';
  minutoServidor: number | null;     // relógio do plantão já corrigido pela hora do servidor
}
useRanking(codigo): { itens: ItemRanking[]; conexao }
useSincronizarJogo(token, estado): { conexao; ultimaSincronizacao: Date | null }
// envia a cada 2 s, guarda cópia local a cada passo, backoff 1→2→4→8→15 s, nunca expulsa o grupo
```

## 4. Tipos de tela

```ts
type StatusTurma = 'aberta' | 'rodada1' | 'debrief' | 'rodada2' | 'encerrada' | 'arquivada';

interface EstadoTurma {
  id: string; codigo: string; nome: string; status: StatusTurma; rodada: Rodada | null;
  rodadaInicio: string | null; pausada: boolean; pausaAcumuladaMs: number; horaServidor: string;
  entradaLiberada: boolean; fullCapacityLiberado: boolean; musicaMudo: boolean;
  grupos: { id: string; nome: string; cor: string; conectado: boolean }[];
}
interface ItemRanking { grupoId: string; nome: string; cor: string; rodada: Rodada; pontuacao: number; metricas: Metricas; minuto: number }
```

## 5. Componentes base (B3) — `src/shared/components/ui/`

Props mínimas fixadas para as telas (C1–C4) poderem começar antes do acabamento visual:

```ts
<Button variante="verde"|"marinho"|"amarelo"|"contorno"|"fantasma" tamanho="p"|"m"|"g" />
<Card />  <SectorTile setor="de"|"enf"|"uti"|"rpa"|"cc"|"triagem" ocupacao={n} capacidade={n} />
<PatientChip paciente={Patient} selecionado? destacado? onClick />
<StatTile rotulo valor variacao? />  <DarkCallout titulo>conteúdo</DarkCallout>
<Timeline itens={LogEntry[]} />  <RankingTable itens={ItemRanking[]} />
<ClockBar minuto={n} />  <ConnectionBanner conexao />  <TeamAvatar nome cor />
<Modal aberto onFechar titulo />  <Toast />  <Sidebar itens ativo />
```

## 6. Quem é dono de quê

| Agente | Pode editar | Só lê |
|---|---|---|
| B1 Motor | `src/shared/lib/simulation/`, `src/shared/lib/game-engine.ts`, testes do motor | tipos em `src/shared/types/` |
| B2 Sala e sincronização | `src/shared/services/`, `src/shared/hooks/`, `src/shared/schemas/`, `vite.config.ts`, `netlify.toml` | contratos 1 e 4 |
| B3 Design system | `src/index.css`, `src/shared/components/ui/`, `ui.html` | `docs/design.md` |
| B4 Banco e segurança | `supabase/`, `docs/schema.md` | contratos 2 e 4 |
| C1 Jogo | `src/player/` | todo `src/shared/` |
| C2 Facilitador | `src/instructor/` | todo `src/shared/` |
| C3 Telão e música | `src/projector/`, `src/shared/lib/music.ts` | todo `src/shared/` |
| C4 Relatório | `src/report/`, `relatorio.html` | todo `src/shared/` |

`src/shared/types/` e este documento são meus. Mudança neles passa por mim.

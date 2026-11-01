import { useState, type ReactNode } from 'react';
import {
  Button,
  Card,
  ClockBar,
  ConnectionBanner,
  DarkCallout,
  Icone,
  Modal,
  PatientChip,
  RankingTable,
  SectorTile,
  StatTile,
  TeamAvatar,
  Timeline,
  Toast,
  ToastArea,
  type VarianteBotao,
} from '../shared/components/ui';
import { LOG, MINUTO_AGORA, PACIENTE_OBITO, PACIENTES_DE, RANKING, paciente } from './dados';
import { MockFacilitador } from './MockFacilitador';
import { MockJogo } from './MockJogo';
import { MockTelao } from './MockTelao';

function Secao({ id, titulo, children, nota }: { id: string; titulo: string; nota?: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-t`} className="scroll-mt-6">
      <p className="mb-1 flex items-center gap-3 font-space-mono text-rotulo font-bold uppercase tracking-[0.22em] text-verde-texto">
        <span aria-hidden="true" className="inline-block h-0.5 w-9 bg-verde" />
        Componente
      </p>
      <h2 id={`${id}-t`} className="text-titulo-s font-bold text-texto">{titulo}</h2>
      {nota && <p className="mt-1 max-w-3xl text-sm">{nota}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

const CORES: Array<[string, string, string]> = [
  ['marinho', '#1B2A6B', 'bg-marinho'],
  ['marinho-profundo', '#0e1840', 'bg-marinho-profundo'],
  ['amarelo', '#F5C518', 'bg-amarelo'],
  ['verde', '#3DB54A', 'bg-verde'],
  ['fundo-app', '#F4F5FA', 'bg-fundo-app'],
  ['borda', '#E3E5F0', 'bg-borda'],
  ['setor-de', '#ECEBFB', 'bg-setor-de'],
  ['setor-enf', '#E3F5EA', 'bg-setor-enf'],
  ['setor-uti', '#FDEBE3', 'bg-setor-uti'],
  ['setor-rpa / cc', '#FBF3D9', 'bg-setor-rpa'],
  ['setor-triagem', '#EEF0F4', 'bg-setor-triagem'],
  ['grav-vermelho', '#E53935', 'bg-grav-vermelho'],
  ['grav-laranja', '#F57C00', 'bg-grav-laranja'],
  ['grav-amarelo', '#FBC02D', 'bg-grav-amarelo'],
  ['grav-verde', '#43A047', 'bg-grav-verde'],
];

const TIMES = ['#2563EB', '#7C3AED', '#DB2777', '#0E7490', '#0F766E', '#8B5E3C', '#475569', '#A21CAF'];
const VARIANTES: VarianteBotao[] = ['verde', 'marinho', 'amarelo', 'contorno', 'fantasma'];

export function Catalogo() {
  const [modalAberto, setModalAberto] = useState(false);
  const [toasts, setToasts] = useState<number[]>([]);
  const [selecionado, setSelecionado] = useState(true);

  return (
    <div className="font-sora text-texto-corpo">
      <header className="bg-degrade-cbmede px-10 py-12 text-white">
        <p className="font-space-mono text-rotulo font-bold uppercase tracking-[0.22em] text-amarelo">— Design system · CBMEDE 2026</p>
        <h1 className="mt-2 text-titulo-g font-extrabold">
          Simulador do <span className="text-amarelo">Plantão</span>
        </h1>
        <p className="mt-3 max-w-2xl text-lg font-light text-white/85">
          Componentes base em <code className="font-space-mono">src/shared/components/ui</code>. Telas montadas no fim:{' '}
          <a className="font-bold text-amarelo underline underline-offset-4" href="#jogo">jogo</a>,{' '}
          <a className="font-bold text-amarelo underline underline-offset-4" href="#facilitador">facilitador</a> e{' '}
          <a className="font-bold text-amarelo underline underline-offset-4" href="#telao">telão</a>.
        </p>
      </header>

      <main className="mx-auto flex max-w-[1240px] flex-col gap-14 px-10 py-12">
        <Secao id="tokens" titulo="Tokens de cor" nota="Manchester (grav-*) só em paciente e risco. Times: 8 cores, nenhuma de Manchester.">
          <div className="grid grid-cols-5 gap-3">
            {CORES.map(([nome, hex, classe]) => (
              <div key={nome} className="overflow-hidden rounded-2xl border border-borda bg-cartao">
                <div className={`h-14 ${classe}`} />
                <p className="px-3 pt-2 text-sm font-semibold text-texto">{nome}</p>
                <p className="px-3 pb-2 font-space-mono text-xs">{hex}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {TIMES.map((c, i) => (
              <TeamAvatar key={c} nome={`Time ${i + 1}`} cor={c} comNome />
            ))}
          </div>
        </Secao>

        <Secao id="botoes" titulo="Button" nota="Verde = ação principal, um por tela. Todos com alvo mínimo de 40 px.">
          <Card espaco="m">
            <div className="flex flex-col gap-4">
              {(['g', 'm', 'p'] as const).map(t => (
                <div key={t} className="flex flex-wrap items-center gap-3">
                  {VARIANTES.map(v => (
                    <Button key={v} variante={v} tamanho={t}>
                      {v === 'verde' ? 'Iniciar rodada' : v === 'amarelo' ? 'Autorizar' : v[0]!.toUpperCase() + v.slice(1)}
                    </Button>
                  ))}
                </div>
              ))}
              <div className="flex flex-wrap items-center gap-3">
                <Button variante="verde" disabled>Desabilitado</Button>
                <Button variante="marinho" carregando>Entrando…</Button>
                <Button variante="marinho" icone={<Icone nome="play" tamanho={18} />}>Com ícone</Button>
              </div>
            </div>
          </Card>
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-cartao bg-degrade-cbmede p-6">
            <Button variante="amarelo">Sobre o degradê</Button>
            <Button variante="contorno" sobreEscuro>Contorno</Button>
            <Button variante="fantasma" sobreEscuro>Fantasma</Button>
          </div>
        </Secao>

        <Secao id="pacientes" titulo="PatientChip" nota="Ponto Manchester com número de prioridade (1 vermelho … 4 verde), nome, tempo e ícone de estado. Clique para alternar seleção.">
          <Card espaco="m">
            <div className="flex flex-wrap items-center gap-3">
              <PatientChip paciente={paciente({ name: 'Helena', sev: 'red', arrMin: 610 })} minuto={MINUTO_AGORA} onClick={() => undefined} />
              <PatientChip paciente={paciente({ name: 'Diana', sev: 'orange', arrMin: 615 })} minuto={MINUTO_AGORA} onClick={() => undefined} />
              <PatientChip paciente={paciente({ name: 'Joana', sev: 'yellow', arrMin: 590 })} minuto={MINUTO_AGORA} onClick={() => undefined} />
              <PatientChip paciente={paciente({ name: 'Pedro', sev: 'green', arrMin: 620 })} minuto={MINUTO_AGORA} onClick={() => undefined} />
              <PatientChip paciente={PACIENTES_DE[1]!} selecionado={selecionado} onClick={() => setSelecionado(s => !s)} />
              <PatientChip paciente={PACIENTES_DE[0]!} destacado minuto={MINUTO_AGORA} onClick={() => undefined} />
            </div>
            <p className="mt-5 mb-2 text-sm font-bold text-texto">Boarding (barra de risco 3 h / 6 h) e estados</p>
            <div className="flex flex-wrap items-center gap-3">
              <PatientChip paciente={PACIENTES_DE[4]!} onClick={() => undefined} />
              <PatientChip paciente={PACIENTES_DE[5]!} onClick={() => undefined} />
              <PatientChip paciente={PACIENTES_DE[7]!} onClick={() => undefined} />
              <PatientChip paciente={PACIENTES_DE[3]!} minuto={MINUTO_AGORA} onClick={() => undefined} />
              <PatientChip paciente={PACIENTES_DE[6]!} minuto={MINUTO_AGORA} onClick={() => undefined} />
              <PatientChip paciente={PACIENTES_DE[13]!} minuto={MINUTO_AGORA} onClick={() => undefined} />
              <PatientChip paciente={PACIENTE_OBITO} onClick={() => undefined} />
            </div>
            <p className="mt-5 mb-2 text-sm font-bold text-texto">Compacto (enfermaria)</p>
            <div className="flex flex-wrap items-center gap-2">
              {(['red', 'orange', 'yellow', 'green'] as const).map((s, i) => (
                <PatientChip key={s} compacto paciente={paciente({ name: `P${i}`, sev: s, dischReady: i === 3 })} onClick={() => undefined} />
              ))}
              <PatientChip compacto selecionado paciente={paciente({ name: 'Sel', sev: 'yellow' })} onClick={() => undefined} />
            </div>
          </Card>
        </Secao>

        <Secao id="setores" titulo="SectorTile" nota="O tom pastel identifica o setor; lotação vai na barra e no número. A partir de 85% vira risco (texto + barra).">
          <div className="grid grid-cols-3 gap-5">
            <SectorTile setor="de" ocupacao={9} capacidade={15}>
              {PACIENTES_DE.slice(0, 3).map(p => <PatientChip key={p.id} paciente={p} minuto={MINUTO_AGORA} onClick={() => undefined} />)}
            </SectorTile>
            <SectorTile setor="enf" ocupacao={78} capacidade={85} />
            <SectorTile setor="uti" ocupacao={15} capacidade={15} />
            <SectorTile setor="rpa" titulo="RPA" ocupacao={2} capacidade={3} destacado onMover={() => undefined} />
            <SectorTile setor="cc" ocupacao={4} capacidade={9} />
            <SectorTile setor="triagem" ocupacao={3} capacidade={6} />
          </div>
        </Secao>

        <Secao id="numeros" titulo="StatTile">
          <div className="grid grid-cols-4 gap-4">
            <StatTile rotulo="Pontuação" valor={812} variacao={52} referencia="vs. 10:00" />
            <StatTile rotulo="Boarding" valor="6,5 h" variacao={2} sentidoBom="descer" referencia="vs. R1" tom="de" />
            <StatTile rotulo="Altas" valor={31} variacao={0} tom="enf" />
            <StatTile rotulo="Os Fluxistas" valor={812} cor="#2563EB" tendencia={[420, 520, 610, 690, 760, 812]} />
          </div>
        </Secao>

        <div className="grid grid-cols-2 gap-10">
          <Secao id="momento" titulo="DarkCallout">
            <DarkCallout
              rotulo="Evento ativo"
              titulo="Surto: 3 pacientes chegando"
              icone={<Icone nome="raio" tamanho={22} />}
              acoes={<Button variante="amarelo" tamanho="p">Ver quem chega</Button>}
            >
              Ambulâncias em 15 min. Abra espaço no DE agora.
            </DarkCallout>
          </Secao>
          <Secao id="linha" titulo="Timeline">
            <Timeline itens={LOG} max={4} />
          </Secao>
        </div>

        <Secao id="ranking" titulo="RankingTable" nota="6 grupos; o grupo deste computador aparece em amarelo.">
          <Card grande>
            <RankingTable itens={RANKING} destaqueGrupoId="g3" />
          </Card>
        </Secao>

        <div className="grid grid-cols-2 gap-10">
          <Secao id="relogio" titulo="ClockBar">
            <Card className="flex flex-col gap-6">
              <ClockBar minuto={420} rotulo="Início" />
              <ClockBar minuto={MINUTO_AGORA} rotulo="Plantão Lean · Rodada 2" />
              <ClockBar minuto={1050} rotulo="Rodada 1" pausado />
            </Card>
          </Secao>
          <Secao id="conexao" titulo="ConnectionBanner" nota="'online' não mostra nada (fica só a região de anúncio).">
            <div className="flex flex-col gap-3">
              <ConnectionBanner conexao="reconectando" />
              <ConnectionBanner conexao="offline" />
              <ConnectionBanner conexao="reconectando" simulacaoLocal={false} />
            </div>
          </Secao>
        </div>

        <div className="grid grid-cols-2 gap-10">
          <Secao id="avisos" titulo="Toast e Modal">
            <div className="flex flex-col gap-3">
              <Toast tipo="sucesso" titulo="Alta registrada">Leito liberado na enfermaria.</Toast>
              <Toast tipo="atencao" titulo="Full Capacity autorizado" onFechar={() => undefined}>Use com critério: 2 usos.</Toast>
              <Toast titulo="Facilitador pausou o plantão" />
              <div className="mt-2 flex gap-3">
                <Button variante="marinho" onClick={() => setModalAberto(true)} data-testid="abrir-modal">Abrir modal</Button>
                <Button variante="contorno" onClick={() => setToasts(t => [...t, Date.now()])}>Mostrar aviso</Button>
              </div>
            </div>
          </Secao>
          <Secao id="avatares" titulo="TeamAvatar">
            <Card className="flex flex-wrap gap-5">
              <TeamAvatar nome="Os Fluxistas" cor="#2563EB" tamanho="g" conectado comNome />
              <TeamAvatar nome="Time Lean" cor="#7C3AED" conectado={false} comNome />
              <TeamAvatar nome="NIR Já" cor="#DB2777" tamanho="p" comNome />
              <TeamAvatar nome="Cor antiga" cor="#eab308" comNome />
            </Card>
          </Secao>
        </div>
      </main>

      <div className="flex flex-col gap-10 bg-marinho-profundo py-10">
        <h2 className="px-10 font-space-mono text-rotulo font-bold uppercase tracking-[0.22em] text-amarelo">— Telas montadas</h2>
        <div id="jogo" className="mx-10 overflow-hidden rounded-cartao-g"><MockJogo conexao="reconectando" /></div>
        <div id="facilitador" className="mx-10 overflow-hidden rounded-cartao-g"><MockFacilitador /></div>
        <div id="telao" className="mx-10 overflow-hidden rounded-cartao-g"><MockTelao /></div>
      </div>

      <Modal
        aberto={modalAberto}
        onFechar={() => setModalAberto(false)}
        titulo="Começar uma nova turma?"
        descricao="Todos os grupos e placares desta turma saem da sala. O relatório já gerado continua disponível."
        acoes={
          <>
            <Button variante="fantasma" onClick={() => setModalAberto(false)}>Cancelar</Button>
            <Button variante="verde" onClick={() => setModalAberto(false)}>Nova turma</Button>
          </>
        }
      />
      <ToastArea>
        {toasts.map(id => (
          <Toast key={id} tipo="sucesso" titulo="Aviso de teste" duracaoMs={4000} onFechar={() => setToasts(t => t.filter(x => x !== id))}>
            Some sozinho em 4 s.
          </Toast>
        ))}
      </ToastArea>
    </div>
  );
}

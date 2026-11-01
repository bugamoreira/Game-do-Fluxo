import { useState } from 'react';
import type { Patient } from '../shared/types/game';
import {
  Button,
  ClockBar,
  ConnectionBanner,
  DarkCallout,
  Icone,
  PatientChip,
  SectorTile,
  TeamAvatar,
  Timeline,
  type Conexao,
} from '../shared/components/ui';
import { LOG, MINUTO_AGORA, PACIENTES_DE, PACIENTES_ENF, PACIENTES_RPA, PACIENTES_TRIAGEM, PACIENTES_UTI } from './dados';

/** Tela J3 (Plantão Travado) montada só com os componentes base. */
export function MockJogo({ conexao = 'online' }: { conexao?: Conexao }) {
  const [selecionado, setSelecionado] = useState<number | null>(PACIENTES_DE[1]!.id);
  const sel = PACIENTES_DE.find(p => p.id === selecionado) ?? null;
  const destinos = sel ? (sel.dest === 'uti' ? ['uti'] : ['enf']) : [];

  function handleClickPaciente(p: Patient) {
    setSelecionado(atual => (atual === p.id ? null : p.id));
  }

  return (
    <div className="flex min-h-[900px] flex-col gap-5 bg-fundo-app p-6 font-sora text-texto-corpo">
      <header className="flex items-center gap-6 rounded-cartao border border-borda bg-cartao px-6 py-4 shadow-cartao">
        <div className="flex items-center gap-3">
          <TeamAvatar nome="Os Fluxistas" cor="#2563EB" tamanho="g" conectado={conexao === 'online'} />
          <div>
            <p className="font-space-mono text-rotulo font-bold uppercase tracking-[0.18em] text-texto-suave">Seu grupo</p>
            <h1 className="text-xl font-bold text-texto">Os Fluxistas</h1>
          </div>
        </div>
        <ClockBar minuto={MINUTO_AGORA} rotulo="Plantão Travado · Rodada 1" className="flex-1" />
        <div className="flex items-center gap-2 rounded-pilula bg-marinho px-5 py-2.5 text-white">
          <span className="font-space-mono text-rotulo font-bold uppercase tracking-[0.18em] text-amarelo">Pontos</span>
          <span className="font-space-mono text-2xl font-bold tabular-nums">812</span>
        </div>
      </header>

      <ConnectionBanner conexao={conexao} />

      <div className="grid flex-1 grid-cols-[minmax(0,1fr)_380px] gap-5">
        <main className="grid grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] gap-5">
          <div className="flex flex-col gap-5">
            <SectorTile setor="triagem" ocupacao={PACIENTES_TRIAGEM.length} capacidade={6}>
              {PACIENTES_TRIAGEM.map(p => (
                <PatientChip key={p.id} paciente={p} minuto={MINUTO_AGORA} onClick={handleClickPaciente} selecionado={p.id === selecionado} />
              ))}
            </SectorTile>
            <SectorTile setor="de" ocupacao={PACIENTES_DE.length} capacidade={15} className="flex-1">
              {PACIENTES_DE.map(p => (
                <PatientChip key={p.id} paciente={p} minuto={MINUTO_AGORA} onClick={handleClickPaciente} selecionado={p.id === selecionado} />
              ))}
            </SectorTile>
          </div>
          <div className="flex flex-col gap-5">
            <SectorTile
              setor="enf"
              ocupacao={78}
              capacidade={85}
              destacado={destinos.includes('enf')}
              onMover={() => setSelecionado(null)}
            >
              {PACIENTES_ENF.map(p => (
                <PatientChip key={p.id} paciente={p} compacto onClick={handleClickPaciente} />
              ))}
              <span className="self-center pl-1 text-xs font-semibold text-texto-suave">+56 internados</span>
            </SectorTile>
            <SectorTile
              setor="uti"
              ocupacao={14}
              capacidade={15}
              destacado={destinos.includes('uti')}
              onMover={() => setSelecionado(null)}
            >
              {PACIENTES_UTI.map(p => (
                <PatientChip key={p.id} paciente={p} compacto onClick={handleClickPaciente} />
              ))}
              <span className="self-center pl-1 text-xs font-semibold text-texto-suave">+10</span>
            </SectorTile>
            <div className="grid grid-cols-2 gap-5">
              <SectorTile setor="rpa" titulo="RPA" ocupacao={PACIENTES_RPA.length} capacidade={3}>
                {PACIENTES_RPA.map(p => (
                  <PatientChip key={p.id} paciente={p} compacto onClick={handleClickPaciente} />
                ))}
              </SectorTile>
              <SectorTile
                setor="cc"
                titulo="Cirurgias"
                ocupacao={4}
                capacidade={9}
                extra={<Icone nome="relogio" tamanho={18} className="text-texto-suave" />}
              >
                <p className="text-sm">
                  Próxima: <strong className="text-texto">11:30</strong> · sala 2 → UTI
                </p>
              </SectorTile>
            </div>
          </div>
        </main>

        <aside className="flex flex-col gap-5" aria-label="Eventos do plantão">
          <DarkCallout
            rotulo="Evento ativo"
            titulo="Surto: 3 pacientes chegando"
            icone={<Icone nome="raio" tamanho={22} />}
            aoVivo
            acoes={<Button variante="amarelo" tamanho="p">Ver quem chega</Button>}
          >
            Ambulâncias em 15 min. Abra espaço no DE agora: quem já pode subir ou ter alta?
          </DarkCallout>
          <section className="flex-1 rounded-cartao border border-borda bg-cartao p-5 shadow-cartao">
            <h2 className="mb-4 text-lg font-bold text-texto">Linha do plantão</h2>
            <Timeline itens={LOG.slice(1)} max={6} />
          </section>
        </aside>
      </div>
    </div>
  );
}

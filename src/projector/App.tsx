// Telão — projetor.html?sala=CODIGO (padrão CBMEDE).
// Demonstração: projetor.html?demo=1&fase=aberta|rodada1|debrief|rodada2|encerrada[&minuto=900]

import { Suspense, lazy } from 'react';
import { SALA_PADRAO } from './derivar';
import { TelaoDemo } from './demo/TelaoDemo';
import { lerFaseDemo } from './demo/dadosDemo';

const AoVivo = lazy(() => import('./AoVivo'));

function lerParametros() {
  const p = new URLSearchParams(window.location.search);
  const sala = (p.get('sala') ?? SALA_PADRAO).trim().toUpperCase() || SALA_PADRAO;
  const demo = p.get('demo') === '1';
  const minuto = Number(p.get('minuto'));
  return {
    sala,
    demo,
    fase: lerFaseDemo(p.get('fase')),
    minuto: Number.isInteger(minuto) && minuto >= 420 && minuto <= 1140 ? minuto : undefined,
  };
}

export function App() {
  const { sala, demo, fase, minuto } = lerParametros();
  if (demo) return <TelaoDemo fase={fase} minutoInicial={minuto} />;
  return (
    <Suspense fallback={<div className="fixed inset-0 bg-marinho-profundo" />}>
      <AoVivo sala={sala} />
    </Suspense>
  );
}

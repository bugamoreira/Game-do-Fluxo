// Modo demonstração: projetor.html?demo=1&fase=aberta|rodada1|debrief|rodada2|encerrada
// Dados falsos e relógio local (1 s = 1 minuto de plantão), sem servidor.

import { useEffect, useMemo, useState } from 'react';
import { Telao } from '../Telao';
import { MINUTO_INICIAL_DEMO, rankingDemo, turmaDemo, type FaseDemo } from './dadosDemo';

export function TelaoDemo({ fase, minutoInicial }: { fase: FaseDemo; minutoInicial?: number }) {
  const emRodada = fase === 'rodada1' || fase === 'rodada2';
  const [inicio] = useState(() => Date.now());
  const [agora, setAgora] = useState(inicio);

  useEffect(() => {
    if (!emRodada) return;
    const id = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(id);
  }, [emRodada]);

  const base = minutoInicial ?? MINUTO_INICIAL_DEMO;
  const minuto = Math.min(1140, base + Math.floor((agora - inicio) / 1000));
  const turma = useMemo(() => turmaDemo(fase, minuto, agora), [fase, minuto, agora]);
  const itens = useMemo(() => rankingDemo(fase, minuto), [fase, minuto]);

  return (
    <Telao
      sala="CBMEDE"
      turma={turma}
      itens={itens}
      minuto={emRodada ? minuto : null}
      conexao="online"
      carregando={false}
      turmaInexistente={false}
    />
  );
}

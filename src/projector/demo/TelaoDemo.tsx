// Modo demonstração: projetor.html?demo=1&fase=aberta|rodada1|debrief|rodada2|encerrada
// Dados falsos e relógio local (1 s = 1 minuto de plantão), sem servidor.
// Mostra as curvas como no telão aberto pela janela do facilitador; com
// `&publico=1`, como no telão sem sessão (só o placar).

import { useEffect, useMemo, useState } from 'react';
import { Telao } from '../Telao';
import { MINUTO_INICIAL_DEMO, rankingDemo, seriesDemo, turmaDemo, type FaseDemo } from './dadosDemo';

export function TelaoDemo({ fase, minutoInicial, publico = false }: { fase: FaseDemo; minutoInicial?: number; publico?: boolean }) {
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
  const series = useMemo(() => (publico ? null : seriesDemo(fase, minuto)), [publico, fase, minuto]);

  return (
    <Telao
      sala="CBMEDE"
      turma={turma}
      itens={itens}
      minuto={emRodada ? minuto : null}
      conexao="online"
      carregando={false}
      turmaInexistente={false}
      series={series}
      codigoAcesso={publico ? null : '2026'}
    />
  );
}

// Leituras extras do telão quando ele é aberto pela janela logada do facilitador
// (mesmo navegador, mesma sessão do Supabase Auth): eventos reais da rodada
// (`eventos_turma`) e séries para as curvas do debrief e do final
// (`series_turma`). Sem sessão, ou se o servidor recusar, devolve `null` e o
// telão segue só com os dados públicos (dedução pelo placar).

import { useEffect, useState } from 'react';
import type { EventoTurma, PontoSerieTurma, Rodada, StatusTurma } from '../shared/schemas';
import { NaoAutorizado, facilitadorService } from '../shared/services';

export const INTERVALO_EVENTOS_MS = 2000;
export const INTERVALO_SERIES_MS = 15_000;

export interface LeiturasTelao {
  /** Eventos da rodada em curso, mais recentes primeiro; `null` sem leitura. */
  eventos: EventoTurma[] | null;
  /** Séries das duas rodadas; `null` sem leitura. */
  series: PontoSerieTurma[] | null;
}

/** Há sessão de facilitador neste navegador? `null` enquanto verifica. */
export function useSessaoFacilitador(): boolean | null {
  const [logado, setLogado] = useState<boolean | null>(null);
  useEffect(() => {
    let vivo = true;
    facilitadorService.sessaoAtual().then(
      (s) => vivo && setLogado(s !== null),
      () => vivo && setLogado(false),
    );
    return () => {
      vivo = false;
    };
  }, []);
  return logado;
}

export function useLeiturasTelao(
  logado: boolean | null,
  turmaId: string | null,
  status: StatusTurma | null,
  rodada: Rodada | null,
): LeiturasTelao {
  const [eventos, setEventos] = useState<{ chave: string; lista: EventoTurma[] } | null>(null);
  const [series, setSeries] = useState<{ turmaId: string; lista: PontoSerieTurma[] } | null>(null);
  const [recusado, setRecusado] = useState(false);
  const ativo = logado === true && !recusado && turmaId !== null;
  const emRodada = status === 'rodada1' || status === 'rodada2';
  const comSeries = status === 'debrief' || status === 'encerrada' || status === 'arquivada';
  const chaveEventos = `${turmaId}|${rodada}`;

  useEffect(() => {
    if (!ativo || !emRodada || !turmaId || rodada === null) return;
    let vivo = true;
    const ler = () =>
      facilitadorService.eventosTurma(turmaId, { rodada, limite: 20 }).then(
        (lista) => vivo && setEventos({ chave: `${turmaId}|${rodada}`, lista }),
        (e: unknown) => {
          if (vivo && e instanceof NaoAutorizado) setRecusado(true);
        },
      );
    void ler();
    const id = setInterval(() => void ler(), INTERVALO_EVENTOS_MS);
    return () => {
      vivo = false;
      clearInterval(id);
    };
  }, [ativo, emRodada, turmaId, rodada]);

  useEffect(() => {
    if (!ativo || !comSeries || !turmaId) return;
    let vivo = true;
    const ler = () =>
      facilitadorService.seriesTurma(turmaId).then(
        (lista) => vivo && setSeries({ turmaId, lista }),
        (e: unknown) => {
          if (vivo && e instanceof NaoAutorizado) setRecusado(true);
        },
      );
    void ler();
    const id = setInterval(() => void ler(), INTERVALO_SERIES_MS);
    return () => {
      vivo = false;
      clearInterval(id);
    };
  }, [ativo, comSeries, turmaId]);

  return {
    eventos: ativo && emRodada && eventos?.chave === chaveEventos ? eventos.lista : null,
    series: ativo && series?.turmaId === turmaId ? series.lista : null,
  };
}

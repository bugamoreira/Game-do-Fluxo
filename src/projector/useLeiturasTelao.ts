// Leituras extras do telão quando ele é aberto pela janela logada do facilitador
// (mesmo navegador, mesma sessão do Supabase Auth): eventos reais da rodada
// (`eventos_turma`), séries para as curvas do debrief e do final
// (`series_turma`) e o código de acesso da turma (`codigo_acesso_telao`). Sem
// sessão, ou se o servidor recusar, devolve `null` e o telão segue só com os
// dados públicos (dedução pelo placar; "Peça o código ao facilitador").
//
// As leituras usam a LeituraPeriodica (CicloPeriodico): sem requisições
// sobrepostas nem respostas fora de ordem. Uma recusa não trava para sempre:
// tenta de novo depois de um intervalo e na hora em que a sessão muda.

import { useEffect, useState } from 'react';
import { aoVoltar } from '../shared/hooks/aoVoltar';
import { LeituraPeriodica } from '../shared/hooks/leituraPeriodica';
import type { EventoTurma, PontoSerieTurma, Rodada, StatusTurma } from '../shared/schemas';
import { facilitadorService } from '../shared/services';

export const INTERVALO_EVENTOS_MS = 2000;
export const INTERVALO_SERIES_MS = 15_000;
export const INTERVALO_CODIGO_MS = 30_000;

export interface LeiturasTelao {
  /** Eventos da rodada em curso, mais recentes primeiro; `null` sem leitura. */
  eventos: EventoTurma[] | null;
  /** Séries das duas rodadas; `null` sem leitura. */
  series: PontoSerieTurma[] | null;
  /** Código de acesso da turma (só com a sessão do facilitador); `null` sem leitura. */
  codigoAcesso: string | null;
}

/** Há sessão de facilitador neste navegador? `null` enquanto verifica. Acompanha login e saída. */
export function useSessaoFacilitador(): boolean | null {
  const [logado, setLogado] = useState<boolean | null>(null);
  useEffect(() => {
    let vivo = true;
    const conferir = () =>
      facilitadorService.sessaoAtual().then(
        (s) => vivo && setLogado(s !== null),
        () => vivo && setLogado(false),
      );
    void conferir();
    const cancelar = facilitadorService.aoMudarSessao(() => void conferir());
    return () => {
      vivo = false;
      cancelar();
    };
  }, []);
  return logado;
}

/** Liga uma leitura periódica enquanto `ativa`; reautoriza quando a sessão muda e antecipa ao voltar. */
function useLeitura<T>(ativa: boolean, chave: string, intervaloMs: number, ler: () => Promise<T>): { chave: string; valor: T } | null {
  const [dado, setDado] = useState<{ chave: string; valor: T } | null>(null);
  useEffect(() => {
    if (!ativa) return;
    const leitura = new LeituraPeriodica<T>({
      intervaloMs,
      ler,
      aoLer: (valor) => setDado({ chave, valor }),
      aoRecusar: () => setDado(null),
    });
    leitura.iniciar();
    const cancelarSessao = facilitadorService.aoMudarSessao(() => leitura.reautorizar());
    const cancelarVoltar = aoVoltar(() => leitura.tentarAgora());
    return () => {
      leitura.parar();
      cancelarSessao();
      cancelarVoltar();
    };
    // `ler` é recriada a cada render; a chave identifica o que é lido.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ativa, chave, intervaloMs]);
  return dado && dado.chave === chave ? dado : null;
}

export function useLeiturasTelao(
  logado: boolean | null,
  turmaId: string | null,
  status: StatusTurma | null,
  rodada: Rodada | null,
): LeiturasTelao {
  const comSessao = logado === true && turmaId !== null;
  const emRodada = status === 'rodada1' || status === 'rodada2';
  const comSeries = status === 'debrief' || status === 'encerrada' || status === 'arquivada';
  const comCodigo = status !== null && status !== 'encerrada' && status !== 'arquivada';

  const eventos = useLeitura(comSessao && emRodada && rodada !== null, `${turmaId}|${rodada}`, INTERVALO_EVENTOS_MS, () =>
    facilitadorService.eventosTurma(turmaId!, { rodada: rodada!, limite: 20 }),
  );
  const series = useLeitura(comSessao && comSeries, `${turmaId}`, INTERVALO_SERIES_MS, () => facilitadorService.seriesTurma(turmaId!));
  const codigo = useLeitura(comSessao && comCodigo, `${turmaId}`, INTERVALO_CODIGO_MS, () => facilitadorService.codigoAcessoTelao(turmaId!));

  return {
    eventos: comSessao && emRodada ? (eventos?.valor ?? null) : null,
    series: comSessao ? (series?.valor ?? null) : null,
    codigoAcesso: comSessao && comCodigo ? (codigo?.valor ?? null) : null,
  };
}

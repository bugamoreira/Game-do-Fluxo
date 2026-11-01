// Telão com dados reais: consulta pública periódica (sem Realtime).
// Aberto pela janela logada do facilitador, também lê os eventos reais da
// rodada e as séries (useLeiturasTelao); sem sessão, só os dados públicos.
// Carregado sob demanda para o modo demonstração não depender do Supabase.

import { useEstadoTurma, useRanking } from '../shared/hooks';
import { TurmaNaoEncontrada } from '../shared/services';
import { Telao } from './Telao';
import { useLeiturasTelao, useSessaoFacilitador } from './useLeiturasTelao';

export default function AoVivo({ sala }: { sala: string }) {
  const { turma, conexao, minutoServidor, erro } = useEstadoTurma(sala, 1000);
  const ranking = useRanking(sala, 1500);
  const turmaInexistente = erro instanceof TurmaNaoEncontrada;
  const logado = useSessaoFacilitador();
  const leituras = useLeiturasTelao(logado, turma?.id ?? null, turma?.status ?? null, turma?.rodada ?? null);
  return (
    <Telao
      sala={sala}
      turma={turma}
      itens={ranking.itens}
      minuto={minutoServidor}
      conexao={conexao}
      carregando={!turma && !erro && conexao !== 'offline'}
      turmaInexistente={turmaInexistente}
      eventosJogo={leituras.eventos}
      series={leituras.series}
      codigoAcesso={leituras.codigoAcesso}
    />
  );
}

// Telão com dados reais: consulta pública periódica (sem Realtime).
// Carregado sob demanda para o modo demonstração não depender do Supabase.

import { useEstadoTurma, useRanking } from '../shared/hooks';
import { TurmaNaoEncontrada } from '../shared/services';
import { Telao } from './Telao';

export default function AoVivo({ sala }: { sala: string }) {
  const { turma, conexao, minutoServidor, erro } = useEstadoTurma(sala, 1000);
  const ranking = useRanking(sala, 1500);
  const turmaInexistente = erro instanceof TurmaNaoEncontrada;
  return (
    <Telao
      sala={sala}
      turma={turma}
      itens={ranking.itens}
      minuto={minutoServidor}
      conexao={conexao}
      carregando={!turma && !erro && conexao !== 'offline'}
      turmaInexistente={turmaInexistente}
    />
  );
}

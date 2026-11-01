import { describe, expect, it } from 'vitest';
import { criarEstadoInicial, criarSalas, paraPacienteSim, type EstadoSimulacao } from '../../shared/lib/simulation';
import { criarPaciente } from '../../shared/lib/game-engine';
import { eletivasAtrasadas, eventoAtivo, linhasSalas, proximaCirurgia } from '../jogo/leitura';

function estadoCom(extra: Partial<EstadoSimulacao>): EstadoSimulacao {
  return { ...criarEstadoInicial(1, 5), ...extra };
}

describe('centro cirúrgico na tela', () => {
  it('mostra cada sala com ocupante, status e horário previsto, inclusive o paciente preso esperando a RPA', () => {
    const po = { ...paraPacienteSim(criarPaciente(900, 'PO-Eletiva 1', 'rpa', 'enf', 'orange', true)), sector: 'cc' as const };
    const salas = criarSalas();
    salas[0] = { ...salas[0]!, status: 'cirurgia', ocupante: 'Cx Eletiva 2', cirurgiaId: 2, inicio: 480, fimPrevisto: 630, dest: 'enf' };
    salas[1] = { ...salas[1]!, status: 'aguardando_rpa', ocupante: 'Cx Eletiva 1', cirurgiaId: 1, pacienteId: 900, inicio: 450, fimPrevisto: 570, dest: 'enf' };
    const e = estadoCom({ minuto: 600, salas, pacientes: [po] });
    expect(linhasSalas(e)).toEqual([
      { numero: 1, status: 'cirurgia', texto: 'Cx Eletiva 2 até 10:30' },
      { numero: 2, status: 'aguardando_rpa', texto: 'PO-Eletiva 1 aguardando vaga na RPA' },
      { numero: 3, status: 'livre', texto: 'Livre' },
      { numero: 4, status: 'livre', texto: 'Livre' },
    ]);
    expect(eventoAtivo(e)?.titulo).toBe('Sala 2 presa esperando a RPA');
  });

  it('eletiva cujo horário passou com a sala ocupada aparece como atrasada, e não como a próxima', () => {
    const e = criarEstadoInicial(1, 5);
    const primeira = e.cirurgias[0]!;
    const depois = { ...e, minuto: Math.round(primeira.stH * 60) + 15 };
    expect(eletivasAtrasadas(depois)).toContainEqual({ label: primeira.label, sala: primeira.sala, atrasoMin: 15 });
    expect(proximaCirurgia(depois)?.id).not.toBe(primeira.id);
  });

  it('emergência cirúrgica esperando sala vira o aviso principal do centro cirúrgico', () => {
    const emg = { ...paraPacienteSim(criarPaciente(901, 'EMG-Ana', 'de', 'uti', 'red')), emergenciaCx: true, emergenciaDesde: 600 };
    const e = estadoCom({ minuto: 610, pacientes: [emg] });
    expect(eventoAtivo(e)).toMatchObject({ titulo: 'Emergência cirúrgica sem sala' });
    expect(eventoAtivo(e)?.texto).toContain('EMG-Ana aguarda sala operatória');
  });
});

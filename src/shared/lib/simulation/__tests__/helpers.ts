import { criarPaciente } from '../../game-engine';
import { paraPacienteSim } from '../motor';
import type { EstadoSimulacao, PacienteSim } from '../types';

export function paciente(id: number, campos: Partial<PacienteSim>): PacienteSim {
  return { ...paraPacienteSim(criarPaciente(id, `Teste ${id}`, 'de', 'enf', 'yellow')), ...campos };
}

/** Estado controlado: substitui pacientes e cirurgias para isolar uma regra. */
export function comPacientes(estado: EstadoSimulacao, pacientes: PacienteSim[], extra: Partial<EstadoSimulacao> = {}): EstadoSimulacao {
  return {
    ...estado, pacientes, cirurgias: [], proximaChegada: 99999, proximoId: 1000,
    agenda: { chegadas: [], altas: [] }, chegadasProcessadas: 0, ...extra,
  };
}

export function congelarProfundo<T>(obj: T): T {
  if (obj && typeof obj === 'object') {
    Object.values(obj as Record<string, unknown>).forEach(v => congelarProfundo(v));
    Object.freeze(obj);
  }
  return obj;
}

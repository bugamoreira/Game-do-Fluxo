import type { Patient } from '../../../types/game';
import { criarPaciente } from '../../game-engine';
import type { EstadoSimulacao } from '../types';

export function paciente(id: number, campos: Partial<Patient>): Patient {
  return { ...criarPaciente(id, `Teste ${id}`, 'de', 'enf', 'yellow'), ...campos };
}

/** Estado controlado: substitui pacientes e cirurgias para isolar uma regra. */
export function comPacientes(estado: EstadoSimulacao, pacientes: Patient[], extra: Partial<EstadoSimulacao> = {}): EstadoSimulacao {
  return { ...estado, pacientes, cirurgias: [], proximaChegada: 99999, proximoId: 1000, ...extra };
}

export function congelarProfundo<T>(obj: T): T {
  if (obj && typeof obj === 'object') {
    Object.values(obj as Record<string, unknown>).forEach(v => congelarProfundo(v));
    Object.freeze(obj);
  }
  return obj;
}

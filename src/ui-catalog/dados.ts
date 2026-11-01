// Dados de mentira para o catálogo. Não usar em produção.
import type { LogEntry, Patient } from '../shared/types/game';
import type { ItemRanking } from '../shared/components/ui';

let proximoId = 1;

export function paciente(parcial: Partial<Patient> & Pick<Patient, 'name' | 'sev'>): Patient {
  return {
    id: proximoId++,
    sector: 'de',
    dest: 'enf',
    ready: false,
    dischReady: false,
    prep: 0,
    deNeed: 60,
    deSpent: 20,
    bStart: null,
    bMin: 0,
    det: false,
    dead: false,
    postOp: false,
    blocked: false,
    offSvc: false,
    social: false,
    socialDelay: 0,
    obsProlong: false,
    obsEnd: 0,
    arrMin: 560,
    ...parcial,
  };
}

export const MINUTO_AGORA = 645; // 10:45

export const PACIENTES_DE: Patient[] = [
  paciente({ name: 'Helena', sev: 'red', arrMin: 610 }),
  paciente({ name: 'Carlos', sev: 'orange', ready: true, bMin: 200, dest: 'uti' }),
  paciente({ name: 'Joana', sev: 'yellow', arrMin: 590 }),
  paciente({ name: 'Pedro', sev: 'green', dischReady: true, arrMin: 620 }),
  paciente({ name: 'Márcia', sev: 'yellow', ready: true, bMin: 95 }),
  paciente({ name: 'Nelson', sev: 'orange', det: true, bMin: 250, ready: true }),
  paciente({ name: 'Olívia', sev: 'green', arrMin: 630, labDelay: true }),
  paciente({ name: 'Igor', sev: 'red', ready: true, bMin: 380, dest: 'uti' }),
  paciente({ name: 'Raquel', sev: 'yellow', arrMin: 640 }),
  paciente({ name: 'Tomás', sev: 'green', arrMin: 600, obsProlong: true }),
  paciente({ name: 'Diana', sev: 'orange', arrMin: 615 }),
  paciente({ name: 'Samuel', sev: 'yellow', arrMin: 625 }),
  paciente({ name: 'Vera', sev: 'green', arrMin: 635 }),
  paciente({ name: 'Bruno', sev: 'yellow', arrMin: 638, offSvc: true }),
];

export const PACIENTES_TRIAGEM: Patient[] = [
  paciente({ name: 'Alice', sev: 'yellow', sector: 'triagem', arrMin: 640 }),
  paciente({ name: 'Diego', sev: 'orange', sector: 'triagem', arrMin: 642 }),
  paciente({ name: 'Clara', sev: 'green', sector: 'triagem', arrMin: 644 }),
];

export const PACIENTES_ENF: Patient[] = Array.from({ length: 22 }, (_, i) =>
  paciente({
    name: ['Ana', 'Benício', 'Eduardo', 'Fátima', 'Gabriel', 'Karla', 'Lucas', 'Luana', 'Paula', 'Rita', 'Yasmin'][i % 11]!,
    sev: (['green', 'yellow', 'green', 'orange', 'green', 'yellow'] as const)[i % 6]!,
    sector: 'enf',
    dischReady: i % 5 === 0,
    social: i % 7 === 3,
  }),
);

export const PACIENTES_UTI: Patient[] = [
  paciente({ name: 'Heitor', sev: 'red', sector: 'uti', dest: 'step_down' }),
  paciente({ name: 'Isabela', sev: 'orange', sector: 'uti', dischReady: true }),
  paciente({ name: 'Jorge', sev: 'red', sector: 'uti' }),
  paciente({ name: 'Natália', sev: 'orange', sector: 'uti' }),
];

export const PACIENTES_RPA: Patient[] = [
  paciente({ name: 'Marcos', sev: 'yellow', sector: 'rpa', postOp: true, ready: true }),
  paciente({ name: 'Gisele', sev: 'green', sector: 'rpa', postOp: true }),
];

export const PACIENTE_OBITO = paciente({ name: 'Wagner', sev: 'red', dead: true, bMin: 0 });

export const LOG: LogEntry[] = [
  { t: 645, type: 'danger', msg: 'Surto: 3 pacientes chegando pela ambulância nos próximos 15 min.' },
  { t: 638, type: 'warning', msg: 'Nelson está há 4h10 em boarding e deteriorou.' },
  { t: 626, type: 'success', msg: 'Alta da enfermaria liberou 1 leito para o DE.' },
  { t: 612, type: 'fact', msg: 'Cada hora de boarding aumenta a mortalidade do paciente crítico.' },
  { t: 600, type: 'info', msg: 'Tomografia voltou a funcionar.' },
  { t: 571, type: 'warning', msg: 'RPA lotada: cirurgia da sala 2 em risco de cancelamento.' },
  { t: 540, type: 'info', msg: 'Round das 9h na enfermaria: 3 altas previstas para depois do almoço.' },
];

const m = (dis: number, bH: number, det: number, dth: number, cxC: number) => ({ dis, bH, det, dth, cxC });

export const RANKING: ItemRanking[] = [
  { grupoId: 'g1', nome: 'Os Fluxistas', cor: '#2563EB', rodada: 1, pontuacao: 812, metricas: m(31, 6.5, 1, 0, 0), minuto: 645 },
  { grupoId: 'g2', nome: 'Time Lean', cor: '#7C3AED', rodada: 1, pontuacao: 744, metricas: m(28, 9.2, 2, 0, 1), minuto: 645 },
  { grupoId: 'g3', nome: 'NIR Já', cor: '#DB2777', rodada: 1, pontuacao: 690, metricas: m(26, 11.8, 2, 1, 0), minuto: 644 },
  { grupoId: 'g4', nome: 'Kanban 7', cor: '#0E7490', rodada: 1, pontuacao: 602, metricas: m(22, 14.0, 3, 1, 1), minuto: 645 },
  { grupoId: 'g5', nome: 'Porta Giratória', cor: '#0F766E', rodada: 1, pontuacao: 515, metricas: m(19, 17.3, 4, 1, 2), minuto: 643 },
  { grupoId: 'g6', nome: 'Plantão Raiz', cor: '#8B5E3C', rodada: 1, pontuacao: 431, metricas: m(15, 21.6, 5, 2, 2), minuto: 645 },
];

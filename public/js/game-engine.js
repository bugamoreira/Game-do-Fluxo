// ============================================================
// PLANTÃO TRAVADO / PLANTÃO LEAN — Game Engine
// ED Leaders × FLAME 2026
// ============================================================

const TICK = 1000, SH = 7, EH = 19;
const CAP = { ps: 15, enf: 85, uti: 15, rpa: 3 };
const SEV = {
  green:  { c: '#22c55e', l: 'Verde' },
  yellow: { c: '#eab308', l: 'Amarelo' },
  orange: { c: '#f97316', l: 'Laranja' },
  red:    { c: '#ef4444', l: 'Vermelho' },
};
const NAMES = 'Ana,Benício,Carlos,Diana,Eduardo,Fátima,Gabriel,Helena,Igor,Joana,Karla,Lucas,Márcia,Nelson,Olívia,Pedro,Raquel,Samuel,Teresa,Ulisses,Vera,Wagner,Alice,Bruno,Clara,Diego,Elena,Flávio,Gisele,Heitor,Isabela,Jorge,Luana,Marcos,Natália,Oscar,Paula,Rita,Tomás,Yasmin'.split(',');
const SUR = 'S,M,P,L,R,C,F,A,O,B,D,G,T,V,N'.split(',');

// ── Thresholds ─────────────────────────────────────────────
const BOARD_DET_MIN  = 180;   // 3h boarding → deterioração
const BOARD_DEAD_MIN = 360;   // 6h boarding → óbito evitável
const OFFSVC_DET_PROB = 1/(60*2.5);  // ~1 em 2.5h off-service → det

const rnd  = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = a => a[Math.floor(Math.random() * a.length)];
const mkN  = () => `${pick(NAMES)} ${pick(SUR)}.`;
const fmt  = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const pctOf = (n, t) => Math.round(n / t * 100);

let _id = 0;

// ── Cirurgias R1 — acumuladas no período matutino ──────────
function mkSx() {
  return [
    { id:1, label:'Cx Eletiva 1',  sala:1, stH:7.5,  dur:2,   dest:'enf', st:'scheduled' },
    { id:2, label:'Cx Eletiva 2',  sala:2, stH:8,    dur:2.5, dest:'enf', st:'scheduled' },
    { id:3, label:'Cx Complexa 1', sala:3, stH:8,    dur:3,   dest:'uti', st:'scheduled' },
    { id:4, label:'Cx Eletiva 3',  sala:4, stH:8.5,  dur:2,   dest:'enf', st:'scheduled' },
    { id:5, label:'Cx Eletiva 4',  sala:1, stH:10,   dur:2,   dest:'enf', st:'scheduled' },
    { id:6, label:'Cx Eletiva 5',  sala:2, stH:10.5, dur:2.5, dest:'enf', st:'scheduled' },
    { id:7, label:'Cx Complexa 2', sala:3, stH:11,   dur:3,   dest:'uti', st:'scheduled' },
  ];
}

// ── Cirurgias R2 — redistribuídas (Surgical Smoothing) ─────
function mkSxR2() {
  return [
    { id:1, label:'Cx Eletiva 1',  sala:1, stH:8,    dur:2,   dest:'enf', st:'scheduled' },
    { id:2, label:'Cx Eletiva 2',  sala:2, stH:9,    dur:2,   dest:'enf', st:'scheduled' },
    { id:3, label:'Cx Complexa 1', sala:3, stH:8.5,  dur:3,   dest:'uti', st:'scheduled' },
    { id:4, label:'Cx Eletiva 3',  sala:4, stH:10,   dur:2,   dest:'enf', st:'scheduled' },
    { id:5, label:'Cx Eletiva 4',  sala:1, stH:14,   dur:2,   dest:'enf', st:'scheduled' },
    { id:6, label:'Cx Eletiva 5',  sala:2, stH:14.5, dur:2,   dest:'enf', st:'scheduled' },
    { id:7, label:'Cx Complexa 2', sala:3, stH:15,   dur:2.5, dest:'uti', st:'scheduled' },
  ];
}

// ── Criar paciente ─────────────────────────────────────────
function mkPt(sector, dest, sev, ready = false, psT = 120) {
  return {
    id: ++_id, name: mkN(), sector, dest, sev, ready,
    dischReady: false, prep: 0, psNeed: psT, psSpent: ready ? psT : 0,
    bStart: null, bMin: 0, det: false, dead: false, postOp: false,
    blocked: false, offSvc: false, social: false, socialDelay: 0,
    obsProlong: false, obsEnd: 0, arrMin: SH * 60,
  };
}

// ── Estado inicial ─────────────────────────────────────────
// PS  8/15  (53%) — pressão desde o início
// ENF 72/85 (85%) — quase sem folga
// UTI 13/15 (87%) — gargalo imediato
function mkInit() {
  _id = 0;
  const P = [];
  // PS: 8 pacientes (3 ready+boarding, 2 em avaliação, 2 alta_ps, 1 avaliando para UTI)
  [
    { dest:'enf',     sev:'orange', r:true  },
    { dest:'uti',     sev:'red',    r:true  },
    { dest:'enf',     sev:'yellow', r:true  },
    { dest:'alta_ps', sev:'green',  r:true  },
    { dest:'alta_ps', sev:'green',  r:true  },
    { dest:'enf',     sev:'yellow', r:false },
    { dest:'uti',     sev:'red',    r:false },
    { dest:'alta_ps', sev:'green',  r:false },
  ].forEach(c => {
    const p = mkPt('ps', c.dest, c.sev, c.r, c.r ? 120 : 120 + rnd(0, 60));
    if (!c.r) p.psSpent = rnd(40, 90);
    // Pacientes ready já com boarding acumulado (entraram antes das 7h)
    if (c.r && c.dest !== 'alta_ps') {
      p.bStart = SH * 60 - rnd(60, 120);
      p.bMin = SH * 60 - p.bStart;
    }
    P.push(p);
  });
  // ENF: 72 pacientes
  for (let i = 0; i < 72; i++) P.push(mkPt('enf', 'alta_enf', Math.random() < .6 ? 'green' : 'yellow'));
  // UTI: 13 pacientes
  for (let i = 0; i < 13; i++) P.push(mkPt('uti', 'step_down', 'red'));
  return P;
}

// ── Taxa de chegada por hora ───────────────────────────────
function arrRate(h, isR2) {
  // R1: pico mais intenso com +2/h (11h-14h) = 7 pacientes/hora
  const bonus = (!isR2 && h >= 11 && h < 14) ? 2 : 0;
  if (h < 9)  return 2 + bonus;
  if (h < 11) return 3 + bonus;
  if (h < 14) return 5 + bonus;
  if (h < 17) return 3 + bonus;
  return 2;
}

// ── Destino do paciente novo ───────────────────────────────
// R1: 50% alta_ps, 35% ENF, 15% UTI
function rollDest() {
  const r = Math.random();
  if (r < .50) return { dest:'alta_ps', sev: Math.random() < .7 ? 'green' : 'yellow', ps: rnd(60,  120) };
  if (r < .85) return { dest:'enf',     sev: Math.random() < .5 ? 'yellow': 'orange', ps: rnd(120, 180) };
  return             { dest:'uti',     sev:'red',                                      ps: rnd(90,  150) };
}

// ── Multiplicador de congestão PS ──────────────────────────
// Quanto mais lotado, mais rápido o paciente termina avaliação
// (avaliação rápida → ready → mas sem leito → boarding)
function psMult(n) {
  const p = n / CAP.ps * 100;
  if (p <= 50) return 1;
  if (p <= 70) return 1.2;
  if (p <= 85) return 1.5;
  return 2;
}

// ── Cálculo de score ───────────────────────────────────────
function calcScore(s) {
  let sc = 1000;
  sc -= Math.round(s.boardHrs * 12);   // boarding é o mal central
  sc -= s.dets   * 50;                 // deterioração
  sc -= s.deaths * 250;                // óbito evitável = catástrofe
  sc -= s.cxCan  * 100;                // cirurgia cancelada = cascata
  sc -= s.lwbs   * 50;                 // saiu sem atendimento
  sc -= s.offS   * 30;                 // fora da especialidade
  sc -= s.socB   * 20;                 // bloqueio social
  sc += s.disc   * 5;                  // cada alta pontua
  if (s.deaths === 0) sc += 100;       // bônus zero óbitos
  return Math.max(0, Math.round(sc));
}

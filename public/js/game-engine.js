// ============================================================
// PLANTÃO TRAVADO / PLANTÃO LEAN — Game Engine
// ED Leaders × FLAME 2026
// ============================================================

const TICK = 1000, SH = 7, EH = 19;
const CAP = { de: 15, enf: 85, uti: 15, rpa: 3 };
const HOSP_BEDS = CAP.enf + CAP.uti;  // 100 leitos de internação
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
function mkPt(sector, dest, sev, ready = false, deT = 120) {
  return {
    id: ++_id, name: mkN(), sector, dest, sev, ready,
    dischReady: false, prep: 0, deNeed: deT, deSpent: ready ? deT : 0,
    bStart: null, bMin: 0, det: false, dead: false, postOp: false,
    blocked: false, offSvc: false, social: false, socialDelay: 0,
    obsProlong: false, obsEnd: 0, arrMin: SH * 60,
  };
}

// ── Estado inicial ─────────────────────────────────────────
// DE   8/15  (53%) — pressão desde o início
// ENF 71/85 (84%) — quase sem folga → ocupação (71+13)/100 = 84%
// UTI 13/15 (87%) — gargalo imediato
function mkInit() {
  _id = 0;
  const P = [];
  // DE: 8 pacientes (3 ready+boarding, 2 em avaliação, 2 alta_de, 1 avaliando para UTI)
  [
    { dest:'enf',     sev:'orange', r:true  },
    { dest:'uti',     sev:'red',    r:true  },
    { dest:'enf',     sev:'yellow', r:true  },
    { dest:'alta_de', sev:'green',  r:true  },
    { dest:'alta_de', sev:'green',  r:true  },
    { dest:'enf',     sev:'yellow', r:false },
    { dest:'uti',     sev:'red',    r:false },
    { dest:'alta_de', sev:'green',  r:false },
  ].forEach(c => {
    const p = mkPt('de', c.dest, c.sev, c.r, c.r ? 120 : 120 + rnd(0, 60));
    if (!c.r) p.deSpent = rnd(40, 90);
    if (c.r && c.dest !== 'alta_de') {
      p.bStart = SH * 60 - rnd(60, 120);
      p.bMin = SH * 60 - p.bStart;
    }
    P.push(p);
  });
  for (let i = 0; i < 71; i++) P.push(mkPt('enf', 'alta_enf', Math.random() < .6 ? 'green' : 'yellow'));
  for (let i = 0; i < 13; i++) P.push(mkPt('uti', 'step_down', 'red'));
  return P;
}

// ── Taxa de chegada por hora ───────────────────────────────
function arrRate(h, isR2) {
  const bonus = (!isR2 && h >= 11 && h < 14) ? 2 : 0;
  if (h < 9)  return 2 + bonus;
  if (h < 11) return 3 + bonus;
  if (h < 14) return 5 + bonus;
  if (h < 17) return 3 + bonus;
  return 2;
}

// ── Destino do paciente novo ───────────────────────────────
// 50% alta_de, 35% ENF, 15% UTI
// R2: tempo porta-decisão ~40% menor (protocolos Lean, Fast Track)
function rollDest(isR2 = false) {
  const r = Math.random();
  if (isR2) {
    if (r < .50) return { dest:'alta_de', sev: Math.random() < .7 ? 'green' : 'yellow', de: rnd(30,  60)  };
    if (r < .85) return { dest:'enf',     sev: Math.random() < .5 ? 'yellow': 'orange', de: rnd(80,  120) };
    return             { dest:'uti',     sev:'red',                                      de: rnd(60,  100) };
  }
  if (r < .50) return { dest:'alta_de', sev: Math.random() < .7 ? 'green' : 'yellow', de: rnd(60,  120) };
  if (r < .85) return { dest:'enf',     sev: Math.random() < .5 ? 'yellow': 'orange', de: rnd(120, 180) };
  return             { dest:'uti',     sev:'red',                                      de: rnd(90,  150) };
}

// ── Multiplicador de congestão hospitalar ──────────────────
// Baseado na ocupação de INTERNAÇÃO (ENF + UTI) / 100 leitos
// R1: multiplicador agressivo → boarding se acumula
// R2: multiplicador atenuado → ferramentas Lean reduzem impacto
function hospMult(enfN, utiN, isR2 = false) {
  const p = (enfN + utiN) / HOSP_BEDS * 100;
  if (isR2) {
    // R2: ferramentas Lean reduzem o impacto da congestão
    if (p <= 80) return 1;
    if (p <= 90) return 1.1;
    return 1.3;
  }
  // R1: sem ferramentas, congestão é devastadora
  if (p <= 75) return 1;
  if (p <= 85) return 1.2;
  if (p <= 92) return 1.5;
  return 2;
}

// Ocupação hospitalar (internação)
function hospOcc(enfN, utiN) {
  return pctOf(enfN + utiN, HOSP_BEDS);
}

// ── Cálculo de score ───────────────────────────────────────
function calcScore(s) {
  let sc = 1000;
  sc -= Math.round(s.boardHrs * 12);
  sc -= s.dets   * 50;
  sc -= s.deaths * 250;
  sc -= s.cxCan  * 100;
  sc -= s.lwbs   * 50;
  sc -= s.offS   * 30;
  sc -= s.socB   * 20;
  sc += s.disc   * 5;
  if (s.deaths === 0) sc += 100;
  return Math.max(0, Math.round(sc));
}

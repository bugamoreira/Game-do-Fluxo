// ============================================================
// PLANTAO TRAVADO / PLANTAO LEAN — Game Engine
// ED Leaders x FLAME 2026
// ============================================================

const TICK = 1000, SH = 7, EH = 19;
const CAP = { ps: 15, enf: 85, uti: 15, rpa: 3 };
const SEV = {
  green:  { c: '#22c55e', l: 'Verde' },
  yellow: { c: '#eab308', l: 'Amarelo' },
  orange: { c: '#f97316', l: 'Laranja' },
  red:    { c: '#ef4444', l: 'Vermelho' },
};
const NAMES = 'Ana,Benicio,Carlos,Diana,Eduardo,Fatima,Gabriel,Helena,Igor,Joana,Karla,Lucas,Marcia,Nelson,Olivia,Pedro,Raquel,Samuel,Teresa,Ulisses,Vera,Wagner,Alice,Bruno,Clara,Diego,Elena,Flavio,Gisele,Heitor,Isabela,Jorge,Luana,Marcos,Natalia,Oscar,Paula,Rita,Tomas,Yasmin'.split(',');
const SUR = 'S,M,P,L,R,C,F,A,O,B,D,G,T,V,N'.split(',');

const rnd  = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = a => a[Math.floor(Math.random() * a.length)];
const mkN  = () => `${pick(NAMES)} ${pick(SUR)}.`;
const fmt  = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const pctOf = (n, t) => Math.round(n / t * 100);

let _id = 0;

function mkSx() {
  return [
    { id:1, label:'Cx Eletiva 1',  sala:1, stH:7.5,  dur:2,   dest:'enf', st:'scheduled' },
    { id:2, label:'Cx Eletiva 2',  sala:2, stH:8,    dur:2.5, dest:'enf', st:'scheduled' },
    { id:3, label:'Cx Complexa 1', sala:3, stH:8,    dur:3,   dest:'uti', st:'scheduled' },
    { id:4, label:'Cx Eletiva 3',  sala:4, stH:8.5,  dur:2,   dest:'enf', st:'scheduled' },
    { id:5, label:'Cx Eletiva 4',  sala:1, stH:10,   dur:2,   dest:'enf', st:'scheduled' },
    { id:6, label:'Cx Eletiva 5',  sala:2, stH:11,   dur:2.5, dest:'enf', st:'scheduled' },
    { id:7, label:'Cx Complexa 2', sala:3, stH:11.5, dur:3,   dest:'uti', st:'scheduled' },
  ];
}

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

function mkPt(sector, dest, sev, ready = false, psT = 120) {
  return {
    id: ++_id, name: mkN(), sector, dest, sev, ready,
    dischReady: false, prep: 0, psNeed: psT, psSpent: ready ? psT : 0,
    bStart: null, bMin: 0, det: false, dead: false, postOp: false,
    blocked: false, offSvc: false, social: false, socialDelay: 0,
    obsProlong: false, obsEnd: 0, arrMin: SH * 60,
  };
}

function mkInit() {
  _id = 0;
  const P = [];
  [
    { dest:'enf',     sev:'orange', r:true  },
    { dest:'uti',     sev:'red',    r:true  },
    { dest:'alta_ps', sev:'green',  r:true  },
    { dest:'alta_ps', sev:'green',  r:true  },
    { dest:'enf',     sev:'yellow', r:false },
    { dest:'uti',     sev:'red',    r:false },
  ].forEach(c => {
    const p = mkPt('ps', c.dest, c.sev, c.r, c.r ? 120 : 120 + rnd(0, 60));
    if (!c.r) p.psSpent = rnd(40, 90);
    if (c.r && c.dest !== 'alta_ps') { p.bStart = SH * 60 - rnd(30, 90); p.bMin = SH * 60 - p.bStart; }
    P.push(p);
  });
  for (let i = 0; i < 68; i++) P.push(mkPt('enf', 'alta_enf', Math.random() < .6 ? 'green' : 'yellow'));
  for (let i = 0; i < 12; i++) P.push(mkPt('uti', 'step_down', 'red'));
  return P;
}

function arrRate(h) {
  if (h < 9)  return 2;
  if (h < 11) return 3;
  if (h < 14) return 5;
  if (h < 17) return 3;
  return 2;
}

function rollDest() {
  const r = Math.random();
  if (r < .55) return { dest:'alta_ps', sev: Math.random() < .7 ? 'green' : 'yellow', ps: rnd(60,  120) };
  if (r < .85) return { dest:'enf',     sev: Math.random() < .5 ? 'yellow': 'orange', ps: rnd(120, 180) };
  return             { dest:'uti',     sev:'red',                                      ps: rnd(90,  150) };
}

function psMult(n) {
  const p = n / CAP.ps * 100;
  if (p <= 60) return 1;
  if (p <= 80) return 1.3;
  if (p <= 90) return 1.6;
  return 2;
}

function calcScore(s) {
  let sc = 1000;
  sc -= Math.round(s.boardHrs * 10);
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

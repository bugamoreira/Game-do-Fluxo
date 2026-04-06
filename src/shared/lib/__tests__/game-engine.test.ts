import { describe, it, expect, beforeEach } from 'vitest';
import {
  mkInit, mkSx, mkSxR2, mkPt, arrRate, rollDest,
  hospMult, hospOcc, calcScore, resetId,
} from '../game-engine';
import { CAP } from '../constants';

beforeEach(() => {
  resetId();
});

describe('mkInit', () => {
  it('creates correct number of patients per sector', () => {
    const pts = mkInit();
    const de = pts.filter(p => p.sector === 'de');
    const enf = pts.filter(p => p.sector === 'enf');
    const uti = pts.filter(p => p.sector === 'uti');

    expect(de).toHaveLength(8);   // 8 DE patients
    expect(enf).toHaveLength(71); // 71 ENF
    expect(uti).toHaveLength(13); // 13 UTI
    expect(pts).toHaveLength(92); // total
  });

  it('initializes hospital at 84% occupancy', () => {
    const pts = mkInit();
    const enfN = pts.filter(p => p.sector === 'enf').length;
    const utiN = pts.filter(p => p.sector === 'uti').length;
    expect(hospOcc(enfN, utiN)).toBe(84);
  });

  it('has boarding patients in DE', () => {
    const pts = mkInit();
    const boarding = pts.filter(p => p.sector === 'de' && p.ready && (p.dest === 'enf' || p.dest === 'uti'));
    expect(boarding.length).toBeGreaterThanOrEqual(2);
  });
});

describe('mkSx / mkSxR2', () => {
  it('creates 7 surgeries in R1', () => {
    expect(mkSx()).toHaveLength(7);
  });

  it('creates 7 surgeries in R2', () => {
    expect(mkSxR2()).toHaveLength(7);
  });

  it('R2 surgeries are redistributed (afternoon slots)', () => {
    const r2 = mkSxR2();
    const afternoon = r2.filter(s => s.stH >= 14);
    expect(afternoon.length).toBeGreaterThanOrEqual(2);
  });

  it('R1 surgeries are concentrated in morning', () => {
    const r1 = mkSx();
    const afternoon = r1.filter(s => s.stH >= 14);
    expect(afternoon).toHaveLength(0);
  });
});

describe('mkPt', () => {
  it('creates patient with correct fields', () => {
    const p = mkPt('de', 'enf', 'yellow', true, 120);
    expect(p.sector).toBe('de');
    expect(p.dest).toBe('enf');
    expect(p.sev).toBe('yellow');
    expect(p.ready).toBe(true);
    expect(p.dead).toBe(false);
    expect(p.det).toBe(false);
    expect(p.id).toBeGreaterThan(0);
  });
});

describe('calcScore', () => {
  it('starts at 1500 base with zero penalties', () => {
    const score = calcScore({
      boardHrs: 0, dets: 0, deaths: 0, cxCan: 0,
      lwbs: 0, offS: 0, socB: 0, disc: 10,
    });
    // 1500 + 150 (zero deaths bonus) + 10*3 (discharges) = 1680
    expect(score).toBe(1680);
  });

  it('has floor of 50', () => {
    const score = calcScore({
      boardHrs: 100, dets: 10, deaths: 10, cxCan: 10,
      lwbs: 10, offS: 10, socB: 10,
    });
    expect(score).toBe(50);
  });

  it('gives R2 perfect bonus', () => {
    const score = calcScore({
      boardHrs: 0, dets: 0, deaths: 0, cxCan: 0,
      lwbs: 0, offS: 0, socB: 0, altaHosp: 10,
      isR2: true,
    });
    // 1500 + 150 (zero deaths) + 300 (R2 perfect) + 30 (10 discharges) = 1980
    expect(score).toBe(1980);
  });

  it('penalizes deaths heavily', () => {
    const base = calcScore({ boardHrs: 0, dets: 0, deaths: 0, cxCan: 0, lwbs: 0, offS: 0, socB: 0 });
    const withDeath = calcScore({ boardHrs: 0, dets: 0, deaths: 1, cxCan: 0, lwbs: 0, offS: 0, socB: 0 });
    expect(base - withDeath).toBe(300); // -150 penalty + -150 lost zero-death bonus
  });

  it('penalizes boarding hours', () => {
    const clean = calcScore({ boardHrs: 0, dets: 0, deaths: 0, cxCan: 0, lwbs: 0, offS: 0, socB: 0 });
    const boarded = calcScore({ boardHrs: 10, dets: 0, deaths: 0, cxCan: 0, lwbs: 0, offS: 0, socB: 0 });
    expect(clean - boarded).toBe(100); // 10 * 10 = 100
  });
});

describe('arrRate', () => {
  it('is lowest early morning and evening', () => {
    expect(arrRate(7, false)).toBe(2);
    expect(arrRate(18, false)).toBe(2);
  });

  it('peaks at midday', () => {
    expect(arrRate(12, false)).toBe(7); // 5 base + 2 R1 bonus
  });

  it('R2 has no bonus at midday', () => {
    expect(arrRate(12, true)).toBe(5);
  });

  it('R1 has extra arrivals 11-14h', () => {
    expect(arrRate(11, false)).toBe(7); // 5 + 2
    expect(arrRate(11, true)).toBe(5);  // no bonus
  });
});

describe('rollDest', () => {
  it('returns valid destination and severity', () => {
    for (let i = 0; i < 100; i++) {
      const d = rollDest(false);
      expect(['alta_de', 'enf', 'uti']).toContain(d.dest);
      expect(['green', 'yellow', 'orange', 'red']).toContain(d.sev);
      expect(d.de).toBeGreaterThan(0);
    }
  });

  it('statistical distribution: ~50% alta_de, ~35% enf, ~15% uti', () => {
    const N = 10000;
    let alta = 0, enf = 0, uti = 0;
    for (let i = 0; i < N; i++) {
      const d = rollDest(false);
      if (d.dest === 'alta_de') alta++;
      else if (d.dest === 'enf') enf++;
      else uti++;
    }
    // Allow 5% tolerance
    expect(alta / N).toBeGreaterThan(0.45);
    expect(alta / N).toBeLessThan(0.55);
    expect(enf / N).toBeGreaterThan(0.30);
    expect(enf / N).toBeLessThan(0.40);
    expect(uti / N).toBeGreaterThan(0.10);
    expect(uti / N).toBeLessThan(0.20);
  });

  it('R2 has faster decision times', () => {
    // Run multiple times and check average
    let r1Total = 0, r2Total = 0;
    const N = 1000;
    for (let i = 0; i < N; i++) {
      r1Total += rollDest(false).de;
      r2Total += rollDest(true).de;
    }
    expect(r2Total / N).toBeLessThan(r1Total / N);
  });
});

describe('hospMult', () => {
  it('returns 1 at low occupancy', () => {
    expect(hospMult(50, 10, false)).toBe(1); // 60%
    expect(hospMult(50, 10, true)).toBe(1);
  });

  it('R1 escalates aggressively', () => {
    expect(hospMult(75, 10, false)).toBe(1.2); // 85%
    expect(hospMult(78, 12, false)).toBe(1.5); // 90%
    expect(hospMult(80, 13, false)).toBe(2);   // 93% > 92% threshold
    expect(hospMult(85, 15, false)).toBe(2);   // 100%
  });

  it('R2 caps at 1.3', () => {
    expect(hospMult(85, 15, true)).toBe(1.3);  // 100%
    expect(hospMult(80, 13, true)).toBe(1.3);  // 93%
  });

  it('R1 max is 2.0', () => {
    expect(hospMult(85, 15, false)).toBe(2);
  });
});

describe('hospOcc', () => {
  it('calculates percentage correctly', () => {
    expect(hospOcc(85, 15)).toBe(100);
    expect(hospOcc(71, 13)).toBe(84);
    expect(hospOcc(0, 0)).toBe(0);
  });
});

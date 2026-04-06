// ============================================================
// Formatting utilities — shared across all 3 apps
// ============================================================

/** Format minutes to HH:MM (e.g., 420 → "07:00") */
export function fmt(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Calculate percentage */
export function pctOf(n: number, t: number): number {
  return Math.round((n / t) * 100);
}

/** Random integer in range [a, b] inclusive */
export function rnd(a: number, b: number): number {
  return a + Math.floor(Math.random() * (b - a + 1));
}

/** Random element from array */
export function pick<T>(a: readonly T[]): T {
  return a[Math.floor(Math.random() * a.length)]!;
}

/** Score color based on value */
export function getScoreColor(score: number): string {
  if (score > 700) return '#22c55e';
  if (score > 400) return '#eab308';
  return '#ef4444';
}

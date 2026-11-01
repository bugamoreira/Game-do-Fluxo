/** Junta classes do Tailwind, ignorando valores falsos. */
export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

/** Relógio do plantão: 420 → "07:00". */
export function horaDoPlantao(minuto: number): string {
  const m = Math.max(0, Math.round(minuto));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Duração curta: 190 → "3h10", 45 → "45 min". */
export function duracaoCurta(minutos: number): string {
  const m = Math.max(0, Math.round(minutos));
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;
}

function luminancia(hex: string): number | null {
  const limpo = hex.replace('#', '');
  const cheio = limpo.length === 3 ? limpo.split('').map(c => c + c).join('') : limpo;
  if (!/^[0-9a-fA-F]{6}$/.test(cheio)) return null;
  const canais = [0, 2, 4].map(i => {
    const c = parseInt(cheio.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const [r = 0, g = 0, b = 0] = canais;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const LUMINANCIA_MARINHO_PROFUNDO = 0.0111;

/** Escolhe texto branco ou marinho profundo sobre uma cor qualquer (o de maior contraste). */
export function textoSobre(hex: string): string {
  const l = luminancia(hex);
  if (l === null) return '#FFFFFF';
  const contrasteBranco = 1.05 / (l + 0.05);
  const contrasteMarinho = (l + 0.05) / (LUMINANCIA_MARINHO_PROFUNDO + 0.05);
  return contrasteBranco >= contrasteMarinho ? '#FFFFFF' : '#0e1840';
}

import type { CSSProperties } from 'react';

interface PSvgProps {
  color: string;
  sz?: number;
  dead?: boolean;
  det?: boolean;
  style?: CSSProperties;
}

export function PSvg({ color, sz = 18, dead, det, style = {} }: PSvgProps) {
  return (
    <svg
      viewBox="0 0 24 34"
      width={sz}
      height={sz * 1.4}
      style={{ filter: det ? 'drop-shadow(0 0 4px #ef4444)' : 'none', opacity: dead ? 0.25 : 1, ...style }}
    >
      <circle cx="12" cy="6" r="5" fill={dead ? '#555' : color} />
      <path d="M12 12C6 12 3 17 3 23h18c0-6-3-11-9-11z" fill={dead ? '#444' : color} />
      <rect x="5" y="23" width="5" height="8" rx="2" fill={dead ? '#3a3a3a' : color} opacity=".8" />
      <rect x="14" y="23" width="5" height="8" rx="2" fill={dead ? '#3a3a3a' : color} opacity=".8" />
    </svg>
  );
}

import { getScoreColor } from '../lib/format';

interface ScoreBarProps {
  score: number;
  max?: number;
  height?: number;
}

export function ScoreBar({ score, max = 1000, height = 6 }: ScoreBarProps) {
  const pct = Math.min((score / max) * 100, 100);
  const c = getScoreColor(score);

  return (
    <div style={{ height, background: '#1e293b', borderRadius: height / 2, overflow: 'hidden', marginTop: 4 }}>
      <div style={{ width: `${pct}%`, height: '100%', background: c, borderRadius: height / 2, transition: 'width .5s' }} />
    </div>
  );
}

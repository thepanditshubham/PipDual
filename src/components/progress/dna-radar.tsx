'use client';

import type { TraderDNA } from '@/lib/progress/types';

const AXES: { key: keyof Pick<TraderDNA, 'risk' | 'patience' | 'timing' | 'discipline' | 'consistency'>; label: string }[] = [
  { key: 'risk', label: 'Risk' },
  { key: 'patience', label: 'Patience' },
  { key: 'timing', label: 'Timing' },
  { key: 'discipline', label: 'Discipline' },
  { key: 'consistency', label: 'Consistency' },
];

/** Five-axis Trader DNA radar (spec §8). Pure SVG so it prints and scales. */
export function DnaRadar({ dna, size = 200 }: { dna: TraderDNA; size?: number }) {
  const center = size / 2;
  const radius = size / 2 - 30;

  const point = (index: number, value: number) => {
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / AXES.length;
    const scale = Math.max(0, Math.min(100, value)) / 100;
    return {
      x: center + Math.cos(angle) * radius * scale,
      y: center + Math.sin(angle) * radius * scale,
    };
  };

  const ring = (scale: number) =>
    AXES.map((_, index) => {
      const angle = -Math.PI / 2 + (index * 2 * Math.PI) / AXES.length;
      return `${center + Math.cos(angle) * radius * scale},${center + Math.sin(angle) * radius * scale}`;
    }).join(' ');

  const shape = AXES.map((axis, index) => {
    const { x, y } = point(index, dna[axis.key]);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-auto" role="img" aria-label="Trader DNA radar">
      {[0.25, 0.5, 0.75, 1].map((scale) => (
        <polygon
          key={scale}
          points={ring(scale)}
          fill="none"
          stroke="var(--term-border)"
          strokeWidth={1}
        />
      ))}
      {AXES.map((axis, index) => {
        const outer = point(index, 100);
        return (
          <line
            key={axis.key}
            x1={center}
            y1={center}
            x2={outer.x}
            y2={outer.y}
            stroke="var(--term-border)"
            strokeWidth={1}
          />
        );
      })}
      <polygon points={shape} fill="rgba(41,98,255,0.22)" stroke="var(--term-accent)" strokeWidth={1.6} />
      {AXES.map((axis, index) => {
        const value = dna[axis.key];
        const dot = point(index, value);
        return <circle key={axis.key} cx={dot.x} cy={dot.y} r={2.4} fill="var(--term-accent-text)" />;
      })}
      {AXES.map((axis, index) => {
        const angle = -Math.PI / 2 + (index * 2 * Math.PI) / AXES.length;
        const lx = center + Math.cos(angle) * (radius + 16);
        const ly = center + Math.sin(angle) * (radius + 16);
        const anchor = Math.abs(Math.cos(angle)) < 0.3 ? 'middle' : Math.cos(angle) > 0 ? 'start' : 'end';
        return (
          <text
            key={axis.key}
            x={lx}
            y={ly}
            textAnchor={anchor}
            dominantBaseline="middle"
            fill="var(--term-soft)"
            fontSize={9}
            fontFamily="ui-monospace, SFMono-Regular, monospace"
          >
            {axis.label} {Math.round(dna[axis.key])}
          </text>
        );
      })}
    </svg>
  );
}

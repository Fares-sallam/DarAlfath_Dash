import { BRAND_COLORS, stripTones, type CrescentTone, type StripArrangement } from '@/lib/appearance';

const UNIT_PITCH = 56.7;
const CRESCENTS = [
  'M 14.25 1.5 L 27.47 1.5 C 27.47 1.5 21.66 19.94 39.74 34.1 C 39.74 34.1 11.01 27.72 14.25 1.5 Z',
  'M 66.55 1.5 L 53.33 1.5 C 53.33 1.5 59.14 19.94 41.06 34.1 C 41.06 34.1 69.79 27.72 66.55 1.5 Z',
  'M 65.55 66.7 L 52.33 66.7 C 52.33 66.7 58.15 48.26 40.06 34.1 C 45.25 35.25 68.94 39.33 65.55 66.7 Z',
  'M 14.25 66.7 L 27.47 66.7 C 27.47 66.7 21.66 48.26 39.74 34.1 C 39.74 34.1 11.01 40.48 14.25 66.7 Z',
];
const FILL: Record<CrescentTone, string> = { base: BRAND_COLORS.navy.hex, teal: BRAND_COLORS.teal.hex, green: BRAND_COLORS.green.hex };

/** A strip of the house pattern as the store draws it, for the dashboard to show the choice. */
export default function StripSample({ arrangement, units = 3, seed = 4, label }: { arrangement: StripArrangement; units?: number; seed?: number; label: string }) {
  const tones = stripTones(arrangement, units, seed);
  return (
    <svg
      viewBox={`10 0 ${61 + UNIT_PITCH * (units - 1)} 68`}
      role="img"
      aria-label={label}
      className="h-12 w-auto"
      data-arrangement={arrangement}
    >
      {tones.map((unit, i) => (
        <g key={i} transform={`translate(${i * UNIT_PITCH} 0)`}>
          {CRESCENTS.map((d, c) => <path key={c} d={d} fill={FILL[unit[c]]} />)}
        </g>
      ))}
    </svg>
  );
}

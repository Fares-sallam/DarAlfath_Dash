import { PATTERN_STRENGTH_MAX, PATTERN_STRENGTH_MIN, clampStrength, patternFactor } from '@/lib/appearance';

/**
 * How strongly the brand pattern shows, as a slider with a strip of the pattern itself beside it, drawn at that
 * strength, so the choice is seen as it is made. 0 hides the pattern; 100 is as designed; 200 is twice as strong.
 */
export default function StrengthSlider({
  value,
  onChange,
  label,
  testId,
}: {
  value: number;
  onChange: (next: number) => void;
  label: string;
  testId?: string;
}) {
  const strength = clampStrength(value);
  const words = strength === 0 ? 'مخفي' : strength < 60 ? 'خفيف جدًا' : strength < 90 ? 'خفيف' : strength <= 110 ? 'كما صُمّم' : strength <= 150 ? 'أوضح' : 'واضح جدًا';

  return (
    <div className="flex flex-col gap-2" data-testid={testId}>
      <div className="flex items-center justify-between gap-3">
        <label className="text-xs font-semibold text-gray-600" htmlFor={`${testId ?? 'strength'}-range`}>{label}</label>
        <span className="text-xs font-bold text-indigo-700 tabular-nums" dir="ltr" aria-live="polite">{strength}% · <span dir="rtl">{words}</span></span>
      </div>
      <input
        id={`${testId ?? 'strength'}-range`}
        data-testid={testId ? `${testId}-range` : undefined}
        type="range"
        min={PATTERN_STRENGTH_MIN}
        max={PATTERN_STRENGTH_MAX}
        step={5}
        value={strength}
        onChange={(e) => onChange(clampStrength(Number(e.target.value)))}
        className="w-full accent-indigo-600"
        aria-valuetext={`${strength} بالمئة، ${words}`}
      />
      <div className="flex justify-between text-[10px] text-gray-400" aria-hidden="true">
        <span>مخفي</span><span>كما صُمّم</span><span>الضعف</span>
      </div>
      <div
        className="h-14 rounded-xl border border-gray-100 overflow-hidden bg-[#f7f9fa]"
        aria-hidden="true"
        data-testid={testId ? `${testId}-strip` : undefined}
      >
        <div
          className="h-full w-full"
          style={{
            backgroundImage: "url('/patterns/brand-pattern.svg')",
            backgroundSize: '190px auto',
            opacity: Math.min(1, 0.4 * patternFactor(strength) + (strength > 0 ? 0.04 : 0)),
          }}
        />
      </div>
    </div>
  );
}

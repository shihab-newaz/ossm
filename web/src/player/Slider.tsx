"use client";

type SliderProps = {
  label: string;
  value: number;
  max: number;
  step?: number;
  /** What a screen reader hears instead of the bare number, e.g. "1:02 of 4:03". */
  valueText?: string;
  disabled?: boolean;
  onChange: (value: number) => void;
  className?: string;
};

export function Slider({ label, value, max, step = 1, valueText, disabled, onChange, className = "" }: SliderProps) {
  const progress = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <input
      type="range"
      aria-label={label}
      aria-valuetext={valueText}
      min={0}
      max={max}
      step={step}
      value={Math.min(value, max)}
      disabled={disabled}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{ "--progress": `${progress}%` } as React.CSSProperties}
      className={`slider disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
    />
  );
}

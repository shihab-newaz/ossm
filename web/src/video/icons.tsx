// The few player icons lucide does not have, drawn on lucide's 24px grid so they sit with its icons.

type IconProps = { size?: number; className?: string };

function Svg({ size = 24, className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
      {children}
    </svg>
  );
}

const Ten = () => (
  <text x="12" y="15.6" fontSize="7.5" textAnchor="middle" fill="currentColor" stroke="none" fontFamily="var(--font-inter), sans-serif" fontWeight="700">
    10
  </text>
);

export function Back10(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3.5 12a8.5 8.5 0 1 0 2.8-6.3L3.5 8.2" />
      <path d="M3.5 3.5v4.7h4.7" />
      <Ten />
    </Svg>
  );
}

export function Forward10(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M20.5 12a8.5 8.5 0 1 1-2.8-6.3l2.8 2.5" />
      <path d="M20.5 3.5v4.7h-4.7" />
      <Ten />
    </Svg>
  );
}

/** A film strip, struck through: the file cannot play here. */
export function FilmOff(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M7 3v18M17 3v18M3 8h4M3 16h4M17 8h4M17 16h4M2 2l20 20" />
    </Svg>
  );
}

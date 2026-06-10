export default function Logo({ size = 16, color = "currentColor" }: { size?: number; color?: string }) {
  // Mekari asterisk — six rounded arms, drawn as three round-capped strokes
  // through center at 0° / 60° / 120°.
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      aria-hidden="true"
      className="logo"
    >
      <g stroke={color} strokeWidth="26" strokeLinecap="round">
        <line x1="14" y1="50" x2="86" y2="50" />
        <line x1="32" y1="18.8" x2="68" y2="81.2" />
        <line x1="68" y1="18.8" x2="32" y2="81.2" />
      </g>
    </svg>
  );
}

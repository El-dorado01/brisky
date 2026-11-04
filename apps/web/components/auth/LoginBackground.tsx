const V = "#7363de";

// Decorative only: one violet shade at varying opacities.
function Rings({ radii, size, className }: { radii: number[]; size: number; className: string }) {
  const c = size / 2;
  return (
    <svg className={`absolute ${className}`} width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none" stroke={V}>
      {radii.map((r, i) => (
        <circle key={r} cx={c} cy={c} r={r} strokeOpacity={0.16 - i * 0.03} strokeDasharray={i % 2 ? "4 8" : undefined} />
      ))}
    </svg>
  );
}

export function LoginBackground() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-brand-canvas"
      style={{ backgroundColor: "var(--color-brand-canvas)" }}
    >
      {/* dot grid, fading out toward the edges */}
      <div
        className="absolute inset-0 opacity-[0.35] [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_75%)]"
        style={{ backgroundImage: `radial-gradient(${V}55 1.2px, transparent 1.2px)`, backgroundSize: "28px 28px" }}
      />

      {/* central rings, echoed in the corners */}
      <Rings radii={[140, 220, 310, 410]} size={900} className="left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" />
      <Rings radii={[100, 160, 220]} size={480} className="-left-40 -top-40" />
      <Rings radii={[100, 160, 220]} size={480} className="-bottom-40 -right-40" />

      {/* a few small accents */}
      <svg className="absolute inset-0 size-full" fill="none" stroke={V}>
        <rect x="8%" y="64%" width="70" height="70" rx="14" strokeOpacity="0.16" transform="rotate(18 100 600)" />
        <rect x="88%" y="14%" width="54" height="54" rx="12" fill={V} fillOpacity="0.05" strokeOpacity="0.16" />
        <circle cx="92%" cy="52%" r="6" fill={V} fillOpacity="0.22" stroke="none" />
        <circle cx="6%" cy="36%" r="5" fill={V} fillOpacity="0.18" stroke="none" />
      </svg>

      {/* soft violet glow */}
      <div className="absolute left-1/2 top-1/2 size-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-violet/10 blur-3xl transform-gpu" />
    </div>
  );
}

/**
 * Haikei-style generative SVG backgrounds, rendered deterministically on the server
 * (seeded PRNG, so there are no hydration mismatches). Import from "@/components/backgrounds".
 *   <BlurryGradient />  soft drifting colour blobs (Haikei "Blurry gradient")
 *   <LayeredWaves />    stacked wave divider (Haikei "Layered waves")
 *   <BlobScene />       organic blob cluster (Haikei "Blob scene")
 *   <CircleScatter />   scattered dots (Haikei "Circle scatter")
 *   <Grain />           paper grain overlay
 */

function prng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth closed blob path (Catmull-Rom -> cubic Bezier) around (cx, cy). */
export function blobPath(seed: number, cx: number, cy: number, r: number, points = 7, variance = 0.28): string {
  const rand = prng(seed);
  const pts = Array.from({ length: points }, (_, i) => {
    const a = (i / points) * Math.PI * 2;
    const rr = r * (1 - variance + rand() * variance * 2);
    return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr] as const;
  });
  const n = pts.length;
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d + "Z";
}

/** Wave path across width w at baseline y with amplitude a. */
function wavePath(seed: number, w: number, h: number, y: number, a: number, segments = 5): string {
  const rand = prng(seed);
  const step = w / segments;
  const ys = Array.from({ length: segments + 1 }, () => y + (rand() - 0.5) * 2 * a);
  let d = `M0 ${ys[0].toFixed(1)}`;
  for (let i = 0; i < segments; i++) {
    const x0 = i * step, x1 = (i + 1) * step;
    d += ` C${(x0 + step / 2).toFixed(1)} ${ys[i].toFixed(1)} ${(x1 - step / 2).toFixed(1)} ${ys[i + 1].toFixed(1)} ${x1.toFixed(1)} ${ys[i + 1].toFixed(1)}`;
  }
  return `${d} L${w} ${h} L0 ${h}Z`;
}

export function BlurryGradient({ className = "", intensity = 1 }: { className?: string; intensity?: number }) {
  const o = (v: number) => Math.min(1, v * intensity);
  return (
    <div aria-hidden className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      <div className="blob-drift-1 absolute -left-24 -top-24 size-[520px] rounded-full blur-[90px]" style={{ background: `rgba(255,170,90,${o(0.45)})` }} />
      <div className="blob-drift-2 absolute right-[-120px] top-10 size-[460px] rounded-full blur-[100px]" style={{ background: `rgba(194,65,12,${o(0.22)})` }} />
      <div className="blob-drift-3 absolute bottom-[-160px] left-1/3 size-[520px] rounded-full blur-[110px]" style={{ background: `rgba(15,118,110,${o(0.16)})` }} />
      <div className="blob-drift-2 absolute bottom-10 right-1/4 size-[280px] rounded-full blur-[80px]" style={{ background: `rgba(255,196,57,${o(0.25)})` }} />
    </div>
  );
}

export function LayeredWaves({ seed = 7, flip = false, className = "", colors }: { seed?: number; flip?: boolean; className?: string; colors?: string[] }) {
  const W = 1440, H = 220;
  const fills = colors ?? ["rgba(194,65,12,0.10)", "rgba(255,170,90,0.16)", "rgba(15,118,110,0.10)", "var(--paper-2)"];
  return (
    <svg aria-hidden viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={`block w-full ${flip ? "rotate-180" : ""} ${className}`}>
      {fills.map((f, i) => (
        <path key={i} d={wavePath(seed * 31 + i * 7, W, H, 70 + i * 38, 26 - i * 3, 5 + (i % 2))} fill={f} />
      ))}
    </svg>
  );
}

export function BlobScene({ seed = 3, className = "" }: { seed?: number; className?: string }) {
  const W = 800, H = 600;
  const blobs = [
    { cx: 140, cy: 120, r: 120, fill: "rgba(194,65,12,0.14)" },
    { cx: 680, cy: 90, r: 90, fill: "rgba(255,170,90,0.22)" },
    { cx: 600, cy: 480, r: 150, fill: "rgba(15,118,110,0.12)" },
    { cx: 120, cy: 520, r: 80, fill: "rgba(255,196,57,0.22)" },
    { cx: 400, cy: 300, r: 60, fill: "rgba(194,65,12,0.08)" },
  ];
  return (
    <svg aria-hidden viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" className={`absolute inset-0 h-full w-full ${className}`}>
      {blobs.map((b, i) => (
        <path key={i} d={blobPath(seed * 13 + i, b.cx, b.cy, b.r, 7, 0.3)} fill={b.fill} />
      ))}
    </svg>
  );
}

export function CircleScatter({ seed = 11, count = 26, className = "" }: { seed?: number; count?: number; className?: string }) {
  const rand = prng(seed);
  const W = 1000, H = 400;
  return (
    <svg aria-hidden viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" className={`absolute inset-0 h-full w-full ${className}`}>
      {Array.from({ length: count }).map((_, i) => {
        const r = 2 + rand() * 7;
        return <circle key={i} cx={rand() * W} cy={rand() * H} r={r} fill={i % 4 === 0 ? "rgba(194,65,12,0.25)" : i % 4 === 1 ? "rgba(15,118,110,0.2)" : "rgba(31,27,22,0.10)"} />;
      })}
    </svg>
  );
}

export function Grain({ opacity = 0.05 }: { opacity?: number }) {
  return (
    <svg aria-hidden className="pointer-events-none fixed inset-0 z-[60] h-full w-full mix-blend-multiply" style={{ opacity }}>
      <filter id="mt-grain">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect width="100%" height="100%" filter="url(#mt-grain)" />
    </svg>
  );
}

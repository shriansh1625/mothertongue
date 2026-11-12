"use client";
/**
 * Motion primitives (Watermelon-UI-style micro-interactions built on motion/react).
 * Import from "@/components/motion/primitives". All are client components and respect reduced-motion.
 */
import { AnimatePresence, motion, useInView, useMotionTemplate, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react";
import { Children, useEffect, useRef, useState, type ReactNode } from "react";

const EASE = [0.22, 1, 0.36, 1] as const;

/** Fade + blur + rise when scrolled into view. */
export function Reveal({ children, delay = 0, y = 18, className, once = true }: { children: ReactNode; delay?: number; y?: number; className?: string; once?: boolean }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y, filter: "blur(6px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once, margin: "-60px" }}
      transition={{ duration: 0.7, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

/** Staggered children reveal. Wrap each child in <StaggerItem>. */
export function Stagger({ children, className, gap = 0.08, delay = 0 }: { children: ReactNode; className?: string; gap?: number; delay?: number }) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-60px" }}
      variants={{ hidden: {}, show: { transition: { staggerChildren: gap, delayChildren: delay } } }}
    >
      {children}
    </motion.div>
  );
}
export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      variants={{
        hidden: { opacity: 0, y: 16, filter: "blur(6px)" },
        show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.6, ease: EASE } },
      }}
    >
      {children}
    </motion.div>
  );
}

/** Word-by-word blur-in headline text. */
export function BlurText({ text, className, delay = 0, wordClassName }: { text: string; className?: string; delay?: number; wordClassName?: (word: string, i: number) => string | undefined }) {
  const words = text.split(" ");
  return (
    <span className={className}>
      {words.map((w, i) => (
        <motion.span
          key={`${w}-${i}`}
          className={`inline-block ${wordClassName?.(w, i) ?? ""}`}
          initial={{ opacity: 0, y: 14, filter: "blur(10px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.7, delay: delay + i * 0.07, ease: EASE }}
        >
          {w}
          {i < words.length - 1 ? " " : ""}
        </motion.span>
      ))}
    </span>
  );
}

/** Cycles through words with a blur/slide swap. */
export function RotatingWords({ words, interval = 2200, className }: { words: string[]; interval?: number; className?: string }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % words.length), interval);
    return () => clearInterval(t);
  }, [words.length, interval]);
  return (
    <span className={`relative inline-flex overflow-hidden align-bottom ${className ?? ""}`}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={words[i]}
          className="inline-block whitespace-nowrap"
          initial={{ y: "70%", opacity: 0, filter: "blur(8px)" }}
          animate={{ y: "0%", opacity: 1, filter: "blur(0px)" }}
          exit={{ y: "-70%", opacity: 0, filter: "blur(8px)" }}
          transition={{ duration: 0.55, ease: EASE }}
        >
          {words[i]}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/** Spring count-up when in view. */
export function NumberTicker({ value, decimals = 0, prefix = "", suffix = "", className }: { value: number; decimals?: number; prefix?: string; suffix?: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const mv = useMotionValue(0);
  const spring = useSpring(mv, { damping: 40, stiffness: 120 });
  const reduce = useReducedMotion();
  // round first and add 0 so tiny spring overshoots never render as "-0.00"
  const text = useTransform(spring, (v) => `${prefix}${(Math.round(v * 10 ** decimals) / 10 ** decimals + 0).toFixed(decimals)}${suffix}`);
  useEffect(() => {
    if (!inView) return;
    mv.set(value);
    if (reduce) spring.jump(value);
  }, [inView, value, mv, spring, reduce]);
  return (
    <motion.span ref={ref} className={`tabular-nums ${className ?? ""}`}>
      {text}
    </motion.span>
  );
}

/** Card with a mouse-following spotlight and gentle 3D tilt. */
export function SpotlightCard({ children, className = "", tilt = true }: { children: ReactNode; className?: string; tilt?: boolean }) {
  const mx = useMotionValue(-200);
  const my = useMotionValue(-200);
  const rx = useSpring(0, { stiffness: 150, damping: 15 });
  const ry = useSpring(0, { stiffness: 150, damping: 15 });
  const bg = useMotionTemplate`radial-gradient(360px circle at ${mx}px ${my}px, rgba(194,65,12,0.12), transparent 70%)`;
  return (
    <motion.div
      className={`card relative overflow-hidden ${className}`}
      style={{ rotateX: rx, rotateY: ry, transformPerspective: 900 }}
      onMouseMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        mx.set(e.clientX - r.left);
        my.set(e.clientY - r.top);
        if (tilt) {
          rx.set(((e.clientY - r.top) / r.height - 0.5) * -6);
          ry.set(((e.clientX - r.left) / r.width - 0.5) * 6);
        }
      }}
      onMouseLeave={() => {
        mx.set(-200);
        my.set(-200);
        rx.set(0);
        ry.set(0);
      }}
    >
      <motion.div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: bg }} />
      <div className="relative">{children}</div>
    </motion.div>
  );
}

/** Infinite horizontal marquee (CSS-driven for smoothness). */
export function Marquee({ children, reverse = false, duration = 40, className = "" }: { children: ReactNode; reverse?: boolean; duration?: number; className?: string }) {
  const items = Children.toArray(children);
  return (
    <div className={`marquee-mask overflow-hidden ${className}`}>
      <div className={`marquee-track ${reverse ? "marquee-reverse" : ""}`} style={{ animationDuration: `${duration}s` }}>
        {[0, 1].map((k) => (
          <div key={k} className="flex shrink-0 items-center gap-4 pr-4" aria-hidden={k === 1}>
            {items}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Animated voice waveform bars. Pass `levels` (0..1) for live audio, or omit for an idle loop. */
export function WaveBars({ levels, bars = 28, active = true, className = "", color = "var(--accent)" }: { levels?: number[]; bars?: number; active?: boolean; className?: string; color?: string }) {
  const seeds = Array.from({ length: bars }, (_, i) => 0.25 + 0.75 * Math.abs(Math.sin(i * 1.7 + 0.5)));
  return (
    <div className={`flex h-12 items-center gap-[3px] ${className}`} aria-hidden>
      {seeds.map((s, i) => {
        const live = levels ? Math.max(0.08, levels[i % levels.length] ?? 0.08) : null;
        return (
          <motion.span
            key={i}
            className="w-[3px] rounded-full"
            style={{ background: color, height: "100%", originY: 0.5 }}
            animate={live !== null ? { scaleY: live } : active ? { scaleY: [0.15, s, 0.3, s * 0.8, 0.15] } : { scaleY: 0.12 }}
            transition={live !== null ? { type: "spring", stiffness: 300, damping: 20 } : { duration: 1.2 + (i % 5) * 0.12, repeat: Infinity, ease: "easeInOut", delay: (i % 7) * 0.05 }}
          />
        );
      })}
    </div>
  );
}

/** Floating "+$0.25" with a coin-particle burst. Re-trigger by changing `trigger`. */
export function CoinBurst({ trigger, label }: { trigger: number; label: string }) {
  return (
    <AnimatePresence>
      {trigger > 0 && (
        <motion.div key={trigger} className="pointer-events-none absolute inset-0 flex items-center justify-center" initial={{ opacity: 1 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.span
            className="font-display text-3xl font-semibold text-ok"
            initial={{ y: 0, opacity: 0, scale: 0.8 }}
            animate={{ y: -60, opacity: [0, 1, 1, 0], scale: 1.1 }}
            transition={{ duration: 1.6, ease: EASE }}
          >
            {label}
          </motion.span>
          {Array.from({ length: 12 }).map((_, i) => {
            const a = (i / 12) * Math.PI * 2;
            return (
              <motion.span
                key={i}
                className="absolute size-2 rounded-full"
                style={{ background: i % 3 === 0 ? "#ffc439" : i % 3 === 1 ? "var(--ok)" : "var(--accent)" }}
                initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                animate={{ x: Math.cos(a) * 90, y: Math.sin(a) * 70 - 20, opacity: 0, scale: 0.4 }}
                transition={{ duration: 0.9, ease: "easeOut" }}
              />
            );
          })}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Animated progress bar; segments are fractions 0..1 stacked left to right. */
export function ProgressBar({ segments, className = "" }: { segments: { value: number; color: string; label?: string }[]; className?: string }) {
  const clamped = segments.map((s) => Math.max(0, Math.min(1, s.value)));
  const lefts = clamped.map((_, i) => clamped.slice(0, i).reduce((a, b) => a + b, 0));
  return (
    <div className={`relative h-2.5 w-full overflow-hidden rounded-full bg-paper-2 ${className}`}>
      {segments.map((s, i) => {
        const left = lefts[i];
        return (
          <motion.div
            key={i}
            title={s.label}
            className="absolute top-0 h-full"
            style={{ left: `${left * 100}%`, background: s.color }}
            initial={{ width: 0 }}
            whileInView={{ width: `${Math.max(0, Math.min(1, s.value)) * 100}%` }}
            viewport={{ once: true }}
            transition={{ duration: 1.1, delay: 0.15 * i, ease: EASE }}
          />
        );
      })}
    </div>
  );
}

/** Hover-lift wrapper for interactive tiles and links. */
export function Lift({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div className={className} whileHover={{ y: -4 }} whileTap={{ scale: 0.98 }} transition={{ type: "spring", stiffness: 300, damping: 20 }}>
      {children}
    </motion.div>
  );
}

export { motion, AnimatePresence };

"use client";

import { motion, useReducedMotion, useSpring, useTransform } from "motion/react";
import { useEffect } from "react";

function fmt(v: number, decimals: number) {
  const n = Number.isFinite(v) ? v : 0;
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/**
 * Number that springs to its new value whenever `value` changes.
 * Driven by a motion value (no per-frame React renders); jumps instantly under reduced motion.
 */
export function AnimatedNumber({
  value,
  decimals = 0,
  prefix = "",
  suffix = "",
  className = "",
}: {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}) {
  const safe = Number.isFinite(value) ? value : 0;
  const reduce = useReducedMotion();
  const spring = useSpring(safe, { stiffness: 160, damping: 24, mass: 0.7 });
  const text = useTransform(spring, (v) => `${prefix}${fmt(decimals === 0 ? Math.round(v) : v, decimals)}${suffix}`);

  useEffect(() => {
    if (reduce) spring.jump(safe);
    else spring.set(safe);
  }, [safe, reduce, spring]);

  return (
    <span className={`tabular-nums ${className}`}>
      <motion.span aria-hidden>{text}</motion.span>
      <span className="sr-only">{`${prefix}${fmt(safe, decimals)}${suffix}`}</span>
    </span>
  );
}

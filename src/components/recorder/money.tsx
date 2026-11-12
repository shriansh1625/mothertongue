"use client";
import { animate, motion, useMotionValue, useTransform } from "motion/react";
import { useEffect, useRef } from "react";

/** Dollar amount (from cents) that springs to new values instead of jumping. */
export function AnimatedMoney({ cents, className = "" }: { cents: number; className?: string }) {
  const mv = useMotionValue(cents);
  const text = useTransform(mv, (v) => `$${(v / 100).toFixed(2)}`);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      mv.set(cents);
      return;
    }
    const a = animate(mv, cents, { type: "spring", stiffness: 90, damping: 20 });
    return () => a.stop();
  }, [cents, mv]);
  return <motion.span className={`tabular-nums ${className}`}>{text}</motion.span>;
}

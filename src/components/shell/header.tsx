"use client";
/**
 * Glassy sticky header. The blur lives on a sibling layer (not the <header> itself) so that
 * fixed-position children such as the mobile menu scrim are positioned against the viewport.
 * Scroll depth drives the hairline + shadow via motion values (no React state per frame).
 */
import Link from "next/link";
import { motion, useScroll, useTransform } from "motion/react";
import { Logo } from "./logo";
import { Nav } from "./nav";

export function SiteHeader() {
  const { scrollY } = useScroll();
  const shadow = useTransform(scrollY, [0, 80], ["0 0 0 rgba(31,27,22,0)", "0 10px 30px -18px rgba(31,27,22,0.28)"]);
  const bg = useTransform(scrollY, [0, 80], ["rgba(251,247,240,0.55)", "rgba(251,247,240,0.82)"]);
  const hairline = useTransform(scrollY, [0, 80], ["rgba(230,220,205,0.35)", "rgba(230,220,205,0.95)"]);

  return (
    <motion.header className="sticky top-0 z-40" style={{ boxShadow: shadow }}>
      <motion.div
        aria-hidden
        className="absolute inset-0 -z-10 border-b backdrop-blur-xl backdrop-saturate-150"
        style={{ backgroundColor: bg, borderColor: hairline }}
      />
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5">
        <Link
          href="/"
          aria-label="MotherTongue home"
          className="group flex items-center gap-2.5 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
        >
          <motion.span whileHover={{ rotate: -6, scale: 1.06 }} whileTap={{ scale: 0.94 }} transition={{ type: "spring", stiffness: 400, damping: 18 }} className="inline-flex">
            <Logo />
          </motion.span>
          <span className="font-display text-xl font-semibold tracking-tight">MotherTongue</span>
        </Link>
        <Nav />
      </div>
    </motion.header>
  );
}

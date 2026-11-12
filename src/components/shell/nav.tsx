"use client";
/**
 * Primary site navigation: a sliding hover/active pill (shared layoutId) on desktop and an
 * animated drop-down sheet on mobile. Active state comes from usePathname.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useId, useState } from "react";

const LINKS = [
  { href: "/contribute", label: "Record & earn", hint: "Read sentences aloud, get paid via PayPal" },
  { href: "/fund", label: "Fund a language", hint: "Commission verified speech data" },
  { href: "/ledger", label: "Ledger", hint: "Every PayPal call and AI decision" },
] as const;

const SPRING = { type: "spring", stiffness: 420, damping: 34, mass: 0.7 } as const;

function isActive(pathname: string, href: string) {
  if (pathname === href || pathname.startsWith(`${href}/`)) return true;
  // Campaign dashboards live under /campaigns but belong to the funder flow.
  return href === "/fund" && pathname.startsWith("/campaigns");
}

export function SandboxChip({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-ppblue/20 bg-ppblue/[0.06] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-ppblue ${className}`}
      title="Payments run in the PayPal sandbox. No real money moves."
    >
      <span className="relative flex size-1.5" aria-hidden>
        <span className="absolute inline-flex size-full rounded-full bg-ppblue/60 motion-safe:animate-ping" />
        <span className="relative inline-flex size-1.5 rounded-full bg-ppblue" />
      </span>
      Sandbox
      <span className="sr-only">: PayPal sandbox, no real money moves</span>
    </span>
  );
}

export function Nav() {
  const pathname = usePathname() ?? "/";
  const reduce = useReducedMotion();
  const [hovered, setHovered] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const active = LINKS.find((l) => isActive(pathname, l.href))?.href ?? null;
  const pillAt = hovered ?? active;

  // Close the mobile sheet on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {/* Desktop */}
      <nav aria-label="Primary" className="hidden items-center gap-3 sm:flex">
        <ul className="flex items-center gap-0.5 text-sm font-medium" onMouseLeave={() => setHovered(null)}>
          {LINKS.map((l) => {
            const on = active === l.href;
            return (
              <li key={l.href} className="relative">
                <Link
                  href={l.href}
                  aria-current={on ? "page" : undefined}
                  onMouseEnter={() => setHovered(l.href)}
                  onFocus={() => setHovered(l.href)}
                  onBlur={() => setHovered(null)}
                  className={`relative z-10 block rounded-full px-3.5 py-2 transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                    on ? "text-ink" : "text-muted hover:text-ink"
                  }`}
                >
                  {pillAt === l.href && (
                    <motion.span
                      layoutId="nav-pill"
                      aria-hidden
                      className={`absolute inset-0 -z-10 rounded-full ${
                        on ? "bg-white shadow-[0_1px_0_rgba(31,27,22,0.04),0_6px_16px_-10px_rgba(31,27,22,0.35)] ring-1 ring-line" : "bg-ink/[0.05]"
                      }`}
                      transition={reduce ? { duration: 0 } : SPRING}
                    />
                  )}
                  {l.label}
                  {on && (
                    <motion.span
                      layoutId="nav-dot"
                      aria-hidden
                      className="absolute -bottom-[3px] left-1/2 size-1 -translate-x-1/2 rounded-full bg-accent"
                      transition={reduce ? { duration: 0 } : SPRING}
                    />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
        <span className="h-5 w-px bg-line" aria-hidden />
        <SandboxChip />
      </nav>

      {/* Mobile */}
      <div className="flex items-center gap-2 sm:hidden">
        <SandboxChip />
        <motion.button
          type="button"
          whileTap={{ scale: 0.92 }}
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={menuId}
          aria-label={open ? "Close menu" : "Open menu"}
          className="relative grid size-10 place-items-center rounded-full border border-line bg-white/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <span className="sr-only">Menu</span>
          <motion.span
            aria-hidden
            className="absolute h-[1.5px] w-4 rounded-full bg-ink"
            animate={open ? { rotate: 45, y: 0 } : { rotate: 0, y: -3.5 }}
            transition={reduce ? { duration: 0 } : SPRING}
          />
          <motion.span
            aria-hidden
            className="absolute h-[1.5px] w-4 rounded-full bg-ink"
            animate={open ? { rotate: -45, y: 0 } : { rotate: 0, y: 3.5 }}
            transition={reduce ? { duration: 0 } : SPRING}
          />
        </motion.button>
      </div>

      <AnimatePresence>
        {open && (
          <>
            <motion.button
              type="button"
              aria-label="Close menu"
              tabIndex={-1}
              className="fixed inset-0 top-16 z-[-1] bg-ink/10 backdrop-blur-[2px] sm:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
            />
            <motion.nav
              id={menuId}
              aria-label="Primary mobile"
              className="absolute inset-x-3 top-[calc(100%+8px)] overflow-hidden rounded-2xl border border-line bg-[#fffdf9]/95 p-2 shadow-[0_24px_60px_-24px_rgba(31,27,22,0.45)] backdrop-blur-xl sm:hidden"
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: -10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.98 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              style={{ transformOrigin: "top right" }}
            >
              <motion.ul initial="hidden" animate="show" variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05, delayChildren: 0.04 } } }}>
                {LINKS.map((l) => {
                  const on = active === l.href;
                  return (
                    <motion.li key={l.href} variants={{ hidden: { opacity: 0, y: -6 }, show: { opacity: 1, y: 0 } }}>
                      <Link
                        href={l.href}
                        onClick={() => setOpen(false)}
                        aria-current={on ? "page" : undefined}
                        className={`flex items-center justify-between gap-3 rounded-xl px-4 py-3 focus-visible:outline-2 focus-visible:outline-accent ${
                          on ? "bg-paper-2" : "hover:bg-paper-2/70"
                        }`}
                      >
                        <span>
                          <span className="block font-medium">{l.label}</span>
                          <span className="block text-xs text-muted">{l.hint}</span>
                        </span>
                        <span aria-hidden className={on ? "text-accent" : "text-muted"}>
                          {on ? "●" : "→"}
                        </span>
                      </Link>
                    </motion.li>
                  );
                })}
              </motion.ul>
            </motion.nav>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

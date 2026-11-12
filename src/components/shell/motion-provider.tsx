"use client";

import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";

/** App-wide: honour the OS "reduce motion" setting for every Motion animation (transforms/layout are skipped, fades kept). */
export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}

"use client";

/* ============================================================
   <Button> — the portal's canonical interactive component.

   The visual language lives in one place (the `.btn` layer in
   app/globals.css), so every screen that writes `className="btn"` already
   looks right. What this component adds is the part CSS cannot do: spring
   physics, and a magnetic pull for the primary action of a surface.

   Why it renders `.btn` rather than its own classes: ~150 call sites across
   the portal already use `.btn`, and the brief's "consolidate" step is only
   real if the component and the existing markup converge on the same design
   system instead of drifting apart.

   Motion is spring-based, not duration-based, because that is what makes a
   control feel physical: a spring reaches its target with momentum and
   settles, a duration curve just stops. `whileTap` compresses to .97 and
   releases through an overshoot; `whileHover` lifts 1px and scales to 1.02.

   Everything degrades: `useReducedMotion()` drops all of it, and a server
   render (or JS disabled) still produces a correct, styled, focusable
   control because the CSS carries the resting and focus states.

   Usage
   -----
     <Button>Save</Button>                       // primary, submits nothing
     <Button variant="ghost" href="/x">Back</Button>
     <Button variant="danger" busy>Deleting…</Button>
     <Button variant="primary" magnet>Sign in</Button>
   ============================================================ */

import { motion, useMotionValue, useReducedMotion, useSpring } from "framer-motion";
import * as React from "react";

type Variant = "primary" | "secondary" | "ghost" | "outline" | "danger" | "quiet";

export type ButtonProps = {
  variant?: Variant;
  size?: "sm" | "md" | "lg";
  /** Renders an <a> instead of a <button> — for navigation. */
  href?: string;
  /** Disables the control and announces a pending action. */
  busy?: boolean;
  /** The magnetic pull. Reserve it for the primary action of a surface. */
  magnet?: boolean;
  block?: boolean;
  className?: string;
  children?: React.ReactNode;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children">;

const VARIANT_CLASS: Record<Variant, string> = {
  primary: "",
  secondary: "secondary",
  ghost: "ghost",
  outline: "outline",
  danger: "danger",
  quiet: "quiet",
};

/* Spring, not duration. stiffness/damping chosen so the press reads as a
   compression and the release as a settle rather than a bounce. */
const PRESS_SPRING = { type: "spring" as const, stiffness: 620, damping: 26, mass: 0.6 };
const HOVER_SPRING = { type: "spring" as const, stiffness: 420, damping: 30, mass: 0.7 };
/* The magnet: a slow, heavily damped spring so the control trails the pointer
   instead of snapping to it. */
const MAGNET_SPRING = { stiffness: 180, damping: 18, mass: 0.9 };
const PHI = 1.618;
const PULL = 0.18;

export function Button({
  variant = "primary",
  size = "md",
  href,
  busy = false,
  magnet = false,
  block = false,
  className,
  children,
  disabled,
  onPointerMove,
  onPointerLeave,
  ...rest
}: ButtonProps) {
  const reduce = useReducedMotion();
  const ref = React.useRef<HTMLElement | null>(null);

  /* Motion values, so the pointer never re-renders React — a magnet that
     re-renders on every mousemove is a magnet that stutters. */
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, MAGNET_SPRING);
  const sy = useSpring(my, MAGNET_SPRING);

  const interactive = !disabled && !busy;
  const motionProps = reduce
    ? {}
    : interactive
      ? { whileHover: { y: -1, scale: 1.02 }, whileTap: { scale: 0.97 } }
      : {};

  function handleMove(e: React.PointerEvent<HTMLElement>) {
    onPointerMove?.(e as React.PointerEvent<HTMLButtonElement>);
    if (!magnet || reduce || !interactive) return;
    /* The pointer must be a fine one: a touch has no hover to magnetise, and
       moving a control under a finger is a bug, not a flourish. */
    if (!window.matchMedia?.("(hover: hover) and (pointer: fine)").matches) return;
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const radius = Math.max(r.width, r.height) * PHI;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const reach = Math.min(1, dist / radius);
    mx.set(dx * PULL * reach);
    my.set(dy * PULL * reach);
  }

  function handleLeave(e: React.PointerEvent<HTMLElement>) {
    onPointerLeave?.(e as React.PointerEvent<HTMLButtonElement>);
    mx.set(0);
    my.set(0);
  }

  const classes = [
    "btn",
    VARIANT_CLASS[variant],
    size !== "md" ? size : "",
    block ? "block" : "",
    className ?? "",
  ].filter(Boolean).join(" ");

  const shared = {
    ref: ref as React.Ref<any>,
    className: classes,
    onPointerMove: handleMove,
    onPointerLeave: handleLeave,
    style: magnet && !reduce ? { x: sx, y: sy } : undefined,
    "aria-busy": busy || undefined,
    ...motionProps,
    ...rest,
  };

  if (href && interactive) {
    return (
      <motion.a href={href} {...(shared as any)}>
        {children}
      </motion.a>
    );
  }

  return (
    <motion.button
      type="button"
      disabled={disabled || busy}
      {...(shared as any)}
    >
      {children}
    </motion.button>
  );
}

export default Button;

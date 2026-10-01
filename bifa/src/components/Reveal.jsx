import React from 'react';
import { motion } from 'framer-motion';

// Replaces [data-reveal]/[data-delay="1|2|3"] + the GSAP
// ScrollTrigger.batch() module entirely. Framer Motion's whileInView +
// variants + staggerChildren *is* ScrollTrigger.batch's job, built into the
// animation library instead of hand-orchestrated: a parent in "visible"
// state cascades to children automatically, once, the moment it crosses
// into view — no separate IntersectionObserver plumbing to maintain.
const EASE = [0.22, 1, 0.36, 1];

export const staggerContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12, delayChildren: 0.02 } },
};

export const revealItem = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.75, ease: EASE } },
};

// Resolves a convenient string shorthand (as="span") to the matching
// motion.span, so call sites can write as="h2"/as="p" naturally without
// every one of them needing to import and pass motion.h2/motion.p
// themselves. Passing a bare tag NAME straight through as `Component`
// (skipping this resolution) was a real bug caught while smoke-testing this
// build: React would then render a plain, non-motion <span>/<h2>/<p> with
// variants/initial/whileInView spread onto it as unrecognised DOM
// attributes — the element would silently never animate at all.
function resolveMotionComponent(as) {
  if (typeof as === 'string') return motion[as] || motion.div;
  return as || motion.div;
}

export function RevealGroup({
  as,
  className,
  children,
  amount = 0.3,
  once = true,
  mode = 'scroll', // 'scroll' (whileInView) or 'mount' (animate immediately, e.g. the hero)
  ...rest
}) {
  const Component = resolveMotionComponent(as);
  const triggerProps =
    mode === 'mount' ? { animate: 'visible' } : { whileInView: 'visible', viewport: { once, amount } };
  return (
    <Component className={className} initial="hidden" variants={staggerContainer} {...triggerProps} {...rest}>
      {children}
    </Component>
  );
}

export function RevealItem({ as, className, children, ...rest }) {
  const Component = resolveMotionComponent(as);
  return (
    <Component className={className} variants={revealItem} {...rest}>
      {children}
    </Component>
  );
}

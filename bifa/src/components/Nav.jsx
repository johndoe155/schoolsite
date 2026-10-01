import React, { useState, useRef } from 'react';
import { motion, AnimatePresence, useScroll, useMotionValueEvent } from 'framer-motion';
import { nav } from '../data/content.js';

const EASE = [0.22, 1, 0.36, 1];

function NavLink({ link, onNavigate }) {
  const [hovered, setHovered] = useState(false);
  if (link.cta) {
    return (
      <a href={link.href} className="btn nav-cta" onClick={onNavigate}>
        {link.label}
      </a>
    );
  }
  return (
    <a
      href={link.href}
      className="nav-link"
      data-disabled={link.disabled || undefined}
      aria-disabled={link.disabled || undefined}
      onClick={(e) => {
        if (link.disabled) e.preventDefault();
        onNavigate?.(e);
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {link.label}
      {!link.disabled && (
        <motion.span
          className="nav-link-underline"
          initial={false}
          animate={{ scaleX: hovered ? 1 : 0 }}
          transition={{ duration: 0.35, ease: EASE }}
        />
      )}
    </a>
  );
}

export default function Nav() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { scrollY } = useScroll();

  useMotionValueEvent(scrollY, 'change', (latest) => {
    setIsScrolled((prev) => (latest > 40 ? true : latest > 24 ? prev : false));
  });

  const closeMenu = () => setMenuOpen(false);

  return (
    <>
      <nav className={`nav${isScrolled ? ' is-scrolled' : ''}`} id="nav">
        <div className="container nav-inner">
          <a href="#home" className="logo" aria-label="Bodija International College home">
            <span className="dot" aria-hidden="true" />
            {nav.logo}
          </a>
          <div className="nav-links">
            {nav.links.map((link) => (
              <NavLink key={link.label} link={link} />
            ))}
          </div>
          <button
            className="menu-toggle"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            aria-controls="mobileMenu"
            onClick={() => setMenuOpen((v) => !v)}
          >
            <motion.span animate={menuOpen ? { y: 6, rotate: 45 } : { y: 0, rotate: 0 }} transition={{ duration: 0.35, ease: EASE }} />
            <motion.span animate={{ opacity: menuOpen ? 0 : 1 }} transition={{ duration: 0.2 }} />
            <motion.span animate={menuOpen ? { y: -6, rotate: -45 } : { y: 0, rotate: 0 }} transition={{ duration: 0.35, ease: EASE }} />
          </button>
        </div>
      </nav>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            className="mobile-menu"
            id="mobileMenu"
            role="dialog"
            aria-modal="true"
            aria-label="Mobile navigation"
            initial={{ clipPath: 'circle(0% at calc(100% - 45px) 40px)' }}
            animate={{ clipPath: 'circle(150% at calc(100% - 45px) 40px)' }}
            exit={{ clipPath: 'circle(0% at calc(100% - 45px) 40px)' }}
            transition={{ duration: 0.6, ease: EASE }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') closeMenu();
            }}
          >
            {nav.links.map((link) => (
              <a
                key={link.label}
                href={link.href}
                data-disabled={link.disabled || undefined}
                onClick={(e) => {
                  if (link.disabled) e.preventDefault();
                  closeMenu();
                }}
              >
                {link.label}
              </a>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

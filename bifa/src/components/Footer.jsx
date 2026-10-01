import React from 'react';
import { footer, nav, siteLogo } from '../data/content.js';

export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="site-footer">
      <div className="container">
        <a href="#home" className="logo">
          <span className="dot" aria-hidden="true" />
          <img src={siteLogo.src} alt={siteLogo.alt} loading="lazy" className="footer-logo-img" />
        </a>
        <div className="site-footer-links">
          {footer.links.map((link) => (
            <a key={link.label} href={link.href}>
              {link.label}
            </a>
          ))}
        </div>
      </div>
      <div className="site-footer-bottom">
        <span>{footer.note}</span>
        <span>&copy; {year}. All rights reserved.</span>
      </div>
    </footer>
  );
}

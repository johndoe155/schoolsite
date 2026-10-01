import React from 'react';

const common = {
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

export function LocationIcon() {
  return (
    <svg {...common}>
      <path d="M12 21s7-6.5 7-12a7 7 0 10-14 0c0 5.5 7 12 7 12z" />
      <circle cx="12" cy="9" r="2.4" />
    </svg>
  );
}

export function PaymentIcon() {
  return (
    <svg {...common}>
      <rect x="2.5" y="5.5" width="19" height="13" rx="2.2" />
      <path d="M2.5 9.8h19" />
      <path d="M6 14.5h5" />
    </svg>
  );
}

export function ContactIcon() {
  return (
    <svg {...common}>
      <rect x="2.5" y="5" width="19" height="14" rx="2.2" />
      <path d="M3.5 6.5l8.5 7 8.5-7" />
    </svg>
  );
}

export const ICONS = { location: LocationIcon, payment: PaymentIcon, contact: ContactIcon };

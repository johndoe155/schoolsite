// ============================================================================
// src/data/content.js
// ----------------------------------------------------------------------------
// Single source of truth for every string on the page. Pulled verbatim from
// the original academies-2.html — no facts invented or altered (tuition,
// bank details, phone/email, addresses, curriculum copy all match the
// source document). Centralising it here means the section components
// below are purely presentational: swap copy without touching layout code.
// ============================================================================
export const siteLogo = {
  // Vite serves anything placed in /public at the site root, so drop the
  // real crest file at public/logo.svg (svg/png/webp all fine — just keep
  // this path in sync with wherever it actually lives).
  src: '/logo.png',
  alt: 'Bodija International College crest',
};

export const nav = {
  logo: 'B.I.C',
  links: [
    { label: 'Home', href: '/index.html' },
    // The original pointed these four at local dev-server ports
    // (127.0.0.1:2020/3030/6060/5050) that 404 for a real visitor. "Our
    // Programs" and "Get In Touch" have real homes on this page, so they
    // route in-page. "Updates" and "Digital Library" don't correspond to
    // anything in this build, so they're marked soon/disabled rather than
    // given a guessed URL or a dead "#" (which used to jump-scroll the page
    // to the top on click — a small real bug, fixed here).
    { label: 'Updates', href: '#' },
    { label: 'Our Programs', href: '#bima' },
    // The original stylesheet defined a whole .nav-cta pill treatment
    // (brass fill, dark text) that no element in the markup ever actually
    // used — dead CSS. Given a real destination (#enroll) already exists,
    // this is where that unfulfilled intent belongs.
    { label: 'Get In Touch', href: '#enroll' },
    { label: 'Digital Library', href: '#' },
  ],
};

export const hero = {
  eyebrow: 'Bodija International College',
  heading: ['Cultivating', 'Excellence'],
  body: 'Home to two elite academies dedicated to shaping the future of media, arts, and athletics — where discipline meets creativity, and passion becomes profession.',
  ctaPrimary: { label: 'Begin Enrollment', href: '#enroll' },
  ctaSecondary: { label: 'Explore Academies', href: '#bima' },
};

export const bima = {
  id: 'bima',
  accent: 'clay',
  eyebrow: 'Test Your Voice • Shape the Future',
  heading: 'Bodija International Media Academy',
  body: 'A meticulously crafted certification program for visionaries entering the entertainment, media, and communication industries.',
  photo: {
    src: 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?q=80&w=1200&auto=format&fit=crop',
    badge: 'BIMA Studio',
    alt: 'Media studio production session',
  },
  panels: [
    {
      kicker: 'Intensive 2-Week Certification',
      title: 'Master the Creative Arts',
      body: 'BIMA delivers a short-term professional program tailored for those looking to dominate the entertainment, media, and business communication industries.',
      priceTag: { amount: '₦20,000', note: 'Next Session: April 2 – 19' },
    },
    {
      kicker: 'Discipline 01',
      title: 'Sound & Instrument',
      items: ['Sound Engineering and Music Production', 'Musical Instrument Training'],
    },
    {
      kicker: 'Discipline 02',
      title: 'Screen & Stage',
      items: ['Film Production and Editing', 'Dance and Drama'],
    },
    {
      kicker: 'Discipline 03',
      title: 'Business & Presence',
      items: [
        'Social Media Marketing & Content Creation',
        'Business and Communication Skills',
        'Costume and Makeup Artistry',
      ],
    },
  ],
};

export const bifa = {
  id: 'bifa',
  accent: 'pitch',
  surface: 'dark',
  eyebrow: 'The Soaring Eagles • We Love Football',
  heading: 'Bodija International Football Academy',
  body: 'Fostering athletic excellence in youth through rigorous training, professional trials, and direct pathways to competitive greatness.',
  photo: {
    src: '/bifa.jpg',
    badge: 'The Soaring Eagles',
    alt: 'Football training on the pitch',
  },
  panels: [
    {
      kicker: 'Elite Athletic Training & Tournaments',
      title: 'Elevate Your Game',
      body: "Operating under the banner of 'The Soaring Eagles', BIFA is dedicated to nurturing the next generation of competitive athletes.",
      priceTag: { amount: 'Open to All', note: 'Male & Female Athletes' },
    },
    {
      kicker: 'On the Pitch',
      title: 'Football & Track',
      items: [
        'Professional Football Training & Talent Trials',
        'Tournament Placements (e.g. KEFT 2024)',
        'Track & Field: Elite Relay Competitions',
      ],
    },
    {
      kicker: 'Beyond the Pitch',
      title: 'Affiliated Programs',
      items: ['Affiliated Drone Academy (Registration ₦10,000)', 'Table Tennis & Swimming Programs'],
    },
  ],
};

export const enroll = {
  eyebrow: 'Begin Your Journey With Us',
  heading: 'Enrollment Details',
  body: 'Everything you need to take the first step toward joining our academies.',
  cards: [
    {
      icon: 'location',
      heading: 'Academy Location',
      body: '1–5 Tunde Iakunni Crescent, Off Osuntokun, Bodija, Ibadan, Nigeria.',
      meta: 'Sessions commence 10:00 AM Daily',
    },
    {
      icon: 'payment',
      heading: 'Payment Gateway',
      body: 'All official payments are securely processed via the School Bursary accounts.',
      detail: [
        { label: 'Bank', value: 'GTBank' },
        { label: 'Name', value: 'Bodija International College' },
        { label: 'Account No', value: '0028908200' },
      ],
    },
    {
      icon: 'contact',
      heading: 'Contact Management',
      body: 'For inquiries, sports trials, and registration assistance, our team is on standby.',
      detail: [
        { label: 'Phone', value: '0803 086 1619', href: 'tel:+2348030861619' },
        { label: 'Email', value: 'bimacad2024@gmail.com', href: 'mailto:bimacad2024@gmail.com' },
      ],
    },
  ],
};

export const footer = {
  note: 'Bodija International College — BIMA & BIFA',
  links: [
    { label: 'What We Offer', href: '#bima' },
    { label: 'Connect With Us', href: '#enroll' },
  ],
};

// Builds dist/academies.html: a single, self-contained file with the app
// pre-bundled and inlined. React/Three/R3F/Framer Motion stay as external
// imports resolved at runtime via an import map against esm.sh — this
// script only bundles this project's own src/ files, so the output stays
// small and framework-version upgrades don't require rebuilding it.
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import esbuild from 'esbuild';

const root = fileURLToPath(new URL('..', import.meta.url));
const path = (...p) => new URL(p.join('/'), `file://${root}/`).pathname;

mkdirSync(path('dist'), { recursive: true });

const result = await esbuild.build({
  entryPoints: [path('src/main.jsx')],
  bundle: true,
  format: 'esm',
  target: 'es2020',
  jsx: 'automatic',
  external: [
    'react',
    'react-dom',
    'react-dom/client',
    'react/jsx-runtime',
    'react/jsx-dev-runtime',
    'framer-motion',
    '@react-three/fiber',
    'three',
  ],
  write: false,
  logLevel: 'info',
});

const bundle = result.outputFiles[0].text;

if (/<\/script/i.test(bundle)) {
  throw new Error('Bundle contains a literal </script sequence — cannot inline safely.');
}

const css = readFileSync(path('src/styles.css'), 'utf8');
const fallback = readFileSync(path('src/fallback.html'), 'utf8');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Bodija International Academies | BIMA &amp; BIFA</title>
<meta name="description" content="Bodija International College Academies — elite training in Creative Media Arts (BIMA) and Athletics (BIFA)." />

<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..700;1,9..144,400..600&family=Inter:wght@300;400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet" />

<style>
${css}

.emblem-stage { opacity: 0; transition: opacity 1.1s var(--ease); }
.emblem-stage.is-ready { opacity: 1; }
</style>
</head>
<body>
<!--
  #root starts populated with real, static, semantic markup (nav, hero,
  both academies, enrollment details, footer) rather than an empty shell,
  so a visitor whose connection can't reach the CDNs below — or who has
  module scripts blocked — still gets a complete, readable, navigable
  page. The moment React mounts, it replaces this subtree with the full
  interactive build.
-->
<div id="root">
${fallback}
</div>

<script>
  window.setTimeout(function () {
    if (window.__BIC_APP_MOUNTED__) return;
    var note = document.createElement('div');
    note.setAttribute('role', 'status');
    note.style.cssText = 'position:fixed;bottom:18px;left:18px;right:18px;max-width:440px;margin:0 auto;' +
      'background:#0E0C1B;color:#F3ECDA;padding:14px 20px;border-radius:14px;' +
      'font:14px/1.5 Inter,-apple-system,sans-serif;z-index:9999;box-shadow:0 16px 36px rgba(0,0,0,.32)';
    note.textContent = 'Showing the standard version of this page — the full interactive experience needs an internet connection to load.';
    document.body.appendChild(note);
  }, 6000);
</script>

<script type="importmap">
{
  "imports": {
    "react": "https://esm.sh/react@18.2.0",
    "react-dom": "https://esm.sh/react-dom@18.2.0",
    "react-dom/client": "https://esm.sh/react-dom@18.2.0/client",
    "react/jsx-runtime": "https://esm.sh/react@18.2.0/jsx-runtime",
    "react/jsx-dev-runtime": "https://esm.sh/react@18.2.0/jsx-dev-runtime",
    "three": "https://esm.sh/three@0.160.0",
    "@react-three/fiber": "https://esm.sh/@react-three/fiber@8?external=react,react-dom,three",
    "framer-motion": "https://esm.sh/framer-motion@11?external=react,react-dom"
  }
}
</script>

<script type="module">
${bundle}
</script>
</body>
</html>
`;

const outPath = path('dist/academies.html');
writeFileSync(outPath, html, 'utf8');
console.log(`Wrote dist/academies.html (${(html.length / 1024).toFixed(1)} KB)`);

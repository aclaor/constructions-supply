// Placeholder product artwork for the sample catalog, drawn as SVG so the store needs no image hosting.
const TONES = [
  { bg: '#E2E6E9', line: '#C9D0D5', fg: '#14212B', accent: '#FFC61A' },
  { bg: '#1D4468', line: '#2B5680', fg: '#FFFFFF', accent: '#FFC61A' },
  { bg: '#FFC61A', line: '#F0B600', fg: '#14212B', accent: '#FFFFFF' },
  { bg: '#14212B', line: '#22323F', fg: '#E2E6E9', accent: '#FFC61A' },
];

const ICONS = {
  'power-tools': (f, a) => `<rect x="100" y="135" width="160" height="74" rx="14" fill="${f}"/><rect x="260" y="152" width="36" height="40" rx="4" fill="${a}"/><rect x="296" y="167" width="62" height="10" rx="2" fill="${f}"/><path d="M146 205h66l-12 92h-58z" fill="${f}"/><rect x="124" y="294" width="108" height="34" rx="7" fill="${a}"/><rect x="214" y="214" width="24" height="13" rx="4" fill="${a}"/>`,
  'hand-tools': (f, a) => `<g transform="rotate(-35 200 200)"><rect x="188" y="130" width="24" height="220" rx="9" fill="${a}"/><rect x="140" y="86" width="130" height="58" rx="8" fill="${f}"/><path d="M142 86q-48 4-58 48l58-14z" fill="${f}"/></g>`,
  fasteners: (f, a) => `<polygon points="200,62 264,98 264,156 200,192 136,156 136,98" fill="${f}"/><rect x="174" y="188" width="52" height="150" rx="4" fill="${a}"/><path d="M174 216l52-12M174 246l52-12M174 276l52-12M174 306l52-12" stroke="${f}" stroke-width="9"/>`,
  safety: (f, a) => `<path d="M86 252a114 114 0 01228 0z" fill="${a}"/><rect x="186" y="126" width="28" height="126" rx="8" fill="${f}"/><rect x="62" y="248" width="276" height="30" rx="15" fill="${f}"/>`,
  electrical: (f, a) => `<rect x="164" y="84" width="20" height="72" rx="5" fill="${a}"/><rect x="216" y="84" width="20" height="72" rx="5" fill="${a}"/><rect x="134" y="148" width="132" height="112" rx="20" fill="${f}"/><path d="M200 258v36q0 44-44 44h-50" fill="none" stroke="${f}" stroke-width="18" stroke-linecap="round"/>`,
  plumbing: (f, a) => `<path d="M92 152h124a64 64 0 0164 64v102" fill="none" stroke="${f}" stroke-width="58"/><rect x="80" y="112" width="28" height="80" rx="4" fill="${a}"/><rect x="240" y="304" width="80" height="28" rx="4" fill="${a}"/>`,
  paint: (f, a) => `<rect x="92" y="92" width="190" height="64" rx="16" fill="${a}"/><path d="M282 124h40v76H200v44" fill="none" stroke="${f}" stroke-width="13" stroke-linejoin="round"/><rect x="185" y="238" width="30" height="104" rx="10" fill="${f}"/>`,
  measuring: (f, a) => `<rect x="96" y="112" width="160" height="160" rx="30" fill="${f}"/><circle cx="176" cy="192" r="40" fill="${a}"/><rect x="256" y="238" width="90" height="28" fill="${a}"/><path d="M272 238v12M288 238v18M304 238v12M320 238v18" stroke="${f}" stroke-width="5"/><rect x="344" y="230" width="9" height="46" rx="2" fill="${f}"/>`,
};

export function artResponse(category, tone) {
  const draw = ICONS[category];
  if (!draw) return new Response('Not found', { status: 404 });
  const t = TONES[Math.abs(parseInt(tone, 10) || 0) % TONES.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><defs><pattern id="g" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="${t.line}" stroke-width="1.5"/></pattern></defs><rect width="400" height="400" fill="${t.bg}"/><rect width="400" height="400" fill="url(#g)"/>${draw(t.fg, t.accent)}</svg>`;
  return new Response(svg, { headers: { 'content-type': 'image/svg+xml', 'cache-control': 'public, max-age=604800' } });
}

/** Small single-colour version for navigation tiles. */
export function iconSvg(category, fg, accent) {
  const draw = ICONS[category];
  return draw ? `<svg viewBox="40 40 320 320" aria-hidden="true">${draw(fg, accent)}</svg>` : '';
}

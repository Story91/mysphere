// Generates MySphere / Startpad light-theme social share cards (1200x630) as PNGs.
// Every string below is fixed copy, verified against the Solidity on origin/master
// or docs/SPHERE-TOKENOMIKA.md. Nothing here is generated at run time.
const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');

const W = 1200, H = 630, M = 80;
const FONTS = path.join(__dirname, 'fonts');

// Palette lifted from app/globals.css + tailwind.config.ts (see brand inventory).
const INK = '#111827';       // headings
const BODY = '#374151';      // deck
const MUTED = '#6B7280';     // labels, eyebrow
const FAINT = '#9CA3AF';     // footer citation
const RULE = '#E5E7EB';      // hairlines
const BLUE = '#0052FF';      // Base blue, the single accent

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const monogram = fs.readFileSync(
  path.join(__dirname, 'monogram.png')
).toString('base64');

function card(c) {
  const rows = c.rows;
  // Headline block
  let y = 168;
  const headline = c.headline.map((line, i) =>
    `<text x="${M}" y="${y + i * 64}" font-family="Outfit" font-weight="700" font-size="56" letter-spacing="-1.4" fill="${INK}">${esc(line)}</text>`
  ).join('');
  y += (c.headline.length - 1) * 64;

  const deckY = y + 46;
  const ledgerTop = deckY + 34;
  const ROW = 42;

  const ledger = rows.map((r, i) => {
    const top = ledgerTop + i * ROW;
    const base = top + 27;
    const isNum = /[0-9]/.test(r[1]);
    return `<line x1="${M + 3}" y1="${top + ROW}" x2="${W - M}" y2="${top + ROW}" stroke="${RULE}" stroke-width="1"/>` +
      `<text x="${M + 22}" y="${base}" font-family="Space Mono" font-size="19" fill="${MUTED}">${esc(r[0])}</text>` +
      `<text x="${W - M}" y="${base}" text-anchor="end" font-family="Space Mono" font-weight="700" font-size="19" fill="${isNum ? BLUE : INK}">${esc(r[1])}</text>`;
  }).join('');

  const ledgerH = rows.length * ROW;

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#FFFFFF"/>
      <stop offset="0.55" stop-color="#F9FAFB"/>
      <stop offset="1" stop-color="#EFF6FF"/>
    </linearGradient>
    <filter id="tint" x="0" y="0" width="100%" height="100%">
      <feFlood flood-color="${BLUE}" result="c"/>
      <feComposite in="c" in2="SourceAlpha" operator="in"/>
    </filter>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#g)"/>
  <rect x="0" y="0" width="${W}" height="6" fill="${BLUE}"/>

  <!-- eyebrow -->
  <text x="${M}" y="82" font-family="Space Mono" font-size="15" letter-spacing="2.6" fill="${MUTED}">${esc(c.eyebrow)}</text>
  <image xlink:href="data:image/png;base64,${monogram}" x="${W - M - 44}" y="52" width="44" height="44" filter="url(#tint)"/>
  <line x1="${M}" y1="104" x2="${W - M}" y2="104" stroke="${RULE}" stroke-width="1"/>

  ${headline}
  <text x="${M}" y="${deckY}" font-family="Space Grotesk" font-size="21" fill="${BODY}">${esc(c.deck)}</text>

  <!-- ledger; the blue rule is drawn last so the row hairlines cannot notch it -->
  ${ledger}
  <rect x="${M}" y="${ledgerTop}" width="3" height="${ledgerH}" fill="${BLUE}"/>

  <line x1="${M}" y1="552" x2="${W - M}" y2="552" stroke="${RULE}" stroke-width="1"/>
  <text x="${M}" y="580" font-family="Space Mono" font-size="14" fill="${FAINT}">${esc(c.proof)}</text>
  <text x="${W - M}" y="580" text-anchor="end" font-family="Outfit" font-weight="600" font-size="17" fill="${MUTED}">mysphere.fun</text>
</svg>`;
}

// ---- Copy. Each `proof` is the on-chain / in-repo source for the claim above it.
const CARDS = [
  {
    file: 'share-no-admin',
    eyebrow: 'STARTPAD · CONTRACT SURFACE',
    headline: ['what these contracts', 'cannot do'],
    deck: 'The launchpad ships without the switches most launchpads keep.',
    rows: [
      ['owner', 'none'], ['pause', 'none'], ['upgrade', 'none'],
      ['blacklist', 'none'], ['fee switch', 'none'],
    ],
    proof: 'CurveLaunchpad.sol · fee and recipient immutable, capped in the constructor',
  },
  {
    file: 'share-supply',
    eyebrow: 'STARTPAD · TOKEN',
    headline: ['every token launched here', 'has the same shape'],
    deck: 'Fixed 1,000,000,000 supply, set at launch. No exceptions, including ours.',
    rows: [
      ['supply', '1,000,000,000'], ['mint', 'none'], ['burn function', 'none'],
      ['tax', 'none'], ['initialAdmin', 'address(0)'],
    ],
    proof: 'CurveLaunchpad.sol:106 · the launch reverts if any role is found on-chain',
  },
  {
    file: 'share-creator-fee',
    eyebrow: 'STARTPAD · FEES',
    headline: ['most of the fee goes', 'to the creator'],
    deck: 'The split is frozen at launch and cannot be changed afterwards.',
    rows: [
      ['curve fee', '1%'], ['creator share', 'up to 70%'],
      ['fee recipients', 'up to 8'], ['changeable later', 'no'],
    ],
    proof: 'MAX_FEE_BPS 100 · MAX_CREATOR_SHARE_BPS 7000 · MAX_FEE_RECIPIENTS 8',
  },
  {
    file: 'share-graduation',
    eyebrow: 'STARTPAD · GRADUATION',
    headline: ['graduate() pays', 'whoever calls it'],
    deck: 'Permissionless. Our keeper is a cron job anyone could replace tomorrow.',
    rows: [
      ['caller reward', '1.5% of reserve'], ['permission needed', 'none'],
      ['who can call it', 'anyone'], ['liquidity afterwards', 'locked'],
    ],
    proof: 'GRAD_FEE_BPS 300 · split 50/50 between the caller and the protocol',
  },
  {
    file: 'share-burn-receipt',
    eyebrow: '$SPHERE · BASE SEPOLIA · DRESS REHEARSAL',
    headline: ['12,131 SPHERE bought back', 'and sent to 0x…dEaD'],
    deck: 'The whole loop rehearsed in public before mainnet. Not a mainnet number.',
    rows: [
      ['launch + atomic dev-buy', 'public tx'], ['curve close', 'public tx'],
      ['graduation on v4', 'public tx'], ['settle + harvest', 'public tx'],
      ['first auto-burn', 'public tx'],
    ],
    proof: 'scripts/output/sphere-base-sepolia.json · a public tx hash for every step',
  },
  {
    file: 'share-anti-wash',
    eyebrow: '$SPHERE · SHADOW SEASON · NO PAYOUTS YET',
    headline: ['0.101 ETH of self-trading,', 'excluded on day one'],
    deck: 'Reward weight is capped at each creator’s net external ETH.',
    rows: [
      ['self-trading counted', 'no'], ['buyback swaps counted', 'no'],
      ['$SPHERE in its own mining', 'excluded'], ['payouts so far', 'none'],
    ],
    proof: 'epoch manifests published, with the algorithm hash included in each',
  },
];

const outDir = path.join(__dirname, '..', '..', 'public', 'share');
fs.mkdirSync(outDir, { recursive: true });

for (const c of CARDS) {
  const svg = card(c);
  const png = new Resvg(svg, {
    fitTo: { mode: 'width', value: W },
    font: { fontDirs: [FONTS], loadSystemFonts: false, defaultFontFamily: 'Space Grotesk' },
  }).render().asPng();
  fs.writeFileSync(path.join(outDir, c.file + '.png'), png);
  console.log(`${c.file}.png  ${(png.length / 1024).toFixed(1)} KB`);
}

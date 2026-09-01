# Social share cards

Generates the 1200x630 link-preview cards in `public/share/`. Those are what X,
Discord, Slack and iMessage show for a mysphere.fun link, via the `og:image` /
`twitter:image` tags in `app/layout.tsx` and `ogImageUrl` in
`public/.well-known/farcaster.json`.

## Regenerating

```bash
npm i --no-save @resvg/resvg-js
node scripts/share-cards/cards.js
```

Writes one 1200x630 `.png` per card straight into `public/share/`, overwriting
what is there. Output is deterministic, so an unchanged `cards.js` reproduces
byte-identical files.

## Editing

All copy lives in the `CARDS` array at the bottom of `cards.js` — one object per
card, with `eyebrow`, `headline` (one string per line), `deck`, `rows` and
`proof`. Layout, palette and type are shared, so a new card is just a new entry.

Two rules the copy has to keep, from `docs/SPHERE-SOCIAL-PLAN.md` section 4:

- No price, APY, "passive income", listing or "we will buy back" claims. Only
  mechanisms that the chain enforces, plus receipts.
- Every figure traces to the contracts on `origin/master` or to
  `docs/SPHERE-TOKENOMIKA.md`. The `proof` line names that source and is
  printed on the card, so a wrong number is visible rather than hidden.

Testnet numbers must say so on the card. `share-burn-receipt` is labelled
`BASE SEPOLIA · DRESS REHEARSAL` for exactly this reason.

## Why not next/og

`next/og` cannot render locally on Windows with Next 14.2.35 — the bundled
`@vercel/og` builds an invalid `file:` URL for its default font and throws
`ERR_INVALID_URL` at module init, before a custom `fonts` option is consulted.
It would work on Vercel, but the cards could not be previewed or checked in
locally, so they are rasterised from SVG with resvg instead.

## Fonts

`fonts/` holds static TTFs of Outfit, Space Grotesk (the two faces
`app/globals.css` loads) and Space Mono, all OFL. Outfit and Space Grotesk ship
from Google as variable fonts only; these were instanced to fixed weights with
`fonttools varLib.instancer` and renamed, because resvg matches on family name
plus weight.

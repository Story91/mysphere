import { PageShareCard, PAGE_OG_CACHE_HEADERS } from './PageShareCard';
import { HEADLINE_LINES, PERP_STICKERS, SUBLINE } from '../../narrative';

/**
 * Karta strony glownej - wspolna dla app/opengraph-image.tsx (1200x630)
 * i app/miniapp-image/route.tsx (1200x800, proporcja 3:2 wymagana przez
 * `fc:miniapp`). Jeden komponent, zeby oba obrazki nie mogly sie rozjechac.
 *
 * Tresc NIE zyje tutaj, tylko w app/narrative.ts - razem z tytulem i opisem
 * z metadanych, bo te trzy teksty musza sie skladac w jedno i nie powtarzac.
 *
 * Kolaz: naklejki aktywow rynkow perpow (PERP_STICKERS) i fioletowy bohater
 * "$YOUR MEME" - mem uzytkownika, ktory paruje sie z dowolnym z nich. To jest
 * caly produkt w jednym obrazku. Styl zatwierdzony przez wlasciciela
 * 2026-10-12 ("cos takiego wlasnie").
 */
export function HomeShareCard(height = 630) {
  return (
    <PageShareCard
      headline={HEADLINE_LINES}
      subline={SUBLINE}
      stickers={PERP_STICKERS.map((label) => ({ label }))}
      hero={{ label: '$YOUR MEME', sub: 'paired with any of them' }}
      height={height}
    />
  );
}

export const OG_CACHE_HEADERS = PAGE_OG_CACHE_HEADERS;

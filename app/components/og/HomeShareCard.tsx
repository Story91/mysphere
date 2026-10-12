import { PageShareCard, PAGE_OG_CACHE_HEADERS } from './PageShareCard';
import { HEADLINE, PERP_CHIPS, SUBLINE } from '../../narrative';

/**
 * Karta strony glownej - wspolna dla app/opengraph-image.tsx (1200x630)
 * i app/miniapp-image/route.tsx (1200x800, proporcja 3:2 wymagana przez
 * `fc:miniapp`). Jeden komponent, zeby oba obrazki nie mogly sie rozjechac.
 *
 * Tresc NIE zyje tutaj, tylko w app/narrative.ts - razem z tytulem i opisem
 * z metadanych, bo te trzy teksty musza sie skladac w jedno i nie powtarzac.
 *
 * Do 2026-10-12 karta niosla zdarzenie z rynku Askow ("An AI agent paid to
 * ask"). Wlasciciel przestawil narracje na Startpad i rynki perpow; Aski
 * zostaly na swojej podstronie z wlasna karta (app/asks/opengraph-image.png).
 *
 * Chipy to aktywa rynkow perpow z app/startpad/config.ts (PERP_CHIPS).
 */
export function HomeShareCard() {
  return <PageShareCard eyebrow="MYSPHERE.FUN" headline={HEADLINE} subline={SUBLINE} chips={PERP_CHIPS} footer="2x · on Base" />;
}

export const OG_CACHE_HEADERS = PAGE_OG_CACHE_HEADERS;

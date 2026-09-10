import { redirect } from 'next/navigation';

/**
 * /money nie jest juz strona - wlasna ksiega pieniedzy mieszka jako zakladka
 * na /asks (?tab=money), a publiczna tasma rozliczonych platnosci jako
 * ?tab=paid. Kalka z /curators -> /asks?tab=curators. Powod scalenia:
 * "Money" zajmowalo miejsce w gornej belce, a mowi o tej samej rzeczy co Ask -
 * Ask jest miejscem, gdzie pieniadze sie zaczynaja, Money jedynym, gdzie widac,
 * gdzie skonczyly (pelny powod w komentarzu w app/asks/page.tsx).
 *
 * Sama tresc zyje w ./MoneyContent.tsx i renderuje ja strona /asks.
 *
 * DLACZEGO Z `searchParams`: stary /money?tab=paid byl adresem publicznym
 * (przekierowywalo tam /leaderboard, siedzi w sitemapie, byl wysylany na X).
 * Przekierowanie bez czytania query wrzucaloby kazdy taki link na prywatna
 * ksiege, ktora bez portfela nie pokazuje niczego.
 *
 * DLACZEGO redirect() TUTAJ, A NIE WPIS W next.config.js: katalog musi zostac
 * trasa, bo /money/opengraph-image.png dalej serwuje karte OG dla linkow
 * wyslanych przed scaleniem - przekierowanie calego prefiksu w configu
 * zabraloby tez ja. Poza tym `trailingSlash: true` w next.config ma wlasna
 * pulapke z przekierowaniami (patrz komentarz tam) - przekierowanie na
 * poziomie page.tsx niczego w niej nie rusza.
 */
type SearchParams = { tab?: string | string[] };

export default function MoneyRedirect({ searchParams }: { searchParams: SearchParams }) {
  const raw = searchParams?.tab;
  const tab = Array.isArray(raw) ? raw[0] : raw;
  redirect(tab === 'paid' ? '/asks?tab=paid' : '/asks?tab=money');
}

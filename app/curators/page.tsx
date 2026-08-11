import { redirect } from 'next/navigation';

/**
 * /curators nie jest juz strona - rejestr zmian kuratorow mieszka jako zakladka
 * na /asks (?tab=curators). Kalka z /leaderboard -> /money?tab=paid. Powod
 * scalenia: odchudzenie belki (patrz komentarz w app/asks/page.tsx).
 *
 * Sama tresc zyje w ./CuratorsContent.tsx i renderuje ja strona /asks.
 *
 * DLACZEGO redirect() TUTAJ, A NIE WPIS W next.config.js: katalog musi zostac
 * trasa (opengraph-image, jesli powstanie), a `trailingSlash: true` w
 * next.config ma wlasna pulapke z przekierowaniami (patrz komentarz tam) -
 * przekierowanie na poziomie page.tsx niczego w niej nie rusza. Zrodlo i cel
 * sa rozne, wiec petla z /Docs tu nie wystepuje.
 */
export default function CuratorsRedirect() {
  redirect('/asks?tab=curators');
}

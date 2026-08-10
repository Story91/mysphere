import { redirect } from 'next/navigation';

/**
 * /leaderboard nie jest juz strona - "Paid" mieszka jako zakladka na /money
 * (?tab=paid). Powod scalenia: skarga "za duzo pozycji w nawigacji", a obie
 * strony mowia o pieniadzach - ta o cudzych, /money o wlasnych.
 *
 * Sama tresc zyje w ./LeaderboardContent.tsx i renderuje ja strona /money.
 *
 * DLACZEGO redirect() TUTAJ, A NIE WPIS W next.config.js: katalog musi zostac
 * trasa, bo /leaderboard/opengraph-image.tsx dalej serwuje karte OG dla linkow
 * wyslanych na X przed scaleniem - przekierowanie calego prefiksu w configu
 * zabraloby tez ja. Poza tym `trailingSlash: true` w next.config ma wlasna
 * pulapke z przekierowaniami (patrz komentarz tam) - przekierowanie na
 * poziomie page.tsx niczego w niej nie rusza.
 */
export default function LeaderboardRedirect() {
  redirect('/money?tab=paid');
}

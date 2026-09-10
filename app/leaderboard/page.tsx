import { redirect } from 'next/navigation';

/**
 * /leaderboard nie jest juz strona - "Paid" mieszka jako zakladka na /asks
 * (?tab=paid). Powod scalenia: skarga "za duzo pozycji w nawigacji", a wszystkie
 * te strony mowia o pieniadzach - ta o cudzych, ?tab=money o wlasnych.
 *
 * DWA SCALENIA, JEDEN ADRES: najpierw Paid trafil na /money?tab=paid, potem
 * cale /money trafilo na /asks. Ten redirect celuje juz w ADRES DOCELOWY,
 * a nie w /money?tab=paid - inaczej kazde wejscie kosztowaloby dwa skoki.
 *
 * Sama tresc zyje w ./LeaderboardContent.tsx i renderuje ja strona /asks.
 *
 * DLACZEGO redirect() TUTAJ, A NIE WPIS W next.config.js: katalog musi zostac
 * trasa, bo /leaderboard/opengraph-image.tsx dalej serwuje karte OG dla linkow
 * wyslanych na X przed scaleniem - przekierowanie calego prefiksu w configu
 * zabraloby tez ja. Poza tym `trailingSlash: true` w next.config ma wlasna
 * pulapke z przekierowaniami (patrz komentarz tam) - przekierowanie na
 * poziomie page.tsx niczego w niej nie rusza.
 */
export default function LeaderboardRedirect() {
  redirect('/asks?tab=paid');
}

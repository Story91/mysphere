import { redirect } from 'next/navigation';

/**
 * /re-definition nie jest juz strona - manifest mieszka jako zakladka na /how
 * (?tab=re-definition). Kalka z /curators -> /asks?tab=curators.
 *
 * DLACZEGO AKURAT POD /how: te dwie strony odpowiadaja na dwa pytania o ten sam
 * produkt i zawsze staly obok siebie w belce. /how mowi, CO DA SIE ZROBIC TERAZ
 * (ani jednego zdania w czasie przyszlym), /re-definition - DLACZEGO to
 * istnieje i co dopiero powstaje, ze statusem obok kazdej pozycji. Czlowiek,
 * ktory doczytal instrukcje do konca, ma nastepny krok w tym samym miejscu,
 * a belka traci pozycje, ktora ja rozpychala.
 *
 * Sama tresc zyje w ./ReDefinitionContent.tsx (razem z wlasnymi metadanymi)
 * i renderuje ja strona /how.
 *
 * DLACZEGO redirect() TUTAJ, A NIE WPIS W next.config.js: katalog musi zostac
 * trasa, bo /re-definition/opengraph-image.png dalej serwuje karte OG dla
 * linkow wyslanych przed scaleniem - przekierowanie calego prefiksu w configu
 * zabraloby tez ja. Poza tym `trailingSlash: true` w next.config ma wlasna
 * pulapke z przekierowaniami (patrz komentarz tam) - przekierowanie na
 * poziomie page.tsx niczego w niej nie rusza.
 */
export default function ReDefinitionRedirect() {
  redirect('/how?tab=re-definition');
}

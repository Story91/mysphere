/**
 * /actions.json - mapa akcji dla klientow Blinkow.
 *
 * Klient (rozszerzenie Phantoma, Solflare, dial.to) pyta o ten plik w KORZENIU
 * domeny, zanim zaufa jakiemukolwiek adresowi akcji. Bez niego karta sie nie
 * narysuje, nawet gdy sama trasa akcji odpowiada poprawnie.
 *
 * ===========================================================================
 * DLACZEGO NIE MAPUJEMY /post/*
 * ===========================================================================
 * Kuszace bylo odwzorowanie `/post/*` na `/api/actions/tip/*` - wtedy samo
 * wklejenie linku do posta zamienialoby go w Blinka. Odrzucone, bo napiwek
 * w SOL-u wymaga adresu Solany, a ten odczytujemy z kwitu transakcji. Posty
 * z pozostalych osmiu sieci takiego kwitu nie maja i akcja zwrocilaby dla nich
 * blad.
 *
 * Poniewaz posty z Solany sa dzis ulamkiem feedu, taka regula psulaby podglad
 * WIEKSZOSCI udostepnianych linkow, zeby poprawic mniejszosc. Odwrotnie niz
 * powinna dzialac zmiana.
 *
 * Dlatego Blink ma wlasna sciezke. Gdy kiedys wiekszosc postow bedzie niosla
 * adres wyplaty, mapowanie `/post/*` stanie sie sensowne i bedzie jedna linijka
 * nizej.
 */

const ACTIONS_MANIFEST = {
  rules: [
    // Sciezka czytelna dla czlowieka - to ja udostepnia sie na X.
    { pathPattern: '/blink/tip/*', apiPath: '/api/actions/tip/*' },
    // Bezposredni adres akcji tez musi byc zadeklarowany, bo dial.to i testy
    // odpytuja wlasnie jego.
    { pathPattern: '/api/actions/**', apiPath: '/api/actions/**' },
  ],
};

export function GET() {
  return new Response(JSON.stringify(ACTIONS_MANIFEST), {
    headers: {
      'Content-Type': 'application/json',
      // Ten plik czyta cudzy klient z cudzej domeny - bez CORS nie zobaczy go
      // wcale.
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      // Mapa zmienia sie rzadko, a odpytywana jest przy kazdym renderze karty.
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

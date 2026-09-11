/**
 * Jedno zrodlo prawdy o tym, ktore trasy sa wylaczone.
 *
 * DLACZEGO: MySphere przechodzi redefinicje. Czesc modulow nie dziala albo
 * opiera sie na zalozeniach, ktore siе zdezaktualizowaly (Zora creator coins,
 * spec miniapp w Base App). Zamiast kasowac kod, wylaczamy trasy - kod zostaje
 * w repo i wraca przez usuniecie jednej pozycji z tej listy.
 *
 * JAK TO DZIALA: next.config.js generuje z tego przekierowania (tymczasowe,
 * permanent: false - zeby przegladarki i crawlery nie zapamietaly ich na stale),
 * a Navigation.tsx czyta te sama liste, zeby nie pokazywac martwych linkow.
 *
 * ZEBY WLACZYC TRASE Z POWROTEM: usun ja z DISABLED_ROUTES. Nic wiecej.
 */

/** Dokad ladują wylaczone trasy. */
const FALLBACK_ROUTE = '/basechat';

/**
 * Wylaczone trasy. Kazdy wpis obejmuje takze podtrasy (np. '/mycamp' lapie
 * rowniez '/mycamp/quest').
 */
// UWAGA o /swap: jego KOD zostal usuniety (wycofany wg REDEFINICJA.md), ale wpis
// zostaje tutaj celowo. Przekierowania dzialaja przed routingiem, wiec stare
// zakladki nadal ladnie laduja na /basechat zamiast dostawac 404. Wpis steruje
// tez statusem w manifescie (/how?tab=re-definition) - bez niego Swap pokazalby sie jako
// dzialajacy. Pozostale moduly maja kod nietkniety i wracaja przez usuniecie
// wpisu stad.
const DISABLED_ROUTES = [
  '/base',
  '/basemorning',
  // '/mycamp' ZOSTAJE WYLACZONE - i to jest przemyslane, nie zapomniane.
  //
  // Podpiecie kont NIE POTRZEBUJE tej strony. Konektor
  // (app/utils/socials/CampSocialsCard.tsx) nosi wlasny CampProvider i wlasny
  // CampModal, a `buildCampRedirectUri` oddaje BIEZACY adres - wiec logowanie
  // Origin wraca tam, gdzie czlowiek stal, a nie na /mycamp. Zadna z podtras
  // /mycamp/* nie jest w tej sciezce potrzebna.
  //
  // Cala funkcja zyje wiec w dwoch miejscach, w ktorych czlowiek jej szuka:
  // na wlasnym profilu (BuilderProfile, nad sekcjami Twittera i Spotify)
  // oraz w selektorze muzyki w kompozytorze feedu - czyli dokladnie tam, gdzie
  // brak podpietego Spotify zatrzymuje robote.
  '/mycamp',
  '/MyAgents',
  '/MyClaw',
  '/swap',
  '/yapscan',
];

/** Trasy, ktore zostaja czynne. Tylko dokumentacyjnie - nie sterują niczym. */
const ACTIVE_ROUTES = ['/', '/basechat', '/Docs', '/admin'];

/** Czy dana sciezka jest wylaczona (uwzglednia podtrasy). */
function isRouteDisabled(pathname) {
  if (!pathname) return false;
  return DISABLED_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + '/')
  );
}

/** Przekierowania w formacie oczekiwanym przez next.config.js. */
function buildRedirects() {
  return DISABLED_ROUTES.flatMap((route) => [
    { source: route, destination: FALLBACK_ROUTE, permanent: false },
    { source: `${route}/:path*`, destination: FALLBACK_ROUTE, permanent: false },
  ]);
}

module.exports = {
  DISABLED_ROUTES,
  ACTIVE_ROUTES,
  FALLBACK_ROUTE,
  isRouteDisabled,
  buildRedirects,
};

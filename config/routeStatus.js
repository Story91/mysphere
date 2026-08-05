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
const DISABLED_ROUTES = [
  '/base',
  '/basemorning',
  '/marketplace',
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

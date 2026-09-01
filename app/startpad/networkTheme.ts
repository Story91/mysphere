import { DEFAULT_LAUNCHPAD_CHAIN_ID, LAUNCHPAD_NETWORKS } from './config';

/**
 * MOTYW SIECI - startpad na Robinhoodzie jest czarno-zielony.
 *
 * ===========================================================================
 * PO CO
 * ===========================================================================
 * Launchpad stoi na trzech lancuchach i wyglada na wszystkich identycznie, choc
 * to sa trzy rozne rynki z trzema roznymi tokenami. Barwy sieci sa juz zreszta
 * w `config.ts` (`pillClass`, `accentTextClass`, `logo`) - ten plik doprowadza
 * te decyzje do konca: sciezka i numer sieci wybieraja PALETE, a nie tylko
 * kolor jednej pigulki.
 *
 * ===========================================================================
 * JAK TO DZIALA
 * ===========================================================================
 * Wszystko sprowadza sie do jednego atrybutu na <html>: `data-net-theme`.
 * Ustawia go skrypt w layoucie (przed pierwszym malowaniem, zeby czarna strona
 * nie mignela biala) i komponent kliencki na trasach startpada (zeby przejscie
 * do innej zakladki zdjelo czern). Nic wiecej o motywie nie decyduje.
 *
 * Same kolory to TROJKI RGB, a nie hexy, bo Tailwind sklada z nich
 * `rgb(var(--x) / <alpha-value>)`. Hex wpisany tutaj zabilby po cichu kazdy
 * wariant z przezroczystoscia - a na tym stoi polowa krawedzi w tablicy.
 *
 * ===========================================================================
 * DLACZEGO MOTYW NADPISUJE TEZ --soft-*
 * ===========================================================================
 * Gorna nawigacja i dolny pasek mobilny sa wspolne dla calej aplikacji i pisane
 * w calosci tokenami `--soft-*`. Czarna tablica pod jasna belka wygladalaby jak
 * blad wdrozenia, wiec motyw podmienia jedno i drugie. Dziala to tylko dlatego,
 * ze atrybut zyje na <html> i znika przy wyjsciu ze startpada - poza nim zaden
 * z tych tokenow nie jest ruszony.
 */

/** Atrybut, ktorym wlaczamy motyw. Jedna nazwa dla skryptu, CSS-a i komponentu. */
export const THEME_ATTRIBUTE = 'data-net-theme';

export type ThemeVars = Record<string, string>;

export type NetworkTheme = {
  /** Wartosc atrybutu `data-net-theme`. */
  key: string;
  /**
   * Trafia do `color-scheme`, czyli mowi przegladarce, w jakim swiecie jest ta
   * strona. Bez tego paski przewijania, pola formularzy i domyslne zaznaczenie
   * zostaja jasne na czarnym tle - czego zaden nasz CSS nie dosiegnie.
   */
  colorScheme?: 'dark' | 'light';
  vars: ThemeVars;
  /**
   * Kolory dla wykresu. lightweight-charts dostaje je JavaScriptem, bo nie
   * czyta zmiennych CSS - a dwa zrodla prawdy o kolorze wykresu rozjechalyby
   * sie przy pierwszej zmianie palety.
   */
  chart: {
    background: string;
    text: string;
    grid: string;
    up: string;
    down: string;
    line: string;
    lineFill: string;
  };
};

/** Wszystkie motywy, ktore ktorakolwiek siec deklaruje w `config.ts`. */
export const NETWORK_THEMES: NetworkTheme[] = Object.values(LAUNCHPAD_NETWORKS)
  .map((net) => net.theme)
  .filter((theme): theme is NetworkTheme => !!theme)
  // Ta sama paleta moglaby stac przy dwoch sieciach (np. testnet obok mainnetu);
  // blok CSS ma powstac raz.
  .filter((theme, index, all) => all.findIndex((other) => other.key === theme.key) === index);

/**
 * Klucz motywu dla danej strony i sieci, albo `null` gdy strona ma zostac
 * jasna.
 *
 * Sciezke porownujemy po SEGMENCIE, nie po prefiksie tekstowym: `/startpadding`
 * zaczyna sie tak samo jak `/startpad`, a nie ma z nim nic wspolnego. Projekt
 * stoi na `trailingSlash: true`, wiec obie postacie musza dzialac.
 */
export function themeKeyFor(pathname: string, chainId: number): string | null {
  const path = pathname.toLowerCase();
  const inStartpad = path === '/startpad' || path === '/startpad/' || path.startsWith('/startpad/');
  if (!inStartpad) return null;
  // Hub $SPHERE renderuje sie ZAWSZE jak siec domyslna (Base), niezaleznie od
  // wybranej sieci tablicy - SPHERE zyje tylko na Base i jego strony czytaja
  // wylacznie kontrakty Base (sphere/sphereChain.ts). Bez tego wyjatku wejscie
  // w $SPHERE przy wybranym Arc przemalowywalo caly hub na barwy USDC.
  const inSphere = path === '/startpad/sphere' || path.startsWith('/startpad/sphere/');
  const effectiveChainId = inSphere ? DEFAULT_LAUNCHPAD_CHAIN_ID : chainId;
  return LAUNCHPAD_NETWORKS[effectiveChainId]?.theme?.key ?? null;
}

/**
 * Bloki CSS wszystkich motywow. Wypisujemy je RAZ, w layoucie - sa male, stale
 * i nieaktywne, dopoki na <html> nie pojawi sie pasujacy atrybut.
 */
export function networkThemeCss(): string {
  const blocks = NETWORK_THEMES.map((theme) => {
    const body = Object.entries(theme.vars)
      .map(([name, value]) => `${name}:${value}`)
      .join(';');
    const scheme = `color-scheme:${theme.colorScheme ?? 'dark'}`;
    // `body` ma w layoucie `bg-white` wpisane na sztywno i obowiazuje na KAZDEJ
    // stronie - nie wolno tego zamienic na zmienna, bo zmienialoby tlo calej
    // aplikacji. Zamiast tego nadpisujemy je tylko pod atrybutem motywu.
    return (
      `[${THEME_ATTRIBUTE}="${theme.key}"]{${body};${scheme}}` +
      `[${THEME_ATTRIBUTE}="${theme.key}"] body{background:rgb(var(--sp-bg))}`
    );
  });
  return blocks.join('');
}

/**
 * Skrypt ustawiajacy atrybut PRZED pierwszym malowaniem.
 *
 * Wybor sieci zyje w localStorage, wiec serwer renderuje zawsze siec domyslna
 * i bez tego wejscie z linku na czarna strone mignelo by biala - dokladnie ten
 * sam problem, ktory rozwiazuja przelaczniki dark mode. Mapa sieci na motyw
 * jest tu WYGENEROWANA z konfiguracji, a nie przepisana, wiec nie moze sie z
 * nia rozjechac.
 */
export function themeBootScript(defaultChainId: number): string {
  const map: Record<string, string> = {};
  for (const [chainId, net] of Object.entries(LAUNCHPAD_NETWORKS)) {
    if (net.theme) map[chainId] = net.theme.key;
  }

  // Ten sam wyjatek dla huba $SPHERE co w themeKeyFor: siec efektywna to
  // domyslna (Base), a nie zapamietana - inaczej wejscie z linku prosto na
  // /startpad/sphere przy zapisanym Arc mignelo by cudzym motywem, zanim
  // NetworkThemeSync zdazy go zdjac.
  return `try{var p=location.pathname.toLowerCase();if(p==='/startpad'||p.indexOf('/startpad/')===0){var m=${JSON.stringify(
    map
  )};var s=p==='/startpad/sphere'||p.indexOf('/startpad/sphere/')===0;var c=s?'${defaultChainId}':(window.localStorage.getItem('startpad.chainId')||'${defaultChainId}');var k=m[c];if(k)document.documentElement.setAttribute('${THEME_ATTRIBUTE}',k)}}catch(e){}`;
}

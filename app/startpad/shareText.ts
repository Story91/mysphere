import { DEFAULT_LAUNCHPAD_CHAIN_ID } from './config';

/**
 * Tresc udostepnienia tokena: co idzie w post i pod jaki adres.
 *
 * ===========================================================================
 * DLACZEGO TO JEST OSOBNY, CZYSTY MODUL
 * ===========================================================================
 * Ten sam tekst i ten sam adres powstaja w trzech miejscach (kafelek, wiersz
 * tabeli, strona tokena) i ida do szesciu roznych serwisow. Gdyby kazde z tych
 * miejsc sklejalo je u siebie, roznice pojawilyby sie po pierwszej poprawce -
 * i nikt by ich nie zobaczyl, bo tresc udostepnienia oglada sie WYLACZNIE u
 * kogos innego. Do tego funkcje bez DOM-u i bez sieci daja sie przetestowac
 * (test/StartpadShare.test.ts), a menu udostepniania nie.
 *
 * ===========================================================================
 * SYMBOL TOKENA JEST TRESCIA OD OBCEGO TWORCY
 * ===========================================================================
 * Kazdy moze wystartowac token o dowolnym `symbol` - to zwykly string z
 * kontraktu. Trafia on prosto do tresci posta pisanego z KONTA UZYTKOWNIKA,
 * wiec przechodzi tu przez sito: znaki spoza [A-Za-z0-9_-] wypadaja (koniec z
 * lamaniem linii i doklejaniem cudzych adresow), a calosc jest przycinana.
 */

/**
 * Kanoniczny adres produkcyjny. Ta sama stala co APP_URL w app/layout.tsx -
 * jest tam prywatna, a importowanie layoutu (React, metadane, prowidery) do
 * modulu liczacego stringi byloby gorsze niz ta jedna powtorka. Zmieniajac
 * domene, zmien oba miejsca.
 */
const SITE_URL = 'https://mysphere.fun';

/** Symbole na krzywej sa krotkie; dwanascie znakow to zapas, nie limit. */
const MAX_SYMBOL = 12;

/**
 * `mysphere` to WLASNY feed i stoi w tym menu pierwszy.
 *
 * Reszta kanalow wynosi ruch na zewnatrz; ten jeden zostawia go u nas i
 * odsyla ludzi z powrotem na strone tokena. Nie ma powodu, zeby jedyne
 * miejsce, w ktorym token da sie opisac wlasnymi slowami przy wlasnej
 * publicznosci, bylo jedynym, ktorego w menu brakuje.
 */
export type ShareTarget = 'mysphere' | 'x' | 'farcaster' | 'telegram' | 'whatsapp' | 'facebook' | 'reddit';

export type ShareState = 'Curve' | 'Locked' | 'Graduated';

/**
 * Ile razy cena urosla od pierwszego bloku tokena.
 *
 * `null` znaczy "nie wiemy" i tak ma byc pokazane - brak wyceny NIE MOZE
 * zamienic sie w "x0.00", bo to wyglada jak wycena i to jak wycena zerowa.
 * Zdarza sie to naprawde: `spotPriceWeiPerToken` rewertuje po graduacji.
 *
 * Liczba cyfr maleje wraz z mnoznikiem, bo karta ma jedna linijke na te
 * liczbe: przy x1.50 licza sie setne, przy x249 nie licza sie juz wcale.
 */
export function formatMultiple(currentPrice: number, startPrice: number): string | null {
  if (!Number.isFinite(currentPrice) || !Number.isFinite(startPrice)) return null;
  if (currentPrice <= 0 || startPrice <= 0) return null;

  const value = currentPrice / startPrice;
  if (!Number.isFinite(value) || value <= 0) return null;

  const trim = (text: string) => text.replace(/\.0+$/, '');

  if (value >= 1_000_000) return `x${trim((value / 1_000_000).toFixed(1))}M`;
  if (value >= 1000) return `x${trim((value / 1000).toFixed(1))}k`;
  if (value >= 100) return `x${value.toFixed(0)}`;
  if (value >= 10) return `x${value.toFixed(1)}`;
  return `x${value.toFixed(2)}`;
}

/**
 * Adres udostepnianego tokena.
 *
 * Parametr `c` niesie SIEC i nie jest ozdobnikiem: ten sam adres kontraktu na
 * trzech lancuchach to trzy rozne tokeny, a sciezka /startpad/0x... nie ma
 * gdzie tego zapisac. Bez niego karta linku do tokena z Robinhooda pytalaby o
 * niego Base i wyszlaby pusta. Dla sieci domyslnej parametru NIE dopisujemy -
 * wiekszosc linkow ma byc krotka.
 *
 * Ukosnik na koncu jest obowiazkowy: projekt stoi na `trailingSlash: true`.
 */
export function buildShareUrl(input: { address: string; chainId: number }): string {
  const address = input.address.toLowerCase();
  const suffix = input.chainId === DEFAULT_LAUNCHPAD_CHAIN_ID ? '' : `?c=${input.chainId}`;
  return `${SITE_URL}/startpad/${address}/${suffix}`;
}

/**
 * Adres CALEJ tablicy danej sieci.
 *
 * Startpad ma trzy rynki i do 13 sierpnia 2026 wszystkie trzy mialy ten sam
 * adres, bo wybor sieci zyl wylacznie w localStorage - wyslany link otwieral
 * sie odbiorcy na JEGO rynku. Odkad przelacznik dopisuje `?c=`, kazdy rynek ma
 * wlasny adres i da sie go wyslac osobno.
 */
export function buildBoardUrl(chainId: number): string {
  const suffix = chainId === DEFAULT_LAUNCHPAD_CHAIN_ID ? '' : `?c=${chainId}`;
  return `${SITE_URL}/startpad/${suffix}`;
}

/**
 * Zdanie o rynku, nie o tokenie.
 *
 * Nazwa sieci jest tu TRESCIA - to jedyna rzecz, ktora odroznia te linki od
 * siebie. Przy pustym rynku liczba tokenow ZNIKA: "0 coins launched" brzmi jak
 * porazka miejsca, a nie jak zaproszenie, i nie jest tym, co chce wyslac ktos,
 * kto wlasnie startuje pierwszy token.
 */
export function buildBoardText(input: { label: string; tokens: number }): string {
  // Nazwa idzie z konfiguracji, ale laduje w poscie pisanym z konta
  // uzytkownika - lamanie linii i nadmiarowe spacje wypadaja.
  const label = input.label.replace(/\s+/g, ' ').trim().slice(0, 40) || 'MySphere Startpad';
  const parts = [`Coins launching on ${label}.`];

  if (Number.isFinite(input.tokens) && input.tokens > 0) {
    parts.push(`${input.tokens} live right now.`);
  }

  parts.push('Trade them on MySphere Startpad.');
  return parts.join(' ');
}

export function safeSymbol(symbol: string): string {
  const cleaned = symbol.replace(/[^A-Za-z0-9_-]/g, '');
  return cleaned.slice(0, MAX_SYMBOL) || 'TOKEN';
}

/**
 * Kapitalizacja w dolarach na karcie udostepniania.
 *
 * Karta pokazywala tu dotad CENE, i to w gwei - bo cena tokena na krzywej to
 * liczby rzedu 7.5e-10 ETH, ktore w dolarach wygladaja jak zero. Bylo to
 * uczciwe technicznie i bezuzyteczne dla kogos, kto ten link dostal: nikt nie
 * wie, czy 0.88 gwei to duzo. Kapitalizacja mowi to samo w jednostce, ktora
 * czyta sie bez tlumaczenia.
 *
 * Brak kursu ETH oddaje kreske, NIGDY "$0" - zero wyglada jak wycena, i to jak
 * wycena zerowa. Ta sama zasada, co przy `formatMultiple`.
 */
export function mcapLabel(usd: number | null | undefined): string {
  if (usd === null || usd === undefined || !Number.isFinite(usd) || usd <= 0) return '--';

  const trim = (text: string) => text.replace(/\.0+$/, '');

  if (usd >= 1_000_000) return `$${trim((usd / 1_000_000).toFixed(1))}M`;
  if (usd >= 1_000) return `$${trim((usd / 1_000).toFixed(1))}k`;
  return `$${usd.toFixed(0)}`;
}

/** Kwoty ETH bez ogona zer: 3 zostaje "3", 0.462 zostaje "0.46". */
function formatEthAmount(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '0';
  return value.toFixed(2).replace(/\.?0+$/, '');
}

/**
 * Zdanie, ktore czyta ktos, kto tego tokena nie zna.
 *
 * Kolejnosc jest decyzja: najpierw mnoznik (jedyny powod, dla ktorego ktos
 * przeslalby to dalej), potem postep krzywej (jedyna liczba mowiaca, czy jest
 * jeszcze o co grac), na koncu miejsce. Bez mnoznika zdanie o nim ZNIKA -
 * pusty wtret bylby obietnica danych, ktorych nie mamy.
 */
export function buildShareText(input: {
  symbol: string;
  multiple: string | null;
  raised: number;
  target: number;
  state: ShareState;
  /**
   * Jednostka natywna sieci. Domyslnie ETH, bo tam stoi produkcja - ale
   * Robinhood i Arc maja wlasna i wpisanie im etheru do posta bylo by
   * zdaniem o cudzych pieniadzach, ktore jest nieprawda.
   */
  native?: string;
}): string {
  const parts: string[] = [`$${safeSymbol(input.symbol)}`];

  if (input.multiple) parts.push(`${input.multiple} since launch.`);

  if (input.state === 'Graduated') {
    parts.push('Graduated to a live pool.');
  } else if (input.state === 'Locked') {
    parts.push('Curve filled, waiting for graduation.');
  } else {
    parts.push(`${formatEthAmount(input.raised)} of ${formatEthAmount(input.target)} ${input.native ?? 'ETH'} on the curve.`);
  }

  parts.push('Trade it on MySphere Startpad.');
  return parts.join(' ');
}

/**
 * Adres okna kompozytora danego serwisu.
 *
 * Kazdy z nich przyjmuje tresc inaczej i to NIE jest dowolnosc:
 *   - X i Telegram maja osobne pola na tekst i adres;
 *   - Farcaster chce adresu jako `embeds[]`, bo dopiero wtedy rysuje karte
 *     zamiast golego linka w tresci;
 *   - Facebook przyjmuje WYLACZNIE adres - tresc i tak czyta z metadanych
 *     strony, a doklejony tekst zignoruje;
 *   - WhatsApp ma jedno pole, wiec tekst i adres ida razem.
 *
 * Sklejamy przez URLSearchParams, a nie recznie: mnoznik i nazwa tokena moga
 * niesc `&` albo `#`, ktore w recznym stringu rozbilyby adres na kawalki.
 */
/**
 * Ile znakow wolno wstawic do kompozytora feedu. To jest pole na jedno zdanie
 * i link, nie kanal na esej - a tresc przychodzi tu z adresu strony, wiec musi
 * miec sufit niezalezny od tego, kto ten adres sklada.
 */
const MAX_COMPOSE = 600;

/**
 * Adres kompozytora feedu z gotowa trescia posta.
 *
 * WLASNA sciezka, nie `?share=SYMBOL|Nazwa|0xadres`, ktore juz w basechacie
 * jest. Tamto samo sklada zdanie i doklada link `mysphere.fun/b20/<adres>` -
 * czyli opisuje token z krzywej startpada strona, ktora nie zna ani jego ceny,
 * ani logo. Tutaj tresc powstaje RAZ, w `buildShareText`, i jest ta sama we
 * wszystkich kanalach; basechat ma ja tylko wkleic.
 */
export function composeParam(text: string, url: string): string {
  // Znaki sterujace nie sa trescia posta, a potrafia rozjechac pole tekstowe.
  // Nowa linia ZOSTAJE - ona te tresc rozdziela.
  // eslint-disable-next-line no-control-regex
  const clean = `${text}\n\n${url}`.replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '');
  return `/basechat?${new URLSearchParams({ compose: clean.slice(0, MAX_COMPOSE) }).toString()}`;
}

export function shareIntentUrl(target: ShareTarget, input: { text: string; url: string }): string {
  const params = (entries: Record<string, string>) => new URLSearchParams(entries).toString();

  switch (target) {
    case 'mysphere':
      return composeParam(input.text, input.url);
    case 'x':
      return `https://x.com/intent/tweet?${params({ text: input.text, url: input.url })}`;
    case 'farcaster':
      return `https://farcaster.xyz/~/compose?${params({ text: input.text, 'embeds[]': input.url })}`;
    case 'telegram':
      return `https://t.me/share/url?${params({ url: input.url, text: input.text })}`;
    case 'whatsapp':
      return `https://wa.me/?${params({ text: `${input.text} ${input.url}` })}`;
    case 'facebook':
      return `https://www.facebook.com/sharer/sharer.php?${params({ u: input.url })}`;
    case 'reddit':
      return `https://www.reddit.com/submit?${params({ url: input.url, title: input.text })}`;
  }
}

/**
 * ===========================================================================
 * PLAKAT POJEDYNKU (Bull vs Bear / Asset Clash)
 * ===========================================================================
 * Adres /perps/clash/<tokenA>-<tokenB>/ niesie OBA adresy tokenow, a nie id
 * starcia: karta OG nie moze skanowac lancucha (zimny skan to 45-60 s, a
 * crawler X-a nie czeka), wiec to, ze dwa tokeny sa jedna para, sprawdza sie
 * po niezmiennych metadanych obu (`duel`), a nie w rejestrze.
 *
 * Teksty NIE mowia o cenach ani zwrotach - to plakat zaproszenia do wyboru
 * strony, nie wynik. Dlatego nie ma tu `buildShareText` z "x2.4 since launch".
 */

/**
 * Adres plakatu pojedynku. Ukosnik na koncu jest obowiazkowy (trailingSlash).
 *
 * `round` to przelamywacz cache'u: X trzyma pierwsza pobrana wersje strony pod
 * danym adresem, wiec link z `?r=` dostaje swiezy odczyt. Strona plakatu nie
 * czyta tego parametru (zostaje w ISR) - sluzy wylacznie rozroznieniu adresow.
 */
export function buildClashUrl(tokenA: string, tokenB: string, round?: number | string): string {
  const a = tokenA.trim().toLowerCase();
  const b = tokenB.trim().toLowerCase();
  const tag = round === undefined ? '' : String(round).trim();
  const suffix = tag === '' ? '' : `?r=${encodeURIComponent(tag)}`;
  return `${SITE_URL}/perps/clash/${a}-${b}/${suffix}`;
}

/** Nazwa strony w zdaniu: "Bull"/"Bear" pisane po ludzku, reszta (ETH, NVDA) jak podano. */
function clashSideText(side: string, fallback: string): string {
  const cleaned = side.replace(/[^A-Za-z0-9]/g, '').slice(0, MAX_SYMBOL);
  if (cleaned === '') return fallback;
  if (/^(bull|bear)$/i.test(cleaned)) return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
  return cleaned;
}

/**
 * Zdanie do posta: "$MORE: Bull vs Bear. Pick a side." albo "$MORE: ETH vs NVDA.
 * Pick a side." Ticker i strony przychodza z metadanych obcego tworcy, wiec
 * przechodza przez to samo sito co symbol tokena. Zadnych liczb, hasztagow ani
 * emoji.
 */
export function buildClashShareText(input: { ticker: string; sideA: string; sideB: string }): string {
  const a = clashSideText(input.sideA, 'A');
  const b = clashSideText(input.sideB, 'B');
  return `$${safeSymbol(input.ticker)}: ${a} vs ${b}. Pick a side.`;
}

const CLASH_PAIR_RE = /^(0x[0-9a-f]{40})-(0x[0-9a-f]{40})$/i;

/**
 * Segment `<a>-<b>` z adresu na dwa adresy malymi literami, albo null.
 * Tolerancyjnie co do wielkosci liter, kodowania procentowego i ukosnika na
 * koncu; ten sam adres dwa razy nie jest para.
 */
export function parseClashPair(param: string): [string, string] | null {
  let raw: string;
  try {
    raw = decodeURIComponent(param);
  } catch {
    return null;
  }
  const match = CLASH_PAIR_RE.exec(raw.trim().replace(/\/+$/, ''));
  if (!match) return null;
  const first = match[1].toLowerCase();
  const second = match[2].toLowerCase();
  return first === second ? null : [first, second];
}

/** Minimum, ktorego `orderClashPair` potrzebuje od karty tokena (TokenCardData to spelnia). */
export type ClashPairSide = {
  address: string;
  chainId: number;
  creator: string;
  duel: { id: string; side: 'a' | 'b'; ticker: string } | null;
  perp: { symbol: string } | null;
};

/**
 * Czy dwa wczytane tokeny sa jednym pojedynkiem - i w jakiej kolejnosci.
 *
 * Te same warunki, co skladanie par w /api/launchpad/clashes (wspolne `duel.id`,
 * ten sam tworca, dwa ROZNE rynki perpow), plus strony przeciwne i siec Base.
 * `a` to strona 'a' z metadanych niezaleznie od kolejnosci w adresie. Cokolwiek
 * innego - null: nikt nie ma dostac plakatu pary, ktora nie jest para.
 */
export function orderClashPair<T extends ClashPairSide>(
  x: T,
  y: T
): { id: string; ticker: string; a: T; b: T } | null {
  if (!x.duel || !y.duel) return null;
  if (x.duel.id !== y.duel.id || x.duel.side === y.duel.side) return null;
  if (x.chainId !== DEFAULT_LAUNCHPAD_CHAIN_ID || y.chainId !== DEFAULT_LAUNCHPAD_CHAIN_ID) return null;
  if (x.address.toLowerCase() === y.address.toLowerCase()) return null;
  if (!x.creator || x.creator.toLowerCase() !== y.creator.toLowerCase()) return null;
  if (!x.perp || !y.perp || x.perp.symbol.toLowerCase() === y.perp.symbol.toLowerCase()) return null;

  const [a, b] = x.duel.side === 'a' ? [x, y] : [y, x];
  return { id: a.duel!.id, ticker: a.duel!.ticker, a, b };
}

export type ClashRope = {
  /** Obie strony cos zebraly - tylko wtedy wolno pokazac procenty i "prowadzi". */
  traded: boolean;
  aPct: number;
  bPct: number;
};

/**
 * Podzial liny na plakacie: kto ile ZEBRAL na krzywej.
 *
 * Gdy ktoras strona ma 0 (albo brak danych), lina jest 50/50 i plakat mowi
 * "Pick a side" - procent z jednej strony wyszedlby 100/0 i udawalby wynik.
 * Gdy znamy NAV obu perpow, kwoty ida w dolarach, bo jednostka ETH2xL i NVDA2xL
 * to rozne pieniadze; bez tego - w jednostkach perpa. Dolarow na plakacie nie
 * ma w ogole, to tylko waga. Procent miesci sie w 1..99, zeby lina miala dwa
 * kolory.
 */
export function clashRopeShare(
  a: { raised: number; navUsd?: number | null },
  b: { raised: number; navUsd?: number | null }
): ClashRope {
  const positive = (n: number | null | undefined) => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0);
  const raisedA = positive(a.raised);
  const raisedB = positive(b.raised);
  if (raisedA <= 0 || raisedB <= 0) return { traded: false, aPct: 50, bPct: 50 };

  const navA = positive(a.navUsd);
  const navB = positive(b.navUsd);
  const weighted = navA > 0 && navB > 0;
  const weightA = weighted ? raisedA * navA : raisedA;
  const weightB = weighted ? raisedB * navB : raisedB;

  const aPct = Math.min(99, Math.max(1, Math.round((weightA / (weightA + weightB)) * 100)));
  return { traded: true, aPct, bPct: 100 - aPct };
}

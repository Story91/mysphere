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
}): string {
  const parts: string[] = [`$${safeSymbol(input.symbol)}`];

  if (input.multiple) parts.push(`${input.multiple} since launch.`);

  if (input.state === 'Graduated') {
    parts.push('Graduated to a live pool.');
  } else if (input.state === 'Locked') {
    parts.push('Curve filled, waiting for graduation.');
  } else {
    parts.push(`${formatEthAmount(input.raised)} of ${formatEthAmount(input.target)} ETH on the curve.`);
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

/**
 * Zapis liczb na rynku B20.
 *
 * Plik jest CZYSTY - zero importow, zero sieci - bo te same funkcje licza na
 * serwerze przy pierwszym renderze i w przegladarce przy przelaczaniu zakladek.
 * Gdyby liczyly inaczej, liczba skakalaby po nawodnieniu strony i nikt by nie
 * wiedzial, ktora jest prawdziwa.
 *
 * ===========================================================================
 * ZASADA, KTORA RZADZI CALYM TYM PLIKIEM
 * ===========================================================================
 * KAZDA funkcja przyjmuje `null` i oddaje `null`. Nigdzie nie ma `?? 0`.
 *
 * Zero jest POMIAREM: znaczy "zmierzylismy i wyszlo zero". Brak pomiaru to
 * `null` i na ekranie ma wlasne zdanie, a nie zero. Ta jedna roznica jest
 * powodem, dla ktorego ten produkt istnieje - konkurencja pisze "$0.00"
 * i pod tokenem bez puli, i pod tokenem, ktorego nikt nie kupil.
 */

/** Indeksy dolne 0-9 - do zapisu cen z dlugim ogonem zer. */
const SUB = ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉'];

function toSubscript(n: number): string {
  return String(n)
    .split('')
    .map((d) => SUB[Number(d)] ?? d)
    .join('');
}

/**
 * Cena w dolarach dla tokena, ktory kosztuje ulamek centa.
 *
 * 0,000004293 zapisane wprost jest nieczytelne i zajmuje pol wiersza, a obciete
 * do dwoch miejsc daje "$0.00" - czyli dokladnie to klamstwo, ktorego tu nie ma
 * prawa byc. Zapis z indeksem dolnym (0.0(5)4293) jest standardem na rynkach
 * memecoinow, miesci sie na 360 px i nie gubi ani jednej cyfry znaczacej.
 */
export function formatUsdPrice(value: number | null): string | null {
  if (value === null || !Number.isFinite(value) || value <= 0) return null;
  if (value >= 1) return `$${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  if (value >= 0.01) return `$${value.toFixed(4)}`;

  const exponent = Math.floor(Math.log10(value));
  const leadingZeros = -exponent - 1;
  const digits = Math.round(value * 10 ** (leadingZeros + 4)).toString().slice(0, 4);
  if (leadingZeros <= 3) return `$${value.toFixed(leadingZeros + 4)}`;
  return `$0.0${toSubscript(leadingZeros)}${digits}`;
}

/** Cena w ETH. Uzywana, gdy kursu ETH/USD nie udalo sie zacytowac. */
export function formatEthPrice(value: number | null): string | null {
  if (value === null || !Number.isFinite(value) || value <= 0) return null;
  if (value >= 0.001) return `${value.toPrecision(4)} ETH`;
  const exponent = Math.floor(Math.log10(value));
  const leadingZeros = -exponent - 1;
  const digits = Math.round(value * 10 ** (leadingZeros + 4)).toString().slice(0, 4);
  return `0.0${toSubscript(leadingZeros)}${digits} ETH`;
}

/** Kwoty w dolarach - wolumen. */
export function formatUsdAmount(value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) return null;
  if (value === 0) return '$0';
  if (value < 1) return `$${value.toFixed(2)}`;
  if (value < 1000) return `$${Math.round(value)}`;
  if (value < 1_000_000) return `$${(value / 1000).toFixed(value < 10_000 ? 1 : 0)}k`;
  return `$${(value / 1_000_000).toFixed(1)}M`;
}

export type Move = {
  /** Ulamek. 0.12 to +12%. */
  fraction: number;
  /** Glif kierunku. NIE KOLOR - patrz naglowek modulu ruchu w B20Board. */
  glyph: '▲' | '▼' | '–';
  label: string;
};

/**
 * Zmiana ceny wzgledem ceny otwarcia puli.
 *
 * DLACZEGO "SINCE LAUNCH", A NIE "24H": kazdy token na tej liscie jest mlodszy
 * niz doba, wiec zmiany dobowej NIE MA Z CZYM porownac. Wpisanie tam "0.00%"
 * byloby wymyslonym pomiarem. Cena otwarcia puli jest realnym punktem odniesienia
 * i jest odczytana z tego samego zdarzenia Initialize, co reszta.
 *
 * Ponizej 0,1% piszemy zdanie zamiast liczby: ruch o 0,03% to nie jest
 * informacja, ze cena wzrosla - to jest informacja, ze praktycznie stoi.
 */
export function describeMove(fraction: number | null): Move | null {
  if (fraction === null || !Number.isFinite(fraction)) return null;
  const pct = fraction * 100;
  if (Math.abs(pct) < 0.1) {
    return { fraction, glyph: '–', label: 'flat since launch' };
  }
  const glyph = pct > 0 ? '▲' : '▼';
  const abs = Math.abs(pct);
  const digits = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
  return { fraction, glyph, label: `${abs.toFixed(digits)}%` };
}

/** Wiek w formie, ktora czyta sie jednym rzutem oka. */
export function formatAge(createdAtSeconds: number, nowMs: number): string {
  if (!createdAtSeconds) return 'unknown age';
  const seconds = Math.max(0, Math.floor(nowMs / 1000) - createdAtSeconds);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return minutes % 60 === 0 ? `${hours}h` : `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d`;
}

/** Skrocony adres. 0xb200…cafe - poczatek i ogon, bo ogon niesie wzorzec. */
export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/** Duze liczby calkowite z lancucha - podaz. */
export function formatSupply(raw: string, decimals: number): string {
  let value: bigint;
  try {
    value = BigInt(raw);
  } catch {
    return raw;
  }
  const whole = value / 10n ** BigInt(decimals);
  const n = Number(whole);
  if (!Number.isFinite(n)) return `${whole.toString()}`;
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(n % 1_000_000_000 === 0 ? 0 : 2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 2)}M`;
  if (n >= 1000) return n.toLocaleString('en-US');
  return String(n);
}

/**
 * O ile procent mozna jeszcze dodrukowac, zanim sufit zablokuje mint.
 * `null` znaczy, ze sufitu nie odczytalismy - nie ze go nie ma.
 */
export function mintHeadroom(total: string, cap: string | null): number | null {
  if (cap === null) return null;
  try {
    const t = BigInt(total);
    const c = BigInt(cap);
    if (t === 0n) return null;
    if (c <= t) return 0;
    // Procent liczony na bigintach - podaz siega 1e27 i nie miesci sie w double.
    return Number(((c - t) * 10_000n) / t) / 100;
  } catch {
    return null;
  }
}

/** "read 40 seconds ago" - wiek samego pomiaru, nie tokena. */
export function formatReadAge(readAtMs: number, nowMs: number): string {
  const seconds = Math.max(0, Math.round((nowMs - readAtMs) / 1000));
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds} seconds ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  return `${hours} hour${hours === 1 ? '' : 's'} ago`;
}

/**
 * Adres wymiany na Uniswapie z wybranym tokenem po stronie wyjscia.
 *
 * DLACZEGO ODNOSNIK, A NIE WLASNY WIDGET: to sa prawdziwe pule Uniswap v4 na
 * Base, wiec kupno DZIALA JUZ DZIS - brakowalo wylacznie drogi do niego.
 * Wlasny panel wymiany znaczylby wlasna obsluge poslizgu, zatwierdzen, trasy
 * i bledow, czyli powierzchnie, na ktorej ludzie traca pieniadze. Odnosnik
 * daje ten sam skutek dzis i zeru ryzyka.
 *
 * `chain=base` jest konieczne: bez niego Uniswap otwiera sie na sieci, na
 * ktorej portfel akurat stoi, i szuka tam tokena, ktorego tam nie ma.
 */
export function uniswapBuyUrl(tokenAddress: string): string {
  return `https://app.uniswap.org/swap?chain=base&outputCurrency=${tokenAddress}`;
}

/** Inicjaly dla tokena bez obrazka. Dwa znaki, bo trzy juz sie nie miesza. */
export function tokenInitials(symbol: string, name: string): string {
  const source = (symbol || name || '?').replace(/[^a-zA-Z0-9]/g, '');
  return (source.slice(0, 2) || '?').toUpperCase();
}

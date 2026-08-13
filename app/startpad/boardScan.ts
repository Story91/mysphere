/**
 * KIEDY WOLNO SKASOWAC TOKEN Z TABLICY.
 *
 * ===========================================================================
 * OBJAW, KTORY TO WYWOLAL
 * ===========================================================================
 * 13 sierpnia 2026: przy zywszym ruchu tokeny znikaly z /startpad. Dla kogos,
 * kto trzyma tam pieniadze, zniknieciе tokena z listy nie wyglada jak usterka
 * wyswietlania - wyglada jak utrata srodkow.
 *
 * ===========================================================================
 * PRZYCZYNA
 * ===========================================================================
 * Okno skanu, ktore padlo dwa razy pod rzad, oddawalo PUSTA LISTE zamiast
 * bledu. Skan konczyl sie wiec jako kompletny (`lowestScanned` dochodzil do
 * bloku wdrozenia), znacznik uciecia byl wylaczony, a regula scalania
 * wyrzucala kazdy token starszy niz kwadrans, ktorego zdarzenie `Launched`
 * bylo akurat w tym oknie.
 *
 * Awaria odczytu udawala fakt. To jest ta klasa bledu, ktora tu naprawiamy:
 * BRAK DANYCH NIE JEST DANYMI. Skan ma prawo skasowac wiersz tylko wtedy, gdy
 * naprawde przeczytal caly zakres - a nie wtedy, gdy tak mu sie wydaje.
 *
 * Wiersz spoza skanu ZOSTAJE, dopoki skan nie jest wiarygodny. Wyrzucamy go
 * dopiero przy skanie kompletnym, bo wtedy jego nieobecnosc znaczy cos realnego:
 * token pochodzi z martwego wdrozenia i zaden skan go juz nie odda.
 */

export type ScanHealth = {
  /** Ile okien nie przeszlo mimo ponowienia. */
  failedWindows: number;
  /** Najnizszy blok, ktory skan objal. */
  lowestScanned: bigint;
  /** Blok wdrozenia launchpada - nizej logow z definicji nie ma. */
  deployBlock: bigint;
};

/**
 * Czy temu skanowi wolno rozstrzygac o NIEOBECNOSCI tokena.
 *
 * Wymaga obu rzeczy naraz: zadne okno nie padlo ORAZ zakres siega bloku
 * wdrozenia. Samo dojscie do dna nie wystarcza, bo dziura w srodku zakresu
 * wyglada z zewnatrz dokladnie tak samo jak brak zdarzen.
 */
export function scanIsTrustworthy(health: ScanHealth): boolean {
  return health.failedWindows === 0 && health.lowestScanned <= health.deployBlock;
}

/** Tyle czasu po starcie RPC potrafi jeszcze nie oddawac zdarzenia `Launched`. */
const RECENT_SEC = 15 * 60;

export type BoardRow = {
  /** Falsz albo brak = wiersz podgladowy (mock), nie token z lancucha. */
  live?: boolean;
  address?: string | null;
  startedAt?: number | null;
};

/**
 * Czy zachowac wiersz, ktorego biezacy skan NIE zwrocil.
 *
 * Trzy powody, dla ktorych token moze nie byc w wyniku skanu, i tylko jeden z
 * nich znaczy "tego tokena nie ma":
 *   1. wystartowal przed chwila i RPC jeszcze go nie indeksuje  -> zostaje;
 *   2. skan jest niepelny (padniete okno albo sufit okien)      -> zostaje;
 *   3. skan jest kompletny i mimo to go nie widzi               -> znika.
 */
export function shouldKeepUnscanned(
  row: BoardRow,
  context: { now: number; scanned: Set<string>; trustworthy: boolean }
): boolean {
  if (!row.live || !row.address) return false;
  if (context.scanned.has(row.address.toLowerCase())) return false;
  const fresh = typeof row.startedAt === 'number' && context.now - row.startedAt < RECENT_SEC;
  return fresh || !context.trustworthy;
}

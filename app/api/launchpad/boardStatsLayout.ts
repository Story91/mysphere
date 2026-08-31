/**
 * UKLAD CACHE'U AGREGATU TABLICY W FIRESTORE - czysta arytmetyka, bez bazy.
 *
 * ===========================================================================
 * PO CO TO ISTNIEJE
 * ===========================================================================
 * `/api/launchpad/board` zapisuje TOZSAMOSCI startow (adres, nazwa, symbol,
 * tworca) i tylko je. Wszystko, co jest LICZBA - wolumen, liczba transakcji,
 * zbior handlujacych, ceny do sparkline'a, naliczenia oplat - powstawalo do tej
 * pory wylacznie w przegladarce i ladowalo wylacznie w `localStorage`
 * (`startpad.agg.v1.*`). Dla kogos, kto wchodzi z DRUGIEGO urzadzenia, ten
 * agregat po prostu nie istnieje: tablica startuje od zera i musi przemiesc
 * lancuch od bloku wdrozenia.
 *
 * Gorzej: ten zimny skan ma sufit (`maxScanWindows`) i lancuchy juz go
 * przerosly. Skan, ktory nie dosiegnie bloku wdrozenia, jest niewiarygodny
 * (`scanIsTrustworthy`), wiec agregat NIE JEST ZAPISYWANY - i kolejne wejscie
 * na tym samym urzadzeniu powtarza cala prace. Cache, ktory nigdy sie nie
 * zapisze, nie jest cache'em.
 *
 * Ta kolekcja przenosi ten sam agregat na serwer: liczony raz, naszym RPC,
 * przyrostowo, i czytany przez KAZDE urzadzenie jednym zapytaniem. Ta sama
 * zasada, co przy historii tokena (`historyLayout`), tylko przedmiotem jest
 * cala tablica jednej sieci.
 *
 * ===========================================================================
 * DLACZEGO KLUCZ NIESIE ADRES LAUNCHPADA, A NIE SAMA SIEC
 * ===========================================================================
 * `tokenIndexShape.indexDocId` kluczuje samym `chainId` i to jest tam
 * bezpieczne: tozsamosci sa niezmienne, a `mergeIndex` niczego nie usuwa.
 * Agregat jest czym innym - to SUMA. Adresy w `config.ts` maja fallbacki, ktore
 * zmieniaja sie przy kolejnych wdrozeniach (Robinhood, Arc i Sepolia maja po
 * kilka martwych launchpadow), a martwe wdrozenie ma inna skale krzywej. Suma
 * z martwego launchpada dosumowana do zywego jest nie do odkrecenia - dokladnie
 * ten sam powod, dla ktorego klucz w `localStorage` brzmi
 * `startpad.agg.v1.{chainId}.{launchpad}`.
 *
 * ===========================================================================
 * DLACZEGO KAWALKI, A NIE JEDEN DOKUMENT
 * ===========================================================================
 * Dwa powody naraz:
 *   1. Dokument Firestore ma sufit 1 MB. Sam zbior handlujacych to do 500
 *      adresow na token (`MAX_BUYERS_PER_TOKEN`), czyli ~21 kB - piecdziesiat
 *      tokenow z tlumem i dokument peka.
 *   2. Firestore NIE PRZYJMUJE tablicy tablic, a `SerializedAggregate` sklada
 *      sie wlasnie z par `[klucz, wartosc]`. Zapis pola po polu wymagalby
 *      DRUGIEGO formatu obok tego, ktory juz jest w `boardScan` - a dwa formaty
 *      tego samego znacza dwie prawdy, ktore kiedys sie rozjada.
 *
 * Oba rozwiazuje jedno: caly agregat idzie jako JEDEN JSON, pociety na kawalki
 * po `CHUNK_CHARS` znakow. Firestore widzi wylacznie stringi, a format pozostaje
 * ten sam, ktory czyta `parseAggregate` w przegladarce.
 */

export const BOARD_STATS_COLLECTION = 'launchpadBoardStats';
export const PARTS_SUBCOLLECTION = 'parts';

/**
 * Znakow na kawalek. Sufit dokumentu to 1 MiB w BAJTACH UTF-8, a to sa jednostki
 * UTF-16: przy adresach, cyfrach i nawiasach jeden do jednego, ale nazwa tokena
 * moze byc czymkolwiek. Najgorszy przypadek to trzy bajty na jednostke (emoji
 * ida parami po dwa bajty na jednostke, wiec sa TANSZE, nie drozsze), czyli
 * 180 tysiecy jednostek to najwyzej ~540 kB. Zapas zostaje nawet przy nazwie
 * zlozonej wylacznie ze znakow spoza ASCII.
 */
export const CHUNK_CHARS = 180_000;

/**
 * Sufit kawalkow na jeden agregat (~4,3 MB JSON-a). To nie jest limit
 * pojemnosci, tylko BEZPIECZNIK: agregat, ktory tyle wazy, znaczy blad w
 * ograniczeniach (`MAX_BUYERS_PER_TOKEN`, `MAX_PRICES_PER_TOKEN`), a nie realny
 * ruch. Wtedy nie zapisujemy NICZEGO - polowiczny agregat dosumowalby sie do
 * kolejnych i juz nigdy nie wrocil do prawdy.
 */
export const MAX_PARTS = 24;

/**
 * ID dokumentu MUSI byc deterministyczne i malymi literami - inaczej ten sam
 * launchpad dostaje dwa dokumenty, zaleznie od tego, czy adres przyszedl w
 * checksumie. Ta sama zasada, co `historyDocId` i `tokenDocId`.
 */
export function boardStatsDocId(chainId: number, launchpad: string): string {
  return `${chainId}-${launchpad.trim().toLowerCase()}`;
}

/** Zera wiodace, zeby kawalki sortowaly sie po nazwie tak jak po numerze. */
export function partId(index: number): string {
  return `a${String(index).padStart(4, '0')}`;
}

/**
 * JSON -> kawalki. Pusty string tez daje jeden kawalek: zero kawalkow znaczy
 * "naglowek bez tresci", a to jest stan, ktory `readBoardStats` musi odrzucic.
 */
export function splitPayload(json: string, size: number = CHUNK_CHARS): string[] {
  const parts: string[] = [];
  let at = 0;
  while (at < json.length) {
    let end = at + size < json.length ? at + size : json.length;

    /**
     * NIE WOLNO PRZECIAC PARY ZASTEPCZEJ.
     *
     * `slice` tnie po jednostkach UTF-16, a znak spoza plaszczyzny podstawowej
     * (emoji w nazwie albo symbolu tokena - `JSON.stringify` zostawia go
     * dosłownie, nie escape'uje) zajmuje ich dwie. Ciecie miedzy nimi zostawia
     * w jednym kawalku samotna polowke. Firestore trzyma stringi w UTF-8, wiec
     * kazda samotna polowka wraca jako U+FFFD - i nazwa tokena zostaje z
     * dwoma znakami zapytania NA ZAWSZE, bo `JSON.parse` sie nie wywala
     * (obie podmianki siedza w tym samym literale) i nikt tego nie wykryje.
     */
    if (end < json.length) {
      const code = json.charCodeAt(end - 1);
      if (code >= 0xd800 && code <= 0xdbff && end - 1 > at) end -= 1;
    }

    parts.push(json.slice(at, end));
    at = end;
  }
  return parts.length > 0 ? parts : [''];
}

/** Kawalki -> JSON. Kolejnosc jest kolejnoscia tablicy, nie nazw dokumentow. */
export function joinPayload(parts: string[]): string {
  return parts.join('');
}

/**
 * Ktore dokumenty-kawalki trzeba SKASOWAC po zapisie krotszego agregatu.
 *
 * Agregat, w odroznieniu od historii, nie jest append-only: `mergeAggregates`
 * przycina ceny i tasme do sufitow, wiec nowy zapis bywa krotszy od
 * poprzedniego. Zostawiony ogon starych kawalkow doklejalby sie do odczytu jako
 * smieci na koncu JSON-a i `JSON.parse` konczylby sie wyjatkiem - czyli cache
 * przestalby dzialac w sposob, ktorego nikt nie odroznia od jego braku.
 */
export function stalePartIds(previousCount: number, nextCount: number): string[] {
  const ids: string[] = [];
  for (let index = nextCount; index < previousCount; index += 1) ids.push(partId(index));
  return ids;
}

/* ========================================================================== */
/*  PLAN SKANU - CZEMU SERWER IDZIE W GORE, A PRZEGLADARKA W DOL              */
/* ========================================================================== */

export type StatsWindow = { fromBlock: bigint; toBlock: bigint };

/**
 * Od ktorego bloku i w ktora strone skanowac przy tym zadaniu.
 *
 * ===========================================================================
 * TO JEST INNY PLAN NIZ `planBoardScan` W PRZEGLADARCE - CELOWO
 * ===========================================================================
 * Przegladarka skanuje OD GLOWY W DOL i zapisuje wynik tylko wtedy, gdy w
 * jednym przebiegu dojdzie az do bloku wdrozenia. Miało to sens, dopoki caly
 * lancuch miescil sie w suficie okien. Juz sie nie miesci: na Base Sepolii
 * potrzeba dzis ~96 okien przy suficie 64, na Arc ~59 przy 60, na Base ~88 przy
 * 90. Skan urwany na suficie jest niewiarygodny, wiec agregat NIE JEST
 * zapisywany - i nastepne wejscie zaczyna od zera. Cache, ktory nigdy sie nie
 * zapisze, nie istnieje. Tak wyglada usterka zglaszana jako "z drugiego
 * urzadzenia pobiera wszystko od nowa": z pierwszego tez.
 *
 * Serwer odwraca kierunek: skanuje OD BLOKU WDROZENIA W GORE i zapisuje
 * POSTEP - najwyzszy blok, do ktorego pokrycie jest ciagle. Kazde kolejne
 * zadanie rusza dokladnie jeden blok wyzej. Dzieki temu sufit okien przestaje
 * byc scianą i staje sie tempem: zaleglosc domyka sie w kilku zadaniach zamiast
 * nie domykac sie nigdy.
 *
 * Cena tego wyboru jest jedna i jest do przyjecia: dopoki serwer nadrabia, jego
 * `lastBlock` jest stary, wiec przegladarka nie ma z czego doliczyc delty i
 * robi to, co dzis - liczy sama. Nic sie nie psuje, tylko jeszcze nie
 * przyspieszylo.
 *
 * ===========================================================================
 * KIEDY WOLNO DOSUMOWAC ZAPAMIETANY AGREGAT
 * ===========================================================================
 * `resume: false` znaczy "zacznij od zera": zapamietanego agregatu nie wolno
 * ruszyc, bo nie wiadomo, co opisuje. Trzy takie przypadki:
 *   1. nie ma zapisu;
 *   2. zapis siega ponizej bloku wdrozenia - pokrycie nie jest ciagle od
 *      poczatku, wiec suma nie jest suma calosci;
 *   3. zapis siega POWYZEJ glowy lancucha - inny endpoint, inna siec albo
 *      reorganizacja; dosumowanie delty do takiego stanu policzyloby czesc
 *      zdarzen dwa razy.
 */
export function planBoardStatsScan(input: {
  cachedLastBlock: bigint | null;
  head: bigint;
  deployBlock: bigint;
  scanWindow: bigint;
  maxWindows: number;
}): { windows: StatsWindow[]; resume: boolean; ceiling: bigint } {
  const { cachedLastBlock, head, deployBlock, scanWindow, maxWindows } = input;

  const resume =
    cachedLastBlock !== null && cachedLastBlock >= deployBlock && cachedLastBlock <= head;

  const floor = resume ? (cachedLastBlock as bigint) + 1n : deployBlock;
  if (floor > head) return { windows: [], resume, ceiling: head };

  const budget = scanWindow * BigInt(Math.max(1, maxWindows));
  const ceiling = floor + budget - 1n > head ? head : floor + budget - 1n;

  const windows: StatsWindow[] = [];
  let cursor = floor;
  while (cursor <= ceiling && windows.length < maxWindows) {
    const toBlock = cursor + scanWindow - 1n > ceiling ? ceiling : cursor + scanWindow - 1n;
    windows.push({ fromBlock: cursor, toBlock });
    cursor = toBlock + 1n;
  }

  return { windows, resume, ceiling };
}

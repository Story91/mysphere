/**
 * INDEKS TOKENOW - ksztalt listy startow trzymanej w bazie. Czysta logika,
 * bez Firestore i bez lancucha.
 *
 * ===========================================================================
 * PO CO BAZA, SKORO LISTA JEST NA LANCUCHU
 * ===========================================================================
 * Bo odczyt tej listy z przegladarki jest zawodny, a jej niekompletnosc
 * wyglada jak utrata pieniedzy. 13 sierpnia 2026 z tablicy znikal SAUSAGES -
 * najstarszy i najwiekszy token. Sonda pokazala dlaczego: lista powstawala ze
 * skanu zdarzen `Launched` oknami po 9500 blokow, a najstarszy start lezal w
 * NAJGLEBSZYM oknie. Cokolwiek uciela skan - limit publicznego RPC, padniete
 * okno, sufit okien - zabieralo najpierw wlasnie jego.
 *
 * Tak tego nie robi nikt, kto ma z tego zyc: pump.fun serwuje liste z
 * wlasnego API, Flaunch z subgrafu, a lancuch dowozi im wylacznie NOWOSCI.
 * Ten modul jest naszym odpowiednikiem, w skali, ktora mamy.
 *
 * ===========================================================================
 * JEDNA WLASNOSC, NA KTOREJ TO STOI
 * ===========================================================================
 * RAZ ZAPISANY TOKEN NIE MOZE WYPASC Z LISTY. Skan przynosi tylko to, co
 * zobaczyl w swoim zakresie; wszystko poza tym zakresem zostaje z bazy.
 * Dlatego `mergeIndex` NIGDY nie usuwa - umie wylacznie dokladac i odswiezac.
 */

export const TOKEN_INDEX_COLLECTION = 'launchpadTokenIndex';

/** Jeden dokument na siec. Ten sam launchpad na dwoch lancuchach to dwie listy. */
export function indexDocId(chainId: number): string {
  return String(chainId);
}

export type IndexedToken = {
  address: string;
  name: string;
  symbol: string;
  creator: string;
  /** Blok zdarzenia `Launched`, jako string - Firestore nie zna bigintow. */
  launchBlock: string;
  startedAt: number;
};

const clean = (value: unknown): string => (typeof value === 'string' ? value : '');

/**
 * Zapisana lista + to, co zobaczyl skan. Kolejnosc: od NAJNOWSZEGO startu, bo
 * tak czyta sie tablice.
 *
 * Przy tym samym adresie wygrywa wpis ze skanu: nazwa albo symbol mogly dojsc
 * dopiero, gdy RPC zaczelo oddawac pelne zdarzenie.
 */
export function mergeIndex(stored: IndexedToken[], scanned: IndexedToken[]): IndexedToken[] {
  const byAddress = new Map<string, IndexedToken>();

  for (const token of [...stored, ...scanned]) {
    const address = clean(token?.address).toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(address)) continue;
    const previous = byAddress.get(address);
    byAddress.set(address, {
      address,
      // Puste pole ze skanu nie moze skasowac nazwy, ktora juz mamy.
      name: clean(token.name) || previous?.name || '',
      symbol: clean(token.symbol) || previous?.symbol || '',
      creator: clean(token.creator) || previous?.creator || '',
      launchBlock: clean(token.launchBlock) || previous?.launchBlock || '0',
      startedAt: Number(token.startedAt) || previous?.startedAt || 0,
    });
  }

  return [...byAddress.values()].sort((a, b) => {
    const left = BigInt(a.launchBlock || '0');
    const right = BigInt(b.launchBlock || '0');
    return left === right ? 0 : left < right ? 1 : -1;
  });
}

/* ========================================================================== */
/*  PLAN SKANU - DLACZEGO SAM `lastBlock` NIE WYSTARCZAL                      */
/* ========================================================================== */

/**
 * ===========================================================================
 * USTERKA, KTORA TO NAPRAWIA (potwierdzona na Arc 2026-09-09)
 * ===========================================================================
 * Trasa `/api/launchpad/board` schodzila od glowy w dol i przesuwala
 * `lastBlock` WYLACZNIE wtedy, gdy JEDNO zadanie objelo caly zakres od bloku
 * wdrozenia do glowy. Na Base ten zakres miescil sie w jednym zadaniu, wiec
 * usterki nikt nie widzial. Na Arc jest inaczej: 4 409 344 bloki zaleglosci
 * przy 380 000 na zadanie (40 okien po 9500). Warunek nie byl spelniony NIGDY,
 * `lastBlock` zostawal na zerze, a kazde kolejne wejscie skanowalo te same
 * gorne 380 tysiecy blokow i nie znajdowalo w nich niczego. Indeks nie mial jak
 * sie zapelnic - szesc realnych tokenow Arc lezalo 4,3 mln blokow ponizej.
 *
 * Blok co 0,51 s to nie jest arcowa osobliwosc, tylko kierunek, w ktorym ida
 * nowe lancuchy. Dlatego naprawa jest z zalozenia OGOLNA: postep skanu w dol
 * musi byc TRWALY, tak samo jak przy historii pojedynczego tokena
 * (`historyLayout.planScan`).
 *
 * ===========================================================================
 * DWA ZNACZNIKI, BO POKRYCIE MA DWA KONCE
 * ===========================================================================
 * `lastBlock` mowi, dokad pokrycie siega W GORE (nad nim - nieznane, stad tania
 * delta przy glowie). `scannedDownTo` mowi, dokad siega W DOL. Miedzy nimi
 * pokrycie jest CIAGLE i to jest jedyna wlasnosc, ktora te znaczniki obiecuja -
 * dziury nie da sie w nich opisac, wiec nie wolno jej zapisac (patrz `anchor`).
 * `complete` znaczy "backfill dosiegnal bloku wdrozenia", czyli nizej logow
 * tego launchpada z definicji nie ma.
 */
export type IndexScanState = {
  /** Najwyzszy zeskanowany blok. Nad nim - nieznane. */
  lastBlock: bigint;
  /** Najnizszy zeskanowany blok ciaglego pokrycia. */
  scannedDownTo: bigint;
  /** Backfill dosiegnal bloku wdrozenia launchpada. */
  complete: boolean;
};

/**
 * Przedzial do zeskanowania w tym zadaniu.
 *
 * `anchor` to koniec, ktory PRZYLEGA do tego, co juz mamy zapisane - i od
 * ktorego trzeba isc, zeby uciety skan zostawil pokrycie ciagle z zapisanym:
 *   - `top`   - ogon: gora przedzialu dotyka `scannedDownTo`, wiec schodzimy w
 *               dol i przesuwamy dolny znacznik;
 *   - `bottom`- delta przy glowie: dol przedzialu dotyka `lastBlock`, wiec
 *               idziemy w gore i przesuwamy gorny znacznik.
 * Przy pustym indeksie nie ma do czego przylegac - wtedy `top`, bo tablice
 * czyta sie od NAJNOWSZEGO startu i to on ma sie pokazac po pierwszym wejsciu.
 */
export type IndexRange = { head: bigint; floor: bigint; anchor: 'top' | 'bottom' };

/**
 * Co zostalo do zeskanowania przy zapisanym stanie `state`.
 *
 * Zaleglosci sie NIE PRZESKAKUJE: kazdy przedzial jest przyciety tak, zeby
 * przylegal do zapisanego pokrycia (delta od gory, ogon od dolu). Przedzial
 * urwany w srodku zostawilby dziure, ktorej dwa znaczniki nie umieja opisac.
 *
 * Kolejnosc wyniku jest kolejnoscia waznosci: najpierw NOWE starty przy glowie,
 * potem dociaganie ogona. Zadanie z ograniczonym budzetem okien wyda go wiec
 * najpierw na to, na co ludzie patrza.
 */
export function planIndexScan(
  state: IndexScanState | null,
  bounds: { head: bigint; deployBlock: bigint; headSpan: bigint; backfillSpan: bigint }
): IndexRange[] {
  const { head, deployBlock, headSpan, backfillSpan } = bounds;
  if (head < deployBlock) return [];

  // Pusty indeks (albo zapis sprzed bloku wdrozenia, czyli o innym launchpadzie):
  // jeden przedzial od glowy w dol, przyciety do budzetu jednego zadania.
  if (!state || state.lastBlock < deployBlock) {
    const floor = head - deployBlock >= backfillSpan ? head - backfillSpan + 1n : deployBlock;
    return [{ head, floor, anchor: 'top' }];
  }

  const ranges: IndexRange[] = [];

  if (head > state.lastBlock) {
    const floor = state.lastBlock + 1n;
    const top = head - floor >= headSpan ? floor + headSpan - 1n : head;
    ranges.push({ head: top, floor, anchor: 'bottom' });
  }

  if (!state.complete && state.scannedDownTo > deployBlock) {
    const top = state.scannedDownTo - 1n;
    const floor = top - deployBlock >= backfillSpan ? top - backfillSpan + 1n : deployBlock;
    ranges.push({ head: top, floor, anchor: 'top' });
  }

  return ranges;
}

/**
 * Przedzial na okna `getLogs`, liczone OD KOTWICY. Okno nigdy nie jest szersze
 * niz `window` - limit `eth_getLogs` jest wlasnoscia endpointu i przekroczony
 * nie oznacza wolniejszej odpowiedzi, tylko blad (`-32012 requested range too
 * large` na `rpc.testnet.arc.io`).
 */
export function indexWindows(
  range: IndexRange,
  window: bigint,
  maxWindows: number
): { from: bigint; to: bigint }[] {
  const out: { from: bigint; to: bigint }[] = [];
  if (range.floor > range.head || maxWindows <= 0 || window <= 0n) return out;

  if (range.anchor === 'top') {
    let cursor = range.head;
    while (out.length < maxWindows) {
      const from = cursor - range.floor >= window ? cursor - window + 1n : range.floor;
      out.push({ from, to: cursor });
      if (from === range.floor) break;
      cursor = from - 1n;
    }
    return out;
  }

  let cursor = range.floor;
  while (out.length < maxWindows) {
    const to = range.head - cursor >= window ? cursor + window - 1n : range.head;
    out.push({ from: cursor, to });
    if (to === range.head) break;
    cursor = to + 1n;
  }
  return out;
}

/**
 * AGREGAT TABLICY Z SERWERA - i regula, ktora decyduje, ktory z dwoch
 * zapamietanych stanow jest podstawa do doliczenia delty.
 *
 * ===========================================================================
 * PO CO TO ISTNIEJE
 * ===========================================================================
 * Do tej pory tablica miala dokladnie jedno miejsce, w ktorym pamietala
 * policzony wolumen: `localStorage` tej jednej przegladarki. Kto wchodzil z
 * drugiego urzadzenia, nie mial czego odswiezyc - mial wszystko do policzenia
 * od nowa, oknami po lancuchu, az do bloku wdrozenia launchpada.
 *
 * `/api/launchpad/board/stats` liczy ten sam agregat po stronie serwera i
 * trzyma go w bazie. Ten modul go pobiera i zestawia z tym, co lezy lokalnie.
 *
 * ===========================================================================
 * DWA AGREGATY WYBIERAMY, A NIE SUMUJEMY - I TO JEST TU NAJWAZNIEJSZE
 * ===========================================================================
 * Oba stany znacza DOKLADNIE TO SAMO: "policzone od bloku wdrozenia do
 * `lastBlock`". Ich zakresy nie sa rozlaczne - one na siebie ZACHODZA prawie w
 * calosci. `mergeAggregates` jest addytywne (patrz `boardScan`), wiec zlozenie
 * ich dalby wolumen policzony niemal dwa razy, liczbe transakcji dwa razy i
 * naliczenia oplat dwa razy. Ceny i tasma przezylyby to (deduplikacja po
 * `order` i `id`), ale wolumenu nikt by juz nie odkrecil.
 *
 * Wolno wiec tylko WYBRAC jeden - ten, ktory siega wyzej - i doliczyc do niego
 * delte OD JEGO `lastBlock` w gore. Dlatego ta funkcja nie ma wariantu
 * "polacz": nie ma sytuacji, w ktorej byloby to poprawne.
 */

import { parseAggregate, type BoardAggregate } from './boardScan';

export type AggregateBase = {
  aggregate: BoardAggregate;
  /** Blok, do ktorego ten agregat jest policzony - liczac od bloku wdrozenia. */
  lastBlock: bigint;
  source: 'server' | 'local';
};

/**
 * Ktory zapamietany agregat jest podstawa tego wejscia.
 *
 * Wyzszy `lastBlock` wygrywa, bo znaczy mniej blokow do dociagniecia. Przy
 * remisie wygrywa lokalny: jest juz w pamieci, a serwerowy przyszedl przez
 * siec - identyczna tresc, mniejszy koszt.
 *
 * ===========================================================================
 * PODSTAWA SIEGAJACA NAD GLOWE JEST BEZUZYTECZNA, WIEC ODPADA PRZED WYBOREM
 * ===========================================================================
 * Serwer czyta glowe lancucha SWOIM endpointem, przegladarka SWOIM, a viem
 * jeszcze cache'uje `getBlockNumber` na `cacheTime`. Serwerowy `lastBlock`
 * bywa wiec o kilka blokow WYZSZY niz `head`, ktory widzi ta przegladarka - na
 * Robinhoodzie (blok co 0,1 s) to stan normalny, nie awaria.
 *
 * `planBoardScan` czyta ujemna zaleglosc jako "reorganizacja albo inna siec" i
 * odrzuca CALA podstawe, po czym skanuje od bloku wdrozenia - na sieciach,
 * ktore przerosly sufit okien, skanem uciętym i niezapisywalnym. Wybor
 * "wyzszy wygrywa" wystawilby wiec lokalna, w pelni sprawna podstawe na rzecz
 * serwerowej, ktora zaraz zostanie wyrzucona - i tablica pokazywalaby zerowy
 * wolumen NA SKUTEK tej naprawy.
 *
 * Dlatego kandydat ponad glowa nie przegrywa - on w ogole nie startuje.
 */
export function pickAggregateBase(
  local: { aggregate: BoardAggregate; lastBlock: bigint } | null,
  server: { aggregate: BoardAggregate; lastBlock: bigint } | null,
  head: bigint
): AggregateBase | null {
  const usable = <T extends { lastBlock: bigint }>(candidate: T | null) =>
    candidate && candidate.lastBlock <= head ? candidate : null;

  const fitLocal = usable(local);
  const fitServer = usable(server);

  if (fitLocal && fitServer) {
    return fitServer.lastBlock > fitLocal.lastBlock
      ? { ...fitServer, source: 'server' }
      : { ...fitLocal, source: 'local' };
  }
  if (fitServer) return { ...fitServer, source: 'server' };
  if (fitLocal) return { ...fitLocal, source: 'local' };
  return null;
}

/** Odpowiedz trasy, czytana nieufnie - to jest siec, a nie nasz obiekt. */
export function readBoardStatsResponse(body: unknown): { aggregate: BoardAggregate; lastBlock: bigint } | null {
  if (!body || typeof body !== 'object') return null;
  const input = body as { ok?: unknown; lastBlock?: unknown; aggregate?: unknown };
  if (input.ok !== true) return null;
  if (typeof input.lastBlock !== 'string' || !/^\d+$/.test(input.lastBlock)) return null;

  const lastBlock = BigInt(input.lastBlock);
  if (lastBlock <= 0n) return null;

  // Ten sam `parseAggregate`, co przy migawce z `localStorage`: cokolwiek nie
  // pasuje do ksztaltu - traktujemy jak brak agregatu, a nie jak agregat pusty.
  const aggregate = parseAggregate(input.aggregate);
  if (!aggregate) return null;

  return { aggregate, lastBlock };
}

/**
 * Ile czekamy na serwerowy agregat.
 *
 * Awaria cache'u ma znaczyc "wolniej", nigdy "pusto": po tym czasie po prostu
 * wracamy do tego, co bylo przed ta zmiana - lokalna migawka albo pelny skan
 * z przegladarki. Ta sama wartosc i ten sam powod, co przy historii tokena.
 */
export const BOARD_STATS_TIMEOUT_MS = 8_000;

export async function fetchBoardStats(
  chainId: number
): Promise<{ aggregate: BoardAggregate; lastBlock: bigint } | null> {
  try {
    const response = await fetch(`/api/launchpad/board/stats?chainId=${chainId}`, {
      signal: AbortSignal.timeout(BOARD_STATS_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return readBoardStatsResponse(await response.json());
  } catch {
    // Timeout, offline, 500 - kazde z nich znaczy "policz sam", tak jak dotad.
    return null;
  }
}

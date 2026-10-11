'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { type Address } from 'viem';
import { usePublicClient } from 'wagmi';
import {
  ACTIVE_LAUNCHPAD_NETWORK,
  LAUNCHPAD_ADDRESS,
  LAUNCHPAD_ADDRESSES,
  ACTIVE_MARKET_ID,
  LAUNCHPAD_CHAIN,
  LAUNCHPAD_DEPLOY_BLOCK,
} from '../config';
import { loadTokenHistory, saveTokenHistory } from '../snapshot';
import {
  DEAD_ADDRESS,
  POOL_MANAGER_ADDRESS,
  priceWeiAfter,
  SECONDS_PER_BLOCK,
  type TradeEntry,
} from './detailShared';
import {
  applyBalanceDelta,
  applyTradeToBalances,
  balancesArePoisoned,
  mergeTrades,
  parseBalances,
  parseTrades,
  scanBackward,
  serializeBalances,
  serializeTrades,
  type ScanLog,
} from './historyScan';
import { hasPool } from './poolPrice';
import { scanPoolSwaps, swapLogToTrade } from './poolSwaps';

/**
 * Historia jednego tokena: transakcje krzywej (wykres, lista) i salda holderow.
 *
 * ===========================================================================
 * SKAD TE DANE PRZYCHODZA - I DLACZEGO TO SIE ZMIENILO
 * ===========================================================================
 * Do 2026-08-13 KAZDE wejscie na strone tokena odtwarzalo cala historie od
 * zera: schodzenie oknami po ~1900 blokow wstecz, dwa `getLogs` na okno, jedno
 * okno po drugim, az do bloku startu tokena. Na Base jedno okno to okolo
 * godziny lancucha, wiec token zyjacy trzy dni znaczyl ~70 kolejek zanim
 * cokolwiek pokazalo sie na wykresie. Na tokenie z ruchem strona sie przez to
 * zacinala, i tym mocniej, im dluzej token zyl.
 *
 * Teraz sa trzy zrodla, w tej kolejnosci:
 *   1. MIGAWKA z localStorage - maluje wykres natychmiast, jeszcze przed siecia;
 *   2. `/api/launchpad/history` - wspolny cache; oddaje gotowa historie, a od
 *      bloku z migawki dosyla tylko ROZNICE;
 *   3. SKAN Z PRZEGLADARKI - dokladnie to, co bylo tu wczesniej, uzywane gdy
 *      trasa cache'u nie odpowiada. Awaria cache'u ma znaczyc "wolniej", nigdy
 *      "pusto".
 *
 * Zdarzenia na zywo (`applyLive`) doklejaja sie do tego, co juz jest na
 * ekranie, i nie zaleza od zadnego z tych trzech zrodel.
 */

/** Rozmiar okna skanu awaryjnego - limit `getLogs` danej sieci. */
const LOG_WINDOW = ACTIVE_LAUNCHPAD_NETWORK.scanWindow;

/** Sufit okien skanu awaryjnego. */
const MAX_LOG_WINDOWS = ACTIVE_LAUNCHPAD_NETWORK.maxScanWindows;

/**
 * Zapas pod estymowany blok startu, w SEKUNDACH przeliczonych na bloki - pol
 * godziny w kazdej sieci. Blok startu liczymy z `startedAt`, a ta estymacja ma
 * prawo sie mylic (na Robinhoodzie blok trwa 0,1 s, na Base 2 s).
 */
const LAUNCH_BLOCK_MARGIN = BigInt(Math.ceil(1800 / SECONDS_PER_BLOCK));

/** Ksztalt loga z watchContractEvent - dekodowany, ale traktowany ostroznie. */
export type LiveLaunchpadLog = {
  eventName?: string;
  args?: Record<string, unknown>;
  transactionHash?: `0x${string}` | null;
  logIndex?: number | null;
  blockNumber?: bigint | null;
};

export type TokenHistory = {
  loading: boolean;
  loaded: boolean;
  error: string | null;
  /** Rosnaco po bloku; widoki odwracaja sobie same. */
  trades: TradeEntry[];
  /** Adres (lowercase) -> saldo w wei tokena. Zawiera kontrakty i dEaD. */
  balances: Map<string, bigint>;
  graduatedTs: number | null;
  /** Historia nie siega jeszcze startu tokena - jest ucieta od dolu. */
  truncated: boolean;
};

/**
 * Salda, ktorym wolno wierzyc. Zatrute (ujemne saldo, transakcje bez ani
 * jednego wiersza, suma ponad cala podaz) zamieniamy na PUSTE - pusta tabela
 * holderow jest uczciwsza niz krzywa z saldem na minusie.
 *
 * Dotyczy dwoch wejsc: migawki z localStorage (mogla zostac zapisana przed
 * naprawa) i skanu z przegladarki, ktory urwal sie przed blokiem startu tokena
 * i zebral tylko czesc Transferow. Trasa `/api/launchpad/history` ma to samo
 * sito, tyle ze tam po nim jeszcze idzie odczyt `balanceOf`.
 */
function trustedBalances(balances: Map<string, bigint>, trades: TradeEntry[]): Map<string, bigint> {
  return balancesArePoisoned(balances, trades) ? new Map() : balances;
}

const EMPTY: TokenHistory = {
  loading: true,
  loaded: false,
  error: null,
  trades: [],
  balances: new Map(),
  graduatedTs: null,
  truncated: false,
};

type CacheResponse = {
  highBlock?: string;
  complete?: boolean;
  graduatedTs?: number | null;
  trades?: unknown;
  balances?: unknown;
  /** Ile transakcji zna serwer LACZNIE - nie tylko ile przyslal w tej odpowiedzi. */
  tradeCount?: number;
};

export function useTokenHistory(
  tokenAddress: Address | null,
  startedAt: number | null,
  /**
   * Po graduacji: identyfikator puli v4 i decimals tokena. Z nimi hook
   * doklada do historii swapy z puli (patrz ./poolSwaps.ts); bez nich
   * (krzywa jeszcze zyje albo puli nie ma) zachowanie jest jak dawniej.
   */
  poolId: string | null = null,
  decimals = 18,
  /**
   * Launchpad, z ktorego pochodzi token (siec moze miec kilka wdrozen). To jego
   * adres jest "krzywa" w saldach - tam leza tokeny niesprzedane jeszcze ludziom.
   * Skan zdarzen idzie po wszystkich launchpadach naraz, bo zdarzenia tego
   * tokena i tak emituje tylko jego wlasny.
   */
  launchpad: string = LAUNCHPAD_ADDRESS
) {
  const readClient = usePublicClient({ chainId: LAUNCHPAD_CHAIN.id });
  const [state, setState] = useState<TokenHistory>(EMPTY);
  /** Najwyzszy blok, z ktorego mamy juz swapy puli; null = jeszcze nie skanowane. */
  // Pokrycie swapow puli jako PRZEDZIAL, nie pojedynczy blok. Sam gorny
  // koniec klamal: skan urwany sufitem okien i tak zapisywal glowe lancucha
  // jako pokryta, wiec luka po srodku nie zasklepiala sie nigdy.
  const poolCoverage = useRef<{ from: bigint; to: bigint } | null>(null);

  /**
   * Ostatnio ZNANY stan pokrycia: do ktorego bloku mamy historie i czy mamy ja
   * w calosci. Trzymany w ref, a nie w stanie, bo sluzy wylacznie do zbudowania
   * nastepnego zapytania - przerysowanie ekranu od tego nie zalezy.
   */
  const coverage = useRef<{ highBlock: string; full: boolean } | null>(null);

  // Migawka maluje wykres, zanim cokolwiek poleci po sieci. Osobny efekt, bo
  // ma zdazyc przy PIERWSZYM renderze tokena, a nie po odpowiedzi serwera.
  useEffect(() => {
    coverage.current = null;
    if (!tokenAddress) return;
    const snapshot = loadTokenHistory(LAUNCHPAD_CHAIN.id, tokenAddress);
    if (!snapshot) {
      setState(EMPTY);
      return;
    }
    coverage.current = { highBlock: snapshot.highBlock, full: snapshot.full };
    const trades = parseTrades(snapshot.trades);
    setState({
      loading: true,
      loaded: true,
      error: null,
      trades,
      balances: trustedBalances(parseBalances(snapshot.balances), trades),
      graduatedTs: snapshot.graduatedTs,
      truncated: !snapshot.complete,
    });
  }, [tokenAddress]);

  /**
   * Skan awaryjny - kod sprzed cache'u. Wolany WYLACZNIE wtedy, gdy trasa
   * `/api/launchpad/history` nie odpowiada.
   */
  const scanFromChain = useCallback(async (token: Address, started: number) => {
    if (!readClient) throw new Error('No RPC client.');

    // Jeden getBlock na caly skan. Czas kazdego loga liczymy z roznicy numerow
    // blokow - pobieranie timestampu kazdego bloku zamieniloby skan w setki
    // dodatkowych zadan.
    const anchor = await readClient.getBlock({ blockTag: 'latest' });
    const anchorBlock = anchor.number;
    const anchorTs = Number(anchor.timestamp);
    const estTs = (block: bigint) =>
      Math.max(started, anchorTs - Number(anchorBlock - block) * SECONDS_PER_BLOCK);

    const ageBlocks = BigInt(Math.max(0, Math.floor((anchorTs - started) / SECONDS_PER_BLOCK)));
    const estLaunchBlock = anchorBlock > ageBlocks ? anchorBlock - ageBlocks : 0n;
    const candidate = estLaunchBlock > LAUNCH_BLOCK_MARGIN ? estLaunchBlock - LAUNCH_BLOCK_MARGIN : 0n;
    const floor = candidate > LAUNCHPAD_DEPLOY_BLOCK ? candidate : LAUNCHPAD_DEPLOY_BLOCK;

    const result = await scanBackward(readClient, {
      launchpad: LAUNCHPAD_ADDRESSES,
      token,
      head: anchorBlock,
      floor,
      window: LOG_WINDOW,
      maxWindows: MAX_LOG_WINDOWS,
      estTs,
      // Tempo RPC tej sieci. Na Arc bez tego skan gubil okna na "rate limit
      // exceeded" i historia wychodzila ucieta mimo poprawnych okien.
      concurrency: ACTIVE_LAUNCHPAD_NETWORK.scanConcurrency,
      paceMs: ACTIVE_LAUNCHPAD_NETWORK.scanPaceMs,
      /*
       * Salda z `balanceOf`, nie z sumowania roznic. Tu, w przegladarce, jest
       * to JEDYNE miejsce, ktore moze je domknac: serwer ma do tego wlasny
       * `holderBalances.ts`, ale sciezka awaryjna (gdy cache jest niedostepny)
       * omija serwer i szla dotad z samymi roznicami. Na Arc bylo to widac:
       * wiersz `BONDING CURVE` pokazywal 999,7M zamiast rownych 1000M.
       */
      settleBalances: true,
    });

    return { result, anchorBlock };
  }, [readClient]);

  const load = useCallback(async () => {
    if (!tokenAddress || startedAt === null) return;
    setState((prev) => ({ ...prev, loading: true, error: null }));

    // Roznice wolno prosic TYLKO wtedy, gdy migawka trzyma komplet historii -
    // przyciety ogon plus sama roznica dalby wykres z dziura na poczatku.
    const since = coverage.current?.full ? coverage.current.highBlock : null;
    // Pelne przeladowanie buduje liste od zera (base = []), wiec swapy puli
    // tez trzeba dolozyc od nowa - backfill nizej startuje od graduacji.
    if (!since) poolCoverage.current = null;

    try {
      const query = new URLSearchParams({
        chainId: String(LAUNCHPAD_CHAIN.id),
        token: tokenAddress,
        startedAt: String(startedAt),
      });
      if (since) query.set('sinceBlock', since);
      if (ACTIVE_MARKET_ID) query.set('m', ACTIVE_MARKET_ID);

      // TERMIN NA ODPOWIEDZ TRASY, nie tylko na jej blad.
      //
      // Awaryjny skan z lancucha (nizej) wlaczal sie dotad wylacznie po
      // BLEDZIE trasy. 14 sierpnia 2026 Firestore wyczerpal dzienny limit
      // odczytow i trasa przestala oddawac blad - zaczela MILCZEC, bo SDK
      // Firebase ponawia `RESOURCE_EXHAUSTED` z narastajacym odstepem.
      // Odpowiedzi przychodzily po 120 i 372 sekundach, a wykres na stronie
      // tokena budowal sie "w nieskonczonosc", majac obok gotowa droge do
      // policzenia tego samego z logow.
      //
      // 11.10.2026: zmierzone na produkcji, trasa w stanie "cache trafiony,
      // nic do doskanowania" (SPHERE, 74 transakcje) odpowiadala 6,7 s. Osiem
      // sekund limitu bylo wiec ciasne na wlasnym najlepszym przypadku - przy
      // normalnej konkurencji o CPU/siec na stronie (hydratacja, inne karty
      // pobierajace rownolegle) przekraczalo je i trasa padala na
      // ERR_ABORTED, ZANIM zdazyla odpowiedziec. Skutek byl gorszy niz brak
      // limitu: wykres zostawal na "Building the chart..." w nieskonczonosc,
      // bo przegladarkowy skan zapasowy (nizej) sam pyta publiczny RPC, ktory
      // bywa wtedy juz ograniczony (429). Pietnascie sekund daje zapas nad
      // zmierzonym najlepszym przypadkiem; limit wciaz istnieje, zeby trasa,
      // ktora naprawde milczy (Firestore jak 14 sierpnia), nie wisiala bez
      // konca.
      const response = await fetch(`/api/launchpad/history?${query.toString()}`, {
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error(`History cache responded ${response.status}.`);
      const data = (await response.json()) as CacheResponse;

      const incoming = parseTrades(Array.isArray(data.trades) ? data.trades : []);
      const balances = parseBalances(Array.isArray(data.balances) ? data.balances : []);
      const highBlock = typeof data.highBlock === 'string' ? data.highBlock : '0';
      const complete = data.complete === true;
      const graduatedTs = typeof data.graduatedTs === 'number' ? data.graduatedTs : null;
      const knownCount = typeof data.tradeCount === 'number' ? data.tradeCount : 0;

      // Roznicy wolno prosic dopiero wtedy, gdy cache siega startu tokena.
      // Dopoki nie siega, brakujace transakcje leza PONIZEJ `highBlock`, wiec
      // pytanie o sama roznice nigdy by ich nie przynioslo.
      coverage.current = { highBlock, full: complete };

      setState((prev) => {
        // Przy zapytaniu o roznice podstawa jest to, co juz na ekranie; przy
        // pelnym - wylacznie odpowiedz serwera, zeby stara migawka nie
        // przetrzymala transakcji, ktorej lancuch juz nie ma.
        const base = since ? prev.trades : [];
        const trades = mergeTrades(base, incoming);

        // Zdarzenia na zywo potrafia przyjsc W TRAKCIE zapytania i byc nowsze
        // niz cache. Doklejamy te, ktorych serwer nie mogl widziec.
        const head = BigInt(highBlock);
        const seen = new Set(trades.map((trade) => trade.id));
        const live = prev.trades.filter((trade) => !seen.has(trade.id) && trade.block > head);
        for (const trade of live) applyTradeToBalances(balances, trade, launchpad.toLowerCase());

        const merged = live.length ? mergeTrades(trades, live) : trades;

        // SAMONAPRAWA ZATRUTEJ MIGAWKI.
        //
        // Gdy serwer deklaruje wiecej transakcji, niz mamy po scaleniu, nasza
        // migawka jest NIEPELNA mimo `full: true` - tak zdarzylo sie 14
        // sierpnia 2026, gdy odczyt kawalkow historii nie zdazyl i trasa
        // oddala komplet naglowka z pusta lista. Przegladarka zapisala te
        // pustke jako pelna i od tej pory prosila juz tylko o roznice, czyli o
        // nic. Odbieramy wtedy prawo do pytania roznicowego; nastepne wejscie
        // pobierze calosc.
        if (knownCount > merged.length) coverage.current = { highBlock, full: false };

        return {
          loading: false,
          loaded: true,
          error: null,
          trades: merged,
          balances,
          graduatedTs: graduatedTs ?? prev.graduatedTs,
          truncated: !complete,
        };
      });
      return;
    } catch {
      // Cache padl - schodzimy do skanu z przegladarki. Wolniej, ale strona
      // pokazuje historie zamiast bledu.
    }

    try {
      const { result, anchorBlock } = await scanFromChain(tokenAddress, startedAt);
      coverage.current = { highBlock: anchorBlock.toString(), full: result.complete };
      setState((prev) => {
        const seen = new Set(result.trades.map((trade) => trade.id));
        const live = prev.trades.filter((trade) => !seen.has(trade.id) && trade.block > anchorBlock);
        for (const trade of live) applyTradeToBalances(result.balances, trade, launchpad.toLowerCase());
        const trades = live.length ? mergeTrades(result.trades, live) : result.trades;
        return {
          loading: false,
          loaded: true,
          error: null,
          trades,
          balances: trustedBalances(result.balances, trades),
          graduatedTs: result.graduatedTs ?? prev.graduatedTs,
          truncated: !result.complete,
        };
      });
    } catch (cause) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: cause instanceof Error ? cause.message.split('\n')[0] : String(cause),
      }));
    }
  }, [scanFromChain, startedAt, tokenAddress, launchpad]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Zapis migawki - PO ustaleniu stanu, nie w jego reduktorze. Dzieki temu
   * localStorage dostaje tez transakcje z `applyLive`, a podwojne wywolanie
   * reduktora (React w trybie scislym) niczego nie zapisuje dwa razy.
   */
  useEffect(() => {
    const cover = coverage.current;
    if (!tokenAddress || !cover || state.loading || !state.loaded || state.error) return;
    saveTokenHistory(LAUNCHPAD_CHAIN.id, tokenAddress, {
      highBlock: cover.highBlock,
      complete: !state.truncated,
      graduatedTs: state.graduatedTs,
      trades: serializeTrades(state.trades),
      balances: serializeBalances(state.balances),
      full: cover.full,
    });
  }, [state, tokenAddress]);

  /**
   * Doklada pojedyncze zdarzenia z watchContractEvent do stanu, ktory juz jest
   * na ekranie - bez ponownego skanu. Wolajacy MUSI podac wylacznie logi tego
   * tokena.
   */
  const applyLive = useCallback((logs: LiveLaunchpadLog[]) => {
    setState((prev) => {
      const seen = new Set(prev.trades.map((trade) => trade.id));
      const fresh: TradeEntry[] = [];
      let balances: Map<string, bigint> | null = null;
      const mutable = () => (balances ??= new Map(prev.balances));
      let graduatedTs = prev.graduatedTs;
      const now = Math.floor(Date.now() / 1000);
      const curve = launchpad.toLowerCase();

      for (const log of logs) {
        const name = log.eventName;
        const args = log.args ?? {};
        const id = `${log.transactionHash ?? 'live'}-${String(log.logIndex ?? 0)}`;
        if (name === 'Bought' || name === 'Sold') {
          if (seen.has(id)) continue;
          const isBuy = name === 'Bought';
          const account = (isBuy ? args.buyer : args.seller) as Address | undefined;
          const eth = (isBuy ? args.ethNet : args.ethOut) as bigint | undefined;
          const tokens = (isBuy ? args.tokensOut : args.tokensIn) as bigint | undefined;
          const reserveAfter = args.ethReserveAfter as bigint | undefined;
          const tokenReserveAfter = args.tokenReserveAfter as bigint | undefined;
          if (!account || eth === undefined || tokens === undefined || reserveAfter === undefined || tokenReserveAfter === undefined) continue;
          const entry: TradeEntry = {
            id,
            kind: isBuy ? 'buy' : 'sell',
            account,
            eth,
            tokens,
            priceWei: priceWeiAfter(reserveAfter, tokenReserveAfter),
            ethReserveAfter: reserveAfter,
            block: log.blockNumber ?? 0n,
            logIndex: Number(log.logIndex ?? 0),
            ts: now,
            txHash: log.transactionHash ?? null,
          };
          seen.add(id);
          fresh.push(entry);
          applyTradeToBalances(mutable(), entry, curve);
        } else if (name === 'Graduated') {
          graduatedTs = graduatedTs ?? now;
          // Graduacja przenosi tokeny krzywej do puli i na adres spalenia.
          // Historycznie widzimy to w Transferach; na zywo odtwarzamy z pol
          // zdarzenia, zeby taba Holders nie klamala do nastepnego skanu.
          const toPool = args.tokensToPool as bigint | undefined;
          const toDead = args.tokensToDead as bigint | undefined;
          if (toPool !== undefined && toDead !== undefined) {
            applyBalanceDelta(mutable(), curve, -(toPool + toDead));
            applyBalanceDelta(mutable(), POOL_MANAGER_ADDRESS, toPool);
            applyBalanceDelta(mutable(), DEAD_ADDRESS, toDead);
          }
        }
      }

      if (fresh.length === 0 && balances === null && graduatedTs === prev.graduatedTs) return prev;
      return {
        ...prev,
        trades: fresh.length ? [...prev.trades, ...fresh] : prev.trades,
        balances: balances ?? prev.balances,
        graduatedTs,
      };
    });
  }, [launchpad]);

  /**
   * BACKFILL SWAPOW PULI, dwukierunkowy.
   *
   * Najpierw domykamy gore (od konca pokrycia do glowy lancucha), bo tam sa
   * transakcje, po ktore ludzie tu przychodza. Potem, jesli zostal budzet
   * okien, schodzimy w dol ku graduacji. Pokrycie rozszerza sie o tyle, ile
   * skan NAPRAWDE objal - `scanPoolSwaps` zwraca `scannedFrom`, wiec urwanie
   * na sufcie okien zostawia dziure zapamietana, a nie zamieciona.
   */
  const backfillPool = useCallback(async () => {
    if (!readClient || !tokenAddress || !hasPool(poolId)) return;
    const head = await readClient.getBlock({ blockTag: 'latest' });
    const headBlock = head.number;
    const headTs = Number(head.timestamp);
    const estTs = (block: bigint) => Math.max(startedAt ?? 0, headTs - Number(headBlock - block) * SECONDS_PER_BLOCK);

    // Podloga skanu: pierwszy swap puli nie moze byc wczesniej niz ostatnia
    // transakcja krzywej (graduacja zamyka krzywa, dopiero potem otwiera pule).
    let floor: bigint;
    const curveTrades = state.trades.filter((trade) => trade.ethReserveAfter > 0n);
    const lastCurveBlock = curveTrades.length ? curveTrades[curveTrades.length - 1].block : 0n;
    if (lastCurveBlock > 0n) {
      floor = lastCurveBlock;
    } else if (state.graduatedTs !== null) {
      const age = BigInt(Math.max(0, Math.floor((headTs - state.graduatedTs) / SECONDS_PER_BLOCK)));
      floor = headBlock > age + LAUNCH_BLOCK_MARGIN ? headBlock - age - LAUNCH_BLOCK_MARGIN : 0n;
    } else {
      return;
    }

    const scan = async (fromBlock: bigint, toBlock: bigint) => {
      if (fromBlock > toBlock) return null;
      return scanPoolSwaps({
        poolId: poolId as `0x${string}`,
        decimals,
        fromBlock,
        toBlock,
        startedAt: startedAt ?? 0,
      });
    };

    try {
      const covered = poolCoverage.current;
      // 1. Gora: od konca pokrycia (albo od glowy, gdy pokrycia nie ma) w dol.
      const topFrom = covered ? covered.to + 1n : floor;
      const top = await scan(topFrom, headBlock);
      let next = covered
        ? { from: covered.from, to: headBlock > covered.to ? headBlock : covered.to }
        : top
          ? { from: top.scannedFrom, to: headBlock }
          : null;
      let swaps = top?.trades ?? [];

      // 2. Dol: dociagamy starsze, dopoki nie dojdziemy do podlogi. Jedno
      //    wywolanie schodzi tyle, ile pozwoli sufit okien; reszta przy
      //    nastepnym odswiezeniu strony.
      if (next && next.from > floor) {
        const deeper = await scan(floor, next.from - 1n);
        if (deeper) {
          swaps = swaps.concat(deeper.trades);
          next = { from: deeper.scannedFrom, to: next.to };
        }
      }

      if (next) poolCoverage.current = next;
      if (swaps.length === 0) return;
      setState((prev) => ({ ...prev, trades: mergeTrades(prev.trades, swaps) }));
    } catch {
      // Publiczny RPC odbil - nastepny przebieg (reload / zywe zdarzenie) sprobuje znowu.
    }
  }, [readClient, tokenAddress, poolId, decimals, startedAt, state.trades, state.graduatedTs]);

  useEffect(() => {
    if (!state.loaded || state.loading) return;
    void backfillPool();
    // Celowo bez `backfillPool` w zaleznosciach: ma ruszac po kazdym
    // zakonczonym ladowaniu, a nie po kazdej zmianie listy transakcji
    // (ktora sam powoduje). Zmiana puli/tokena i tak przechodzi przez load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.loaded, state.loading, poolId]);

  /** Swapy puli na zywo (watchEvent na PoolManagerze) - bez ponownego skanu. */
  const applyPoolSwaps = useCallback(
    (logs: ScanLog[]) => {
      const now = Math.floor(Date.now() / 1000);
      const fresh: TradeEntry[] = [];
      for (const log of logs) {
        const trade = swapLogToTrade(log, decimals, now);
        if (trade) fresh.push(trade);
      }
      if (fresh.length === 0) return;
      // Zywe zdarzenie przesuwa GORNY koniec pokrycia; dolny zostaje, bo
      // backfill moze wciaz schodzic ku graduacji.
      const top = fresh.reduce((m, t) => (t.block > m ? t.block : m), 0n);
      const covered = poolCoverage.current;
      if (covered !== null && top > covered.to) poolCoverage.current = { from: covered.from, to: top };
      setState((prev) => {
        const seen = new Set(prev.trades.map((trade) => trade.id));
        const add = fresh.filter((trade) => !seen.has(trade.id));
        return add.length ? { ...prev, trades: mergeTrades(prev.trades, add) } : prev;
      });
    },
    [decimals]
  );

  return { ...state, reload: load, applyLive, applyPoolSwaps };
}

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { type Address } from 'viem';
import { usePublicClient } from 'wagmi';
import {
  ACTIVE_LAUNCHPAD_NETWORK,
  LAUNCHPAD_ADDRESS,
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
} from './historyScan';

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

export function useTokenHistory(tokenAddress: Address | null, startedAt: number | null) {
  const readClient = usePublicClient({ chainId: LAUNCHPAD_CHAIN.id });
  const [state, setState] = useState<TokenHistory>(EMPTY);

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
      launchpad: LAUNCHPAD_ADDRESS,
      token,
      head: anchorBlock,
      floor,
      window: LOG_WINDOW,
      maxWindows: MAX_LOG_WINDOWS,
      estTs,
    });

    return { result, anchorBlock };
  }, [readClient]);

  const load = useCallback(async () => {
    if (!tokenAddress || startedAt === null) return;
    setState((prev) => ({ ...prev, loading: true, error: null }));

    // Roznice wolno prosic TYLKO wtedy, gdy migawka trzyma komplet historii -
    // przyciety ogon plus sama roznica dalby wykres z dziura na poczatku.
    const since = coverage.current?.full ? coverage.current.highBlock : null;

    try {
      const query = new URLSearchParams({
        chainId: String(LAUNCHPAD_CHAIN.id),
        token: tokenAddress,
        startedAt: String(startedAt),
      });
      if (since) query.set('sinceBlock', since);

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
      // Osiem sekund to sufit sensownego cache'u: skan lancucha trwa okolo
      // dwoch, wiec czekanie dluzej przestaje byc przyspieszeniem.
      const response = await fetch(`/api/launchpad/history?${query.toString()}`, {
        signal: AbortSignal.timeout(8000),
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
        for (const trade of live) applyTradeToBalances(balances, trade, LAUNCHPAD_ADDRESS.toLowerCase());

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
        for (const trade of live) applyTradeToBalances(result.balances, trade, LAUNCHPAD_ADDRESS.toLowerCase());
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
  }, [scanFromChain, startedAt, tokenAddress]);

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
      const curve = LAUNCHPAD_ADDRESS.toLowerCase();

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
  }, []);

  return { ...state, reload: load, applyLive };
}

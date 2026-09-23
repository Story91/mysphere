'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatEther, type Address } from 'viem';
import { usePublicClient } from 'wagmi';
import { launchpadAbi, liquidityVaultAbi, liveWatchForChain } from './config';
import { tapeAmount } from './[address]/detailShared';
import { POOL_SWAP_EVENT } from './[address]/poolSwaps';
import { useEthUsd } from './useEthUsd';
import { fetchLogos, recallLogos } from './logos';
import { loadSnapshot, loadTickerTape, saveTickerTape } from './snapshot';
import { SPHERE_POOL_ID, SPHERE_TOKEN_ADDRESS } from './sphere/sphereConfig';
import {
  mergeTickerItems,
  pickPoolId,
  poolSwapsPath,
  recentTickerItems,
  retryDelayMs,
  sanitizeTickerItems,
  swapItemId,
  swapRowsToTickerItems,
  tickerAge,
  tickerHref,
  tickerStatus,
  TICKER_CHAIN_ID,
  TICKER_MAX_ITEMS,
  TICKER_NETWORK,
  TICKER_WINDOW_SECONDS,
  type TickerItem,
} from './tickerSource';

/**
 * PASEK ZDARZEN STARTPADA - do wstawienia poza tablica (basechat).
 *
 * Zastapil widget cenowy CoinGecko. Tamten pokazywal kursy bitcoina i solany,
 * czyli rzeczy, na ktore nie mamy wplywu i o ktorych nie mamy nic do
 * powiedzenia. Tutaj leci to, co dzieje sie NA NASZYM launchpadzie: starty,
 * kupna, sprzedaze, graduacje - z linkiem prosto do tokena.
 *
 * ZAWSZE BASE. Do 23.09.2026 pasek szedl za siecia wybrana na tablicy
 * (localStorage), wiec u kogos z zapisanym Arc pytal vault Arc o SPHERE, dostawal
 * zerowy poolId i wisial na "Watching..." bez konca. Siec, adresy, tempo
 * podgladu i kurs ETH sa teraz przypiete do Base (tickerSource.ts).
 *
 * Zrodla, w tej kolejnosci:
 *   1. wlasna migawka paska z localStorage - kazdy wiersz z czasem zdarzenia,
 *      wiec to, co widac od pierwszej klatki, ma prawdziwy wiek;
 *   2. swapy puli SPHERE z ostatniej doby przez `/api/launchpad/pool-swaps`,
 *      ponawiane z odstepem przy bledzie i odswiezane co minute - takze wtedy,
 *      gdy subskrypcja w przegladarce po cichu przestanie dzialac;
 *   3. subskrypcja na zywo: zdarzenia launchpada I swapy w puli.
 *
 * Punkt trzeci ma osobny watcher na PoolManagerze, bo launchpad milknie przy
 * graduacji - bez tego token, ktoremu sie udalo, znikalby z paska na zawsze.
 *
 * Stany sa uczciwe (tickerStatus): "ladowanie" tylko do pierwszej odpowiedzi,
 * pusta doba mowi, ze jest pusta i kiedy byla ostatnia transakcja, a brak
 * danych mowi "niedostepne". Kazdy wiersz niesie swoj wiek.
 */

const LIVE = liveWatchForChain(TICKER_CHAIN_ID);
const NATIVE_SYMBOL = TICKER_NETWORK.chain.nativeCurrency.symbol;
const SPHERE_SYMBOL = 'SPHERE';

/**
 * Ile trwa jedno okrazenie tasmy. Wspolna klasa `.soft-marquee` ma 32 s, co
 * przy kursach bylo w porzadku, ale tutaj wiersze niosa kwote i symbol - trzeba
 * zdazyc je przeczytac, zanim znikna. 90 s czyta sie spokojnie i nie odciaga
 * uwagi od tresci strony.
 */
const LAP_SECONDS = 90;

/** Czekanie na odpowiedz serwera. Zmierzone ~3 s, wiec 12 s to spory zapas. */
const SEED_TIMEOUT_MS = 12_000;
/** Dluzej niz tyle "ladowanie" byloby juz nieprawda - pokazujemy, ze nie wiemy. */
const LOADING_LIMIT_MS = 15_000;
/** Odswiezenie z serwera. Adres jest wspolny, wiec to trafia w cache brzegowy (10 s). */
const REFRESH_MS = 60_000;
/** Gdy subskrypcja zglasza bledy, serwer jest jedynym zrodlem - pytamy go czesciej. */
const FAST_REFRESH_MS = 20_000;
/** Blad subskrypcji "swiezy" przez tyle - viem zglasza go przy kazdym nieudanym pollu. */
const WATCH_ERROR_GRACE_MS = 90_000;
/** Co ile przeliczamy wieki wierszy i okno doby. Wiek ma rozdzielczosc minut. */
const CLOCK_MS = 30_000;
/** Proby kontrolnego odczytu poolId z vaulta. Stala i tak dziala od startu. */
const POOL_CHECK_ATTEMPTS = 4;

function shortAddress(value: string) {
  return `${value.slice(0, 5)}…${value.slice(-3)}`;
}

const TONE_CLASS: Record<TickerItem['tone'], string> = {
  buy: 'text-emerald-600',
  sell: 'text-rose-600',
  launch: 'text-violet-600',
  graduate: 'text-emerald-700',
};

export default function StartpadTicker() {
  const readClient = usePublicClient({ chainId: TICKER_CHAIN_ID });
  // Kurs ETH/USD z tego samego zrodla, co tablica - pasek ma pokazywac
  // dolary, a nie ulamki ETH, ktore nikomu nic nie mowia. `nativeIsUsd: false`
  // wprost, bo pasek jest na Base: domyslna wartosc idzie za siecia tablicy
  // i przy zapisanym Arc dawala kurs 1. Gdy kursu jeszcze nie ma,
  // `tapeAmount` sam wraca do jednostki natywnej.
  const { usd: ethUsd } = useEthUsd({ nativeIsUsd: false });
  const [items, setItems] = useState<TickerItem[]>([]);
  const [poolId, setPoolId] = useState<`0x${string}` | null>(() => pickPoolId(SPHERE_POOL_ID, null));
  const [poolCheckFailed, setPoolCheckFailed] = useState(false);
  const [synced, setSynced] = useState(false);
  const [syncFailing, setSyncFailing] = useState(false);
  const [loadingExpired, setLoadingExpired] = useState(false);
  const [watchErrorAt, setWatchErrorAt] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const syncedRef = useRef(false);
  const watchErrorAtRef = useRef<number | null>(null);
  const olderLookupDone = useRef(false);
  // Logo tokenow z tego samego zrodla, co tablica (Vercel Blob przez
  // /api/startpad/logos). Najpierw pamiec podreczna, zeby awatary byly od
  // pierwszej klatki, potem swieza mapa.
  const [logos, setLogos] = useState<Record<string, string>>(() => recallLogos(TICKER_CHAIN_ID));

  useEffect(() => {
    let cancelled = false;
    void fetchLogos(TICKER_CHAIN_ID)
      .then((map) => {
        if (!cancelled && Object.keys(map).length) setLogos((current) => ({ ...current, ...map }));
      })
      .catch(() => {
        // Brak logo nie jest bledem - zostaje kolorowa kropka z inicjalem.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Adres -> symbol z migawki tablicy Base; bez niej zostaje skrocony adres. */
  const symbols = useMemo(() => {
    const map = new Map<string, string>();
    const rows = loadSnapshot<{ address?: string; symbol?: string }>(TICKER_CHAIN_ID);
    for (const row of rows ?? []) {
      if (row?.address && row?.symbol) map.set(row.address.toLowerCase(), row.symbol);
    }
    if (SPHERE_TOKEN_ADDRESS) map.set(SPHERE_TOKEN_ADDRESS.toLowerCase(), SPHERE_SYMBOL);
    return map;
  }, []);

  const nameOf = (token: string) => symbols.get(token.toLowerCase()) ?? shortAddress(token);

  const push = (fresh: TickerItem[]) => {
    if (fresh.length === 0) return;
    setItems((current) => mergeTickerItems(current, fresh));
  };

  // Zegar wiekow i okna doby. Wiersz, ktory wypadl z doby, schodzi z paska.
  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), CLOCK_MS);
    return () => window.clearInterval(timer);
  }, []);

  // "Ladowanie" ma koniec. Bez tego limitu brak klienta albo poolId
  // zostawilby pasek w stanie oczekiwania do przeladowania strony.
  useEffect(() => {
    const timer = window.setTimeout(() => setLoadingExpired(true), LOADING_LIMIT_MS);
    return () => window.clearTimeout(timer);
  }, []);

  // 1. Wlasna migawka paska - kazdy wiersz z czasem, wiec od razu z wiekiem.
  //    Tasmy tablicy (`startpad.feed.*`) celowo NIE czytamy: jej wiersze nie
  //    maja czasu zdarzenia i pokazywaly transakcje sprzed doby jak biezace.
  useEffect(() => {
    const restored = sanitizeTickerItems(loadTickerTape(TICKER_CHAIN_ID), Math.floor(Date.now() / 1000));
    if (restored.length) setItems((current) => mergeTickerItems(current, restored));
  }, []);

  useEffect(() => {
    if (items.length === 0) return;
    saveTickerTape(TICKER_CHAIN_ID, recentTickerItems(items, Math.floor(Date.now() / 1000)));
  }, [items]);

  // 2. Kontrola poolId z vaulta Base. Pasek NIE czeka na nia - startuje ze
  //    znana stala. Odczyt jest ponawiany, a jego porazka nie wylacza niczego;
  //    dawniej jedno nieudane `positionOf` gasilo zasiew i subskrypcje puli.
  useEffect(() => {
    if (!readClient || !SPHERE_TOKEN_ADDRESS) {
      if (!pickPoolId(SPHERE_POOL_ID, null)) setPoolCheckFailed(true);
      return;
    }
    let cancelled = false;
    let timer: number | undefined;
    const check = async (attempt: number) => {
      try {
        const position = (await readClient.readContract({
          address: TICKER_NETWORK.vault,
          abi: liquidityVaultAbi,
          functionName: 'positionOf',
          args: [SPHERE_TOKEN_ADDRESS as Address],
        })) as readonly [`0x${string}`, bigint, number, number];
        if (cancelled) return;
        const chosen = pickPoolId(SPHERE_POOL_ID, position[0]);
        if (chosen && chosen.toLowerCase() !== SPHERE_POOL_ID.toLowerCase()) {
          // Stala w sphereConfig.ts sie zestarzala - lancuch wygrywa, ale ktos
          // powinien ja poprawic.
          console.warn('[StartpadTicker] SPHERE poolId from the vault differs from SPHERE_POOL_ID', chosen);
        }
        setPoolId(chosen);
        if (!chosen) setPoolCheckFailed(true);
      } catch {
        if (cancelled) return;
        if (attempt + 1 < POOL_CHECK_ATTEMPTS) {
          timer = window.setTimeout(() => void check(attempt + 1), retryDelayMs(attempt));
        } else if (!pickPoolId(SPHERE_POOL_ID, null)) {
          setPoolCheckFailed(true);
        }
      }
    };
    void check(0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [readClient]);

  // 3. Zasiew i odswiezanie z serwera. Flaga "zsynchronizowane" idzie w gore
  //    dopiero PO udanej odpowiedzi (dawniej przed zapytaniem, wiec jeden
  //    timeout konczyl sprawe), bledy ponawiamy z rosnacym odstepem.
  useEffect(() => {
    if (!poolId || !SPHERE_TOKEN_ADDRESS) return;
    const token = { address: SPHERE_TOKEN_ADDRESS as string, symbol: SPHERE_SYMBOL };
    let cancelled = false;
    let timer: number | undefined;
    let attempt = 0;

    const read = async (sinceSeconds?: number) => {
      const response = await fetch(poolSwapsPath(poolId, sinceSeconds), {
        signal: AbortSignal.timeout(SEED_TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`pool-swaps answered ${response.status}`);
      const data = (await response.json()) as { swaps?: unknown; complete?: unknown };
      if (!Array.isArray(data.swaps)) throw new Error('pool-swaps sent no rows');
      return {
        // Wiersze ida chronologicznie - najnowsze sa na koncu.
        rows: swapRowsToTickerItems(data.swaps.slice(-TICKER_MAX_ITEMS), token),
        complete: data.complete === true,
      };
    };

    const schedule = (ms: number) => {
      if (!cancelled) timer = window.setTimeout(() => void run(), ms);
    };

    const watchFailingNow = () =>
      watchErrorAtRef.current !== null && Date.now() - watchErrorAtRef.current < WATCH_ERROR_GRACE_MS;

    const run = async () => {
      if (cancelled) return;
      // Ukryta karta nie potrzebuje odswiezen - ale pierwszy odczyt idzie zawsze.
      if (syncedRef.current && document.hidden) {
        schedule(REFRESH_MS);
        return;
      }
      try {
        const recent = await read(TICKER_WINDOW_SECONDS);
        if (cancelled) return;
        // Pusty wynik z urwanego skanu to "nie wiem", a nie "nic sie nie dzialo".
        if (recent.rows.length === 0 && !recent.complete) throw new Error('pool-swaps scan was cut short');
        push(recent.rows);
        syncedRef.current = true;
        setSynced(true);
        setSyncFailing(false);
        attempt = 0;
        // Pusta doba: jedno dodatkowe zapytanie bez okna (serwer schodzi do ~3
        // dob), zeby pasek mogl powiedziec, kiedy byla OSTATNIA transakcja.
        if (recent.rows.length === 0 && !olderLookupDone.current) {
          olderLookupDone.current = true;
          try {
            const older = await read();
            if (!cancelled) push(older.rows.slice(0, 1));
          } catch {
            // To tylko dopisek - bez niego pasek mowi samo "brak transakcji w dobie".
          }
        }
        schedule(watchFailingNow() ? FAST_REFRESH_MS : REFRESH_MS);
      } catch {
        if (cancelled) return;
        setSyncFailing(true);
        schedule(retryDelayMs(attempt));
        attempt += 1;
      }
    };

    void run();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poolId]);

  // Blad subskrypcji zapisujemy, zamiast go polykac (`onError: () => {}`
  // robilo z martwej subskrypcji cos nie do odroznienia od ciszy na rynku).
  // Pierwsze logi po bledzie znacza, ze subskrypcja znow dziala.
  const noteWatchError = useCallback(() => {
    const now = Date.now();
    // viem zglasza blad przy kazdym nieudanym pollu - stan wystarczy
    // odswiezyc raz na kilka sekund.
    if (watchErrorAtRef.current !== null && now - watchErrorAtRef.current < 5_000) return;
    watchErrorAtRef.current = now;
    setWatchErrorAt(now);
  }, []);

  const noteWatchAlive = useCallback(() => {
    if (watchErrorAtRef.current === null) return;
    watchErrorAtRef.current = null;
    setWatchErrorAt(null);
  }, []);

  // 4a. Na zywo: zdarzenia launchpada Base (krzywa).
  useEffect(() => {
    if (!readClient) return;
    const unwatch = readClient.watchContractEvent({
      address: TICKER_NETWORK.launchpad,
      abi: launchpadAbi,
      poll: LIVE.poll,
      pollingInterval: LIVE.pollingInterval,
      onError: noteWatchError,
      onLogs: (logs) => {
        noteWatchAlive();
        // Subskrypcja oddaje tylko nowe bloki, wiec chwila odebrania jest
        // czasem zdarzenia z dokladnoscia do jednego pollu.
        const ts = Math.floor(Date.now() / 1000);
        const fresh: TickerItem[] = [];
        for (const log of logs) {
          const decoded = log as unknown as {
            eventName?: string;
            args?: Record<string, unknown>;
            transactionHash?: string;
            logIndex?: number;
            blockNumber?: bigint | null;
          };
          const token = decoded.args?.token as string | undefined;
          const event = decoded.eventName;
          if (!token || !event) continue;
          const id = `${decoded.transactionHash ?? ''}-${event}-${String(decoded.logIndex ?? 0)}`;
          const block = typeof decoded.blockNumber === 'bigint' ? decoded.blockNumber.toString() : undefined;
          if (event === 'Launched') {
            fresh.push({ id, address: token, symbol: (decoded.args?.symbol as string) ?? nameOf(token), label: 'Launched', tone: 'launch', ts, block });
          } else if (event === 'Graduated') {
            fresh.push({ id, address: token, symbol: nameOf(token), label: 'Graduated', tone: 'graduate', ts, block });
          } else if (event === 'Bought' || event === 'Sold') {
            const isBuy = event === 'Bought';
            const eth = (isBuy ? decoded.args?.ethNet : decoded.args?.ethOut) as bigint | undefined;
            fresh.push({
              id,
              address: token,
              symbol: nameOf(token),
              label: isBuy ? 'Buy' : 'Sell',
              eth: eth === undefined ? undefined : Number(formatEther(eth)),
              tone: isBuy ? 'buy' : 'sell',
              ts,
              block,
            });
          }
        }
        push(fresh);
      },
    });
    return () => unwatch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readClient]);

  // 4b. Na zywo: swapy w puli SPHERE (po graduacji krzywa juz milczy).
  useEffect(() => {
    if (!readClient || !poolId || !SPHERE_TOKEN_ADDRESS) return;
    const token = SPHERE_TOKEN_ADDRESS as string;
    const unwatch = readClient.watchEvent({
      address: TICKER_NETWORK.poolManager,
      event: POOL_SWAP_EVENT,
      args: { id: poolId },
      poll: LIVE.poll,
      pollingInterval: LIVE.pollingInterval,
      onError: noteWatchError,
      onLogs: (logs) => {
        noteWatchAlive();
        const ts = Math.floor(Date.now() / 1000);
        const fresh: TickerItem[] = [];
        for (const log of logs) {
          const entry = log as unknown as {
            args?: Record<string, unknown>;
            transactionHash?: string;
            logIndex?: number;
            blockNumber?: bigint | null;
          };
          const amount0 = entry.args?.amount0 as bigint | undefined;
          if (amount0 === undefined) continue;
          // amount0 < 0 = swapujacy zaplacil ETH, czyli KUPIL token.
          const isBuy = amount0 < 0n;
          fresh.push({
            id: swapItemId(entry.transactionHash, entry.logIndex ?? 0),
            address: token,
            symbol: nameOf(token),
            label: isBuy ? 'Pool buy' : 'Pool sell',
            eth: Number(formatEther(amount0 < 0n ? -amount0 : amount0)),
            tone: isBuy ? 'buy' : 'sell',
            ts,
            block: typeof entry.blockNumber === 'bigint' ? entry.blockNumber.toString() : undefined,
          });
        }
        push(fresh);
      },
    });
    return () => unwatch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readClient, poolId]);

  const nowSec = Math.floor(nowMs / 1000);
  const recent = useMemo(() => recentTickerItems(items, nowSec), [items, nowSec]);
  const status = tickerStatus({
    recentCount: recent.length,
    synced,
    syncFailing: syncFailing || (!poolId && poolCheckFailed),
    watchFailing: watchErrorAt !== null && nowMs - watchErrorAt < WATCH_ERROR_GRACE_MS,
    loadingExpired,
    last: items[0] ?? null,
  });

  if (status.kind !== 'live') {
    const last = status.kind === 'quiet' ? status.last : null;
    return (
      <div className="w-full overflow-hidden border-b border-soft-line bg-soft-surface py-1.5">
        <p
          role="status"
          aria-live="polite"
          className="flex min-w-0 items-center gap-2 whitespace-nowrap px-3 text-[11px] font-bold text-sp-shade/60"
        >
          <span className="shrink-0 uppercase tracking-[0.08em]">
            {status.kind === 'loading'
              ? 'Loading Startpad trades…'
              : status.kind === 'unavailable'
                ? 'Live trades unavailable right now'
                : 'No SPHERE trades in 24 h'}
          </span>
          {last && (
            // Ostatnia transakcja sprzed okna. Wiek stoi PIERWSZY: na waskim
            // ekranie obcina sie koniec wiersza, a bez wieku ta transakcja
            // wygladalaby na biezaca.
            <span className="min-w-0 truncate text-[11.5px] text-sp-shade/60">
              Last trade {tickerAge(last.ts, nowSec)}:{' '}
              <span className="font-extrabold text-sp-ink/70">{last.symbol}</span>{' '}
              <span className={TONE_CLASS[last.tone]}>{last.label}</span>
              {/* Kwota w ETH, nie w $: ta transakcja moze byc sprzed kilku dni,
                  a dzisiejszy kurs ETH/USD dalby dolary, ktorych wtedy nie bylo. */}
              {last.eth !== undefined ? ` ${tapeAmount(last.eth, null, NATIVE_SYMBOL)}` : ''}
            </span>
          )}
          {status.kind !== 'loading' && (
            <a href={tickerHref()} className="ml-auto shrink-0 uppercase tracking-[0.08em] text-sp-ink/60 hover:text-sp-ink">
              <span className="hidden sm:inline">Open </span>Startpad →
            </a>
          )}
        </p>
      </div>
    );
  }

  // Tasma jedzie w kolko, wiec tresc jest zdublowana - druga kopia wjezdza
  // dokladnie wtedy, gdy pierwsza schodzi z ekranu. Sama animacja siedzi
  // w globals.css jako `.soft-marquee`: przesuwa o -50%, wiec petla nie ma
  // szwu, i znika sama przy `prefers-reduced-motion`.
  //
  // Zwykle <a>, nie next/link: siec Startpada liczy sie RAZ, przy ladowaniu
  // config.ts, a ten modul jest juz zaladowany na /basechat. Miekkie przejscie
  // zignorowaloby ?c=8453 i uzytkownik z zapisanym Arc trafialby na token Base
  // podpiety pod Arc. Tak samo przeladowuje setLaunchpadChain.
  const lane = [...recent, ...recent];

  return (
    <div className="w-full overflow-hidden border-b border-soft-line bg-soft-surface py-1.5">
      <div
        className="soft-marquee flex w-max items-center gap-5 whitespace-nowrap px-3"
        style={{ animationDuration: `${LAP_SECONDS}s` }}
      >
        {lane.map((item, index) => (
          <a
            key={`${item.id}-${index}`}
            href={tickerHref(item.address)}
            className="flex items-center gap-1.5 text-[11.5px] font-bold text-sp-ink/70 hover:text-sp-ink"
          >
            {(() => {
              const url = item.address ? logos[item.address.toLowerCase()] : undefined;
              return url ? (
                // Zwykly <img>, nie next/image: to 16 px z Bloba, wiec optymalizator
                // nie ma czego zoptymalizowac, a wymagalby wpisania hosta w konfig.
                // Tak samo robi tablica.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={url} alt="" width={16} height={16} className="h-4 w-4 shrink-0 rounded-full object-cover" loading="lazy" />
              ) : (
                // Zastepnik zamiast pustego miejsca - pasek nie ma podskakiwac,
                // gdy token nie ma jeszcze wgranego logo.
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-sp-shade/15 text-[8px] font-extrabold text-sp-shade/60">
                  {item.symbol.slice(0, 1).toUpperCase()}
                </span>
              );
            })()}
            <span className="font-extrabold">{item.symbol}</span>
            <span className={TONE_CLASS[item.tone]}>{item.label}</span>
            {item.eth !== undefined && (
              <span className="text-sp-shade/60">{tapeAmount(item.eth, ethUsd, NATIVE_SYMBOL)}</span>
            )}
            <span className="font-semibold text-sp-shade/60">{tickerAge(item.ts, nowSec)}</span>
          </a>
        ))}
      </div>
    </div>
  );
}

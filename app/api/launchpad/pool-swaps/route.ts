import { NextResponse } from 'next/server';
import { createPublicClient, http } from 'viem';
import { LAUNCHPAD_NETWORKS } from '../../../startpad/config';
import { rpcCandidates } from '../historyRpc';
import { serializeTrades } from '../../../startpad/[address]/historyScan';
import { POOL_SWAP_EVENT, swapLogToTrade } from '../../../startpad/[address]/poolSwaps';
import type { TradeEntry } from '../../../startpad/[address]/detailShared';

/**
 * GET /api/launchpad/pool-swaps - transakcje z puli Uniswap v4 po graduacji.
 *
 * ===========================================================================
 * PO CO OSOBNA TRASA
 * ===========================================================================
 * Historia krzywej jezdzi przez `/api/launchpad/history` od 13.08.2026 wlasnie
 * dlatego, ze skan z przegladarki byl za wolny. Swapy puli dopisano 2.09.2026
 * i ten sam wniosek ich juz nie objal: `scanPoolSwaps` chodzil w kliencie,
 * oknami po 2 000 blokow, z publicznego RPC.
 *
 * Skutek widac bylo na $SPHERE 10.09.2026. Token zgraduowal osiem dni
 * wczesniej i mial 2 562 swapy w puli, a strona pokazywala 74 transakcje,
 * wszystkie z krzywej, wszystkie opisane "8d ago". Zakladka nazywala sie
 * "Trades" i nie zawierala ani jednej transakcji z ostatnich osmiu dni.
 * Powod byl prozaiczny: 90 kolejnych `getLogs` na najbardziej ruchliwym
 * kontrakcie sieci, z publicznego wezla, w przegladarce - to sie nie konczy
 * w czasie, w ktorym ktokolwiek patrzy na strone, a kazdy blad ladowal
 * w cichym `catch`.
 *
 * Ta trasa robi to samo, co serwerowa historia krzywej: skan idzie z wezla
 * CDP, od najnowszych blokow w dol, a odpowiedz stoi w cache'u brzegowym,
 * wiec kilkunastu ogladajacych ten sam token to jedno zapytanie do lancucha.
 *
 * ===========================================================================
 * CZEGO NIE ROBI
 * ===========================================================================
 * Nie ma wlasnego magazynu. Historia krzywej jest skonczona (krzywa zamyka sie
 * przy graduacji), wiec oplaca sie ja trzymac; pula zyje dalej, a jej ogon i
 * tak trzeba by odswiezac. Cache brzegowy wystarcza i nie wprowadza drugiego
 * miejsca, w ktorym dane moga sie rozjechac z lancuchem.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const POOL_ID_RE = /^0x[0-9a-fA-F]{64}$/;

/**
 * Okno skanu. Wezel CDP przyjmuje szersze zapytania niz publiczny, ale
 * PoolManager to najruchliwszy kontrakt Base i przy 10 000 blokow potrafi
 * oddac tyle logow, ze odpowiedz przekracza limit rozmiaru.
 */
const WINDOW = 5_000n;

/**
 * Sufit okien na JEDNO zadanie. 60 okien po 5 000 blokow to 300 tys. blokow
 * i ~17 s odpowiedzi - wiecej, niz klient czeka. 24 okna to ~120 tys. blokow,
 * czyli blisko trzy doby Base: caly swiezy ogon w jednym strzale, a starsze
 * dociaga drugie wywolanie backfillu.
 */
const MAX_WINDOWS = 24;

/** Ile okien leci naraz. Sekwencyjnie 60 okien to kilkanascie sekund. */
const BATCH = 8;

function bad(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;

  const chainId = Number(params.get('chainId'));
  const net = Number.isFinite(chainId) ? LAUNCHPAD_NETWORKS[chainId] : undefined;
  if (!net) return bad(`Chain ${params.get('chainId')} is not served here.`, 400);

  const poolId = (params.get('poolId') ?? '').trim();
  if (!POOL_ID_RE.test(poolId) || /^0x0+$/.test(poolId)) return bad('Bad poolId.', 400);

  const decimals = Number(params.get('decimals') ?? '18');
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) return bad('Bad decimals.', 400);

  // Podloga skanu: blok graduacji (klient go zna z historii krzywej). Bez niej
  // schodzilibysmy w nieskonczonosc po pustych blokach sprzed istnienia puli.
  const floorRaw = params.get('fromBlock');
  let floor: bigint;
  try {
    floor = floorRaw ? BigInt(floorRaw) : 0n;
  } catch {
    return bad('Bad fromBlock.', 400);
  }

  // Gorny koniec: domyslnie glowa lancucha. `toBlock` sluzy dociaganiu starszej
  // czesci historii przy kolejnych wywolaniach.
  const toRaw = params.get('toBlock');
  let requestedTo: bigint | null = null;
  try {
    requestedTo = toRaw ? BigInt(toRaw) : null;
  } catch {
    return bad('Bad toBlock.', 400);
  }

  const startedAt = Number(params.get('startedAt') ?? '0') || 0;

  // Pierwsze zapytanie sluzy tez za probe RPC: wezel, ktory nie odda glowy
  // lancucha, ustepuje nastepnemu z kolejki. Ten sam wzorzec, co w historii.
  let client: ReturnType<typeof createPublicClient> | null = null;
  let anchorBlock = 0n;
  let anchorTs = 0;
  for (const rpcUrl of rpcCandidates(chainId, process.env)) {
    const candidate = createPublicClient({ chain: net.chain, transport: http(rpcUrl) });
    try {
      const anchor = await candidate.getBlock({ blockTag: 'latest' });
      anchorBlock = anchor.number;
      anchorTs = Number(anchor.timestamp);
      client = candidate;
      break;
    } catch {
      continue;
    }
  }
  if (!client) return bad('Chain head is unreachable.', 502);

  // Czas z roznicy numerow blokow wzgledem jednej kotwicy - pobieranie
  // timestampu kazdego bloku zamienialoby skan w setki zadan.
  const estTs = (block: bigint) =>
    Math.max(startedAt, anchorTs - Number(anchorBlock - block) * net.secondsPerBlock);

  const top = requestedTo !== null && requestedTo < anchorBlock ? requestedTo : anchorBlock;
  if (floor > top) {
    return NextResponse.json(
      { chainId, poolId, highBlock: top.toString(), scannedFrom: (top + 1n).toString(), complete: true, count: 0, swaps: [] },
      { headers: { 'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=30' } }
    );
  }

  // Skan OD NAJNOWSZYCH: gdy sufit utnie robote, brakuje najstarszych, a nie
  // najswiezszych. Odwrotna kolejnosc dawala liste "ostatnich transakcji"
  // sprzed tygodnia.
  //
  // Okno zwezamy przy odmowie. Publiczny RPC Base odbija PoolManagera bledem
  // 413 juz przy 5 000 blokow, a trasa musi dzialac takze bez wlasnego wezla -
  // inaczej brak jednej zmiennej srodowiskowej kasuje cala zakladke.
  const trades: TradeEntry[] = [];
  let scannedFrom = top + 1n;
  let failed = false;
  let windowSize = WINDOW;
  let cursor = top;
  let used = 0;

  while (cursor >= floor && used < MAX_WINDOWS && !failed) {
    const batch: Array<{ from: bigint; to: bigint }> = [];
    let probe = cursor;
    for (let i = 0; i < BATCH && probe >= floor && used + batch.length < MAX_WINDOWS; i += 1) {
      const from = probe - windowSize + 1n > floor ? probe - windowSize + 1n : floor;
      batch.push({ from, to: probe });
      if (from === floor) {
        probe = floor - 1n;
        break;
      }
      probe = from - 1n;
    }
    if (batch.length === 0) break;

    try {
      const results = await Promise.all(
        batch.map((w) =>
          client!.getLogs({
            address: net.poolManager,
            event: POOL_SWAP_EVENT,
            args: { id: poolId as `0x${string}` },
            fromBlock: w.from,
            toBlock: w.to,
          })
        )
      );
      for (const logs of results) {
        for (const log of logs) {
          const trade = swapLogToTrade(log, decimals, estTs(log.blockNumber ?? 0n));
          if (trade) trades.push(trade);
        }
      }
      scannedFrom = batch[batch.length - 1].from;
      cursor = probe;
      used += batch.length;
    } catch {
      // Za szerokie okno dla tego wezla - zwezamy i probujemy od tego samego
      // miejsca. Ponizej 250 blokow uznajemy, ze to nie rozmiar jest problemem.
      if (windowSize > 250n) {
        windowSize /= 4n;
        continue;
      }
      failed = true;
    }
  }

  // Chronologicznie: reszta potoku (mergeTrades, swiece) zaklada rosnacy czas.
  trades.sort((a, b) => (a.block === b.block ? a.logIndex - b.logIndex : a.block < b.block ? -1 : 1));

  return NextResponse.json(
    {
      chainId,
      poolId,
      highBlock: top.toString(),
      scannedFrom: scannedFrom.toString(),
      complete: !failed && scannedFrom <= floor,
      count: trades.length,
      // To samo kodowanie, co historia krzywej - klient czyta jednym `parseTrades`.
      swaps: serializeTrades(trades),
    },
    {
      headers: {
        // Kilkunastu ogladajacych ten sam token to jedno zapytanie do lancucha.
        'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=30',
      },
    }
  );
}

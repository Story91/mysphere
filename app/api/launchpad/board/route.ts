import { NextResponse, type NextRequest } from 'next/server';
import { createPublicClient, getAbiItem, http, type Address } from 'viem';
import { LAUNCHPAD_NETWORKS, launchpadAbi } from '../../../startpad/config';
import { rpcCandidates } from '../historyRpc';
import { isTokenIndexAvailable, readTokenIndex, writeTokenIndex } from '../tokenIndexStore';
import type { IndexedToken } from '../tokenIndexShape';

/**
 * GET /api/launchpad/board?chainId=8453 - LISTA STARTOW danej sieci.
 *
 * ===========================================================================
 * PO CO TO ISTNIEJE
 * ===========================================================================
 * Zgloszenie z 13 sierpnia 2026: z tablicy znikal SAUSAGES, najstarszy i
 * najwiekszy token. Lista powstawala ze skanu zdarzen `Launched` robionego W
 * PRZEGLADARCE, oknami po 9500 blokow. Sonda pokazala, ze najstarszy start
 * lezy w NAJGLEBSZYM oknie, wiec cokolwiek utnie skan - limit publicznego RPC,
 * padniete okno, sufit okien - zabiera najpierw wlasnie jego. Brak tokena na
 * liscie wyglada dla kogos, kto ma w nim pieniadze, jak ich utrata.
 *
 * Tak tego nie robi zaden launchpad, ktory z tego zyje: pump.fun serwuje liste
 * z wlasnego API, Flaunch z subgrafu, a lancuch dowozi im wylacznie NOWOSCI.
 * Ta trasa jest naszym odpowiednikiem: skanuje raz, po stronie serwera, naszym
 * RPC, i zapisuje wynik. Kolejne wejscia dostaja komplet jednym zapytaniem.
 *
 * ===========================================================================
 * CZEGO TA TRASA NIE ROBI
 * ===========================================================================
 * Nie oddaje stanu na zywo. Cena, rezerwa, liczba holderow i postep krzywej
 * ida dalej z lancucha - odczytami tablicy i zdarzeniami `watchContractEvent`.
 * Tu jest wylacznie TOZSAMOSC: adres, nazwa, symbol, tworca i blok startu.
 * Te dane sa niezmienne, wiec baza nie ma jak sklamac o czyms, co sie zmienia.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LAUNCHED_EVENT = getAbiItem({ abi: launchpadAbi, name: 'Launched' });

/**
 * Sufit okien na jedno zadanie. Zapelnienie pustego indeksu moze potrzebowac
 * wiecej - wtedy `lastBlock` zapisuje postep, a reszte dociagnie kolejne
 * wejscie. Ta sama zasada, co przy historii tokena.
 */
const MAX_WINDOWS = 40;

/** Ile okien naraz. Czekanie robia kolejne rundy, nie liczba zapytan w rundzie. */
const CONCURRENCY = 6;

/** Po tylu milisekundach od ostatniego zapisu warto zajrzec po nowe starty. */
const FRESH_FOR_MS = 30_000;

export async function GET(request: NextRequest) {
  const asked = Number(request.nextUrl.searchParams.get('chainId'));
  const net = Number.isFinite(asked) ? LAUNCHPAD_NETWORKS[asked] : undefined;
  if (!net) {
    return NextResponse.json(
      { ok: false, error: 'Unknown chain.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }
  const chainId = asked;

  const stored = await readTokenIndex(chainId);
  const fresh = stored !== null && Date.now() - stored.updatedAt < FRESH_FOR_MS;
  if (fresh) {
    return NextResponse.json(
      { ok: true, chainId, tokens: stored.tokens, lastBlock: stored.lastBlock.toString(), scanned: false },
      { headers: { 'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=120' } }
    );
  }

  const [preferred] = rpcCandidates(chainId, process.env);
  const client = createPublicClient({ chain: net.chain, transport: http(preferred) });

  let head: bigint;
  try {
    head = await client.getBlockNumber();
  } catch {
    // Bez glowy lancucha nie ma jak skanowac - oddajemy to, co w bazie.
    return NextResponse.json(
      { ok: stored !== null, chainId, tokens: stored?.tokens ?? [], lastBlock: (stored?.lastBlock ?? 0n).toString(), scanned: false },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }

  // Od ostatniego zapisanego bloku w gore; przy pustym indeksie od wdrozenia.
  const floor = stored && stored.lastBlock > 0n ? stored.lastBlock + 1n : net.deployBlock;

  const windows: Array<{ from: bigint; to: bigint }> = [];
  let cursor = head;
  for (let index = 0; index < MAX_WINDOWS && cursor >= floor; index += 1) {
    const from = cursor >= floor + net.scanWindow ? cursor - net.scanWindow + 1n : floor;
    windows.push({ from, to: cursor });
    if (from === floor) break;
    cursor = from - 1n;
  }

  const scanned: IndexedToken[] = [];
  let covered = head + 1n;
  let complete = true;

  outer: for (let start = 0; start < windows.length; start += CONCURRENCY) {
    const batch = windows.slice(start, start + CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (window) => {
        const once = () =>
          client.getLogs({
            address: net.launchpad as Address,
            event: LAUNCHED_EVENT,
            fromBlock: window.from,
            toBlock: window.to,
          });
        try {
          return await once();
        } catch {
          try {
            return await once();
          } catch {
            return null;
          }
        }
      })
    );

    // Bierzemy tylko nieprzerwany poczatek partii - okno, ktore padlo, urywa
    // pokrycie, a `lastBlock` musi opisywac zakres BEZ DZIURY.
    for (let index = 0; index < batch.length; index += 1) {
      const logs = results[index];
      if (!logs) {
        complete = false;
        break outer;
      }
      for (const log of logs) {
        const args = log.args as Record<string, unknown>;
        const address = args.token as string | undefined;
        if (!address) continue;
        scanned.push({
          address: address.toLowerCase(),
          name: typeof args.name === 'string' ? args.name : '',
          symbol: typeof args.symbol === 'string' ? args.symbol : '',
          creator: typeof args.creator === 'string' ? (args.creator as string).toLowerCase() : '',
          launchBlock: (log.blockNumber ?? 0n).toString(),
          startedAt: Number(args.startedAt ?? 0),
        });
      }
      covered = batch[index].from;
    }
  }

  // `lastBlock` przesuwamy do GLOWY tylko wtedy, gdy skan objal caly zakres.
  // Inaczej zapisalibysmy pokrycie, ktorego nie ma, i brakujace starty nie
  // zostalyby juz nigdy odszukane.
  const lastBlock = complete && covered <= floor ? head : (stored?.lastBlock ?? 0n);

  const available = await isTokenIndexAvailable();
  const tokens = available
    ? await writeTokenIndex({ chainId, scanned, lastBlock })
    : // Bez bazy oddajemy sam wynik skanu - gorzej niz z baza, ale nadal
      // lepiej niz nic, i klient ma wtedy swoj skan awaryjny.
      scanned;

  return NextResponse.json(
    { ok: true, chainId, tokens, lastBlock: lastBlock.toString(), scanned: true, complete },
    { headers: { 'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=120' } }
  );
}

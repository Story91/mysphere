import { NextResponse, type NextRequest } from 'next/server';
import { createPublicClient, http, type Address } from 'viem';
import { deploymentsOf, LAUNCHPAD_NETWORKS, launchpadsOf, networkForMarket, scanFloorOf, type LaunchpadNetwork } from '../../../startpad/config';
import {
  balanceCandidates,
  balancesArePoisoned,
  mergeTrades,
  scanBackward,
  serializeBalances,
  serializeTrades,
} from '../../../startpad/[address]/historyScan';
import { DEAD_ADDRESS, type TradeEntry } from '../../../startpad/[address]/detailShared';
import { MAX_BALANCE_ACCOUNTS, readHolderBalances } from '../holderBalances';
import { planScan } from '../historyLayout';
import { rpcCandidates } from '../historyRpc';
import {
  claimScanLock,
  FRESH_FOR_MS,
  isHistoryStoreAvailable,
  readHistory,
  releaseScanLock,
  writeHistory,
  type HistoryMeta,
} from '../historyStore';

/**
 * GET /api/launchpad/history - historia tokena launchpada z cache'u.
 *
 * ===========================================================================
 * PO CO TO ISTNIEJE
 * ===========================================================================
 * Do 2026-08-13 strona tokena odtwarzala CALA historie przy kazdym wejsciu:
 * `useTokenHistory` schodzil z przegladarki oknami po 1900 blokow az do bloku
 * startu tokena, dwa `getLogs` na okno, jedno okno po drugim. Na Base to okolo
 * godziny lancucha na okno - token zyjacy trzy dni znaczyl ~70 kolejek zanim
 * pokazal sie wykres. Na tokenie z ruchem (Sausages) strona sie przez to
 * zacinala, i to tym mocniej, im dluzej token zyl.
 *
 * Ta trasa robi ten skan RAZ, po stronie serwera, i zapisuje wynik. Kolejne
 * wejscia - czyje kolwiek - dostaja gotowe dane i dociagaja WYLACZNIE bloki,
 * ktorych w cache jeszcze nie ma.
 *
 * ===========================================================================
 * CZEGO TA TRASA NIE ROBI
 * ===========================================================================
 * Nie jest zrodlem prawdy o pieniadzach. Cena, rezerwy i saldo portfela ida do
 * panelu handlu prosto z lancucha (`useTokenCore`, `TradePanel`) i ta trasa
 * ich nie dotyka. Tu powstaje wykres, lista transakcji i tabela holderow -
 * rzeczy, ktore maja byc SZYBKIE, a ich zrodlem i tak sa publiczne logi.
 *
 * Trasa jest tylko do odczytu i nie przyjmuje zadnych danych do zapisu: pisze
 * wylacznie to, co sama zeskanowala z lancucha.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Trasa eksportuje sam GET, wiec `force-dynamic` nie wylacza Data Cache
// Nexta 14: zapytania JSON-RPC viem (POST bez `cache`) szly do "auto cache"
// na rok i swiezy proces potrafil oddac stara glowe lancucha. Pelny opis:
// app/api/launchpad/pool-swaps/route.ts. Cache brzegowy (s-maxage) zostaje.
export const fetchCache = 'force-no-store';

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/**
 * Sufit okien na JEDNO zadanie. Zadanie serwerowe ma limit czasu, a okna ida
 * sekwencyjnie - wiec zamiast ryzykowac timeout na tokenie z dluga historia,
 * ucinamy skan i zapisujemy postep. Kolejne wejscie schodzi glebiej, a wykres
 * dziala od pierwszego, bo najswiezsze transakcje sa skanowane najpierw.
 */
const MAX_WINDOWS_PER_REQUEST = 40;

/**
 * Ile okien serwer puszcza NARAZ.
 *
 * Zimny skan to kilka-kilkanascie okien, a jego czas robily dotad KOLEJNE
 * RUNDY, nie liczba zapytan w rundzie (zmierzone: usuniecie jednego z dwoch
 * rownoleglych `getLogs` w oknie oszczedza -15 ms, czyli nic). Szesc okien
 * naraz to najwyzej dwanascie zapytan w locie - miesci sie w budzecie CDP
 * (7500 BU na 5 s, czyli 75 wywolan `eth_getLogs`) i nie zblizy sie do niego
 * nawet przy kilku tokenach skanowanych rownoczesnie.
 *
 * Przegladarka zostaje na jednym oknie naraz: tam skan jest awaryjny i idzie
 * przez publiczny RPC, ktory przy serii odpowiada "over rate limit".
 */
/**
 * Wspolbieznosc skanu - DOMYSLNA. Sieci, ktore maja wlasne tempo (Arc), podaja
 * je w `LAUNCHPAD_NETWORKS[chainId].scanConcurrency` / `.scanPaceMs`; ta stala
 * jest tylko zapasem dla sieci bez wpisu. Powod jest zmierzony, nie teoretyczny:
 * skan robi DWA `getLogs` na okno, wiec 6 okien to 12 zapytan w locie, a
 * `rpc.mainnet.arc.io` przy 12 w locie oddaje 9-10 bledow "rate limit exceeded".
 */
const SCAN_CONCURRENCY = 6;

/**
 * Zapas pod estymowany blok startu tokena, w SEKUNDACH przeliczonych na bloki -
 * pol godziny w kazdej sieci. Ta sama wartosc, co w `useTokenHistory`: blok
 * startu liczymy z `startedAt`, a ta estymacja ma prawo sie mylic.
 */
const launchMargin = (net: LaunchpadNetwork) => BigInt(Math.ceil(1800 / net.secondsPerBlock));

function bad(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
}

/** Skan dosiegnal startu tokena, gdy zobaczyl Launched albo zszedl do dna. */
const reachedStart = (launchBlock: bigint | null, scannedFrom: bigint, floor: bigint) =>
  launchBlock !== null || scannedFrom <= floor;

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  const chainId = Number(params.get('chainId'));
  const baseNet = Number.isFinite(chainId) ? LAUNCHPAD_NETWORKS[chainId] : undefined;
  // `m` = rynek Q: skan po launchpadach rynku (adres tokena jest i tak unikalny).
  const net = baseNet ? networkForMarket(baseNet, params.get('m')) : undefined;
  if (!net) return bad(`Chain ${params.get('chainId')} is not served here.`, 400);

  const token = (params.get('token') ?? '').trim();
  if (!ADDRESS_RE.test(token)) return bad('Bad token address.', 400);

  const sinceRaw = params.get('sinceBlock');
  const sinceBlock = sinceRaw && /^\d+$/.test(sinceRaw) ? BigInt(sinceRaw) : null;
  const startedRaw = params.get('startedAt');
  const startedAt = startedRaw && /^\d+$/.test(startedRaw) ? Number(startedRaw) : null;

  // Wlasny RPC (CDP), a za nim publiczny jako zapas - patrz `historyRpc`.
  // Publiczny `mainnet.base.org` odmawia przy szybkiej serii `getLogs` ("over
  // rate limit"), a wlasnie seria `getLogs` jest cala trescia tej trasy. Ale
  // zepsuta zmienna srodowiskowa (widziany na zywo Alchemy z `401 Must be
  // authenticated!`) nie moze kasowac calej funkcji - dlatego pierwsze zapytanie
  // sluzy tez za PROBE: klient, ktory nie odda glowy lancucha, nie dostaje
  // skanu, tylko ustepuje nastepnemu z kolejki.
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

  // Czas loga liczymy z ROZNICY numerow blokow wzgledem jednej kotwicy -
  // pobieranie timestampu kazdego bloku zamienialoby skan w setki zadan.
  const estTs = (block: bigint) =>
    Math.max(startedAt ?? 0, anchorTs - Number(anchorBlock - block) * net.secondsPerBlock);

  // Dno skanu: estymowany blok startu tokena minus zapas, nigdy ponizej bloku
  // wdrozenia launchpada - starszych logow tego launchpada z definicji nie ma.
  let launchFloor = scanFloorOf(net);
  if (startedAt !== null) {
    const ageBlocks = BigInt(Math.max(0, Math.floor((anchorTs - startedAt) / net.secondsPerBlock)));
    const estimated = anchorBlock > ageBlocks ? anchorBlock - ageBlocks : 0n;
    const withMargin = estimated > launchMargin(net) ? estimated - launchMargin(net) : 0n;
    if (withMargin > launchFloor) launchFloor = withMargin;
  }

  const cached = await readHistory(chainId, token);
  const meta: HistoryMeta | null = cached?.meta ?? null;

  let trades: TradeEntry[] = cached?.trades ?? [];
  // `let`, bo po skanie podmienia to odczyt `balanceOf` - patrz nizej.
  let balances = cached?.balances ?? new Map<string, bigint>();
  let graduatedTs = meta?.graduatedTs ?? null;
  let launchBlock = meta?.launchBlock ?? null;
  let highBlock = meta?.highBlock ?? 0n;
  let lowBlock = meta?.lowBlock ?? 0n;
  let complete = meta?.complete ?? false;

  const maxSpan = net.scanWindow * BigInt(MAX_WINDOWS_PER_REQUEST);
  // Prog swiezosci obowiazuje TYLKO cache, ktory siega juz startu tokena.
  // Dopoki historia jest niepelna, kazde wejscie ma prawo pchnac ogon dalej -
  // inaczej token, ktorego skan ucina limit RPC, nadrabialby brakujace okna w
  // tempie jednego zestawu na kilkanascie sekund.
  const fresh = meta !== null && meta.complete && Date.now() - meta.updatedAt < FRESH_FOR_MS;
  const ranges = fresh ? [] : planScan(meta, { head: anchorBlock, launchFloor, maxSpan });

  // Blokada oszczedza powtorzonej roboty, ale NIE MOZE byc warunkiem
  // pokazania czegokolwiek. Bez skonfigurowanej bazy nie ma czym blokowac, a
  // gdy token nie ma jeszcze cache'u, odpowiedz "ktos inny wlasnie skanuje"
  // byla by pustym wykresem. W obu przypadkach skanujemy i tak - tracimy
  // tylko zapis, nie widok.
  const storeReady = ranges.length > 0 && (await isHistoryStoreAvailable());
  const locked = storeReady ? await claimScanLock(chainId, token) : false;
  const mayScan = ranges.length > 0 && (locked || meta === null);

  let scanned = false;
  let scanFailed = false;
  if (mayScan) {
    scanned = true;
    try {
      for (const range of ranges) {
        const windows = Number((range.head - range.floor) / net.scanWindow) + 2;
        const result = await scanBackward(client, {
          // Wszystkie wdrozenia sieci - zdarzenia tokena emituje tylko jego launchpad.
          launchpad: launchpadsOf(net),
          token,
          head: range.head,
          floor: range.floor,
          window: net.scanWindow,
          maxWindows: Math.min(windows, MAX_WINDOWS_PER_REQUEST),
          estTs,
          /*
           * Tempo bierze sie z SIECI, nie ze stalej. Arc znosi mniej wiecej
           * jedno `getLogs` na 1,2 s: przy 12 zapytaniach w locie (6 okien
           * razy dwa) oddaje 9-10 bledow "rate limit exceeded" - i wtedy KAZDE
           * okno pada, `scannedFrom` zostaje nad glowa, a odpowiedz wychodzi
           * jako `tradeCount: 0, complete: true`. Czyli cisza podana jako komplet.
           */
          concurrency: net.scanConcurrency ?? SCAN_CONCURRENCY,
          paceMs: net.scanPaceMs ?? 0,
        });

        trades = mergeTrades(trades, result.trades);
        for (const [holder, delta] of result.balances) {
          balances.set(holder, (balances.get(holder) ?? 0n) + delta);
        }
        if (result.graduatedTs !== null) graduatedTs = result.graduatedTs;
        if (result.launchBlock !== null) launchBlock = result.launchBlock;

        // Okno moglo paść na limicie RPC, zanim cokolwiek przeszlo. Wtedy
        // `scannedFrom` stoi ponad glowa przedzialu i nie ma czego zapisywac -
        // pokrycie zostaje tam, gdzie bylo.
        const covered = result.scannedFrom <= range.head;

        if (meta === null) {
          // Pierwszy skan: zakres [scannedFrom, head] jest ciagly, nawet gdy
          // uciety od dolu - ogon dociagnie kolejne wejscie.
          if (covered) {
            highBlock = range.head;
            lowBlock = result.scannedFrom;
          }
        } else if (range.floor > meta.highBlock) {
          // Glowy NIE przesuwamy, gdy skan nie dobil do swojego dna - inaczej
          // w srodku historii zostalaby dziura, ktorej naglowek (jeden ciagly
          // zakres) nie umie opisac ani odrobic.
          if (result.complete) highBlock = range.head;
        } else if (covered) {
          lowBlock = result.scannedFrom;
        }
        if (reachedStart(result.launchBlock, result.scannedFrom, launchFloor)) complete = true;
      }
    } catch {
      // Skan padl w polowie - oddajemy to, co udalo sie zlozyc, i (nizej)
      // zwalniamy blokade, zeby nastepne wejscie mialo prawo sprobowac od razu.
      scanFailed = true;
    }
  }

  /**
   * SALDA HOLDEROW CZYTAMY Z LANCUCHA, A NIE SKLADAMY Z ROZNIC.
   *
   * Petla wyzej dokleila do mapy roznice z Transferow w zeskanowanym
   * przedziale i tak dzialalo to do 15 sierpnia 2026. Suma roznic jest jednak
   * tyle warta, co jej podstawa, a podstawa raz przepadla: 14 sierpnia
   * Firestore wyczerpal dzienny limit odczytow, `readHistory` oddal naglowek
   * bez kawalkow, trasa wziela te pustke za dobry punkt wyjscia i zapisala
   * mape zlozona z samych pozniejszych roznic. Na tokenie GLIFE zostala po tym
   * krzywa z saldem MINUS 6,5 mln tokenow i jeden holder przy czterech
   * kupujacych - stan, ktorego skan przyrostowy nie mial jak naprawic, bo zna
   * wylacznie nastepne roznice.
   *
   * `balanceOf` nie ma podstawy do stracenia. Skan logow zostaje przy tym, w
   * czym jest niezastapiony (KTO dotykal tokena), a ILE mowi juz lancuch - wiec
   * kazde odswiezenie naprawia to, co poprzednie zepsuly.
   *
   * Odczyt leci po skanie (sa juz wtedy znane nowe konta) i przy zatrutej
   * mapie takze bez skanu - inaczej strona czekalaby na cudze wejscie z
   * blokada. Gdy sie nie uda, zostaje mapa z roznic; zatrutej nie zapisujemy,
   * bo pusta tabela jest uczciwsza niz ujemne saldo.
   */
  if (scanned || balancesArePoisoned(balances, trades)) {
    const accounts = balanceCandidates(
      balances,
      trades,
      [...deploymentsOf(net).flatMap((d) => [d.launchpad, d.vault, d.hook]), net.poolManager, DEAD_ADDRESS],
      MAX_BALANCE_ACCOUNTS
    );
    // Adres tokena malymi literami: konta z `balanceCandidates` juz takie sa,
    // wiec caly odczyt idzie bez sumy kontrolnej i bez jej walidacji.
    const probed = await readHolderBalances(client, token.toLowerCase(), accounts);
    if (probed) balances = probed;
    else if (balancesArePoisoned(balances, trades)) balances = new Map();
  }

  // Pisze tylko ten, kto trzyma blokade - inaczej dwa rownolegle skany
  // nadpisywalyby sobie naglowek w niepewnej kolejnosci.
  if (locked) {
    if (scanFailed) await releaseScanLock(chainId, token);
    else {
      await writeHistory({
        chainId,
        token,
        previous: meta,
        trades,
        balances,
        highBlock,
        lowBlock,
        complete,
        launchBlock,
        graduatedTs,
      });
    }
  }

  const visible = sinceBlock === null ? trades : trades.filter((trade) => trade.block > sinceBlock);

  return NextResponse.json(
    {
      chainId,
      token: token.toLowerCase(),
      highBlock: highBlock.toString(),
      lowBlock: lowBlock.toString(),
      complete,
      launchBlock: launchBlock === null ? null : launchBlock.toString(),
      graduatedTs,
      tradeCount: trades.length,
      // Wiersze w tym samym kodowaniu, co zapis - klient czyta je `parseTrades`,
      // wiec nie istnieje drugi format do rozjechania sie z pierwszym.
      trades: serializeTrades(visible),
      balances: serializeBalances(balances),
      scanned,
    },
    {
      headers: {
        // Krotki cache brzegowy: przy kilkunastu ogladajacych ten sam token
        // odpowiada CDN, a nie kolejny odczyt Firestore.
        'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=30',
      },
    }
  );
}

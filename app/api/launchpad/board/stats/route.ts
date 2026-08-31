import { NextResponse, type NextRequest } from 'next/server';
import { createPublicClient, formatEther, getAbiItem, http, type Address } from 'viem';
import { hookAbi, LAUNCHPAD_NETWORKS, launchpadAbi } from '../../../../startpad/config';
import {
  emptyAggregate,
  mergeAggregates,
  parseAggregate,
  reduceBoardLogs,
  serializeAggregate,
  type BoardAggregate,
  type BoardLog,
} from '../../../../startpad/boardScan';
import { planBoardStatsScan } from '../../boardStatsLayout';
import {
  claimScanLock,
  FRESH_FOR_MS,
  isBoardStatsAvailable,
  readBoardStats,
  releaseScanLock,
  writeBoardStats,
} from '../../boardStatsStore';
import { rpcCandidates } from '../../historyRpc';

/**
 * GET /api/launchpad/board/stats?chainId=8453 - LICZBY TABLICY danej sieci.
 *
 * ===========================================================================
 * PO CO TO ISTNIEJE
 * ===========================================================================
 * `/api/launchpad/board` obok oddaje TOZSAMOSCI startow i pisze wprost, ze
 * niczego wiecej nie oddaje. Wszystko, co jest liczba - wolumen, liczba
 * transakcji, handlujacy, ceny do sparkline'a, naliczenia oplat, tasma
 * zdarzen - liczyla dotad WYLACZNIE przegladarka i zapamietywala WYLACZNIE u
 * siebie, w `localStorage`. Skutek widac z drugiego urzadzenia: tablica
 * startuje pusta i przemiata lancuch od bloku wdrozenia, bo w tej przegladarce
 * nie ma czego odswiezyc - jest tylko co policzyc od nowa.
 *
 * Ta trasa robi ten sam rachunek RAZ, po stronie serwera, naszym RPC, i
 * zapisuje wynik razem z blokiem, do ktorego jest policzony. Kolejne wejscia -
 * czyjekolwiek, z ktoregokolwiek urzadzenia - dostaja gotowy agregat jednym
 * zapytaniem i dociagaja z lancucha wylacznie bloki nad nim.
 *
 * ===========================================================================
 * TA SAMA REDUKCJA, CO W PRZEGLADARCE - NIE DRUGA JEJ KOPIA
 * ===========================================================================
 * `reduceBoardLogs`, `mergeAggregates` i `serializeAggregate` przychodza z
 * `app/startpad/boardScan.ts`, czyli z modulu, ktorego uzywa tablica. Druga
 * kopia tego dekodowania znaczylaby dwa rozne wolumeny tego samego tokena,
 * zaleznie od tego, ktora sciezka zadziala. Ta sama zasada, co przy historii
 * tokena i `historyScan`.
 *
 * Modul NIE korzysta ze stalych modulowych `config.ts` (`LAUNCHPAD_ADDRESS`,
 * `R_VIRT_NATIVE`, `CURVE_TARGET_ETH`). One wynikaja z `ACTIVE_LAUNCHPAD_NETWORK`,
 * a ta na serwerze jest ZAWSZE domyslna Base - liczenie nimi Arc dawaloby ceny
 * liczone wirtualna rezerwa 0,75 zamiast 250. Wszystko idzie z `net`.
 *
 * ===========================================================================
 * CZEGO TA TRASA NIE ROBI
 * ===========================================================================
 * Nie jest zrodlem prawdy o pieniadzach. Rezerwa krzywej, stan launchu i postep
 * do graduacji ida do tablicy osobnym `multicall(launchOf)` prosto z lancucha,
 * a panel handlu czyta je jeszcze raz u siebie. Tu powstaja liczby, ktore maja
 * byc SZYBKIE, a ich zrodlem i tak sa publiczne logi.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Skan bywa dlugi przy nadrabianiu zaleglosci, a domyslny limit funkcji jest
 * krotszy niz sufit okien ponizej. Ta sama wartosc, co przy `/api/curator-watch`.
 */
export const maxDuration = 30;

const LAUNCHED_EVENT = getAbiItem({ abi: launchpadAbi, name: 'Launched' });
const BOUGHT_EVENT = getAbiItem({ abi: launchpadAbi, name: 'Bought' });
const SOLD_EVENT = getAbiItem({ abi: launchpadAbi, name: 'Sold' });
const FEE_ACCRUED_EVENT = getAbiItem({ abi: launchpadAbi, name: 'FeeAccrued' });
const HOOK_FEE_SETTLED_EVENT = getAbiItem({ abi: hookAbi, name: 'HookFeeSettled' });

/**
 * Sufit okien na JEDNO zadanie. Bierzemy sufit SIECI, bo o dlugosci zadania
 * decyduje zegar ponizej, a nie liczba okien - a okien nie moze byc mniej, niz
 * potrafi domknac przegladarka (`MAX_DELTA_SPAN` = `scanWindow * maxScanWindows`).
 * Gdyby serwer nadrabial wolniej, niz przegladarka potrafi doliczyc, jego zapis
 * bywalby dla niej BEZUZYTECZNY: zaleglosc ponad `MAX_DELTA_SPAN` kaze jej
 * porzucic podstawe i skanowac wszystko od nowa - czyli dokladnie to, czego ta
 * zmiana ma nie robic.
 */
const maxWindowsFor = (maxScanWindows: number) => Math.max(40, maxScanWindows);

/**
 * ZEGAR, A NIE LICZBA OKIEN, KONCZY SKAN.
 *
 * Dwa powody naraz:
 *   1. Zadanie ma twardy limit (`maxDuration`). Przekroczony znaczy proces
 *      ubity: postep NIE zostaje zapisany, `finally` sie nie wykonuje, a
 *      blokada wisi pelne `SCAN_LOCK_MS`. Sieć, ktora systematycznie nie
 *      miesci sie w limicie, nie nadrobilaby NIGDY - kazde zadanie zaczynaloby
 *      od tego samego bloku i ginelo.
 *   2. Po drugiej stronie stoi przegladarka z wlasnym limitem
 *      (`BOARD_STATS_TIMEOUT_MS`). Odpowiedz, ktorej nie zdazy odebrac, jest
 *      warta tyle co jej brak - a kosztowala pelny skan.
 *
 * Zapisany postep jest tu tani, wiec lepiej oddac pol nadrobionej zaleglosci
 * szybko niz cala i za pozno.
 */
const SCAN_BUDGET_MS = 5_000;

/**
 * Ile okien naraz. Szesc okien to najwyzej szesc zapytan w locie - miesci sie w
 * budzecie CDP (7500 BU na 5 s, czyli 75 wywolan `eth_getLogs`), tak samo jak
 * przy historii tokena. Przegladarka zostaje na czterech, bo tam skan idzie
 * przez publiczny RPC.
 */
const CONCURRENCY = 6;

const noStore = { 'Cache-Control': 'no-store' } as const;
const shortCache = { 'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=120' } as const;

/**
 * Odpowiedz zawsze niesie agregat JAKO OBIEKT, w ksztalcie `SerializedAggregate` -
 * dokladnie tym, ktory czyta `parseAggregate` w przegladarce. Jeden format
 * zapisu i przesylu; drugiego nie ma, wiec nie ma sie czemu z czym rozjechac.
 */
function reply(body: Record<string, unknown>, headers: Record<string, string>) {
  return NextResponse.json(body, { headers });
}

/**
 * Zapis z bazy na obiekt odpowiedzi. `null` znaczy "tego zapisu nie ma".
 *
 * `JSON.parse` na uszkodzonym zapisie RZUCA, a te odczyty stoja przed blokiem
 * `try` trasy - bez tej oslony jeden zepsuty dokument zamienialby cala trase w
 * piecsetke, czyli w awarie gorsza niz brak cache'u. Tu konczy sie jak kazda
 * inna awaria odczytu: "policz sam".
 */
function storedAggregate(payload: string): unknown | null {
  try {
    const parsed = JSON.parse(payload);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Odpowiedz oddajaca to, co lezy w bazie - bez skanu.
 *
 * `ok` jest prawda WYLACZNIE wtedy, gdy naprawde jest co oddac. Odpowiedz
 * `ok: true` z pustym agregatem bylaby najgorszym mozliwym ksztaltem: wolajacy
 * przeczytalby ja jako "policzone, wolumen zerowy".
 */
function fromStore(
  chainId: number,
  launchpad: string,
  stored: { meta: { lastBlock: bigint; caughtUp: boolean }; payload: string } | null,
  headers: Record<string, string>
) {
  const aggregate = stored ? storedAggregate(stored.payload) : null;
  return reply(
    {
      ok: aggregate !== null,
      chainId,
      launchpad,
      lastBlock: (stored?.meta.lastBlock ?? 0n).toString(),
      caughtUp: stored?.meta.caughtUp ?? false,
      scanned: false,
      aggregate,
    },
    headers
  );
}

export async function GET(request: NextRequest) {
  const asked = Number(request.nextUrl.searchParams.get('chainId'));
  const net = Number.isFinite(asked) ? LAUNCHPAD_NETWORKS[asked] : undefined;
  if (!net) {
    return NextResponse.json({ ok: false, error: 'Unknown chain.' }, { status: 400, headers: noStore });
  }
  const chainId = asked;
  const launchpad = net.launchpad;

  const stored = await readBoardStats(chainId, launchpad);

  // Swiezy = niedawno zapisany I DOGONIONY. Sam `updatedAt` nie wystarcza:
  // podczas nadrabiania zaleglosci kazde zadanie zapisuje postep, wiec nastepne
  // odbijaloby sie od progu swiezosci i cache nie nadrobilby nigdy.
  if (stored && stored.meta.caughtUp && Date.now() - stored.meta.updatedAt < FRESH_FOR_MS) {
    return fromStore(chainId, launchpad, stored, shortCache);
  }

  // Wlasny RPC, a za nim publiczny jako zapas. Pierwsze zapytanie sluzy tez za
  // PROBE: klient, ktory nie odda glowy lancucha (zepsuty klucz, 401), nie
  // dostaje skanu, tylko ustepuje nastepnemu z kolejki. Trasa `board` obok
  // bierze sam pierwszy kandydat i przez to ginie na zepsutej zmiennej - tu nie.
  let client: ReturnType<typeof createPublicClient> | null = null;
  let head = 0n;
  for (const rpcUrl of rpcCandidates(chainId, process.env)) {
    const candidate = createPublicClient({ chain: net.chain, transport: http(rpcUrl) });
    try {
      /**
       * SPRAWDZAMY, CZY TO NA PEWNO TA SIEC - i to jest wazniejsze niz sam
       * fakt, ze endpoint odpowiada.
       *
       * Endpoint wskazujacy inna siec nie rzuca bledem. Oddaje glowe SWOJEGO
       * lancucha, a potem kazde `getLogs` na nasze adresy konczy sie PUSTA
       * LISTA - nie wyjatkiem. Skan przechodzi wiec jako kompletny, agregat
       * bez ani jednego tokena zapisuje sie jako dogoniony, a kazde urzadzenie
       * dostaje potem wolumen zero, liczbe transakcji zero i zadnego
       * ostrzezenia. Byloby to gorsze niz stan sprzed tej zmiany, gdzie
       * nieudany skan zostawal nieufny i stare liczby zostawaly na ekranie.
       *
       * Zmienna srodowiskowa wskazujaca nie ta siec to nie jest teoria: klucze
       * CDP sa wystawiane NA KONKRETNA SIEC (patrz `historyRpc`), a ta zmiana
       * dopisuje do tej mapy kolejny wpis.
       */
      const [id, latest] = await Promise.all([candidate.getChainId(), candidate.getBlockNumber()]);
      if (id !== chainId) continue;
      head = latest;
      client = candidate;
      break;
    } catch {
      continue;
    }
  }

  // Bez glowy lancucha nie ma jak skanowac - oddajemy to, co w bazie. Awaria
  // odczytu ma znaczyc "wolniej", nigdy "pusto".
  if (!client) {
    return fromStore(chainId, launchpad, stored, noStore);
  }

  // Zapamietany agregat czytamy NIEUFNIE: `parseAggregate` oddaje `null` przy
  // czymkolwiek, co nie pasuje do ksztaltu. Polowiczny agregat bylby gorszy niz
  // jego brak, bo dosumowalby sie do kolejnych i juz nigdy nie wrocil do prawdy.
  let baseAggregate: BoardAggregate | null = null;
  if (stored) {
    try {
      baseAggregate = parseAggregate(JSON.parse(stored.payload));
    } catch {
      baseAggregate = null;
    }
  }

  /**
   * GLOWA PONIZEJ ZAPISANEGO POKRYCIA ZNACZY "TRZYMAJ TO, CO MASZ".
   *
   * Zdarza sie bez zadnej awarii: `rpcCandidates` ma publiczny endpoint jako
   * zapas, a pule z rownowazeniem obciazenia odpowiadaja czasem z repliki
   * kilka blokow w tyle. `planBoardStatsScan` nie umie wtedy wznowic (zapis
   * siegalby nad glowe), wiec ruszylby od bloku wdrozenia i skonczyl na
   * budzecie jednego zadania - czyli NADPISALBY kompletny agregat plytszym.
   * Sekundowe wahniecie wezla kosztowaloby wszystkich uzytkownikow
   * odbudowe pokrycia z wielu zadan.
   */
  if (stored && baseAggregate && stored.meta.lastBlock > head) {
    return fromStore(chainId, launchpad, stored, noStore);
  }

  const plan = planBoardStatsScan({
    cachedLastBlock: baseAggregate ? stored?.meta.lastBlock ?? null : null,
    head,
    deployBlock: net.deployBlock,
    scanWindow: net.scanWindow,
    maxWindows: maxWindowsFor(net.maxScanWindows),
  });

  // Nie ma czego dociagac: zapis siega glowy. Oddajemy go bez dotykania RPC.
  if (plan.windows.length === 0 && plan.resume && baseAggregate && stored) {
    return fromStore(chainId, launchpad, stored, shortCache);
  }

  // Blokada skanu: dwoch odwiedzajacych naraz nie przemiata tego samego zakresu
  // dwa razy. Przy agregacie to nie jest sama oszczednosc - zapis jest
  // read-modify-write na SUMIE, a dwie rownolegle delty doliczone do tego
  // samego stanu sprzed zgubilyby jedna z nich bezpowrotnie.
  const storeReady = await isBoardStatsAvailable();

  /**
   * Bez bazy skan nie ma po co ruszac. Ta trasa jest CACHE'EM: policzony tu
   * agregat, ktorego nie ma gdzie zapisac, sluzy jednemu zadaniu i ginie -
   * a kosztuje komplet okien `getLogs` przy KAZDYM wejsciu kazdego
   * uzytkownika, wiec wychodzi drozej niz stan sprzed tej zmiany. Przegladarka
   * czyta brak agregatu jako "policz sam" i robi dokladnie to, co robila.
   */
  if (!storeReady) {
    return fromStore(chainId, launchpad, stored, noStore);
  }

  let locked = await claimScanLock(chainId, launchpad);
  if (!locked) {
    return fromStore(chainId, launchpad, stored, noStore);
  }

  try {
    // Skala krzywej jest wlasnoscia SIECI - stad `net.rVirt`, a nie stala
    // modulowa. Ta sama arytmetyka, co `spotPriceFromReserves` na tablicy.
    const helpers = {
      ethOf: (wei: bigint) => Number(formatEther(wei)),
      priceOf: (ethReserveAfter: bigint, tokenReserveAfter: bigint) => {
        const tokens = Number(formatEther(tokenReserveAfter));
        if (tokens <= 0) return 0;
        return (net.rVirt + Number(formatEther(ethReserveAfter))) / tokens;
      },
    };

    const scanOne = async (window: { fromBlock: bigint; toBlock: bigint }) => {
      const once = () =>
        client!.getLogs({
          address: [net.launchpad as Address, net.hook as Address],
          events: [LAUNCHED_EVENT, BOUGHT_EVENT, SOLD_EVENT, HOOK_FEE_SETTLED_EVENT, FEE_ACCRUED_EVENT],
          fromBlock: window.fromBlock,
          toBlock: window.toBlock,
        });
      try {
        return await once();
      } catch {
        // Jedna proba ponowna: burst zapytan potrafi zebrac 429, ale po chwili
        // przechodzi. Null znaczy "okno padlo" - i musi byc odrozniale od
        // pustej listy, bo brak danych nie jest danymi.
        try {
          return await once();
        } catch {
          return null;
        }
      }
    };

    // Okna ida W GORE, wiec pokrycie rosnie od bloku wdrozenia. Bierzemy tylko
    // NIEPRZERWANY POCZATEK: pierwsze padniete okno urywa pokrycie, a `lastBlock`
    // musi opisywac zakres BEZ DZIURY. Dziura w sumie addytywnej jest nie do
    // odkrecenia - zostaje w wolumenie na zawsze i nikt jej potem nie odrozni
    // od prawdy.
    const delta = emptyAggregate();
    let covered = plan.windows.length > 0 ? plan.windows[0].fromBlock - 1n : head;
    let complete = true;

    const until = Date.now() + SCAN_BUDGET_MS;
    outer: for (let start = 0; start < plan.windows.length; start += CONCURRENCY) {
      // Budzet sprawdzamy PRZED runda, nie w jej trakcie: przerwana runda
      // zostawilaby okna, ktorych nikt nie policzyl, a kolejne juz policzone -
      // czyli dziure. Tu przerwanie zawsze wypada na granicy pokrycia.
      if (start > 0 && Date.now() > until) {
        complete = false;
        break outer;
      }
      const batch = plan.windows.slice(start, start + CONCURRENCY);
      const results = await Promise.all(batch.map(scanOne));
      for (let index = 0; index < batch.length; index += 1) {
        const logs = results[index];
        if (!logs) {
          complete = false;
          break outer;
        }
        reduceBoardLogs(logs as unknown as BoardLog[], helpers, delta);
        covered = batch[index].toBlock;
      }
    }

    /**
     * Suma sprzed plus delta - i tylko wtedy, gdy zapamietany stan wolno bylo
     * dosumowac. Inaczej delta JEST calym agregatem (skan ruszyl od bloku
     * wdrozenia), ale i tak przechodzi przez `mergeAggregates` z pustym.
     *
     * To nie jest ozdobnik. `serializeAggregate` przycina tasme przez
     * `feed.slice(0, MAX_FEED_ENTRIES)`, czyli OD POCZATKU tablicy - poprawnie
     * dla przegladarki, ktora skanuje OD GLOWY W DOL i ma tasme najnowszymi do
     * przodu. Serwer idzie W GORE, wiec jego surowa tasma jest odwrotna i to
     * samo ciecie zostawiloby 48 NAJSTARSZYCH zdarzen launchpada. `Live tape`
     * na kazdym urzadzeniu pokazywalaby pierwsze transakcje w historii.
     * `mergeAggregates` sortuje malejaco przed cieciem i jest tu jedynym
     * miejscem, ktore to porzadkuje.
     */
    const aggregate =
      plan.resume && baseAggregate ? mergeAggregates(baseAggregate, delta) : mergeAggregates(emptyAggregate(), delta);

    // `lastBlock` przesuwamy TYLKO tam, dokad naprawde doczytalismy. Przy
    // wznowieniu bez ani jednego udanego okna zostaje to, co bylo.
    const previous = plan.resume ? stored?.meta.lastBlock ?? net.deployBlock - 1n : net.deployBlock - 1n;
    const lastBlock = covered > previous ? covered : previous;

    /**
     * Znacznik "dogoniony" wolno PODNIESC, nigdy zdjac przy nieudanym skanie.
     *
     * Sam `complete && lastBlock >= head` gasil go przy kazdym padnietym oknie
     * na dogonionym cache'u - a to jest znacznik, na ktorym stoi okno
     * swiezosci. Zgaszony raz, kazal KAZDEMU nastepnemu wejsciu ruszac RPC i
     * przepisywac caly dokument, dopoki jakis skan nie trafil idealnie. Na
     * sieci z zawodnym publicznym RPC szybka sciezka nie wlaczylaby sie nigdy.
     * Nieudany odczyt nie jest faktem o pokryciu.
     */
    const caughtUp = complete ? lastBlock >= head : stored?.meta.caughtUp ?? false;

    /**
     * Pokrycie nie siega nawet bloku wdrozenia - czyli PIERWSZE okno padlo i
     * nie przeczytalismy niczego. To nie jest agregat o wartosci zero, to jest
     * BRAK agregatu, i tak musi wygladac w odpowiedzi.
     *
     * Roznica jest praktyczna: `ok: true` z pusta suma i `lastBlock` tuz pod
     * blokiem wdrozenia to dla wolajacego zdanie "policzone, wolumen zerowy".
     * Tablica pokazalaby wtedy zera zamiast poczekac na wlasny skan.
     */
    if (lastBlock < net.deployBlock) {
      return fromStore(chainId, launchpad, stored, noStore);
    }

    /**
     * AGREGAT, KTORY ZGUBIL WSZYSTKIE TOKENY, JEST AWARIA ODCZYTU - NIE FAKTEM.
     *
     * Druga siatka pod sprawdzeniem sieci w petli sond wyzej. Cokolwiek
     * sprawi, ze kazde okno odda pusta liste bez bledu (endpoint z pusta
     * baza logow, archiwum bez tych blokow, adres launchpada podmieniony w
     * zmiennych), skonczy sie skanem "kompletnym" o zerowym wolumenie. Zapis
     * takiego stanu zastapilby wszystkim urzadzeniom naraz dobry agregat
     * zerami, a `caughtUp: true` kazalby im go jeszcze przez dwadziescia
     * sekund serwowac bez proby poprawy.
     */
    const lostEverything = aggregate.launched.size === 0 && (baseAggregate?.launched.size ?? 0) > 0;
    if (lostEverything) {
      return fromStore(chainId, launchpad, stored, noStore);
    }

    const serialized = serializeAggregate(aggregate);

    /**
     * Zapisujemy, gdy jest co zapisac: pokrycie poszlo w gore ALBO cache
     * dopiero teraz dogonil glowe. Skan, ktory nie ruszyl `lastBlock` (padlo
     * pierwsze okno delty), przepisywalby wszystkie kawalki bajt w bajt -
     * zapisy do Firestore za nic.
     */
    const advanced = stored === null || lastBlock > stored.meta.lastBlock || (caughtUp && !stored.meta.caughtUp);
    const written = advanced
      ? await writeBoardStats({ chainId, launchpad, lastBlock, caughtUp, payload: JSON.stringify(serialized) })
      : false;
    // Udany zapis czysci blokade w tym samym atomowym zapisie - patrz
    // `writeBoardStats`. Osobne zwolnienie zostaje tylko dla reszty przypadkow.
    if (written) locked = false;

    return reply(
      {
        ok: true,
        chainId,
        launchpad,
        lastBlock: lastBlock.toString(),
        caughtUp,
        scanned: true,
        complete,
        aggregate: serialized,
      },
      shortCache
    );
  } finally {
    if (locked) await releaseScanLock(chainId, launchpad);
  }
}

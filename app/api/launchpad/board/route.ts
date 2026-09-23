import { NextResponse, type NextRequest } from 'next/server';
import { createPublicClient, getAbiItem, http, type Address } from 'viem';
import { LAUNCHPAD_NETWORKS, launchpadAbi } from '../../../startpad/config';
import { rpcCandidates } from '../historyRpc';
import {
  claimIndexScanLock,
  isTokenIndexAvailable,
  readTokenIndex,
  releaseIndexScanLock,
  writeTokenIndex,
} from '../tokenIndexStore';
import {
  indexWindows,
  mergeIndex,
  planIndexScan,
  type IndexedToken,
  type IndexScanState,
} from '../tokenIndexShape';

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
 *
 * ===========================================================================
 * CO SIE ZMIENILO 9 WRZESNIA 2026
 * ===========================================================================
 * Indeks Arc nie zapelnial sie NIGDY. Postep skanu byl zapisywany wylacznie
 * wtedy, gdy jedno zadanie objelo caly zakres od bloku wdrozenia do glowy -
 * warunek spelnialny na Base (gdzie zaleglosc miescila sie w jednym zadaniu) i
 * niespelnialny na lancuchu z blokiem co pol sekundy. Uzasadnienie i
 * arytmetyka obu znacznikow pokrycia siedza w `tokenIndexShape`; tutaj jest
 * ich uzycie, budzet zadania i wybor endpointu.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Trasa eksportuje sam GET, wiec `force-dynamic` nie wylacza Data Cache
// Nexta 14: zapytania JSON-RPC viem (POST bez `cache`) szly do "auto cache"
// na rok i swiezy proces potrafil oddac stara glowe lancucha. Pelny opis:
// app/api/launchpad/pool-swaps/route.ts. Cache brzegowy (s-maxage) zostaje.
export const fetchCache = 'force-no-store';

/**
 * Skan bywa dlugi przy zimnym indeksie, a domyslny limit funkcji jest krotszy
 * niz budzet zegara ponizej. Ta sama wartosc, co przy `/api/launchpad/board/stats`.
 */
export const maxDuration = 30;

const LAUNCHED_EVENT = getAbiItem({ abi: launchpadAbi, name: 'Launched' });

/**
 * Sufit okien na DELTE PRZY GLOWIE. 40 okien po 9500 to 380 tys. blokow -
 * ponad dwie doby nawet na lancuchu z blokiem co pol sekundy, wiec zwykla
 * przerwa miedzy wejsciami miesci sie tu z zapasem.
 */
const HEAD_WINDOWS = 40;

/**
 * Sufit okien na BACKFILL - i to jest druga polowa naprawy z 9 wrzesnia.
 *
 * Sam trwaly znacznik dna wystarcza do POPRAWNOSCI, ale nie do tempa: przy 40
 * oknach zaleglosc Arc (4,41 mln blokow) potrzebowalaby dwunastu wejsc, zanim
 * ktokolwiek zobaczylby na tablicy pierwszy token tej sieci. 200 okien to 1,9
 * mln blokow na zadanie, czyli ta sama zaleglosc w trzech wejsciach.
 *
 * Ta liczba nie kosztuje poprawnosci, tylko ZEGARA: okna ida szostkami, a skan
 * przerwany na granicy rundy zapisuje to, co objal. Dlatego prawdziwym
 * hamulcem jest `SCAN_BUDGET_MS` ponizej, a ta stala to sufit, o ktory na
 * wolniejszej sieci nigdy nie zahaczymy. Okna NIE WOLNO za to poszerzac ponad
 * `net.scanWindow` - to jest limit endpointu, nie nasz wybor (Arc oddaje
 * `-32012 requested range too large` powyzej ~10 tys.).
 */
const BACKFILL_WINDOWS = 200;

/**
 * ILE OKIEN NARAZ - LICZBA, KTOREJ ZADANIE UCZY SIE SAMO.
 *
 * Sufit szesciu okien miesci sie w budzecie CDP i tyle stalo tu na sztywno.
 * Zmierzone na `rpc.testnet.arc.io` 9 wrzesnia 2026 (to jedyny endpoint Arc z
 * kompletna historia, wiec backfill nie ma alternatywy): trzy rownolegle okna
 * przechodza 9 na 9, cztery gubia co trzecie, szesc PADA W CALOSCI - kazde z
 * bledem "Request exceeds defined limit". Sztywna szostka znaczyla wiec na Arc
 * dokladnie to samo, co usterka naprawiana wyzej - pierwsze okno pada, skan
 * urywa sie na progu, indeks nie rusza sie ani o blok - tyle ze przez limit
 * TEMPA, nie przez brak zapisu postepu. Gorzej: seria szesciu psula endpoint
 * takze dla ponowien, wiec zadanie konczylo sie z zerowym pokryciem.
 *
 * Stad rozbieg od dolu: zadanie zaczyna ostroznie, po czystej rundzie dokłada
 * jedno okno, a po padnietej TNIE PAS NA POL i daje endpointowi oddech. Ten
 * sam ksztalt, co kontrola przeplywu w TCP, i z tego samego powodu: przepustowosc
 * nalezy do drugiej strony i nie da sie jej odgadnac z tej. Base dochodzi do
 * sufitu po kilku rundach, Arc osiada na trzech, a przyszla siec ustawi sie
 * sama - bez wpisu w konfiguracji, ktorego nikt by nie zaktualizowal.
 */
const MAX_LANES = 6;
const START_LANES = 2;

/**
 * Oddech przed ponowna proba padnietego okna, mnozony przez numer podejscia.
 * Limit tempa nie mija dlatego, ze poprosilismy drugi raz od razu - poprzednia
 * wersja ponawiala natychmiast i na Arc obie proby padaly tak samo.
 */
const RETRY_PAUSE_MS = 400;

/** Ile razy naprawiamy padnieta partie, zanim uznamy okno za nieosiagalne. */
const REPAIR_ROUNDS = 2;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * ZEGAR, A NIE LICZBA OKIEN, KONCZY SKAN - tak samo jak przy agregacie tablicy.
 * Zadanie ubite na `maxDuration` NIE ZAPISUJE postepu, wiec siec, ktora
 * systematycznie nie miesci sie w limicie, nie nadrobilaby nigdy. Budzet
 * sprawdzamy PRZED runda, zeby przerwanie zawsze wypadalo na granicy pokrycia.
 */
const SCAN_BUDGET_MS = 12_000;


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

  /** Odpowiedz z samego zapisu - bez skanu. Jeden ksztalt na wszystkie wyjscia. */
  const fromStore = (body: Record<string, unknown>, headers: Record<string, string>) =>
    NextResponse.json(
      {
        chainId,
        tokens: stored?.tokens ?? [],
        lastBlock: (stored?.lastBlock ?? 0n).toString(),
        scannedDownTo: (stored?.scannedDownTo ?? 0n).toString(),
        complete: stored?.complete ?? false,
        ...body,
      },
      { headers }
    );

  /**
   * Dokument ISTNIEJE nie znaczy jeszcze, ze cos w nim jest: blokada ponizej
   * zaklada go samym `scanLockUntil`, zanim padnie pierwsze `getLogs`.
   * `updatedAt` stawia wylacznie `writeTokenIndex`, wiec to on odroznia
   * zapisany indeks od pustej skorupy - a roznica jest praktyczna, bo
   * `ok: true` z pusta lista czyta sie jako "startow nie ma".
   */
  const indexed = stored !== null && stored.updatedAt > 0;

  /**
   * PROG SWIEZOSCI OBOWIAZUJE TYLKO INDEKS, KTORY DOSIEGNAL BLOKU WDROZENIA.
   *
   * Dopoki backfill jest niedomkniety, kazde wejscie ma prawo pchnac ogon
   * glebiej - inaczej indeks nadrabialby po jednym zadaniu na trzydziesci
   * sekund i zimna siec czekalaby na komplet minutami zamiast sekundami. Ta
   * sama zasada, co przy historii tokena (`meta.complete`) i przy agregacie
   * tablicy (`caughtUp`).
   */
  const fresh = stored !== null && stored.complete && Date.now() - stored.updatedAt < FRESH_FOR_MS;
  if (fresh) {
    return fromStore(
      { ok: true, scanned: false },
      { 'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=120' }
    );
  }

  /**
   * KIEDY ZAPISANE POKRYCIE JEST NIC NIEWARTE.
   *
   * Dwa przypadki, oba widziane na zywym Arc 9 wrzesnia 2026:
   *
   *  1. `lastBlock` PONIZEJ bloku wdrozenia - dokument zostal po INNYM
   *     launchpadzie. Adresy w `config.ts` maja fallbacki i zmieniaja sie przy
   *     kolejnych wdrozeniach, a indeks jest kluczowany siecia, nie adresem.
   *
   *  2. Dno na poziomie bloku wdrozenia albo nizej, a `complete` mimo to
   *     `false`. To jest zapis SAM ZE SOBA SPRZECZNY: ponizej bloku wdrozenia
   *     logow tego launchpada nie ma, wiec dno tam znaczyloby komplet. Taki
   *     zapis powstaje po migracji ze starego dokumentu (dno przepisane z
   *     `lastBlock`) i jest pulapka bez wyjscia: planer nie planuje juz ogona
   *     (`scannedDownTo > deployBlock` nie zachodzi), a `complete` nigdy sie
   *     nie podnosi. Arc siedzial przez to z pusta tablica, majac starty
   *     dziesiec tysiecy blokow NAD blokiem wdrozenia.
   *
   * W obu planujemy jak przy pustym indeksie i kazemy zapisowi wyczyscic
   * znaczniki. Same tozsamosci zostaja, bo `mergeIndex` niczego nie usuwa.
   */
  const staleCoverage =
    stored !== null &&
    (stored.lastBlock < net.deployBlock || (!stored.complete && stored.scannedDownTo <= net.deployBlock));

  const state: IndexScanState | null =
    stored && !staleCoverage
      ? { lastBlock: stored.lastBlock, scannedDownTo: stored.scannedDownTo, complete: stored.complete }
      : null;

  /**
   * BLOKADA SKANU - dopiero teraz jest po co ja miec.
   *
   * Dopoki backfill jest niedomkniety, prog swiezosci nie zatrzymuje nikogo,
   * wiec czterech ogladajacych naraz to czterokrotnie ta sama seria `getLogs`.
   * Na endpoincie z limitem tempa (Arc) zaden z nich nie przechodzi i indeks
   * nie rusza sie z miejsca - czyli usterka wraca innymi drzwiami.
   *
   * Ustepuje TYLKO ten, kto ma co pokazac. Przy pustym indeksie odpowiedz "ktos
   * inny wlasnie skanuje" bylaby pusta tablica, wiec wtedy skanujemy mimo
   * blokady i tracimy najwyzej powtorzona prace. Ta sama zasada, co przy
   * historii tokena.
   */
  const locked = await claimIndexScanLock(chainId);
  if (!locked && indexed) {
    return fromStore({ ok: true, scanned: false }, { 'Cache-Control': 'no-store' });
  }

  const bounds = (chainHead: bigint) => ({
    head: chainHead,
    deployBlock: net.deployBlock,
    headSpan: net.scanWindow * BigInt(HEAD_WINDOWS),
    backfillSpan: net.scanWindow * BigInt(BACKFILL_WINDOWS),
  });

  /**
   * PULA ENDPOINTOW, A NIE JEDEN WYBRANY NA CALE ZADANIE.
   *
   * Ta trasa brala dotad `rpcCandidates(...)[0]`, a potem - w wersji z
   * egzaminem - JEDEN endpoint, ktory zdal `getLogs` na najglebszym oknie
   * planu. Oba ksztalty zakladaja, ze istnieje endpoint umiejacy obsluzyc
   * caly zakres. Na Arc taki nie istnieje (zmierzone 2026-09-09, zapis w
   * docs/LAUNCHPAD-STAN.md):
   *
   *   - `rpc.blockdaemon...` ma czolo lancucha, a przy starym bloku oddaje
   *     `4444 pruned history unavailable`;
   *   - `rpc.testnet.arc.io` ma pelna historie, a PRZY GLOWIE oddaje
   *     `-32014 requested data not available`, do tego tnie tempo (`-32005`).
   *
   * Kandydat z historia oblewal wiec egzamin przy glowie, kandydat z glowa
   * oblewal go w dole, pula zostawala pusta i trasa nie skanowala NICZEGO.
   * Zbieramy wiec wszystkie endpointy, ktore oddaja numer bloku wlasciwej
   * sieci, a wybor robi sie PER OKNO (patrz `fetchWindow`).
   */
  const candidates = rpcCandidates(chainId, process.env, net.chain.rpcUrls.default.http);
  // Miejsce w tablicy trzyma KOLEJNOSC z `rpcCandidates` (endpoint z env
  // pierwszy). Skladanie puli przez `push` w `Promise.all` ustawialoby ja
  // wedlug tego, kto szybciej odpowie - czyli losowo.
  const probed: (ReturnType<typeof createPublicClient> | null)[] = candidates.map(() => null);
  let head = 0n;
  await Promise.all(
    candidates.map(async (rpcUrl, index) => {
      const candidate = createPublicClient({ chain: net.chain, transport: http(rpcUrl) });
      try {
        const [id, latest] = await Promise.all([candidate.getChainId(), candidate.getBlockNumber()]);
        // Endpoint wskazujacy INNA siec nie rzuca bledem - oddaje glowe swojego
        // lancucha, a potem kazde `getLogs` konczy sie pusta lista. Skan
        // przeszedlby jako kompletny i zapisal `complete` na pustce.
        if (id !== chainId) return;
        probed[index] = candidate;
        // Glowa to NAJWYZSZA znana, a nie glowa pierwszego z brzegu: endpoint
        // z pelna historia potrafi zostawac w tyle za czolem lancucha.
        if (latest > head) head = latest;
      } catch {
        // Endpoint, ktory nie oddaje nawet numeru bloku, do puli nie wchodzi.
      }
    })
  );
  const clients = probed.filter((entry): entry is ReturnType<typeof createPublicClient> => entry !== null);

  // Bez zywej glowy lancucha nie ma jak skanowac - oddajemy to, co w bazie.
  if (clients.length === 0 || head === 0n) {
    await releaseIndexScanLock(chainId);
    return fromStore({ ok: stored !== null, scanned: false }, { 'Cache-Control': 'no-store' });
  }

  const ranges = planIndexScan(state, bounds(head));

  const scanned: IndexedToken[] = [];
  let lastBlock = state?.lastBlock ?? 0n;
  let scannedDownTo = state?.scannedDownTo ?? 0n;
  let complete = state?.complete ?? false;
  // Budzet okien jest WSPOLNY dla obu przedzialow, a delta idzie pierwsza -
  // wiec zadanie wydaje go najpierw na nowe starty, a dopiero reszte na ogon.
  let budget = BACKFILL_WINDOWS;
  const until = Date.now() + SCAN_BUDGET_MS;
  // Pas znaleziony na jednym przedziale obowiazuje takze nastepny - to ten sam
  // endpoint, wiec drugi raz uczyc sie go nie ma po co.
  let lanes = START_LANES;
  // Padniete okno konczy CALY skan, ale dopiero po zapisaniu pokrycia, ktore
  // ten przedzial zdazyl objac. Poprzednia wersja tego pliku wychodzila stad
  // `break` przez etykiete i gubila caly postep rundy - w symulacji na zywym
  // Arc wygladalo to jak brak jakiegokolwiek ruchu przez szescdziesiat zadan.
  let stopped = false;

  /**
   * Endpoint wybiera sie NA OKNO. Ten, ktory ostatnio zadzialal, idzie pierwszy,
   * wiec jedno zadanie moze wziac gore lancucha z jednego zrodla, a ogon z
   * drugiego - i zaden z nich nie musi umiec calego zakresu (uzasadnienie przy
   * puli endpointow wyzej).
   */
  let preferred = 0;
  const fetchWindow = async (window: { from: bigint; to: bigint }) => {
    for (let step = 0; step < clients.length; step += 1) {
      const index = (preferred + step) % clients.length;
      try {
        const logs = await clients[index].getLogs({
          address: net.launchpad as Address,
          event: LAUNCHED_EVENT,
          fromBlock: window.from,
          toBlock: window.to,
        });
        preferred = index;
        return logs;
      } catch {
        // Nastepny kandydat. Dopiero brak WSZYSTKICH znaczy "okno padlo".
      }
    }
    // `null` znaczy "okno padlo" i MUSI byc odrozniale od pustej listy -
    // brak danych nie jest danymi.
    return null;
  };

  /**
   * OKNO ZASIEWU - pierwsze okno NAD blokiem wdrozenia, pytane dopoki backfill
   * nie jest domkniety.
   *
   * Starty kleja sie do poczatku zycia launchpada: ktos wdraza kontrakt i
   * odpala tokeny w ciagu minut. Backfill idzie tymczasem OD GLOWY W DOL, wiec
   * na lancuchu z duza luka (Arc: 4,4 mln blokow, szesc tokenow dziesiec tysiecy
   * blokow nad wdrozeniem) tablica jest pusta przez cale nadrabianie - a to
   * wlasnie te najstarsze tokeny ludzie mieli w reku.
   *
   * Jedno zapytanie na zadanie, i tylko o TOZSAMOSCI: znacznikow pokrycia to
   * okno NIE rusza, bo lezy poza ciaglym pasem, ktory one opisuja. `mergeIndex`
   * niczego nie usuwa, wiec znalezione tu tokeny zostaja na liscie takze wtedy,
   * gdy backfill jeszcze tam nie dotarl.
   *
   * Idzie PRZED glownym skanem i to nie jest kosmetyka. Endpoint z pelna
   * historia Arc tnie tempo juz po kilku zapytaniach (`-32005`), wiec okno
   * postawione za backfillem dostawalo odmowe za kazdym razem - najwazniejsze
   * zapytanie calego zadania przegrywalo z wlasnym ogonem o limit.
   */
  if (!complete) {
    const seedTo =
      head - net.deployBlock >= net.scanWindow ? net.deployBlock + net.scanWindow - 1n : head;
    const seedLogs = await fetchWindow({ from: net.deployBlock, to: seedTo });
    for (const log of seedLogs ?? []) {
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
  }

  for (const range of ranges) {
    if (stopped || budget <= 0) break;
    const windows = indexWindows(range, net.scanWindow, budget);
    budget -= windows.length;

    /**
     * Znacznik pokrycia TEGO przedzialu, liczony od kotwicy. Startuje jeden
     * blok ZA nia, czyli "nic jeszcze nie objete" - pierwsze okno, ktore padlo,
     * zostawia go tam, gdzie byl, i nic sie nie zapisuje.
     */
    let edge = range.anchor === 'top' ? range.head + 1n : range.floor - 1n;

    let at = 0;
    rounds: while (at < windows.length) {
      // Budzet sprawdzamy PRZED runda, nie w jej trakcie: przerwana runda
      // zostawilaby okna, ktorych nikt nie zapytal, miedzy juz policzonymi.
      if (at > 0 && Date.now() > until) break;

      const batch = windows.slice(at, at + lanes);
      at += batch.length;
      const results = await Promise.all(batch.map(fetchWindow));

      if (results.every((logs) => logs !== null)) {
        // Czysta runda - dokladamy jedno okno. Rosniemy PO JEDNYM, bo skok
        // wprost do sufitu jest dokladnie ta seria, ktora endpoint odrzuca.
        if (lanes < MAX_LANES) lanes += 1;
      } else {
        // Zwezamy pas na pol i dajemy endpointowi oddech, a naprawa idzie
        // POJEDYNCZO. Druga rownolegla seria w tej samej chwili tylko
        // potwierdzilaby limit tempa - dokladnie to robila poprzednia wersja
        // (natychmiastowe ponowienie) i dlatego obie proby padaly tak samo.
        lanes = Math.max(1, Math.floor(lanes / 2));
        for (let round = 1; round <= REPAIR_ROUNDS; round += 1) {
          await sleep(RETRY_PAUSE_MS * round);
          let missing = false;
          for (let index = 0; index < batch.length; index += 1) {
            if (results[index] !== null) continue;
            results[index] = await fetchWindow(batch[index]);
            if (results[index] === null) {
              // Dalsze okna partii i tak zostana odciete przy skladaniu
              // pokrycia, wiec nie ma po co o nie pytac w tej rundzie.
              missing = true;
              break;
            }
          }
          if (!missing) break;
        }
      }

      // Bierzemy tylko NIEPRZERWANY POCZATEK partii: pierwsze padniete okno
      // urywa pokrycie, a znaczniki opisuja zakres BEZ DZIURY.
      for (let index = 0; index < batch.length; index += 1) {
        const logs = results[index];
        if (!logs) {
          stopped = true;
          break rounds;
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
        edge = range.anchor === 'top' ? batch[index].from : batch[index].to;
      }
    }

    if (range.anchor === 'top') {
      // Pierwsze okno padlo - nie ma czego zapisac o tym przedziale.
      if (edge > range.head) continue;
      // Przy pustym indeksie gora przedzialu JEST glowa lancucha, wiec to ona
      // ustawia gorny znacznik. Przy dociaganiu ogona `lastBlock` stoi juz
      // wyzej i ta linia go nie rusza.
      if (range.head > lastBlock) lastBlock = range.head;
      if (scannedDownTo === 0n || edge < scannedDownTo) scannedDownTo = edge;
      // Skan dolecial do bloku wdrozenia - nizej logow tego launchpada nie ma.
      if (edge <= net.deployBlock) complete = true;
    } else if (edge >= range.floor && edge > lastBlock) {
      // Delta: pokrycie przylega do `lastBlock` od dolu, wiec kazde udane okno
      // przesuwa gorny znacznik, nawet gdy dalsze padly.
      lastBlock = edge;
    }
  }

  const available = await isTokenIndexAvailable();
  let tokens: IndexedToken[];
  if (available) {
    // Udany zapis czysci blokade w tym samym atomowym `set` - patrz
    // `writeTokenIndex`. Nieudany zostawia ja do wygasniecia, i to jest
    // wlasciwe: skan naprawde sie odbyl, a jego powtorka za sekunde niczego by
    // nie dolozyla.
    tokens = await writeTokenIndex({
      chainId,
      scanned,
      lastBlock,
      scannedDownTo,
      complete,
      // Stare znaczniki musza ZNIKNAC, a nie wygrac minimum - inaczej planer
      // uznaje ogon za objety i nigdy nie schodzi tam, gdzie leza starty.
      resetCoverage: staleCoverage,
    });
  } else {
    // Bez bazy skladamy liste w pamieci: to, co lezalo, plus to, co widac
    // teraz. Gorzej niz z baza, ale nadal lepiej niz nic, a klient ma wtedy
    // swoj skan awaryjny.
    tokens = mergeIndex(stored?.tokens ?? [], scanned);
    if (locked) await releaseIndexScanLock(chainId);
  }

  return NextResponse.json(
    {
      ok: true,
      chainId,
      tokens,
      lastBlock: lastBlock.toString(),
      scannedDownTo: scannedDownTo.toString(),
      complete,
      scanned: true,
    },
    { headers: { 'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=120' } }
  );
}

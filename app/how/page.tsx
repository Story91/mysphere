import type { Metadata } from 'next';
import Link from 'next/link';
import ReDefinitionContent, { RE_DEFINITION_METADATA } from '../re-definition/ReDefinitionContent';

/**
 * /how - instrukcja obslugi produktu dla czlowieka, ktory wlasnie wszedl.
 *
 * Komponent SERWEROWY: zero interaktywnosci, wiec nie ciagnie ani kilobajta
 * JS-a. To samo podejscie co w manifescie obok.
 *
 * CENA PRZELACZNIKA: odkad strona czyta `searchParams` (zakladka w query),
 * Next renderuje ja na zadanie, a nie raz przy buildzie. Nie ma tu zadnego
 * odczytu danych, wiec render kosztuje sam HTML - ale "prerenderuje sie do
 * statycznego HTML-a" przestalo byc prawda i nie ma po co tego udawac.
 * Ta sama zamiana zaszla wczesniej na /asks, kiedy doszly tam zakladki.
 *
 * === CZYM TA ZAKLADKA NIE JEST ===
 * NIE jest manifestem. Zakladka obok tlumaczy, DLACZEGO ten produkt istnieje
 * i czym rozni sie od reszty - i ma prawo byc tam teza, ktora dopiero
 * powstaje. Ta strona odpowiada na inne pytanie: CO MOGE TU ZROBIC TERAZ.
 * Kazdy krok musi dac sie wykonac dzisiaj, bez czekania na cokolwiek.
 *
 * Dlatego nie ma tu ani jednego zdania w czasie przyszlym. Rzecz, ktorej nie
 * da sie jeszcze zrobic, NIE MA PRAWA byc na tej stronie w zadnej formie -
 * nawet jako zapowiedz. Zapowiedzi sa na /re-definition, w tabeli ze statusami.
 *
 * === "DZIALA" TO NIE TO SAMO CO "KTOS PRZEZ TO PRZESZEDL" ===
 * Dwa kroki opisuja rzeczy, ktore dzialaja i przez ktore NIKT jeszcze nie
 * przeszedl, i kazdy musi to mowic W SWOIM KROKU, a nie w gwiazdce na dole:
 *
 *   krok 07 (zwrot)   settleExpired ma przycisk na /money (page.tsx wola
 *                     settleExpiredAsk), ale ta noga nie przeszla na zadnej
 *                     prawdziwej sieci - wymaga terminu + 48h, czego nie da
 *                     sie przewinac. Jedyny dowod to test jednostkowy.
 *   krok 09 (graduacja)  Pelna sciezka launch -> pula -> wyplaty przeszla
 *                     na sieciach testowych (Sepolia; na Arc testnecie jeden
 *                     token graduowal do zywej puli v4). Na Base mainnet skan
 *                     eth_getLogs z 2026-09-01, kompletny od bloku wdrozenia
 *                     do glowy lancucha, pokazal 8 zdarzen Launched i 0
 *                     Graduated - nikt nie graduowal naprawde.
 *
 * Krok 05 (escrow) z tej listy wypadl 2026-09-01: budzet zostal zablokowany
 * w kontrakcie z tej apki na Base mainnet (commity 2bc5781 i 1bd728b,
 * 2026-08-07/08), wiec krok mowi teraz "nie bedziesz pierwszy" zamiast
 * "kontrakt jest pusty".
 *
 * === STARTPAD: BASE MAINNET DOMYSLNIE, CZTERY SIECI W PRZELACZNIKU ===
 * Naglowek strony obiecuje, ze wszystko tu kosztuje prawdziwe pieniadze -
 * i Startpad (kroki 08-10) sie w to wpisuje: domyslnie chodzi na Base
 * mainnet z PRAWDZIWYM ETH. Przelacznik sieci na /startpad ma jeszcze
 * Robinhood Chain (tez realne pieniadze) i dwa testnety: Base Sepolia i Arc.
 * Kwoty ETH w krokach (3.00 ETH, 0.045 ETH) sa wartosciami Base - prog
 * graduacji skaluje sie z siecia (Arc liczy krzywa w USDC), wiec kroki
 * kotwicza liczby do Base zamiast udawac uniwersalne stale. Pigulka kroku
 * 08 mowi "Gas only", a akapit kroku 08 mowi wprost, ze to realny ETH.
 *
 * Instrukcja, ktora przemilcza pustke po drugiej stronie przycisku, klamie
 * przez sugestie kolejki, ktorej nie ma. Czlowiek, ktory bedzie pierwszy, ma
 * prawo wiedziec, ze jest pierwszy.
 *
 * === DLACZEGO KAZDY KROK MOWI, ILE KOSZTUJE I CO PODPISUJESZ ===
 * Produkt operuje prawdziwymi pieniedzmi i prawdziwymi podpisami. Czlowiek,
 * ktory klika "Sign", ma prawo wiedziec ZAWCZASU, czy to kosztuje gaz, czy nie,
 * i co dokladnie potwierdza. Zaskoczenie przy portfelu jest w tym produkcie
 * gorsze niz jeden krok wiecej w instrukcji.
 */

type SearchParams = { tab?: string | string[] };

/**
 * /how - DWIE zakladki: instrukcja i manifest.
 *
 * === DLACZEGO SCALONE ===
 * Belka miala osobny wpis "Re-Definition" i osobny "How", stojace obok siebie.
 * To sa dwa pytania o ten sam produkt: "co da sie zrobic teraz" i "dlaczego to
 * w ogole istnieje". Jeden wpis w belce, przelacznik na stronie - kalka
 * z /asks (Asks / Money / Paid / Curators). Stare /re-definition przekierowuje
 * tutaj (redirect w app/re-definition/page.tsx).
 *
 * PODZIAL TRESCI SIE NIE ZMIENIA. Ta zakladka nadal nie ma prawa do ani jednego
 * zdania w czasie przyszlym; rzeczy, ktorych jeszcze nie ma, siedza w zakladce
 * obok, ze statusem. Wspolny adres nie jest pozwoleniem na mieszanie jednego
 * z drugim - jest tylko skroceniem drogi miedzy nimi.
 *
 * === ZAKLADKA W QUERY, NIE W STANIE ===
 * Ten sam powod co na /asks: linki maja dzialac (manifest jest linkowany
 * z feedu, z profili i z /how), a przycisk wstecz ma wracac do poprzedniej
 * zakladki. Przelacznik to dwa <Link>-i, obie zakladki sa serwerowe i statyczne.
 */
function isReDefinitionTab(searchParams: SearchParams | undefined): boolean {
  const tab = searchParams?.tab;
  return (Array.isArray(tab) ? tab[0] : tab) === 're-definition';
}

/**
 * Metadane zalezne od zakladki. Manifest przynosi swoje wlasne z
 * ReDefinitionContent - stoja przy tresci, ktora opisuja, a nie tutaj.
 */
export function generateMetadata({ searchParams }: { searchParams: SearchParams }): Metadata {
  if (isReDefinitionTab(searchParams)) {
    return {
      ...RE_DEFINITION_METADATA,
      alternates: { canonical: 'https://mysphere.fun/how?tab=re-definition' },
    };
  }

  return {
    // Marke doklada `title.template` z layoutu glownego.
    title: 'How it works',
    description:
      'What you can do on MySphere today: post onchain, tip in USDC, sell part of a post, ask a question with a budget, launch a token on the Startpad curve, collect what you are owed, and look up what a vault curator changed.',
    openGraph: {
      title: 'How MySphere works',
      description:
        'Post onchain, tip in USDC, put part of a post behind a payment, ask a question with a budget and seats, launch a token on a bonding curve. Every amount settles onchain with a hash.',
      type: 'article',
    },
  };
}

/* ------------------------------------------------------------------ */

/**
 * === JEDENASCIE KROKOW W JEDNYM MIEJSCU ===
 *
 * Tytul, numer i CENA kazdego kroku sa tu, a nie w JSX-ie ponizej, z jednego
 * powodu: skorowidz na gorze strony i naglowek samego kroku musza podawac to
 * samo. Dwie recznie utrzymywane listy tych samych pozycji rozjezdzaja
 * sie przy pierwszej zmianie ceny - a ta strona zyje z tego, ze cena zgadza sie
 * z rzeczywistoscia.
 *
 * `cost` to PIERWSZY czlon linii kosztu (do pierwszego " · "), `note` to reszta.
 * Podzial nie jest kosmetyczny: skorowidz pokazuje wylacznie `cost`, wiec to
 * musi byc czlon, ktory sam z siebie odpowiada "ile to kosztuje".
 */
type StepMeta = {
  n: string;
  id: string;
  title: string;
  cost: string;
  note: React.ReactNode;
};

const STEPS: StepMeta[] = [
  {
    n: '01',
    id: 'get-in',
    title: 'Get in',
    cost: 'Free',
    note: 'One signature · No gas, no transaction',
  },
  {
    n: '02',
    id: 'post',
    title: 'Write a post that lands onchain',
    cost: 'Gas only',
    note: 'Cheap on Base, usually under a cent',
  },
  {
    n: '03',
    id: 'tip',
    title: 'Pay someone for a post you liked',
    cost: 'Your choice of amount',
    note: 'USDC on Base, or the native token elsewhere',
  },
  {
    n: '04',
    id: 'sell',
    title: 'Sell part of a post',
    cost: 'Free to publish',
    note: 'You set the price readers pay',
  },
  {
    n: '05',
    id: 'ask',
    title: 'Ask a question and put money on it',
    cost: 'You set the budget',
    // Jedyna kwota w walucie w liniach kosztu - i jedyne miejsce, ktore
    // dostaje bursztyn. Stawka "1% per trade" w kroku 09 jest procentem,
    // nie kwota, wiec bursztynu nie dostaje.
    note: (
      <>
        From <span className="font-semibold tabular-nums text-soft-accent-deep">$0.50</span> per seat
      </>
    ),
  },
  {
    n: '06',
    id: 'answer',
    title: "Answer someone else's, and get paid for it",
    cost: 'Free to answer',
    note: 'One signature, no gas',
  },
  {
    n: '07',
    id: 'collect',
    title: 'Collect what you are owed',
    cost: 'Gas only',
    note: 'The amount is already yours',
  },
  /**
   * === TRZY KROKI STARTPADA ===
   * Kolejnosc niesie zaleznosc, tak jak w calej tablicy: bez startu (08)
   * nie ma czym handlowac (09), bez handlu nie ma oplat do odebrania (10).
   * Wszystkie trzy chodza domyslnie na Base mainnet (realny ETH); przelacznik
   * na /startpad ma tez Robinhood Chain (mainnet) oraz testnety Base Sepolia
   * i Arc. Uzasadnienie i zasada kotwiczenia kwot do Base stoja w komentarzu
   * naglowkowym pliku.
   */
  {
    n: '08',
    id: 'launch',
    title: 'Launch a token on Startpad',
    cost: 'Gas only',
    note: 'Base mainnet by default, with real ETH; Robinhood Chain and two testnets in the same switch',
  },
  {
    n: '09',
    id: 'trade',
    title: 'Trade a token on its curve',
    cost: '1% per trade',
    note: 'Taken on every buy and sell, in ETH on Base',
  },
  {
    n: '10',
    id: 'earn',
    title: 'Collect what your token earned',
    cost: 'Gas only',
    note: 'Paid in ETH on Base, never in the token',
  },
  /**
   * === JEDENASTY KROK LAMIE ZASADE KOLEJNOSCI I ROBI TO SWIADOMIE ===
   * Numery na tej stronie znacza zaleznosc: bez portfela nie napiszesz posta,
   * bez posta nie sprzedasz jego czesci. Ten krok nie zalezy od NICZEGO - da
   * sie go zrobic przed krokiem 01, bez portfela i bez podpisu.
   *
   * Mimo to stoi na koncu, a nie na poczatku. Instrukcja zaczynajaca sie od
   * czytania cudzego rejestru odpowiadalaby na pytanie, ktorego nikt nie ma
   * przy pierwszym wejsciu. Sam krok mowi wprost, ze nie potrzebuje niczego
   * z poprzednich dziesieciu - to jest tansze niz przenumerowanie calej
   * strony po to, zeby numer niosl dwie rozne rzeczy naraz.
   */
  {
    n: '11',
    id: 'curators',
    title: 'Look up what changed in a vault',
    cost: 'Free',
    note: 'No wallet and no signature',
  },
  /**
   * === DWUNASTY KROK: DERYWATY NA ARC TESTNET ===
   * Zero zaleznosci od poprzednich jedenastu, tak jak krok 11 - i podobnie
   * jak Startpad (08-10), calosc modulu opisuje JEDEN krok zamiast trzech,
   * bo nie ma tu osobnej "zaloz" / "handluj" / "odbierz" sciezki wartej
   * osobnych numerow na TEJ liscie (maja swoje miejsce na /derivatives).
   *
   * Uczciwosc o "nikt jeszcze nie przeszedl" (patrz naglowek pliku) dotyczy
   * TEGO wdrozenia: kontrakty przeszly wlasna automatyczna weryfikacje
   * skryptu wdrozeniowego i maja 36 testow jednostkowych za soba, ale zadna
   * pozycja nie zostala jeszcze otwarta ani zlikwidowana na tym konkretnym
   * deploymencie w chwili pisania tego kroku.
   */
  {
    n: '12',
    id: 'derivatives',
    title: 'Open a perpetual position on Arc',
    cost: 'Gas to trade',
    note: 'Listing a new feed needs a 100 USDC bond · Arc testnet, not real money',
  },
];

function Step({ meta, children }: { meta: StepMeta; children: React.ReactNode }) {
  return (
    // `scroll-mt`, bo do kazdego kroku prowadzi teraz kotwica ze skorowidza,
    // a belka nawigacji jest przyklejona na gorze.
    <section id={meta.id} className="scroll-mt-24 border-t border-soft-line/70 py-10">
      <div className="mb-3 flex items-baseline gap-3">
        {/* Numer jest tu POPRAWNY, w przeciwienstwie do /re-definition.
            Tam sekcje sa stanami tej samej kwoty, nie krokami, wiec numer nic
            by nie niosl. Tutaj to instrukcja i kolejnosc naprawde ma znaczenie:
            bez portfela nie napiszesz posta, bez posta nie sprzedasz jego czesci.
            Jedyny wyjatek to krok 11 - uzasadnienie stoi przy nim w tablicy STEPS.

            Stala szerokosc rynny: kazdy naglowek zaczyna sie na tym samym
            pionie, wiec wzrok schodzacy po stronie ma po czym isc. */}
        <span className="w-[26px] shrink-0 font-soft-display text-[13px] font-bold tabular-nums text-soft-primary-deep">
          {meta.n}
        </span>
        <h2 className="font-soft-display text-[22px] font-bold leading-[1.2] tracking-[-0.01em] text-soft-ink sm:text-[26px]">
          {meta.title}
        </h2>
      </div>
      <Cost lead={meta.cost}>{meta.note}</Cost>
      <div className="max-w-[64ch]">{children}</div>
    </section>
  );
}

/**
 * Akapit. `lead` dostaje PIERWSZY akapit kroku i tylko on.
 *
 * Jedenascie krokow po kilka akapitow jednego rozmiaru to sciana. Pierwszy akapit
 * niesie sens calego kroku, wiec dostaje wiekszy stopien i ciemniejszy tusz -
 * kto czyta strone naglowkami, dostaje z niej cala tresc, a nie same tytuly.
 */
function P({ lead = false, children }: { lead?: boolean; children: React.ReactNode }) {
  return lead ? (
    <p className="mb-3.5 text-[16px] leading-[1.65] text-soft-ink">{children}</p>
  ) : (
    <p className="mb-3 text-[15px] leading-[1.7] text-soft-ink-muted">{children}</p>
  );
}

function Hi({ children }: { children: React.ReactNode }) {
  return <strong className="font-semibold text-soft-ink">{children}</strong>;
}

/**
 * Koszt kroku.
 *
 * === TRZECIE ZLAMANIE ZASADY BURSZTYNU, ZNALEZIONE I NAPRAWIONE ===
 * Wariant `gas="money"` malowal CALA PIGULKE na bursztyn: obwodke i caly tekst.
 * A tekst w tym wariancie brzmial "Your choice of amount · USDC on Base, or the
 * native token elsewhere" - ani jednej cyfry. Kolor zarezerwowany dla kwot
 * niosl wiec zdanie bez kwoty, na dodatek przez ramke, czyli dokladnie to, czego
 * zasada zabrania. Bursztyn zszedl z komponentu; jedyna prawdziwa kwota na tej
 * stronie ($0.50 w kroku 05) dostaje go w swoim miejscu, na samej liczbie.
 *
 * === DRUGI POWOD TEJ PRZEBUDOWY: TELEFON ===
 * Cala linia byla jedna pigulka. Przy 360px trzyczlonowe zdanie lamalo sie w
 * srodku na trzy wiersze, a rounded-pill zamienialo je w owalna klache. Teraz
 * w pigulce stoi sama cena - jedno do czterech slow, ktore zawsze sie mieszcza -
 * a reszta jest zwyklym tekstem obok i lamie sie jak tekst.
 */
function Cost({ lead, children }: { lead: string; children: React.ReactNode }) {
  return (
    <p className="mb-4 flex flex-wrap items-baseline gap-x-2.5 gap-y-1.5">
      <span className="rounded-pill border border-soft-line bg-soft-surface px-2.5 py-1 font-soft text-[11px] font-bold uppercase tracking-[0.08em] text-soft-ink">
        {lead}
      </span>
      <span className="font-soft text-[12.5px] font-semibold leading-[1.5] text-soft-ink-soft">
        {children}
      </span>
    </p>
  );
}

/**
 * Skorowidz wszystkich krokow z cena kazdego z nich.
 *
 * Strona odpowiada na pytanie "co moge tu zrobic i ile to kosztuje". Do dzis
 * odpowiadala na nie w miejscach oddalonych od siebie o ekran, wiec
 * calosci nie dalo sie zobaczyc naraz - a to wlasnie calosc jest odpowiedzia.
 * Ten blok mowi ja na jednym ekranie, a kazdy wiersz jest kotwica do kroku.
 */
function StepIndex() {
  return (
    <nav
      aria-label="The twelve steps"
      className="mt-10 rounded-card border border-soft-line bg-soft-surface p-4 shadow-card sm:p-5"
    >
      <p className="mb-2 font-soft text-[11px] font-bold uppercase tracking-[0.16em] text-soft-ink-faint">
        Twelve steps, and what each one costs
      </p>
      <ol>
        {STEPS.map((step) => (
          <li key={step.id} className="border-b border-dashed border-soft-line/70 last:border-b-0">
            {/* SIATKA, NIE RZAD. Przy 360px trzy pozycje w jednym rzedzie zostawialy
                tytulowi okolo 120px, wiec kazdy lamal sie na trzy wiersze obok
                jednowierszowej ceny. Do 576px cena schodzi pod tytul, w te sama
                kolumne; wyzej wraca na prawa krawedz. Zaden wariant nie przewija
                w poziomie. */}
            <a
              href={`#${step.id}`}
              className="grid grid-cols-[26px_1fr] items-baseline gap-x-3 gap-y-0.5 py-2.5 transition-colors [transition-duration:var(--dur-press)] ease-out-strong hover:text-soft-primary-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary sm:grid-cols-[26px_1fr_auto]"
            >
              <span className="font-soft-display text-[12px] font-bold tabular-nums text-soft-primary-deep">
                {step.n}
              </span>
              <span className="min-w-0 font-soft-display text-[14px] font-semibold leading-[1.35] text-soft-ink">
                {step.title}
              </span>
              <span className="col-start-2 font-soft text-[11.5px] font-semibold text-soft-ink-soft sm:col-start-3 sm:text-right">
                {step.cost}
              </span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function Go({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="mt-1 inline-flex items-center gap-2 rounded-pill bg-soft-primary-deep px-4 py-2.5 font-soft-display text-[13.5px] font-bold text-white transition-transform [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary focus-visible:ring-offset-2"
    >
      {children}
    </Link>
  );
}

/* ------------------------------------------------------------------ */

function HowContent() {
  return (
    <main className="min-h-screen bg-soft-bg font-soft">
      <div className="mx-auto max-w-[760px] px-5 py-14 sm:px-8 sm:py-20">
        <p className="mb-4 font-soft text-[11px] font-bold uppercase tracking-[0.18em] text-soft-ink-faint">
          How it works
        </p>

        <h1 className="mb-5 font-soft-display text-[34px] font-bold leading-[1.1] tracking-[-0.02em] text-soft-ink sm:text-[44px]">
          Everything here costs somebody money.
          <br />
          That is the point.
        </h1>

        <p className="mb-4 max-w-[58ch] text-[16px] leading-[1.65] text-soft-ink-muted">
          Most feeds measure attention, which is free to give and therefore
          proves nothing. This one measures payments, which are not. Below is
          everything you can do here today: what it costs, what you sign, and
          where the receipt ends up.
        </p>

        <p className="max-w-[58ch] text-[14px] leading-[1.6] text-soft-ink-soft">
          Nothing on this page is a plan. If it is written here, it works right
          now. Where the thing that works has never had anyone go through it,
          the step says so in the step. What is still being built is listed
          on{' '}
          <Link
            href="/how?tab=re-definition"
            className="font-semibold text-soft-primary-deep underline decoration-soft-line underline-offset-4 hover:text-soft-primary"
          >
            Re-Definition
          </Link>
          , with its status next to it.
        </p>

        <p className="mt-3 max-w-[58ch] text-[14px] leading-[1.6] text-soft-ink-soft">
          The deeper version, with the flow, the fees and the onchain proof for
          each part, is what the{' '}
          <Link
            href="/Docs"
            className="font-semibold text-soft-primary-deep underline decoration-soft-line underline-offset-4 hover:text-soft-primary"
          >
            documentation
          </Link>{' '}
          is for.
        </p>

        <StepIndex />

        <div className="mt-10">
          {/* ---------------------------------------------------------- */}
          <Step meta={STEPS[0]}>
            <P lead>
              Connect a wallet, then sign one message. If you do not have a
              wallet, <Hi>Base Account</Hi> makes one with a passkey: your face
              or your fingerprint, no extension and no seed phrase to write down.
            </P>
            <P>
              The signature is not a payment and never becomes one. It exists
              because an address typed into a box proves nothing. Anyone can
              type yours. Signing is the only way the server can tell it is
              actually you, and it is what stands between your paid content and
              a stranger claiming to be you.
            </P>
            <P>
              You need it once. Reading the feed needs nothing at all.
            </P>
          </Step>

          {/* ---------------------------------------------------------- */}
          <Step meta={STEPS[1]}>
            <P lead>
              Write, pick a network, post. The text is written to a contract, so
              the post has a transaction behind it that anyone can open. It is
              more than a row in our database.
            </P>
            <P>
              Seven chains are wired: <Hi>Base</Hi>, Robinhood Chain, Camp,
              Linea, Celo, Ethereum and World Chain. Same feed, same profile
              whichever you pick. If you own a <Hi>.base.eth</Hi> name, you show
              up under it instead of a hex address.
            </P>
            <Go href="/basechat">Open the feed</Go>
          </Step>

          {/* ---------------------------------------------------------- */}
          <Step meta={STEPS[2]}>
            <P lead>
              A tip is the whole thesis in one button. It costs you something,
              so it means something. And it lands with a hash that both of you
              can open.
            </P>
            <P>
              Every tip that settles shows up on <Hi>Paid</Hi>, a public
              timeline of money that moved between two people. Names and
              faces on both ends, and a transaction on every line.
            </P>
            <Go href="/asks?tab=paid">See what people paid each other</Go>
          </Step>

          {/* ---------------------------------------------------------- */}
          <Step meta={STEPS[3]}>
            <P lead>
              Open <Hi>Add a paid section</Hi> under the composer, write the part
              you want to sell and set a price. Everyone sees the free part; only
              people who pay see the rest.
            </P>
            <P>
              Write something above the paywall first, a line everyone can read.
              A locked box with no label gives nobody a reason to open it, and
              the button asks you for it.
            </P>
            <P>
              The paid text is stored where the app itself cannot read it back
              and is only handed out after a payment is recorded. It is{' '}
              <Hi>not encrypted</Hi> though: anybody who pays once can copy it
              anywhere. Price it like something a stranger might repost.
            </P>
          </Step>

          {/* ---------------------------------------------------------- */}
          <Step meta={STEPS[4]}>
            <P lead>
              An <Hi>Ask</Hi> is a question with three numbers: a budget, a
              number of seats and a deadline. People answer, you pay for the
              answers you accept, and each payout is recorded next to the answer
              that earned it.
            </P>
            <P>
              You do not have to go anywhere to start one. Above the box you
              write posts in there is a <Hi>Post / Ask</Hi> switch. Flip it to
              Ask and the same box turns into the question, the budget, the
              seats and the deadline. On an empty form you also get a row of
              ready-made starters (<Hi>Vault risk</Hi>,{' '}
              <Hi>Is this yield real</Hi>, <Hi>What can the owner do</Hi> and
              two more); tapping one fills in all four together, and you edit
              from there. They
              disappear the moment you start typing, so nothing you set gets
              overwritten.
            </P>
            <P>
              If your question is about a Morpho vault on Base, you can attach
              the vault itself instead of pasting an address. The list only
              contains vaults Morpho lists: anyone can deploy a vault and name
              it after a curator they are not, and a picked-from-list vault
              cannot be one of those. Whoever answers sees the same fee and the
              same split of the yield you did.
            </P>
            <P>
              You can lock the budget in an escrow contract on Base before the
              question exists. Then whoever answers can check, before writing a
              word, that the money is really there. The contract has no owner
              and no off switch, so not even we can take it back out.
            </P>
            <P>
              Worth knowing before you do it: <Hi>you would not be first</Hi>.
              A budget has already been locked through this contract from this
              app, on Base mainnet. The address and the source are public, so
              none of this needs our word: open the contract and count the
              events yourself.
            </P>
            <P>
              Answers stay <Hi>sealed</Hi> until you open them. Nobody reads
              anybody else&apos;s and rewrites it slightly to take a seat.
              Everyone answers blind, which is the only way the person who
              actually thought about it is not competing with five paraphrases of
              their own work.
            </P>
            <Go href="/asks">Open Asks</Go>
          </Step>

          {/* ---------------------------------------------------------- */}
          <Step meta={STEPS[5]}>
            <P lead>
              Pick an open Ask with a free seat and write. Check two things
              first: whether the budget is locked in escrow, and the
              author&apos;s <Hi>resolve rate</Hi>, the share of their past Asks
              they actually settled, counted only over ones past their deadline.
            </P>
            <P>
              You do not have to hunt for one. Open asks sit in a strip above
              the feed, with an <Hi>Open</Hi> / <Hi>Resolved</Hi> switch on it.
              An open one you can answer where you stand: the button on the
              card opens the answer box in place, without leaving the feed.
              Resolved shows asks that are closed and paid. Nothing to answer
              there, but each accepted answer carries the transaction that paid
              for it, which is the fastest way to see what this pays before
              you write anything.
            </P>
            <P>
              On an Ask without escrow, nothing is held and nothing forces the
              author to pay. A seat starts at fifty cents and not at fifty
              dollars for that reason.
            </P>
          </Step>

          {/* ---------------------------------------------------------- */}
          <Step meta={STEPS[6]}>
            <P lead>
              <Hi>Money</Hi> answers four questions in one place: what is waiting
              for you, what you locked in your own open Asks, what you earned and
              what you spent. Every line with a hash opens the transaction.
            </P>
            <P>
              When an author resolves an Ask you won, the contract credits you
              and you collect with one click. If your own Ask ran out of time,
              the same page is where the budget comes back, minus the fee, and
              in two steps, because the contract credits you first and moves the
              money when you ask it to.
            </P>
            <P>
              That last button is the one thing on this page we cannot show you
              working on a real chain. Getting a budget back needs the deadline
              plus 48 hours to have passed, and no live network lets you skip
              two days, so the only proof it works is a test on a machine where
              we owned the clock. The button exists, it names the fee, and it
              has never been pressed for real by anyone.
            </P>
            <Go href="/asks?tab=money">Open Money</Go>
          </Step>

          {/* ---------------------------------------------------------- */}
          <Step meta={STEPS[7]}>
            <P lead>
              <Hi>Startpad</Hi> launches a token on a bonding curve: one
              transaction mints the whole billion-token supply straight onto
              the curve, and nobody (you included) gets any of it for free.
              It runs on <Hi>Base mainnet</Hi> by default, so the ETH you sign
              with is real. A switch on the page holds three more networks:
              Robinhood Chain, where the money is also real, and two testnets
              for practice, Base Sepolia and Arc.
            </P>
            <P>
              A <Hi>logo is required</Hi> before the launch button works.
              Upload a file and we store it. An ERC-20 has no image onchain,
              and a token without one is a grey circle on every list forever.
            </P>
            <P>
              Want the first tokens? Add a <Hi>pre-buy</Hi> and it executes
              inside the launch transaction itself: same curve, same 1% fee
              as anyone after you, with no block in between where somebody
              else could buy first.
            </P>
            <P>
              Everything else is fixed at launch and has no setter afterwards:
              your share of the 1% trading fee (anything up to <Hi>70%</Hi>,
              paid to up to 8 addresses you name, with the contract keeping at
              least 30% for the protocol whatever the form says) and a{' '}
              <Hi>buyback</Hi> slider, which takes part of your own share and
              spends it on buying your token back and burning it. Changing any
              of it later means launching a new token.
            </P>
            <P>
              <Hi>Sniper protection</Hi> is a per-wallet buy cap for the first
              5 minutes, and <Hi>Quick launch does not set one</Hi>: it sends
              the launch with the cap equal to the whole supply, which is the
              same as off. The contract&apos;s own default, 16 million tokens
              per wallet, applies only to a direct call. Turn the cap on in
              Creator setup, where you can size it &mdash; and size it above
              your own pre-buy, because it counts against you too. Like
              everything else, it is fixed at launch.
            </P>
            <P>
              One entry in that network switch is not a network.{' '}
              <Hi>✦ $SPHERE</Hi> opens the hub for a token called $SPHERE:
              its escrow, vesting and rewards contracts are deployed on Base
              mainnet, and the panels there read them straight from the chain.
              The token launched on 1 September 2026 and has since{' '}
              <Hi>graduated</Hi> on Base mainnet: its curve is closed and it
              trades in its own Uniswap v4 pool.
            </P>
            <Go href="/startpad">Open Startpad</Go>
          </Step>

          {/* ---------------------------------------------------------- */}
          <Step meta={STEPS[8]}>
            <P lead>
              Every token page has a candlestick chart built from onchain
              events and a buy-and-sell panel next to it. The preview shows
              what you get before you sign, and each trade pays a 1% fee in
              the coin the curve trades in, ETH on Base. Up to 70% of that
              fee goes to the token&apos;s creator.
            </P>
            <P>
              The curve is the other side of every trade: a fixed formula with
              no order book. Buys move the price up, sells move it down, and
              the contract can always pay: selling every circulating token
              back returns exactly the reserve it holds.
            </P>
            <P>
              The curve locks at a fixed target: on Base that is exactly{' '}
              <Hi>3.00 ETH</Hi> in the reserve. The target scales with the
              network, so the Arc testnet counts its curve in USDC. Buys stop;{' '}
              <Hi>selling keeps working</Hi>, so nobody is trapped at the top.
              From then on anyone may call <Hi>graduate()</Hi> (the caller
              earns 1.5% of the reserve for it, so 0.045 ETH on a full 3 ETH
              curve, less if people sold while it was locked) and the
              liquidity moves into a
              Uniswap v4 pool that opens at the exact price the curve closed
              at, locked there forever.
            </P>
            <P>
              The full path, launch to pool to payout, has run end to end on
              Base mainnet: <Hi>$SPHERE graduated</Hi> there, and its pool
              opened at the exact price its curve closed at. It is still the
              exception. Most curves never fill, so a token still trading on
              its curve is the normal case, not a stalled one.
            </P>
          </Step>

          {/* ---------------------------------------------------------- */}
          <Step meta={STEPS[9]}>
            <P lead>
              <Hi>My tokens</Hi>, on the Startpad page, lists every token you
              launched and what its fees have credited you so far, counted to
              the wei: up to 70% of the 1% on every curve trade, and after
              graduation up to 70% of the 1% on every pool swap.
            </P>
            <P>
              Claims are pull-based and paid in the curve&apos;s own currency
              (<Hi>ETH</Hi> on Base), never in the token. Nothing is pushed
              and nothing can be withheld: the
              contracts have no owner, no pause and no setter, so nobody,
              including us, stands between the balance and your claim.
            </P>
            <P>
              If you set a buyback at launch, that slice comes out of this
              money. Your share, not the protocol&apos;s. Anyone may trigger
              the purchase, and the bought tokens go to the dead address,
              provably out of circulation.
            </P>
            <Go href="/startpad">Open My tokens</Go>
          </Step>

          {/* ---------------------------------------------------------- */}
          {/* Krok bez portfela i bez podpisu - jedyny taki na tej stronie.
              Uzasadnienie jego miejsca w kolejnosci stoi przy STEPS[10]. */}
          <Step meta={STEPS[10]}>
            <P lead>
              A Morpho vault has a curator: whoever sets its fee and decides
              what it lends against. They can raise that fee, or hand the vault
              to somebody else, and nobody has to tell the people whose money is
              in it. <Hi>Curators</Hi> is a dated record of exactly that: the
              fee before, the fee after, and the dates we saw it between.
            </P>
            <P>
              It covers the vaults Morpho lists on Base, and it records three
              things and only three: the fee, who curates, and whether a vault
              is on that list. Not the yield, which moves on its own every hour
              and is nobody&apos;s decision. Not what a vault lends against,
              which we do not read. So an empty page there is not proof that a
              vault stayed the same, and the page says so itself.
            </P>
            <P>
              The dates are ranges, not moments. It is one reading a day
              compared with the previous one, so an entry says a change happened
              between two dates, not the hour it happened. It started
              collecting recently, so it can honestly have nothing in it. When
              that is the case, it tells you which of the two it is, an empty
              record or a quiet month.
            </P>
            <P>
              There is nothing about you in there. It reads public vault
              parameters, has no idea which vaults you use, and never touches a
              wallet, yours or anyone else&apos;s.
            </P>
            <Go href="/asks?tab=curators">Open the curator record</Go>
          </Step>

          {/* ---------------------------------------------------------- */}
          <Step meta={STEPS[11]}>
            <P lead>
              <Hi>Arc Derivatives</Hi> is a small vAMM perps module: virtual
              reserves set a mark price the same way a constant-product pool
              would, and a funding payment between longs and shorts
              continuously pulls that price toward an index feed so it
              cannot drift too far from reality. Open one position per
              market, long or short, up to 10x leverage, with at least{' '}
              <Hi>10 USDC</Hi> margin.
            </P>
            <P>
              Anyone can list a market. Post a USDC bond (<Hi>100
              minimum</Hi>) to the price registry and you control that feed
              as its publisher; a second transaction then deploys the actual
              tradeable pool on top of it. The bond is what keeps a feed
              honest: a successful price challenge slashes it and disables
              the feed for good, and it directly sets how much open interest
              the market can carry &mdash; 2x the bond on probation, 8x once
              the feed turns <Hi>mature</Hi> after 7 clean days and 50
              accepted prices with zero challenges.
            </P>
            <P>
              A position becomes liquidatable once its margin ratio drops
              under 6.25%, and anyone can call the liquidation and keep 1.25%
              of the notional for doing it &mdash; there is no permissioned
              keeper list. Any shortfall is covered by a shared{' '}
              <Hi>insurance fund</Hi>; if that fund ever falls short of what
              it is backing, new positions pause across every market at once
              until someone tops it up.
            </P>
            <P>
              <Hi>This deployment is new.</Hi> The contracts are live on Arc
              testnet (chainId 5042002) and passed every check the deploy
              script runs automatically, and the underlying logic carries 36
              unit tests. What has not happened yet, as of writing this: nobody
              has opened, closed, or liquidated a real position on this
              specific deployment. Addresses and the full mechanics &mdash;
              challenges, funding, fees &mdash; are on the module&apos;s own
              page.
            </P>
            <Go href="/derivatives">Open Arc Derivatives</Go>
          </Step>
        </div>

        {/* ---------------------------------------------------------- */}
        {/* Nie jest krokiem, wiec nie ma numeru i zaczyna sie od lewej krawedzi,
            a nie od rynny numerow - brak numeru w tym miejscu jest informacja:
            tego nie da sie "wykonac", to sie czyta przed wykonaniem reszty.
            Naglowek dostaje ten sam stopien co kroki; wczesniej byl 15-punktowa
            wersalikowa etykieta, wiec caly blok czytal sie jak stopka. */}
        <section className="scroll-mt-24 border-t border-soft-line/70 py-10">
          <h2 className="mb-4 font-soft-display text-[22px] font-bold leading-[1.2] tracking-[-0.01em] text-soft-ink sm:text-[26px]">
            Two things worth knowing before you spend anything
          </h2>
          <div className="max-w-[64ch]">
          <P>
            <Hi>Nothing here judges answers.</Hi> Escrow proves the money
            exists, locked and readable, before you write a word. Who deserves
            it is still the author&apos;s call, and there is no appeal. The
            price of refusing to pay is a fee and a public resolve rate, which
            is a price, not a guarantee.
          </P>
          <P>
            <Hi>Onchain means permanent.</Hi> A post written to a contract does
            not come back, and a payment does not reverse. That is what makes
            the numbers here worth anything, and it is also the part that
            deserves a second of thought before you press the button.
          </P>
          </div>
        </section>
      </div>
    </main>
  );
}

/* ------------------------------------------------------------------ */

/** Jedna pigulka przelacznika. Aktywna wyglada jak aktywny wpis w belce. */
function TabPill({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`inline-flex items-center justify-center rounded-pill px-5 py-2 font-soft-display text-[13.5px] font-bold transition-[background-color,color,transform] [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary focus-visible:ring-offset-2 focus-visible:ring-offset-soft-sunken ${
        active ? 'bg-soft-primary text-white shadow-chip' : 'text-soft-ink-muted hover:bg-soft-surface'
      }`}
    >
      {children}
    </Link>
  );
}

export default function HowPage({ searchParams }: { searchParams: SearchParams }) {
  const manifesto = isReDefinitionTab(searchParams);

  return (
    <>
      {/* Przelacznik stoi NAD trescia obu zakladek. Kazda z nich niesie WLASNY
          <main> z tlem i min-h-screen, wiec w DOM jest zawsze dokladnie jeden
          <main>; ten pasek to <nav> nad nim. Szerokosc kolumny sledzi aktywna
          zakladke (instrukcja 760, manifest 1080), zeby pigulki staly nad lewa
          krawedzia tresci, a nie obok niej. */}
      <div className="bg-soft-bg pt-8">
        <div
          className={`mx-auto w-full px-5 sm:px-8 ${manifesto ? 'max-w-[1080px]' : 'max-w-[760px]'}`}
        >
          <nav
            aria-label="How views"
            className="inline-flex items-center gap-1 rounded-pill border border-soft-line bg-soft-sunken p-1"
          >
            <TabPill href="/how" active={!manifesto}>
              How
            </TabPill>
            <TabPill href="/how?tab=re-definition" active={manifesto}>
              Re-Definition
            </TabPill>
          </nav>
        </div>
      </div>

      {manifesto ? <ReDefinitionContent /> : <HowContent />}
    </>
  );
}

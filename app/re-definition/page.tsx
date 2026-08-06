import type { Metadata } from 'next';
import Link from 'next/link';
// @ts-ignore - config CommonJS wspoldzielony z next.config.js
import { DISABLED_ROUTES } from '@/config/routeStatus';

export const metadata: Metadata = {
  // Marke dokłada template z layoutu - patrz komentarz w app/leaderboard/page.tsx.
  title: 'Re-Definition — money buys judgment',
  description:
    'MySphere is becoming the first feed where the buyer can be a machine, the worker is a human, and reputation is minted only by settled payments. Here is how an Ask works.',
  openGraph: {
    title: 'Your judgment has a price. Something is already willing to pay it.',
    description:
      'Ask: a question with a budget, seats and a deadline, paid in USDC on Base. In build — what runs today is listed on the page.',
    type: 'article',
  },
};

/**
 * Strona Re-Definition.
 *
 * Komponent SERWEROWY - zero interaktywnosci, wiec prerenderuje sie do
 * statycznego HTML-a i nie ciagnie ani kilobajta JS-a.
 *
 * To NIE jest changelog ani rejestr wylaczonych modulow (poprzednia wersja nim
 * byla i slusznie zostala zjechana). To jest manifest kierunku: jednostka
 * produktu przestaje byc post, a zaczyna byc post ze stawka.
 *
 * === TRZY CZASY, ROZDZIELONE ===
 * Manifest opisywal Aska w czasie terazniejszym ("The unit is not a post. It
 * is an Ask."), a obok stal rysunek z wymyslonymi danymi. Wlasciciel przeczytal
 * to i nie byl w stanie odroznic tego, co dziala, od tego, czego nie ma - bo
 * strona niczym tego nie odrozniala. Definicje pisze sie w czasie
 * terazniejszym i te naglowki zostaja, ale kazda sekcja o Asku dostaje pod
 * naglowkiem jedna linijke (komponent `State`) mowiaca, czy to stan, budowa,
 * czy kierunek. Blok trzech kolumn w bohaterze mowi to samo zbiorczo, ZANIM
 * czytelnik dojdzie do pierwszego zdania w czasie terazniejszym.
 *
 * Zasada: teza zostaje niezmieniona, zmienia sie tylko czas gramatyczny wokol
 * niej. Slabsza teza nie jest uczciwsza - jest tylko slabsza.
 *
 * Sekcja "What runs today" bierze liczbe zaparkowanych modulow WPROST z
 * `DISABLED_ROUTES` w config/routeStatus.js - z DOKLADNIE tej samej listy,
 * ktora generuje przekierowania w next.config.js. Nie z wlasnej listy
 * przefiltrowanej przez `isRouteDisabled()`, bo to nie jest czytanie zrodla
 * prawdy: taka lista raz juz sie rozjechala i manifest podawal szesc zamiast
 * osmiu. Sam opis modulow ponizej jest pisany recznie - gdy dojdzie kolejny
 * wpis do DISABLED_ROUTES, liczba zaktualizuje sie sama, a wyliczenie w
 * zdaniu trzeba dopisac.
 */

/* ------------------------------------------------------------------ */
/*  Elementy budulcowe                                                 */
/* ------------------------------------------------------------------ */

/**
 * Znacznik sekcji jest KWOTA, nie numerem. To nie ozdoba: kolejne sekcje
 * opisuja te sama kwote w kolejnych stanach - zero (reputacja za darmo),
 * stawka, 402 (zadanie zaplaty), rozliczona suma.
 */
/**
 * Znacznik sekcji jest KWOTA, nie numerem - i siedzi jako stacja na kregoslupie
 * biegnacym przez cala strone.
 *
 * Numer 01/02/03 nie niesie tu zadnej informacji: kolejne sekcje nie sa krokami
 * procesu, tylko STANAMI TEJ SAMEJ KWOTY - zero (reputacja za darmo), stawka,
 * 402 (zadanie zaplaty), rozliczona suma. Kwota niesie cala teze strony, numer
 * nie niosl by nic.
 */
function Marker({ amount, label }: { amount: string; label: string }) {
  return (
    <div className="spine-marker mb-7 flex items-baseline gap-3 py-1">
      <span className="-ml-[26px] flex h-3 w-3 shrink-0 items-center justify-center rounded-full border-2 border-soft-accent bg-soft-bg" aria-hidden="true" />
      <span className="font-soft-display text-[14px] font-bold tabular-nums text-soft-accent-deep">
        {amount}
      </span>
      <span className="h-px flex-1 bg-gradient-to-r from-soft-line to-transparent" />
      <span className="font-soft text-[10px] font-bold uppercase tracking-[0.2em] text-soft-ink-faint">
        {label}
      </span>
    </div>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-4 font-soft-display text-[26px] font-bold leading-[1.15] tracking-[-0.02em] text-soft-ink sm:text-[32px]">
      {children}
    </h2>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="mb-4 text-[15px] leading-[1.7] text-soft-ink-muted">{children}</p>;
}

/** Wyroznienie w tekscie - jedyny akcent w akapicie, uzywany oszczednie. */
function Hi({ children }: { children: React.ReactNode }) {
  return <strong className="font-semibold text-soft-ink">{children}</strong>;
}

/**
 * Czas sekcji, postawiony ZARAZ POD naglowkiem.
 *
 * Manifest jest pisany w czasie terazniejszym, bo tak sie pisze definicje -
 * i wlasnie dlatego czytelnik bral opis Aska za opis produktu. Naglowki
 * zostaja, ale kazdy dostaje jedna linijke mowiaca, o czym on wlasciwie jest:
 * o tym, co dziala, o tym, co powstaje, czy o kierunku. Bez tego zdanie "the
 * unit is not a post, it is an Ask" i zdanie "every tip has its own page"
 * wygladaja identycznie, a jedno z nich jest prawda od miesiecy, a drugie
 * planem sprzed tygodnia.
 */
function State({ tone, children }: { tone: 'live' | 'building' | 'direction'; children: React.ReactNode }) {
  const style =
    tone === 'live'
      ? { dot: 'bg-soft-accent', text: 'text-soft-accent-deep' }
      : tone === 'building'
        ? { dot: 'bg-soft-primary', text: 'text-soft-primary-deep' }
        : { dot: 'border border-soft-line-strong bg-transparent', text: 'text-soft-ink-faint' };

  return (
    <p
      className={`mb-5 flex items-start gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] ${style.text}`}
    >
      <span className={`mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full ${style.dot}`} aria-hidden="true" />
      <span className="leading-[1.5]">{children}</span>
    </p>
  );
}

/* ------------------------------------------------------------------ */
/*  Element sygnaturowy: karta Aska                                    */
/* ------------------------------------------------------------------ */

/**
 * RYSUNEK karty Aska - nie zrzut z produktu.
 *
 * Poprzednia wersja tego komentarza twierdzila, ze "manifest pokazuje produkt,
 * a nie ilustracje produktu". To bylo nieprawda i wlasnie ta nieprawda
 * zdezorientowala czytelnika: kazda liczba tutaj jest wymyslona. Nie ma adresu
 * vault.base.eth z takim wynikiem, nie ma tych siedmiu odpowiedzi, zaden Ask
 * nigdy nie zostal wystawiony. Model danych powstal dopiero dzis
 * (app/utils/asks) i ta karta nie czyta z niego ani jednego pola.
 *
 * Rysunek pogladowy jest w porzadku. Rysunek udajacy rzeczywistosc nie jest.
 * Dlatego zastrzezenie stoi NAD karta, jest czescia podpisu (figure /
 * figcaption), a nie drobnym drukiem pod spodem - i rama karty jest
 * przerywana, zeby bylo to widac, zanim ktokolwiek przeczyta etykiete.
 *
 * Statyczny: odliczanie jest etykieta, nie zegarem, bo strona ma zostac
 * serwerowa i zerojavascriptowa.
 */
function AskCard() {
  return (
    <figure className="relative m-0">
      <figcaption className="mb-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <span className="rounded-pill border border-dashed border-soft-line-strong px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-soft-ink-faint">
          Drawing
        </span>
        <span className="text-[11px] leading-[1.5] text-soft-ink-faint">
          Not a screenshot. Every number below is invented.
        </span>
      </figcaption>
      {/* Poswiata odpowiada stanowi "otwarty" - bursztyn, nie blekit. */}
      <div
        className="pointer-events-none absolute -inset-6 rounded-[28px] bg-soft-accent/[0.07] blur-2xl"
        aria-hidden="true"
      />
      <article className="relative overflow-hidden rounded-card border border-dashed border-soft-line-strong bg-soft-surface shadow-card">
        <div className="flex items-center justify-between border-b border-soft-line/70 bg-soft-accent/[0.06] px-5 py-2.5">
          <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-soft-accent-deep">
            <span className="h-1.5 w-1.5 rounded-full bg-soft-accent" aria-hidden="true" />
            Open ask
          </span>
          <span className="text-[11px] tabular-nums text-soft-accent-deep/80">04:12:39 left</span>
        </div>

        <div className="px-5 py-5">
          <div className="mb-4 flex items-center gap-2.5">
            <span className="h-7 w-7 rounded-full bg-gradient-to-br from-[#0052FF] to-[#00E28A]" aria-hidden="true" />
            <span className="font-soft-display text-[13px] font-semibold text-soft-ink">
              vault.base.eth
            </span>
            <span className="rounded-full border border-soft-accent/30 bg-soft-accent-soft px-2 py-0.5 text-[10px] font-medium tabular-nums text-soft-accent-deep">
              resolved 12/13
            </span>
          </div>

          <p className="mb-5 text-[15px] leading-[1.6] text-soft-ink">
            Our onboarding drops 60% of users between wallet connect and first post. Watch the
            30-second clip, then tell me the one thing you would cut.
          </p>

          <div className="grid grid-cols-3 gap-px overflow-hidden rounded-pill border border-soft-line/70 bg-white/[0.07]">
            {[
              { k: 'Budget', v: '$6.00' },
              { k: 'Seats', v: '2 of 3' },
              { k: 'Per answer', v: '$2.00' },
            ].map((cell) => (
              <div key={cell.k} className="bg-soft-surface px-3 py-3">
                <div className="mb-1 text-[10px] uppercase tracking-[0.12em] text-soft-ink-faint">
                  {cell.k}
                </div>
                <div className="font-soft-display text-[15px] font-semibold tabular-nums text-soft-ink">
                  {cell.v}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-soft-line/70 pt-4">
            <span className="text-[12px] text-soft-ink-faint">7 answers sealed until resolve</span>
            <span className="rounded-lg bg-soft-primary px-3.5 py-1.5 text-[12px] font-semibold text-white">
              Answer
            </span>
          </div>
        </div>
      </article>
      <p className="mt-3 text-[11px] leading-[1.6] text-soft-ink-faint">
        No Ask has ever been posted. What landed today is the data model behind this card — the
        card itself reads nothing from it.
      </p>
    </figure>
  );
}

/* ------------------------------------------------------------------ */
/*  Co dziala dzisiaj                                                  */
/* ------------------------------------------------------------------ */

/**
 * `planned` dopisane celowo. Bez niego tabela miala tylko rzeczy dzialajace,
 * pisane albo wylaczone - a najwazniejsza brakujaca czesc Aska (escrow) nie
 * miescila sie w zadnej z tych szuflad i przez to nie bylo jej na liscie
 * wcale. Kropka jest pusta, bo nic za nia jeszcze nie stoi.
 */
type Status = 'live' | 'wired' | 'building' | 'planned' | 'off';

const STATUS_STYLE: Record<Status, { dot: string; text: string; label: string }> = {
  live: { dot: 'bg-soft-accent', text: 'text-soft-accent-deep', label: 'live' },
  wired: { dot: 'bg-soft-accent', text: 'text-soft-accent-deep', label: 'wired, switch off' },
  building: { dot: 'bg-soft-primary', text: 'text-soft-primary-deep', label: 'building' },
  planned: {
    dot: 'border border-soft-line-strong bg-transparent',
    text: 'text-soft-ink-faint',
    label: 'not built',
  },
  off: { dot: 'bg-soft-line-strong', text: 'text-soft-ink-faint', label: 'switched off' },
};

const CAPABILITIES: { name: string; status: Status; note: string }[] = [
  {
    name: 'Feed and posts',
    status: 'live',
    note: 'Post across seven chains. Every post has its own page and its own share card.',
  },
  {
    name: 'Tips',
    status: 'live',
    note: 'ETH and USDC. A tip is recorded only after the receipt confirms the transfer landed.',
  },
  {
    name: 'Basename identity',
    status: 'live',
    note: 'Names resolve both ways, so a name shown on a post is a name that address really owns.',
  },
  {
    name: 'Wallet sign-in',
    status: 'live',
    note: 'You sign a message, the server checks the signature onchain. Smart wallets included.',
  },
  {
    name: 'Agent registry',
    status: 'live',
    note: 'An agent is an address with a public record: who runs it, what it does, how it scored.',
  },
  {
    name: 'Tip receipts',
    status: 'live',
    note: 'Every tip gets a page and a share card carrying the amount, both names and the transaction.',
  },
  {
    name: 'The money timeline',
    status: 'live',
    note: 'A public feed of payments between people. Every line carries a transaction you can open.',
  },
  {
    name: 'Paid sections',
    status: 'live',
    note: 'Text sold per post. It is stored outside the feed, so it is not in the page you did not pay for.',
  },
  {
    name: 'x402 payment rails',
    status: 'wired',
    note: 'Endpoints already speak 402. Enforcement turns on the moment a payout address is set.',
  },
  {
    name: 'Ask: data model',
    status: 'building',
    note: 'Landed today. Budget, seats, deadline, resolve rate, and answers sealed by a rule the client cannot read past.',
  },
  {
    name: 'Ask: in the feed',
    status: 'building',
    note: 'Routes and the composer are being written now. Nothing about an Ask is visible in the feed yet.',
  },
  {
    name: 'Ask: escrow',
    status: 'planned',
    note: 'Money locked at creation needs a contract that does not exist. The first version pays at resolve instead.',
  },
];

function CapabilityRow({ cap }: { cap: (typeof CAPABILITIES)[number] }) {
  const style = STATUS_STYLE[cap.status];
  return (
    <div className="grid grid-cols-[1fr_auto] items-start gap-x-5 gap-y-1.5 border-t border-soft-line/70 py-4 sm:grid-cols-[168px_1fr_auto] sm:items-center">
      <span className="font-soft-display text-[14px] font-semibold text-soft-ink">
        {cap.name}
      </span>
      <span className="order-3 col-span-2 text-[13px] leading-relaxed text-soft-ink-soft sm:order-none sm:col-span-1">
        {cap.note}
      </span>
      <span className={`flex items-center gap-2 whitespace-nowrap text-[11px] ${style.text}`}>
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${style.dot}`} aria-hidden="true" />
        {style.label}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export default function ReDefinitionPage() {
  // Liczba WPROST z konfiguracji przekierowan.
  //
  // Wczesniej stala tu wlasna lista szesciu sciezek przefiltrowana przez
  // isRouteDisabled - z komentarzem obiecujacym, ze strona "nie moze rozjechac
  // sie z produkcja". Mogla i rozjechala sie: DISABLED_ROUTES ma osiem pozycji,
  // bo doszly '/MyAgents' i '/MyClaw', a lista tutaj ich nie znala. Manifest
  // podawal wiec liczbe mniejsza od prawdy - na stronie, ktorej cala teza brzmi
  // "no promises, only state".
  //
  // Filtrowanie wlasnej listy przez isRouteDisabled() nie jest czytaniem
  // zrodla prawdy. Czytaniem zrodla prawdy jest wziecie samego zrodla.
  const parked = DISABLED_ROUTES.length;

  return (
    <main className="min-h-screen bg-soft-bg font-soft">
      {/* ---------------- HERO ---------------- */}
      <section className="border-b border-soft-line/70 px-5 pb-16 pt-16 sm:px-8 sm:pb-20 sm:pt-20">
        <div className="mx-auto grid max-w-[1080px] gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-16">
          <div>
            <p className="mb-6 flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-soft-ink-faint">
              Re-Definition
              <span className="h-3 w-px bg-soft-line-strong" aria-hidden="true" />
              <span className="text-soft-primary-deep">Base · USDC · x402</span>
            </p>

            <h1 className="mb-6 font-soft-display text-[38px] font-bold leading-[1.05] tracking-[-0.03em] text-soft-ink sm:text-[54px]">
              Your judgment has a price.
              <br />
              <span className="text-soft-accent-deep">Something is already willing to pay it.</span>
            </h1>

            <p className="mb-7 max-w-[46ch] text-[17px] leading-[1.6] text-soft-ink-muted">
              MySphere is becoming the first feed where the buyer can be a machine, the worker is a
              person, and the only reputation that counts is the one you cannot mint without
              spending money.
            </p>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/basechat"
                className="rounded-pill bg-soft-primary px-5 py-3 text-[14px] font-semibold text-white transition hover:bg-soft-primary-deep"
              >
                Open the feed
              </Link>
              <a
                href="#ask"
                className="rounded-pill border border-soft-line px-5 py-3 text-[14px] font-semibold text-soft-ink transition hover:border-white/25 hover:bg-soft-surface"
              >
                How an Ask works
              </a>
            </div>

            {/* TRZY CZASY, ROZDZIELONE NA GORZE.
                Cala reszta strony opisuje Aska w czasie terazniejszym, bo tak
                sie pisze definicje. Czytelnik ma prawo wziac to za stan
                produktu - i wzial. Ten blok stoi przed pierwszym takim zdaniem
                i mowi, ktore zdania sa o czym. */}
            <dl className="mt-9 grid gap-y-4 border-t border-soft-line/70 pt-6 sm:grid-cols-3 sm:gap-x-6">
              {[
                {
                  t: 'Runs today',
                  d: 'Posts, tips, receipts and a public timeline of payments. Every amount settled onchain.',
                },
                {
                  t: 'Being built',
                  d: 'The Ask. Data model and sealed answers landed today. Nothing of it is in the feed yet.',
                },
                {
                  t: 'Direction',
                  d: 'Escrow, machine buyers over x402, and a price per seat set by settled payments.',
                },
              ].map((item) => (
                <div key={item.t}>
                  <dt className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-soft-ink-faint">
                    {item.t}
                  </dt>
                  <dd className="text-[13px] leading-[1.55] text-soft-ink-soft">{item.d}</dd>
                </div>
              ))}
            </dl>
          </div>

          <AskCard />
        </div>
      </section>

      {/* KREGOSLUP KWOT. Pionowa linia laczaca znaczniki sekcji, ktora rysuje
          sie w miare przewijania - czytelnik widzi, ile drogi kwota juz
          przebyla. To JEDYNA animacja sterowana pozycja na tej stronie; reszta
          jest nieruchoma, bo to strona do czytania, a ruch obok tekstu
          konkuruje z kazdym zdaniem.

          Zrobiona przez `animation-timeline: view()`, czyli bez jednej linii
          JavaScriptu. Gdzie przegladarka tego nie ma, linia jest po prostu
          narysowana w calosci - strona nie traci niczego poza efektem. */}
      <div className="relative mx-auto max-w-[720px] px-5 pl-10 sm:px-8 sm:pl-12">
        <span className="spine-track" aria-hidden="true" />
        <span className="spine-fill" aria-hidden="true" />
        {/* ---------------- $0.00 ---------------- */}
        <section className="py-16">
          <Marker amount="$0.00" label="what a like is worth" />
          <H2>Free reputation is priced correctly</H2>
          <P>
            A like costs nothing to give, so a thousand of them prove nothing. Every social product
            of the last decade solved this by measuring attention harder. None of them solved it by
            making the signal expensive.
          </P>
          <P>
            The agent economy landed in the same ditch from the other side. There are{' '}
            <Hi>more than 230 platforms</Hi> where an AI agent can supposedly be hired. Across the
            ones that publish numbers, real payouts total in the{' '}
            <Hi>low hundreds of dollars</Hi> — one of the largest reports 283 completed tasks in its
            entire history. Where there is a crowd, there is no money. Where there is money, there
            is no crowd.
          </P>
          <P>
            Nobody closed the loop: <Hi>paid → rated → cheaper or pricier next time</Hi>. That loop
            is the whole product now.
          </P>
        </section>

        {/* ---------------- $2.00 ---------------- */}
        <section id="ask" className="scroll-mt-8 py-16">
          <Marker amount="$2.00" label="one seat, one answer" />
          <H2>The unit is not a post. It is an Ask.</H2>
          <State tone="building">Being built — this section is a design</State>
          <P>
            An Ask is a question with a budget, a number of seats and a deadline. You set all three
            and it appears in the feed as a card that counts down. That is the definition, and the
            feed does not do it yet.
          </P>
          <P>
            Answers stay <Hi>sealed until you resolve</Hi>. Nobody can read what anyone else wrote,
            so nobody can rewrite it slightly and take a seat with it. When you pick your answers,
            payout leaves immediately and every accepted answer carries a link to the transaction on
            Basescan. Then all answers open at once.
          </P>
          <P>
            One part of that stopped being a drawing today. Answer text does not sit inside the Ask.
            It goes to <Hi>its own collection the app is forbidden to read</Hi> — the rule is
            literally <code className="rounded bg-soft-sunken px-1.5 py-0.5 text-[13px] text-soft-ink">if false</code> — and only a server route hands it
            back, to the people allowed to have it. Hiding text in the interface would not be
            sealing it: while it sits in a document the feed reads, it is already in the network
            response and every reader has it. Paid sections already work exactly this way; the Ask
            reuses that plumbing rather than inventing its own.
          </P>
          <P>
            Let the deadline pass without resolving and unclaimed seats return to you, minus fee —
            and your <Hi>resolve rate</Hi> drops in public, on the front of every Ask you post
            afterwards. Taking money out of the feed costs you the same way putting bad answers in
            does.
          </P>
          <P>
            One promise here is not kept yet. Funding an Ask once, up front, needs an escrow
            contract, and <Hi>there is no such contract</Hi>. The first version pays at resolve
            instead: the author sends USDC to each accepted answer and the hash is stored beside it
            forever. Weaker, and named below rather than dressed up.
          </P>
        </section>

        {/* ---------------- 402 ---------------- */}
        <section className="py-16">
          <Marker amount="402" label="payment required" />
          <H2>The buyer does not have to be human</H2>
          <State tone="building">
            Rails wired — the Ask endpoint they point at is still being written
          </State>
          <P>
            An agent has no browser, no wallet popup and no account. What it does have is money and
            a standard for spending it. On Base, that standard is x402: the resource answers a
            request with <Hi>402 Payment Required</Hi> and its price, the agent signs a USDC
            authorization inside whatever spending cap its owner set, and retries. No sign-up, no
            API key, no invoice.
          </P>
          <P>
            So an agent can post an Ask the same way you can — <code className="rounded bg-soft-sunken px-1.5 py-0.5 text-[13px] text-soft-ink">GET /api/asks</code> to see
            the price, sign, then <code className="rounded bg-soft-sunken px-1.5 py-0.5 text-[13px] text-soft-ink">POST</code> the question. Your answer
            comes back to it as JSON when you deliver it.
          </P>
          <P>
            Every marketplace in this space sells machine work to humans. This one sells{' '}
            <Hi>human judgment to machines</Hi>. That shelf is empty, and it is the one thing a
            model genuinely cannot do for itself.
          </P>
        </section>

        {/* ---------------- $340 ---------------- */}
        <section className="py-16">
          <Marker amount="$340" label="the only score that costs money" />
          <H2>Reputation you cannot buy, because it is not for sale</H2>
          <State tone="direction">
            Direction — resolve rate is in the model, the rest is not built
          </State>
          <P>
            Both sides carry the same object. As an answerer:{' '}
            <Hi>earned, answers accepted, accept rate</Hi>. As an asker:{' '}
            <Hi>paid, asks resolved, resolve rate</Hi>. Every number is written by a settled
            payment. There is no way to raise it that does not involve money actually moving.
          </P>
          <P>
            And it buys something real. A high accept rate opens new Asks to you first, for thirty
            seconds, before anyone else sees them, and unlocks the categories above $10. A low
            resolve rate pushes your Ask down the feed and raises the deposit you have to put up.
          </P>
          <P>
            It is deliberately <Hi>not a token and not an NFT</Hi>. Transferable reputation is
            purchasable reputation, and that is the defect every onchain identity standard is still
            arguing about. Yours is welded to your payment history, which is not for sale.
          </P>
        </section>

        {/* ---------------- profil ---------------- */}
        <section className="py-16">
          <Marker amount="/u/" label="one page, two readers" />
          <H2>A profile that is a CV and a receipt at once</H2>
          <State tone="direction">
            Page is live and counts tips — the answer figures below need Asks first
          </State>
          <P>
            One public page per address, readable by a person and by a crawler:{' '}
            <Hi>earned $340 across 112 answers, 91% accepted</Hi>. Nothing on it is self-reported.
            It is the page you link when someone asks what you actually know, and it is the page an
            agent reads before it decides your seat is worth $2 or $20.
          </P>
        </section>

        {/* ---------------- paragon ---------------- */}
        <section className="py-16">
          <Marker amount="0x…" label="the part that travels" />
          <H2>A receipt spreads. A screenshot does not.</H2>
          <State tone="live">Running today — every line below is checkable onchain</State>
          <P>
            Every tip already has its own page and its own share card: the amount, both names,
            the transaction. Paste it anywhere and the preview shows the number before anyone
            clicks. <Hi>Nothing on it is self-reported</Hi> — open the explorer and check it
            against the chain.
          </P>
          <P>
            This is not decoration. Through 2026, the thing that actually moved crypto links
            was the preview that carried a live number — prediction markets grew on link cards
            showing real-time odds, not on their content. Meanwhile the platform experiment in
            onchain social went the other way: <Hi>Base shut down its own social feed and
            creator rewards in February 2026</Hi> and moved to trading, payments and agents.
          </P>
          <P>
            So we are not building another feed. We are building objects that carry a
            verifiable amount and travel on their own — a receipt today, an Ask next.
          </P>
          <P>
            The first of them is already live, and it is the one thing here that exists nowhere
            else: <Hi>a public timeline of payments between people</Hi>. Not a leaderboard of
            points, not a wall of likes — the money itself, in the order it landed, every line
            carrying a transaction you can open and check against the chain. Every social product
            has a feed of what people said. None has a feed of what people paid each other.
          </P>
          <p className="mb-4">
            <Link
              href="/leaderboard"
              className="inline-flex items-center gap-2 rounded-pill bg-soft-accent-soft px-4 py-2.5 font-soft-display text-[13.5px] font-bold text-soft-accent-deep transition-transform duration-[--dur-press] ease-out-strong active:scale-[0.97]"
            >
              Watch the money land →
            </Link>
          </p>
        </section>

        {/* ---------------- stan ---------------- */}
        <section className="py-16">
          <Marker amount="today" label="no promises, only state" />
          <H2>What runs right now</H2>
          <State tone="live">Today, not the plan</State>
          <P>
            The count of parked modules is read from the live routing config when this page is
            built, so that number cannot drift from production. The rows are written by hand,
            status included — which is why three of them say the Ask is not finished.
          </P>
          <div className="mt-8">
            {CAPABILITIES.map((cap) => (
              <CapabilityRow key={cap.name} cap={cap} />
            ))}
            <div className="border-t border-soft-line/70" />
          </div>
          <p className="mt-7 text-[14px] leading-[1.7] text-soft-ink-soft">
            {parked} older modules — the minting camp, the identity page, the marketplace, the
            morning game, the attention scanner, the swap widget, the agent directory, the skills
            catalogue — are parked. They were surface area, not a product. Everything that mattered
            in them was one address doing something another address could verify, and that is
            exactly what an Ask is.
          </p>
        </section>

        {/* ---------------- ryzyko ---------------- */}
        <section className="py-16">
          <Marker amount="risk" label="stated up front" />
          <H2>What could be wrong about all this</H2>
          <P>
            The bet is not on agents. It is on there being a person willing to pay real money for an
            answer from strangers in a feed. Machine demand is the second layer — it is what makes
            this unlike anything else, but the first dollars will come from founders, projects and
            traders paying humans.
          </P>
          <P>
            The biggest hole is <Hi>escrow, and it is missing</Hi>. Funding an Ask up front means
            the money is locked the moment it is posted, and no contract in this repo locks
            anything. So in the first version the order is reversed: you answer, then you get paid —
            or you do not, because the author went quiet and nothing onchain stops them. The whole
            risk of an Ask sits on the person doing the work.
          </P>
          <P>
            What stands in for the lock is the <Hi>resolve rate</Hi>: the share of Asks an author
            actually settled, counted only over Asks whose deadline has already passed, printed on
            the front of every Ask they post next. That is a reputation cost, not a guarantee.
            Answering someone with no history means trusting a person rather than a contract, which
            is why a seat starts at fifty cents and not at fifty dollars. Escrow is the next thing
            that has to exist, and until it does, this page will not call it done.
          </P>
          <P>
            Nothing is held in the meantime — payment goes wallet to wallet at resolve. No fiat, no
            custody of your keys, no investment advice categories, and the longest an Ask can stay
            open is seven days. If the answers turn out to be slop, the product dies of quality and
            no amount of onchain plumbing saves it — so seats are limited, wallets have to be older
            than a week or carry a Basename, and accept rate gates the money.
          </P>
        </section>

        {/* ---------------- docs ---------------- */}
        <section className="border-t border-soft-line/70 py-16">
          <h2 className="mb-6 font-soft-display text-[15px] font-semibold uppercase tracking-[0.14em] text-soft-ink-faint">
            Read further
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { href: '/Docs', label: 'Documentation', note: 'Index of everything written down.', external: false },
              {
                href: '/mysphere-whitepaper-english.html',
                label: 'Whitepaper',
                note: 'The long version, including tokenomics.',
                external: true,
              },
              {
                href: 'https://github.com/Story91/mysphere',
                label: 'Source',
                note: 'The app, in the open.',
                external: true,
              },
              { href: '/basechat', label: 'The feed', note: 'Where all of this happens.', external: false },
            ].map((link) => {
              const inner = (
                <>
                  <span className="mb-1 flex items-center gap-1.5 font-soft-display text-[14px] font-semibold text-soft-ink">
                    {link.label}
                    {link.external && (
                      <span className="text-[11px] text-soft-ink-faint" aria-hidden="true">
                        ↗
                      </span>
                    )}
                  </span>
                  <span className="text-[13px] text-soft-ink-soft">{link.note}</span>
                </>
              );
              const cls =
                'flex flex-col rounded-pill border border-soft-line/70 bg-soft-surface px-4 py-4 transition hover:border-[#0052FF]/50 hover:bg-soft-surface';
              return link.external ? (
                <a key={link.href} href={link.href} target="_blank" rel="noreferrer" className={cls}>
                  {inner}
                </a>
              ) : (
                <Link key={link.href} href={link.href} className={cls}>
                  {inner}
                </Link>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}

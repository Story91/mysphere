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
 * Czy pokazywac blok "Read further" na samym dole strony.
 *
 * WYLACZONY NA ZYCZENIE WLASCICIELA. Kod bloku zostaje nizej, gotowy do
 * wlaczenia jednym slowem. Uzasadnienie przy samym bloku.
 */
const SHOW_READ_FURTHER = false;

/* ------------------------------------------------------------------ */
/*  Kontrakty                                                          */
/* ------------------------------------------------------------------ */

/**
 * === KAZDY ADRES TUTAJ BYL ODCZYTANY Z LANCUCHA, NIE Z KOMENTARZA ===
 *
 * Weryfikacja: scripts/verifyOnchainInventory.js. Dla kazdej pozycji
 * `eth_getCode` != '0x' na DEKLAROWANEJ sieci, a tam gdzie kontrakt wystawia
 * tozsamosc (name / symbol / owner / TOKEN / FEE_BPS) - odczytana i zgodna.
 * Dziewiec naszych kontraktow ma `owner()` rowny temu samemu skarbcowi
 * 0xF1fa2002..., co jest mocniejszym dowodem "to nasze" niz sam bytecode.
 *
 * === CZEGO TU CELOWO NIE MA ===
 * Cztery adresy z tego repozytorium NIE PRZESZLY weryfikacji i dlatego ich tu
 * nie ma. Ta lista istnieje takze po to, zeby nikt ich tu nie dopisal:
 *
 *   0xF90733b9... i 0xf528f920... - kod aplikacji podaje je jako targ IP-NFT
 *     i kolekcje na Camp (484). Na tym lancuchu maja code=0x, balance=0
 *     I nonce=0, czyli nigdy nic tam nie zrobily. Nie sa ani kontraktem, ani
 *     uzywanym portfelem. marketplace/page.tsx pokazuje jeden z nich
 *     uzytkownikowi jako "IP Live source" - to osobny blad do naprawy.
 *   0x0222ffA0... - deklarowana fabryka smart-kont CDP. Brak kodu na 84532
 *     I na 8453, a do tego BLEDNA SUMA KONTROLNA EIP-55: `getAddress()` go
 *     odrzuca. Adres skopiowany z eksploratora nie moze miec zlego checksumu,
 *     wiec ten zostal przepisany recznie.
 *   0x2Ca8E0C6... - opisany w tescie jako Chainlink VRF Coordinator. Na
 *     Base Sepolii nie ma tam kodu.
 *
 * === CZEGO TU NIE MA Z INNEGO POWODU ===
 * Sieci testowych (AskEscrow i USDC na Base Sepolii, L2Resolver na 84532,
 * gra BaseMorning) - to nie sa pieniadze i mieszalyby sie z mainnetem.
 * Portfeli: skarbiec, admin i odbiorca prowizji to adresy EOA, nie kontrakty,
 * a jeden adres wpisany na sztywno w trase recznego przypinania nalezy do
 * prywatnej osoby i nie ma prawa trafic na strone publiczna.
 *
 * === LICZB POSTOW TU NIE MA CELOWO ===
 * Weryfikacja odczytala je (Base 15 827, Celo 451, Linea 87, World 7,
 * Ethereum 6, Camp 40), ale kazda z nich zestarzeje sie nastepnego dnia,
 * a ta strona nie moze podawac liczb, ktorych nie odswieza. Eksplorer pod
 * linkiem pokazuje stan biezacy - i o to chodzi.
 *
 * NIE DOPISUJ TU NICZEGO BEZ URUCHOMIENIA scripts/verifyOnchainInventory.js.
 */
type ContractRow = {
  what: string;
  chain: string;
  address: string;
  line: string;
  explorer: string;
};

const CONTRACT_GROUPS: { title: string; note: string; rows: ContractRow[] }[] = [
  {
    title: 'Ours',
    note: 'Written in this repository and deployed by us. Nine of them answer to the same owner address, which is how you can tell they belong together.',
    rows: [
      {
        what: 'Ask escrow',
        chain: 'Base',
        address: '0xD5f65Cfbe6A1AA1B6f82CBE0A336DDFCD39a5340',
        line: 'Holds the USDC budget for an Ask until the author accepts answers. Source is verified — you can read it before you write a word.',
        explorer: 'https://basescan.org/address/0xD5f65Cfbe6A1AA1B6f82CBE0A336DDFCD39a5340#code',
      },
      {
        what: 'Posts',
        chain: 'Base',
        address: '0x6e1811A5401dfC30E8F3E2DD9dE0Bbe156F97aC7',
        line: 'Writes post content on Base.',
        explorer: 'https://basescan.org/address/0x6e1811A5401dfC30E8F3E2DD9dE0Bbe156F97aC7',
      },
      {
        what: 'Paid pins',
        chain: 'Base',
        address: '0x163bd9Ec5267491963163dE70D0B64f9400a20AD',
        line: 'Records a paid pin that keeps a post at the top of the list, and for how long.',
        explorer: 'https://basescan.org/address/0x163bd9Ec5267491963163dE70D0B64f9400a20AD',
      },
      {
        what: 'Posts',
        chain: 'Robinhood',
        address: '0xd02A166A186bcc5C537FeCD5103E9c1A94Bb49D6',
        line: 'Writes posts on Robinhood Chain.',
        explorer: 'https://robinhoodchain.blockscout.com/address/0xd02A166A186bcc5C537FeCD5103E9c1A94Bb49D6',
      },
      {
        what: 'Posts',
        chain: 'Camp',
        address: '0x71bE438ee579de33EBf353579A413439Db042CA5',
        line: 'Writes posts on Camp Network.',
        explorer: 'https://camp.cloud.blockscout.com/address/0x71bE438ee579de33EBf353579A413439Db042CA5',
      },
      {
        what: 'Portal badge',
        chain: 'Camp',
        address: '0x57CC99c9E1942a34a0cfF7FCC27c227455f14587',
        line: 'An NFT badge, claimable once per address.',
        explorer: 'https://camp.cloud.blockscout.com/address/0x57CC99c9E1942a34a0cfF7FCC27c227455f14587',
      },
      {
        what: 'Posts',
        chain: 'Celo',
        address: '0xA79651c953A987C815b3f5b82b69492e437CcFED',
        line: 'Writes posts on Celo.',
        explorer: 'https://celoscan.io/address/0xA79651c953A987C815b3f5b82b69492e437CcFED',
      },
      {
        what: 'Posts',
        chain: 'Ethereum',
        address: '0x7c4C79176dc098Fb304E4AcD4e93b1a1DfCF1749',
        line: 'Writes posts on Ethereum mainnet.',
        explorer: 'https://etherscan.io/address/0x7c4C79176dc098Fb304E4AcD4e93b1a1DfCF1749',
      },
      {
        what: 'Posts',
        chain: 'Linea',
        address: '0x9fB36660849D85CEe6609f6020af3336aB7541f5',
        line: 'Writes posts on Linea.',
        explorer: 'https://lineascan.build/address/0x9fB36660849D85CEe6609f6020af3336aB7541f5',
      },
      {
        what: 'Posts',
        chain: 'World Chain',
        address: '0xFF426EA2f562C6866edA81981C2420bC574eA2DF',
        line: 'Writes posts on World Chain.',
        explorer: 'https://worldscan.org/address/0xFF426EA2f562C6866edA81981C2420bC574eA2DF',
      },
    ],
  },
  {
    title: 'Not ours — but money moves through them',
    note: 'Tokens and one name resolver. We did not write these and we cannot change them; they are listed because your money passes through them.',
    rows: [
      {
        what: 'USDC',
        chain: 'Base',
        address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        line: 'The currency for tips and for every Ask budget held in escrow.',
        explorer: 'https://basescan.org/address/0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      },
      {
        what: 'USDG',
        chain: 'Robinhood',
        address: '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168',
        line: 'Global Dollar. Robinhood Chain has no canonical USDC, and of the stablecoins there this is the one that supports signed transfers — so it is the only one a machine can pay with, without holding gas.',
        explorer: 'https://robinhoodchain.blockscout.com/address/0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168',
      },
      {
        what: 'WLD',
        chain: 'World Chain',
        address: '0x2cFc85d8E48F8EAB294be644d9E25C3030863003',
        line: 'The tipping token on World Chain.',
        explorer: 'https://worldscan.org/address/0x2cFc85d8E48F8EAB294be644d9E25C3030863003',
      },
      {
        what: 'LINEA',
        chain: 'Linea',
        address: '0x1789e0043623282D5DCc7F213d703C6D8BAfBB04',
        line: 'The tipping token on Linea.',
        explorer: 'https://lineascan.build/address/0x1789e0043623282D5DCc7F213d703C6D8BAfBB04',
      },
      {
        what: 'Basenames resolver',
        chain: 'Base',
        address: '0xC6d566A56A1aFf6508b41f6c90ff131615583BCD',
        line: 'Turns an address into a readable .base.eth name.',
        explorer: 'https://basescan.org/address/0xC6d566A56A1aFf6508b41f6c90ff131615583BCD',
      },
    ],
  },
];

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
        This card is still a drawing and reads nothing. Asks are real now, but they are on{' '}
        <a href="/asks" className="underline decoration-soft-line-strong underline-offset-2">
          /asks
        </a>{' '}
        — not in the feed, and not here.
      </p>
    </figure>
  );
}

/* ------------------------------------------------------------------ */
/*  Co dziala dzisiaj                                                  */
/* ------------------------------------------------------------------ */

/**
 * `planned` dopisane celowo. Bez niego tabela miala tylko rzeczy dzialajace,
 * pisane albo wylaczone - a brakujace czesci Aska nie miescily sie w zadnej
 * z tych szuflad i przez to nie bylo ich na liscie wcale. Kropka jest pusta,
 * bo nic za nia jeszcze nie stoi.
 *
 * Escrow przeszlo z `planned` na `live` - kontrakt stoi na mainnecie i sciezka
 * zakladania go wola. Ale `planned` NIE zniknelo z tabeli i nie ma prawa
 * zniknac: zwrot po wygasnieciu istnieje w kontrakcie i NIE MA go w interfejsie,
 * a Ask dalej nie pokazuje sie w feedzie. Wpisanie escrow jako `live` przy
 * jednoczesnym skasowaniu tych dwoch wierszy zamienilo by ta tabele w reklame.
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
    name: 'Ask: post and answer',
    status: 'live',
    note: 'Budget, seats, deadline, resolve rate. Answers are sealed by a rule the client cannot read past, and the author can accept and resolve from /asks.',
  },
  {
    name: 'Ask: escrow',
    status: 'live',
    note: 'AskEscrow on Base, 0xD5f65Cfbe6A1AA1B6f82CBE0A336DDFCD39a5340, source-verified. Choosing it takes the budget from your wallet before the Ask exists.',
  },
  {
    name: 'Ask: expiry refund in the interface',
    status: 'planned',
    note: 'The contract returns an unresolved budget after the deadline plus 48h. Nothing in the product calls it, so today that is a contract call made by hand.',
  },
  {
    name: 'Ask: in the feed',
    status: 'planned',
    note: 'Asks live on their own page. Nothing about an Ask is visible in the feed yet.',
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
                  d: 'Posts, tips, receipts and a public timeline of payments. Asks, with the budget lockable in an escrow contract on Base. Every amount settled onchain.',
                },
                {
                  t: 'Being built',
                  d: 'The Ask in the feed, and a way to take an expired budget back without calling the contract by hand.',
                },
                {
                  t: 'Direction',
                  d: 'Machine buyers over x402, and a price per seat set by settled payments.',
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
          <State tone="live">Runs on /asks — not in the feed</State>
          <P>
            An Ask is a question with a budget, a number of seats and a deadline. You set all three
            and it appears as a card that counts down. It runs on its own page; the feed still does
            not carry it.
          </P>
          <P>
            Answers stay <Hi>sealed until you resolve</Hi>. Nobody can read what anyone else wrote,
            so nobody can rewrite it slightly and take a seat with it. When you pick your answers,
            every accepted answer carries a link to the transaction on Basescan. Then all answers
            open at once.
          </P>
          <P>
            The sealing is not a curtain in the interface. Answer text does not sit inside the Ask.
            It goes to <Hi>its own collection the app is forbidden to read</Hi> — the rule is
            literally <code className="rounded bg-soft-sunken px-1.5 py-0.5 text-[13px] text-soft-ink">if false</code> — and only a server route hands it
            back, to the people allowed to have it. Hiding text in the interface would not be
            sealing it: while it sits in a document the feed reads, it is already in the network
            response and every reader has it. Paid sections already work exactly this way; the Ask
            reuses that plumbing rather than inventing its own.
          </P>
          <P>
            Funding an Ask once, up front, used to be the one promise on this page with no contract
            behind it. There is one now. <Hi>AskEscrow</Hi> is deployed on Base at{' '}
            <a
              href="https://basescan.org/address/0xD5f65Cfbe6A1AA1B6f82CBE0A336DDFCD39a5340#code"
              target="_blank"
              rel="noreferrer"
              className="underline decoration-soft-line-strong underline-offset-2"
            >
              <code className="rounded bg-soft-sunken px-1.5 py-0.5 text-[13px] text-soft-ink">
                0xD5f6…5340
              </code>
            </a>{' '}
            with its source verified, so you can read what it does instead of taking this page's
            word for it. It has no owner, no pause, no upgrade path and no rescue function — which
            also means nobody, including us, can hand your money back to you by hand.
          </P>
          <P>
            Choosing escrow takes the budget out of your wallet <Hi>before the Ask exists</Hi>: if
            the transfer does not land, the Ask is never posted. Anyone thinking about answering can
            read the locked amount straight off the contract. It is a choice, not a property of
            every Ask — the older way, paying out of pocket when you accept, still exists and locks
            nothing, so each card says which one it is.
          </P>
          <P>
            The fee is <Hi>2.5%</Hi>, and it is charged only on money going <em>back</em> to the
            author — never on a payout to someone who answered. Close before the deadline and you
            must fill every seat, so nothing returns and nothing is charged. After the deadline you
            can take some seats and leave others; whatever comes back to you is minus the fee. Let
            the deadline pass entirely and the whole budget returns to you the same way, minus the
            same fee — and your <Hi>resolve rate</Hi> drops in public, on the front of every Ask you
            post afterwards. Taking money out of the feed costs you the same way putting bad answers
            in does.
          </P>
          <P>
            Two things about that last path are not finished, and this page will not round them up.
            The contract has the expiry refund; <Hi>the product does not call it</Hi>, so today
            getting an expired budget back means calling the contract yourself. And money does not
            arrive on its own: resolving credits each winner a balance they then claim, so
            &quot;paid&quot; means the contract owes it irreversibly, not that it has landed in
            their wallet.
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
              className="inline-flex items-center gap-2 rounded-pill bg-soft-accent-soft px-4 py-2.5 font-soft-display text-[13.5px] font-bold text-soft-accent-deep transition-transform [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97]"
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

        {/* ---------------- kontrakty ---------------- */}
        <section className="py-16">
          <Marker amount="0x" label="nothing to take on trust" />
          <H2>Every contract this app touches</H2>
          <State tone="live">Verified on the chain, not copied from a comment</State>
          <P>
            A product whose whole claim is <Hi>you can check this yourself</Hi> owes you the
            addresses. Every one below was read straight off its chain before it was printed here:
            the address has code, and where the contract exposes an identity — a name, a symbol, an
            owner — it was read too and it matched.
          </P>
          <P>
            Four addresses that live in this codebase are <em>not</em> on this list, because the
            chain refused to confirm them. That is the point of checking.
          </P>

          <div className="mt-8">
            {CONTRACT_GROUPS.map((group) => (
              <div key={group.title} className="mb-9 last:mb-0">
                <h3 className="mb-1 font-soft-display text-[15px] font-semibold uppercase tracking-[0.14em] text-soft-ink-faint">
                  {group.title}
                </h3>
                <p className="mb-4 text-[13.5px] leading-[1.6] text-soft-ink-soft">{group.note}</p>

                <div className="border-t border-soft-line/70">
                  {group.rows.map((row) => (
                    <a
                      key={`${row.chain}-${row.address}`}
                      href={row.explorer}
                      target="_blank"
                      rel="noreferrer"
                      className="group flex flex-col gap-1 border-b border-soft-line/70 py-3.5 transition-colors hover:bg-soft-surface"
                    >
                      <span className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                        <span className="font-soft-display text-[13.5px] font-semibold text-soft-ink">
                          {row.what}
                        </span>
                        <span className="rounded-pill bg-soft-bg px-2 py-0.5 font-soft text-[10.5px] font-bold uppercase tracking-[0.1em] text-soft-ink-faint">
                          {row.chain}
                        </span>
                      </span>
                      <span className="text-[13px] leading-[1.6] text-soft-ink-muted">
                        {row.line}
                      </span>
                      {/* Adres lamie sie na telefonie zamiast rozpychac strone w poziomie.
                          `break-all` na 42 znakach bez spacji to jedyne, co dziala. */}
                      <span className="break-all font-mono text-[11.5px] leading-[1.5] text-soft-ink-faint underline decoration-soft-line underline-offset-4 group-hover:text-soft-primary-deep">
                        {row.address} ↗
                      </span>
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <p className="mt-7 text-[14px] leading-[1.7] text-soft-ink-soft">
            The escrow is the only one of these that holds anyone&apos;s money. It has no owner, no
            pause switch and no rescue function — which cuts both ways, and the section above says
            how.
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
            Escrow used to be the biggest hole. It is not any more, and the honest thing to say is
            what it did and did not fix. It settles whether <Hi>the money exists</Hi> — locked, in a
            contract with no owner and no off switch, readable before you write a word. It settles
            nothing about <Hi>who gets it</Hi>. The author still picks the winners, and a contract
            cannot tell a good answer from a bad one.
          </P>
          <P>
            So the biggest hole now is <Hi>judgement, and there is no appeal</Hi>. Write the best
            answer in the thread and the author can simply not pick you, pay 2.5% on the way out and
            keep the rest. Refusing to pay costs a little more than it did — the fee and a public{' '}
            <Hi>resolve rate</Hi>, the share of Asks an author actually settled, counted only over
            Asks past their deadline. That is a price, not a guarantee. Nothing here judges answers,
            and nothing reverses a resolve once it is made.
          </P>
          <P>
            The narrower version of the same hole: escrow stops the author paying nobody, but not
            the author paying <Hi>themselves from a second wallet</Hi>. The contract refuses the
            address that funded the Ask, which is the cheap version of that trick, not the whole of
            it. Treat a seat from an author with no resolve rate as trusting a person, which is why
            a seat starts at fifty cents and not at fifty dollars.
          </P>
          <P>
            Two limits worth stating plainly. The escrow path has been exercised against the
            contract on a test network, and the contract's own unit tests cover the expiry refund,
            but <Hi>no one has yet run the browser path end to end on mainnet with real money</Hi> —
            when someone does, they will be the first. And no fiat, no custody of your keys, no
            investment advice categories, and the longest an Ask can stay open is seven days. If the
            answers turn out to be slop, the product dies of quality and no amount of onchain
            plumbing saves it — so seats are limited, wallets have to be older than a week or carry
            a Basename, and accept rate gates the money.
          </P>
        </section>

        {/* ---------------- docs ---------------- */}
        {/* ===== WYLACZONE NA TERAZ - DECYZJA WLASCICIELA =====
            Blok "Read further" zostaje w kodzie, ale sie nie renderuje.
            Skasowanie go byloby gorsze: cztery adresy, oznaczenia linkow
            wychodzacych i uklad siatki trzeba by odtwarzac z pamieci przy
            wlaczaniu z powrotem.

            Przelacznik jest stala, a nie komentarzem blokowym, bo stala widac
            w wyszukiwaniu i TypeScript dalej sprawdza kod pod spodem - zakomen-
            towany JSX cicho gnije przy kazdej zmianie typow obok.

            Zeby wlaczyc: zmien na `true`. Zanim to zrobisz, sprawdz, czy
            /Docs i /mysphere-whitepaper-english.html faktycznie odpowiadaja -
            martwy odnosnik na koncu manifestu kosztuje wiecej niz jego brak. */}
        {SHOW_READ_FURTHER && (
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
        )}
      </div>
    </main>
  );
}

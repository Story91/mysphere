import type { Metadata } from 'next';
import Link from 'next/link';
// @ts-ignore - config CommonJS wspoldzielony z next.config.js
import { DISABLED_ROUTES } from '@/config/routeStatus';

export const metadata: Metadata = {
  // Marke doklada template z layoutu - patrz komentarz przy `title` w app/layout.tsx.
  // (Wczesniej odsylacz szedl do app/leaderboard/page.tsx, ale /leaderboard jest
  // scalany z /money i ten plik znika.)
  title: 'Re-Definition — money buys judgment',
  description:
    'MySphere is becoming the first feed where the buyer can be a machine and the worker is a human. One machine payment has already settled. Here is how an Ask works, and what is still missing.',
  openGraph: {
    title: 'Your judgment has a price. Something is already willing to pay it.',
    // === TU BYLY DWIE ROZNE PLATNOSCI SKLEJONE W JEDNA ===
    // Stalo: "paid in USDC on Base. In build". Oba czlony byly nieprawdziwe.
    //
    // 1. W produkcie sa DWIE platnosci i nie maja ze soba nic wspolnego:
    //    - BUDZET Aska blokuje sie w USDC na Base (AskEscrow),
    //    - ZALOZENIE Aska przez maszyne placi sie w USDG na Robinhood Chain
    //      przez x402.
    //    Inny lancuch, inny token, inny cel. Ta sama uwaga stoi w
    //    app/asks/layout.tsx i to nie przypadek - oba opisy lamaly sie na tym
    //    samym zdaniu.
    // 2. "In build" bylo prawda, kiedy nie bylo ani kontraktu, ani jednej
    //    rozliczonej platnosci. Dzis sa oba. Zdanie musi wiec podawac STAN,
    //    a nie etykiete fazy - i podaje go razem z zastrzezeniem ("once"),
    //    zeby jeden przebieg nie zabrzmial jak ruch.
    //
    // "can lock", nie "locks": escrow jest WYBOREM autora, nie wlasnoscia
    // kazdego Aska (wariant on-resolve nie blokuje niczego).
    description:
      'An Ask is a question with a budget, seats and a deadline. The author can lock that budget in an escrow contract on Base, in USDC. A machine can open one by paying over x402 — that has settled once, in USDG on Robinhood Chain.',
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
        line: 'Holds the USDC budget for an Ask until the author accepts answers. Source is verified — you can read it before you write a word. It is holding nothing today: no transaction has touched it since it was deployed, and the explorer under this link will tell you that before we do.',
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
        line: 'Global Dollar. This is what an agent actually pays in when it posts an Ask — one such payment has settled, for a cent. Robinhood Chain has no canonical USDC, and of the stablecoins there this is the only one that supports signed transfers, so it is the only one a machine can pay with while holding no gas.',
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
      {/* Zdanie musi nadazac za produktem. Do dzis konczylo sie slowami "not in
          the feed" - a feed ma juz pas otwartych Askow, wiec bylo klamstwem
          postawionym tuz pod slowem "Drawing". Zastrzezenie o SAMYM RYSUNKU
          zostaje: ta karta wciaz nie czyta ani jednego pola. */}
      <p className="mt-3 text-[11px] leading-[1.6] text-soft-ink-faint">
        This card is still a drawing and reads nothing. Real ones run on{' '}
        <a href="/asks" className="underline decoration-soft-line-strong underline-offset-2">
          /asks
        </a>{' '}
        and open ones now show up in the feed — but not here.
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
 * zniknac.
 *
 * === "Ask: expiry refund" PRZESZLO NA `live` I ZOSTAWILO PO SOBIE WIERSZ ===
 * Zwrot po wygasnieciu ma juz swoje miejsce w interfejsie: /money wymienia
 * kazdy wlasny escrow, nazywa okno czasu, w ktorym ten Ask jest, i na wygaslych
 * stawia przycisk (app/money/page.tsx, LockedPanel). Zdanie "nothing in the
 * product calls it" przestalo byc prawda, wiec wiersz nie mogl przy nim zostac.
 *
 * DWIE RZECZY, KTORE MUSZA ZOSTAC W NOCIE TEGO WIERSZA:
 *  - ZASTRZEZENIE O DOWODZIE. Ta noga kontraktu nie przeszla przez ZADEN
 *    prawdziwy lancuch i nie przejdzie tanio: settleExpired wymaga 48 godzin po
 *    terminie, a zegara na Base ani na Base Sepolii nie da sie przewinac. Cale
 *    jej pokrycie to blok "zwrot po wygasnieciu" w test/AskEscrow.test.ts, na
 *    sieci hardhat w pamieci. Podanie tego jako sprawdzonego byloby dokladnie
 *    tym klamstwem, ktore ta tabela ma wylapywac.
 *  - DWA KROKI, NIE JEDEN. settleExpired przypisuje SALDO; do portfela
 *    przenosi dopiero claim(). Nota nie ma prawa napisac "wraca do portfela".
 *
 * Na zwolnione miejsce weszla NASTEPNA brakujaca rzecz na tej samej szynie,
 * a nie pustka: po udanym zwrocie nikt nie zapisuje tego w bazie. `grep` po
 * `'expired'` w app/ znajduje wylacznie ODCZYTY statusu - ani jednego zapisu.
 * Ask, ktorego budzet juz wrocil, zostaje w Firestore jako 'open' i dalej stoi
 * na liscie /asks jak pytanie czekajace na odpowiedzi. Bez tego drugiego
 * wiersza tabela mowilaby "zwrot dziala" i milczala o tym, ze lancuch o nim wie,
 * a baza nie.
 *
 * === "Ask: in the feed" PRZESZLO NA `live` I ZOSTAWILO PO SOBIE WIERSZ ===
 * Feed ma pas otwartych Askow nad lista postow (app/basechat/components/
 * FeedAskRail.tsx), wiec zdanie "Nothing about an Ask is visible in the feed
 * yet" przestalo byc prawda i wiersz nie mogl przy nim zostac. Na zwolnione
 * miejsce weszla NASTEPNA brakujaca rzecz na tej samej szynie, a nie pustka:
 * z feedu wciaz nie da sie ODPOWIEDZIEC - przycisk karty wyprowadza na /asks,
 * bo tam stoi panel odpowiedzi, przyjmowania i rozstrzygania. Bez tego drugiego
 * wiersza tabela mowilaby "Ask jest w feedzie" i milczala o tym, ze feed
 * pokazuje Aska, a nie pozwala go zajac.
 *
 * TA SAMA ZASADA PRZY x402. Wiersz "x402 payment rails / wired / enforcement
 * wlaczy sie, gdy ustawimy adres" jest juz nieprawda: adres jest ustawiony,
 * egzekwowanie chodzi, a jedna prawdziwa platnosc 0,01 USDG rozliczyla sie na
 * Robinhood Chain. Wiersz idzie wiec na `live` - ale NIE ZOSTAJE PO NIM PUSTE
 * MIEJSCE. Zamiast niego wchodzi to, co jest teraz najblizsza brakujaca rzecza:
 * ta sama sciezka na Base w USDC, ktora ma w kodzie swoja galaz i przez ktora
 * nie przeszedl ani jeden cent. Bez tego drugiego wiersza tabela mowilaby
 * "x402 dziala" i milczala o tym, ze dziala na jednym lancuchu, w jednym tokenie
 * i z jednym przebiegiem w historii.
 *
 * === CZEGO W TEJ TABELI BRAKOWALO CALKIEM (uzgodnienie z 7 commitami) ===
 * Tabela opisywala Aska i pieniadze, a przez ostatnia dobe weszly trzy rzeczy
 * DLA UZYTKOWNIKA, ktorych nie bylo tu wcale - czyli strona pokazywala produkt
 * mniejszy, niz jest:
 *   - /money        odpowiedz na "gdzie sa moje pieniadze", z przyciskiem odbioru,
 *   - /join         strona, na ktora prowadzi link referalowy (do wczoraj 404),
 *   - konektory     X / Spotify / TikTok przez Camp, na wlasnym profilu.
 * Zaniżanie stanu jest tym samym bledem co zawyzanie - w obie strony strona
 * przestaje byc stanem.
 *
 * === WIERSZ O PLATNYCH SEKCJACH BYL NAJGORSZY W CALEJ TABELI ===
 * Stalo w nim: "It is stored outside the feed, so it is not in the page you did
 * not pay for". Do wczoraj to bylo NIEPRAWDA w obie strony: `premiumContent`
 * lezalo OTWARTYM TEKSTEM w dokumencie posta, ktory feed czyta klienckim SDK,
 * wiec kazdy widzial platny tekst w odpowiedzi sieciowej bez placenia. Do tego
 * regula `{document=**} allow read: if true` na koncu firestore.rules
 * unieważniała `if false` przy `askAnswerContent` - czyli obietnica "answers
 * stay sealed" tez byla martwa. Oba dziury sa zalatane (kolekcje odmawiaja
 * odczytu, sonda 12/12), i dlatego wiersz moze wreszcie mowic JAK to dziala,
 * a nie tylko GDZIE lezy.
 *
 * === TRZY WIERSZE DOPISANE PRZY UZGADNIANIU CALOSCI ===
 * Znowu zanizanie stanu, i znowu przez rzeczy, ktore weszly szybciej niz opis:
 *   - /how                strona-instrukcja. Istnieje, jest w nawigacji, a tabela
 *                         o niej nie wiedziala. Podzial obowiazkow miedzy strony
 *                         stoi w nocie tego wiersza, bo to jedyne miejsce, gdzie
 *                         czytelnik obu stron naraz go zobaczy.
 *   - reguly i indeksy    28 indeksow zlozonych wdrozonych, reguly EGZEKWOWANE
 *                         i sprawdzone sonda 12/12. To byla dziura krytyczna
 *                         opisana nizej; jej ZAMKNIECIE nie mialo wlasnego
 *                         wiersza, wiec tabela pokazywala tylko skutek uboczny
 *                         w dwoch innych notach.
 *   - sufit na odczyty    status `planned`, celowo, bo naprawiony jest SKRYPT,
 *                         a nie produkt. Skrypt liczacy lajki przeczytal 33 000
 *                         postow, domknal dzienny limit i przez godziny padaly
 *                         odpowiedzi na Aski oraz platna tresc - czyli dokladnie
 *                         to, za co produkt bierze pieniadze. Skrypt ma teraz
 *                         --max-reads; nad aplikacja nie ma nic.
 *
 * === CZEGO TA TABELA NIE MA PRAWA WIECEJ ZROBIC Z LICZBA 187 ===
 * Wiersz "The money timeline" podawal "187 settled payments deep" i nic wiecej.
 * Tak podana liczba czyta sie jako trakcja, a to NAPIWKI: lajk z cena, 187 na
 * 184 064 konta, czyli 0,1% ludzi. Ani jedna z nich nie jest zaplata za prace,
 * o ktora ktos poprosil - takich jest zero, bo escrow nie ma zdarzen. Nota musi
 * wiec niesc MIANOWNIK i slowo "tips". Liczba jako fakt: tak. Liczba jako dowod,
 * ze rynek dziala: nigdy.
 *
 * === STARTPAD WSZEDL DO TABELI JAKO DWA WIERSZE, NIE JEDEN ===
 * Modul jest nowy i dziala, ale na Base Sepolia - tam ETH nie jest pieniadzem.
 * Jeden wiersz `live` mowilby "dziala" i przemilczal, ze zaden prawdziwy grosz
 * przez to nie przeszedl; jeden wiersz `planned` przemilczalby, ze pelna
 * sciezka od startu po buyback i wyplaty zostala przejechana na lancuchu.
 * Sa wiec dwa: co stoi na testnecie i co stoi miedzy testnetem a prawdziwymi
 * pieniedzmi (audyt zewnetrzny - bo kontrakty nie maja wlasciciela ani pauzy
 * i bledu nie daloby sie cofnac). Zrodla prawdy: docs/LAUNCHPAD-DOSSIER.md
 * i docs/LAUNCHPAD-STAN.md, oba aktualizowane przy kazdej zmianie launchpada.
 *
 * NIE DOPISUJ TU WIERSZA, DOPOKI NIE ZOBACZYSZ GO W KODZIE. Ta tabela jest
 * jedynym miejscem na stronie, gdzie klamstwo nie ma sie gdzie schowac.
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
    note: 'Post across seven chains, with comments and likes. Every post has its own page and its own share card.',
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
    note: 'A public feed of payments between people, carrying names and avatars rather than bare addresses. 187 settled payments deep, every line with a transaction you can open. Read what they are before you read them as traction: all 187 are tips — a like with a price on it — across 184,064 accounts, so one account in a thousand has ever sent one. Nobody has yet been paid here for work they were asked to do.',
  },
  {
    name: 'Your money, in one place',
    status: 'live',
    note: '/money answers four questions with one wallet connected: what the escrow contract owes you, what your own open Asks are holding, what people paid you, and what you spent. The claim button is there too, so money you are owed does not need a second page to collect.',
  },
  {
    name: 'Paid sections',
    status: 'live',
    note: 'Text sold per post. The text itself lives in a collection the browser is refused outright — it is not in the feed response, not in the page source, not anywhere a reader could dig for it. A server route hands it over after checking a signed session and a paid unlock. Until this week it sat in the post document in plain text; treat any older claim about it as wrong.',
  },
  {
    name: 'A page that says what you can do today',
    status: 'live',
    note: '/how is a numbered list of steps, each with its price on the front: what it costs, what you sign, where the receipt ends up. Nothing on it is in the future tense — a thing you cannot do today is not allowed on that page in any form, not even as a promise. That is the division of labour between the two pages: /how is the instruction, this one is the state, and everything unbuilt lives here.',
  },
  {
    name: 'Rules and indexes, deployed rather than described',
    status: 'live',
    note: 'Sealed answers and paid text are refused to the browser by the database itself, not merely by our code asking nicely. We checked this against the live database rather than reading our own configuration and believing it.',
  },
  {
    name: 'A read the product cannot be taken down by',
    status: 'planned',
    note: 'The nearest missing thing away from the money rails. A counting script walked 33,000 posts and used up the whole day of reads, and for hours after that the product could not answer an Ask or hand over paid text — the two things it charges for. The script now stops at a ceiling and refuses to write a partial total. Nothing does that for the product itself: a page that starts reading too much has nothing above it to say no.',
  },
  {
    name: 'An invite link that arrives somewhere',
    status: 'live',
    note: '/join is where every referral link points. It used to point at a route that did not exist, so every invite ever sent landed on a 404. Registering a referrer needs a signature, not just a connected address.',
  },
  {
    name: 'Social accounts on your profile',
    status: 'live',
    note: 'X, Spotify and TikTok, linked through the Camp Network connector, from your own profile in the feed. Camp holds the link; we keep a copy for display and nothing else.',
  },
  {
    name: 'x402: an agent pays for an Ask',
    status: 'live',
    note: 'A payout address is set and enforcement is on: POST /api/asks answers 402, takes a signed authorization and writes the Ask. One real payment has settled this way — 0.01 USDG on Robinhood Chain, the payer signing only and paying no gas. One payment between two of our own addresses is proof the path works, not evidence of traffic.',
  },
  {
    name: 'x402 on Base, in USDC',
    status: 'live',
    note: 'The 402 answer now carries both rails at once and the payer picks: USDC on Base, or USDG on Robinhood Chain. Both have settled real money — a cent each way, gas paid by the facilitator rather than the payer. One quirk worth knowing if you build against this: the Coinbase facilitator refuses a payment to yourself, so the Base rail cannot be tested by paying your own address. The Robinhood one allows it.',
  },
  {
    name: 'Ask: post and answer',
    status: 'live',
    note: 'Budget, seats, deadline, resolve rate. Answer text goes to a collection the browser is refused outright and comes back only through a server route, so the seal is a rule and not a curtain. The author accepts and resolves from /asks.',
  },
  {
    name: 'Ask: escrow',
    status: 'live',
    note: 'AskEscrow on Base, 0xD5f65Cfbe6A1AA1B6f82CBE0A336DDFCD39a5340, source-verified, no owner. Approve, fund, wait for the receipt — only then does the Ask document get written. Resolving is one transaction, collecting is a claim. Whoever is thinking of answering reads the locked amount off the chain first, and that reading is now worth something: the contract has been funded from this app on mainnet and holds a real budget against a real deadline. It went for months holding nothing, and this row said so.',
  },
  {
    name: 'Ask: escrow from a browser, on mainnet',
    status: 'live',
    note: 'Somebody went first. A budget was approved and locked from this app, on Base mainnet, in two transactions from a browser wallet, and the contract now answers for that ask with a funded escrow, a per-answer amount and a deadline. Two things were learned in the process and both are fixed. A wallet warns you that the contract is untrusted, because it is new and has no history to judge it by, and it asks to spend the exact budget rather than an open-ended allowance. And the first attempt failed: the second transaction went out before the first had been mined.',
  },
  {
    name: 'Ask: expiry refund in the interface',
    status: 'live',
    note: '/money shows every budget the contract still holds for you and which stage it is at: running, the 48 hours you have left to accept answers, or expired. Expired ones get a button. It states the 2.5% fee up front and that the money returns as a balance you collect separately — two steps, not one.',
  },
  {
    name: 'Ask: a settled Ask that says it is settled',
    status: 'live',
    note: 'Sending an expired budget back used to be a contract call nothing wrote down: the document stayed open forever and the Ask kept sitting on /asks as though it were still waiting for answers. The chain knew, the database did not. Now the refund and the record happen together, and the record carries the transaction that paid it, because a sentence about money returning is worth what its proof is worth. Two directions are closed off in the database itself: an expired Ask cannot be flipped back to open, and one that was escrowed cannot be marked expired without that transaction.',
  },
  {
    name: 'Being told you have been paid',
    status: 'live',
    note: 'Resolving sends every winner a notification with the amount, and it says which of the two things happened: the contract is holding it for you and you collect it on /money, or it is already in your wallet. Those are different sentences because they are different situations. The amount comes from what the chain actually credited, not from what the Ask document says it should have.',
  },
  {
    name: 'Ask: in the feed',
    status: 'live',
    note: 'A strip above the posts carries up to four open asks — open, still before the deadline, still with a free seat — read once per five minutes and cached like the posts are, so scrolling the feed costs nothing extra. It is a strip, not a card sitting between two posts: an Ask counts down, and a countdown buried at position thirty-seven is a countdown nobody reaches. No resolve record is shown there — that is a query per author, and the card on /asks carries it.',
  },
  {
    name: 'Ask: starting one where you already are',
    status: 'live',
    note: 'A Post / Ask switch above the box you write posts in. Flip it and the same box becomes the question, the budget, the seats and the deadline — nothing to navigate to. An empty form offers five ready-made starts, and each one fills the question, the budget, the seats and the deadline together, because a blank field does not tell you what you are allowed to ask or what it costs. They vanish the moment you type, so nothing you already set gets overwritten.',
  },
  {
    name: 'A record of what vault curators changed',
    status: 'live',
    note: 'Money in a lending vault sits under somebody else’s decisions: they set the fee they take and they can raise it without telling anyone. The curator record, now a tab under Asks, keeps a dated record of exactly that for the vaults Morpho lists on Base: the fee before, the fee after, and who was curating. No score for anybody, no forecast, nothing about your wallet or anyone else’s, and no automatic posts in the feed. It reads one set of parameters a day, so an entry says a change happened between two dates rather than inventing an hour. It records the fee, the curator and whether a vault is listed; it does not read what a vault lends against, and it says so on the page rather than letting an empty list imply nothing happened.',
  },
  {
    name: 'Ask: answering without leaving the feed',
    status: 'live',
    note: 'The button on a feed card opens the answer box in place. You read the question, the amount and the clock, and you write without going anywhere. What stays on /asks is the author side of it: opening the sealed answers and resolving with a payment, which needs a wallet and a signature and sometimes two transactions. The feed does not fetch the thread behind each card, so it does not know whether you have already answered - the server does, and it says so when you send. Past the deadline or with every seat taken the button goes back to being a link, because a form that cannot be submitted is worse than no form.',
  },
  {
    name: 'Startpad: launch a token',
    status: 'live',
    note: 'A bonding curve that closes at exactly 3.00 ETH and graduates into a Uniswap v4 pool, fees split up to 70% to the creator and never less than 30% to the protocol; the floor is in the contract, not the form. It is live on Base mainnet with real ETH (the default network) and also on Base Sepolia for testing. The full path (launch, curve close, graduation, pool swaps, buyback and burn, claims) has been run end to end on Base-mainnet forks and a Sepolia mini-stack; on the live mainnet, launch and trading run, but no token has reached graduation yet.',
  },
  {
    name: 'Startpad on real money',
    status: 'live',
    note: 'Live on Base mainnet since 11 August 2026. The contracts have no owner, no pause and no upgrade path, so a bug is irreversible and nobody could hand the ETH back. The external audit was deferred by the owner in favor of a harder internal adversarial review and real Base-mainnet fork tests; that raised risk is named here on purpose, not hidden. No token has reached graduation on the live deployment yet.',
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
            {/* PIGULKA JEST OPISEM PLATNOSCI, NIE LISTA FILAROW - I DLATEGO
                MUSIALA SIE ZMIENIC.
                Stalo "Base · USDC · x402". Trzy slowa w jednym rzedzie czyta
                sie jako jedno zdanie: "x402 na Base w USDC". To jest dokladnie
                ta platnosc, ktora NIE ISTNIEJE - galaz w kodzie jest, nie
                przeszedl przez nia ani jeden cent. Prawdziwe sa dwie inne:
                budzet w USDC na Base (escrow) i x402 w USDG na Robinhoodzie.
                Rozwazalem zostawienie tego jako listy filarow, ale filar
                "USDC" nie jest filarem - to nazwa tokena, wiec czytelnik i tak
                przeczyta te linijke jako rachunek. Skoro ma byc rachunkiem,
                ma byc pelnym rachunkiem.
                `flex-wrap`, bo trzy czlony nie mieszcza sie w jednej linii na
                telefonie, a bez tego tekst lamal by sie w srodku span-a. */}
            <p className="mb-6 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-soft-ink-faint">
              Re-Definition
              <span className="h-3 w-px bg-soft-line-strong" aria-hidden="true" />
              <span className="text-soft-primary-deep">
                USDC on Base · USDG on Robinhood · x402
              </span>
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
                i mowi, ktore zdania sa o czym.

                === PRZESUNIECIE, KTORE WYMUSILA RZECZYWISTOSC ===
                "Machine buyers over x402" stalo w kolumnie DIRECTION jeszcze
                po tym, jak maszyna naprawde zaplacila (0,01 USDG, Robinhood
                Chain). Kolumna kierunku opisywala wiec rzecz, ktora sie juz
                wydarzyla - czyli ta sama pomylka, tylko odwrocona: zamiast
                obiecywac za duzo, strona przemilczala to, co dziala.
                Pozycja idzie do "Runs today" Z ZASTRZEZENIEM (jeden przebieg),
                a w "Direction" zostaje to, czego naprawde nie ma: RUCH.
                Jedna platnosc miedzy dwoma naszymi portfelami jest dzialajaca
                sciezka, nie rynkiem, i ta roznica jest cala trescia tej
                kolumny.

                Zasada dla kazdego, kto to bedzie przesuwal dalej: pozycja
                zdjeta z "Being built" nie zostawia pustego miejsca. Na jej
                miejsce wchodzi nastepna brakujaca rzecz - tu weszla sciezka
                x402 na Base w USDC, przez ktora nie przeszedl ani cent.

                === 187 PLATNOSCI TO NAPIWKI I TAK MA TU BYC NAPISANE ===
                Kolumna "Runs today" mowila wczesniej o escrow, ktorego "caly
                cykl przeszedl na prawdziwych pieniadzach", w jednym zdaniu ze
                slowami "live on Base". Czytelnik ma prawo przeczytac to jako
                mainnet, a na mainnecie eth_getLogs od bloku wdrozenia
                49635587 nie zwraca ANI JEDNEGO zdarzenia i balanceOf(USDC)
                kontraktu wynosi zero. Cykl przeszedl na Base Sepolii, ze
                skryptu.

                Druga poprawka jest tego samego rodzaju. 187 rozliczonych
                platnosci to NAPIWKI - lajk z cena - a nie zaplata za
                dostarczona prace, i dotycza 0,1% kont (187 na 184 064).
                Liczbe wolno podawac jako fakt. NIE WOLNO jej podawac jako
                dowodu, ze rynek dziala, bo rynek to zaplata za robote na
                zamowienie, a takich przejsc jest zero. Fosa tego produktu
                lezy w kodzie: escrow bez wlasciciela, zapieczetowane
                odpowiedzi i wskaznik rozstrzygalnosci - nie w tej liczbie. */}
            <dl className="mt-9 grid gap-y-4 border-t border-soft-line/70 pt-6 sm:grid-cols-3 sm:gap-x-6">
              {[
                {
                  t: 'Runs today',
                  d: 'Post onchain. Tip in USDC. Ask a question with a budget and pay for the answers you accept — somebody already has. /money adds up what you are owed and hands you the button.',
                },
                {
                  t: 'Being built',
                  d: 'Locking a budget in escrow from the browser. Answering without leaving the feed. Paying in USDC on Base when the buyer is software.',
                },
                {
                  t: 'Direction',
                  d: 'Enough of this happening between strangers to call it a market. One payment is a working path. It is not yet a market.',
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
          <State tone="live">Runs on /asks — open ones also show in the feed</State>
          <P>
            An Ask is a question with a budget, a number of seats and a deadline. You set all three
            and it appears as a card that counts down. It runs on its own page, and open ones now
            sit in a strip above the feed — you can see one where you already are, though taking a
            seat still means opening /asks.
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
            response and every reader has it. Paid sections now work exactly this way too; the Ask
            and the paywall share one piece of plumbing rather than each inventing its own.
          </P>
          <P>
            That is worth one more sentence, because until this week it was not true. The{' '}
            <code className="rounded bg-soft-sunken px-1.5 py-0.5 text-[13px] text-soft-ink">if false</code>{' '}
            sat there, but a catch-all rule underneath it granted every document in the database to
            everybody — and in this database, permission is granted if <em>any</em> rule allows it.
            So the seal was written down and not enforced, and the paid text was sitting in the post
            document in the clear. Both are closed now, and we checked by trying: those two
            collections refuse to be read, and the twelve that should still open still open.{' '}
            <Hi>If you read this page a week ago, it told you something that was not true.</Hi>
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
            One sentence before you read any of that as a running market. <Hi>Nobody has gone
            through this contract yet.</Hi> Ask it for every event it has emitted since the block it
            was deployed in and it returns none; its balance is zero. What exists is a finished
            contract and a finished path to it, checkable by anyone, carrying nobody&apos;s money.
            That is a smaller claim than the one this section could make, and it is the true one.
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
            The expiry refund has a button on /money, but{' '}
            <Hi>no expired Ask has ever gone through it</Hi> — it needs 48 hours to have passed, and
            nothing on a live network lets you skip them. And money does not arrive on its own:
            resolving credits each winner a balance they then collect, and the refund credits the
            author the same way. &quot;Paid&quot; means the contract owes it irreversibly, not that
            it has landed in a wallet.
          </P>
          <P>
            The claim at least has an address now.{' '}
            <Link href="/money" className="underline decoration-soft-line-strong underline-offset-2">
              /money
            </Link>{' '}
            answers the four questions this product used to leave scattered across four screens:
            what the escrow owes you, what your own open Asks are holding, what people paid you and
            for what, and what you spent — with the button that collects the first of those. What it
            still does not do is <Hi>come and find you</Hi>: nothing notifies a winner, so the money
            waits until someone thinks to look.
          </P>
        </section>

        {/* ---------------- 402 ---------------- */}
        <section className="py-16">
          <Marker amount="402" label="payment required" />
          <H2>The buyer does not have to be human</H2>
          <State tone="live">
            Running — one real payment has settled through it, and that is exactly one
          </State>
          <P>
            An agent has no browser, no wallet popup and no account. What it does have is money and
            a standard for spending it. That standard is x402: the resource answers a request with{' '}
            <Hi>402 Payment Required</Hi> and its price, the agent signs a transfer authorization
            inside whatever spending cap its owner set, and retries. No sign-up, no API key, no
            invoice. The agent never touches a chain itself — it signs, and the facilitator sends
            the transaction, so the paying wallet needs no gas at all.
          </P>
          <P>
            So an agent can post an Ask the same way you can — <code className="rounded bg-soft-sunken px-1.5 py-0.5 text-[13px] text-soft-ink">GET /api/asks</code> to see
            the price, sign, then <code className="rounded bg-soft-sunken px-1.5 py-0.5 text-[13px] text-soft-ink">POST</code> the question. Your answer
            comes back to it as JSON when you deliver it.
          </P>
          <P>
            That has now happened once, for real money: <Hi>0.01 USDG on Robinhood Chain</Hi>. The
            endpoint refused the unpaid request with a 402 and its price, took the signed
            authorization on the retry, and wrote the Ask. The payer&apos;s balance fell by ten
            thousand units and ours rose by the same ten thousand, in a transaction the payer never
            sent and never paid gas for.
          </P>
          <P>
            Now the part a launch post would leave out. That was <Hi>one payment, of one cent,
            between two addresses we both own</Hi>. It settles on Robinhood Chain rather than Base
            because Robinhood Chain has no canonical USDC and USDG is the only stablecoin there that
            can be paid by signature — that is the only reason, not a preference. And the
            facilitator&apos;s signing key on that chain had nineteen transactions in its whole
            history when we checked, against roughly sixty-eight top-ups keeping it in gas. The
            path works. It is not worn in, and this page is not going to tell you it is.
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
            The first of them is already live: <Hi>a public timeline of payments between people</Hi>.
            Not a leaderboard of points, not a wall of likes — the money itself, in the order it
            landed, every line carrying a transaction you can open and check against the chain, and
            names and faces on both ends of it rather than two truncated addresses. Every social
            product has a feed of what people said. None has a feed of what people paid each other.
          </P>
          <P>
            And now the size of it, because a page that hides this has no business asking you to
            trust the rest. That timeline is <Hi>187 payments deep</Hi>, all of them tips, spread
            across 184,064 accounts — one account in a thousand has ever sent one. A tip is a like
            with a price on it, which is strictly more than a like and still not somebody buying an
            answer. Not one of those 187 was payment for work somebody asked for. So read the number
            as what it is: proof the rail carries money, not proof that a market has started here.
          </P>
          <P>
            The thing that would be hard to copy is not that number either. It is the part written
            in code and given away: <Hi>an escrow with no owner</Hi>, so nobody — us included — can
            reach into it; answers sealed by a database rule rather than by an interface; and a
            resolve rate an author cannot raise without paying somebody. Those exist whether or not
            anyone has used them yet, and the row above is honest that nobody has.
          </P>
          {/* Timeline platnosci mieszka teraz w /money, w zakladce Paid -
              /leaderboard jest scalany z ta strona i ten link nie ma prawa
              prowadzic do trasy, ktora znika. */}
          <p className="mb-4">
            <Link
              href="/money?tab=paid"
              className="inline-flex items-center gap-2 rounded-pill bg-soft-accent-soft px-4 py-2.5 font-soft-display text-[13.5px] font-bold text-soft-accent-deep transition-transform [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97]"
            >
              Watch the money land →
            </Link>
          </p>
        </section>

        {/* ---------------- zapis kuratorow ----------------
            === DLACZEGO ZNACZNIK NIE JEST PROCENTEM ===
            `Marker` maluje swoja tresc bursztynem, a bursztyn nalezy w tym
            produkcie WYLACZNIE do kwot. Sekcja jest o prowizji podnoszonej
            z 5% na 15%, wiec najbardziej kuszacy znacznik ("5% → 15%") byl by
            zlamaniem tej zasady w najbardziej widocznym miejscu strony.
            Δ nie jest ani kwota, ani procentem - jest nazwa tego, co ta sekcja
            zapisuje: samej roznicy. Precedens na znacznik nieliczbowy stoi
            wyzej ("/u/", "0x…").

            Tresc jest pisana JEZYKIEM KORZYSCI CZYTELNIKA i nie ma w niej ani
            slowa o tym, jak to dziala od srodka. Wlasciciel raz juz kazal
            wyciac stad nasze wewnetrzne sprawy.
        */}
        <section className="py-16">
          <Marker amount="Δ" label="the change nobody announces" />
          <H2>Somebody can change the terms of your vault overnight</H2>
          <State tone="live">Running — the record collects one reading a day</State>
          <P>
            Money parked in a lending vault sits under somebody else&apos;s decisions. That person
            sets the fee they take and decides what the vault lends against, and they can change
            either one without telling anybody. The numbers are public the whole time. What is
            missing is <Hi>anyone writing down what they used to be</Hi> — so &ldquo;this used to
            charge 5%&rdquo; is a memory, not a fact, and memories are not what you want between you
            and your money.
          </P>
          <P>
            So we keep the record. Every day we read the fee and the curator of every listed vault
            on Base, and keep only what moved: <Hi>this vault charged 5%, now it charges 15%</Hi>,
            with the dates it happened between. No score for any curator, no forecast, and nothing
            about anybody&apos;s wallet — a fee is either the number it was or it is not, and that is
            the whole claim.
          </P>
          <P>
            It is a page you look things up on, not a robot that talks in your feed. And it is
            honest about its own age: on a day with nothing in it, it tells you whether that means
            nothing changed or that it has not been watching long enough to say.
          </P>
          <p className="mb-4">
            <Link
              href="/asks?tab=curators"
              /* CELOWO fioletowy, a nie bursztynowy jak przycisk pod sekcja
                 o platnosciach. Tamten prowadzi do KWOT, ktore naprawde
                 przeszly miedzy ludzmi; ten prowadzi do prowizji i procentow,
                 a bursztyn w tym produkcie znaczy "to jest kwota".
                 /curators przekierowuje tu (zakladka na /asks), wiec link
                 prowadzi wprost do celu, bez zbednego skoku. */
              className="inline-flex items-center gap-2 rounded-pill bg-soft-primary-deep px-4 py-2.5 font-soft-display text-[13.5px] font-bold text-white transition-transform [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary focus-visible:ring-offset-2"
            >
              Open the curator record →
            </Link>
          </p>
        </section>

        {/* ---------------- Startpad ----------------
            === DLACZEGO TA SEKCJA STOI ZARAZ PO KURATORACH ===
            Sekcja wyzej mowi: ktos moze zmienic warunki twojego vaulta przez
            noc. Ta mowi o module zbudowanym dokladnie przeciwko temu: warunki
            startu tokena sa niezmienne od momentu, w ktorym je przeczytales.
            To ta sama teza strony - pieniadz z regulami, ktorych nikt nie
            trzyma w reku - wypowiedziana z drugiej strony. Przemilczenie
            dzialajacego modulu byloby zanizaniem stanu, czyli tym samym
            bledem co zawyzanie (patrz komentarz nad tabela CAPABILITIES).

            === ZNACZNIK JEST KWOTA, WIEC WOLNO MU BYC BURSZTYNOWYM ===
            3.00 ETH to prog, przy ktorym krzywa sie domyka i token graduuje -
            jedna liczba, ktora niesie caly mechanizm. Bursztyn nalezy w tym
            produkcie do kwot, a to jest kwota.

            === PRZYCISK CELOWO FIOLETOWY, NIE BURSZTYNOWY ===
            Ta sama zasada co przy /curators: bursztynowy przycisk prowadzi do
            kwot, ktore juz przeszly miedzy ludzmi. Startpad to akcja, nie
            zapis historii - przycisk nie ma prawa obiecywac kolorem czegos,
            czego strona nie obiecuje slowem.

            === SKAD SA TE ZDANIA ===
            Kazdy fakt ponizej pochodzi z docs/LAUNCHPAD-DOSSIER.md,
            docs/LAUNCHPAD-STAN.md albo wprost z kodu app/startpad/*
            (wymog logo, przelacznik ochrony snajperskiej, atomowy pre-buy,
            Top earnings liczone w wei - wszystko sprawdzone w zrodlach przed
            napisaniem). Testnet stoi w linijce State ZANIM padnie pierwsze
            zdanie w czasie terazniejszym - z tego samego powodu, dla ktorego
            hero ma trzy kolumny czasow.

            Adresow kontraktow tu nie ma. Mainnetowe adresy Startpada podaje
            /Docs/startpad; tabela "Every contract this app touches" przyjmuje
            tylko wpisy zweryfikowane skryptem (patrz jej komentarz) i wpis
            Startpada moze do niej wejsc dopiero ta sama sciezka. */}
        <section className="py-16">
          <Marker amount="3.00 ETH" label="where the curve closes" />
          <H2>A launch whose terms nobody can change overnight</H2>
          <State tone="live">
            Runs on /startpad, live on Base mainnet with real ETH (default); Base Sepolia is there for testing
          </State>
          <P>
            <Hi>Startpad</Hi> launches an ERC-20 on a bonding curve. When the curve has collected{' '}
            <Hi>exactly 3.00 ETH</Hi>, the token graduates: liquidity moves into a Uniswap v4 pool
            that opens at the exact price the curve closed at, so nobody who bought the top of the
            curve is instantly underwater. Anyone may call the graduation and is paid 0.045 ETH —
            half of the graduation fee — for doing so, which means the step does not depend on us
            being awake.
          </P>
          <P>
            Every fee stream splits the same way: <Hi>up to 70% to the creator, never less than 30%
            to the protocol</Hi> — the same ratio PONS pays — and the floor sits in the contract,
            so it binds us and anyone calling the contract directly, not just users of our form.
            Trading on the curve pays at most 1%; after graduation every swap in the pool pays 1%.
            The creator&apos;s share can go to up to eight addresses, and it is paid in ETH, not in
            the token.
          </P>
          <P>
            A creator can point a slider at their own share and burn with it. The{' '}
            <Hi>auto-buyback</Hi> takes 0–100% of <em>the creator&apos;s</em> pool fees, buys the
            token and sends it to the dead address, and anyone may execute a pending buyback. An
            earlier deployment cut the buyback from the whole fee before the split, which let a
            creator set 100% and zero the protocol out — the version running now spends only the
            creator&apos;s own money, because generosity paid for with somebody else&apos;s revenue
            is not generosity.
          </P>
          <P>
            Sniper protection is a default, not a law: for the first five minutes one wallet can
            buy at most 16 million tokens, and the creator can tighten that, raise it, or{' '}
            <Hi>switch it off entirely</Hi> — chosen at launch and immutable afterwards, like every
            other number on the form. The creator gets no allocation: a pre-buy is a normal buy on
            the same curve, filled <Hi>in the same transaction that creates the token</Hi>, so
            there is no block in which a sniper can get in first. And a launch does not go out
            without a logo — an ERC-20 has no image on chain, so the file is stored with us and
            served through a token list only the creator the chain confirms can edit.
          </P>
          <P>
            The interface holds itself to the same rule as this page. The candlestick chart is
            built from the contract&apos;s own events and <Hi>ends at graduation</Hi>, because
            after that trading lives in the pool and we do not draw numbers we do not have. Selling
            keeps working after the curve locks, because the contract allows it and an interface
            that hides a working exit is lying. &ldquo;My tokens&rdquo; collects what your launches
            have accrued next to the claim button, and &ldquo;Top earnings&rdquo; ranks creators by
            fees <Hi>added up to the wei from the contract&apos;s events</Hi>, not estimated.
          </P>
          <P>
            The spine is the one this whole page keeps arguing for: <Hi>no owner, no pause, no
            setters, no upgrade path</Hi> — changing any number means deploying a new contract.
            Payouts are pull-based balances you claim, never pushed. The LP position is locked in a
            vault forever; only the fees it earns can ever be taken out. It runs on Base mainnet
            with real ETH, and the full path (launch, curve close, graduation, pool swaps, fee
            settle, buyback and burn, claims) was run end to end on Base Sepolia and checked on
            the chain before mainnet opened. Base Sepolia stays available for testing, for the
            same reason the escrow gives: with no admin key, a bug is irreversible.
          </P>
          <p className="mb-4">
            <Link
              href="/startpad"
              className="inline-flex items-center gap-2 rounded-pill bg-soft-primary-deep px-4 py-2.5 font-soft-display text-[13.5px] font-bold text-white transition-transform [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary focus-visible:ring-offset-2"
            >
              Open the Startpad →
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
            built, so that number cannot drift from production. The rows are written by hand, status
            included. When something stops being a plan it does not leave a gap here — the next
            missing thing moves into the empty row, which is why the list never gets shorter and
            never goes all green. <Hi>A table where everything is lit is an advertisement.</Hi>
          </P>
          <P>
            This is the state. If what you want is the instruction —{' '}
            <Link href="/how" className="underline decoration-soft-line-strong underline-offset-2">
              /how
            </Link>{' '}
            is the same product from the other side: the things you can do today, each with what
            it costs and what you sign. Nothing in the future tense is allowed on that page, which
            is why everything in the future tense is on this one.
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
            And that bet is <Hi>not yet won by anything on this page</Hi>. The strongest number here
            is 187 tips, and a tip is somebody rewarding a post they were going to read anyway — not
            somebody commissioning work and paying for it when it arrives. The escrow, which is
            where commissioned work would settle, has never been used. Everything above is a rail,
            an address and a rule you can check. None of it is evidence that people want this. The
            first Ask a stranger funds and a stranger answers is the experiment; until then this page
            is describing a machine that has not been switched on.
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
            Two limits worth stating plainly. The contract has moved real money end to end in
            testing — locked, resolved, paid out, books back at zero — but{' '}
            <Hi>nobody has locked a budget in it from this app yet</Hi>. Whoever does will be the
            first. The expiry refund has less behind it than that, because forty-eight hours cannot
            be skipped on a live chain. And
            no fiat, no custody of your keys, no
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

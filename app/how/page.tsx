import Link from 'next/link';

/**
 * /how - instrukcja obslugi produktu dla czlowieka, ktory wlasnie wszedl.
 *
 * Komponent SERWEROWY: zero interaktywnosci, wiec prerenderuje sie do
 * statycznego HTML-a i nie ciagnie ani kilobajta JS-a. To samo podejscie co
 * /re-definition.
 *
 * === CZYM TA STRONA NIE JEST ===
 * NIE jest manifestem. /re-definition tlumaczy, DLACZEGO ten produkt istnieje
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
 * przeszedl, i oba musza to mowic W SWOIM KROKU, a nie w gwiazdce na dole:
 *
 *   krok 05 (escrow)  Kontrakt na Base stoi i ma zweryfikowane zrodlo, ale
 *                     eth_getLogs od bloku wdrozenia nie zwraca ani jednego
 *                     zdarzenia, a balanceOf(USDC) wynosi zero. Nikt nie
 *                     zablokowal tam ani centa.
 *   krok 07 (zwrot)   settleExpired ma przycisk na /money (page.tsx wola
 *                     settleExpiredAsk), ale ta noga nie przeszla na zadnej
 *                     prawdziwej sieci - wymaga terminu + 48h, czego nie da
 *                     sie przewinac. Jedyny dowod to test jednostkowy.
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

export const metadata = {
  // Marke doklada `title.template` z layoutu glownego.
  title: 'How it works',
  description:
    'What you can do on MySphere today: post onchain, tip in USDC, sell part of a post, ask a question with a budget, and collect what you are owed.',
  openGraph: {
    title: 'How MySphere works',
    description:
      'Post onchain, tip in USDC, put part of a post behind a payment, ask a question with a budget and seats. Every amount settles onchain with a hash.',
    type: 'article',
  },
};

/* ------------------------------------------------------------------ */

function Step({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-soft-line/70 py-10">
      <div className="mb-3 flex items-baseline gap-3">
        {/* Numer jest tu POPRAWNY, w przeciwienstwie do /re-definition.
            Tam sekcje sa stanami tej samej kwoty, nie krokami, wiec numer nic
            by nie niosl. Tutaj to instrukcja i kolejnosc naprawde ma znaczenie:
            bez portfela nie napiszesz posta, bez posta nie sprzedasz jego czesci. */}
        <span className="font-soft-display text-[13px] font-bold tabular-nums text-soft-primary-deep">
          {number}
        </span>
        <h2 className="font-soft-display text-[22px] font-bold leading-[1.2] tracking-[-0.01em] text-soft-ink sm:text-[26px]">
          {title}
        </h2>
      </div>
      <div className="max-w-[64ch]">{children}</div>
    </section>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="mb-3 text-[15px] leading-[1.7] text-soft-ink-muted">{children}</p>;
}

function Hi({ children }: { children: React.ReactNode }) {
  return <strong className="font-semibold text-soft-ink">{children}</strong>;
}

/** Koszt kroku. Kwota dostaje akcent, bo akcent nalezy sie pieniadzom. */
function Cost({ gas, children }: { gas: 'none' | 'gas' | 'money'; children: React.ReactNode }) {
  const style =
    gas === 'money'
      ? 'border-soft-accent/40 text-soft-accent-deep'
      : 'border-soft-line text-soft-ink-muted';

  return (
    <p
      className={`mb-3 inline-flex items-start gap-2 rounded-pill border bg-soft-surface px-3 py-1.5 font-soft text-[12.5px] font-semibold leading-[1.45] ${style}`}
    >
      {children}
    </p>
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

export default function HowPage() {
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

        <p className="mb-2 max-w-[58ch] text-[16px] leading-[1.65] text-soft-ink-muted">
          Most feeds measure attention, which is free to give and therefore
          proves nothing. This one measures payments, which are not. Below is
          every single thing you can do here today — what it costs, what you
          sign, and where the receipt ends up.
        </p>

        <p className="mb-2 max-w-[58ch] text-[14px] leading-[1.6] text-soft-ink-soft">
          Nothing on this page is a plan. If it is written here, it works right
          now — and where the thing that works has never had anyone go through
          it, the step says so in the step. What is still being built is listed
          on{' '}
          <Link
            href="/re-definition"
            className="font-semibold text-soft-primary-deep underline decoration-soft-line underline-offset-4 hover:text-soft-primary"
          >
            Re-Definition
          </Link>
          , with its status next to it.
        </p>

        <div className="mt-10">
          {/* ---------------------------------------------------------- */}
          <Step number="01" title="Get in">
            <Cost gas="none">
              Free · One signature · No gas, no transaction
            </Cost>
            <P>
              Connect a wallet, then sign one message. If you do not have a
              wallet, <Hi>Base Account</Hi> makes one with a passkey — your face
              or your fingerprint, no extension and no seed phrase to write down.
            </P>
            <P>
              The signature is not a payment and never becomes one. It exists
              because an address typed into a box proves nothing — anyone can
              type yours. Signing is the only way the server can tell it is
              actually you, and it is what stands between your paid content and
              a stranger claiming to be you.
            </P>
            <P>
              You need it once. Reading the feed needs nothing at all.
            </P>
          </Step>

          {/* ---------------------------------------------------------- */}
          <Step number="02" title="Write a post that lands onchain">
            <Cost gas="gas">Gas only · Cheap on Base, usually under a cent</Cost>
            <P>
              Write, pick a network, post. The text is written to a contract, so
              the post has a transaction behind it that anyone can open — it is
              not only a row in our database.
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
          <Step number="03" title="Pay someone for a post you liked">
            <Cost gas="money">Your choice of amount · USDC on Base, or the native token elsewhere</Cost>
            <P>
              A tip is the whole thesis in one button. It costs you something,
              so it means something — and it lands with a hash that both of you
              can open.
            </P>
            <P>
              Every tip that settles shows up on <Hi>Paid</Hi>, a public
              timeline of money that actually moved between two people. Names
              and faces on both ends, and a transaction on every line.
            </P>
            <Go href="/leaderboard">See what people paid each other</Go>
          </Step>

          {/* ---------------------------------------------------------- */}
          <Step number="04" title="Sell part of a post">
            <Cost gas="none">Free to publish · You set the price readers pay</Cost>
            <P>
              Open <Hi>Add a paid section</Hi> under the composer, write the part
              you want to sell and set a price. Everyone sees the free part; only
              people who pay see the rest.
            </P>
            <P>
              Write something above the paywall first — a line everyone can read.
              A locked box with no label gives nobody a reason to open it, and
              the button will ask you for it.
            </P>
            <P>
              The paid text is stored where the app itself cannot read it back
              and is only handed out after a payment is recorded. It is{' '}
              <Hi>not encrypted</Hi> though: anybody who pays once can copy it
              anywhere. Price it like something a stranger might repost.
            </P>
          </Step>

          {/* ---------------------------------------------------------- */}
          <Step number="05" title="Ask a question and put money on it">
            <Cost gas="money">You set the budget · From $0.50 per seat</Cost>
            <P>
              An <Hi>Ask</Hi> is a question with three numbers: a budget, a
              number of seats and a deadline. People answer, you pay for the
              answers you accept, and each payout is recorded next to the answer
              that earned it.
            </P>
            <P>
              You can lock the budget in an escrow contract on Base before the
              question exists. Then whoever answers can check, before writing a
              word, that the money is really there — the contract has no owner
              and no off switch, so not even we can take it back out.
            </P>
            <P>
              Worth knowing before you do it: <Hi>nobody has yet</Hi>. The
              contract is deployed, its source is public and it is holding
              exactly nothing — no transaction has ever touched it. That is a
              working contract with no queue in front of it, not a busy one.
              Whoever goes first goes first.
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
          <Step number="06" title="Answer someone else's, and get paid for it">
            <Cost gas="none">Free to answer · One signature, no gas</Cost>
            <P>
              Pick an open Ask with a free seat and write. Check two things
              first: whether the budget is locked in escrow, and the
              author&apos;s <Hi>resolve rate</Hi> — the share of their past Asks
              they actually settled, counted only over ones past their deadline.
            </P>
            <P>
              We are blunt about this: on an Ask without escrow, nothing is held
              and nothing forces the author to pay. A seat starts at fifty cents
              and not at fifty dollars for exactly that reason.
            </P>
          </Step>

          {/* ---------------------------------------------------------- */}
          <Step number="07" title="Collect what you are owed">
            <Cost gas="gas">Gas only · The amount is already yours</Cost>
            <P>
              <Hi>Money</Hi> answers four questions in one place: what is waiting
              for you, what you locked in your own open Asks, what you earned and
              what you spent. Every line with a hash opens the transaction.
            </P>
            <P>
              When an author resolves an Ask you won, the contract credits you
              and you collect with one click. If your own Ask ran out of time,
              the same page is where the budget comes back — minus the fee, and
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
            <Go href="/money">Open Money</Go>
          </Step>
        </div>

        {/* ---------------------------------------------------------- */}
        <section className="border-t border-soft-line/70 py-10">
          <h2 className="mb-4 font-soft-display text-[15px] font-semibold uppercase tracking-[0.14em] text-soft-ink-faint">
            Two things worth knowing before you spend anything
          </h2>
          <P>
            <Hi>Nothing here judges answers.</Hi> Escrow settles whether the
            money exists — locked, readable before you write. It settles nothing
            about who deserves it. The author still picks, and there is no
            appeal. The price of refusing to pay is a fee and a public resolve
            rate, which is a price, not a guarantee.
          </P>
          <P>
            <Hi>Onchain means permanent.</Hi> A post written to a contract does
            not come back, and a payment does not reverse. That is what makes
            the numbers here worth anything, and it is also the part that
            deserves a second of thought before you press the button.
          </P>
        </section>
      </div>
    </main>
  );
}

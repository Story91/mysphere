import Link from 'next/link';
import { getCuratorRecord } from '../utils/morpho/curator/read';
import type { CuratorChange } from '../utils/morpho/curator/types';

/**
 * /curators - PUBLICZNY ZAPIS DZIALAN KURATOROW SKARBCOW MORPHO NA BASE.
 *
 * ===========================================================================
 * CO TO JEST
 * ===========================================================================
 * Osoba zarzadzajaca skarbcem moze podniesc sobie prowizje albo oddac skarbiec
 * komus innemu. Kazdy, kto trzyma tam pieniadze, dowiaduje sie o tym wtedy, gdy
 * sam zajrzy - czyli zwykle nigdy. Te parametry sa widoczne w danych Morpho,
 * ale NIKT NIE ZAPISUJE ICH W CZASIE, wiec "kiedys bylo 5%" nie jest nigdzie
 * faktem, tylko czyims wspomnieniem. Ta strona jest tym zapisem.
 *
 * ===========================================================================
 * DLACZEGO STRONA, A NIE POSTY W FEEDZIE
 * ===========================================================================
 * Pierwszy odruch przy takiej funkcji to wpuszczenie wpisow do feedu jako
 * postow. NIE WOLNO tego zrobic: wlasciciel kazal usunac posty AI ze wszystkich
 * sieci, a strumien wpisow robota jest tym samym z inna etykieta. Zapis jest
 * DANA, po ktora sie siega, a nie nadawca, ktory sie odzywa.
 *
 * ===========================================================================
 * STRONA MUSI BYC UCZCIWA PIERWSZEGO DNIA
 * ===========================================================================
 * Pierwszego dnia nie ma tu ANI JEDNEGO wpisu i strona ma to POWIEDZIEC.
 * Rozrozniamy cztery stany, ktore w naiwnej wersji wygladaly by identycznie:
 *
 *   odczyt PADL              -> wlasny komunikat i wlasne wyjscie. Nie wiemy,
 *                               czy cos sie zmienilo.
 *   zapis SIE NIE ZACZAL     -> nie zrobiono jeszcze ani jednej migawki.
 *                               Rejestru NIE MA, i tak to nazywamy.
 *   patrzymy, nic sie nie zmienilo -> to jest WYNIK, nie pustka. Podajemy, od
 *                               kiedy patrzymy i ile razy sprawdzilismy.
 *   sa wpisy                 -> lista.
 *
 * Produkt chwalacy sie czyms, czego nie ma, byl juz przedmiotem osobnego
 * commita naprawczego (c6b3a52). Ta strona nie moze byc tym samym bledem
 * napisanym drugi raz.
 *
 * ===========================================================================
 * KOLOR: PROCENT NIE JEST KWOTA
 * ===========================================================================
 * Bursztyn (`soft-accent`) nalezy w tym produkcie WYLACZNIE do kwot. Prowizja
 * 15%, roznica o 10 punktow procentowych i cokolwiek innego zakonczone
 * procentem idzie na `text-soft-ink`. Jedyna liczba na tej stronie, ktora ma
 * prawo do bursztynu, to TVL W DOLARACH. Ta zasada byla lamana i naprawiana
 * szesc razy w jednej sesji, a strona o prowizjach jest najlatwiejszym
 * miejscem, zeby zlamac ja po raz siodmy.
 *
 * Komponent SERWEROWY: zero interaktywnosci, zero JS-a u czytelnika. Ponowna
 * proba po awarii jest zwyklym odnosnikiem do tej samej sciezki, a nie
 * przyciskiem ze stanem.
 */

/**
 * Rewalidacja co piec minut. Sprawdzenie chodzi RAZ NA DOBE, wiec czestsza
 * rewalidacja nie pokazalaby niczego nowego - ale piec minut kosztuje
 * najwyzej 61 odczytow na piec minut niezaleznie od liczby odwiedzajacych,
 * a to zdejmuje z tej strony ryzyko bycia droga.
 */
export const revalidate = 300;

export const metadata = {
  title: 'Curator record',
  description:
    'A dated record of what curators changed in listed Morpho vaults on Base: fee changes, curator changes, and vaults entering or leaving the listed set.',
  openGraph: {
    title: 'Someone can raise the fee on your vault without telling you',
    description:
      'A dated, public record of curator actions in listed Morpho vaults on Base. Fees, curators, listings. No opinions, no forecasts, no wallets.',
    type: 'article',
  },
};

/* ------------------------------------------------------------------ */
/*  Formatowanie                                                       */
/* ------------------------------------------------------------------ */

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/**
 * Data w UTC, skladana recznie.
 *
 * `toLocaleDateString` zalezy od strefy i locale SERWERA, ktory renderuje
 * strone - czyli ta sama chwila mialaby rozna date zaleznie od tego, gdzie
 * akurat wykonal sie render. W rejestrze, ktorego cala wartosc siedzi w dacie,
 * to jest nie do przyjecia.
 */
function formatDay(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/**
 * Punkty bazowe -> procent. 1500 bps to 15%.
 *
 * Ucinamy do jednego miejsca po przecinku i USUWAMY zbedne zero, zeby 500 bps
 * bylo "5%", a nie "5.0%". Prowizje sa okraglymi liczbami, wiec miejsce po
 * przecinku pojawia sie rzadko i tylko wtedy, gdy naprawde cos znaczy.
 */
function formatBps(bps: number): string {
  const percent = bps / 100;
  const text = percent.toFixed(1).replace(/\.0$/, '');
  return `${text}%`;
}

/** Roznica prowizji w PUNKTACH PROCENTOWYCH - to nie to samo co procent. */
function formatPointDelta(fromBps: number, toBps: number): string {
  const delta = (toBps - fromBps) / 100;
  const text = Math.abs(delta).toFixed(1).replace(/\.0$/, '');
  const word = Math.abs(delta) === 1 ? 'point' : 'points';
  return `${delta > 0 ? '+' : '−'}${text} percentage ${word}`;
}

/** Kwota w dolarach. JEDYNE miejsce na tej stronie z prawem do bursztynu. */
function formatUsd(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (value >= 1_000) return `$${Math.round(value / 1_000)}K`;
  return `$${Math.round(value)}`;
}

/* ------------------------------------------------------------------ */
/*  Kawalki                                                            */
/* ------------------------------------------------------------------ */

/**
 * Awaria ma wlasny slad i wlasne wyjscie - NIGDY nie udaje pustego rejestru.
 * Ten sam wzorzec co `FailedLine` w app/basechat/components/FeedAskRail.tsx,
 * z jedna roznica: tam wyjsciem jest przycisk ze stanem, tutaj zwykly odnosnik,
 * bo ta strona nie ma i nie potrzebuje ani jednej linii JavaScriptu.
 */
function FailedLine({ message }: { message: string }) {
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-x-3 gap-y-3 rounded-card border border-soft-line bg-soft-surface px-4 py-3.5 shadow-card"
    >
      <p className="min-w-0 flex-1 break-words text-[13px] leading-[1.55] text-soft-ink-muted">
        {message}
      </p>
      <a
        href="/curators"
        className="shrink-0 rounded-pill bg-soft-primary px-3.5 py-1.5 font-soft-display text-[12px] font-semibold text-white transition-transform [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary focus-visible:ring-offset-2 focus-visible:ring-offset-soft-surface"
      >
        Try again
      </a>
    </div>
  );
}

/** Jedno zdanie w karcie - stan, ktory nie jest awaria i nie jest lista. */
function QuietCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-card border border-soft-line bg-soft-surface px-4 py-4 shadow-card sm:px-5 sm:py-5">
      {children}
    </div>
  );
}

/** Etykieta rodzaju zmiany. Rzeczownik, nie zdanie. */
function KindPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="shrink-0 rounded-pill border border-soft-line bg-soft-sunken px-2.5 py-1 font-soft text-[10.5px] font-bold uppercase tracking-[0.08em] text-soft-ink-muted">
      {children}
    </span>
  );
}

const KIND_LABEL: Record<CuratorChange['kind'], string> = {
  fee: 'Fee',
  curator: 'Curator',
  listing: 'Listing',
};

/**
 * Sama zmiana, jednym zdaniem.
 *
 * Strzalka jest znakiem "→", a nie obrazkiem i nie kolorem: kierunek zmiany
 * ma sie czytac tak samo w czytniku ekranu i przy 360px. Podwyzki NIE
 * malujemy na czerwono - to bylby WYROK o kuratorze, a ta strona wydaje
 * wylacznie zapisy z data.
 */
function ChangeLine({ change }: { change: CuratorChange }) {
  if (change.kind === 'fee') {
    return (
      <p className="text-[15px] leading-[1.5] text-soft-ink">
        <span className="font-semibold">Performance fee</span>{' '}
        <span className="tabular-nums">{formatBps(change.fromBps)}</span>
        <span className="mx-1.5 text-soft-ink-faint">→</span>
        <span className="font-semibold tabular-nums">{formatBps(change.toBps)}</span>
        <span className="ml-2 whitespace-nowrap text-[13px] text-soft-ink-muted">
          ({formatPointDelta(change.fromBps, change.toBps)})
        </span>
      </p>
    );
  }

  if (change.kind === 'curator') {
    return (
      <p className="text-[15px] leading-[1.5] text-soft-ink">
        <span className="font-semibold">Managed by</span> {change.fromCurator}
        <span className="mx-1.5 text-soft-ink-faint">→</span>
        <span className="font-semibold">{change.toCurator}</span>
      </p>
    );
  }

  return (
    <p className="text-[15px] leading-[1.5] text-soft-ink">
      <span className="font-semibold">
        {change.state === 'appeared' ? 'Entered the listed set' : 'Left the listed set'}
      </span>
      <span className="ml-2 text-[13px] text-soft-ink-muted">
        {change.state === 'appeared'
          ? 'Morpho started listing this vault.'
          : 'The vault still exists — it is no longer listed.'}
      </span>
    </p>
  );
}

/** Kto prowadzil skarbiec przy tej zmianie. Przy zmianie kuratora zbedne. */
function curatorOf(change: CuratorChange): string | null {
  return change.kind === 'curator' ? null : change.curator;
}

function ChangeCard({ change }: { change: CuratorChange }) {
  const curator = curatorOf(change);
  const tvl = change.vault.totalAssetsUsd;

  return (
    <li className="rounded-card border border-soft-line bg-soft-surface p-4 shadow-card sm:p-5">
      <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1.5">
        <h3 className="min-w-0 font-soft-display text-[15px] font-bold leading-[1.3] text-soft-ink">
          {change.vault.name}
          {change.vault.assetSymbol && (
            <span className="ml-1.5 font-soft text-[12.5px] font-semibold text-soft-ink-faint">
              {change.vault.assetSymbol}
            </span>
          )}
        </h3>
        <KindPill>{KIND_LABEL[change.kind]}</KindPill>
      </div>

      <ChangeLine change={change} />

      <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 border-t border-dashed border-soft-line/70 pt-2.5 text-[12px] leading-[1.5] text-soft-ink-soft">
        {curator && (
          <span>
            Curator <span className="font-semibold text-soft-ink">{curator}</span>
          </span>
        )}
        {tvl !== null && (
          // JEDYNY bursztyn na tej stronie - i tylko dlatego, ze to dolary.
          <span>
            <span className="font-semibold tabular-nums text-soft-accent-deep">
              {formatUsd(tvl)}
            </span>{' '}
            in the vault when we saw it
          </span>
        )}
        {/* Przedzial, nie chwila. Porownujemy migawki, wiec dokladnej godziny
            zmiany NIE ZNAMY i nie wolno jej zmyslic. */}
        <span>
          Seen between {formatDay(change.windowStart)} and {formatDay(change.observedAt)}
        </span>
      </div>
    </li>
  );
}

/* ------------------------------------------------------------------ */

export default async function CuratorsPage() {
  const result = await getCuratorRecord();

  return (
    <main className="min-h-screen bg-soft-bg font-soft">
      <div className="mx-auto max-w-[760px] px-5 py-14 sm:px-8 sm:py-20">
        <p className="mb-4 font-soft text-[11px] font-bold uppercase tracking-[0.18em] text-soft-ink-faint">
          Curator record
        </p>

        <h1 className="mb-5 font-soft-display text-[34px] font-bold leading-[1.1] tracking-[-0.02em] text-soft-ink sm:text-[44px]">
          Someone can change the terms
          <br />
          of your vault overnight.
        </h1>

        <p className="mb-4 max-w-[58ch] text-[16px] leading-[1.65] text-soft-ink-muted">
          A Morpho vault has a curator: the person or firm that sets its fee and
          decides what it lends against. They can raise that fee, or hand the
          vault to someone else, and nobody has to tell you. The numbers are
          public — what is missing is anyone writing down what they used to be.
        </p>

        <p className="mb-10 max-w-[58ch] text-[14px] leading-[1.6] text-soft-ink-soft">
          So we write them down. Once a day we read the parameters of every
          listed vault on Base and keep only the differences. No opinions about
          any curator, no predictions, and nothing about anyone&apos;s wallet —
          a fee that went from one number to another, with the dates we saw it
          between.
        </p>

        {!result.ok ? (
          <FailedLine message="This record could not be read. That is a failed read, not an empty record — we cannot tell you right now whether anything changed." />
        ) : result.record.watch === null ? (
          /* ===== ZAPIS SIE NIE ZACZAL =====
             Ani jednej migawki. Nie ma tu czego pokazac i nie ma czego udawac.
             Zdanie mowi wprost, ze rejestr jest pusty, BO NIC JESZCZE NIE
             SPRAWDZILISMY - a nie dlatego, ze kuratorzy niczego nie zmienili. */
          <QuietCard>
            <p className="mb-2 font-soft-display text-[16px] font-bold text-soft-ink">
              The record has not started yet.
            </p>
            <p className="text-[14px] leading-[1.6] text-soft-ink-muted">
              Nothing has been checked, so there is nothing here — and an empty
              page is not evidence that no curator changed anything. The first
              check takes a baseline reading and produces no entries at all,
              because a first reading is a starting point, not an event. Entries
              can only appear from the second check onward.
            </p>
          </QuietCard>
        ) : result.record.changes.length === 0 ? (
          /* ===== PATRZYMY I NIC SIE NIE ZMIENILO =====
             To jest WYNIK, a nie brak danych - i dlatego dostaje liczby: od
             kiedy patrzymy, ile skarbcow i ile udanych sprawdzen. Bez nich
             ten stan wygladalby identycznie jak stan powyzej. */
          <QuietCard>
            <p className="mb-2 font-soft-display text-[16px] font-bold text-soft-ink">
              Nothing has changed since we started watching.
            </p>
            <p className="text-[14px] leading-[1.6] text-soft-ink-muted">
              Watching{' '}
              <span className="font-semibold tabular-nums text-soft-ink">
                {result.record.watch.vaultCount}
              </span>{' '}
              listed vaults on Base since {formatDay(result.record.watch.firstObservedAt)}, last
              checked {formatDay(result.record.watch.observedAt)}. That is{' '}
              <span className="tabular-nums">{result.record.watch.checkCount}</span>{' '}
              {result.record.watch.checkCount === 1 ? 'check' : 'checks'} with no fee change, no
              curator change and no vault entering or leaving the list. This is a result, not a
              missing page.
            </p>
          </QuietCard>
        ) : (
          <>
            <p className="mb-4 text-[13px] leading-[1.55] text-soft-ink-soft">
              Watching{' '}
              <span className="font-semibold tabular-nums text-soft-ink">
                {result.record.watch.vaultCount}
              </span>{' '}
              listed vaults on Base since {formatDay(result.record.watch.firstObservedAt)}. Last
              checked {formatDay(result.record.watch.observedAt)}.
            </p>
            <ul className="flex flex-col gap-3">
              {result.record.changes.map((change) => (
                <ChangeCard key={change.id} change={change} />
              ))}
            </ul>
          </>
        )}

        {/* ==============================================================
            CO TEN ZAPIS OBEJMUJE, A CZEGO NIE
            Ta sekcja nie jest zastrzezeniem prawnym i nie stoi drobnym drukiem.
            Rejestr, ktory nie mowi, czego NIE pilnuje, czyta sie jak rejestr,
            ktory pilnuje wszystkiego - a wtedy brak wpisu znaczy dla czytelnika
            "nic sie nie stalo", co bylo by nieprawda.
           ============================================================== */}
        <section className="mt-12 border-t border-soft-line/70 pt-10">
          <h2 className="mb-4 font-soft-display text-[22px] font-bold leading-[1.2] tracking-[-0.01em] text-soft-ink sm:text-[26px]">
            What this covers, and what it does not
          </h2>
          <div className="max-w-[64ch]">
            <p className="mb-3 text-[15px] leading-[1.7] text-soft-ink-muted">
              <strong className="font-semibold text-soft-ink">Three things are recorded:</strong>{' '}
              the performance fee, who curates the vault, and whether the vault is in Morpho&apos;s
              listed set. Those are decisions somebody makes. Yield and deposits move on their own
              every hour, so they are not decisions and are not recorded — three real events would
              drown in a thousand meaningless ones.
            </p>
            <p className="mb-3 text-[15px] leading-[1.7] text-soft-ink-muted">
              <strong className="font-semibold text-soft-ink">
                Collateral changes are not recorded.
              </strong>{' '}
              A curator can also let a vault lend against something new, which changes your risk as
              much as a fee does. We do not read that field, so this page does not claim to watch
              it. An empty page is not proof that a vault stayed the same.
            </p>
            <p className="mb-3 text-[15px] leading-[1.7] text-soft-ink-muted">
              <strong className="font-semibold text-soft-ink">Dates are ranges, not moments.</strong>{' '}
              We compare one daily reading to the previous one, so we know a change happened between
              two dates and not the hour it happened. Fee and curator changes are onchain, so an
              exact block is provable — we do not read it from the chain today, and this page says
              &ldquo;seen between&rdquo; rather than inventing a timestamp we do not have.
            </p>
            <p className="mb-3 text-[15px] leading-[1.7] text-soft-ink-muted">
              <strong className="font-semibold text-soft-ink">Nobody&apos;s wallet is here.</strong>{' '}
              This page has no idea which vaults you use, and it never will. It reads public vault
              parameters and nothing else.
            </p>
            <p className="text-[15px] leading-[1.7] text-soft-ink-muted">
              <strong className="font-semibold text-soft-ink">
                If you need someone to read a vault for you
              </strong>
              , that is what an Ask is for: put a budget on the question and pay the person who
              answers it.{' '}
              <Link
                href="/asks"
                className="font-semibold text-soft-primary-deep underline decoration-soft-line underline-offset-4 hover:text-soft-primary"
              >
                Open Asks
              </Link>
              .
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}

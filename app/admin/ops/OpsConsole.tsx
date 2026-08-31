'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// `import type` znika w kompilacji, wiec collect.ts NIE trafia do paczki
// przegladarki razem z adresami i progami. To musi zostac importem typu.
import type {
  ContractRow,
  EscrowRow,
  FacilitatorStatus,
  FeeRow,
  GasRow,
  Health,
  OpsReport,
} from '../../utils/ops/collect';

/**
 * KONSOLA OPERATORA - warstwa widoku.
 *
 * === CO TA STRONA MA ZROBIC W PIERWSZEJ SEKUNDZIE ===
 * Odpowiedziec na jedno pytanie: "czy cos wymaga mnie TERAZ". Dlatego na gorze
 * jest jedno zdanie werdyktu, a sekcje ida w kolejnosci pilnosci: gaz, ktory
 * moze wyschnac i zatrzymac platnosci; wyplacalnosc escrow; pieniadze do
 * odebrania; facilitator; inwentarz kontraktow.
 *
 * === KOLOR ===
 * Pomaranczowy (soft-accent) jest zarezerwowany dla KWOT i nigdzie indziej sie
 * tu nie pojawia - gdyby alarmy tez byly pomaranczowe, pomaranczowy przestalby
 * cokolwiek znaczyc. Alarm i ostrzezenie sa tym samym odcieniem rozu w dwoch
 * natezeniach, bo ostrzezenie to alarm w drodze. "Nie udalo sie sprawdzic" jest
 * szare i ma WLASNY ksztalt - nie wolno go pomylic ani z porzadkiem, ani z zerem.
 *
 * === AWARIA != PUSTKA ===
 * Kazda liczba przychodzi jako `T | null`. `null` renderuje sie jako
 * "could not read" razem z powodem - nigdy jako 0 i nigdy jako pusty wiersz.
 * Gdy padnie samo pobranie raportu, ostatni dobry raport ZOSTAJE na ekranie,
 * oznaczony jako nieaktualny, z przyciskiem ponowienia.
 */

/* ------------------------------------------------------------------ */
/*  STAN ZDROWIA -> WYGLAD                                             */
/* ------------------------------------------------------------------ */

const HEALTH_STYLE: Record<Health, { label: string; chip: string }> = {
  ok: { label: 'OK', chip: 'bg-[#E6F4EC] text-[#1E7A55]' },
  info: { label: 'For info', chip: 'bg-soft-info-soft text-soft-info' },
  unknown: { label: 'Not checked', chip: 'bg-soft-sunken text-soft-ink-muted' },
  warn: { label: 'Watch', chip: 'bg-[#FBEEF1] text-[#A33A50]' },
  alarm: { label: 'Alarm', chip: 'bg-[#F7D9DF] text-[#8F1F36]' },
};

/**
 * Przyciski konsoli.
 *
 * === CO STAD ZNIKNELO I DLACZEGO ===
 * Kazdy z nich mial `hover:scale-[1.03]`, czyli POWIEKSZANIE na najechaniu.
 * Dwa powody, kazdy sam wystarczy. Po pierwsze, w calym tym produkcie przyciski
 * reaguja na NACISNIECIE (`active:scale-[0.97]`) i nigdy na najechanie - konsola
 * byla jedynym ekranem mowiacym innym jezykiem. Po drugie, ekran dotykowy nie ma
 * najechania: pierwsze dotkniecie odpala tam `:hover`, wiec przycisk najpierw
 * puchl, a potem sie kurczyl, co przy przycisku odswiezajacym raport wyglada jak
 * usterka. Zostaje reakcja na nacisniecie i zmiana tla.
 *
 * Doszly za to obwodki ogniskowej. Konsola byla jedyna z czterech przejrzanych
 * stron, po ktorej nie dalo sie chodzic klawiatura z widocznym zaznaczeniem.
 */
const BUTTON_BASE =
  'rounded-pill px-5 py-2.5 font-soft-display text-[13px] font-bold transition-[background-color,transform] ease-out-strong [transition-duration:var(--dur-press)] active:scale-[0.97] disabled:opacity-50 disabled:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary focus-visible:ring-offset-2 focus-visible:ring-offset-soft-surface';

const BUTTON_PRIMARY = `${BUTTON_BASE} bg-soft-primary text-white shadow-chip hover:bg-soft-primary-deep`;

const BUTTON_QUIET = `${BUTTON_BASE} border border-soft-line bg-soft-surface text-soft-primary hover:bg-soft-sunken`;

function Chip({ health, children }: { health: Health; children?: React.ReactNode }) {
  const style = HEALTH_STYLE[health];
  return (
    <span
      className={`inline-flex flex-none items-center rounded-pill px-3 py-1 font-soft-display text-xs font-bold uppercase tracking-wide ${style.chip}`}
    >
      {children ?? style.label}
    </span>
  );
}

/** Zdanie o niepowodzeniu odczytu. Zawsze widoczne, nigdy zwiniete w ikonke. */
function ReadFailure({ reason }: { reason: string | null }) {
  return (
    <p className="mt-2 rounded-2xl bg-soft-sunken px-3 py-2 text-[12px] leading-relaxed text-soft-ink-muted">
      <span className="font-bold text-soft-ink">Could not read this. </span>
      {reason ?? 'No reason came back from the call.'}
    </p>
  );
}

/** Kwota pieniedzy. JEDYNE miejsce, w ktorym uzywamy pomaranczy. */
function Money({ text, size = 'lg' }: { text: string | null; size?: 'lg' | 'md' }) {
  if (text === null) {
    return <span className="font-mono text-base text-soft-ink-faint">not read</span>;
  }
  return (
    <span
      className={`font-mono font-semibold tabular-nums text-soft-accent-deep ${size === 'lg' ? 'text-2xl' : 'text-base'}`}
    >
      {text}
    </span>
  );
}

function shortAddr(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function AddressLink({ address, url }: { address: string; url: string | null }) {
  const label = shortAddr(address);
  if (!url) return <span className="font-mono text-[11.5px] text-soft-ink-soft">{label}</span>;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      /* Bylo `transition-transform` z `hover:scale-[1.03]` i zmiana koloru bez
         przejscia - czyli animowana byla wlasnie ta wlasciwosc, ktora sie nie
         zmienia, a ta, ktora sie zmienia, skakala. Do tego powiekszanie na hover
         na ekranie dotykowym odpala sie przy dotknieciu: adres puchnie pod
         palcem, ktory chcial go otworzyc. Zostaje sam kolor. */
      className="font-mono text-[11.5px] text-soft-ink-soft underline decoration-soft-line underline-offset-2 transition-colors ease-out-strong [transition-duration:var(--dur-press)] hover:text-soft-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
    >
      {label}
    </a>
  );
}

function Section({
  title,
  lead,
  children,
}: {
  title: string;
  lead: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10">
      <h2 className="font-soft-display text-xl font-bold text-soft-ink">{title}</h2>
      {/* `max-w-[62ch]` zamiast `max-w-2xl` - miara wiersza liczona w znakach,
          jak na pozostalych stronach, a nie w pikselach kontenera. */}
      <p className="mt-1 max-w-[62ch] text-[13px] leading-relaxed text-soft-ink-muted">{lead}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  1. GAZ                                                             */
/* ------------------------------------------------------------------ */

function GasCard({ row }: { row: GasRow }) {
  return (
    <article className="rounded-card bg-soft-surface p-5 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-soft-display text-base font-bold text-soft-ink">{row.label}</h3>
          <p className="mt-0.5 text-[11.5px] text-soft-ink-soft">
            {row.chainName} · <AddressLink address={row.address} url={row.explorerUrl} />
          </p>
        </div>
        <Chip health={row.health} />
      </div>

      <p className="mt-3 text-[12px] leading-relaxed text-soft-ink-muted">{row.consequence}</p>

      <div className="mt-4 flex items-baseline gap-2">
        {row.balanceText === null ? (
          <span className="font-mono text-lg text-soft-ink-faint">balance not read</span>
        ) : (
          <span className="font-mono text-2xl font-semibold tabular-nums text-soft-ink">
            {row.balanceText}
          </span>
        )}
      </div>

      {/* Zapas jest LICZONY z dwoch odczytow, wiec pokazujemy rownanie, a nie
          sam wynik - liczba, ktorej nie da sie sprawdzic, jest tylko opinia. */}
      {row.monitored ? (
        row.actionsLeft !== null ? (
          <div className="mt-3 rounded-2xl bg-soft-sunken px-4 py-3">
            <p className="font-soft-display text-[13px] font-bold text-soft-ink">
              About {row.actionsLeft.toLocaleString('en-US')} more {row.actionNoun}
            </p>
            <p className="mt-1 text-[12px] leading-relaxed text-soft-ink-muted">
              At {row.gasPriceText}, one costs {row.costPerActionText}. Alarm below{' '}
              {row.alarmBelowActions}, watch below {row.warnBelowActions}.
            </p>
          </div>
        ) : (
          <ReadFailure reason={row.error} />
        )
      ) : (
        <p className="mt-3 text-[12px] leading-relaxed text-soft-ink-soft">
          No threshold on this one: it receives and never pays gas, so there is nothing here to run out.
        </p>
      )}

      {row.monitored && row.actionsLeft !== null && row.error && <ReadFailure reason={row.error} />}
      {row.balanceText === null && <ReadFailure reason={row.error} />}
    </article>
  );
}

/* ------------------------------------------------------------------ */
/*  2. ESCROW                                                          */
/* ------------------------------------------------------------------ */

function EscrowCard({ row }: { row: EscrowRow }) {
  return (
    <article className="rounded-card bg-soft-surface p-5 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-soft-display text-base font-bold text-soft-ink">
            AskEscrow · {row.chainName}
          </h3>
          <p className="mt-0.5 text-[11.5px] text-soft-ink-soft">
            <AddressLink address={row.address} url={row.explorerUrl} />
          </p>
        </div>
        <Chip health={row.health} />
      </div>

      {/* Te dwie liczby MUSZA stac obok siebie. Osobno kazda z nich wyglada
          poprawnie i nie mowi nic - cala tresc jest w ich roznicy. */}
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl bg-soft-sunken px-4 py-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-soft-ink-soft">
            Ledger owes
          </p>
          <p className="mt-1">
            <Money text={row.liabilitiesText} size="md" />
          </p>
        </div>
        <div className="rounded-2xl bg-soft-sunken px-4 py-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-soft-ink-soft">
            Actually holds
          </p>
          <p className="mt-1">
            <Money text={row.balanceText} size="md" />
          </p>
        </div>
        <div className="rounded-2xl bg-soft-sunken px-4 py-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-soft-ink-soft">
            Difference
          </p>
          <p className="mt-1">
            <Money text={row.differenceText} size="md" />
          </p>
        </div>
      </div>

      <p className="mt-3 text-[13px] leading-relaxed text-soft-ink">{row.verdict}</p>
      {row.error && <ReadFailure reason={row.error} />}
    </article>
  );
}

/* ------------------------------------------------------------------ */
/*  3. PROWIZJA                                                        */
/* ------------------------------------------------------------------ */

function FeeCard({ row }: { row: FeeRow }) {
  return (
    <article className="rounded-card bg-soft-surface p-5 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-soft-display text-base font-bold text-soft-ink">
            Platform fee waiting · {row.chainName}
          </h3>
          <p className="mt-0.5 text-[11.5px] text-soft-ink-soft">
            Recipient{' '}
            {row.feeRecipient ? (
              <span className="font-mono">{shortAddr(row.feeRecipient)}</span>
            ) : (
              'not read'
            )}
          </p>
        </div>
        <Chip health={row.health} />
      </div>

      <p className="mt-4">
        <Money text={row.claimableText} />
      </p>

      {row.matchesDeploymentFile === false && (
        <p className="mt-3 rounded-2xl bg-[#FBEEF1] px-4 py-3 text-[12px] leading-relaxed text-[#A33A50]">
          The chain reports a different fee recipient than deployments/askEscrow.{row.chainId}.json.
          The file describes a different deployment than the one being read.
        </p>
      )}

      {/* Konsola PATRZY. Zdanie ponizej jest tu po to, zeby nikt nie szukal
          przycisku, ktorego swiadomie nie ma. */}
      <p className="mt-3 text-[12px] leading-relaxed text-soft-ink-muted">
        This console cannot claim it. Claiming sends a transaction, and nothing on this page sends
        transactions.
      </p>

      {row.error && <ReadFailure reason={row.error} />}
    </article>
  );
}

/* ------------------------------------------------------------------ */
/*  4. FACILITATOR                                                     */
/* ------------------------------------------------------------------ */

function FacilitatorCard({ status }: { status: FacilitatorStatus }) {
  return (
    <article className="rounded-card bg-soft-surface p-5 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-soft-display text-base font-bold text-soft-ink">
            x402 facilitator still serves us
          </h3>
          <p className="mt-0.5 break-all font-mono text-[11.5px] text-soft-ink-soft">{status.url}</p>
        </div>
        <Chip health={status.health} />
      </div>

      <p className="mt-3 text-[13px] leading-relaxed text-soft-ink">
        {status.supported === true &&
          `The facilitator still lists ${status.requiredKind}. Agent payments have somewhere to settle.`}
        {status.supported === false &&
          `The facilitator no longer lists ${status.requiredKind}. Agent payments will fail with no change on our side.`}
        {status.supported === null &&
          `Whether ${status.requiredKind} is still listed is unknown - the check did not complete.`}
      </p>

      {status.kindsSeen !== null && (
        <p className="mt-2 text-[11.5px] text-soft-ink-soft">
          {status.kindsSeen} scheme{status.kindsSeen === 1 ? '' : 's'} advertised in total.
        </p>
      )}

      {status.error && <ReadFailure reason={status.error} />}
    </article>
  );
}

/* ------------------------------------------------------------------ */
/*  5. KONTRAKTY                                                       */
/* ------------------------------------------------------------------ */

function ContractLine({ row }: { row: ContractRow }) {
  const quiet = row.expects !== 'code' && row.health === 'ok';
  return (
    <li
      className={`flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-soft-line/60 px-4 py-3 last:border-b-0 ${
        quiet ? 'opacity-70' : ''
      }`}
    >
      <span className="min-w-[10rem] flex-1 font-soft-display text-[13px] font-bold text-soft-ink">
        {row.label}
      </span>
      <span className="text-[11.5px] text-soft-ink-soft">{row.chainName}</span>
      <AddressLink address={row.address} url={row.explorerUrl} />
      <span className="font-mono text-[11.5px] text-soft-ink-soft">
        {row.codeSize === null
          ? 'size unknown'
          : row.codeSize === 0
            ? 'no code'
            : `${row.codeSize.toLocaleString('en-US')} B`}
      </span>
      {/* 'no-code' w porzadku to NIE jest "OK" w sensie "kontrakt stoi".
          Osobne slowo, zeby wiersz nie klamal jednym spojrzeniem. */}
      <Chip health={row.health}>
        {row.health !== 'ok'
          ? undefined
          : row.expects === 'no-code'
            ? 'Known'
            : row.expects === 'delegated'
              ? 'Delegated'
              : row.expects === 'probe'
                ? 'Probe'
                : undefined}
      </Chip>
      {(row.note || row.error) && (
        <p className="w-full text-[12px] leading-relaxed text-soft-ink-muted">{row.error ?? row.note}</p>
      )}
    </li>
  );
}

/* ------------------------------------------------------------------ */
/*  KONSOLA                                                            */
/* ------------------------------------------------------------------ */

const VERDICT: Record<Health, string> = {
  alarm: 'Something needs you now.',
  warn: 'Nothing is broken yet, but something is heading there.',
  unknown: 'Part of the system could not be checked. That is not the same as fine.',
  info: 'Nothing is asking for you.',
  ok: 'Everything that could be checked is where it should be.',
};

/**
 * ODSWIEZANIE - dlaczego tak, a nie przy kazdym renderze.
 *
 * Serwer trzyma dwa okna: 60 s dla gazu / escrow / prowizji / facilitatora
 * i 15 min dla inwentarza bajtkodu (uzasadnienie przy OPS_TIMINGS w collect.ts).
 * Klient odpytuje wlasna trase co 60 s i TYLKO gdy karta jest widoczna -
 * konsola zostawiona otwarta na drugim monitorze przez noc nie ma powodu
 * kosztowac 500 wywolan RPC. Po powrocie do karty dociagamy natychmiast, bo
 * pierwsze spojrzenie na stara liczbe jest gorsze niz brak liczby.
 */
const POLL_MS = 60_000;

export default function OpsConsole() {
  const [report, setReport] = useState<OpsReport | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const [showQuiet, setShowQuiet] = useState(false);

  // Zapobiega nadpisaniu swiezszego wyniku przez wolniejsza, starsza odpowiedz.
  const requestSeq = useRef(0);

  const load = useCallback(async (scope: 'none' | 'hot' | 'all') => {
    const seq = ++requestSeq.current;
    setIsLoading(true);
    try {
      const query = scope === 'none' ? '' : `?refresh=${scope}`;
      const response = await fetch(`/api/admin/ops${query}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!response.ok) {
        throw new Error(
          response.status === 404
            ? 'The server did not recognise this session as an admin session. Sign in again.'
            : `The status endpoint answered ${response.status}.`
        );
      }
      const data = (await response.json()) as OpsReport;
      if (seq !== requestSeq.current) return;
      setReport(data);
      setFetchError(null);
    } catch (error) {
      if (seq !== requestSeq.current) return;
      // Ostatni dobry raport ZOSTAJE na ekranie. Wyczyszczenie go zamienialoby
      // padniete zapytanie w "nic tu nie ma", czyli w cisza zamiast awarii.
      setFetchError(error instanceof Error ? error.message : 'The status request failed.');
    } finally {
      if (seq === requestSeq.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load('none');
  }, [load]);

  // Zegar do "checked N ago" - osobno od pobierania, zeby tekst starzal sie
  // nawet wtedy, gdy zapytania padaja.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') void load('none');
    };
    const timer = window.setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [load]);

  const ageSeconds = report ? Math.max(0, Math.round((now - report.hot.checkedAt) / 1000)) : null;
  const coldAgeMinutes = report ? Math.max(0, Math.round((now - report.cold.checkedAt) / 60000)) : null;
  const worst: Health = report?.worst ?? 'unknown';

  const contracts = report?.cold.contracts ?? [];
  const loudContracts = contracts.filter((c) => !(c.expects !== 'code' && c.health === 'ok'));
  const quietContracts = contracts.filter((c) => c.expects !== 'code' && c.health === 'ok');

  // Ten sam lancuch pojawia sie w obu przebiegach - pokazujemy go raz.
  const unreachable = Array.from(
    new Map(
      [...(report?.hot.chains ?? []), ...(report?.cold.chains ?? [])]
        .filter((c) => c.health !== 'ok')
        .map((c) => [c.chainId, c] as const)
    ).values()
  );

  return (
    <main className="min-h-screen bg-soft-bg px-4 py-10 font-soft text-soft-ink">
      <div className="mx-auto max-w-5xl">
        {/* ---------- naglowek i werdykt ----------
            Karta werdyktu ZMIENIA SIE RAZEM Z WERDYKTEM. Do tej pory alarm i
            spokoj wygladaly identycznie - biala karta, a jedyna roznica byla
            pigulka wielkosci paznokcia w rogu. Konsola ma odpowiedziec w
            pierwszej sekundzie, a pierwsza sekunda to kolor calej plaszczyzny,
            nie odczytana etykieta. Roz, nie pomarancz: pomarancz nalezy do kwot
            i gdyby krzyczal takze alarm, przestalby cokolwiek znaczyc. */}
        <header
          className={`rounded-card border bg-soft-surface p-6 shadow-card ${
            worst === 'alarm'
              ? 'border-[#8F1F36]/40'
              : worst === 'warn'
                ? 'border-[#A33A50]/30'
                : 'border-soft-line'
          }`}
        >
          <p className="font-soft-display text-[11px] font-bold uppercase tracking-[0.2em] text-soft-ink-soft">
            Operator console
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="font-soft-display text-[24px] font-bold leading-[1.15] sm:text-[30px]">
              {VERDICT[worst]}
            </h1>
            <Chip health={worst} />
          </div>
          <p className="mt-2 max-w-[62ch] text-[13px] leading-relaxed text-soft-ink-muted">
            Eleven contracts, seven chains, two hot keys and one external payment facilitator. This
            page only reads them. Nothing here can send a transaction.
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void load('hot')}
              disabled={isLoading}
              className={BUTTON_PRIMARY}
            >
              {isLoading ? 'Checking…' : 'Check now'}
            </button>
            <button
              type="button"
              onClick={() => void load('all')}
              disabled={isLoading}
              className={BUTTON_QUIET}
            >
              Re-check contract bytecode
            </button>
            <p className="text-[11.5px] leading-relaxed text-soft-ink-soft">
              {ageSeconds === null
                ? 'Nothing loaded yet.'
                : `Live figures checked ${ageSeconds}s ago, refreshed every ${POLL_MS / 1000}s. Bytecode inventory checked ${coldAgeMinutes}m ago.`}
            </p>
          </div>

          {fetchError && (
            <div className="mt-4 rounded-2xl bg-[#FBEEF1] px-4 py-3">
              <p className="font-soft-display text-[13px] font-bold text-[#8F1F36]">
                The last request failed.
              </p>
              <p className="mt-1 text-[12px] leading-relaxed text-[#A33A50]">
                {fetchError}
                {report ? ' Everything below is the last successful read and is now out of date.' : ''}
              </p>
              <button
                type="button"
                onClick={() => void load('hot')}
                className="mt-3 rounded-pill bg-[#8F1F36] px-4 py-2 font-soft-display text-[12px] font-bold text-white transition-[background-color,transform] ease-out-strong [transition-duration:var(--dur-press)] hover:bg-[#7A1A2E] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8F1F36] focus-visible:ring-offset-2"
              >
                Try again
              </button>
            </div>
          )}
        </header>

        {/* PIERWSZE WEJSCIE. Bylo tu jedno zdanie w szarosci na calej pustej
            stronie - czyli ekran nie do odroznienia od "nic tu nie ma".
            Ksztalty kart mowia, ILE tresci sie zaraz pojawi i gdzie, wiec
            czekanie przestaje wygladac jak wynik. */}
        {!report && !fetchError && (
          <div className="mt-10" aria-busy="true">
            <p className="text-[13px] text-soft-ink-muted">Reading the chains…</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {[0, 1, 2, 3].map((slot) => (
                <div key={slot} className="rounded-card bg-soft-surface p-5 shadow-card">
                  <div className="h-3.5 w-2/5 rounded-pill bg-soft-sunken" />
                  <div className="mt-3 h-3 w-3/4 rounded-pill bg-soft-sunken" />
                  <div className="mt-5 h-6 w-1/3 rounded-pill bg-soft-sunken" />
                </div>
              ))}
            </div>
          </div>
        )}

        {!report && fetchError && (
          <p className="mt-10 max-w-[62ch] text-[13px] leading-relaxed text-soft-ink-muted">
            Nothing has been read yet, so there is nothing to show. This is not an empty system - it
            is an unanswered question. Use “Try again” above.
          </p>
        )}

        {report && (
          <>
            {/* ---------- 1. GAZ ---------- */}
            <Section
              title="Gas on every address that pays for something"
              lead="Thresholds are counted in actions, not in ETH: the balance is divided by the current gas price times the gas one action costs. Both numbers come from the chain, so the threshold moves with it."
            >
              <div className="grid gap-4 sm:grid-cols-2">
                {report.hot.gas.map((row) => (
                  <GasCard key={row.key} row={row} />
                ))}
              </div>
            </Section>

            {/* ---------- 2. ESCROW ---------- */}
            <Section
              title="Escrow solvency"
              lead="What the contract's ledger says it owes, next to the USDC it actually holds. The contract's own invariant is that the balance is never smaller than the ledger; equal is the healthy state."
            >
              <div className="grid gap-4">
                {report.hot.escrow.map((row) => (
                  <EscrowCard key={`${row.chainId}-${row.address}`} row={row} />
                ))}
              </div>
            </Section>

            {/* ---------- 3. PROWIZJA ---------- */}
            <Section
              title="Platform fee waiting to be claimed"
              lead="Fees accrue inside the escrow until someone claims them. Until now nobody could see that anything was sitting there."
            >
              <div className="grid gap-4 sm:grid-cols-2">
                {report.hot.fees.map((row) => (
                  <FeeCard key={`${row.chainId}-fee`} row={row} />
                ))}
              </div>
            </Section>

            {/* ---------- 4. FACILITATOR ---------- */}
            <Section
              title="The payment facilitator"
              lead="An outside service our agent payments depend on. It can stop supporting our scheme without anything changing in this repository."
            >
              <FacilitatorCard status={report.hot.facilitator} />
            </Section>

            {/* ---------- 5. KONTRAKTY ---------- */}
            <Section
              title="Contract inventory"
              lead="Whether there is bytecode at every address the app calls, on the network it calls it on. Four addresses are known to have none and one wallet is known to carry an EIP-7702 delegation; those are recorded as known states so they do not shout on every visit. A change to any of them does."
            >
              <ul className="overflow-hidden rounded-card bg-soft-surface shadow-card">
                {loudContracts.map((row) => (
                  <ContractLine key={row.key} row={row} />
                ))}
              </ul>

              {quietContracts.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => setShowQuiet((v) => !v)}
                    aria-expanded={showQuiet}
                    className={`${BUTTON_QUIET} mt-3 px-4 py-2 text-[12px]`}
                  >
                    {showQuiet ? 'Hide' : 'Show'} {quietContracts.length} known-quiet addresses
                  </button>
                  {showQuiet && (
                    <ul className="mt-3 overflow-hidden rounded-card bg-soft-surface shadow-card">
                      {quietContracts.map((row) => (
                        <ContractLine key={row.key} row={row} />
                      ))}
                    </ul>
                  )}
                </>
              )}
            </Section>

            {/* ---------- lancuchy, ktore nie odpowiedzialy ---------- */}
            {unreachable.length > 0 && (
              <Section
                title="Chains that did not answer"
                lead="Every figure that depends on these is marked as unread above, not as zero."
              >
                <ul className="overflow-hidden rounded-card bg-soft-surface shadow-card">
                  {unreachable.map((chain) => (
                    <li
                      key={chain.chainId}
                      className="border-b border-soft-line/60 px-4 py-3 last:border-b-0"
                    >
                      <p className="font-soft-display text-[13px] font-bold text-soft-ink">
                        {chain.chainName}
                      </p>
                      <p className="mt-1 break-words text-[12px] leading-relaxed text-soft-ink-muted">
                        {chain.error ?? 'No reason came back.'}
                      </p>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            <p className="mt-10 pb-6 text-[12px] leading-relaxed text-soft-ink-soft">
              Every figure on this page comes from eth_call, eth_getBalance or eth_getCode, plus one
              HTTPS request to the facilitator. There is no write path in this console.
            </p>
          </>
        )}
      </div>
    </main>
  );
}

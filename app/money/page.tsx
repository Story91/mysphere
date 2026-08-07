'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useAccount, usePublicClient } from 'wagmi';
import { base } from 'wagmi/chains';
import MobileBottomNav from '../components/MobileBottomNav';
import AskClaimPanel from '../basechat/components/AskClaimPanel';
import { getProofLink, resolveTipNetwork } from '../basechat/components/TipNetworkConfig';
import {
  getMoneyLedger,
  isLedgerEmpty,
  type MoneyEvent,
  type MoneyLedger,
  type MoneySection,
  type OpenAskRow,
} from '../utils/money/getMoneyLedger';
import { escrowDeployment, readEscrow, unitsToAmount } from '../utils/asks/escrow';
import { formatAmount, formatReceived } from '../utils/tips/getLeaderboard';
import { getIdentities, type Identity } from '../utils/identity/getIdentities';
import { getSlicedAddress } from '../utils/identity/resolver';
import type { TokenAmounts } from '../utils/asks/types';

/**
 * TWOJE PIENIADZE TUTAJ.
 *
 * === CZYM TA STRONA NIE JEST ===
 * Nie jest lista tokenow ani wycena portfela. Od pokazywania sald jest portfel,
 * robi to lepiej i zna kursy, ktorych my nie znamy. Ta strona odpowiada na
 * cztery pytania, ktore ma czlowiek uzywajacy TEGO produktu, a ktore do dzis
 * nie mialy tu zadnego adresu - odpowiedzi byly rozrzucone po czterech ekranach
 * albo nie bylo ich wcale:
 *
 *   1. ILE MAM DO ODEBRANIA   claimable() z kontraktu escrow. Dotad wylacznie
 *                             na /asks, wiec czlowiek, ktory wygral miejsce,
 *                             dowiadywal sie o swoich pieniadzach tylko wtedy,
 *                             gdy sam wrocil na tamta strone.
 *   2. ILE MAM ZABLOKOWANE    escrowFor(autor, askId) dla wlasnych otwartych
 *                             Askow. Nigdzie w produkcie tego nie bylo.
 *   3. ILE MI ZAPLACONO       napiwki, sprzedane odblokowania, przyjete
 *                             odpowiedzi - kazda pozycja z hashem.
 *   4. ILE WYDALEM            napiwki, kupione odblokowania, budzety wplacone
 *                             na escrow.
 *
 * === DLACZEGO KOMPONENT KLIENCKI, A NIE SERWEROWY ===
 * Trzy powody, kazdy sam wystarczy:
 *  - ADRES. Portfel zyje w wagmi po stronie przegladarki. Zeby zrobic z tego
 *    strone serwerowa, adres musialby przyjsc w URL-u - a wtedy /money?a=0x...
 *    pokazywalby CUDZE pieniadze pod adresem, ktory wyglada na wlasny. To jest
 *    zaproszenie do pomylki, nie architektura.
 *  - LANCUCH. `claimable` i `escrowFor` to odczyty przez klienta viem z wagmi.
 *  - ODBIOR. claim() wymaga podpisu z portfela i gazu na Base, wiec i tak musi
 *    sie wydarzyc w przegladarce.
 * Firestore czytamy tym samym klienckim SDK co feed - te same reguly, zadnej
 * drugiej sciezki dostepu do tych danych.
 *
 * === CO POKAZUJEMY KOMUS, KTO NIE MA TU JESZCZE ZADNYCH PIENIEDZY ===
 * NIE pusty ekran. Pustka jest tu stanem normalnym i najczestszym - wiekszosc
 * ludzi trafia tu, zanim cokolwiek wyslali albo dostali. Ekran pustki wymienia
 * wiec trzy sposoby, na ktore pieniadze moga sie tu pojawic, i kazdy z nich
 * jest linkiem. Ale UWAGA: pustke wolno napisac WYLACZNIE wtedy, gdy wszystkie
 * odczyty sie udaly (isLedgerEmpty pilnuje tego za nas). Nieudany odczyt ma
 * wlasny komunikat i wlasny przycisk ponowienia.
 *
 * === ILE TO KOSZTUJE ODCZYTOW ===
 * Firestore: szesc zapytan punktowych po wlasnym adresie (patrz komentarz
 * kosztowy w getMoneyLedger) - typowo 6-15 odczytow, twardo ograniczone i
 * niezalezne od rozmiaru bazy. Do tego tozsamosci drugich stron: paczki po 30
 * po identyfikatorze dokumentu, dociagane PO wyrenderowaniu listy.
 * Lancuch: 1 odczyt `claimable` (w AskClaimPanel) + po jednym `escrowFor` na
 * kazdy wlasny otwarty Ask z escrow, nie wiecej niz MAX_ESCROW_LOOKUPS.
 */

/** Escrow zyje na Base - i tylko ta siec jest w konfiguracji wagmi. */
const ESCROW_CHAIN_ID = base.id;

/**
 * Ile najwyzej Askow odpytujemy o zablokowany budzet.
 *
 * Kazdy to osobne wywolanie RPC, a panel ma sie pokazac szybko. Kto ma wiecej
 * niz dwanascie otwartych Askow naraz, dostanie sume z dwunastu i zdanie, ze
 * to nie caly rachunek - dolna granica opisana jako dolna granica.
 */
const MAX_ESCROW_LOOKUPS = 12;

/** Ile drugich stron rozwiazujemy po nazwie. Reszta zostaje skrotem adresu. */
const MAX_IDENTITY_LOOKUPS = 30;

/** Ile wierszy pokazujemy w jednej sekcji, zanim schowamy reszte za przyciskiem. */
const VISIBLE_ROWS = 8;

type Phase = 'loading' | 'ready' | 'failed';

/* ==================================================================== */
/*  WSPOLNE DROBIAZGI                                                    */
/* ==================================================================== */

const CARD = 'rounded-card border border-soft-line bg-soft-surface p-4 shadow-card sm:p-5';

const BUTTON =
  'inline-flex shrink-0 items-center justify-center rounded-lg px-3.5 py-2 font-soft-display text-[12.5px] font-semibold transition-transform [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary focus-visible:ring-offset-2 focus-visible:ring-offset-soft-surface';

/** Krotki, ludzki wiek wpisu. Ten sam format co na /leaderboard. */
function timeAgo(ms: number): string {
  if (!ms) return '';
  const mins = Math.round((Date.now() - ms) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Suma per token do jednej linii, albo `null` gdy nie ma czego pokazac.
 *
 * `null` znaczy "nie ma sumy", a wolajacy MUSI wtedy napisac cos innego niz
 * zero - sekcja z trzema pozycjami bez zapisanej kwoty nie jest sekcja zerowa.
 */
function totalsLine(totals: TokenAmounts): string | null {
  const line = formatReceived(totals, 3);
  return line === '' ? null : line;
}

/* ==================================================================== */
/*  STRONA                                                               */
/* ==================================================================== */

export default function MoneyPage() {
  const { address } = useAccount();
  const [phase, setPhase] = useState<Phase>('loading');
  const [ledger, setLedger] = useState<MoneyLedger | null>(null);
  const [identities, setIdentities] = useState<Map<string, Identity>>(new Map());

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    if (!address) return;
    setPhase('loading');
    try {
      const result = await getMoneyLedger(address);
      if (!mountedRef.current) return;
      setLedger(result);
      setPhase('ready');
    } catch (error) {
      // getMoneyLedger lapie awarie kazdego zapytania osobno, wiec tutaj
      // ladujemy tylko przy czyms nieprzewidzianym. I tak potrzebuje wyjscia.
      console.error('[money] Odczyt ksiegi nie powiodl sie:', error);
      if (!mountedRef.current) return;
      setPhase('failed');
    }
  }, [address]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Nazwy drugich stron - DOPIERO PO wyrenderowaniu listy.
   *
   * Wzbogacenie, nie warunek. Gdy `getIdentities` padnie albo nie zdazy,
   * wiersze zostaja przy skrocie adresu - i to jest w porzadku. Zablokowanie
   * calej ksiegi do czasu rozwiazania nazw oznaczaloby, ze jeden niereagujacy
   * RPC ukrywa czyjes pieniadze.
   */
  useEffect(() => {
    if (!ledger) return;
    const unique = new Set<string>();
    for (const event of [...ledger.incoming.events, ...ledger.outgoing.events]) {
      if (event.counterparty) unique.add(event.counterparty);
      if (unique.size >= MAX_IDENTITY_LOOKUPS) break;
    }
    if (unique.size === 0) return;

    let cancelled = false;
    void getIdentities(Array.from(unique))
      .then((resolved) => {
        if (!cancelled && mountedRef.current) setIdentities(resolved);
      })
      .catch((error) => {
        // Brak nazw to brak ozdobnika, nie brak danych - wiersze i tak stoja.
        console.error('[money] Rozwiazanie nazw drugich stron nie powiodlo sie:', error);
      });
    return () => {
      cancelled = true;
    };
  }, [ledger]);

  const nameOf = useCallback(
    (candidate: string | null): string | null => {
      if (!candidate) return null;
      return identities.get(candidate)?.name ?? getSlicedAddress(candidate);
    },
    [identities]
  );

  /** Aski z escrow, ktore wciaz trwaja - po ich budzet idziemy na lancuch. */
  const escrowedOpen = useMemo(
    () =>
      (ledger?.openAsks.rows ?? []).filter(
        (ask) => ask.funding === 'escrowed' && ask.escrowChainId === ESCROW_CHAIN_ID
      ),
    [ledger]
  );

  /** Otwarte Aski BEZ escrow - budzet jest obietnica, nie blokada. Patrz nizej. */
  const promisedOpen = useMemo(
    () => (ledger?.openAsks.rows ?? []).filter((ask) => ask.funding === 'on-resolve'),
    [ledger]
  );

  return (
    <main className="min-h-screen bg-soft-bg font-soft">
      <div className="mx-auto w-full max-w-[640px] px-4 py-10 sm:px-5">
        <header className="mb-7">
          <h1 className="mb-3 font-soft-display text-[30px] font-bold leading-[1.1] tracking-[-0.02em] text-soft-ink sm:text-[38px]">
            Your money here
          </h1>
          <p className="text-[14.5px] leading-[1.65] text-soft-ink-muted">
            Not a token list — your wallet already does that better. This is the money that moved
            through MySphere: what is waiting for you, what your open Asks are holding, what people
            paid you, and what you spent. Every settled line opens its transaction.
          </p>
        </header>

        {!address ? (
          <NoWallet />
        ) : (
          <>
            {/* ===== 1. DO ODEBRANIA =====
                Stoi na samej gorze, bo to jedyna liczba na tej stronie, ktora
                CZEKA NA DZIALANIE - reszta jest historia. Panel jest tym samym
                komponentem, ktory dziala na /asks; `showEmpty` wlacza mu tylko
                odpowiedz przy saldzie zerowym, bo tutaj milczenie zostawiloby
                pierwsze z czterech pytan bez odpowiedzi. */}
            <section className="mb-6" aria-labelledby="waiting-heading">
              <SectionLabel id="waiting-heading">Waiting for you</SectionLabel>
              <AskClaimPanel showEmpty />
            </section>

            {/* ===== 2. ZABLOKOWANE ===== */}
            <section className="mb-6" aria-labelledby="locked-heading">
              <SectionLabel id="locked-heading">Locked in your open Asks</SectionLabel>
              {phase === 'loading' && <SkeletonCard />}
              {phase === 'failed' && <LoadFailed onRetry={load} what="your Asks" />}
              {phase === 'ready' && ledger && (
                <>
                  {ledger.openAsks.failed ? (
                    <LoadFailed onRetry={load} what="your Asks" />
                  ) : (
                    <LockedPanel author={address} asks={escrowedOpen} promised={promisedOpen} />
                  )}
                </>
              )}
            </section>

            {/* ===== 3. WPLYWY ===== */}
            <section className="mb-6" aria-labelledby="paid-heading">
              <SectionLabel id="paid-heading">Paid to you</SectionLabel>
              {phase === 'loading' && <SkeletonCard />}
              {phase === 'failed' && <LoadFailed onRetry={load} what="what you were paid" />}
              {phase === 'ready' && ledger && (
                <Ledger
                  section={ledger.incoming}
                  direction="in"
                  nameOf={nameOf}
                  onRetry={load}
                  emptyTitle="Nobody has paid you here yet"
                  emptyBody="Tips, unlocked posts and accepted answers all land in this list, each with the transaction that settled it."
                />
              )}
            </section>

            {/* ===== 4. WYDATKI ===== */}
            <section className="mb-6" aria-labelledby="spent-heading">
              <SectionLabel id="spent-heading">What you spent</SectionLabel>
              {phase === 'loading' && <SkeletonCard />}
              {phase === 'failed' && <LoadFailed onRetry={load} what="what you spent" />}
              {phase === 'ready' && ledger && (
                <>
                  <Ledger
                    section={ledger.outgoing}
                    direction="out"
                    nameOf={nameOf}
                    onRetry={load}
                    emptyTitle="You have not spent anything here yet"
                    emptyBody="Tips you send, posts you unlock and budgets you lock in escrow show up here with their transactions."
                  />
                  <WalletPayouts totals={ledger.askPayoutsFromWallet} />
                </>
              )}
            </section>

            {/* Pustka calkowita - ale tylko wtedy, gdy KAZDY odczyt sie udal. */}
            {phase === 'ready' && ledger && isLedgerEmpty(ledger) && <NothingYet />}

            {phase === 'ready' && ledger && (
              <p className="px-1 font-soft text-[11px] leading-relaxed text-soft-ink-faint">
                Amounts are shown per token and never added together — this page does not know
                exchange rates and will not pretend to.{' '}
                {ledger.reads > 0 && `Reading this cost ${ledger.reads} database reads.`}
              </p>
            )}
          </>
        )}
      </div>

      {/* Wyjscie z tej strony na telefonie - ten sam pasek co na /asks. */}
      <MobileBottomNav />
    </main>
  );
}

/* ==================================================================== */
/*  KAWALKI                                                              */
/* ==================================================================== */

function SectionLabel({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2
      id={id}
      className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-soft-ink-faint"
    >
      {children}
    </h2>
  );
}

/** Ksztalt karty bez tresci - zeby nie sugerowac danych, ktorych jeszcze nie ma. */
function SkeletonCard() {
  return (
    <div className={CARD} aria-busy="true">
      <div className="mb-3 h-3 w-28 rounded-pill bg-soft-sunken" />
      <div className="mb-2 h-3.5 w-40 rounded-pill bg-soft-sunken" />
      <div className="h-3.5 w-3/4 rounded-pill bg-soft-sunken" />
    </div>
  );
}

/**
 * Nieudany odczyt. NIGDY nie udaje pustki - ma wlasne zdanie i wlasne wyjscie.
 * To jest zasada numer jeden w tym repo i byla lamana wielokrotnie.
 */
function LoadFailed({ onRetry, what }: { onRetry: () => void; what: string }) {
  return (
    <div className={CARD}>
      <h3 className="mb-1.5 font-soft-display text-[15px] font-bold text-soft-ink">
        We could not read {what}
      </h3>
      <p className="mb-3 text-[12.5px] leading-[1.5] text-soft-ink-muted">
        This is a failed read, not an empty list. There may well be money here — we just could not
        reach it.
      </p>
      <button type="button" onClick={onRetry} className={`${BUTTON} bg-soft-primary text-white`}>
        Try again
      </button>
    </div>
  );
}

function NoWallet() {
  return (
    <div className={CARD}>
      <h2 className="mb-1.5 font-soft-display text-[16px] font-bold text-soft-ink">
        Connect your wallet to see your money
      </h2>
      <p className="text-[13.5px] leading-[1.6] text-soft-ink-muted">
        This page is built entirely out of your address: what the escrow contract owes it, what your
        open Asks are holding, and every payment it sent or received here. Use the Connect button in
        the top bar — nothing on this page is shared or stored anywhere else.
      </p>
    </div>
  );
}

/**
 * Pusto - ale pusto Z WYJSCIEM. Trzy sposoby, na ktore pieniadze moga sie tu
 * pojawic, kazdy jako link. Pusty ekran, ktory niczego nie proponuje, uczy
 * czlowieka, ze nie warto tu wracac.
 */
function NothingYet() {
  return (
    <div className={`${CARD} mb-6`}>
      <h2 className="mb-1.5 font-soft-display text-[16px] font-bold text-soft-ink">
        No money has moved through this wallet here yet
      </h2>
      <p className="mb-3 text-[13.5px] leading-[1.6] text-soft-ink-muted">
        That is not a failed read — we checked and there is nothing yet. There are three ways
        something lands on this page:
      </p>
      <ul className="flex flex-col gap-2 text-[13px] leading-[1.5] text-soft-ink-muted">
        <li>
          <Link href="/asks" className="font-semibold text-soft-primary-deep underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary">
            Answer an open Ask
          </Link>{' '}
          — if the author accepts your answer, the payout waits for you at the top of this page.
        </li>
        <li>
          <Link href="/asks" className="font-semibold text-soft-primary-deep underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary">
            Post an Ask
          </Link>{' '}
          — lock a budget in escrow and it shows up here until it is resolved.
        </li>
        <li>
          <Link href="/basechat" className="font-semibold text-soft-primary-deep underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary">
            Tip someone in the feed
          </Link>{' '}
          — sent and received tips both keep their transaction here.
        </li>
      </ul>
    </div>
  );
}

/* -------------------------------------------------------------------- */
/*  ZABLOKOWANE NA KONTRAKCIE                                            */
/* -------------------------------------------------------------------- */

type LockedPhase = 'idle' | 'loading' | 'ready' | 'failed';

/**
 * Ile z wlasnych Askow WCIAZ lezy na kontrakcie.
 *
 * === DLACZEGO Z LANCUCHA, A NIE Z DOKUMENTU ===
 * Dokument Aska zna budzet, ktory zostal wplacony - i nic wiecej. Nie wie
 * o rozstrzygnieciu przez kogos innego, nie wie o wygasnieciu, nie wie o
 * czesciowym zwrocie. `escrowFor` zwraca kwote, ktora NAPRAWDE tam lezy
 * w tej sekundzie, plus `open`. Suma z dokumentow byla by liczba, ktora
 * wyglada jak fakt, a jest wspomnieniem.
 *
 * === DLACZEGO NIE MIESZAMY TU ASKOW BEZ ESCROW ===
 * Przy `funding: 'on-resolve'` nie jest zablokowane NIC - budzet lezy w portfelu
 * autora i moze go wydac na cokolwiek. Wrzucenie obu wariantow do jednej liczby
 * dawaloby napis "locked" nad kwota, ktorej nic nie blokuje. Aski bez escrow
 * dostaja wiec osobne, slabsze zdanie pod spodem.
 */
function LockedPanel({
  author,
  asks,
  promised,
}: {
  author: string;
  asks: OpenAskRow[];
  promised: OpenAskRow[];
}) {
  const publicClient = usePublicClient({ chainId: ESCROW_CHAIN_ID });
  const [phase, setPhase] = useState<LockedPhase>('idle');
  const [lockedUnits, setLockedUnits] = useState<bigint>(0n);
  const [counted, setCounted] = useState(0);

  const looked = useMemo(() => asks.slice(0, MAX_ESCROW_LOOKUPS), [asks]);

  const read = useCallback(async () => {
    if (!publicClient || looked.length === 0) {
      setPhase('ready');
      setLockedUnits(0n);
      setCounted(0);
      return;
    }
    setPhase('loading');
    try {
      const states = await Promise.all(
        looked.map((ask) => readEscrow(publicClient, ESCROW_CHAIN_ID, author, ask.id))
      );
      let sum = 0n;
      let live = 0;
      for (const state of states) {
        // `funded && open` to jedyny stan, w ktorym pieniadze naprawde tam sa.
        // Po rozstrzygnieciu budzet jest zerem - poszedl na salda odbiorcow.
        if (state.funded && state.open && state.budget > 0n) {
          sum += state.budget;
          live++;
        }
      }
      setLockedUnits(sum);
      setCounted(live);
      setPhase('ready');
    } catch (error) {
      console.error('[money] Odczyt zablokowanych budzetow nie powiodl sie:', error);
      setPhase('failed');
    }
  }, [publicClient, looked, author]);

  useEffect(() => {
    void read();
  }, [read]);

  // Kontraktu nie ma na tej sieci - saldo jest wtedy pytaniem bez adresata.
  if (!escrowDeployment(ESCROW_CHAIN_ID)) return null;

  if (phase === 'loading' || phase === 'idle') {
    return (
      <div className={CARD} aria-busy="true">
        <p className="text-[12.5px] leading-[1.5] text-soft-ink-muted">
          Asking the escrow contract what your open Asks are still holding…
        </p>
      </div>
    );
  }

  if (phase === 'failed') {
    return (
      <div className={CARD}>
        <h3 className="mb-1.5 font-soft-display text-[15px] font-bold text-soft-ink">
          We could not read your locked budgets
        </h3>
        <p className="mb-3 text-[12.5px] leading-[1.5] text-soft-ink-muted">
          This is a failed read, not a zero. Your budgets are held by the contract, not by us — the
          money is exactly where it was, we just could not reach the chain to count it.
        </p>
        <button type="button" onClick={() => void read()} className={`${BUTTON} bg-soft-primary text-white`}>
          Try again
        </button>
      </div>
    );
  }

  const locked = unitsToAmount(lockedUnits);
  const truncated = asks.length > looked.length;

  return (
    <div className={CARD}>
      {counted > 0 ? (
        <>
          <p className="mb-1 font-soft-display text-[22px] font-bold leading-none">
            {/* Bursztyn TYLKO na kwocie - to jedyna liczba pieniedzy w tej karcie. */}
            <span className="font-mono tabular-nums text-soft-accent-deep">
              {formatAmount(locked)} USDC
            </span>
          </p>
          <p className="text-[12.5px] leading-[1.5] text-soft-ink-muted">
            held by the escrow contract across {counted === 1 ? 'one open Ask' : `${counted} open Asks`}.
            It is not yours to spend and not anyone else&apos;s to take: it moves to the answers you
            accept, and whatever is left comes back to you as a balance you collect at the top of
            this page.{' '}
            {truncated &&
              `You have more than ${MAX_ESCROW_LOOKUPS} open Asks, so this is a floor, not the whole bill.`}
          </p>
        </>
      ) : (
        <p className="text-[12.5px] leading-[1.5] text-soft-ink-muted">
          {asks.length === 0
            ? 'None of your open Asks is holding money in escrow right now.'
            : 'The contract is no longer holding anything for your open Asks — those budgets have already been resolved or settled.'}
        </p>
      )}

      {promised.length > 0 && (
        <p className="mt-3 border-t border-soft-line pt-3 text-[12px] leading-[1.5] text-soft-ink-faint">
          {/* SLOWO "PROMISED", NIE "LOCKED". Przy 'on-resolve' nie blokuje tego
              budzetu absolutnie nic - siedzi w portfelu autora i moze go wydac
              na cokolwiek innego. Nazwanie tego "zablokowanym" byloby obietnica
              bez pokrycia wpisana wprost w interfejs. */}
          You also have {promised.length === 1 ? 'one open Ask' : `${promised.length} open Asks`}{' '}
          without escrow, promising{' '}
          <span className="font-mono tabular-nums text-soft-ink">
            {formatAmount(promised.reduce((sum, ask) => sum + ask.budget, 0))} USDC
          </span>
          . Nothing holds that money — it stays in your wallet until you accept an answer and pay
          for it.
        </p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------- */
/*  LISTA POZYCJI                                                        */
/* -------------------------------------------------------------------- */

/**
 * Zdanie opisujace pozycje.
 *
 * Kazdy wariant mowi, KTO i ZA CO - bo lista, na ktorej wszystko nazywa sie
 * "payment", nie odpowiada na zadne z czterech pytan tej strony.
 */
function describeEvent(event: MoneyEvent, direction: 'in' | 'out', name: string | null): string {
  switch (event.source) {
    case 'tip':
      if (direction === 'in') return name ? `Tip from ${name}` : 'Tip received';
      return name ? `Tip to ${name}` : 'Tip sent';
    case 'unlock':
      if (direction === 'in') return name ? `${name} unlocked your post` : 'Someone unlocked your post';
      return name ? `You unlocked a post by ${name}` : 'You unlocked a paid post';
    case 'ask-answer':
      return 'Your answer was accepted';
    case 'ask-escrow':
      return 'Budget locked for your Ask';
    default:
      return 'Payment';
  }
}

/** Dokad prowadzi wiersz wewnatrz aplikacji. `null` = nie ma dokad. */
function linkFor(event: MoneyEvent): string | null {
  if (!event.ref) return null;
  if (event.source === 'tip' || event.source === 'unlock') return `/post/${event.ref}`;
  // Aski nie maja wlasnej trasy - lista jest najblizszym prawdziwym miejscem.
  return '/asks';
}

function Ledger({
  section,
  direction,
  nameOf,
  onRetry,
  emptyTitle,
  emptyBody,
}: {
  section: MoneySection;
  direction: 'in' | 'out';
  nameOf: (address: string | null) => string | null;
  onRetry: () => void;
  emptyTitle: string;
  emptyBody: string;
}) {
  const [expanded, setExpanded] = useState(false);

  if (section.failed) {
    return <LoadFailed onRetry={onRetry} what={direction === 'in' ? 'what you were paid' : 'what you spent'} />;
  }

  if (section.events.length === 0) {
    return (
      <div className={CARD}>
        <h3 className="mb-1.5 font-soft-display text-[15px] font-bold text-soft-ink">{emptyTitle}</h3>
        <p className="text-[12.5px] leading-[1.5] text-soft-ink-muted">{emptyBody}</p>
      </div>
    );
  }

  const total = totalsLine(section.totals);
  const visible = expanded ? section.events : section.events.slice(0, VISIBLE_ROWS);
  const hidden = section.events.length - visible.length;

  return (
    <div className={CARD}>
      {/* SUMA jest odpowiedzia na pytanie sekcji, wiec to ona - i tylko ona -
          dostaje bursztyn i rozmiar. Wiersze pod spodem sa dowodem, nie
          naglowkiem; gdyby kazda kwota krzyczala tak samo, sekcja przestalaby
          cokolwiek podpowiadac. */}
      <p className="mb-0.5 font-soft-display text-[22px] font-bold leading-none">
        {total ? (
          <span className="font-mono tabular-nums text-soft-accent-deep">{total}</span>
        ) : (
          <span className="text-soft-ink-muted">Amounts not recorded</span>
        )}
      </p>
      <p className="mb-3 text-[11.5px] leading-[1.5] text-soft-ink-faint">
        {section.events.length === 1 ? '1 entry' : `${section.events.length} entries`}
        {section.truncated && ' · we stopped counting at the read limit, so this is a floor'}
        {section.unknownAmounts > 0 &&
          ` · ${section.unknownAmounts} with no amount recorded, left out of the total rather than counted as zero`}
      </p>

      <ol className="flex flex-col">
        {visible.map((event) => (
          <EventRow key={event.id} event={event} direction={direction} nameOf={nameOf} />
        ))}
      </ol>

      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className={`${BUTTON} mt-3 border border-soft-line bg-soft-surface text-soft-ink`}
        >
          Show {hidden} more
        </button>
      )}

      {section.withoutProof > 0 && (
        <p className="mt-3 text-[11px] leading-[1.5] text-soft-ink-faint">
          {/* Nie chowamy tego. Pozycja bez hasha jest pozycja, ktorej NIE DA SIE
              sprawdzic, a cala teza tego produktu brzmi, ze da sie sprawdzic
              wszystko. Milczenie o tym byloby cichym zawyzeniem wiarygodnosci. */}
          {section.withoutProof === 1
            ? 'One entry has no transaction hash, so it cannot be opened in an explorer.'
            : `${section.withoutProof} entries have no transaction hash, so they cannot be opened in an explorer.`}
        </p>
      )}
    </div>
  );
}

function EventRow({
  event,
  direction,
  nameOf,
}: {
  event: MoneyEvent;
  direction: 'in' | 'out';
  nameOf: (address: string | null) => string | null;
}) {
  const label = describeEvent(event, direction, nameOf(event.counterparty));
  const href = linkFor(event);
  const when = timeAgo(event.timestamp);

  return (
    <li className="border-b border-dashed border-soft-line/70 py-2.5 last:border-b-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 flex-1 text-[13px] font-semibold leading-tight text-soft-ink">
          {href ? (
            <Link
              href={href}
              className="hover:text-soft-primary-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
            >
              {label}
            </Link>
          ) : (
            label
          )}
        </span>
        <span className="shrink-0 font-mono text-[13.5px] font-bold tabular-nums text-soft-ink">
          {event.amount === null ? (
            // "nie wiadomo ile" MUSI sie roznic od zera - zero przy przyjetej
            // odpowiedzi mowiloby czlowiekowi, ze pracowal za darmo.
            <span className="text-[11.5px] font-semibold text-soft-ink-faint">amount not recorded</span>
          ) : (
            <>
              {direction === 'in' ? '+' : '−'}
              {formatAmount(event.amount)} {event.token}
            </>
          )}
        </span>
      </div>

      <div className="mt-1 flex items-center justify-between gap-3">
        <span className="text-[11px] text-soft-ink-faint">
          {when && `${when} · `}
          {event.network}
        </span>
        {event.txHash ? (
          <a
            href={getProofLink(resolveTipNetwork(event.network), event.txHash)}
            target="_blank"
            rel="noopener noreferrer"
            title="Open this transaction in a block explorer"
            className="font-mono text-[10.5px] text-soft-ink-faint underline decoration-dotted underline-offset-2 transition-colors [transition-duration:var(--dur-press)] ease-out-strong hover:text-soft-primary-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
          >
            {event.txHash.slice(0, 10)}…
          </a>
        ) : (
          <span className="text-[10.5px] text-soft-ink-faint">no hash recorded</span>
        )}
      </div>
    </li>
  );
}

/**
 * Wyplaty z WLASNEGO PORTFELA za przyjete odpowiedzi (Aski bez escrow).
 *
 * Osobno od listy wydatkow, bo TU NIE MA HASHY - dowodem kazdej takiej wyplaty
 * jest `payoutTxHash` przy konkretnej odpowiedzi, a odpowiedzi na wlasne Aski
 * nie da sie doczytac bez indeksu zlozonego (askId + accepted), ktorego projekt
 * nie ma. Zamiast udawac paragon, mowimy wprost, skad ta liczba jest i gdzie
 * leza dowody.
 */
function WalletPayouts({ totals }: { totals: TokenAmounts }) {
  const line = totalsLine(totals);
  if (!line) return null;

  return (
    <p className="mt-2.5 px-1 text-[11.5px] leading-[1.5] text-soft-ink-faint">
      On top of that, your Asks without escrow owed{' '}
      <span className="font-mono tabular-nums text-soft-ink">{line}</span> for the answers you
      accepted, paid straight from your wallet. That figure is counted from the Asks themselves —
      the proof of each individual payout sits on the answer that earned it, on{' '}
      <Link
        href="/asks"
        className="font-semibold text-soft-primary-deep underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
      >
        the Ask
      </Link>
      .
    </p>
  );
}

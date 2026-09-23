'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useAccount, useChainId, useConfig, usePublicClient, useSwitchChain } from 'wagmi';
import { getWalletClient } from 'wagmi/actions';
import { base } from 'wagmi/chains';
import ConnectModal from '../components/wallet/ConnectModal';
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
import {
  describeEscrowError,
  escrowDeployment,
  escrowRefundSplit,
  escrowTiming,
  readEscrow,
  settleExpiredAsk,
  unitsToAmount,
  type EscrowTiming,
} from '../utils/asks/escrow';
import { formatAmount, formatReceived } from '../utils/tips/getLeaderboard';
import { getIdentities, type Identity } from '../utils/identity/getIdentities';
import { getSlicedAddress } from '../utils/identity/resolver';
import type { TokenAmounts } from '../utils/asks/types';

/**
 * TWOJE PIENIADZE TUTAJ - tresc zakladki "Money" na /money.
 *
 * Do scalenia nawigacji byla to cala strona /money. Teraz ten plik jest
 * komponentem klienckim renderowanym przez serwerowe ./page.tsx obok
 * zakladki "Paid" (../leaderboard/LeaderboardContent). Logika - eskrow,
 * kolejnosc sekcji, koszty odczytow - zostala bez zmian.
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

export default function MoneyContent() {
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

  /**
   * Aski z escrow, ktorych nikt nie zamknal - po ich budzet idziemy na lancuch.
   *
   * KOLEJNOSC JEST TU DECYZJA O PIENIADZACH, a nie estetyka. Odczytow robimy
   * najwyzej MAX_ESCROW_LOOKUPS, wiec przy dluzszej liscie CZESC Askow nie
   * zostanie sprawdzona. Aski PO TERMINIE ida wiec pierwsze: to jedyne, przy
   * ktorych cokolwiek da sie zrobic. Odwrotna kolejnosc chowalaby przycisk
   * zwrotu za dwunastoma Askami, ktore i tak tylko odliczaja.
   */
  const escrowedOpen = useMemo(() => {
    const isOurs = (ask: OpenAskRow) =>
      ask.funding === 'escrowed' && ask.escrowChainId === ESCROW_CHAIN_ID;
    return [
      ...(ledger?.openAsks.pastDeadline ?? []).filter(isOurs),
      ...(ledger?.openAsks.rows ?? []).filter(isOurs),
    ];
  }, [ledger]);

  /** Otwarte Aski BEZ escrow - budzet jest obietnica, nie blokada. Patrz nizej. */
  const promisedOpen = useMemo(
    () =>
      [...(ledger?.openAsks.rows ?? []), ...(ledger?.openAsks.pastDeadline ?? [])].filter(
        (ask) => ask.funding === 'on-resolve'
      ),
    [ledger]
  );

  /**
   * Sygnal dla panelu odbioru: "saldo wlasnie sie zmienilo, przeczytaj je
   * jeszcze raz". Podnosimy go po udanym zwrocie wygaslego budzetu, bo tamta
   * transakcja dokłada pieniadze DOKLADNIE do tego salda - a panel stoi wyzej
   * na tej samej stronie i bez sygnalu pokazywalby kwote sprzed transakcji.
   */
  const [claimReloadKey, setClaimReloadKey] = useState(0);
  const noteBalanceChanged = useCallback(() => setClaimReloadKey((key) => key + 1), []);

  /**
   * Nic sie nie wydarzylo i KAZDY odczyt sie udal.
   *
   * Liczone raz i wysoko, bo przesadza o ukladzie calej strony: przy pustej
   * ksiedze trzy sekcje historii mowilyby po kolei "nic", "nic" i "nic", a
   * dopiero pod nimi stalaby jedyna karta, ktora cokolwiek proponuje. Trzy
   * zaprzeczenia przed jedna propozycja to nie jest stan pusty, to jest
   * odprawa. Zamiast tego historii nie ma wcale, a jej miejsce zajmuje karta
   * z wyjsciem.
   */
  const nothingHappenedYet = phase === 'ready' && !!ledger && isLedgerEmpty(ledger);

  return (
    <div>
      <div className="mx-auto w-full max-w-[640px] px-4 pb-10 sm:px-5">
        <header className="mb-7">
          <h1 className="mb-3 font-soft-display text-[30px] font-bold leading-[1.1] tracking-[-0.02em] text-soft-ink sm:text-[38px]">
            Your money here
          </h1>
          {/* `max-w-[52ch]` - ta sama miara wiersza co na /leaderboard i /how.
              Bez niej akapit na desktopie ciagnal sie przez cale 640px. */}
          <p className="max-w-[52ch] text-[14.5px] leading-[1.65] text-soft-ink-muted">
            Not a token list. Your wallet already does that better. This is the money that moved
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
                pierwsze z czterech pytan bez odpowiedzi.

                ETYKIETA TEJ SEKCJI JEST INNA NIZ POZOSTALE TRZY, i to jedyna
                taka na stronie. Cztery identyczne szare naglowki mowily, ze
                cztery sekcje sa tak samo wazne - a po pieniadze do odebrania
                ludzie tu przychodza, po historie nie. */}
            <section className="mb-8" aria-labelledby="waiting-heading">
              <h2
                id="waiting-heading"
                className="mb-3 font-soft text-[12px] font-bold uppercase tracking-[0.14em] text-soft-primary-deep"
              >
                Waiting for you
              </h2>
              <AskClaimPanel showEmpty reloadKey={claimReloadKey} />
            </section>

            {/* Pustka calkowita - ale tylko wtedy, gdy KAZDY odczyt sie udal.
                Stoi TU, zaraz pod pierwsza sekcja, a nie na koncu strony: to
                jedyna karta, ktora przy pustej ksiedze cokolwiek proponuje,
                wiec nie ma prawa byc ostatnia. */}
            {nothingHappenedYet && <NothingYet />}

            {!nothingHappenedYet && (
              <>
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
                        <LockedPanel
                          author={address}
                          asks={escrowedOpen}
                          promised={promisedOpen}
                          onBalanceChanged={noteBalanceChanged}
                        />
                      )}
                    </>
                  )}
                </section>

                {/* GRANICA MIEDZY "TERAZ" A "BYLO".
                    Nad ta linia stoja dwie kwoty, ktore wciaz sa w grze: jedna
                    do odebrania, druga zablokowana na kontrakcie. Pod nia dwie,
                    ktore sa juz tylko zapisem. Bez tej linii cztery sekcje
                    czytaly sie jako jedna lista czterech rownowaznych liczb. */}
                <hr className="mb-6 border-0 border-t border-soft-line" />

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
              </>
            )}

            {phase === 'ready' && ledger && (
              <p className="px-1 font-soft text-[11px] leading-relaxed text-soft-ink-faint">
                Amounts are shown per token and never added together. This page does not know
                exchange rates and will not pretend to.{' '}
                {ledger.reads > 0 && `Reading this cost ${ledger.reads} database reads.`}
              </p>
            )}
          </>
        )}
      </div>

      {/* Wyjscie z tej strony na telefonie - ten sam pasek co na /asks. */}
    </div>
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
        This is a failed read, not an empty list. There may well be money here, we just could not
        reach it.
      </p>
      <button type="button" onClick={onRetry} className={`${BUTTON} bg-soft-primary text-white`}>
        Try again
      </button>
    </div>
  );
}

/**
 * Brak portfela - najczestsze wejscie na te strone i jedyny jej stan pusty,
 * ktory da sie opuscic jednym kliknieciem.
 *
 * PRZYCISK STOI TU, A NIE W ZDANIU. Do dzis karta odsylala do belki na gorze
 * ("use the Connect button in the top bar"). Belka faktycznie ma ten przycisk,
 * ale na telefonie jest to ikona w prawym rogu nad trescia, ktorej czlowiek
 * wlasnie nie widzi - a stan pusty ma PROWADZIC DO DZIALANIA, nie opisywac,
 * gdzie ono lezy. To ten sam ConnectModal, ktory otwiera /join.
 */
function NoWallet() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <div className={CARD}>
      <h2 className="mb-1.5 font-soft-display text-[16px] font-bold text-soft-ink">
        Connect your wallet to see your money
      </h2>
      <p className="text-[13.5px] leading-[1.6] text-soft-ink-muted">
        This page is built entirely out of your address: what the escrow contract owes it, what your
        open Asks are holding, and every payment it sent or received here. Nothing on this page is
        shared or stored anywhere else.
      </p>
      <button
        type="button"
        onClick={() => setIsModalOpen(true)}
        className={`${BUTTON} mt-4 bg-soft-primary text-white`}
      >
        Connect a wallet
      </button>
      <ConnectModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
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
        That is not a failed read: we checked and there is nothing yet. There are three ways
        something lands on this page:
      </p>
      <ul className="flex flex-col gap-2 text-[13px] leading-[1.5] text-soft-ink-muted">
        <li>
          <Link href="/asks" className="font-semibold text-soft-primary-deep underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary">
            Answer an open Ask
          </Link>{' '}
          and, if the author accepts your answer, the payout waits for you at the top of this page.
        </li>
        <li>
          <Link href="/asks" className="font-semibold text-soft-primary-deep underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary">
            Post an Ask
          </Link>{' '}
          to lock a budget in escrow, and it shows up here until it is resolved.
        </li>
        <li>
          <Link href="/basechat" className="font-semibold text-soft-primary-deep underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary">
            Tip someone in the feed
          </Link>{' '}
          (sent and received tips both keep their transaction here).
        </li>
      </ul>
    </div>
  );
}

/* -------------------------------------------------------------------- */
/*  ZABLOKOWANE NA KONTRAKCIE                                            */
/* -------------------------------------------------------------------- */

type LockedPhase = 'idle' | 'loading' | 'ready' | 'failed';

/** Jeden wlasny Ask, ktorego budzet NAPRAWDE lezy jeszcze na kontrakcie. */
type LockedAsk = {
  row: OpenAskRow;
  /** Kwota wciaz zablokowana, w jednostkach bazowych. Prosto z `escrowFor`. */
  budget: bigint;
  /**
   * Termin Z LANCUCHA, nie z dokumentu.
   *
   * To ten termin sprawdza kontrakt przy settleExpired, a kopia w Firestore
   * moze sie z nim rozjechac (zapisujemy sekundy zaokraglone w dol). Interfejs,
   * ktory odlicza wlasny zegar, potrafi obiecac "juz mozna" sekunde przed
   * lancuchem - i czlowiek dostaje TooEarly za zrobienie tego, co kazalismy.
   */
  deadlineMs: number;
};

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * Ile zostalo, z dokladnoscia do minuty.
 *
 * Sekund tu nie ma i nie powinno byc: najkrotsze okno na tej stronie ma 48
 * godzin, wiec zegar co sekunde bylby ruchem, ktory niczego nie mowi.
 */
function formatLeft(ms: number): string {
  if (ms >= DAY_MS) {
    return `${Math.floor(ms / DAY_MS)}d ${Math.floor((ms % DAY_MS) / HOUR_MS)}h`;
  }
  if (ms >= HOUR_MS) {
    return `${Math.floor(ms / HOUR_MS)}h ${Math.floor((ms % HOUR_MS) / MINUTE_MS)}m`;
  }
  const minutes = Math.floor(ms / MINUTE_MS);
  return minutes >= 1 ? `${minutes}m` : 'less than a minute';
}

/** "Teraz" odswiezane co minute - tylko gdy jest co odliczac. */
function useMinuteTick(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), MINUTE_MS);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

/** Najpierw to, z czym da sie cos zrobic; na koncu to, co tylko odlicza. */
const WINDOW_ORDER: Record<EscrowTiming['phase'], number> = {
  recoverable: 0,
  resolving: 1,
  running: 2,
};

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
 *
 * === DLACZEGO ZWROT WYGASLEGO BUDZETU STOI WLASNIE TUTAJ ===
 * settleExpired byla jedyna noga tego kontraktu, ktorej NIC w produkcie nie
 * wolalo: autor po terminie musial trafic w kontrakt recznie albo zostawic
 * tam budzet. Rozwazane byly dwa miejsca:
 *
 *   karta Aska na /asks   Odpadla. Tamta lista pokazuje DWADZIESCIA najnowszych
 *                         Askow calego serwisu, wiec wlasny Ask sprzed tygodnia
 *                         moze sie na niej w ogole nie zmiescic - a pieniadze,
 *                         ktore wracaja tylko wtedy, gdy trafiles do cudzego
 *                         top 20, nie sa sciezka odzyskania. Karta jest tez
 *                         publiczna: przycisk o TWOICH pieniadzach na karcie
 *                         ogladanej przez odpowiadajacych myli co do tego, czyj
 *                         ten budzet jest.
 *
 *   /money, ta sekcja     Strona jest zbudowana Z WLASNEGO ADRESU i juz dzis
 *                         pyta lancuch o kazdy wlasny escrow, wiec przycisk nie
 *                         dokłada ani jednego odczytu. Drugi krok - odbior
 *                         salda - stoi na tej samej stronie, wiec oba kroki
 *                         widac naraz i nie da sie ich opisac jako jednego.
 *                         To jest tez jedyne miejsce, do ktorego czlowiek
 *                         przychodzi z pytaniem "gdzie sa moje pieniadze".
 */
function LockedPanel({
  author,
  asks,
  promised,
  onBalanceChanged,
}: {
  author: string;
  asks: OpenAskRow[];
  promised: OpenAskRow[];
  /** Wolane po udanym zwrocie - saldo wyzej na tej stronie wlasnie sie zmienilo. */
  onBalanceChanged: () => void;
}) {
  const publicClient = usePublicClient({ chainId: ESCROW_CHAIN_ID });
  const [phase, setPhase] = useState<LockedPhase>('idle');
  const [locked, setLocked] = useState<LockedAsk[]>([]);
  /**
   * Dowody zwrotow wykonanych w tej sesji.
   *
   * Trzymane OSOBNO od `locked`, bo po udanej transakcji Ask przestaje byc
   * `open` i wypada z odczytu - a razem z nim zniknalby hash, czyli jedyny
   * dowod, ze cokolwiek sie stalo.
   */
  const [receipts, setReceipts] = useState<{ id: string; txHash: string }[]>([]);

  const looked = useMemo(() => asks.slice(0, MAX_ESCROW_LOOKUPS), [asks]);

  const read = useCallback(async () => {
    if (!publicClient || looked.length === 0) {
      setPhase('ready');
      setLocked([]);
      return;
    }
    setPhase('loading');

    /**
     * ===== BRAK POKRYCIA JEST TU PODEJRZANY, A NIE NORMALNY =====
     *
     * `looked` zawiera WYLACZNIE Aski, ktore same o sobie mowia
     * `funding: 'escrowed'` (filtr `escrowedOpen` wyzej). Kazdy z nich POWINIEN
     * miec pokrycie w kontrakcie. Odczyt mowiacy "nie ma" jest wiec albo realna
     * rozbieznoscia, albo - znacznie czesciej - spoznionym wezlem.
     *
     * Publiczne RPC Base stoi za load balancerem i wezel bez najswiezszego
     * bloku oddaje na `escrowFor` czyste zera, ktore czytaja sie jak "pusto".
     * Na /asks kosztowalo to falszywe ostrzezenie, ze oplacony Ask jest
     * nieoplacony. TUTAJ kosztuje wiecej i ciszej: Ask wypada z listy
     * `locked`, wiec czlowiek NIE WIDZI przycisku zwrotu dla pieniedzy, ktore
     * naprawde leza w kontrakcie. Brak przycisku nie wyglada na blad - wyglada
     * na "nie ma czego odzyskiwac".
     *
     * Dlatego ponawiamy dopoki KTORYKOLWIEK wiersz nie ma pokrycia. Komplet
     * pokrycia konczy petle natychmiast, wiec normalny przypadek nic nie placi.
     * Pusta lista wychodzi wyzej i tu nie dociera.
     */
    const OPOZNIENIA = [1200, 2400];

    for (let proba = 0; ; proba += 1) {
      try {
        const states = await Promise.all(
          looked.map((ask) => readEscrow(publicClient, ESCROW_CHAIN_ID, author, ask.id))
        );
        const live: LockedAsk[] = [];
        states.forEach((state, index) => {
          // `funded && open` to jedyny stan, w ktorym pieniadze naprawde tam sa.
          // Po rozstrzygnieciu budzet jest zerem - poszedl na salda odbiorcow.
          if (state.funded && state.open && state.budget > 0n) {
            live.push({
              row: looked[index],
              budget: state.budget,
              deadlineMs: Number(state.deadlineSeconds) * 1000,
            });
          }
        });

        // `funded` bez `open` to Ask JUZ ROZSTRZYGNIETY - pokrycie bylo i
        // zostalo wydane. To nie jest brak, wiec nie ponawiamy przez niego.
        const bezPokrycia = states.filter((state) => !state.funded).length;

        if (bezPokrycia === 0 || proba >= OPOZNIENIA.length) {
          setLocked(live);
          setPhase('ready');
          return;
        }
      } catch (error) {
        console.error('[money] Odczyt zablokowanych budzetow nie powiodl sie:', error);
        // Padniecie na ostatniej probie znaczy "nie wiemy". Wczesniejsze idzie
        // na kolejna probe - pojedynczy wezel bywa chwilowo zly, a zaden z tych
        // odczytow niczego nie zmienia, wiec powtorzenie jest darmowe.
        if (proba >= OPOZNIENIA.length) {
          setPhase('failed');
          return;
        }
      }

      await new Promise((resolve) => setTimeout(resolve, OPOZNIENIA[proba]));
    }
  }, [publicClient, looked, author]);

  useEffect(() => {
    void read();
  }, [read]);

  /**
   * Po udanym zwrocie: zapisz dowod, powiedz panelowi odbioru, ze saldo sie
   * zmienilo, i przeczytaj escrow JESZCZE RAZ. Ponowny odczyt jest wazniejszy
   * niz odjecie kwoty w pamieci - liczbe o pieniadzach ma podawac lancuch,
   * a nie nasza arytmetyka po transakcji, ktorej wyniku nie widzielismy.
   */
  const handleSettled = useCallback(
    (id: string, txHash: string) => {
      setReceipts((previous) => [...previous, { id, txHash }]);
      onBalanceChanged();
      void read();
    },
    [onBalanceChanged, read]
  );

  // Zegar tyka tylko wtedy, gdy jest co odliczac. Kolejnosc hookow musi byc
  // stala, wiec stoi tu, przed pierwszym `return`.
  const now = useMinuteTick(phase === 'ready' && locked.length > 0);

  // Kontraktu nie ma na tej sieci - saldo jest wtedy pytaniem bez adresata.
  if (!escrowDeployment(ESCROW_CHAIN_ID)) return null;

  if (phase === 'loading' || phase === 'idle') {
    return (
      <div className={CARD} aria-busy="true">
        <p className="text-[12.5px] leading-[1.5] text-soft-ink-muted">
          Asking the escrow contract what your Asks are still holding…
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
          This is a failed read, not a zero. Your budgets are held by the contract, not by us. The
          money is exactly where it was, we just could not reach the chain to count it.
        </p>
        <button type="button" onClick={() => void read()} className={`${BUTTON} bg-soft-primary text-white`}>
          Try again
        </button>
      </div>
    );
  }

  const lockedUnits = locked.reduce((sum, ask) => sum + ask.budget, 0n);
  const counted = locked.length;
  const truncated = asks.length > looked.length;

  /**
   * Wiersze w kolejnosci: najpierw te, ktore czekaja na DZIALANIE.
   *
   * Okno liczymy tu, a nie przy odczycie, bo zmienia sie z samego uplywu czasu -
   * Ask potrafi przejsc z okna rozstrzygania do zwrotu przy otwartej stronie.
   */
  const rows = locked
    .map((ask) => ({ ask, timing: escrowTiming(ask.deadlineMs, now) }))
    .sort((a, b) => {
      const order = WINDOW_ORDER[a.timing.phase] - WINDOW_ORDER[b.timing.phase];
      // Wewnatrz jednego okna: najblizszy termin pierwszy.
      return order !== 0 ? order : a.timing.deadlineMs - b.timing.deadlineMs;
    });

  return (
    <div className={`${CARD} soft-hero-rise`}>
      {counted > 0 ? (
        <>
          <p className="mb-1 break-words font-soft-display text-[22px] font-bold leading-tight">
            {/* Bursztyn TYLKO na kwocie - to jedyna liczba pieniedzy w tej karcie. */}
            <span className="font-mono tabular-nums text-soft-accent-deep">
              {formatAmount(unitsToAmount(lockedUnits))} USDC
            </span>
          </p>
          <p className="text-[12.5px] leading-[1.5] text-soft-ink-muted">
            held by the escrow contract across {counted === 1 ? 'one Ask' : `${counted} Asks`} of
            yours that nobody has closed yet. It is not yours to spend and not anyone else&apos;s to
            take: it moves to the answers you accept, and whatever is left comes back to you as a
            balance you collect at the top of this page.{' '}
            {truncated &&
              `You have more than ${MAX_ESCROW_LOOKUPS} unclosed Asks, so this is a floor, not the whole bill.`}
          </p>

          {/* Kazdy Ask osobno: suma nie mowi, KTORE pieniadze da sie juz ruszyc. */}
          <ul className="mt-4 flex flex-col gap-3 border-t border-soft-line pt-4">
            {rows.map(({ ask, timing }) => (
              <LockedAskRow
                key={ask.row.id}
                author={author}
                ask={ask}
                timing={timing}
                onSettled={handleSettled}
              />
            ))}
          </ul>
        </>
      ) : (
        <p className="text-[12.5px] leading-[1.5] text-soft-ink-muted">
          {asks.length === 0
            ? 'None of your Asks is holding money in escrow right now.'
            : 'The contract is no longer holding anything for your Asks. Those budgets have already been resolved or sent back.'}
        </p>
      )}

      {receipts.length > 0 && (
        /* Bez wlasnego wejscia. Po udanym zwrocie `read()` przestawia panel na
           'loading' i z powrotem, wiec CALA karta montuje sie od nowa i to ona
           odgrywa wejscie - dolozenie drugiej animacji w srodku dalo by dwa
           ruchy naraz o tym samym zdarzeniu. */
        <div className="mt-4 border-t border-soft-line pt-3">
          <p className="mb-1.5 text-[12px] leading-[1.5] text-soft-ink-muted">
            {receipts.length === 1
              ? 'One budget went back to your balance in this session'
              : `${receipts.length} budgets went back to your balance in this session`}{' '}
            (collect it at the top of this page).
          </p>
          <ul className="flex flex-wrap gap-x-3 gap-y-1">
            {receipts.map((receipt) => (
              <li key={receipt.id}>
                <a
                  href={`https://basescan.org/tx/${receipt.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-[10.5px] text-soft-ink-faint underline decoration-dotted underline-offset-2 transition-colors [transition-duration:var(--dur-press)] ease-out-strong hover:text-soft-primary-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
                >
                  {receipt.txHash.slice(0, 10)}…
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {promised.length > 0 && (
        <p className="mt-3 border-t border-soft-line pt-3 text-[12px] leading-[1.5] text-soft-ink-faint">
          {/* SLOWO "PROMISED", NIE "LOCKED". Przy 'on-resolve' nie blokuje tego
              budzetu absolutnie nic - siedzi w portfelu autora i moze go wydac
              na cokolwiek innego. Nazwanie tego "zablokowanym" byloby obietnica
              bez pokrycia wpisana wprost w interfejs. */}
          You also have {promised.length === 1 ? 'one Ask' : `${promised.length} Asks`} without
          escrow, promising{' '}
          <span className="font-mono tabular-nums text-soft-ink">
            {formatAmount(promised.reduce((sum, ask) => sum + ask.budget, 0))} USDC
          </span>
          . Nothing holds that money. It stays in your wallet until you accept an answer and pay
          for it.
        </p>
      )}
    </div>
  );
}

/**
 * Jeden zablokowany budzet: ile, w ktorym oknie czasu i co z tym wolno zrobic.
 *
 * === PO CO OKNO CZASU STOI TU, A NIE DOPIERO PRZY BLEDZIE ===
 * Kontrakt ma trzy rozlaczne okna i w kazdym z nich znaczy co innego, ale
 * z zewnatrz wygladaja identycznie: "Ask, ktory sie nie zamknal". Bez tego
 * wiersza czlowiek dowiadywalby sie, w ktorym oknie jest, dopiero z rewertu
 * TooEarly - czyli po podpisie, po zaplaceniu gazu i po tym, jak nic sie nie
 * stalo. Stan czasu ma byc widoczny ZANIM ktokolwiek kliknie.
 */
function LockedAskRow({
  author,
  ask,
  timing,
  onSettled,
}: {
  author: string;
  ask: LockedAsk;
  timing: EscrowTiming;
  onSettled: (id: string, txHash: string) => void;
}) {
  const held = formatAmount(unitsToAmount(ask.budget));
  const question = ask.row.question.trim();

  /**
   * Podzial liczony ARYTMETYKA KONTRAKTU (oplata w dol, autor dostaje reszte).
   * `null` = nie znamy stawki na tej sieci; wtedy NIE WOLNO podac kwoty netto,
   * bo kazda podana byla by zawyzona o oplate.
   */
  const split = escrowRefundSplit(ask.budget, ESCROW_CHAIN_ID);

  return (
    <li className="rounded-lg border border-soft-line bg-soft-sunken/40 p-3">
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-soft-ink">
          {question === '' ? 'An Ask with no question recorded' : question}
        </span>
        <span className="shrink-0 font-mono text-[12.5px] font-bold tabular-nums text-soft-accent-deep">
          {held} USDC
        </span>
      </div>

      {/* Zegar rozjezdza sie miedzy serwerem a przegladarka z definicji. */}
      <p
        className="text-[11.5px] leading-[1.5] text-soft-ink-muted"
        suppressHydrationWarning
      >
        {timing.phase === 'running' && (
          <>
            <strong className="font-semibold text-soft-ink">Still open</strong>:{' '}
            {formatLeft(timing.msLeft ?? 0)} until the deadline. Nothing can come back before then:
            closing an Ask early means filling every seat.
          </>
        )}
        {timing.phase === 'resolving' && (
          <>
            <strong className="font-semibold text-soft-ink">Deadline passed</strong>: you have{' '}
            {formatLeft(timing.msLeft ?? 0)} left to open the answers and accept the ones you want.
            After that nobody can be paid out of this budget, and the only thing left is sending it
            back to yourself. Read them on{' '}
            <Link
              href="/asks"
              className="font-semibold text-soft-primary-deep underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
            >
              the Ask
            </Link>
            .
          </>
        )}
        {timing.phase === 'recoverable' && (
          <>
            <strong className="font-semibold text-soft-ink">Expired</strong>: the deadline and the
            48 hours after it are both gone, so nobody can be paid out of this budget any more. It
            can go back to you.
          </>
        )}
      </p>

      {timing.phase === 'recoverable' &&
        (split === null ? (
          // Nie znamy oplaty, wiec nie znamy kwoty. Milczenie o tym byloby
          // gorsze niz brak przycisku - patrz zasada "awaria != zero".
          <p className="mt-2 text-[11.5px] leading-[1.5] text-soft-ink-muted">
            We could not work out the fee that applies on this network, so we will not put a number
            on what comes back. Nothing has been sent.
          </p>
        ) : (
          <>
            <p className="mt-2 text-[11.5px] leading-[1.5] text-soft-ink-muted">
              {/* TRZY RZECZY, KTORE MUSZA STAC PRZED PRZYCISKIEM: ile naprawde
                  wraca, ze to jest SALDO a nie przelew, i ze potem trzeba
                  wolac claim(). Kazda z nich pominieta zamienia ten przycisk
                  w obietnice, ktorej kod nie dotrzymuje. */}
              You get back{' '}
              <span className="font-mono font-semibold tabular-nums text-soft-accent-deep">
                {formatAmount(unitsToAmount(split.toAuthor))} USDC
              </span>{' '}
              after the {split.feeBps / 100}% fee (
              {formatAmount(unitsToAmount(split.fee))} USDC). This does not land in your wallet: it
              becomes a balance in the contract, and collecting it into your wallet is a second
              transaction, at the top of this page.
            </p>
            <p className="mt-1 text-[11px] leading-[1.5] text-soft-ink-faint">
              The contract lets anyone send this transaction and pays your address either way, so
              whoever presses it pays the gas and gets nothing.
            </p>
            <RecoverButton
              author={author}
              askDocId={ask.row.id}
              amountLabel={`${formatAmount(unitsToAmount(split.toAuthor))} USDC`}
              onSettled={onSettled}
            />
          </>
        ))}
    </li>
  );
}

/** Ile razy ponawiamy zapis wygasniecia, gdy serwer nie widzi jeszcze transakcji. */
const EXPIRY_RECORD_RETRIES = 5;
const EXPIRY_RETRY_STEP_MS = 1500;

/**
 * Oznaczenie Aska jako wygaslego przez serwer, po udanym settleExpired.
 *
 * Trasa nie wymaga sesji (settleExpired moze wyslac kazdy) - dowodem jest
 * log AskExpired w paragonie, ktory serwer czyta sam. Ponawiamy tylko to, co
 * trasa sama nazywa chwilowym (`retryable`: 409 tx_not_found - portfel
 * potwierdzil transakcje, ale RPC serwera jeszcze jej nie widzi - oraz awarie
 * RPC) i bledy sieci. Ponowienie jest bezpieczne: ten sam hash na juz
 * wygaslym Asku daje 200. Kazda inna odmowa jest ostateczna i leci do konsoli.
 */
async function recordEscrowExpiry(askDocId: string, txHash: string): Promise<void> {
  const wait = (retry: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, EXPIRY_RETRY_STEP_MS * (retry + 1)));

  for (let retry = 0; ; retry += 1) {
    let response: Response;
    try {
      response = await fetch(`/api/asks/${encodeURIComponent(askDocId)}/escrow-expire`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ txHash }),
      });
    } catch (networkError) {
      if (retry >= EXPIRY_RECORD_RETRIES) throw networkError;
      await wait(retry);
      continue;
    }
    if (response.ok) return;

    let code: string | null = null;
    let retryable = false;
    try {
      const data = (await response.json()) as { code?: unknown; retryable?: unknown };
      code = typeof data.code === 'string' ? data.code : null;
      retryable = data.retryable === true;
    } catch {
      // odpowiedz bez JSON - zostaje sam status
    }

    const transient = retryable || (response.status === 409 && code === 'tx_not_found');
    if (transient && retry < EXPIRY_RECORD_RETRIES) {
      await wait(retry);
      continue;
    }
    throw new Error(`escrow-expire answered ${response.status}${code ? ` (${code})` : ''}`);
  }
}

/**
 * Przycisk zwrotu. Wlasny stan na wiersz, bo kazdy Ask to osobna transakcja
 * i osobna mozliwa porazka - jeden wspolny komunikat bledu na cala liste
 * mowilby o niewlasciwym budzecie.
 */
function RecoverButton({
  author,
  askDocId,
  amountLabel,
  onSettled,
}: {
  author: string;
  askDocId: string;
  amountLabel: string;
  onSettled: (id: string, txHash: string) => void;
}) {
  const publicClient = usePublicClient({ chainId: ESCROW_CHAIN_ID });
  const chainId = useChainId();
  /**
   * Klient portfela pobierany DOPIERO przy podpisie, jak w AskClaimPanel:
   * `useWalletClient()` oddaje klienta przypietego do sieci z chwili renderu,
   * wiec po zmianie sieci podpis szedlby na stary lancuch.
   */
  const config = useConfig();
  const { switchChain } = useSwitchChain();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  async function handleRecover() {
    if (busy || !publicClient) return;
    setBusy(true);
    setError(null);
    try {
      const signer = await getWalletClient(config, { chainId: ESCROW_CHAIN_ID });
      const txHash = await settleExpiredAsk({
        reader: publicClient,
        signer,
        chainId: ESCROW_CHAIN_ID,
        author,
        askDocId,
        // Tu autor placi za siebie sam. Kontrakt nie sprawdza wolajacego - to
        // dwa osobne pola wlasnie dlatego, ze nie musza byc tym samym adresem.
        caller: author,
      });
      if (!mountedRef.current) return;

      /**
       * ===== LANCUCH WIE, WIEC BAZA TEZ MA WIEDZIEC =====
       * Do tej pory `settleExpired` konczyl sie na lancuchu i na tym koniec:
       * budzet wracal, a dokument dalej mowil `status: 'open'`. Ask zostawal
       * na /asks z martwym odliczaniem i wygladal, jakby czekal na odpowiedzi,
       * ktorych juz nikt nie moze przyjac. `'expired'` bylo czytane w czterech
       * miejscach i nie zapisywane w zadnym.
       *
       * Zapis robi SERWER (POST /api/asks/{id}/escrow-expire): sam czyta
       * paragon i log AskExpired tego Aska, zanim cokolwiek oznaczy. Wczesniej
       * przegladarka pisala 'expired' sama, z dowolnym hashem - a to potrafila
       * kazda przegladarka, dla kazdego otwartego Aska.
       *
       * Idzie W TLE, po kwicie: RPC serwera bywa kilka sekund za portfelem
       * (409 tx_not_found), wiec zapis ponawia sie przez kilkanascie sekund,
       * a czlowiek nie ma czekac na to z zablokowanym przyciskiem - pieniadze
       * juz wrocily. Nieudany zapis NIE przewraca odzyskania: byloby klamstwem
       * pokazac blad tam, gdzie sukces jest na lancuchu. Zostaje slad
       * w konsoli, a paragon z hashem i tak lezy nizej.
       */
      void recordEscrowExpiry(askDocId, txHash).catch((writeError) => {
        console.error(
          '[money] Zwrot przeszedl na lancuchu, ale oznaczenie Aska jako wygasly nie:',
          writeError
        );
      });

      if (!mountedRef.current) return;
      onSettled(askDocId, txHash);
    } catch (caught) {
      console.error('[money] Zwrot wygaslego budzetu nie powiodl sie:', caught);
      if (!mountedRef.current) return;
      // Surowy revert nie jest komunikatem. TooEarly, NotOpen i reszta listy
      // maja swoje zdania w describeEscrowError.
      setError(describeEscrowError(caught));
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }

  const onEscrowChain = chainId === ESCROW_CHAIN_ID;

  return (
    <>
      {onEscrowChain ? (
        <button
          type="button"
          onClick={() => void handleRecover()}
          disabled={busy}
          className={`${BUTTON} mt-2.5 bg-soft-primary text-white disabled:cursor-not-allowed disabled:bg-soft-line-strong`}
        >
          {busy ? 'Sending it back…' : `Send ${amountLabel} back to your balance`}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => switchChain({ chainId: ESCROW_CHAIN_ID })}
          className={`${BUTTON} mt-2.5 bg-soft-primary text-white`}
        >
          Switch to Base to send it back
        </button>
      )}
      {error && (
        <p className="mt-2 break-words text-[11.5px] leading-[1.5] text-soft-accent-deep" role="alert">
          {error}
        </p>
      )}
    </>
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
    // Wejscie karty = "odczyt wlasnie wrocil". Nie ozdobnik: do tej sekundy
    // stal tu szkielet, wiec ruch niesie zmiane stanu. Jedna klatka, ta sama
    // co wszedzie w produkcie, i nic wiecej sie tu nie rusza.
    <div className={`${CARD} soft-hero-rise`}>
      {/* SUMA jest odpowiedzia na pytanie sekcji, wiec to ona - i tylko ona -
          dostaje bursztyn i rozmiar. Wiersze pod spodem sa dowodem, nie
          naglowkiem; gdyby kazda kwota krzyczala tak samo, sekcja przestalaby
          cokolwiek podpowiadac.

          18px, a nie 22px. To sa pieniadze, ktore JUZ SIE ZDARZYLY, i musza byc
          mniejsze od dwoch kwot nad nimi: tej do odebrania (34px) i tej wciaz
          zablokowanej (22px). Trzy rozmiary to trzy stany tej samej rzeczy -
          do wziecia, w grze, po sprawie. `break-words`, bo suma potrafi miec
          trzy tokeny i na 360px musi sie zlamac, a nie wystawac. */}
      <p className="mb-0.5 break-words font-soft-display text-[18px] font-bold leading-tight">
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
      accepted, paid straight from your wallet. That figure is counted from the Asks themselves.
      The proof of each individual payout sits on the answer that earned it, on{' '}
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

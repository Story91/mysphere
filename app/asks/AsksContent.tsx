'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { HandCoins, Lock, PenLine } from 'lucide-react';
import { useAccount, useChainId, useConfig, usePublicClient, useSwitchChain } from 'wagmi';
import { getWalletClient } from 'wagmi/actions';
import { base } from 'wagmi/chains';
import AskCard, { formatAskMoney } from '../basechat/components/AskCard';
import AskClaimPanel from '../basechat/components/AskClaimPanel';
import AskComposer, { type AskDraft } from '../basechat/components/AskComposer';
import { usePaymentFlow } from '../components/monetization/usePaymentFlow';
import useSiweAuth from '../utils/auth/useSiweAuth';
import { getOpenAsks, getResolvedAsks, getResolveRate } from '../utils/asks/asks';
import { type Ask, type ResolveRate } from '../utils/asks/types';
import { useCreateAsk } from '../utils/asks/useCreateAsk';
import { loadListedVaults } from '../utils/asks/listedVaults';
import {
  RESOLVE_GRACE_MS,
  describeEscrowError,
  perAnswerToUnits,
  readEscrow,
  resolveAskOnchain,
  unitsToAmount,
  type EscrowState,
} from '../utils/asks/escrow';
import { authorIdentityMismatch, sealedAnswerNotice } from '../utils/asks/visibility';
import { normalizeAddress } from '../utils/monetization/types';
import { getSlicedAddress } from '../utils/identity/resolver';
import { MAX_ANSWER_LENGTH } from '../api/asks/pricing';

/**
 * Lista otwartych Askow ORAZ cala petla, ktora na niej sie domyka.
 *
 * Strona jest KLIENCKA, bo czyta Firestore tym samym SDK co feed - ta sama
 * droga, te same reguly, zadnej drugiej sciezki dostepu do tych danych.
 *
 * === CO SIE TU ZMIENILO I DLACZEGO ===
 * Do tej pory /asks bylo slepym zaulkiem: lista, do ktorej nie dalo sie nic
 * dodac ani nic z nia zrobic. `AskComposer` nie byl nigdzie zamontowany,
 * `AskCard` dostawal karte bez handlera (wiec przycisk renderowal sie jako
 * null), a dawne klienckie funkcje przyjecia i rozstrzygniecia nie mialy ani
 * jednego wywolania w calym repo. Teraz pelna droga stoi tutaj:
 *
 *   zaloz Aska        -> POST /api/asks/create    (sesja SIWE, przez useCreateAsk)
 *   odpowiedz         -> POST /api/asks/answers   (sesja SIWE, tresc zapieczetowana)
 *   przyjmij          -> przelew z portfela + POST /api/asks/[id]/accept
 *   zamknij           -> POST /api/asks/[id]/resolve
 *
 * === DRUGA SCIEZKA PIENIEDZY: ESCROW ===
 * Od podpiecia kontraktu AskEscrow autor ma wybor, ktory zmienia CALA prawa
 * polowe tej listy:
 *
 *   zaloz z escrow    -> approve + fund NA LANCUCHU, dopiero potem POST
 *                        /api/asks/create (serwer sprawdza log AskFunded)
 *   rozstrzygnij      -> resolve() z lista zwyciezcow + POST .../escrow-resolve
 *   odbior            -> claim() przez odpowiadajacego (AskClaimPanel)
 *
 * Przy escrow NIE MA przelewu na odpowiedz i nie ma przycisku "Pay and accept":
 * kontrakt przypisuje wszystkie miejsca jedna transakcja, a tokeny wychodza
 * dopiero przy odbiorze. Dwie mechaniki nie mieszaja sie na jednym Asku -
 * decyduje pole `funding`, ustawione raz przy zakladaniu.
 *
 * === DLACZEGO ZAKLADANIE IDZIE PRZEZ /api/asks/create, A NIE POST /api/asks ===
 * Tamta trasa jest dla AGENTOW: stoi za bramka x402 i wymaga podpisanej
 * autoryzacji EIP-3009 na tokenie, ktory poda odpowiedz 402 - dzis USDG na
 * Robinhood Chain, NIE USDC (patrz api/asks/pricing.ts). Czlowiek w
 * przegladarce takiego podpisu nie zlozy. Manifest mowi
 * wprost "an agent can post an Ask THE SAME WAY YOU CAN" - czyli czlowiek ma
 * swoja droge, a nie cudza z doklejona oplata.
 *
 * === PUSTKA TO NIE AWARIA ===
 * `getOpenAsks` zwraca flage `failed` wlasnie po to, zeby te dwa stany nie
 * wygladaly tak samo. "Nikt jeszcze nie zapytal" i "nie udalo sie sprawdzic"
 * znacza dla czytelnika co innego, wiec dostaja osobne ekrany. Zadnych
 * przykladowych Askow do zapelnienia widoku - pusto znaczy pusto. Ta sama
 * zasada obowiazuje nizej, w panelu odpowiedzi.
 *
 * === ILE TO KOSZTUJE ODCZYTOW ===
 * Lista to jedno zapytanie (max 20 dokumentow). Wskaznik rozstrzygalnosci jest
 * dociagany osobno dla KAZDEGO UNIKALNEGO autora, a nie dla kazdej karty -
 * dziesiec Askow jednej osoby to jedno zapytanie, nie dziesiec. Odpowiedzi
 * czytamy DOPIERO po otwarciu konkretnego Aska, nigdy dla calej listy.
 */

const MAX_ASKS = 20;
const MAX_RATE_LOOKUPS = 12;

/**
 * Ile rozstrzygnietych Askow pokazujemy.
 *
 * Mniej niz otwartych i to jest celowe: otwarte sa zaproszeniem do dzialania,
 * historia jest dowodem, ze cos sie tu naprawde dzieje. Dziesiec wystarczy,
 * zeby to udowodnic, a nie spycha zaproszenia pod zwij.
 */
const MAX_RESOLVED = 10;

/** Jedyna siec, w ktorej dzialaja wyplaty (usePaymentFlow placi na Base). */
const EXPLORER_TX = 'https://basescan.org/tx/';

/**
 * Siec escrow. Ta sama, w ktorej placi usePaymentFlow, i jedyna z rodziny Base
 * w konfiguracji wagmi (app/providers.tsx nie ma Base Sepolii) - wiec z
 * przegladarki nie da sie trafic w drugie wdrozenie nawet przez pomylke.
 */
const ESCROW_CHAIN_ID = base.id;

type Phase = 'loading' | 'ready' | 'failed';

/** Komunikat bledu z API, bez wywracania sie na odpowiedzi, ktore nie sa JSON-em. */
async function readApiError(response: Response, fallback: string): Promise<string> {
  try {
    const data = (await response.json()) as { error?: unknown };
    if (typeof data.error === 'string' && data.error.trim() !== '') return data.error;
  } catch {
    // odpowiedz bez JSON - zostaje fallback
  }
  return fallback;
}

export default function AsksPage() {
  const { address: walletAddress } = useAccount();
  const { address: sessionAddress, isAuthenticated, signIn } = useSiweAuth();
  /**
   * Cala sciezka zakladania (SIWE -> approve -> fund -> kwit -> zapis przez
   * serwer) stoi w jednym hooku, wspolnym z feedem. Druga kopia tej sekwencji
   * zyla tu inline i pisala do Firestore klienckim SDK - to jej juz nie ma.
   */
  const askFlow = useCreateAsk();

  /**
   * Kim jest patrzacy.
   *
   * Sesja SIWE ma pierwszenstwo, bo to ONA jest tozsamoscia dla tras
   * serwerowych - adres z wagmi mowi tylko, jaki portfel jest podlaczony.
   * Zalozenie, odpowiedz i przyjecie ida przez trasy serwera, wiec kazde
   * z nich wymaga sesji (useCreateAsk prosi o podpis przed pieniedzmi).
   */
  const viewer = (sessionAddress ?? walletAddress ?? '').toLowerCase() || null;

  const [phase, setPhase] = useState<Phase>('loading');
  const [asks, setAsks] = useState<Ask[]>([]);
  /**
   * Rozstrzygniete Aski - osobna lista i osobny stan awarii.
   *
   * Nieudany odczyt historii NIE MOZE zabrac listy otwartych: to dwa
   * niezalezne zapytania i awaria jednego nie jest awaria drugiego.
   * `null` znaczy "jeszcze nie wiemy", pusta tablica "nie ma zadnych".
   */
  const [resolved, setResolved] = useState<Ask[] | null>(null);
  const [resolvedFailed, setResolvedFailed] = useState(false);
  const [rates, setRates] = useState<Record<string, ResolveRate>>({});
  const [attempt, setAttempt] = useState(0);

  /** Aski zalozone W TEJ SESJI - patrz komentarz przy `pushCreated`. */
  const [created, setCreated] = useState<Ask[]>([]);
  const [composerOpen, setComposerOpen] = useState(false);
  const [openAskId, setOpenAskId] = useState<string | null>(null);

  const retry = useCallback(() => {
    setPhase('loading');
    setAttempt((value) => value + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const result = await getOpenAsks(MAX_ASKS);
      if (cancelled) return;

      if (result.failed) {
        setPhase('failed');
        setAsks([]);
        return;
      }

      setAsks(result.asks);
      setPhase('ready');

      // Historia leci OSOBNO i PO otwartych: otwarte sa powodem, dla ktorego
      // ktos tu wchodzi, wiec nie moga czekac na drugie zapytanie.
      getResolvedAsks(MAX_RESOLVED)
        .then((historia) => {
          if (cancelled) return;
          if (historia.failed) {
            setResolvedFailed(true);
            return;
          }
          setResolved(historia.asks);
        })
        .catch(() => {
          if (!cancelled) setResolvedFailed(true);
        });

      const authors = Array.from(
        new Set(result.asks.map((ask) => ask.author).filter(Boolean))
      ).slice(0, MAX_RATE_LOOKUPS);
      if (authors.length === 0) return;

      // getResolveRate lapie wlasne bledy i oddaje rate: null, wiec brak
      // wskaznika nigdy nie przewraca listy.
      const fetched = await Promise.all(authors.map((author) => getResolveRate(author)));
      if (cancelled) return;

      const map: Record<string, ResolveRate> = {};
      authors.forEach((author, index) => {
        map[author] = fetched[index];
      });
      setRates(map);
    })();

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  /**
   * Dokladanie swiezo zalozonego Aska do listy "Posted from this device".
   *
   * NOWY ASK ZOSTAJE NA EKRANIE, nawet gdy lista sie nie wczytala. Odswiezenie
   * listy nie jest tu wiarygodne: `getOpenAsks` wymaga indeksu zlozonego, ktory
   * czeka jeszcze na `firebase deploy` (firestore.indexes.json), wiec probowanie
   * "przeladuj i zobacz swoj Ask" skonczyloby sie ekranem awarii tuz po udanym
   * zapisie. Trzymamy wiec to, co WIEMY, ze powstalo - bez zgadywania reszty.
   *
   * Karta dostaje Aska z ODPOWIEDZI SERWERA, a nie zlozonego tu ze szkicu:
   * termin, kwoty i escrow sa te, ktore serwer zapieczetowal (przy escrow -
   * z logu fund), wiec karta nie moze obiecac czegos innego niz zapis.
   */
  const pushCreated = useCallback((ask: Ask) => {
    setCreated((previous) => [ask, ...previous.filter((existing) => existing.id !== ask.id)]);
    setComposerOpen(false);
    setOpenAskId(ask.id);
  }, []);

  /**
   * Zalozenie Aska. Autor, kolejnosc (SIWE przed pieniedzmi, fund przed
   * zapisem) i zapamietany depozyt siedza w useCreateAsk. Rzucony blad wraca
   * do AskComposer, ktory pokazuje go nad przyciskiem i nie czysci formularza.
   */
  const submitAsk = askFlow.submit;
  const handleCreate = useCallback(
    async (draft: AskDraft) => {
      const ask = await submitAsk(draft);
      pushCreated(ask);
    },
    [submitAsk, pushCreated]
  );

  /** Zmiana licznikow/statusu po odpowiedzi, przyjeciu albo rozstrzygnieciu. */
  const patchAsk = useCallback((id: string, patch: Partial<Ask>) => {
    const apply = (list: Ask[]) =>
      list.map((ask) => (ask.id === id ? { ...ask, ...patch } : ask));
    setAsks(apply);
    setCreated(apply);
  }, []);

  const createdIds = new Set(created.map((ask) => ask.id));
  const listed = asks.filter((ask) => !createdIds.has(ask.id));

  const renderAsk = (ask: Ask) => {
    const isAuthor = viewer !== null && normalizeAddress(ask.author) === viewer;
    const isOpen = openAskId === ask.id;

    return (
      <div key={ask.id} className="flex flex-col gap-2">
        <AskCard
          ask={ask}
          resolveRate={rates[ask.author]}
          isAuthor={isAuthor}
          onAnswer={() => setOpenAskId((current) => (current === ask.id ? null : ask.id))}
        />
        {isOpen && (
          <AskThread
            ask={ask}
            viewer={viewer}
            sessionViewer={sessionAddress ?? null}
            isAuthor={isAuthor}
            isSignedIn={isAuthenticated}
            onSignIn={signIn}
            onPatch={patchAsk}
            onClose={() => setOpenAskId(null)}
          />
        )}
      </div>
    );
  };

  return (
    <main className="min-h-screen bg-soft-bg font-soft">
      <div className="mx-auto w-full max-w-[640px] px-4 py-10 sm:px-5">
        {/* ================= NAGLOWEK =================
            Jeden rzad: tytul + akcja. Dwa akapity wstepu zamienily sie w jedno
            zdanie i pasek trzech krokow - bo trzy kroki to jest CALY mechanizm
            tego produktu, a sciana tekstu nad lista tylko odsuwala Aski w dol.
            Szczegoly (escrow, warianty platnosci) mowia karty i kompozytor,
            kazde o sobie. */}
        <header className="mb-7">
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
            <div className="min-w-0">
              <h1 className="font-soft-display text-[30px] font-bold leading-[1.1] tracking-[-0.02em] text-soft-ink sm:text-[38px]">
                Open asks
              </h1>
              <p className="mt-2 max-w-[46ch] text-[14px] leading-[1.6] text-soft-ink-muted">
                A question with a budget, seats and a deadline. Answers stay sealed until the
                author picks the ones that get paid.
              </p>
            </div>
            {!composerOpen && (
              <button
                type="button"
                onClick={() => setComposerOpen(true)}
                className="shrink-0 rounded-lg bg-soft-primary px-4 py-2.5 font-soft-display text-[13px] font-semibold text-white shadow-card transition-transform duration-150 ease-out active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary focus-visible:ring-offset-2 focus-visible:ring-offset-soft-bg"
              >
                Ask something
              </button>
            )}
          </div>
          {/* Kolejnosc krokow niesie informacje (to jest sekwencja, nie ozdoba),
              a srodkowy krok dostaje jedyny akcent - pieczec to sedno produktu. */}
          <ol className="mt-4 flex flex-wrap items-center gap-x-1.5 gap-y-2" aria-label="How an Ask works">
            <li className="flex items-center gap-1.5 rounded-full border border-soft-line bg-soft-surface px-2.5 py-1 text-[11.5px] font-medium text-soft-ink-muted">
              <PenLine className="h-3.5 w-3.5 text-soft-ink-faint" aria-hidden="true" />
              Post with a budget
            </li>
            <li aria-hidden="true" className="text-[11px] text-soft-ink-faint/70">›</li>
            <li className="flex items-center gap-1.5 rounded-full border border-soft-primary/25 bg-soft-primary/[0.06] px-2.5 py-1 text-[11.5px] font-medium text-soft-primary-deep">
              <Lock className="h-3.5 w-3.5" aria-hidden="true" />
              Answers arrive sealed
            </li>
            <li aria-hidden="true" className="text-[11px] text-soft-ink-faint/70">›</li>
            <li className="flex items-center gap-1.5 rounded-full border border-soft-line bg-soft-surface px-2.5 py-1 text-[11.5px] font-medium text-soft-ink-muted">
              <HandCoins className="h-3.5 w-3.5 text-soft-ink-faint" aria-hidden="true" />
              Pay the ones you pick
            </li>
            <li>
              <Link
                href="/re-definition#ask"
                className="px-1.5 py-1 text-[11.5px] font-semibold text-soft-primary-deep underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
              >
                How an Ask works
              </Link>
            </li>
          </ol>
        </header>

        {/* ================= DO ODBIORU =================
            Stoi NAD lista, bo dotyczy pieniedzy, ktore juz naleza do patrzacego
            i o ktorych nie dowie sie znikad indziej - resolve() przypisuje
            salda, nie wysyla tokenow. Panel milczy, gdy nie ma czego odebrac,
            ale NIE milczy, gdy odczytu nie udalo sie wykonac. */}
        <AskClaimPanel className="mb-7" />

        {/* ================= ZAKLADANIE =================
            Kompozytor pojawia sie w tym miejscu dopiero po "Ask something"
            w naglowku. Stala karta-zaproszenie zeszla ze strony: powtarzala
            naglowek trzecim akapitem i odsuwala liste, a jej jedyna zywa czesc
            (przycisk) miesci sie w jednym rzedzie z tytulem. */}
        {composerOpen && (
          <section className="mb-7">
            <AskComposer
              onSubmit={handleCreate}
              onCancel={() => setComposerOpen(false)}
              disabled={!askFlow.walletConnected}
              disabledReason="Connect your wallet to post an Ask."
              // Wdrozenie escrow na Base + podlaczony portfel - te same dwa
              // warunki co w feedzie, bo licza je w jednym miejscu (hook).
              escrowAvailable={askFlow.escrowAvailable}
              escrowUnavailableReason={askFlow.escrowUnavailableReason}
              escrowFeeBps={askFlow.feeBps}
              progressNote={askFlow.progressNote}
              // Skarbiec wybierany Z LISTY, nie wklejany z palca - adres
              // z literowka daje Aska o czyms, czego nie ma. Odczyt idzie przez
              // wlasna trase (wspolny cache), a jego awaria nie blokuje
              // zakladania: kompozytor pokazuje wtedy sam komunikat.
              loadVaults={loadListedVaults}
            />
          </section>
        )}

        {/* ================= WLASNIE ZALOZONE ================= */}
        {created.length > 0 && (
          <section className="mb-7">
            <h2 className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-soft-ink-faint">
              Posted from this device
            </h2>
            <div className="flex flex-col gap-4">{created.map(renderAsk)}</div>
          </section>
        )}

        {/* ================= LISTA ================= */}
        {phase === 'loading' && <LoadingList />}

        {phase === 'failed' && (
          <div className="rounded-card border border-soft-line bg-soft-surface p-5 shadow-card">
            <h2 className="mb-1.5 font-soft-display text-[16px] font-bold text-soft-ink">
              Open asks could not be loaded
            </h2>
            <p className="mb-4 text-[13.5px] leading-[1.6] text-soft-ink-muted">
              This is a failed read, not an empty list. There may well be open asks that we simply
              could not reach.
            </p>
            <button
              type="button"
              onClick={retry}
              className="rounded-lg bg-soft-primary px-4 py-2 font-soft-display text-[13px] font-semibold text-white transition-transform duration-150 ease-out active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary focus-visible:ring-offset-2 focus-visible:ring-offset-soft-surface"
            >
              Try again
            </button>
          </div>
        )}

        {phase === 'ready' && listed.length === 0 && (
          <div className="rounded-card border border-soft-line bg-soft-surface p-5 shadow-card">
            <h2 className="mb-1.5 font-soft-display text-[16px] font-bold text-soft-ink">
              Nothing open right now
            </h2>
            <p className="mb-4 text-[13.5px] leading-[1.6] text-soft-ink-muted">
              No one has an open Ask at this moment. When someone does, their question, budget,
              seats and countdown show up here.
            </p>
            {/* Pusty ekran jest zaproszeniem do dzialania, nie tylko raportem. */}
            {!composerOpen && (
              <button
                type="button"
                onClick={() => setComposerOpen(true)}
                className="rounded-lg bg-soft-primary px-4 py-2 font-soft-display text-[13px] font-semibold text-white transition-transform duration-150 ease-out active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary focus-visible:ring-offset-2 focus-visible:ring-offset-soft-surface"
              >
                Ask the first one
              </button>
            )}
          </div>
        )}

        {phase === 'ready' && listed.length > 0 && (
          <div className="flex flex-col gap-4">{listed.map(renderAsk)}</div>
        )}

        {/* ===== HISTORIA =====
            Rozstrzygniety Ask znikal z produktu calkowicie - nie widzial go
            ani autor, ani ludzie, ktorzy na niego odpowiedzieli i chcieli
            zobaczyc swoja wyplate. Na produkcie, ktorego teza brzmi
            "rozliczone platnosci sa zapisem", chowanie kazdej rozliczonej
            sprawy bylo odwrotnoscia tezy.

            Stoi POD otwartymi, bo otwarte sa powodem wejscia. Historia jest
            dowodem, ze to nie jest pusty rynek - i dziala tylko wtedy, gdy
            nie zaslania zaproszenia. */}
        {phase === 'ready' && resolved !== null && resolved.length > 0 && (
          <div className="mt-10">
            <h2 className="mb-1.5 font-soft-display text-[15px] font-semibold uppercase tracking-[0.14em] text-soft-ink-faint">
              Settled
            </h2>
            {/* Nie "paid": przy escrow resolve() tylko przypisuje salda, a
                tokeny wychodza przy claim() (zasada przy zdaniu o `funding`
                w AskCard.tsx). Prawda w obu wariantach: /accept odrzuca
                przyjecie bez hasha przelewu, a /escrow-resolve zapisuje hash
                transakcji resolve() przy kazdej przyznanej odpowiedzi.
                ink-muted, nie ink-soft: ink-soft ma na bieli 3.43:1 i przy
                13.5px nie trzyma AA. */}
            <p className="mb-4 text-[13.5px] leading-[1.6] text-soft-ink-muted">
              Resolved by their authors. Every answer is unsealed, and each accepted one is
              recorded with its transaction.
            </p>
            <div className="flex flex-col gap-4">{resolved.map(renderAsk)}</div>
          </div>
        )}

        {/* Awaria historii NIE zabiera listy otwartych - to osobne zapytanie
            i osobna wiadomosc. Milczenie tutaj znaczyloby "nic sie nigdy nie
            rozliczylo", czyli nieprawde o produkcie. */}
        {phase === 'ready' && resolvedFailed && (
          <p className="mt-10 text-[13px] leading-[1.6] text-soft-ink-soft">
            Settled asks could not be loaded. This is a failed read, not an empty history. The
            open ones above are unaffected.
          </p>
        )}
      </div>
      {/* Wyjscie z tej strony na telefonie. Dolny pasek feedu jest jego
          wewnetrznym przelacznikiem paneli i tu nie dziala - bez tego /asks
          bylo na telefonie slepym zaulkiem: gorna belka chowa sie pod
          hamburgerem, wiec droga powrotna istniala, ale nie bylo jej widac. */}
    </main>
  );
}

/** Ksztalt karty bez tresci - zeby nie sugerowac danych, ktorych jeszcze nie ma. */
function LoadingList() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading open asks">
      {[0, 1].map((index) => (
        <div
          key={index}
          className="rounded-card border border-soft-line bg-soft-surface p-5 shadow-card"
        >
          <div className="mb-4 h-3 w-24 rounded-pill bg-soft-sunken" />
          <div className="mb-2 h-3.5 w-full rounded-pill bg-soft-sunken" />
          <div className="mb-5 h-3.5 w-3/4 rounded-pill bg-soft-sunken" />
          <div className="h-12 w-full rounded-pill bg-soft-sunken" />
        </div>
      ))}
    </div>
  );
}

/* ==================================================================== */
/*  PANEL JEDNEGO ASKA                                                   */
/* ==================================================================== */

type AnswerRow = {
  id: string;
  author: string;
  createdAt: number;
  accepted: boolean;
  payoutTxHash: string | null;
  /** `null` znaczy ZAPIECZETOWANA, nigdy "pusta" - patrz typ AskAnswer. */
  content: string | null;
  sealed: boolean;
};

type Thread = {
  status: string;
  resolved: boolean;
  viewerIsAuthor: boolean;
  count: number;
  answers: AnswerRow[];
};

const panelClass =
  'rounded-card border border-soft-line bg-soft-surface p-4 font-soft shadow-card sm:p-5';
const fieldClass =
  'w-full rounded-lg border border-soft-line bg-soft-surface px-3 py-2 font-soft text-[14px] text-soft-ink placeholder:text-soft-ink-faint focus:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary';
const buttonClass =
  'inline-flex shrink-0 items-center justify-center rounded-lg px-3.5 py-2 font-soft-display text-[12.5px] font-semibold transition-transform duration-150 ease-out active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary focus-visible:ring-offset-2 focus-visible:ring-offset-soft-surface disabled:cursor-not-allowed disabled:bg-soft-line-strong';

/**
 * Odpowiedzi jednego Aska: napisanie wlasnej, przeczytanie (jesli wolno) i -
 * dla autora - przyjecie z przelewem oraz zamkniecie.
 *
 * === CZEGO TEN PANEL NIE ROBI ===
 * Nie odslania niczego sam z siebie. O tym, ktora tresc jest widoczna, decyduje
 * WYLACZNIE serwer (GET /api/asks/[id]/answers wydaje ja autorowi Aska, autorowi
 * odpowiedzi albo po rozstrzygnieciu). `sealed: true` przychodzi z serwera i
 * panel tylko go rysuje - zaslona w UI nie bylaby zapieczetowaniem.
 *
 * === AWARIA ODCZYTU NIE ZABIERA MOZLIWOSCI ODPOWIEDZI ===
 * Lista odpowiedzi wymaga indeksu zlozonego (`askId` + `createdAt`), ktorego na
 * produkcji jeszcze nie ma. Formularz odpowiedzi NIE zalezy od tej listy, wiec
 * stoi tu takze wtedy, gdy odczyt padl - inaczej brakujacy indeks blokowalby
 * czynnosc, ktora dziala.
 */
function AskThread({
  ask,
  viewer,
  sessionViewer,
  isAuthor,
  isSignedIn,
  onSignIn,
  onPatch,
  onClose,
}: {
  ask: Ask;
  viewer: string | null;
  /** Adres z sesji SIWE, bez zlepienia z portfelem - do zdan o tozsamosci. */
  sessionViewer: string | null;
  isAuthor: boolean;
  isSignedIn: boolean;
  onSignIn: () => Promise<boolean>;
  onPatch: (id: string, patch: Partial<Ask>) => void;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [thread, setThread] = useState<Thread | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const [payingId, setPayingId] = useState<string | null>(null);
  /** Hash potwierdzonej wyplaty, ktorej JESZCZE nie udalo sie zapisac. */
  const [proof, setProof] = useState<{ answerId: string; txHash: string } | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordError, setRecordError] = useState<string | null>(null);

  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);

  /* -------------------- ESCROW -------------------- */

  const { address: walletAddress } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient({ chainId: ESCROW_CHAIN_ID });
  // Klient portfela pobierany swiezo przy podpisie - patrz komentarz w AsksPage.
  const config = useConfig();
  const { switchChainAsync } = useSwitchChain();

  const escrowed = ask.funding === 'escrowed';
  /** Identyfikatory odpowiedzi wskazanych do wyplaty. Jedna transakcja, cala lista. */
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [awarding, setAwarding] = useState(false);
  const [escrowError, setEscrowError] = useState<string | null>(null);
  /**
   * Hash POTWIERDZONEGO resolve, ktorego jeszcze nie udalo sie zapisac.
   *
   * Ta sama rola co `proof` przy przelewach i ten sam powod: pieniadze sa juz
   * przypisane na lancuchu, wiec utrata hasha zostawilaby Aska otwartym nad
   * escrow, ktorego nie da sie rozstrzygnac drugi raz (resolve jest terminalne).
   */
  const [awardProof, setAwardProof] = useState<string | null>(null);

  const payingIdRef = useRef<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    setPhase('loading');
    setLoadError(null);
    try {
      const response = await fetch(`/api/asks/${encodeURIComponent(ask.id)}/answers`, {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!response.ok) {
        const message = await readApiError(response, 'Answers could not be loaded.');
        if (!mountedRef.current) return;
        setLoadError(message);
        setPhase('failed');
        return;
      }
      const data = (await response.json()) as Record<string, unknown>;
      if (!mountedRef.current) return;
      setThread({
        status: typeof data.status === 'string' ? data.status : ask.status,
        resolved: data.resolved === true,
        viewerIsAuthor: data.viewerIsAuthor === true,
        count: typeof data.count === 'number' ? data.count : 0,
        answers: Array.isArray(data.answers) ? (data.answers as AnswerRow[]) : [],
      });
      setPhase('ready');
    } catch (error) {
      console.error('[asks] Odczyt odpowiedzi nie powiodl sie:', error);
      if (!mountedRef.current) return;
      // Sieciowa awaria to nie jest "nikt nie odpowiedzial".
      setLoadError('Answers could not be loaded. This is a failed read, not an empty list.');
      setPhase('failed');
    }
  }, [ask.id, ask.status]);

  useEffect(() => {
    void load();
  }, [load]);

  /* -------------------- ODPOWIADANIE -------------------- */

  const alreadyAnswered =
    viewer !== null &&
    (thread?.answers ?? []).some((answer) => normalizeAddress(answer.author) === viewer);

  const canStillAnswer = ask.status === 'open' && ask.deadline > Date.now();

  async function submitAnswer(event: React.FormEvent) {
    event.preventDefault();
    const content = draft.trim();
    if (content === '' || sending) return;

    setSending(true);
    setSendError(null);
    try {
      const response = await fetch('/api/asks/answers', {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ askId: ask.id, content }),
      });
      if (!response.ok) {
        setSendError(await readApiError(response, 'The answer was not sent.'));
        return;
      }
      setDraft('');
      setSent(true);
      onPatch(ask.id, { answerCount: ask.answerCount + 1 });
      await load();
    } catch (error) {
      console.error('[asks] Wyslanie odpowiedzi nie powiodlo sie:', error);
      setSendError('The answer was not sent. Nothing was stored. Try again.');
    } finally {
      if (mountedRef.current) setSending(false);
    }
  }

  /* -------------------- PRZYJMOWANIE -------------------- */

  /**
   * Zapis PRZYJECIA, wolany dopiero po potwierdzonym przelewie.
   *
   * Rzuca bledem, gdy serwer odmowil - `usePaymentFlow` przenosi wtedy faze na
   * 'error', a hash zostaje w `proof`, zeby dalo sie ponowic SAM ZAPIS bez
   * placenia drugi raz. To jest najwazniejszy szczegol tego panelu: pieniadze
   * juz poszly, wiec utrata hasha kosztowalaby czlowieka drugi przelew.
   */
  const recordAccept = useCallback(
    async (answerId: string, txHash: string) => {
      const response = await fetch(`/api/asks/${encodeURIComponent(ask.id)}/accept`, {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answerId, payoutTxHash: txHash }),
      });

      if (!response.ok) {
        throw new Error(
          await readApiError(
            response,
            'The payout is on-chain but could not be recorded. Retry with the same hash.'
          )
        );
      }

      const data = (await response.json()) as { acceptedCount?: unknown; status?: unknown };
      const patch: Partial<Ask> = {};
      if (typeof data.acceptedCount === 'number') patch.acceptedCount = data.acceptedCount;
      // Ostatnie oplacone miejsce zamyka Aska po stronie serwera (auto-full).
      // Bez tego karta zostawalaby "open" z przyciskiem Resolve, ktory
      // odpowiedzialby 409 already_resolved.
      if (data.status === 'resolved') {
        patch.status = 'resolved';
        patch.resolvedAt = Date.now();
      }
      if (Object.keys(patch).length > 0) onPatch(ask.id, patch);
      if (mountedRef.current) {
        setProof(null);
        setRecordError(null);
      }
      await load();
    },
    [ask.id, load, onPatch]
  );

  const payment = usePaymentFlow(async (txHash) => {
    const answerId = payingIdRef.current;
    if (!answerId) {
      throw new Error(
        `The transfer went through (${txHash}) but we lost track of which answer it was for. Record it with that hash.`
      );
    }
    // Zapisujemy dowod ZANIM sprobujemy go zaksiegowac - gdy zapis padnie,
    // hash zostaje na ekranie razem z przyciskiem ponowienia.
    setProof({ answerId, txHash });
    await recordAccept(answerId, txHash);
  });

  const payable = Number.isFinite(ask.perAnswer) && ask.perAnswer > 0;
  const seatsLeft = ask.seats - ask.acceptedCount;

  /**
   * Autor bez sesji SIWE NIE MOZE zobaczyc przycisku wyplaty.
   *
   * Trasy `accept` i `resolve` czytaja tozsamosc wylacznie z podpisanej sesji,
   * wiec bez niej przelew poszedlby na lancuch, a zapis wrocilby z 401 -
   * czlowiek zaplacilby za odpowiedz, ktorej nie da sie przyjac. Podlaczony
   * portfel to za malo; podpis musi byc PRZED platnoscia, nie po.
   */
  const authorNeedsSignIn = isAuthor && !isSignedIn;

  /**
   * Tozsamosc patrzacego w jednym miejscu - do zdan, ktore mowia DLACZEGO
   * czegos nie widac. Serwer pieczetuje po sesji, wiec zdania musza mowic
   * o sesji, nie o podlaczonym portfelu.
   */
  const identity = {
    signedIn: isSignedIn,
    sessionAddress: sessionViewer,
    walletAddress: walletAddress ?? null,
    askAuthor: ask.author,
  };
  /** Portfel tworcy podlaczony, ale sesja nalezy do innego adresu. */
  const identityMismatch = authorIdentityMismatch(identity);
  /** Zdanie pod kazda zapieczetowana odpowiedzia - jedno na caly watek. */
  const sealedNotice = sealedAnswerNotice(identity);

  function startPayout(answer: AnswerRow) {
    if (!payable || payment.isBusy) return;
    payingIdRef.current = answer.id;
    setPayingId(answer.id);
    setRecordError(null);
    payment.reset();
    payment.pay({ to: answer.author, amount: ask.perAnswer.toFixed(2), token: 'USDC' });
  }

  async function retryRecord() {
    if (!proof || recording) return;
    setRecording(true);
    setRecordError(null);
    try {
      await recordAccept(proof.answerId, proof.txHash);
    } catch (error) {
      setRecordError(error instanceof Error ? error.message : 'Could not record the payout.');
    } finally {
      if (mountedRef.current) setRecording(false);
    }
  }

  /* -------------------- ROZSTRZYGANIE PRZEZ ESCROW -------------------- */

  /**
   * Odpowiedzi, ktore kontrakt w ogole przyjmie jako zwyciezcow.
   *
   * Odfiltrowane sa: juz przyjete (drugi raz nie da sie zaplacic) i te napisane
   * z adresu autora (kontrakt odrzuca `w == msg.sender` przez InvalidWinner).
   * Filtrujemy TUTAJ, zeby te przypadki nie mogly nawet trafic na liste - blad
   * z lancucha po podpisaniu transakcji jest gorszy niz brak checkboxa.
   */
  const eligible = (thread?.answers ?? []).filter(
    (answer) => !answer.accepted && normalizeAddress(answer.author) !== normalizeAddress(ask.author)
  );

  const pickedList = eligible.filter((answer) => picked.has(answer.id));
  const beforeDeadline = ask.deadline > Date.now();
  const resolveWindowClosed = Date.now() > ask.deadline + RESOLVE_GRACE_MS;
  /**
   * Miejsca, ktorymi dysponuje KONTRAKT - i tylko one licza sie w jego regulach.
   *
   * Bierzemy `ask.seats`, a nie `seats - acceptedCount`: przy escrow nie ma
   * czesciowego przyjmowania (jedyna droga do `accepted` prowadzi przez
   * escrow-resolve, ktore od razu zamyka Aska), wiec dopoki panel jest widoczny,
   * na lancuchu stoi pelna liczba miejsc. Odejmowanie licznika z Firestore
   * dawaloby liczbe INNA niz `e.seats` w kontrakcie i UI zadalby innej liczby
   * wskazan niz sprawdzi EarlyResolveMustFillSeats - czyli surowego revertu
   * dokladnie tam, gdzie mamy go tlumaczyc.
   */
  const seatsFree = ask.seats;
  /** Dwie odpowiedzi z tego samego portfela - kontrakt odrzuca to (DuplicateWinner). */
  const pickedWallets = new Set(pickedList.map((answer) => normalizeAddress(answer.author)));
  const hasDuplicateWallet = pickedWallets.size !== pickedList.length;

  /**
   * DLACZEGO PRZYCISK JEST ZABLOKOWANY - powiedziane ZANIM ktokolwiek kliknie.
   *
   * Kazdy z tych warunkow odpowiada bledowi kontraktu, ktory inaczej wrocilby
   * jako surowy revert PO podpisaniu transakcji i po zaplaceniu za gaz.
   * Najwazniejszy jest EarlyResolveMustFillSeats: bez wytlumaczenia go tutaj
   * wyglada jak awaria, a jest regula chroniaca odpowiadajacych przed autorem,
   * ktory czyta naplywajace odpowiedzi i wycofuje budzet.
   */
  const escrowBlocker: string | null = resolveWindowClosed
    ? 'The 48-hour window for resolving after the deadline has closed. Nobody can be awarded from this escrow any more. The budget only goes back to you, minus the fee.'
    : pickedList.length === 0
      ? 'Pick the answers you are paying for. The contract will not close an Ask with nobody paid.'
      : hasDuplicateWallet
        ? 'Two of the picked answers come from the same wallet. The contract allows one seat per wallet.'
        : pickedList.length > seatsFree
          ? `You picked ${pickedList.length} answers but only ${seatsFree} seat${seatsFree === 1 ? '' : 's'} remain.`
          : beforeDeadline && pickedList.length !== seatsFree
            ? `Before the deadline you can only resolve by filling every seat: pick exactly ${seatsFree}, not ${pickedList.length}. ` +
              'Otherwise you could read the answers as they arrive and take the unused budget back early. Wait for the deadline to resolve with fewer.'
            : null;

  /** Zapis rozstrzygniecia. Wolany dopiero po POTWIERDZONEJ transakcji resolve. */
  const recordAward = useCallback(
    async (txHash: string) => {
      const response = await fetch(`/api/asks/${encodeURIComponent(ask.id)}/escrow-resolve`, {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ txHash }),
      });

      if (!response.ok) {
        throw new Error(
          await readApiError(
            response,
            'The resolve is on-chain but could not be recorded. Retry with the same hash.'
          )
        );
      }

      if (mountedRef.current) {
        setAwardProof(null);
        setEscrowError(null);
      }
      onPatch(ask.id, { status: 'resolved', resolvedAt: Date.now(), escrowResolveTxHash: txHash });
      await load();
    },
    [ask.id, load, onPatch]
  );

  async function handleEscrowResolve() {
    if (awarding || escrowBlocker !== null) return;
    setAwarding(true);
    setEscrowError(null);
    try {
      if (chainId !== ESCROW_CHAIN_ID) {
        // Zmiana sieci PRZED podpisem - odmowa konczy sie tu, bez transakcji.
        await switchChainAsync({ chainId: ESCROW_CHAIN_ID });
      }
      if (!publicClient || !walletAddress) {
        throw new Error('Your wallet is not ready to sign yet. Nothing changed. Try again.');
      }
      const signer = await getWalletClient(config, { chainId: ESCROW_CHAIN_ID });

      const txHash = await resolveAskOnchain({
        reader: publicClient,
        signer,
        chainId: ESCROW_CHAIN_ID,
        // Kontrakt odtwarza klucz z msg.sender, wiec podpisac musi TEN portfel,
        // ktory finansowal. Podanie tu `ask.author` z bazy tylko udawaloby, ze
        // wiemy lepiej - simulateContract odrzuci to z NotOpen i tak.
        author: walletAddress,
        askDocId: ask.id,
        winners: pickedList.map((answer) => ({
          address: answer.author,
          answerDocId: answer.id,
        })),
      });

      // Dowod zapisujemy ZANIM sprobujemy go zaksiegowac - gdy zapis padnie,
      // hash zostaje na ekranie razem z przyciskiem ponowienia.
      if (mountedRef.current) setAwardProof(txHash);
      await recordAward(txHash);
    } catch (error) {
      console.error('[asks] Rozstrzygniecie przez escrow nie powiodlo sie:', error);
      if (mountedRef.current) setEscrowError(describeEscrowError(error));
    } finally {
      if (mountedRef.current) setAwarding(false);
    }
  }

  async function retryAward() {
    if (!awardProof || awarding) return;
    setAwarding(true);
    setEscrowError(null);
    try {
      await recordAward(awardProof);
    } catch (error) {
      if (mountedRef.current) {
        setEscrowError(error instanceof Error ? error.message : 'Could not record the resolve.');
      }
    } finally {
      if (mountedRef.current) setAwarding(false);
    }
  }

  /* -------------------- ROZSTRZYGANIE -------------------- */

  async function handleResolve() {
    if (resolving) return;
    setResolving(true);
    setResolveError(null);
    try {
      const response = await fetch(`/api/asks/${encodeURIComponent(ask.id)}/resolve`, {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
      });
      if (!response.ok) {
        setResolveError(await readApiError(response, 'This Ask was not resolved.'));
        return;
      }
      onPatch(ask.id, { status: 'resolved', resolvedAt: Date.now() });
      await load();
    } catch (error) {
      console.error('[asks] Rozstrzygniecie nie powiodlo sie:', error);
      setResolveError('This Ask was not resolved. Nothing changed. Try again.');
    } finally {
      if (mountedRef.current) setResolving(false);
    }
  }

  /* -------------------- WIDOK -------------------- */

  const payLabel =
    payment.phase === 'signing'
      ? 'Check your wallet…'
      : payment.phase === 'confirming'
        ? 'Confirming…'
        : payment.phase === 'recording'
          ? 'Recording…'
          : `Pay ${formatAskMoney(ask.perAnswer, ask.token)} and accept`;

  return (
    <section className={panelClass} aria-label="Answers on this Ask">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="min-w-0 font-soft-display text-[15px] font-bold text-soft-ink">
          {isAuthor ? 'Answers to your Ask' : 'Answer this Ask'}
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-lg px-2.5 py-1 font-soft-display text-[12px] font-semibold text-soft-ink-muted transition-transform duration-150 ease-out active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
        >
          Close
        </button>
      </div>

      {/* ---------- FAKTY Z LANCUCHA ---------- */}
      {escrowed && <EscrowFacts ask={ask} />}

      {/* ---------- PORTFEL TWORCY, SESJA KOGOS INNEGO ----------
          Pulapka "wszedlem ze zlego konta": API patrzy wylacznie na sesje,
          wiec tworca z cudza sesja jest dla serwera obcy. Bez tego banera
          widzial swoje pytanie jako cudze i zadne zdanie nie mowilo dlaczego. */}
      {identityMismatch && (
        <div className="mb-4 rounded-lg border border-soft-line bg-soft-sunken p-3">
          <p className="mb-2 break-words text-[12.5px] leading-[1.5] text-soft-ink-muted">
            The wallet you have connected created this Ask, but your signed session belongs to{' '}
            {sessionViewer ? getSlicedAddress(sessionViewer) : 'another address'}. Sign in again
            with this wallet to read the sealed answers and resolve.
          </p>
          <button
            type="button"
            onClick={() => void onSignIn()}
            className={`${buttonClass} bg-soft-primary text-white`}
          >
            Sign in with this wallet
          </button>
        </div>
      )}

      {/* ---------- AUTOR BEZ PODPISU ---------- */}
      {authorNeedsSignIn && (
        <div className="mb-4 rounded-lg border border-soft-line bg-soft-sunken p-3">
          <p className="mb-2 break-words text-[12.5px] leading-[1.5] text-soft-ink-muted">
            Sign in with your wallet to open the sealed answers, accept them and resolve. Paying
            before signing in would leave you with a payout nobody could record.
          </p>
          <button
            type="button"
            onClick={() => void onSignIn()}
            className={`${buttonClass} bg-soft-primary text-white`}
          >
            Sign in
          </button>
        </div>
      )}

      {/* ---------- FORMULARZ ODPOWIEDZI ---------- */}
      {!isAuthor && canStillAnswer && !alreadyAnswered && (
        <form onSubmit={submitAnswer} className="mb-4">
          {!isSignedIn ? (
            <div className="rounded-lg border border-soft-line bg-soft-sunken p-3">
              <p className="mb-2 break-words text-[12.5px] leading-[1.5] text-soft-ink-muted">
                Sign in with your wallet to answer. Your answer stays sealed. Only the author can
                read it, and only until they resolve.
              </p>
              <button
                type="button"
                onClick={() => void onSignIn()}
                className={`${buttonClass} bg-soft-primary text-white`}
              >
                Sign in
              </button>
            </div>
          ) : (
            <>
              <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-soft-ink-faint">
                Your answer
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value.slice(0, MAX_ANSWER_LENGTH))}
                  rows={4}
                  placeholder="Write it once. Nobody else can read it, so nobody can copy it."
                  className={`mt-1.5 block resize-y ${fieldClass} font-normal normal-case tracking-normal`}
                />
              </label>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] tabular-nums text-soft-ink-faint">
                  {draft.trim().length}/{MAX_ANSWER_LENGTH}
                </span>
                <button
                  type="submit"
                  disabled={sending || draft.trim() === ''}
                  className={`${buttonClass} bg-soft-primary text-white`}
                >
                  {sending ? 'Sending…' : `Answer for ${formatAskMoney(ask.perAnswer, ask.token)}`}
                </button>
              </div>
              {/* Zdanie dla PISZACEGO, czyli dla tego, kto ryzykuje. Musi
                  wynikac z `funding`, bo w jednym wariancie pieniadze na jego
                  miejsce naprawde leza, a w drugim nie ma ich nigdzie. */}
              <p className="mt-2 break-words text-[11.5px] leading-[1.5] text-soft-ink-faint">
                {escrowed ? (
                  <>
                    You write before you are paid, but the budget for this Ask is already locked in a
                    contract the author cannot empty. If they pick your answer you get{' '}
                    {formatAskMoney(ask.perAnswer, ask.token)} to collect; if they pick nobody, the
                    budget only unlocks back to them 48 hours after the deadline.
                  </>
                ) : (
                  <>
                    You write before you are paid. Nothing is held in escrow, so check the
                    author&apos;s resolve record on the card above before you spend time on this.
                  </>
                )}
              </p>
              {sendError && (
                <p className="mt-2 break-words text-[12px] leading-[1.5] text-soft-accent-deep" role="alert">
                  {sendError}
                </p>
              )}
            </>
          )}
        </form>
      )}

      {!isAuthor && sent && (
        <p className="mb-4 break-words text-[12.5px] leading-[1.5] text-soft-primary-deep" role="status">
          Answer sent and sealed. You will see it here; nobody else can until the author resolves.
        </p>
      )}

      {!isAuthor && !canStillAnswer && (
        <p className="mb-4 break-words text-[12.5px] leading-[1.5] text-soft-ink-muted">
          This Ask is no longer taking answers.
        </p>
      )}

      {/* ---------- LISTA ODPOWIEDZI ---------- */}
      {phase === 'loading' && (
        <p className="text-[12.5px] text-soft-ink-faint" aria-busy="true">
          Loading answers…
        </p>
      )}

      {phase === 'failed' && (
        <div className="rounded-lg border border-soft-line bg-soft-sunken p-3">
          <p className="mb-2 break-words text-[12.5px] leading-[1.5] text-soft-ink-muted">
            {loadError ?? 'Answers could not be loaded.'} This is a failed read, not an empty list.
          </p>
          <button
            type="button"
            onClick={() => void load()}
            className={`${buttonClass} bg-soft-primary text-white`}
          >
            Try again
          </button>
        </div>
      )}

      {phase === 'ready' && thread && thread.answers.length === 0 && (
        <p className="break-words text-[12.5px] leading-[1.5] text-soft-ink-muted">
          No answers yet. Nobody has written anything on this Ask.
        </p>
      )}

      {phase === 'ready' && thread && thread.answers.length > 0 && (
        <ul className="flex flex-col gap-3">
          {thread.answers.map((answer) => {
            const mine = viewer !== null && normalizeAddress(answer.author) === viewer;
            // Przy escrow NIE MA przelewu na odpowiedz: kontrakt przypisuje
            // wszystkie miejsca jedna transakcja resolve. Przycisk "Pay and
            // accept" oznaczalby tam drugi, rownolegly przeplyw pieniedzy -
            // autor zaplacilby z portfela za cos, co juz oplacil w escrow.
            const canAccept =
              !escrowed &&
              isAuthor &&
              isSignedIn &&
              !answer.accepted &&
              ask.status !== 'resolved' &&
              seatsLeft > 0 &&
              payable;

            const canPick =
              escrowed &&
              isAuthor &&
              isSignedIn &&
              ask.status !== 'resolved' &&
              eligible.some((candidate) => candidate.id === answer.id);

            return (
              <li
                key={answer.id}
                className="rounded-lg border border-soft-line bg-soft-sunken/60 p-3"
              >
                <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="min-w-0 break-all font-soft-display text-[12.5px] font-semibold text-soft-ink">
                    {getSlicedAddress(answer.author)}
                    {mine ? ' (you)' : ''}
                  </span>
                  {answer.accepted && (
                    <span className="shrink-0 rounded-full border border-soft-accent/30 bg-soft-accent-soft px-2 py-0.5 text-[10px] font-medium text-soft-accent-deep">
                      accepted
                    </span>
                  )}
                </div>

                {answer.sealed ? (
                  <p className="break-words text-[12.5px] leading-[1.5] text-soft-ink-faint">
                    {sealedNotice}
                  </p>
                ) : (
                  <p className="whitespace-pre-wrap break-words text-[13.5px] leading-[1.6] text-soft-ink">
                    {answer.content ?? 'This answer has no stored text.'}
                  </p>
                )}

                {answer.accepted && answer.payoutTxHash && (
                  <a
                    href={`${EXPLORER_TX}${answer.payoutTxHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-block break-all text-[11px] font-medium text-soft-primary-deep underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
                  >
                    payout {answer.payoutTxHash.slice(0, 10)}…{answer.payoutTxHash.slice(-6)}
                  </a>
                )}

                {canPick && (
                  <label className="mt-2.5 flex cursor-pointer items-start gap-2">
                    <input
                      type="checkbox"
                      checked={picked.has(answer.id)}
                      onChange={(event) =>
                        setPicked((current) => {
                          const next = new Set(current);
                          if (event.target.checked) next.add(answer.id);
                          else next.delete(answer.id);
                          return next;
                        })
                      }
                      className="mt-0.5 h-4 w-4 shrink-0 accent-[#F5A73B] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
                    />
                    <span className="text-[12px] leading-[1.4] text-soft-ink-muted">
                      Award {formatAskMoney(ask.perAnswer, ask.token)} to this answer
                    </span>
                  </label>
                )}

                {canAccept && (
                  <div className="mt-2.5">
                    {!payment.isOnBase ? (
                      <button
                        type="button"
                        onClick={payment.switchToBase}
                        className={`${buttonClass} bg-soft-primary text-white`}
                      >
                        Switch to Base to pay
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => startPayout(answer)}
                        disabled={payment.isBusy}
                        className={`${buttonClass} bg-soft-primary text-white`}
                      >
                        {payingId === answer.id
                          ? payLabel
                          : `Pay ${formatAskMoney(ask.perAnswer, ask.token)} and accept`}
                      </button>
                    )}
                    {seatsLeft === 1 && (
                      <p className="mt-1.5 break-words text-[11.5px] leading-[1.5] text-soft-ink-faint">
                        Paying this last seat closes the Ask and unseals every answer.
                      </p>
                    )}
                    {payingId === answer.id && payment.error && (
                      <p
                        className="mt-2 break-words text-[12px] leading-[1.5] text-soft-accent-deep"
                        role="alert"
                      >
                        {payment.error}
                      </p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* ---------- DOWOD, KTOREGO NIE UDALO SIE ZAPISAC ---------- */}
      {proof && (
        <div className="mt-4 rounded-lg border border-soft-accent/40 bg-soft-accent-soft p-3">
          <p className="mb-2 break-words text-[12.5px] leading-[1.5] text-soft-accent-deep">
            The transfer is confirmed on Base but the acceptance is not recorded yet. Retrying uses
            the same transaction, so you will not pay twice.
          </p>
          <p className="mb-2 break-all text-[11px] text-soft-ink-muted">{proof.txHash}</p>
          <button
            type="button"
            onClick={() => void retryRecord()}
            disabled={recording}
            className={`${buttonClass} bg-soft-primary text-white`}
          >
            {recording ? 'Recording…' : 'Record this payout'}
          </button>
          {recordError && (
            <p className="mt-2 break-words text-[12px] leading-[1.5] text-soft-accent-deep" role="alert">
              {recordError}
            </p>
          )}
        </div>
      )}

      {/* ---------- ROZSTRZYGNIECIE PRZEZ ESCROW ----------
          Zupelnie inna mechanika niz nizej: jedna transakcja na kontrakcie
          rozdziela wszystkie miejsca naraz, a autor nie wysyla ani jednego
          przelewu. Dlatego to jest osobna sekcja, a nie wariant tamtej. */}
      {escrowed && isAuthor && isSignedIn && ask.status !== 'resolved' && (
        <div className="mt-4 border-t border-soft-line/70 pt-4">
          <p className="mb-2 break-words text-[11.5px] leading-[1.5] text-soft-ink-faint">
            The budget is already locked in the contract. Resolving assigns it: each answer you pick
            gets {formatAskMoney(ask.perAnswer, ask.token)} it can collect at any time, and any seat
            you leave empty comes back to you minus the fee. It happens once and cannot be undone or
            repeated.
          </p>

          {/* Powod blokady stoi ZAWSZE, nie dopiero po nieudanym klikinieciu. */}
          {escrowBlocker && (
            <p className="mb-2 break-words text-[12px] leading-[1.5] text-soft-accent-deep">
              {escrowBlocker}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void handleEscrowResolve()}
              disabled={awarding || escrowBlocker !== null}
              className={`${buttonClass} bg-soft-primary text-white`}
            >
              {awarding
                ? 'Awarding…'
                : `Award ${formatAskMoney(pickedList.length * ask.perAnswer, ask.token)} and close`}
            </button>
            <span className="text-[11.5px] tabular-nums text-soft-ink-faint">
              {pickedList.length} of {seatsFree} open seat{seatsFree === 1 ? '' : 's'} picked
            </span>
          </div>

          {escrowError && (
            <p className="mt-2 break-words text-[12px] leading-[1.5] text-soft-accent-deep" role="alert">
              {escrowError}
            </p>
          )}

          {/* Transakcja przeszla, zapis nie. Pieniadze SA juz przypisane, a
              resolve jest terminalne - drugie wywolanie skonczy sie NotOpen,
              wiec jedynym wyjsciem jest ponowienie SAMEGO zapisu. */}
          {awardProof && (
            <div className="mt-3 rounded-lg border border-soft-accent/40 bg-soft-accent-soft p-3">
              <p className="mb-2 break-words text-[12.5px] leading-[1.5] text-soft-accent-deep">
                The resolve is confirmed on Base and the money is already assigned to the answers you
                picked, but this Ask is not marked resolved yet. Retrying only writes the record. It
                does not send anything again.
              </p>
              <p className="mb-2 break-all text-[11px] text-soft-ink-muted">{awardProof}</p>
              <button
                type="button"
                onClick={() => void retryAward()}
                disabled={awarding}
                className={`${buttonClass} bg-soft-primary text-white`}
              >
                {awarding ? 'Recording…' : 'Record this resolve'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ---------- ROZSTRZYGNIECIE BEZ ESCROW ---------- */}
      {!escrowed && isAuthor && isSignedIn && ask.status !== 'resolved' && (
        <div className="mt-4 border-t border-soft-line/70 pt-4">
          <p className="mb-2 break-words text-[11.5px] leading-[1.5] text-soft-ink-faint">
            Resolving closes this Ask and unseals every answer for everyone. You can only resolve
            after accepting at least one answer, because resolving means you paid.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void handleResolve()}
              disabled={resolving}
              className={`${buttonClass} bg-soft-primary text-white`}
            >
              {resolving ? 'Resolving…' : 'Resolve this Ask'}
            </button>
            <span className="text-[11.5px] tabular-nums text-soft-ink-faint">
              {ask.acceptedCount} of {ask.seats} seats paid
            </span>
          </div>
          {resolveError && (
            <p className="mt-2 break-words text-[12px] leading-[1.5] text-soft-accent-deep" role="alert">
              {resolveError}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

/* ==================================================================== */
/*  FAKTY Z LANCUCHA                                                     */
/* ==================================================================== */

/**
 * Co NAPRAWDE lezy na kontrakcie pod tym Askiem.
 *
 * === PO CO, SKORO DOKUMENT JUZ MOWI 'escrowed' ===
 * Bo dokument to twierdzenie aplikacji, a nie fakt. Cala ochrona
 * odpowiadajacego - jedynej osoby, ktora tu pracuje przed zaplata - polega na
 * tym, ze moze sprawdzic PRZED napisaniem odpowiedzi, ze na jego miejsce
 * naprawde lezy pieniadz. Kontrakt wystawia do tego publiczny odczyt
 * escrowFor(); bez uzycia go slowo "escrow" na karcie jest reklama, nie faktem
 * (uzasadnienie w naglowku contracts/AskEscrow.sol).
 *
 * === TRZY WYNIKI, TRZY ROZNE ZDANIA ===
 * Awaria odczytu NIE jest tym samym co "nic nie znaleziono", a "nic nie
 * znaleziono" nie jest tym samym co "zablokowane". Sklejenie ktorychkolwiek
 * dwoch z nich klamie w strone, ktora kosztuje czlowieka czas albo pieniadze.
 */
function EscrowFacts({ ask }: { ask: Ask }) {
  const publicClient = usePublicClient({ chainId: ESCROW_CHAIN_ID });
  const [phase, setPhase] = useState<Phase>('loading');
  const [state, setState] = useState<EscrowState | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /**
   * ===== "NIE ZNALAZLEM" NIE JEST TYM SAMYM CO "NIE MA" =====
   *
   * Pierwszy prawdziwy Ask z escrow na mainnecie pokazal to zdanie:
   * "This Ask says it is escrowed, but the contract holds nothing under it".
   * Bylo NIEPRAWDZIWE - kontrakt trzymal pod tym kluczem pelne 5 USDC
   * (funded=true, budget=5.0, seatsLeft=1). Odpowiadajacy czytali wiec
   * "nie trac czasu" nad Askiem, ktory byl oplacony co do centa.
   *
   * Powod: publiczne RPC Base jest ZA LOAD BALANCEREM i nie kazdy wezel ma juz
   * najswiezszy blok. Wezel, ktory nie widzi bloku z `fund()`, oddaje na
   * `escrowFor` czyste zera - a zera znacza tu "nie ma zadnego escrow".
   * Zaraz po zalozeniu Aska trafienie w taki wezel jest NAJBARDZIEJ
   * prawdopodobne, bo blok ma kilka sekund. Ten sam blad mielismy juz raz przy
   * skrypcie cyklu escrow i naprawilismy go tam ponowieniami.
   *
   * Dlatego ponawiamy, ale TYLKO w jedna strone. `funded === true` jest
   * odpowiedzia pewna - zadne opoznienie nie wymysli depozytu, ktorego nie ma,
   * wiec bierzemy ja od razu. `funded === false` moze byc albo prawda, albo
   * spoznionym wezlem, i dopiero po kilku probach wolno je oglosic.
   *
   * Asymetria jest celowa, bo koszty pomylki sa skrajnie rozne: falszywe
   * "oplacony" naraza kogos na darmowa prace, falszywe "nieoplacony" odstrasza
   * od Aska, ktory ma pieniadze. Pierwsze jest niemozliwe (wezel nie zmysli
   * depozytu), drugie wlasnie sie zdarzylo.
   */
  const load = useCallback(async () => {
    if (!publicClient) return;
    setPhase('loading');

    // Trzy proby, 1.2s i 2.4s przerwy - lacznie ~3.6s. Tyle wystarcza, zeby
    // wezel dociagnal blok sprzed kilku sekund, i na tyle malo, zeby panel nie
    // wygladal na zawieszony.
    const OPOZNIENIA = [1200, 2400];

    for (let proba = 0; ; proba += 1) {
      try {
        const result = await readEscrow(publicClient, ESCROW_CHAIN_ID, ask.author, ask.id);
        if (!mountedRef.current) return;

        if (result.funded || proba >= OPOZNIENIA.length) {
          setState(result);
          setPhase('ready');
          return;
        }
      } catch (error) {
        console.error('[asks] Odczyt escrow nie powiodl sie:', error);
        if (!mountedRef.current) return;
        // Ostatnia proba padla - dopiero teraz mowimy, ze nie wiemy. Wczesniejsze
        // padniecie idzie na kolejna probe, bo pojedynczy wezel bywa chwilowo zly.
        if (proba >= OPOZNIENIA.length) {
          setPhase('failed');
          return;
        }
      }

      await new Promise((resolve) => setTimeout(resolve, OPOZNIENIA[proba]));
      if (!mountedRef.current) return;
    }
  }, [publicClient, ask.author, ask.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const box = 'mb-4 rounded-lg border p-3';

  if (phase === 'loading') {
    return (
      <div className={`${box} border-soft-line bg-soft-sunken`} aria-busy="true">
        <p className="text-[12px] leading-[1.5] text-soft-ink-muted">Reading the escrow contract…</p>
      </div>
    );
  }

  if (phase === 'failed' || !state) {
    return (
      <div className={`${box} border-soft-line bg-soft-sunken`}>
        <p className="mb-2 break-words text-[12px] leading-[1.5] text-soft-ink-muted">
          We could not reach the escrow contract. This is a failed read. It is not proof that
          nothing is locked, and not proof that something is.
        </p>
        <button
          type="button"
          onClick={() => void load()}
          className={`${buttonClass} bg-soft-primary text-white`}
        >
          Try again
        </button>
      </div>
    );
  }

  // Dokument mowi 'escrowed', a pod kluczem (autor, askId) nie ma NICZEGO.
  // To najgrozniejszy z tych stanow i dostaje najmocniejsze zdanie.
  if (!state.funded) {
    return (
      <div className={`${box} border-soft-line bg-soft-sunken`}>
        <p className="mb-2 break-words text-[12px] leading-[1.5] text-soft-ink-muted">
          This Ask says it is escrowed, but we cannot see anything locked under it. If it was just
          posted, the network may not have caught up yet. Check again in a moment, and if this
          stays, treat it as unfunded and do not expect a locked payout.
        </p>
        <button
          type="button"
          onClick={() => void load()}
          className={`${buttonClass} bg-soft-primary text-white`}
        >
          Check again
        </button>
      </div>
    );
  }

  const lockedNow = unitsToAmount(state.budget);
  // Stawka z lancucha kontra stawka z karty. Rozjazd znaczy, ze karta obiecuje
  // inna kwote niz ta, ktora przypisze kontrakt - i to lancuch ma racje.
  const rateMatches = state.perAnswer === perAnswerToUnits(ask.perAnswer);

  return (
    <div className={`${box} border-soft-line bg-soft-sunken`}>
      <p className="break-words text-[12px] leading-[1.5] text-soft-ink-muted">
        {state.open ? (
          <>
            <span className="font-semibold tabular-nums text-soft-accent-deep">
              {formatAskMoney(lockedNow, ask.token)}
            </span>{' '}
            is locked in the escrow contract right now, across {state.seatsLeft} open seat
            {state.seatsLeft === 1 ? '' : 's'}. This line comes from the contract itself, not from
            our database.
          </>
        ) : (
          <>
            This escrow is closed: every seat has been assigned and nothing is left to award. Each
            winner collects their share whenever they want.
          </>
        )}
      </p>
      {!rateMatches && (
        <p className="mt-2 break-words text-[12px] leading-[1.5] text-soft-accent-deep" role="alert">
          The per-answer amount on this card does not match the one locked in the contract. The
          contract is the one that pays, so believe it, not the card.
        </p>
      )}
    </div>
  );
}

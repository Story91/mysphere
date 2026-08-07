'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useAccount, useChainId, useConfig, usePublicClient, useSwitchChain } from 'wagmi';
import { getWalletClient } from 'wagmi/actions';
import { base } from 'wagmi/chains';
import MobileBottomNav from '../components/MobileBottomNav';
import AskCard, { formatAskMoney } from '../basechat/components/AskCard';
import AskClaimPanel from '../basechat/components/AskClaimPanel';
import AskComposer, { type AskDraft } from '../basechat/components/AskComposer';
import { usePaymentFlow } from '../components/monetization/usePaymentFlow';
import useSiweAuth from '../utils/auth/useSiweAuth';
import { createAsk, getOpenAsks, getResolveRate, newAskId } from '../utils/asks/asks';
import { perAnswerFor, type Ask, type ResolveRate } from '../utils/asks/types';
import {
  RESOLVE_GRACE_MS,
  describeEscrowError,
  escrowFeeBps,
  fundAsk,
  isEscrowAvailable,
  perAnswerToUnits,
  readEscrow,
  resolveAskOnchain,
  unitsToAmount,
  type EscrowState,
  type FundPhase,
} from '../utils/asks/escrow';
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
 * null), a `acceptAnswer` i `resolveAsk` nie mialy ani jednego wywolania w
 * calym repo. Teraz pelna droga stoi tutaj:
 *
 *   zaloz Aska        -> createAsk(), klienckim SDK, jak zwykly post
 *   odpowiedz         -> POST /api/asks/answers   (sesja SIWE, tresc zapieczetowana)
 *   przyjmij          -> przelew z portfela + POST /api/asks/[id]/accept
 *   zamknij           -> POST /api/asks/[id]/resolve
 *
 * === DRUGA SCIEZKA PIENIEDZY: ESCROW ===
 * Od podpiecia kontraktu AskEscrow autor ma wybor, ktory zmienia CALA prawa
 * polowe tej listy:
 *
 *   zaloz z escrow    -> approve + fund NA LANCUCHU, dopiero potem createAsk()
 *   rozstrzygnij      -> resolve() z lista zwyciezcow + POST .../escrow-resolve
 *   odbior            -> claim() przez odpowiadajacego (AskClaimPanel)
 *
 * Przy escrow NIE MA przelewu na odpowiedz i nie ma przycisku "Pay and accept":
 * kontrakt przypisuje wszystkie miejsca jedna transakcja, a tokeny wychodza
 * dopiero przy odbiorze. Dwie mechaniki nie mieszaja sie na jednym Asku -
 * decyduje pole `funding`, ustawione raz przy zakladaniu.
 *
 * === DLACZEGO ZAKLADANIE NIE IDZIE PRZEZ POST /api/asks ===
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

/** Jedyna siec, w ktorej dzialaja wyplaty (usePaymentFlow placi na Base). */
const EXPLORER_TX = 'https://basescan.org/tx/';

/**
 * Siec escrow. Ta sama, w ktorej placi usePaymentFlow, i jedyna z rodziny Base
 * w konfiguracji wagmi (app/providers.tsx nie ma Base Sepolii) - wiec z
 * przegladarki nie da sie trafic w drugie wdrozenie nawet przez pomylke.
 */
const ESCROW_CHAIN_ID = base.id;

/**
 * Co powiedziec przy kazdym etapie blokowania budzetu.
 *
 * Escrow to dwa okna portfela pod rzad. Bez nazwania ich drugie okno wyglada
 * jak awaria albo jak proba pobrania pieniedzy drugi raz.
 */
const FUND_PHASE_NOTES: Record<FundPhase, string> = {
  'checking-allowance': 'Checking how much USDC the escrow contract may take…',
  approving: 'Approve the exact budget in your wallet. This does not move it yet.',
  funding: 'Now confirm the deposit. This is the transaction that locks the money.',
};

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
  const chainId = useChainId();
  // Klient przypiety do Base, a nie do "aktualnej" sieci: gdyby portfel siedzial
  // gdzie indziej, odczyt allowance i paragon szlyby na lancuch, na ktorym
  // kontraktu nie ma - i wygladaloby to jak awaria, a nie jak zla siec.
  const publicClient = usePublicClient({ chainId: ESCROW_CHAIN_ID });
  /**
   * Konfiguracja, a nie `useWalletClient()`.
   *
   * Klient z hooka jest zamrozony w domkinieciu w chwili tworzenia handlera,
   * wiec po `switchChainAsync` wskazywalby WCIAZ na poprzedni lancuch i viem
   * odrzucalby podpis z ChainMismatchError - tuz po tym, jak uzytkownik
   * zaakceptowal zmiane sieci. `getWalletClient(config, { chainId })` pobiera
   * klienta swiezo i zawsze pod wlasciwa siec.
   */
  const config = useConfig();
  const { switchChainAsync } = useSwitchChain();

  /**
   * Kim jest patrzacy.
   *
   * Sesja SIWE ma pierwszenstwo, bo to ONA jest tozsamoscia dla tras
   * serwerowych - adres z wagmi mowi tylko, jaki portfel jest podlaczony.
   * Do zalozenia Aska wystarczy portfel (zapis idzie klienckim SDK), ale do
   * odpowiadania i przyjmowania potrzebna jest juz sesja.
   */
  const viewer = (sessionAddress ?? walletAddress ?? '').toLowerCase() || null;

  const [phase, setPhase] = useState<Phase>('loading');
  const [asks, setAsks] = useState<Ask[]>([]);
  const [rates, setRates] = useState<Record<string, ResolveRate>>({});
  const [attempt, setAttempt] = useState(0);

  /** Aski zalozone W TEJ SESJI - patrz komentarz przy `handleCreate`. */
  const [created, setCreated] = useState<Ask[]>([]);
  const [composerOpen, setComposerOpen] = useState(false);
  const [openAskId, setOpenAskId] = useState<string | null>(null);
  /**
   * Co sie wlasnie dzieje przy blokowaniu budzetu.
   *
   * Escrow to DWIE transakcje i dwa okna portfela. Bez tej linii czlowiek widzi
   * przycisk "Locking…" i drugie okno podpisu bez zadnego wyjasnienia, skad sie
   * wzielo - a to jest moment, w ktorym wychodza prawdziwe pieniadze.
   */
  const [fundNote, setFundNote] = useState<string | null>(null);

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
   * Zalozenie Aska.
   *
   * Autorem jest PODLACZONY PORTFEL, nigdy adres wpisany w formularzu - ten sam
   * powod, dla ktorego trasy serwerowe czytaja tozsamosc z sesji, a nie z ciala
   * zadania. `resolve rate` musi dotyczyc tego, kto naprawde zalozyl Aska.
   *
   * NOWY ASK ZOSTAJE NA EKRANIE, nawet gdy lista sie nie wczytala. Odswiezenie
   * listy nie jest tu wiarygodne: `getOpenAsks` wymaga indeksu zlozonego, ktory
   * czeka jeszcze na `firebase deploy` (firestore.indexes.json), wiec probowanie
   * "przeladuj i zobacz swoj Ask" skonczyloby sie ekranem awarii tuz po udanym
   * zapisie. Trzymamy wiec to, co WIEMY, ze powstalo - bez zgadywania reszty.
   */
  /**
   * Dokladanie swiezo zalozonego Aska do listy "Posted from this device".
   *
   * Wyciagniete z `handleCreate`, bo obie sciezki (escrow i bez) konczyly sie
   * tym samym dwudziestolinijkowym literalem, a rozjazd miedzy nimi znaczylby
   * karte pokazujaca co innego niz to, co zapisano.
   */
  const pushCreated = useCallback(
    (input: {
      id: string;
      author: string;
      question: string;
      budget: number;
      seats: number;
      perAnswer: number;
      deadlineMs: number;
      funding: Ask['funding'];
      escrowTxHash: string | null;
    }) => {
      setCreated((previous) => [
        {
          id: input.id,
          author: input.author,
          question: input.question,
          budget: input.budget,
          seats: input.seats,
          perAnswer: input.perAnswer,
          // Te dwie wartosci sa domyslne w `createAsk` - gdy tam sie zmienia,
          // zmieniaja sie i tutaj, bo karta ma pokazywac to, co zapisano.
          token: 'USDC',
          network: 'base',
          deadline: input.deadlineMs,
          createdAt: Date.now(),
          status: 'open',
          funding: input.funding,
          answerCount: 0,
          acceptedCount: 0,
          escrowTxHash: input.escrowTxHash,
          escrowChainId: input.funding === 'escrowed' ? ESCROW_CHAIN_ID : null,
        },
        ...previous,
      ]);
      setComposerOpen(false);
      setOpenAskId(input.id);
    },
    []
  );

  const handleCreate = useCallback(
    async (draft: AskDraft) => {
      if (!walletAddress) {
        throw new Error('Connect your wallet to post an Ask.');
      }

      const author = normalizeAddress(walletAddress);
      const perAnswer = perAnswerFor(draft.budget, draft.seats);
      /**
       * Termin liczony RAZ i uzyty w obu miejscach - w kontrakcie i w
       * dokumencie. Policzony dwa razy rozjechalby sie o czas approve i fund.
       */
      const deadlineMs = Date.now() + draft.durationMs;

      let escrowTxHash: string | null = null;

      /* ---------------- ESCROW: LANCUCH PRZED FIRESTORE ---------------- */
      if (draft.funding === 'escrowed') {
        setFundNote(null);

        // Portfel musi byc na sieci, na ktorej stoi kontrakt. Pytamy o zmiane
        // ZANIM cokolwiek podpiszemy - odmowa konczy sie tu, bez transakcji.
        if (chainId !== ESCROW_CHAIN_ID) {
          try {
            // switchChainAsync, nie switchChain: wariant synchroniczny nie
            // odrzuca obietnicy, wiec odmowa przechodzilaby jako sukces.
            await switchChainAsync({ chainId: ESCROW_CHAIN_ID });
          } catch {
            throw new Error(
              'Escrow lives on Base and your wallet stayed on another network. Nothing was charged.'
            );
          }
        }

        if (!publicClient) {
          throw new Error('We could not reach Base to check the escrow. Nothing was charged — try again.');
        }

        let signer;
        try {
          signer = await getWalletClient(config, { chainId: ESCROW_CHAIN_ID });
        } catch {
          throw new Error('Your wallet is not ready to sign on Base. Nothing was charged — try again.');
        }

        // Identyfikator nadany PRZED transakcja: to on jest askId na lancuchu.
        // Dokument pod nim powstanie dopiero, gdy pieniadze beda juz zablokowane.
        const reservedId = newAskId();

        try {
          const result = await fundAsk({
            reader: publicClient,
            signer,
            chainId: ESCROW_CHAIN_ID,
            author,
            askDocId: reservedId,
            perAnswer,
            seats: draft.seats,
            deadlineMs,
            onPhase: (phase: FundPhase) => setFundNote(FUND_PHASE_NOTES[phase]),
          });
          escrowTxHash = result.fundTxHash;
        } catch (error) {
          console.error('[asks] Zablokowanie budzetu nie powiodlo sie:', error);
          setFundNote(null);
          // Surowy revert nie jest komunikatem - patrz describeEscrowError.
          throw new Error(describeEscrowError(error));
        }

        setFundNote('Budget locked. Writing the Ask…');

        let id: string;
        try {
          id = await createAsk({
            id: reservedId,
            author,
            question: draft.question,
            budget: draft.budget,
            seats: draft.seats,
            durationMs: draft.durationMs,
            deadlineMs,
            funding: 'escrowed',
            escrowTxHash,
            escrowChainId: ESCROW_CHAIN_ID,
          });
        } catch (error) {
          console.error('[asks] Zapis Aska po zablokowaniu budzetu nie powiodl sie:', error);
          setFundNote(null);
          // NAJGORSZY MOMENT TEJ SCIEZKI: pieniadze SA JUZ na kontrakcie, a
          // dokumentu nie ma. Milczenie zostawiloby czlowieka z zablokowana
          // kwota i bez zadnego sladu - dlatego podajemy hash i mowimy, ze
          // srodki nie przepadly.
          throw new Error(
            `Your budget is locked in escrow (${escrowTxHash}) but writing the Ask failed. ` +
              'Keep that transaction hash - the money is in the contract and comes back to you ' +
              '48 hours after the deadline, minus the fee. Nothing was lost.'
          );
        }

        setFundNote(null);
        pushCreated({
          id,
          author,
          question: draft.question,
          budget: draft.budget,
          seats: draft.seats,
          perAnswer,
          deadlineMs,
          funding: 'escrowed',
          escrowTxHash,
        });
        return;
      }

      /* ---------------- BEZ ESCROW: jak dotad ---------------- */
      let id: string;
      try {
        id = await createAsk({
          author,
          question: draft.question,
          budget: draft.budget,
          seats: draft.seats,
          durationMs: draft.durationMs,
          deadlineMs,
        });
      } catch (error) {
        console.error('[asks] Zalozenie Aska nie powiodlo sie:', error);
        // Surowy komunikat Firestore nie jest zdaniem dla czlowieka. Mowimy
        // jednak wprost to, co najwazniejsze: nic nie zostalo pobrane.
        throw new Error('The Ask was not created. Nothing was charged — try again.');
      }

      pushCreated({
        id,
        author,
        question: draft.question,
        budget: draft.budget,
        seats: draft.seats,
        perAnswer,
        deadlineMs,
        funding: 'on-resolve',
        escrowTxHash: null,
      });
    },
    // pushCreated jest stabilny (useCallback bez zaleznosci), wiec nie musi tu byc.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [walletAddress, chainId, publicClient, config, switchChainAsync]
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

  /**
   * Czy w ogole mozna zalozyc Aska z escrow.
   *
   * Dwa warunki i oba sa twarde: musi istniec wdrozenie na Base (pliki
   * deployments/) i musi byc podlaczony portfel, ktory to podpisze. Pokazanie
   * wyboru bez ktoregokolwiek z nich konczyloby sie surowym bledem PO klikinieciu
   * w przycisk obiecujacy zablokowanie budzetu.
   */
  const escrowAvailable = isEscrowAvailable(ESCROW_CHAIN_ID) && !!walletAddress;
  const feeBps = useMemo(() => escrowFeeBps(ESCROW_CHAIN_ID), []);

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
        <header className="mb-7">
          <h1 className="mb-3 font-soft-display text-[30px] font-bold leading-[1.1] tracking-[-0.02em] text-soft-ink sm:text-[38px]">
            Open asks
          </h1>
          <p className="mb-2 text-[14.5px] leading-[1.65] text-soft-ink-muted">
            An Ask is a question with a budget, a number of seats and a deadline. Answers stay
            sealed until the author resolves — you see how many arrived, never what they say.
          </p>
          {/* Zdanie o tym, co DZIALA - i tylko o tym. Escrow wolno tu wymienic
              dopiero od chwili, gdy kontrakt jest naprawde podpiety (approve +
              fund przed zapisem, patrz handleCreate). Kluczowe jest slowo
              "can": oba warianty istnieja i to autor wybiera, wiec zdanie nie
              moze obiecywac escrow przy KAZDYM Asku. Kazda karta mowi o sobie
              osobno (AskCard, sekcja `funding`). */}
          <p className="text-[12.5px] leading-[1.6] text-soft-ink-faint">
            Post one with your wallet, answer someone else&apos;s, and pay for what you accept. An
            author can lock the whole budget in an escrow contract up front, or pay each accepted
            answer from their own wallet — every card says which one it is.{' '}
            <Link
              href="/re-definition#ask"
              className="font-semibold text-soft-primary-deep underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
            >
              How an Ask works
            </Link>
          </p>
        </header>

        {/* ================= DO ODBIORU =================
            Stoi NAD lista, bo dotyczy pieniedzy, ktore juz naleza do patrzacego
            i o ktorych nie dowie sie znikad indziej - resolve() przypisuje
            salda, nie wysyla tokenow. Panel milczy, gdy nie ma czego odebrac,
            ale NIE milczy, gdy odczytu nie udalo sie wykonac. */}
        <AskClaimPanel className="mb-7" />

        {/* ================= ZAKLADANIE ================= */}
        <section className="mb-7">
          {composerOpen ? (
            <AskComposer
              onSubmit={handleCreate}
              onCancel={() => setComposerOpen(false)}
              disabled={!walletAddress}
              disabledReason="Connect your wallet to post an Ask."
              escrowAvailable={escrowAvailable}
              escrowUnavailableReason={
                walletAddress
                  ? 'Escrow is not available on this network, so this Ask holds nothing up front.'
                  : 'Connect your wallet to lock a budget in escrow.'
              }
              escrowFeeBps={feeBps}
              progressNote={fundNote}
            />
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-soft-line bg-soft-surface p-4 shadow-card sm:p-5">
              <div className="min-w-0 flex-1">
                <h2 className="font-soft-display text-[15px] font-bold text-soft-ink">
                  Need something judged?
                </h2>
                <p className="mt-0.5 break-words text-[12.5px] leading-[1.5] text-soft-ink-muted">
                  {!walletAddress
                    ? 'Connect your wallet to post an Ask.'
                    : escrowAvailable
                      ? 'Set a budget, seats and a deadline — and choose whether to lock the budget in escrow now.'
                      : 'Set a budget, seats and a deadline. You pay only the answers you accept.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setComposerOpen(true)}
                className="shrink-0 rounded-lg bg-soft-primary px-4 py-2 font-soft-display text-[13px] font-semibold text-white transition-transform duration-150 ease-out active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary focus-visible:ring-offset-2 focus-visible:ring-offset-soft-surface"
              >
                Ask something
              </button>
            </div>
          )}
        </section>

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
              This is a failed read, not an empty list. There may well be open asks — we just could
              not reach them.
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
            <p className="text-[13.5px] leading-[1.6] text-soft-ink-muted">
              No one has an open Ask at this moment. When someone does, their question, budget,
              seats and countdown show up here.
            </p>
          </div>
        )}

        {phase === 'ready' && listed.length > 0 && (
          <div className="flex flex-col gap-4">{listed.map(renderAsk)}</div>
        )}
      </div>
      {/* Wyjscie z tej strony na telefonie. Dolny pasek feedu jest jego
          wewnetrznym przelacznikiem paneli i tu nie dziala - bez tego /asks
          bylo na telefonie slepym zaulkiem: gorna belka chowa sie pod
          hamburgerem, wiec droga powrotna istniala, ale nie bylo jej widac. */}
      <MobileBottomNav />
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
  isAuthor,
  isSignedIn,
  onSignIn,
  onPatch,
  onClose,
}: {
  ask: Ask;
  viewer: string | null;
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
      setSendError('The answer was not sent. Nothing was stored — try again.');
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

      const data = (await response.json()) as { acceptedCount?: unknown };
      if (typeof data.acceptedCount === 'number') {
        onPatch(ask.id, { acceptedCount: data.acceptedCount });
      }
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
    ? 'The 48-hour window for resolving after the deadline has closed. Nobody can be awarded from this escrow any more — the budget only goes back to you, minus the fee.'
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
        throw new Error('Your wallet is not ready to sign yet. Nothing changed — try again.');
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
      setResolveError('This Ask was not resolved. Nothing changed — try again.');
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
                Sign in with your wallet to answer. Your answer stays sealed — only the author can
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
                    You write before you are paid. Nothing is held in escrow — check the author&apos;s
                    resolve record on the card above before you spend time on this.
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
                    Sealed. It exists — you just cannot read it.
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
            the same transaction — you will not pay twice.
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
                picked, but this Ask is not marked resolved yet. Retrying only writes the record — it
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
            after accepting at least one answer — resolving means you paid.
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

  const load = useCallback(async () => {
    if (!publicClient) return;
    setPhase('loading');
    try {
      const result = await readEscrow(publicClient, ESCROW_CHAIN_ID, ask.author, ask.id);
      if (!mountedRef.current) return;
      setState(result);
      setPhase('ready');
    } catch (error) {
      console.error('[asks] Odczyt escrow nie powiodl sie:', error);
      if (!mountedRef.current) return;
      setPhase('failed');
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
          We could not reach the escrow contract. This is a failed read — it is not proof that
          nothing is locked, and it is not proof that something is.
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
      <div className={`${box} border-soft-accent/40 bg-soft-accent-soft`}>
        <p className="break-words text-[12px] leading-[1.5] text-soft-accent-deep">
          This Ask says it is escrowed, but the contract holds nothing under it. Treat it as
          unfunded: do not spend time on an answer expecting a locked payout.
        </p>
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
          contract is the one that pays — believe it, not the card.
        </p>
      )}
    </div>
  );
}

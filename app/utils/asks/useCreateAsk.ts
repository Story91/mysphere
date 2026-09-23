'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { useAccount, useChainId, useConfig, usePublicClient, useSwitchChain } from 'wagmi';
import { getWalletClient } from 'wagmi/actions';
import { base } from 'wagmi/chains';
import { newAskId } from './asks';
import {
  CREATE_RETRY_LIMIT,
  PENDING_ESCROW_STORAGE_KEY,
  createRetryDelayMs,
  isDefinitiveEscrowRefusal,
  isRetryableCreateRefusal,
  parsePendingEscrows,
  pendingEscrowFor,
  withPendingEscrow,
  withoutPendingEscrow,
  type PendingEscrow,
  type PendingEscrowMap,
} from './askCreateCore';
import { perAnswerFor, type Ask, type AskFunding } from './types';
import {
  describeEscrowError,
  escrowFeeBps,
  fundAsk,
  isEscrowAvailable,
  type FundPhase,
} from './escrow';
import { normalizeAddress } from '../monetization/types';
import useSiweAuth from '../auth/useSiweAuth';
import { MAX_QUESTION_LENGTH } from '../../api/asks/pricing';

/**
 * ZAKLADANIE ASKA - cala droga pieniedzy w jednym miejscu.
 *
 * === DLACZEGO TO JEST HOOK, A NIE KOD W STRONIE ===
 * Aska da sie zalozyc z /asks i z glownego feedu. To sa dwa ekrany, ale JEDNA
 * sciezka pieniedzy: approve -> fund -> czekanie na kwit -> dopiero zapis.
 * Obie strony wolaja ten hook - druga kopia tej sekwencji w AsksContent
 * zniknela, bo kazda poprawka musialaby trafic w dwa pliki, a pomylka
 * w kolejnosci konczy sie dokumentem obiecujacym srodki, ktorych nie ma.
 *
 * === ZAPIS ROBI SERWER (POST /api/asks/create) ===
 * Przegladarka nie pisze juz do `asks`. Serwer bierze autora z sesji SIWE,
 * a przy escrow sprawdza log AskFunded w paragonie fund - dopiero wtedy Ask
 * powstaje razem z zapieczetowanym stanem. Dlatego:
 *
 * === TEJ KOLEJNOSCI NIE WOLNO ZMIENIC ===
 *   0. logowanie SIWE              (PRZED pieniedzmi - bez sesji zapis padnie
 *                                   dopiero po depozycie)
 *   1. portfel na Base             (bez tego kontraktu po prostu tam nie ma)
 *   2. identyfikator z gory        (newAskId - to on jest askId na lancuchu)
 *   3. approve na DOKLADNY budzet
 *   4. fund + czekanie na kwit     (fundAsk wraca po potwierdzeniu, nie wczesniej)
 *   5. zapamietanie depozytu       (ref + localStorage, klucz = autor)
 *   6. POST /api/asks/create       (ponowienia, gdy RPC serwera jeszcze nie
 *                                   widzi paragonu)
 *
 * === NAJGORSZY MOMENT ===
 * Krok 6 moze sie nie udac po udanym kroku 4. Pieniadze SA wtedy na
 * kontrakcie, a Aska nie ma. Depozyt jest zapamietany pod adresem autora,
 * wiec nastepne "Post" z escrow NIE placi drugi raz - zapisuje ten depozyt
 * (jego warunkami), nawet gdy tresc pytania sie zmienila. Odcisk szkicu jako
 * klucz konczyl sie drugim depozytem po poprawce jednego slowa. Blad niesie
 * hash `fund` i mowi wprost, ze srodki wracaja po terminie.
 *
 * === CO ZOSTALO POZA ===
 * Hook nie zna zadnego formularza ani widoku - dostaje gotowy szkic i oddaje
 * `Ask`, ktorego zapis potwierdzil serwer. Wolajacy decyduje, gdzie go pokazac.
 */

/** Siec escrow. Ta sama, w ktorej placi usePaymentFlow - jedyna z rodziny Base w wagmi. */
export const ASK_ESCROW_CHAIN_ID = base.id;

/**
 * Co powiedziec przy kazdym etapie blokowania budzetu.
 *
 * Escrow to dwa okna portfela pod rzad i kilkanascie sekund ciszy miedzy nimi.
 * Bez nazwania ich drugie okno wyglada jak awaria albo jak proba pobrania
 * pieniedzy drugi raz.
 */
const FUND_PHASE_NOTES: Record<FundPhase, string> = {
  'checking-allowance': 'Checking how much USDC the escrow contract may take…',
  approving: 'Approve the exact budget in your wallet. This does not move it yet.',
  funding: 'Now confirm the deposit. This is the transaction that locks the money.',
};

/**
 * Szkic z formularza. Opisany STRUKTURALNIE, a nie importem `AskDraft`:
 * dzieki temu warstwa danych nie ciagnie za soba komponentu z 'use client',
 * a `AskComposer` i tak pasuje tu bez zadnej konwersji.
 */
export type AskDraftInput = {
  question: string;
  budget: number;
  seats: number;
  durationMs: number;
  funding: AskFunding;
};

export type UseCreateAskResult = {
  /** Rzuca bledem z gotowym zdaniem dla czlowieka. Oddaje Aska, ktory powstal. */
  submit: (draft: AskDraftInput) => Promise<Ask>;
  /** Co sie wlasnie dzieje (podpis, lancuch, zapis). `null` = nic nie trwa. */
  progressNote: string | null;
  /** Czy w ogole da sie zablokowac budzet: wdrozenie na Base + podlaczony portfel. */
  escrowAvailable: boolean;
  /** Dlaczego nie da sie - zdanie dla czlowieka, gotowe do pokazania. */
  escrowUnavailableReason: string;
  /** Ile procent zabiera kontrakt od budzetu WRACAJACEGO do autora. `null` = nie wiemy. */
  feeBps: number | null;
  walletConnected: boolean;
};

/* ------------------------------------------------------------------ */
/*  ZAPIS PRZEZ SERWER                                                 */
/* ------------------------------------------------------------------ */

type CreateBody =
  | { funding: 'on-resolve'; question: string; budget: number; seats: number; durationMs: number }
  | {
      funding: 'escrowed';
      askId: string;
      fundTxHash: string;
      question: string;
      budget: number;
      seats: number;
      deadlineMs: number;
    };

type CreateResult =
  /** created: true - nowy zapis, false - ten Ask juz byl (idempotentne 200), null - serwer nie powiedzial. */
  | { ok: true; ask: Ask; created: boolean | null }
  | { ok: false; status: number; code: string | null; error: string };

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Jedna proba. Rzuca TYLKO przy bledzie sieci (fetch nie doszedl albo nie wrocil). */
async function postCreate(body: CreateBody): Promise<CreateResult> {
  const response = await fetch('/api/asks/create', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  let data: Record<string, unknown> = {};
  try {
    data = (await response.json()) as Record<string, unknown>;
  } catch {
    // odpowiedz bez JSON - zostaje pusty obiekt i zdanie zastepcze nizej
  }

  const ask = data.ask as Ask | undefined;
  if (response.ok && ask && typeof ask.id === 'string' && ask.id !== '') {
    return { ok: true, ask, created: typeof data.created === 'boolean' ? data.created : null };
  }
  return {
    ok: false,
    status: response.status,
    code: typeof data.code === 'string' ? data.code : null,
    error:
      typeof data.error === 'string' && data.error.trim() !== ''
        ? data.error
        : `The server answered ${response.status}.`,
  };
}

type CreateAvailability = { ok: true } | { ok: false; status: number; code: string | null; error: string };

/**
 * GET /api/asks/create: czy to wdrozenie zapisze Aska dla tej sesji. Pytamy
 * PRZED depozytem - 503 po depozycie zostawia pieniadze w kontrakcie bez Aska
 * (i bez przycisku Recover na /money). Blad sieci to tez "nie" - lepiej nie
 * zablokowac budzetu niz zablokowac go w ciemno.
 */
async function checkCreateAvailable(): Promise<CreateAvailability> {
  try {
    const response = await fetch('/api/asks/create', {
      method: 'GET',
      cache: 'no-store',
      credentials: 'include',
    });
    if (response.ok) return { ok: true };
    let data: Record<string, unknown> = {};
    try {
      data = (await response.json()) as Record<string, unknown>;
    } catch {
      // odpowiedz bez JSON - zdanie zastepcze nizej
    }
    return {
      ok: false,
      status: response.status,
      code: typeof data.code === 'string' ? data.code : null,
      error:
        typeof data.error === 'string' && data.error.trim() !== ''
          ? data.error
          : `The server answered ${response.status}.`,
    };
  } catch (error) {
    console.warn('[asks] Sprawdzenie zapisu Aska nie dotarlo do serwera:', error);
    return { ok: false, status: 0, code: 'network_error', error: 'We could not reach the server.' };
  }
}

/**
 * Zapis z ponowieniami. Ponawiamy WYLACZNIE to, co wolno powtorzyc:
 * - fund_not_visible - RPC serwera nie widzi jeszcze paragonu, ktory portfel
 *   juz potwierdzil (zwykle sekundy),
 * - blad sieci, ale tylko gdy `retryNetwork`: zapis escrow jest idempotentny
 *   (to samo id i ten sam fund -> 200), zapis on-resolve NIE (id nadaje
 *   serwer), wiec tam ponowienie mogloby postawic to samo pytanie dwa razy.
 * 401 dostaje jedno ponowne logowanie - sesja mogla wygasnac miedzy
 * podpisem a zapisem.
 */
async function recordAsk(
  body: CreateBody,
  opts: {
    retryNetwork: boolean;
    signInAgain: () => Promise<boolean>;
    onWaiting: () => void;
  }
): Promise<CreateResult> {
  let signedInAgain = false;
  for (let retry = 0; ; retry += 1) {
    let result: CreateResult;
    try {
      result = await postCreate(body);
    } catch (error) {
      console.warn('[asks] Zapis Aska nie dotarl do serwera:', error);
      result = { ok: false, status: 0, code: 'network_error', error: 'We could not reach the server.' };
      if (!opts.retryNetwork || retry >= CREATE_RETRY_LIMIT) return result;
      opts.onWaiting();
      await sleep(createRetryDelayMs(retry + 1));
      continue;
    }

    if (result.ok) return result;

    if (result.status === 401 && !signedInAgain) {
      signedInAgain = true;
      if (await opts.signInAgain()) continue;
      return result;
    }

    if (!isRetryableCreateRefusal(result.code) || retry >= CREATE_RETRY_LIMIT) return result;
    opts.onWaiting();
    await sleep(createRetryDelayMs(retry + 1));
  }
}

/* ------------------------------------------------------------------ */
/*  ZAPAMIETANY DEPOZYT                                                */
/* ------------------------------------------------------------------ */

// localStorage bywa niedostepny (tryb prywatny, zablokowane dane strony) -
// kazdy odczyt i zapis w try/catch. Ref w hooku trzyma kopie na czas zycia
// strony, wiec nawet bez localStorage ponowne "Post" nie placi drugi raz.
function readStoredPending(): PendingEscrowMap {
  try {
    return parsePendingEscrows(window.localStorage.getItem(PENDING_ESCROW_STORAGE_KEY));
  } catch {
    return {};
  }
}

function writeStoredPending(map: PendingEscrowMap): boolean {
  try {
    if (Object.keys(map).length === 0) window.localStorage.removeItem(PENDING_ESCROW_STORAGE_KEY);
    else window.localStorage.setItem(PENDING_ESCROW_STORAGE_KEY, JSON.stringify(map));
    return true;
  } catch (error) {
    console.warn('[asks] Nie udalo sie zapamietac depozytu w localStorage:', error);
    return false;
  }
}

/* ------------------------------------------------------------------ */
/*  HOOK                                                               */
/* ------------------------------------------------------------------ */

export function useCreateAsk(): UseCreateAskResult {
  const { address: walletAddress } = useAccount();
  const chainId = useChainId();
  /**
   * Sesja SIWE - tozsamosc dla serwera. Adres z wagmi mowi tylko, jaki portfel
   * jest podlaczony; POST /api/asks/create bierze autora z podpisanej sesji.
   */
  const { address: sessionAddress, isAuthenticated, signIn } = useSiweAuth();
  /**
   * Klient przypiety do Base, a nie do "aktualnej" sieci: gdyby portfel siedzial
   * gdzie indziej, odczyt allowance szedlby na lancuch, na ktorym kontraktu nie
   * ma - i wygladaloby to jak awaria, a nie jak zla siec.
   */
  const publicClient = usePublicClient({ chainId: ASK_ESCROW_CHAIN_ID });
  /**
   * Konfiguracja, a nie `useWalletClient()`. Klient z hooka jest zamrozony w
   * domknieciu w chwili tworzenia handlera, wiec po `switchChainAsync`
   * wskazywalby WCIAZ na poprzedni lancuch i viem odrzucalby podpis z
   * ChainMismatchError - tuz po tym, jak czlowiek zgodzil sie na zmiane sieci.
   */
  const config = useConfig();
  const { switchChainAsync } = useSwitchChain();

  const [progressNote, setProgressNote] = useState<string | null>(null);

  /**
   * Depozyty, ktore sa na kontrakcie, a nie maja jeszcze Aska - klucz = autor.
   * Ref, nie stan: to nie jest nic do narysowania, a zmiana nie moze
   * przebudowywac `submit` w trakcie trwajacego zapisu.
   */
  const pendingRef = useRef<PendingEscrowMap>({});

  const escrowAvailable = isEscrowAvailable(ASK_ESCROW_CHAIN_ID) && !!walletAddress;
  const feeBps = useMemo(() => escrowFeeBps(ASK_ESCROW_CHAIN_ID), []);

  const escrowUnavailableReason = walletAddress
    ? 'Escrow is not available on this network, so this Ask holds nothing up front.'
    : 'Connect your wallet to lock a budget in escrow.';

  const submit = useCallback(
    async (draft: AskDraftInput): Promise<Ask> => {
      if (!walletAddress) {
        throw new Error('Connect your wallet to post an Ask.');
      }

      /**
       * Autorem jest PODLACZONY PORTFEL potwierdzony sesja SIWE, nigdy adres
       * wpisany w formularzu. `resolve rate` musi dotyczyc tego, kto naprawde
       * zalozyl.
       */
      const author = normalizeAddress(walletAddress);

      // Serwer odrzuca pytanie dluzsze niz MAX_QUESTION_LENGTH (po trim) - przy
      // escrow dowiedzielibysmy sie o tym dopiero PO depozycie.
      const questionLength = draft.question.trim().length;
      if (questionLength === 0) {
        throw new Error('Write the question first. Nothing was charged.');
      }
      if (questionLength > MAX_QUESTION_LENGTH) {
        throw new Error(
          `Keep the question under ${MAX_QUESTION_LENGTH} characters (it has ${questionLength}). Nothing was charged.`
        );
      }

      /* ---------------- 0. SESJA PRZED PIENIEDZMI ---------------- */
      // Bez sesji (albo z sesja innego konta) serwer odrzuci zapis - a przy
      // escrow dowiedzielibysmy sie o tym dopiero PO depozycie.
      if (!isAuthenticated || sessionAddress !== author) {
        setProgressNote('Sign the sign-in message in your wallet. It costs nothing.');
        const signedIn = await signIn();
        setProgressNote(null);
        if (!signedIn) {
          throw new Error('Sign in with your wallet to post an Ask. Nothing was charged.');
        }
      }

      const recordOptions = (retryNetwork: boolean) => ({
        retryNetwork,
        signInAgain: async () => {
          setProgressNote('Your sign-in expired. Sign again in your wallet - nothing is charged.');
          const ok = await signIn();
          setProgressNote(null);
          return ok;
        },
        onWaiting: () => setProgressNote('Waiting for Base to show the deposit to our server…'),
      });

      /* ---------------- ESCROW ---------------- */
      if (draft.funding === 'escrowed') {
        setProgressNote(null);

        const remember = (entry: PendingEscrow): boolean => {
          pendingRef.current = withPendingEscrow(pendingRef.current, entry);
          return writeStoredPending(withPendingEscrow(readStoredPending(), entry));
        };
        const forget = () => {
          pendingRef.current = withoutPendingEscrow(pendingRef.current, author);
          writeStoredPending(withoutPendingEscrow(readStoredPending(), author));
        };

        /**
         * Zapis depozytu, ktory JUZ jest na kontrakcie. Warunki (id, kwota,
         * miejsca, termin) z zapamietanego depozytu - tylko one zgadzaja sie
         * z logiem AskFunded. Tresc pytania biezaca.
         */
        const recordPending = async (
          pending: PendingEscrow,
          persisted: boolean,
          fromEarlierPost: boolean
        ): Promise<Ask> => {
          const result = await recordAsk(
            {
              funding: 'escrowed',
              askId: pending.reservedId,
              fundTxHash: pending.fundTxHash,
              question: draft.question,
              budget: pending.budget,
              seats: pending.seats,
              deadlineMs: pending.deadlineMs,
            },
            recordOptions(true)
          );
          setProgressNote(null);

          if (result.ok) {
            forget();
            // Depozyt z wczesniejszego "Post" byl juz zapisany (np. z innej
            // przegladarki albo odpowiedz zginela po zapisie), a to "Post" niesie
            // INNE pytanie. Oddanie starego Aska jako nowego po cichu gubiloby
            // to pytanie - mowimy wprost, co sie stalo.
            if (
              fromEarlierPost &&
              result.created === false &&
              typeof result.ask.question === 'string' &&
              result.ask.question.trim() !== draft.question.trim()
            ) {
              throw new Error(
                `That earlier deposit is already recorded as Ask ${result.ask.id}, so this question was not posted. ` +
                  'Press Post again to lock a new budget for it.'
              );
            }
            return result.ask;
          }

          console.error('[asks] Zapis Aska po zablokowaniu budzetu nie powiodl sie:', result);
          if (isDefinitiveEscrowRefusal(result.code)) {
            // Ten depozyt nigdy nie stanie sie Askiem - zapominamy go, zeby
            // nastepne "Post" moglo zalozyc nowy. Pieniadze wracaja z kontraktu.
            forget();
            throw new Error(
              `Your budget is locked in escrow (${pending.fundTxHash}) but this Ask cannot be recorded: ${result.error} ` +
                'Keep that transaction hash - the money is in the contract and comes back to you ' +
                '48 hours after the deadline, minus the fee. Nothing was lost.'
            );
          }
          throw new Error(
            `Your budget is locked in escrow (${pending.fundTxHash}) but writing the Ask failed: ${result.error} ` +
              (persisted
                ? 'Press Post again from this browser to finish recording it - you will not be charged a second time.'
                : 'Press Post again without leaving this page to finish recording it - you will not be charged a second time.') +
              ' If it never records, the money comes back to you 48 hours after the deadline, minus the fee.'
          );
        };

        // Zapamietany depozyt tego autora? Wtedy ZADNEGO approve ani fund -
        // tylko dokonczenie zapisu. Najpierw ref (zyje, gdy localStorage nie
        // dziala), potem localStorage (przezywa przeladowanie strony).
        const pending =
          pendingEscrowFor(pendingRef.current, author) ?? pendingEscrowFor(readStoredPending(), author);
        if (pending) {
          setProgressNote('Recording the Ask you already paid for. No new deposit is needed.');
          return recordPending(pending, readStoredPending()[author] !== undefined, true);
        }

        // Czy to wdrozenie w ogole zapisze Aska - ZANIM cokolwiek podpiszemy.
        let availability = await checkCreateAvailable();
        if (!availability.ok && availability.status === 401) {
          setProgressNote('Your sign-in expired. Sign again in your wallet - nothing is charged.');
          const again = await signIn();
          setProgressNote(null);
          if (again) availability = await checkCreateAvailable();
        }
        if (!availability.ok) {
          console.error('[asks] Serwer nie przyjmie teraz Aska z escrow:', availability);
          throw new Error(`Your budget was not locked: ${availability.error} Nothing was charged.`);
        }

        // Zmiana sieci PRZED jakimkolwiek podpisem - odmowa konczy sie tutaj,
        // bez transakcji i bez zadnego zapisu.
        if (chainId !== ASK_ESCROW_CHAIN_ID) {
          try {
            // switchChainAsync, nie switchChain: wariant synchroniczny nie
            // odrzuca obietnicy, wiec odmowa przechodzilaby jako sukces.
            await switchChainAsync({ chainId: ASK_ESCROW_CHAIN_ID });
          } catch {
            throw new Error(
              'Escrow lives on Base and your wallet stayed on another network. Nothing was charged.'
            );
          }
        }

        if (!publicClient) {
          throw new Error(
            'We could not reach Base to check the escrow. Nothing was charged. Try again.'
          );
        }

        let signer;
        try {
          signer = await getWalletClient(config, { chainId: ASK_ESCROW_CHAIN_ID });
        } catch {
          throw new Error(
            'Your wallet is not ready to sign on Base. Nothing was charged. Try again.'
          );
        }

        const perAnswer = perAnswerFor(draft.budget, draft.seats);
        /**
         * Termin liczony RAZ i uzyty w obu miejscach - w kontrakcie i w zapisie.
         * Policzony dwa razy rozjechalby sie o czas approve i fund, a serwer
         * odrzuca szkic, ktory nie zgadza sie z logiem co do sekundy.
         */
        const deadlineMs = Date.now() + draft.durationMs;

        // Identyfikator nadany PRZED transakcja: to on jest askId na lancuchu.
        // Ask pod nim powstanie dopiero, gdy pieniadze beda juz zablokowane.
        const reservedId = newAskId();

        let fundTxHash: string;
        try {
          const result = await fundAsk({
            reader: publicClient,
            signer,
            chainId: ASK_ESCROW_CHAIN_ID,
            author,
            askDocId: reservedId,
            perAnswer,
            seats: draft.seats,
            deadlineMs,
            onPhase: (phase: FundPhase) => setProgressNote(FUND_PHASE_NOTES[phase]),
          });
          fundTxHash = result.fundTxHash;
        } catch (error) {
          console.error('[asks] Zablokowanie budzetu nie powiodlo sie:', error);
          setProgressNote(null);
          // Surowy revert nie jest komunikatem - patrz describeEscrowError.
          throw new Error(describeEscrowError(error));
        }

        // Depozyt zapamietany ZANIM pojdzie zapis: gdy zapis padnie albo karta
        // zostanie zamknieta, nastepne "Post" dokonczy ten, zamiast placic znowu.
        const entry: PendingEscrow = {
          author,
          reservedId,
          fundTxHash: fundTxHash.toLowerCase(),
          deadlineMs,
          budget: draft.budget,
          seats: draft.seats,
          question: draft.question,
          savedAt: Date.now(),
        };
        const persisted = remember(entry);

        setProgressNote('Budget locked. Writing the Ask…');
        return recordPending(entry, persisted, false);
      }

      /* ---------------- BEZ ESCROW: sam zapis ---------------- */
      setProgressNote('Posting the Ask…');
      const result = await recordAsk(
        {
          funding: 'on-resolve',
          question: draft.question,
          budget: draft.budget,
          seats: draft.seats,
          durationMs: draft.durationMs,
        },
        recordOptions(false)
      );
      setProgressNote(null);

      if (!result.ok) {
        console.error('[asks] Zalozenie Aska nie powiodlo sie:', result);
        if (result.code === 'network_error') {
          // Serwer mogl zapisac Aska, zanim zginela odpowiedz (id nadaje serwer,
          // wiec tego zapisu nie ponawiamy). "Nie powstal" byloby zgadywaniem,
          // a ponowny Post postawilby pytanie drugi raz.
          throw new Error(
            'We could not confirm the Ask was saved. Nothing was charged. Check the Asks list before posting it again.'
          );
        }
        // Mowimy wprost to, co najwazniejsze: nic nie zostalo pobrane.
        throw new Error(`The Ask was not created: ${result.error} Nothing was charged.`);
      }
      return result.ask;
    },
    [walletAddress, isAuthenticated, sessionAddress, signIn, chainId, publicClient, config, switchChainAsync]
  );

  return {
    submit,
    progressNote,
    escrowAvailable,
    escrowUnavailableReason,
    feeBps,
    walletConnected: !!walletAddress,
  };
}

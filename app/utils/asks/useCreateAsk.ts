'use client';

import { useCallback, useMemo, useState } from 'react';
import { useAccount, useChainId, useConfig, usePublicClient, useSwitchChain } from 'wagmi';
import { getWalletClient } from 'wagmi/actions';
import { base } from 'wagmi/chains';
import { createAsk, newAskId } from './asks';
import { perAnswerFor, type Ask, type AskFunding } from './types';
import {
  describeEscrowError,
  escrowFeeBps,
  fundAsk,
  isEscrowAvailable,
  type FundPhase,
} from './escrow';
import { normalizeAddress } from '../monetization/types';

/**
 * ZAKLADANIE ASKA - cala droga pieniedzy w jednym miejscu.
 *
 * === DLACZEGO TO JEST HOOK, A NIE KOD W STRONIE ===
 * Aska da sie dzis zalozyc z /asks, a od teraz takze z glownego feedu. To sa
 * dwa ekrany, ale JEDNA sciezka pieniedzy: approve -> fund -> czekanie na kwit
 * -> dopiero Firestore. Przepisanie jej drugi raz w feedzie znaczyloby, ze
 * kazda przyszla poprawka w kolejnosci albo w komunikatach musi trafic w dwa
 * pliki - a pomylka w tej kolejnosci konczy sie dokumentem, ktory obiecuje
 * zablokowane srodki, ktorych nie ma.
 *
 * === TEJ KOLEJNOSCI NIE WOLNO ZMIENIC ===
 * Przy `funding: 'escrowed'` lancuch idzie PRZED zapisem, zawsze:
 *
 *   1. portfel na Base            (bez tego kontraktu po prostu tam nie ma)
 *   2. identyfikator z gory       (newAskId - to on jest askId na lancuchu)
 *   3. approve na DOKLADNY budzet
 *   4. fund + czekanie na kwit    (fundAsk wraca po potwierdzeniu, nie wczesniej)
 *   5. createAsk w Firestore      (dopiero teraz slowo 'escrowed' ma pokrycie)
 *
 * Odwrocenie 4 i 5 dawaloby dokument mowiacy "budzet zablokowany" w chwili,
 * w ktorej nikt jeszcze niczego nie zablokowal.
 *
 * === NAJGORSZY MOMENT ===
 * Krok 5 moze sie nie udac po udanym kroku 4. Pieniadze SA wtedy na kontrakcie, a
 * dokumentu nie ma. Milczenie zostawiloby czlowieka z zablokowana kwota i bez
 * zadnego sladu, dlatego blad niesie hash `fund` i mowi wprost, ze srodki
 * wracaja po terminie. To jedyny komunikat w tym pliku, ktory MUSI zawierac
 * liczbe z lancucha.
 *
 * === CO ZOSTALO POZA ===
 * Hook nie zna zadnego formularza ani zadnego widoku - dostaje gotowy szkic
 * i oddaje `Ask`, ktory naprawde powstal. Wolajacy decyduje, gdzie go pokazac.
 *
 * === STAN PRZEJSCIOWY: /asks MA WLASNA KOPIE ===
 * Ta sama sekwencja stoi jeszcze inline w `app/asks/page.tsx` (handleCreate).
 * Tamten plik jest w tej fazie zamkniety dla zmian, wiec kopia zostaje - ale
 * przy pierwszym dotknieciu /asks ma zostac przepiete na ten hook, a nie
 * poprawione rownolegle. Dwie kopie sciezki pieniedzy to stan tymczasowy i
 * tak ma byc opisany.
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
  /** Co sie wlasnie dzieje na lancuchu. `null` = nic nie trwa. */
  progressNote: string | null;
  /** Czy w ogole da sie zablokowac budzet: wdrozenie na Base + podlaczony portfel. */
  escrowAvailable: boolean;
  /** Dlaczego nie da sie - zdanie dla czlowieka, gotowe do pokazania. */
  escrowUnavailableReason: string;
  /** Ile procent zabiera kontrakt od budzetu WRACAJACEGO do autora. `null` = nie wiemy. */
  feeBps: number | null;
  walletConnected: boolean;
};

export function useCreateAsk(): UseCreateAskResult {
  const { address: walletAddress } = useAccount();
  const chainId = useChainId();
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
       * Autorem jest PODLACZONY PORTFEL, nigdy adres wpisany w formularzu - ten
       * sam powod, dla ktorego trasy serwerowe czytaja tozsamosc z sesji, a nie
       * z ciala zadania. `resolve rate` musi dotyczyc tego, kto naprawde zalozyl.
       */
      const author = normalizeAddress(walletAddress);
      const perAnswer = perAnswerFor(draft.budget, draft.seats);
      /**
       * Termin liczony RAZ i uzyty w obu miejscach - w kontrakcie i w dokumencie.
       * Policzony dwa razy rozjechalby sie o czas approve i fund.
       */
      const deadlineMs = Date.now() + draft.durationMs;

      /* ---------------- ESCROW: LANCUCH PRZED FIRESTORE ---------------- */
      if (draft.funding === 'escrowed') {
        setProgressNote(null);

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

        // Identyfikator nadany PRZED transakcja: to on jest askId na lancuchu.
        // Dokument pod nim powstanie dopiero, gdy pieniadze beda juz zablokowane.
        const reservedId = newAskId();

        let escrowTxHash: string;
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
          escrowTxHash = result.fundTxHash;
        } catch (error) {
          console.error('[asks] Zablokowanie budzetu nie powiodlo sie:', error);
          setProgressNote(null);
          // Surowy revert nie jest komunikatem - patrz describeEscrowError.
          throw new Error(describeEscrowError(error));
        }

        setProgressNote('Budget locked. Writing the Ask…');

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
            escrowChainId: ASK_ESCROW_CHAIN_ID,
          });
        } catch (error) {
          console.error('[asks] Zapis Aska po zablokowaniu budzetu nie powiodl sie:', error);
          setProgressNote(null);
          // NAJGORSZY MOMENT TEJ SCIEZKI - patrz naglowek pliku.
          throw new Error(
            `Your budget is locked in escrow (${escrowTxHash}) but writing the Ask failed. ` +
              'Keep that transaction hash - the money is in the contract and comes back to you ' +
              '48 hours after the deadline, minus the fee. Nothing was lost.'
          );
        }

        setProgressNote(null);
        return buildAsk({
          id,
          author,
          draft,
          perAnswer,
          deadlineMs,
          funding: 'escrowed',
          escrowTxHash,
        });
      }

      /* ---------------- BEZ ESCROW: sam zapis ---------------- */
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
        throw new Error('The Ask was not created. Nothing was charged. Try again.');
      }

      return buildAsk({
        id,
        author,
        draft,
        perAnswer,
        deadlineMs,
        funding: 'on-resolve',
        escrowTxHash: null,
      });
    },
    [walletAddress, chainId, publicClient, config, switchChainAsync]
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

/**
 * Ask, ktory WLASNIE powstal - zlozony z tego, co poszlo do zapisu.
 *
 * Nie odczytujemy dokumentu z powrotem i to jest swiadome: odczyt kosztuje, a
 * kazde pole ponizej znamy juz na pewno. `token` i `network` sa domyslne w
 * `createAsk` - gdy tam sie zmienia, musza zmienic sie i tutaj, bo karta ma
 * pokazywac to, co naprawde zapisano.
 */
function buildAsk(input: {
  id: string;
  author: string;
  draft: AskDraftInput;
  perAnswer: number;
  deadlineMs: number;
  funding: AskFunding;
  escrowTxHash: string | null;
}): Ask {
  return {
    id: input.id,
    author: input.author,
    question: input.draft.question,
    budget: input.draft.budget,
    seats: input.draft.seats,
    perAnswer: input.perAnswer,
    token: 'USDC',
    network: 'base',
    deadline: input.deadlineMs,
    createdAt: Date.now(),
    status: 'open',
    funding: input.funding,
    answerCount: 0,
    acceptedCount: 0,
    escrowTxHash: input.escrowTxHash,
    escrowChainId: input.funding === 'escrowed' ? ASK_ESCROW_CHAIN_ID : null,
  };
}

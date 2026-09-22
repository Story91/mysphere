'use client';

/**
 * Przycisk "postuj na Solanie".
 *
 * Kontrakt propsow jest TEN SAM co w `ChainPostButton` (ChainPostButtonProps),
 * dzieki czemu wspolny composer podmienia jeden na drugi bez zadnej wiedzy o
 * tym, ktory lancuch obsluguje. Wszystko ponizej to ta sama sciezka co w EVM -
 * tylko na innym stacku portfela:
 *
 *   EVM                      Solana
 *   useAccount()             useWallet()
 *   switchChain()            (nie istnieje - klaster ustala provider)
 *   writeContract()          sendTransaction()
 *   waitForReceipt()         confirmTransaction()
 *   txHash 0x...             signature base58
 *
 * CZEGO TEN PRZYCISK NIE ROBI: nie dotyka tozsamosci. Autorem posta pozostaje
 * adres EVM z wagmi (`author` w dokumencie Firestore) - portfel Solany sluzy
 * wylacznie do podpisania kwitu. Zmiana tego wymagalaby przepisania logowania,
 * profili, followow, tipow i rankingu, ktore w calosci stoja na adresie 0x.
 */

import { useCallback, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { PublicKey, Transaction, TransactionInstruction, type Connection } from '@solana/web3.js';
// Jawny import z 'buffer', a NIE globalny `Buffer`: w bundlu przegladarkowym
// Next.js nie definiuje globalnego Buffera, wiec `Buffer.from(...)` wywalaloby
// sie dopiero w runtime ("Buffer is not defined"), juz po podpisie uzytkownika.
// Pakiet 'buffer' i tak lezy w node_modules jako zaleznosc @solana/web3.js.
import { Buffer } from 'buffer';
import { toast } from 'react-hot-toast';
import { useAutoReset } from '../../../components/useTxFeedback';
import type { ChainPostButtonProps } from '../../chainPosting/types';
import {
  MEMO_PROGRAM_ADDRESS,
  SOLANA_NETWORK_LABEL,
  buildPostMemo,
  solanaExplorerTxUrl,
} from '../config/solanaChain';

/** Klucz localStorage z ostatnim podpisem - parytet z `txHashStorageKey` w EVM. */
const LAST_SIGNATURE_KEY = 'lastSolanaSignature';

/** Budowane tutaj, bo config celowo nie zna web3.js - patrz naglowek solanaChain.ts. */
const MEMO_PROGRAM_ID = new PublicKey(MEMO_PROGRAM_ADDRESS);

function SolanaLogo({ className }: { className: string }) {
  // Trzy belki - znak Solany. Inline, zeby nie dokladac requestu po ikone.
  return (
    <svg className={className} viewBox="0 0 397 311" fill="none" aria-hidden="true">
      <path
        d="M64 237.9a12.6 12.6 0 018.9-3.7h316a6.3 6.3 0 014.5 10.8l-62.4 62.4a12.6 12.6 0 01-8.9 3.7H6a6.3 6.3 0 01-4.5-10.8L64 237.9z"
        fill="currentColor"
      />
      <path
        d="M64 3.7A12.9 12.9 0 0173 0h316a6.3 6.3 0 014.5 10.8l-62.4 62.4a12.6 12.6 0 01-8.9 3.7H6a6.3 6.3 0 01-4.5-10.8L64 3.7z"
        fill="currentColor"
      />
      <path
        d="M333.1 120.1a12.6 12.6 0 00-8.9-3.7H8.2a6.3 6.3 0 00-4.5 10.8l62.4 62.4a12.6 12.6 0 008.9 3.7h316a6.3 6.3 0 004.5-10.8l-62.4-62.4z"
        fill="currentColor"
      />
    </svg>
  );
}

function Spinner({ className }: { className: string }) {
  return (
    <svg
      className={`animate-spin -ml-1 mr-2 h-4 w-4 ${className}`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

/**
 * Odmowa podpisu to NIE awaria - tak samo jak w `describeWalletError` po
 * stronie EVM. Bez tego uzytkownik, ktory sam kliknal "Cancel" w Phantomie,
 * dostawalby czerwony toast "Transaction failed".
 */
function isUserRejection(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /user rejected|user denied|rejected the request|request rejected/i.test(message);
}

/** Brak SOL na oplate ma wlasny komunikat - inaczej uzytkownik nie wie, czego brakuje. */
function isInsufficientFunds(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /insufficient (lamports|funds)|attempt to debit an account/i.test(message);
}

/* ------------------------------------------------------------------ *
 * POTWIERDZANIE TRANSAKCJI
 *
 * === DLACZEGO TO NIE JEST ZWYKLE `await confirmTransaction` ===
 *
 * Bo `confirmTransaction` rzuca wyjatkiem takze wtedy, gdy transakcja
 * ZOSTALA PRZYJETA. Zmierzone na mainnecie 22.09.2026, pierwszy post
 * wlasciciela:
 *
 *   podpis 3F7V48xEPn2zh2Ej5HPxua6rq...  ->  "has expired: block height
 *   exceeded"  ->  a w tej samej chwili na lancuchu: finalized, err: null,
 *   Memo Program wykonany, oplata 5413 lamportow pobrana.
 *
 * Aplikacja powiedziala "Transaction failed", posta NIE zapisala do
 * Firestore, a uzytkownik zaplacil i ma swoje memo na mainnecie NA STALE.
 * Najgorszy mozliwy wynik: wziete pieniadze, skasowana tresc, komunikat,
 * ktory klamie.
 *
 * Skad to sie bierze: blockhash jest wazny okolo 150 blokow, czyli mniej
 * wiecej minute. Odliczanie startuje w chwili jego pobrania - a POMIEDZY
 * pobraniem a wyslaniem stoi czlowiek czytajacy okno portfela. Kto zastanawia
 * sie nad podpisem dluzej niz minute, ten dostaje "expired" nawet wtedy, gdy
 * transakcja weszla do bloku sekunde wczesniej.
 *
 * === ZASADA ===
 * Wygasniecie okna potwierdzania NIE jest odpowiedzia na pytanie "czy
 * transakcja przeszla". Odpowiedzia jest wylacznie stan podpisu na lancuchu,
 * wiec po wyjatku PYTAMY LANCUCH, zamiast zgadywac.
 *
 * `searchTransactionHistory` jest tu konieczne: bez niego RPC przeszukuje
 * tylko swiezy bufor i dla transakcji sprzed kilkudziesieciu sekund zwraca
 * `null`, czyli to samo, co "nie ma".
 * ------------------------------------------------------------------ */

/** Ile razy pytamy o status po wygasnieciu okna. */
const STATUS_POLL_ATTEMPTS = 6;
/** Odstep miedzy pytaniami. 6 x 2,5 s = 15 s - tyle wystarcza, by RPC nadgonil. */
const STATUS_POLL_INTERVAL_MS = 2500;

type ConfirmOutcome =
  /** Transakcja jest na lancuchu i nie zwrocila bledu. */
  | { kind: 'landed' }
  /** Transakcja jest na lancuchu, ale wykonala sie z bledem. */
  | { kind: 'failed'; detail: string }
  /** Okno wygaslo i po odpytaniu lancucha podpisu nadal nie ma. */
  | { kind: 'expired' };

async function confirmOrAskChain(
  connection: Connection,
  signature: string,
  blockhash: string,
  lastValidBlockHeight: number
): Promise<ConfirmOutcome> {
  try {
    const result = await connection.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
      'confirmed'
    );
    if (result.value.err) {
      return { kind: 'failed', detail: JSON.stringify(result.value.err) };
    }
    return { kind: 'landed' };
  } catch {
    // Okno potwierdzania wygaslo. To pytanie bez odpowiedzi, a nie odpowiedz -
    // patrz naglowek. Pytamy lancuch.
    for (let attempt = 0; attempt < STATUS_POLL_ATTEMPTS; attempt += 1) {
      try {
        const statuses = await connection.getSignatureStatuses([signature], {
          searchTransactionHistory: true,
        });
        const status = statuses.value[0];
        if (status) {
          if (status.err) {
            return { kind: 'failed', detail: JSON.stringify(status.err) };
          }
          if (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized') {
            return { kind: 'landed' };
          }
        }
      } catch (statusError) {
        // Jedno nieudane pytanie o status nie konczy sprawdzania - RPC bywa
        // chwilowo niedostepny, a my mamy tu do rozstrzygniecia pieniadze.
        console.warn('Solana status check failed, retrying:', statusError);
      }
      await new Promise(resolve => setTimeout(resolve, STATUS_POLL_INTERVAL_MS));
    }
    // Po wygasnieciu blockhasha transakcja nie moze juz wejsc do bloku, wiec
    // brak podpisu po tych probach znaczy, ze naprawde nie przeszla.
    return { kind: 'expired' };
  }
}

export default function SolanaPostButton({
  content,
  onTransactionSuccess,
  disabled = false,
  onPostAdded,
}: ChainPostButtonProps) {
  const { connection } = useConnection();
  const { publicKey, sendTransaction, connected } = useWallet();
  const { setVisible } = useWalletModal();

  const [isTransacting, setIsTransacting] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [isViewingExplorer, setIsViewingExplorer] = useState(false);

  const handleSuccess = useCallback(
    async (sig: string) => {
      localStorage.setItem(LAST_SIGNATURE_KEY, sig);
      onTransactionSuccess(sig);
      if (onPostAdded) {
        try {
          await onPostAdded();
        } catch (error) {
          console.error('Error refreshing posts after Solana transaction:', error);
        }
      }
    },
    [onTransactionSuccess, onPostAdded]
  );

  const handleSend = useCallback(async () => {
    if (disabled || isTransacting) return;

    // Brak portfela Solany - otwieramy wybor portfela zamiast cichego nic.
    // To odpowiednik "przelacz siec" z przycisku EVM: pierwsze klikniecie
    // przygotowuje portfel, drugie wysyla transakcje.
    if (!connected || !publicKey) {
      setVisible(true);
      return;
    }

    if (!content.trim()) return;

    let loadingToastId: string | undefined;

    try {
      setIsTransacting(true);
      loadingToastId = toast.loading(`Preparing transaction on ${SOLANA_NETWORK_LABEL}...`);

      const memo = buildPostMemo(content, publicKey.toBase58());

      const instruction = new TransactionInstruction({
        // Memo Program przyjmuje podpisujacego jako konto opcjonalne - podany
        // tu klucz laduje w transakcji jako "signer", dzieki czemu indeksery
        // potrafia przypisac memo do autora.
        keys: [{ pubkey: publicKey, isSigner: true, isWritable: false }],
        programId: MEMO_PROGRAM_ID,
        data: Buffer.from(memo, 'utf8'),
      });

      const transaction = new Transaction().add(instruction);

      // Blockhash pobrany RAZ i uzyty zarowno do wyslania, jak i do
      // potwierdzenia. Drugie `getLatestBlockhash` po wyslaniu potrafi zwrocic
      // nowszy blok i wtedy `confirmTransaction` wygasa mimo udanej transakcji.
      const latest = await connection.getLatestBlockhash('confirmed');
      transaction.recentBlockhash = latest.blockhash;
      transaction.feePayer = publicKey;

      const sig = await sendTransaction(transaction, connection);

      toast.success(`Transaction sent on ${SOLANA_NETWORK_LABEL}!`);

      const outcome = await confirmOrAskChain(
        connection,
        sig,
        latest.blockhash,
        latest.lastValidBlockHeight
      );

      if (outcome.kind === 'failed') {
        toast.error(`Transaction rejected by the network: ${outcome.detail}`);
        return;
      }

      if (outcome.kind === 'expired') {
        // Podpis istnieje, wiec uzytkownik ma czego szukac - ale lancuch go nie
        // przyjal i pieniadze nie wyszly. Podajemy podpis mimo to: gdyby RPC
        // sie mylil, to jedyny trop, ktory pozwoli to sprawdzic samodzielnie.
        toast.error(
          `The network did not confirm this post in time and it was not published. ` +
            `Nothing was charged. Signature: ${sig}`,
          { duration: 10000 }
        );
        return;
      }

      setSignature(sig);
      await handleSuccess(sig);
    } catch (error) {
      console.error('Solana transaction error:', error);
      if (isUserRejection(error)) {
        toast('Signature cancelled.');
      } else if (isInsufficientFunds(error)) {
        toast.error(
          `Not enough SOL for the network fee on ${SOLANA_NETWORK_LABEL}. A post costs about 0.000005 SOL.`
        );
      } else {
        const message = error instanceof Error ? error.message : String(error);
        toast.error(`Transaction failed: ${message}`);
      }
    } finally {
      if (loadingToastId) toast.dismiss(loadingToastId);
      setIsTransacting(false);
    }
  }, [
    disabled,
    isTransacting,
    connected,
    publicKey,
    content,
    connection,
    sendTransaction,
    handleSuccess,
    setVisible,
  ]);

  useAutoReset(isViewingExplorer, 2000, () => {
    setSignature(null);
    setIsViewingExplorer(false);
  });

  if (signature) {
    return (
      <button
        type="button"
        className={`px-4 py-2 ${isViewingExplorer ? 'bg-[#9945FF]' : 'bg-green-500'} text-white rounded-lg hover:bg-green-600 transition-colors`}
        onClick={() => {
          const alreadyViewing = isViewingExplorer;
          setIsViewingExplorer(true);
          window.open(solanaExplorerTxUrl(signature), '_blank');
          if (onPostAdded && !alreadyViewing) {
            onPostAdded().catch(error =>
              console.error('Error refreshing posts after viewing explorer:', error)
            );
          }
        }}
      >
        {isViewingExplorer ? 'Transaction Sent!' : 'View on Solana Explorer'}
      </button>
    );
  }

  return (
    <button
      type="button"
      aria-label={connected ? `Post on ${SOLANA_NETWORK_LABEL}` : 'Connect a Solana wallet'}
      className={`flex items-center justify-center px-3 py-0.5 sm:px-4 sm:py-0.5 rounded-lg transition-all duration-300 font-medium text-xs sm:text-sm h-[32px] ${
        connected
          ? 'bg-gradient-to-r from-[#9945FF] to-[#14F195] text-white hover:opacity-90 border border-[#9945FF]'
          : 'bg-gray-700 text-white hover:bg-gray-600 border border-gray-600'
      } ${disabled || isTransacting ? 'opacity-50 cursor-not-allowed' : ''}`}
      onClick={handleSend}
      disabled={disabled || isTransacting}
    >
      {isTransacting ? (
        <>
          <Spinner className="text-white" />
          <span className="leading-tight">Processing...</span>
        </>
      ) : (
        <>
          <SolanaLogo className="w-4 h-4 mr-1" />
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </>
      )}
    </button>
  );
}

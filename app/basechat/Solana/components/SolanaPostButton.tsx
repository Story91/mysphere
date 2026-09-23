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
 *   useAccount()             useSolanaWallet().signer
 *   switchChain()            (nie istnieje - klaster ustala provider)
 *   writeContract()          sendTransaction()
 *   waitForReceipt()         confirmTransaction()
 *   txHash 0x...             signature base58
 *
 * Autorem posta pozostaje adres EVM (`author` w dokumencie Firestore) - portfel
 * Solany sluzy wylacznie do podpisania kwitu. Zmiana tego wymagalaby
 * przepisania logowania, profili, followow, tipow i rankingu, ktore w calosci
 * stoja na adresie 0x.
 *
 * Od 23.09.2026 post z Solany zapisuje serwer i bierze autora z sesji SIWE
 * (POST /api/solana/post). Dlatego przycisk PRZED transakcja upewnia sie, ze
 * sesja jest - inaczej uzytkownik zaplacilby za kwit posta, ktorego serwer
 * potem nie zapisze. Z tego samego powodu ID posta powstaje tutaj: memo musi
 * je niesc, zeby transakcji nie dalo sie podpiac pod inny post.
 *
 * Portfel Solany przychodzi ze WSPOLNEGO gospodarza aplikacji
 * (useSolanaWallet), a nie z lokalnego WalletProvidera - ten sam stan widzi
 * nawigacja. Brak podlaczonego konta nie otwiera juz slepo wyboru portfela:
 * najpierw probujemy konta Solany tego samego portfela, na ktorym stoi strona
 * EVM (MetaMask -> MetaMask, Phantom -> Phantom), a wybor portfela dopiero,
 * gdy pary nie ma.
 */

import { useCallback, useMemo, useState } from 'react';
import { PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';
// Jawny import z 'buffer', a NIE globalny `Buffer`: w bundlu przegladarkowym
// Next.js nie definiuje globalnego Buffera, wiec `Buffer.from(...)` wywalaloby
// sie dopiero w runtime ("Buffer is not defined"), juz po podpisie uzytkownika.
// Pakiet 'buffer' i tak lezy w node_modules jako zaleznosc @solana/web3.js.
import { Buffer } from 'buffer';
import { toast } from 'react-hot-toast';
import { useAccount, useConnect } from 'wagmi';
import { useAutoReset } from '../../../components/useTxFeedback';
import { useSiweAuth } from '../../../utils/auth/useSiweAuth';
import { useSolanaWallet } from '../../../components/solana/SolanaWalletHost';
import { findEvmTwin } from '../../../components/solana/solanaWalletNav';
import type { ChainPostButtonProps } from '../../chainPosting/types';
import {
  MEMO_PROGRAM_ADDRESS,
  SOLANA_NETWORK_LABEL,
  buildPostMemo,
  newPostId,
  solanaExplorerTxUrl,
} from '../config/solanaChain';
import { confirmOrAskChain } from '../confirm';
import { isInsufficientFunds, isUserRejection } from '../walletErrors';
import { extractMintCandidates } from '../bags/bagsCore';
import { buildBagsInstruction, detectBagsMints } from '../bags/bagsTx';

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

export default function SolanaPostButton({
  content,
  onTransactionSuccess,
  disabled = false,
  onPostAdded,
}: ChainPostButtonProps) {
  const solana = useSolanaWallet();
  const signer = solana.signer;
  const connected = !!signer;
  const { connectPreferred } = solana;
  const { address: evmAddress, connector } = useAccount();
  const { connectors, connect: connectEvm } = useConnect();
  const { address: sessionAddress, signIn } = useSiweAuth();

  const [isTransacting, setIsTransacting] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [isViewingExplorer, setIsViewingExplorer] = useState(false);

  // Tylko kandydaci z tresci, bez pytania lancucha - notka ma sie pojawic przy
  // pisaniu, a nie po kazdym znaku wysylac zapytanie RPC. Czy to naprawde mint,
  // rozstrzyga sie dopiero przy wysylce (detectBagsMints).
  const mentionsToken = useMemo(() => extractMintCandidates(content).length > 0, [content]);

  const handleSuccess = useCallback(
    async (sig: string, postId: string) => {
      localStorage.setItem(LAST_SIGNATURE_KEY, sig);
      onTransactionSuccess(sig, { postId });
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

    // Brak portfela Solany - podpinamy konto Solany tego samego portfela co
    // strona EVM, a bez pary otwieramy wybor portfela. To odpowiednik
    // "przelacz siec" z przycisku EVM: pierwsze klikniecie przygotowuje
    // portfel, drugie wysyla transakcje.
    if (!signer) {
      connectPreferred(connector?.name ?? null);
      return;
    }
    const { publicKey, connection, sendTransaction } = signer;

    if (!content.trim()) return;

    // Post zapisuje sie pod profilem EVM, a serwer bierze autora z sesji SIWE.
    // Oba warunki sprawdzamy PRZED podpisem transakcji, nie po.
    if (!evmAddress) {
      // Konto Solany jest, profilu EVM nie ma (np. odmowa strony EVM przy
      // podwojnym laczeniu w modalu portfela). Ten sam portfel zwykle ma
      // strone EVM (Phantom, MetaMask) - prosimy o nia od razu, w tym samym
      // kliknieciu, bo portfele z popupem blokuja okna otwarte po przerwie.
      // Bez pary (Solflare, Backpack) mowimy, gdzie podlaczyc portfel EVM.
      const twin = findEvmTwin(
        connectors.filter((candidate) => candidate.id !== 'injected'),
        solana.walletName
      );
      if (twin) {
        connectEvm(
          { connector: twin },
          {
            onSuccess: () => toast.success(`${twin.name} connected on Ethereum. Press Post again to publish.`),
            onError: (connectError) => {
              if (isUserRejection(connectError)) {
                toast(`${twin.name}: Ethereum side not connected. Your Solana post is saved under that profile, so it is needed to post.`);
              } else {
                toast.error(`Could not connect ${twin.name} (Ethereum): ${connectError.message.slice(0, 120)}`);
              }
            },
          }
        );
        toast(`Your Solana post is saved under your ${twin.name} Ethereum profile - approve it in the wallet.`);
        return;
      }
      toast.error('Connect your main (EVM) wallet first with Connect wallet in the top bar - your Solana post is saved under that profile.');
      return;
    }

    let loadingToastId: string | undefined;

    try {
      setIsTransacting(true);

      if (sessionAddress !== evmAddress.toLowerCase()) {
        loadingToastId = toast.loading('Sign in with your wallet to post...');
        const signedIn = await signIn();
        toast.dismiss(loadingToastId);
        loadingToastId = undefined;
        if (!signedIn) {
          toast.error('Sign in with your wallet to post on Solana. Nothing was sent.');
          return;
        }
      }

      loadingToastId = toast.loading(`Preparing transaction on ${SOLANA_NETWORK_LABEL}...`);

      const postId = newPostId();
      const memo = buildPostMemo(content, publicKey.toBase58(), postId);

      const instruction = new TransactionInstruction({
        // Memo Program przyjmuje podpisujacego jako konto opcjonalne - podany
        // tu klucz laduje w transakcji jako "signer", dzieki czemu indeksery
        // potrafia przypisac memo do autora.
        keys: [{ pubkey: publicKey, isSigner: true, isWritable: false }],
        programId: MEMO_PROGRAM_ID,
        data: Buffer.from(memo, 'utf8'),
      });

      const transaction = new Transaction().add(instruction);

      // Proof of Bags: jesli post wspomina token, transakcja dostaje konto
      // tokenowe autora i runtime zapisze jego saldo na zawsze. Awaria
      // wykrywania NIE blokuje posta - idzie wtedy bez dowodu, jak dotad.
      const bagMints = await detectBagsMints(connection, content).catch(error => {
        console.warn('Proof of Bags detection failed, posting without it:', error);
        return [];
      });
      if (bagMints.length > 0) {
        transaction.add(buildBagsInstruction(publicKey, bagMints));
      }

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

      if (outcome.kind === 'unknown') {
        // RPC nie odpowiadal - nie wiemy, czy post wszedl. Podpis zostaje
        // u uzytkownika, zeby mogl sprawdzic w eksploratorze.
        toast.error(
          `We could not confirm this post with the network. Check this signature on an explorer before posting again: ${sig}`,
          { duration: 15000 }
        );
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
      await handleSuccess(sig, postId);
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
    signer,
    content,
    handleSuccess,
    connectPreferred,
    connector,
    connectors,
    connectEvm,
    solana.walletName,
    evmAddress,
    sessionAddress,
    signIn,
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
    <div className="flex items-center gap-2">
      {mentionsToken && (
        // Autor ma wiedziec PRZED podpisem, ze post zapisze na lancuchu jego
        // pozycje w tokenie. Saldo portfela i tak jest publiczne, ale
        // powiazanie go z konkretnym postem to decyzja, ktora nalezy do autora.
        <span
          className="max-w-[16rem] text-right text-[11px] leading-tight text-soft-ink-muted"
          title="If this post mentions a token address, its transaction records how much of that token your Solana wallet holds right now. Anyone can verify it on an explorer."
        >
          Proof of Bags: your position in the mentioned token gets recorded with this post
        </span>
      )}
    <button
      type="button"
      // Etykieta zastepuje widoczny tekst dla czytnika ekranu - w trakcie
      // transakcji musi mowic "Processing", inaczej niewidomy nie wie, ze trwa.
      aria-label={
        isTransacting
          ? 'Processing'
          : connected
            ? `Post on ${SOLANA_NETWORK_LABEL}`
            : solana.connecting
              ? 'Connecting Solana wallet'
              : 'Connect a Solana wallet'
      }
      title={connected ? undefined : 'Connect a Solana wallet'}
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
    </div>
  );
}

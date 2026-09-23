'use client';

/**
 * PORTFEL SOLANY DLA ASKOW SOL - powiazanie z kontem i jego stan.
 *
 * ===========================================================================
 * PO CO
 * ===========================================================================
 * Ask SOL placi natywnym SOL-em z portfela Solany autora na portfel Solany
 * odpowiadajacego. Tozsamoscia w aplikacji zostaje jednak sesja SIWE (adres
 * EVM) - wiec serwer musi wiedziec, KTORY portfel Solany nalezy do tego konta.
 * To jest powiazanie: jeden portfel Solany na konto, zapisane przez serwer
 * po podpisie wiadomosci (GET/POST /api/asks/solana-wallet).
 *
 * To samo powiazanie jest:
 *   - platnikiem autora (zamrazanym w stanie Aska przy zakladaniu),
 *   - odbiorca odpowiadajacego (zamrazanym przy jego odpowiedzi).
 *
 * ===========================================================================
 * PODPIS WIADOMOSCI, NIE TRANSAKCJA
 * ===========================================================================
 * Powiazanie to podpis tekstu, ktory konczy sie zdaniem "This signature is
 * free and does not move funds." Zanim poprosimy portfel o podpis, SKLADAMY
 * TEN TEKST SAMI z tych samych pol (buildSolanaBindingMessage) i porownujemy
 * z tym, co przyslal serwer. Portfel nie podpisze nam wiec niczego innego niz
 * wiadomosc powiazania - nawet gdyby odpowiedz serwera ktos podmienil.
 *
 * ===========================================================================
 * BEZ @solana/*
 * ===========================================================================
 * Hook stoi w kompozytorze i formularzu odpowiedzi, czyli w glownym bundlu
 * feedu. Portfel przychodzi z useSolanaWallet() (gospodarz w AppShell laduje
 * stos Solany leniwie), a z obiektu PublicKey wolamy tylko toBase58() - bez
 * importu klasy. Adres base58 ma wielkosc liter: nigdy toLowerCase.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSolanaWallet } from '../../components/solana/SolanaWalletHost';
import type { SolanaSigner } from '../../components/solana/solanaWalletTypes';
import useSiweAuth from '../auth/useSiweAuth';
import { buildSolanaBindingMessage } from './solAmounts';

export type SolanaAskBinding = {
  /** Adres base58 powiazanego portfela. Wielkosc liter zachowana. */
  solana: string;
  /** Kiedy powiazano (ms). */
  issuedAt: number;
};

/**
 * - idle           nic nie sprawdzalismy (wylaczone albo brak danych do pytania)
 * - loading        pytamy serwer
 * - ready          wiemy: `binding` jest albo go nie ma (null)
 * - needs-session  serwer chce sesji SIWE - bez niej nie powie, czyj to portfel
 * - failed         odczyt padl; to NIE jest "brak powiazania"
 */
export type SolanaBindingPhase = 'idle' | 'loading' | 'ready' | 'needs-session' | 'failed';

export type SolanaAskWallet = {
  /** false w miniappie Farcastera (tam nie ma portfeli Solany) i w trakcie wykrywania. */
  available: boolean;
  connected: boolean;
  connecting: boolean;
  /** Adres podlaczonego konta Solany (base58) albo null. */
  address: string | null;
  walletName: string | null;
  signer: SolanaSigner | null;
  /** Czy podlaczony portfel umie podpisac wiadomosc (bez tego nie powiaze adresu). */
  canSignMessage: boolean;
  binding: SolanaAskBinding | null;
  bindingPhase: SolanaBindingPhase;
  bindingError: string | null;
  /** Powiazanie istnieje i jest TYM portfelem, ktory jest podlaczony. */
  linkedHere: boolean;
  linking: boolean;
  /** Co sie wlasnie dzieje przy powiazaniu (np. "Sign in Phantom…"). */
  linkNote: string | null;
  linkError: string | null;
  signedIn: boolean;
  signIn: () => Promise<boolean>;
  /** Podlacz konto Solany (tego samego portfela co strona EVM, inaczej wybor). */
  connect: () => void;
  /** Zmien portfel Solany - otwiera wybor portfela. */
  pickWallet: () => void;
  refresh: () => Promise<void>;
  /** Powiaz podlaczony portfel z kontem. Oddaje powiazanie albo null (powod w linkError). */
  link: () => Promise<SolanaAskBinding | null>;
};

/* ------------------------------------------------------------------ */
/*  CZYSTE POMOCNIKI (eksportowane do testow)                          */
/* ------------------------------------------------------------------ */

/** Bajty -> base64 bez Buffera (w bundlu przegladarki Buffera nie ma). */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
  return btoa(binary);
}

/**
 * Challenge `v1.<kid>.<issuedAtMs>.<nonce>.<mac>` -> pola do odtworzenia
 * wiadomosci. null, gdy ksztalt jest inny - wtedy wiadomosc sprawdzamy
 * slabiej (patrz isExpectedBindingMessage).
 */
export function parseBindingChallenge(challenge: string): { issuedAtMs: number; nonce: string } | null {
  if (typeof challenge !== 'string') return null;
  const parts = challenge.split('.');
  if (parts.length !== 5 || parts[0] !== 'v1') return null;
  const issuedAtMs = Number(parts[2]);
  const nonce = parts[3];
  if (!Number.isSafeInteger(issuedAtMs) || issuedAtMs <= 0 || !/^[0-9a-f]{32}$/.test(nonce)) return null;
  return { issuedAtMs, nonce };
}

/**
 * Czy tekst od serwera to NASZA wiadomosc powiazania dla TEGO portfela.
 *
 * Gdy znamy adres sesji i challenge ma znany ksztalt - porownanie bajt w bajt
 * z tekstem zlozonym tutaj. Inaczej minimum: wiadomosc nazywa ten portfel
 * i konczy sie zdaniem o darmowym podpisie. Cokolwiek innego = nie podpisujemy.
 */
export function isExpectedBindingMessage(input: {
  message: unknown;
  challenge: unknown;
  solana: string;
  evm: string | null;
}): boolean {
  const { message, challenge, solana, evm } = input;
  if (typeof message !== 'string' || typeof challenge !== 'string' || message === '') return false;
  const parsed = parseBindingChallenge(challenge);
  if (parsed && evm) {
    return message === buildSolanaBindingMessage({ solana, evm, nonce: parsed.nonce, issuedAtMs: parsed.issuedAtMs });
  }
  return (
    message.startsWith('mysphere: link a Solana wallet to Asks\n') &&
    message.includes(`\nSolana wallet: ${solana}\n`) &&
    message.endsWith('This signature is free and does not move funds.')
  );
}

/** Powiazanie z odpowiedzi serwera albo null. Adres bez zmiany wielkosci liter. */
export function readBinding(value: unknown): SolanaAskBinding | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (typeof record.solana !== 'string' || record.solana === '') return null;
  // Serwer oddaje `linkedAtMs`; `issuedAt(Ms)` przyjmujemy dla zgodnosci
  // z wczesniejszym ksztaltem kontraktu.
  const raw = record.linkedAtMs ?? record.issuedAtMs ?? record.issuedAt;
  const issuedAt = typeof raw === 'number' ? raw : Number(raw);
  return { solana: record.solana, issuedAt: Number.isFinite(issuedAt) ? issuedAt : 0 };
}

/** Zdania dla kodow trasy powiazania, gdy serwer nie przyslal wlasnego. */
const LINK_CODE_MESSAGES: Record<string, string> = {
  session_required: 'Sign in with your main wallet first. The Solana wallet is linked to that account.',
  invalid_address: 'That does not look like a Solana address. Reconnect the Solana wallet and try again.',
  invalid_signature: 'The wallet returned a signature we could not read. Try again.',
  solana_signature_invalid: 'The signature does not match this Solana wallet. Nothing was linked. Try again.',
  challenge_invalid: 'The link request was not accepted. Nothing was linked. Try again.',
  challenge_expired: 'The link request expired before you signed it. Try again - it is valid for 10 minutes.',
  binding_outdated: 'A newer link already exists for this account. Refresh and try again if you still want to change it.',
  store_unavailable: 'Linking is not available on this deployment right now. Nothing was linked.',
  seal_invalid: 'Your current link cannot be verified right now. Nothing was changed.',
};

async function readJson(response: Response): Promise<Record<string, unknown>> {
  try {
    const data = (await response.json()) as unknown;
    return data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function errorText(data: Record<string, unknown>, status: number, fallback: string): string {
  if (typeof data.error === 'string' && data.error.trim() !== '') return data.error;
  if (typeof data.code === 'string' && LINK_CODE_MESSAGES[data.code]) return LINK_CODE_MESSAGES[data.code];
  return status ? `${fallback} (server answered ${status}).` : fallback;
}

function isRejection(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /user rejected|user denied|rejected the request|request rejected|cancel/i.test(message);
}

/* ------------------------------------------------------------------ */
/*  ODBIORCA ODPOWIEDZI                                                */
/* ------------------------------------------------------------------ */

export type AnswerPayeeResult =
  | { ok: true; payoutAddress: string }
  | { ok: false; status: number; code: string | null; error: string };

/**
 * POST /api/asks/[id]/payee - zamroz odbiorce WLASNEJ odpowiedzi z biezacego
 * powiazania. Dla odpowiedzi napisanej, zanim odpowiadajacy powiazal portfel.
 * Raz zamrozony odbiorca sie nie zmienia (payee_locked).
 */
export async function bindAnswerPayee(askId: string, answerId: string): Promise<AnswerPayeeResult> {
  try {
    const response = await fetch(`/api/asks/${encodeURIComponent(askId)}/payee`, {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answerId }),
    });
    const data = await readJson(response);
    const code = typeof data.code === 'string' ? data.code : null;
    if (response.ok && typeof data.payoutAddress === 'string' && data.payoutAddress !== '') {
      return { ok: true, payoutAddress: data.payoutAddress };
    }
    const fallback: Record<string, string> = {
      solana_wallet_required: 'Link a Solana wallet first, then attach it to this answer.',
      payee_locked: 'This answer already has its payout wallet. It cannot be changed.',
      ask_resolved: 'This Ask is already resolved.',
      wrong_rail: 'This Ask does not pay in SOL.',
    };
    return {
      ok: false,
      status: response.status,
      code,
      error:
        typeof data.error === 'string' && data.error.trim() !== ''
          ? data.error
          : (code && fallback[code]) || `The payout wallet was not attached (server answered ${response.status}).`,
    };
  } catch (error) {
    console.warn('[asks] Przypiecie odbiorcy nie dotarlo do serwera:', error);
    return { ok: false, status: 0, code: 'network_error', error: 'We could not reach the server. Try again.' };
  }
}

/* ------------------------------------------------------------------ */
/*  HOOK                                                               */
/* ------------------------------------------------------------------ */

export function useSolanaAskWallet({ enabled = true }: { enabled?: boolean } = {}): SolanaAskWallet {
  const sol = useSolanaWallet();
  const { address: sessionAddress, isAuthenticated, signIn } = useSiweAuth();

  const [binding, setBinding] = useState<SolanaAskBinding | null>(null);
  const [bindingPhase, setBindingPhase] = useState<SolanaBindingPhase>('idle');
  const [bindingError, setBindingError] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  const [linkNote, setLinkNote] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /** Numer odczytu - starsza odpowiedz nie nadpisze nowszej po zmianie portfela. */
  const readSeq = useRef(0);
  const address = sol.address;

  const refresh = useCallback(async () => {
    if (!enabled || !sol.available) return;
    if (!isAuthenticated) {
      setBindingPhase('needs-session');
      return;
    }
    const seq = (readSeq.current += 1);
    setBindingPhase('loading');
    setBindingError(null);
    try {
      const query = address ? `?address=${encodeURIComponent(address)}` : '';
      const response = await fetch(`/api/asks/solana-wallet${query}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      const data = await readJson(response);
      if (!mountedRef.current || seq !== readSeq.current) return;
      if (response.status === 401) {
        setBindingPhase('needs-session');
        return;
      }
      if (!response.ok) {
        // Bez podlaczonego portfela trasa moze odmowic (brak adresu do
        // challenge'u). To nie jest awaria - po prostu jeszcze nie wiemy.
        if (!address && response.status === 400) {
          setBindingPhase('idle');
          return;
        }
        setBindingError(errorText(data, response.status, 'Your linked Solana wallet could not be checked'));
        setBindingPhase('failed');
        return;
      }
      setBinding(readBinding(data.binding));
      setBindingPhase('ready');
    } catch (error) {
      console.warn('[asks] Odczyt powiazania Solany nie powiodl sie:', error);
      if (!mountedRef.current || seq !== readSeq.current) return;
      setBindingError('Your linked Solana wallet could not be checked. This is a failed read, not a missing link.');
      setBindingPhase('failed');
    }
  }, [enabled, sol.available, isAuthenticated, address]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const link = useCallback(async (): Promise<SolanaAskBinding | null> => {
    if (linking) return null;
    setLinkError(null);
    const signer = sol.signer;
    if (!sol.available) {
      setLinkError('Solana wallets are not available here. Open MySphere in a regular browser to link one.');
      return null;
    }
    if (!signer || !sol.address) {
      sol.connectPreferred();
      setLinkNote('Connect your Solana wallet, then link it.');
      return null;
    }
    if (!signer.signMessage) {
      setLinkError(
        `${sol.walletName ?? 'This wallet'} cannot sign messages, so it cannot be linked. Try Phantom, Solflare or Backpack.`
      );
      return null;
    }

    // Adres z portfela W CHWILI podpisu - nie ze stanu sprzed chwili.
    const solana = signer.publicKey.toBase58();
    setLinking(true);
    try {
      let evm = sessionAddress;
      if (!isAuthenticated) {
        setLinkNote('Sign in with your main wallet first. It costs nothing.');
        const ok = await signIn();
        if (!ok) {
          setLinkError('Sign in with your main wallet to link a Solana wallet. Nothing was linked.');
          return null;
        }
        // Adres sesji po podpisie przyjdzie nastepnym renderem - do porownania
        // wiadomosci wystarczy slabsze sprawdzenie (evm: null).
        evm = null;
      }

      setLinkNote('Preparing the link request…');
      const challengeResponse = await fetch(`/api/asks/solana-wallet?address=${encodeURIComponent(solana)}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      const challengeData = await readJson(challengeResponse);
      if (!challengeResponse.ok) {
        setLinkError(errorText(challengeData, challengeResponse.status, 'The link request could not be prepared'));
        return null;
      }
      const { challenge, message } = challengeData;
      if (!isExpectedBindingMessage({ message, challenge, solana, evm })) {
        console.error('[asks] Serwer przyslal nieoczekiwana wiadomosc powiazania:', challengeData);
        setLinkError('The server asked to sign an unexpected message, so we did not ask your wallet to sign it.');
        return null;
      }

      setLinkNote(`Sign the message in ${sol.walletName ?? 'your Solana wallet'}. It is free and moves no funds.`);
      let signatureBytes: Uint8Array;
      try {
        signatureBytes = await signer.signMessage(new TextEncoder().encode(message as string));
      } catch (error) {
        if (isRejection(error)) {
          setLinkError('Signature cancelled. Nothing was linked.');
        } else {
          console.error('[asks] Podpis powiazania nie powiodl sie:', error);
          setLinkError(
            `${sol.walletName ?? 'The wallet'} could not sign the message: ${
              error instanceof Error ? error.message.slice(0, 140) : 'unknown error'
            }`
          );
        }
        return null;
      }

      setLinkNote('Linking…');
      const response = await fetch('/api/asks/solana-wallet', {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        // `signatureBase64`, NIE `signature`: pod `signature` trasa oczekuje
        // base58 (parseBindingSignature w app/api/asks/solanaWalletStore.ts).
        // Adres pod `solana` (tego pola szuka trasa) i `address` (kontrakt).
        body: JSON.stringify({
          solana,
          address: solana,
          challenge,
          signatureBase64: bytesToBase64(signatureBytes),
        }),
      });
      const data = await readJson(response);
      if (!response.ok) {
        setLinkError(errorText(data, response.status, 'The Solana wallet was not linked'));
        return null;
      }
      const linked = readBinding(data.binding) ?? { solana, issuedAt: Date.now() };
      if (mountedRef.current) {
        setBinding(linked);
        setBindingPhase('ready');
        setBindingError(null);
      }
      return linked;
    } catch (error) {
      console.error('[asks] Powiazanie portfela Solany nie powiodlo sie:', error);
      setLinkError('We could not reach the server. Nothing was linked. Try again.');
      return null;
    } finally {
      if (mountedRef.current) {
        setLinking(false);
        setLinkNote(null);
      }
    }
  }, [linking, sol, sessionAddress, isAuthenticated, signIn]);

  const connect = useCallback(() => sol.connectPreferred(), [sol]);
  const pickWallet = useCallback(() => sol.openPicker(), [sol]);

  return {
    available: sol.available,
    connected: sol.connected,
    connecting: sol.connecting,
    address: sol.address,
    walletName: sol.walletName,
    signer: sol.signer,
    canSignMessage: !!sol.signer?.signMessage,
    binding,
    bindingPhase,
    bindingError,
    // Porownanie DOKLADNE: base58 rozroznia wielkosc liter.
    linkedHere: !!binding && !!sol.address && binding.solana === sol.address,
    linking,
    linkNote,
    linkError,
    signedIn: isAuthenticated,
    signIn: () => signIn(),
    connect,
    pickWallet,
    refresh,
    link,
  };
}

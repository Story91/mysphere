'use client';

/**
 * useSiweAuth - kliencka warstwa logowania SIWE (EIP-4361) spieta z trasami
 * w app/api/auth/*.
 *
 * PO CO: do tej pory tozsamosc uzytkownika stala wylacznie na adresie z wagmi
 * trzymanym w localStorage - nic tego nie weryfikowalo. Ten hook dokłada
 * prawdziwy przeplyw: nonce z serwera -> podpisana wiadomosc SIWE -> serwerowa
 * weryfikacja podpisu -> httpOnly cookie sesji.
 *
 * ZALOZENIE PROJEKTOWE: sesja serwerowa jest DODATKIEM, a nie bramka. Gdy
 * AUTH_SESSION_SECRET nie jest jeszcze ustawiony, /api/auth/verify zwroci 500 -
 * wtedy zglaszamy czytelny blad konfiguracji, ale aplikacja dziala dalej tak
 * jak dotad (na adresie z wagmi). Nic tutaj nie moze wywalic UI.
 *
 * CZEGO NIE ROBI:
 * - nie odswieza sesji, ktora zaraz wygasa,
 * - nie pilnuje, zeby kazde wywolanie API bylo autoryzowane - to zadanie tras.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAccount, useSignMessage } from 'wagmi';

/** Jedyny lancuch, jaki akceptuje /api/auth/verify. */
export const SIWE_CHAIN_ID = 8453;

/** Zdanie pokazywane uzytkownikowi w oknie podpisu portfela. */
const SIWE_STATEMENT = 'Sign in to MySphere. This request will not trigger a transaction or cost any gas.';

/** Ile wiadomosc SIWE jest wazna (minuty) - luzniej niz TTL nonce (10 min). */
const SIWE_EXPIRATION_MINUTES = 10;

export interface SiweAuthState {
  /** Adres potwierdzony przez serwer (lowercase) albo null. */
  address: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  /** Czytelny komunikat bledu albo null. Odrzucenie podpisu NIE ustawia bledu. */
  error: string | null;
  signIn: (options?: SignInOptions) => Promise<boolean>;
  signOut: () => Promise<void>;
}

export interface PresignedSiwe {
  address: string;
  message: string;
  signature: string;
}

export interface SignInOptions {
  /**
   * Gotowa para wiadomosc+podpis z zewnetrznego przeplywu (np. Base Account SDK
   * konczy wallet_connect wlasnym SIWE). Wtedy pomijamy useSignMessage i od razu
   * idziemy do /api/auth/verify. Wiadomosc MUSI niesc nonce z fetchSiweNonce().
   */
  presigned?: PresignedSiwe;
}

/**
 * Pobiera jednorazowy nonce z serwera. Serwer rownolegle sadza go w httpOnly
 * cookie, wiec KONIECZNE jest credentials: 'include' tu i przy verify -
 * inaczej verify zobaczy "Missing or expired nonce".
 */
export class SiweFlowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SiweFlowError';
  }
}

export async function fetchSiweNonce(): Promise<string> {
  const response = await fetch('/api/auth/nonce', {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new SiweFlowError('Could not reach the sign-in service. Please try again.');
  }

  const data = (await response.json()) as { nonce?: unknown };
  if (typeof data.nonce !== 'string' || data.nonce.length === 0) {
    throw new SiweFlowError('The sign-in service returned an invalid challenge.');
  }

  return data.nonce;
}

/**
 * Buduje wiadomosc w formacie EIP-4361 recznie - bez zaleznosci `siwe`.
 *
 * Uklad linii jest scisly, bo /api/auth/verify parsuje go regexami zakotwiczonymi
 * na poczatku linii (flaga /m):
 *   - `^Chain ID:\s*(\d+)\s*$` -> musi byc 8453,
 *   - `^Nonce:\s*(\S+)\s*$`    -> musi byc rowne nonce z cookie.
 * Dlatego separatorem linii jest '\n' i zadne z tych pol nie moze byc zawiniete.
 */
export function buildSiweMessage(params: {
  address: string;
  nonce: string;
  domain: string;
  uri: string;
  chainId?: number;
  statement?: string;
  issuedAt?: Date;
}): string {
  const chainId = params.chainId ?? SIWE_CHAIN_ID;
  const issuedAt = params.issuedAt ?? new Date();
  const expirationTime = new Date(issuedAt.getTime() + SIWE_EXPIRATION_MINUTES * 60 * 1000);
  const statement = params.statement ?? SIWE_STATEMENT;

  return [
    `${params.domain} wants you to sign in with your Ethereum account:`,
    params.address,
    '',
    statement,
    '',
    `URI: ${params.uri}`,
    'Version: 1',
    `Chain ID: ${chainId}`,
    `Nonce: ${params.nonce}`,
    `Issued At: ${issuedAt.toISOString()}`,
    `Expiration Time: ${expirationTime.toISOString()}`,
  ].join('\n');
}

/**
 * Rozpoznaje "uzytkownik kliknal Odrzuc" - EIP-1193 code 4001 albo tekst
 * rzucany przez rozne portfele. To nie jest awaria, tylko decyzja uzytkownika,
 * wiec nie ladujemy tego do `error`.
 */
export function isUserRejection(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  const candidate = error as { code?: unknown; name?: unknown; message?: unknown; cause?: unknown };

  if (candidate.code === 4001 || candidate.code === 'ACTION_REJECTED') return true;
  if (candidate.name === 'UserRejectedRequestError') return true;

  const message = typeof candidate.message === 'string' ? candidate.message.toLowerCase() : '';
  if (
    message.includes('user rejected') ||
    message.includes('user denied') ||
    message.includes('rejected the request') ||
    message.includes('request rejected')
  ) {
    return true;
  }

  // viem opakowuje bledy providera - zagladamy jeden poziom glebiej.
  if (candidate.cause && candidate.cause !== error) return isUserRejection(candidate.cause);

  return false;
}

/** Wyciaga komunikat bledu z odpowiedzi API, nie wywracajac sie na nie-JSON. */
async function readApiError(response: Response, fallback: string): Promise<string> {
  try {
    const data = (await response.json()) as { error?: unknown };
    if (typeof data.error === 'string' && data.error.length > 0) return data.error;
  } catch {
    // odpowiedz bez JSON - zostajemy przy fallbacku
  }
  return fallback;
}

/**
 * ==========================================================================
 * STAN SESJI JEST WSPOLNY DLA WSZYSTKICH INSTANCJI TEGO HOOKA
 * ==========================================================================
 * Hook jest wolany w co najmniej dwoch miejscach naraz: SessionPrompt
 * (montowany globalnie w AppShell) i MockFeed (ekran przedlogowania). Kazda
 * instancja miala WLASNY `useState` z adresem i WLASNE zapytanie do
 * /api/auth/session, wiec stany rozjezdzaly sie natychmiast:
 *
 *  - uzytkownik podpisywal SIWE na ekranie przedlogowania (instancja MockFeed),
 *    a instancja SessionPrompt nadal uwazala, ze sesji nie ma - i po 4 sekundach
 *    wysuwala pasek "Confirm this wallet is yours" proszacy o DRUGI podpis
 *    tej samej rzeczy,
 *  - dwie instancje odpytywaly /api/auth/session i dwa razy wolaly
 *    signInWithCustomToken na tym samym kliencie Firebase,
 *  - obie instancje niezaleznie reagowaly na rozlaczenie portfela, wiec
 *    /api/auth/logout leciało podwojnie.
 *
 * Dlatego adres sesji i faza startowa mieszkaja w module, a instancje tylko
 * subskrybuja zmiany. Per-instancja zostaje wylacznie to, co naprawde jest
 * lokalne: komunikat bledu i "czy TEN przycisk wlasnie podpisuje".
 */
interface SiweStore {
  /** Adres potwierdzony przez serwer (lowercase) albo null. */
  address: string | null;
  /** Czy trwa pierwsze pytanie serwera "kim jestem?". */
  isBootstrapping: boolean;
}

let store: SiweStore = { address: null, isBootstrapping: true };
const listeners = new Set<() => void>();

function publish(next: SiweStore) {
  if (next.address === store.address && next.isBootstrapping === store.isBootstrapping) return;
  store = next;
  listeners.forEach((listener) => listener());
}

/**
 * Logowanie do Firebase tokenem zmintowanym przez serwer po weryfikacji
 * podpisu. Dopiero to sprawia, ze request.auth.uid w regulach Firestore JEST
 * adresem portfela - bez tego reguly nie wiedza, kto pisze, i musialy zostac
 * otwarte na oscież.
 *
 * Blad tutaj NIE przerywa logowania: sesja serwerowa i tak powstala, a zapisy
 * do Firestore dzialaja dzis anonimowo.
 */
async function signInToFirebase(token: string): Promise<void> {
  try {
    const [{ signInWithCustomToken }, { auth }] = await Promise.all([
      import('firebase/auth'),
      import('../firebase'),
    ]);
    await signInWithCustomToken(auth, token);
  } catch (firebaseError) {
    console.warn('[useSiweAuth] Logowanie do Firebase nie powiodlo sie:', firebaseError);
  }
}

/** Sesja Firebase musi zniknac razem z sesja serwerowa. */
async function signOutOfFirebase(): Promise<void> {
  try {
    const [{ signOut: firebaseSignOut }, { auth }] = await Promise.all([
      import('firebase/auth'),
      import('../firebase'),
    ]);
    await firebaseSignOut(auth);
  } catch (firebaseError) {
    console.warn('[useSiweAuth] Wylogowanie z Firebase nie powiodlo sie:', firebaseError);
  }
}

let bootstrapPromise: Promise<void> | null = null;

/**
 * Odtworzenie istniejacej sesji. Wolane przez KAZDA instancje, wykonywane RAZ
 * na zaladowanie strony. Blad sieci/konfiguracji traktujemy jako "brak sesji" -
 * failowanie zamkniete, ale ciche, bo uzytkownik na tym etapie o nic nie prosil.
 */
function bootstrapSession(): Promise<void> {
  if (bootstrapPromise) return bootstrapPromise;

  bootstrapPromise = (async () => {
    try {
      const response = await fetch('/api/auth/session', {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
      });

      if (!response.ok) return;

      const data = (await response.json()) as { address?: unknown; firebaseToken?: unknown };

      if (typeof data.firebaseToken === 'string' && data.firebaseToken) {
        await signInToFirebase(data.firebaseToken);
      }

      if (typeof data.address === 'string' && data.address.length > 0) {
        publish({ address: data.address.toLowerCase(), isBootstrapping: false });
      }
    } catch {
      // brak sesji / offline - nic nie pokazujemy
    } finally {
      publish({ address: store.address, isBootstrapping: false });
    }
  })();

  return bootstrapPromise;
}

let signOutPromise: Promise<void> | null = null;

/**
 * Wylogowanie: cookie sesji + sesja Firebase.
 *
 * Adres kasujemy NATYCHMIAST, przed zapytaniem - dzieki temu rownolegle efekty
 * (dwie instancje hooka reagujace na to samo rozlaczenie portfela) widza juz
 * pusta sesje i nie wolaja tego drugi raz.
 *
 * Wylogowanie z Firebase jest POZA obsluga bledu zadania HTTP. Wczesniej
 * siedzialo w tym samym `try`, wiec padniete /api/auth/logout (offline,
 * 500) przeskakiwalo je calkowicie: UI pokazywal wylogowanie, a sesja Firebase
 * zyla dalej i przegladarka nadal pisala do Firestore jako ten uzytkownik.
 */
function performSignOut(): Promise<void> {
  if (signOutPromise) return signOutPromise;

  publish({ address: null, isBootstrapping: false });

  signOutPromise = (async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch {
      // Cookie i tak wygasnie; z punktu widzenia UI uzytkownik jest wylogowany.
    }
    await signOutOfFirebase();
  })();

  return signOutPromise.finally(() => {
    signOutPromise = null;
  });
}

export function useSiweAuth(): SiweAuthState {
  const { address: walletAddress, status: accountStatus } = useAccount();
  const { signMessageAsync } = useSignMessage();

  const [snapshot, setSnapshot] = useState<SiweStore>(store);
  // "Czy TA instancja wlasnie podpisuje". Osobno od fazy startowej, bo
  // SessionPrompt musi je od siebie odroznic (patrz isCheckingSession tam).
  const [isSigning, setIsSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isMountedRef = useRef(true);
  // Czy wagmi kiedykolwiek byl w stanie 'connected' w tym cyklu zycia.
  // Bez tego "jest rozlaczony" mylilby sie z "wlasnie sie rozlaczyl" i kasowal
  // sesje zalozona poza wagmi (np. przez Base Account SDK) albo tuz po starcie.
  const wasConnectedRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    const listener = () => setSnapshot(store);
    listeners.add(listener);
    // Stan mogl sie zmienic miedzy pierwszym renderem a subskrypcja.
    listener();
    void bootstrapSession();

    return () => {
      isMountedRef.current = false;
      listeners.delete(listener);
    };
  }, []);

  const signOut = useCallback(async () => {
    await performSignOut();
    if (isMountedRef.current) setError(null);
  }, []);

  const signIn = useCallback(
    async (options?: SignInOptions): Promise<boolean> => {
      const presigned = options?.presigned;
      const signerAddress = presigned?.address ?? walletAddress;

      if (!signerAddress) {
        setError('Connect your wallet first.');
        return false;
      }

      setIsSigning(true);
      setError(null);

      try {
        let message: string;
        let signature: string;

        if (presigned) {
          // Podpis powstal poza wagmi (Base Account SDK). Nonce musial zostac
          // pobrany wczesniej przez fetchSiweNonce(), inaczej verify go odrzuci.
          message = presigned.message;
          signature = presigned.signature;
        } else {
          const nonce = await fetchSiweNonce();

          message = buildSiweMessage({
            address: signerAddress,
            nonce,
            domain: window.location.host,
            uri: window.location.origin,
          });

          signature = await signMessageAsync({
            account: signerAddress as `0x${string}`,
            message,
          });
        }

        const response = await fetch('/api/auth/verify', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message, signature, address: signerAddress }),
        });

        if (!response.ok) {
          // 500 to niemal zawsze brak AUTH_SESSION_SECRET po stronie serwera.
          // Nazywamy to po imieniu, zeby nie wygladalo na odrzucony podpis.
          const detail =
            response.status >= 500
              ? 'Server sign-in is not configured yet. You can keep using the app.'
              : await readApiError(response, 'Signature verification failed.');

          console.warn('[useSiweAuth] /api/auth/verify odrzucil zadanie:', response.status, detail);
          if (isMountedRef.current) setError(detail);
          return false;
        }

        const data = (await response.json()) as { address?: unknown; firebaseToken?: unknown };

        if (typeof data.firebaseToken === 'string' && data.firebaseToken) {
          await signInToFirebase(data.firebaseToken);
        }

        const verified =
          typeof data.address === 'string' && data.address.length > 0
            ? data.address.toLowerCase()
            : signerAddress.toLowerCase();

        // Adres trafia do wspolnego magazynu NIEZALEZNIE od tego, czy ta
        // instancja jeszcze zyje - sesja powstala po stronie serwera, wiec
        // pozostale instancje musza sie o tym dowiedziec.
        publish({ address: verified, isBootstrapping: false });

        return true;
      } catch (caught) {
        if (isUserRejection(caught)) {
          // Stan spokojny: uzytkownik po prostu nie chcial podpisac.
          console.info('[useSiweAuth] Uzytkownik odrzucil podpis SIWE.');
          if (isMountedRef.current) setError(null);
          return false;
        }

        console.error('[useSiweAuth] Logowanie SIWE nie powiodlo sie:', caught);
        if (isMountedRef.current) {
          // Tylko nasze wlasne bledy sa pisane pod uzytkownika - komunikaty
          // z viem/portfela potrafia miec kilkanascie linii i nie nadaja sie do UI.
          setError(caught instanceof SiweFlowError ? caught.message : 'Sign-in failed. Please try again.');
        }
        return false;
      } finally {
        if (isMountedRef.current) setIsSigning(false);
      }
    },
    [walletAddress, signMessageAsync]
  );

  // Sesja serwerowa nie moze przezyc rozlaczenia portfela ani przepiecia konta.
  // Reagujemy na PRZEJSCIE connected -> disconnected, a nie na sam stan
  // 'disconnected': w trakcie 'reconnecting' wagmi jeszcze nie wie, kto jest
  // zalogowany, a poza tym sesja moze pochodzic z przeplywu spoza wagmi.
  useEffect(() => {
    if (accountStatus === 'connected') {
      wasConnectedRef.current = true;

      // Czytamy `store`, a nie `snapshot`: gdy dwie instancje reaguja na to samo
      // zdarzenie, druga ma juz zobaczyc skutek pierwszej. `snapshot.address`
      // zostaje w zaleznosciach, zeby efekt wrocil, gdy sesja odtworzy sie PO
      // podlaczeniu portfela (i okaze sie, ze dotyczy innego adresu).
      if (store.address && walletAddress && walletAddress.toLowerCase() !== store.address) {
        // Uzytkownik przepial konto w portfelu - sesja dotyczy juz kogos innego.
        void performSignOut();
      }
      return;
    }

    if (accountStatus === 'disconnected' && wasConnectedRef.current) {
      wasConnectedRef.current = false;
      if (store.address) void performSignOut();
    }
  }, [accountStatus, walletAddress, snapshot.address]);

  return {
    address: snapshot.address,
    isLoading: snapshot.isBootstrapping || isSigning,
    isAuthenticated: snapshot.address !== null,
    error,
    signIn,
    signOut,
  };
}

export default useSiweAuth;

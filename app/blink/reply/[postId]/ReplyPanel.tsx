'use client';

/**
 * Platna odpowiedz wykonywana na naszej stronie - dla wszystkich, ktorym
 * Blink nie rozwinal sie w X (brak rozszerzenia albo wylaczone Blinki).
 *
 * Ta sama sciezka co Blink: POST /api/actions/reply/[postId] buduje
 * transakcje, portfel ja podpisuje, a /confirm zapisuje komentarz po
 * sprawdzeniu na lancuchu.
 *
 * === ZAPLACONE, ALE NIEZAPISANE ===
 * Najgorszy mozliwy stan: pieniadze poszly, odpowiedzi nie ma. Do 23.09.2026
 * panel pokazywal wtedy blad, a glowny przycisk wracal jako "Reply and tip" -
 * drugie klikniecie placilo DRUGI raz (znalezisko z przegladu). Teraz:
 *   - podpis zapisujemy w localStorage ZANIM zapytamy /confirm, a po
 *     odswiezeniu strony panel sam wznawia zapis,
 *   - dopoki podpis czeka, glownym przyciskiem jest "Retry saving", ktory
 *     nie buduje nowej transakcji,
 *   - /confirm zawsze odpowiada 200, a stan (saved / pending / rejected)
 *     niesie w tresci - patrz naglowek trasy.
 *
 * === WPIS, KTORY NIE MOZE WISIEC WIECZNIE ===
 * Transakcja, ktora nigdy nie weszla do bloku, zostawiala wpis na zawsze:
 * panel w nieskonczonosc proponowal "Retry saving" i blokowal nowa odpowiedz
 * (znalezisko z przegladu 2026-09-23). Dlatego wpis niesie blockhash i jego
 * `lastValidBlockHeight`: gdy lancuch nie zna podpisu, a okno blockhasha juz
 * minelo, transakcja nie moze juz wejsc - czyli nic nie pobrano. Do tego
 * "Dismiss" dla wpisow, ktorych nie da sie rozstrzygnac (stare wpisy bez
 * blockhasha, podpis wklejony recznie).
 *
 * === ODZYSKANIE Z PODPISU ===
 * Blink w X zapisuje odpowiedz przez callback. Gdy ten nie doszedl, jedyne,
 * co czlowiek ma, to podpis transakcji. /blink/reply/[postId]?signature=...
 * (link z karty "Retry saving") albo wklejenie podpisu w panelu uruchamia ten
 * sam zapis - tresc i kwote serwer i tak czyta z lancucha.
 *
 * === WYGLAD I PORTFEL (23.09.2026) ===
 * Wlasciciel: "wyglada troche jak AI" i "nie wykrywa Phantoma" z X. Uklad to
 * teraz ekran odpowiedzi: pole z licznikiem w srodku, przelacznik napiwku,
 * jeden przycisk z kwota. Laczenie portfela idzie przez useBlinkWallet - bez
 * portfela w przegladarce (X) zamiast pustego modala stoi "Open this page in
 * your wallet", a szkic odpowiedzi jedzie w adresie (`draft`, `amount`).
 * Logika zapisu, wpisow i odzyskania nizej jest bez zmian.
 */

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { LAMPORTS_PER_SOL, Transaction, type Connection } from '@solana/web3.js';
import { Buffer } from 'buffer';
import { confirmOrAskChain } from '../../../basechat/Solana/confirm';
import { isInsufficientFunds, isUserRejection } from '../../../basechat/Solana/walletErrors';
import {
  normalizePostText,
  SOLANA_CLUSTER,
  SOLANA_NETWORK_LABEL,
  solanaExplorerTxUrl,
  type SolanaCluster,
} from '../../../basechat/Solana/config/solanaChain';
import {
  isSolanaAddress,
  isSolanaSignature,
  REPLY_AMOUNTS_SOL,
  REPLY_MAX_BYTES,
  validateReplyText,
} from '../../../basechat/Solana/replies/replyCore';
import { useBlinkWallet } from '../../components/useBlinkWallet';
import OpenInWallet from '../../components/OpenInWallet';
import { takeCarriedParams } from '../../components/walletLinks';
import {
  AmountSegments,
  FOCUS_RING,
  formatAmount,
  LINK_CLASS,
  PrimaryButton,
  SecondaryButton,
  SignatureLine,
  StatusCard,
  WalletLine,
} from '../../components/ui';

const CONFIRM_ATTEMPTS = 4;

/**
 * Portfel moze podmienic blockhash na swiezszy w chwili podpisu - wtedy okno
 * waznosci transakcji konczy sie PO naszym `lastValidBlockHeight`. Podpis
 * nastepuje jednak zawsze przed zapisem wpisu (`createdAt`), a blockhash zyje
 * ~150 blokow, czyli okolo minuty. Trzy minuty od zapisu wpisu przykrywaja ten
 * przypadek z zapasem, zanim powiemy komus "nic nie pobrano".
 */
const WALLET_BLOCKHASH_MARGIN_MS = 3 * 60 * 1000;

/**
 * Gorna granica werdyktu "nic nie pobrano": ~50 tys. blokow to okolo 5-6 godzin.
 * Domyslny RPC mainnetu (publicnode) nie musi byc archiwalny - dla starej
 * transakcji `getSignatureStatuses` potrafi zwrocic null, choc weszla. Pozno
 * po wygasnieciu blockhasha brak podpisu przestaje byc dowodem, wiec wpis
 * zostaje (z "Dismiss"), zamiast uslyszec "Not charged" o oplaconej odpowiedzi.
 */
const NEVER_LANDED_MAX_BLOCKS = 50_000;

const NOT_CHARGED = 'Not charged - the transaction never landed. You can write a new reply.';

type PendingReply = {
  signature: string;
  /** Portfel placacego. Brak przy podpisie wklejonym recznie - serwer wezmie platnika z transakcji. */
  account?: string;
  /** Kwota w lamportach (string, u64) - do komunikatu po zapisie. */
  lamports?: string;
  blockhash?: string;
  lastValidBlockHeight?: number;
  cluster?: SolanaCluster;
  createdAt?: number;
};

type PanelState =
  | { kind: 'idle'; notice?: string }
  | { kind: 'busy'; step: string }
  /** `signature` tylko do linku "View transaction" w potwierdzeniu. */
  | { kind: 'done'; lamports?: string; signature: string }
  /** Oplacone (albo mozliwe, ze oplacone), niezapisane: glownym ruchem jest ponowienie zapisu. */
  | { kind: 'pending'; entry: PendingReply; message: string }
  | { kind: 'error'; message: string; signature?: string };

type ConfirmResult =
  | { status: 'saved'; lamports?: string }
  | { status: 'rejected'; message: string }
  | { status: 'pending'; message: string };

/**
 * Klucz z klastrem: ten sam post nie istnieje na devnecie i mainnecie
 * jednoczesnie, ale localStorage domeny jest wspolny. Wpis z devnetu
 * wznawiany po przelaczeniu na mainnet pytalby lancuch o podpis, ktorego
 * tam nigdy nie bedzie.
 */
const pendingKey = (postId: string) => `mysphere:pendingReply:${SOLANA_CLUSTER}:${postId}`;
/** Klucz sprzed 23.09.2026 - bez klastra i bez blockhasha. Czytany, zeby nie zgubic oplaconej odpowiedzi. */
const legacyPendingKey = (postId: string) => `mysphere:pendingReply:${postId}`;

const DIGITS = /^\d+$/;

function parsePending(raw: string | null): PendingReply | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Record<string, unknown> | null;
    if (!value || !isSolanaSignature(value.signature)) return null;
    return {
      signature: value.signature,
      account: isSolanaAddress(value.account) ? value.account : undefined,
      lamports: typeof value.lamports === 'string' && DIGITS.test(value.lamports) ? value.lamports : undefined,
      blockhash: typeof value.blockhash === 'string' && value.blockhash ? value.blockhash : undefined,
      lastValidBlockHeight: Number.isSafeInteger(value.lastValidBlockHeight)
        ? (value.lastValidBlockHeight as number)
        : undefined,
      cluster: value.cluster === 'devnet' || value.cluster === 'mainnet-beta' ? value.cluster : undefined,
      createdAt: typeof value.createdAt === 'number' && Number.isFinite(value.createdAt) ? value.createdAt : undefined,
    };
  } catch {
    return null;
  }
}

function readPending(postId: string): PendingReply | null {
  try {
    const current = parsePending(localStorage.getItem(pendingKey(postId)));
    if (current && (!current.cluster || current.cluster === SOLANA_CLUSTER)) return current;
    return parsePending(localStorage.getItem(legacyPendingKey(postId)));
  } catch {
    return null;
  }
}

function savePending(postId: string, entry: PendingReply) {
  try {
    localStorage.setItem(pendingKey(postId), JSON.stringify(entry));
  } catch {
    /* tryb prywatny - zapis przetrwa tylko do zamkniecia karty */
  }
}

/**
 * Usuwa wpis TEGO podpisu. Odzyskanie z linku dotyczy innego podpisu niz
 * ten, ktory moze czekac w pamieci - jego rozstrzygniecie nie moze skasowac
 * drugiej, byc moze oplaconej odpowiedzi.
 */
function clearPending(postId: string, signature: string) {
  try {
    for (const key of [pendingKey(postId), legacyPendingKey(postId)]) {
      const stored = parsePending(localStorage.getItem(key));
      if (!stored || stored.signature === signature) localStorage.removeItem(key);
    }
  } catch {
    /* brak dostepu do pamieci - nie ma czego czyscic */
  }
}

/** Po rozstrzygnieciu podpis z adresu nie ma juz wznawiac zapisu przy odswiezeniu. */
function dropRecoveryParams() {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('signature') && !url.searchParams.has('account')) return;
    url.searchParams.delete('signature');
    url.searchParams.delete('account');
    window.history.replaceState(window.history.state, '', url.toString());
  } catch {
    /* adres zostaje - zapis jest idempotentny, wiec to tylko zbedne zapytanie */
  }
}

/** Lamporty jako SOL bez zaokraglen zmiennoprzecinkowych (u64 nie miesci sie w double). */
function formatSol(lamports: string): string {
  const value = BigInt(lamports);
  const whole = value / 1_000_000_000n;
  const fraction = (value % 1_000_000_000n).toString().padStart(9, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

/**
 * Samotny surogat UTF-16 (np. polowa emoji uciete przy kopiowaniu) wywraca
 * encodeURIComponent wyjatkiem "URI malformed". Zamieniamy go na U+FFFD, tak
 * jak zrobilby to TextEncoder - licznik, walidacja i wysylka widza wtedy ten
 * sam tekst.
 */
function wellFormed(text: string): string {
  return text.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '�');
}

/**
 * Czy transakcja z wpisu NA PEWNO nie weszla: lancuch nie zna podpisu, a jej
 * blockhash juz wygasl, wiec wejsc nie moze. Kazda niepewnosc (brak danych we
 * wpisie, blad RPC) to `false` - lepiej ponowic zapis niz powiedziec komus,
 * ze nic nie zaplacil, gdy zaplacil.
 */
async function neverLanded(connection: Connection, entry: PendingReply): Promise<boolean> {
  if (!entry.blockhash || entry.lastValidBlockHeight === undefined || entry.createdAt === undefined) return false;
  if (Date.now() - entry.createdAt < WALLET_BLOCKHASH_MARGIN_MS) return false;
  try {
    const { value } = await connection.getSignatureStatuses([entry.signature], { searchTransactionHistory: true });
    if (value[0]) return false;
    // `finalized`, nie `confirmed`: wysokosc sfinalizowana nigdy nie wyprzedza
    // tego, co RPC juz wie o transakcjach, wiec werdykt jest ostrozny.
    const height = await connection.getBlockHeight('finalized');
    return height > entry.lastValidBlockHeight && height - entry.lastValidBlockHeight < NEVER_LANDED_MAX_BLOCKS;
  } catch {
    return false;
  }
}

async function postConfirm(postId: string, entry: PendingReply): Promise<ConfirmResult> {
  let lastMessage = 'Your reply is paid and on-chain, but saving it did not go through yet.';
  for (let attempt = 0; attempt < CONFIRM_ATTEMPTS; attempt += 1) {
    if (attempt > 0) await new Promise(r => setTimeout(r, 2000 * attempt));
    try {
      const res = await fetch(`/api/actions/reply/${postId}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Bez portfela serwer wezmie platnika z transakcji (podpis wklejony recznie).
        body: JSON.stringify(entry.account ? { account: entry.account, signature: entry.signature } : { signature: entry.signature }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        status?: string;
        description?: string;
        tipLamports?: unknown;
        error?: { message?: string };
      };
      if (body.status === 'saved') {
        const lamports = typeof body.tipLamports === 'string' && DIGITS.test(body.tipLamports) ? body.tipLamports : undefined;
        return { status: 'saved', lamports };
      }
      if (body.status === 'rejected') {
        return { status: 'rejected', message: body.error?.message ?? body.description ?? 'The reply was not accepted.' };
      }
      if (body.description) lastMessage = body.description;
    } catch {
      /* siec - ponawiamy */
    }
  }
  return { status: 'pending', message: lastMessage };
}

/** Parametry, ktorymi szkic jedzie do przegladarki portfela (OpenInWallet). */
const CARRY_KEYS = ['draft', 'amount'] as const;
/** Szkic w adresie przycinamy - limit odpowiedzi to 280 bajtow, wiecej nie ma sensu wiezc. */
const DRAFT_CARRY_MAX = 600;

export default function ReplyPanel({ postId, author }: { postId: string; author: string }) {
  const { connection } = useConnection();
  const { publicKey, sendTransaction, connected } = useWallet();
  const blinkWallet = useBlinkWallet();
  const [text, setText] = useState('');
  const [amount, setAmount] = useState<number>(REPLY_AMOUNTS_SOL[0]);
  const [state, setState] = useState<PanelState>({ kind: 'idle' });
  const [pasted, setPasted] = useState('');
  const [pastedError, setPastedError] = useState<string | null>(null);
  const [recoverOpen, setRecoverOpen] = useState(false);

  // Szkic przeniesiony z przegladarki X do przegladarki portfela. Raz na
  // zamontowanie (ten sam powod co `started` nizej); parametry znikaja z
  // adresu, zeby odswiezenie po wyslaniu nie wstawialo go drugi raz.
  const carriedRead = useRef(false);
  useEffect(() => {
    if (carriedRead.current) return;
    carriedRead.current = true;
    const carried = takeCarriedParams(CARRY_KEYS);
    if (carried.draft) setText(carried.draft.slice(0, DRAFT_CARRY_MAX));
    const carriedAmount = Number(carried.amount);
    const preset = REPLY_AMOUNTS_SOL.find(value => value === carriedAmount);
    if (preset !== undefined) setAmount(preset);
  }, []);

  // Licznik liczy DOKLADNIE to, co wysle przycisk i sprawdzi serwer
  // (normalizacja whitespace). Wczesniej liczyl samo trim(), wiec potrafil
  // swiecic na czerwono przy aktywnym przycisku.
  const clean = wellFormed(text);
  const bytes = new TextEncoder().encode(normalizePostText(clean)).length;
  const validation = validateReplyText(clean);
  const hasLineBreaks = /\n/.test(clean.trim());

  const finishConfirm = useCallback(
    async (entry: PendingReply) => {
      setState({ kind: 'busy', step: 'Posting your reply…' });
      const result = await postConfirm(postId, entry);
      if (result.status === 'saved') {
        clearPending(postId, entry.signature);
        dropRecoveryParams();
        // Kwota z lancucha; wpis to zapas na wypadek starszego serwera.
        setState({ kind: 'done', lamports: result.lamports ?? entry.lamports, signature: entry.signature });
      } else if (result.status === 'rejected') {
        clearPending(postId, entry.signature);
        dropRecoveryParams();
        setState({ kind: 'error', message: result.message, signature: entry.signature });
      } else {
        setState({ kind: 'pending', entry, message: result.message });
      }
    },
    [postId]
  );

  // Wznowienie i "Retry saving": najpierw pytamy lancuch, czy transakcja
  // w ogole mogla wejsc - wygasla nie wymaga zadnego zapisu.
  const resume = useCallback(
    async (entry: PendingReply) => {
      setState({ kind: 'busy', step: 'Checking your payment…' });
      if (await neverLanded(connection, entry)) {
        clearPending(postId, entry.signature);
        dropRecoveryParams();
        setState({ kind: 'idle', notice: NOT_CHARGED });
        return;
      }
      await finishConfirm(entry);
    },
    [connection, postId, finishConfirm]
  );

  // Odzyskanie z samego podpisu (link z karty Blinka albo wklejony podpis).
  const recover = useCallback(
    async (signature: string, account?: string) => {
      const stored = readPending(postId);
      if (stored?.signature === signature) {
        await resume(stored);
        return;
      }
      const entry: PendingReply = { signature, account, cluster: SOLANA_CLUSTER, createdAt: Date.now() };
      // Nie nadpisujemy INNEGO czekajacego podpisu - to moze byc druga oplacona odpowiedz.
      if (!stored) savePending(postId, entry);
      await resume(entry);
    },
    [postId, resume]
  );

  // Odpowiedz oplacona w poprzedniej wizycie, ktorej zapis nie doszedl, albo
  // podpis z linku odzyskania - wznawiamy sami, zamiast liczyc, ze czlowiek
  // bedzie pamietal. Raz na zamontowanie: `connection` potrafi zmienic
  // tozsamosc, a kazde ponowne uruchomienie to kolejna seria zapytan.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const params = new URLSearchParams(window.location.search);
    const fromLink = params.get('signature');
    const pending = readPending(postId);
    if (fromLink !== null) {
      const signature = fromLink.trim();
      if (isSolanaSignature(signature)) {
        const account = params.get('account')?.trim();
        recover(signature, isSolanaAddress(account) ? account : undefined);
        return;
      }
      // Zepsuty link nie moze przykryc odpowiedzi, ktora juz czeka w pamieci -
      // bez wznowienia czlowiek widzialby formularz i placil drugi raz.
      dropRecoveryParams();
      if (!pending) {
        setState({ kind: 'error', message: 'The signature in this link is not a valid Solana transaction signature.' });
        return;
      }
    }

    if (pending) resume(pending);
  }, [postId, recover, resume]);

  // Zamkniecie karty w trakcie zapisu zostawia oplacona odpowiedz w pol drogi.
  const busy = state.kind === 'busy';
  useEffect(() => {
    if (!busy) return;
    const guard = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [busy]);

  function dismiss(entry: PendingReply) {
    clearPending(postId, entry.signature);
    dropRecoveryParams();
    setState({ kind: 'idle' });
  }

  function submitPasted(event: FormEvent) {
    event.preventDefault();
    const signature = pasted.trim();
    if (!isSolanaSignature(signature)) {
      setPastedError('That does not look like a Solana transaction signature.');
      return;
    }
    setPastedError(null);
    setPasted('');
    // Bez portfela: podlaczony moze byc inny niz ten, ktory zaplacil.
    recover(signature);
  }

  async function reply() {
    if (!connected || !publicKey) {
      // Jeden portfel - laczymy od razu; kilka - modal; zero - panel pokazuje
      // "Open this page in your wallet" zamiast tego przycisku.
      blinkWallet.requestConnect();
      return;
    }
    if (!validation.ok) return;

    // Czekajacy wpis w pamieci to byc moze OPLACONA odpowiedz, ktorej panel
    // akurat nie pokazuje (odzyskanie innego podpisu, wyjatek po wysylce).
    // Nowa transakcja nadpisalaby go pod tym samym kluczem i zgubila, a
    // czlowiek zaplacilby drugi raz - najpierw trzeba go rozstrzygnac.
    const waiting = readPending(postId);
    if (waiting) {
      setState({
        kind: 'pending',
        entry: waiting,
        message: 'An earlier reply on this post is still waiting to be saved. Retry it, or dismiss it before writing a new one.',
      });
      return;
    }

    const account = publicKey.toBase58();
    setState({ kind: 'busy', step: 'Preparing your reply…' });
    let signature: string | undefined;
    let entry: PendingReply | undefined;
    try {
      const res = await fetch(
        `/api/actions/reply/${postId}?text=${encodeURIComponent(validation.text)}&amount=${amount}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ account }),
        }
      );
      const body = (await res.json()) as { transaction?: string; message?: string };
      if (!res.ok || !body.transaction) {
        setState({ kind: 'error', message: body.message ?? 'Could not prepare the reply.' });
        return;
      }

      const transaction = Transaction.from(Buffer.from(body.transaction, 'base64'));
      // Swiezy blockhash w chwili podpisu - okno waznosci ma startowac tutaj.
      const latest = await connection.getLatestBlockhash('confirmed');
      transaction.recentBlockhash = latest.blockhash;

      setState({ kind: 'busy', step: 'Check your wallet…' });
      signature = await sendTransaction(transaction, connection);
      // Od tej chwili pieniadze moga byc w drodze - podpis musi przetrwac
      // wszystko, co stanie sie dalej, lacznie z zamknieciem karty. Blockhash
      // i jego okno pozwola pozniej stwierdzic, ze transakcja NIE weszla.
      entry = {
        signature,
        account,
        // Ta sama konwersja co w trasie POST, ktora zbudowala transakcje.
        lamports: String(Math.round(amount * LAMPORTS_PER_SOL)),
        blockhash: latest.blockhash,
        lastValidBlockHeight: latest.lastValidBlockHeight,
        cluster: SOLANA_CLUSTER,
        createdAt: Date.now(),
      };
      savePending(postId, entry);

      setState({ kind: 'busy', step: 'Confirming on Solana…' });
      const outcome = await confirmOrAskChain(connection, signature, latest.blockhash, latest.lastValidBlockHeight);
      if (outcome.kind === 'failed') {
        clearPending(postId, signature);
        setState({ kind: 'error', message: `The network rejected the reply: ${outcome.detail}`, signature });
        return;
      }
      if (outcome.kind === 'expired') {
        // confirmOrAskChain liczy okno z NASZEGO blockhasha, a portfel mogl
        // podpisac swiezszym - transakcja moze jeszcze wejsc. Wpis zostaje;
        // "Retry saving" po marginesie z neverLanded powie na pewno, czy nic
        // nie pobrano. Skasowanie go tutaj gubilo oplacona odpowiedz.
        setState({
          kind: 'pending',
          entry,
          message: 'The network did not confirm the reply in time. Most likely nothing was charged - retry in a few minutes and we will tell you for sure.',
        });
        return;
      }
      if (outcome.kind === 'unknown') {
        // RPC milczal - nie wiemy, czy weszla. /confirm i tak sprawdzi lancuch.
        setState({ kind: 'pending', entry, message: 'We could not confirm the payment with the network yet.' });
        return;
      }

      await finishConfirm(entry);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Po wysylce (wpis zapisany) wyjatek nie znaczy "nic sie nie stalo":
      // widok bledu oddawal formularz, a drugie klikniecie placilo drugi raz.
      if (entry) setState({ kind: 'pending', entry, message });
      else if (isUserRejection(error)) setState({ kind: 'idle' });
      else if (isInsufficientFunds(error)) setState({ kind: 'error', message: 'Not enough SOL for the tip and the network fee.' });
      else setState({ kind: 'error', message, signature });
    }
  }



  const tipLabel = formatAmount(amount);
  const tooLong = bytes > REPLY_MAX_BYTES;
  const carry = { draft: text.trim() ? text.slice(0, DRAFT_CARRY_MAX) : undefined, amount: String(amount) };

  if (state.kind === 'done') {
    return (
      <div className="mt-1 space-y-3">
        <StatusCard tone="success" title="Reply posted" role="status">
          <p>
            {state.lamports ? (
              <>
                <span className="font-semibold tabular-nums text-soft-accent-deep">{formatSol(state.lamports)} SOL</span>{' '}
                went to {author}.
              </>
            ) : (
              <>Your tip went to {author}.</>
            )}
          </p>
          <a href={solanaExplorerTxUrl(state.signature)} target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
            View transaction
          </a>
        </StatusCard>
        <Link
          href={`/post/${postId}`}
          className={`flex min-h-[48px] w-full items-center justify-center rounded-pill bg-soft-primary-deep px-5 text-[15px] font-bold text-soft-on-primary hover:bg-soft-primary-deep/90 ${FOCUS_RING}`}
        >
          See it under the post
        </Link>
      </div>
    );
  }

  if (state.kind === 'pending') {
    const { entry } = state;
    return (
      <div className="mt-1 space-y-3">
        <StatusCard tone="pending" title="Your reply is not saved yet" role="alert">
          <p className="break-words">{state.message}</p>
          {entry.lamports && (
            <p>
              Tip: <span className="font-semibold tabular-nums">{formatSol(entry.lamports)} SOL</span>
            </p>
          )}
          <p className="font-semibold">Keep this signature:</p>
          <SignatureLine signature={entry.signature} />
        </StatusCard>
        <PrimaryButton onClick={() => resume(entry)}>Retry saving</PrimaryButton>
        <p className="text-center text-xs text-soft-ink-muted">This does not charge you again.</p>
        <div className="border-t border-soft-line pt-3">
          <button
            type="button"
            onClick={() => dismiss(entry)}
            className={`min-h-[44px] rounded text-sm font-semibold text-soft-ink underline underline-offset-2 ${FOCUS_RING}`}
          >
            Dismiss and write a new reply
          </button>
          <p className="text-xs leading-relaxed text-soft-ink-muted">
            If you did pay, this reply may be lost - paste the signature above under &quot;Already paid?&quot; to
            recover it later.
          </p>
        </div>
      </div>
    );
  }

  const { availability, connectError } = blinkWallet;
  // Blad laczenia ma sens tylko, dopoki portfel nie jest podlaczony.
  const showConnectError = !connected ? connectError : null;

  let action;
  if (busy) {
    action = <PrimaryButton busy>{state.step}</PrimaryButton>;
  } else if (connected && publicKey) {
    action = (
      <PrimaryButton onClick={reply} disabled={!validation.ok}>
        Reply and send {tipLabel} SOL
      </PrimaryButton>
    );
  } else if (availability === 'none') {
    action = <OpenInWallet carry={carry} carryNote={carry.draft ? 'Your reply and tip come with you.' : undefined} />;
  } else if (availability === 'checking') {
    action = <PrimaryButton busy>Looking for your wallet…</PrimaryButton>;
  } else {
    action = (
      <PrimaryButton onClick={reply} busy={blinkWallet.connecting}>
        {blinkWallet.connecting
          ? 'Check your wallet…'
          : blinkWallet.multipleWallets || !blinkWallet.walletName
            ? 'Connect a wallet to reply'
            : `Connect ${blinkWallet.walletName} to reply`}
      </PrimaryButton>
    );
  }

  return (
    <div className="mt-1 space-y-4">
      {state.kind === 'idle' && state.notice && <StatusCard tone="success" title={state.notice} role="status" />}

      <div>
        <label htmlFor="reply-text" className="mb-2 block text-sm text-soft-ink-muted">
          Replying to <span className="font-semibold text-soft-ink">{author}</span>
        </label>
        <div className="relative">
          <textarea
            id="reply-text"
            value={text}
            onChange={event => setText(event.target.value)}
            disabled={busy}
            rows={4}
            placeholder={`Reply to ${author}…`}
            aria-describedby={hasLineBreaks ? 'reply-bytes reply-rules' : 'reply-bytes'}
            aria-invalid={tooLong || undefined}
            className={`block w-full resize-none rounded-2xl border bg-soft-surface px-3.5 pb-9 pt-3 text-[15px] leading-relaxed text-soft-ink outline-none transition-colors placeholder:text-soft-ink-muted focus:ring-2 disabled:opacity-60 ${
              tooLong
                ? 'border-rose-400 focus:ring-rose-200'
                : 'border-soft-line focus:border-soft-primary focus:ring-soft-primary/25'
            }`}
          />
          <span
            id="reply-bytes"
            className={`pointer-events-none absolute bottom-2.5 right-3.5 text-xs tabular-nums ${
              tooLong ? 'font-semibold text-rose-700' : 'text-soft-ink-muted'
            }`}
          >
            {bytes}/{REPLY_MAX_BYTES}
            <span className="sr-only"> bytes</span>
            {tooLong && ' · too long'}
          </span>
        </div>
        {/* Licznik nie jest regionem live - czytnik odczytywalby go przy kazdym
            znaku. Ogloszenie idzie tylko wtedy, gdy tekst przekroczy limit. */}
        <p className="sr-only" aria-live="polite">
          {tooLong && `Too long: ${bytes} of ${REPLY_MAX_BYTES} bytes.`}
        </p>
        {hasLineBreaks && (
          <p id="reply-rules" className="mt-1.5 text-xs text-soft-ink-muted">
            Line breaks become spaces on-chain.
          </p>
        )}
      </div>

      <AmountSegments
        name="reply-amount"
        legend="Tip the author"
        hint="SOL"
        options={REPLY_AMOUNTS_SOL.map(value => ({ value: String(value), label: formatAmount(value), srSuffix: 'SOL' }))}
        value={String(amount)}
        onChange={value => setAmount(Number(value))}
        disabled={busy}
      />

      <div className="space-y-3">
        {connected && publicKey && (
          <WalletLine
            address={publicKey.toBase58()}
            walletName={blinkWallet.walletName}
            onSwitch={blinkWallet.disconnectWallet}
            disabled={busy}
          />
        )}

        {action}

        <p className="sr-only" role="status" aria-live="polite">
          {busy && state.step}
        </p>

        {state.kind === 'error' && (
          <StatusCard tone="error" title={state.message} role="alert">
            {state.signature && <SignatureLine signature={state.signature} />}
          </StatusCard>
        )}

        {showConnectError &&
          (showConnectError.kind === 'cancelled' ? (
            <p role="status" className="text-sm text-soft-ink-muted">
              {showConnectError.message}
            </p>
          ) : (
            <div className="space-y-3">
              <StatusCard tone="error" title={showConnectError.message} role="alert" />
              {/* Telefon bez dzialajacego portfela (np. Mobile Wallet Adapter bez
                  aplikacji portfela) - zostaje droga przez przegladarke portfela. */}
              <OpenInWallet compact carry={carry} />
            </div>
          ))}

        <p className="text-xs leading-relaxed text-soft-ink-muted">
          The SOL goes straight to the author&apos;s Solana wallet. Your reply shows under the post once{' '}
          {SOLANA_NETWORK_LABEL} confirms it.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 border-t border-soft-line pt-2 text-sm">
        <Link
          href={`/post/${postId}`}
          className={`inline-flex min-h-[44px] items-center rounded font-semibold text-soft-ink-muted hover:text-soft-ink ${FOCUS_RING}`}
        >
          Open the post on MySphere
        </Link>
        <button
          type="button"
          onClick={() => setRecoverOpen(open => !open)}
          aria-expanded={recoverOpen}
          aria-controls="reply-recover"
          className={`inline-flex min-h-[44px] items-center gap-1 rounded font-semibold text-soft-ink-muted hover:text-soft-ink ${FOCUS_RING}`}
        >
          Already paid?
          <svg
            viewBox="0 0 16 16"
            aria-hidden="true"
            className={`h-3.5 w-3.5 transition-transform duration-150 ${recoverOpen ? 'rotate-180' : ''}`}
          >
            <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {/* Callback Blinka w X potrafi nie dojsc - wtedy podpis to jedyne, co
          czlowiek ma. Zapis czyta tresc i kwote z lancucha, niczego nie pobiera. */}
      {recoverOpen && (
        <form id="reply-recover" onSubmit={submitPasted} className="space-y-2 rounded-2xl bg-soft-sunken/50 p-3.5">
          <label htmlFor="reply-recover-signature" className="block text-sm font-semibold text-soft-ink">
            Paste your transaction signature
          </label>
          <input
            id="reply-recover-signature"
            value={pasted}
            onChange={event => {
              setPasted(event.target.value);
              setPastedError(null);
            }}
            disabled={busy}
            placeholder="Transaction signature"
            aria-invalid={pastedError ? true : undefined}
            aria-describedby="reply-recover-help"
            spellCheck={false}
            autoComplete="off"
            className="min-h-[44px] w-full rounded-xl border border-soft-line bg-soft-surface px-3 font-mono text-xs text-soft-ink outline-none placeholder:text-soft-ink-muted focus:border-soft-primary focus:ring-2 focus:ring-soft-primary/25"
          />
          {pastedError && (
            <p className="text-sm text-rose-700" role="alert">
              {pastedError}
            </p>
          )}
          <SecondaryButton type="submit" disabled={busy || !pasted.trim()}>
            Recover my reply
          </SecondaryButton>
          <p id="reply-recover-help" className="text-xs text-soft-ink-muted">
            We read the reply and the tip from the chain. This does not charge you.
          </p>
        </form>
      )}
    </div>
  );
}

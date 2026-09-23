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
 */

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { LAMPORTS_PER_SOL, Transaction, type Connection } from '@solana/web3.js';
import { Buffer } from 'buffer';
import { confirmOrAskChain } from '../../../basechat/Solana/confirm';
import { isInsufficientFunds, isUserRejection } from '../../../basechat/Solana/walletErrors';
import {
  normalizePostText,
  SOLANA_CLUSTER,
  SOLANA_NETWORK_LABEL,
  type SolanaCluster,
} from '../../../basechat/Solana/config/solanaChain';
import {
  isSolanaAddress,
  isSolanaSignature,
  REPLY_AMOUNTS_SOL,
  REPLY_MAX_BYTES,
  validateReplyText,
} from '../../../basechat/Solana/replies/replyCore';

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
  | { kind: 'done'; lamports?: string }
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

export default function ReplyPanel({ postId }: { postId: string }) {
  const { connection } = useConnection();
  const { publicKey, sendTransaction, connected } = useWallet();
  const { setVisible } = useWalletModal();
  const [text, setText] = useState('');
  const [amount, setAmount] = useState<number>(REPLY_AMOUNTS_SOL[0]);
  const [state, setState] = useState<PanelState>({ kind: 'idle' });
  const [pasted, setPasted] = useState('');
  const [pastedError, setPastedError] = useState<string | null>(null);

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
        setState({ kind: 'done', lamports: result.lamports ?? entry.lamports });
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
      setVisible(true);
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

      setState({ kind: 'busy', step: 'Waiting for your wallet…' });
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

  if (state.kind === 'done') {
    return (
      <div role="status" className="flex flex-col items-center gap-2 rounded-card border border-emerald-200 bg-emerald-50 p-4 text-center">
        <p className="font-semibold text-emerald-800">
          {state.lamports
            ? `Reply posted, and the author got ${formatSol(state.lamports)} SOL.`
            : 'Reply posted, and the author got your tip.'}
        </p>
        <a href={`/post/${postId}`} className="text-sm text-emerald-800 underline">
          See it under the post
        </a>
      </div>
    );
  }

  if (state.kind === 'pending') {
    const { entry } = state;
    return (
      <div className="flex flex-col gap-3 rounded-card border border-amber-200 bg-amber-50 p-4 text-center" role="alert">
        <p className="font-semibold text-amber-900">Saving your reply has not gone through yet.</p>
        <p className="break-words text-sm text-amber-900">{state.message}</p>
        {entry.lamports && <p className="text-sm text-amber-900">Tip: {formatSol(entry.lamports)} SOL</p>}
        <p className="break-all text-xs text-amber-900/80">Keep this signature: {entry.signature}</p>
        <button
          type="button"
          onClick={() => resume(entry)}
          className="rounded-pill bg-amber-600 px-5 py-2.5 font-semibold text-white hover:bg-amber-700"
        >
          Retry saving
        </button>
        <p className="text-xs text-amber-900/80">This does not charge you again.</p>
        <div className="border-t border-amber-200 pt-3">
          <button
            type="button"
            onClick={() => dismiss(entry)}
            className="text-sm font-semibold text-amber-900 underline underline-offset-2"
          >
            Dismiss and write a new reply
          </button>
          <p className="mt-1 text-xs text-amber-900/80">
            If you did pay, this reply may be lost - paste the signature above under &quot;Already paid?&quot; to
            recover it later.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {state.kind === 'idle' && state.notice && (
        <p role="status" className="rounded-card border border-emerald-200 bg-emerald-50 p-3 text-center text-sm text-emerald-800">
          {state.notice}
        </p>
      )}

      <textarea
        value={text}
        onChange={event => setText(event.target.value)}
        disabled={busy}
        rows={4}
        placeholder="Write your reply…"
        aria-label="Your reply"
        aria-describedby="reply-bytes reply-rules"
        className="w-full resize-none rounded-card border border-soft-line bg-soft-surface p-3 text-soft-ink outline-none focus:ring-2 focus:ring-[#9945FF]"
      />
      <div className="flex items-center justify-between gap-3 text-xs text-soft-ink-muted">
        <span id="reply-rules">
          A reply tips the author. Spam costs money here.
          {hasLineBreaks && ' Line breaks become spaces on-chain.'}
        </span>
        <span id="reply-bytes" aria-live="polite" className={bytes > REPLY_MAX_BYTES ? 'font-semibold text-rose-700' : ''}>
          {bytes}/{REPLY_MAX_BYTES} bytes{bytes > REPLY_MAX_BYTES ? ' - too long' : ''}
        </span>
      </div>

      <fieldset className="grid grid-cols-3 gap-2" disabled={busy}>
        <legend className="sr-only">Tip for the author</legend>
        {REPLY_AMOUNTS_SOL.map(value => (
          <label
            key={value}
            className={`cursor-pointer rounded-pill border px-3 py-2 text-center text-sm font-semibold transition-colors focus-within:ring-2 focus-within:ring-[#9945FF] ${
              amount === value ? 'border-[#9945FF] bg-[#9945FF]/10 text-[#6d28d9]' : 'border-soft-line text-soft-ink-muted'
            }`}
          >
            <input
              type="radio"
              name="reply-amount"
              value={value}
              checked={amount === value}
              onChange={() => setAmount(value)}
              className="sr-only"
            />
            {value} SOL
          </label>
        ))}
      </fieldset>

      <button
        type="button"
        disabled={busy || (connected && !validation.ok)}
        onClick={reply}
        className="rounded-pill bg-gradient-to-r from-[#9945FF] to-[#14F195] px-5 py-3 font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {busy ? state.step : connected ? `Reply and tip ${amount} SOL` : 'Connect a Solana wallet'}
      </button>

      <p className="text-center text-xs text-soft-ink-muted" role="status">
        {busy ? state.step : `Runs on ${SOLANA_NETWORK_LABEL}.`}
      </p>

      {state.kind === 'error' && (
        <div className="text-center text-sm text-rose-700" role="alert">
          <p>{state.message}</p>
          {state.signature && (
            <p className="mt-1 break-all text-xs text-soft-ink-muted">Signature: {state.signature}</p>
          )}
        </div>
      )}

      {/* Callback Blinka w X potrafi nie dojsc - wtedy podpis to jedyne, co
          czlowiek ma. Zapis czyta tresc i kwote z lancucha, niczego nie pobiera. */}
      <details className="text-center text-xs text-soft-ink-muted">
        <summary className="cursor-pointer underline underline-offset-2">Already paid? Paste your transaction signature</summary>
        <form onSubmit={submitPasted} className="mt-2 flex flex-col gap-2 text-left">
          <input
            value={pasted}
            onChange={event => {
              setPasted(event.target.value);
              setPastedError(null);
            }}
            disabled={busy}
            placeholder="Transaction signature"
            aria-label="Transaction signature"
            aria-invalid={pastedError ? true : undefined}
            aria-describedby="reply-recover-help"
            spellCheck={false}
            autoComplete="off"
            className="w-full rounded-card border border-soft-line bg-soft-surface p-2.5 font-mono text-xs text-soft-ink outline-none focus:ring-2 focus:ring-[#9945FF]"
          />
          {pastedError && (
            <p className="text-rose-700" role="alert">
              {pastedError}
            </p>
          )}
          <button
            type="submit"
            disabled={busy || !pasted.trim()}
            className="rounded-pill border border-soft-line px-4 py-2 font-semibold text-soft-ink transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            Recover my reply
          </button>
          <p id="reply-recover-help">We read the reply and the tip from the chain. This does not charge you.</p>
        </form>
      </details>
    </div>
  );
}

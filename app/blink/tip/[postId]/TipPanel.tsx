'use client';

/**
 * Napiwek w SOL wykonywany NA NASZEJ STRONIE - bez dial.to.
 *
 * Do 23.09.2026 przycisk "Tip in SOL" prowadzil do dial.to, interstycjala
 * Dialectu, ktory wykonywal Blinka za nas. Wlasciciel kliknal i dostal od
 * Vercela "This Deployment is paused by the owner" (DEPLOYMENT_PAUSED) - pod
 * adresem dial.to, nie naszym. Zewnetrzny serwis padl, a nasz przycisk byl do
 * niego przywiazany.
 *
 * Ten panel robi dokladnie to, co robil dial.to: pyta nasza wlasna akcje
 * (POST /api/actions/tip/[postId]) o transakcje i daje ja portfelowi do
 * podpisu. Ta sama trasa obsluguje Blinka w rozszerzeniach, wiec logika
 * napiwku istnieje w jednym miejscu.
 *
 * === WYGLAD I PORTFEL (23.09.2026) ===
 * Wczesniej kazda kwota byla osobnym gradientowym przyciskiem, ktory od razu
 * placil. Teraz jak w panelu odpowiedzi: przelacznik kwoty (z "Other") i jeden
 * przycisk, ktory mowi, ile wysle. Portfel przez useBlinkWallet - bez portfela
 * w przegladarce (X) zamiast pustego modala stoi "Open this page in your
 * wallet", a wybrana kwota jedzie w adresie (`amount`).
 */

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { Transaction } from '@solana/web3.js';
import { Buffer } from 'buffer';
import { confirmOrAskChain } from '../../../basechat/Solana/confirm';
import { isInsufficientFunds, isRentError, isUserRejection } from '../../../basechat/Solana/walletErrors';
import { solanaExplorerTxUrl } from '../../../basechat/Solana/config/solanaChain';
import { useBlinkWallet } from '../../components/useBlinkWallet';
import OpenInWallet from '../../components/OpenInWallet';
import { takeCarriedParams } from '../../components/walletLinks';
import {
  AmountSegments,
  FOCUS_RING,
  formatAmount,
  LINK_CLASS,
  PrimaryButton,
  SignatureLine,
  StatusCard,
  WalletLine,
} from '../../components/ui';

const PRESETS_SOL = [0.01, 0.05, 0.25];
const OTHER = 'other';

type PanelState =
  | { kind: 'idle' }
  | { kind: 'busy'; step: string }
  | { kind: 'done'; signature: string; amount: number }
  | { kind: 'error'; message: string; signature?: string };

export default function TipPanel({ postId, author }: { postId: string; author: string }) {
  const { connection } = useConnection();
  const { publicKey, sendTransaction, connected } = useWallet();
  const blinkWallet = useBlinkWallet();
  const [choice, setChoice] = useState<string>(String(PRESETS_SOL[1]));
  const [custom, setCustom] = useState('');
  const [state, setState] = useState<PanelState>({ kind: 'idle' });
  const customRef = useRef<HTMLInputElement>(null);

  // Kwota przeniesiona z przegladarki X do przegladarki portfela.
  const carriedRead = useRef(false);
  useEffect(() => {
    if (carriedRead.current) return;
    carriedRead.current = true;
    const carried = takeCarriedParams(['amount'] as const);
    const value = Number(carried.amount);
    if (!carried.amount || !Number.isFinite(value) || value <= 0) return;
    if (PRESETS_SOL.includes(value)) {
      setChoice(String(value));
    } else {
      setChoice(OTHER);
      setCustom(carried.amount);
    }
  }, []);

  const amount = choice === OTHER ? Number(custom) : Number(choice);
  const amountReady = choice !== OTHER || custom.trim() !== '';

  async function tip(amount: number) {
    if (!connected || !publicKey) {
      blinkWallet.requestConnect();
      return;
    }
    if (!Number.isFinite(amount) || amount < 0.001) {
      setState({ kind: 'error', message: 'Tips start at 0.001 SOL.' });
      return;
    }

    setState({ kind: 'busy', step: 'Preparing your tip…' });
    try {
      const res = await fetch(`/api/actions/tip/${postId}?amount=${amount}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account: publicKey.toBase58() }),
      });
      const body = (await res.json()) as { transaction?: string; message?: string };
      if (!res.ok || !body.transaction) {
        setState({ kind: 'error', message: body.message ?? 'Could not prepare the tip.' });
        return;
      }

      const transaction = Transaction.from(Buffer.from(body.transaction, 'base64'));
      // Swiezy blockhash TUTAJ, a nie ten z serwera: okno waznosci (~minuta)
      // ma startowac w chwili podpisu, nie w chwili zapytania. Transakcja jest
      // jeszcze niepodpisana, wiec jej podmiana niczego nie psuje.
      const latest = await connection.getLatestBlockhash('confirmed');
      transaction.recentBlockhash = latest.blockhash;

      setState({ kind: 'busy', step: 'Check your wallet…' });
      const signature = await sendTransaction(transaction, connection);
      setState({ kind: 'busy', step: 'Confirming on Solana…' });
      const outcome = await confirmOrAskChain(
        connection,
        signature,
        latest.blockhash,
        latest.lastValidBlockHeight
      );

      if (outcome.kind === 'landed') {
        setState({ kind: 'done', signature, amount });
      } else if (outcome.kind === 'failed') {
        setState({ kind: 'error', message: `The network rejected the tip: ${outcome.detail}` });
      } else if (outcome.kind === 'unknown') {
        // Podpis zostaje na ekranie z linkiem - bez tego drugi napiwek "na
        // wszelki wypadek" potrafil zaplacic dwa razy.
        setState({
          kind: 'error',
          message: 'We could not confirm the tip with the network. Check the transaction before tipping again.',
          signature,
        });
      } else {
        setState({ kind: 'error', message: 'The network did not confirm the tip in time. Nothing was charged.' });
      }
    } catch (error) {
      if (isUserRejection(error)) {
        setState({ kind: 'idle' });
      } else if (isRentError(error)) {
        setState({ kind: 'error', message: "The author's wallet is empty, and Solana needs at least ~0.0009 SOL to open it. Try a bigger tip." });
      } else if (isInsufficientFunds(error)) {
        setState({ kind: 'error', message: 'Not enough SOL in this wallet for the tip and the network fee.' });
      } else {
        setState({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
      }
    }
  }

  if (state.kind === 'done') {
    return (
      <div className="space-y-3">
        <StatusCard tone="success" title="Tip sent" role="status">
          <p>
            <span className="font-semibold tabular-nums text-soft-accent-deep">{formatAmount(state.amount)} SOL</span> went
            to {author}. Thank you.
          </p>
          <a href={solanaExplorerTxUrl(state.signature)} target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
            View transaction
          </a>
        </StatusCard>
        <Link
          href={`/post/${postId}`}
          className={`flex min-h-[48px] w-full items-center justify-center rounded-pill border border-soft-line-strong bg-soft-surface px-5 text-[15px] font-bold text-soft-ink hover:bg-soft-sunken ${FOCUS_RING}`}
        >
          Open the post on MySphere
        </Link>
      </div>
    );
  }

  const busy = state.kind === 'busy';
  const { availability, connectError } = blinkWallet;
  const showConnectError = !connected ? connectError : null;
  const carry = { amount: amountReady && Number.isFinite(amount) && amount > 0 ? String(amount) : undefined };
  const amountLabel = amountReady && Number.isFinite(amount) ? formatAmount(amount) : null;

  let action;
  if (state.kind === 'busy') {
    action = <PrimaryButton busy>{state.step}</PrimaryButton>;
  } else if (connected && publicKey) {
    action = (
      <PrimaryButton onClick={() => tip(amount)} disabled={!amountReady}>
        {amountLabel ? `Send ${amountLabel} SOL tip` : 'Enter an amount'}
      </PrimaryButton>
    );
  } else if (availability === 'none') {
    action = <OpenInWallet carry={carry} />;
  } else if (availability === 'checking') {
    action = <PrimaryButton busy>Looking for your wallet…</PrimaryButton>;
  } else {
    action = (
      <PrimaryButton onClick={() => tip(amount)} busy={blinkWallet.connecting}>
        {blinkWallet.connecting
          ? 'Check your wallet…'
          : blinkWallet.multipleWallets || !blinkWallet.walletName
            ? 'Connect a wallet to tip'
            : `Connect ${blinkWallet.walletName} to tip`}
      </PrimaryButton>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <AmountSegments
          name="tip-amount"
          legend={`Tip ${author}`}
          hint="SOL"
          options={[
            ...PRESETS_SOL.map(value => ({ value: String(value), label: formatAmount(value), srSuffix: 'SOL' })),
            { value: OTHER, label: 'Other' },
          ]}
          value={choice}
          onChange={value => {
            setChoice(value);
            if (state.kind === 'error') setState({ kind: 'idle' });
            // Po wyborze "Other" od razu pole kwoty - inaczej czlowiek szuka, gdzie wpisac.
            if (value === OTHER) requestAnimationFrame(() => customRef.current?.focus());
          }}
          disabled={busy}
        />
        {choice === OTHER && (
          <div className="relative mt-2">
            <label htmlFor="tip-custom" className="sr-only">
              Tip amount in SOL
            </label>
            <input
              id="tip-custom"
              ref={customRef}
              type="number"
              inputMode="decimal"
              min="0.001"
              step="any"
              placeholder="0.1"
              value={custom}
              onChange={event => setCustom(event.target.value)}
              disabled={busy}
              className="min-h-[48px] w-full rounded-2xl border border-soft-line bg-soft-surface pl-3.5 pr-14 text-[15px] tabular-nums text-soft-ink outline-none placeholder:text-soft-ink-muted focus:border-soft-primary focus:ring-2 focus:ring-soft-primary/25 disabled:opacity-60"
            />
            <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-soft-ink-muted">
              SOL
            </span>
          </div>
        )}
      </div>

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
          {state.kind === 'busy' && state.step}
        </p>

        {state.kind === 'error' && (
          <StatusCard tone="error" title={state.message} role="alert">
            {state.signature && (
              <>
                <SignatureLine signature={state.signature} />
                <a href={solanaExplorerTxUrl(state.signature)} target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
                  View transaction
                </a>
              </>
            )}
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
              <OpenInWallet compact carry={carry} />
            </div>
          ))}

        {/* Do 23.09.2026 stalo tu, ze u osob z Blinkami link "otwiera sie jako
            karta w feedzie". Nieprawda, dopoki mysphere.fun nie ma w Dialect
            Actions Registry (sprawdzone 23.09.2026: nie ma) - karta nie
            rysuje sie nikomu. Zdanie o karcie wraca dopiero po wpisie. */}
        <p className="text-xs leading-relaxed text-soft-ink-muted">
          The SOL goes straight to the Solana wallet that signed this post. MySphere does not record tips: the
          transaction is the receipt.
        </p>
      </div>

      <div className="border-t border-soft-line pt-2 text-sm">
        <Link
          href={`/post/${postId}`}
          className={`inline-flex min-h-[44px] items-center rounded font-semibold text-soft-ink-muted hover:text-soft-ink ${FOCUS_RING}`}
        >
          Open the post on MySphere
        </Link>
      </div>
    </div>
  );
}

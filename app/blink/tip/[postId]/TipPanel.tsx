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
 */

import { useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { Transaction } from '@solana/web3.js';
import { Buffer } from 'buffer';
import { confirmOrAskChain } from '../../../basechat/Solana/confirm';
import { isInsufficientFunds, isUserRejection } from '../../../basechat/Solana/walletErrors';
import { SOLANA_NETWORK_LABEL, solanaExplorerTxUrl } from '../../../basechat/Solana/config/solanaChain';

const PRESETS_SOL = [0.01, 0.05, 0.25];

type PanelState =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'done'; signature: string; amount: number }
  | { kind: 'error'; message: string };

export default function TipPanel({ postId }: { postId: string }) {
  const { connection } = useConnection();
  const { publicKey, sendTransaction, connected } = useWallet();
  const { setVisible } = useWalletModal();
  const [custom, setCustom] = useState('');
  const [state, setState] = useState<PanelState>({ kind: 'idle' });

  async function tip(amount: number) {
    if (!connected || !publicKey) {
      setVisible(true);
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setState({ kind: 'error', message: 'Enter an amount greater than zero.' });
      return;
    }

    setState({ kind: 'busy' });
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

      const signature = await sendTransaction(transaction, connection);
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
      } else {
        setState({ kind: 'error', message: 'The network did not confirm the tip in time. Nothing was charged.' });
      }
    } catch (error) {
      if (isUserRejection(error)) {
        setState({ kind: 'idle' });
      } else if (isInsufficientFunds(error)) {
        setState({ kind: 'error', message: 'Not enough SOL in this wallet for the tip and the network fee.' });
      } else {
        setState({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
      }
    }
  }

  if (state.kind === 'done') {
    return (
      <div className="flex flex-col items-center gap-2 rounded-card border border-emerald-200 bg-emerald-50 p-4 text-center">
        <p className="font-semibold text-emerald-800">Sent {state.amount} SOL. Thank you.</p>
        <a
          href={solanaExplorerTxUrl(state.signature)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-emerald-800 underline"
        >
          View the transaction
        </a>
      </div>
    );
  }

  const busy = state.kind === 'busy';

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2">
        {PRESETS_SOL.map(amount => (
          <button
            key={amount}
            type="button"
            disabled={busy}
            onClick={() => tip(amount)}
            className="rounded-pill bg-gradient-to-r from-[#9945FF] to-[#14F195] px-3 py-2.5 font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {amount} SOL
          </button>
        ))}
      </div>

      <form
        className="flex gap-2"
        onSubmit={event => {
          event.preventDefault();
          tip(Number(custom));
        }}
      >
        <input
          type="number"
          inputMode="decimal"
          min="0"
          step="any"
          placeholder="Other amount (SOL)"
          value={custom}
          onChange={event => setCustom(event.target.value)}
          disabled={busy}
          aria-label="Tip amount in SOL"
          className="min-w-0 flex-1 rounded-pill border border-soft-line bg-soft-surface px-4 py-2 text-soft-ink outline-none focus:ring-2 focus:ring-[#9945FF]"
        />
        <button
          type="submit"
          disabled={busy || !custom}
          className="rounded-pill border border-[#9945FF] px-4 py-2 font-semibold text-[#6d28d9] disabled:opacity-50"
        >
          Tip
        </button>
      </form>

      <p className="text-center text-xs text-soft-ink-muted" role="status">
        {busy
          ? 'Waiting for your wallet…'
          : !connected
            ? `Clicking an amount connects your Solana wallet first. Runs on ${SOLANA_NETWORK_LABEL}.`
            : `Connected: ${publicKey?.toBase58().slice(0, 4)}…${publicKey?.toBase58().slice(-4)} on ${SOLANA_NETWORK_LABEL}.`}
      </p>

      {state.kind === 'error' && (
        <p className="text-center text-sm text-rose-700" role="alert">
          {state.message}
        </p>
      )}
    </div>
  );
}

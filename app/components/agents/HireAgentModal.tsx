'use client';

import { useEffect, useState } from 'react';
import { useAccount, useSendTransaction, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther } from 'viem';
import { toast } from 'react-hot-toast';
import type { AgentSummary } from '@registrai/kya';

/**
 * "Wynajmij agenta" - zlecenie i zaplata bez wychodzenia z czatu.
 *
 * To jest pozycja 1.5 z REDEFINICJA.md i sedno tezy produktu: zaufanie do
 * agenta i zaplata za jego prace w JEDNYM przeplywie. Dotad jedno bylo
 * w osobnym hubie /MyAgents, a drugiego nie bylo wcale.
 *
 * Platnosc idzie tym samym wzorcem co TipButton po migracji z OnchainKit:
 * useSendTransaction -> useWaitForTransactionReceipt -> reakcja na potwierdzenie.
 * KLUCZOWE: `receipt.status === 'reverted'` jest bledem, nie sukcesem. OnchainKit
 * raportowal sukces po samym wejsciu transakcji na lancuch, przez co cofnieta
 * transakcja zapisywala platnosc, ktora nigdy nie doszla.
 */

const PRESET_AMOUNTS = ['0.0005', '0.001', '0.005'] as const;

export default function HireAgentModal({
  agent,
  isOpen,
  onClose,
}: {
  agent: AgentSummary | null;
  isOpen: boolean;
  onClose: () => void;
}) {
  const { address, isConnected } = useAccount();
  const [amount, setAmount] = useState<string>(PRESET_AMOUNTS[1]);
  const [brief, setBrief] = useState('');

  const { sendTransaction, data: txHash, error: sendError, isPending, reset } = useSendTransaction();
  const { data: receipt, isLoading: isConfirming } = useWaitForTransactionReceipt({
    hash: txHash,
    query: { enabled: !!txHash },
  });

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!receipt) return;
    if (receipt.status === 'success') {
      toast.success('Request sent to the agent.');
      setBrief('');
      onClose();
    } else {
      // Transakcja weszla na lancuch, ale sie cofnela - platnosc NIE doszla.
      toast.error('Transaction reverted. Nothing was charged.');
    }
    reset();
  }, [receipt, onClose, reset]);

  useEffect(() => {
    if (!sendError) return;
    const rejected = /user rejected|denied/i.test(sendError.message);
    if (!rejected) toast.error('Could not send the request.');
    reset();
  }, [sendError, reset]);

  if (!isOpen || !agent) return null;

  const payTo = agent.ownerAddress as `0x${string}` | undefined;
  const score = typeof agent.score === 'number' ? agent.score : null;
  // `isPending` to czas miedzy klikiem a odpowiedzia portfela. Bez niego
  // przycisk zostawal aktywny, kiedy okno portfela bylo juz otwarte - a kazde
  // kolejne klikniecie to osobna proba platnosci.
  const isBusy = isPending || (!!txHash && isConfirming);

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Hire this agent"
    >
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative w-full max-w-[380px] overflow-hidden rounded-2xl border border-white/10 bg-[#0A1024]/95 shadow-[0_24px_64px_-16px_rgba(0,0,0,0.75)] backdrop-blur-xl">
        <div className="border-b border-white/[0.08] px-5 py-4">
          <h2 className="font-['Coinbase_Display'] text-[15px] font-semibold text-[#EEF3FF]">
            Hire this agent
          </h2>
          <p className="mt-1 text-[12px] text-[#93A5C9]">
            {agent.masterAgentId}
            {score !== null && <span className="text-[#5C6F94]"> · trust {score}</span>}
          </p>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div>
            <label
              htmlFor="hire-brief"
              className="mb-1.5 block text-[12px] font-medium text-[#C7D4EE]"
            >
              What do you need?
            </label>
            <textarea
              id="hire-brief"
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              rows={3}
              placeholder="Describe the task in one or two sentences."
              className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[13px] text-[#EEF3FF] outline-none placeholder:text-[#5C6F94] focus:border-[#0052FF]"
            />
          </div>

          <div>
            <span className="mb-1.5 block text-[12px] font-medium text-[#C7D4EE]">Budget</span>
            <div className="flex gap-2">
              {PRESET_AMOUNTS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setAmount(preset)}
                  className={`flex-1 rounded-xl border px-3 py-2 text-[13px] tabular-nums transition-colors ${
                    amount === preset
                      ? 'border-[#0052FF] bg-[#0052FF]/15 text-[#EEF3FF]'
                      : 'border-white/10 text-[#93A5C9] hover:border-white/20'
                  }`}
                >
                  {preset} ETH
                </button>
              ))}
            </div>
          </div>

          {!payTo && (
            <p className="text-[12px] text-[#FF8A8A]">
              This agent has no payout address, so it cannot be hired yet.
            </p>
          )}

          <button
            type="button"
            disabled={!isConnected || !payTo || !brief.trim() || isBusy}
            onClick={() => {
              if (!payTo) return;
              sendTransaction({ to: payTo, value: parseEther(amount) });
            }}
            className="w-full rounded-xl bg-[#0052FF] px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#0052FF]/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {!isConnected
              ? 'Connect a wallet first'
              : isBusy
              ? 'Confirming…'
              : `Send ${amount} ETH`}
          </button>

          {/* Uczciwie o tym, czym to jest: platnosc bezposrednia do agenta,
              bez escrow i bez gwarancji wykonania. Nie udajemy inaczej. */}
          <p className="text-[11px] leading-relaxed text-[#5C6F94]">
            Payment goes straight to the agent&apos;s address. There is no escrow and no
            automatic refund — hire agents whose reputation you can see.
          </p>
        </div>
      </div>
    </div>
  );
}

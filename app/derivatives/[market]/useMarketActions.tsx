'use client';

import { useState } from 'react';
import { toast } from 'react-hot-toast';
import { isAddress, maxUint256, type Address } from 'viem';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { DERIV_CHAIN, ORACLE_ADDRESS, USDC_ADDRESS, erc20Abi, marketAbi, oracleAbi } from '../config';
import type { R, Snapshot } from './types';

/** Cudza pozycja sprawdzona pod katem likwidacji (panel keepera). */
export type Probe = { address: Address; size: bigint; notional: bigint; ratioBps: R<bigint> } | 'empty' | null;

/**
 * Wszystkie ZAPISY na rynku. Kazde `writeContract` przeniesione z
 * MarketDetail.tsx co do argumentu; nowe jest tylko `toast` po udanej
 * transakcji z linkiem do Arcscan - trader nie musi szukac hasha w portfelu.
 */
export function useMarketActions({ market, snap, reload }: { market: Address; snap: Snapshot | null; reload: () => Promise<void> }) {
  const { address } = useAccount();
  const client = usePublicClient({ chainId: DERIV_CHAIN.id });
  const { data: wallet } = useWalletClient();

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [probe, setProbe] = useState<Probe>(null);

  const explorer = DERIV_CHAIN.blockExplorers?.default.url;

  function announce(label: string, hash: string) {
    toast.success(
      explorer ? (
        <a href={`${explorer}/tx/${hash}`} target="_blank" rel="noreferrer" className="underline">
          {label} - view on Arcscan
        </a>
      ) : (
        label
      ),
    );
  }

  async function withBusy(label: string, fn: () => Promise<string | void>) {
    setError(null);
    setBusy(label);
    try {
      const hash = await fn();
      await reload();
      if (hash) announce(label.replace(/\.\.\.$/, ''), hash);
    } catch (e: unknown) {
      const err = e as { shortMessage?: string; message?: string };
      setError(err?.shortMessage || err?.message || 'Transaction rejected.');
    } finally {
      setBusy(null);
    }
  }


  async function open(side: 'long' | 'short', marginAmount: bigint, leverage: number) {
    if (!wallet || !client || !address) return;
    await withBusy('Opening position...', async () => {
      const allowance = (await client.readContract({
        address: USDC_ADDRESS,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [address, market],
      })) as bigint;
      if (allowance < marginAmount) {
        const approveHash = await wallet.writeContract({
          address: USDC_ADDRESS,
          abi: erc20Abi,
          functionName: 'approve',
          args: [market, maxUint256],
          chain: DERIV_CHAIN,
          account: address,
        });
        await client.waitForTransactionReceipt({ hash: approveHash });
      }
      const hash = await wallet.writeContract({
        address: market,
        abi: marketAbi,
        functionName: 'openPosition',
        args: [side === 'long', marginAmount, leverage],
        chain: DERIV_CHAIN,
        account: address,
      });
      await client.waitForTransactionReceipt({ hash });
      return hash;
    });
  }

  async function close() {
    if (!wallet || !client || !address) return;
    await withBusy('Closing position...', async () => {
      const hash = await wallet.writeContract({
        address: market,
        abi: marketAbi,
        functionName: 'closePosition',
        chain: DERIV_CHAIN,
        account: address,
      });
      await client.waitForTransactionReceipt({ hash });
      return hash;
    });
  }

  async function settle() {
    if (!wallet || !client || !address) return;
    await withBusy('Settling funding...', async () => {
      const hash = await wallet.writeContract({
        address: market,
        abi: marketAbi,
        functionName: 'settleFunding',
        chain: DERIV_CHAIN,
        account: address,
      });
      await client.waitForTransactionReceipt({ hash });
      return hash;
    });
  }

  async function checkTarget(probeTarget: string) {
    if (!client || !isAddress(probeTarget)) return;
    const target = probeTarget as Address;
    setError(null);
    const [posRes, ratioRes] = await client.multicall({
      contracts: [
        { address: market, abi: marketAbi, functionName: 'getPosition', args: [target] },
        { address: market, abi: marketAbi, functionName: 'marginRatioBps', args: [target] },
      ],
      allowFailure: true,
    });
    const pos = posRes.status === 'success' ? (posRes.result as readonly unknown[]) : null;
    if (!pos || (pos[0] as bigint) === 0n) {
      setProbe('empty');
      return;
    }
    setProbe({
      address: target,
      size: pos[0] as bigint,
      notional: pos[2] as bigint,
      ratioBps: ratioRes.status === 'success' ? (ratioRes.result as bigint) : null,
    });
  }

  async function liquidate() {
    if (!wallet || !client || !address || probe === null || probe === 'empty') return;
    await withBusy('Liquidating...', async () => {
      const hash = await wallet.writeContract({
        address: market,
        abi: marketAbi,
        functionName: 'liquidate',
        args: [probe.address],
        chain: DERIV_CHAIN,
        account: address,
      });
      await client.waitForTransactionReceipt({ hash });
      setProbe(null);
      return hash;
    });
  }

  async function submitPrice(price: bigint) {
    if (!wallet || !client || !address || !snap) return;
    await withBusy('Submitting price...', async () => {
      const hash = await wallet.writeContract({
        address: ORACLE_ADDRESS,
        abi: oracleAbi,
        functionName: 'submitPrice',
        args: [snap.id, price, BigInt(Math.floor(Date.now() / 1_000))],
        chain: DERIV_CHAIN,
        account: address,
      });
      await client.waitForTransactionReceipt({ hash });
      return hash;
    });
  }

  return { busy, error, probe, setProbe, open, close, settle, checkTarget, liquidate, submitPrice };
}

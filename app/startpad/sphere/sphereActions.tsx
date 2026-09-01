'use client';

/**
 * Wspolne klocki podstron zarzadzania: przycisk akcji write z gotowymi
 * argumentami (kuratorskie sciezki - dostawa fee, release, pull) i wiersz
 * odczytu. Pelna powierzchnia ABI mieszka w AbiConsole; te klocki to
 * "szybkie akcje" nad nia.
 */

import { useCallback, useEffect, useState } from 'react';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { Loader2 } from 'lucide-react';
import type { Abi, Address } from 'viem';
// Odczyty i zapisy huba ida ZAWSZE na Base - uzasadnienie w ./sphereChain.ts.
import { SPHERE_CHAIN } from './sphereChain';
import { SPHERE_ESCROW_ADDRESS, sphereCreatorEscrowAbi } from './sphereConfig';

/**
 * Czy podlaczony portfel to tworca SPHERE (LAUNCH_AUTHORITY escrow)?
 *
 * Tworca on-chain jest KONTRAKT (escrow-as-creator, sekcja 8 tokenomiki),
 * wiec "tworca" w UI znaczy: adres, ktory escrow sam deklaruje przez
 * LAUNCH_AUTHORITY(). Zadnego hardkodu EOA - jedno zrodlo prawdy, lancuch.
 * Ta sama bramka stoi po stronie serwera (api/launchpad/token/route.ts)
 * i w UI strony tokena (LaunchpadTokenDetail).
 *
 * LAUNCH_AUTHORITY jest immutable, stad cache na poziomie modulu: N paneli
 * montujacych sie naraz robi DOKLADNIE jeden odczyt RPC na zaladowanie strony.
 */
let sphereAuthorityPromise: Promise<string> | null = null;
export function useSphereCreator(): boolean {
  const { address: account } = useAccount();
  const readClient = usePublicClient({ chainId: SPHERE_CHAIN.id });
  const [authority, setAuthority] = useState<string | null>(null);
  useEffect(() => {
    // Pre-deploy (escrow bez adresu): nikt nie jest tworca.
    if (!readClient || !SPHERE_ESCROW_ADDRESS) return;
    sphereAuthorityPromise ??= readClient
      .readContract({
        address: SPHERE_ESCROW_ADDRESS,
        abi: sphereCreatorEscrowAbi,
        functionName: 'LAUNCH_AUTHORITY',
      })
      .then((a) => (a as string).toLowerCase())
      .catch((cause) => {
        // Nieudany odczyt nie moze zatruc cache'u na caly czas zycia karty.
        sphereAuthorityPromise = null;
        throw cause;
      });
    let stale = false;
    sphereAuthorityPromise.then((a) => {
      if (!stale) setAuthority(a);
    }).catch(() => {});
    return () => {
      stale = true;
    };
  }, [readClient]);
  return Boolean(account && authority && account.toLowerCase() === authority);
}

export function useSphereRead<T>(
  reader: (client: NonNullable<ReturnType<typeof usePublicClient>>) => Promise<T>,
  deps: unknown[] = []
) {
  const readClient = usePublicClient({ chainId: SPHERE_CHAIN.id });
  const [value, setValue] = useState<T | null>(null);
  useEffect(() => {
    if (!readClient) return;
    let alive = true;
    const load = async () => {
      try {
        const v = await reader(readClient);
        if (alive) setValue(v);
      } catch {
        /* kolejny interwal sprobuje znowu */
      }
    };
    void load();
    const t = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readClient, ...deps]);
  return value;
}

export function ActionButton({
  label,
  address,
  abi,
  functionName,
  args = [],
  value,
  disabled,
  onDone,
}: {
  label: string;
  address: Address;
  abi: Abi;
  functionName: string;
  args?: unknown[];
  value?: bigint;
  disabled?: boolean;
  onDone?: () => void;
}) {
  const { address: account } = useAccount();
  const { data: walletClient } = useWalletClient();
  const readClient = usePublicClient({ chainId: SPHERE_CHAIN.id });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const run = useCallback(async () => {
    if (!walletClient || !account || !readClient) {
      setFailed(true);
      setNotice('Connect wallet');
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const hash = await walletClient.writeContract({
        address,
        abi,
        functionName,
        args,
        value,
        chain: SPHERE_CHAIN,
        account,
      } as never);
      await readClient.waitForTransactionReceipt({ hash });
      setFailed(false);
      setNotice(`Done: ${hash.slice(0, 10)}…`);
      onDone?.();
    } catch (error) {
      setFailed(true);
      setNotice((error instanceof Error ? error.message.split('\n')[0] : String(error)).slice(0, 120));
    } finally {
      setBusy(false);
    }
  }, [walletClient, account, readClient, address, abi, functionName, args, value, onDone]);

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={run}
        disabled={busy || disabled}
        className="inline-flex items-center gap-1.5 rounded-full bg-sp-brand px-3.5 py-1.5 text-[11.5px] font-extrabold text-white transition-opacity disabled:opacity-40"
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : null}
        {label}
      </button>
      {notice && <span className={`text-[10.5px] font-bold ${failed ? 'text-sp-down' : 'text-sp-up'}`}>{notice}</span>}
    </span>
  );
}

export function StatRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-sp-shade/8 py-1.5 last:border-0">
      <span className="text-[11.5px] font-bold text-sp-shade/55">{label}</span>
      <span className="break-all text-right font-mono text-[12px] font-extrabold text-sp-ink">{value}</span>
    </div>
  );
}

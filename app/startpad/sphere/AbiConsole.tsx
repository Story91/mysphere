'use client';

/**
 * Konsola ABI - CALA powierzchnia kontraktu w UI, bez recznego mapowania.
 *
 * Bierze adres + ABI i renderuje:
 *  - kazda funkcje `view` bez argumentow: wartosc czytana automatycznie,
 *  - kazda funkcje `view` z argumentami: formularz + przycisk Read,
 *  - kazda funkcje piszaca: formularz argumentow + Write (walletClient,
 *    ta sama sciezka co board: writeContract z chain+account).
 *
 * To jest warstwa "Advanced" stron /startpad/sphere/* - kuratorskie akcje
 * mieszkaja wyzej, w kartach; konsola gwarantuje, ze ZADNA funkcja
 * wdrozonych kontraktow nie jest niedostepna z UI.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { formatEther, parseEther, zeroAddress, type Abi, type AbiFunction, type Address } from 'viem';
import { ChevronDown, ChevronUp, Loader2, PencilLine, RefreshCw } from 'lucide-react';
// Hub SPHERE jest przybity do Base - uzasadnienie w ./sphereChain.ts.
import { SPHERE_CHAIN, SPHERE_EXPLORER_URL, SPHERE_NATIVE_SYMBOL } from './sphereChain';
import { SPHERE_FN_DOCS } from './sphereConfig';
import { useSphereCreator } from './sphereActions';

const inputClass =
  'w-full rounded-xl border border-sp-shade/10 bg-sp-surface px-3 py-2 text-[12.5px] text-sp-ink outline-none transition-colors placeholder:text-sp-shade/35 focus:border-sp-brand';

type Notice = { kind: 'ok' | 'error'; text: string } | null;

function fnLabel(fn: AbiFunction) {
  return `${fn.name}(${fn.inputs.map((i) => i.type).join(', ')})`;
}

/** Parsowanie wartosci z inputa wg typu ABI. ETH-owe kwoty user podaje w ETH. */
function parseArg(type: string, raw: string): unknown {
  const v = raw.trim();
  if (type.endsWith('[]')) {
    return v === '' ? [] : v.split(',').map((part) => parseArg(type.slice(0, -2), part));
  }
  if (type.startsWith('uint') || type.startsWith('int')) {
    if (v.includes('.')) return parseEther(v as `${number}`);
    return BigInt(v === '' ? '0' : v);
  }
  if (type === 'bool') return v === 'true' || v === '1';
  return v;
}

function renderResult(value: unknown): string {
  if (typeof value === 'bigint') {
    // Duze liczby pokazujemy podwojnie: surowo i w ETH - wiekszosc wartosci
    // tych kontraktow to wei albo sekundy; user sam widzi, ktora skala gra.
    return value >= 10n ** 12n ? `${formatEther(value)} (${value.toString()} wei)` : value.toString();
  }
  if (Array.isArray(value)) return value.map(renderResult).join(', ');
  // Zero address = wartosc nieustawiona (np. sphereToken() przed launchem).
  if (typeof value === 'string' && value.toLowerCase() === zeroAddress) {
    return `${zeroAddress} (zero address - not set)`;
  }
  return String(value);
}

function WriteRow({ address, abi, fn }: { address: Address; abi: Abi; fn: AbiFunction }) {
  const { address: account } = useAccount();
  const { data: walletClient } = useWalletClient();
  const readClient = usePublicClient({ chainId: SPHERE_CHAIN.id });
  const [args, setArgs] = useState<string[]>(() => fn.inputs.map(() => ''));
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const doWrite = useCallback(async () => {
    if (!walletClient || !account || !readClient) {
      setNotice({ kind: 'error', text: 'Connect your wallet first.' });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const parsed = fn.inputs.map((input, i) => parseArg(input.type, args[i] ?? ''));
      const hash = await walletClient.writeContract({
        address,
        abi,
        functionName: fn.name,
        args: parsed,
        value: fn.stateMutability === 'payable' && value ? parseEther(value as `${number}`) : undefined,
        chain: SPHERE_CHAIN,
        account,
      } as never);
      await readClient.waitForTransactionReceipt({ hash });
      setNotice({ kind: 'ok', text: `Done: ${hash.slice(0, 10)}…` });
    } catch (error) {
      const msg = error instanceof Error ? error.message.split('\n')[0] : String(error);
      setNotice({ kind: 'error', text: msg.slice(0, 160) });
    } finally {
      setBusy(false);
    }
  }, [walletClient, account, readClient, address, abi, fn, args, value]);

  return (
    <div className="rounded-xl border border-sp-shade/10 bg-sp-surface p-3">
      <div className="flex items-center gap-2">
        <PencilLine className="h-3.5 w-3.5 shrink-0 text-sp-brand" aria-hidden="true" />
        <span className="font-mono text-[12px] font-bold text-sp-ink">{fnLabel(fn)}</span>
        {fn.stateMutability === 'payable' && (
          <span className="rounded-full bg-sp-brand/10 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.06em] text-sp-brand">payable</span>
        )}
      </div>
      {SPHERE_FN_DOCS[fn.name] && (
        <p className="mt-1 text-[11px] text-sp-shade/55">{SPHERE_FN_DOCS[fn.name]}</p>
      )}
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {fn.inputs.map((input, i) => (
          <input
            key={`${fn.name}-${i}`}
            value={args[i] ?? ''}
            onChange={(e) => setArgs((prev) => prev.map((a, j) => (j === i ? e.target.value : a)))}
            placeholder={`${input.name || 'arg'} (${input.type})`}
            className={inputClass}
          />
        ))}
        {fn.stateMutability === 'payable' && (
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={`value (${SPHERE_NATIVE_SYMBOL})`}
            className={inputClass}
          />
        )}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={doWrite}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-full bg-sp-brand px-3.5 py-1.5 text-[11.5px] font-extrabold text-white transition-opacity disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : null}
          Write
        </button>
        {notice && (
          <span className={`text-[11px] font-bold ${notice.kind === 'ok' ? 'text-sp-up' : 'text-sp-down'}`}>{notice.text}</span>
        )}
      </div>
    </div>
  );
}

function ReadRow({ address, abi, fn }: { address: Address; abi: Abi; fn: AbiFunction }) {
  const readClient = usePublicClient({ chainId: SPHERE_CHAIN.id });
  const [args, setArgs] = useState<string[]>(() => fn.inputs.map(() => ''));
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const auto = fn.inputs.length === 0;

  const doRead = useCallback(async () => {
    if (!readClient) return;
    try {
      const parsed = fn.inputs.map((input, i) => parseArg(input.type, args[i] ?? ''));
      const value = await readClient.readContract({ address, abi, functionName: fn.name, args: parsed } as never);
      // sphereToken() zwraca 0x0 przed launchem - nazywamy stan wprost.
      if (fn.name === 'sphereToken' && typeof value === 'string' && value.toLowerCase() === zeroAddress) {
        setResult('Token not launched yet (sphereToken() = zero address)');
      } else {
        setResult(renderResult(value));
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message.split('\n')[0].slice(0, 120) : String(err));
    }
  }, [readClient, address, abi, fn, args]);

  useEffect(() => {
    if (auto) void doRead();
    // Odczyty bezargumentowe odswiezamy razem (interwal jak claimables boardu).
    if (!auto) return;
    const t = setInterval(() => void doRead(), 30_000);
    return () => clearInterval(t);
  }, [auto, doRead]);

  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-sp-shade/10 bg-sp-surface p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[12px] font-bold text-sp-ink">{fnLabel(fn)}</span>
        {!auto && (
          <button type="button" onClick={doRead} className="inline-flex items-center gap-1 rounded-full border border-sp-shade/15 px-2.5 py-1 text-[10.5px] font-extrabold text-sp-shade/70 hover:border-sp-brand hover:text-sp-brand">
            <RefreshCw className="h-3 w-3" aria-hidden="true" /> Read
          </button>
        )}
      </div>
      {SPHERE_FN_DOCS[fn.name] && <p className="text-[11px] text-sp-shade/55">{SPHERE_FN_DOCS[fn.name]}</p>}
      {!auto && (
        <div className="grid gap-2 sm:grid-cols-2">
          {fn.inputs.map((input, i) => (
            <input
              key={`${fn.name}-${i}`}
              value={args[i] ?? ''}
              onChange={(e) => setArgs((prev) => prev.map((a, j) => (j === i ? e.target.value : a)))}
              placeholder={`${input.name || 'arg'} (${input.type})`}
              className={inputClass}
            />
          ))}
        </div>
      )}
      {result !== null && <p className="break-all font-mono text-[11.5px] text-sp-up">{result}</p>}
      {error && <p className="break-all text-[11px] text-sp-down">{error}</p>}
    </div>
  );
}

export default function AbiConsole({ title, address, abi }: { title: string; address: Address; abi: Abi }) {
  const [open, setOpen] = useState(false);
  // Konsola jest narzedziem TWORCY (decyzja wlasciciela 2026-09-01): surowe
  // formularze write'ow typu escrow.launch() czy rewards.pull() u zwyklego
  // gościa koncza sie tylko rewertem i spalonym gazem. Odczyty publiczne sa
  // na Basescanie - link zostaje w nocie ponizej.
  const isCreator = useSphereCreator();
  const fns = useMemo(() => abi.filter((e): e is AbiFunction => e.type === 'function'), [abi]);
  const reads = fns.filter((f) => f.stateMutability === 'view' || f.stateMutability === 'pure');
  const writes = fns.filter((f) => f.stateMutability !== 'view' && f.stateMutability !== 'pure');

  if (!isCreator) {
    return (
      <p className="text-[11px] text-sp-shade/45">
        Creator console hidden - it only renders for the SPHERE creator wallet. All reads are public on{' '}
        <a href={`${SPHERE_EXPLORER_URL}/address/${address}`} target="_blank" rel="noreferrer" className="font-bold text-sp-brand hover:underline">
          Basescan
        </a>
        .
      </p>
    );
  }

  return (
    <section className="sph-card rounded-[20px] border border-sp-shade/10 bg-sp-surface p-4">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-2">
        <div className="text-left">
          <h3 className="text-[13.5px] font-extrabold text-sp-ink">Advanced · {title} - full contract surface</h3>
          <p className="mt-0.5 text-[11px] text-sp-shade/50">
            Every function from the deployed ABI ({reads.length} reads, {writes.length} writes) ·{' '}
            <a
              href={`${SPHERE_EXPLORER_URL}/address/${address}`}
              target="_blank"
              rel="noreferrer"
              className="font-bold text-sp-brand hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {address.slice(0, 8)}…{address.slice(-6)}
            </a>
          </p>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-sp-shade/50" aria-hidden="true" /> : <ChevronDown className="h-4 w-4 text-sp-shade/50" aria-hidden="true" />}
      </button>
      {open && (
        <div className="mt-3 grid gap-2.5">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-sp-shade/40">Reads</p>
          {reads.map((fn) => (
            <ReadRow key={fnLabel(fn)} address={address} abi={abi} fn={fn} />
          ))}
          <p className="mt-1 text-[10px] font-extrabold uppercase tracking-[0.08em] text-sp-shade/40">Writes</p>
          {writes.map((fn) => (
            <WriteRow key={fnLabel(fn)} address={address} abi={abi} fn={fn} />
          ))}
        </div>
      )}
    </section>
  );
}

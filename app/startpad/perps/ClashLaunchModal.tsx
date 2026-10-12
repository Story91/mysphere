'use client';

import { useState } from 'react';
import Link from 'next/link';
import { decodeEventLog, parseEther, type Address, type Hex } from 'viem';
import { base } from 'viem/chains';
import { useAccount, useChainId, usePublicClient, useSwitchChain, useWalletClient } from 'wagmi';
import { Swords, X } from 'lucide-react';
import { LAUNCHPAD_NETWORKS, launchpadAbi, quoteLaunchpadAbi } from '../config';
import { clashSymbol, cleanClashTicker, newClashId, perpBaseOf, type ClashSide } from '../duel';
import { resizeImageFile } from '../logoUpload';
import { tradeErrorMessage } from '../[address]/detailShared';
import PerpAvatar from './PerpAvatar';

/**
 * Start starcia Asset Clash: DWIE transakcje tworcy, kazda na launchpadzie
 * innego perpa (np. ETH2xL i NVDA2xL). Oba tokeny niosa w metadanych ten sam
 * `duel.id` i strone a/b. Tworca musi byc msg.sender obu startow (oplaty
 * tworcy, para sprawdzana po tworcy). Gdy druga transakcja odpadnie, okno
 * pozwala ja powtorzyc z tym samym id. Bez pre-buya: kupno idzie potem za ETH.
 */

const CHAIN_ID = 8453;
const T0_WEI = parseEther('1000000000');
const FIELD =
  'w-full rounded-xl border border-sp-shade/10 bg-sp-surface px-3.5 py-3 text-[14px] text-sp-ink outline-none transition-colors placeholder:text-sp-shade/35 focus:border-sp-brand';

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}

export default function ClashLaunchModal({ onClose }: { onClose: () => void }) {
  const { address } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { data: walletClient } = useWalletClient();
  const client = usePublicClient({ chainId: CHAIN_ID });

  const markets = LAUNCHPAD_NETWORKS[CHAIN_ID]?.markets ?? [];
  const [sideA, setSideA] = useState(markets.find((m) => m.id === 'eth2xl')?.id ?? markets[0]?.id ?? '');
  const [sideB, setSideB] = useState(markets.find((m) => m.id === 'nvda2xl')?.id ?? markets[1]?.id ?? '');
  const [name, setName] = useState('');
  const [ticker, setTicker] = useState('');
  const [description, setDescription] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [busy, setBusy] = useState<ClashSide | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clashId] = useState(() => newClashId());
  const [done, setDone] = useState<Partial<Record<ClashSide, Address>>>({});

  const marketOf = (side: ClashSide) => markets.find((m) => m.id === (side === 'a' ? sideA : sideB));
  const clean = cleanClashTicker(ticker);
  const locked = Boolean(done.a);
  const ready = name.trim().length > 0 && clean.length >= 2 && sideA !== sideB && Boolean(marketOf('a')) && Boolean(marketOf('b'));
  const symbolOf = (side: ClashSide) => {
    const m = marketOf(side);
    return m ? clashSymbol(clean || 'TICKER', m.quote.symbol) : '';
  };
  const nameOf = (side: ClashSide) => {
    const m = marketOf(side);
    return `${name.trim()} on ${m ? perpBaseOf(m.quote.symbol) : ''}`;
  };

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    setImageError(null);
    try {
      // 128 px trzyma metadane na lancuchu male (kilkanascie kB calldata na start).
      setImage(await resizeImageFile(file, 128));
    } catch (cause) {
      setImageError(cause instanceof Error ? cause.message : 'This image could not be read.');
    }
  };

  const metadataFor = (side: ClashSide) => {
    const payload: Record<string, unknown> = { name: nameOf(side), duel: { id: clashId, side, ticker: clean } };
    if (description.trim()) payload.description = description.trim().slice(0, 280);
    if (image) payload.image = image;
    return `data:application/json;base64,${toBase64(JSON.stringify(payload))}`;
  };

  const launchSide = async (side: ClashSide): Promise<Address | null> => {
    const m = marketOf(side);
    if (!m || !address || !walletClient || !client) return null;
    setBusy(side);
    const args = [
      nameOf(side),
      symbolOf(side),
      0n,
      0n,
      BigInt(Math.floor(Date.now() / 1000) + 900),
      100,
      70,
      0,
      T0_WEI,
      [address],
      [10_000],
      metadataFor(side),
    ] as const;
    const call = { address: m.launchpad as Address, abi: quoteLaunchpadAbi, functionName: 'launchAdvanced' as const, args, account: address };
    await client.simulateContract(call);
    const hash = await walletClient.writeContract({ ...call, chain: base });
    const receipt = await client.waitForTransactionReceipt({ hash });
    if (receipt.status !== 'success') throw new Error(`The ${m.quote.symbol} launch reverted.`);
    for (const log of receipt.logs) {
      try {
        const ev = decodeEventLog({ abi: launchpadAbi, data: log.data as Hex, topics: log.topics as [Hex, ...Hex[]] });
        if (ev.eventName === 'Launched') return (ev.args as { token: Address }).token;
      } catch {
        // inne logi transakcji
      }
    }
    return null;
  };

  const launch = async () => {
    setError(null);
    if (!address || !walletClient) {
      setError('Connect a wallet first.');
      return;
    }
    if (chainId !== CHAIN_ID) {
      try {
        await switchChainAsync({ chainId: CHAIN_ID });
      } catch {
        setError('Switch to Base was cancelled. Nothing was sent.');
        return;
      }
    }
    try {
      for (const side of ['a', 'b'] as const) {
        if (done[side]) continue;
        const token = await launchSide(side);
        if (token) setDone((d) => ({ ...d, [side]: token }));
      }
    } catch (cause) {
      setError(tradeErrorMessage(cause));
    } finally {
      setBusy(null);
    }
  };

  const both = done.a && done.b;
  const picker = (value: string, onChange: (v: string) => void, other: string) => (
    <select value={value} onChange={(e) => onChange(e.target.value)} disabled={locked} className={`${FIELD} mt-1.5 cursor-pointer`}>
      {markets.map((m) => (
        <option key={m.id} value={m.id} disabled={m.id === other}>
          {m.quote.symbol}
        </option>
      ))}
    </select>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center" role="dialog" aria-modal="true" aria-label="Start an Asset Clash">
      <div className="max-h-[92vh] w-full max-w-[480px] overflow-y-auto rounded-[22px] border border-sp-shade/10 bg-sp-surface p-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-[18px] font-extrabold text-sp-ink">
            <Swords className="h-5 w-5 text-soft-primary" aria-hidden="true" /> Asset Clash
          </h2>
          <button type="button" onClick={onClose} className="rounded-full p-1.5 text-sp-shade/50 hover:bg-sp-sunken" aria-label="Close">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <p className="mt-1 text-[12.5px] leading-[1.5] text-sp-shade/60">
          One meme, two assets. Launch it on two perps and let the market decide which one carries it harder: crypto or Wall Street, ETH or Nvidia.
          Two transactions, you are the creator of both.
        </p>

        <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-end gap-2">
          <div>
            <div className="mb-1 flex justify-center">{marketOf('a') && <PerpAvatar symbol={marketOf('a')!.quote.symbol} size={40} glow />}</div>
            {picker(sideA, setSideA, sideB)}
          </div>
          <span className="pb-3 text-[13px] font-extrabold text-sp-shade/50">vs</span>
          <div>
            <div className="mb-1 flex justify-center">{marketOf('b') && <PerpAvatar symbol={marketOf('b')!.quote.symbol} size={40} glow />}</div>
            {picker(sideB, setSideB, sideA)}
          </div>
        </div>

        <label className="mt-4 block text-[12px] font-extrabold text-sp-ink">Name</label>
        <input value={name} onChange={(e) => setName(e.target.value.slice(0, 28))} className={`${FIELD} mt-1.5`} placeholder="Pepe" disabled={locked} />
        <label className="mt-3 block text-[12px] font-extrabold text-sp-ink">Ticker (2-7 letters)</label>
        <input value={ticker} onChange={(e) => setTicker(e.target.value)} className={`${FIELD} mt-1.5`} placeholder="PEPE" disabled={locked} />
        {clean && (
          <p className="mt-1 text-[11px] text-sp-shade/50">
            Tickers: <b className="text-sp-ink">${symbolOf('a')}</b> vs <b className="text-sp-ink">${symbolOf('b')}</b>
          </p>
        )}
        <label className="mt-3 block text-[12px] font-extrabold text-sp-ink">
          Description <span className="font-bold text-sp-shade/40">(optional)</span>
        </label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value.slice(0, 280))} rows={2} className={`${FIELD} mt-1.5`} disabled={locked} />
        <label className="mt-3 block text-[12px] font-extrabold text-sp-ink">
          Image <span className="font-bold text-sp-shade/40">(optional, stored onchain at 128 px)</span>
        </label>
        <div className="mt-1.5 flex items-center gap-3">
          {image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt="" width={44} height={44} className="h-11 w-11 rounded-full object-cover" />
          )}
          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => void pickFile(e.target.files?.[0])} className="text-[12px]" disabled={locked} />
        </div>
        {imageError && <p className="mt-1 text-[11px] font-bold text-sp-down-deep">{imageError}</p>}

        <div className="mt-4 space-y-1.5 rounded-xl bg-sp-sunken p-3 text-[12px]">
          {(['a', 'b'] as const).map((side, i) => (
            <div key={side} className="flex items-center justify-between">
              <span className="font-extrabold text-sp-ink">
                {i + 1}. ${symbolOf(side)} on {marketOf(side)?.quote.symbol}
              </span>
              {done[side] ? (
                <Link href={`/startpad/${done[side]!.toLowerCase()}?m=${marketOf(side)?.id}`} className="font-extrabold text-soft-primary-deep hover:underline">
                  Live ↗
                </Link>
              ) : busy === side ? (
                <span className="text-sp-shade/50">Confirm in wallet...</span>
              ) : (
                <span className="text-sp-shade/40">waiting</span>
              )}
            </div>
          ))}
        </div>
        {error && <p className="mt-2 text-[12px] font-bold text-sp-down-deep">{error}</p>}

        {both ? (
          <a href={`/perps#clash-${clashId}`} onClick={onClose} className="mt-4 block rounded-xl bg-soft-primary px-4 py-3 text-center text-[13px] font-extrabold text-sp-on-brand">
            See the clash →
          </a>
        ) : (
          <button
            type="button"
            disabled={!ready || busy !== null}
            onClick={() => void launch()}
            className="mt-4 w-full rounded-xl bg-soft-primary px-4 py-3 text-[13px] font-extrabold text-sp-on-brand disabled:opacity-50"
          >
            {busy ? 'Launching...' : done.a ? `Launch the ${marketOf('b')?.quote.symbol} side` : 'Launch the clash (2 transactions)'}
          </button>
        )}
      </div>
    </div>
  );
}

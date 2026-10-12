'use client';

import { useState } from 'react';
import Link from 'next/link';
import { decodeEventLog, parseEther, type Address, type Hex } from 'viem';
import { base } from 'viem/chains';
import { useAccount, useChainId, usePublicClient, useSwitchChain, useWalletClient } from 'wagmi';
import { Swords, X } from 'lucide-react';
import { LAUNCHPAD_NETWORKS, launchpadAbi, quoteLaunchpadAbi } from '../config';
import { cleanDuelTicker, DUEL_MARKETS, duelSymbol, newDuelId, type DuelSide } from '../duel';
import { resizeImageFile } from '../logoUpload';
import { tradeErrorMessage } from '../[address]/detailShared';
import PerpAvatar from './PerpAvatar';

/**
 * Start pojedynku Bull vs Bear: DWIE transakcje tworcy, jedna na launchpadzie
 * ETH2xL (BULL), druga na ETH2xS (BEAR). Oba tokeny niosa w metadanych ten
 * sam `duel.id`. Tworca musi byc msg.sender obu startow (oplaty tworcy, para
 * sprawdzana po tworcy), wiec nie da sie tego zawinac w jeden kontrakt.
 * Gdy druga transakcja odpadnie, okno pozwala ja powtorzyc z tym samym id.
 * Bez pre-buya: start nie wymaga perpa, kupno idzie potem za ETH przez zap.
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

export default function DuelLaunchModal({ onClose }: { onClose: () => void }) {
  const { address } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { data: walletClient } = useWalletClient();
  const client = usePublicClient({ chainId: CHAIN_ID });

  const [name, setName] = useState('');
  const [ticker, setTicker] = useState('');
  const [description, setDescription] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [busy, setBusy] = useState<DuelSide | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [duelId] = useState(() => newDuelId());
  const [done, setDone] = useState<Partial<Record<DuelSide, Address>>>({});

  const net = LAUNCHPAD_NETWORKS[CHAIN_ID];
  const marketOf = (side: DuelSide) => (net?.markets ?? []).find((m) => m.id === DUEL_MARKETS[side]);
  const clean = cleanDuelTicker(ticker);
  const ready = name.trim().length > 0 && clean.length >= 2;

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

  const metadataFor = (side: DuelSide) => {
    const payload: Record<string, unknown> = {
      name: `${name.trim()} ${side === 'bull' ? 'Bull' : 'Bear'}`,
      duel: { id: duelId, side, ticker: clean },
    };
    if (description.trim()) payload.description = description.trim().slice(0, 280);
    if (image) payload.image = image;
    return `data:application/json;base64,${toBase64(JSON.stringify(payload))}`;
  };

  const launchSide = async (side: DuelSide): Promise<Address | null> => {
    const m = marketOf(side);
    if (!m || !address || !walletClient || !client) return null;
    setBusy(side);
    const args = [
      `${name.trim()} ${side === 'bull' ? 'Bull' : 'Bear'}`,
      duelSymbol(clean, side),
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
    if (receipt.status !== 'success') throw new Error(`The ${side} launch reverted.`);
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
      for (const side of ['bull', 'bear'] as const) {
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

  const both = done.bull && done.bear;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center" role="dialog" aria-modal="true" aria-label="Launch a Bull vs Bear duel">
      <div className="max-h-[92vh] w-full max-w-[480px] overflow-y-auto rounded-[22px] border border-sp-shade/10 bg-sp-surface p-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-[18px] font-extrabold text-sp-ink">
            <Swords className="h-5 w-5 text-soft-primary" aria-hidden="true" /> Bull vs Bear
          </h2>
          <button type="button" onClick={onClose} className="rounded-full p-1.5 text-sp-shade/50 hover:bg-sp-sunken" aria-label="Close">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <p className="mt-1 text-[12.5px] leading-[1.5] text-sp-shade/60">
          One idea, two tokens. <b className="text-sp-up">{clean || 'TICKER'}BULL</b> rides ETH2xL, <b className="text-sp-down-deep">{clean || 'TICKER'}BEAR</b> rides
          ETH2xS. When ETH pumps, the bulls win in dollars without a single trade. When it dumps, the bears do. Two transactions, you are the creator of both.
        </p>

        <div className="mt-4 flex items-center justify-center gap-3">
          <PerpAvatar symbol="ETH2xL" size={40} glow change={1} />
          <span className="text-[13px] font-extrabold text-sp-shade/50">vs</span>
          <PerpAvatar symbol="ETH2xS" size={40} glow change={-1} />
        </div>

        <label className="mt-4 block text-[12px] font-extrabold text-sp-ink">Name</label>
        <input value={name} onChange={(e) => setName(e.target.value.slice(0, 32))} className={`${FIELD} mt-1.5`} placeholder="Pepe" disabled={Boolean(done.bull)} />
        <label className="mt-3 block text-[12px] font-extrabold text-sp-ink">Ticker (2-8 letters)</label>
        <input value={ticker} onChange={(e) => setTicker(e.target.value)} className={`${FIELD} mt-1.5`} placeholder="PEPE" disabled={Boolean(done.bull)} />
        {clean && (
          <p className="mt-1 text-[11px] text-sp-shade/50">
            Tickers: <b className="text-sp-up">${duelSymbol(clean, 'bull')}</b> and <b className="text-sp-down-deep">${duelSymbol(clean, 'bear')}</b>
          </p>
        )}
        <label className="mt-3 block text-[12px] font-extrabold text-sp-ink">
          Description <span className="font-bold text-sp-shade/40">(optional)</span>
        </label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value.slice(0, 280))} rows={2} className={`${FIELD} mt-1.5`} disabled={Boolean(done.bull)} />
        <label className="mt-3 block text-[12px] font-extrabold text-sp-ink">
          Image <span className="font-bold text-sp-shade/40">(optional, stored onchain at 128 px)</span>
        </label>
        <div className="mt-1.5 flex items-center gap-3">
          {image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt="" width={44} height={44} className="h-11 w-11 rounded-full object-cover" />
          )}
          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => void pickFile(e.target.files?.[0])} className="text-[12px]" disabled={Boolean(done.bull)} />
        </div>
        {imageError && <p className="mt-1 text-[11px] font-bold text-sp-down-deep">{imageError}</p>}

        <div className="mt-4 space-y-1.5 rounded-xl bg-sp-sunken p-3 text-[12px]">
          {(['bull', 'bear'] as const).map((side) => (
            <div key={side} className="flex items-center justify-between">
              <span className={side === 'bull' ? 'font-extrabold text-sp-up' : 'font-extrabold text-sp-down-deep'}>
                {side === 'bull' ? '1. Bull on ETH2xL' : '2. Bear on ETH2xS'}
              </span>
              {done[side] ? (
                <Link href={`/startpad/${done[side]!.toLowerCase()}?m=${DUEL_MARKETS[side]}`} className="font-extrabold text-soft-primary-deep hover:underline">
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
          <a href={`/perps#duel-${duelId}`} onClick={onClose} className="mt-4 block rounded-xl bg-soft-primary px-4 py-3 text-center text-[13px] font-extrabold text-sp-on-brand">
            See the duel →
          </a>
        ) : (
          <button
            type="button"
            disabled={!ready || busy !== null}
            onClick={() => void launch()}
            className="mt-4 w-full rounded-xl bg-soft-primary px-4 py-3 text-[13px] font-extrabold text-sp-on-brand disabled:opacity-50"
          >
            {busy ? 'Launching...' : done.bull ? 'Launch the Bear side' : 'Launch the duel (2 transactions)'}
          </button>
        )}
      </div>
    </div>
  );
}

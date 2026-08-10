'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowUpRight,
  BarChart3,
  Check,
  CircleDollarSign,
  Copy,
  ExternalLink,
  Layers3,
  RefreshCw,
  ShieldCheck,
  WalletCards,
} from 'lucide-react';
import { formatEther, formatUnits, getAbiItem, type Address } from 'viem';
import { useAccount, usePublicClient } from 'wagmi';
import {
  CURVE_TARGET_ETH,
  erc20Abi,
  hookAbi,
  LAUNCH_HOOK_ADDRESS,
  LAUNCHPAD_ADDRESS,
  LAUNCHPAD_CHAIN,
  LAUNCHPAD_DEPLOY_BLOCK,
  LAUNCH_STATE,
  launchpadAbi,
  LIQUIDITY_VAULT_ADDRESS,
  liquidityVaultAbi,
} from '../config';
import { parseMetadataUri, resolveMediaUrl } from '../metadata';

const LOG_WINDOW = 1_900n;
const MAX_LOG_WINDOWS = 24;
const FIELD = 'w-full rounded-xl border border-black/10 bg-white px-3.5 py-3 text-[14px] text-[#16141b] outline-none placeholder:text-black/35 focus:border-soft-primary';

type TradePoint = { kind: 'buy' | 'sell'; block: bigint; account: Address; eth: bigint; tokens: bigint; reserve: bigint; price: number };
type DetailState = {
  token: Address;
  name: string;
  symbol: string;
  creator: Address;
  state: string;
  ethReserve: bigint;
  tokenReserve: bigint;
  startedAt: number;
  decimals: number;
  balance: bigint;
  spotPrice: bigint;
  poolId: `0x${string}`;
  liquidity: bigint;
  tickLower: number;
  tickUpper: number;
  pendingEth: bigint;
  pendingToken: bigint;
  launchClaimable: bigint;
  hookEthClaimable: bigint;
  vaultEthClaimable: bigint;
  events: TradePoint[];
  // Konfiguracja z `launchAdvanced`. Starsze wdrozenie nie ma tych odczytow,
  // wiec kazde z tych pol moze zostac przy wartosci domyslnej - i wtedy sekcja
  // "Creator setup" po prostu sie nie pokazuje, zamiast pokazywac zera.
  config: {
    known: boolean;
    feeBps: number;
    creatorFeeBps: number;
    receiverCount: number;
    metadataURI: string;
    buybackBps: number;
    pendingBuybackEth: bigint;
    buybackBurned: bigint;
  };
};

type TokenProfileView = {
  logoUrl: string | null;
  description: string | null;
  website: string | null;
};

function short(value: string) {
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function age(startedAt: number) {
  const seconds = Math.max(0, Math.floor(Date.now() / 1000) - startedAt);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)} h ago`;
  return `${Math.floor(seconds / 86_400)} d ago`;
}

function stateClass(state: string) {
  if (state === 'Graduated') return 'bg-[#edfff4] text-[#0b9a51]';
  if (state === 'Locked') return 'bg-[#fff8ed] text-[#a34b08]';
  return 'bg-[#edeaff] text-[#5f4ec2]';
}

export default function LaunchpadTokenDetail({ address }: { address: string }) {
  const { address: account } = useAccount();
  const readClient = usePublicClient({ chainId: LAUNCHPAD_CHAIN.id });
  const [tokenAddress, setTokenAddress] = useState<Address | null>(null);
  const [data, setData] = useState<DetailState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [profile, setProfile] = useState<TokenProfileView | null>(null);
  const [logoDraft, setLogoDraft] = useState('');
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const [websiteDraft, setWebsiteDraft] = useState('');
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileNotice, setProfileNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    try {
      setTokenAddress(address as Address);
    } catch {
      setError('Invalid token address.');
    }
  }, [address]);

  const load = useCallback(async () => {
    if (!readClient || !tokenAddress) return;
    setLoading(true);
    setError(null);
    try {
      const accountAddress = account ?? '0x0000000000000000000000000000000000000000';
      const [name, symbol, decimals, balance, launch, spotPrice, position, pendingEth, pendingToken, launchClaimable, hookEthClaimable, vaultEthClaimable] = await Promise.all([
        readClient.readContract({ address: tokenAddress, abi: erc20Abi, functionName: 'name' }),
        readClient.readContract({ address: tokenAddress, abi: erc20Abi, functionName: 'symbol' }),
        readClient.readContract({ address: tokenAddress, abi: erc20Abi, functionName: 'decimals' }),
        account ? readClient.readContract({ address: tokenAddress, abi: erc20Abi, functionName: 'balanceOf', args: [accountAddress as Address] }) : Promise.resolve(0n),
        readClient.readContract({ address: LAUNCHPAD_ADDRESS as Address, abi: launchpadAbi, functionName: 'launchOf', args: [tokenAddress] }),
        readClient.readContract({ address: LAUNCHPAD_ADDRESS as Address, abi: launchpadAbi, functionName: 'spotPriceWeiPerToken', args: [tokenAddress] }).catch(() => 0n),
        readClient.readContract({ address: LIQUIDITY_VAULT_ADDRESS as Address, abi: liquidityVaultAbi, functionName: 'positionOf', args: [tokenAddress] }),
        readClient.readContract({ address: LAUNCH_HOOK_ADDRESS as Address, abi: hookAbi, functionName: 'pendingEth', args: [tokenAddress] }),
        readClient.readContract({ address: LAUNCH_HOOK_ADDRESS as Address, abi: hookAbi, functionName: 'pendingToken', args: [tokenAddress] }),
        account ? readClient.readContract({ address: LAUNCHPAD_ADDRESS as Address, abi: launchpadAbi, functionName: 'claimable', args: [accountAddress as Address] }) : Promise.resolve(0n),
        account ? readClient.readContract({ address: LAUNCH_HOOK_ADDRESS as Address, abi: hookAbi, functionName: 'claimableEth', args: [accountAddress as Address] }) : Promise.resolve(0n),
        account ? readClient.readContract({ address: LIQUIDITY_VAULT_ADDRESS as Address, abi: liquidityVaultAbi, functionName: 'claimableEth', args: [accountAddress as Address] }) : Promise.resolve(0n),
      ] as const);

      // Odczyty rozszerzonej konfiguracji sa OSOBNE i kazdy ma swoj `catch`.
      // Pod `LAUNCHPAD_ADDRESS` moze stac wersja sprzed `launchAdvanced` -
      // wtedy te selektory nie istnieja i pojedynczy rewert nie moze zabrac
      // uzytkownikowi calej strony tokena.
      const missing = Symbol('missing');
      const [feeConfig, metadataUri, buybackBps, pendingBuybackEth, buybackBurned] = await Promise.all([
        readClient
          .readContract({ address: LAUNCHPAD_ADDRESS as Address, abi: launchpadAbi, functionName: 'feeConfigOf', args: [tokenAddress] })
          .catch(() => missing),
        readClient
          .readContract({ address: LAUNCHPAD_ADDRESS as Address, abi: launchpadAbi, functionName: 'metadataURI', args: [tokenAddress] })
          .catch(() => ''),
        readClient
          .readContract({ address: LAUNCH_HOOK_ADDRESS as Address, abi: hookAbi, functionName: 'buybackBps', args: [tokenAddress] })
          .catch(() => 0),
        readClient
          .readContract({ address: LAUNCH_HOOK_ADDRESS as Address, abi: hookAbi, functionName: 'pendingBuybackEth', args: [tokenAddress] })
          .catch(() => 0n),
        readClient
          .readContract({ address: LAUNCH_HOOK_ADDRESS as Address, abi: hookAbi, functionName: 'buybackTokens', args: [tokenAddress] })
          .catch(() => 0n),
      ]);
      const feeTuple = feeConfig === missing ? null : (feeConfig as readonly [number, number, bigint]);
      const config = {
        known: feeTuple !== null,
        feeBps: Number(feeTuple?.[0] ?? 0),
        creatorFeeBps: Number(feeTuple?.[1] ?? 0),
        receiverCount: Number(feeTuple?.[2] ?? 0),
        metadataURI: metadataUri as string,
        buybackBps: Number(buybackBps),
        pendingBuybackEth: pendingBuybackEth as bigint,
        buybackBurned: buybackBurned as bigint,
      };

      const launchedEvent = getAbiItem({ abi: launchpadAbi, name: 'Launched' });
      const boughtEvent = getAbiItem({ abi: launchpadAbi, name: 'Bought' });
      const soldEvent = getAbiItem({ abi: launchpadAbi, name: 'Sold' });
      const events: TradePoint[] = [];
      let toBlock = await readClient.getBlockNumber();
      for (let window = 0; window < MAX_LOG_WINDOWS && toBlock >= LAUNCHPAD_DEPLOY_BLOCK; window += 1) {
        const fromBlock = toBlock > LAUNCHPAD_DEPLOY_BLOCK + LOG_WINDOW ? toBlock - LOG_WINDOW : LAUNCHPAD_DEPLOY_BLOCK;
        const logs = await readClient.getLogs({ address: LAUNCHPAD_ADDRESS as Address, events: [launchedEvent, boughtEvent, soldEvent], fromBlock, toBlock });
        for (const log of logs) {
          if (log.args.token?.toLowerCase() !== tokenAddress.toLowerCase() || log.eventName === 'Launched') continue;
          if (log.eventName === 'Bought') {
            const eth = log.args.ethNet as bigint;
            const tokens = log.args.tokensOut as bigint;
            events.push({ kind: 'buy', block: log.blockNumber, account: log.args.buyer as Address, eth, tokens, reserve: log.args.ethReserveAfter as bigint, price: Number(formatEther(tokens)) > 0 ? Number(formatEther(eth)) / Number(formatEther(tokens)) : 0 });
          } else {
            const eth = log.args.ethOut as bigint;
            const tokens = log.args.tokensIn as bigint;
            events.push({ kind: 'sell', block: log.blockNumber, account: log.args.seller as Address, eth, tokens, reserve: log.args.ethReserveAfter as bigint, price: Number(formatEther(tokens)) > 0 ? Number(formatEther(eth)) / Number(formatEther(tokens)) : 0 });
          }
        }
        if (fromBlock === LAUNCHPAD_DEPLOY_BLOCK) break;
        toBlock = fromBlock - 1n;
      }

      const [creator, state, ethReserve, tokenReserve, startedAt] = launch as readonly [Address, number, bigint, bigint, number, `0x${string}`];
      const positionTuple = position as readonly [`0x${string}`, bigint, number, number];
      setData({ token: tokenAddress, name: name as string, symbol: symbol as string, creator, state: LAUNCH_STATE[state] ?? 'Unknown', ethReserve, tokenReserve, startedAt: Number(startedAt), decimals: Number(decimals), balance: balance as bigint, spotPrice: spotPrice as bigint, poolId: positionTuple[0], liquidity: positionTuple[1], tickLower: Number(positionTuple[2]), tickUpper: Number(positionTuple[3]), pendingEth: pendingEth as bigint, pendingToken: pendingToken as bigint, launchClaimable: launchClaimable as bigint, hookEthClaimable: hookEthClaimable as bigint, vaultEthClaimable: vaultEthClaimable as bigint, events: events.sort((a, b) => Number(a.block - b.block)), config });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message.split('\n')[0] : 'Unable to read this token from Base Sepolia.');
    } finally {
      setLoading(false);
    }
  }, [account, readClient, tokenAddress]);

  useEffect(() => { void load(); }, [load]);

  /**
   * Profil tokena: logo, opis i linki. Lancuch ich nie zna, a `metadataURI`
   * ustawia sie RAZ przy starcie i nie ma settera - ta warstwa jest jedynym
   * sposobem, zeby tworca poprawil logo po fakcie.
   */
  useEffect(() => {
    if (!tokenAddress) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/launchpad/token?addresses=${tokenAddress}`);
        if (!response.ok) return;
        const payload = (await response.json()) as { profiles?: Record<string, TokenProfileView> };
        const found = payload.profiles?.[tokenAddress.toLowerCase()];
        if (cancelled || !found) return;
        setProfile(found);
        setLogoDraft(found.logoUrl ?? '');
        setDescriptionDraft(found.description ?? '');
        setWebsiteDraft(found.website ?? '');
      } catch {
        // Brak profilu nie jest bledem - wiekszosc tokenow go nie ma.
      }
    })();
    return () => { cancelled = true; };
  }, [tokenAddress]);

  const isCreator = Boolean(account && data && account.toLowerCase() === data.creator.toLowerCase());

  const saveProfile = async () => {
    if (!tokenAddress) return;
    setProfileBusy(true);
    setProfileNotice(null);
    try {
      const response = await fetch('/api/launchpad/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: tokenAddress,
          logoUrl: logoDraft,
          description: descriptionDraft,
          website: websiteDraft,
        }),
      });
      const payload = (await response.json()) as { profile?: TokenProfileView; error?: string };
      if (!response.ok) {
        // Serwer odsiewa tu takze "nie jestes tworca" - komunikat idzie wprost
        // do uzytkownika, bo powod odmowy jest dla niego dzialalny.
        setProfileNotice({ kind: 'error', text: payload.error ?? 'Saving the profile failed.' });
        return;
      }
      if (payload.profile) {
        setProfile(payload.profile);
        setProfileNotice({ kind: 'success', text: 'Profile saved. It shows up in the board and the token list.' });
      }
    } catch (cause) {
      setProfileNotice({ kind: 'error', text: cause instanceof Error ? cause.message : 'Saving the profile failed.' });
    } finally {
      setProfileBusy(false);
    }
  };

  const chartBars = useMemo(() => {
    if (!data) return [];
    const points = data.events.slice(-24);
    return points.map((point) => Math.max(10, Math.min(100, Math.round((Number(formatEther(point.reserve)) / CURVE_TARGET_ETH) * 100))));
  }, [data]);

  const copyAddress = async () => {
    if (!data) return;
    await navigator.clipboard?.writeText(data.token);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return <main className="min-h-screen bg-[#fcfcfd] px-4 pb-24 pt-6 font-soft sm:px-6 sm:pt-10">
    <div className="mx-auto w-full max-w-[1120px]">
      <div className="flex flex-wrap items-center justify-between gap-3"><Link href="/launchpad" className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-3.5 py-2 text-[12px] font-extrabold text-[#16141b] hover:border-soft-primary"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Launchpad market</Link><button type="button" onClick={() => void load()} className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-3.5 py-2 text-[12px] font-extrabold text-[#16141b] hover:border-soft-primary"><RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" /> Refresh</button></div>
      {loading && !data && <div className="mt-5 flex items-center gap-2 rounded-xl border border-black/10 bg-white p-4 text-[12px] text-black/55"><RefreshCw className="h-4 w-4 animate-spin text-soft-primary" aria-hidden="true" /> Reading token, trades and pool state...</div>}
      {error && <div className="mt-5 rounded-xl border border-[#f3c58a] bg-[#fff8ed] p-4 text-[12px] text-[#a34b08]">{error}</div>}
      {data && <>
        <header className="mt-6 flex flex-wrap items-start justify-between gap-5"><div className="flex items-center gap-4"><div className="flex h-16 w-16 items-center justify-center rounded-[18px] bg-soft-primary font-soft-display text-[22px] font-extrabold text-white">{data.symbol.slice(0, 2)}</div><div><div className="flex flex-wrap items-center gap-2"><h1 className="font-soft-display text-[32px] font-extrabold text-[#16141b]">{data.symbol}</h1><span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em] ${stateClass(data.state)}`}>{data.state}</span></div><p className="mt-1 text-[13px] text-black/50">{data.name} · launched {age(data.startedAt)}</p><button type="button" onClick={copyAddress} className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-bold text-soft-primary-deep">{copied ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}{copied ? 'Copied' : short(data.token)}</button></div></div><div className="flex items-center gap-2"><Link href="/launchpad" className="inline-flex items-center gap-2 rounded-full bg-soft-primary px-4 py-2.5 text-[13px] font-extrabold text-white"><WalletCards className="h-4 w-4" aria-hidden="true" /> Trade</Link><a href={`${LAUNCHPAD_CHAIN.blockExplorers.default.url}/address/${data.token}`} target="_blank" rel="noreferrer" className="rounded-full border border-black/10 bg-white p-2.5 text-black/50 hover:text-soft-primary-deep" aria-label="Open token on BaseScan"><ExternalLink className="h-4 w-4" aria-hidden="true" /></a></div></header>
        <div className="mt-6 grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
          <section className="rounded-[20px] border border-black/10 bg-white p-5"><div className="flex items-center justify-between"><div><p className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-black/40">Curve price</p><p className="mt-1 font-soft-display text-[28px] font-extrabold text-[#16141b]">{data.spotPrice ? `${formatEther(data.spotPrice)} ETH` : 'Pool pricing'}</p></div><BarChart3 className="h-5 w-5 text-soft-primary" aria-hidden="true" /></div><div className="mt-6 flex h-44 items-end gap-1 rounded-xl bg-[#f8f7fc] px-4 py-4">{(chartBars.length ? chartBars : [12, 18, 24, 30, 38, 46, 55, 63, 72, 82]).map((height, index) => <span key={`${height}-${index}`} className="min-w-0 flex-1 rounded-t-sm bg-soft-primary" style={{ height: `${height}%`, opacity: 0.35 + index / 18 }} />)}</div><div className="mt-3 flex items-center justify-between text-[11px] text-black/45"><span>{data.events.length} trades indexed</span><span>Target {CURVE_TARGET_ETH.toFixed(2)} ETH</span></div></section>
          <section className="rounded-[20px] border border-black/10 bg-white p-5"><h2 className="text-[16px] font-extrabold text-[#16141b]">Reserves</h2><div className="mt-4 space-y-4"><div><p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-black/40">ETH reserve</p><p className="mt-1 text-[22px] font-extrabold text-[#16141b]">{formatEther(data.ethReserve)} ETH</p></div><div><p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-black/40">Token reserve</p><p className="mt-1 text-[22px] font-extrabold text-[#16141b]">{Number(formatUnits(data.tokenReserve, data.decimals)).toLocaleString('en-US', { maximumFractionDigits: 0 })}</p></div><div className="border-t border-black/10 pt-4"><p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-black/40">Creator</p><p className="mt-1 text-[13px] font-bold text-[#16141b]">{short(data.creator)}</p></div></div></section>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr]">
          <section className="rounded-[20px] border border-black/10 bg-white p-5"><div className="flex items-center justify-between"><h2 className="text-[16px] font-extrabold text-[#16141b]">Pool position</h2><Layers3 className="h-4 w-4 text-soft-primary" aria-hidden="true" /></div><div className="mt-4 grid grid-cols-2 gap-3 text-[12px]"><div className="rounded-xl bg-[#f4f1ff] p-3"><span className="block text-[10px] font-bold uppercase text-black/40">Liquidity</span><span className="mt-1 block font-extrabold">{data.liquidity.toString()}</span></div><div className="rounded-xl bg-[#f4f1ff] p-3"><span className="block text-[10px] font-bold uppercase text-black/40">Pool ID</span><span className="mt-1 block font-extrabold">{data.poolId === `0x${'0'.repeat(64)}` ? 'Not seeded' : short(data.poolId)}</span></div></div><p className="mt-4 text-[11.5px] leading-[1.5] text-black/50">ETH pending in hook: <strong className="text-[#16141b]">{formatEther(data.pendingEth)} ETH</strong>. Fees are settled and distributed between protocol and creator through the deployed hook.</p></section>
          <section className="rounded-[20px] border border-black/10 bg-white p-5"><div className="flex items-center justify-between"><h2 className="text-[16px] font-extrabold text-[#16141b]">Your position</h2><CircleDollarSign className="h-4 w-4 text-soft-primary" aria-hidden="true" /></div><div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-xl bg-[#f8f7fc] p-3"><span className="block text-[10px] font-bold uppercase text-black/40">Wallet balance</span><span className="mt-1 block text-[17px] font-extrabold">{formatUnits(data.balance, data.decimals)} {data.symbol}</span></div><div className="rounded-xl bg-[#f8f7fc] p-3"><span className="block text-[10px] font-bold uppercase text-black/40">Launchpad claim</span><span className="mt-1 block text-[17px] font-extrabold">{formatEther(data.launchClaimable)} ETH</span></div></div><div className="mt-4 flex items-start gap-2 text-[11.5px] leading-[1.5] text-black/50"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#18bd64]" aria-hidden="true" /><span>Claims and trading are available from the market action panel. This page stays focused on transparent reads from chain.</span></div></section>
        </div>
        {isCreator && (
          <section className="mt-4 rounded-[20px] border border-black/10 bg-white p-5">
            <h2 className="text-[16px] font-extrabold text-[#16141b]">Token profile</h2>
            <p className="mt-1 text-[12px] leading-[1.5] text-black/50">
              Only you can edit this — the server checks the creator on chain before saving. The logo also feeds
              {' '}<a href="/api/launchpad/tokenlist" className="font-bold text-soft-primary-deep hover:text-soft-primary">our token list</a>,
              which is what wallets and aggregators can import. ERC-20 has no on-chain logo, so this is how it travels.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-extrabold text-[#16141b]">Logo URL</span>
                <input value={logoDraft} onChange={(event) => setLogoDraft(event.target.value)} className={FIELD} placeholder="ipfs://... or https://..." />
                <span className="mt-1 block text-[11px] text-black/45">ipfs:// is safer — its address is the file&apos;s hash, so nobody can swap the image later.</span>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-extrabold text-[#16141b]">Website</span>
                <input value={websiteDraft} onChange={(event) => setWebsiteDraft(event.target.value)} className={FIELD} placeholder="https://..." />
              </label>
            </div>
            <label className="mt-3 block">
              <span className="mb-1.5 block text-[12px] font-extrabold text-[#16141b]">Description</span>
              <textarea rows={2} value={descriptionDraft} onChange={(event) => setDescriptionDraft(event.target.value)} className={FIELD} maxLength={280} />
            </label>
            {profileNotice && (
              <p className={`mt-3 rounded-xl px-3 py-2 text-[11.5px] font-bold ${profileNotice.kind === 'success' ? 'bg-[#edfff4] text-[#0b7a41]' : 'bg-[#ffefef] text-[#a32020]'}`}>{profileNotice.text}</p>
            )}
            <div className="mt-4 flex items-center gap-3">
              <button type="button" onClick={saveProfile} disabled={profileBusy} className="rounded-full bg-soft-primary px-4 py-2.5 text-[13px] font-extrabold text-white disabled:opacity-60">
                {profileBusy ? 'Saving...' : 'Save profile'}
              </button>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {profile?.logoUrl && <img src={resolveMediaUrl(profile.logoUrl) ?? ''} alt="" className="h-10 w-10 rounded-xl object-cover" referrerPolicy="no-referrer" />}
            </div>
          </section>
        )}

        {data.config.known && (
          <section className="mt-4 rounded-[20px] border border-black/10 bg-white p-5">
            <h2 className="text-[16px] font-extrabold text-[#16141b]">Creator setup</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-black/40">Trading fee</p>
                <p className="mt-1 text-[18px] font-extrabold text-[#16141b]">{(data.config.feeBps / 100).toFixed(2)}%</p>
                <p className="mt-0.5 text-[11px] text-black/45">{(data.config.creatorFeeBps / 100).toFixed(2)}% of every trade goes to {data.config.receiverCount} receiver{data.config.receiverCount === 1 ? '' : 's'}</p>
              </div>
              <div>
                <p className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-black/40">Auto-buyback</p>
                <p className="mt-1 text-[18px] font-extrabold text-[#16141b]">{(data.config.buybackBps / 100).toFixed(0)}%</p>
                <p className="mt-0.5 text-[11px] text-black/45">of the pool hook&apos;s ETH fee</p>
              </div>
              <div>
                <p className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-black/40">Buyback waiting</p>
                <p className="mt-1 text-[18px] font-extrabold text-[#16141b]">{Number(formatEther(data.config.pendingBuybackEth)).toFixed(5)} ETH</p>
                <p className="mt-0.5 text-[11px] text-black/45">anyone can execute it</p>
              </div>
              <div>
                <p className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-black/40">Burned so far</p>
                <p className="mt-1 text-[18px] font-extrabold text-[#16141b]">{Number(formatUnits(data.config.buybackBurned, data.decimals)).toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>
                <p className="mt-0.5 text-[11px] text-black/45">{data.symbol} sent to the burn address</p>
              </div>
            </div>
            {(() => {
              const meta = parseMetadataUri(data.config.metadataURI);
              if (!meta.image && !meta.description && !meta.link) return null;
              return (
                <div className="mt-4 flex items-start gap-3 border-t border-black/5 pt-4">
                  {/* `next/image` wymagaloby listy `remotePatterns`, a logo
                      pochodzi z dowolnego hosta albo bramy IPFS. Adres jest juz
                      przepuszczony przez `parseMetadataUri`. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {meta.image && <img src={meta.image} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover" referrerPolicy="no-referrer" />}
                  <div className="min-w-0">
                    {meta.description && <p className="text-[12.5px] leading-[1.5] text-black/60">{meta.description}</p>}
                    {meta.link && (
                      <a href={meta.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[12px] font-extrabold text-soft-primary-deep hover:text-soft-primary">
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /> Metadata
                      </a>
                    )}
                  </div>
                </div>
              );
            })()}
          </section>
        )}

        <section className="mt-4 overflow-hidden rounded-[20px] border border-black/10 bg-white"><div className="flex items-center justify-between px-5 py-4"><div><h2 className="text-[16px] font-extrabold text-[#16141b]">Recent trades</h2><p className="mt-1 text-[11px] text-black/45">Reconstructed from Bought and Sold events</p></div><span className="rounded-full bg-soft-info-soft px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.08em] text-soft-info">Base Sepolia</span></div>{data.events.length ? <div className="divide-y divide-black/10">{data.events.slice(-10).reverse().map((event, index) => <div key={`${event.block}-${index}`} className="flex items-center justify-between gap-3 px-5 py-3 text-[12px]"><span className="flex items-center gap-2"><span className={`flex h-7 w-7 items-center justify-center rounded-full ${event.kind === 'buy' ? 'bg-[#edfff4] text-[#0b9a51]' : 'bg-[#fff8ed] text-[#a34b08]'}`}>{event.kind === 'buy' ? <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /> : <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />}</span><span><strong className="text-[#16141b]">{event.kind === 'buy' ? 'Buy' : 'Sell'}</strong><span className="ml-2 text-black/45">{short(event.account)}</span></span></span><span className="text-right"><strong className="block text-[#16141b]">{formatEther(event.eth)} ETH</strong><span className="text-[10px] text-black/45">{event.price.toExponential(3)} ETH/token</span></span></div>)}</div> : <div className="px-5 py-10 text-center text-[12px] text-black/45">No trades indexed yet.</div>}</section>
      </>}
    </div>
  </main>;
}

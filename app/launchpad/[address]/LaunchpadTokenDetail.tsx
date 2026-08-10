'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  AtSign,
  Check,
  Copy,
  ExternalLink,
  Globe,
  RefreshCw,
  SearchX,
  Send,
} from 'lucide-react';
import { ContractFunctionExecutionError, type Address } from 'viem';
import { useAccount, usePublicClient } from 'wagmi';
import {
  erc20Abi,
  hookAbi,
  LAUNCH_HOOK_ADDRESS,
  LAUNCHPAD_ADDRESS,
  LAUNCHPAD_CHAIN,
  LAUNCH_STATE,
  launchpadAbi,
  LIQUIDITY_VAULT_ADDRESS,
  liquidityVaultAbi,
} from '../config';
import { parseMetadataUri, pickTokenImage } from '../metadata';
import { useEthUsd } from '../useEthUsd';
import DetailTabs from './DetailTabs';
import PriceChart from './PriceChart';
import TradePanel from './TradePanel';
import {
  fmtEth,
  fmtPrice,
  isAddressParam,
  mcapWei,
  priceToNumber,
  priceWeiAfter,
  short,
  START_PRICE_WEI,
  timeAgo,
  usdSuffix,
  type CoreState,
  type TokenProfileView,
  type TradeEntry,
} from './detailShared';
import { useTokenHistory, type LiveLaunchpadLog } from './useTokenHistory';

const EXPLORER = LAUNCHPAD_CHAIN.blockExplorers.default.url;

/**
 * Strona tokena sklada sie z trzech NIEZALEZNYCH strumieni danych:
 *   1. szybkie odczyty (launchOf, erc20, spotPrice) - renderuja naglowek,
 *      statystyki i panel handlu w ulamku sekundy;
 *   2. skan logow (useTokenHistory) - wykres, taby Trades/Holders; doladowuje
 *      sie osobno ze wskaznikiem, strona NIGDY na niego nie czeka;
 *   3. profil z API - logo/opis/socjale; czysta ozdoba, brak nie boli.
 * Na zywo dokladamy pojedyncze zdarzenia przez watchContractEvent (poll co
 * 8 s - publiczny RPC nie utrzymuje filtrow, patrz LaunchpadBoard).
 */
export default function LaunchpadTokenDetail({ address }: { address: string }) {
  // /launchpad/undefined i inne smieci ucinamy PRZED pierwszym odczytem -
  // viem rzucalby surowym bledem, a uzytkownik ma dostac czytelny ekran.
  const tokenAddress = isAddressParam(address) ? (address as Address) : null;

  const { address: account } = useAccount();
  const readClient = usePublicClient({ chainId: LAUNCHPAD_CHAIN.id });
  // Jeden kurs na cala strone - kazdy komponent nizej dostaje te sama liczbe,
  // zamiast trzech niezaleznych pollerow do tego samego endpointu.
  const { usd: ethUsd } = useEthUsd();

  const [core, setCore] = useState<CoreState | null>(null);
  const [coreLoading, setCoreLoading] = useState(true);
  const [coreError, setCoreError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(tokenAddress === null);
  const [profile, setProfile] = useState<TokenProfileView | null>(null);
  const [copied, setCopied] = useState(false);

  const loadCore = useCallback(async () => {
    if (!readClient || !tokenAddress) return;
    setCoreError(null);
    try {
      const launch = await readClient.readContract({
        address: LAUNCHPAD_ADDRESS as Address,
        abi: launchpadAbi,
        functionName: 'launchOf',
        args: [tokenAddress],
      });
      const [creator, stateIndex, ethReserve, tokenReserve, startedAt] = launch as readonly [
        Address,
        number,
        bigint,
        bigint,
        number,
        `0x${string}`,
      ];
      // Stan 0 znaczy "launchpad nie zna tego adresu" - to nie jest pusta
      // krzywa, tylko nieznany token, i tak go pokazujemy.
      if (Number(stateIndex) === 0) {
        setNotFound(true);
        setCoreLoading(false);
        return;
      }
      const state = LAUNCH_STATE[Number(stateIndex)] as CoreState['state'];
      const accountAddress = account ?? ('0x0000000000000000000000000000000000000000' as Address);

      const [name, symbol, decimals, balance, allowance, spotPrice, position, pendingEth, pendingToken, launchClaimable, hookEthClaimable, hookTokenClaimable, vaultEthClaimable, vaultTokenClaimable] =
        await Promise.all([
          readClient.readContract({ address: tokenAddress, abi: erc20Abi, functionName: 'name' }),
          readClient.readContract({ address: tokenAddress, abi: erc20Abi, functionName: 'symbol' }),
          readClient.readContract({ address: tokenAddress, abi: erc20Abi, functionName: 'decimals' }),
          account ? readClient.readContract({ address: tokenAddress, abi: erc20Abi, functionName: 'balanceOf', args: [accountAddress] }) : Promise.resolve(0n),
          account ? readClient.readContract({ address: tokenAddress, abi: erc20Abi, functionName: 'allowance', args: [accountAddress, LAUNCHPAD_ADDRESS as Address] }) : Promise.resolve(0n),
          // Po graduacji ten odczyt rewertuje - cena zyje wtedy w puli v4.
          readClient.readContract({ address: LAUNCHPAD_ADDRESS as Address, abi: launchpadAbi, functionName: 'spotPriceWeiPerToken', args: [tokenAddress] }).catch(() => 0n),
          readClient.readContract({ address: LIQUIDITY_VAULT_ADDRESS as Address, abi: liquidityVaultAbi, functionName: 'positionOf', args: [tokenAddress] }),
          readClient.readContract({ address: LAUNCH_HOOK_ADDRESS as Address, abi: hookAbi, functionName: 'pendingEth', args: [tokenAddress] }),
          readClient.readContract({ address: LAUNCH_HOOK_ADDRESS as Address, abi: hookAbi, functionName: 'pendingToken', args: [tokenAddress] }),
          account ? readClient.readContract({ address: LAUNCHPAD_ADDRESS as Address, abi: launchpadAbi, functionName: 'claimable', args: [accountAddress] }) : Promise.resolve(0n),
          account ? readClient.readContract({ address: LAUNCH_HOOK_ADDRESS as Address, abi: hookAbi, functionName: 'claimableEth', args: [accountAddress] }) : Promise.resolve(0n),
          account ? readClient.readContract({ address: LAUNCH_HOOK_ADDRESS as Address, abi: hookAbi, functionName: 'claimableToken', args: [tokenAddress, accountAddress] }) : Promise.resolve(0n),
          account ? readClient.readContract({ address: LIQUIDITY_VAULT_ADDRESS as Address, abi: liquidityVaultAbi, functionName: 'claimableEth', args: [accountAddress] }) : Promise.resolve(0n),
          account ? readClient.readContract({ address: LIQUIDITY_VAULT_ADDRESS as Address, abi: liquidityVaultAbi, functionName: 'claimableToken', args: [tokenAddress, accountAddress] }) : Promise.resolve(0n),
        ] as const);

      // Odczyty rozszerzonej konfiguracji sa OSOBNE i kazdy ma swoj `catch`.
      // Pod LAUNCHPAD_ADDRESS moze stac wersja sprzed launchAdvanced - wtedy
      // tych selektorow nie ma i pojedynczy rewert nie moze zabrac calej strony.
      const missing = Symbol('missing');
      const [feeConfig, metadataUri, buybackBps, pendingBuybackEth, buybackBurned, gradFee] = await Promise.all([
        readClient.readContract({ address: LAUNCHPAD_ADDRESS as Address, abi: launchpadAbi, functionName: 'feeConfigOf', args: [tokenAddress] }).catch(() => missing),
        readClient.readContract({ address: LAUNCHPAD_ADDRESS as Address, abi: launchpadAbi, functionName: 'metadataURI', args: [tokenAddress] }).catch(() => ''),
        readClient.readContract({ address: LAUNCH_HOOK_ADDRESS as Address, abi: hookAbi, functionName: 'buybackBps', args: [tokenAddress] }).catch(() => 0),
        readClient.readContract({ address: LAUNCH_HOOK_ADDRESS as Address, abi: hookAbi, functionName: 'pendingBuybackEth', args: [tokenAddress] }).catch(() => 0n),
        readClient.readContract({ address: LAUNCH_HOOK_ADDRESS as Address, abi: hookAbi, functionName: 'buybackTokens', args: [tokenAddress] }).catch(() => 0n),
        state === 'Locked'
          ? readClient.readContract({ address: LAUNCHPAD_ADDRESS as Address, abi: launchpadAbi, functionName: 'gradFeeOf', args: [tokenAddress] }).catch(() => null)
          : Promise.resolve(null),
      ]);
      const feeTuple = feeConfig === missing ? null : (feeConfig as readonly [number, number, bigint]);
      const positionTuple = position as readonly [`0x${string}`, bigint, number, number];

      setCore({
        token: tokenAddress,
        name: name as string,
        symbol: symbol as string,
        decimals: Number(decimals),
        creator,
        state,
        ethReserve,
        tokenReserve,
        startedAt: Number(startedAt),
        spotPriceWei: spotPrice as bigint,
        balance: balance as bigint,
        allowance: allowance as bigint,
        poolId: positionTuple[0],
        liquidity: positionTuple[1],
        pendingEth: pendingEth as bigint,
        pendingToken: pendingToken as bigint,
        launchClaimable: launchClaimable as bigint,
        hookEthClaimable: hookEthClaimable as bigint,
        hookTokenClaimable: hookTokenClaimable as bigint,
        vaultEthClaimable: vaultEthClaimable as bigint,
        vaultTokenClaimable: vaultTokenClaimable as bigint,
        gradCallerReward: gradFee ? (gradFee as readonly [bigint, bigint])[1] : null,
        config: {
          known: feeTuple !== null,
          feeBps: Number(feeTuple?.[0] ?? 0),
          creatorFeeBps: Number(feeTuple?.[1] ?? 0),
          receiverCount: Number(feeTuple?.[2] ?? 0),
          metadataURI: metadataUri as string,
          buybackBps: Number(buybackBps),
          pendingBuybackEth: pendingBuybackEth as bigint,
          buybackBurned: buybackBurned as bigint,
        },
      });
    } catch (cause) {
      // Rewert launchOf/erc20 = ten adres nie jest tokenem launchpada.
      // Kazdy inny blad (siec, limit RPC) to awaria odczytu, nie brak tokena.
      if (cause instanceof ContractFunctionExecutionError) setNotFound(true);
      else setCoreError(cause instanceof Error ? cause.message.split('\n')[0] : String(cause));
    } finally {
      setCoreLoading(false);
    }
  }, [account, readClient, tokenAddress]);

  useEffect(() => {
    void loadCore();
  }, [loadCore]);

  const history = useTokenHistory(notFound ? null : tokenAddress, core?.startedAt ?? null);
  const { applyLive, reload: reloadHistory } = history;

  // NA ZYWO: pojedyncze zdarzenia dokladane do stanu, ktory juz jest na
  // ekranie. Rezerwy bierzemy PROSTO ze zdarzenia (ethReserveAfter), nie z
  // wlasnej arytmetyki - ta sama zasada, co w LaunchpadBoard.
  useEffect(() => {
    if (!readClient || !tokenAddress || notFound) return;
    const unwatch = readClient.watchContractEvent({
      address: LAUNCHPAD_ADDRESS as Address,
      abi: launchpadAbi,
      poll: true,
      pollingInterval: 8_000,
      // Publiczny RPC odbija; zywy podglad jest dodatkiem do zaladowanych
      // danych, wiec cicha przerwa jest wlasciwym zachowaniem, nie awaria.
      onError: () => {},
      onLogs: (logs) => {
        const mine: LiveLaunchpadLog[] = [];
        for (const log of logs) {
          const decoded = log as unknown as LiveLaunchpadLog;
          const token = decoded.args?.token as string | undefined;
          if (!token || token.toLowerCase() !== tokenAddress.toLowerCase()) continue;
          mine.push(decoded);
        }
        if (mine.length === 0) return;
        applyLive(mine);
        setCore((prev) => {
          if (!prev) return prev;
          let next = prev;
          for (const log of mine) {
            if (log.eventName === 'Bought' || log.eventName === 'Sold') {
              const reserve = log.args?.ethReserveAfter as bigint | undefined;
              const tokenReserve = log.args?.tokenReserveAfter as bigint | undefined;
              if (reserve !== undefined && tokenReserve !== undefined) {
                next = { ...next, ethReserve: reserve, tokenReserve, spotPriceWei: priceWeiAfter(reserve, tokenReserve) };
              }
            } else if (log.eventName === 'CurveLocked') {
              next = { ...next, state: 'Locked' };
            } else if (log.eventName === 'Graduated') {
              next = { ...next, state: 'Graduated', spotPriceWei: 0n };
            }
          }
          return next;
        });
        // Zamkniecie krzywej i graduacja zmieniaja wiecej niz jedna liczbe
        // (nagroda, pula, salda) - po nich pelny odczyt zamiast skladanki.
        if (mine.some((log) => log.eventName === 'CurveLocked' || log.eventName === 'Graduated')) void loadCore();
      },
    });
    return () => {
      unwatch();
    };
  }, [readClient, tokenAddress, notFound, applyLive, loadCore]);

  // Profil: logo, opis, linki. Lancuch ich nie zna - patrz metadata.ts.
  useEffect(() => {
    if (!tokenAddress || notFound) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/launchpad/token?addresses=${tokenAddress}`);
        if (!response.ok) return;
        const payload = (await response.json()) as { profiles?: Record<string, TokenProfileView> };
        const found = payload.profiles?.[tokenAddress.toLowerCase()];
        if (!cancelled && found) setProfile(found);
      } catch {
        // Brak profilu nie jest bledem - wiekszosc tokenow go nie ma.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tokenAddress, notFound]);

  const copyAddress = async () => {
    if (!tokenAddress) return;
    await navigator.clipboard?.writeText(tokenAddress);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  if (notFound) return <TokenNotFound address={address} />;

  return (
    <main className="min-h-screen bg-[#fcfcfd] px-4 pb-24 pt-5 font-soft sm:px-6 sm:pt-8">
      <div className="mx-auto w-full max-w-[1280px]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/launchpad" className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-3.5 py-2 text-[12px] font-extrabold text-[#16141b] hover:border-soft-primary">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Launchpad market
          </Link>
          <button
            type="button"
            onClick={() => {
              void loadCore();
              void reloadHistory();
            }}
            className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-3.5 py-2 text-[12px] font-extrabold text-[#16141b] hover:border-soft-primary"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${coreLoading || history.loading ? 'animate-spin' : ''}`} aria-hidden="true" /> Refresh
          </button>
        </div>

        {coreLoading && !core && (
          <div className="mt-5 flex items-center gap-2 rounded-[20px] border border-black/10 bg-white p-5 text-[12px] text-black/55">
            <RefreshCw className="h-4 w-4 animate-spin text-soft-primary" aria-hidden="true" /> Reading token state from Base Sepolia...
          </div>
        )}
        {coreError && (
          <div className="mt-5 flex items-center justify-between gap-3 rounded-xl border border-[#f3c58a] bg-[#fff8ed] px-4 py-3 text-[12px] text-[#a34b08]">
            <span className="min-w-0 truncate">Live reads are failing: {coreError}</span>
            <button type="button" onClick={() => void loadCore()} className="shrink-0 rounded-full border border-[#f3c58a] px-3 py-1.5 text-[11px] font-extrabold hover:bg-white">
              Retry
            </button>
          </div>
        )}

        {core && (
          <>
            <TokenHeader core={core} profile={profile} copied={copied} onCopy={() => void copyAddress()} />

            <div className="mt-5 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
              <div className="min-w-0 lg:col-start-1 lg:row-start-1">
                <PriceChart
                  trades={history.trades}
                  startedAt={core.startedAt}
                  state={core.state}
                  graduatedTs={history.graduatedTs}
                  lastPriceWei={core.spotPriceWei}
                  loading={history.loading}
                  ethUsd={ethUsd}
                />
              </div>

              <div className="min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1">
                <div className="space-y-4 lg:sticky lg:top-4">
                  <TradePanel core={core} ethUsd={ethUsd} onAfterTx={() => void loadCore()} />
                  <StatsCard core={core} ethUsd={ethUsd} trades={history.trades} balances={history.balances} copied={copied} onCopy={() => void copyAddress()} />
                </div>
              </div>

              <div className="min-w-0 lg:col-start-1 lg:row-start-2">
                <DetailTabs
                  core={core}
                  ethUsd={ethUsd}
                  trades={history.trades}
                  balances={history.balances}
                  historyLoading={history.loading}
                  historyError={history.error}
                  truncated={history.truncated}
                  onRetryHistory={() => void reloadHistory()}
                  profile={profile}
                  isCreator={Boolean(account && account.toLowerCase() === core.creator.toLowerCase())}
                  onProfileSaved={setProfile}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function socialUrl(value: string | null | undefined, base: string): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('https://')) return trimmed;
  const handle = trimmed.replace(/^@/, '');
  return /^[A-Za-z0-9_.]+$/.test(handle) ? `${base}${handle}` : null;
}

function TokenHeader({
  core,
  profile,
  copied,
  onCopy,
}: {
  core: CoreState;
  profile: TokenProfileView | null;
  copied: boolean;
  onCopy: () => void;
}) {
  const image = pickTokenImage({ profileLogoUrl: profile?.logoUrl, metadataUri: core.config.metadataURI });
  const chainMeta = parseMetadataUri(core.config.metadataURI);
  const description = profile?.description ?? chainMeta.description;
  const website = socialUrl(profile?.website, '');
  const twitter = socialUrl(profile?.twitter, 'https://x.com/');
  const telegram = socialUrl(profile?.telegram, 'https://t.me/');

  const stateClass =
    core.state === 'Graduated'
      ? 'bg-[#edfff4] text-[#0b9a51]'
      : core.state === 'Locked'
        ? 'bg-[#fff8ed] text-[#a34b08]'
        : 'bg-[#edeaff] text-[#5f4ec2]';

  return (
    <header className="mt-4 rounded-[20px] border border-black/10 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <div className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-[18px] bg-soft-primary font-soft-display text-[22px] font-extrabold text-white">
            {image.url ? (
              // Logo pochodzi od obcego tworcy - metadata.ts przepuszcza
              // wylacznie https i ipfs, a przy padzie obrazka zostaje inicjal.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image.url} alt="" className="absolute inset-0 h-full w-full object-cover" referrerPolicy="no-referrer" loading="lazy" />
            ) : (
              core.symbol.slice(0, 2)
            )}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-soft-display text-[26px] font-extrabold leading-tight text-[#16141b] sm:text-[30px]">{core.symbol}</h1>
              <span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em] ${stateClass}`}>{core.state}</span>
            </div>
            <p className="mt-0.5 truncate text-[13px] text-black/50">
              {core.name} · launched {timeAgo(core.startedAt)}
            </p>
            {description && <p className="mt-1.5 max-w-[560px] text-[12px] leading-[1.5] text-black/55">{description.slice(0, 280)}</p>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {website && (
            <a href={website} target="_blank" rel="noreferrer" className="rounded-full border border-black/10 bg-white p-2.5 text-black/50 hover:text-soft-primary-deep" aria-label="Project website">
              <Globe className="h-4 w-4" aria-hidden="true" />
            </a>
          )}
          {twitter && (
            <a href={twitter} target="_blank" rel="noreferrer" className="rounded-full border border-black/10 bg-white p-2.5 text-black/50 hover:text-soft-primary-deep" aria-label="Project on X">
              <AtSign className="h-4 w-4" aria-hidden="true" />
            </a>
          )}
          {telegram && (
            <a href={telegram} target="_blank" rel="noreferrer" className="rounded-full border border-black/10 bg-white p-2.5 text-black/50 hover:text-soft-primary-deep" aria-label="Project Telegram">
              <Send className="h-4 w-4" aria-hidden="true" />
            </a>
          )}
          <button type="button" onClick={onCopy} className="inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white px-3.5 py-2 text-[12px] font-extrabold text-[#16141b] hover:border-soft-primary">
            {copied ? <Check className="h-3.5 w-3.5 text-[#0b9a51]" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
            {copied ? 'Copied' : short(core.token)}
          </button>
          <a href={`${EXPLORER}/address/${core.token}`} target="_blank" rel="noreferrer" className="rounded-full border border-black/10 bg-white p-2.5 text-black/50 hover:text-soft-primary-deep" aria-label="Open token on BaseScan">
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </a>
        </div>
      </div>
    </header>
  );
}

function StatsCard({
  core,
  ethUsd,
  trades,
  balances,
  copied,
  onCopy,
}: {
  core: CoreState;
  ethUsd: number | null;
  trades: TradeEntry[];
  balances: Map<string, bigint>;
  copied: boolean;
  onCopy: () => void;
}) {
  const lastTrade = trades.length ? trades[trades.length - 1] : null;
  // Spot z lancucha wygrywa; po graduacji (odczyt rewertuje -> 0n) zostaje
  // ostatnia cena krzywej - uczciwie podpisana w naglowku wykresu.
  const priceWei = core.spotPriceWei > 0n ? core.spotPriceWei : lastTrade?.priceWei ?? START_PRICE_WEI;
  const volumeWei = useMemo(() => trades.reduce((sum, trade) => sum + trade.eth, 0n), [trades]);
  const holdersCount = useMemo(() => {
    let count = 0;
    for (const [holder, balance] of balances) {
      if (balance > 0n && holder !== LAUNCHPAD_ADDRESS.toLowerCase()) count += 1;
    }
    return count;
  }, [balances]);

  // USD to zawsze dopisek, nigdy wartosc glowna - przy braku kursu (null)
  // wiersz wyglada dokladnie tak, jak przed dodaniem dopiskow.
  const rows: Array<{ label: string; value: string; usd?: string | null }> = [
    { label: 'Price', value: `${fmtPrice(priceToNumber(priceWei))} ETH`, usd: usdSuffix(priceWei, ethUsd) },
    { label: 'Market cap', value: `${fmtEth(mcapWei(priceWei), 3)} ETH`, usd: usdSuffix(mcapWei(priceWei), ethUsd) },
    { label: 'ETH reserve', value: `${fmtEth(core.ethReserve, 4)} ETH`, usd: usdSuffix(core.ethReserve, ethUsd) },
    { label: 'Volume', value: `${fmtEth(volumeWei, 4)} ETH`, usd: usdSuffix(volumeWei, ethUsd) },
    { label: 'Trades', value: String(trades.length) },
    { label: 'Holders', value: String(holdersCount) },
    { label: 'Age', value: timeAgo(core.startedAt).replace(' ago', '') },
    { label: 'Curve fee', value: core.config.known ? `${(core.config.feeBps / 100).toFixed(2)}%` : '--' },
  ];

  return (
    <section className="rounded-[20px] border border-black/10 bg-white p-4 sm:p-5">
      <h2 className="text-[13px] font-extrabold text-[#16141b]">Stats</h2>
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-3">
        {rows.map((row) => (
          <div key={row.label} className="min-w-0">
            <dt className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-black/40">{row.label}</dt>
            <dd className="mt-0.5 truncate text-[14px] font-extrabold text-[#16141b]">
              {row.value}
              {row.usd && <span className="ml-1 text-[11px] font-bold text-black/40">· {row.usd}</span>}
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 space-y-2 border-t border-black/10 pt-3 text-[11.5px]">
        <div className="flex items-center justify-between gap-2">
          <span className="text-black/45">Creator</span>
          <a href={`${EXPLORER}/address/${core.creator}`} target="_blank" rel="noreferrer" className="font-extrabold text-soft-primary-deep hover:text-soft-primary">
            {short(core.creator)}
          </a>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-black/45">Token</span>
          <button type="button" onClick={onCopy} className="inline-flex items-center gap-1.5 font-extrabold text-[#16141b] hover:text-soft-primary-deep">
            {copied ? <Check className="h-3 w-3 text-[#0b9a51]" aria-hidden="true" /> : <Copy className="h-3 w-3" aria-hidden="true" />}
            {short(core.token)}
          </button>
        </div>
      </div>
    </section>
  );
}

function TokenNotFound({ address }: { address: string }) {
  return (
    <main className="min-h-screen bg-[#fcfcfd] px-4 pb-24 pt-10 font-soft sm:px-6">
      <div className="mx-auto w-full max-w-[560px] rounded-[20px] border border-black/10 bg-white p-8 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#f4f1ff]">
          <SearchX className="h-6 w-6 text-soft-primary" aria-hidden="true" />
        </span>
        <h1 className="mt-4 font-soft-display text-[24px] font-extrabold text-[#16141b]">Token not found</h1>
        <p className="mt-2 text-[13px] leading-[1.6] text-black/55">
          {isAddressParam(address)
            ? 'This address is not a token launched on the MySphere launchpad on Base Sepolia.'
            : 'This link does not contain a valid token address.'}
        </p>
        <Link href="/launchpad" className="mt-5 inline-flex items-center gap-2 rounded-full bg-soft-primary px-5 py-2.5 text-[13px] font-extrabold text-white">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to the Launchpad market
        </Link>
      </div>
    </main>
  );
}

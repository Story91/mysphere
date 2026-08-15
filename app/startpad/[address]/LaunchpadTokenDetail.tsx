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
import { ContractFunctionExecutionError, formatEther, getAbiItem, type Address } from 'viem';
import { useAccount, usePublicClient } from 'wagmi';
import {
  NATIVE_SYMBOL,
  CURVE_TARGET_ETH,
  erc20Abi,
  hookAbi,
  LAUNCH_HOOK_ADDRESS,
  LAUNCHPAD_ADDRESS,
  LAUNCHPAD_CHAIN,
  LAUNCHPAD_EXPLORER_URL,
  LAUNCH_STATE,
  launchpadAbi,
  LIQUIDITY_VAULT_ADDRESS,
  liquidityVaultAbi,
  LIVE_WATCH,
} from '../config';
import { parseMetadataUri, pickTokenImage } from '../metadata';
import { fetchLogos } from '../logos';
import { fetchTokenCounters, type TokenCounters } from '../blockscout';
import { useEthUsd } from '../useEthUsd';
import ShareToken from '../ShareToken';
import DetailTabs from './DetailTabs';
import PriceChart from './PriceChart';
import TradePanel from './TradePanel';
import {
  fmtEth,
  fmtPrice,
  fmtUsdPrice,
  holdersAreExact,
  isAddressParam,
  mcapWei,
  pickHolderCount,
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
import { applyClaimLogs, claimsNeedReload } from './liveClaims';
import { hasPool, readPoolPriceWei } from './poolPrice';
import { useTokenHistory, type LiveLaunchpadLog } from './useTokenHistory';

const EXPLORER = LAUNCHPAD_EXPLORER_URL;

/**
 * Zdarzenia, ktore strona tokena sledzi na zywo - z trzech kontraktow, ale w
 * jednej subskrypcji. Wypisane po nazwie, a nie caly ABI, zeby subskrypcja
 * niosla dokladnie to, czego uzywa `onLogs`, i ani jednego loga wiecej.
 */
const LIVE_EVENTS = [
  getAbiItem({ abi: launchpadAbi, name: 'Bought' }),
  getAbiItem({ abi: launchpadAbi, name: 'Sold' }),
  getAbiItem({ abi: launchpadAbi, name: 'CurveLocked' }),
  getAbiItem({ abi: launchpadAbi, name: 'Graduated' }),
  getAbiItem({ abi: launchpadAbi, name: 'FeeAccrued' }),
  getAbiItem({ abi: launchpadAbi, name: 'Claimed' }),
  getAbiItem({ abi: hookAbi, name: 'HookFeeSettled' }),
  getAbiItem({ abi: liquidityVaultAbi, name: 'Harvested' }),
];

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
  // /startpad/undefined i inne smieci ucinamy PRZED pierwszym odczytem -
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
  /**
   * Licznik zadan "pokaz formularz profilu". Licznik, a nie flaga: tworca moze
   * kliknac pusta ikonke drugi raz po zamknieciu zakladki, a flaga `true` juz
   * ustawiona na `true` nie wywolalaby zadnego efektu.
   */
  const [profileRequest, setProfileRequest] = useState(0);

  const loadCore = useCallback(async () => {
    if (!readClient || !tokenAddress) return;
    setCoreError(null);
    try {
      const accountAddress = account ?? ('0x0000000000000000000000000000000000000000' as Address);
      // Odczyty rozszerzonej konfiguracji maja WLASNE `catch` - pod
      // LAUNCHPAD_ADDRESS moze stac wersja sprzed launchAdvanced i wtedy tych
      // selektorow nie ma, a pojedynczy rewert nie moze zabrac calej strony.
      const missing = Symbol('missing');

      /**
       * WSZYSTKO W JEDNEJ RUNDZIE.
       *
       * Bylo to rozbite na trzy `await` pod rzad: `launchOf`, potem czternascie
       * odczytow, potem szesc. Kazda paczka to jeden multicall (wagmi domyslnie
       * skleja rownolegle `readContract`), ale TRZY paczki to trzy podroze do
       * RPC, jedna po drugiej, zanim strona narysuje cokolwiek. Jedna tablica
       * `Promise.all` to jedna podroz.
       *
       * `gradFeeOf` wchodzi bezwarunkowo z wlasnym `catch`, bo warunek "tylko w
       * stanie Locked" wymagalby znajomosci stanu, czyli osobnej rundy - a to
       * jest dokladnie ten koszt, ktory tu usuwamy. Uzywamy go i tak dopiero po
       * sprawdzeniu stanu.
       */
      const [launch, name, symbol, decimals, balance, allowance, spotPrice, position, pendingEth, pendingToken, launchClaimable, hookEthClaimable, hookTokenClaimable, vaultEthClaimable, vaultTokenClaimable, feeConfig, metadataUri, buybackBps, pendingBuybackEth, buybackBurned, gradFee] =
        await Promise.all([
          readClient.readContract({ address: LAUNCHPAD_ADDRESS as Address, abi: launchpadAbi, functionName: 'launchOf', args: [tokenAddress] }),
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
        readClient.readContract({ address: LAUNCHPAD_ADDRESS as Address, abi: launchpadAbi, functionName: 'feeConfigOf', args: [tokenAddress] }).catch(() => missing),
        readClient.readContract({ address: LAUNCHPAD_ADDRESS as Address, abi: launchpadAbi, functionName: 'metadataURI', args: [tokenAddress] }).catch(() => ''),
        readClient.readContract({ address: LAUNCH_HOOK_ADDRESS as Address, abi: hookAbi, functionName: 'buybackBps', args: [tokenAddress] }).catch(() => 0),
        readClient.readContract({ address: LAUNCH_HOOK_ADDRESS as Address, abi: hookAbi, functionName: 'pendingBuybackEth', args: [tokenAddress] }).catch(() => 0n),
        readClient.readContract({ address: LAUNCH_HOOK_ADDRESS as Address, abi: hookAbi, functionName: 'buybackTokens', args: [tokenAddress] }).catch(() => 0n),
        readClient.readContract({ address: LAUNCHPAD_ADDRESS as Address, abi: launchpadAbi, functionName: 'gradFeeOf', args: [tokenAddress] }).catch(() => null),
      ]);

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
        // Nagroda za wywolanie graduate() ma sens WYLACZNIE w stanie Locked -
        // odczyt leci bezwarunkowo (jedna runda), ale czytamy go warunkowo.
        gradCallerReward: state === 'Locked' && gradFee ? (gradFee as readonly [bigint, bigint])[1] : null,
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

  /** Tworca tokena - jedyny, kto moze uzupelnic profil i linki. */
  const isCreator = Boolean(account && core && account.toLowerCase() === core.creator.toLowerCase());

  /**
   * Historia siega bloku startu tokena. Dopiero wtedy nasze salda sa PELNE, a
   * nie przyblizone - i dopiero wtedy nasza liczba holderow bije indeks.
   */
  const historyComplete = history.loaded && !history.truncated;

  /**
   * CENA PO GRADUACJI - z puli, a nie ostatnia cena krzywej.
   *
   * Po graduacji `spotPriceWeiPerToken` rewertuje, wiec strona pokazywala
   * liczbe z chwili, w ktorej token przestal byc na krzywej, a wykres konczyl
   * sie w tym samym miejscu. Akurat te tokeny, ktorym sie udalo, wygladaly na
   * martwe. Teraz cena idzie z `slot0` puli i odswieza sie w tym samym tempie,
   * co reszta podgladu - jeden `eth_call`, bez bazy i bez indeksera.
   */
  const [poolPriceWei, setPoolPriceWei] = useState<bigint | null>(null);
  const graduated = core?.state === 'Graduated';
  const poolId = core?.poolId ?? null;
  const tokenDecimals = core?.decimals ?? 18;
  useEffect(() => {
    if (!readClient || !graduated || !hasPool(poolId)) {
      setPoolPriceWei(null);
      return;
    }
    let cancelled = false;
    const read = () => {
      void readPoolPriceWei(readClient, { poolId: poolId as string, decimals: tokenDecimals }).then((price) => {
        // `null` znaczy "nie wiem" - zostaje ostatnia znana cena, a nie zero.
        if (!cancelled && price !== null) setPoolPriceWei(price);
      });
    };
    read();
    const timer = window.setInterval(read, LIVE_WATCH.pollingInterval);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [readClient, graduated, poolId, tokenDecimals]);

  /**
   * NA ZYWO: pojedyncze zdarzenia dokladane do stanu, ktory juz jest na
   * ekranie. Rezerwy bierzemy PROSTO ze zdarzenia (ethReserveAfter), nie z
   * wlasnej arytmetyki - ta sama zasada, co w LaunchpadBoard.
   *
   * Trzy adresy w JEDNEJ subskrypcji, a nie trzy pollery: launchpad (handel,
   * naliczenia i wyplaty oplat), hook (rozliczenia oplat puli) i vault (zbior
   * oplat puli). To dalej jedno `eth_getLogs` na rundę.
   *
   * Z tych samych logow ida dwa strumienie, bo dotycza czegos innego:
   *   - historia, wykres i rezerwy to zdarzenia TEGO tokena;
   *   - salda do odebrania to zdarzenia TWOJEGO KONTA. `claimable` jest wspolne
   *     dla wszystkich twoich tokenow, a `Claimed` nie niesie nawet adresu
   *     tokena - filtrowanie ich po tokenie gubiloby prawde.
   */
  useEffect(() => {
    if (!readClient || !tokenAddress || notFound) return;
    const claimContext = {
      viewer: account ? account.toLowerCase() : null,
      token: tokenAddress.toLowerCase(),
      isCreator,
    };
    const unwatch = readClient.watchEvent({
      address: [LAUNCHPAD_ADDRESS, LAUNCH_HOOK_ADDRESS, LIQUIDITY_VAULT_ADDRESS] as Address[],
      events: LIVE_EVENTS,
      // Tempo z konfiguracji sieci: raz na blok na wlasnym RPC, osiem sekund na
      // publicznym, subskrypcja gdy transportem jest WebSocket.
      poll: LIVE_WATCH.poll,
      pollingInterval: LIVE_WATCH.pollingInterval,
      // Publiczny RPC odbija; zywy podglad jest dodatkiem do zaladowanych
      // danych, wiec cicha przerwa jest wlasciwym zachowaniem, nie awaria.
      onError: () => {},
      onLogs: (logs) => {
        const all = logs as unknown as LiveLaunchpadLog[];
        const mine: LiveLaunchpadLog[] = [];
        for (const log of all) {
          const token = log.args?.token as string | undefined;
          if (!token || token.toLowerCase() !== tokenAddress.toLowerCase()) continue;
          mine.push(log);
        }

        if (mine.length > 0) {
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
        }

        // Salda do odebrania: liczone z naliczen, nie odpytywane. Kontrakt
        // emituje kazde `FeeAccrued` co do wei, wiec kwota na ekranie rosnie w
        // tej samej sekundzie, w ktorej ktos handluje.
        setCore((prev) => (prev ? applyClaimLogs(prev, all, claimContext).core : prev));

        // Zamkniecie krzywej i graduacja zmieniaja wiecej niz jedna liczbe
        // (nagroda, pula, salda), a podzialu oplat puli nie odtwarzamy sami -
        // po tych zdarzeniach pelny odczyt zamiast skladanki.
        const heavy = mine.some((log) => log.eventName === 'CurveLocked' || log.eventName === 'Graduated');
        if (heavy || claimsNeedReload(all, claimContext)) void loadCore();
      },
    });
    return () => {
      unwatch();
    };
  }, [readClient, tokenAddress, notFound, applyLive, loadCore, account, isCreator]);

  // Profil (opis, linki) z API + LOGO z Bloba (dokladnie jak tablica). Firestore
  // trzyma logoUrl: null, wiec bez dociagniecia z Bloba detal nie mial logo w
  // ogole - a na Robinhoodzie doszlo do tego, ze upload w ogole tam nie trafial
  // (route bral zla siec). Czytamy logo z /api/startpad/logos dla AKTYWNEJ sieci.
  useEffect(() => {
    if (!tokenAddress || notFound) return;
    let cancelled = false;
    const key = tokenAddress.toLowerCase();
    void (async () => {
      const [payload, logos] = await Promise.all([
        fetch(`/api/launchpad/token?addresses=${tokenAddress}`)
          .then((r) => (r.ok ? (r.json() as Promise<{ profiles?: Record<string, TokenProfileView> }>) : null))
          .catch(() => null),
        fetchLogos(LAUNCHPAD_CHAIN.id).catch(() => ({} as Record<string, string>)),
      ]);
      if (cancelled) return;
      const found = payload?.profiles?.[key];
      const blobLogo = logos[key];
      if (found || blobLogo) {
        setProfile({ ...(found ?? {}), logoUrl: blobLogo ?? found?.logoUrl ?? null } as TokenProfileView);
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
    <main className="min-h-screen bg-sp-sunken px-4 pb-24 pt-5 font-soft sm:px-6 sm:pt-8">
      <div className="mx-auto w-full max-w-[1280px]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/startpad" className="inline-flex items-center gap-2 rounded-full border border-sp-shade/10 bg-sp-surface px-3.5 py-2 text-[12px] font-extrabold text-sp-ink hover:border-soft-primary">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Startpad market
          </Link>
          <button
            type="button"
            onClick={() => {
              void loadCore();
              void reloadHistory();
            }}
            className="inline-flex items-center gap-2 rounded-full border border-sp-shade/10 bg-sp-surface px-3.5 py-2 text-[12px] font-extrabold text-sp-ink hover:border-soft-primary"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${coreLoading || history.loading ? 'animate-spin' : ''}`} aria-hidden="true" /> Refresh
          </button>
        </div>

        {coreLoading && !core && (
          <div className="mt-5 flex items-center gap-2 rounded-[20px] border border-sp-shade/10 bg-sp-surface p-5 text-[12px] text-sp-shade/55">
            <RefreshCw className="h-4 w-4 animate-spin text-soft-primary" aria-hidden="true" /> Reading token state from {LAUNCHPAD_CHAIN.name}...
          </div>
        )}
        {coreError && (
          <div className="mt-5 flex items-center justify-between gap-3 rounded-xl border border-sp-down-line bg-sp-down-soft px-4 py-3 text-[12px] text-sp-down-deep">
            <span className="min-w-0 truncate">Live reads are failing: {coreError}</span>
            <button type="button" onClick={() => void loadCore()} className="shrink-0 rounded-full border border-sp-down-line px-3 py-1.5 text-[11px] font-extrabold hover:bg-sp-surface">
              Retry
            </button>
          </div>
        )}

        {core && (
          <>
            <TokenHeader
              core={core}
              profile={profile}
              copied={copied}
              onCopy={() => void copyAddress()}
              isCreator={isCreator}
              onAddSocials={() => setProfileRequest((count) => count + 1)}
            />

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
                  <StatsCard core={core} tokenAddress={tokenAddress} ethUsd={ethUsd} trades={history.trades} balances={history.balances} historyComplete={historyComplete} poolPriceWei={poolPriceWei} copied={copied} onCopy={() => void copyAddress()} />
                </div>
              </div>

              <div className="min-w-0 lg:col-start-1 lg:row-start-2">
                <DetailTabs
                  core={core}
                  tokenAddress={tokenAddress}
                  ethUsd={ethUsd}
                  trades={history.trades}
                  balances={history.balances}
                  historyLoading={history.loading}
                  historyError={history.error}
                  truncated={history.truncated}
                  historyComplete={historyComplete}
                  onRetryHistory={() => void reloadHistory()}
                  profile={profile}
                  isCreator={isCreator}
                  profileRequest={profileRequest}
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
  isCreator,
  onAddSocials,
}: {
  core: CoreState;
  profile: TokenProfileView | null;
  copied: boolean;
  onCopy: () => void;
  isCreator: boolean;
  /** Tworca klikajacy pusta ikonke ma trafic do formularza profilu. */
  onAddSocials: () => void;
}) {
  const image = pickTokenImage({ profileLogoUrl: profile?.logoUrl, metadataUri: core.config.metadataURI });
  const chainMeta = parseMetadataUri(core.config.metadataURI);
  const description = profile?.description ?? chainMeta.description;
  const website = socialUrl(profile?.website, '');
  const twitter = socialUrl(profile?.twitter, 'https://x.com/');
  const telegram = socialUrl(profile?.telegram, 'https://t.me/');

  const stateClass =
    core.state === 'Graduated'
      ? 'bg-sp-up-soft text-sp-up'
      : core.state === 'Locked'
        ? 'bg-sp-down-soft text-sp-down-deep'
        : 'bg-sp-brand-soft text-sp-brand-deep';

  return (
    <header className="mt-4 rounded-[20px] border border-sp-shade/10 bg-sp-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <div className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-[18px] bg-soft-primary font-soft-display text-[22px] font-extrabold text-sp-on-brand">
            {image.url ? (
              // Logo pochodzi od obcego tworcy - metadata.ts przepuszcza
              // wylacznie https, ipfs i rastrowe data:image z uploadu,
              // a przy padzie obrazka zostaje inicjal.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image.url} alt="" className="absolute inset-0 h-full w-full object-cover" referrerPolicy="no-referrer" loading="lazy" />
            ) : (
              core.symbol.slice(0, 2)
            )}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-soft-display text-[26px] font-extrabold leading-tight text-sp-ink sm:text-[30px]">{core.symbol}</h1>
              <span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em] ${stateClass}`}>{core.state}</span>
            </div>
            <p className="mt-0.5 truncate text-[13px] text-sp-shade/50">
              {core.name} · launched {timeAgo(core.startedAt)}
            </p>
            {description && <p className="mt-1.5 max-w-[560px] text-[12px] leading-[1.5] text-sp-shade/55">{description.slice(0, 280)}</p>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SocialLink href={website} label="website" isCreator={isCreator} onAdd={onAddSocials}>
            <Globe className="h-4 w-4" aria-hidden="true" />
          </SocialLink>
          <SocialLink href={twitter} label="X profile" isCreator={isCreator} onAdd={onAddSocials}>
            <AtSign className="h-4 w-4" aria-hidden="true" />
          </SocialLink>
          <SocialLink href={telegram} label="Telegram" isCreator={isCreator} onAdd={onAddSocials}>
            <Send className="h-4 w-4" aria-hidden="true" />
          </SocialLink>
          {/* Udostepnianie stoi PRZED adresem i eksploratorem: tamte dwa sluza
              temu, kto juz tu jest, a to jest jedyny przycisk w naglowku, ktory
              sprowadza kogos nowego. Cena idzie z odczytu spot, a po graduacji
              (gdy ten odczyt rewertuje) z ostatnich rezerw krzywej - ten sam
              wzor, ktorym liczy sie mnoznik na karcie. */}
          <ShareToken
            variant="button"
            address={core.token}
            chainId={LAUNCHPAD_CHAIN.id}
            symbol={core.symbol}
            raised={Number(formatEther(core.ethReserve))}
            target={CURVE_TARGET_ETH}
            state={core.state}
            priceEth={priceToNumber(
              core.spotPriceWei > 0n ? core.spotPriceWei : priceWeiAfter(core.ethReserve, core.tokenReserve)
            )}
          />
          <button type="button" onClick={onCopy} className="inline-flex items-center gap-1.5 rounded-full border border-sp-shade/10 bg-sp-surface px-3.5 py-2 text-[12px] font-extrabold text-sp-ink hover:border-soft-primary">
            {copied ? <Check className="h-3.5 w-3.5 text-sp-up" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
            {copied ? 'Copied' : short(core.token)}
          </button>
          <a href={`${EXPLORER}/address/${core.token}`} target="_blank" rel="noreferrer" className="rounded-full border border-sp-shade/10 bg-sp-surface p-2.5 text-sp-shade/50 hover:text-soft-primary-deep" aria-label="Open token on BaseScan">
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </a>
        </div>
      </div>
    </header>
  );
}

/**
 * Ikonka linku spolecznosciowego, ktora STOI TAM ZAWSZE.
 *
 * Wczesniej brakujacy link znaczyl brak ikonki - naglowek wygladal wtedy tak
 * samo jak naglowek tokena, ktory po prostu nie ma strony, i nie dalo sie
 * odroznic "nie ma" od "nie sprawdzalem". Teraz brak jest widoczny: ikona
 * zostaje, przygaszona i z przerywana obwodka.
 *
 * Dla ogladajacego pusta ikona nie jest klikalna - klikalna pustka to obietnica
 * bez pokrycia. Dla TWORCY tego tokena jest przyciskiem, ktory otwiera
 * zakladke Info z formularzem profilu, bo to on i tylko on moze ten brak
 * uzupelnic.
 */
function SocialLink({
  href,
  label,
  isCreator,
  onAdd,
  children,
}: {
  href: string | null;
  label: string;
  isCreator: boolean;
  onAdd: () => void;
  children: React.ReactNode;
}) {
  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="rounded-full border border-sp-shade/10 bg-sp-surface p-2.5 text-sp-shade/50 hover:text-soft-primary-deep"
        aria-label={`Project ${label}`}
      >
        {children}
      </a>
    );
  }

  if (isCreator) {
    return (
      <button
        type="button"
        onClick={onAdd}
        className="rounded-full border border-dashed border-sp-shade/15 bg-sp-surface p-2.5 text-sp-shade/25 transition-colors hover:border-soft-primary hover:text-soft-primary-deep"
        aria-label={`Add ${label}`}
        title={`Add ${label}`}
      >
        {children}
      </button>
    );
  }

  return (
    <span
      className="rounded-full border border-dashed border-sp-shade/10 bg-sp-surface p-2.5 text-sp-shade/20"
      title={`No ${label} set`}
      aria-label={`No ${label} set`}
    >
      {children}
    </span>
  );
}

function StatsCard({
  core,
  tokenAddress,
  ethUsd,
  trades,
  balances,
  historyComplete,
  poolPriceWei,
  copied,
  onCopy,
}: {
  core: CoreState;
  tokenAddress: Address | null;
  ethUsd: number | null;
  trades: TradeEntry[];
  balances: Map<string, bigint>;
  /** Historia siega bloku startu tokena, wiec salda sa dokladne, nie przyblizone. */
  historyComplete: boolean;
  /** Biezaca cena z puli po graduacji; null = nie wiemy, zostaje krzywa. */
  poolPriceWei: bigint | null;
  copied: boolean;
  onCopy: () => void;
}) {
  const lastTrade = trades.length ? trades[trades.length - 1] : null;
  // Kolejnosc zrodel: pula (po graduacji) -> spot z krzywej -> ostatnia cena z
  // historii. Do 15 sierpnia 2026 pierwszego czlonu nie bylo i po graduacji
  // strona zatrzymywala sie na ostatniej cenie krzywej.
  const priceWei = poolPriceWei ?? (core.spotPriceWei > 0n ? core.spotPriceWei : lastTrade?.priceWei ?? START_PRICE_WEI);
  const volumeWei = useMemo(() => trades.reduce((sum, trade) => sum + trade.eth, 0n), [trades]);
  // Liczba posiadaczy z LANCUCHA: policzona z transferow, ktore i tak mamy.
  // Dziala offline wzgledem Blockscouta i jest fallbackiem, gdy indeks milczy.
  const holdersFromChain = useMemo(() => {
    let count = 0;
    for (const [holder, balance] of balances) {
      if (balance > 0n && holder !== LAUNCHPAD_ADDRESS.toLowerCase()) count += 1;
    }
    return count;
  }, [balances]);

  // Liczniki z BLOCKSCOUTA jednym zapytaniem: posiadacze i WSZYSTKIE transfery
  // tokena. Transferow z wlasnych danych dzis nie liczymy, wiec to zapytanie
  // zostaje - ale o liczbie POSIADACZY nie rozstrzyga juz, gdy mamy dokladne
  // salda (patrz `holdersAreExact`).
  const [counters, setCounters] = useState<TokenCounters>({ holders: null, transfers: null });
  useEffect(() => {
    if (!tokenAddress) return;
    let cancelled = false;
    void fetchTokenCounters(LAUNCHPAD_CHAIN.id, tokenAddress).then((data) => {
      if (!cancelled) setCounters(data);
    });
    return () => {
      cancelled = true;
    };
  }, [tokenAddress]);

  const exactHolders = holdersAreExact({ complete: historyComplete, knownBalances: balances.size });
  const holdersCount = pickHolderCount({ chain: holdersFromChain, index: counters.holders, exact: exactHolders });

  // USD to zawsze dopisek, nigdy wartosc glowna - przy braku kursu (null)
  // wiersz wyglada dokladnie tak, jak przed dodaniem dopiskow.
  const rows: Array<{ label: string; value: string; usd?: string | null }> = [
    {
      // Nazwa mowi, SKAD jest ta liczba. Po graduacji cena nie pochodzi juz z
      // krzywej i udawanie, ze pochodzi, byloby drobnym klamstwem o rynku.
      label: poolPriceWei ? 'Pool price' : 'Price',
      value: `${fmtPrice(priceToNumber(priceWei))} ${NATIVE_SYMBOL}`,
      // Cena tokena to ulamek centa - `fmtUsdPrice` pokazuje ja pelnym zapisem
      // ($0.00000367) zamiast bezuzytecznego "<$0.01".
      usd: ethUsd !== null ? fmtUsdPrice(priceToNumber(priceWei) * ethUsd) : null,
    },
    { label: 'Market cap', value: `${fmtEth(mcapWei(priceWei), 3)} ${NATIVE_SYMBOL}`, usd: usdSuffix(mcapWei(priceWei), ethUsd) },
    { label: `${NATIVE_SYMBOL} reserve`, value: `${fmtEth(core.ethReserve, 4)} ${NATIVE_SYMBOL}`, usd: usdSuffix(core.ethReserve, ethUsd) },
    { label: 'Volume', value: `${fmtEth(volumeWei, 4)} ${NATIVE_SYMBOL}`, usd: usdSuffix(volumeWei, ethUsd) },
    { label: 'Trades', value: String(trades.length) },
    // Transfery z indeksu Blockscouta - wszystkie ruchy tokena, nie tylko nasze
    // transakcje krzywej. Gdy indeks milczy, chowamy wiersz zamiast klamac zerem.
    ...(counters.transfers !== null
      ? [{ label: 'Transfers', value: String(counters.transfers) }]
      : []),
    { label: 'Holders', value: String(holdersCount) },
    { label: 'Age', value: timeAgo(core.startedAt).replace(' ago', '') },
    { label: 'Curve fee', value: core.config.known ? `${(core.config.feeBps / 100).toFixed(2)}%` : '--' },
  ];

  return (
    <section className="rounded-[20px] border border-sp-shade/10 bg-sp-surface p-4 sm:p-5">
      <h2 className="text-[13px] font-extrabold text-sp-ink">Stats</h2>
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-3">
        {rows.map((row) => (
          <div key={row.label} className="min-w-0">
            <dt className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-sp-shade/40">{row.label}</dt>
            <dd className="mt-0.5 truncate text-[14px] font-extrabold text-sp-ink">
              {row.value}
              {row.usd && <span className="ml-1 text-[11px] font-bold text-sp-shade/40">· {row.usd}</span>}
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 space-y-2 border-t border-sp-shade/10 pt-3 text-[11.5px]">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sp-shade/45">Creator</span>
          <a href={`${EXPLORER}/address/${core.creator}`} target="_blank" rel="noreferrer" className="font-extrabold text-soft-primary-deep hover:text-soft-primary">
            {short(core.creator)}
          </a>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-sp-shade/45">Token</span>
          <button type="button" onClick={onCopy} className="inline-flex items-center gap-1.5 font-extrabold text-sp-ink hover:text-soft-primary-deep">
            {copied ? <Check className="h-3 w-3 text-sp-up" aria-hidden="true" /> : <Copy className="h-3 w-3" aria-hidden="true" />}
            {short(core.token)}
          </button>
        </div>
      </div>
    </section>
  );
}

function TokenNotFound({ address }: { address: string }) {
  return (
    <main className="min-h-screen bg-sp-sunken px-4 pb-24 pt-10 font-soft sm:px-6">
      <div className="mx-auto w-full max-w-[560px] rounded-[20px] border border-sp-shade/10 bg-sp-surface p-8 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-sp-brand-soft">
          <SearchX className="h-6 w-6 text-soft-primary" aria-hidden="true" />
        </span>
        <h1 className="mt-4 font-soft-display text-[24px] font-extrabold text-sp-ink">Token not found</h1>
        <p className="mt-2 text-[13px] leading-[1.6] text-sp-shade/55">
          {isAddressParam(address)
            ? `This address is not a token launched on the MySphere launchpad on ${LAUNCHPAD_CHAIN.name}.`
            : 'This link does not contain a valid token address.'}
        </p>
        <Link href="/startpad" className="mt-5 inline-flex items-center gap-2 rounded-full bg-soft-primary px-5 py-2.5 text-[13px] font-extrabold text-sp-on-brand">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to the Startpad market
        </Link>
      </div>
    </main>
  );
}

'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Layers3,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { formatEther, formatUnits, maxUint256, parseUnits, type Address } from 'viem';
import { useAccount, useChainId, usePublicClient, useSwitchChain, useWalletClient } from 'wagmi';
import {
  erc20Abi,
  hookAbi,
  LAUNCH_HOOK_ADDRESS,
  LAUNCHPAD_ADDRESS,
  LAUNCHPAD_CHAIN,
  launchpadAbi,
  LIQUIDITY_VAULT_ADDRESS,
  liquidityVaultAbi,
} from '../config';
import {
  applySlippage,
  DEFAULT_SLIPPAGE_BPS,
  fmtEth,
  fmtTokens,
  SLIPPAGE_OPTIONS,
  TARGET_WEI,
  toWei,
  tradeErrorMessage,
  usdSuffix,
  type CoreState,
} from './detailShared';

/**
 * Panel handlu NA STRONIE tokena - koniec z odsylaniem do boardu. Wzorce
 * wywolan (quote -> bufor poslizgu -> write -> waitForTransactionReceipt) sa
 * skopiowane 1:1 z LaunchpadBoard, zeby obie sciezki zachowywaly sie tak samo.
 */

const FIELD =
  'w-full rounded-xl border border-black/10 bg-white px-3.5 py-3 text-[14px] text-[#16141b] outline-none transition-colors placeholder:text-black/35 focus:border-[#7c6bda]';

type Side = 'buy' | 'sell';
type Busy = 'buy' | 'approve' | 'sell' | 'graduate' | 'settle' | 'harvest' | 'claim' | null;
type ClaimSource = 'launch' | 'hookEth' | 'hookToken' | 'vaultEth' | 'vaultToken';

/** Ile ETH zostawiamy na gaz, gdy ktos klika Max. */
const GAS_HEADROOM_WEI = 5_000_000_000_000_000n;

export default function TradePanel({
  core,
  ethUsd,
  onAfterTx,
}: {
  core: CoreState;
  /** Kurs ETH/USD do dopiskow; null = dopiski znikaja, ETH zostaje. */
  ethUsd: number | null;
  onAfterTx: () => void;
}) {
  const { address: account, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { data: walletClient } = useWalletClient();
  const readClient = usePublicClient({ chainId: LAUNCHPAD_CHAIN.id });

  const [side, setSide] = useState<Side>('buy');
  const [buyAmount, setBuyAmount] = useState('0.05');
  const [sellAmount, setSellAmount] = useState('');
  const [busy, setBusy] = useState<Busy>(null);
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [buyQuote, setBuyQuote] = useState<{ tokensOut: bigint; fee: bigint; refund: bigint } | null>(null);
  const [sellQuote, setSellQuote] = useState<{ ethOut: bigint; fee: bigint } | null>(null);
  const [ethBalance, setEthBalance] = useState<bigint | null>(null);
  const [slippageBps, setSlippageBps] = useState<number>(DEFAULT_SLIPPAGE_BPS);

  const onCurve = core.state === 'Curve';
  // Kontrakt w stanie Locked jawnie DOPUSZCZA sprzedaz (CurveLaunchpad._sell:
  // "W stanie Locked sprzedaz DZIALA... alternatywa jest stanem zakladniczym").
  // Rewertuje tylko kupno. Panel nie moze wiec chowac sprzedazy razem z kupnem.
  const canSell = core.state === 'Curve' || core.state === 'Locked';
  const decimals = core.decimals;

  // Gdy krzywa sie domknela, zakladka kupna znika - wybor musi za tym nadazyc.
  useEffect(() => {
    if (!onCurve && side === 'buy' && canSell) setSide('sell');
  }, [onCurve, canSell, side]);

  useEffect(() => {
    if (!readClient || !account) {
      setEthBalance(null);
      return;
    }
    let cancelled = false;
    readClient
      .getBalance({ address: account })
      .then((value) => {
        if (!cancelled) setEthBalance(value);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // `busy` w zaleznosciach celowo: po kazdej transakcji saldo sie zmienia.
  }, [readClient, account, busy]);

  // Podglad kupna. Krotki debounce, zeby nie strzelac odczytem na kazda litere.
  // Flaga `cancelled` obejmuje takze odpowiedz W LOCIE: samo skasowanie timera
  // nie chroni przed spoznionym `.then`, ktory nadpisalby swiezsza wycene.
  useEffect(() => {
    setBuyQuote(null);
    if (!readClient || !onCurve) return;
    const value = toWei(buyAmount);
    if (value === null || value === 0n) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      readClient
        .readContract({ address: LAUNCHPAD_ADDRESS as Address, abi: launchpadAbi, functionName: 'quoteBuy', args: [core.token, value] })
        .then((quote) => {
          if (!cancelled) setBuyQuote({ tokensOut: quote[0], fee: quote[1], refund: quote[2] });
        })
        .catch(() => {
          if (!cancelled) setBuyQuote(null);
        });
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [readClient, core.token, buyAmount, onCurve]);

  useEffect(() => {
    setSellQuote(null);
    if (!readClient || !canSell) return;
    let amount: bigint;
    try {
      amount = parseUnits(sellAmount || '0', decimals);
    } catch {
      return;
    }
    if (amount <= 0n) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      readClient
        .readContract({ address: LAUNCHPAD_ADDRESS as Address, abi: launchpadAbi, functionName: 'quoteSell', args: [core.token, amount] })
        .then((quote) => {
          if (!cancelled) setSellQuote({ ethOut: quote[0], fee: quote[1] });
        })
        .catch(() => {
          if (!cancelled) setSellQuote(null);
        });
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [readClient, core.token, sellAmount, decimals, canSell]);

  const ensureChain = useCallback(async () => {
    if (chainId === LAUNCHPAD_CHAIN.id) return true;
    try {
      await switchChainAsync({ chainId: LAUNCHPAD_CHAIN.id });
      return true;
    } catch {
      setNotice({ kind: 'error', text: `Switch to ${LAUNCHPAD_CHAIN.name} was cancelled. Nothing was sent.` });
      return false;
    }
  }, [chainId, switchChainAsync]);

  const fail = (cause: unknown) => setNotice({ kind: 'error', text: tradeErrorMessage(cause) });

  /**
   * Zatwierdzenie tokena dla launchpada. Zwraca `true` dopiero, gdy allowance
   * NAPRAWDE wystarcza.
   *
   * Bylo tu `await waitForTransactionReceipt(...)` bez patrzenia na wynik i to
   * kosztowalo ludzi pieniadze: 13 sierpnia 2026 zatwierdzenia na tokenie
   * SAUSAGES wychodzily z limitem gazu 45 552 przy zapotrzebowaniu 46 300,
   * konczyly sie wyczerpaniem gazu - a kod szedl dalej i wysylal `sell`, ktory
   * odbijal sie o `TokenTransferFailed()`. Dwie transakcje, dwa rachunki za
   * gaz, zero sprzedanych tokenow.
   *
   * Stad dwie rzeczy naraz: WLASNY limit gazu z zapasem (portfele licza go
   * ciasno i bez marginesu) oraz sprawdzenie statusu paragonu.
   */
  const ensureAllowance = async (amount: bigint): Promise<boolean> => {
    if (!account || !walletClient || !readClient) return false;

    // Swiezy odczyt, nie `core.allowance` sprzed wejscia na strone.
    const current = (await readClient.readContract({
      address: core.token,
      abi: erc20Abi,
      functionName: 'allowance',
      args: [account, LAUNCHPAD_ADDRESS as Address],
    })) as bigint;
    if (current >= amount) return true;

    setBusy('approve');
    let gas: bigint | undefined;
    try {
      const estimate = await readClient.estimateContractGas({
        address: core.token,
        abi: erc20Abi,
        functionName: 'approve',
        args: [LAUNCHPAD_ADDRESS as Address, maxUint256],
        account,
      });
      gas = (estimate * 125n) / 100n;
    } catch {
      // Bez oszacowania oddajemy pole portfelowi - to nadal lepsze niz brak
      // zatwierdzenia. Sprawdzenie statusu nizej i tak zlapie porazke.
    }

    const hash = await walletClient.writeContract({
      address: core.token,
      abi: erc20Abi,
      functionName: 'approve',
      args: [LAUNCHPAD_ADDRESS as Address, maxUint256],
      chain: LAUNCHPAD_CHAIN,
      account,
      ...(gas ? { gas } : {}),
    });
    const receipt = await readClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== 'success') {
      setNotice({ kind: 'error', text: 'The approval transaction failed, so nothing was sold. Try again.' });
      return false;
    }
    return true;
  };

  const buy = async () => {
    if (!account || !walletClient || !readClient) {
      setNotice({ kind: 'error', text: 'Connect a wallet first.' });
      return;
    }
    const value = toWei(buyAmount);
    if (value === null || value === 0n) {
      setNotice({ kind: 'error', text: 'Enter an ETH amount greater than zero, written as a decimal number.' });
      return;
    }
    if (!(await ensureChain())) return;
    setBusy('buy');
    setNotice(null);
    try {
      const quote = await readClient.readContract({ address: LAUNCHPAD_ADDRESS as Address, abi: launchpadAbi, functionName: 'quoteBuy', args: [core.token, value] });
      const minTokensOut = applySlippage(quote[0], slippageBps);
      // Symulacja PRZED otwarciem portfela. Transakcja, ktora i tak by padla,
      // nie ma po co isc na lancuch - uzytkownik dostaje powod zamiast
      // rachunku za gaz.
      const { request } = await readClient.simulateContract({
        address: LAUNCHPAD_ADDRESS as Address,
        abi: launchpadAbi,
        functionName: 'buy',
        args: [core.token, minTokensOut, BigInt(Math.floor(Date.now() / 1000) + 900)],
        value,
        account,
      });
      void request;
      const hash = await walletClient.writeContract({
        address: LAUNCHPAD_ADDRESS as Address,
        abi: launchpadAbi,
        functionName: 'buy',
        args: [core.token, minTokensOut, BigInt(Math.floor(Date.now() / 1000) + 900)],
        value,
        chain: LAUNCHPAD_CHAIN,
        account,
      });
      const receipt = await readClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== 'success') throw new Error('The buy transaction reverted.');
      setNotice({ kind: 'success', text: `Buy confirmed. ${hash.slice(0, 10)}...` });
      onAfterTx();
    } catch (cause) {
      fail(cause);
    } finally {
      setBusy(null);
    }
  };

  const sell = async () => {
    if (!account || !walletClient || !readClient) {
      setNotice({ kind: 'error', text: 'Connect a wallet first.' });
      return;
    }
    let amount: bigint;
    try {
      amount = parseUnits(sellAmount, decimals);
    } catch {
      setNotice({ kind: 'error', text: 'Enter a valid token amount.' });
      return;
    }
    if (amount <= 0n || amount > core.balance) {
      setNotice({ kind: 'error', text: 'The sell amount is larger than your token balance.' });
      return;
    }
    if (!(await ensureChain())) return;
    setNotice(null);
    try {
      if (!(await ensureAllowance(amount))) return;
      setBusy('sell');
      const quote = await readClient.readContract({ address: LAUNCHPAD_ADDRESS as Address, abi: launchpadAbi, functionName: 'quoteSell', args: [core.token, amount] });
      const minEthOut = applySlippage(quote[0], slippageBps);
      await readClient.simulateContract({
        address: LAUNCHPAD_ADDRESS as Address,
        abi: launchpadAbi,
        functionName: 'sell',
        args: [core.token, amount, minEthOut, BigInt(Math.floor(Date.now() / 1000) + 900)],
        account,
      });
      const hash = await walletClient.writeContract({
        address: LAUNCHPAD_ADDRESS as Address,
        abi: launchpadAbi,
        functionName: 'sell',
        args: [core.token, amount, minEthOut, BigInt(Math.floor(Date.now() / 1000) + 900)],
        chain: LAUNCHPAD_CHAIN,
        account,
      });
      const receipt = await readClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== 'success') throw new Error('The sell transaction reverted.');
      setSellAmount('');
      setNotice({ kind: 'success', text: `Sell confirmed. ${hash.slice(0, 10)}...` });
      onAfterTx();
    } catch (cause) {
      fail(cause);
    } finally {
      setBusy(null);
    }
  };

  const graduate = async () => {
    if (!account || !walletClient || !readClient) {
      setNotice({ kind: 'error', text: 'Connect a wallet before graduating this token.' });
      return;
    }
    if (!(await ensureChain())) return;
    setBusy('graduate');
    setNotice(null);
    try {
      const hash = await walletClient.writeContract({ address: LAUNCHPAD_ADDRESS as Address, abi: launchpadAbi, functionName: 'graduate', args: [core.token], chain: LAUNCHPAD_CHAIN, account });
      const receipt = await readClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== 'success') throw new Error('The graduation transaction reverted.');
      setNotice({ kind: 'success', text: `Pool opened. ${hash.slice(0, 10)}...` });
      onAfterTx();
    } catch (cause) {
      fail(cause);
    } finally {
      setBusy(null);
    }
  };

  const settle = async () => {
    if (!account || !walletClient || !readClient) {
      setNotice({ kind: 'error', text: 'Connect a wallet before settling fees.' });
      return;
    }
    if (!(await ensureChain())) return;
    setBusy('settle');
    try {
      const hash = await walletClient.writeContract({ address: LAUNCH_HOOK_ADDRESS as Address, abi: hookAbi, functionName: 'settle', args: [core.token], chain: LAUNCHPAD_CHAIN, account });
      await readClient.waitForTransactionReceipt({ hash });
      setNotice({ kind: 'success', text: `Hook fees settled. ${hash.slice(0, 10)}...` });
      onAfterTx();
    } catch (cause) {
      fail(cause);
    } finally {
      setBusy(null);
    }
  };

  const harvest = async () => {
    if (!account || !walletClient || !readClient) {
      setNotice({ kind: 'error', text: 'Connect a wallet before harvesting fees.' });
      return;
    }
    if (!(await ensureChain())) return;
    setBusy('harvest');
    try {
      const hash = await walletClient.writeContract({ address: LIQUIDITY_VAULT_ADDRESS as Address, abi: liquidityVaultAbi, functionName: 'harvest', args: [core.token], chain: LAUNCHPAD_CHAIN, account });
      await readClient.waitForTransactionReceipt({ hash });
      setNotice({ kind: 'success', text: `Pool fees harvested. ${hash.slice(0, 10)}...` });
      onAfterTx();
    } catch (cause) {
      fail(cause);
    } finally {
      setBusy(null);
    }
  };

  const claim = async (source: ClaimSource) => {
    if (!account || !walletClient || !readClient) {
      setNotice({ kind: 'error', text: 'Connect a wallet before claiming.' });
      return;
    }
    if (!(await ensureChain())) return;
    setBusy('claim');
    try {
      const transaction =
        source === 'launch'
          ? { address: LAUNCHPAD_ADDRESS as Address, abi: launchpadAbi, functionName: 'claim' as const, args: [] as const }
          : source === 'hookEth'
            ? { address: LAUNCH_HOOK_ADDRESS as Address, abi: hookAbi, functionName: 'claimEth' as const, args: [] as const }
            : source === 'hookToken'
              ? { address: LAUNCH_HOOK_ADDRESS as Address, abi: hookAbi, functionName: 'claimToken' as const, args: [core.token] as const }
              : source === 'vaultEth'
                ? { address: LIQUIDITY_VAULT_ADDRESS as Address, abi: liquidityVaultAbi, functionName: 'claimEth' as const, args: [] as const }
                : { address: LIQUIDITY_VAULT_ADDRESS as Address, abi: liquidityVaultAbi, functionName: 'claimToken' as const, args: [core.token] as const };
      // Symulacja przed podpisem. Kwota w tabelce pochodzi z odczytu przy
      // wejsciu na strone i potrafi sie zdezaktualizowac - a wtedy przycisk
      // zostaje aktywny i wysyla transakcje donikad. Tak wlasnie odpadlo 37 z
      // 37 wywolan `claim` na Base mainnet: kazde z `NothingToClaim()` i
      // kazde oplacone gazem.
      // eslint-disable-next-line
      await readClient.simulateContract({ ...transaction, account } as any);
      // Unia pieciu ksztaltow wywolania nie sklada sie w jeden przeciazony
      // podpis writeContract - ten sam swiadomy skrot, co w LaunchpadBoard.
      // eslint-disable-next-line
      const hash = await walletClient.writeContract({ ...transaction, chain: LAUNCHPAD_CHAIN, account } as any);
      await readClient.waitForTransactionReceipt({ hash });
      setNotice({ kind: 'success', text: `Claim confirmed. ${hash.slice(0, 10)}...` });
      onAfterTx();
    } catch (cause) {
      fail(cause);
    } finally {
      setBusy(null);
    }
  };

  // Wspolne wydawalne ETH: saldo minus zapas na gaz. Bez zapasu "Max" = calosc
  // i transakcji brakuje na oplate gazu.
  const spendableEth = () =>
    ethBalance === null ? null : ethBalance > GAS_HEADROOM_WEI ? ethBalance - GAS_HEADROOM_WEI : 0n;

  const setBuyPct = (pct: bigint) => {
    const max = spendableEth();
    if (max === null) return;
    setBuyAmount(formatEther((max * pct) / 100n));
  };
  const setMaxBuy = () => setBuyPct(100n);

  const setSellPct = (pct: bigint) => {
    setSellAmount(formatUnits((core.balance * pct) / 100n, decimals));
  };

  const progressPct = core.state === 'Curve' ? Number((core.ethReserve * 10_000n) / TARGET_WEI) / 100 : 100;
  const remaining = TARGET_WEI > core.ethReserve ? TARGET_WEI - core.ethReserve : 0n;

  // Dopisek USD przy kupowanych tokenach liczymy z ETH, ktore REALNIE wchodzi
  // do krzywej (wklad minus oplata i zwrot) - to jest cena zaplacona za te
  // tokeny, a nie wycena po spocie, ktory duzy zakup sam przesuwa.
  const buyUsd = (() => {
    if (!buyQuote) return null;
    const value = toWei(buyAmount);
    if (value === null) return null;
    const net = value - buyQuote.fee - buyQuote.refund;
    return net > 0n ? usdSuffix(net, ethUsd) : null;
  })();
  const sellUsd = sellQuote ? usdSuffix(sellQuote.ethOut, ethUsd) : null;

  // USD tylko przy pozycjach w ETH - wycena claimow w tokenie wymagalaby
  // kursu tokena, ktorego swiezo wystartowany rynek po prostu nie ma.
  // Dopisek dopiero od niezerowej kwoty: "0 · $0.00" to szum, nie informacja.
  const claimRows: Array<{ label: string; value: string; amount: bigint; source: ClaimSource; usd?: string | null }> = [
    { label: 'Startpad fees (ETH)', value: fmtEth(core.launchClaimable), amount: core.launchClaimable, source: 'launch', usd: core.launchClaimable > 0n ? usdSuffix(core.launchClaimable, ethUsd) : null },
    { label: 'Hook ETH', value: fmtEth(core.hookEthClaimable), amount: core.hookEthClaimable, source: 'hookEth', usd: core.hookEthClaimable > 0n ? usdSuffix(core.hookEthClaimable, ethUsd) : null },
    { label: `Hook ${core.symbol}`, value: fmtTokens(core.hookTokenClaimable, decimals), amount: core.hookTokenClaimable, source: 'hookToken' },
    { label: 'Vault ETH', value: fmtEth(core.vaultEthClaimable), amount: core.vaultEthClaimable, source: 'vaultEth', usd: core.vaultEthClaimable > 0n ? usdSuffix(core.vaultEthClaimable, ethUsd) : null },
    { label: `Vault ${core.symbol}`, value: fmtTokens(core.vaultTokenClaimable, decimals), amount: core.vaultTokenClaimable, source: 'vaultToken' },
  ];
  const hasClaims = claimRows.some((row) => row.amount > 0n);

  return (
    <section className="rounded-[20px] border border-black/10 bg-white p-4 sm:p-5">
      {/* Pasek postepu krzywej - zawsze na wierzchu panelu, bo odpowiada na
          pierwsze pytanie kazdego kupujacego: jak daleko do graduacji. */}
      <div>
        <div className="flex items-baseline justify-between">
          <span className="text-[12px] font-extrabold text-[#16141b]">Bonding curve</span>
          <span className={`text-[11px] font-extrabold ${core.state === 'Graduated' ? 'text-[#0b9a51]' : core.state === 'Locked' ? 'text-[#a34b08]' : 'text-[#12a451]'}`}>
            {core.state === 'Graduated' ? 'Graduated' : core.state === 'Locked' ? 'Curve full' : `${progressPct.toFixed(1)}%`}
          </span>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-black/8">
          <div
            className={`h-full rounded-full transition-[width] duration-500 ${core.state === 'Graduated' ? 'bg-[#12a451]' : core.state === 'Locked' ? 'bg-[#d78a55]' : 'bg-soft-primary'}`}
            style={{ width: `${Math.min(100, progressPct)}%` }}
          />
        </div>
        <p className="mt-1.5 text-[11px] text-black/45">
          {core.state === 'Curve'
            ? `${fmtEth(core.ethReserve)} of ${Number(formatEther(TARGET_WEI)).toFixed(2)} ETH · ${fmtEth(remaining)} ETH to graduation`
            : core.state === 'Locked'
              ? 'The curve is closed at 3.00 ETH. Anyone can open the Uniswap v4 pool below.'
              : 'Liquidity lives in the Uniswap v4 pool with the launch hook attached.'}
        </p>
      </div>

      {canSell && (
        <>
          <div className="mt-4 flex items-center gap-1 rounded-xl bg-[#f4f1ff] p-1">
            {(onCurve ? (['buy', 'sell'] as const) : (['sell'] as const)).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setSide(item)}
                className={`flex-1 rounded-lg px-3 py-2 text-[12px] font-extrabold capitalize ${side === item ? 'bg-white text-soft-primary-deep shadow-sm' : 'text-black/45'}`}
              >
                {item === 'buy' ? 'Buy' : 'Sell'}
              </button>
            ))}
          </div>
          {!onCurve && (
            <p className="mt-2 text-[11px] leading-[1.4] text-black/50">
              Buying is closed, the curve is full. Selling stays open until the pool is opened.
            </p>
          )}

          {side === 'buy' && onCurve ? (
            <>
              <div className="mt-4 flex items-end justify-between">
                <span className="text-[12px] font-extrabold text-[#16141b]">ETH amount</span>
                {ethBalance !== null && <span className="text-[11px] text-black/45">Balance {fmtEth(ethBalance, 4)} ETH</span>}
              </div>
              <div className="relative mt-2">
                <input inputMode="decimal" value={buyAmount} onChange={(event) => setBuyAmount(event.target.value)} className={`${FIELD} pr-14`} aria-label="ETH amount to spend" />
                <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[12px] font-extrabold text-black/40">ETH</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {([25n, 50n, 100n] as const).map((pct) => (
                  <button key={String(pct)} type="button" onClick={() => setBuyPct(pct)} disabled={ethBalance === null} className="rounded-full border border-black/10 px-2.5 py-1 text-[10.5px] font-bold text-black/60 hover:border-soft-primary disabled:opacity-40">
                    {String(pct)}%
                  </button>
                ))}
                <button type="button" onClick={setMaxBuy} disabled={ethBalance === null} className="rounded-full border border-black/10 px-2.5 py-1 text-[10.5px] font-bold text-black/60 hover:border-soft-primary disabled:opacity-40">
                  Max
                </button>
              </div>
              <div className="mt-3 space-y-1 rounded-xl bg-[#f8f7fc] p-3 text-[11px]">
                <div className="flex items-center justify-between">
                  <span className="text-black/50">You receive</span>
                  <span className="font-extrabold text-[#16141b]">
                    {buyQuote ? `~${fmtTokens(buyQuote.tokensOut, decimals)} ${core.symbol}` : '--'}
                    {buyUsd && <span className="ml-1 text-[10px] font-bold text-black/40">· {buyUsd}</span>}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-black/50">Fee</span>
                  <span className="font-bold text-black/60">{buyQuote ? `${fmtEth(buyQuote.fee)} ETH` : '--'}</span>
                </div>
                {buyQuote && buyQuote.refund > 0n && (
                  <div className="flex items-center justify-between">
                    <span className="text-black/50">Refund (curve fills at 3 ETH)</span>
                    <span className="font-bold text-[#0b9a51]">{fmtEth(buyQuote.refund)} ETH</span>
                  </div>
                )}
              </div>
              <button
                type="button"
                disabled={busy === 'buy' || !isConnected}
                onClick={buy}
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-soft-primary px-4 py-3 text-[13px] font-extrabold text-white disabled:opacity-60"
              >
                {busy === 'buy' ? 'Buying...' : isConnected ? `Buy ${core.symbol}` : 'Connect a wallet to trade'}
                <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </>
          ) : (
            <>
              <div className="mt-4 flex items-end justify-between">
                <span className="text-[12px] font-extrabold text-[#16141b]">Token amount</span>
                <span className="text-[11px] text-black/45">Balance {fmtTokens(core.balance, decimals)}</span>
              </div>
              <div className="relative mt-2">
                <input inputMode="decimal" value={sellAmount} onChange={(event) => setSellAmount(event.target.value)} className={`${FIELD} pr-16`} aria-label="Token amount to sell" placeholder="0" />
                <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 max-w-[64px] truncate text-[11px] font-extrabold text-black/40">{core.symbol}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {([25n, 50n, 100n] as const).map((pct) => (
                  <button key={String(pct)} type="button" onClick={() => setSellPct(pct)} disabled={core.balance === 0n} className="rounded-full border border-black/10 px-2.5 py-1 text-[10.5px] font-bold text-black/60 hover:border-soft-primary disabled:opacity-40">
                    {String(pct)}%
                  </button>
                ))}
                <button type="button" onClick={() => setSellPct(100n)} disabled={core.balance === 0n} className="rounded-full border border-black/10 px-2.5 py-1 text-[10.5px] font-bold text-black/60 hover:border-soft-primary disabled:opacity-40">
                  Max
                </button>
              </div>
              <div className="mt-3 space-y-1 rounded-xl bg-[#f8f7fc] p-3 text-[11px]">
                <div className="flex items-center justify-between">
                  <span className="text-black/50">You receive</span>
                  <span className="font-extrabold text-[#16141b]">
                    {sellQuote ? `~${fmtEth(sellQuote.ethOut)} ETH` : '--'}
                    {sellUsd && <span className="ml-1 text-[10px] font-bold text-black/40">· {sellUsd}</span>}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-black/50">Fee</span>
                  <span className="font-bold text-black/60">{sellQuote ? `${fmtEth(sellQuote.fee)} ETH` : '--'}</span>
                </div>
              </div>
              <button
                type="button"
                disabled={busy === 'sell' || busy === 'approve' || !isConnected}
                onClick={sell}
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#16141b] px-4 py-3 text-[13px] font-extrabold text-white disabled:opacity-60"
              >
                {busy === 'approve' ? 'Approving...' : busy === 'sell' ? 'Selling...' : isConnected ? `Sell ${core.symbol}` : 'Connect a wallet to trade'}
                <ArrowDownToLine className="h-4 w-4" aria-hidden="true" />
              </button>
            </>
          )}

          {/* Wspolne dla kupna i sprzedazy: to jest jedna decyzja o tym, na ile
              gorsza cene godzisz sie w zamian za to, ze transakcja przejdzie. */}
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-[10.5px] text-black/40">Max price change you accept</span>
            <span className="inline-flex overflow-hidden rounded-full border border-black/10" role="group" aria-label="Slippage tolerance">
              {SLIPPAGE_OPTIONS.map((bps) => (
                <button
                  key={bps}
                  type="button"
                  aria-pressed={slippageBps === bps}
                  onClick={() => setSlippageBps(bps)}
                  className={`px-2.5 py-1 text-[10.5px] font-extrabold transition-colors ${slippageBps === bps ? 'bg-soft-primary text-white' : 'bg-white text-black/50 hover:text-soft-primary-deep'}`}
                >
                  {bps / 100}%
                </button>
              ))}
            </span>
          </div>
        </>
      )}

      {core.state === 'Locked' && (
        <div className="mt-4 rounded-xl border border-[#f3c58a] bg-[#fff8ed] p-3">
          <div className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#c76b12]" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-extrabold text-[#8c4a0b]">Ready for graduation</p>
              <p className="mt-1 text-[11px] leading-[1.4] text-black/55">
                Anyone can open the pool. Caller reward:{' '}
                {core.gradCallerReward === null
                  ? '--'
                  : `${fmtEth(core.gradCallerReward)} ETH${core.gradCallerReward > 0n && usdSuffix(core.gradCallerReward, ethUsd) ? ` · ${usdSuffix(core.gradCallerReward, ethUsd)}` : ''}`}
                .
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={busy === 'graduate' || !isConnected}
            onClick={graduate}
            className="mt-3 w-full rounded-xl bg-[#c76b12] px-3 py-2.5 text-[12px] font-extrabold text-white disabled:opacity-50"
          >
            {busy === 'graduate' ? 'Opening the pool...' : 'Graduate to Uniswap v4'}
          </button>
        </div>
      )}

      {core.state === 'Graduated' && (
        <div className="mt-4 rounded-xl bg-[#f4f1ff] p-3">
          <div className="flex items-start gap-2">
            <Layers3 className="mt-0.5 h-4 w-4 shrink-0 text-soft-primary" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-extrabold text-[#16141b]">Live Uniswap v4 pool</p>
              <p className="mt-1 text-[11px] leading-[1.4] text-black/55">
                {core.poolId !== `0x${'0'.repeat(64)}` ? `Pool ${core.poolId.slice(0, 10)}... with the launch hook attached.` : 'Pool position is loading.'}
              </p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" disabled={core.pendingEth === 0n || busy === 'settle' || !isConnected} onClick={settle} className="rounded-lg border border-black/10 bg-white px-2 py-2 text-[11px] font-extrabold text-[#16141b] disabled:opacity-40">
              {busy === 'settle' ? 'Settling...' : `Settle ${fmtEth(core.pendingEth)} ETH`}
            </button>
            <button type="button" disabled={busy === 'harvest' || !isConnected} onClick={harvest} className="rounded-lg border border-black/10 bg-white px-2 py-2 text-[11px] font-extrabold text-[#16141b] disabled:opacity-40">
              {busy === 'harvest' ? 'Harvesting...' : 'Harvest LP fees'}
            </button>
          </div>
        </div>
      )}

      {isConnected && (
        <div className="mt-4 border-t border-black/10 pt-4">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-extrabold text-[#16141b]">Your claims</span>
            <CheckCircle2 className={`h-4 w-4 ${hasClaims ? 'text-[#18bd64]' : 'text-black/20'}`} aria-hidden="true" />
          </div>
          {/* Krzywa placi w ETH, ale hook i vault po graduacji nabijaja
              takze strone tokenowa - stary opis "in ETH, not tokens" klamal. */}
          <p className="mt-1 text-[10.5px] leading-[1.4] text-black/40">Curve fees accrue in ETH; after graduation pool fees accrue in both ETH and {core.symbol}. Claims are pull-based: nothing moves until you claim.</p>
          <div className="mt-2 space-y-1.5">
            {claimRows.map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-2 text-[11px]">
                <span className="text-black/50">{row.label}</span>
                <span className="flex items-center gap-2 font-extrabold text-[#16141b]">
                  <span>
                    {row.value}
                    {row.usd && <span className="ml-1 text-[10px] font-bold text-black/40">· {row.usd}</span>}
                  </span>
                  <button type="button" disabled={row.amount === 0n || busy === 'claim'} onClick={() => void claim(row.source)} className="rounded-full border border-black/10 px-2 py-1 text-[10px] text-soft-primary-deep disabled:opacity-30">
                    Claim
                  </button>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {notice && (
        <div className={`mt-4 flex items-start gap-2 rounded-xl border px-3 py-2.5 text-[11.5px] ${notice.kind === 'success' ? 'border-[#9de7bb] bg-[#f0fff5] text-[#08753d]' : 'border-[#f3c58a] bg-[#fff8ed] text-[#a34b08]'}`}>
          <span className="mt-0.5">{notice.kind === 'success' ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />}</span>
          <span className="min-w-0 break-words">{notice.text}</span>
        </div>
      )}
    </section>
  );
}

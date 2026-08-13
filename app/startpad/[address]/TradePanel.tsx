'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ExternalLink,
  Layers3,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { formatEther, formatUnits, maxUint256, parseUnits, type Address } from 'viem';
import { useAccount, useChainId, usePublicClient, useSwitchChain, useWalletClient } from 'wagmi';
import {
  ACTIVE_LAUNCHPAD_NETWORK,
  LAUNCHPAD_EXPLORER_URL,
  NATIVE_SYMBOL,
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
  fractionOf,
  GAS_RESERVE_WEI,
  spendableEth,
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
  'w-full rounded-xl border border-sp-shade/10 bg-sp-surface px-3.5 py-3 text-[14px] text-sp-ink outline-none transition-colors placeholder:text-sp-shade/35 focus:border-sp-brand';

type Side = 'buy' | 'sell';
type Busy = 'buy' | 'approve' | 'sell' | 'graduate' | 'settle' | 'harvest' | 'claim' | null;
type ClaimSource = 'launch' | 'hookEth' | 'hookToken' | 'vaultEth' | 'vaultToken';

// Rezerwa na gaz stala tu jako 0,005 ETH i byla wieksza niz cale saldo malego
// portfela - patrz `GAS_RESERVE_WEI` w detailShared, gdzie jest teraz jedna,
// zmierzona wartosc dla obu paneli handlu.

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
  // Potwierdzenie skopiowania identyfikatora puli. Zostaje do konca sesji -
  // to nie jest stan, ktory trzeba cofac, tylko slad, ze klikniecie zadzialalo.
  const [poolIdCopied, setPoolIdCopied] = useState(false);
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
      setNotice({ kind: 'error', text: `Enter an ${NATIVE_SYMBOL} amount greater than zero, written as a decimal number.` });
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

  // Wydawalne ETH: saldo minus rezerwa na gaz. Ta sama poprawka, co w mini
  // panelu na tablicy - rezerwa 0,005 ETH byla wieksza niz cale saldo malego
  // portfela i kazdy procent wpisywal ZERO. Uzasadnienie przy `GAS_RESERVE_WEI`.
  const spendable = spendableEth(ethBalance, GAS_RESERVE_WEI);

  const setBuyPct = (pct: bigint) => {
    if (spendable <= 0n) return;
    setBuyAmount(formatEther(fractionOf(spendable, pct, 100n)));
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
    { label: `Startpad fees (${NATIVE_SYMBOL})`, value: fmtEth(core.launchClaimable), amount: core.launchClaimable, source: 'launch', usd: core.launchClaimable > 0n ? usdSuffix(core.launchClaimable, ethUsd) : null },
    { label: `Hook ${NATIVE_SYMBOL}`, value: fmtEth(core.hookEthClaimable), amount: core.hookEthClaimable, source: 'hookEth', usd: core.hookEthClaimable > 0n ? usdSuffix(core.hookEthClaimable, ethUsd) : null },
    { label: `Hook ${core.symbol}`, value: fmtTokens(core.hookTokenClaimable, decimals), amount: core.hookTokenClaimable, source: 'hookToken' },
    { label: `Vault ${NATIVE_SYMBOL}`, value: fmtEth(core.vaultEthClaimable), amount: core.vaultEthClaimable, source: 'vaultEth', usd: core.vaultEthClaimable > 0n ? usdSuffix(core.vaultEthClaimable, ethUsd) : null },
    { label: `Vault ${core.symbol}`, value: fmtTokens(core.vaultTokenClaimable, decimals), amount: core.vaultTokenClaimable, source: 'vaultToken' },
  ];
  const hasClaims = claimRows.some((row) => row.amount > 0n);

  return (
    <section className="rounded-[20px] border border-sp-shade/10 bg-sp-surface p-4 sm:p-5">
      {/* Pasek postepu krzywej - zawsze na wierzchu panelu, bo odpowiada na
          pierwsze pytanie kazdego kupujacego: jak daleko do graduacji. */}
      <div>
        <div className="flex items-baseline justify-between">
          <span className="text-[12px] font-extrabold text-sp-ink">Bonding curve</span>
          <span className={`text-[11px] font-extrabold ${core.state === 'Graduated' ? 'text-sp-up' : core.state === 'Locked' ? 'text-sp-down-deep' : 'text-sp-up'}`}>
            {core.state === 'Graduated' ? 'Graduated' : core.state === 'Locked' ? 'Curve full' : `${progressPct.toFixed(1)}%`}
          </span>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-sp-shade/8">
          <div
            className={`h-full rounded-full transition-[width] duration-500 ${core.state === 'Graduated' ? 'bg-sp-up' : core.state === 'Locked' ? 'bg-[#d78a55]' : 'bg-soft-primary'}`}
            style={{ width: `${Math.min(100, progressPct)}%` }}
          />
        </div>
        <p className="mt-1.5 text-[11px] text-sp-shade/45">
          {core.state === 'Curve'
            ? `${fmtEth(core.ethReserve)} of ${Number(formatEther(TARGET_WEI)).toFixed(2)} ${NATIVE_SYMBOL} · ${fmtEth(remaining)} ${NATIVE_SYMBOL} to graduation`
            : core.state === 'Locked'
              ? `The curve is closed at 3.00 ${NATIVE_SYMBOL}. Anyone can open the Uniswap v4 pool below.`
              : 'Liquidity lives in the Uniswap v4 pool with the launch hook attached.'}
        </p>
      </div>

      {canSell && (
        <>
          <div className="mt-4 flex items-center gap-1 rounded-xl bg-sp-brand-soft p-1">
            {(onCurve ? (['buy', 'sell'] as const) : (['sell'] as const)).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setSide(item)}
                className={`flex-1 rounded-lg px-3 py-2 text-[12px] font-extrabold capitalize ${side === item ? 'bg-sp-surface text-soft-primary-deep shadow-sm' : 'text-sp-shade/45'}`}
              >
                {item === 'buy' ? 'Buy' : 'Sell'}
              </button>
            ))}
          </div>
          {!onCurve && (
            <p className="mt-2 text-[11px] leading-[1.4] text-sp-shade/50">
              Buying is closed, the curve is full. Selling stays open until the pool is opened.
            </p>
          )}

          {side === 'buy' && onCurve ? (
            <>
              <div className="mt-4 flex items-end justify-between">
                <span className="text-[12px] font-extrabold text-sp-ink">{NATIVE_SYMBOL} amount</span>
                {ethBalance !== null && <span className="text-[11px] text-sp-shade/45">Balance {fmtEth(ethBalance, 4)} {NATIVE_SYMBOL}</span>}
              </div>
              <div className="relative mt-2">
                <input inputMode="decimal" value={buyAmount} onChange={(event) => setBuyAmount(event.target.value)} className={`${FIELD} pr-14`} aria-label={`${NATIVE_SYMBOL} amount to spend`} />
                <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[12px] font-extrabold text-sp-shade/40">{NATIVE_SYMBOL}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {([25n, 50n, 100n] as const).map((pct) => (
                  <button key={String(pct)} type="button" onClick={() => setBuyPct(pct)} disabled={spendable <= 0n} className="rounded-full border border-sp-shade/10 px-2.5 py-1 text-[10.5px] font-bold text-sp-shade/60 hover:border-soft-primary disabled:opacity-40">
                    {String(pct)}%
                  </button>
                ))}
                <button type="button" onClick={setMaxBuy} disabled={spendable <= 0n} className="rounded-full border border-sp-shade/10 px-2.5 py-1 text-[10.5px] font-bold text-sp-shade/60 hover:border-soft-primary disabled:opacity-40">
                  Max
                </button>
              </div>
              <div className="mt-3 space-y-1 rounded-xl bg-sp-sunken p-3 text-[11px]">
                <div className="flex items-center justify-between">
                  <span className="text-sp-shade/50">You receive</span>
                  <span className="font-extrabold text-sp-ink">
                    {buyQuote ? `~${fmtTokens(buyQuote.tokensOut, decimals)} ${core.symbol}` : '--'}
                    {buyUsd && <span className="ml-1 text-[10px] font-bold text-sp-shade/40">· {buyUsd}</span>}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sp-shade/50">Fee</span>
                  <span className="font-bold text-sp-shade/60">{buyQuote ? `${fmtEth(buyQuote.fee)} ${NATIVE_SYMBOL}` : '--'}</span>
                </div>
                {buyQuote && buyQuote.refund > 0n && (
                  <div className="flex items-center justify-between">
                    <span className="text-sp-shade/50">Refund (curve fills at 3 {NATIVE_SYMBOL})</span>
                    <span className="font-bold text-sp-up">{fmtEth(buyQuote.refund)} {NATIVE_SYMBOL}</span>
                  </div>
                )}
              </div>
              <button
                type="button"
                disabled={busy === 'buy' || !isConnected}
                onClick={buy}
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-soft-primary px-4 py-3 text-[13px] font-extrabold text-sp-on-brand disabled:opacity-60"
              >
                {busy === 'buy' ? 'Buying...' : isConnected ? `Buy ${core.symbol}` : 'Connect a wallet to trade'}
                <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </>
          ) : (
            <>
              <div className="mt-4 flex items-end justify-between">
                <span className="text-[12px] font-extrabold text-sp-ink">Token amount</span>
                <span className="text-[11px] text-sp-shade/45">Balance {fmtTokens(core.balance, decimals)}</span>
              </div>
              <div className="relative mt-2">
                <input inputMode="decimal" value={sellAmount} onChange={(event) => setSellAmount(event.target.value)} className={`${FIELD} pr-16`} aria-label="Token amount to sell" placeholder="0" />
                <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 max-w-[64px] truncate text-[11px] font-extrabold text-sp-shade/40">{core.symbol}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {([25n, 50n, 100n] as const).map((pct) => (
                  <button key={String(pct)} type="button" onClick={() => setSellPct(pct)} disabled={core.balance === 0n} className="rounded-full border border-sp-shade/10 px-2.5 py-1 text-[10.5px] font-bold text-sp-shade/60 hover:border-soft-primary disabled:opacity-40">
                    {String(pct)}%
                  </button>
                ))}
                <button type="button" onClick={() => setSellPct(100n)} disabled={core.balance === 0n} className="rounded-full border border-sp-shade/10 px-2.5 py-1 text-[10.5px] font-bold text-sp-shade/60 hover:border-soft-primary disabled:opacity-40">
                  Max
                </button>
              </div>
              <div className="mt-3 space-y-1 rounded-xl bg-sp-sunken p-3 text-[11px]">
                <div className="flex items-center justify-between">
                  <span className="text-sp-shade/50">You receive</span>
                  <span className="font-extrabold text-sp-ink">
                    {sellQuote ? `~${fmtEth(sellQuote.ethOut)} ${NATIVE_SYMBOL}` : '--'}
                    {sellUsd && <span className="ml-1 text-[10px] font-bold text-sp-shade/40">· {sellUsd}</span>}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sp-shade/50">Fee</span>
                  <span className="font-bold text-sp-shade/60">{sellQuote ? `${fmtEth(sellQuote.fee)} ${NATIVE_SYMBOL}` : '--'}</span>
                </div>
              </div>
              <button
                type="button"
                disabled={busy === 'sell' || busy === 'approve' || !isConnected}
                onClick={sell}
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sp-ink px-4 py-3 text-[13px] font-extrabold text-white disabled:opacity-60"
              >
                {busy === 'approve' ? 'Approving...' : busy === 'sell' ? 'Selling...' : isConnected ? `Sell ${core.symbol}` : 'Connect a wallet to trade'}
                <ArrowDownToLine className="h-4 w-4" aria-hidden="true" />
              </button>
            </>
          )}

          {/* Wspolne dla kupna i sprzedazy: to jest jedna decyzja o tym, na ile
              gorsza cene godzisz sie w zamian za to, ze transakcja przejdzie. */}
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-[10.5px] text-sp-shade/40">Max price change you accept</span>
            <span className="inline-flex overflow-hidden rounded-full border border-sp-shade/10" role="group" aria-label="Slippage tolerance">
              {SLIPPAGE_OPTIONS.map((bps) => (
                <button
                  key={bps}
                  type="button"
                  aria-pressed={slippageBps === bps}
                  onClick={() => setSlippageBps(bps)}
                  className={`px-2.5 py-1 text-[10.5px] font-extrabold transition-colors ${slippageBps === bps ? 'bg-soft-primary text-sp-on-brand' : 'bg-sp-surface text-sp-shade/50 hover:text-soft-primary-deep'}`}
                >
                  {bps / 100}%
                </button>
              ))}
            </span>
          </div>
        </>
      )}

      {core.state === 'Locked' && (
        <div className="mt-4 rounded-xl border border-sp-down-line bg-sp-down-soft p-3">
          <div className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-sp-down" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-extrabold text-sp-down-deep">Ready for graduation</p>
              <p className="mt-1 text-[11px] leading-[1.4] text-sp-shade/55">
                Anyone can open the pool. Caller reward:{' '}
                {core.gradCallerReward === null
                  ? '--'
                  : `${fmtEth(core.gradCallerReward)} ${NATIVE_SYMBOL}${core.gradCallerReward > 0n && usdSuffix(core.gradCallerReward, ethUsd) ? ` · ${usdSuffix(core.gradCallerReward, ethUsd)}` : ''}`}
                .
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={busy === 'graduate' || !isConnected}
            onClick={graduate}
            className="mt-3 w-full rounded-xl bg-sp-down px-3 py-2.5 text-[12px] font-extrabold text-sp-on-brand disabled:opacity-50"
          >
            {busy === 'graduate' ? 'Opening the pool...' : 'Graduate to Uniswap v4'}
          </button>
        </div>
      )}

      {core.state === 'Graduated' && (
        <div className="mt-4 rounded-xl bg-sp-brand-soft p-3">
          <div className="flex items-start gap-2">
            <Layers3 className="mt-0.5 h-4 w-4 shrink-0 text-soft-primary" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-extrabold text-sp-ink">Live Uniswap v4 pool</p>
              {/* ===== DLACZEGO TU NIE MA ADRESU PULI =====
                  Bo pula v4 GO NIE MA. W v3 kazda para byla osobnym kontraktem
                  pod wlasnym adresem; v4 trzyma wszystkie pule w JEDNYM
                  kontrakcie (PoolManager), a pojedyncza pula jest w nim
                  identyfikatorem `poolId` - 32 bajtami, ktorych zaden
                  eksplorator nie ma jak pokazac jako strony.
                  Stal tu skrocony `poolId` bez niczego obok i wygladalo to na
                  wymowke. Wiec: pelny identyfikator do skopiowania, a obok
                  odnosnik do PoolManagera, ktory adres MA - i to jest ten
                  kontrakt, w ktorym te plynnosc da sie sprawdzic u zrodla. */}
              {core.poolId !== `0x${'0'.repeat(64)}` ? (
                <>
                  <p className="mt-1 text-[11px] leading-[1.4] text-sp-shade/55">
                    A v4 pool has no address of its own - it lives inside the PoolManager under this id, with the launch hook attached.
                  </p>
                  <p className="mt-1.5 break-all font-mono text-[10px] leading-[1.35] text-sp-shade/45">{core.poolId}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void navigator.clipboard?.writeText(core.poolId).then(() => setPoolIdCopied(true))}
                      className="rounded-full border border-sp-shade/10 bg-sp-surface px-2.5 py-1 text-[10.5px] font-extrabold text-sp-ink"
                    >
                      {poolIdCopied ? 'Pool id copied' : 'Copy pool id'}
                    </button>
                    <a
                      href={`${LAUNCHPAD_EXPLORER_URL}/address/${ACTIVE_LAUNCHPAD_NETWORK.poolManager}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-full border border-sp-shade/10 bg-sp-surface px-2.5 py-1 text-[10.5px] font-extrabold text-sp-brand-deep"
                    >
                      PoolManager <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </a>
                  </div>
                </>
              ) : (
                <p className="mt-1 text-[11px] leading-[1.4] text-sp-shade/55">Pool position is loading.</p>
              )}
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" disabled={core.pendingEth === 0n || busy === 'settle' || !isConnected} onClick={settle} className="rounded-lg border border-sp-shade/10 bg-sp-surface px-2 py-2 text-[11px] font-extrabold text-sp-ink disabled:opacity-40">
              {busy === 'settle' ? 'Settling...' : `Settle ${fmtEth(core.pendingEth)} ${NATIVE_SYMBOL}`}
            </button>
            <button type="button" disabled={busy === 'harvest' || !isConnected} onClick={harvest} className="rounded-lg border border-sp-shade/10 bg-sp-surface px-2 py-2 text-[11px] font-extrabold text-sp-ink disabled:opacity-40">
              {busy === 'harvest' ? 'Harvesting...' : 'Harvest LP fees'}
            </button>
          </div>
        </div>
      )}

      {isConnected && (
        <div className="mt-4 border-t border-sp-shade/10 pt-4">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-extrabold text-sp-ink">Your claims</span>
            <CheckCircle2 className={`h-4 w-4 ${hasClaims ? 'text-sp-up-vivid' : 'text-sp-shade/20'}`} aria-hidden="true" />
          </div>
          {/* Krzywa placi w ETH, ale hook i vault po graduacji nabijaja
              takze strone tokenowa - stary opis `in ${NATIVE_SYMBOL}, not tokens` klamal. */}
          <p className="mt-1 text-[10.5px] leading-[1.4] text-sp-shade/40">Curve fees accrue in {NATIVE_SYMBOL}; after graduation pool fees accrue in both {NATIVE_SYMBOL} and {core.symbol}. Claims are pull-based: nothing moves until you claim.</p>
          <div className="mt-2 space-y-1.5">
            {claimRows.map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-2 text-[11px]">
                <span className="text-sp-shade/50">{row.label}</span>
                <span className="flex items-center gap-2 font-extrabold text-sp-ink">
                  <span>
                    {row.value}
                    {row.usd && <span className="ml-1 text-[10px] font-bold text-sp-shade/40">· {row.usd}</span>}
                  </span>
                  <button type="button" disabled={row.amount === 0n || busy === 'claim'} onClick={() => void claim(row.source)} className="rounded-full border border-sp-shade/10 px-2 py-1 text-[10px] text-soft-primary-deep disabled:opacity-30">
                    Claim
                  </button>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {notice && (
        <div className={`mt-4 flex items-start gap-2 rounded-xl border px-3 py-2.5 text-[11.5px] ${notice.kind === 'success' ? 'border-sp-up-line bg-sp-up-soft text-sp-up' : 'border-sp-down-line bg-sp-down-soft text-sp-down-deep'}`}>
          <span className="mt-0.5">{notice.kind === 'success' ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />}</span>
          <span className="min-w-0 break-words">{notice.text}</span>
        </div>
      )}
    </section>
  );
}

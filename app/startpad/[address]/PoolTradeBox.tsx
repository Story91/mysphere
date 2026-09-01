'use client';

import { useEffect, useState } from 'react';
import { maxUint256, parseUnits, type Address } from 'viem';
import { useAccount, useChainId, usePublicClient, useSwitchChain, useWalletClient } from 'wagmi';
import { ACTIVE_LAUNCHPAD_NETWORK, LAUNCH_HOOK_ADDRESS, LAUNCHPAD_CHAIN, NATIVE_SYMBOL, erc20Abi } from '../config';
import {
  applySlippage,
  DEFAULT_SLIPPAGE_BPS,
  fmtEth,
  fmtTokens,
  GAS_RESERVE_WEI,
  SLIPPAGE_OPTIONS,
  toWei,
  tradeErrorMessage,
  type CoreState,
} from './detailShared';
import {
  canonicalPoolKey,
  encodeV4ExactInSingle,
  PERMIT2_MAX_AMOUNT,
  permit2Abi,
  permit2Expiration,
  universalRouterAbi,
  V4_BY_CHAIN,
  v4QuoterAbi,
} from './v4Swap';

/**
 * HANDEL PO GRADUACJI. Do 2026-09-02 strona tokena po graduacji pokazywala
 * tylko identyfikator puli i przycisk "copy" - kupic nie bylo jak, chociaz
 * to sa akurat tokeny, ktorym SIE UDALO (SPHERE zgraduowal w cztery godziny
 * i kupno w apce zniknelo dokladnie w momencie, w ktorym bylo najbardziej
 * potrzebne). Ten box to to samo Buy/Sell co na krzywej, tylko przez pule
 * Uniswap v4: wycena z V4Quoter (juz po oplacie hooka), bufor poslizgu,
 * symulacja PRZED otwarciem portfela, potem Universal Router.
 */

const FIELD =
  'w-full rounded-xl border border-sp-shade/10 bg-sp-surface px-3.5 py-3 text-[14px] text-sp-ink outline-none transition-colors placeholder:text-sp-shade/35 focus:border-sp-brand';

type Side = 'buy' | 'sell';
type Busy = 'buy' | 'approve' | 'sell' | null;

export default function PoolTradeBox({ core, onAfterTx }: { core: CoreState; onAfterTx: () => void }) {
  const v4 = V4_BY_CHAIN[ACTIVE_LAUNCHPAD_NETWORK.chain.id];
  const { address: account, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const readClient = usePublicClient({ chainId: LAUNCHPAD_CHAIN.id });
  const { data: walletClient } = useWalletClient();

  const [side, setSide] = useState<Side>('buy');
  const [buyAmount, setBuyAmount] = useState('0.01');
  const [sellAmount, setSellAmount] = useState('');
  const [slippageBps, setSlippageBps] = useState<number>(DEFAULT_SLIPPAGE_BPS);
  const [busy, setBusy] = useState<Busy>(null);
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [quote, setQuote] = useState<bigint | null>(null);
  const [ethBalance, setEthBalance] = useState<bigint | null>(null);

  const decimals = core.decimals;
  const poolKey = canonicalPoolKey(core.token, LAUNCH_HOOK_ADDRESS as Address);

  useEffect(() => {
    if (!readClient || !account) {
      setEthBalance(null);
      return;
    }
    let cancelled = false;
    readClient
      .getBalance({ address: account })
      .then((v) => {
        if (!cancelled) setEthBalance(v);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [readClient, account, core.balance]);

  // Wycena z V4Quoter - symuluje prawdziwy swap z hookiem, wiec wynik jest
  // juz po oplacie LP (0.3%) i hooka (1%). Debounce, zeby nie strzelac do RPC
  // przy kazdym wpisanym znaku.
  useEffect(() => {
    if (!readClient || !v4) {
      setQuote(null);
      return;
    }
    let amountIn: bigint | null = null;
    if (side === 'buy') amountIn = toWei(buyAmount);
    else {
      try {
        amountIn = parseUnits(sellAmount || '0', decimals);
      } catch {
        amountIn = null;
      }
    }
    if (amountIn === null || amountIn <= 0n) {
      setQuote(null);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      readClient
        .readContract({
          address: v4.quoter,
          abi: v4QuoterAbi,
          functionName: 'quoteExactInputSingle',
          args: [{ poolKey, zeroForOne: side === 'buy', exactAmount: amountIn as bigint, hookData: '0x' }],
        })
        .then((res) => {
          if (!cancelled) setQuote((res as readonly [bigint, bigint])[0]);
        })
        .catch(() => {
          if (!cancelled) setQuote(null);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readClient, v4, side, buyAmount, sellAmount, decimals, core.token]);

  const ensureChain = async () => {
    if (chainId === LAUNCHPAD_CHAIN.id) return true;
    try {
      await switchChainAsync({ chainId: LAUNCHPAD_CHAIN.id });
      return true;
    } catch {
      setNotice({ kind: 'error', text: `Switch your wallet to ${LAUNCHPAD_CHAIN.name} to trade.` });
      return false;
    }
  };
  const fail = (cause: unknown) => setNotice({ kind: 'error', text: tradeErrorMessage(cause) });
  const deadline = () => BigInt(Math.floor(Date.now() / 1000) + 900);

  const buy = async () => {
    if (!v4 || !account || !walletClient || !readClient) {
      setNotice({ kind: 'error', text: 'Connect a wallet first.' });
      return;
    }
    const value = toWei(buyAmount);
    if (value === null || value <= 0n) {
      setNotice({ kind: 'error', text: `Enter an ${NATIVE_SYMBOL} amount greater than zero.` });
      return;
    }
    if (!(await ensureChain())) return;
    setBusy('buy');
    setNotice(null);
    try {
      const [out] = (await readClient.readContract({
        address: v4.quoter,
        abi: v4QuoterAbi,
        functionName: 'quoteExactInputSingle',
        args: [{ poolKey, zeroForOne: true, exactAmount: value, hookData: '0x' }],
      })) as readonly [bigint, bigint];
      const minOut = applySlippage(out, slippageBps);
      const { commands, inputs } = encodeV4ExactInSingle({ poolKey, zeroForOne: true, amountIn: value, minOut });
      const args = [commands, inputs, deadline()] as const;
      // Symulacja przed portfelem: transakcja, ktora i tak by padla, nie ma po
      // co isc na lancuch - uzytkownik dostaje powod, nie rachunek za gaz.
      await readClient.simulateContract({ address: v4.universalRouter, abi: universalRouterAbi, functionName: 'execute', args, value, account });
      const hash = await walletClient.writeContract({
        address: v4.universalRouter,
        abi: universalRouterAbi,
        functionName: 'execute',
        args,
        value,
        chain: LAUNCHPAD_CHAIN,
        account,
      });
      const receipt = await readClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== 'success') throw new Error('The swap reverted.');
      setNotice({ kind: 'success', text: `Buy confirmed in the v4 pool. ${hash.slice(0, 10)}...` });
      onAfterTx();
    } catch (cause) {
      fail(cause);
    } finally {
      setBusy(null);
    }
  };

  /**
   * Sprzedaz idzie przez Permit2 (tak sciaga tokeny Universal Router):
   *   1. token.approve(Permit2, max)          - raz na token,
   *   2. Permit2.approve(token, router, max, 30 dni) - raz na miesiac.
   * Kazde zatwierdzenie czeka na paragon i sprawdza status - patrz historia
   * SAUSAGES w TradePanel: zatwierdzenie bez gazu + sprzedaz = dwa rachunki,
   * zero sprzedanych tokenow.
   */
  const ensurePermit2 = async (amount: bigint): Promise<boolean> => {
    if (!v4 || !account || !walletClient || !readClient) return false;
    const erc20Allowance = (await readClient.readContract({
      address: core.token,
      abi: erc20Abi,
      functionName: 'allowance',
      args: [account, v4.permit2],
    })) as bigint;
    if (erc20Allowance < amount) {
      setBusy('approve');
      let gas: bigint | undefined;
      try {
        const est = await readClient.estimateContractGas({ address: core.token, abi: erc20Abi, functionName: 'approve', args: [v4.permit2, maxUint256], account });
        gas = (est * 125n) / 100n;
      } catch {
        /* portfel oszacuje sam */
      }
      const hash = await walletClient.writeContract({
        address: core.token,
        abi: erc20Abi,
        functionName: 'approve',
        args: [v4.permit2, maxUint256],
        chain: LAUNCHPAD_CHAIN,
        account,
        ...(gas ? { gas } : {}),
      });
      const receipt = await readClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== 'success') {
        setNotice({ kind: 'error', text: 'The token approval failed, so nothing was sold. Try again.' });
        return false;
      }
    }
    const [p2Amount, p2Exp] = (await readClient.readContract({
      address: v4.permit2,
      abi: permit2Abi,
      functionName: 'allowance',
      args: [account, core.token, v4.universalRouter],
    })) as readonly [bigint, number, number];
    const now = Math.floor(Date.now() / 1000);
    if (p2Amount < amount || Number(p2Exp) <= now + 60) {
      setBusy('approve');
      const hash = await walletClient.writeContract({
        address: v4.permit2,
        abi: permit2Abi,
        functionName: 'approve',
        args: [core.token, v4.universalRouter, PERMIT2_MAX_AMOUNT, permit2Expiration(now)],
        chain: LAUNCHPAD_CHAIN,
        account,
      });
      const receipt = await readClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== 'success') {
        setNotice({ kind: 'error', text: 'The Permit2 approval failed, so nothing was sold. Try again.' });
        return false;
      }
    }
    return true;
  };

  const sell = async () => {
    if (!v4 || !account || !walletClient || !readClient) {
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
      if (!(await ensurePermit2(amount))) return;
      setBusy('sell');
      const [out] = (await readClient.readContract({
        address: v4.quoter,
        abi: v4QuoterAbi,
        functionName: 'quoteExactInputSingle',
        args: [{ poolKey, zeroForOne: false, exactAmount: amount, hookData: '0x' }],
      })) as readonly [bigint, bigint];
      const minOut = applySlippage(out, slippageBps);
      const { commands, inputs } = encodeV4ExactInSingle({ poolKey, zeroForOne: false, amountIn: amount, minOut });
      const args = [commands, inputs, deadline()] as const;
      await readClient.simulateContract({ address: v4.universalRouter, abi: universalRouterAbi, functionName: 'execute', args, account });
      const hash = await walletClient.writeContract({
        address: v4.universalRouter,
        abi: universalRouterAbi,
        functionName: 'execute',
        args,
        chain: LAUNCHPAD_CHAIN,
        account,
      });
      const receipt = await readClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== 'success') throw new Error('The swap reverted.');
      setNotice({ kind: 'success', text: `Sell confirmed in the v4 pool. ${hash.slice(0, 10)}...` });
      onAfterTx();
    } catch (cause) {
      fail(cause);
    } finally {
      setBusy(null);
    }
  };

  if (!v4) {
    return (
      <p className="mt-4 rounded-xl bg-sp-brand-soft p-3 text-[11.5px] leading-[1.45] text-sp-shade/60">
        This token trades in its Uniswap v4 pool. In-app swaps are wired only for networks with a confirmed Universal Router.
      </p>
    );
  }

  // Rezerwa na gaz jak w TradePanel - procenty licza sie od tego, co
  // faktycznie da sie wydac, nie od calego salda.
  const spendable = ethBalance !== null && ethBalance > GAS_RESERVE_WEI ? ethBalance - GAS_RESERVE_WEI : 0n;
  const setBuyPct = (pct: bigint) => {
    if (spendable <= 0n) return;
    const wei = (spendable * pct) / 100n;
    setBuyAmount(fmtEth(wei, 6));
  };
  const setSellPct = (pct: bigint) => {
    if (core.balance === 0n) return;
    const raw = (core.balance * pct) / 100n;
    setSellAmount((Number(raw) / 10 ** decimals).toString());
  };

  return (
    <div className="mt-4">
      <div className="flex items-center gap-1 rounded-xl bg-sp-brand-soft p-1">
        {(['buy', 'sell'] as const).map((item) => (
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
      <p className="mt-2 text-[11px] leading-[1.4] text-sp-shade/50">
        Trades go through the Uniswap v4 pool with the launch hook attached: 0.3% pool fee plus the 1% hook fee, quoted below already net of both.
      </p>

      {side === 'buy' ? (
        <>
          <div className="mt-4 flex items-end justify-between">
            <span className="text-[12px] font-extrabold text-sp-ink">{NATIVE_SYMBOL} amount</span>
            {ethBalance !== null && <span className="text-[11px] text-sp-shade/45">Balance {fmtEth(ethBalance, 4)} {NATIVE_SYMBOL}</span>}
          </div>
          <div className="relative mt-2">
            <input inputMode="decimal" value={buyAmount} onChange={(e) => setBuyAmount(e.target.value)} className={`${FIELD} pr-14`} aria-label={`${NATIVE_SYMBOL} amount to spend`} />
            <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[12px] font-extrabold text-sp-shade/40">{NATIVE_SYMBOL}</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {([25n, 50n, 100n] as const).map((pct) => (
              <button key={String(pct)} type="button" onClick={() => setBuyPct(pct)} disabled={spendable <= 0n} className="rounded-full border border-sp-shade/10 px-2.5 py-1 text-[10.5px] font-bold text-sp-shade/60 hover:border-soft-primary disabled:opacity-40">
                {String(pct)}%
              </button>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between text-[11.5px]">
            <span className="text-sp-shade/50">You receive (est.)</span>
            <span className="font-extrabold text-sp-ink">{quote !== null ? `~${fmtTokens(quote, decimals)} ${core.symbol}` : '--'}</span>
          </div>
        </>
      ) : (
        <>
          <div className="mt-4 flex items-end justify-between">
            <span className="text-[12px] font-extrabold text-sp-ink">{core.symbol} amount</span>
            <span className="text-[11px] text-sp-shade/45">Balance {fmtTokens(core.balance, decimals)}</span>
          </div>
          <div className="relative mt-2">
            <input inputMode="decimal" value={sellAmount} onChange={(e) => setSellAmount(e.target.value)} className={`${FIELD} pr-16`} aria-label="Token amount to sell" placeholder="0" />
            <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[12px] font-extrabold text-sp-shade/40">{core.symbol}</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {([25n, 50n, 100n] as const).map((pct) => (
              <button key={String(pct)} type="button" onClick={() => setSellPct(pct)} disabled={core.balance === 0n} className="rounded-full border border-sp-shade/10 px-2.5 py-1 text-[10.5px] font-bold text-sp-shade/60 hover:border-soft-primary disabled:opacity-40">
                {String(pct)}%
              </button>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between text-[11.5px]">
            <span className="text-sp-shade/50">You receive (est.)</span>
            <span className="font-extrabold text-sp-ink">{quote !== null ? `~${fmtEth(quote, 6)} ${NATIVE_SYMBOL}` : '--'}</span>
          </div>
        </>
      )}

      <div className="mt-3 flex items-center justify-between text-[11px]">
        <span className="text-sp-shade/50">Max slippage</span>
        <div className="flex gap-1">
          {SLIPPAGE_OPTIONS.map((bps) => (
            <button
              key={bps}
              type="button"
              onClick={() => setSlippageBps(bps)}
              className={`rounded-full px-2 py-0.5 text-[10.5px] font-extrabold ${slippageBps === bps ? 'bg-soft-primary text-sp-on-brand' : 'border border-sp-shade/10 text-sp-shade/60'}`}
            >
              {bps / 100}%
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        disabled={busy !== null || !isConnected}
        onClick={() => void (side === 'buy' ? buy() : sell())}
        className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-soft-primary px-4 py-3 text-[13px] font-extrabold text-sp-on-brand disabled:opacity-60"
      >
        {busy === 'approve'
          ? 'Approving...'
          : busy === 'buy'
            ? 'Buying...'
            : busy === 'sell'
              ? 'Selling...'
              : isConnected
                ? side === 'buy'
                  ? `Buy ${core.symbol}`
                  : `Sell ${core.symbol}`
                : 'Connect a wallet to trade'}
      </button>

      {notice && (
        <p className={`mt-2 text-[11.5px] leading-[1.4] ${notice.kind === 'error' ? 'text-sp-down' : 'text-sp-up'}`}>{notice.text}</p>
      )}
    </div>
  );
}

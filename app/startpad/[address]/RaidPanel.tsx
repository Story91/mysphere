'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatEther, type Address } from 'viem';
import { useAccount, useChainId, usePublicClient, useSwitchChain, useWalletClient } from 'wagmi';
import { Swords, Users } from 'lucide-react';
import { ETH_USDC_POOL, LAUNCHPAD_CHAIN, PERP_ZAP_ADDRESS, QUOTE_ASSET } from '../config';
import { fetchPerpPoolKey } from '../perpZap';
import { LAUNCH_WINDOW_SECONDS, raidVaultAbi, raidVaultOf, type RaidView } from '../raid';
import { applySlippage, DEFAULT_SLIPPAGE_BPS, toWei, tradeErrorMessage, type CoreState } from './detailShared';

/**
 * RAID na stronie tokena: ekipa wplaca ETH, lider odpala jedno kupno, kazdy
 * odbiera tokeny proporcjonalnie (RaidVault). Na rynku perpa kupno idzie przez
 * PerpZap (ETH -> perp -> mem), na rynku ETH prosto w krzywa.
 */

const FIELD =
  'w-full rounded-xl border border-sp-shade/10 bg-sp-surface px-3 py-2.5 text-[13px] text-sp-ink outline-none placeholder:text-sp-shade/35 focus:border-sp-brand';
const BTN = 'rounded-full px-3 py-1.5 text-[11.5px] font-extrabold disabled:opacity-50';

type Mine = { deposit: bigint; settled: boolean };

const RAID_BLURB =
  'Pool ETH with your crew, the leader fires one buy at T-0, everyone claims their share. The leader sets the price protection, so join raids from people you trust.';

function clock(seconds: number): string {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m`;
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

export type RaidSummary = { visible: boolean; open: number };

export default function RaidPanel({
  core,
  onAfterTx,
  embedded = false,
  onSummary,
}: {
  core: CoreState;
  onAfterTx: () => void;
  /** Wewnatrz zakladek pod wykresem: bez wlasnej karty i naglowka. */
  embedded?: boolean;
  /** Czy panel jest w ogole widoczny i ile raidow mozna teraz dolaczyc - do etykiety zakladki. */
  onSummary?: (summary: RaidSummary) => void;
}) {
  const vault = raidVaultOf(LAUNCHPAD_CHAIN.id);
  const { address: account } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { data: walletClient } = useWalletClient();
  const client = usePublicClient({ chainId: LAUNCHPAD_CHAIN.id });

  const [raids, setRaids] = useState<RaidView[]>([]);
  const [mine, setMine] = useState<Record<number, Mine>>({});
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const [amount, setAmount] = useState('0.01');
  const [startIn, setStartIn] = useState(15);
  const [note, setNote] = useState('');
  const [joinAmount, setJoinAmount] = useState<Record<number, string>>({});

  const perpMarket = QUOTE_ASSET !== null;
  const usable = vault !== null && (!perpMarket || PERP_ZAP_ADDRESS !== null) && LAUNCHPAD_CHAIN.id === 8453;

  const load = useCallback(async () => {
    if (!usable) return;
    const body = (await fetch(`/api/launchpad/raids?token=${core.token}`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)) as { raids?: RaidView[] } | null;
    const list = body?.raids ?? [];
    setRaids(list);
    if (account && client && vault && list.length) {
      const res = await client.multicall({
        allowFailure: true,
        contracts: list.flatMap((r) => [
          { address: vault, abi: raidVaultAbi, functionName: 'deposits', args: [BigInt(r.id), account] } as const,
          { address: vault, abi: raidVaultAbi, functionName: 'settled', args: [BigInt(r.id), account] } as const,
        ]),
      });
      const out: Record<number, Mine> = {};
      list.forEach((r, i) => {
        const d = res[2 * i];
        const s = res[2 * i + 1];
        out[r.id] = { deposit: d?.status === 'success' ? (d.result as bigint) : 0n, settled: s?.status === 'success' ? (s.result as boolean) : false };
      });
      setMine(out);
    }
  }, [usable, core.token, account, client, vault]);

  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), 20_000);
    const c = window.setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => {
      window.clearInterval(t);
      window.clearInterval(c);
    };
  }, [load]);

  const visible = usable && (core.state === 'Curve' || raids.length > 0);
  const openCount = raids.filter((r) => r.status === 'Open' && now < r.expiresAt).length;
  useEffect(() => {
    onSummary?.({ visible, open: openCount });
  }, [onSummary, visible, openCount]);

  if (!visible) return null;

  const ensure = async () => {
    if (!account || !walletClient || !client || !vault) {
      setNotice({ kind: 'err', text: 'Connect a wallet first.' });
      return false;
    }
    if (chainId !== LAUNCHPAD_CHAIN.id) {
      try {
        await switchChainAsync({ chainId: LAUNCHPAD_CHAIN.id });
      } catch {
        setNotice({ kind: 'err', text: `Switch to ${LAUNCHPAD_CHAIN.name} was cancelled.` });
        return false;
      }
    }
    return true;
  };

  /** Jedna transakcja na vaulcie: symulacja, podpis, paragon, odswiezenie. */
  const send = async (key: string, fn: string, args: readonly unknown[], value?: bigint, ok?: string) => {
    if (!(await ensure()) || !vault) return;
    setBusy(key);
    setNotice(null);
    try {
      const call = { address: vault, abi: raidVaultAbi, functionName: fn as never, args: args as never, account: account!, ...(value ? { value } : {}) };
      await client!.simulateContract(call as never);
      const gas = await client!.estimateContractGas(call as never).catch(() => undefined);
      const hash = await walletClient!.writeContract({ ...(call as object), chain: LAUNCHPAD_CHAIN, ...(gas ? { gas: (gas * 125n) / 100n } : {}) } as never);
      const receipt = await client!.waitForTransactionReceipt({ hash });
      if (receipt.status !== 'success') throw new Error('The transaction reverted.');
      setNotice({ kind: 'ok', text: ok ?? `Done. ${hash.slice(0, 10)}...` });
      await load();
      onAfterTx();
    } catch (cause) {
      setNotice({ kind: 'err', text: tradeErrorMessage(cause) });
    } finally {
      setBusy(null);
    }
  };

  const create = async () => {
    const value = toWei(amount);
    if (value === null || value <= 0n) {
      setNotice({ kind: 'err', text: 'Enter your deposit in ETH.' });
      return;
    }
    const t = Math.floor(Date.now() / 1000);
    const executeAfter = Math.max(t + startIn * 60, core.startedAt + LAUNCH_WINDOW_SECONDS + 30);
    const expiresAt = executeAfter + 3600;
    if (perpMarket) {
      const perpPool = QUOTE_ASSET ? await fetchPerpPoolKey(LAUNCHPAD_CHAIN.id, QUOTE_ASSET.address) : null;
      if (!perpPool || !PERP_ZAP_ADDRESS) {
        setNotice({ kind: 'err', text: 'The ETH route to the perp is unavailable right now.' });
        return;
      }
      await send(
        'create',
        'createPerpRaid',
        [core.deployment.launchpad as Address, core.token, PERP_ZAP_ADDRESS, ETH_USDC_POOL, perpPool, executeAfter, expiresAt, note.trim().slice(0, 140)],
        value,
        'Raid created. Share the page and let your crew join.'
      );
    } else {
      await send(
        'create',
        'createEthRaid',
        [core.deployment.launchpad as Address, core.token, executeAfter, expiresAt, note.trim().slice(0, 140)],
        value,
        'Raid created. Share the page and let your crew join.'
      );
    }
    setCreating(false);
  };

  const fire = async (r: RaidView) => {
    if (!(await ensure()) || !vault) return;
    try {
      // Swiezy wynik calej sciezki z symulacji startu, ochrona ceny na tokenach.
      const { result } = await client!.simulateContract({ address: vault, abi: raidVaultAbi, functionName: 'execute', args: [BigInt(r.id), 1n, 1n], account: account! });
      const minTokens = applySlippage(result, DEFAULT_SLIPPAGE_BPS);
      await send(`fire-${r.id}`, 'execute', [BigInt(r.id), 1n, minTokens > 0n ? minTokens : 1n], undefined, 'Raid fired. Everyone can claim now.');
    } catch (cause) {
      setNotice({ kind: 'err', text: tradeErrorMessage(cause) });
    }
  };

  const shareText = (r: RaidView) =>
    `Raid on $${core.symbol} 🏴‍☠️ ${r.note ? `"${r.note}" ` : ''}\nPool ${Number(formatEther(BigInt(r.totalEth))).toFixed(4)} ETH, one buy at T-0. Join the crew:\nhttps://mysphere.fun/startpad/${core.token.toLowerCase()}${QUOTE_ASSET ? `?m=${encodeURIComponent((typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('m')) || '')}` : ''}`;

  return (
    <section className={embedded ? 'p-4 sm:p-5' : 'rounded-[20px] border border-sp-shade/10 bg-sp-surface p-4 sm:p-5'}>
      <div className={`flex gap-3 ${embedded ? 'items-start justify-between' : 'items-center justify-between'}`}>
        {embedded ? (
          <p className="max-w-[520px] text-[11.5px] leading-[1.5] text-sp-shade/55">{RAID_BLURB}</p>
        ) : (
          <h2 className="flex items-center gap-2 text-[13px] font-extrabold text-sp-ink">
            <Swords className="h-4 w-4 text-soft-primary" aria-hidden="true" /> Raids
          </h2>
        )}
        {core.state === 'Curve' && !creating && (
          <button type="button" onClick={() => setCreating(true)} className={`${BTN} shrink-0 bg-sp-ink text-white`}>
            Start a raid
          </button>
        )}
      </div>
      {!embedded && <p className="mt-1 text-[11px] leading-[1.45] text-sp-shade/50">{RAID_BLURB}</p>}

      {creating && (
        <div className="mt-3 space-y-2 rounded-xl bg-sp-sunken p-3">
          <label className="block text-[11.5px] font-extrabold text-sp-ink">Your deposit (ETH)</label>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className={FIELD} />
          <label className="block text-[11.5px] font-extrabold text-sp-ink">Fire in</label>
          <div className="flex gap-1.5">
            {[5, 15, 30, 60].map((m) => (
              <button key={m} type="button" onClick={() => setStartIn(m)} className={`${BTN} border ${startIn === m ? 'border-soft-primary bg-sp-brand-soft text-soft-primary-deep' : 'border-sp-shade/10 text-sp-shade/60'}`}>
                {m} min
              </button>
            ))}
          </div>
          <input value={note} onChange={(e) => setNote(e.target.value.slice(0, 140))} placeholder="Battle cry (optional)" className={FIELD} />
          <p className="text-[10.5px] text-sp-shade/45">Members can leave until T-0. If you do not fire within 1 hour after T-0, everyone gets a full refund.</p>
          <div className="flex gap-2">
            <button type="button" disabled={busy === 'create'} onClick={() => void create()} className={`${BTN} flex-1 bg-soft-primary py-2 text-sp-on-brand`}>
              {busy === 'create' ? 'Creating...' : 'Create raid'}
            </button>
            <button type="button" onClick={() => setCreating(false)} className={`${BTN} border border-sp-shade/10 text-sp-shade/60`}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="mt-3 space-y-2.5">
        {raids.length === 0 && !creating && <p className="text-[12px] text-sp-shade/45">No raids on this token yet.</p>}
        {raids.map((r) => {
          const m = mine[r.id] ?? { deposit: 0n, settled: false };
          const isLeader = account?.toLowerCase() === r.leader.toLowerCase();
          const beforeT0 = now < r.executeAfter;
          const expired = now >= r.expiresAt;
          const pool = Number(formatEther(BigInt(r.totalEth)));
          return (
            <div key={r.id} className="rounded-xl border border-sp-shade/10 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-[13px] font-extrabold text-sp-ink">
                  <Users className="h-3.5 w-3.5 text-sp-shade/50" aria-hidden="true" /> {pool.toLocaleString('en-US', { maximumFractionDigits: 4 })} ETH
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.06em] ${
                    r.status === 'Executed' ? 'bg-sp-up/15 text-sp-up' : r.status === 'Cancelled' || expired ? 'bg-sp-shade/10 text-sp-shade/50' : 'bg-amber-500/15 text-amber-600'
                  }`}
                >
                  {r.status === 'Executed' ? 'Fired' : r.status === 'Cancelled' ? 'Cancelled' : expired ? 'Expired' : beforeT0 ? `T-${clock(r.executeAfter - now)}` : 'Ready to fire'}
                </span>
              </div>
              {r.note && <p className="mt-1.5 text-[12.5px] font-bold text-sp-ink">“{r.note}”</p>}
              <p className="mt-1 text-[10.5px] text-sp-shade/45">
                Leader {r.leader.slice(0, 6)}...{r.leader.slice(-4)}
                {m.deposit > 0n && ` · you: ${Number(formatEther(m.deposit)).toLocaleString('en-US', { maximumFractionDigits: 5 })} ETH`}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {r.status === 'Open' && !expired && (
                  <>
                    <input
                      value={joinAmount[r.id] ?? '0.005'}
                      onChange={(e) => setJoinAmount((s) => ({ ...s, [r.id]: e.target.value }))}
                      inputMode="decimal"
                      className="w-[84px] rounded-full border border-sp-shade/10 bg-sp-surface px-2.5 py-1 text-[11.5px] outline-none"
                      aria-label="ETH to join with"
                    />
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => {
                        const v = toWei(joinAmount[r.id] ?? '0.005');
                        if (v && v > 0n) void send(`join-${r.id}`, 'join', [BigInt(r.id)], v, 'You are in the raid.');
                      }}
                      className={`${BTN} bg-soft-primary text-sp-on-brand`}
                    >
                      Join
                    </button>
                    {m.deposit > 0n && beforeT0 && (
                      <button type="button" disabled={busy !== null} onClick={() => void send(`leave-${r.id}`, 'leave', [BigInt(r.id)], undefined, 'You left the raid.')} className={`${BTN} border border-sp-shade/10 text-sp-shade/60`}>
                        Leave
                      </button>
                    )}
                    {isLeader && !beforeT0 && (
                      <button type="button" disabled={busy !== null} onClick={() => void fire(r)} className={`${BTN} bg-sp-up text-white`}>
                        🔥 Fire
                      </button>
                    )}
                    {isLeader && (
                      <button type="button" disabled={busy !== null} onClick={() => void send(`cancel-${r.id}`, 'cancel', [BigInt(r.id)], undefined, 'Raid cancelled. Members can take refunds.')} className={`${BTN} border border-sp-shade/10 text-sp-shade/60`}>
                        Cancel
                      </button>
                    )}
                    <a href={`https://x.com/intent/tweet?text=${encodeURIComponent(shareText(r))}`} target="_blank" rel="noopener noreferrer" className={`${BTN} border border-sp-shade/10 text-sp-ink`}>
                      Rally on X
                    </a>
                  </>
                )}
                {r.status === 'Executed' && m.deposit > 0n && !m.settled && (
                  <button type="button" disabled={busy !== null} onClick={() => void send(`claim-${r.id}`, 'claim', [BigInt(r.id)], undefined, 'Tokens claimed.')} className={`${BTN} bg-sp-up text-white`}>
                    Claim my {core.symbol}
                  </button>
                )}
                {(r.status === 'Cancelled' || (r.status === 'Open' && expired)) && m.deposit > 0n && !m.settled && (
                  <button type="button" disabled={busy !== null} onClick={() => void send(`refund-${r.id}`, 'refund', [BigInt(r.id)], undefined, 'Refunded.')} className={`${BTN} bg-sp-ink text-white`}>
                    Refund my ETH
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {notice && <p className={`mt-2 text-[11.5px] font-bold ${notice.kind === 'ok' ? 'text-sp-up' : 'text-sp-down-deep'}`}>{notice.text}</p>}
    </section>
  );
}

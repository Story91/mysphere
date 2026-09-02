'use client';

/**
 * CLAIM NAGROD SEZONU - przycisk, ktorego brakowalo.
 *
 * Nagrody w SPHERE ida przez SphereStreamingMerkleDistributor: proposer
 * publikuje root epoki (24 h weta Safe), keeper aktywuje, a KAZDY moze
 * odebrac swoja narosla czesc. Liscie sa KUMULATYWNE (account, cumulative,
 * prevCumulative), wiec jeden claim placi wszystko, co narosl do teraz - nic
 * nie przepada, nawet jak ktos nie wchodzi tygodniami. Przyrost biezacej
 * epoki uwalnia sie liniowo przez STREAM_DURATION od aktywacji.
 *
 * Proofy bierzemy z publicznego manifestu (public/sphere-epochs/latest.json
 * -> epoch-N.json), ktorego manifestHash mozna porownac z tym w kontrakcie.
 * Zadna liczba, od ktorej zalezy wyplata, nie jest liczona w przegladarce:
 * kontrakt sam sprawdza proof, monotonicznosc i ile juz odebrano.
 */

import { useCallback, useEffect, useState } from 'react';
import { formatEther, parseAbi, type Address } from 'viem';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { Gift, Loader2 } from 'lucide-react';
import { SPHERE_CHAIN, SPHERE_EXPLORER_URL } from '../sphereChain';
import { SPHERE_DISTRIBUTOR_ADDRESS } from '../sphereConfig';

const distributorAbi = parseAbi([
  'function root() view returns (bytes32)',
  'function manifestHash() view returns (bytes32)',
  'function epochId() view returns (uint64)',
  'function activatedAt() view returns (uint64)',
  'function STREAM_DURATION() view returns (uint64)',
  'function totalCumulative() view returns (uint256)',
  'function totalClaimed() view returns (uint256)',
  'function claimed(address) view returns (uint256)',
  'function vestedOf(uint256 cumulative, uint256 prevCumulative) view returns (uint256)',
  'function pending() view returns (bytes32 root, bytes32 manifestHash, uint64 epochId, uint256 totalCumulative, uint64 validAt)',
  'function claim(address account, uint256 cumulative, uint256 prevCumulative, bytes32[] proof)',
]);

const ZERO32 = `0x${'0'.repeat(64)}`;

type Latest = { epoch: number; onchainEpochId: string; root: string; manifestHash: string; totalCumulative: string };
type Leaf = { account: string; cumulative: string; prevCumulative: string; proof?: string[] };

export type DistributorState = {
  live: boolean;
  epochId: number;
  activatedAt: number;
  streamSeconds: number;
  totalCumulative: bigint;
  totalClaimed: bigint;
  pendingValidAt: number;
};

/** Stan dystrybutora - uzywany takze przez naglowek sezonu (plakietka shadow/live). */
export function useSphereDistributor(): DistributorState | null {
  const client = usePublicClient({ chainId: SPHERE_CHAIN.id });
  const [state, setState] = useState<DistributorState | null>(null);
  useEffect(() => {
    if (!client || !SPHERE_DISTRIBUTOR_ADDRESS) return;
    let alive = true;
    const addr = SPHERE_DISTRIBUTOR_ADDRESS;
    const load = async () => {
      try {
        const [root, epochId, activatedAt, stream, totalCumulative, totalClaimed, pending] = await Promise.all([
          client.readContract({ address: addr, abi: distributorAbi, functionName: 'root' }),
          client.readContract({ address: addr, abi: distributorAbi, functionName: 'epochId' }),
          client.readContract({ address: addr, abi: distributorAbi, functionName: 'activatedAt' }),
          client.readContract({ address: addr, abi: distributorAbi, functionName: 'STREAM_DURATION' }),
          client.readContract({ address: addr, abi: distributorAbi, functionName: 'totalCumulative' }),
          client.readContract({ address: addr, abi: distributorAbi, functionName: 'totalClaimed' }),
          client.readContract({ address: addr, abi: distributorAbi, functionName: 'pending' }),
        ]);
        if (!alive) return;
        setState({
          live: root !== ZERO32,
          epochId: Number(epochId),
          activatedAt: Number(activatedAt),
          streamSeconds: Number(stream),
          totalCumulative,
          totalClaimed,
          pendingValidAt: Number(pending[4]),
        });
      } catch {
        /* kolejny interwal */
      }
    };
    void load();
    const t = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [client]);
  return state;
}

function fmt(wei: bigint, digits = 0) {
  return Number(formatEther(wei)).toLocaleString('en-US', { maximumFractionDigits: digits });
}

export default function SphereRewardsClaim({ dist }: { dist: DistributorState | null }) {
  const { address: account } = useAccount();
  const client = usePublicClient({ chainId: SPHERE_CHAIN.id });
  const { data: walletClient } = useWalletClient();
  const [leaf, setLeaf] = useState<Leaf | null | 'none'>(null);
  const [latest, setLatest] = useState<Latest | null>(null);
  const [claimedWei, setClaimedWei] = useState<bigint>(0n);
  const [vestedWei, setVestedWei] = useState<bigint>(0n);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  // Manifest aktywnej epoki -> lisc tego konta.
  useEffect(() => {
    if (!dist?.live || !account) {
      setLeaf(null);
      return;
    }
    let alive = true;
    (async () => {
      try {
        // Blob najpierw (tam publikuje automat epoki bez deployu), potem kopia
        // z repo pod public/. Oba to ten sam plik; manifestHash w kontrakcie
        // rozstrzyga, ktory jest prawdziwy.
        // Host Bloba to id sklepu bez prefiksu `store_`, malymi literami
        // (env trzyma "store_SaqX..." - w cudzyslowie i z wielkimi literami).
        const storeId = (process.env.NEXT_PUBLIC_VERCEL_BLOB_STORE_ID ?? '').replace(/["']/g, '').replace(/^store_/i, '').toLowerCase();
        const sources = storeId ? [`https://${storeId}.public.blob.vercel-storage.com/sphere-epochs`, '/sphere-epochs'] : ['/sphere-epochs'];
        const getJson = async <T,>(name: string): Promise<T> => {
          let lastErr: unknown = null;
          for (const base of sources) {
            try {
              const r = await fetch(`${base}/${name}`, { cache: 'no-store' });
              if (r.ok) return (await r.json()) as T;
              lastErr = new Error(String(r.status));
            } catch (e) {
              lastErr = e;
            }
          }
          throw lastErr ?? new Error('manifest unavailable');
        };
        const l = await getJson<Latest>('latest.json');
        const m = await getJson<{ leaves?: Leaf[] }>(`epoch-${l.epoch}.json`);
        if (!alive) return;
        setLatest(l);
        const mine = (m.leaves ?? []).find((x) => x.account.toLowerCase() === account.toLowerCase());
        setLeaf(mine ?? 'none');
      } catch {
        if (alive) setLeaf('none');
      }
    })();
    return () => {
      alive = false;
    };
  }, [dist?.live, dist?.epochId, account]);

  const refresh = useCallback(async () => {
    if (!client || !account || !leaf || leaf === 'none' || !SPHERE_DISTRIBUTOR_ADDRESS) return;
    const [c, v] = await Promise.all([
      client.readContract({ address: SPHERE_DISTRIBUTOR_ADDRESS, abi: distributorAbi, functionName: 'claimed', args: [account] }),
      client.readContract({
        address: SPHERE_DISTRIBUTOR_ADDRESS,
        abi: distributorAbi,
        functionName: 'vestedOf',
        args: [BigInt(leaf.cumulative), BigInt(leaf.prevCumulative)],
      }),
    ]);
    setClaimedWei(c);
    setVestedWei(v);
  }, [client, account, leaf]);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 30_000);
    return () => clearInterval(t);
  }, [refresh]);

  if (!dist) return null;

  const card = 'sph-card rounded-[20px] border border-sp-shade/10 bg-sp-surface p-4 sm:p-5';
  const head = (
    <h3 className="flex items-center gap-2 text-[13.5px] font-extrabold text-sp-ink">
      <Gift className="h-4 w-4 text-sp-brand" aria-hidden="true" /> Your SPHERE rewards
    </h3>
  );

  if (!dist.live) {
    return (
      <section className={card}>
        {head}
        <p className="mt-1 text-[11.5px] text-sp-shade/55">
          {dist.pendingValidAt > 0
            ? `First paid epoch is proposed. The 24h veto window ends ${new Date(dist.pendingValidAt * 1000).toUTCString()}; claiming opens right after activation.`
            : 'No paid epoch yet. Rewards start streaming once the first root is proposed and activated; nothing you earn expires.'}
        </p>
      </section>
    );
  }

  if (!account) {
    return (
      <section className={card}>
        {head}
        <p className="mt-1 text-[11.5px] text-sp-shade/55">Connect the wallet you launch tokens with to see and claim your share.</p>
      </section>
    );
  }

  if (leaf === null) {
    return (
      <section className={card}>
        {head}
        <p className="mt-1 inline-flex items-center gap-2 text-[11.5px] text-sp-shade/55">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Reading the epoch manifest...
        </p>
      </section>
    );
  }

  if (leaf === 'none') {
    return (
      <section className={card}>
        {head}
        <p className="mt-1 text-[11.5px] text-sp-shade/55">
          This wallet has no reward in the active epoch (#{dist.epochId}). Rewards go to creators whose tokens brought real external volume; see the leaderboard below.
        </p>
      </section>
    );
  }

  const total = BigInt(leaf.cumulative);
  const prev = BigInt(leaf.prevCumulative);
  const claimable = vestedWei > claimedWei ? vestedWei - claimedWei : 0n;
  const elapsed = Math.max(0, Math.floor(Date.now() / 1000) - dist.activatedAt);
  const streamPct = dist.streamSeconds > 0 ? Math.min(100, (elapsed / dist.streamSeconds) * 100) : 100;

  const onClaim = async () => {
    if (!walletClient || !client || !SPHERE_DISTRIBUTOR_ADDRESS) return;
    setBusy(true);
    setNotice(null);
    try {
      const hash = await walletClient.writeContract({
        address: SPHERE_DISTRIBUTOR_ADDRESS,
        abi: distributorAbi,
        functionName: 'claim',
        args: [account, total, prev, (leaf.proof ?? []) as `0x${string}`[]],
        chain: SPHERE_CHAIN,
        account,
      });
      await client.waitForTransactionReceipt({ hash });
      setNotice({ kind: 'ok', text: `Claimed. tx ${hash.slice(0, 10)}…` });
      await refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message.split('\n')[0] : String(e);
      setNotice({ kind: 'error', text: msg.includes('NothingToClaim') ? 'Nothing unlocked yet - the stream releases linearly over the epoch.' : msg.slice(0, 140) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={card}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {head}
          <p className="mt-1 text-[11px] text-sp-shade/50">
            Epoch #{dist.epochId} {latest ? `(week ${latest.epoch + 1})` : ''} · streaming {streamPct.toFixed(0)}% · cumulative ledger, unclaimed never expires
          </p>
        </div>
        <a
          href={`${SPHERE_EXPLORER_URL}/address/${SPHERE_DISTRIBUTOR_ADDRESS}`}
          target="_blank"
          rel="noreferrer"
          className="text-[10.5px] font-extrabold text-sp-shade/45 hover:text-sp-brand"
        >
          distributor ↗
        </a>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['Allocated (all epochs)', fmt(total)],
          ['This epoch', fmt(total - prev)],
          ['Unlocked so far', fmt(vestedWei)],
          ['Claimed', fmt(claimedWei)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl bg-sp-sunken p-3">
            <p className="text-[9.5px] font-extrabold uppercase tracking-[0.08em] text-sp-shade/45">{label}</p>
            <p className="mt-1 font-soft-display text-[18px] font-extrabold leading-none text-sp-ink">
              {value} <span className="text-[11px] text-sp-shade/45">SPHERE</span>
            </p>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy || claimable === 0n}
          onClick={() => void onClaim()}
          className="inline-flex items-center gap-2 rounded-full bg-soft-primary px-4 py-2 text-[12.5px] font-extrabold text-sp-on-brand disabled:opacity-40"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Gift className="h-3.5 w-3.5" aria-hidden="true" />}
          Claim {fmt(claimable)} SPHERE
        </button>
        <span className="text-[10.5px] text-sp-shade/45">anyone can pay the gas; tokens always land in your wallet.</span>
      </div>
      {notice && (
        <p className={`mt-2 text-[11px] font-bold ${notice.kind === 'ok' ? 'text-sp-up' : 'text-sp-down'}`}>{notice.text}</p>
      )}
    </section>
  );
}

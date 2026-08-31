'use client';

/**
 * Overview $SPHERE - petla wartosci, efektywne splity i stan kontraktow.
 *
 * Uczciwosc komunikacji (spec sekcja 5, twardy wymog): kazdy mechanizm nosi
 * plakietke "Enforced by contract" ALBO "Team-run, on-chain" - zadnego
 * mieszania obietnic zespolu z gwarancjami kodu. Liczby splitow pochodza
 * z tabeli efektywnej w docs/SPHERE-TOKENOMIKA.md (sekcja 4).
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePublicClient } from 'wagmi';
import { formatEther, type Address } from 'viem';
import { ExternalLink, Flame, FlaskConical } from 'lucide-react';
import {
  LAUNCHPAD_ADDRESS,
  LAUNCHPAD_CHAIN,
  LAUNCHPAD_EXPLORER_URL,
  NATIVE_SYMBOL,
  launchpadAbi,
} from '../config';
import {
  SPHERE_ESCROW_ADDRESS,
  SPHERE_LIVE,
  SPHERE_PLAN,
  SPHERE_REWARDS_ADDRESS,
  SPHERE_SAFE_ADDRESS,
  SPHERE_TOKEN_ADDRESS,
  SPHERE_VESTING_ADDRESS,
} from './sphereConfig';
import { EnforcedBadge, TeamRunBadge } from './SphereShell';

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-[20px] border border-sp-shade/10 bg-sp-surface p-4 sm:p-5 ${className}`}>{children}</section>;
}

function AddrLink({
  address,
  label,
  pendingText = 'not deployed yet',
}: {
  address: Address | null;
  label: string;
  pendingText?: string;
}) {
  if (!address) {
    return (
      <span className="text-[11.5px] text-sp-shade/45">
        {label}: <span className="font-bold">{pendingText}</span>
      </span>
    );
  }
  return (
    <a
      href={`${LAUNCHPAD_EXPLORER_URL}/address/${address}`}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-[11.5px] font-bold text-sp-brand hover:underline"
    >
      {label}: {address.slice(0, 8)}…{address.slice(-6)} <ExternalLink className="h-3 w-3" aria-hidden="true" />
    </a>
  );
}

/** Segmentowy pasek splitu - konwencja paskow z modalu launchu. */
function SplitBar({ parts }: { parts: { label: string; bps: number; className: string }[] }) {
  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-full">
        {parts.map((p) => (
          <div key={p.label} className={p.className} style={{ width: `${p.bps / 100}%` }} />
        ))}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
        {parts.map((p) => (
          <span key={p.label} className="text-[10.5px] font-bold text-sp-shade/60">
            <span className={`mr-1 inline-block h-2 w-2 rounded-full align-middle ${p.className}`} />
            {p.label} {(p.bps / 100).toFixed(1)}%
          </span>
        ))}
      </div>
    </div>
  );
}

export default function SphereOverview() {
  const readClient = usePublicClient({ chainId: LAUNCHPAD_CHAIN.id });
  const [claimables, setClaimables] = useState<{ rewards: bigint; escrow: bigint } | null>(null);

  useEffect(() => {
    // Lokalne stale, zeby zawezenie null przetrwalo do wnetrza closure.
    const rewardsAddr = SPHERE_REWARDS_ADDRESS;
    const escrowAddr = SPHERE_ESCROW_ADDRESS;
    if (!SPHERE_LIVE || !readClient || !rewardsAddr || !escrowAddr) return;
    let alive = true;
    const load = async () => {
      try {
        const [r, e] = await Promise.all([
          readClient.readContract({ address: LAUNCHPAD_ADDRESS as Address, abi: launchpadAbi, functionName: 'claimable', args: [rewardsAddr] }),
          readClient.readContract({ address: LAUNCHPAD_ADDRESS as Address, abi: launchpadAbi, functionName: 'claimable', args: [escrowAddr] }),
        ]);
        if (alive) setClaimables({ rewards: r as bigint, escrow: e as bigint });
      } catch {
        /* odczyt wroci przy nastepnym interwale */
      }
    };
    void load();
    const t = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [readClient]);

  return (
    <div className="grid gap-4">
      {/* PETLA WARTOSCI ------------------------------------------------------ */}
      <Card>
        <h2 className="text-[14px] font-extrabold text-sp-ink">How $SPHERE accrues value</h2>
        <div className="mt-3 grid gap-2.5 text-[12.5px] leading-relaxed text-sp-shade/70">
          <p>
            <EnforcedBadge /> <span className="ml-1">Auto-burn: 50% of the creator-side ETH from every post-graduation
            SPHERE swap fee buys SPHERE in its own pool and sends it to 0xdEaD. Frozen at launch, no one can turn it off.</span>
          </p>
          <p>
            <EnforcedBadge /> <span className="ml-1">Frozen fee split: curve fees route 60% to the rewards vault and
            40% to the creator escrow - receivers are baked into the launch forever.</span>
          </p>
          <p>
            <TeamRunBadge /> <span className="ml-1">Revenue buybacks: the treasury Safe may buy SPHERE with protocol
            revenue. Every purchase is visible on-chain, but it is a policy, not a contract guarantee - we label it
            honestly.</span>
          </p>
        </div>
      </Card>

      {/* EFEKTYWNE SPLITY ---------------------------------------------------- */}
      <Card>
        <h2 className="text-[14px] font-extrabold text-sp-ink">Where every fee goes</h2>
        <div className="mt-3 grid gap-4">
          <div>
            <p className="mb-1.5 text-[11px] font-extrabold uppercase tracking-[0.06em] text-sp-shade/45">Curve fee (1% of every trade before graduation)</p>
            <SplitBar
              parts={[
                { label: 'Protocol Safe', bps: 3000, className: 'bg-sp-shade/40' },
                { label: 'Rewards vault', bps: 4200, className: 'bg-sp-brand' },
                { label: 'Creator escrow', bps: 2800, className: 'bg-sp-up' },
              ]}
            />
          </div>
          <div>
            <p className="mb-1.5 text-[11px] font-extrabold uppercase tracking-[0.06em] text-sp-shade/45">Pool hook fee in ETH (1% of every swap after graduation)</p>
            <SplitBar
              parts={[
                { label: 'Protocol Safe', bps: 3000, className: 'bg-sp-shade/40' },
                { label: 'Creator escrow', bps: 3500, className: 'bg-sp-up' },
                { label: 'Burned forever', bps: 3500, className: 'bg-sp-down' },
              ]}
            />
          </div>
          <p className="text-[10.5px] text-sp-shade/45">
            Exact effective numbers from the tokenomics spec: buybackBps={SPHERE_PLAN.buybackBps} cuts the creator ETH leg
            only; token-denominated legs go 70/30 escrow/Safe with no burn cut.
          </p>
        </div>
      </Card>

      {/* STAN KONTRAKTOW ----------------------------------------------------- */}
      <Card>
        <h2 className="text-[14px] font-extrabold text-sp-ink">Contracts</h2>
        <div className="mt-3 grid gap-2">
          <AddrLink address={SPHERE_TOKEN_ADDRESS} label="SPHERE token" pendingText="not launched yet" />
          <AddrLink address={SPHERE_ESCROW_ADDRESS} label="Creator escrow" />
          <AddrLink address={SPHERE_REWARDS_ADDRESS} label="Rewards vault" />
          <AddrLink address={SPHERE_VESTING_ADDRESS} label="Treasury vesting" />
          <AddrLink address={SPHERE_SAFE_ADDRESS} label="Treasury Safe" />
        </div>
        {SPHERE_LIVE && claimables && (
          <div className="mt-3 grid gap-1.5 border-t border-sp-shade/10 pt-3 text-[12px] text-sp-shade/70">
            <p>
              Curve fees waiting for delivery: <span className="font-extrabold text-sp-ink">{formatEther(claimables.rewards)} {NATIVE_SYMBOL}</span> to rewards,{' '}
              <span className="font-extrabold text-sp-ink">{formatEther(claimables.escrow)} {NATIVE_SYMBOL}</span> to escrow (anyone can deliver - see subpages).
            </p>
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {(['escrow', 'rewards', 'vesting'] as const).map((slug) => (
            <Link
              key={slug}
              href={`/startpad/sphere/${slug}`}
              className="rounded-full border border-sp-shade/15 px-3.5 py-1.5 text-[11.5px] font-extrabold text-sp-shade/70 transition-colors hover:border-sp-brand hover:text-sp-brand"
            >
              Manage {slug} →
            </Link>
          ))}
        </div>
      </Card>

      {/* BURN LEDGER PLACEHOLDER --------------------------------------------- */}
      <Card>
        <h2 className="flex items-center gap-1.5 text-[14px] font-extrabold text-sp-ink">
          <Flame className="h-4 w-4 text-sp-down" aria-hidden="true" /> Burns
        </h2>
        <p className="mt-2 text-[12px] text-sp-shade/60">
          {SPHERE_LIVE && SPHERE_TOKEN_ADDRESS
            ? 'AutoBuyback events will populate here as burns execute (each entry links to its transaction).'
            : SPHERE_LIVE
              ? 'Contracts are live, but the token has not launched yet. From the first post-graduation swap on, every auto-burn lands here: date, ETH in, SPHERE burned, transaction link. Burns are transfers to 0xdEaD - total supply stays 1B by design; the dead balance is publicly verifiable.'
              : 'After launch, every auto-burn lands here: date, ETH in, SPHERE burned, transaction link. Burns are transfers to 0xdEaD - total supply stays 1B by design; the dead balance is publicly verifiable.'}
        </p>
      </Card>

      {/* PROBA GENERALNA NA SEPOLII ------------------------------------------ */}
      <Card>
        <h2 className="flex items-center gap-1.5 text-[14px] font-extrabold text-sp-ink">
          <FlaskConical className="h-4 w-4 text-sp-brand" aria-hidden="true" /> Rehearsal proven on Sepolia
        </h2>
        <p className="mt-2 text-[12px] leading-relaxed text-sp-shade/60">
          Before mainnet, the exact SPHERE lifecycle ran end-to-end on Base Sepolia with the
          same contracts: launch, a full graduation of the bonding curve and the first
          auto-burn of <span className="font-extrabold text-sp-ink">12,131 SPHERE</span> - executed by the real
          mechanism, not a simulation.
        </p>
        <a
          href="https://sepolia.basescan.org/address/0xb200000000000000000000Ba5ED02Ebf7B04aDBc"
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-[11.5px] font-bold text-sp-brand hover:underline"
        >
          Rehearsal token 0xb20000…04aDBc on Sepolia BaseScan <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </a>
      </Card>
    </div>
  );
}

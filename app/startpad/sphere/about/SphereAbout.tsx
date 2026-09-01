'use client';

/**
 * JEDYNA strona z tekstem w centrum $SPHERE (decyzja wlasciciela 2026-08-31:
 * "jedna strona z tekstem i objasnieniem, reszta z dzialaniem"). Wszystkie
 * dluzsze wyjasnienia mieszkaja TU; pozostale podstrony pokazuja liczby
 * i przyciski.
 */

import { ExternalLink, Flame, FlaskConical } from 'lucide-react';
import type { Address } from 'viem';
import { SPHERE_EXPLORER_URL } from '../sphereChain';
import { EnforcedBadge, TeamRunBadge } from '../SphereShell';
import {
  SPHERE_ESCROW_ADDRESS,
  SPHERE_PLAN,
  SPHERE_REWARDS_ADDRESS,
  SPHERE_SAFE_ADDRESS,
  SPHERE_TOKEN_ADDRESS,
  SPHERE_VESTING_ADDRESS,
} from '../sphereConfig';

function Card({ children }: { children: React.ReactNode }) {
  return <section className="sph-card rounded-[20px] border border-sp-shade/10 bg-sp-surface p-4 sm:p-5">{children}</section>;
}

function AddrLink({ address, label, pendingText = 'not deployed yet' }: { address: Address | null; label: string; pendingText?: string }) {
  if (!address) {
    return (
      <span className="text-[11.5px] text-sp-shade/45">
        {label}: <span className="font-bold">{pendingText}</span>
      </span>
    );
  }
  return (
    <a
      href={`${SPHERE_EXPLORER_URL}/address/${address}`}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-[11.5px] font-bold text-sp-brand hover:underline"
    >
      {label}: {address.slice(0, 8)}…{address.slice(-6)} <ExternalLink className="h-3 w-3" aria-hidden="true" />
    </a>
  );
}

function SplitBar({ parts }: { parts: { label: string; bps: number; className: string }[] }) {
  return (
    <div>
      <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full">
        {parts.map((p) => (
          <div key={p.label} className={`${p.className} rounded-full`} style={{ width: `${p.bps / 100}%` }} />
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

export default function SphereAbout() {
  return (
    <div className="sph-stagger grid gap-4">
      <Card>
        <h2 className="text-[15px] font-extrabold text-sp-ink">How $SPHERE accrues value</h2>
        <div className="mt-3 grid gap-2.5 text-[12.5px] leading-relaxed text-sp-shade/70">
          <p>
            <EnforcedBadge />{' '}
            <span className="ml-1">
              Auto-burn: 50% of the creator-side ETH from every post-graduation SPHERE swap fee buys SPHERE in its own
              pool and sends it to 0xdEaD. Frozen at launch, no one can turn it off.
            </span>
          </p>
          <p>
            <EnforcedBadge />{' '}
            <span className="ml-1">
              Frozen fee split: the creator&apos;s 70% share of every curve fee routes 60% to the rewards vault and 40%
              to the creator escrow (42% / 28% of the whole fee) - receivers are baked into the launch forever.
            </span>
          </p>
          <p>
            <TeamRunBadge />{' '}
            <span className="ml-1">
              Revenue buybacks: the treasury Safe may buy SPHERE with protocol revenue. Every purchase is visible
              on-chain, but it is a policy, not a contract guarantee - we label it honestly.
            </span>
          </p>
          <p>
            {/* SphereBuyback jest napisany i przetestowany, ale NIE wdrozony
                (faza 1B, po shadow). Etykieta "enforced" na niewdrozonym
                kontrakcie lamalaby wlasna regule z sekcji 5 speca. */}
            <span className="inline-flex items-center gap-1 rounded-full bg-sp-shade/10 px-2 py-0.5 text-[9.5px] font-extrabold uppercase tracking-[0.06em] text-sp-shade/60">
              Written, not deployed yet
            </span>{' '}
            <span className="ml-1">
              Buyback contract (ships after shadow season): bought SPHERE splits 20% burned forever, 80% to the weekly
              creator reward pool. Until it is live on Base, treat this as a plan, not a guarantee.
            </span>
          </p>
        </div>
      </Card>

      <Card>
        <h2 className="text-[15px] font-extrabold text-sp-ink">Where every fee goes</h2>
        <div className="mt-3 grid gap-4">
          <div>
            <p className="mb-1.5 text-[11px] font-extrabold uppercase tracking-[0.06em] text-sp-shade/45">
              Curve fee (1% of every trade before graduation)
            </p>
            <SplitBar
              parts={[
                { label: 'Protocol Safe', bps: 3000, className: 'bg-sp-shade/40' },
                { label: 'Rewards vault', bps: 4200, className: 'bg-sp-brand' },
                { label: 'Creator escrow', bps: 2800, className: 'bg-sp-up' },
              ]}
            />
          </div>
          <div>
            <p className="mb-1.5 text-[11px] font-extrabold uppercase tracking-[0.06em] text-sp-shade/45">
              Pool hook fee in ETH (1% of every swap after graduation)
            </p>
            <SplitBar
              parts={[
                { label: 'Protocol Safe', bps: 3000, className: 'bg-sp-shade/40' },
                { label: 'Creator escrow', bps: 3500, className: 'bg-sp-up' },
                { label: 'Burned forever', bps: 3500, className: 'bg-sp-down' },
              ]}
            />
          </div>
          <p className="text-[10.5px] text-sp-shade/45">
            Exact effective numbers from the tokenomics spec: buybackBps={SPHERE_PLAN.buybackBps} cuts the creator ETH
            leg only; token-denominated legs go 70/30 escrow/Safe with no burn cut.
          </p>
        </div>
      </Card>

      <Card>
        <h2 className="text-[15px] font-extrabold text-sp-ink">Weekly creator rewards - the rules</h2>
        <div className="mt-3 grid gap-2 text-[12.5px] leading-relaxed text-sp-shade/70">
          <p>Every week the indexer scores every launchpad creator from raw chain logs. The formula is public and deterministic - anyone can recompute it.</p>
          <p>
            <span className="font-extrabold text-sp-ink">Anti-wash by design:</span> your own trades count for zero, and
            your weekly reward is hard-capped at 30% of the fees your tokens actually brought the protocol from real
            traders. Washing burns your ETH on fees and cannot raise that cap.
          </p>
          <p>
            <span className="font-extrabold text-sp-ink">Streaming payouts:</span> each week&apos;s rewards will unlock
            linearly over the next one, inside a distributor contract that ships once shadow season proves the numbers.
            Unclaimed rewards never expire - the ledger is cumulative, so one claim pays everything you have earned.
          </p>
          <p className="text-[11px] text-sp-shade/50">
            Shadow season runs now: scores are computed and published with no payouts while the formula calibrates on
            real volume.
          </p>
        </div>
      </Card>

      <Card>
        <h2 className="text-[15px] font-extrabold text-sp-ink">Contracts</h2>
        <div className="mt-3 grid gap-2">
          <AddrLink address={SPHERE_TOKEN_ADDRESS} label="SPHERE token" pendingText="not launched yet" />
          <AddrLink address={SPHERE_ESCROW_ADDRESS} label="Creator escrow" />
          <AddrLink address={SPHERE_REWARDS_ADDRESS} label="Rewards vault" />
          <AddrLink address={SPHERE_VESTING_ADDRESS} label="Treasury vesting" />
          <AddrLink address={SPHERE_SAFE_ADDRESS} label="Treasury Safe" />
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-sp-shade/50">
          Zero-admin doctrine: no owner, no pause, no upgrade anywhere in the core. Burns are transfers to 0xdEaD -
          total supply stays 1B by design; the dead balance is publicly verifiable.
        </p>
      </Card>

      <Card>
        <h2 className="flex items-center gap-1.5 text-[15px] font-extrabold text-sp-ink">
          <FlaskConical className="h-4 w-4 text-sp-brand" aria-hidden="true" /> Rehearsal proven on Sepolia
        </h2>
        <p className="mt-2 text-[12px] leading-relaxed text-sp-shade/60">
          Before mainnet, the exact SPHERE lifecycle ran end-to-end on Base Sepolia with the same contracts: launch, a
          full graduation of the bonding curve and the first auto-burn of{' '}
          <span className="inline-flex items-center gap-1 font-extrabold text-sp-ink">
            <Flame className="h-3.5 w-3.5 text-sp-down" aria-hidden="true" /> 12,131 SPHERE
          </span>{' '}
          - executed by the real mechanism, not a simulation.
        </p>
        <a
          href="https://sepolia.basescan.org/address/0xb200000000000000000000Ba5ED02Ebf7B04aDBc"
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-[11.5px] font-bold text-sp-brand hover:underline"
        >
          Rehearsal token 0xb20000…04aDBc on Sepolia BaseScan (testnet, worthless, not the token you buy){' '}
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </a>
      </Card>
    </div>
  );
}

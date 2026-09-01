'use client';

/**
 * REWARDS VAULT = skarbonka nagrod, w jezyku Overview (redesign 2026-08-31).
 *
 * Zero akapitow: hero z trzema wielkimi liczbami, adresy jako pastylki,
 * dwie karty akcji. Objasnienia mieszkaja na /about.
 *
 * Logika bez zmian: `claimFor` jest permissionless, a `pull` moze wykonac
 * wylacznie CONSUMER (Rewards Safe) - dlatego przycisku pull nie ma, jest
 * tylko nota i konsola ABI.
 */

import { formatEther, type Address } from 'viem';
import { Coins } from 'lucide-react';
import { launchpadAbi } from '../../config';
import { SPHERE_LAUNCHPAD_ADDRESS, SPHERE_NATIVE_SYMBOL } from '../sphereChain';
import AbiConsole from '../AbiConsole';
import { SPHERE_LIVE, SPHERE_REWARDS_ADDRESS, sphereRewardsAbi } from '../sphereConfig';
import { ActionButton, useSphereRead } from '../sphereActions';
import { TeamRunBadge } from '../SphereShell';
import { ActionCard, AddressPill, AdvancedSection, BigStat, KeeperSection, LearnMore, PageHero } from '../SphereUI';

/** Wei -> liczba dla NumberTicker; null zostaje null (szkielet ladowania). */
function toNumber(wei: bigint | undefined): number | null {
  return wei === undefined ? null : Number(formatEther(wei));
}

export default function SphereRewardsPanel() {
  const rewards = SPHERE_REWARDS_ADDRESS;

  const state = useSphereRead(async (client) => {
    if (!rewards) return null;
    const [pullable, totalPulled, consumer, padClaimable] = await Promise.all([
      client.readContract({ address: rewards, abi: sphereRewardsAbi, functionName: 'pullable' }),
      client.readContract({ address: rewards, abi: sphereRewardsAbi, functionName: 'totalPulled' }),
      client.readContract({ address: rewards, abi: sphereRewardsAbi, functionName: 'CONSUMER' }),
      client.readContract({ address: SPHERE_LAUNCHPAD_ADDRESS as Address, abi: launchpadAbi, functionName: 'claimable', args: [rewards] }),
    ]);
    return {
      pullable: pullable as bigint,
      totalPulled: totalPulled as bigint,
      consumer: consumer as Address,
      padClaimable: padClaimable as bigint,
    };
  });

  if (!SPHERE_LIVE || !rewards) {
    return (
      <div className="sph-stagger grid gap-4">
        <PageHero
          title="Rewards vault"
          tagline="Where creator-reward fees accumulate"
          icon={<Coins className="h-6 w-6 text-sp-brand" aria-hidden="true" />}
          badge={<TeamRunBadge />}
        />
        <ActionCard
          title="Not deployed yet"
          hint="Balances, deliveries and pulls appear here the moment the vault ships."
          disabledNote="Pre-launch - no vault address on chain."
        />
        <LearnMore>How rewards funding works</LearnMore>
      </div>
    );
  }

  return (
    <div className="sph-stagger grid gap-4">
      <PageHero
        title="Rewards vault"
        tagline="Where creator-reward fees accumulate"
        icon={<Coins className="h-6 w-6 text-sp-brand" aria-hidden="true" />}
        badge={<TeamRunBadge />}
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <BigStat label="In the vault" value={toNumber(state?.pullable)} decimals={4} suffix={SPHERE_NATIVE_SYMBOL} tone="brand" />
          <BigStat label="Waiting on curve" value={toNumber(state?.padClaimable)} decimals={4} suffix={SPHERE_NATIVE_SYMBOL} tone="up" />
          <BigStat label="Pulled so far" value={toNumber(state?.totalPulled)} decimals={4} suffix={SPHERE_NATIVE_SYMBOL} />
        </div>
      </PageHero>

      <div className="flex flex-wrap items-center gap-2">
        <AddressPill address={rewards} label="vault" />
        {state && <AddressPill address={state.consumer} label="key holder" />}
      </div>

      <KeeperSection>
      <div className="grid gap-3 sm:grid-cols-2">
        <ActionCard title="Deliver curve fees" hint="Anyone can trigger this - you only pay gas, the ETH lands in the vault.">
          <ActionButton
            label="Deliver curve fees"
            address={SPHERE_LAUNCHPAD_ADDRESS as Address}
            abi={launchpadAbi}
            functionName="claimFor"
            args={[rewards]}
            disabled={!state || state.padClaimable === 0n}
          />
        </ActionCard>
        <ActionCard
          title="Pull to treasury"
          badge={<TeamRunBadge />}
          hint="Moves vault funds out to the creator rewards program."
          disabledNote="CONSUMER key only (Rewards Safe) - execute it from the console below."
        />
      </div>
      </KeeperSection>

      <AdvancedSection>
        <AbiConsole title="SphereRewards" address={rewards} abi={sphereRewardsAbi} />
      </AdvancedSection>

      <LearnMore>How rewards funding works</LearnMore>
    </div>
  );
}

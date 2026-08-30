'use client';

/**
 * Zarzadzanie SphereRewards - skarbonka nagrod.
 *
 * Kuratorskie: dostawa fee z krzywej (permissionless claimFor) i podglad
 * salda/poborow. `pull` jest w konsoli - wykonac moze go wylacznie CONSUMER
 * (Rewards Safe), wiec nie udajemy przycisku dla kazdego.
 */

import { formatEther, type Address } from 'viem';
import { LAUNCHPAD_ADDRESS, NATIVE_SYMBOL, launchpadAbi } from '../../config';
import AbiConsole from '../AbiConsole';
import { SPHERE_LIVE, SPHERE_REWARDS_ADDRESS, sphereRewardsAbi } from '../sphereConfig';
import { ActionButton, StatRow, useSphereRead } from '../sphereActions';
import { TeamRunBadge } from '../SphereShell';

export default function SphereRewardsPanel() {
  const rewards = SPHERE_REWARDS_ADDRESS;

  const state = useSphereRead(async (client) => {
    if (!rewards) return null;
    const [pullable, totalPulled, consumer, padClaimable] = await Promise.all([
      client.readContract({ address: rewards, abi: sphereRewardsAbi, functionName: 'pullable' }),
      client.readContract({ address: rewards, abi: sphereRewardsAbi, functionName: 'totalPulled' }),
      client.readContract({ address: rewards, abi: sphereRewardsAbi, functionName: 'CONSUMER' }),
      client.readContract({ address: LAUNCHPAD_ADDRESS as Address, abi: launchpadAbi, functionName: 'claimable', args: [rewards] }),
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
      <p className="rounded-[20px] border border-sp-shade/10 bg-sp-surface p-5 text-[12.5px] text-sp-shade/60">
        Rewards vault is not deployed yet. After deployment this page shows the vault balance,
        pending curve-fee deliveries and the pull history. Funds leave the vault only to the
        rewards program, executed by the treasury Safe. <TeamRunBadge />
      </p>
    );
  }

  return (
    <div className="grid gap-4">
      <section className="rounded-[20px] border border-sp-shade/10 bg-sp-surface p-4 sm:p-5">
        <h2 className="text-[14px] font-extrabold text-sp-ink">Rewards vault</h2>
        <p className="mt-1 text-[11.5px] text-sp-shade/55">
          Accumulates the rewards share of curve fees from SPHERE and every Sphere-aligned
          launch. Only the treasury Safe (CONSUMER) can pull - routing to the creator rewards
          program is policy. <TeamRunBadge />
        </p>
        <div className="mt-3">
          <StatRow label="In the vault now" value={state ? `${formatEther(state.pullable)} ${NATIVE_SYMBOL}` : '…'} />
          <StatRow label="Waiting on curve (claimable)" value={state ? `${formatEther(state.padClaimable)} ${NATIVE_SYMBOL}` : '…'} />
          <StatRow label="Pulled so far" value={state ? `${formatEther(state.totalPulled)} ${NATIVE_SYMBOL}` : '…'} />
          <StatRow label="CONSUMER (key holder)" value={state ? state.consumer : '…'} />
        </div>
        <div className="mt-3">
          <ActionButton
            label="Deliver curve fees"
            address={LAUNCHPAD_ADDRESS as Address}
            abi={launchpadAbi}
            functionName="claimFor"
            args={[rewards]}
            disabled={!state || state.padClaimable === 0n}
          />
        </div>
        <p className="mt-2 text-[10.5px] text-sp-shade/45">
          Delivery is permissionless (you pay gas, ETH lands in the vault). Pulling OUT requires
          the CONSUMER key - use the console below from the Safe.
        </p>
      </section>

      <AbiConsole title="SphereRewards" address={rewards} abi={sphereRewardsAbi} />
    </div>
  );
}

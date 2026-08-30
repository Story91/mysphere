'use client';

/**
 * Zarzadzanie SphereCreatorEscrow - wiecznym "tworca" SPHERE.
 *
 * Kuratorskie akcje (wszystkie BEZUPRAWNIENIOWE poza launch):
 *  - dostawa fee do escrow: pad.claimFor / hook.claimEthFor / vault.claimEthFor
 *    (ktokolwiek placi gaz, kierunek zaszyty w kontraktach),
 *  - release(): split ETH 50/50 pot/ops,
 *  - releaseToken(): tokeny -> vesting.
 * Pelna powierzchnia (w tym launch dla LAUNCH_AUTHORITY): konsola ponizej.
 */

import { formatEther, zeroAddress, type Address } from 'viem';
import {
  LAUNCHPAD_ADDRESS,
  LAUNCH_HOOK_ADDRESS,
  LIQUIDITY_VAULT_ADDRESS,
  NATIVE_SYMBOL,
  hookAbi,
  launchpadAbi,
  liquidityVaultAbi,
} from '../../config';
import AbiConsole from '../AbiConsole';
import { SPHERE_ESCROW_ADDRESS, SPHERE_LIVE, sphereCreatorEscrowAbi } from '../sphereConfig';
import { ActionButton, StatRow, useSphereRead } from '../sphereActions';
import { EnforcedBadge } from '../SphereShell';

export default function SphereEscrowPanel() {
  const escrow = SPHERE_ESCROW_ADDRESS;

  const state = useSphereRead(async (client) => {
    if (!escrow) return null;
    const [launched, token, balance, padClaimable, hookClaimable, vaultClaimable] = await Promise.all([
      client.readContract({ address: escrow, abi: sphereCreatorEscrowAbi, functionName: 'launched' }),
      client.readContract({ address: escrow, abi: sphereCreatorEscrowAbi, functionName: 'sphereToken' }).catch(() => zeroAddress),
      client.getBalance({ address: escrow }),
      client.readContract({ address: LAUNCHPAD_ADDRESS as Address, abi: launchpadAbi, functionName: 'claimable', args: [escrow] }),
      client.readContract({ address: LAUNCH_HOOK_ADDRESS as Address, abi: hookAbi, functionName: 'claimableEth', args: [escrow] }),
      client.readContract({ address: LIQUIDITY_VAULT_ADDRESS as Address, abi: liquidityVaultAbi, functionName: 'claimableEth', args: [escrow] }),
    ]);
    return {
      launched: launched as boolean,
      token: token as Address,
      balance,
      padClaimable: padClaimable as bigint,
      hookClaimable: hookClaimable as bigint,
      vaultClaimable: vaultClaimable as bigint,
    };
  });

  if (!SPHERE_LIVE || !escrow) {
    return (
      <p className="rounded-[20px] border border-sp-shade/10 bg-sp-surface p-5 text-[12.5px] text-sp-shade/60">
        Escrow is not deployed yet. After deployment this page shows: pending fee deliveries
        from the curve, pool and LP streams, the ETH split release (50/50 buyback/ops,{' '}
        <EnforcedBadge />) and the token release into vesting - plus the full contract surface.
      </p>
    );
  }

  return (
    <div className="grid gap-4">
      <section className="rounded-[20px] border border-sp-shade/10 bg-sp-surface p-4 sm:p-5">
        <h2 className="text-[14px] font-extrabold text-sp-ink">Creator escrow</h2>
        <p className="mt-1 text-[11.5px] text-sp-shade/55">
          Holds the eternal creator stream of SPHERE. Exit rules are frozen: ETH splits 50/50 to
          buyback pot / ops, tokens go to vesting. <EnforcedBadge />
        </p>
        <div className="mt-3">
          <StatRow label="Launched" value={state ? String(state.launched) : '…'} />
          <StatRow label="SPHERE token" value={state && state.token !== zeroAddress ? state.token : 'not launched yet'} />
          <StatRow label={`ETH sitting in escrow`} value={state ? `${formatEther(state.balance)} ${NATIVE_SYMBOL}` : '…'} />
          <StatRow label="Waiting on curve (claimable)" value={state ? `${formatEther(state.padClaimable)} ${NATIVE_SYMBOL}` : '…'} />
          <StatRow label="Waiting on pool hook" value={state ? `${formatEther(state.hookClaimable)} ${NATIVE_SYMBOL}` : '…'} />
          <StatRow label="Waiting on LP vault" value={state ? `${formatEther(state.vaultClaimable)} ${NATIVE_SYMBOL}` : '…'} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <ActionButton label="Deliver curve fees" address={LAUNCHPAD_ADDRESS as Address} abi={launchpadAbi} functionName="claimFor" args={[escrow]} disabled={!state || state.padClaimable === 0n} />
          <ActionButton label="Deliver hook fees" address={LAUNCH_HOOK_ADDRESS as Address} abi={hookAbi} functionName="claimEthFor" args={[escrow]} disabled={!state || state.hookClaimable === 0n} />
          <ActionButton label="Deliver LP fees" address={LIQUIDITY_VAULT_ADDRESS as Address} abi={liquidityVaultAbi} functionName="claimEthFor" args={[escrow]} disabled={!state || state.vaultClaimable === 0n} />
          <ActionButton label="Release ETH (50/50 split)" address={escrow} abi={sphereCreatorEscrowAbi} functionName="release" disabled={!state || state.balance === 0n} />
          <ActionButton label="Release tokens → vesting" address={escrow} abi={sphereCreatorEscrowAbi} functionName="releaseToken" args={[zeroAddress]} disabled={!state || !state.launched} />
        </div>
        <p className="mt-2 text-[10.5px] text-sp-shade/45">
          All buttons above are permissionless - you only pay gas; destinations are hard-coded in
          the contracts.
        </p>
      </section>

      <AbiConsole title="SphereCreatorEscrow" address={escrow} abi={sphereCreatorEscrowAbi} />
    </div>
  );
}

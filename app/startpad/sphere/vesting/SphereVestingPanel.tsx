'use client';

/**
 * Zarzadzanie SphereTokenVesting - jawny lock tokenow skarbca.
 *
 * Pokazuje harmonogram (klif -> liniowo -> koniec), postep w czasie i
 * releasable TERAZ; `release` jest bezuprawnieniowy (tokeny ida wylacznie
 * do BENEFICIARY), wiec dostaje przycisk. Pelna powierzchnia w konsoli.
 */

import { formatEther, zeroAddress, type Address } from 'viem';
import { SPHERE_ESCROW_ADDRESS, SPHERE_LIVE, SPHERE_VESTING_ADDRESS, sphereCreatorEscrowAbi, sphereTokenVestingAbi } from '../sphereConfig';
import AbiConsole from '../AbiConsole';
import { ActionButton, StatRow, useSphereRead } from '../sphereActions';
import { EnforcedBadge } from '../SphereShell';

function fmtDate(ts: bigint) {
  return new Date(Number(ts) * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function SphereVestingPanel() {
  const vesting = SPHERE_VESTING_ADDRESS;

  const state = useSphereRead(async (client) => {
    if (!vesting) return null;
    const [beneficiary, start, cliff, duration] = await Promise.all([
      client.readContract({ address: vesting, abi: sphereTokenVestingAbi, functionName: 'BENEFICIARY' }),
      client.readContract({ address: vesting, abi: sphereTokenVestingAbi, functionName: 'START' }),
      client.readContract({ address: vesting, abi: sphereTokenVestingAbi, functionName: 'CLIFF' }),
      client.readContract({ address: vesting, abi: sphereTokenVestingAbi, functionName: 'DURATION' }),
    ]);
    let token: Address = zeroAddress;
    if (SPHERE_ESCROW_ADDRESS) {
      token = (await client
        .readContract({ address: SPHERE_ESCROW_ADDRESS, abi: sphereCreatorEscrowAbi, functionName: 'sphereToken' })
        .catch(() => zeroAddress)) as Address;
    }
    const perToken =
      token !== zeroAddress
        ? await Promise.all([
            client.readContract({ address: vesting, abi: sphereTokenVestingAbi, functionName: 'totalReceived', args: [token] }),
            client.readContract({ address: vesting, abi: sphereTokenVestingAbi, functionName: 'releasable', args: [token] }),
            client.readContract({ address: vesting, abi: sphereTokenVestingAbi, functionName: 'released', args: [token] }),
          ])
        : null;
    return {
      beneficiary: beneficiary as Address,
      start: start as bigint,
      cliff: cliff as bigint,
      duration: duration as bigint,
      token,
      totalReceived: perToken ? (perToken[0] as bigint) : null,
      releasable: perToken ? (perToken[1] as bigint) : null,
      released: perToken ? (perToken[2] as bigint) : null,
    };
  });

  if (!SPHERE_LIVE || !vesting) {
    return (
      <p className="rounded-[20px] border border-sp-shade/10 bg-sp-surface p-5 text-[12.5px] text-sp-shade/60">
        Vesting is not deployed yet. After deployment this page shows the frozen schedule
        (30-day cliff, 12 months linear - final numbers set at deploy), how much is unlocked
        right now and a permissionless release button. <EnforcedBadge />
      </p>
    );
  }

  const now = BigInt(Math.floor(Date.now() / 1000));
  const progress =
    state && state.duration > 0n
      ? Math.min(100, Math.max(0, Number(((now - state.start) * 100n) / state.duration)))
      : 0;

  return (
    <div className="grid gap-4">
      <section className="rounded-[20px] border border-sp-shade/10 bg-sp-surface p-4 sm:p-5">
        <h2 className="text-[14px] font-extrabold text-sp-ink">Treasury vesting</h2>
        <p className="mt-1 text-[11.5px] text-sp-shade/55">
          Treasury tokens (dev-buy + token-side fees) unlock on a frozen schedule. Payouts go
          only to the beneficiary Safe - the schedule has no admin and no override. <EnforcedBadge />
        </p>
        {state && (
          <>
            <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-sp-shade/10">
              <div className="h-full rounded-full bg-sp-brand" style={{ width: `${progress}%` }} />
            </div>
            <p className="mt-1 text-[10.5px] text-sp-shade/50">
              {fmtDate(state.start)} → cliff {fmtDate(state.start + state.cliff)} → fully unlocked {fmtDate(state.start + state.duration)}
            </p>
          </>
        )}
        <div className="mt-3">
          <StatRow label="Beneficiary (Safe)" value={state ? state.beneficiary : '…'} />
          <StatRow label="Total received (SPHERE)" value={state?.totalReceived != null ? formatEther(state.totalReceived) : 'token not launched yet'} />
          <StatRow label="Released so far" value={state?.released != null ? formatEther(state.released) : '-'} />
          <StatRow label="Unlockable NOW" value={state?.releasable != null ? formatEther(state.releasable) : '-'} />
        </div>
        {state && state.token !== zeroAddress ? (
          <div className="mt-3">
            <ActionButton
              label="Release unlocked tokens → Safe"
              address={vesting}
              abi={sphereTokenVestingAbi}
              functionName="release"
              args={[state.token]}
              disabled={!state.releasable || state.releasable === 0n}
            />
          </div>
        ) : state ? (
          // Stan posredni: kontrakty zyja, token przed launch() - zero wartosci to norma.
          <p className="mt-3 text-[10.5px] font-bold text-sp-shade/45">
            Token not launched yet - vesting fills and release unlocks after the SPHERE launch.
          </p>
        ) : null}
      </section>

      <AbiConsole title="SphereTokenVesting" address={vesting} abi={sphereTokenVestingAbi} />
    </div>
  );
}

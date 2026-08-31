'use client';

/**
 * Zarzadzanie SphereCreatorEscrow - wiecznym "tworca" SPHERE.
 * Redesign 2026-08-31: hero z wielkimi liczbami + kafle akcji, zero
 * akapitow (objasnienia mieszkaja na /about).
 *
 * Kuratorskie akcje (wszystkie BEZUPRAWNIENIOWE poza launch):
 *  - dostawa fee do escrow: pad.claimFor / hook.claimEthFor / vault.claimEthFor
 *    (ktokolwiek placi gaz, kierunek zaszyty w kontraktach),
 *  - release(): split ETH wg ETH_POT_BPS (pot / ops),
 *  - releaseToken(): tokeny -> vesting.
 * Pelna powierzchnia (w tym launch dla LAUNCH_AUTHORITY): konsola ponizej.
 */

import { erc20Abi, formatEther, zeroAddress, type Address } from 'viem';
import { Landmark } from 'lucide-react';
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
import { SPHERE_ESCROW_ADDRESS, SPHERE_LIVE, SPHERE_PLAN, sphereCreatorEscrowAbi } from '../sphereConfig';
import { ActionButton, useSphereRead } from '../sphereActions';
import { EnforcedBadge } from '../SphereShell';
import { ActionCard, AddressPill, AdvancedSection, BigStat, LearnMore, PageHero } from '../SphereUI';

const HERO_ICON = <Landmark className="h-6 w-6 text-sp-brand" aria-hidden="true" />;
const TAGLINE = "SPHERE's creator stream - immutable routing";

/** Krotka liczba ETH do podpisu kafla - liczby > slowa. */
function eth(value: bigint) {
  return `${Number(formatEther(value)).toFixed(4)} ${NATIVE_SYMBOL}`;
}

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
    // Kierunki i split: stale immutable z konstruktora - do pastylek i paska.
    // Kazdy odczyt ma fallback, zeby nie zablokowac calego panelu.
    const [buybackPot, opsTarget, tokenTarget, ethPotBps] = await Promise.all([
      client.readContract({ address: escrow, abi: sphereCreatorEscrowAbi, functionName: 'BUYBACK_POT' }).catch(() => zeroAddress),
      client.readContract({ address: escrow, abi: sphereCreatorEscrowAbi, functionName: 'OPS_TARGET' }).catch(() => zeroAddress),
      client.readContract({ address: escrow, abi: sphereCreatorEscrowAbi, functionName: 'TOKEN_TARGET' }).catch(() => zeroAddress),
      client.readContract({ address: escrow, abi: sphereCreatorEscrowAbi, functionName: 'ETH_POT_BPS' }).catch(() => SPHERE_PLAN.ethPotBps),
    ]);
    // Saldo tokena ma sens dopiero po launchu - wczesniej sphereToken() = 0x0.
    const tokenAddress = token as Address;
    const tokenBalance =
      tokenAddress === zeroAddress
        ? 0n
        : await client
            .readContract({ address: tokenAddress, abi: erc20Abi, functionName: 'balanceOf', args: [escrow] })
            .catch(() => 0n);
    return {
      launched: launched as boolean,
      token: tokenAddress,
      balance,
      tokenBalance,
      padClaimable: padClaimable as bigint,
      hookClaimable: hookClaimable as bigint,
      vaultClaimable: vaultClaimable as bigint,
      buybackPot: buybackPot as Address,
      opsTarget: opsTarget as Address,
      tokenTarget: tokenTarget as Address,
      ethPotBps: Number(ethPotBps),
    };
  });

  if (!SPHERE_LIVE || !escrow) {
    return (
      <div className="sph-stagger grid gap-4">
        <PageHero title="Creator escrow" tagline={TAGLINE} badge={<EnforcedBadge />} icon={HERO_ICON}>
          <div className="grid gap-3 sm:grid-cols-3">
            <BigStat label={`${NATIVE_SYMBOL} in escrow`} value={null} />
            <BigStat label="SPHERE in escrow" value={null} />
            <BigStat label="Waiting on curve" value={null} />
          </div>
        </PageHero>
        <p className="sph-card rounded-[20px] border border-sp-shade/10 bg-sp-surface p-4 text-[11.5px] font-bold text-sp-shade/50">
          Not deployed yet - actions unlock the moment the escrow address lands in config.
        </p>
        <LearnMore>How the escrow routing works</LearnMore>
      </div>
    );
  }

  const potPct = (state ? state.ethPotBps : SPHERE_PLAN.ethPotBps) / 100;

  return (
    <div className="sph-stagger grid gap-4">
      {/* HERO ---------------------------------------------------------------- */}
      <PageHero title="Creator escrow" tagline={TAGLINE} badge={<EnforcedBadge />} icon={HERO_ICON}>
        <div className="grid gap-3 sm:grid-cols-3">
          <BigStat
            label={`${NATIVE_SYMBOL} in escrow`}
            value={state ? Number(formatEther(state.balance)) : null}
            decimals={4}
            suffix={NATIVE_SYMBOL}
            tone="brand"
          />
          <BigStat
            label="SPHERE in escrow"
            value={state ? Number(formatEther(state.tokenBalance)) : null}
            decimals={0}
            suffix="SPHERE"
            hint={state && !state.launched ? 'after launch' : undefined}
          />
          <BigStat
            label="Waiting on curve"
            value={state ? Number(formatEther(state.padClaimable)) : null}
            decimals={4}
            suffix={NATIVE_SYMBOL}
            tone="up"
          />
        </div>
      </PageHero>

      {/* KIERUNKI - zamrozone w konstruktorze --------------------------------- */}
      <div className="flex flex-wrap items-center gap-2">
        <AddressPill address={escrow} label="Escrow" />
        {state && state.buybackPot !== zeroAddress && <AddressPill address={state.buybackPot} label="Buyback pot" />}
        {state && state.opsTarget !== zeroAddress && <AddressPill address={state.opsTarget} label="Ops" />}
        {state && state.tokenTarget !== zeroAddress && <AddressPill address={state.tokenTarget} label="Vesting" />}
      </div>

      {/* AKCJE --------------------------------------------------------------- */}
      <div className="grid gap-3 sm:grid-cols-2">
        <ActionCard
          title="Deliver curve fees"
          hint={state ? `${eth(state.padClaimable)} waiting - anyone can pay the gas` : 'Reading the curve'}
        >
          <ActionButton
            label="Deliver curve fees"
            address={LAUNCHPAD_ADDRESS as Address}
            abi={launchpadAbi}
            functionName="claimFor"
            args={[escrow]}
            disabled={!state || state.padClaimable === 0n}
          />
        </ActionCard>

        <ActionCard
          title="Deliver hook fees"
          hint={state ? `${eth(state.hookClaimable)} waiting on the pool hook` : 'Reading the pool hook'}
        >
          <ActionButton
            label="Deliver hook fees"
            address={LAUNCH_HOOK_ADDRESS as Address}
            abi={hookAbi}
            functionName="claimEthFor"
            args={[escrow]}
            disabled={!state || state.hookClaimable === 0n}
          />
        </ActionCard>

        <ActionCard
          title="Deliver LP fees"
          hint={state ? `${eth(state.vaultClaimable)} waiting on the LP vault` : 'Reading the LP vault'}
        >
          <ActionButton
            label="Deliver LP fees"
            address={LIQUIDITY_VAULT_ADDRESS as Address}
            abi={liquidityVaultAbi}
            functionName="claimEthFor"
            args={[escrow]}
            disabled={!state || state.vaultClaimable === 0n}
          />
        </ActionCard>

        <ActionCard
          title="Release ETH"
          badge={<EnforcedBadge />}
          hint={state ? `${eth(state.balance)} splits between two frozen destinations` : 'Reading the balance'}
        >
          {/* Split zamiast zdania: pasek dwuczesciowy wg ETH_POT_BPS. */}
          <div className="w-full">
            <div className="flex items-center justify-between text-[9.5px] font-extrabold uppercase tracking-[0.06em]">
              <span className="text-sp-brand">Buyback pot {potPct}%</span>
              <span className="text-sp-shade/45">Ops {100 - potPct}%</span>
            </div>
            <div className="mt-1.5 flex h-2 overflow-hidden rounded-full bg-sp-shade/10">
              <span className="sph-progress block bg-sp-brand" style={{ width: `${potPct}%` }} aria-hidden="true" />
              <span className="block flex-1 bg-sp-shade/25" aria-hidden="true" />
            </div>
          </div>
          <ActionButton
            label="Release ETH"
            address={escrow}
            abi={sphereCreatorEscrowAbi}
            functionName="release"
            disabled={!state || state.balance === 0n}
          />
        </ActionCard>

        {/* Akcja tokenowa dopiero po launchu - wczesniej sphereToken() = 0x0. */}
        <ActionCard
          title="Release tokens → vesting"
          badge={<EnforcedBadge />}
          hint="Whole SPHERE balance moves into the vesting contract"
          disabledNote={state?.launched ? undefined : 'Token not launched yet - unlocks after launch().'}
        >
          <ActionButton
            label="Release tokens → vesting"
            address={escrow}
            abi={sphereCreatorEscrowAbi}
            functionName="releaseToken"
            args={[zeroAddress]}
          />
        </ActionCard>
      </div>

      <AdvancedSection>
        <AbiConsole title="SphereCreatorEscrow" address={escrow} abi={sphereCreatorEscrowAbi} />
      </AdvancedSection>

      <LearnMore>How the escrow routing works</LearnMore>
    </div>
  );
}

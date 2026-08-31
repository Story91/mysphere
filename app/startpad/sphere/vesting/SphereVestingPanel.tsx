'use client';

/**
 * Treasury vesting w jezyku Overview (redesign 2026-08-31): zero akapitow,
 * wielkie tykajace liczby i JEDNA rzecz do zrozumienia - os czasu odblokowan.
 *
 * Harmonogram pokazujemy jako pasek start -> cliff -> koniec z markerem
 * "you are here" wg biezacego czasu, a nie jako sekundy z kontraktu.
 * Odczyty i warunki bez zmian - to przebudowa prezentacji.
 */

import { formatEther, zeroAddress, type Address } from 'viem';
import { Timer } from 'lucide-react';
import { SPHERE_ESCROW_ADDRESS, SPHERE_LIVE, SPHERE_VESTING_ADDRESS, sphereCreatorEscrowAbi, sphereTokenVestingAbi } from '../sphereConfig';
import AbiConsole from '../AbiConsole';
import { ActionButton, useSphereRead } from '../sphereActions';
import { EnforcedBadge } from '../SphereShell';
import { ActionCard, AddressPill, AdvancedSection, BigStat, LearnMore, PageHero } from '../SphereUI';

function fmtDate(ts: bigint) {
  return new Date(Number(ts) * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** bigint (wei) -> liczba dla tykajacego licznika. */
function toAmount(value: bigint | null | undefined) {
  return value == null ? 0 : Number(formatEther(value));
}

/** Etykieta pod paskiem: co to za punkt + kiedy wypada. */
function TimelineMark({ label, date, align }: { label: string; date: string; align: 'left' | 'center' | 'right' }) {
  const alignClass = align === 'left' ? 'text-left' : align === 'right' ? 'text-right' : 'text-center';
  return (
    <div className={alignClass}>
      <p className="text-[9px] font-extrabold uppercase tracking-[0.08em] text-sp-shade/40">{label}</p>
      <p className="mt-0.5 text-[11px] font-extrabold text-sp-ink">{date}</p>
    </div>
  );
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
    // Pre-launch: kontraktu nie ma, wiec zadnych odczytow ani przyciskow.
    return (
      <div className="sph-stagger grid gap-4">
        <PageHero
          title="Treasury vesting"
          tagline="Treasury tokens unlock on a public schedule"
          badge={<EnforcedBadge />}
          icon={<Timer className="h-6 w-6 text-sp-brand" aria-hidden="true" />}
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <BigStat label="Locked now" value={0} decimals={2} suffix="SPHERE" hint="Vesting not deployed yet" />
            <BigStat label="Releasable now" value={0} decimals={2} suffix="SPHERE" tone="up" hint="Unlocks after launch" />
            <BigStat label="Released so far" value={0} decimals={2} suffix="SPHERE" hint="Nothing released yet" />
          </div>
        </PageHero>
        <ActionCard
          title="Release vested tokens"
          hint="Anyone can trigger it - tokens can only land on the beneficiary Safe."
          badge={<EnforcedBadge />}
          disabledNote="Vesting is not deployed yet - the schedule goes live with the SPHERE launch."
        />
        <LearnMore>How the treasury lock works</LearnMore>
      </div>
    );
  }

  const now = BigInt(Math.floor(Date.now() / 1000));
  const progress =
    state && state.duration > 0n
      ? Math.min(100, Math.max(0, Number(((now - state.start) * 100n) / state.duration)))
      : 0;
  // Klif jako procent calego okna - marker na tej samej osi co postep.
  const cliffPct =
    state && state.duration > 0n ? Math.min(100, Math.max(0, Number((state.cliff * 100n) / state.duration))) : 0;
  // Pigulka "you are here" trzymana z dala od krawedzi paska.
  const markerPct = Math.min(92, Math.max(8, progress));

  const tokenLive = state != null && state.token !== zeroAddress;
  const lockedNow =
    state?.totalReceived != null && state.released != null
      ? state.totalReceived > state.released
        ? state.totalReceived - state.released
        : 0n
      : null;

  return (
    <div className="sph-stagger grid gap-4">
      <PageHero
        title="Treasury vesting"
        tagline="Treasury tokens unlock on a public schedule"
        badge={<EnforcedBadge />}
        icon={<Timer className="h-6 w-6 text-sp-brand" aria-hidden="true" />}
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <BigStat
            label="Locked now"
            value={state ? (tokenLive ? toAmount(lockedNow) : 0) : null}
            decimals={2}
            suffix="SPHERE"
            hint={state && !tokenLive ? 'Token not launched yet' : undefined}
          />
          <BigStat
            label="Releasable now"
            value={state ? (tokenLive ? toAmount(state.releasable) : 0) : null}
            decimals={2}
            suffix="SPHERE"
            tone="up"
            hint={state && !tokenLive ? 'Token not launched yet' : undefined}
          />
          <BigStat
            label="Released so far"
            value={state ? (tokenLive ? toAmount(state.released) : 0) : null}
            decimals={2}
            suffix="SPHERE"
            hint={state && !tokenLive ? 'Token not launched yet' : undefined}
          />
        </div>
      </PageHero>

      {/* OS CZASU: jedyna rzecz, ktora trzeba tu zrozumiec ------------------ */}
      <section className="sph-card rounded-[20px] border border-sp-shade/10 bg-sp-surface p-4 sm:p-5">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-sp-shade/50">Unlock schedule</p>
          <p className="font-soft-display text-[13px] font-extrabold text-sp-brand">
            {state ? `${progress}% elapsed` : '—'}
          </p>
        </div>

        {state ? (
          <>
            <div className="relative mt-6 pb-1">
              <span
                className="absolute -top-5 -translate-x-1/2 whitespace-nowrap rounded-full bg-sp-brand px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.06em] text-white"
                style={{ left: `${markerPct}%` }}
              >
                You are here
              </span>
              <div className="h-3 w-full overflow-hidden rounded-full bg-sp-shade/10">
                <div
                  className="sph-progress h-full rounded-full bg-gradient-to-r from-sp-brand to-sp-up"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span
                className="absolute top-0 h-3 w-[2px] -translate-x-1/2 rounded-full bg-sp-shade/40"
                style={{ left: `${cliffPct}%` }}
                aria-hidden="true"
              />
              <span
                className="absolute top-[-3px] h-[18px] w-[18px] -translate-x-1/2 rounded-full border-[3px] border-white bg-sp-brand shadow-[0_2px_8px_rgba(124,107,218,0.45)]"
                style={{ left: `${progress}%` }}
                aria-hidden="true"
              />
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2">
              <TimelineMark label="Start" date={fmtDate(state.start)} align="left" />
              <TimelineMark label="Cliff end" date={fmtDate(state.start + state.cliff)} align="center" />
              <TimelineMark label="Fully vested" date={fmtDate(state.start + state.duration)} align="right" />
            </div>
          </>
        ) : (
          <div className="mt-6">
            <div className="sph-skeleton h-3 w-full" />
            <div className="mt-3 grid grid-cols-3 gap-2">
              <div className="sph-skeleton h-7 w-24" />
              <div className="sph-skeleton mx-auto h-7 w-24" />
              <div className="sph-skeleton ml-auto h-7 w-24" />
            </div>
          </div>
        )}
      </section>

      {state && tokenLive ? (
        <ActionCard
          title="Release vested tokens"
          hint="Anyone can trigger it - tokens can only land on the beneficiary Safe."
          badge={<EnforcedBadge />}
        >
          <ActionButton
            label="Release vested tokens"
            address={vesting}
            abi={sphereTokenVestingAbi}
            functionName="release"
            args={[state.token]}
            disabled={!state.releasable || state.releasable === 0n}
          />
        </ActionCard>
      ) : (
        <ActionCard
          title="Release vested tokens"
          hint="Anyone can trigger it - tokens can only land on the beneficiary Safe."
          badge={<EnforcedBadge />}
          disabledNote={
            state
              ? 'Token not launched yet - vesting fills and release unlocks after the SPHERE launch.'
              : 'Loading schedule from chain…'
          }
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        <AddressPill address={vesting} label="Vesting" />
        {state && <AddressPill address={state.beneficiary} label="Beneficiary" />}
      </div>

      <AdvancedSection>
        <AbiConsole title="SphereTokenVesting" address={vesting} abi={sphereTokenVestingAbi} />
      </AdvancedSection>

      <LearnMore>How the treasury lock works</LearnMore>
    </div>
  );
}

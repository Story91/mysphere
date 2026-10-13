'use client';

/**
 * JEDYNA strona z tekstem w centrum $SPHERE (decyzja wlasciciela 2026-08-31:
 * "jedna strona z tekstem i objasnieniem, reszta z dzialaniem"). Wszystkie
 * dluzsze wyjasnienia mieszkaja TU; pozostale podstrony pokazuja liczby
 * i przyciski.
 *
 * Rewizja 2026-09-10: strona twierdzila rzeczy, ktore przestaly byc prawda
 * (dystrybutor i buyback jako "napisane, niewdrozone" - oba stoja na Base
 * i placa), i obiecywala wiecej, niz wymuszaja kontrakty (auto-burn,
 * nieprzedawnialne nagrody). Kazde takie zdanie stoi teraz obok liczby
 * odczytanej z lancucha, zeby nie dalo sie go znowu przeoczyc.
 *
 * Przeglad wlasciciela 2026-09-10 ("tresc chowaj w dropdownach"): akapity
 * zamienily sie w kafle mechanizmow. Kolejnosc na kafelku to LICZBA ->
 * ZASTRZEZENIE -> (rozwijak) JAK TO DZIALA. Pod rozwijak schodza wyprowadzenia
 * i opisy mechaniki; na wierzchu zostaja zdania, bez ktorych sasiednia liczba
 * znaczy cos innego - ze buyback nie odpala sie sam, ze zasilanie SphereBuyback
 * z przychodu protokolu jest uznaniowe i ze kontrakt nie gwarantuje przeniesienia
 * TWOJEJ pozycji do kolejnej epoki.
 */

import { ExternalLink, Flame, FlaskConical } from 'lucide-react';
import { formatEther, type Address } from 'viem';
import { SPHERE_EXPLORER_URL } from '../sphereChain';
import { Disclosure, Reveal } from '../SphereUI';
import { EnforcedBadge, KeeperTriggeredBadge, TeamRunBadge, formatUtc, useSphereChainFacts } from '../SphereShell';
import {
  SPHERE_BUYBACK_ADDRESS,
  SPHERE_DISTRIBUTOR_ADDRESS,
  SPHERE_ESCROW_ADDRESS,
  SPHERE_PLAN,
  SPHERE_REWARDS_ADDRESS,
  SPHERE_SAFE_ADDRESS,
  SPHERE_TOKEN_ADDRESS,
  SPHERE_VESTING_ADDRESS,
} from '../sphereConfig';

function Card({ children }: { children: React.ReactNode }) {
  return <section className="sph-card rounded-card border border-sp-shade/10 bg-sp-surface p-4 sm:p-5">{children}</section>;
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

/** Liczba w zdaniu - zawsze z lancucha, nigdy wpisana. Null = jeszcze leci. */
function Live({ value, decimals = 0, suffix }: { value: bigint | null | undefined; decimals?: number; suffix?: string }) {
  if (value === null || value === undefined) {
    return <span className="sph-skeleton inline-block h-3 w-16 align-middle" />;
  }
  return (
    <span className="font-extrabold text-sp-ink">
      {Number(formatEther(value)).toLocaleString('en-US', { maximumFractionDigits: decimals })}
      {suffix ? ` ${suffix}` : ''}
    </span>
  );
}

/** Liczba z podpisem - to, co ma zostac widoczne, gdy akapit schodzi pod rozwijak. */
function Figure({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex min-w-0 flex-col gap-0.5">
      <span className="text-[12px] font-semibold text-sp-shade/60">{label}</span>
      <span className="font-soft-display text-[16px] font-extrabold leading-none text-sp-ink [overflow-wrap:anywhere]">
        {children}
      </span>
    </span>
  );
}

/**
 * Jeden mechanizm = jeden kafel: nazwa, plakietki, LICZBY, zastrzezenie i
 * dopiero pod rozwijakiem opis dzialania.
 *
 * Wczesniej kazdy z czterech mechanizmow byl akapitem na 5-8 linijek z
 * liczbami wplecionymi w srodek zdania - przez co strona czytala sie jak
 * dokumentacja, a nie jak panel. Kolejnosc jest teraz odwrotna niz w tekscie:
 * najpierw ile, potem czym to jest zastrzezone, na koncu (opcjonalnie) jak to
 * dziala. `caveat` NIE schodzi pod rozwijak - to zdanie, bez ktorego liczba
 * obok znaczy cos innego.
 */
function Mechanism({
  title,
  badges,
  figures,
  caveat,
  more,
  children,
}: {
  title: string;
  badges?: React.ReactNode;
  figures?: React.ReactNode;
  caveat?: React.ReactNode;
  more: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-sp-shade/10 bg-sp-shade/[0.02] p-3.5">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] font-extrabold text-sp-ink">
        {title} {badges}
      </p>
      {figures && <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-2.5">{figures}</div>}
      {caveat && <p className="mt-2.5 text-[11.5px] font-bold leading-relaxed text-sp-shade/60">{caveat}</p>}
      <div className="mt-2.5">
        <Disclosure summary={more}>{children}</Disclosure>
      </div>
    </div>
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
  const facts = useSphereChainFacts();
  const burn = facts?.burn ?? null;
  const bb = facts?.buyback ?? null;
  const dist = facts?.distributor ?? null;

  return (
    <div className="sph-stagger grid gap-4">
      <Card>
        <h2 className="text-[15px] font-extrabold text-sp-ink">How $SPHERE accrues value</h2>
        <div className="mt-3 grid gap-2.5">
          {/* Plakietki rozdzielaja to, co wymusza kontrakt, od tego, co wymaga
              czyjegos wywolania - "auto-burn" nie istnieje, nic nie pali sie samo. */}
          <Mechanism
            title="Buy-and-burn"
            badges={
              <>
                <EnforcedBadge /> <KeeperTriggeredBadge />
              </>
            }
            figures={
              <>
                <Figure label="Bought & burned by the hook">
                  <Live value={burn?.fromHookBuyback} suffix="SPHERE" />
                </Figure>
                <Figure label="Total at 0xdEaD">
                  <Live value={burn?.dead} suffix="SPHERE" />
                </Figure>
              </>
            }
            caveat="It does not fire by itself. Someone has to call settle() and then executeBuyback() and pay the gas - both are permissionless and pay the caller nothing, so until somebody spends it, the ETH just waits."
            more="Where the buyback pot comes from, and why 0xdEaD is its only exit"
          >
            50% of the creator-side ETH from every post-graduation SPHERE swap fee is set aside inside
            the hook as a buyback pot. <span className="font-mono">hook.settle(SPHERE)</span> books the
            fees into that pot and <span className="font-mono">hook.executeBuyback(...)</span> spends it.
            What the pot buys can go to exactly one place - 0xdEaD - and that destination is frozen at
            launch: there is no function, owner or upgrade path that could redirect it.
          </Mechanism>

          <Mechanism
            title="Frozen fee split"
            badges={<EnforcedBadge />}
            caveat="The creator's 70% share of every curve fee routes 60% to the rewards vault and 40% to the creator escrow. The receiving addresses are baked into the launch forever."
            more="The same split expressed against the whole fee"
          >
            60% and 40% of the creator&apos;s 70% work out to 42% and 28% of the entire curve fee - the
            two shares drawn in the bar below.
          </Mechanism>

          <Mechanism
            title="Revenue buybacks"
            badges={<TeamRunBadge />}
            caveat="Discretionary: the treasury Safe may buy SPHERE with protocol revenue, but that is a policy, not a contract guarantee. Nothing forces it to happen, or to keep happening."
            more="How we keep this one honest"
          >
            Every purchase is visible on-chain, and we label it as team-run rather than counting it
            among the things the contracts enforce. Treat it as something that has happened, not as
            something that must.
          </Mechanism>

          {/* Bylo: "Written, not deployed yet ... treat this as a plan, not a
              guarantee". SphereBuyback stoi na Base od 2.09.2026 i ma juz
              wykonane transze, wiec plakietka klamala w druga strone niz
              zwykle - ZANIZALA to, co protokol faktycznie robi. */}
          <Mechanism
            title="Buyback contract (SphereBuyback)"
            badges={<EnforcedBadge />}
            figures={
              <>
                <Figure label="ETH spent">
                  <Live value={bb?.totalEthSpent} decimals={6} suffix="ETH" />
                </Figure>
                <Figure label="Burned">
                  <Live value={bb?.totalBurned} decimals={2} suffix="SPHERE" />
                </Figure>
                <Figure label="To the reward pool">
                  <Live value={bb?.totalToDistributor} decimals={2} suffix="SPHERE" />
                </Figure>
                <Figure label="Immutable split">
                  {bb
                    ? `${(bb.burnBps / 100).toFixed(0)}% / ${((10_000 - bb.burnBps) / 100).toFixed(0)}%`
                    : '20% / 80%'}
                </Figure>
              </>
            }
            caveat="Deployed on Base and already executing. But when and whether the Safe funds it at all is policy - the contract cannot make revenue appear."
            more="What the contract enforces once it is funded, and where it lives"
          >
            Everything it buys splits{' '}
            {bb ? `${(bb.burnBps / 100).toFixed(0)}% burned forever and ${((10_000 - bb.burnBps) / 100).toFixed(0)}%` : '20% burned forever and 80%'}{' '}
            into the weekly creator reward pool, and that ratio is immutable. The tranche size, the
            window budget and the price-deviation guard are enforced by the contract too. Address:{' '}
            <span className="font-mono">
              {SPHERE_BUYBACK_ADDRESS
                ? `${SPHERE_BUYBACK_ADDRESS.slice(0, 8)}…${SPHERE_BUYBACK_ADDRESS.slice(-6)}`
                : 'no address in this build'}
            </span>
            .
          </Mechanism>
        </div>
      </Card>

      <Card>
        <h2 className="text-[15px] font-extrabold text-sp-ink">Where every fee goes</h2>
        <div className="mt-3 grid gap-4">
          <div>
            <p className="mb-1.5 text-[12px] font-semibold text-sp-shade/60">
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
            <p className="mb-1.5 text-[12px] font-semibold text-sp-shade/60">
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
          {/* SPHERE jest po graduacji, wiec kupujacy placi OBIE nogi naraz -
              i nigdzie indziej nie widzial ich zsumowanych. To jedyna liczba w
              tej karcie, ktora dotyczy go osobiscie, wiec dostaje kafel. */}
          {facts?.pool && (
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-2xl bg-sp-brand/[0.07] px-4 py-3">
              <span className="text-[12px] font-semibold text-sp-shade/60">
                What a swap costs you today
              </span>
              <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="font-soft-display text-[24px] font-extrabold leading-none text-sp-brand">
                  {(facts.pool.poolFeePpm / 10_000 + facts.pool.hookFeeBps / 100).toFixed(2)}%
                </span>
                <span className="text-[11px] font-bold text-sp-shade/50">
                  {(facts.pool.poolFeePpm / 10_000).toFixed(2)}% pool + {(facts.pool.hookFeeBps / 100).toFixed(2)}% hook
                </span>
              </span>
            </div>
          )}
          {/* Wyprowadzenie z arkusza tokenomiki - nie zmienia znaczenia zadnej
              liczby wyzej, tylko tlumaczy, skad sie wzialy. Pod rozwijak. */}
          <Disclosure summary="How these bars are derived from the tokenomics spec">
            buybackBps={SPHERE_PLAN.buybackBps} cuts the creator ETH leg only; token-denominated legs go
            70/30 escrow/Safe with no burn cut.
          </Disclosure>
        </div>
      </Card>

      <Card>
        <h2 className="text-[15px] font-extrabold text-sp-ink">Weekly creator rewards - the rules</h2>
        <div className="mt-3 grid gap-3">
          {/* Bylo: "inside a distributor contract that ships once shadow
              season proves the numbers" - dystrybutor stoi na Base od
              2.09.2026, ma aktywny root i wyplacone tokeny. */}
          {dist && (
            <div className="flex flex-wrap gap-x-5 gap-y-2.5 rounded-2xl bg-sp-shade/[0.03] p-3.5">
              <Figure label="Active epoch">#{dist.epochId}</Figure>
              <Figure label="Owed cumulatively">
                <Live value={dist.totalCumulative} decimals={2} suffix="SPHERE" />
              </Figure>
              <Figure label="Claimed">
                <Live value={dist.totalClaimed} decimals={2} suffix="SPHERE" />
              </Figure>
              <Figure label="Stream length">{(dist.streamDuration / 86_400).toFixed(0)} days</Figure>
              <Figure label="Veto window">{(dist.minDelay / 3_600).toFixed(0)} h</Figure>
              <Figure label="Anti-wash cap">30%</Figure>
            </div>
          )}

          <div className="grid gap-2 text-[12.5px] leading-relaxed text-sp-shade/70">
            <p>
              <span className="font-extrabold text-sp-ink">Anti-wash by design:</span> your own trades count for
              zero, and your weekly reward is hard-capped at 30% of the fees your tokens actually brought the
              protocol from real traders.
            </p>
            {/* Bylo: "Unclaimed rewards never expire - the ledger is cumulative,
                so one claim pays everything you have earned." Kontrakt tego NIE
                gwarantuje na poziomie konta: ShrinkingTotal pilnuje wylacznie
                sumy globalnej, a przeniesienie TWOJEJ pozycji zalezy od tego,
                czy proposer wpisze ja do nowego roota. To zastrzezenie zmienia
                znaczenie liczby "owed cumulatively" wyzej, wiec zostaje na
                wierzchu; caly wywod o ShrinkingTotal schodzi pod rozwijak. */}
            <p>
              <span className="font-extrabold text-sp-ink">What is not promised:</span> the contract cannot
              guarantee that your personal line survives into the next epoch - that depends on the proposer
              carrying your past balance into each new root. Unclaimed does not mean untouchable.
            </p>
            <p className="text-[11px] text-sp-shade/50">
              The formula still calibrates on live volume - the scoreboard is published every epoch and the
              payouts follow it.
            </p>
          </div>

          <Disclosure summary="How the score is computed, and what the ledger does guarantee">
            <span className="grid gap-2">
              <span className="block">
                Every week the indexer scores every launchpad creator from raw chain logs. The formula is public
                and deterministic - anyone can recompute it. Washing burns your ETH on fees and cannot raise the
                30% cap.
              </span>
              <span className="block">
                The contract rejects any new root whose global totalCumulative is lower than the current one
                (error <span className="font-mono">ShrinkingTotal</span>) and will not activate a root the balance
                cannot cover. Your own claim is a high-water mark, so nobody can claw back what you already took,
                and one claim still collects every epoch already inside the active root. Each epoch increment
                unlocks linearly over the stream length above, and no root activates sooner than the veto window
                after it was proposed - that window exists so the guardian can reject it. The manifest hash
                published with every root exists precisely so anyone can recompute the leaves and catch a root
                that drops someone.
              </span>
              {dist && (
                <span className="block">
                  Active root since {formatUtc(dist.activatedAt)}.
                  {dist.pending ? (
                    <>
                      {' '}
                      Queued right now: epoch #{dist.pending.epochId} with{' '}
                      <Live value={dist.pending.totalCumulative} decimals={2} suffix="SPHERE" /> cumulative,
                      activating {formatUtc(dist.pending.validAt)}.
                    </>
                  ) : (
                    ' Nothing is queued right now.'
                  )}
                </span>
              )}
            </span>
          </Disclosure>
        </div>
      </Card>

      {/* Adresy i probe na Sepolii to material referencyjny - zwiniete (2026-10-14). */}
      <Reveal title="Contracts and the pre-launch rehearsal" hint="Deployed addresses, and what was proven on Sepolia before mainnet">
      <Card>
        <h2 className="text-[15px] font-extrabold text-sp-ink">Contracts</h2>
        <div className="mt-3 grid gap-2">
          <AddrLink address={SPHERE_TOKEN_ADDRESS} label="SPHERE token" pendingText="not launched yet" />
          <AddrLink address={SPHERE_ESCROW_ADDRESS} label="Creator escrow" />
          <AddrLink address={SPHERE_REWARDS_ADDRESS} label="Rewards vault" />
          <AddrLink address={SPHERE_VESTING_ADDRESS} label="Treasury vesting" />
          {/* Dwa kontrakty fazy 1B, ktorych ta lista nie wymieniala wcale -
              a to na nie strona powolywala sie jako "niewdrozone". */}
          <AddrLink address={SPHERE_DISTRIBUTOR_ADDRESS} label="Reward distributor" />
          <AddrLink address={SPHERE_BUYBACK_ADDRESS} label="Revenue buyback" />
          <AddrLink address={SPHERE_SAFE_ADDRESS} label="Treasury Safe" />
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-sp-shade/50">
          Zero-admin doctrine: no owner, no pause, no upgrade anywhere in the core. Burns are transfers to 0xdEaD -
          total supply stays 1B by design; the dead balance is publicly verifiable.
        </p>
        {/* Wymog przejrzystosci, nie ozdobnik: pieciu roznych podpisow w UI
            czyta sie jak pieciu niezaleznych uczestnikow. Porownanie robimy
            na ODCZYTANYCH adresach, nie na stalej z configu. */}
        {facts?.roles.allSame && facts.roles.shared && (
          <>
            {/* Zdanie o centralizacji zostaje na wierzchu razem z adresem -
                to nie jest ozdobnik, tylko wymog przejrzystosci. Lista pieciu
                rol i uzasadnienie schodza pod rozwijak. */}
            <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-sp-shade/5 px-3 py-2 text-[11.5px] font-bold leading-relaxed text-sp-shade/60">
              <span className="font-extrabold text-sp-ink">One key, five labels.</span>
              <span>Five role slots, one 1/1 Safe -</span>
              <a
                href={`${SPHERE_EXPLORER_URL}/address/${facts.roles.shared}`}
                target="_blank"
                rel="noreferrer"
                className="font-mono font-bold text-sp-brand hover:underline"
              >
                {facts.roles.shared.slice(0, 8)}…{facts.roles.shared.slice(-6)}
              </a>
            </p>
            <div className="mt-2">
              <Disclosure summary="Which five roles, and why they cannot quietly become five parties">
                Protocol fee recipient, escrow buyback pot, escrow ops target, rewards key holder and vesting
                beneficiary all read back that one address. Different panels label it differently because the
                contracts name it differently, not because there are five independent parties. Those role slots
                are immutable, so this cannot quietly change.
              </Disclosure>
            </div>
          </>
        )}
      </Card>

      <Card>
        <h2 className="flex items-center gap-1.5 text-[15px] font-extrabold text-sp-ink">
          <FlaskConical className="h-4 w-4 text-sp-brand" aria-hidden="true" /> Rehearsal proven on Sepolia
        </h2>
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2.5 rounded-2xl bg-sp-shade/[0.03] p-3.5">
          <Figure label="First buy-and-burn, testnet">
            <span className="inline-flex items-center gap-1.5">
              <Flame className="h-4 w-4 text-sp-down" aria-hidden="true" /> 12,131 SPHERE
            </span>
          </Figure>
          <Figure label="Network">Base Sepolia</Figure>
        </div>
        <p className="mt-2.5 text-[11.5px] font-bold text-sp-shade/55">
          Testnet tokens are worthless and this is not the token you buy.
        </p>
        <div className="mt-2">
          <Disclosure summary="What exactly was rehearsed before mainnet">
            The exact SPHERE lifecycle ran end-to-end on Base Sepolia with the same contracts: launch, a full
            graduation of the bonding curve and that first buy-and-burn - executed by the real mechanism, not a
            simulation.{' '}
            <a
              href="https://sepolia.basescan.org/address/0xb200000000000000000000Ba5ED02Ebf7B04aDBc"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-bold text-sp-brand hover:underline"
            >
              Rehearsal token 0xb20000…04aDBc on Sepolia BaseScan <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
          </Disclosure>
        </div>
      </Card>
      </Reveal>
    </div>
  );
}

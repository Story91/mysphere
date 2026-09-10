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
 */

import { ExternalLink, Flame, FlaskConical } from 'lucide-react';
import { formatEther, type Address } from 'viem';
import { SPHERE_EXPLORER_URL } from '../sphereChain';
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
        <div className="mt-3 grid gap-2.5 text-[12.5px] leading-relaxed text-sp-shade/70">
          <p>
            {/* Bylo: "Auto-burn ... Frozen at launch, no one can turn it off."
                Druga polowa jest prawda, pierwsza nie: nic nie odpala sie samo.
                Rozbijamy wiec na dwie plakietki - co wymusza kontrakt, i co
                wymaga czyjegos wywolania. */}
            <EnforcedBadge /> <KeeperTriggeredBadge />{' '}
            <span className="ml-1">
              Buy-and-burn: 50% of the creator-side ETH from every post-graduation SPHERE swap fee is
              set aside inside the hook as a buyback pot. What that pot buys can go to exactly one
              place - 0xdEaD - and that is frozen at launch, nobody can redirect it. It does not fire
              by itself: someone has to call hook.settle(SPHERE) to book the fees and
              hook.executeBuyback(...) to spend the pot. Both are permissionless and pay the caller
              nothing, so until somebody spends the gas the ETH simply waits. Bought and burned this
              way so far: <Live value={burn?.fromHookBuyback} suffix="SPHERE" />, out of{' '}
              <Live value={burn?.dead} suffix="SPHERE" /> sitting at 0xdEaD in total.
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
            {/* Bylo: "Written, not deployed yet ... treat this as a plan, not a
                guarantee". SphereBuyback stoi na Base od 2.09.2026 i ma juz
                wykonane transze, wiec plakietka klamala w druga strone niz
                zwykle - ZANIZALA to, co protokol faktycznie robi. */}
            <EnforcedBadge />{' '}
            <span className="ml-1">
              Buyback contract (SphereBuyback,{' '}
              {SPHERE_BUYBACK_ADDRESS ? `${SPHERE_BUYBACK_ADDRESS.slice(0, 8)}…${SPHERE_BUYBACK_ADDRESS.slice(-6)}` : 'no address in this build'}
              ): deployed on Base and already executing. Everything it buys splits{' '}
              {bb ? `${(bb.burnBps / 100).toFixed(0)}% burned forever, ${((10_000 - bb.burnBps) / 100).toFixed(0)}%` : '20% burned forever, 80%'}{' '}
              into the weekly creator reward pool - the ratio is immutable. Spent so far:{' '}
              <Live value={bb?.totalEthSpent} decimals={6} suffix="ETH" />, which burned{' '}
              <Live value={bb?.totalBurned} decimals={2} suffix="SPHERE" /> and sent{' '}
              <Live value={bb?.totalToDistributor} decimals={2} suffix="SPHERE" /> to the distributor.
              The tranche size, the window budget and the price-deviation guard are enforced by the
              contract; when and whether the Safe funds it at all is policy.
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
          {/* SPHERE jest po graduacji, wiec kupujacy placi OBIE nogi naraz -
              i nigdzie indziej nie widzial ich zsumowanych. */}
          {facts?.pool && (
            <p className="text-[11px] font-bold text-sp-shade/55">
              What a swap actually costs you today: {(facts.pool.poolFeePpm / 10_000).toFixed(2)}% pool fee +{' '}
              {(facts.pool.hookFeeBps / 100).toFixed(2)}% hook fee ={' '}
              <span className="font-extrabold text-sp-ink">
                {(facts.pool.poolFeePpm / 10_000 + facts.pool.hookFeeBps / 100).toFixed(2)}%
              </span>{' '}
              per trade, in the v4 pool the curve graduated into.
            </p>
          )}
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
            {/* Bylo: "inside a distributor contract that ships once shadow
                season proves the numbers" - dystrybutor stoi na Base od
                2.09.2026, ma aktywny root i wyplacone tokeny. */}
            <span className="font-extrabold text-sp-ink">Streaming payouts:</span> the distributor is live on Base
            {dist ? (
              <>
                {' '}
                and paying. Epoch #{dist.epochId} has been the active root since {formatUtc(dist.activatedAt)}; it owes{' '}
                <Live value={dist.totalCumulative} decimals={2} suffix="SPHERE" /> cumulatively, of which{' '}
                <Live value={dist.totalClaimed} decimals={2} suffix="SPHERE" /> has already been claimed. Each epoch&apos;s
                increment unlocks linearly over {(dist.streamDuration / 86_400).toFixed(0)} days from the moment its root
                activates, and no root can activate less than {(dist.minDelay / 3_600).toFixed(0)} h after it was
                proposed - that window exists so the guardian can veto.
                {dist.pending && (
                  <>
                    {' '}
                    Queued right now: epoch #{dist.pending.epochId} with{' '}
                    <Live value={dist.pending.totalCumulative} decimals={2} suffix="SPHERE" /> cumulative, activating{' '}
                    {formatUtc(dist.pending.validAt)}.
                  </>
                )}
              </>
            ) : (
              '.'
            )}
          </p>
          <p>
            {/* Bylo: "Unclaimed rewards never expire - the ledger is cumulative,
                so one claim pays everything you have earned." Kontrakt tego NIE
                gwarantuje na poziomie konta: ShrinkingTotal pilnuje wylacznie
                sumy globalnej, a przeniesienie TWOJEJ pozycji zalezy od tego,
                czy proposer wpisze ja do nowego roota. */}
            <span className="font-extrabold text-sp-ink">What the ledger really guarantees:</span> the contract
            rejects any new root whose global totalCumulative is lower than the current one (error
            <span className="font-mono"> ShrinkingTotal</span>), and it will not activate a root the balance cannot
            cover. Your own claim is a high-water mark, so nobody can claw back what you already took, and one claim
            still collects every epoch that is already in the active root. What the contract cannot promise is your
            personal line surviving into the next epoch: that depends on the proposer carrying your past balance into
            each new root. The manifest hash published with every root exists precisely so that anyone can recompute
            the leaves and catch a root that drops someone.
          </p>
          <p className="text-[11px] text-sp-shade/50">
            The formula still calibrates on live volume - the scoreboard is published every epoch and the payouts
            follow it.
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
          <p className="mt-2 rounded-xl bg-sp-shade/5 px-3 py-2 text-[11px] leading-relaxed text-sp-shade/60">
            <span className="font-extrabold text-sp-ink">One key, five labels.</span> Protocol fee recipient, escrow
            buyback pot, escrow ops target, rewards key holder and vesting beneficiary all read back the same address -{' '}
            <a
              href={`${SPHERE_EXPLORER_URL}/address/${facts.roles.shared}`}
              target="_blank"
              rel="noreferrer"
              className="font-mono font-bold text-sp-brand hover:underline"
            >
              {facts.roles.shared.slice(0, 8)}…{facts.roles.shared.slice(-6)}
            </a>
            , a 1/1 Safe. Different panels label it differently because the contracts name it differently, not because
            there are five independent parties. Those role addresses are immutable, so this cannot quietly change.
          </p>
        )}
      </Card>

      <Card>
        <h2 className="flex items-center gap-1.5 text-[15px] font-extrabold text-sp-ink">
          <FlaskConical className="h-4 w-4 text-sp-brand" aria-hidden="true" /> Rehearsal proven on Sepolia
        </h2>
        <p className="mt-2 text-[12px] leading-relaxed text-sp-shade/60">
          Before mainnet, the exact SPHERE lifecycle ran end-to-end on Base Sepolia with the same contracts: launch, a
          full graduation of the bonding curve and the first buy-and-burn of{' '}
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

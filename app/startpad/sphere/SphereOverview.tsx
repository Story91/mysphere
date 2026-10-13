'use client';

/**
 * OVERVIEW = action hub (decyzja wlasciciela 2026-08-31: "jedna strona
 * z tekstem, reszta z dzialaniem"). Zero akapitow - hero, trzy wielkie
 * tykajace liczby i kafle akcji. Cale objasnienia mieszkaja w /about.
 *
 * Rozszerzenie 2026-09-10 (wymog wlasciciela: "tam musza byc dokladne liczby
 * wszedzie i staty, to jest angazujace"): hub odpowiada liczbami na cztery
 * pytania, ktorych wczesniej nie dalo sie tu zadac - gdzie SPHERE jest w
 * cyklu zycia, ile i CZYM spalono, co robi dystrybutor i kto stoi za piecioma
 * rolami. Kazda liczba idzie z lancucha (useSphereChainFacts), zadna nie jest
 * wpisana recznie.
 *
 * Przeglad wlasciciela 2026-09-10 ("za duzo napisow a za malo fajnych
 * wizualnych spraw, tresc chowaj w dropdownach") - przebudowa PREZENTACJI,
 * zadna liczba nie zmienila zrodla ani znaczenia:
 *  - akapity o mechanice (kustodia LP, dwa wywolania buybacku, czym jest root
 *    epoki, czemu jeden adres ma piec etykiet) siedza w `Disclosure`;
 *  - udzialy, ktore byly zdaniami, sa teraz paskami (`MeterBar`): spalone do
 *    podazy, odebrane do naleznego;
 *  - "pot waiting" i "unsettled fees" awansowaly z wierszy tekstu na kafle.
 * NA WIERZCHU zostaja zastrzezenia, ktore zmieniaja znaczenie liczby obok:
 * ze burn nie odpala sie sam i ze palenie nie rusza totalSupply.
 */

import { useEffect, useState } from 'react';
import { formatEther, type Address } from 'viem';
import { useAccount, usePublicClient } from 'wagmi';
import { ArrowRight, ChevronDown, Coins, Copy, Flame, GraduationCap, Timer, Waves } from 'lucide-react';
import { launchpadAbi } from '../config';
import { SPHERE_CHAIN, SPHERE_EXPLORER_URL, SPHERE_LAUNCHPAD_ADDRESS, SPHERE_NATIVE_SYMBOL, SPHERE_VAULT_ADDRESS } from './sphereChain';
import { formatIn, formatUtc, useSphereChainFacts, type SphereChainFacts } from './SphereShell';
import { AddressPill, BigStat, Disclosure, MeterBar, PageHero, StatShell, StatValue } from './SphereUI';
import {
  SPHERE_ESCROW_ADDRESS,
  SPHERE_LIVE,
  SPHERE_REWARDS_ADDRESS,
  SPHERE_TOKEN_ADDRESS,
} from './sphereConfig';

const FUTURE_TOKEN = '0xB200000000000000000000BA5eDb84c678432476';

/**
 * Kafelek hero. `value === null` znaczy "jeszcze nie wiem" i rysuje szkielet -
 * tak samo jak `BigStat`.
 *
 * Wczesniej typ nie dopuszczal `null`, wiec wywolania podstawialy `?? 0` i
 * strona przez pierwsze sekundy pokazywala TWARDE ZERA: "Burned forever 0",
 * "Week progress 0.0%". To nie jest stan ladowania, tylko pewna, falszywa
 * liczba - a odczyt sezonu potrafi isc kilka sekund, bo skanuje lancuch.
 */
function HeroStat({ icon, label, value, decimals, suffix }: { icon: React.ReactNode; label: string; value: number | null; decimals?: number; suffix?: string }) {
  return (
    <StatShell className="sm:p-4">
      <p className="flex items-center gap-1.5 text-[12px] font-semibold text-sp-shade/60">
        {icon} {label}
      </p>
      <div className="mt-1 font-soft-display font-extrabold text-sp-ink">
        {value === null ? (
          <span className="sph-skeleton inline-block h-6 w-24 align-middle" />
        ) : (
          <StatValue value={value} decimals={decimals ?? 0} suffix={suffix} max={30} />
        )}
      </div>
    </StatShell>
  );
}

/**
 * AddressPill nie nadaje sie do poolId: to bytes32, nie adres, wiec link
 * /address/<poolId> prowadzilby donikad. Ta sama forma wizualnie, bez linku.
 */
function HashPill({ label, hash }: { label: string; hash: string }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-sp-shade/5 px-2.5 py-1 font-mono text-[10.5px] font-bold text-sp-shade/60">
      <span className="font-sans font-extrabold uppercase tracking-[0.06em] text-sp-shade/40">{label}</span>
      <span className="truncate">
        {hash.slice(0, 10)}…{hash.slice(-8)}
      </span>
      <button
        type="button"
        onClick={() => void navigator.clipboard?.writeText(hash)}
        aria-label={`Copy ${label}`}
        className="shrink-0 text-sp-shade/40 transition-colors hover:text-sp-brand"
      >
        <Copy className="h-3 w-3" aria-hidden="true" />
      </button>
    </span>
  );
}

/** Jedna linijka faktu: etykieta z lewej, wartosc z prawej. Czytelna na telefonie. */
function FactRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-sp-shade/[0.07] py-2 first:border-t-0 first:pt-0">
      <span className="text-[11px] font-extrabold uppercase tracking-[0.06em] text-sp-shade/40">{label}</span>
      <span className="text-right text-[11.5px] font-bold text-sp-shade/70">{children}</span>
    </div>
  );
}

function StagePill({ stage }: { stage: string }) {
  const graduated = stage === 'Graduated';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[9.5px] font-extrabold uppercase tracking-[0.08em] ${
        graduated ? 'bg-sp-up-soft text-sp-up' : 'bg-sp-brand/10 text-sp-brand'
      }`}
    >
      {graduated && <GraduationCap className="h-3 w-3" aria-hidden="true" />} {stage}
    </span>
  );
}

const toNum = (v: bigint | null | undefined): number | null => (v === null || v === undefined ? null : Number(formatEther(v)));

/**
 * Minimalne ABI ERC-20 do dwoch odczytow: burn (saldo 0xdEaD) i saldo
 * podlaczonego portfela. Token B20 nie ma wlasnego artefaktu w repo.
 */
const erc20ReadsAbi = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: '', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
] as const;
const DEAD = '0x000000000000000000000000000000000000dEaD' as Address;

/* -------------------------------------------------------------------------- */
/*  SEKCJE STATYSTYK                                                           */
/* -------------------------------------------------------------------------- */

/** Gdzie SPHERE jest TERAZ + co realnie kosztuje wymiana po graduacji. */
function LifecycleSection({ facts }: { facts: SphereChainFacts }) {
  const pool = facts.pool;
  // Koszt wymiany to DWIE oplaty na jednej transakcji: fee puli v4 (uint24
  // w setnych bipa) i fee hooka (bps). Sumujemy tu, bo gosc placi obie naraz
  // i nigdzie indziej nie widzi ich razem.
  const poolPct = pool ? pool.poolFeePpm / 10_000 : null;
  const hookPct = pool ? pool.hookFeeBps / 100 : null;
  return (
    <PageHero
      title="Where SPHERE is right now"
      tagline={
        facts.stage === 'Graduated'
          ? 'The bonding curve is closed for good - trading happens in a Uniswap v4 pool'
          : 'Straight from the launchpad, no interpretation'
      }
      icon={<GraduationCap className="h-6 w-6 text-sp-brand" aria-hidden="true" />}
      badge={<StagePill stage={facts.stage} />}
    >
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3">
        <BigStat label="Pool fee" value={poolPct} decimals={2} suffix="%" hint="paid to liquidity" />
        <BigStat label="Hook fee" value={hookPct} decimals={2} suffix="%" hint="splits protocol / creator / burn" />
        <BigStat
          label="You pay per swap"
          value={poolPct !== null && hookPct !== null ? poolPct + hookPct : null}
          decimals={2}
          suffix="%"
          tone="brand"
          hint="both legs together"
        />
      </div>

      <div className="mt-4 rounded-xl bg-sp-sunken p-3.5">
        <FactRow label="Launched">{facts.startedAt ? formatUtc(facts.startedAt) : '-'}</FactRow>
        {pool && (
          <>
            <FactRow label="Pool id">
              <HashPill label="v4" hash={pool.poolId} />
            </FactRow>
            <FactRow label="LP range">
              full range · ticks {pool.tickLower.toLocaleString('en-US')} → {pool.tickUpper.toLocaleString('en-US')}
            </FactRow>
            <FactRow label="LP liquidity">{pool.liquidity.toString()}</FactRow>
            {/* Kustodia LP nie zmienia znaczenia zadnej liczby wyzej - to opis
                mechanizmu, wiec schodzi pod rozwijak. */}
            <FactRow label="LP custody">locked in the LiquidityVault</FactRow>
          </>
        )}
      </div>
      {pool && (
        <div className="mt-3">
          <Disclosure summary="Why the pool liquidity cannot be pulled">
            The position lives in the LiquidityVault, not in a wallet. The vault can seed the pool and
            harvest fees; it has no function that removes liquidity, and there is no owner, pause or
            upgrade path that could add one. The range is full-range, so the position covers every price.
          </Disclosure>
        </div>
      )}
      {SPHERE_VAULT_ADDRESS && (
        <div className="mt-3 flex flex-wrap gap-2">
          <AddressPill address={SPHERE_VAULT_ADDRESS} label="LP vault" />
        </div>
      )}
    </PageHero>
  );
}

/** Spalone, ROZBITE NA ZRODLA - "ile" bez "skad" nic nie mowi. */
function BurnSection({ facts }: { facts: SphereChainFacts }) {
  const burn = facts.burn;
  const pending = facts.hookPending;
  const share = burn && burn.supply > 0n ? (Number(burn.dead) / Number(burn.supply)) * 100 : null;
  return (
    <PageHero
      title="Burned forever"
      tagline="Every token at 0xdEaD, split by where it came from"
      icon={<Flame className="h-6 w-6 text-sp-down" aria-hidden="true" />}
      badge={
        share !== null ? (
          <span className="rounded-full bg-sp-down/10 px-2.5 py-0.5 text-[9.5px] font-extrabold uppercase tracking-[0.08em] text-sp-down">
            {share.toFixed(2)}% of supply
          </span>
        ) : undefined
      }
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <BigStat label="At 0xdEaD" value={toNum(burn?.dead)} decimals={0} suffix="SPHERE" tone="down" hint="verifiable balance" />
        <BigStat label="Bought & burned" value={toNum(burn?.fromHookBuyback)} decimals={0} suffix="SPHERE" hint="hook swap-fee buyback" />
        <BigStat label="Revenue buyback" value={toNum(burn?.fromRevenueBuyback)} decimals={0} suffix="SPHERE" hint="SphereBuyback burn leg" />
        <BigStat label="Graduation seed" value={toNum(burn?.fromGraduationSeed)} decimals={0} suffix="SPHERE" hint="leftover, never bought" />
      </div>

      {/* Udzial spalonego w podazy jako DLUGOSC. Zastrzezenia, ktore zmieniaja
          znaczenie tych liczb (palenie to przelew na 0xdEaD, burn nie odpala sie
          sam), stoja na wierzchu strony, w hero - nie tutaj, pod rozwijakiem. */}
      {burn && (
        <div className="mt-4 rounded-xl bg-sp-sunken p-3.5">
          <MeterBar
            pct={share}
            tone="down"
            left={`${Number(formatEther(burn.dead)).toLocaleString('en-US', { maximumFractionDigits: 0 })} burned`}
            right={`of ${Number(formatEther(burn.supply)).toLocaleString('en-US', { maximumFractionDigits: 0 })} supply`}
          />
        </div>
      )}

      {pending && (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <BigStat
            label="Pot waiting"
            value={Number(formatEther(pending.buybackEth))}
            decimals={4}
            suffix={SPHERE_NATIVE_SYMBOL}
            tone="brand"
            hint="already booked, not spent"
          />
          {/* Dwie nogi tej samej pozycji - identyczna etykieta na obu czytalaby
              sie jak powtorzona liczba, wiec nazwa niesie walute. */}
          <BigStat
            label={`Unsettled ${SPHERE_NATIVE_SYMBOL}`}
            value={Number(formatEther(pending.eth))}
            decimals={4}
            suffix={SPHERE_NATIVE_SYMBOL}
            hint="fees not booked yet"
          />
          <BigStat
            label="Unsettled SPHERE"
            value={Number(formatEther(pending.token))}
            decimals={2}
            suffix="SPHERE"
            hint="token leg of the same fees"
          />
        </div>
      )}

      <div className="mt-3">
        <Disclosure summary="The two calls that turn swap fees into a burn">
          Swap fees accumulate inside the hook. <span className="font-mono">hook.settle(SPHERE)</span> books
          them and moves the creator-side ETH share into the buyback pot;{' '}
          <span className="font-mono">hook.executeBuyback(...)</span> spends that pot on SPHERE. The
          destination of whatever it buys is frozen at launch to 0xdEaD - there is no function that
          redirects it. Both calls are permissionless and pay the caller nothing, which is exactly why
          the pot can sit unspent: no one is paid to fire it.
        </Disclosure>
      </div>
    </PageHero>
  );
}

/** Dystrybutor: aktywna epoka, co juz wyplacono i co czeka w kolejce. */
function DistributorSection({ facts }: { facts: SphereChainFacts }) {
  const d = facts.distributor;
  if (!d) return null;
  const outstanding = d.totalCumulative > d.totalClaimed ? d.totalCumulative - d.totalClaimed : 0n;
  const claimedPct =
    d.totalCumulative > 0n ? (Number(d.totalClaimed) / Number(d.totalCumulative)) * 100 : null;
  return (
    <PageHero
      title="Creator reward stream"
      tagline="Live figures from the streaming distributor - deployed, funded and paying"
      icon={<Waves className="h-6 w-6 text-sp-brand" aria-hidden="true" />}
      badge={
        <span className="rounded-full bg-sp-up-soft px-2.5 py-0.5 text-[9.5px] font-extrabold uppercase tracking-[0.08em] text-sp-up">
          epoch #{d.epochId} active
        </span>
      }
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <BigStat label="Owed to date" value={toNum(d.totalCumulative)} decimals={2} suffix="SPHERE" tone="brand" hint="cumulative, all epochs" />
        <BigStat label="Claimed" value={toNum(d.totalClaimed)} decimals={2} suffix="SPHERE" tone="up" hint="already paid out" />
        <BigStat label="Still claimable" value={toNum(outstanding)} decimals={2} suffix="SPHERE" hint="earned, not yet taken" />
        <BigStat label="Held by contract" value={toNum(d.held)} decimals={0} suffix="SPHERE" hint="funds future epochs" />
      </div>
      <div className="mt-4 rounded-xl bg-sp-sunken p-3.5">
        <MeterBar
          pct={claimedPct}
          tone="up"
          left={`${Number(formatEther(d.totalClaimed)).toLocaleString('en-US', { maximumFractionDigits: 0 })} claimed`}
          right={`of ${Number(formatEther(d.totalCumulative)).toLocaleString('en-US', { maximumFractionDigits: 0 })} owed`}
        />
        <div className="mt-3">
          <FactRow label="Active root since">{formatUtc(d.activatedAt)}</FactRow>
          <FactRow label="Stream length">{(d.streamDuration / 86_400).toFixed(0)} days per epoch increment</FactRow>
          <FactRow label="Veto window">{(d.minDelay / 3_600).toFixed(0)} h</FactRow>
          {d.pending ? (
            <>
              <FactRow label="Pending root">
                epoch #{d.pending.epochId} ·{' '}
                {Number(formatEther(d.pending.totalCumulative)).toLocaleString('en-US', { maximumFractionDigits: 2 })} SPHERE
                cumulative
              </FactRow>
              <FactRow label="Activates">
                {formatUtc(d.pending.validAt)} · {formatIn(d.pending.validAt)}
              </FactRow>
            </>
          ) : (
            <FactRow label="Pending root">nothing queued right now</FactRow>
          )}
        </div>
      </div>
      <div className="mt-3">
        <Disclosure summary="What an epoch root is, and what the veto window is for">
          Each epoch publishes a Merkle root of cumulative balances. A new root cannot activate sooner
          than the veto window above, which is the time the guardian has to reject it, and the contract
          refuses any root whose global total is lower than the current one or that the balance cannot
          cover. Every epoch increment then releases linearly over the stream length rather than landing
          in one lump.
        </Disclosure>
      </div>
    </PageHero>
  );
}

/**
 * Piec etykiet, jeden adres. Kazdy panel podpisuje ten Safe inaczej
 * ("key holder", "buyback pot", "beneficiary"...), przez co strona czytala
 * sie jak pieciu niezaleznych uczestnikow. To jest wymog przejrzystosci,
 * nie ozdobnik - dlatego role sa ODCZYTANE z kontraktow i porownane, a nie
 * opisane z pamieci.
 */
function SafeSection({ facts }: { facts: SphereChainFacts }) {
  const r = facts.roles;
  const rows = (
    [
      ['Protocol fee recipient', r.feeRecipient],
      ['Buyback pot (escrow)', r.buybackPot],
      ['Ops target (escrow)', r.opsTarget],
      ['Rewards key holder', r.consumer],
      ['Vesting beneficiary', r.beneficiary],
    ] as [string, Address | null][]
  ).filter((row): row is [string, Address] => row[1] !== null);
  // Nieodczytane role = brak sekcji. Lista pieciu "not readable" wygladalaby
  // jak stwierdzenie o protokole, a jest tylko awaria odczytu.
  if (rows.length === 0) return null;
  return (
    <section className="sph-card rounded-card border border-sp-shade/10 bg-sp-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[15px] font-extrabold text-sp-ink">
          {r.allSame ? 'Five role labels, one address' : 'Who holds which role'}
        </h3>
        {r.shared && <AddressPill address={r.shared} label="safe" />}
      </div>
      {/* Jedno zdanie, ktore zmienia znaczenie listy nizej - to jest
          zastrzezenie o centralizacji, wiec nie chowamy go pod rozwijak.
          Uzasadnienie i nieodwracalnosc rol schodza do Disclosure. */}
      <p className="mt-1.5 text-[12px] font-bold leading-relaxed text-sp-shade/60">
        {r.allSame
          ? 'All five resolve to the same 1/1 Safe - one signer, one key.'
          : 'Read live from each contract, not from a config file.'}
      </p>
      <div className="mt-3">
        {rows.map(([label, addr]) => (
          <FactRow key={label} label={label}>
            <a
              href={`${SPHERE_EXPLORER_URL}/address/${addr}`}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-[11px] font-bold text-sp-brand hover:underline"
            >
              {addr.slice(0, 8)}…{addr.slice(-6)}
            </a>
          </FactRow>
        ))}
      </div>
      <div className="mt-3">
        <Disclosure summary="Why one address carries five different labels">
          Each contract names the address for its own job - fee recipient, buyback pot, ops target, key
          holder, beneficiary - so five panels print five words for one party. The addresses above are
          read back live from the contracts rather than from a config file, and those role slots are
          immutable, so this cannot quietly change into five parties later, nor back.
        </Disclosure>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

export default function SphereOverview() {
  const readClient = usePublicClient({ chainId: SPHERE_CHAIN.id });
  const { address: account } = useAccount();
  const [claimables, setClaimables] = useState<{ rewards: bigint; escrow: bigint } | null>(null);
  const [weekProgress, setWeekProgress] = useState<number | null>(null);
  const [burned, setBurned] = useState<bigint | null>(null);
  const [myBalance, setMyBalance] = useState<bigint | null>(null);
  const facts = useSphereChainFacts();
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    const rewardsAddr = SPHERE_REWARDS_ADDRESS;
    const escrowAddr = SPHERE_ESCROW_ADDRESS;
    if (!SPHERE_LIVE || !readClient || !rewardsAddr || !escrowAddr) return;
    let alive = true;
    const load = async () => {
      try {
        const [r, e] = await Promise.all([
          readClient.readContract({ address: SPHERE_LAUNCHPAD_ADDRESS as Address, abi: launchpadAbi, functionName: 'claimable', args: [rewardsAddr] }),
          readClient.readContract({ address: SPHERE_LAUNCHPAD_ADDRESS as Address, abi: launchpadAbi, functionName: 'claimable', args: [escrowAddr] }),
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

  // Zywy burn + saldo uzytkownika. Burn czytamy tu OSOBNO (a nie z faktow),
  // bo hero ma tykac od razu, zanim dojedzie duzy multicall sekcji nizej.
  useEffect(() => {
    const token = SPHERE_TOKEN_ADDRESS;
    if (!readClient || !token) return;
    let alive = true;
    const load = async () => {
      try {
        const [b, mine] = await Promise.all([
          readClient.readContract({ address: token, abi: erc20ReadsAbi, functionName: 'balanceOf', args: [DEAD] }),
          account
            ? readClient.readContract({ address: token, abi: erc20ReadsAbi, functionName: 'balanceOf', args: [account] })
            : Promise.resolve(null),
        ]);
        if (alive) {
          setBurned(b as bigint);
          setMyBalance(mine as bigint | null);
        }
      } catch {
        /* nastepny interwal */
      }
    };
    void load();
    const t = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [readClient, account]);

  useEffect(() => {
    let alive = true;
    fetch('/api/sphere/season')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive && d?.epoch) setWeekProgress(d.epoch.progressBps / 100);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // `null` az do pierwszego udanego odczytu - zero znaczyloby "sprawdzone, nic nie ma".
  const feesWaiting = claimables ? Number(formatEther(claimables.rewards + claimables.escrow)) : null;

  return (
    <div className="grid gap-4">
      {/* HERO ---------------------------------------------------------------- */}
      {/* Decyzja wlasciciela 2026-10-14: "za duzo informacji, ludzie nie wiedza,
          co robic". Hero mowi jedno zdanie, pokazuje trzy liczby i ma jedno
          dzialanie - kup. Statystyki puli, zrodel spalenia, strumienia nagrod i
          rol adresow siedza w rozwijanej sekcji nizej, a kafle z linkami do
          podstron znikly: te sama droge niesie pasek zakladek u gory. */}
      <section className="rounded-card border border-sp-shade/10 bg-sp-surface p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-soft-display text-[28px] font-extrabold leading-[1.1] tracking-[-0.02em] text-sp-ink sm:text-[36px]">
              The launchpad&apos;s own token
            </h2>
            <p className="mt-2 text-[14px] leading-[1.5] text-sp-shade/70">
              Its fees buy it back. Anyone can fire the burn.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {SPHERE_TOKEN_ADDRESS ? (
              <AddressPill address={SPHERE_TOKEN_ADDRESS} label="token" />
            ) : (
              <span className="rounded-full bg-sp-shade/5 px-2.5 py-1 font-mono text-[10.5px] font-bold text-sp-shade/60">
                {FUTURE_TOKEN.slice(0, 10)}…{FUTURE_TOKEN.slice(-8)} · launch soon
              </span>
            )}
            {facts && <StagePill stage={facts.stage} />}
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <HeroStat icon={<Flame className="h-3.5 w-3.5 text-sp-down" aria-hidden="true" />} label="Burned forever" value={burned !== null ? Number(formatEther(burned)) : null} suffix="SPHERE" />
          <HeroStat icon={<Coins className="h-3.5 w-3.5 text-sp-up" aria-hidden="true" />} label="Fees waiting" value={feesWaiting} decimals={4} suffix={SPHERE_NATIVE_SYMBOL} />
          <HeroStat icon={<Timer className="h-3.5 w-3.5 text-sp-shade/60" aria-hidden="true" />} label="Epoch progress" value={weekProgress} decimals={1} suffix="%" />
        </div>

        {/* Dwa zastrzezenia, ktore zmieniaja ZNACZENIE liczb wyzej, wiec nie
            schodza pod rozwijak: burn nie odpala sie sam (ktos placi gaz za
            settle() i executeBuyback()), a palenie to przelew na 0xdEaD, wiec
            totalSupply sie nie rusza. */}
        <p className="mt-4 text-[12.5px] leading-[1.55] text-sp-shade/65">
          The burn is not automatic: someone has to call settle() and then executeBuyback() and pay the
          gas. Burned tokens sit at 0xdEaD, so total supply stays 1B.
        </p>

        {/* KUP / TWOJE SALDO - jedyne CTA, ktorego szuka zwykly gosc. */}
        {SPHERE_TOKEN_ADDRESS && (
          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
            {/* Zwykle <a>, nie next/link: siec Startpada liczy sie RAZ, przy
                ladowaniu config.ts. Miekkie przejscie zignorowaloby ?c= i ktos
                z zapisanym Arc trafialby na token Base podpiety pod Arc - ten
                sam blad, co w tasmie StartpadTicker. */}
            <a
              href={`/startpad/${SPHERE_TOKEN_ADDRESS}?c=${SPHERE_CHAIN.id}`}
              className="inline-flex items-center gap-2 rounded-pill bg-sp-brand px-5 py-2.5 text-[13.5px] font-bold text-sp-on-brand transition-transform [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97]"
            >
              Buy $SPHERE <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </a>
            {myBalance !== null && (
              <span className="text-[13px] font-semibold tabular-nums text-sp-shade/70">
                You hold {Number(formatEther(myBalance)).toLocaleString('en-US', { maximumFractionDigits: 0 })} SPHERE
              </span>
            )}
          </div>
        )}
      </section>

      {/* SZCZEGOLY ----------------------------------------------------------- */}
      {facts && (
        <div>
          <button
            type="button"
            onClick={() => setDetailsOpen((open) => !open)}
            aria-expanded={detailsOpen}
            aria-controls="sphere-details"
            className="flex w-full items-center justify-between gap-3 rounded-card border border-sp-shade/10 bg-sp-surface px-4 py-3.5 text-left transition-colors [transition-duration:var(--dur-press)] hover:bg-sp-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sp-brand"
          >
            <span>
              <span className="block text-[14px] font-semibold text-sp-ink">The numbers behind it</span>
              <span className="block text-[12px] text-sp-shade/60">Pool, burn sources, reward stream, who holds which role</span>
            </span>
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-sp-shade/60 transition-transform [transition-duration:var(--dur-sheet)] ease-drawer ${detailsOpen ? 'rotate-180' : ''}`}
              aria-hidden="true"
            />
          </button>
          <div id="sphere-details" className="board-expand" data-open={detailsOpen}>
            <div>
              <div className="grid gap-4 pt-4">
                <LifecycleSection facts={facts} />
                <BurnSection facts={facts} />
                <DistributorSection facts={facts} />
                <SafeSection facts={facts} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

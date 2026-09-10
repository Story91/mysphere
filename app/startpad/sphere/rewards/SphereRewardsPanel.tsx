'use client';

/**
 * REWARDS VAULT = skarbonka nagrod, w jezyku Overview (redesign 2026-08-31).
 *
 * Zero akapitow: hero z wielkimi liczbami, adresy jako pastylki, karty akcji.
 * Objasnienia mieszkaja na /about.
 *
 * Logika bez zmian: `claimFor` jest permissionless, a `pull` moze wykonac
 * wylacznie CONSUMER - dlatego przycisku pull nie ma, jest tylko nota
 * i konsola ABI.
 *
 * 2026-09-10 - PROSTOWANIE NAZWY I DOWIEZIENIE HISTORII.
 * 1) Panel pisal o CONSUMER "Rewards Safe", jakby nagrodami zarzadzal osobny
 *    multisig. Nie ma takiego. CONSUMER to TEN SAM operacyjny Safe 1/1, ktory
 *    jest jednoczesnie BUYBACK_POT i OPS_TARGET escrow, beneficjentem
 *    vestingu i odbiorca fee launchpada. Etykieta sugerowala podzial rol,
 *    ktorego na lancuchu nie ma.
 * 2) Metadane strony obiecywaly "pull history", a panel pokazywal jedna
 *    liczbe totalPulled i zero historii. Historia jest teraz budowana
 *    z wlasnych logow kontraktu (event Pulled) - to jedyne scisle zrodlo,
 *    bo kontrakt nie trzyma listy poborow w storage.
 * 3) `pull(to, amount)` wysyla ETH pod DOWOLNY adres wskazany przez CONSUMER.
 *    Nic na lancuchu nie wiaze tego z programem nagrod, wiec UI nie moze
 *    tego sugerowac - mowi wprost, ze to decyzja uznaniowa.
 */

import { useEffect, useState } from 'react';
import { usePublicClient } from 'wagmi';
import { formatEther, parseAbiItem, type Address } from 'viem';
import { Coins } from 'lucide-react';
import { launchpadAbi } from '../../config';
import { SPHERE_CHAIN, SPHERE_EXPLORER_URL, SPHERE_LAUNCHPAD_ADDRESS, SPHERE_NATIVE_SYMBOL } from '../sphereChain';
import AbiConsole from '../AbiConsole';
import { SPHERE_LIVE, SPHERE_REWARDS_ADDRESS, sphereRewardsAbi } from '../sphereConfig';
import { ActionButton, StatRow, useSphereCreator, useSphereRead } from '../sphereActions';
import { TeamRunBadge } from '../SphereShell';
import { ActionCard, AddressPill, AdvancedSection, BigStat, KeeperSection, LearnMore, PageHero } from '../SphereUI';
import { SphereRewardsClaimStandalone } from '../season/SphereRewardsClaim';

/** Klasy karty 1:1 z ActionCard - sekcja historii ma wygladac jak reszta huba. */
const CARD = 'sph-card rounded-[20px] border border-sp-shade/10 bg-sp-surface p-4';

/** Wei -> liczba dla NumberTicker; null zostaje null (szkielet ladowania). */
function toNumber(wei: bigint | undefined): number | null {
  return wei === undefined ? null : Number(formatEther(wei));
}

/**
 * Kwota BEZ zaokraglenia, z grupowaniem czesci calkowitej. Kafel z tykajaca
 * liczba jest podgladem, a to jest wartosc do przepisania i porownania
 * z Basescanem - stad pelna precyzja wszedzie, gdzie chodzi o rozliczenie.
 */
function exact(wei: bigint, unit = SPHERE_NATIVE_SYMBOL) {
  const [int, frac] = formatEther(wei).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${frac ? `${grouped}.${frac}` : grouped} ${unit}`;
}

function blockLabel(block: bigint) {
  return block.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** UTC, bo blok ma czas UTC - lokalna strefa ogladajacego zmienialaby date. */
function utcDate(seconds: bigint) {
  return new Date(Number(seconds) * 1000).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
}

/**
 * Blok wdrozenia SphereRewards na Base - podloga skanu logow. Znaleziony
 * binarnym szukaniem po getCode() 2026-09-10 (kontrakt z sphere-base.json,
 * wdrozenie 2026-08-31). Kontrakt jest immutable, wiec liczba nie zestarzeje sie.
 */
const REWARDS_DEPLOY_BLOCK = 50_675_613n;

const PULLED = parseAbiItem('event Pulled(address indexed to, uint256 amount, address indexed caller)');

/**
 * BUDZET SKANU LOGOW Z PRZEGLADARKI.
 *
 * Kontrakt nie trzyma listy poborow - jedynym scislym zrodlem historii sa
 * logi Pulled. Skan idzie WSTECZ od glowy lancucha:
 *  - wstecz, bo przy publicznym RPC (mainnet.base.org tnie eth_getLogs na
 *    2000 blokach - zmierzone 2026-09-10) budzet okien nie zawsze siega
 *    bloku wdrozenia, a to co przeczytamy ma przylegac do "teraz";
 *  - okno startowe 40k, bo wlasny endpoint (CDP) obsluguje ~50k blokow na
 *    zapytanie i wtedy cale zycie kontraktu miesci sie w kilkunastu oknach;
 *  - odmowa przy SZEROKIM oknie to limit zakresu (base.org oddaje 413), wiec
 *    tniemy okno od razu, bez ponawiania - powtorka skonczylaby sie tak samo;
 *  - odmowa przy oknie MINIMALNYM to juz limit zapytan (429), wiec tam
 *    backoff i kolejne podejscie zamiast zwezania.
 *
 * WYJSCIE WCZESNIEJSZE: kontrakt zna `totalPulled`, wiec w chwili, gdy suma
 * znalezionych `Pulled` zrowna sie z ta liczba, historia jest KOMPLETNA
 * i dalszy skan nie moze juz nic dodac. To zamienia skan calego zycia
 * kontraktu w skan do najstarszego poboru.
 */
const SCAN_WINDOWS = 120;
const SCAN_WINDOW_START = 40_000n;
const SCAN_WINDOW_MIN = 2_000n;
const SCAN_THROTTLE_MS = 250;

/**
 * Szerokosc okna, ktora na tym RPC juz przeszla. Trzymana w module, bo
 * schodzenie 40k -> 2000 kosztuje piec odrzuconych zapytan i nie ma powodu
 * placic ich drugi raz przy kazdym wejsciu na strone.
 */
let provenWindow: bigint | null = null;
/** Ile wierszy pokazujemy. Reszte zliczamy - lista ma byc czytelna, nie pelna. */
const MAX_ROWS = 12;

/** Callera nie trzymamy: pull() przechodzi wylacznie CONSUMER, wiec byloby to
 *  za kazdym razem to samo. Interesujacy jest ODBIORCA - ten jest dowolny. */
type PullRow = { block: bigint; hash: string; to: Address; amount: bigint; at: bigint | null };

type PullScan = {
  rows: PullRow[];
  /** Ile poborow w ogole znalazl skan (moze byc wiecej niz wierszy). */
  found: number;
  sum: bigint;
  from: bigint;
  head: bigint;
  /** true = suma zgadza sie z totalPulled albo doszlismy do bloku wdrozenia. */
  complete: boolean;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Cache modulu - skan to kilkadziesiat zapytan RPC, przemontowanie panelu go nie powtarza. */
const pullScanCache = new Map<string, PullScan>();

function usePullHistory(rewards: Address | null) {
  const client = usePublicClient({ chainId: SPHERE_CHAIN.id });
  const [scan, setScan] = useState<PullScan | null>(() => (rewards ? pullScanCache.get(rewards) ?? null : null));

  useEffect(() => {
    if (!client || !rewards) return;
    const cached = pullScanCache.get(rewards);
    if (cached?.complete) {
      setScan(cached);
      return;
    }
    let alive = true;
    void (async () => {
      // Skan ustepuje pierwszenstwa odczytom panelu. Na publicznym RPC (jedno
      // wspolne gardlo dla calej strony) seria getLogs odpalona w tej samej
      // sekundzie co salda potrafi wepchnac je w limit i cala strona pokazuje
      // "Live reads are failing" - a to salda sa tresci, nie historia.
      await sleep(1_500);
      if (!alive) return;
      const [head, totalPulled] = await Promise.all([
        client.getBlockNumber().catch(() => null),
        client
          .readContract({ address: rewards, abi: sphereRewardsAbi, functionName: 'totalPulled' })
          .catch(() => null),
      ]);
      if (!head || !alive) return;
      let to = head;
      let window = provenWindow ?? SCAN_WINDOW_START;
      let used = 0;
      let backoffs = 0;
      const acc: PullScan = { rows: [], found: 0, sum: 0n, from: head, head, complete: false };
      while (alive && to >= REWARDS_DEPLOY_BLOCK && used < SCAN_WINDOWS) {
        const span = to - window + 1n;
        const from = span > REWARDS_DEPLOY_BLOCK ? span : REWARDS_DEPLOY_BLOCK;
        let logs;
        try {
          logs = await client.getLogs({ address: rewards, event: PULLED, fromBlock: from, toBlock: to });
        } catch {
          if (window > SCAN_WINDOW_MIN) {
            const half = window / 2n;
            window = half > SCAN_WINDOW_MIN ? half : SCAN_WINDOW_MIN;
            continue;
          }
          backoffs += 1;
          if (backoffs > 4) break; // nawet minimalne okno nie przechodzi - konczymy z tym, co mamy
          await sleep(500 * backoffs);
          continue;
        }
        backoffs = 0;
        provenWindow = window;
        used += 1;
        // W obrebie okna logi ida rosnaco, a caly skan idzie wstecz - odwracamy,
        // zeby lista byla globalnie od najnowszego.
        for (const log of [...logs].reverse()) {
          acc.found += 1;
          acc.sum += log.args.amount ?? 0n;
          if (acc.rows.length < MAX_ROWS) {
            acc.rows.push({
              block: log.blockNumber ?? 0n,
              hash: log.transactionHash ?? '',
              to: (log.args.to ?? '0x') as Address,
              amount: log.args.amount ?? 0n,
              at: null,
            });
          }
        }
        acc.from = from;
        // Suma zrownana z totalPulled = historia kompletna, dalej nic nie ma.
        acc.complete = from <= REWARDS_DEPLOY_BLOCK || (totalPulled !== null && acc.sum >= (totalPulled as bigint));
        if (alive) setScan({ ...acc, rows: [...acc.rows] });
        if (acc.complete) break;
        to = from - 1n;
        await sleep(SCAN_THROTTLE_MS);
      }
      // Daty dociagamy dopiero na koniec i tylko dla pokazanych wierszy -
      // getBlock per log w trakcie skanu podwoilby liczbe zapytan.
      for (const row of acc.rows) {
        if (!alive) return;
        const block = await client.getBlock({ blockNumber: row.block }).catch(() => null);
        if (block) row.at = block.timestamp;
      }
      if (alive) setScan({ ...acc, rows: [...acc.rows] });
      pullScanCache.set(rewards, { ...acc, rows: [...acc.rows] });
    })();
    return () => {
      alive = false;
    };
  }, [client, rewards]);

  return scan;
}

export default function SphereRewardsPanel() {
  const isCreator = useSphereCreator();
  const rewards = SPHERE_REWARDS_ADDRESS;
  const scan = usePullHistory(rewards);

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

  /** Ile ETH w ogole dotarlo do skarbonki: to, co lezy + to, co juz wyszlo. */
  const lifetime = state ? state.pullable + state.totalPulled : null;
  const scanRange = scan
    ? scan.complete
      ? `complete - every Pulled log is accounted for (sum matches totalPulled), scanned down to block ${blockLabel(scan.from)}`
      : `partial - Pulled logs from block ${blockLabel(scan.from)} to ${blockLabel(scan.head)}, older pulls not scanned yet`
    : 'reading Pulled logs…';

  return (
    <div className="sph-stagger grid gap-4">
      <PageHero
        title="Rewards vault"
        tagline="Where creator-reward fees accumulate"
        icon={<Coins className="h-6 w-6 text-sp-brand" aria-hidden="true" />}
        badge={<TeamRunBadge />}
      >
        <div className="grid gap-3 sm:grid-cols-4">
          <BigStat label="In the vault" value={toNumber(state?.pullable)} decimals={4} suffix={SPHERE_NATIVE_SYMBOL} tone="brand" />
          <BigStat label="Waiting on curve" value={toNumber(state?.padClaimable)} decimals={4} suffix={SPHERE_NATIVE_SYMBOL} tone="up" />
          <BigStat label="Pulled so far" value={toNumber(state?.totalPulled)} decimals={4} suffix={SPHERE_NATIVE_SYMBOL} hint="lifetime, from totalPulled" />
          <BigStat
            label="Reached the vault"
            value={toNumber(lifetime ?? undefined)}
            decimals={4}
            suffix={SPHERE_NATIVE_SYMBOL}
            hint="balance + pulled"
          />
        </div>
      </PageHero>

      {/* Nagrody TWORCOW w SPHERE (dystrybutor) - tu, bo "Rewards" to pierwsze
          miejsce, w ktore ktos zajrzy po swoja nagrode; skarbonka ETH nizej. */}
      <SphereRewardsClaimStandalone />

      <div className="flex flex-wrap items-center gap-2">
        <AddressPill address={rewards} label="vault" />
        {/* CONSUMER, a nie "key holder"/"Rewards Safe" - nazwa z kontraktu
            zamiast wymyslonej instytucji. */}
        {state && <AddressPill address={state.consumer} label="CONSUMER" />}
      </div>

      {/* HISTORIA POBOROW - obiecana w metadanych strony, teraz realna ------- */}
      <div className={CARD}>
        <p className="text-[13.5px] font-extrabold text-sp-ink">Pull history</p>
        <p className="mt-1 text-[11px] font-bold leading-relaxed text-sp-shade/50">
          Built from the vault&apos;s own <span className="font-mono">Pulled</span> events on Base. Only{' '}
          <span className="font-mono">CONSUMER</span> can call <span className="font-mono">pull(to, amount)</span>, and it
          sends ETH to <strong className="text-sp-ink">any address it names</strong> - nothing on chain ties a pull to a
          rewards programme, so treat every destination below as a discretionary Safe decision.
        </p>
        <p className="mt-2 text-[11px] font-bold leading-relaxed text-sp-shade/50">
          <span className="font-mono">CONSUMER</span> is not a separate rewards multisig: it is the same 1/1 operational
          Safe that also serves as the escrow&apos;s <span className="font-mono">BUYBACK_POT</span> and{' '}
          <span className="font-mono">OPS_TARGET</span>, the vesting <span className="font-mono">BENEFICIARY</span> and the
          launchpad fee recipient.
        </p>

        {scan === null && <p className="mt-3 text-[11px] font-bold text-sp-shade/45">Reading Pulled logs from Base…</p>}
        {scan !== null && scan.rows.length === 0 && (
          <p className="mt-3 text-[11px] font-bold text-sp-shade/45">
            No pulls in the scanned range. Lifetime total is {state ? exact(state.totalPulled) : '…'}.
          </p>
        )}
        {scan !== null && scan.rows.length > 0 && (
          <div className="mt-3 grid gap-2">
            {scan.rows.map((row) => (
              <div
                key={`${row.block}-${row.hash}-${row.amount}`}
                className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-xl bg-sp-shade/5 px-3 py-2"
              >
                <span className="text-[11px] font-extrabold text-sp-ink">
                  {row.at ? utcDate(row.at) : `block ${blockLabel(row.block)}`}
                </span>
                <span className="font-mono text-[12px] font-extrabold text-sp-brand">{exact(row.amount)}</span>
                <span className="w-full font-mono text-[10.5px] font-bold text-sp-shade/50">
                  to {row.to.slice(0, 10)}…{row.to.slice(-6)}
                  {row.hash && (
                    <>
                      {' · '}
                      <a
                        href={`${SPHERE_EXPLORER_URL}/tx/${row.hash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="underline transition-colors hover:text-sp-brand"
                      >
                        tx
                      </a>
                    </>
                  )}
                </span>
              </div>
            ))}
            {scan.found > scan.rows.length && (
              <p className="text-[10.5px] font-bold text-sp-shade/45">
                Showing the {scan.rows.length} most recent of {scan.found} pulls found - the list is capped on purpose.
              </p>
            )}
          </div>
        )}

        <div className="mt-3">
          <StatRow label="ETH in the vault right now" value={state ? exact(state.pullable) : '…'} />
          <StatRow label="Pulled over the vault's lifetime" value={state ? exact(state.totalPulled) : '…'} />
          <StatRow label="Reached the vault in total" value={lifetime === null ? '…' : exact(lifetime)} />
          <StatRow label="Still claimable on the curve" value={state ? exact(state.padClaimable) : '…'} />
          <StatRow label="Pulls found by the scan" value={scan ? String(scan.found) : '…'} />
          <StatRow label="Sum of the scanned pulls" value={scan ? exact(scan.sum) : '…'} />
          <StatRow label="Who may pull" value={state ? `CONSUMER ${state.consumer.slice(0, 10)}…${state.consumer.slice(-6)}` : '…'} />
          <StatRow label="Where a pull may go" value="any address CONSUMER passes to pull()" />
        </div>
        <p className="mt-2 text-[10px] font-bold text-sp-shade/40">{scanRange}</p>
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
        {/* Karta CONSUMER-only istnieje wylacznie dla tworcy - gosc nie
            dostaje wzmianki o narzedziu, ktorego nie moze uzyc. */}
        {isCreator && (
          <ActionCard
            title="Pull out of the vault"
            badge={<TeamRunBadge />}
            hint="Sends ETH from the vault to any address you name. Discretionary - no contract rule points it at a rewards programme."
            disabledNote="CONSUMER key only - the same operational Safe as everywhere else; execute it from the console below."
          />
        )}
      </div>
      </KeeperSection>

      <AdvancedSection>
        <AbiConsole title="SphereRewards" address={rewards} abi={sphereRewardsAbi} />
      </AdvancedSection>

      <LearnMore>How rewards funding works</LearnMore>
    </div>
  );
}

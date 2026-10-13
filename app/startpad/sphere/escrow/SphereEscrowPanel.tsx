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
 *
 * 2026-09-10 - PROSTOWANIE OPISU SPLITU I KOMPLET LICZB.
 * Panel mowil, ze release() dzieli ETH "miedzy dwa zamrozone kierunki", a
 * pasek "Buyback pot 50% / Ops 50%" z pieczatka "Enforced" czytal sie tak,
 * jakby polowa strumienia tworcy byla kontraktowo zaklepana na buyback.
 * Na lancuchu BUYBACK_POT i OPS_TARGET to TEN SAM adres (Safe 1/1), wiec
 * cale ETH ladowalo na jednym koncie. Prawda ma dwie polowy i obie musza
 * padnac: PROPORCJA jest zamrozona w konstruktorze, a KIERUNKI sa dzis
 * jednym adresem. Rownosc wykrywamy w locie z odczytanych adresow - gdyby
 * kiedys byly rozne, panel powie to sam, bez zmiany kodu.
 * Do tego komplet liczb (prosba wlasciciela: "dokladne liczby wszedzie"):
 * co jeszcze wisi na krzywej/hooku/vaulcie, co juz wyszlo z escrow (logi
 * EthReleased) i ile SPHERE dotarlo do vestingu (vesting.totalReceived).
 */

import { useEffect, useState } from 'react';
import { usePublicClient } from 'wagmi';
import { erc20Abi, formatEther, parseAbiItem, zeroAddress, type Address } from 'viem';
import { Landmark } from 'lucide-react';
import { hookAbi, launchpadAbi, liquidityVaultAbi } from '../../config';
// Adresy i waluta przybite do Base - uzasadnienie w ../sphereChain.ts.
import {
  SPHERE_CHAIN,
  SPHERE_HOOK_ADDRESS,
  SPHERE_LAUNCHPAD_ADDRESS,
  SPHERE_NATIVE_SYMBOL,
  SPHERE_VAULT_ADDRESS,
} from '../sphereChain';
import AbiConsole from '../AbiConsole';
import {
  SPHERE_ESCROW_ADDRESS,
  SPHERE_LIVE,
  SPHERE_PLAN,
  sphereCreatorEscrowAbi,
  sphereTokenVestingAbi,
} from '../sphereConfig';
import { ActionButton, StatRow, useSphereRead } from '../sphereActions';
import { EnforcedBadge } from '../SphereShell';
import { ActionCard, AddressPill, AdvancedSection, BigStat, KeeperSection, LearnMore, PageHero } from '../SphereUI';

const HERO_ICON = <Landmark className="h-6 w-6 text-sp-brand" aria-hidden="true" />;
const TAGLINE = "SPHERE's creator stream - immutable routing";
/** Klasy karty 1:1 z ActionCard - sekcje statystyk maja wygladac jak reszta huba. */
const CARD = 'sph-card rounded-card border border-sp-shade/10 bg-sp-surface p-4';

/**
 * Krotka liczba ETH do podpisu kafla - liczby > slowa. Drobne, ale REALNE
 * kwoty (pierwsze fee z krzywej to dziesieciotysieczne czesci ETH) nie moga
 * wyswietlac sie jako 0.0000 przy aktywnym przycisku - stad 6 miejsc, gdy
 * wartosc jest niezerowa a mniejsza niz 0.0001.
 */
function eth(value: bigint) {
  const n = Number(formatEther(value));
  const digits = n > 0 && n < 0.0001 ? 6 : 4;
  return `${n.toFixed(digits)} ${SPHERE_NATIVE_SYMBOL}`;
}

/**
 * Kwota BEZ zaokraglenia, z grupowaniem czesci calkowitej. Kafel z tykajaca
 * liczba jest podgladem (4 miejsca), a to jest wartosc do przepisania i
 * porownania z Basescanem - wlasciciel prosil o dokladne liczby, wiec ucinamy
 * dopiero tam, gdzie uciecia dokonal sam lancuch. Grupowanie regexem, a nie
 * przez Number(), zeby duze salda SPHERE nie przeszly przez float.
 */
function exact(wei: bigint, unit: string) {
  const [int, frac] = formatEther(wei).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${frac ? `${grouped}.${frac}` : grouped} ${unit}`;
}

/** Numer bloku z grupowaniem - w podpisie zasiegu skanu czyta sie inaczej niz ciag cyfr. */
function blockLabel(block: bigint) {
  return block.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Blok wdrozenia escrow na Base - podloga skanu logow. Znaleziony binarnym
 * szukaniem po getCode() 2026-09-10 (kontrakt z sphere-base.json, wdrozenie
 * 2026-08-31). Kontrakt jest immutable, wiec ta liczba sie nie zestarzeje.
 */
const ESCROW_DEPLOY_BLOCK = 50_675_617n;

const ETH_RELEASED = parseAbiItem(
  'event EthReleased(uint256 toPot, uint256 toOps, address indexed caller)'
);

/**
 * BUDZET SKANU LOGOW Z PRZEGLADARKI.
 *
 * Escrow nie trzyma sumy wyplat w storage - jedynym scislym zrodlem "ile juz
 * wyszlo" sa logi EthReleased. Skan idzie WSTECZ od glowy lancucha:
 *  - wstecz, bo przy publicznym RPC (mainnet.base.org tnie eth_getLogs na
 *    2000 blokach - zmierzone 2026-09-10) budzet okien nie wystarcza na cale
 *    zycie kontraktu, a to co zdazymy przeczytac ma przylegac do "teraz";
 *  - okno startowe 40k, bo wlasny endpoint (CDP, NEXT_PUBLIC_BASE_RPC_URL)
 *    obsluguje ~50k blokow na zapytanie i wtedy cale zycie escrow miesci sie
 *    w kilkunastu oknach - skan konczy sie kompletem;
 *  - odmowa przy SZEROKIM oknie to limit zakresu (base.org oddaje 413), wiec
 *    tniemy okno od razu, bez ponawiania - powtorka skonczylaby sie tak samo;
 *  - odmowa przy oknie MINIMALNYM to juz limit zapytan (429), wiec tam
 *    backoff i kolejne podejscie zamiast zwezania.
 * Gdy budzet sie skonczy przed blokiem wdrozenia, wynik JEST czesciowy i UI
 * podaje, od ktorego bloku liczy - liczba bez zasiegu bylaby klamstwem.
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

type ReleaseScan = {
  toPot: bigint;
  toOps: bigint;
  releases: number;
  /** Najstarszy przeskanowany blok - dolna granica zasiegu liczby. */
  from: bigint;
  head: bigint;
  /** true = doszlismy do bloku wdrozenia, wiec suma jest suma ZYCIA kontraktu. */
  complete: boolean;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Cache na poziomie modulu: skan to kilkadziesiat zapytan RPC, a wejscie
 * w "Advanced" czy przemontowanie panelu nie moze go powtarzac. Klucz to
 * adres escrow, wiec zmiana konfiguracji (env) unewaznia wpis sama.
 */
const releaseScanCache = new Map<string, ReleaseScan>();

function useReleaseScan(escrow: Address | null) {
  const client = usePublicClient({ chainId: SPHERE_CHAIN.id });
  const [scan, setScan] = useState<ReleaseScan | null>(() =>
    escrow ? releaseScanCache.get(escrow) ?? null : null
  );

  useEffect(() => {
    if (!client || !escrow) return;
    const cached = releaseScanCache.get(escrow);
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
      const head = await client.getBlockNumber().catch(() => null);
      if (!head || !alive) return;
      let to = head;
      let window = provenWindow ?? SCAN_WINDOW_START;
      let used = 0;
      let backoffs = 0;
      const acc: ReleaseScan = { toPot: 0n, toOps: 0n, releases: 0, from: head, head, complete: false };
      while (alive && to >= ESCROW_DEPLOY_BLOCK && used < SCAN_WINDOWS) {
        const span = to - window + 1n;
        const from = span > ESCROW_DEPLOY_BLOCK ? span : ESCROW_DEPLOY_BLOCK;
        let logs;
        try {
          logs = await client.getLogs({ address: escrow, event: ETH_RELEASED, fromBlock: from, toBlock: to });
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
        for (const log of logs) {
          acc.toPot += log.args.toPot ?? 0n;
          acc.toOps += log.args.toOps ?? 0n;
          acc.releases += 1;
        }
        acc.from = from;
        acc.complete = from <= ESCROW_DEPLOY_BLOCK;
        // Publikujemy po KAZDYM oknie: na publicznym RPC pelny skan trwa
        // dziesiatki sekund, a czekanie na koniec dalo by pusty kafel przez
        // caly ten czas. Zasieg rosnie na oczach patrzacego.
        if (alive) setScan({ ...acc });
        if (acc.complete) break;
        to = from - 1n;
        await sleep(SCAN_THROTTLE_MS);
      }
      releaseScanCache.set(escrow, { ...acc });
    })();
    return () => {
      alive = false;
    };
  }, [client, escrow]);

  return scan;
}

export default function SphereEscrowPanel() {
  const escrow = SPHERE_ESCROW_ADDRESS;
  const scan = useReleaseScan(escrow);

  const state = useSphereRead(async (client) => {
    if (!escrow) return null;
    const [launched, token, balance, padClaimable, hookClaimable, vaultClaimable] = await Promise.all([
      client.readContract({ address: escrow, abi: sphereCreatorEscrowAbi, functionName: 'launched' }),
      client.readContract({ address: escrow, abi: sphereCreatorEscrowAbi, functionName: 'sphereToken' }).catch(() => zeroAddress),
      client.getBalance({ address: escrow }),
      client.readContract({ address: SPHERE_LAUNCHPAD_ADDRESS as Address, abi: launchpadAbi, functionName: 'claimable', args: [escrow] }),
      client.readContract({ address: SPHERE_HOOK_ADDRESS as Address, abi: hookAbi, functionName: 'claimableEth', args: [escrow] }),
      client.readContract({ address: SPHERE_VAULT_ADDRESS as Address, abi: liquidityVaultAbi, functionName: 'claimableEth', args: [escrow] }),
    ]);
    // Kierunki i split: stale immutable z konstruktora - do pastylek i paska.
    // Kazdy odczyt ma fallback, zeby nie zablokowac calego panelu.
    const [buybackPot, opsTarget, tokenTarget, ethPotBps, feeBps, creatorFeeBps, buybackBps, windowCap] =
      await Promise.all([
        client.readContract({ address: escrow, abi: sphereCreatorEscrowAbi, functionName: 'BUYBACK_POT' }).catch(() => zeroAddress),
        client.readContract({ address: escrow, abi: sphereCreatorEscrowAbi, functionName: 'OPS_TARGET' }).catch(() => zeroAddress),
        client.readContract({ address: escrow, abi: sphereCreatorEscrowAbi, functionName: 'TOKEN_TARGET' }).catch(() => zeroAddress),
        client.readContract({ address: escrow, abi: sphereCreatorEscrowAbi, functionName: 'ETH_POT_BPS' }).catch(() => SPHERE_PLAN.ethPotBps),
        client.readContract({ address: escrow, abi: sphereCreatorEscrowAbi, functionName: 'FEE_BPS' }).catch(() => SPHERE_PLAN.feeBps),
        client.readContract({ address: escrow, abi: sphereCreatorEscrowAbi, functionName: 'CREATOR_FEE_BPS' }).catch(() => SPHERE_PLAN.creatorFeeBps),
        client.readContract({ address: escrow, abi: sphereCreatorEscrowAbi, functionName: 'BUYBACK_BPS' }).catch(() => SPHERE_PLAN.buybackBps),
        client.readContract({ address: escrow, abi: sphereCreatorEscrowAbi, functionName: 'WINDOW_CAP' }).catch(() => 0n),
      ]);
    // Saldo tokena ma sens dopiero po launchu - wczesniej sphereToken() = 0x0.
    const tokenAddress = token as Address;
    const vesting = tokenTarget as Address;
    const [tokenBalance, vestingReceived] = await Promise.all([
      tokenAddress === zeroAddress
        ? Promise.resolve(0n)
        : client
            .readContract({ address: tokenAddress, abi: erc20Abi, functionName: 'balanceOf', args: [escrow] })
            .catch(() => 0n),
      // Ile SPHERE juz wyszlo z escrow do vestingu. Vesting liczy to sam
      // (saldo + wyplacone), wiec zamiast skanowac logi TokenReleased mamy
      // liczbe ZYCIA kontraktu jednym odczytem - i to bez zasiegu do
      // dopisania. Vesting nie ma innego zrodla wplywu niz releaseToken().
      tokenAddress === zeroAddress || vesting === zeroAddress
        ? Promise.resolve(0n)
        : client
            .readContract({ address: vesting, abi: sphereTokenVestingAbi, functionName: 'totalReceived', args: [tokenAddress] })
            .catch(() => 0n),
    ]);
    return {
      launched: launched as boolean,
      token: tokenAddress,
      balance,
      tokenBalance,
      vestingReceived: vestingReceived as bigint,
      padClaimable: padClaimable as bigint,
      hookClaimable: hookClaimable as bigint,
      vaultClaimable: vaultClaimable as bigint,
      buybackPot: buybackPot as Address,
      opsTarget: opsTarget as Address,
      tokenTarget: vesting,
      ethPotBps: Number(ethPotBps),
      feeBps: Number(feeBps),
      creatorFeeBps: Number(creatorFeeBps),
      buybackBps: Number(buybackBps),
      windowCap: windowCap as bigint,
    };
  });

  if (!SPHERE_LIVE || !escrow) {
    return (
      <div className="sph-stagger grid gap-4">
        <PageHero title="Creator escrow" tagline={TAGLINE} badge={<EnforcedBadge />} icon={HERO_ICON}>
          <div className="grid gap-3 sm:grid-cols-3">
            <BigStat label={`${SPHERE_NATIVE_SYMBOL} in escrow`} value={null} />
            <BigStat label="SPHERE in escrow" value={null} />
            <BigStat label="Claimable now" value={null} />
          </div>
        </PageHero>
        <p className="sph-card rounded-card border border-sp-shade/10 bg-sp-surface p-4 text-[11.5px] font-bold text-sp-shade/50">
          Not deployed yet - actions unlock the moment the escrow address lands in config.
        </p>
        <LearnMore>How the escrow routing works</LearnMore>
      </div>
    );
  }

  const potPct = (state ? state.ethPotBps : SPHERE_PLAN.ethPotBps) / 100;
  /**
   * Czy oba kierunki release() to jeden adres. Porownanie NA ZYWO z tego, co
   * kontrakt sam o sobie mowi - nie hardkod - zeby panel przestal mowic
   * "jeden adres" w sekundzie, w ktorej przestanie to byc prawda.
   */
  const oneTarget = Boolean(
    state &&
      state.buybackPot !== zeroAddress &&
      state.buybackPot.toLowerCase() === state.opsTarget.toLowerCase()
  );
  const claimableTotal = state ? state.padClaimable + state.hookClaimable + state.vaultClaimable : null;
  const releasedTotal = scan ? scan.toPot + scan.toOps : null;
  /** Podpis zasiegu skanu - kazda liczba z logow musi go niesc razem ze soba. */
  const scanRange = scan
    ? scan.complete
      ? `lifetime - EthReleased logs from deploy block ${blockLabel(ESCROW_DEPLOY_BLOCK)} to ${blockLabel(scan.head)}`
      : `partial - EthReleased logs from block ${blockLabel(scan.from)} to ${blockLabel(scan.head)}, older releases not scanned yet`
    : 'reading EthReleased logs…';

  return (
    <div className="sph-stagger grid gap-4">
      {/* HERO ---------------------------------------------------------------- */}
      <PageHero title="Creator escrow" tagline={TAGLINE} badge={<EnforcedBadge />} icon={HERO_ICON}>
        <div className="grid gap-3 sm:grid-cols-3">
          <BigStat
            label={`${SPHERE_NATIVE_SYMBOL} in escrow`}
            value={state ? Number(formatEther(state.balance)) : null}
            decimals={4}
            suffix={SPHERE_NATIVE_SYMBOL}
            tone="brand"
          />
          <BigStat
            label="SPHERE in escrow"
            value={state ? Number(formatEther(state.tokenBalance)) : null}
            decimals={0}
            suffix="SPHERE"
            hint={state && !state.launched ? 'after launch' : 'waiting for releaseToken'}
          />
          <BigStat
            label="Claimable now"
            value={claimableTotal === null ? null : Number(formatEther(claimableTotal))}
            decimals={claimableTotal !== null && claimableTotal > 0n && claimableTotal < 100000000000000n ? 6 : 4}
            suffix={SPHERE_NATIVE_SYMBOL}
            tone="up"
            hint="curve + hook + LP vault"
          />
        </div>
      </PageHero>

      {/* KIERUNKI - zamrozone w konstruktorze --------------------------------- */}
      <div className="flex flex-wrap items-center gap-2">
        <AddressPill address={escrow} label="Escrow" />
        {/* Jedna pastylka, gdy adres jest jeden. Dwie osobne sugerowaly dwie
            instytucje - a na lancuchu jest jedno konto. */}
        {state && oneTarget && <AddressPill address={state.buybackPot} label="Buyback pot = Ops" />}
        {state && !oneTarget && state.buybackPot !== zeroAddress && (
          <AddressPill address={state.buybackPot} label="Buyback pot" />
        )}
        {state && !oneTarget && state.opsTarget !== zeroAddress && <AddressPill address={state.opsTarget} label="Ops" />}
        {state && state.tokenTarget !== zeroAddress && <AddressPill address={state.tokenTarget} label="Vesting" />}
      </div>

      {/* CO PRZEPLYNELO PRZEZ ESCROW ------------------------------------------ */}
      <div className={CARD}>
        <p className="text-[13.5px] font-extrabold text-sp-ink">What has flowed through the escrow</p>
        <p className="mt-1 text-[11px] font-bold leading-relaxed text-sp-shade/50">
          Everything below is read from Base at load time. Claimable balances and token totals are single contract
          calls; released ETH is summed from the escrow&apos;s own <span className="font-mono">EthReleased</span> logs.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <BigStat
            label={`${SPHERE_NATIVE_SYMBOL} released`}
            value={releasedTotal === null ? null : Number(formatEther(releasedTotal))}
            decimals={4}
            suffix={SPHERE_NATIVE_SYMBOL}
            tone="brand"
            hint={scan ? (scan.complete ? 'lifetime' : `since block ${blockLabel(scan.from)}`) : undefined}
          />
          <BigStat
            label="Release calls"
            value={scan ? scan.releases : null}
            decimals={0}
            hint={scan ? (scan.complete ? 'lifetime' : 'in the scanned range') : undefined}
          />
          <BigStat
            label="SPHERE delivered to vesting"
            value={state ? Number(formatEther(state.vestingReceived)) : null}
            decimals={0}
            suffix="SPHERE"
            hint="lifetime, from the vesting contract"
          />
        </div>
        <div className="mt-3">
          <StatRow label="Claimable on the curve" value={state ? exact(state.padClaimable, SPHERE_NATIVE_SYMBOL) : '…'} />
          <StatRow label="Claimable on the pool hook" value={state ? exact(state.hookClaimable, SPHERE_NATIVE_SYMBOL) : '…'} />
          <StatRow label="Claimable on the LP vault" value={state ? exact(state.vaultClaimable, SPHERE_NATIVE_SYMBOL) : '…'} />
          <StatRow label={`${SPHERE_NATIVE_SYMBOL} sitting in the escrow`} value={state ? exact(state.balance, SPHERE_NATIVE_SYMBOL) : '…'} />
          <StatRow label="SPHERE waiting for releaseToken" value={state ? exact(state.tokenBalance, 'SPHERE') : '…'} />
          {/* Bez tego wiersza dwie linijki ponizej dalej czytalyby sie jak dwa
              osobne konta - a to sa dwie POZYCJE tego samego przelewu. */}
          <StatRow
            label="Release destinations"
            value={
              state
                ? oneTarget
                  ? 'BUYBACK_POT = OPS_TARGET - one address'
                  : 'BUYBACK_POT and OPS_TARGET - two addresses'
                : '…'
            }
          />
          <StatRow
            label={`Released to the buyback share (${potPct}%)`}
            value={scan ? exact(scan.toPot, SPHERE_NATIVE_SYMBOL) : '…'}
          />
          <StatRow
            label={`Released to the ops share (${100 - potPct}%)`}
            value={scan ? exact(scan.toOps, SPHERE_NATIVE_SYMBOL) : '…'}
          />
          <StatRow label="SPHERE received by the vesting contract" value={state ? exact(state.vestingReceived, 'SPHERE') : '…'} />
          <StatRow label="Fee / creator fee / buyback" value={state ? `${state.feeBps} / ${state.creatorFeeBps} / ${state.buybackBps} bps` : '…'} />
          <StatRow label="Launch window cap per address" value={state ? exact(state.windowCap, 'SPHERE') : '…'} />
        </div>
        <p className="mt-2 text-[10px] font-bold text-sp-shade/40">{scanRange}</p>
      </div>

      {/* AKCJE - dla gosci zwiniete pod KeeperSection, tworca widzi od razu */}
      <KeeperSection>
      <div className="grid gap-3 sm:grid-cols-2">
        <ActionCard
          title="Deliver curve fees"
          hint={state ? `${eth(state.padClaimable)} waiting - anyone can pay the gas` : 'Reading the curve'}
        >
          <ActionButton
            label="Deliver curve fees"
            address={SPHERE_LAUNCHPAD_ADDRESS as Address}
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
            address={SPHERE_HOOK_ADDRESS as Address}
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
            address={SPHERE_VAULT_ADDRESS as Address}
            abi={liquidityVaultAbi}
            functionName="claimEthFor"
            args={[escrow]}
            disabled={!state || state.vaultClaimable === 0n}
          />
        </ActionCard>

        <ActionCard
          title="Release ETH"
          badge={<EnforcedBadge />}
          hint={
            state
              ? oneTarget
                ? `${eth(state.balance)} splits ${potPct}/${100 - potPct} - and both shares land on the same address`
                : `${eth(state.balance)} splits between two frozen destinations`
              : 'Reading the balance'
          }
        >
          {/* Split zamiast zdania: pasek dwuczesciowy wg ETH_POT_BPS. Pieczatka
              "Enforced" dotyczy PROPORCJI - to ona jest zamrozona w
              konstruktorze. Kierunki sa osobna sprawa i mowi o nich podpis
              pod paskiem, bo sam pasek czytal sie jak obietnica, ze polowa
              strumienia jest zaklepana na buyback. */}
          <div className="w-full">
            <div className="flex items-center justify-between text-[9.5px] font-extrabold uppercase tracking-[0.06em]">
              <span className="text-sp-brand">Buyback share {potPct}%</span>
              <span className="text-sp-shade/45">Ops share {100 - potPct}%</span>
            </div>
            <div className="mt-1.5 flex h-2 overflow-hidden rounded-full bg-sp-shade/10">
              <span className="sph-progress block bg-sp-brand" style={{ width: `${potPct}%` }} aria-hidden="true" />
              <span className="block flex-1 bg-sp-shade/25" aria-hidden="true" />
            </div>
            <p className="mt-1.5 text-[10.5px] font-bold leading-relaxed text-sp-shade/50">
              {state && oneTarget ? (
                <>
                  The {potPct}/{100 - potPct} ratio is frozen in the constructor and nobody can change it. The two
                  destinations, however, are currently <strong className="text-sp-ink">one and the same address</strong> -{' '}
                  <span className="font-mono">
                    {state.buybackPot.slice(0, 6)}…{state.buybackPot.slice(-4)}
                  </span>{' '}
                  is both <span className="font-mono">BUYBACK_POT</span> and <span className="font-mono">OPS_TARGET</span>.
                  So the split is real accounting, not two separate on-chain pots: all released ETH arrives at one
                  address the Safe controls, and what happens next is a Safe decision, not a contract rule.
                </>
              ) : state ? (
                <>
                  The {potPct}/{100 - potPct} ratio is frozen in the constructor, and{' '}
                  <span className="font-mono">BUYBACK_POT</span> and <span className="font-mono">OPS_TARGET</span> are two
                  distinct addresses, so each share really does land somewhere else.
                </>
              ) : (
                'Reading BUYBACK_POT and OPS_TARGET…'
              )}
            </p>
          </div>
          <ActionButton
            label="Release ETH"
            address={escrow}
            abi={sphereCreatorEscrowAbi}
            functionName="release"
            disabled={!state || state.balance === 0n}
          />
        </ActionCard>

        {/* Akcja tokenowa dopiero po launchu - wczesniej sphereToken() = 0x0.
            Przy zerowym saldzie przycisk GASNIE zamiast konczyc sie rewertem
            NothingToRelease - dev-buy pojechal do vestingu 1.09.2026, ale
            escrow dalej dostaje SPHERE ze strumienia hooka po graduacji,
            wiec karta wroci do zycia sama, gdy cos sie uzbiera. */}
        <ActionCard
          title="Release tokens → vesting"
          badge={<EnforcedBadge />}
          hint={
            state?.launched && state.tokenBalance === 0n
              ? 'Nothing waiting - the dev-buy is already vesting; future SPHERE inflows land here'
              : state
                ? `${exact(state.tokenBalance, 'SPHERE')} moves into the vesting contract`
                : 'Whole SPHERE balance moves into the vesting contract'
          }
          disabledNote={state?.launched ? undefined : 'Token not launched yet - unlocks after launch().'}
        >
          <ActionButton
            label="Release tokens → vesting"
            address={escrow}
            abi={sphereCreatorEscrowAbi}
            functionName="releaseToken"
            args={[zeroAddress]}
            disabled={!state || state.tokenBalance === 0n}
          />
        </ActionCard>
      </div>
      </KeeperSection>

      <AdvancedSection>
        <AbiConsole title="SphereCreatorEscrow" address={escrow} abi={sphereCreatorEscrowAbi} />
      </AdvancedSection>

      <LearnMore>How the escrow routing works</LearnMore>
    </div>
  );
}

'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { formatEther, type Address } from 'viem';
import { usePublicClient } from 'wagmi';
import {
  DEPLOYED,
  DERIV_CHAIN,
  FACTORY_ADDRESS,
  ORACLE_ADDRESS,
  factoryAbi,
  feesAbi,
  insuranceAbi,
  marketAbi,
  oracleAbi,
} from './config';
import { fmtPrice, fmtUsdc, fmtWadCompact, shortAddress } from './format';

/**
 * "HOW PERPS WORK" - wyjasnienie perpow, ktore MIESZKA W TYM MODULE.
 *
 * ===========================================================================
 * PO CO TO ISTNIEJE
 * ===========================================================================
 * Do 10 wrzesnia 2026 tablica derywatow miala pastylke "How it works"
 * prowadzaca na `/how#arc-derivatives` - czyli na strone o LAUNCHPADZIE.
 * Trader, ktory chcial wiedziec, przy jakim ruchu ceny straci depozyt, ladowal
 * w opisie krzywej bondingowej i wychodzil z produktu. Perp tlumaczy sie
 * inaczej niz launch: pytania brzmia "kto podaje cene", "kto komu placi
 * funding", "przy jakim ruchu mnie zamkna" i "kto pokrywa strate, ktorej moj
 * depozyt nie pokryl". Odpowiedzi na nie musza stac obok rynku, a nie dwa
 * klikniecia dalej i w cudzym kontekscie.
 *
 * ===========================================================================
 * DLACZEGO ZADNEJ LICZBY NIE MA TU WPISANEJ RECZNIE
 * ===========================================================================
 * Ta sama zasada, co w `startpad/LifecycleGuide`. Kazda stala tego modulu -
 * dzwignia, oplata, interwal fundingu, prog utrzymania, mnozniki limitu OI,
 * dolna kaucja - jest PUBLICZNA w kontrakcie. Zdanie "leverage up to 10x"
 * wpisane w prose jest prawdziwe dokladnie do nastepnego wdrozenia, a potem
 * juz tylko klamie, i to bez zadnego sygnalu. Wiec czytamy.
 *
 * Odczyt, ktory padl, pokazuje sie jako "unavailable" - NIGDY jako zero.
 * W module, gdzie zero znaczy "rynek sciety" albo "brak depozytu", zero
 * podstawione za niewiedze jest gorsze od dziury w zdaniu.
 *
 * ===========================================================================
 * TRZY MIEJSCA, KTORE PRZESTALY BYC JAKOSCIOWE (10 wrzesnia 2026)
 * ===========================================================================
 * 1. PODZIAL OPLATY. Panel mowil, ze udzial tworcy "splywa z opoznieniem", i
 *    nie podawal ANI JEDNEGO procentu - akurat w jedynym akapicie o cudzych
 *    pieniadzach. Teraz `feesAbi` daje CREATOR_SHARE_BPS, INSURANCE_SHARE_BPS,
 *    LOCK_DAYS i adresy odbiorcow. Udzial skarbca LICZYMY jako reszte do
 *    10000 bps - wpisanie "20%" na sztywno byloby dokladnie tym samym bledem,
 *    ktory ten plik ma nie popelniac.
 * 2. BARIERKI REJESTRU. "Odrzuca zbyt duzy skok" i "zbyt blisko siebie" to byl
 *    opis zabezpieczenia wart tyle, co jego brak. Teraz sa progi, a obok nich
 *    - rownie wyraznie - to, czego kazdy z nich NIE zalatwia.
 * 3. OTWARTY SPOR. `getChallenge` mowi kto, za ile i od kiedy kwestionuje ten
 *    feed. Zywy spor jest najwazniejsza rzecza, jaka trader moze wiedziec o
 *    zrodle ceny, wiec ma wlasna ramke, a nie przypis.
 *
 * ===========================================================================
 * DLACZEGO CZYTAMY DOPIERO PO OTWARCIU
 * ===========================================================================
 * To jest ~45 wywolan `view` w dwoch rundach (druga potrzebuje adresow z
 * pierwszej). Arc limituje zapytania, a tablica robi juz swoje multicalle przy
 * kazdym wejsciu. Panel jest zwiniety, wiec dopoki nikt go nie otworzyl, nie
 * kosztuje ani jednego zapytania.
 */

type Terms = {
  symbol: string | null;
  market: Address | null;
  insurance: Address | null;
  fees: Address | null;
  /* Rynek */
  maxLeverage: number | null;
  minMarginUsdc: bigint | null;
  maintenanceBps: number | null;
  liqFeeBps: number | null;
  tradeFeeBps: number | null;
  fundingInterval: number | null;
  maxPremiumBps: number | null;
  lastFundingAt: number | null;
  quoteReserve: bigint | null;
  baseReserve: bigint | null;
  mark: bigint | null;
  index: bigint | null;
  oi: bigint | null;
  oiCap: bigint | null;
  creatorOiCap: bigint | null;
  creatorOiCapBps: number | null;
  oiMultProbation: number | null;
  oiMultMature: number | null;
  probationAge: number | null;
  probationUpdates: number | null;
  mature: boolean | null;
  coveredBadDebt: bigint | null;
  /** Adres feedu Chainlink albo adres zerowy, czyli "tylko rejestr". */
  chainlinkFeed: Address | null;
  /* Podzial oplaty */
  creatorShareBps: number | null;
  insuranceShareBps: number | null;
  lockDays: number | null;
  treasury: Address | null;
  /**
   * Tworca rynku - czytany WYLACZNIE po to, zeby porownac go ze skarbcem.
   * Na tym wdrozeniu oba adresy sa te same, wiec zdanie "65% tworcy, 20%
   * skarbcowi" jest prawdziwe i jednoczesnie mylace: 85% idzie do jednej reki.
   */
  marketCreator: Address | null;
  /* Rejestr feedow */
  minBond: bigint | null;
  challengeBond: bigint | null;
  /* Barierki rejestru */
  maxDeviationBps: number | null;
  minUpdateInterval: number | null;
  maxPriceAge: number | null;
  challengeWindow: number | null;
  twapCardinality: number | null;
  /* Otwarty spor o ten feed */
  challenger: Address | null;
  challengeAmount: bigint | null;
  challengeOpenedAt: number | null;
  disputedPrice: bigint | null;
  challengeOpen: boolean | null;
  twap: bigint | null;
  feedActive: boolean | null;
  feedBond: bigint | null;
  feedUpdatedAt: number | null;
  feedUpdateCount: number | null;
  feedChallenges: number | null;
  feedFrozen: boolean | null;
  feedSlashed: boolean | null;
  /* Fundusz */
  insBalance: bigint | null;
  insRequired: bigint | null;
  insMinRatioBps: number | null;
  insPaused: boolean | null;
};

/* -------------------------------------------------------------------------- */
/*  FORMATOWANIE                                                               */
/*  Konwersje skal USDC/WAD siedza w `format.ts` i nie ma ich tu ani jednej.    */
/*  Ponizej jest wylacznie prezentacja: bps na procent, sekundy na slowa, oraz  */
/*  opakowania, ktore przepuszczaja `null` zamiast robic z niego zero.          */
/* -------------------------------------------------------------------------- */

const pct = (bps: number | null | undefined): string | null =>
  bps == null ? null : `${(bps / 100).toFixed(2)}%`;

const times = (n: number | null | undefined): string | null => (n == null ? null : `${n}x`);

const asUsdc = (v: bigint | null | undefined): string | null => (v == null ? null : fmtUsdc(v));
const asWad = (v: bigint | null | undefined): string | null => (v == null ? null : fmtWadCompact(v));
const asPrice = (v: bigint | null | undefined): string | null => (v == null ? null : fmtPrice(v));
const asCount = (v: number | null | undefined): string | null => (v == null ? null : String(v));

/**
 * LOCK_DAYS przychodzi w DNIACH, nie w sekundach. Przepuszczenie siodemki
 * przez `fmtDuration` daloby "0 min", czyli zdanie o cudzych pieniadzach
 * mowiace, ze sa dostepne od reki. Stad osobne opakowanie.
 */
const days = (n: number | null | undefined): string | null =>
  n == null ? null : `${n} ${n === 1 ? 'day' : 'days'}`;

/** Adres zerowy w slocie feedu znaczy "nie skonfigurowano", a nie "blad odczytu". */
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const isZero = (a: Address | null): boolean | null =>
  a == null ? null : a.toLowerCase() === ZERO_ADDRESS;

/** Sekundy z kontraktu -> slowa. 604800 to "7 days", nie "168 h". */
function fmtDuration(seconds: number | null | undefined): string | null {
  if (seconds == null) return null;
  if (seconds >= 86_400 && seconds % 86_400 === 0) return `${seconds / 86_400} days`;
  if (seconds >= 3_600) return `${Math.round(seconds / 3_600)} h`;
  return `${Math.round(seconds / 60)} min`;
}

/** Rezerwa bazowa to JEDNOSTKI, nie dolary - `fmtWadCompact` dokleiloby "$". */
function fmtUnits(value: bigint | null | undefined): string | null {
  if (value == null) return null;
  const n = Number(formatEther(value));
  if (!Number.isFinite(n)) return null;
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

/** Premia mark/index w bps, liczona na bigintach - `Number` gubilby grosze. */
export function premiumBps(mark: bigint | null, index: bigint | null): number | null {
  if (mark == null || index == null || index === 0n) return null;
  return Number(((mark - index) * 10_000n) / index);
}

const signedPct = (bps: number | null): string | null =>
  bps == null ? null : `${bps >= 0 ? '+' : '-'}${(Math.abs(bps) / 100).toFixed(2)}%`;

/**
 * Liczba, ktorej NIE udalo sie odczytac, nie ma prawa wygladac jak liczba.
 * Jedno miejsce, ktore zamienia `null` w widoczna dziure w zdaniu.
 */
function Val({ children }: { children: string | null | undefined }) {
  if (children == null) {
    return (
      <span
        className="rounded bg-sp-shade/[0.08] px-1 text-[0.95em] font-semibold text-sp-ink-soft"
        title="This value could not be read from the contract"
      >
        unavailable
      </span>
    );
  }
  return <strong className="font-extrabold tabular-nums text-sp-ink">{children}</strong>;
}

type TableRow = { head: string; a: React.ReactNode; b: React.ReactNode };

/** Tabela zawsze w swoim wlasnym pasie przewijania - strona nie ma sie ruszac. */
function MiniTable({ cols, rows }: { cols: [string, string, string]; rows: TableRow[] }) {
  return (
    <div className="mt-3 -mx-1 overflow-x-auto px-1">
      <table className="w-full min-w-[440px] text-left text-[11.5px]">
        <thead>
          <tr className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-sp-ink-soft">
            <th className="pb-2 pr-3">{cols[0]}</th>
            <th className="pb-2 pr-3">{cols[1]}</th>
            <th className="pb-2">{cols[2]}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.head} className="border-t border-sp-shade/[0.07] align-top">
              <td className="py-2 pr-3 font-extrabold text-sp-ink">{row.head}</td>
              <td className="py-2 pr-3 leading-[1.5] text-sp-ink-soft">{row.a}</td>
              <td className="py-2 leading-[1.5] text-sp-ink-soft">{row.b}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h3 className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-sp-ink-soft">{title}</h3>
      <div className="mt-2 space-y-2 text-[11.5px] leading-[1.6] text-sp-ink-soft">{children}</div>
    </section>
  );
}

function ContractLink({ address, label }: { address: Address | null; label?: string }) {
  if (!address) return <Val>{null}</Val>;
  return (
    <a
      className="font-semibold text-sp-brand-deep hover:underline"
      href={`${DERIV_CHAIN.blockExplorers?.default.url}/address/${address}`}
      target="_blank"
      rel="noreferrer"
    >
      {label ?? shortAddress(address)}
    </a>
  );
}

/**
 * Multicall po NAZWACH zamiast po indeksach. Przy trzydziestu wywolaniach
 * numerowanie recznie jest wylacznie sposobem na ciche przesuniecie o jeden.
 * `allowFailure` jest tu obowiazkowe: jeden padniety odczyt ma zrobic dziure
 * w jednym zdaniu, a nie wywalic caly panel.
 */
async function readAll(
  client: NonNullable<ReturnType<typeof usePublicClient>>,
  entries: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const keys = Object.keys(entries);
  const results = (await client.multicall({
    contracts: keys.map((k) => entries[k]) as never,
    allowFailure: true,
  })) as ReadonlyArray<{ status: 'success'; result: unknown } | { status: 'failure' }>;
  const out: Record<string, unknown> = {};
  keys.forEach((key, i) => {
    const r = results[i];
    out[key] = r && r.status === 'success' ? r.result : null;
  });
  return out;
}

const num = (v: unknown): number | null => (v == null ? null : Number(v as bigint | number));
const big = (v: unknown): bigint | null => (v == null ? null : (v as bigint));
const bool = (v: unknown): boolean | null => (v == null ? null : Boolean(v));

export default function PerpsGuide({
  market,
  symbol,
  open,
  onOpenChange,
  className = '',
}: {
  /** Rynek, z ktorego czytamy stale. Bez niego zostaja rejestr i fundusz. */
  market?: Address;
  symbol?: string;
  /** Sterowanie z zewnatrz jest opcjonalne - bez niego panel radzi sobie sam. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}) {
  const client = usePublicClient({ chainId: DERIV_CHAIN.id });
  const [selfOpen, setSelfOpen] = useState(false);
  const isOpen = open ?? selfOpen;
  const setOpen = onOpenChange ?? setSelfOpen;

  const [terms, setTerms] = useState<Terms | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  const load = useCallback(async () => {
    if (!client || !DEPLOYED) return;
    setState('loading');
    try {
      // Runda 1: adresy i to, co da sie przeczytac bez znajomosci rynku.
      const first = await readAll(client, {
        insurance: { address: FACTORY_ADDRESS, abi: factoryAbi, functionName: 'INSURANCE' },
        fees: { address: FACTORY_ADDRESS, abi: factoryAbi, functionName: 'FEES' },
        minBond: { address: ORACLE_ADDRESS, abi: oracleAbi, functionName: 'MIN_BOND_AMOUNT' },
        challengeBond: { address: ORACLE_ADDRESS, abi: oracleAbi, functionName: 'CHALLENGE_BOND' },
        // Barierki rejestru sa globalne - nie potrzebuja id rynku, wiec ida tu.
        maxDeviation: { address: ORACLE_ADDRESS, abi: oracleAbi, functionName: 'MAX_DEVIATION_BPS' },
        minUpdateInterval: { address: ORACLE_ADDRESS, abi: oracleAbi, functionName: 'MIN_UPDATE_INTERVAL' },
        maxPriceAge: { address: ORACLE_ADDRESS, abi: oracleAbi, functionName: 'MAX_PRICE_AGE' },
        challengeWindow: { address: ORACLE_ADDRESS, abi: oracleAbi, functionName: 'CHALLENGE_WINDOW' },
        twapCardinality: { address: ORACLE_ADDRESS, abi: oracleAbi, functionName: 'TWAP_CARDINALITY' },
        ...(market ? { oracleId: { address: market, abi: marketAbi, functionName: 'ORACLE_MARKET_ID' } } : {}),
      });

      const insurance = first.insurance as Address | null;
      // Adres dystrybutora znamy dopiero teraz - stale podzialu czytamy w rundzie 2.
      const fees = first.fees as Address | null;
      const oracleId = big(first.oracleId);

      const m = (fn: string) => ({ address: market as Address, abi: marketAbi, functionName: fn });
      const o = (fn: string) => ({
        address: ORACLE_ADDRESS,
        abi: oracleAbi,
        functionName: fn,
        args: [oracleId as bigint],
      });

      // Runda 2: cala reszta w jednym zapytaniu, przez multicall3.
      const second = await readAll(client, {
        ...(insurance
          ? {
              insBalance: { address: insurance, abi: insuranceAbi, functionName: 'balance' },
              insRequired: { address: insurance, abi: insuranceAbi, functionName: 'requiredBalance' },
              insMinRatio: { address: insurance, abi: insuranceAbi, functionName: 'minRatioBps' },
              insPaused: { address: insurance, abi: insuranceAbi, functionName: 'newPositionsPaused' },
            }
          : {}),
        ...(fees
          ? {
              creatorShare: { address: fees, abi: feesAbi, functionName: 'CREATOR_SHARE_BPS' },
              insuranceShare: { address: fees, abi: feesAbi, functionName: 'INSURANCE_SHARE_BPS' },
              lockDays: { address: fees, abi: feesAbi, functionName: 'LOCK_DAYS' },
              treasury: { address: fees, abi: feesAbi, functionName: 'TREASURY' },
            }
          : {}),
        ...(market
          ? {
              chainlinkFeed: m('CHAINLINK_FEED'),
              // Brak na rynkach sprzed 16.09.2026 -> null, wtedy liczy sie isActive rejestru.
              marketActive: m('oracleActive'),
              marketCreator: m('CREATOR'),
              maxLeverage: m('MAX_LEVERAGE'),
              minMargin: m('MIN_MARGIN_USDC'),
              maintenance: m('MAINTENANCE_MARGIN_BPS'),
              liqFee: m('LIQUIDATION_FEE_BPS'),
              tradeFee: m('TRADE_FEE_BPS'),
              fundingInterval: m('FUNDING_INTERVAL'),
              maxPremium: m('MAX_PREMIUM_BPS'),
              lastFundingAt: m('lastFundingAt'),
              quoteReserve: m('quoteReserve'),
              baseReserve: m('baseReserve'),
              mark: m('markPrice'),
              index: m('indexPrice'),
              oi: m('openInterestNotional'),
              oiCap: m('maxOpenInterest'),
              creatorOiCap: m('creatorOiCap'),
              creatorOiCapBps: m('CREATOR_OI_CAP_BPS'),
              oiMultProbation: m('OI_MULTIPLIER_PROBATION'),
              oiMultMature: m('OI_MULTIPLIER_MATURE'),
              probationAge: m('PROBATION_AGE'),
              probationUpdates: m('PROBATION_UPDATES'),
              mature: m('isMature'),
              coveredBadDebt: m('coveredBadDebtUsdc'),
            }
          : {}),
        ...(oracleId != null
          ? {
              twap: o('getTwap'),
              feedActive: o('isActive'),
              stats: o('marketStats'),
              price: o('getPrice'),
              challenge: o('getChallenge'),
            }
          : {}),
      });

      const stats = second.stats as readonly unknown[] | null;
      const price = second.price as readonly unknown[] | null;
      const challenge = second.challenge as readonly unknown[] | null;

      setTerms({
        symbol: symbol ?? null,
        market: market ?? null,
        insurance,
        fees,
        maxLeverage: num(second.maxLeverage),
        minMarginUsdc: big(second.minMargin),
        maintenanceBps: num(second.maintenance),
        liqFeeBps: num(second.liqFee),
        tradeFeeBps: num(second.tradeFee),
        fundingInterval: num(second.fundingInterval),
        maxPremiumBps: num(second.maxPremium),
        lastFundingAt: num(second.lastFundingAt),
        quoteReserve: big(second.quoteReserve),
        baseReserve: big(second.baseReserve),
        mark: big(second.mark),
        index: big(second.index),
        oi: big(second.oi),
        oiCap: big(second.oiCap),
        creatorOiCap: big(second.creatorOiCap),
        creatorOiCapBps: num(second.creatorOiCapBps),
        oiMultProbation: num(second.oiMultProbation),
        oiMultMature: num(second.oiMultMature),
        probationAge: num(second.probationAge),
        probationUpdates: num(second.probationUpdates),
        mature: bool(second.mature),
        coveredBadDebt: big(second.coveredBadDebt),
        chainlinkFeed: (second.chainlinkFeed as Address | null) ?? null,
        creatorShareBps: num(second.creatorShare),
        insuranceShareBps: num(second.insuranceShare),
        lockDays: num(second.lockDays),
        treasury: (second.treasury as Address | null) ?? null,
        marketCreator: (second.marketCreator as Address | null) ?? null,
        minBond: big(first.minBond),
        challengeBond: big(first.challengeBond),
        maxDeviationBps: num(first.maxDeviation),
        minUpdateInterval: num(first.minUpdateInterval),
        maxPriceAge: num(first.maxPriceAge),
        challengeWindow: num(first.challengeWindow),
        twapCardinality: num(first.twapCardinality),
        challenger: challenge ? (challenge[0] as Address) : null,
        challengeAmount: challenge ? (challenge[1] as bigint) : null,
        challengeOpenedAt: challenge ? Number(challenge[2]) : null,
        disputedPrice: challenge ? (challenge[3] as bigint) : null,
        challengeOpen: challenge ? Boolean(challenge[4]) : null,
        twap: big(second.twap),
        // Rynek z feedem Pytha jest aktywny bez heartbeatu rejestru.
        feedActive: bool(second.marketActive) ?? bool(second.feedActive),
        feedBond: stats ? (stats[0] as bigint) : null,
        feedUpdatedAt: price ? Number(price[1]) : null,
        feedUpdateCount: stats ? Number(stats[2]) : null,
        feedChallenges: stats ? Number(stats[3]) : null,
        feedFrozen: stats ? Boolean(stats[4]) : null,
        feedSlashed: stats ? Boolean(stats[5]) : null,
        insBalance: big(second.insBalance),
        insRequired: big(second.insRequired),
        insMinRatioBps: num(second.insMinRatio),
        insPaused: bool(second.insPaused),
      });
      setState('ready');
    } catch {
      setState('error');
    }
  }, [client, market, symbol]);

  // Czytamy dopiero, gdy ktos otworzyl panel - i tylko raz.
  useEffect(() => {
    if (isOpen && state === 'idle') void load();
  }, [isOpen, state, load]);

  // Zegar do fundingu tyka tylko przy otwartym panelu.
  useEffect(() => {
    if (!isOpen) return;
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1_000);
    return () => clearInterval(t);
  }, [isOpen]);

  const t = terms;
  const prem = premiumBps(t?.mark ?? null, t?.index ?? null);
  // Ruch do likwidacji: bufor startowy (1/dzwignia) minus prog utrzymania.
  const liqMove =
    t?.maxLeverage && t?.maintenanceBps != null
      ? `${(100 / t.maxLeverage - t.maintenanceBps / 100).toFixed(2)}%`
      : null;
  const nextFunding =
    t?.lastFundingAt != null && t?.fundingInterval != null ? t.lastFundingAt + t.fundingInterval : null;
  const countdown =
    nextFunding == null
      ? null
      : nextFunding <= now
        ? 'due now'
        : `in ${Math.floor((nextFunding - now) / 60)}m ${(nextFunding - now) % 60}s`;
  const payer = prem == null ? null : prem === 0 ? 'nobody pays' : prem > 0 ? 'longs pay shorts' : 'shorts pay longs';
  // Rownosc z TWAP-em rejestru dowodzi, ze index pochodzi z feedu tworcy,
  // a nie z zewnetrznego zrodla. To jest SPRAWDZENIE, nie zalozenie.
  const indexIsFeedTwap = t?.index != null && t?.twap != null ? t.index === t.twap : null;

  // Skarbiec dostaje RESZTE. Wpisanie "20%" recznie przetrwaloby dokladnie do
  // pierwszej zmiany ktoregokolwiek z dwoch pozostalych udzialow.
  const treasuryShareBps =
    t?.creatorShareBps != null && t?.insuranceShareBps != null
      ? 10_000 - t.creatorShareBps - t.insuranceShareBps
      : null;
  /**
   * CZY TWORCA I SKARBIEC TO TEN SAM ADRES.
   *
   * Zdanie "65% tworcy, 15% funduszowi, 20% skarbcowi" jest prawdziwe co do
   * kontraktu i mylace co do skutku, jesli dwa z tych trzech adresow sa
   * identyczne - a na tym wdrozeniu sa. To SPRAWDZENIE, nie zalozenie: gdy
   * ktos rozdzieli te role, zdanie samo zniknie, bez zmiany w kodzie.
   */
  const sameHand =
    t?.treasury != null &&
    t?.marketCreator != null &&
    t.treasury.toLowerCase() === t.marketCreator.toLowerCase();
  const creatorPlusTreasuryBps =
    sameHand && t?.creatorShareBps != null && treasuryShareBps != null
      ? t.creatorShareBps + treasuryShareBps
      : null;
  // Feed bez Chainlinka to nie brak przypisu, tylko brak drugiego zrodla.
  const noChainlink = isZero(t?.chainlinkFeed ?? null);
  // Spor: od kiedy trwa i ile zostalo do konca okna.
  const challengeAge =
    t?.challengeOpenedAt ? `${Math.max(0, Math.floor((now - t.challengeOpenedAt) / 60))} min` : null;
  const challengeEndsAt =
    t?.challengeOpenedAt && t?.challengeWindow != null ? t.challengeOpenedAt + t.challengeWindow : null;
  const challengeCloses =
    challengeEndsAt == null
      ? null
      : challengeEndsAt <= now
        ? 'the window has already closed, so it is waiting on a ruling'
        : `in ${Math.floor((challengeEndsAt - now) / 60)}m ${(challengeEndsAt - now) % 60}s`;

  return (
    <details
      open={isOpen}
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
      className={`group overflow-hidden rounded-[18px] border border-sp-shade/10 bg-sp-surface ${className}`}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
        <span className="text-[12.5px] font-extrabold text-sp-ink">
          How perps work here: the vAMM, funding, liquidation and who publishes the price
        </span>
        <span aria-hidden="true" className="shrink-0 text-[11px] font-extrabold text-sp-ink-soft">
          {isOpen ? 'close' : 'open'}
        </span>
      </summary>

      <div className="border-t border-sp-shade/10 px-4 py-4">
        {!DEPLOYED && (
          <p className="text-[11.5px] leading-[1.6] text-sp-ink-soft">
            The module isn&apos;t deployed on this network, so there is nothing to read these numbers from. Every figure
            in this panel is a contract call; none of them are written into the page.
          </p>
        )}

        {DEPLOYED && state === 'loading' && (
          <div className="space-y-2" aria-busy="true">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-3 animate-pulse rounded bg-sp-shade/[0.07]"
                style={{ width: `${95 - i * 9}%` }}
              />
            ))}
          </div>
        )}

        {DEPLOYED && state === 'error' && (
          <div className="flex flex-wrap items-center gap-3 text-[11.5px] text-sp-ink-soft">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
            <span>Couldn&apos;t read the contracts, so this panel has nothing true to show.</span>
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex items-center gap-1 rounded-full border border-sp-shade/15 px-2.5 py-1 font-semibold text-sp-ink hover:bg-sp-hover"
            >
              <RefreshCw className="h-3 w-3" />
              Try again
            </button>
          </div>
        )}

        {DEPLOYED && state === 'ready' && t && (
          <>
            <p className="text-[11.5px] leading-[1.6] text-sp-ink-soft">
              A perpetual has no expiry and nothing to deliver: you post USDC as margin and the contract tracks what
              your position is worth right now. There is no order book. Price comes from a virtual AMM - a constant
              product over two reserves that nobody deposited and nobody can withdraw. The curve currently holds{' '}
              <Val>{asWad(t.quoteReserve)}</Val> of quote against <Val>{fmtUnits(t.baseReserve)}</Val> base units, and
              the mark price is one divided by the other: <Val>{asPrice(t.mark)}</Val>. Your trade moves those
              reserves, which is why size costs you slippage. The index price - <Val>{asPrice(t.index)}</Val> - comes
              from the feed this market was listed against, and funding is the only thing pulling the two together.
            </p>

            <MiniTable
              cols={['What you do', 'What the contract does', 'What it costs you']}
              rows={[
                {
                  head: 'Open',
                  a: (
                    <>
                      Swaps your notional along the curve, so your entry is the average price across it, not the mark
                      you clicked. One position per address, opened whole.
                    </>
                  ),
                  b: (
                    <>
                      <Val>{pct(t.tradeFeeBps)}</Val> of notional, taken out of your margin before the position
                      exists. Minimum margin <Val>{asUsdc(t.minMarginUsdc)}</Val>.
                    </>
                  ),
                },
                {
                  head: 'Hold',
                  a: (
                    <>
                      Funding accrues every <Val>{fmtDuration(t.fundingInterval)}</Val> against the mark-index
                      premium. Your PnL moves with the mark, not the index.
                    </>
                  ),
                  b: <>Funding, in either direction. No borrow fee and no daily charge.</>,
                },
                {
                  head: 'Close',
                  a: <>Swaps the position back through the curve and pays the remaining equity out in USDC.</>,
                  b: (
                    <>
                      <Val>{pct(t.tradeFeeBps)}</Val> again, on the exit notional. Entry and exit are charged
                      separately.
                    </>
                  ),
                },
                {
                  head: 'Get liquidated',
                  a: (
                    <>
                      Anyone may call <code className="text-[11px]">liquidate()</code> once your margin ratio falls
                      under <Val>{pct(t.maintenanceBps)}</Val>. Whatever survives the fees is returned to you.
                    </>
                  ),
                  b: (
                    <>
                      <Val>{pct(t.liqFeeBps)}</Val> of the exit notional to whoever called it, on top of the{' '}
                      <Val>{pct(t.tradeFeeBps)}</Val> exit fee - both out of your margin.
                    </>
                  ),
                },
              ]}
            />

            <Section title="Margin, leverage and the move that takes you out">
              <p>
                Leverage is a whole multiplier from 1 up to <Val>{times(t.maxLeverage)}</Val>, chosen once when you
                open. Margin ratio is your equity - margin plus unrealised PnL minus funding - over the position&apos;s
                current notional. Below <Val>{pct(t.maintenanceBps)}</Val> the position is liquidatable by anybody
                watching, not by an operator.
              </p>
              <p>
                At the maximum <Val>{times(t.maxLeverage)}</Val> you start with{' '}
                <Val>{t.maxLeverage ? `${(100 / t.maxLeverage).toFixed(2)}%` : null}</Val> equity, so a move of about{' '}
                <Val>{liqMove}</Val> against you is enough - before funding and before the exit fee, which land first.
                There is no partial close and no way to top up margin on an open position; the only lever you hold is
                closing it.
              </p>
            </Section>

            <Section title="Funding: who pays whom, and when">
              <p>
                Every <Val>{fmtDuration(t.fundingInterval)}</Val> the contract takes the premium (mark minus index),
                clips it to <Val>{pct(t.maxPremiumBps)}</Val> of the index and accrues it per unit of position over a
                one-day period. Mark above index: longs pay shorts. Mark below: shorts pay longs. It moves between
                traders - the protocol takes nothing out of it.
              </p>
              <p>
                The premium right now is <Val>{signedPct(prem)}</Val>
                {prem != null && t.maxPremiumBps != null && Math.abs(prem) > t.maxPremiumBps
                  ? ' (past the cap, so funding is computed at the capped rate)'
                  : ''}
                . The next settlement is <Val>{countdown}</Val>, and on that premium <Val>{payer}</Val>.{' '}
                <code className="text-[11px]">settleFunding()</code> is permissionless; if nobody calls it, the next
                trade settles it anyway, and a gap longer than a day is clipped to a day.
              </p>
            </Section>

            <Section title="Where the money goes">
              <MiniTable
                cols={['Charge', 'How much', 'Who receives it']}
                rows={[
                  {
                    head: 'Trade fee',
                    a: (
                      <>
                        <Val>{pct(t.tradeFeeBps)}</Val> of notional, on entry and again on exit
                      </>
                    ),
                    b: (
                      <>
                        The FeeDistributor at <ContractLink address={t.fees} /> splits every one:{' '}
                        <Val>{pct(t.creatorShareBps)}</Val> to the market creator,{' '}
                        <Val>{pct(t.insuranceShareBps)}</Val> to the insurance fund at{' '}
                        <ContractLink address={t.insurance} />, and the remaining{' '}
                        <Val>{pct(treasuryShareBps)}</Val> to the treasury at <ContractLink address={t.treasury} />.
                        {sameHand && (
                          <>
                            {' '}
                            <strong className="text-sp-ink">
                              On this deployment the treasury and the market creator are the same
                              address
                            </strong>
                            , so <Val>{pct(creatorPlusTreasuryBps)}</Val> of every trade fee reaches
                            one party, not two.
                          </>
                        )}
                      </>
                    ),
                  },
                  {
                    head: 'Liquidation fee',
                    a: (
                      <>
                        <Val>{pct(t.liqFeeBps)}</Val> of the exit notional, only when you are liquidated
                      </>
                    ),
                    b: (
                      <>
                        Whoever called liquidate() first. Separate from the trade fee, and both come out of the
                        loser&apos;s margin.
                      </>
                    ),
                  },
                  {
                    head: 'Funding',
                    a: (
                      <>
                        premium up to <Val>{pct(t.maxPremiumBps)}</Val>, every{' '}
                        <Val>{fmtDuration(t.fundingInterval)}</Val>
                      </>
                    ),
                    b: <>The other side of the book. Nothing is skimmed off it.</>,
                  },
                  {
                    head: 'Shortfall',
                    a: (
                      <>
                        whatever a liquidated margin failed to cover - so far <Val>{asUsdc(t.coveredBadDebt)}</Val> on
                        this market
                      </>
                    ),
                    b: <>Paid out of the insurance fund, never out of other traders&apos; margin.</>,
                  },
                ]}
              />
              <p>
                The creator&apos;s <Val>{pct(t.creatorShareBps)}</Val> is not paid out as it arrives. Each accrual
                sits locked in the distributor and only becomes claimable <Val>{days(t.lockDays)}</Val> later, when
                the creator calls <code className="text-[11px]">claim()</code> for it - so the person publishing your
                index always has a few days of their own revenue still inside the contract. That split is a constant
                of the distributor the factory hands every market, not something a creator picks per listing.
              </p>
            </Section>

            <Section title="Who backs the losses">
              <p>
                The insurance fund <ContractLink address={t.insurance} /> holds <Val>{asUsdc(t.insBalance)}</Val>{' '}
                against <Val>{asUsdc(t.insRequired)}</Val> required, which is <Val>{pct(t.insMinRatioBps)}</Val> of
                the open interest across every market in the module.
              </p>
              <p>
                {t.insPaused === true ? (
                  <span className="font-semibold text-destructive">
                    The fund is below that line right now, so new positions are paused module-wide.
                  </span>
                ) : t.insPaused === false ? (
                  <>The fund is above that line, so opening is enabled.</>
                ) : (
                  <>
                    Whether the pause is active is <Val>{null}</Val>.
                  </>
                )}{' '}
                When the balance falls under the requirement, opening reverts on every market at once - closing,
                liquidating and settling funding keep working. That is the only pause in the module; no address can
                halt a market by hand.
              </p>
            </Section>

            <Section title="The index is a person with a bond, not an oracle network">
              <p className="rounded-[12px] border border-amber-500/25 bg-amber-500/[0.06] p-3 text-sp-ink-soft">
                This is the part that differs from every venue you have traded on. The index for this market is
                published by <strong className="text-sp-ink">the market creator</strong>. Not Chainlink, not a median
                of exchanges, not a committee - one address, submitting a price it picks, backed by a USDC bond of at
                least <Val>{asUsdc(t.minBond)}</Val>.{' '}
                {indexIsFeedTwap === true ? (
                  <>
                    Checked live: this market&apos;s index equals the registry&apos;s time-weighted average of that
                    feed, so the creator&apos;s submissions are exactly what your funding is measured against.
                  </>
                ) : indexIsFeedTwap === false ? (
                  <>
                    Checked live: this market&apos;s index does not match the registry TWAP, so an external feed is
                    supplying it here.
                  </>
                ) : (
                  <>Whether the index currently tracks the registry TWAP could not be read.</>
                )}
              </p>
              <p>
                {noChainlink === true ? (
                  <>
                    There is no second source. The market&apos;s{' '}
                    <code className="text-[11px]">CHAINLINK_FEED</code> slot holds the zero address, so nothing in
                    this system ever disagrees with the publisher: if that one address prints a wrong number and
                    nobody challenges it in time, the wrong number is simply the price.
                  </>
                ) : noChainlink === false ? (
                  <>
                    This market does carry a second source: a Chainlink aggregator at{' '}
                    <ContractLink address={t.chainlinkFeed} /> is configured in its{' '}
                    <code className="text-[11px]">CHAINLINK_FEED</code> slot, so the creator&apos;s submissions are
                    not the only price the contract can see. Which of the two it uses is settled in the market
                    contract, not here - check it before you size a position on the difference.
                  </>
                ) : (
                  <>
                    Whether a Chainlink feed is configured as a second source is <Val>{null}</Val>, so treat this
                    market as single-sourced until you have read that slot yourself.
                  </>
                )}
              </p>
              <p>
                What stands between that and an outright lie is four limits in the registry, and each one is narrower
                than it sounds:
              </p>

              <MiniTable
                cols={['Guardrail', 'The limit it enforces', 'What it does not cover']}
                rows={[
                  {
                    head: 'Price jump',
                    a: (
                      <>
                        A single submission may not move the index more than <Val>{pct(t.maxDeviationBps)}</Val> away
                        from the previous accepted price.
                      </>
                    ),
                    b: (
                      <>
                        It caps each step, not the distance. The same publisher can walk the index that far again
                        every <Val>{fmtDuration(t.minUpdateInterval)}</Val>, so a determined move only costs time.
                      </>
                    ),
                  },
                  {
                    head: 'Update rate',
                    a: (
                      <>
                        Submissions must be at least <Val>{fmtDuration(t.minUpdateInterval)}</Val> apart; anything
                        sooner is rejected.
                      </>
                    ),
                    b: (
                      <>
                        A floor on spacing is not a promise of frequency. Nothing obliges the publisher to submit at
                        all, and going quiet is a decision they can make at any moment.
                      </>
                    ),
                  },
                  {
                    head: 'Staleness',
                    a: (
                      <>
                        Once the last price is older than <Val>{fmtDuration(t.maxPriceAge)}</Val>, the registry
                        reports the feed inactive and this market stops accepting new positions.
                      </>
                    ),
                    b: (
                      <>
                        It closes the door, it does not clear the room. Positions already open keep running, and keep
                        being funded and liquidated against that last stale price.
                      </>
                    ),
                  },
                  {
                    head: 'Averaging',
                    a: (
                      <>
                        The index is a time-weighted average over{' '}
                        <Val>{t.twapCardinality != null ? `${t.twapCardinality} observations` : null}</Val>, not the
                        last print.
                      </>
                    ),
                    b: (
                      <>
                        Averaging dilutes a bad print, it never rejects one. The number stays in the index until it
                        rolls out of the window, and it drags every observation in between with it.
                      </>
                    ),
                  },
                ]}
              />

              <p>
                On top of those, anyone may post <Val>{asUsdc(t.challengeBond)}</Val> and call{' '}
                <code className="text-[11px]">challengePrice()</code>, which freezes further updates for the{' '}
                <Val>{fmtDuration(t.challengeWindow)}</Val> the dispute runs. If the challenge is upheld the
                feed&apos;s bond is slashed - half of it to the challenger - and the feed is dead for good, which
                drops this market&apos;s open-interest cap to zero.
              </p>

              {t.challengeOpen === true && (
                <p className="rounded-[12px] border border-destructive/30 bg-destructive/[0.07] p-3 text-sp-ink">
                  <strong className="font-extrabold">There is a challenge open on this feed right now.</strong>{' '}
                  <ContractLink address={t.challenger} /> posted <Val>{asUsdc(t.challengeAmount)}</Val> against a
                  price of <Val>{asPrice(t.disputedPrice)}</Val> <Val>{challengeAge}</Val> ago, and the window closes{' '}
                  <Val>{challengeCloses}</Val>. Until it is ruled on, the publisher cannot submit anything new: the
                  index you are funded and liquidated against is standing still while the mark keeps moving, and the
                  outcome decides whether this feed survives at all.
                </p>
              )}
              <p>
                Be clear about the limit: today a dispute is settled by a multisig, not by a permissionless vote. The
                bond protects you exactly as far as that multisig is honest and awake. What you get in exchange is
                that a feed nobody else would list can exist at all.
              </p>
              <p>
                This feed right now: bond <Val>{asUsdc(t.feedBond)}</Val>, <Val>{asCount(t.feedUpdateCount)}</Val>{' '}
                prices accepted, <Val>{asCount(t.feedChallenges)}</Val> challenges ever opened, last price{' '}
                <Val>
                  {t.feedUpdatedAt != null ? `${Math.max(0, Math.floor((now - t.feedUpdatedAt) / 60))} min ago` : null}
                </Val>
                .{' '}
                {t.feedSlashed === true
                  ? 'It has been slashed, so this market can no longer take new positions.'
                  : t.feedFrozen === true
                    ? 'It is frozen by an open challenge: prices are not updating while trading continues.'
                    : t.feedActive === false
                      ? 'The registry reports it inactive, which means the last price is too old to open against.'
                      : t.feedActive === true
                        ? 'The registry reports it active and fresh enough to open against.'
                        : ''}{' '}
                {t.challengeOpen === false
                  ? 'No challenge is open on it - that was checked, not assumed.'
                  : t.challengeOpen == null
                    ? 'Whether a challenge is open on it could not be read.'
                    : ''}
              </p>
            </Section>

            <Section title="Market maturity and why the cap is what it is">
              <p>
                Open interest is capped at the feed&apos;s bond times a multiplier, so a market can only grow as large
                as its creator has to lose. A new market runs at <Val>{times(t.oiMultProbation)}</Val> the bond. It
                reaches <Val>{times(t.oiMultMature)}</Val> only after <Val>{fmtDuration(t.probationAge)}</Val> and{' '}
                <Val>{t.probationUpdates != null ? `${t.probationUpdates} accepted prices` : null}</Val> with a clean
                record - one challenge, ever, sends it back to probation.
              </p>
              <p>
                This market is <Val>{t.mature == null ? null : t.mature ? 'mature' : 'on probation'}</Val> with{' '}
                <Val>{asWad(t.oi)}</Val> open against a cap of <Val>{asWad(t.oiCap)}</Val>. The creator - the same
                address that publishes the price - may hold at most <Val>{pct(t.creatorOiCapBps)}</Val> of that cap,{' '}
                <Val>{asWad(t.creatorOiCap)}</Val>, so publishing a convenient price and taking the other side cannot
                be one profitable transaction.
              </p>
            </Section>

            <p className="mt-6 border-t border-sp-shade/[0.07] pt-3 text-[11px] leading-[1.55] text-sp-ink-soft">
              Every figure above is a contract call made when you opened this panel, not a number written into the
              page. The per-market ones come from{' '}
              {t.market ? (
                <ContractLink address={t.market} label={t.symbol ?? shortAddress(t.market)} />
              ) : (
                'no market, because none is deployed to read'
              )}
              , the feed and dispute ones from the PriceOracleRegistry, the split from the FeeDistributor and the
              coverage ones from the InsuranceFund. Another
              market may be listed with a different bond, and these constants belong to the deployment you are looking
              at.
            </p>
          </>
        )}
      </div>
    </details>
  );
}

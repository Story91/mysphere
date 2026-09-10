'use client';

/**
 * Sezon volume mining - widok SHADOW (faza 1A): liczymy i pokazujemy,
 * NIE wyplacamy. Plakietka "shadow" siedzi w hero, a kazda liczba udzialu
 * dalej nosi swoj label "shadow" (wymog uczciwej komunikacji ze speca).
 * Breakdown "why this number" pokazuje kazdy krok epochMath: wolumen ->
 * wykluczenia -> sqrt -> mnoznik -> cap.
 *
 * Redesign 2026-08-31: jezyk wizualny z Overview - PageHero z wielkimi
 * tykajacymi liczbami (BigStat), leaderboard z paskiem udzialu w tle
 * wiersza i medalami dla podium, objasnienia wyprowadzone do /about.
 *
 * Wykres wg dataviz: jedna seria (tytul nazywa, bez legendy), cienkie slupki
 * z zaokraglonymi koncami 4px, recesywna siatka, tooltip na hover, etykiety
 * bezposrednie; kolor marki #7c6bda (paleta zwalidowana skryptem skilla).
 *
 * 2026-09-01: sekcja "Previous epochs" - zamkniete tygodnie z linkami do
 * kanonicznych manifestow (/api/sphere/epochs, publishEpoch.ts) i stanem
 * odbioru konta po wdrozeniu dystrybutora. Patrz komentarz przy
 * PastEpochsSection.
 *
 * ===========================================================================
 * 2026-09-10: "CO SIE STALO?" - CZTERY POPRAWKI
 * ===========================================================================
 *  1. PUSTY STAN MUSI SIE TLUMACZYC. Piec zerowych liczb w naglowku plus pusty
 *     wykres nad niepustym jest NIEODROZNIALNE od zepsutej strony - wlasciciel
 *     przyslal zrzut z pytaniem "co sie stalo?". Nic sie nie stalo: w epoce 4
 *     jedynym tokenem z obrotem jest SPHERE, a SPHERE jest wykluczony z
 *     wlasnego sezonu (EXCLUDED_TOKENS w epochMath), wiec sezonowi nie liczy
 *     sie nic. ZeroEpochNotice mowi to jednym zdaniem i znika SAM, gdy tylko
 *     jakikolwiek inny token zrobi transakcje (warunek: creators.length === 0).
 *  2. "funds the future pool" bylo obietnica, nie faktem. Przychod protokolu
 *     laduje na Safie 1/1 i trafia do puli TYLKO, gdy Safe tak zdecyduje -
 *     tokenomika (sekcja 4/5, Gate 0 pkt 2) wymaga oznaczania takich rzeczy
 *     jako uznaniowe. Podpis mowi teraz "discretionary".
 *  3. NUMERACJA EPOK. Epoka to okno 302 400 blokow liczone od bloku deployu
 *     pada (SEASON_GENESIS_BLOCK), a nie tydzien kalendarzowy - "Week 4"
 *     sugerowalo poniedzialek-niedziela i nie zgadzalo sie z niczym, co
 *     czytelnik moze sprawdzic. Wybor: mowimy "Epoch N" (ten sam indeks, co
 *     w API, manifestach i epochMath) I pokazujemy dokladne okno blokow z
 *     kotwica. Sam opis anchor-a nie wystarczyl, bo bez zakresu blokow nie da
 *     sie tego zweryfikowac na Basescanie; sam zakres bez zdania o kotwicy nie
 *     tlumaczy, skad sie wzial.
 *  4. KSIEGA PULI. Strona pokazywala wolne saldo dystrybutora i nic wiecej -
 *     ile faktycznie wyplacono, ile jeszcze wisi i co czeka w oknie weta bylo
 *     niewidoczne. PoolLedger czyta to wprost z kontraktu.
 */

import { useEffect, useMemo, useState } from 'react';
import { formatEther } from 'viem';
import { useAccount, usePublicClient } from 'wagmi';
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChevronDown, ChevronUp, Info, Loader2, Trophy } from 'lucide-react';
// Sezon liczy zrealizowane ETH z Base (/api/sphere/season, CHAIN_ID 8453) -
// etykieta nie moze podazac za wybrana siecia tablicy.
import { SPHERE_CHAIN, SPHERE_NATIVE_SYMBOL } from '../sphereChain';
import { SPHERE_DISTRIBUTOR_ADDRESS, SPHERE_SAFE_ADDRESS, sphereDistributorReadsAbi } from '../sphereConfig';
import { AddressPill, BigStat, Disclosure, LearnMore, PageHero } from '../SphereUI';
import { EPOCH_BLOCKS, SEASON_GENESIS_BLOCK } from './epochMath';
import SphereRewardsClaim, {
  TokenGlyph,
  useSphereDistributor,
  useTokenLogos,
  useTokenSymbols,
  type DistributorState,
} from './SphereRewardsClaim';

type SeasonToken = {
  token: string;
  symbol: string;
  externalVolumeEth: string;
  selfVolumeEth: string;
  uniqueTraders: number;
  traderMultiplierBps: number;
  ageEligible: boolean;
  weight: string;
  cappedWeight: string;
};

type SeasonCreator = {
  creator: string;
  shareBps: number;
  netProtocolEth: string;
  rewardCapEth: string;
  capBinding: boolean;
  tokens: SeasonToken[];
};

type SeasonData = {
  shadow: boolean;
  /** fromBlock/toBlock sa w odpowiedzi API od poczatku - teraz je pokazujemy. */
  epoch: { index: number; fromBlock: string; toBlock: string; endsAtUnix: string; progressBps: number };
  totals: { externalVolumeEth: string; protocolEth: string; creators: number; tokens: number };
  dailyVolumeEth: string[];
  /** Wolumen tokenow wykluczonych z sezonu (SPHERE) - prawdziwa historia handlu. */
  dailyExcludedVolumeEth?: string[];
  creators: SeasonCreator[];
};

/** Wiersz tablicy tworcow z manifestu - przepisany, nie przeliczony. */
type ManifestCreator = {
  creator: string;
  shareBps: number;
  netProtocolEth: string;
  rewardCapEth: string;
  /** Adresy tokenow tego tworcy (do ikonek) - bez wykluczonych z sezonu. */
  tokens: string[];
};

/** Ksztalt /api/sphere/epochs - podsumowania manifestow publishEpoch.ts. */
type EpochManifestSummary = {
  closedAtPublish: boolean;
  externalVolumeEth: string;
  protocolEth: string;
  creators: number;
  tokens: number;
  poolSphere: string;
  root: string | null;
  manifestHash: string;
  cumulative: Record<string, string>;
  board: ManifestCreator[];
  url: string;
};

type PastEpoch = { index: number; fromBlock: string; toBlock: string; manifest: EpochManifestSummary | null };

type EpochsData = { currentEpochIndex: number; epochs: PastEpoch[] };

/** Stan naleznosci konta w JEDNEJ epoce (tylko przy wdrozonym dystrybutorze). */
type AccountEpochLine = { accrued: bigint; status: 'claimed' | 'claimable' | 'streaming' };

const BRAND = '#7c6bda';

/** Podium czyta sie w jednej klatce - medal zamiast numeru. */
const MEDALS = ['🥇', '🥈', '🥉'];

function eth(wei: string, digits = 4) {
  return Number(formatEther(BigInt(wei))).toFixed(digits);
}

/** Wagi sa w jednostkach sqrt(wei) - pokazujemy bezwymiarowe punkty. */
function pts(weight: string) {
  return (Number(BigInt(weight)) / 1e9).toFixed(3);
}

function short(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/** Kwoty SPHERE (18 dec) - separatory tysiecy, bez ogona osiemnastu zer. */
function sphereAmt(wei: string | bigint, digits = 2) {
  return Number(formatEther(typeof wei === 'bigint' ? wei : BigInt(wei))).toLocaleString('en-US', {
    maximumFractionDigits: digits,
  });
}

/** Numery blokow z separatorem - 51,052,630 czyta sie, 51052630 nie. */
const blockNo = (b: string | bigint) => BigInt(b).toLocaleString('en-US');

const utcStamp = (ts: number) => new Date(ts * 1000).toISOString().slice(0, 16).replace('T', ' ');

/**
 * Odliczanie do konca epoki jako tekst - PageHero bierze tagline stringiem,
 * wiec hook zamiast komponentu. Wolany bezwarunkowo na gorze panelu (dane
 * moga byc jeszcze null), zeby nie lamac zasad hookow.
 */
function useEpochCountdown(endsAtUnix: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  if (!endsAtUnix) return undefined;
  const left = Number(endsAtUnix) * 1000 - now;
  if (left <= 0) return 'Closing now - final numbers settle in a moment';
  const d = Math.floor(left / 86_400_000);
  const h = Math.floor((left % 86_400_000) / 3_600_000);
  return `Ends in ${d}d ${h}h · shares settle when the epoch closes`;
}

function CreatorRow({ rank, c, logos }: { rank: number; c: SeasonCreator; logos: Record<string, string> }) {
  const [open, setOpen] = useState(false);
  const share = c.shareBps / 100;
  const podium = rank <= 3;
  const rankTone =
    rank === 1
      ? 'bg-amber-400/20 text-amber-600'
      : rank === 2
        ? 'bg-sp-shade/10 text-sp-shade/60'
        : rank === 3
          ? 'bg-orange-400/20 text-orange-600'
          : 'bg-sp-shade/5 text-sp-shade/45';

  return (
    <div className="overflow-hidden rounded-2xl bg-sp-shade/[0.03]">
      <div className="relative">
        {/* Pasek udzialu w tle wiersza: szerokosc = shareBps, prowadzacy
            widoczny bez czytania liczb. */}
        <div
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-sp-brand/25 to-sp-brand/[0.06] transition-[width] duration-700 ease-out"
          style={{ width: `${Math.min(share, 100)}%` }}
          aria-hidden="true"
        />
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="relative flex w-full items-center gap-3 px-3 py-2.5 text-left"
        >
          <span
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-extrabold ${rankTone}`}
          >
            {podium ? MEDALS[rank - 1] : rank}
          </span>
          {/* Ikonki tokenow przed adresem: token jest tym, co czytelnik
              rozpoznaje, adres tworcy nie. Fallback na inicjal symbolu. */}
          <span className="flex shrink-0 -space-x-1.5">
            {c.tokens.slice(0, 4).map((t) => (
              <TokenGlyph key={t.token} url={logos[t.token.toLowerCase()]} symbol={t.symbol} />
            ))}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-mono text-[12.5px] font-extrabold text-sp-ink">{short(c.creator)}</span>
            <span className="block truncate text-[10.5px] text-sp-shade/45">{c.tokens.map((t) => t.symbol).join(' · ')}</span>
          </span>
          <span className="shrink-0 text-right">
            <span className="font-soft-display text-[17px] font-extrabold leading-none text-sp-ink">{share.toFixed(2)}%</span>
            <span className="mt-0.5 block text-[9.5px] font-bold uppercase tracking-[0.06em] text-sp-shade/40">pool share · shadow</span>
          </span>
          <span className="hidden shrink-0 text-right sm:block">
            <span className="font-mono text-[12px] font-bold text-sp-ink">{eth(c.rewardCapEth)}</span>
            <span className="mt-0.5 block text-[9.5px] font-bold uppercase tracking-[0.06em] text-sp-shade/40">reward cap ({SPHERE_NATIVE_SYMBOL})</span>
          </span>
          {open ? (
            <ChevronUp className="h-4 w-4 shrink-0 text-sp-shade/40" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-4 w-4 shrink-0 text-sp-shade/40" aria-hidden="true" />
          )}
        </button>
      </div>

      <div className="sph-collapse" data-open={open} aria-hidden={!open}>
        <div className="px-3 pb-3">
          <p className="mb-2 text-[10.5px] font-bold text-sp-shade/55">
            Why this number - every step of the public formula:
          </p>
          <div className="grid gap-2">
            {c.tokens.map((t) => (
              <div key={t.token} className="grid gap-x-4 gap-y-0.5 rounded-lg bg-sp-surface p-2.5 text-[11px] sm:grid-cols-2">
                <span className="font-extrabold text-sp-ink">{t.symbol}</span>
                <span className="text-sp-shade/60">external volume: <b>{eth(t.externalVolumeEth, 3)} {SPHERE_NATIVE_SYMBOL}</b></span>
                <span className="text-sp-shade/60">excluded self-volume: <b>{eth(t.selfVolumeEth, 3)}</b></span>
                <span className="text-sp-shade/60">unique traders: <b>{t.uniqueTraders}</b> → multiplier <b>{(t.traderMultiplierBps / 10_000).toFixed(1)}×</b></span>
                <span className="text-sp-shade/60">age gate (48h): <b>{t.ageEligible ? 'eligible' : 'not yet'}</b></span>
                <span className="text-sp-shade/60">weight √vol×mult: <b>{pts(t.weight)} pts</b> → after pool cap: <b>{pts(t.cappedWeight)} pts</b></span>
              </div>
            ))}
          </div>
          <p className="mt-2 flex items-start gap-1.5 text-[10.5px] text-sp-shade/55">
            <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
            Reward never exceeds 30% of the fees this creator&apos;s tokens actually contributed to the
            protocol this epoch ({eth(c.netProtocolEth)} {SPHERE_NATIVE_SYMBOL} contributed → cap {eth(c.rewardCapEth)} {SPHERE_NATIVE_SYMBOL}
            {c.capBinding ? ' - cap is binding for this creator' : ''}). Wash trading pays more in fees than it can ever get back.
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * ZEROWA EPOKA, WYTLUMACZONA. Warunek to `creators.length === 0` - dokladnie
 * to, co robi z danych zero w naglowku - wiec komunikat znika SAM, gdy tylko
 * jakikolwiek punktowany token zrobi obrot. Zadnej flagi do recznego gaszenia.
 *
 * Nazwa "SPHERE" jest tu uzasadniona: EXCLUDED_TOKENS w epochMath zawiera
 * dokladnie jeden adres i jest CZESCIA publicznego algorytmu (wchodzi w
 * algorithmHash manifestu), wiec nie zmieni sie po cichu.
 */
function ZeroEpochNotice({
  data,
  scoredTokens,
  excludedVolumeWei,
}: {
  data: SeasonData;
  scoredTokens: number;
  excludedVolumeWei: bigint;
}) {
  const excludedTokens = Math.max(0, data.totals.tokens - scoredTokens);
  const nothingAtAll = data.totals.tokens === 0;
  return (
    <section className="sph-card rounded-[20px] border border-sp-brand/25 bg-sp-brand/[0.05] p-4 sm:p-5">
      <h3 className="flex items-center gap-2 text-[13.5px] font-extrabold text-sp-ink">
        <Info className="h-4 w-4 text-sp-brand" aria-hidden="true" />
        Nothing scored this epoch - and that is the real number, not a broken page
      </h3>
      <p className="mt-1.5 text-[11.5px] leading-relaxed text-sp-shade/60">
        {nothingAtAll ? (
          <>
            Not a single curve trade happened on the launchpad between blocks {blockNo(data.epoch.fromBlock)} and{' '}
            {blockNo(data.epoch.toBlock)}, so external volume, protocol revenue, creators and tokens are all genuinely 0.
          </>
        ) : (
          <>
            {excludedTokens === 1 ? 'The only token' : `All ${excludedTokens} tokens`} with any activity between blocks{' '}
            {blockNo(data.epoch.fromBlock)} and {blockNo(data.epoch.toBlock)}{' '}
            {excludedTokens === 1 ? 'is SPHERE itself, and SPHERE is' : 'are excluded tokens, and they are'} barred from
            its own season so the protocol cannot farm its own creator rewards - which is why external volume, protocol
            revenue and creator count all read 0.
            {excludedVolumeWei > 0n && (
              <>
                {' '}
                SPHERE&apos;s real trading this epoch, {Number(formatEther(excludedVolumeWei)).toFixed(4)}{' '}
                {SPHERE_NATIVE_SYMBOL}, is charted below under &quot;excluded from season scoring&quot;.
              </>
            )}
          </>
        )}
      </p>
      <p className="mt-1.5 text-[10.5px] text-sp-shade/45">
        The moment any other token trades on the curve, it scores, the leaderboard fills and this notice disappears on
        its own. Rewards already streaming from earlier epochs are unaffected - see the ledger below.
      </p>
    </section>
  );
}

/**
 * KSIEGA PULI - odpowiedz na "ile z tego naprawde wyplacono?".
 *
 * Kazda liczba to odczyt z SphereStreamingMerkleDistributor (useSphereDistributor):
 * saldo tokena, totalCumulative, totalClaimed i pending(). Nic tu nie jest
 * szacowane ani wpisane recznie - dlatego karta pokazuje adres kontraktu obok
 * naglowka, zeby kazda pozycje dalo sie odbic na Basescanie.
 */
function PoolLedger({ dist }: { dist: DistributorState | null }) {
  if (!dist || !SPHERE_DISTRIBUTOR_ADDRESS) return null;
  const owed = dist.totalCumulative > dist.totalClaimed ? dist.totalCumulative - dist.totalClaimed : 0n;
  // Procent wyplacony liczymy w bigincie (bez floata na 18 decimals).
  const paidPct =
    dist.totalCumulative > 0n ? Number((dist.totalClaimed * 10_000n) / dist.totalCumulative) / 100 : 0;
  const pendingDelta =
    dist.pendingValidAt > 0 && dist.pendingTotalCumulative > dist.totalCumulative
      ? dist.pendingTotalCumulative - dist.totalCumulative
      : 0n;

  const tiles: { label: string; value: string; hint: string }[] = [
    {
      label: 'Distributor holds',
      value: sphereAmt(dist.balance),
      hint: 'SPHERE sitting in the contract',
    },
    {
      label: 'Allocated to creators',
      value: sphereAmt(dist.totalCumulative),
      hint: `cumulative after ${dist.epochId} paid epoch${dist.epochId === 1 ? '' : 's'}`,
    },
    {
      label: 'Claimed so far',
      value: sphereAmt(dist.totalClaimed),
      hint: `${paidPct.toFixed(2)}% of what is allocated`,
    },
    {
      label: 'Allocated, unclaimed',
      value: sphereAmt(owed),
      hint: 'streaming or waiting for a claim',
    },
    {
      label: 'Free pool',
      value: sphereAmt(dist.poolFree, 0),
      hint: 'balance minus what is owed - funds the next epochs',
    },
    {
      label: pendingDelta > 0n ? 'Proposed, not yet live' : 'Nothing proposed',
      value: pendingDelta > 0n ? sphereAmt(pendingDelta) : '0',
      hint:
        pendingDelta > 0n
          ? `epoch #${dist.pendingEpochId} · claimable from ${utcStamp(dist.pendingValidAt)} UTC`
          : 'no root is waiting in the veto window',
    },
  ];

  return (
    <section className="sph-card rounded-[20px] border border-sp-shade/10 bg-sp-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[13.5px] font-extrabold text-sp-ink">Reward pool ledger (SPHERE)</h3>
        <AddressPill address={SPHERE_DISTRIBUTOR_ADDRESS} label="distributor" />
      </div>
      <p className="mt-0.5 text-[10.5px] text-sp-shade/50">
        Every figure is a live read from the distributor contract - balance, cumulative allocation, claims and the
        proposed root. Nothing on this card is estimated.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-2xl bg-sp-sunken p-3">
            <p className="text-[9.5px] font-extrabold uppercase tracking-[0.08em] text-sp-shade/45">{t.label}</p>
            <p className="mt-1 font-soft-display text-[17px] font-extrabold leading-none text-sp-ink">{t.value}</p>
            <p className="mt-1 text-[9.5px] font-bold leading-snug text-sp-shade/40">{t.hint}</p>
          </div>
        ))}
      </div>

      {/* Ile z obiecanego naprawde wyszlo - jeden pasek zamiast akapitu. */}
      <div className="mt-3 flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-sp-shade/10">
          <div className="h-full rounded-full bg-sp-up transition-[width] duration-700" style={{ width: `${Math.min(100, paidPct)}%` }} />
        </div>
        <span className="shrink-0 text-[10px] font-extrabold uppercase tracking-[0.08em] text-sp-shade/45">
          {sphereAmt(dist.totalClaimed)} / {sphereAmt(dist.totalCumulative)} paid out
        </span>
      </div>
      <p className="mt-2 text-[10.5px] text-sp-shade/45">
        Active root: epoch #{dist.epochId}, activated {utcStamp(dist.activatedAt)} UTC, unlocking linearly over{' '}
        {Math.round(dist.streamSeconds / 86_400)} days. Veto window before any root goes live:{' '}
        {Math.round(dist.minDelaySeconds / 3600)}h, immutable in the contract.
      </p>
    </section>
  );
}

/** Mala statystyka w wierszu epoki - odpowiednik kolumn leaderboardu. */
function EpochStat({ label, value }: { label: string; value: string | number }) {
  return (
    <span className="text-right">
      <span className="block font-mono text-[12px] font-bold text-sp-ink">{value}</span>
      <span className="block text-[9.5px] font-bold uppercase tracking-[0.06em] text-sp-shade/40">{label}</span>
    </span>
  );
}

function PastEpochRow({ e, line }: { e: PastEpoch; line: AccountEpochLine | null }) {
  const m = e.manifest;
  return (
    <div className="rounded-2xl bg-sp-shade/[0.03] px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
        <span className="min-w-[104px]">
          <span className="block text-[13px] font-extrabold text-sp-ink">Epoch {e.index}</span>
          <span className="block font-mono text-[9.5px] text-sp-shade/40">
            #{blockNo(e.fromBlock)} – #{blockNo(e.toBlock)}
          </span>
        </span>
        {m ? (
          <>
            <EpochStat label={`volume (${SPHERE_NATIVE_SYMBOL})`} value={eth(m.externalVolumeEth, 3)} />
            <EpochStat label={`protocol (${SPHERE_NATIVE_SYMBOL})`} value={eth(m.protocolEth, 4)} />
            <EpochStat label="creators" value={m.creators} />
            <EpochStat
              label={m.poolSphere === '0' ? 'pool · shadow' : 'pool (SPHERE)'}
              value={m.poolSphere === '0' ? '0' : sphereAmt(m.poolSphere, 0)}
            />
            <a
              href={m.url}
              target="_blank"
              rel="noreferrer"
              className="ml-auto shrink-0 text-[10.5px] font-extrabold text-sp-shade/45 transition-colors hover:text-sp-brand"
            >
              Manifest ↗
            </a>
          </>
        ) : (
          <span className="text-[10.5px] font-bold text-sp-shade/40">
            Manifest not published yet - the epoch can be recomputed from Base logs with the public formula at any time.
          </span>
        )}
      </div>
      {m && !m.closedAtPublish && (
        <p className="mt-1.5 text-[10px] font-bold text-sp-shade/40">
          Published as a mid-epoch snapshot - final numbers land when the closed epoch is republished.
        </p>
      )}
      {line && (
        <p className={`mt-1.5 text-[10.5px] font-bold ${line.status === 'claimed' ? 'text-sp-up' : 'text-sp-brand'}`}>
          Your accrual: {sphereAmt(line.accrued)} SPHERE ·{' '}
          {line.status === 'claimed'
            ? 'claimed in full'
            : line.status === 'streaming'
              ? 'streaming - unlocks linearly through this epoch'
              : 'claimable now - no deadline while this root is active'}
        </p>
      )}
    </div>
  );
}

/**
 * "Previous epochs" - zamkniete epoki sezonu z linkami do kanonicznych
 * manifestow (publishEpoch.ts) i podsumowaniem per epoka.
 *
 * KOMUNIKACJA GWARANCJI (spec 6.1) - POPRAWIONA 2026-09-10. Bylo: "nagrody
 * NIGDY nie przepadaja". To jest mocniejsze niz kontrakt. Co naprawde daje
 * SphereStreamingMerkleDistributor.sol:
 *   - `propose` odrzuca root o mniejszym totalCumulative (ShrinkingTotal),
 *     wiec GLOBALNA suma nie moze sie skurczyc;
 *   - `claim` weryfikuje proof przeciw AKTYWNEMU rootowi, wiec saldo
 *     KONKRETNEGO konta jedzie dalej tylko wtedy, gdy proposer wpisze je do
 *     kolejnego roota.
 * Czyli: nie ma zegara wygasania, ale nie ma tez on-chainowej gwarancji
 * przeniesienia salda. Mowimy oba zdania.
 *
 * Przyrost naleznosci konta per epoka liczymy z map `cumulative` manifestow
 * (cum_N - cum poprzedniego roota), status z jednego skalara
 * claimed(account) - kumulatywnosc rozlicza epoki od najstarszej. Osobisty
 * stan odbioru i przycisk Claim mieszkaja w karcie "Your SPHERE rewards"
 * wyzej (SphereRewardsClaim) - tu tylko historia per epoka.
 */
function PastEpochsSection({ data, failed }: { data: EpochsData | null; failed: boolean }) {
  const readClient = usePublicClient({ chainId: SPHERE_CHAIN.id });
  const { address: account } = useAccount();
  const [claimedAmt, setClaimedAmt] = useState<bigint | null>(null);

  // Najnowszy opublikowany root (API zwraca epoki malejaco) - z map
  // cumulative liczy sie przyrost konta per epoka.
  const rootedDesc = useMemo(() => (data?.epochs ?? []).filter((e) => e.manifest?.root), [data]);

  useEffect(() => {
    const dist = SPHERE_DISTRIBUTOR_ADDRESS;
    if (!dist || !readClient || !account || rootedDesc.length === 0) return;
    let alive = true;
    const load = async () => {
      try {
        const c = (await readClient.readContract({
          address: dist,
          abi: sphereDistributorReadsAbi,
          functionName: 'claimed',
          args: [account],
        })) as bigint;
        if (alive) setClaimedAmt(c);
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
  }, [readClient, account, rootedDesc]);

  const accountLines = useMemo(() => {
    const lines = new Map<number, AccountEpochLine>();
    if (!SPHERE_DISTRIBUTOR_ADDRESS || !account || claimedAmt === null || rootedDesc.length === 0) return lines;
    const key = account.toLowerCase();
    const rootedAsc = [...rootedDesc].sort((a, b) => a.index - b.index);
    const newest = rootedAsc[rootedAsc.length - 1].index;
    let prev = 0n;
    for (const e of rootedAsc) {
      const cum = BigInt(e.manifest!.cumulative[key] ?? '0');
      if (cum > prev) {
        lines.set(e.index, {
          accrued: cum - prev,
          status: claimedAmt >= cum ? 'claimed' : e.index === newest ? 'streaming' : 'claimable',
        });
      }
      prev = cum;
    }
    return lines;
  }, [account, claimedAmt, rootedDesc]);

  return (
    <section className="sph-card rounded-[20px] border border-sp-shade/10 bg-sp-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[13.5px] font-extrabold text-sp-ink">Previous epochs</h3>
        <span className="rounded-full bg-sp-up/10 px-2.5 py-1 text-[9.5px] font-extrabold uppercase tracking-[0.08em] text-sp-up">
          Cumulative · no claim deadline
        </span>
      </div>
      {/* Fakt z liczbami zostaje na wierzchu, wyprowadzenie schodzi do rozwijki
          - ten sam akapit o ShrinkingTotal stal juz w karcie Claim wyzej. */}
      <p className="mt-0.5 text-[10.5px] text-sp-shade/50">
        {EPOCH_BLOCKS.toLocaleString('en-US')}-block windows from deploy block {blockNo(SEASON_GENESIS_BLOCK)}, one
        canonical manifest each.
      </p>

      <div className="mt-3 grid gap-1.5">
        {failed ? (
          <p className="py-6 text-center text-[12px] text-sp-shade/45">Epoch history unavailable - retry in a moment.</p>
        ) : !data ? (
          <p className="flex items-center justify-center gap-2 py-6 text-center text-[12px] text-sp-shade/45">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading closed epochs…
          </p>
        ) : data.epochs.length === 0 ? (
          <p className="py-6 text-center text-[12px] text-sp-shade/45">
            The first epoch is still running - closed epochs will appear here with their manifests.
          </p>
        ) : (
          data.epochs.map((e) => <PastEpochRow key={e.index} e={e} line={accountLines.get(e.index) ?? null} />)
        )}
      </div>

      <div className="mt-3">
        <Disclosure summary="Why every epoch is a block window, and what &quot;cumulative&quot; buys you">
          <p>
            An epoch is a fixed window of {EPOCH_BLOCKS.toLocaleString('en-US')} blocks counted from launchpad deploy
            block {blockNo(SEASON_GENESIS_BLOCK)} - not a calendar week - so anyone can recompute it from Base logs with
            the public formula.
          </p>
          <p className="mt-2">
            Rewards are cumulative: one claim collects everything accrued under the active root, and nothing forces you
            to claim every epoch. What the contract enforces is that a new root may not carry a smaller total than the
            one before it (<span className="font-mono">ShrinkingTotal</span>); carrying your own balance forward is the
            proposer&apos;s job, not the contract&apos;s.
          </p>
        </Disclosure>
      </div>
    </section>
  );
}


/** Wiersz tablicy ZAMKNIETEJ epoki - wszystkie liczby wprost z manifestu. */
function PastCreatorRow({
  rank,
  c,
  logos,
  symbols,
}: {
  rank: number;
  c: ManifestCreator;
  logos: Record<string, string>;
  symbols: Record<string, string>;
}) {
  const share = c.shareBps / 100;
  const podium = rank <= 3;
  const rankTone =
    rank === 1
      ? 'bg-amber-400/20 text-amber-600'
      : rank === 2
        ? 'bg-sp-shade/10 text-sp-shade/60'
        : rank === 3
          ? 'bg-orange-400/20 text-orange-600'
          : 'bg-sp-shade/5 text-sp-shade/45';
  return (
    <div className="relative overflow-hidden rounded-2xl bg-sp-shade/[0.03]">
      <div
        className="absolute inset-y-0 left-0 bg-gradient-to-r from-sp-brand/25 to-sp-brand/[0.06]"
        style={{ width: `${Math.min(share, 100)}%` }}
        aria-hidden="true"
      />
      <div className="relative flex items-center gap-3 px-3 py-2.5">
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-extrabold ${rankTone}`}>
          {podium ? MEDALS[rank - 1] : rank}
        </span>
        <span className="flex shrink-0 -space-x-1.5">
          {c.tokens.slice(0, 4).map((t) => (
            <TokenGlyph key={t} url={logos[t]} symbol={symbols[t] ?? '?'} />
          ))}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-mono text-[12.5px] font-extrabold text-sp-ink">{short(c.creator)}</span>
          <span className="block truncate text-[10.5px] text-sp-shade/45">
            {c.tokens.map((t) => symbols[t] ?? `${t.slice(0, 6)}…`).join(' · ') || 'carried over'}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="font-soft-display text-[17px] font-extrabold leading-none text-sp-ink">{share.toFixed(2)}%</span>
          <span className="mt-0.5 block text-[9.5px] font-bold uppercase tracking-[0.06em] text-sp-shade/40">pool share</span>
        </span>
        <span className="hidden shrink-0 text-right sm:block">
          <span className="font-mono text-[12px] font-bold text-sp-ink">{eth(c.rewardCapEth)}</span>
          <span className="mt-0.5 block text-[9.5px] font-bold uppercase tracking-[0.06em] text-sp-shade/40">
            reward cap ({SPHERE_NATIVE_SYMBOL})
          </span>
        </span>
      </div>
    </div>
  );
}

/**
 * TABLICA TWORCOW - Z ZAPASEM NA CICHY TYDZIEN.
 *
 * Wlasciciel zglosil "leaderboard zniknal". Nie zniknal: w epoce 4 nie
 * zapunktowal ANI JEDEN tworca (jedyny token z obrotem to SPHERE, wykluczony
 * z wlasnego sezonu), wiec tablica renderowala uczciwy pusty stan. Uczciwy
 * i bezuzyteczny - strona, ktorej glowna tabela stoi pusta przez caly cichy
 * tydzien, czyta sie jak zepsuta.
 *
 * Dlatego przy pustej epoce biezacej pokazujemy OSTATNIA epoke, ktora
 * cokolwiek punktowala - z manifestu (/api/sphere/epochs), z jawna etykieta,
 * ktorej epoki dotyczy, i z przelacznikiem z powrotem na biezaca. Zaden
 * wiersz nie udaje biezacego: naglowek nad tablica nazywa epoke, a liczby
 * pochodza z opublikowanego manifestu, nie z przeliczenia w przegladarce.
 */
function LeaderboardSection({
  data,
  scoredTokens,
  epochs,
  logos,
}: {
  data: SeasonData | null;
  scoredTokens: number;
  epochs: EpochsData | null;
  logos: Record<string, string>;
}) {
  const [manual, setManual] = useState<'current' | 'past' | null>(null);

  // Najnowsza zamknieta epoka, ktora ma manifest Z TWORCAMI. API oddaje epoki
  // malejaco, wiec pierwsze trafienie jest najnowszym.
  const fallback = useMemo(
    () => (epochs?.epochs ?? []).find((e) => (e.manifest?.board?.length ?? 0) > 0) ?? null,
    [epochs]
  );

  const liveRows = data?.creators ?? [];
  const hasLive = liveRows.length > 0;
  const view = manual ?? (hasLive || !fallback ? 'current' : 'past');
  // useMemo, a nie `?? []`: swiezy pusty literal w kazdym renderze przeganialby
  // useMemo nizej, a ten karmi hooka od symboli (czyli odczyty z lancucha).
  const pastBoard = useMemo(() => fallback?.manifest?.board ?? [], [fallback]);

  const symbolTokens = useMemo(() => pastBoard.flatMap((c) => c.tokens), [pastBoard]);
  const symbols = useTokenSymbols(symbolTokens);

  const showingPast = view === 'past' && fallback !== null;

  return (
    <section className="sph-card rounded-[20px] border border-sp-shade/10 bg-sp-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[13.5px] font-extrabold text-sp-ink">Creator leaderboard</h3>
        <a
          href={showingPast ? (fallback!.manifest!.url as string) : '/api/sphere/season'}
          target="_blank"
          rel="noreferrer"
          className="text-[10.5px] font-extrabold text-sp-shade/45 transition-colors hover:text-sp-brand"
        >
          Verify the math (raw data) ↗
        </a>
      </div>

      {/* Przelacznik pokazuje sie DOPIERO, gdy jest miedzy czym wybierac -
          przy zwyklym tygodniu nie ma go wcale. */}
      {data && fallback && (
        <div className="mt-2 inline-flex rounded-full bg-sp-shade/[0.06] p-0.5">
          {[
            { k: 'current' as const, label: `Epoch ${data.epoch.index}${hasLive ? '' : ' · empty'}` },
            { k: 'past' as const, label: `Epoch ${fallback.index} · last with scoring creators` },
          ].map((t) => (
            <button
              key={t.k}
              type="button"
              onClick={() => setManual(t.k)}
              className={`rounded-full px-3 py-1 text-[10.5px] font-extrabold transition-colors ${
                view === t.k ? 'bg-sp-surface text-sp-ink shadow-sm' : 'text-sp-shade/45 hover:text-sp-brand'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      <p className="mt-1.5 text-[10.5px] text-sp-shade/50">
        {showingPast ? (
          <>
            Closed epoch {fallback!.index}, straight from its published manifest - blocks {blockNo(fallback!.fromBlock)} –{' '}
            {blockNo(fallback!.toBlock)}.
          </>
        ) : (
          'Tap a row for every step behind its share.'
        )}
      </p>

      <div className="mt-3 grid gap-1.5">
        {!data ? (
          <p className="flex items-center justify-center gap-2 py-8 text-center text-[12px] text-sp-shade/45">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Indexing this epoch&apos;s volume from Base…
          </p>
        ) : showingPast ? (
          pastBoard.map((c, i) => (
            <PastCreatorRow key={c.creator} rank={i + 1} c={c} logos={logos} symbols={symbols} />
          ))
        ) : hasLive ? (
          liveRows.map((c, i) => <CreatorRow key={c.creator} rank={i + 1} c={c} logos={logos} />)
        ) : (
          <p className="py-8 text-center text-[12px] text-sp-shade/45">
            No creator scored in epoch {data.epoch.index}:{' '}
            {data.totals.tokens === 0
              ? 'no token traded on the curve'
              : `the only ${data.totals.tokens - scoredTokens === 1 ? 'token' : 'tokens'} with volume ${data.totals.tokens - scoredTokens === 1 ? 'is' : 'are'} excluded from scoring`}
            . The board fills as soon as an eligible token trades.
          </p>
        )}
      </div>

      {showingPast && (
        <p className="mt-2 text-[10.5px] font-bold text-sp-shade/45">
          Epoch {data?.epoch.index} is still running and nothing has scored in it yet - switch back above to watch it
          fill.
        </p>
      )}
    </section>
  );
}

export default function SphereSeasonPanel() {
  const [data, setData] = useState<SeasonData | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Stan dystrybutora: plakietka shadow/live w naglowku + karta Claim + ksiega.
  const dist = useSphereDistributor();
  // Logo tokenow - jedna mapa na cala strone (tablica, historia, Claim).
  const logos = useTokenLogos();

  /**
   * Historia epok wisi TERAZ NA PANELU, nie w "Previous epochs": tych samych
   * manifestow potrzebuje tablica tworcow, zeby miec co pokazac w cichym
   * tygodniu. Jeden fetch zamiast dwoch takich samych.
   */
  const [epochs, setEpochs] = useState<EpochsData | null>(null);
  const [epochsFailed, setEpochsFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch('/api/sphere/epochs')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: EpochsData) => {
        if (alive) setEpochs(d);
      })
      .catch(() => {
        if (alive) setEpochsFailed(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch('/api/sphere/season');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as SeasonData;
        if (alive) {
          setData(json);
          setError(null);
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      }
    };
    void load();
    const t = setInterval(load, 120_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  /**
   * DZIEN, KTORY SIE NIE WYDARZYL, TO NIE JEST DZIEN Z ZEREM.
   *
   * Obie serie mialy zawsze siedem slupkow, a epoka trwa tydzien - wiec w
   * drugiej dobie dni 3-7 stały puste i czytalo sie to jako "brak danych" albo
   * wrecz "wykres sie zepsul" (zgloszone: "nie ma dnia 3 i 4"). Dni przyszle sa
   * teraz oznaczone i podpisane, a os mowi, ktory dzien trwa TERAZ.
   */
  const elapsedDays = data ? Math.min(7, Math.floor((data.epoch.progressBps / 10_000) * 7) + 1) : 7;
  const chartData = useMemo(
    () =>
      (data?.dailyVolumeEth ?? []).map((v, i) => ({
        day: `Day ${i + 1}`,
        dayLabel: data && i + 1 === elapsedDays ? `Day ${i + 1} · now` : `Day ${i + 1}`,
        future: data ? i + 1 > elapsedDays : false,
        volume: Number(formatEther(BigInt(v))),
        sphere: Number(formatEther(BigInt(data?.dailyExcludedVolumeEth?.[i] ?? '0'))),
      })),
    [data, elapsedDays]
  );
  /** Ile dni epoki juz minelo - do podpisow pod obydwoma wykresami. */
  const futureDays = Math.max(0, 7 - elapsedDays);
  const hasExcluded = chartData.some((d) => d.sphere > 0);
  /** Suma wolumenu wykluczonego - do zdania w ZeroEpochNotice. */
  const excludedVolumeWei = useMemo(
    () => (data?.dailyExcludedVolumeEth ?? []).reduce((a, v) => a + BigInt(v), 0n),
    [data]
  );
  /**
   * Tokeny PUNKTOWANE vs tokeny Z OBROTEM. API oddaje w totals.tokens wszystko,
   * co mialo aktywnosc (razem z wykluczonymi), a creators[] powstaje juz PO
   * wykluczeniach - roznica tych dwoch liczb to caly powod, dla ktorego
   * naglowek pokazywal "tokens 1, creators 0" i wygladalo to na awarie.
   */
  const scoredTokens = useMemo(
    () => (data ? data.creators.reduce((a, c) => a + c.tokens.length, 0) : 0),
    [data]
  );

  const countdown = useEpochCountdown(data?.epoch.endsAtUnix ?? null);

  if (error) {
    return (
      <p className="rounded-[20px] border border-sp-shade/10 bg-sp-surface p-5 text-[12.5px] text-sp-down">
        Season data unavailable: {error}. The indexer scans Base logs - retry in a moment.
      </p>
    );
  }

  // Jeden uklad na oba stany: dopoki dane nie dojada, BigStat dostaje null
  // i sam rysuje szkielet - strona "stoi" w docelowym ksztalcie (layout
  // shift = 0), bez osobnego bloku szkieletow.
  const totals = data?.totals ?? null;
  const progress = data ? data.epoch.progressBps / 100 : 0;

  return (
    <div className="sph-stagger grid gap-4">
      {/* HERO: epoka, odliczanie i szesc wielkich liczb --------------------- */}
      <PageHero
        // "Epoch N", nie "Week N": okno liczy sie w BLOKACH od deployu pada,
        // wiec nie pokrywa sie z tygodniem kalendarzowym - patrz naglowek pliku.
        title={data ? `Epoch ${data.epoch.index}` : 'This epoch'}
        tagline={countdown}
        icon={<Trophy className="h-6 w-6 text-sp-brand" aria-hidden="true" />}
        badge={
          <span className="rounded-full bg-sp-brand/10 px-2.5 py-1 text-[9.5px] font-extrabold uppercase tracking-[0.08em] text-sp-brand">
            {dist?.live ? `Live · epoch #${dist.epochId} streaming` : dist && dist.pendingValidAt > 0 ? 'First paid epoch proposed · veto window' : 'Shadow - no payouts yet'}
          </span>
        }
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {/* Pula nagrod na pierwszym miejscu: od 6.09.2026 (8.34M ze skarbca) to
              jest liczba, po ktora tworca tu przychodzi. Wolne saldo dystrybutora,
              czyli dokladnie to, co automat wezmie jako pule nastepnej epoki. */}
          <BigStat
            label="Reward pool (SPHERE)"
            value={dist ? Number(formatEther(dist.poolFree)) : null}
            decimals={0}
            tone="brand"
            hint="free balance · funds the next epochs"
          />
          {/* Dwie liczby, ktore NIE sa zerem nawet w cichej epoce - naglowek
              przestaje wygladac na martwy, a obie sa odczytem z kontraktu. */}
          <BigStat
            label="Paid to creators (SPHERE)"
            value={dist ? Number(formatEther(dist.totalClaimed)) : null}
            decimals={2}
            tone="up"
            hint={
              dist && dist.totalCumulative > 0n
                ? `of ${sphereAmt(dist.totalCumulative)} allocated so far`
                : 'claimed from the distributor'
            }
          />
          <BigStat
            label={`External volume (${SPHERE_NATIVE_SYMBOL})`}
            value={totals ? Number(formatEther(BigInt(totals.externalVolumeEth))) : null}
            decimals={4}
            hint="this epoch · self-trades and SPHERE excluded"
          />
          <BigStat
            label={`Protocol revenue (${SPHERE_NATIVE_SYMBOL})`}
            value={totals ? Number(formatEther(BigInt(totals.protocolEth))) : null}
            decimals={4}
            // BYLO: "funds the future pool" - obietnica, ktorej nikt nie
            // egzekwuje on-chain. Przychod ida na Safe 1/1; zasilenie puli
            // jest decyzja Safe'a, wiec podpis mowi "discretionary".
            hint="this epoch · collected by the Safe · funding the pool is discretionary"
          />
          <BigStat label="Creators" value={totals ? totals.creators : null} decimals={0} hint="scoring this epoch" />
          <BigStat
            label="Tokens scoring"
            value={data ? scoredTokens : null}
            decimals={0}
            hint={totals ? `of ${totals.tokens} with volume · >48h old to enter` : '>48h old to enter'}
          />
        </div>

        {/* Pasek postepu epoki - zegar sezonu pod liczbami. */}
        <div className="mt-3 flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/60">
            <div className="sph-progress h-full rounded-full bg-sp-brand" style={{ width: `${progress}%` }} />
          </div>
          <span className="shrink-0 text-[10px] font-extrabold uppercase tracking-[0.08em] text-sp-shade/45">
            {data ? `${progress.toFixed(2)}% elapsed` : 'syncing'}
          </span>
        </div>

        {/* KOTWICA EPOKI: dokladne okno blokow. Bez tego "Epoch 4" jest slowem,
            ktorego czytelnik nie moze sprawdzic. Zdanie o tym, ze to okno
            BLOKOW, a nie tydzien kalendarzowy, zeszlo do rozwijki w "Previous
            epochs" - tu zostaja same liczby, ktore da sie odbic na Basescanie. */}
        {data && (
          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10.5px] text-sp-shade/45">
            <span className="font-mono">
              blocks {blockNo(data.epoch.fromBlock)} – {blockNo(data.epoch.toBlock)}
            </span>
            <span>
              · {EPOCH_BLOCKS.toLocaleString('en-US')}-block window from deploy block {blockNo(SEASON_GENESIS_BLOCK)}
            </span>
            <AddressPill address={SPHERE_SAFE_ADDRESS} label="revenue safe" />
          </p>
        )}
      </PageHero>

      {/* PUSTY STAN, KTORY SIE TLUMACZY - znika sam, gdy cokolwiek zapunktuje. */}
      {data && data.creators.length === 0 && (
        <ZeroEpochNotice data={data} scoredTokens={scoredTokens} excludedVolumeWei={excludedVolumeWei} />
      )}

      {/* KSIEGA PULI: ile obiecane, ile wyplacone, ile czeka --------------- */}
      <PoolLedger dist={dist} />

      {/* WYKRES: wolumen dzienny --------------------------------------------- */}
      <section className="sph-card rounded-[20px] border border-sp-shade/10 bg-sp-surface p-4 sm:p-5">
        <h3 className="text-[13.5px] font-extrabold text-sp-ink">Daily external volume ({SPHERE_NATIVE_SYMBOL})</h3>
        <p className="mt-0.5 text-[10.5px] text-sp-shade/50">Season-eligible volume: creators&apos; tokens, self-trades excluded.</p>
        <div className="mt-3 h-56 w-full">
          {data ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 18, right: 8, left: 0, bottom: 0 }} barCategoryGap="28%">
                <CartesianGrid vertical={false} stroke="rgba(0,0,0,0.06)" />
                <XAxis dataKey="dayLabel" tickLine={false} axisLine={false} tick={{ fontSize: 10.5, fill: 'rgba(0,0,0,0.45)' }} />
                <YAxis width={44} tickLine={false} axisLine={false} tick={{ fontSize: 10.5, fill: 'rgba(0,0,0,0.45)' }} />
                <Tooltip
                  cursor={{ fill: 'rgba(124,107,218,0.08)' }}
                  formatter={(v: number) => [`${v.toFixed(4)} ${SPHERE_NATIVE_SYMBOL}`, 'Volume']}
                  contentStyle={{ borderRadius: 12, border: '1px solid rgba(0,0,0,0.1)', fontSize: 11.5 }}
                />
                <Bar dataKey="volume" fill={BRAND} radius={[4, 4, 0, 0]} maxBarSize={40}>
                  <LabelList
                    dataKey="volume"
                    position="top"
                    // Typ formattera recharts to ReactNode -> ReactNode, stad Number().
                    formatter={(v: React.ReactNode) => {
                      const n = Number(v);
                      return Number.isFinite(n) && n > 0 ? n.toFixed(2) : '';
                    }}
                    style={{ fontSize: 10, fill: 'rgba(0,0,0,0.55)', fontWeight: 700 }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="sph-skeleton h-full w-full" />
          )}
        </div>
        {/* Pusty wykres MUSI powiedziec, ze jest pusty celowo - inaczej czyta
            sie jak brak danych, zwlaszcza tuz nad niepusta seria SPHERE. */}
        {data && chartData.every((d) => d.volume === 0) && (
          <p className="mt-1 text-[10.5px] font-bold text-sp-shade/45">
            {futureDays > 0
              ? `Flat at zero for the ${elapsedDays} ${elapsedDays === 1 ? 'day' : 'days'} of this epoch so far: no season-eligible token has traded yet. The remaining ${futureDays} ${futureDays === 1 ? 'day has' : 'days have'} not happened, which is why those bars are empty.`
              : 'Flat at zero for all seven days: no season-eligible token traded in this epoch.'}
          </p>
        )}

        {/* PRAWDZIWA HISTORIA: obrot SPHERE, wykluczony z punktacji sezonu.
            Osobna mini-os, bo skala (dziesiatki ETH) zgniotlaby slupki sezonu
            (pojedyncze ETH) do zera - a puste dni wygladaly jak brak danych. */}
        {hasExcluded && (
          <>
            <h4 className="mt-4 text-[11.5px] font-extrabold text-sp-shade/60">
              SPHERE volume ({SPHERE_NATIVE_SYMBOL}) - excluded from season scoring ·{' '}
              {Number(formatEther(excludedVolumeWei)).toFixed(4)} {SPHERE_NATIVE_SYMBOL} this epoch
            </h4>
            <p className="mt-0.5 text-[10px] text-sp-shade/45">
              SPHERE cannot farm its own creator rewards, so its trading scores zero above - the history is still real
              and shown here.
              {futureDays > 0 && (
                <>
                  {' '}
                  This epoch is on day {elapsedDays} of 7, so the last {futureDays}{' '}
                  {futureDays === 1 ? 'bar covers a day that' : 'bars cover days that'} have not happened yet.
                </>
              )}
            </p>
            <div className="mt-2 h-28 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 16, right: 8, left: 0, bottom: 0 }} barCategoryGap="28%">
                  <CartesianGrid vertical={false} stroke="rgba(0,0,0,0.05)" />
                  <XAxis dataKey="dayLabel" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: 'rgba(0,0,0,0.4)' }} />
                  <YAxis width={44} tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: 'rgba(0,0,0,0.4)' }} />
                  <Tooltip
                    cursor={{ fill: 'rgba(0,0,0,0.05)' }}
                    formatter={(v: number) => [`${v.toFixed(4)} ${SPHERE_NATIVE_SYMBOL}`, 'SPHERE volume']}
                    contentStyle={{ borderRadius: 12, border: '1px solid rgba(0,0,0,0.1)', fontSize: 11.5 }}
                  />
                  {/* Dzien 1 (dziesiatki ETH) zgniata pozniejsze dni do <2px -
                      minPointSize daje niezerowym dniom widoczny slad, etykieta
                      niesie dokladna wartosc. Bez animacji wejscia: seria jest
                      recesywna, a synchroniczny montaz nie zalezy od rAF. */}
                  <Bar
                    dataKey="sphere"
                    fill="rgba(0,0,0,0.30)"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={40}
                    isAnimationActive={false}
                    minPointSize={(v: number | null | undefined) => (Number(v ?? 0) > 0 ? 2 : 0)}
                  >
                    <LabelList
                      dataKey="sphere"
                      position="top"
                      formatter={(v: React.ReactNode) => {
                        const n = Number(v);
                        if (!Number.isFinite(n) || n <= 0) return '';
                        return n >= 1 ? n.toFixed(1) : n.toFixed(2);
                      }}
                      style={{ fontSize: 9.5, fill: 'rgba(0,0,0,0.5)', fontWeight: 700 }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </section>

      {/* CLAIM - nagrody w SPHERE tego konta (dystrybutor) ------------------- */}
      <SphereRewardsClaim dist={dist} />

      {/* LEADERBOARD - z zapasem na cichy tydzien (patrz LeaderboardSection) -- */}
      <LeaderboardSection data={data} scoredTokens={scoredTokens} epochs={epochs} logos={logos} />

      {/* POPRZEDNIE EPOKI: manifesty + gwarancja kumulatywnosci ------------- */}
      <PastEpochsSection data={epochs} failed={epochsFailed} />

      <LearnMore>How scoring works - volume, trader multiplier and the 30% fee cap</LearnMore>
    </div>
  );
}

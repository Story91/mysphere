'use client';

/**
 * STRUMIEN NAGROD - licznik w stylu Superfluid.
 *
 * Kontrakt uwalnia przyrost epoki liniowo przez STREAM_DURATION od
 * activatedAt. To jest deterministyczne, wiec licznik nie musi pytac RPC co
 * klatke: liczy dokladnie to, co zwrociloby `vestedOf` w tej sekundzie,
 * i tyka 20 razy na sekunde z szescioma miejscami po przecinku. Odczyt
 * z lancucha (co 30 s w karcie) tylko potwierdza, nigdy nie "poprawia" w
 * dol - obie strony licza z tych samych immutable parametrow.
 *
 * Przed aktywacja (okno weta) tor plynie na jalowym: krople sie ruszaja,
 * ale licznik stoi na 0 i pokazuje tempo, jakie BEDZIE. Zadnej wymyslonej
 * kwoty - tempo to przydzial z manifestu podzielony przez czas strumienia.
 */

import { useEffect, useState } from 'react';
import { formatEther } from 'viem';

const ONE = 10n ** 9n;

function scale(x: bigint, frac: number): bigint {
  return (x * BigInt(Math.floor(Math.max(0, Math.min(1, frac)) * 1e9))) / ONE;
}

function fmt(wei: bigint, digits: number) {
  return Number(formatEther(wei)).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export default function StreamLane({
  total,
  prev,
  claimed,
  activatedAt,
  streamSeconds,
  active,
  startsAt,
}: {
  /** Skumulowany przydzial konta (lisc) i poprzedni skumulowany. */
  total: bigint;
  prev: bigint;
  claimed: bigint;
  activatedAt: number;
  streamSeconds: number;
  /** Czy root jest aktywny - dopiero wtedy cokolwiek naprawde plynie. */
  active: boolean;
  /** Dla nieaktywnego: kiedy strumien ruszy (validAt). */
  startsAt?: number;
}) {
  const [now, setNow] = useState(() => Date.now() / 1000);
  useEffect(() => {
    // 20 klatek/s wystarcza, zeby ostatnie cyfry tykaly; rAF przy 60 fps
    // przeliczalby React trzy razy czesciej za nic.
    const t = setInterval(() => setNow(Date.now() / 1000), 50);
    return () => clearInterval(t);
  }, []);

  const alloc = total > prev ? total - prev : 0n;
  const frac = active && streamSeconds > 0 ? (now - activatedAt) / streamSeconds : 0;
  const unlocked = prev + scale(alloc, frac);
  const claimable = unlocked > claimed ? unlocked - claimed : 0n;
  const perHour = streamSeconds > 0 ? (alloc * 3600n) / BigInt(streamSeconds) : 0n;
  const pct = Math.max(0, Math.min(100, frac * 100));
  const done = active && frac >= 1;
  const secsToStart = startsAt ? Math.max(0, startsAt - now) : 0;

  return (
    <div className="sph-lane rounded-2xl bg-sp-sunken p-4" data-active={active && !done ? 'true' : 'false'}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[12px] font-semibold text-sp-shade/60">
            {active ? (done ? 'fully unlocked' : 'unlocking now') : 'will unlock'}
          </p>
          <p className="mt-1 font-mono text-[28px] font-extrabold leading-none text-sp-ink tabular-nums sm:text-[34px]">
            {fmt(active ? unlocked : 0n, 6)}
            <span className="ml-1.5 font-sans text-[12px] font-bold text-sp-shade/45">SPHERE</span>
          </p>
        </div>
        <div className="text-right">
          <p className="text-[12px] font-semibold text-sp-shade/60">flow rate</p>
          <p className="mt-1 font-mono text-[15px] font-extrabold text-sp-brand tabular-nums">+{fmt(perHour, 3)} / h</p>
          <p className="text-[10px] text-sp-shade/45">
            {active
              ? `claimable now ${fmt(claimable, 3)}`
              : secsToStart > 0
                ? `starts in ${Math.floor(secsToStart / 3600)}h ${Math.floor((secsToStart % 3600) / 60)}m`
                : 'waiting for activation'}
          </p>
        </div>
      </div>

      {/* Tor: krople plyna od dystrybutora do portfela; wypelnienie = postep strumienia. */}
      <div className="mt-3 flex items-center gap-2">
        <span className="text-[12px] font-semibold text-sp-shade/60">distributor</span>
        <div className="sph-lane-track relative h-3 flex-1 overflow-hidden rounded-full bg-sp-shade/10">
          <span className="sph-lane-fill absolute inset-y-0 left-0 rounded-full bg-sp-brand/25" style={{ width: `${pct}%` }} aria-hidden="true" />
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} className="sph-drop" style={{ animationDelay: `${i * -0.9}s` }} aria-hidden="true" />
          ))}
        </div>
        <span className="text-[12px] font-semibold text-sp-shade/60">your wallet</span>
      </div>
      <p className="mt-1.5 text-[10px] text-sp-shade/40">
        {active
          ? `${pct.toFixed(2)}% of this epoch's ${fmt(alloc, 0)} SPHERE unlocked · linear over ${Math.round(streamSeconds / 86400)} days · claim any time`
          : `${fmt(alloc, 0)} SPHERE this epoch · linear over ${Math.round(streamSeconds / 86400)} days from activation · nothing moves before that`}
      </p>
    </div>
  );
}

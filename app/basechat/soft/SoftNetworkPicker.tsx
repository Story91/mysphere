'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { SOFT_NETWORKS } from './SoftStoryRail';

/**
 * Kompaktowy wybor sieci dla mobilnego feedu.
 *
 * Zastapil pasek "stories" (SoftStoryRail) w oprawie feedu: kafle 54x54
 * zajmowaly caly rzad, a razem z zakladkami feed startowal od DWOCH linii
 * interfejsu przed pierwszym postem. Ten sam filtr miesci sie teraz w jednym
 * przycisku obok zakladek: ikona aktywnej sieci (albo znak "wszystkie")
 * i rozwijana lista. SoftStoryRail zostaje w repo - uzywa go strona /soft.
 *
 * ZACHOWANIE JEST TO SAMO CO W PASKU: `null` znaczy "wszystkie sieci",
 * dotkniecie wybranej sieci na liscie ODZNACZA ja (powrot do wszystkich),
 * a zmiana idzie przez ten sam onChange, ktorym zyl pasek.
 */
export default function SoftNetworkPicker({
  activeNetwork,
  onChange,
  className = '',
}: {
  /** `null` = wszystkie sieci. */
  activeNetwork: string | null;
  onChange: (id: string | null) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Dotkniecie poza menu zamyka je. Nasluch wisi tylko, gdy menu jest
  // otwarte, wiec zamkniete menu nie kosztuje nic przy kazdym dotknieciu.
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  const active = SOFT_NETWORKS.find((network) => network.id === activeNetwork) ?? null;

  const pick = (id: string | null) => {
    onChange(id);
    setOpen(false);
  };

  const allGlyph = (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="text-soft-ink-muted"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18" />
    </svg>
  );

  return (
    <div ref={rootRef} className={`relative flex-none ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={active ? `Network filter: ${active.label}` : 'Network filter: all networks'}
        className={[
          'flex h-9 items-center gap-1 rounded-pill bg-soft-surface pl-2.5 pr-2',
          'transition-[box-shadow,transform] [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97]',
          'outline-none focus-visible:ring-2 focus-visible:ring-soft-primary focus-visible:ring-offset-2 focus-visible:ring-offset-soft-bg',
          // Wlaczony filtr ma byc widoczny bez otwierania menu - obwodka
          // fioletu mowi "lista jest przefiltrowana", sama ikona by nie
          // wystarczyla, bo Base wyglada tu tak samo jako filtr i jako brak.
          active ? 'ring-2 ring-soft-primary' : '',
        ].join(' ')}
      >
        {active ? (
          <Image
            src={active.iconSrc}
            alt=""
            width={18}
            height={18}
            className="h-[18px] w-[18px] object-contain"
          />
        ) : (
          allGlyph
        )}
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className={`text-soft-ink-soft transition-transform [transition-duration:var(--dur-press)] ${open ? 'rotate-180' : ''}`}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Network filter"
          className="absolute right-0 top-full z-30 mt-2 w-44 rounded-card border border-soft-line bg-soft-surface p-1 shadow-card"
        >
          <button
            type="button"
            role="option"
            aria-selected={active === null}
            onClick={() => pick(null)}
            className={[
              'flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 font-soft text-[13px]',
              active === null
                ? 'bg-soft-sunken font-bold text-soft-primary-deep'
                : 'font-semibold text-soft-ink-muted',
            ].join(' ')}
          >
            {allGlyph}
            <span>All networks</span>
          </button>
          {SOFT_NETWORKS.map((network) => {
            const isActive = network.id === activeNetwork;
            return (
              <button
                key={network.id}
                type="button"
                role="option"
                aria-selected={isActive}
                onClick={() => pick(isActive ? null : network.id)}
                className={[
                  'flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 font-soft text-[13px]',
                  isActive
                    ? 'bg-soft-sunken font-bold text-soft-primary-deep'
                    : 'font-semibold text-soft-ink-muted',
                ].join(' ')}
              >
                <Image
                  src={network.iconSrc}
                  alt=""
                  width={18}
                  height={18}
                  className="h-[18px] w-[18px] object-contain"
                />
                <span>{network.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

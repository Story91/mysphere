'use client';

import Image from 'next/image';

/**
 * Sieci jako "stories" - poziomy pasek na gorze feedu.
 *
 * SKAD TE WYMIARY. Wprost z projektu wlasciciela (Claude Design, wariant 1b
 * Soft Social): kafel 54x54, promien 19px, aktywny ma pelna obwodke fioletu
 * i cien, nieaktywny obwodke PRZERYWANA w kolorze linii. Podpis 11px Nunito -
 * 700 gdy aktywny, 600 gdy nie.
 *
 * DLACZEGO PRZERYWANA OBWODKA MA ZNACZENIE. To jedyny sposob, w jaki ten pasek
 * odroznia "wybrane" od "dostepne" bez uzycia samego koloru. Ktos, kto nie
 * odroznia fioletu od szarosci, nadal widzi rozne obwodki - a ze zmienia sie
 * takze grubosc podpisu, informacja jest podana trzy razy niezaleznie.
 *
 * DOSTEPNOSC: to jest lista przyciskow radiowych w sensie znaczeniowym, wiec
 * kazdy dostaje aria-pressed. Bez tego czytnik ekranu przeczytalby siedem
 * identycznych przyciskow bez informacji, ktory jest wybrany.
 */

export type SoftNetwork = {
  id: string;
  label: string;
  iconSrc: string;
};

/**
 * Kolejnosc jest celowa: Base pierwszy, bo to lancuch domyslny i najczestszy.
 * Reszta w kolejnosci dolaczania do aplikacji.
 */
export const SOFT_NETWORKS: SoftNetwork[] = [
  { id: 'base', label: 'Base', iconSrc: '/logotypy/Base_square_blue.png' },
  { id: 'basecamp', label: 'Camp', iconSrc: '/Camp.png' },
  { id: 'linea', label: 'Linea', iconSrc: '/Logomark Blue BG.svg' },
  { id: 'celo', label: 'Celo', iconSrc: '/logotypy/Celo_Symbol_RGB_ProsperityYellow.png' },
  { id: 'ethereum', label: 'ETH', iconSrc: '/ethlogo.png' },
  { id: 'worldchain', label: 'World', iconSrc: '/logotypy/world-symbol-dark.svg' },
  { id: 'robinhood', label: 'RH', iconSrc: '/robin.webp' },
];

export default function SoftStoryRail({
  activeNetwork,
  onSelect,
  className = '',
}: {
  activeNetwork: string;
  onSelect: (id: string) => void;
  className?: string;
}) {
  return (
    <div
      className={`flex gap-3 overflow-x-auto px-4 pb-1 pt-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]{display:none} ${className}`}
      role="group"
      aria-label="Choose a network"
    >
      {SOFT_NETWORKS.map((network) => {
        const isActive = network.id === activeNetwork;

        return (
          <button
            key={network.id}
            type="button"
            onClick={() => onSelect(network.id)}
            aria-pressed={isActive}
            className="flex flex-none flex-col items-center gap-[5px] rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-soft-primary focus-visible:ring-offset-2 focus-visible:ring-offset-soft-bg"
          >
            <span
              className={[
                'flex h-[54px] w-[54px] items-center justify-center rounded-[19px] bg-soft-surface',
                // Nacisniecie skaluje kafel. 0.94 zamiast 0.97, bo element jest
                // maly - przy wiekszym kaflu ta sama roznica bylaby niewidoczna.
                'transition-transform [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.94]',
                isActive
                  ? 'border-2 border-soft-primary shadow-chip'
                  : 'border-2 border-dashed border-soft-line',
              ].join(' ')}
            >
              <Image
                src={network.iconSrc}
                alt=""
                width={26}
                height={26}
                className="h-[26px] w-[26px] object-contain"
              />
            </span>
            <span
              className={
                isActive
                  ? 'font-soft text-[11px] font-bold text-soft-primary-deep'
                  : 'font-soft text-[11px] font-semibold text-soft-ink-soft'
              }
            >
              {network.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

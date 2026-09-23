'use client';

import { motion } from 'framer-motion';
import React, { useRef, useState } from 'react';
import './GooeyNav.css';
import { activeTileStyle, rovingTarget, tabStopIndex, type GooeySpecialStyle } from './gooeyNavLogic';

export type GooeyNavItem = {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  isActive?: boolean;
  color?: string;
  // Bez specialStyle kafel dostaje wyglad domyslny (biale tlo, ramka w
  // kolorze `color`) - szczegoly przy DEFAULT_LOOK w gooeyNavLogic.ts.
  specialStyle?: GooeySpecialStyle;
};

export type GooeyNavProps = {
  items: GooeyNavItem[];
  className?: string;
  // Nazwa calego rzedu dla czytnika ekranu. `ariaLabelledBy` (id widocznego
  // podpisu nad rzedem) ma pierwszenstwo - wtedy nazwa i podpis nie moga sie
  // rozjechac. `ariaLabel` to zapas, gdy podpisu nie ma albo nie ma on id.
  ariaLabelledBy?: string;
  ariaLabel?: string;
};

export default function GooeyNav({
  items,
  className = '',
  ariaLabelledBy,
  ariaLabel = 'Network',
}: GooeyNavProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  // Kafel, na ktorym stoi fokus, albo null, gdy fokus jest poza rzedem.
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const activeIndex = items.findIndex((item) => item.isActive);
  // Roving tabindex: caly rzad to JEDEN przystanek Tab zamiast osobnego
  // dla kazdej sieci, po kafelkach chodzi sie strzalkami. Zasady
  // w tabStopIndex/rovingTarget.
  const tabStop = tabStopIndex(focusedIndex, activeIndex, items.length);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const target = rovingTarget(event, index, items.length);
    if (target === null) return;
    event.preventDefault();
    const button = buttonRefs.current[target];
    // Tylko fokus, bez onClick - siec wybiera Enter/Spacja (patrz rovingTarget).
    button?.focus();
    // Na telefonie rzad sie przewija; kafel z fokusem ma byc w calosci widoczny.
    button?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };

  return (
    <div className={`gooey-nav-container ${className}`}>
      {/* UKLAD RZEDU.

          Desktop (lg+): siatka w JEDNYM rzedzie, bez wpisanej liczby kolumn.
          grid-flow-col + auto-cols-fr robi z N kafli N rownych kolumn
          (minmax(0, 1fr)). Wczesniej stalo tu grid-cols-7 z czasow, gdy sieci
          bylo siedem; po Arc i Solanie dziewiec kafli lamalo sie 7 + 2.
          Liczba kafli zmienia sie tez w locie: Solana jest tylko poza
          miniappem Farcastera, wiec na sztywno wpisana liczba bylaby zla
          dla jednej z dwoch grup uzytkownikow. grid-flow-col nigdy nie lamie
          rzedu; ograniczeniem jest tylko szerokosc kafla. Najwezszy rzad na
          lg to ok. 443px (1152px z klasycznymi paskami przewijania), co przy
          dziewieciu sieciach daje kafel ok. 44px na znak 18px.

          Telefon i tablet (ponizej lg): przewijany rzad flex. Kafle maja
          flex-none. Bez tego sciskaly sie do samego paddingu: preflight
          Tailwinda daje <img> max-width:100%, wiec logo nie trzyma minimalnej
          szerokosci przycisku i przy dziewieciu sieciach znaki kurczyly sie
          do 0-12px (zmierzone w Chromium). Skoro kafle sie nie kurcza, rzad
          nie moze byc justify-center: przy przepelnieniu centrowanie wypycha
          pierwszy kafel (Base) poza lewa krawedz, gdzie przewijaniem nie da
          sie go dosiegnac. Stad justify-start, a srodkowanie tam, gdzie rzad
          sie miesci, robia auto-marginesy pierwszego i ostatniego kafla (przy
          przepelnieniu auto-margines spada do zera, wiec start zostaje przy
          lewej krawedzi).

          p-[4px] z -m-[4px]: kontener przewijany przycina wszystko, co
          wystaje poza jego pudelko, a obwodka fokusu (ring 2px + offset 2px)
          wystaje o 4px. Padding daje jej miejsce, ujemny margines oddaje te
          4px, wiec kafle stoja dokladnie tam, gdzie staly. scroll-px-[4px]
          pilnuje tego samego przy przewijaniu do kafla z fokusem. */}
      <div
        role="toolbar"
        aria-labelledby={ariaLabelledBy}
        aria-label={ariaLabelledBy ? undefined : ariaLabel}
        onBlur={(event) => {
          // Fokus wyszedl z rzedu (a nie przeszedl na sasiedni kafel):
          // nastepny Tab ma wejsc na wybrana siec, nie na ostatnio odwiedzona.
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setFocusedIndex(null);
          }
        }}
        className="gooey-nav -m-[4px] flex items-center justify-start gap-2 overflow-x-auto p-[4px] scroll-px-[4px] scrollbar-hide lg:grid lg:grid-flow-col lg:auto-cols-fr lg:gap-1.5 lg:overflow-x-visible"
      >
        {items.map((item, index) => (
          <motion.button
            key={index}
            ref={(el: HTMLButtonElement | null) => {
              buttonRefs.current[index] = el;
            }}
            type="button"
            onClick={item.onClick}
            onKeyDown={(event: React.KeyboardEvent<HTMLButtonElement>) => handleKeyDown(event, index)}
            onFocus={() => setFocusedIndex(index)}
            tabIndex={index === tabStop ? 0 : -1}
            onHoverStart={() => setHoveredIndex(index)}
            onHoverEnd={() => setHoveredIndex(null)}
            // Etykieta tekstowa nie renderuje sie WCALE (patrz nizej), wiec
            // aria-label jest jedyna nazwa dostepna tego przycisku. Bez niego
            // czytnik ekranu przeczytalby "przycisk" i nic wiecej.
            aria-label={item.label}
            // Natywny dymek dla myszy. Znaki sieci nie sa powszechnie
            // rozpoznawalne - ktos musi miec jak sprawdzic, ktora to, bez
            // klikania na probe.
            title={item.label}
            // Przycisk przelaczany, nie radio: fokus i wybor sa rozdzielone
            // (dlaczego - patrz rovingTarget w gooeyNavLogic.ts).
            aria-pressed={!!item.isActive}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            // h-11 zamiast py-3: py-3 + ikona w-5 to dokladnie 2.75rem, czyli
            // h-11, wiec zwykle kafle maja te sama wysokosc co dotad na kazdym
            // progu rozmiaru czcionki. Stala wysokosc sprawia tez, ze ikona
            // wieksza niz w-5 nie podnosi jednego kafla ponad reszte rzedu -
            // tak odstawal kafel Celo z ikona w-6 h-6.
            // lg:px-0 + lg:w-full + lg:min-w-0: na desktopie szerokosc kafla
            // bierze sie z kolumny siatki, nie z paddingu.
            // Fokus z klawiatury: ring w kolorze marki zamiast domyslnej
            // obwodki przegladarki, jak w reszcie /basechat. outline-none stoi
            // BEZ focus-visible: celowo. Przy transition-all zmiana outline
            // dopiero w chwili fokusu animowalaby kolor obwodki z ciemnego do
            // przezroczystego, czyli ciemna ramka mignelaby na 300ms pod
            // ringiem. Przezroczysta obwodka na stale nic nie animuje.
            // Tryb wysokiego kontrastu Windows (forced-colors) wymusza jednak
            // kolor obwodki, wiec "przezroczyste" 2px robi sie widoczne na
            // KAZDYM kaflu, a ring (box-shadow) jest tam wylaczony - kafel
            // z fokusem nie roznilby sie od reszty. Stad forced-colors:outline-0
            // i obwodka 2px tylko na focus-visible.
            className={`
              gooey-nav-item relative flex h-11 flex-none items-center justify-center gap-2 rounded-2xl px-4
              text-sm font-medium whitespace-nowrap transition-all duration-300
              first:ml-auto last:mr-auto
              lg:w-full lg:min-w-0 lg:px-0 lg:first:ml-0 lg:last:mr-0
              outline-none forced-colors:outline-0 forced-colors:focus-visible:outline-2
              focus-visible:ring-2 focus-visible:ring-soft-primary
              focus-visible:ring-offset-2 focus-visible:ring-offset-soft-surface
              ${item.isActive ? 'shadow-lg' : ''}
            `}
          >
            {/* Background for non-active items */}
            {!item.isActive && (
              <div aria-hidden="true" className="absolute inset-0 rounded-2xl bg-soft-sunken" />
            )}

            {/* Icon */}
            <div className="relative z-10 flex items-center justify-center">
              {item.icon}
            </div>

            {/* ETYKIETY TEKSTOWEJ NIE MA - celowo.

                Sieci przybywa z kazda integracja (w dniu tej zmiany
                dziewiec; Solana tylko poza miniappem Farcastera). Z podpisami
                ("Camp Network", "World Chain", "Robinhood"...) rzad rozciagal sie na
                cala szerokosc kompozytora, spychal pole tekstowe w dol i tak
                czy owak konczyl sie zawijaniem. Same znaki sieci mieszcza sie
                w jednym rzedzie na desktopie; na telefonie rzad przewija sie
                w poziomie.

                Nazwa NIE ginie: siedzi w aria-label (czytnik ekranu) oraz
                w title (dymek przy najechaniu myszy). */}

            {/* Nakladka aktywnego kafla. Kolory, ramka i gradient dla kazdej
                sieci - activeTileStyle w gooeyNavLogic.ts. layoutId przesuwa
                ja animacja miedzy kaflami przy zmianie sieci. */}
            {item.isActive && (
              <motion.div
                layoutId="gooeyActive"
                className="absolute inset-0 rounded-2xl"
                transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                style={{ ...activeTileStyle(item.specialStyle, item.color), zIndex: 0 }}
              />
            )}

            {/* Hover blob effect with item's color - subtle background only */}
            {hoveredIndex === index && !item.isActive && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 rounded-2xl bg-soft-line"
                style={{
                  zIndex: 0
                }}
              />
            )}
          </motion.button>
        ))}
      </div>
    </div>
  );
}

'use client';

/**
 * Tykajaca liczba - tozsamosc $SPHERE ("watch your balance tick up").
 * Sprezyna z framer-motion: wartosc dobiega do celu z fizyka, nie skokiem.
 * Dekoracja w sensie doktryny motion (liczby to dane, ale ich DOBIEG jest
 * ozdobny) - dlatego sprezyna jest tu wlasciwa, a przy reduced-motion
 * pokazujemy wartosc od razu.
 *
 * ===========================================================================
 * DLACZEGO DOBIEG MA SIATKE BEZPIECZENSTWA (10 wrzesnia 2026)
 * ===========================================================================
 * Poprzednia wersja trzymala w stanie napis "0" i czekala, az sprezyna zacznie
 * emitowac zmiany. Sprezyna chodzi na `requestAnimationFrame`, a rAF NIE JEST
 * gwarantowany: nie tyka w karcie w tle, bywa dlawiony przy oszczedzaniu
 * baterii i nie odpala sie w panelu podgladu. W kazdym z tych przypadkow
 * licznik zostawal na zerze - i to jest najgorszy mozliwy stan tego
 * komponentu. Nie pokazywal wtedy "laduje sie": pokazywal PEWNA, FALSZYWA
 * liczbe, i to akurat w miejscu, w ktorym cala strona obiecuje dokladnosc.
 * Zlapane na hubie $SPHERE, gdzie KAZDY wielki licznik pokazywal 0 obok
 * poprawnych liczb w wierszach tekstowych.
 *
 * Naprawa nie odbiera animacji, tylko dokłada zapadke: po `SETTLE_MS` bez
 * dobiegniecia do celu wpisujemy wartosc docelowa wprost. Gdy rAF dziala,
 * sprezyna dochodzi wczesniej i zapadka nie ma czego poprawiac.
 */

import { useEffect, useRef, useState } from 'react';
import { useReducedMotion, useSpring } from 'framer-motion';

/** Po tylu ms bez dobiegu wpisujemy cel wprost. Dluzej niz typowy dobieg sprezyny. */
const SETTLE_MS = 1_200;

function format(value: number, decimals: number) {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export default function NumberTicker({
  value,
  decimals = 0,
  className,
}: {
  value: number;
  decimals?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const spring = useSpring(0, { stiffness: 90, damping: 24, mass: 0.6 });
  const [display, setDisplay] = useState('0');
  const started = useRef(false);

  useEffect(() => {
    if (reduce) {
      setDisplay(format(value, decimals));
      return;
    }
    // Pierwsze ustawienie startuje od zera (wejscie strony), kolejne dobiegaja
    // od poprzedniej wartosci - sprezyna trzyma predkosc przy przerwaniu.
    spring.set(started.current ? value : 0);
    started.current = true;
    spring.set(value);
    const unsub = spring.on('change', (v) => {
      setDisplay(format(v, decimals));
    });
    // Zapadka: cel wpisany wprost, jesli sprezyna nie zdazyla (albo nie ruszyla).
    const settle = setTimeout(() => setDisplay(format(value, decimals)), SETTLE_MS);
    return () => {
      unsub();
      clearTimeout(settle);
    };
  }, [value, decimals, reduce, spring]);

  return (
    <span className={className} style={{ fontVariantNumeric: 'tabular-nums' }}>
      {display}
    </span>
  );
}

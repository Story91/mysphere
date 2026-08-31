'use client';

/**
 * Tykajaca liczba - tozsamosc $SPHERE ("watch your balance tick up").
 * Sprezyna z framer-motion: wartosc dobiega do celu z fizyka, nie skokiem.
 * Dekoracja w sensie doktryny motion (liczby to dane, ale ich DOBIEG jest
 * ozdobny) - dlatego sprezyna jest tu wlasciwa, a przy reduced-motion
 * pokazujemy wartosc od razu.
 */

import { useEffect, useRef, useState } from 'react';
import { useReducedMotion, useSpring } from 'framer-motion';

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
      setDisplay(value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }));
      return;
    }
    // Pierwsze ustawienie startuje od zera (wejscie strony), kolejne dobiegaja
    // od poprzedniej wartosci - sprezyna trzyma predkosc przy przerwaniu.
    spring.set(started.current ? value : 0);
    started.current = true;
    spring.set(value);
    const unsub = spring.on('change', (v) => {
      setDisplay(v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }));
    });
    return unsub;
  }, [value, decimals, reduce, spring]);

  return (
    <span className={className} style={{ fontVariantNumeric: 'tabular-nums' }}>
      {display}
    </span>
  );
}

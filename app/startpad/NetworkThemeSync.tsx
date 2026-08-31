'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { ACTIVE_LAUNCHPAD_NETWORK } from './config';
import { THEME_ATTRIBUTE, themeKeyFor } from './networkTheme';

/**
 * Pilnuje, zeby motyw sieci zyl dokladnie tak dlugo, jak trwa pobyt na
 * startpadzie.
 *
 * ===========================================================================
 * PO CO OSOBNY KOMPONENT, SKORO ATRYBUT USTAWIA SKRYPT W LAYOUCIE
 * ===========================================================================
 * Tamten skrypt biegnie RAZ, przy ladowaniu dokumentu, i rozwiazuje jedna
 * rzecz: wejscie z linku prosto na czarna strone nie miga biala. Nie widzi
 * jednak przejsc wewnatrz aplikacji - a te sa w Next zwyklym renderem, bez
 * przeladowania. Bez tego komponentu klikniecie w "Money" z czarnego startpada
 * zostawialoby czarna cala reszte aplikacji.
 *
 * Sprzatanie w `return` efektu jest tu wiec cala trescia: atrybut znika przy
 * odmontowaniu, czyli przy wyjsciu ze startpada.
 *
 * Zmiany sieci nie obslugujemy: `setLaunchpadChain` przeladowuje strone
 * (patrz config.ts), wiec po przelaczeniu na Robinhooda dokument powstaje od
 * nowa i motyw ustawia juz skrypt.
 */
export default function NetworkThemeSync() {
  const pathname = usePathname();

  useEffect(() => {
    const key = themeKeyFor(pathname ?? '', ACTIVE_LAUNCHPAD_NETWORK.chain.id);
    const root = document.documentElement;

    if (!key) {
      root.removeAttribute(THEME_ATTRIBUTE);
      return;
    }

    root.setAttribute(THEME_ATTRIBUTE, key);
    return () => root.removeAttribute(THEME_ATTRIBUTE);
  }, [pathname]);

  return null;
}

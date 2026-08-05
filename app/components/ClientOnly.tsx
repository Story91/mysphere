'use client';

import { useState, useEffect, ReactNode } from 'react';

interface ClientOnlyProps {
  children: ReactNode;
  fallback?: ReactNode;
}

/**
 * Wstrzymuje render dzieci do momentu zamontowania po stronie klienta.
 *
 * Do UZYCIA PUNKTOWEGO - wokol pojedynczych komponentow, ktore czytaja
 * `window`/`localStorage` i inaczej rozjechalyby sie z HTML-em z serwera.
 *
 * NIE owijaj tym calej aplikacji. Wczesniej robil to root layout i skutkowalo
 * to spinnerem az do pelnej hydracji wielomegabajtowego bundle'a. Instalacja
 * proxy RPC, ktora tu wczesniej siedziala jako efekt uboczny, przeniesiona
 * zostala do AppShell.
 */
export default function ClientOnly({ children, fallback = null }: ClientOnlyProps) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

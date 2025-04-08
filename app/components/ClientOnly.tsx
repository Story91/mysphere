'use client';

import { useState, useEffect, ReactNode } from 'react';
import { installMerkleProxy } from '../utils/merkleProxy';

interface ClientOnlyProps {
  children: ReactNode;
  fallback?: ReactNode;
}

export default function ClientOnly({ children, fallback = null }: ClientOnlyProps) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    
    // Instalujemy proxy dla merkle.io
    installMerkleProxy();
  }, []);

  if (!isMounted) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
} 
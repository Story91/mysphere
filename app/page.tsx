'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    // Natychmiastowe przekierowanie na /basechat
    router.replace('/basechat');
  }, [router]);

  return null;
}

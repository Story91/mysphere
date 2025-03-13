'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function XCallback() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    if (error) {
      window.opener.postMessage({ type: 'X_AUTH_ERROR', error }, window.location.origin);
      window.close();
      return;
    }

    if (code) {
      window.opener.postMessage({ type: 'X_AUTH_SUCCESS', code }, window.location.origin);
      window.close();
    }
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="animate-pulse text-white text-center">
        <svg className="w-8 h-8 mx-auto mb-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
        </svg>
        <p>Completing authentication...</p>
      </div>
    </div>
  );
} 
'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

export default function XCallback() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    
    if (code) {
      // Send the auth code back to the parent window
      if (window.opener) {
        window.opener.postMessage(
          {
            type: 'X_AUTH_SUCCESS',
            code: code
          },
          window.location.origin
        );
        // Close the popup window
        window.close();
      }
    }
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
        <p className="text-gray-300">Completing authentication...</p>
      </div>
    </div>
  );
} 
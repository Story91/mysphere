'use client';

import { useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

export default function XCallback() {
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    
    if (code) {
      if (window.opener) {
        // Desktop flow - send message to opener and close popup
        window.opener.postMessage(
          {
            type: 'X_AUTH_SUCCESS',
            code: code
          },
          window.location.origin
        );
        window.close();
      } else {
        // Mobile flow - redirect back to main page
        // Store the auth code in localStorage
        localStorage.setItem('x_auth_code', code);
        localStorage.setItem('x_auth_state', state || '');
        // Redirect back to the main page
        router.push('/yapyap');
      }
    }
  }, [searchParams, router]);

  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
        <p className="text-gray-300">Completing authentication...</p>
      </div>
    </div>
  );
} 
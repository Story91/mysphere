'use client';

import { useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function CallbackContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const handleCallback = async () => {
      const code = searchParams.get('code');
      const state = searchParams.get('state');
      const platform = searchParams.get('platform');

      if (code && state) {
        // Tutaj będzie logika obsługi callback dla różnych platform
        console.log('Otrzymano kod autoryzacji:', code);
        console.log('Stan:', state);
        console.log('Platforma:', platform);

        // Po zakończeniu autoryzacji, zamknij okno
        window.close();
      }
    };

    handleCallback();
  }, [searchParams]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
          Autoryzacja w toku...
        </h2>
        <p className="text-gray-500 dark:text-gray-400 mt-2">
          To okno zostanie automatycznie zamknięte
        </p>
      </div>
    </div>
  );
}

export default function CallbackPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <CallbackContent />
    </Suspense>
  );
} 
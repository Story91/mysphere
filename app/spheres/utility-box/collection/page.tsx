'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function CollectionPage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to main utility box page where history is now located
    router.replace('/spheres/utility-box');
  }, [router]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 p-6 flex items-center justify-center">
      <div className="text-white text-center">
        <h2 className="text-2xl font-bold mb-2">Redirecting...</h2>
        <p className="text-gray-300">Prize history is now integrated on the main Utility Box page.</p>
      </div>
    </div>
  );
} 
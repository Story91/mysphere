'use client';

import { ReactNode } from 'react';
import { useBanStatus } from '../../hooks/useBanStatus';

interface BanRestrictionProps {
  children: ReactNode;
  fallback?: ReactNode;
  showMessage?: boolean;
}

export default function BanRestriction({
  children,
  fallback,
  showMessage = true
}: BanRestrictionProps) {
  const { isBanned, loading } = useBanStatus();

  if (loading) return null;

  if (isBanned) {
    if (!fallback && !showMessage) return null;

    return (
      <div className="relative">
        {fallback || (
          showMessage && (
            <div className="p-4 bg-red-500 text-white rounded-lg text-sm">
              This feature is not available for banned users
            </div>
          )
        )}
      </div>
    );
  }

  return <>{children}</>;
} 
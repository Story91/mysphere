'use client';

// CampProvider ma konsumentow wylacznie pod /mycamp/**. Trasy app/api/camp/* sa
// serwerowe i nie korzystaja z tego providera.
import { CampProvider } from '@campnetwork/origin/react';

export default function MyCampLayout({ children }: { children: React.ReactNode }) {
  return (
    <CampProvider
      clientId={process.env.NEXT_PUBLIC_CAMP_CLIENT_ID!}
      redirectUri={typeof window !== 'undefined' ? `${window.location.origin}/mycamp` : ''}
    >
      {children}
    </CampProvider>
  );
}

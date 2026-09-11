'use client';

// CampProvider ma konsumentow wylacznie pod /mycamp/**. Trasy app/api/camp/* sa
// serwerowe i nie korzystaja z tego providera.
import { CampProvider } from '@campnetwork/origin/react';

export default function MyCampLayout({ children }: { children: React.ReactNode }) {
  return (
    <CampProvider
      clientId={process.env.NEXT_PUBLIC_CAMP_CLIENT_ID!}
      // Bez tego SDK idzie na testnet - patrz CAMP_ENVIRONMENT w campConnector.
      environment="PRODUCTION"
      redirectUri={typeof window !== 'undefined' ? `${window.location.origin}/mycamp` : ''}
    >
      {children}
    </CampProvider>
  );
}

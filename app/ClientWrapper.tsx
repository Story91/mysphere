'use client';

import { PropsWithChildren } from 'react';

export default function ClientWrapper({ children }: PropsWithChildren) {
  return <>{children}</>;
} 
'use client';

import '@coinbase/onchainkit/styles.css';
import './globals.css';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from "@vercel/speed-insights/next"
import { Providers } from './providers';
import Navigation from './components/Navigation/Navigation';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pl">
      <head>
        <script src="https://www.google.com/recaptcha/enterprise.js?render=6LfNUMkqAAAAAKwvD-9Ow1vtA8aPwZFDSJ2nen47" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </head>
      <body className="min-h-screen bg-[#0F172A]">
        <Providers>
          <Navigation />
          <main className="container mx-auto responsive-padding py-4 sm:py-6 md:py-8">
            {children}
          </main>
          <Analytics />
          <SpeedInsights />
        </Providers>
      </body>
    </html>
  );
}

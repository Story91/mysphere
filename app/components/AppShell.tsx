'use client';

import { useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import Navigation from './Navigation/Navigation';
import { ThemeProvider } from '../context/ThemeContext';
import { Providers } from '../providers';
import SessionPrompt from './auth/SessionPrompt';
import { installMerkleProxy } from '../utils/merkleProxy';

/**
 * Kliencka powloka aplikacji.
 *
 * Powstala po to, zeby `app/layout.tsx` mogl byc komponentem SERWEROWYM.
 * Wczesniej caly root layout mial 'use client' (przez `usePathname`) i owijal
 * wszystko w <ClientOnly>, przez co do czasu pelnej hydracji uzytkownik widzial
 * spinner, a metadane byly generowane po stronie klienta.
 *
 * Tutaj laduje wylacznie to, co naprawde potrzebuje przegladarki:
 *  - providery Reactowe (wagmi / react-query / motyw),
 *  - installMerkleProxy - UWAGA: to bylo wczesniej wolane w efekcie ClientOnly.
 *    Zdjecie globalnego ClientOnly bez przeniesienia tego zabiloby przekierowanie
 *    zapytan do eth.merkle.io, z ktorego korzystaja lookupy ENS/Basename
 *    naszej warstwy tozsamosci (app/components/identity).
 *
 * Czego tu NIE MA i byc nie powinno: bramki blokujacej render dzieci do czasu
 * hydracji. Poszczegolne komponenty czytajace window/localStorage maja same
 * uzywac <ClientOnly>, zamiast wstrzymywac cala aplikacje.
 */
export default function AppShell({ children }: { children: React.ReactNode }) {

  useEffect(() => {
    installMerkleProxy();
  }, []);

  return (
    <ThemeProvider>
      <Providers>
        <Navigation />
        <main className="w-full">{children}</main>

        {/* Zaproszenie do podpisu SIWE dla portfeli podlaczonych z pominieciem
            ekranu przedlogowania. Bez tego lancuch tozsamosci konczyl sie na
            jednym ekranie, a Firestore widzial wszystkich jako anonimow. */}
        <SessionPrompt />

        {/* ===== POWIADOMIENIA =====
            Bylo: pelne plachty koloru - zielona przy sukcesie, czerwona przy
            bledzie, bialy tekst w srodku. Trzy problemy naraz. Plachta krzyczy
            tak samo przy "polubiono post" i przy "transakcja odrzucona", wiec
            sila komunikatu nie miala zwiazku z jego waga. Bialy tekst na
            nasyconym tle czyta sie gorzej niz czarny na bieli. A ciemna,
            szara karta byla ostatnim elementem z poprzedniego motywu.

            Jest: biala karta, czarny tekst, CIENKA kolorowa ramka i ikona.
            Kolor niesie wylacznie ramka i ikona - dokladnie tyle, ile trzeba,
            zeby rozpoznac rodzaj komunikatu katem oka, i ani grama wiecej.
            Ikona mowi to samo co ramka drugim kanalem, wiec kto nie odroznia
            zieleni od czerwieni, widzi ptaszek albo krzyzyk.

            Ustawione GLOBALNIE, a nie przy 200 wywolaniach toast.* rozsianych
            po aplikacji - dzieki temu kazde z nich dostaje nowy wyglad bez
            dotykania kodu, ktory je wola.

            Blad zostaje dluzej niz sukces (5 s wobec 3 s): sukces potwierdza
            to, co uzytkownik wlasnie zrobil i o czym wie, a blad niesie
            informacje, ktorej jeszcze nie ma - czasem z instrukcja. */}
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: '#ffffff',
              color: 'rgb(46 42 68)',
              border: '1px solid rgb(214 205 242)',
              borderRadius: '18px',
              fontSize: '13.5px',
              fontWeight: 600,
              padding: '12px 16px',
              maxWidth: '380px',
              boxShadow: '0 10px 30px rgba(74, 60, 150, 0.18)',
            },
            success: {
              duration: 3000,
              style: { border: '1px solid rgba(22, 163, 74, 0.45)' },
              iconTheme: { primary: '#16A34A', secondary: '#ffffff' },
            },
            error: {
              duration: 5000,
              style: { border: '1px solid rgba(220, 38, 38, 0.45)' },
              iconTheme: { primary: '#DC2626', secondary: '#ffffff' },
            },
            loading: {
              style: { border: '1px solid rgb(214 205 242)' },
              iconTheme: { primary: 'rgb(124 107 218)', secondary: '#ffffff' },
            },
          }}
        />
      </Providers>
    </ThemeProvider>
  );
}

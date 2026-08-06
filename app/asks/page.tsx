'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import MobileBottomNav from '../components/MobileBottomNav';
import AskCard from '../basechat/components/AskCard';
import { getOpenAsks, getResolveRate } from '../utils/asks/asks';
import type { Ask, ResolveRate } from '../utils/asks/types';

/**
 * Lista otwartych Askow.
 *
 * Strona jest KLIENCKA, bo czyta Firestore tym samym SDK co feed - ta sama
 * droga, te same reguly, zadnej drugiej sciezki dostepu do tych danych.
 *
 * === PUSTKA TO NIE AWARIA ===
 * `getOpenAsks` zwraca flage `failed` wlasnie po to, zeby te dwa stany nie
 * wygladaly tak samo. "Nikt jeszcze nie zapytal" i "nie udalo sie sprawdzic"
 * znacza dla czytelnika co innego, wiec dostaja osobne ekrany. Zadnych
 * przykladowych Askow do zapelnienia widoku - pusto znaczy pusto.
 *
 * === ILE TO KOSZTUJE ODCZYTOW ===
 * Lista to jedno zapytanie (max 20 dokumentow). Wskaznik rozstrzygalnosci jest
 * dociagany osobno dla KAZDEGO UNIKALNEGO autora, a nie dla kazdej karty -
 * dziesiec Askow jednej osoby to jedno zapytanie, nie dziesiec. Zapytanie
 * zwraca tylko Aski tego autora, wiec koszt to jego wlasna historia, a nie
 * limit 200. Liczba autorow jest i tak zamknieta `MAX_RATE_LOOKUPS`, zeby
 * jeden ekran nie mogl urosnac w nieskonczonosc odczytow.
 */

const MAX_ASKS = 20;
const MAX_RATE_LOOKUPS = 12;

type Phase = 'loading' | 'ready' | 'failed';

export default function AsksPage() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [asks, setAsks] = useState<Ask[]>([]);
  const [rates, setRates] = useState<Record<string, ResolveRate>>({});
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    setPhase('loading');
    setAttempt((value) => value + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const result = await getOpenAsks(MAX_ASKS);
      if (cancelled) return;

      if (result.failed) {
        setPhase('failed');
        setAsks([]);
        return;
      }

      setAsks(result.asks);
      setPhase('ready');

      const authors = Array.from(
        new Set(result.asks.map((ask) => ask.author).filter(Boolean))
      ).slice(0, MAX_RATE_LOOKUPS);
      if (authors.length === 0) return;

      // getResolveRate lapie wlasne bledy i oddaje rate: null, wiec brak
      // wskaznika nigdy nie przewraca listy.
      const fetched = await Promise.all(authors.map((author) => getResolveRate(author)));
      if (cancelled) return;

      const map: Record<string, ResolveRate> = {};
      authors.forEach((author, index) => {
        map[author] = fetched[index];
      });
      setRates(map);
    })();

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  return (
    <main className="min-h-screen bg-soft-bg font-soft">
      <div className="mx-auto w-full max-w-[640px] px-4 py-10 sm:px-5">
        <header className="mb-7">
          <h1 className="mb-3 font-soft-display text-[30px] font-bold leading-[1.1] tracking-[-0.02em] text-soft-ink sm:text-[38px]">
            Open asks
          </h1>
          <p className="mb-2 text-[14.5px] leading-[1.65] text-soft-ink-muted">
            An Ask is a question with a budget, a number of seats and a deadline. Answers stay
            sealed until the author resolves — you see how many arrived, never what they say.
          </p>
          {/* NIE obiecujemy przyjmowania odpowiedzi ani wyplaty.
              Stalo tu "The author pays each answer they accept, at the moment
              they resolve" - i to bylo nieprawda. `acceptAnswer` i `resolveAsk`
              nie maja ani jednego wywolania w repo, nie ma trasy API do
              rozstrzygania, a przycisk "Answer" na karcie renderuje sie jako
              null, bo nikt nie podaje handlera.

              Ten sam tekst byl w metadanych i tam juz poprawiony - to druga
              kopia, widoczna na stronie. */}
          <p className="text-[12.5px] leading-[1.6] text-soft-ink-faint">
            Being built: an Ask can be created and answered over the API today, but nothing
            in the product can accept an answer or resolve an Ask yet.{' '}
            <Link
              href="/re-definition#ask"
              className="font-semibold text-soft-primary-deep underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
            >
              How an Ask works
            </Link>
          </p>
        </header>

        {phase === 'loading' && <LoadingList />}

        {phase === 'failed' && (
          <div className="rounded-card border border-soft-line bg-soft-surface p-5 shadow-card">
            <h2 className="mb-1.5 font-soft-display text-[16px] font-bold text-soft-ink">
              Open asks could not be loaded
            </h2>
            <p className="mb-4 text-[13.5px] leading-[1.6] text-soft-ink-muted">
              This is a failed read, not an empty list. There may well be open asks — we just could
              not reach them.
            </p>
            <button
              type="button"
              onClick={retry}
              className="rounded-lg bg-soft-primary px-4 py-2 font-soft-display text-[13px] font-semibold text-white transition-transform duration-150 ease-out active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary focus-visible:ring-offset-2 focus-visible:ring-offset-soft-surface"
            >
              Try again
            </button>
          </div>
        )}

        {phase === 'ready' && asks.length === 0 && (
          <div className="rounded-card border border-soft-line bg-soft-surface p-5 shadow-card">
            <h2 className="mb-1.5 font-soft-display text-[16px] font-bold text-soft-ink">
              Nothing open right now
            </h2>
            <p className="text-[13.5px] leading-[1.6] text-soft-ink-muted">
              No one has an open Ask at this moment. When someone does, their question, budget,
              seats and countdown show up here.
            </p>
          </div>
        )}

        {phase === 'ready' && asks.length > 0 && (
          <div className="flex flex-col gap-4">
            {asks.map((ask) => (
              <AskCard key={ask.id} ask={ask} resolveRate={rates[ask.author]} />
            ))}
          </div>
        )}
      </div>
      {/* Wyjscie z tej strony na telefonie. Dolny pasek feedu jest jego
          wewnetrznym przelacznikiem paneli i tu nie dziala - bez tego /asks
          bylo na telefonie slepym zaulkiem: gorna belka chowa sie pod
          hamburgerem, wiec droga powrotna istniala, ale nie bylo jej widac. */}
      <MobileBottomNav />
    </main>
  );
}

/** Ksztalt karty bez tresci - zeby nie sugerowac danych, ktorych jeszcze nie ma. */
function LoadingList() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading open asks">
      {[0, 1].map((index) => (
        <div
          key={index}
          className="rounded-card border border-soft-line bg-soft-surface p-5 shadow-card"
        >
          <div className="mb-4 h-3 w-24 rounded-pill bg-soft-sunken" />
          <div className="mb-2 h-3.5 w-full rounded-pill bg-soft-sunken" />
          <div className="mb-5 h-3.5 w-3/4 rounded-pill bg-soft-sunken" />
          <div className="h-12 w-full rounded-pill bg-soft-sunken" />
        </div>
      ))}
    </div>
  );
}

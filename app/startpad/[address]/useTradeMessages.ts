'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Hex } from 'viem';
import { usePublicClient } from 'wagmi';
import { LAUNCHPAD_CHAIN } from '../config';
import { decodeTradeMessage } from './tradeMessage';

/**
 * Wiadomosci przy kupnach z bieżącej strony tabeli.
 *
 * Wiadomosc siedzi w danych transakcji, nie w logu, wiec kazda wymaga jednego
 * `getTransaction`. Dlatego tylko widoczne wiersze, najwyzej 4 zapytania naraz
 * (publiczne RPC Base odmawiaja przy szybkich seriach) i pamiec - takze "brak
 * wiadomosci", bo transakcja na lancuchu juz sie nie zmieni.
 */

const CONCURRENCY = 4;
const STORAGE_KEY = `startpad:trade-messages:v1:${LAUNCHPAD_CHAIN.id}`;
const STORAGE_MAX = 600;

/** txHash (male litery) -> tekst albo null = sprawdzone, bez wiadomosci. */
const cache = new Map<string, string | null>();
const inflight = new Set<string>();
let hydrated = false;

function hydrate() {
  if (hydrated || typeof window === 'undefined') return;
  hydrated = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const rows = JSON.parse(raw) as unknown;
    if (!Array.isArray(rows)) return;
    for (const row of rows) {
      if (Array.isArray(row) && typeof row[0] === 'string' && (typeof row[1] === 'string' || row[1] === null)) {
        cache.set(row[0], row[1]);
      }
    }
  } catch {
    /* prywatne okno albo uszkodzony zapis - po prostu dociagniemy jeszcze raz */
  }
}

function persist() {
  try {
    const rows = [...cache.entries()].slice(-STORAGE_MAX);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
  } catch {
    /* pelny albo zablokowany storage - pamiec w module wystarczy na te sesje */
  }
}

export function useTradeMessages(txHashes: ReadonlyArray<string | null>): Map<string, string> {
  const client = usePublicClient({ chainId: LAUNCHPAD_CHAIN.id });
  const [version, setVersion] = useState(0);

  // Klucz tekstowy, nie tablica: rodzic buduje liste na kazdym renderze, a nowa
  // referencja co render to nowe zapytania co render.
  const wantedKey = [...new Set(txHashes.filter((h): h is string => !!h).map((h) => h.toLowerCase()))].join(',');
  const wanted = useMemo(() => (wantedKey ? wantedKey.split(',') : []), [wantedKey]);

  useEffect(() => {
    hydrate();
    if (!client) return;
    const missing = wanted.filter((h) => !cache.has(h) && !inflight.has(h));
    // Wszystko juz w pamieci (np. z localStorage) - jeden render, zeby to pokazac.
    if (missing.length === 0) {
      setVersion((v) => v + 1);
      return;
    }
    const queue = [...missing];
    queue.forEach((h) => inflight.add(h));

    const worker = async () => {
      while (queue.length > 0) {
        const hash = queue.shift()!;
        try {
          const tx = await client.getTransaction({ hash: hash as Hex });
          cache.set(hash, decodeTradeMessage(tx.input));
        } catch {
          // Nie zapisujemy porazki - przy nastepnym renderze sprobujemy znowu.
        } finally {
          inflight.delete(hash);
        }
      }
    };

    // Bez flagi anulowania: po zmianie strony te zapytania sa juz w `inflight`,
    // wiec nowy efekt ich nie powtorzy - ktos musi odswiezyc widok, gdy wroca.
    void Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker)).then(() => {
      persist();
      setVersion((v) => v + 1);
    });
  }, [client, wanted]);

  return useMemo(() => {
    void version;
    const out = new Map<string, string>();
    for (const h of wanted) {
      const text = cache.get(h);
      if (text) out.set(h, text);
    }
    return out;
  }, [wanted, version]);
}

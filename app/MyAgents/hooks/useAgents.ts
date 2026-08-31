"use client";

/**
 * Lista agentow dla /MyAgents.
 *
 * ZRODLO DANYCH: rejestr MySphere w Firestore (app/utils/agents/registry.ts).
 * Wczesniej hook czytal wylacznie z `@registrai/kya`, czyli z uslugi, ktora nie
 * istnieje (szczegoly w lib/kya.ts) - nie mial wlasnego magazynu, wiec lista
 * agentow byla zawsze pusta albo bledna.
 *
 * STRONICOWANIE: kursorem po `registeredAtMs`, a nie po numerze strony -
 * Firestore nie ma offsetu, a kursor nie przelicza poprzednich stron.
 * Publiczny ksztalt hooka zostaje bez zmian, zeby page.tsx nie wymagal
 * przerobki.
 *
 * PUSTA KOLEKCJA: `agents: []`, `error: null`, `hasMore: false`. AgentGrid
 * pokazuje wtedy swoj wlasny stan "No agents found" - bez bledu.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { listAgents } from "@/app/utils/agents/registry";
import type { AgentRecord } from "@/app/utils/agents/types";
import type { AgentFilters } from "../types";

const PAGE_SIZE = 24;

export function useAgents(filters: AgentFilters = {}) {
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  // Kursor trzymamy w ref, a nie w stanie - jest wejsciem do nastepnego
  // pobrania, a nie czyms, co renderuje sie na ekranie.
  const cursorRef = useRef<number | null>(null);
  // Numer zadania odsiewa odpowiedzi po szybkiej zmianie filtra: liczy sie
  // tylko wynik ostatniego pobrania.
  const requestRef = useRef(0);

  const network = filters.network || "mainnet";
  const chain = filters.chain;

  const fetchPage = useCallback(
    async (reset: boolean) => {
      const requestId = ++requestRef.current;

      if (reset) {
        cursorRef.current = null;
        setLoading(true);
      } else {
        setLoadingMore(true);
      }
      setError(null);

      try {
        const result = await listAgents({
          limit: PAGE_SIZE,
          cursor: reset ? null : cursorRef.current,
          network,
          chain,
        });
        if (requestId !== requestRef.current) return;

        cursorRef.current = result.nextCursor;
        setHasMore(result.hasMore);
        setAgents((prev) => (reset ? result.items : [...prev, ...result.items]));
      } catch (err) {
        if (requestId !== requestRef.current) return;
        setError(err instanceof Error ? err.message : "Failed to load agents");
      } finally {
        if (requestId === requestRef.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [network, chain]
  );

  // Zmiana filtra zaczyna liste od nowa - stary kursor dotyczyl innego zbioru.
  useEffect(() => {
    void fetchPage(true);
  }, [fetchPage]);

  const loadMore = useCallback(() => {
    if (loadingMore || loading || !hasMore) return;
    void fetchPage(false);
  }, [fetchPage, hasMore, loading, loadingMore]);

  return { agents, loading, loadingMore, error, hasMore, loadMore };
}

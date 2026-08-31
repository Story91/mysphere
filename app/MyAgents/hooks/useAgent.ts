"use client";

/**
 * Profil pojedynczego agenta + jego reputacja i historia.
 *
 * ZRODLO DANYCH: rejestr MySphere (app/utils/agents/registry.ts) zamiast
 * nieistniejacego KYA - patrz lib/kya.ts.
 *
 * LICZBA ODCZYTOW: DWA na wejscie w profil - dokument agenta (po kluczu) i
 * jego opinie (jedno zapytanie po jednym polu). Reputacja zbiorcza, rozbicie
 * na lancuchy i historia sa liczone z tych samych opinii w pamieci, zamiast
 * trzech osobnych zapytan jak w poprzedniej wersji.
 *
 * BRAK AGENTA: `agent: null`, `error: null` - strona pokazuje wtedy pusty
 * profil, a nie komunikat o awarii API.
 */

import { useEffect, useState } from "react";
import {
  computePerChainReputation,
  computeReputationHistory,
  getAgent,
  getAgentFeedback,
} from "@/app/utils/agents/registry";
import type {
  AgentRecord,
  AgentReputation,
  AgentReputationSnapshot,
} from "@/app/utils/agents/types";

export function useAgent(agentId: string) {
  const [agent, setAgent] = useState<AgentRecord | null>(null);
  const [reputation, setReputation] = useState<AgentReputation | null>(null);
  const [history, setHistory] = useState<AgentReputationSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!agentId) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([getAgent(agentId), getAgentFeedback(agentId)])
      .then(([agentData, feedback]) => {
        if (cancelled) return;
        setAgent(agentData);
        setReputation({
          unified: agentData?.reputation ?? { value: 0, decimals: 0, totalFeedbackCount: 0 },
          perChain: computePerChainReputation(feedback),
        });
        setHistory(computeReputationHistory(feedback));
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load agent");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [agentId]);

  return { agent, reputation, history, loading, error };
}

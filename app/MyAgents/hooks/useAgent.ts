"use client";

import { useState, useEffect } from "react";
import { kya } from "@/lib/kya";
import type { AgentProfile, ChainReputation, ReputationSnapshot } from "@registrai/kya";

export function useAgent(agentId: string) {
  const [agent, setAgent] = useState<AgentProfile | null>(null);
  const [reputation, setReputation] = useState<{ unified: any; perChain: ChainReputation[] } | null>(null);
  const [history, setHistory] = useState<ReputationSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!agentId) return;
    setLoading(true);
    setError(null);

    Promise.all([
      kya.getAgent(agentId),
      kya.getReputation(agentId).catch(() => null),
      kya.getReputationHistory(agentId, { limit: 30 }).catch(() => []),
    ])
      .then(([agentData, repData, histData]) => {
        setAgent(agentData as AgentProfile);
        setReputation(repData as any);
        setHistory(Array.isArray(histData) ? histData : []);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load agent");
      })
      .finally(() => setLoading(false));
  }, [agentId]);

  return { agent, reputation, history, loading, error };
}

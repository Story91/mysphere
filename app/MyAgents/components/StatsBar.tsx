"use client";

import { useState, useEffect } from "react";
import { kya } from "@/lib/kya";
import { Skeleton } from "@/components/ui/skeleton";

interface Stats {
  totalAgents: number;
  totalChains: number;
  totalFeedback: number;
  trustedPercent: number;
}

export function StatsBar() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    kya
      .getStats({ network: "mainnet" })
      .then((raw: any) => {
        setStats({
          totalAgents: raw.totalAgents ?? raw.agents ?? 0,
          totalChains: raw.totalChains ?? raw.chains ?? 20,
          totalFeedback: raw.totalFeedback ?? raw.feedback ?? 0,
          trustedPercent: raw.trustedPercent ?? raw.trusted ?? 0,
        });
      })
      .catch(() => {
        setStats({ totalAgents: 0, totalChains: 20, totalFeedback: 0, trustedPercent: 0 });
      })
      .finally(() => setLoading(false));
  }, []);

  const items = [
    { label: "Total Agents", value: stats?.totalAgents?.toLocaleString() ?? "—" },
    { label: "Chains Indexed", value: stats?.totalChains?.toLocaleString() ?? "20+" },
    { label: "On-chain Reviews", value: stats?.totalFeedback?.toLocaleString() ?? "—" },
    { label: "KYA Verified", value: stats ? `${stats.trustedPercent}%` : "—" },
  ];

  return (
    <div className="w-full border-b border-gray-100 bg-white">
      <div className="max-w-7xl mx-auto px-6 py-4 grid grid-cols-2 md:grid-cols-4 gap-6">
        {items.map(({ label, value }) => (
          <div key={label} className="flex flex-col gap-0.5">
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">{label}</span>
            {loading ? (
              <Skeleton className="h-7 w-20 rounded-md" />
            ) : (
              <span className="text-2xl font-bold text-gray-900 font-['Coinbase_Display']">{value}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

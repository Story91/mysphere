"use client";

import { useState, useEffect } from "react";
import { kya } from "@/lib/kya";
import type { TrustCheckResult } from "@registrai/kya";

interface KYATrustBadgeProps {
  agentId: string;
  minScore?: number;
  minFeedback?: number;
  size?: "sm" | "md";
}

export function KYATrustBadge({
  agentId,
  minScore = 50,
  minFeedback = 3,
  size = "sm",
}: KYATrustBadgeProps) {
  const [result, setResult] = useState<TrustCheckResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!agentId) return;
    kya
      .isAgentTrusted(agentId, { minScore, minFeedback })
      .then(setResult)
      .catch(() => setResult(null))
      .finally(() => setLoading(false));
  }, [agentId, minScore, minFeedback]);

  const textSize = size === "md" ? "text-sm px-3 py-1" : "text-xs px-2 py-0.5";

  if (loading) {
    return (
      <span className={`inline-flex items-center gap-1 rounded-full bg-gray-100 ${textSize} text-gray-400 animate-pulse`}>
        <span className="w-2 h-2 rounded-full bg-gray-300 inline-block" />
        Checking...
      </span>
    );
  }

  if (!result) return null;

  if (result.trusted) {
    return (
      <a
        href={`https://registrai-web.pages.dev/?q=${agentId}`}
        target="_blank"
        rel="noopener noreferrer"
        title={`Score: ${result.score} | ${result.feedbackCount} reviews across chains`}
        className={`inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 ${textSize} font-medium text-emerald-700 hover:bg-emerald-100 transition-colors`}
      >
        <svg className="h-3 w-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
            clipRule="evenodd"
          />
        </svg>
        KYA Verified · {result.score}
      </a>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-gray-100 border border-gray-200 ${textSize} text-gray-500`}
      title={result.reason || "Not yet verified on-chain"}
    >
      <span className="w-2 h-2 rounded-full bg-gray-300 inline-block flex-shrink-0" />
      Unverified
    </span>
  );
}

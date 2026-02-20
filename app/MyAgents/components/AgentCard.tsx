"use client";

import Link from "next/link";
import { useState } from "react";
import { motion } from "framer-motion";
import { KYATrustBadge } from "./KYATrustBadge";
import { ChainBadge } from "./ChainBadge";
import type { AgentSummary } from "@registrai/kya";

interface AgentCardProps {
  agent: AgentSummary;
  index?: number;
}

function shortAddress(addr: string) {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function generateAvatar(seed: string) {
  const colors = [
    "#0052FF", "#6366f1", "#8b5cf6", "#ec4899",
    "#f97316", "#10b981", "#06b6d4", "#f59e0b",
  ];
  const index = seed
    .split("")
    .reduce((acc, c) => acc + c.charCodeAt(0), 0) % colors.length;
  return colors[index];
}

export function AgentCard({ agent, index = 0 }: AgentCardProps) {
  const [copied, setCopied] = useState(false);
  const agentId = (agent as any).masterAgentId ?? (agent as any).id ?? (agent as any).ownerAddress ?? "";
  const ownerAddress = (agent as any).ownerAddress ?? "";
  const chains: string[] = (agent as any).chains ?? (agent as any).identities?.map((i: any) => i.chain) ?? [];
  const feedbackCount: number = (agent as any).feedbackCount ?? (agent as any).reputation?.totalFeedbackCount ?? 0;
  const score: number = (agent as any).score ?? (agent as any).reputation?.value ?? 0;
  const registeredAt: string = (agent as any).registeredAt ?? "";

  const avatarColor = generateAvatar(agentId || ownerAddress);

  const handleCopy = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(agentId || ownerAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.04 }}
    >
      <Link href={`/MyAgents/${encodeURIComponent(agentId || ownerAddress)}`}>
        <div className="group relative bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-gray-200 transition-all duration-200 p-5 flex flex-col gap-4 cursor-pointer h-full">
          {/* Header */}
          <div className="flex items-start gap-3">
            {/* Avatar */}
            <div
              className="w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center text-white font-bold text-sm"
              style={{ backgroundColor: avatarColor }}
            >
              {(agentId || ownerAddress).slice(2, 4).toUpperCase()}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-mono text-gray-700 truncate">
                  {shortAddress(ownerAddress || agentId)}
                </span>
                <button
                  onClick={handleCopy}
                  className="text-gray-300 hover:text-gray-500 transition-colors flex-shrink-0"
                  title="Copy ID"
                >
                  {copied ? (
                    <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  )}
                </button>
              </div>
              {registeredAt && (
                <p className="text-[10px] text-gray-400 mt-0.5">
                  Registered {new Date(registeredAt).toLocaleDateString()}
                </p>
              )}
            </div>
          </div>

          {/* KYA Badge */}
          <div>
            <KYATrustBadge agentId={agentId || ownerAddress} />
          </div>

          {/* Chains */}
          {chains.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {chains.slice(0, 4).map((chain) => (
                <ChainBadge key={chain} chain={chain} />
              ))}
              {chains.length > 4 && (
                <span className="text-[10px] text-gray-400 px-1.5 py-0.5">+{chains.length - 4}</span>
              )}
            </div>
          )}

          {/* Footer stats */}
          <div className="flex items-center justify-between pt-1 border-t border-gray-50 text-xs text-gray-400 mt-auto">
            <span>{feedbackCount} review{feedbackCount !== 1 ? "s" : ""}</span>
            {score !== 0 && (
              <span className={score >= 50 ? "text-emerald-600 font-medium" : "text-gray-400"}>
                Score: {score}
              </span>
            )}
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

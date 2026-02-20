"use client";

import { AgentCard } from "./AgentCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import type { AgentSummary } from "@registrai/kya";

interface AgentGridProps {
  agents: AgentSummary[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  onLoadMore: () => void;
}

function AgentCardSkeleton() {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <Skeleton className="w-10 h-10 rounded-xl flex-shrink-0" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-4 w-32 rounded" />
          <Skeleton className="h-3 w-20 rounded" />
        </div>
      </div>
      <Skeleton className="h-5 w-28 rounded-full" />
      <div className="flex gap-1">
        <Skeleton className="h-4 w-12 rounded-full" />
        <Skeleton className="h-4 w-14 rounded-full" />
        <Skeleton className="h-4 w-10 rounded-full" />
      </div>
      <div className="flex justify-between pt-1 border-t border-gray-50">
        <Skeleton className="h-3 w-16 rounded" />
        <Skeleton className="h-3 w-14 rounded" />
      </div>
    </div>
  );
}

export function AgentGrid({ agents, loading, loadingMore, hasMore, error, onLoadMore }: AgentGridProps) {
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mb-4">
          <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <p className="text-sm text-gray-500">{error}</p>
        <p className="text-xs text-gray-400 mt-1">KYA API may be temporarily unavailable</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <AgentCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (!loading && agents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center mb-4">
          <svg className="w-6 h-6 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <p className="text-sm text-gray-500">No agents found</p>
        <p className="text-xs text-gray-400 mt-1">Try adjusting your filters</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {agents.map((agent, i) => (
          <AgentCard
            key={(agent as any).masterAgentId ?? (agent as any).id ?? i}
            agent={agent}
            index={i}
          />
        ))}
        {loadingMore &&
          Array.from({ length: 4 }).map((_, i) => <AgentCardSkeleton key={`more-${i}`} />)}
      </div>

      {hasMore && !loadingMore && (
        <div className="flex justify-center pt-4">
          <Button
            variant="outline"
            onClick={onLoadMore}
            className="rounded-xl px-8 border-gray-200 text-gray-600 hover:border-[#0052FF] hover:text-[#0052FF]"
          >
            Load more agents
          </Button>
        </div>
      )}
    </div>
  );
}

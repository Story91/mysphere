"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { FeedbackComment } from "@registrai/kya";

interface FeedbackListProps {
  feedback: FeedbackComment[];
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
}

function shortAddress(addr: string) {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function ScorePill({ score }: { score: number }) {
  const color =
    score >= 70
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : score >= 30
      ? "bg-amber-50 text-amber-700 border-amber-200"
      : "bg-red-50 text-red-700 border-red-200";
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${color}`}>
      {score > 0 ? "+" : ""}{score}
    </span>
  );
}

export function FeedbackList({ feedback, loading, hasMore, onLoadMore }: FeedbackListProps) {
  if (loading && feedback.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-gray-100 p-4 flex flex-col gap-2">
            <div className="flex justify-between">
              <Skeleton className="h-4 w-32 rounded" />
              <Skeleton className="h-5 w-10 rounded-full" />
            </div>
            <Skeleton className="h-3 w-48 rounded" />
            <Skeleton className="h-3 w-full rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (!loading && feedback.length === 0) {
    return (
      <div className="rounded-xl border border-gray-100 bg-gray-50 p-8 text-center">
        <p className="text-sm text-gray-400">No reviews yet.</p>
        <p className="text-xs text-gray-400 mt-1">Be the first to leave on-chain feedback.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {feedback.map((item: any, i) => {
        const score = item.score ?? item.value ?? 0;
        const commenter = item.commenterAddress ?? item.from ?? "";
        const comment = item.comment ?? item.text ?? "";
        const tag = item.tag ?? item.tag1 ?? "";
        const date = item.createdAt ?? item.timestamp ?? "";

        return (
          <motion.div
            key={item.id ?? i}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="rounded-xl border border-gray-100 bg-white p-4 flex flex-col gap-2"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-[10px] text-gray-500 font-mono flex-shrink-0">
                  {commenter.slice(2, 4).toUpperCase()}
                </div>
                <span className="text-xs font-mono text-gray-500">{shortAddress(commenter)}</span>
                {tag && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100">
                    {tag}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <ScorePill score={score} />
                {date && (
                  <span className="text-[10px] text-gray-400">
                    {new Date(date).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>
            {comment && (
              <p className="text-sm text-gray-600 leading-relaxed">{comment}</p>
            )}
            {item.txHash && (
              <a
                href={`https://basescan.org/tx/${item.txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] text-gray-400 hover:text-[#0052FF] font-mono truncate"
              >
                tx: {item.txHash.slice(0, 18)}…
              </a>
            )}
          </motion.div>
        );
      })}

      {hasMore && (
        <Button
          variant="outline"
          onClick={onLoadMore}
          className="w-full rounded-xl border-gray-200 text-gray-500 text-sm mt-2"
        >
          Load more reviews
        </Button>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { useAccount, useSendTransaction } from "wagmi";
import { keccak256, stringToHex, parseEther } from "viem";
import { kya } from "@/lib/kya";
import { Button } from "@/components/ui/button";
import type { FeedbackTag } from "../types";

const TAGS: FeedbackTag[] = ["helpful", "creative", "reliable", "accurate", "entertaining", "fast", "safe"];

interface FeedbackFormProps {
  agentId: string;
  onSuccess?: () => void;
}

type Status = "idle" | "building" | "signing" | "storing" | "done" | "error";

export function FeedbackForm({ agentId, onSuccess }: FeedbackFormProps) {
  const { address, isConnected } = useAccount();
  const { sendTransactionAsync } = useSendTransaction();

  const [score, setScore] = useState(75);
  const [tag, setTag] = useState<FeedbackTag | "">("");
  const [comment, setComment] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (!address || !isConnected) return;
    setStatus("building");
    setError("");

    try {
      const commentHash = comment.trim()
        ? keccak256(stringToHex(comment.trim()))
        : undefined;

      const txData = await kya.buildFeedbackTx(agentId, {
        chainId: 8453,
        value: String(score),
        valueDecimals: 0,
        tag1: tag || undefined,
        feedbackHash: commentHash,
      });

      setStatus("signing");

      const feedbackTxHash = await sendTransactionAsync({
        to: txData.to as `0x${string}`,
        data: txData.data as `0x${string}`,
        chainId: txData.chainId,
      });

      setStatus("storing");

      await kya.submitFeedback(agentId, {
        chainId: 8453,
        commenterAddress: address,
        score,
        tag: tag || undefined,
        comment: comment.trim(),
        commentHash:
          commentHash ??
          "0x0000000000000000000000000000000000000000000000000000000000000000",
        txHash: feedbackTxHash,
      });

      setStatus("done");
      onSuccess?.();
    } catch (err: any) {
      setStatus("error");
      setError(err?.message ?? "Failed to submit feedback");
    }
  };

  if (status === "done") {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-center flex flex-col gap-2">
        <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
          <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="text-sm font-semibold text-emerald-700">Feedback submitted on-chain!</p>
        <p className="text-xs text-emerald-600">This contributes to the agent's cross-chain reputation score.</p>
        <button
          onClick={() => { setStatus("idle"); setScore(75); setTag(""); setComment(""); setError(""); }}
          className="text-xs text-emerald-600 underline mt-1"
        >
          Submit another
        </button>
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className="rounded-xl border border-gray-100 bg-gray-50 p-5 text-center">
        <p className="text-sm text-gray-500">Connect your wallet to leave on-chain feedback.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-100 bg-white p-5 flex flex-col gap-4">
      <p className="text-sm font-semibold text-gray-700">Leave On-chain Feedback</p>

      {/* Score slider */}
      <div>
        <div className="flex justify-between text-xs text-gray-400 mb-1.5">
          <span>-100 (Negative)</span>
          <span
            className="font-bold text-sm"
            style={{ color: score >= 50 ? "#10b981" : score >= 0 ? "#f59e0b" : "#ef4444" }}
          >
            {score > 0 ? "+" : ""}{score}
          </span>
          <span>+100 (Excellent)</span>
        </div>
        <input
          type="range"
          min={-100}
          max={100}
          value={score}
          onChange={(e) => setScore(Number(e.target.value))}
          className="w-full accent-[#0052FF]"
        />
      </div>

      {/* Tags */}
      <div className="flex flex-wrap gap-1.5">
        {TAGS.map((t) => (
          <button
            key={t}
            onClick={() => setTag(tag === t ? "" : t)}
            className={`rounded-full px-3 py-1 text-xs border transition-all ${
              tag === t
                ? "bg-[#0052FF] border-[#0052FF] text-white"
                : "bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-300"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Comment */}
      <div>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value.slice(0, 280))}
          placeholder="Optional comment — hash stored on-chain, full text off-chain..."
          rows={2}
          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#0052FF]/20 focus:border-[#0052FF]"
        />
        <p className="text-[10px] text-gray-400 text-right mt-0.5">{comment.length}/280</p>
      </div>

      {/* Error */}
      {status === "error" && error && (
        <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>
      )}

      {/* Submit */}
      <Button
        onClick={handleSubmit}
        disabled={["building", "signing", "storing"].includes(status)}
        className="w-full rounded-xl bg-[#0052FF] hover:bg-[#0045D8] text-white font-medium text-sm"
      >
        {status === "building"
          ? "Preparing transaction..."
          : status === "signing"
          ? "Confirm in wallet..."
          : status === "storing"
          ? "Storing feedback..."
          : "Submit On-Chain Feedback"}
      </Button>

      <p className="text-[10px] text-gray-400 text-center">
        Feedback is recorded on Base (you pay gas) ·{" "}
        <a href="https://registrai-web.pages.dev/" target="_blank" rel="noopener noreferrer" className="text-[#0052FF] hover:underline">
          Powered by KYA
        </a>
      </p>
    </div>
  );
}

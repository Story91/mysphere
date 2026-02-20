"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import type { ReputationSnapshot } from "@registrai/kya";

interface ReputationChartProps {
  history: ReputationSnapshot[];
}

export function ReputationChart({ history }: ReputationChartProps) {
  const data = useMemo(() => {
    return history.map((s: any) => ({
      date: new Date(s.timestamp ?? s.createdAt ?? Date.now()).toLocaleDateString("en", { month: "short", day: "numeric" }),
      score: Number(s.value ?? s.score ?? 0),
    }));
  }, [history]);

  if (!data.length) {
    return (
      <div className="h-32 flex items-center justify-center rounded-xl bg-gray-50 border border-gray-100">
        <p className="text-sm text-gray-400">No reputation history yet</p>
      </div>
    );
  }

  const maxScore = Math.max(...data.map((d) => d.score), 100);
  const minScore = Math.min(...data.map((d) => d.score), 0);
  const range = maxScore - minScore || 100;
  const WIDTH = 600;
  const HEIGHT = 120;
  const PAD = { top: 12, right: 16, bottom: 24, left: 32 };
  const chartW = WIDTH - PAD.left - PAD.right;
  const chartH = HEIGHT - PAD.top - PAD.bottom;

  const toX = (i: number) => PAD.left + (i / Math.max(data.length - 1, 1)) * chartW;
  const toY = (score: number) => PAD.top + chartH - ((score - minScore) / range) * chartH;

  const linePath = data.map((d, i) => `${i === 0 ? "M" : "L"} ${toX(i)} ${toY(d.score)}`).join(" ");
  const areaPath = `${linePath} L ${toX(data.length - 1)} ${HEIGHT - PAD.bottom} L ${toX(0)} ${HEIGHT - PAD.bottom} Z`;

  const latestScore = data[data.length - 1]?.score ?? 0;
  const scoreColor = latestScore >= 70 ? "#10b981" : latestScore >= 40 ? "#f59e0b" : "#ef4444";

  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-gray-700">Reputation History</p>
        <span className="text-lg font-bold" style={{ color: scoreColor }}>
          {latestScore > 0 ? "+" : ""}{latestScore}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        style={{ height: HEIGHT }}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={scoreColor} stopOpacity="0.15" />
            <stop offset="100%" stopColor={scoreColor} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#chartGrad)" />
        <path d={linePath} fill="none" stroke={scoreColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {data.map((d, i) => (
          <circle key={i} cx={toX(i)} cy={toY(d.score)} r="3" fill={scoreColor} />
        ))}
        {[data[0], data[Math.floor(data.length / 2)], data[data.length - 1]]
          .filter(Boolean)
          .map((d, i, arr) => {
            const idx = i === 0 ? 0 : i === 1 ? Math.floor(data.length / 2) : data.length - 1;
            return (
              <text
                key={idx}
                x={toX(idx)}
                y={HEIGHT - 4}
                textAnchor="middle"
                fontSize="9"
                fill="#9ca3af"
              >
                {d.date}
              </text>
            );
          })}
      </svg>
    </div>
  );
}

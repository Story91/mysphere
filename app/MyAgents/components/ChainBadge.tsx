"use client";

const CHAIN_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  base: { label: "Base", color: "text-blue-700", bg: "bg-blue-50 border-blue-200" },
  ethereum: { label: "Ethereum", color: "text-indigo-700", bg: "bg-indigo-50 border-indigo-200" },
  arbitrum: { label: "Arbitrum", color: "text-sky-700", bg: "bg-sky-50 border-sky-200" },
  optimism: { label: "Optimism", color: "text-red-700", bg: "bg-red-50 border-red-200" },
  celo: { label: "Celo", color: "text-yellow-700", bg: "bg-yellow-50 border-yellow-200" },
  linea: { label: "Linea", color: "text-violet-700", bg: "bg-violet-50 border-violet-200" },
  polygon: { label: "Polygon", color: "text-purple-700", bg: "bg-purple-50 border-purple-200" },
  bnb: { label: "BNB", color: "text-amber-700", bg: "bg-amber-50 border-amber-200" },
  avalanche: { label: "Avalanche", color: "text-red-700", bg: "bg-red-50 border-red-200" },
  scroll: { label: "Scroll", color: "text-orange-700", bg: "bg-orange-50 border-orange-200" },
  gnosis: { label: "Gnosis", color: "text-teal-700", bg: "bg-teal-50 border-teal-200" },
  mantle: { label: "Mantle", color: "text-gray-700", bg: "bg-gray-100 border-gray-200" },
};

interface ChainBadgeProps {
  chain: string;
  size?: "xs" | "sm";
}

export function ChainBadge({ chain, size = "xs" }: ChainBadgeProps) {
  if (!chain) return null;
  const config = CHAIN_CONFIG[chain.toLowerCase()] ?? {
    label: chain,
    color: "text-gray-600",
    bg: "bg-gray-50 border-gray-200",
  };

  const textSize = size === "sm" ? "text-xs px-2.5 py-0.5" : "text-[10px] px-2 py-0.5";

  return (
    <span
      className={`inline-flex items-center rounded-full border font-medium ${textSize} ${config.color} ${config.bg}`}
    >
      {config.label}
    </span>
  );
}

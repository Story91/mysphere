"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import { ElementType, Rarity } from "@/types/contract";

interface BaseElementProps {
  id: string;
  elementType: ElementType;
  rarity: Rarity;
  level: number;
  power: number;
}

const getElementImage = (elementType: ElementType, rarity: Rarity) => {
  // Specjalna obsługa dla Defense Tower, który ma już obrazki
  if (elementType === ElementType.DEFENSE_TOWER) {
    const imageNumber = {
      [Rarity.COMMON]: "1",
      [Rarity.EPIC]: "2",
      [Rarity.RARE]: "3",
      [Rarity.UNCOMMON]: "4",
    }[rarity];
    return `/nft-assets/defense-tower/${rarity.toLowerCase()}/${imageNumber}.png`;
  }

  // Dla pozostałych elementów używamy placeholderów SVG
  const color = encodeURIComponent(rarityColors[rarity]);
  const svgPaths = {
    [ElementType.REACTOR]: "M13 10V3L4 14h7v7l9-11h-7z",
    [ElementType.STORAGE]: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4",
    [ElementType.LIVING_MODULE]: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",
    [ElementType.TECH_LAB]: "M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
  };

  return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='${color}' stroke-width='2'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='${svgPaths[elementType]}'%3E%3C/path%3E%3C/svg%3E`;
};

const rarityColors = {
  [Rarity.COMMON]: "#9CA3AF", // gray-400
  [Rarity.UNCOMMON]: "#60A5FA", // blue-400
  [Rarity.RARE]: "#C084FC", // purple-400
  [Rarity.EPIC]: "#FBBF24", // yellow-400
};

const rarityBorders = {
  [Rarity.COMMON]: "border-gray-400",
  [Rarity.UNCOMMON]: "border-blue-400",
  [Rarity.RARE]: "border-purple-400",
  [Rarity.EPIC]: "border-yellow-400",
};

const rarityGlow = {
  [Rarity.COMMON]: "shadow-gray-400/50",
  [Rarity.UNCOMMON]: "shadow-blue-400/50",
  [Rarity.RARE]: "shadow-purple-400/50",
  [Rarity.EPIC]: "shadow-yellow-400/50",
};

const elementNames = {
  [ElementType.REACTOR]: "Reactor",
  [ElementType.STORAGE]: "Storage",
  [ElementType.DEFENSE_TOWER]: "Defense Tower",
  [ElementType.LIVING_MODULE]: "Living Module",
  [ElementType.TECH_LAB]: "Tech Lab",
};

export default function BaseElement({
  id,
  elementType,
  rarity,
  level,
  power,
}: BaseElementProps) {
  return (
    <motion.div
      whileHover={{ scale: 1.05 }}
      className={`relative p-4 rounded-lg border-2 ${rarityBorders[rarity]} bg-gray-900 shadow-lg ${rarityGlow[rarity]}`}
    >
      <div className="relative w-full aspect-square mb-4">
        <Image
          src={getElementImage(elementType, rarity)}
          alt={`${rarity} ${elementNames[elementType]}`}
          fill
          className={`rounded-lg ${elementType === ElementType.DEFENSE_TOWER ? 'object-cover' : 'object-contain p-4'}`}
        />
      </div>
      <div className="space-y-2">
        <h3 className="text-lg font-bold text-white">{elementNames[elementType]}</h3>
        <div className="flex justify-between text-sm text-gray-400">
          <span>Level {level}</span>
          <span>Power {power}</span>
        </div>
        <div className="text-xs text-right capitalize text-gray-500">
          {rarity.toLowerCase()}
        </div>
      </div>
    </motion.div>
  );
} 
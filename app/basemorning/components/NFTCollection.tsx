import { motion } from "framer-motion";
import { BaseElement, ElementType, Rarity } from "@/types/contract";
import BaseElementComponent from "./BaseElement";
import {
  CubeTransparentIcon,
  LockClosedIcon,
  QuestionMarkCircleIcon,
} from "@heroicons/react/24/solid";

interface NFTCollectionProps {
  userElements: BaseElement[];
}

const REQUIRED_ELEMENTS = [
  {
    type: ElementType.REACTOR,
    rarity: Rarity.COMMON,
    level: 1,
    name: "Basic Reactor",
    requirement: "First Check-in"
  },
  {
    type: ElementType.LIVING_MODULE,
    rarity: Rarity.UNCOMMON,
    level: 2,
    name: "Advanced Living Module",
    requirement: "7 Day Streak"
  },
  {
    type: ElementType.DEFENSE_TOWER,
    rarity: Rarity.RARE,
    level: 3,
    name: "Elite Defense Tower",
    requirement: "14 Day Streak"
  },
  {
    type: ElementType.TECH_LAB,
    rarity: Rarity.EPIC,
    level: 4,
    name: "Ultimate Tech Lab",
    requirement: "30 Day Streak"
  },
  {
    type: ElementType.STORAGE,
    rarity: Rarity.EPIC,
    level: 5,
    name: "Quantum Storage",
    requirement: "Complete All Achievements"
  }
];

// Definicja wszystkich możliwych elementów
const ALL_ELEMENTS = [
  ElementType.REACTOR,
  ElementType.STORAGE,
  ElementType.DEFENSE_TOWER,
  ElementType.LIVING_MODULE,
  ElementType.TECH_LAB,
];

const ALL_RARITIES = [
  Rarity.COMMON,
  Rarity.UNCOMMON,
  Rarity.RARE,
  Rarity.EPIC,
];

const NFTPreview = ({ elementType, rarity, isDiscovered }: { 
  elementType: ElementType, 
  rarity: Rarity, 
  isDiscovered: boolean 
}) => {
  const rarityColors = {
    [Rarity.COMMON]: "from-gray-400/20 to-gray-600/20",
    [Rarity.UNCOMMON]: "from-blue-400/20 to-blue-600/20",
    [Rarity.RARE]: "from-purple-400/20 to-purple-600/20",
    [Rarity.EPIC]: "from-yellow-400/20 to-yellow-600/20",
  };

  // Zawsze pokazuj obrazki dla Defense Tower
  const showImage = elementType === ElementType.DEFENSE_TOWER || isDiscovered;

  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      className={`relative rounded-lg overflow-hidden bg-gradient-to-br ${rarityColors[rarity]} border border-white/10`}
    >
      <div className="p-4">
        <div className="relative aspect-square rounded-lg overflow-hidden mb-2">
          {showImage ? (
            <BaseElementComponent
              id="preview"
              elementType={elementType}
              rarity={rarity}
              level={1}
              power={100}
            />
          ) : (
            <div className="absolute inset-0 backdrop-blur-xl flex items-center justify-center bg-black/30">
              <QuestionMarkCircleIcon className="w-12 h-12 text-white/30" />
            </div>
          )}
        </div>
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium text-white/70">
            {elementType.replace("_", " ")}
          </div>
          <div className="text-xs text-white/50 capitalize">
            {rarity.toLowerCase()}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default function NFTCollection({ userElements }: NFTCollectionProps) {
  const hasElement = (type: ElementType, rarity: Rarity, level: number) => {
    return userElements.some(el => 
      el.elementType === type && 
      el.rarity === rarity && 
      el.level >= level
    );
  };

  // Funkcja sprawdzająca czy element został odkryty
  const isElementDiscovered = (elementType: ElementType, rarity: Rarity) => {
    return userElements.some(el => 
      el.elementType === elementType && 
      el.rarity === rarity
    );
  };

  return (
    <div className="space-y-8">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="bg-gray-900/80 backdrop-blur-lg rounded-xl p-6 shadow-xl border border-blue-500/20"
      >
        <div className="flex items-center gap-3 mb-6">
          <CubeTransparentIcon className="w-6 h-6 text-blue-400" />
          <h2 className="text-2xl font-bold text-white">NFT Collection Progress</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {REQUIRED_ELEMENTS.map((element) => {
            const isUnlocked = hasElement(element.type, element.rarity, element.level);
            
            return (
              <motion.div
                key={`${element.type}-${element.rarity}-${element.level}`}
                whileHover={{ scale: 1.02 }}
                className={`relative rounded-lg overflow-hidden ${
                  isUnlocked ? "bg-blue-900/20" : "bg-gray-800/50"
                }`}
              >
                <div className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className={`font-bold ${isUnlocked ? "text-blue-400" : "text-gray-400"}`}>
                      {element.name}
                    </h3>
                    {isUnlocked ? (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="text-green-400"
                      >
                        ✓
                      </motion.div>
                    ) : (
                      <LockClosedIcon className="w-5 h-5 text-gray-500" />
                    )}
                  </div>
                  
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <div className={`text-sm ${isUnlocked ? "text-gray-300" : "text-gray-500"}`}>
                        Level {element.level} {element.rarity}
                      </div>
                    </div>
                    <div className="text-xs text-gray-500">
                      Requirement: {element.requirement}
                    </div>
                  </div>

                  {isUnlocked && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="absolute top-0 right-0 w-20 h-20 -mr-10 -mt-10"
                    >
                      <div className="w-full h-full bg-blue-500/10 rounded-full" />
                    </motion.div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>

        <div className="mt-6 p-4 bg-gray-800/50 rounded-lg">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-white">Collection Stats</h3>
            <div className="text-blue-400 font-bold">
              {userElements.length} / {REQUIRED_ELEMENTS.length * 3} Total Elements
            </div>
          </div>
          <div className="w-full bg-gray-700/50 rounded-full h-2">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${(userElements.length / (REQUIRED_ELEMENTS.length * 3)) * 100}%` }}
              className="bg-blue-500 h-2 rounded-full"
            />
          </div>
        </div>
      </motion.div>

      {/* Podgląd wszystkich możliwych NFT */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="bg-gray-900/80 backdrop-blur-lg rounded-xl p-6 shadow-xl border border-blue-500/20"
      >
        <div className="flex items-center gap-3 mb-6">
          <CubeTransparentIcon className="w-6 h-6 text-purple-400" />
          <h2 className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
            NFT Discovery Atlas
          </h2>
        </div>

        {ALL_ELEMENTS.map((elementType) => (
          <div key={elementType} className="mb-8">
            <h3 className="text-xl font-bold text-white mb-4">
              {elementType.replace("_", " ")}
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {ALL_RARITIES.map((rarity) => (
                <NFTPreview
                  key={`${elementType}-${rarity}`}
                  elementType={elementType}
                  rarity={rarity}
                  isDiscovered={isElementDiscovered(elementType, rarity)}
                />
              ))}
            </div>
          </div>
        ))}

        <div className="mt-6 p-4 bg-purple-500/10 rounded-lg">
          <div className="flex items-center gap-2 text-purple-400">
            <LockClosedIcon className="w-5 h-5" />
            <span>Odkryj wszystkie NFT poprzez codzienne logowanie i fuzje!</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
} 
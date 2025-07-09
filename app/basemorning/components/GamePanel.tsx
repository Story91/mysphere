import { motion } from "framer-motion";
import { BaseElement, Player, FusionType, FusionPreview, ElementType, Rarity } from "@/types/contract";
import BaseElementComponent from "./BaseElement";
import {
  CubeTransparentIcon,
  BoltIcon,
  ArrowPathIcon,
  BeakerIcon,
  SparklesIcon,
  FireIcon,
  StarIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
} from "@heroicons/react/24/solid";
import { useState, useEffect, useMemo } from "react";

interface GamePanelProps {
  player?: Player;
  selectedElements: BaseElement[];
  onElementSelect: (element: BaseElement) => void;
  onFuse: () => Promise<void>;
  isLoading: boolean;
  allElements: BaseElement[];
}

// Fusion validation and preview logic
function validateFusion(elements: BaseElement[]): FusionPreview | null {
  if (elements.length < 3) return null;

  // Check for Genesis Fusion (5 different Epic elements)
  if (elements.length === 5) {
    const epicElements = elements.filter(el => el.rarity === Rarity.EPIC);
    if (epicElements.length !== 5) {
      return {
        type: FusionType.GENESIS,
        requiredElements: 5,
        inputElements: elements,
        outputPreview: {
          elementType: ElementType.TECH_LAB,
          rarity: Rarity.GENESIS,
          level: 1,
          estimatedPower: 3000,
        },
        cost: { eth: "0.0005" },
        isValid: false,
        errorMessage: "Genesis Fusion requires 5 Epic elements"
      };
    }

    // Check if all 5 element types are present
    const types = new Set(epicElements.map(el => el.elementType));
    if (types.size !== 5) {
      return {
        type: FusionType.GENESIS,
        requiredElements: 5,
        inputElements: elements,
        outputPreview: {
          elementType: ElementType.TECH_LAB,
          rarity: Rarity.GENESIS,
          level: 1,
          estimatedPower: 3000,
        },
        cost: { eth: "0.0005" },
        isValid: false,
        errorMessage: "Genesis Fusion requires 5 different Epic element types"
      };
    }

    return {
      type: FusionType.GENESIS,
      requiredElements: 5,
      inputElements: elements,
      outputPreview: {
        elementType: ElementType.TECH_LAB,
        rarity: Rarity.GENESIS,
        level: 1,
        estimatedPower: 3000,
      },
      cost: { eth: "0.0005" },
      isValid: true,
    };
  }

  // Check for Standard or Epic Fusion (3 identical elements)
  if (elements.length === 3) {
    const [first, second, third] = elements;
    const areIdentical = (
      first.elementType === second.elementType &&
      first.elementType === third.elementType &&
      first.rarity === second.rarity &&
      first.rarity === third.rarity &&
      first.level === second.level &&
      first.level === third.level
    );

    if (!areIdentical) {
      return {
        type: FusionType.STANDARD,
        requiredElements: 3,
        inputElements: elements,
        outputPreview: {
          elementType: first.elementType,
          rarity: first.rarity,
          level: first.level,
          estimatedPower: 0,
        },
        cost: { eth: "0.0005" },
        isValid: false,
        errorMessage: "Standard Fusion requires 3 identical elements (same type, rarity, and level)"
      };
    }

    // Epic Fusion - 3 identical Epic elements
    if (first.rarity === Rarity.EPIC) {
      return {
        type: FusionType.EPIC,
        requiredElements: 3,
        inputElements: elements,
        outputPreview: {
          elementType: first.elementType,
          rarity: Rarity.EPIC,
          level: first.level + 1,
          estimatedPower: first.power * 1.5,
        },
        cost: { eth: "0.0005" },
        isValid: true,
      };
    }

    // Standard Fusion - 3 identical non-Epic elements
    const nextRarity = {
      [Rarity.COMMON]: Rarity.UNCOMMON,
      [Rarity.UNCOMMON]: Rarity.RARE,
      [Rarity.RARE]: Rarity.EPIC,
      [Rarity.GENESIS]: undefined, // Genesis cannot be upgraded further
    }[first.rarity];

    if (!nextRarity) {
      return {
        type: FusionType.STANDARD,
        requiredElements: 3,
        inputElements: elements,
        outputPreview: {
          elementType: first.elementType,
          rarity: first.rarity,
          level: first.level,
          estimatedPower: 0,
        },
        cost: { eth: "0.0005" },
        isValid: false,
        errorMessage: "Cannot upgrade beyond Epic rarity with Standard Fusion"
      };
    }

    return {
      type: FusionType.STANDARD,
      requiredElements: 3,
      inputElements: elements,
      outputPreview: {
        elementType: first.elementType,
        rarity: nextRarity,
        level: first.level,
        estimatedPower: first.power * 1.3,
      },
      cost: { eth: "0.0005" },
      isValid: true,
    };
  }

  return null;
}

export default function GamePanel({
  player,
  selectedElements,
  onElementSelect,
  onFuse,
  isLoading,
  allElements
}: GamePanelProps) {
  const [fusionMode, setFusionMode] = useState<FusionType>(FusionType.STANDARD);
  
  const totalPower = selectedElements.reduce((sum, el) => sum + el.power, 0);
  const fusionPreview = useMemo(() => validateFusion(selectedElements), [selectedElements]);

  // Filter elements by fusion mode requirements
  const availableElements = useMemo(() => {
    if (fusionMode === FusionType.GENESIS) {
      return allElements.filter(el => el.rarity === Rarity.EPIC);
    }
    return allElements;
  }, [allElements, fusionMode]);

  // Get fusion mode info
  const fusionModeInfo = {
    [FusionType.STANDARD]: {
      name: "Standard Fusion",
      description: "3 identical elements → Higher rarity",
      icon: ArrowPathIcon,
      color: "blue",
      slots: 3,
    },
    [FusionType.EPIC]: {
      name: "Epic Fusion",
      description: "3 identical Epic elements → Higher level",
      icon: FireIcon,
      color: "yellow",
      slots: 3,
    },
    [FusionType.GENESIS]: {
      name: "Genesis Fusion",
      description: "5 different Epic elements → Ultimate Genesis",
      icon: StarIcon,
      color: "purple",
      slots: 5,
    },
  };

  const currentModeInfo = fusionModeInfo[fusionMode];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gray-900/80 backdrop-blur-lg rounded-xl p-6 shadow-xl border border-blue-500/20"
    >
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-4">
          <CubeTransparentIcon className="w-6 h-6 text-blue-400" />
          <h2 className="text-2xl font-bold text-white">Element Fusion Center</h2>
        </div>

        {/* Fusion Mode Selector */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          {Object.entries(fusionModeInfo).map(([mode, info]) => (
            <motion.button
              key={mode}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setFusionMode(mode as FusionType)}
              className={`p-3 rounded-lg border-2 transition-all ${
                fusionMode === mode
                  ? `border-${info.color}-500 bg-${info.color}-500/20`
                  : "border-gray-700 bg-gray-800/50 hover:border-gray-600"
              }`}
            >
              <info.icon className={`w-5 h-5 mx-auto mb-1 ${
                fusionMode === mode ? `text-${info.color}-400` : "text-gray-400"
              }`} />
              <div className={`text-xs font-medium ${
                fusionMode === mode ? `text-${info.color}-300` : "text-gray-400"
              }`}>
                {info.name}
              </div>
            </motion.button>
          ))}
        </div>

        {/* Current Mode Info */}
        <div className={`bg-${currentModeInfo.color}-500/10 border border-${currentModeInfo.color}-500/30 rounded-lg p-3`}>
          <div className="flex items-center gap-2 mb-1">
            <currentModeInfo.icon className={`w-4 h-4 text-${currentModeInfo.color}-400`} />
            <span className={`text-sm font-medium text-${currentModeInfo.color}-300`}>
              {currentModeInfo.name}
            </span>
          </div>
          <p className="text-xs text-gray-400">{currentModeInfo.description}</p>
        </div>
      </div>

      {/* Stats Panel */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <motion.div
          whileHover={{ scale: 1.02 }}
          className="bg-blue-400/10 rounded-lg p-4"
        >
          <div className="flex items-center gap-2 mb-2">
            <BoltIcon className="w-5 h-5 text-blue-400" />
            <div className="text-sm text-gray-400">Total Power</div>
          </div>
          <div className="text-xl font-bold text-blue-400">
            {totalPower.toLocaleString()}
          </div>
        </motion.div>

        <motion.div
          whileHover={{ scale: 1.02 }}
          className="bg-purple-400/10 rounded-lg p-4"
        >
          <div className="flex items-center gap-2 mb-2">
            <ArrowPathIcon className="w-5 h-5 text-purple-400" />
            <div className="text-sm text-gray-400">Selected</div>
          </div>
          <div className="text-xl font-bold text-purple-400">
            {selectedElements.length}/{currentModeInfo.slots}
          </div>
        </motion.div>

        <motion.div
          whileHover={{ scale: 1.02 }}
          className="bg-green-400/10 rounded-lg p-4"
        >
          <div className="flex items-center gap-2 mb-2">
            <BeakerIcon className="w-5 h-5 text-green-400" />
            <div className="text-sm text-gray-400">Fusion Ready</div>
          </div>
          <div className="text-xl font-bold text-green-400">
            {fusionPreview?.isValid ? "Yes" : "No"}
          </div>
        </motion.div>
      </div>

      {/* Selected Elements */}
      <div className="space-y-4">
        <div className="bg-gray-800/50 rounded-lg p-4">
          <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
            <CubeTransparentIcon className="w-5 h-5 text-blue-400" />
            Selected Elements ({selectedElements.length}/{currentModeInfo.slots})
          </h3>
          <div className={`grid gap-3 ${currentModeInfo.slots === 5 ? 'grid-cols-5' : 'grid-cols-3'}`}>
            {selectedElements.map((element) => (
              <motion.div
                key={element.id}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="relative"
              >
                <BaseElementComponent {...element} />
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => onElementSelect(element)}
                  className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center text-white text-xs font-bold"
                >
                  ×
                </motion.button>
              </motion.div>
            ))}
            {Array.from({ length: currentModeInfo.slots - selectedElements.length }).map((_, i) => (
              <motion.div
                key={`empty-${i}`}
                className="aspect-square rounded-lg border-2 border-dashed border-gray-700 flex items-center justify-center"
                whileHover={{ scale: 1.02 }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.5 }}
              >
                <CubeTransparentIcon className="w-8 h-8 text-gray-600" />
              </motion.div>
            ))}
          </div>
        </div>

        {/* Fusion Preview */}
        {fusionPreview && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`rounded-lg p-4 border-2 ${
              fusionPreview.isValid 
                ? "bg-green-500/10 border-green-500/30" 
                : "bg-red-500/10 border-red-500/30"
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              {fusionPreview.isValid ? (
                <CheckCircleIcon className="w-5 h-5 text-green-400" />
              ) : (
                <ExclamationTriangleIcon className="w-5 h-5 text-red-400" />
              )}
              <h4 className={`font-bold ${
                fusionPreview.isValid ? "text-green-300" : "text-red-300"
              }`}>
                Fusion Preview
              </h4>
            </div>
            
            {fusionPreview.isValid ? (
              <div className="space-y-2">
                <div className="flex items-center gap-4">
                  <div className="text-sm text-gray-400">Result:</div>
                  <div className="text-sm text-white">
                    {fusionPreview.outputPreview.rarity} {fusionPreview.outputPreview.elementType} 
                    Level {fusionPreview.outputPreview.level}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-sm text-gray-400">Estimated Power:</div>
                  <div className="text-sm text-green-400 font-bold">
                    {fusionPreview.outputPreview.estimatedPower.toLocaleString()}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-sm text-gray-400">Cost:</div>
                  <div className="text-sm text-yellow-400">{fusionPreview.cost.eth} ETH</div>
                </div>
              </div>
            ) : (
              <div className="text-sm text-red-300">
                {fusionPreview.errorMessage}
              </div>
            )}
          </motion.div>
        )}

        {/* Fusion Button */}
        {fusionPreview?.isValid && (
          <motion.button
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className={`w-full py-4 rounded-lg font-bold text-lg flex items-center justify-center gap-2 ${
              isLoading
                ? "bg-gray-700 cursor-not-allowed"
                : `bg-${currentModeInfo.color}-600 hover:bg-${currentModeInfo.color}-700`
            }`}
            onClick={onFuse}
            disabled={isLoading}
          >
            <currentModeInfo.icon className="w-6 h-6" />
            {isLoading ? "Fusing..." : `Execute ${currentModeInfo.name}`}
          </motion.button>
        )}
      </div>
    </motion.div>
  );
} 
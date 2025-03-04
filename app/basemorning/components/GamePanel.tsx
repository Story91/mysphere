import { motion } from "framer-motion";
import { BaseElement, Player } from "../types/contract";
import BaseElementComponent from "./BaseElement";
import {
  CubeTransparentIcon,
  BoltIcon,
  ArrowPathIcon,
  BeakerIcon,
} from "@heroicons/react/24/solid";

interface GamePanelProps {
  player?: Player;
  selectedElements: BaseElement[];
  onElementSelect: (element: BaseElement) => void;
  onFuse: () => Promise<void>;
  isLoading: boolean;
}

export default function GamePanel({
  player,
  selectedElements,
  onElementSelect,
  onFuse,
  isLoading
}: GamePanelProps) {
  const totalPower = selectedElements.reduce((sum, el) => sum + el.power, 0);
  const canFuse = selectedElements.length === 3;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gray-900/80 backdrop-blur-lg rounded-xl p-6 shadow-xl border border-blue-500/20"
    >
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-4">
          <CubeTransparentIcon className="w-6 h-6 text-blue-400" />
          <h2 className="text-2xl font-bold text-white">Base Control Panel</h2>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <motion.div
            whileHover={{ scale: 1.02 }}
            className="bg-blue-400/10 rounded-lg p-4"
          >
            <div className="flex items-center gap-2 mb-2">
              <BoltIcon className="w-5 h-5 text-blue-400" />
              <div className="text-sm text-gray-400">Total Power</div>
            </div>
            <div className="text-xl font-bold text-blue-400">
              {totalPower}
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
              {selectedElements.length}/3
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
              {canFuse ? "Yes" : "No"}
            </div>
          </motion.div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="bg-gray-800/50 rounded-lg p-4">
          <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
            <CubeTransparentIcon className="w-5 h-5 text-blue-400" />
            Selected Elements
          </h3>
          <div className="grid grid-cols-3 gap-3">
            {selectedElements.map((element) => (
              <motion.div
                key={element.id}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
              >
                <BaseElementComponent {...element} />
              </motion.div>
            ))}
            {Array.from({ length: 3 - selectedElements.length }).map((_, i) => (
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

        {canFuse && (
          <motion.button
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className={`w-full py-4 rounded-lg font-bold text-lg flex items-center justify-center gap-2 ${
              isLoading
                ? "bg-gray-700 cursor-not-allowed"
                : "bg-blue-600 hover:bg-blue-700"
            }`}
            onClick={onFuse}
            disabled={isLoading}
          >
            <BeakerIcon className="w-6 h-6" />
            {isLoading ? "Fusing..." : "Fuse Elements"}
          </motion.button>
        )}
      </div>
    </motion.div>
  );
} 
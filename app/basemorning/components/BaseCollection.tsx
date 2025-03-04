"use client";

import { motion } from "framer-motion";
import BaseElement from "./BaseElement";
import { BaseElement as BaseElementType } from "@/types/contract";

interface BaseCollectionProps {
  elements: BaseElementType[];
  onElementSelect?: (element: BaseElementType) => void;
}

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 }
};

export default function BaseCollection({ elements, onElementSelect }: BaseCollectionProps) {
  return (
    <div className="p-8">
      <h2 className="text-3xl font-bold mb-8 text-white">Your Collection</h2>
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6"
      >
        {elements.map((element) => (
          <motion.div
            key={element.id}
            variants={item}
            onClick={() => onElementSelect?.(element)}
            className={onElementSelect ? "cursor-pointer" : ""}
          >
            <BaseElement
              id={element.id}
              elementType={element.elementType}
              rarity={element.rarity}
              level={element.level}
              power={element.power}
            />
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
} 
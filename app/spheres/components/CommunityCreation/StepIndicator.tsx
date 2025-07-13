'use client';

import React from 'react';
import { motion } from 'framer-motion';

interface Step {
  id: number;
  title: string;
  description: string;
}

interface StepIndicatorProps {
  currentStep: number;
  steps: Step[];
}

export default function StepIndicator({ currentStep, steps }: StepIndicatorProps) {
  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        {steps.map((step, index) => (
          <div key={step.id} className="flex items-center flex-1">
            {/* Step Circle */}
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: index * 0.1 }}
              className={`relative flex items-center justify-center w-12 h-12 rounded-full font-semibold transition-all ${
                currentStep >= step.id
                  ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white'
                  : 'bg-white/10 text-gray-400 border-2 border-white/20'
              }`}
            >
              {currentStep > step.id ? (
                <span className="text-white">✓</span>
              ) : (
                <span>{step.id}</span>
              )}
            </motion.div>

            {/* Step Info */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 + 0.1 }}
              className="ml-4 flex-1"
            >
              <div className={`font-semibold ${
                currentStep >= step.id ? 'text-white' : 'text-gray-400'
              }`}>
                {step.title}
              </div>
              <div className={`text-sm ${
                currentStep >= step.id ? 'text-gray-300' : 'text-gray-500'
              }`}>
                {step.description}
              </div>
            </motion.div>

            {/* Connector Line */}
            {index < steps.length - 1 && (
              <motion.div
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ delay: index * 0.1 + 0.2, duration: 0.3 }}
                className="flex-1 mx-4 h-0.5 bg-white/20 relative"
              >
                <motion.div
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: currentStep > step.id ? 1 : 0 }}
                  transition={{ delay: index * 0.1 + 0.3, duration: 0.3 }}
                  className="absolute top-0 left-0 h-full bg-gradient-to-r from-purple-500 to-pink-500 origin-left"
                />
              </motion.div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
} 
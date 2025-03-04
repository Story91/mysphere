"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import CountUp from "react-countup";
import { Achievement, Player, BaseElement as BaseElementType } from "../types/contract";
import {
  FireIcon,
  ClockIcon,
  TrophyIcon,
  SparklesIcon,
  StarIcon,
  BoltIcon,
  ChartBarIcon,
  CubeTransparentIcon,
} from "@heroicons/react/24/solid";
import BaseElementComponent from "./BaseElement";

interface PlayerStatsProps {
  player?: Player;
  achievements: Achievement[];
  elements: BaseElementType[];
}

export default function PlayerStats({
  player,
  achievements,
  elements = []
}: PlayerStatsProps) {
  const [showAchievement, setShowAchievement] = useState(false);
  const lastCompletedAchievement = achievements.find(
    (a) => a.completed
  )?.name;

  useEffect(() => {
    if (lastCompletedAchievement) {
      setShowAchievement(true);
      const timer = setTimeout(() => setShowAchievement(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [lastCompletedAchievement]);

  const stats = [
    {
      name: "Base Level",
      value: player?.baseLevel || 0,
      icon: TrophyIcon,
      color: "text-yellow-400",
      bgColor: "bg-yellow-400/10",
    },
    {
      name: "Current Streak",
      value: player ? Number(player.streak) : 0,
      icon: FireIcon,
      color: "text-red-400",
      bgColor: "bg-red-400/10",
      suffix: "days",
    },
    {
      name: "Total XP",
      value: player ? Number(player.xp) : 0,
      icon: SparklesIcon,
      color: "text-purple-400",
      bgColor: "bg-purple-400/10",
    },
    {
      name: "Last Check-in",
      value: player?.lastCheckIn ? new Date(Number(player.lastCheckIn) * 1000).toLocaleString() : "Never",
      icon: ClockIcon,
      color: "text-blue-400",
      bgColor: "bg-blue-400/10",
      isDate: true,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Player Stats Panel */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="bg-[#0A1628]/80 backdrop-blur-lg rounded-xl p-6 shadow-xl border border-blue-500/20"
      >
        <div className="flex items-center gap-3 mb-6">
          <ChartBarIcon className="w-6 h-6 text-blue-400" />
          <h2 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
            Player Stats
          </h2>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {stats.map((stat) => (
            <motion.div
              key={stat.name}
              whileHover={{ scale: 1.02 }}
              className={`${stat.bgColor} rounded-lg p-4 border border-white/5 backdrop-blur-lg`}
            >
              <div className="flex items-center gap-2 mb-2">
                <stat.icon className={`w-5 h-5 ${stat.color}`} />
                <div className="text-sm text-gray-400">{stat.name}</div>
              </div>
              <div className={`text-xl font-bold ${stat.color}`}>
                {stat.isDate ? (
                  stat.value
                ) : typeof stat.value === 'number' ? (
                  <CountUp end={stat.value} duration={2} />
                ) : (
                  stat.value
                )}
                {stat.suffix && <span className="text-sm ml-1">{stat.suffix}</span>}
              </div>
            </motion.div>
          ))}
        </div>

        {!player?.isActive && (
          <div className="mt-4 p-4 bg-blue-500/10 rounded-lg border border-blue-500/20">
            <div className="flex items-center gap-2 text-blue-400">
              <SparklesIcon className="w-5 h-5" />
              <span>BM to start your Base Morning journey!</span>
            </div>
          </div>
        )}
      </motion.div>

      {/* My Elements Panel */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-[#0A1628]/80 backdrop-blur-lg rounded-xl p-6 shadow-xl border border-blue-500/20"
      >
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <CubeTransparentIcon className="w-6 h-6 text-green-400" />
            <h2 className="text-2xl font-bold bg-gradient-to-r from-green-400 to-emerald-400 bg-clip-text text-transparent">
              My Elements
            </h2>
          </div>
          <div className="text-sm text-gray-400">
            {elements.length} Elements
          </div>
        </div>

        {elements.length > 0 ? (
          <div className="grid grid-cols-2 gap-4 max-h-[300px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-blue-500/20 scrollbar-track-gray-800/50">
            {elements.map((element) => (
              <motion.div
                key={element.id}
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                whileHover={{ scale: 1.05 }}
                className="transform transition-all duration-200"
              >
                <BaseElementComponent {...element} />
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-400">
            <CubeTransparentIcon className="w-12 h-12 mx-auto mb-3 text-gray-500" />
            <p>No elements yet. Check in daily to collect elements!</p>
          </div>
        )}
      </motion.div>

      {/* Achievements Panel */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-[#0A1628]/80 backdrop-blur-lg rounded-xl p-6 shadow-xl border border-blue-500/20"
      >
        <div className="flex items-center gap-3 mb-6">
          <StarIcon className="w-6 h-6 text-yellow-400" />
          <h2 className="text-2xl font-bold bg-gradient-to-r from-yellow-400 to-amber-400 bg-clip-text text-transparent">
            Achievements
          </h2>
        </div>

        <div className="space-y-4">
          {achievements.map((achievement) => (
            <motion.div
              key={achievement.id}
              whileHover={{ scale: 1.02 }}
              className={`p-4 rounded-lg ${
                achievement.completed
                  ? "bg-gradient-to-r from-green-900/20 to-green-800/20 border border-green-500/50"
                  : "bg-gradient-to-r from-gray-800/50 to-gray-900/50 border border-gray-700/50"
              }`}
            >
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-2">
                    <BoltIcon className={`w-5 h-5 ${
                      achievement.completed ? "text-green-400" : "text-gray-500"
                    }`} />
                    <div className="font-medium text-white">
                      {achievement.name}
                    </div>
                  </div>
                  <div className="text-sm text-gray-400 mt-1">
                    {achievement.description}
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <SparklesIcon className="w-4 h-4 text-purple-400" />
                    <span className="text-xs text-purple-400">
                      +{achievement.reward.xp} XP
                    </span>
                    {achievement.reward.element && (
                      <>
                        <StarIcon className="w-4 h-4 text-yellow-400" />
                        <span className="text-xs text-yellow-400">
                          {achievement.reward.element.rarity} {achievement.reward.element.type}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                {achievement.completed && (
                  <div className="text-green-400">
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring" }}
                    >
                      ✓
                    </motion.div>
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {showAchievement && (
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -50 }}
          className="fixed bottom-4 right-4 bg-gradient-to-r from-green-600 to-green-500 text-white p-4 rounded-lg shadow-lg flex items-center gap-3"
        >
          <TrophyIcon className="w-6 h-6 text-yellow-300" />
          <div>
            <div className="font-bold">New Achievement!</div>
            <div>{lastCompletedAchievement}</div>
          </div>
        </motion.div>
      )}
    </div>
  );
} 
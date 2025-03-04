import { motion } from "framer-motion";
import { ElementType, Rarity } from "@/types/contract";
import {
  BeakerIcon,
  BoltIcon,
  ShieldCheckIcon,
  HomeIcon,
  CubeTransparentIcon,
  ChartBarIcon,
  FireIcon,
  SparklesIcon
} from "@heroicons/react/24/solid";

const ELEMENT_INFO = {
  [ElementType.REACTOR]: {
    name: "Reactor",
    description: "Provides energy for the base",
    bonus: "Increases XP production by 10% per level",
    color: "text-blue-400",
    glowColor: "shadow-blue-400/50",
    icon: BoltIcon
  },
  [ElementType.LIVING_MODULE]: {
    name: "Living Module",
    description: "Provides space for the crew",
    bonus: "Increases daily bonus by 5% per level",
    color: "text-green-400",
    glowColor: "shadow-green-400/50",
    icon: HomeIcon
  },
  [ElementType.DEFENSE_TOWER]: {
    name: "Defense Tower",
    description: "Protects the base from threats",
    bonus: "Reduces streak loss chance by 5% per level",
    color: "text-red-400",
    glowColor: "shadow-red-400/50",
    icon: ShieldCheckIcon
  },
  [ElementType.TECH_LAB]: {
    name: "Tech Lab",
    description: "Develops new technologies",
    bonus: "Increases better element chance by 3% per level",
    color: "text-purple-400",
    glowColor: "shadow-purple-400/50",
    icon: BeakerIcon
  },
  [ElementType.STORAGE]: {
    name: "Storage",
    description: "Stores resources",
    bonus: "Increases element limit by 2 per level",
    color: "text-yellow-400",
    glowColor: "shadow-yellow-400/50",
    icon: CubeTransparentIcon
  }
};

const BASE_LEVELS = [
  {
    level: 1,
    requirements: "3 level 1 elements",
    bonus: "Element fusion ability",
    color: "from-blue-600 to-blue-400"
  },
  {
    level: 2,
    requirements: "2 UNCOMMON elements, 1000 XP",
    bonus: "+10% to all stats",
    color: "from-green-600 to-green-400"
  },
  {
    level: 3,
    requirements: "1 RARE element, 2500 XP",
    bonus: "Alliance creation ability",
    color: "from-purple-600 to-purple-400"
  },
  {
    level: 4,
    requirements: "5 level 3+ elements, 5000 XP",
    bonus: "Daily element bonus",
    color: "from-yellow-600 to-yellow-400"
  },
  {
    level: 5,
    requirements: "1 EPIC element, 10000 XP",
    bonus: "Auto check-in (1 day skip)",
    color: "from-red-600 to-red-400"
  }
];

const STREAK_REWARDS = [
  { days: 3, reward: "+50% XP", color: "from-blue-600 to-blue-400", icon: SparklesIcon },
  { days: 7, reward: "Guaranteed UNCOMMON element", color: "from-green-600 to-green-400", icon: CubeTransparentIcon },
  { days: 14, reward: "Guaranteed RARE element", color: "from-purple-600 to-purple-400", icon: BeakerIcon },
  { days: 30, reward: "Guaranteed EPIC element", color: "from-yellow-600 to-yellow-400", icon: FireIcon }
];

export default function GameGuide() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="bg-gray-900/80 backdrop-blur-lg rounded-xl p-6 shadow-xl border border-blue-500/20"
    >
      <motion.h2 
        initial={{ y: -20 }}
        animate={{ y: 0 }}
        className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent mb-8"
      >
        Base Morning Guide
      </motion.h2>
      
      {/* Elements */}
      <section className="mb-12">
        <motion.h3 
          initial={{ x: -20 }}
          animate={{ x: 0 }}
          className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent mb-6 flex items-center gap-2"
        >
          <CubeTransparentIcon className="w-8 h-8 text-blue-400" />
          Base Elements
        </motion.h3>
        <div className="grid grid-cols-1 gap-4">
          {Object.entries(ELEMENT_INFO).map(([type, info], index) => (
            <motion.div
              key={type}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              whileHover={{ scale: 1.02, transition: { duration: 0.2 } }}
              className={`relative overflow-hidden bg-gradient-to-r from-gray-800/50 to-gray-900/50 rounded-xl p-6 ${info.glowColor} shadow-lg border border-gray-700/50`}
            >
              <div className="flex items-start gap-4">
                <div className={`p-3 rounded-lg bg-gradient-to-br ${info.color.replace('text-', 'from-').replace('400', '600')} to-black/50`}>
                  <info.icon className={`w-8 h-8 ${info.color}`} />
                </div>
                <div className="flex-1">
                  <h4 className={`text-xl font-bold ${info.color} mb-2`}>{info.name}</h4>
                  <p className="text-gray-300 mb-2">{info.description}</p>
                  <p className={`text-sm ${info.color} font-medium`}>{info.bonus}</p>
                </div>
              </div>
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-white/5 to-transparent rounded-full blur-2xl transform translate-x-16 -translate-y-16" />
            </motion.div>
          ))}
        </div>
      </section>

      {/* Levels */}
      <section className="mb-12">
        <motion.h3 
          initial={{ x: -20 }}
          animate={{ x: 0 }}
          className="text-2xl font-bold bg-gradient-to-r from-green-400 to-emerald-400 bg-clip-text text-transparent mb-6 flex items-center gap-2"
        >
          <ChartBarIcon className="w-8 h-8 text-green-400" />
          Base Levels
        </motion.h3>
        <div className="space-y-4">
          {BASE_LEVELS.map((level, index) => (
            <motion.div
              key={level.level}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              whileHover={{ scale: 1.02, transition: { duration: 0.2 } }}
              className="relative overflow-hidden rounded-xl bg-gradient-to-r from-gray-800/50 to-gray-900/50 p-6 shadow-lg border border-gray-700/50"
            >
              <div className="relative z-10">
                <div className={`text-3xl font-bold bg-gradient-to-r ${level.color} bg-clip-text text-transparent mb-3`}>
                  Level {level.level}
                </div>
                <p className="text-gray-300 mb-2">Requirements: {level.requirements}</p>
                <p className={`text-sm font-medium bg-gradient-to-r ${level.color} bg-clip-text text-transparent`}>
                  Bonus: {level.bonus}
                </p>
              </div>
              <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${level.color} opacity-10 rounded-full blur-2xl transform translate-x-16 -translate-y-16`} />
            </motion.div>
          ))}
        </div>
      </section>

      {/* Streak */}
      <section className="mb-12">
        <motion.h3 
          initial={{ x: -20 }}
          animate={{ x: 0 }}
          className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent mb-6 flex items-center gap-2"
        >
          <FireIcon className="w-8 h-8 text-purple-400" />
          Streak Rewards
        </motion.h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {STREAK_REWARDS.map((reward, index) => (
            <motion.div
              key={reward.days}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              whileHover={{ scale: 1.02, transition: { duration: 0.2 } }}
              className="relative overflow-hidden rounded-xl bg-gradient-to-r from-gray-800/50 to-gray-900/50 p-6 shadow-lg border border-gray-700/50"
            >
              <div className="relative z-10">
                <div className="flex items-center gap-3 mb-3">
                  <div className={`p-2 rounded-lg bg-gradient-to-br ${reward.color}`}>
                    <reward.icon className="w-6 h-6 text-white" />
                  </div>
                  <div className={`text-2xl font-bold bg-gradient-to-r ${reward.color} bg-clip-text text-transparent`}>
                    {reward.days} Days
                  </div>
                </div>
                <p className="text-gray-300">{reward.reward}</p>
              </div>
              <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${reward.color} opacity-10 rounded-full blur-2xl transform translate-x-16 -translate-y-16`} />
            </motion.div>
          ))}
        </div>
      </section>

      {/* Fusion */}
      <section>
        <motion.h3 
          initial={{ x: -20 }}
          animate={{ x: 0 }}
          className="text-2xl font-bold bg-gradient-to-r from-yellow-400 to-amber-400 bg-clip-text text-transparent mb-6 flex items-center gap-2"
        >
          <BeakerIcon className="w-8 h-8 text-yellow-400" />
          Fusion System
        </motion.h3>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          whileHover={{ scale: 1.02, transition: { duration: 0.2 } }}
          className="relative overflow-hidden rounded-xl bg-gradient-to-r from-gray-800/50 to-gray-900/50 p-6 shadow-lg border border-gray-700/50"
        >
          <div className="relative z-10">
            <p className="text-gray-300 mb-4 text-lg">
              Combine 3 identical elements of the same level to create a stronger element!
            </p>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-gradient-to-br from-blue-600 to-blue-400">
                  <SparklesIcon className="w-5 h-5 text-white" />
                </div>
                <p className="text-blue-400">10% chance for additional level</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-gradient-to-br from-purple-600 to-purple-400">
                  <SparklesIcon className="w-5 h-5 text-white" />
                </div>
                <p className="text-purple-400">5% chance for rarity upgrade</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-gradient-to-br from-yellow-600 to-yellow-400">
                  <SparklesIcon className="w-5 h-5 text-white" />
                </div>
                <p className="text-yellow-400">1% chance for special ability</p>
              </div>
            </div>
          </div>
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-yellow-400 to-amber-400 opacity-10 rounded-full blur-3xl transform translate-x-32 -translate-y-32" />
        </motion.div>
      </section>
    </motion.div>
  );
} 
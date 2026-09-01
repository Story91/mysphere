"use client";

import { useState, useEffect } from "react";
import { useAccount } from "wagmi";
import { motion, AnimatePresence } from "framer-motion";
import BaseCollection from "./components/BaseCollection";
import PlayerStats from "./components/PlayerStats";
import SpaceBackground from "./components/SpaceBackground";
import GamePanel from "./components/GamePanel";
import GameGuide from "./components/GameGuide";
import NFTCollection from "./components/NFTCollection";
import BaseElementComponent from "./components/BaseElement";
import MintButton from "./components/MintButton";
import BatchMintButton from "./components/BatchMintButton";
import Leaderboard from "./components/Leaderboard";
import AdminPanel from "./components/AdminPanel";
import MissionsPanel from "./components/MissionsPanel";
import MarketplacePanel from "./components/MarketplacePanel";
import BonusesPanel from "./components/BonusesPanel";
import PublicStatsComponent from "./components/PublicStats";
import { Achievement, BaseElement, ElementType, Rarity } from "@/types/contract";
import { useBaseMorningContract } from "./hooks/useBaseMorningContract";
import { BeakerIcon } from "@heroicons/react/24/solid";
import { 
  Home, 
  User, 
  Gamepad2, 
  BookOpen, 
  FolderArchive, 
  Layers, 
  Settings, 
  HelpCircle,
  Menu,
  X,
  ChevronRight,
  Trophy,
  Swords,
  Shield,
  Target,
  Lock,
  ShoppingCart
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

const mockAchievements: Achievement[] = [
  {
    id: "FIRST_STEP",
    name: "First Step",
    description: "Complete your first check-in",
    completed: true,
    reward: {
      xp: 500,
    },
  },
  {
    id: "WEEKLY_WARRIOR",
    name: "Weekly Warrior",
    description: "Maintain streak for 7 days",
    completed: false,
    reward: {
      xp: 1000,
      element: {
        type: ElementType.REACTOR,
        rarity: Rarity.RARE,
      },
    },
  },
  {
    id: "COLLECTOR",
    name: "Collector",
    description: "Collect 5 different elements",
    completed: false,
    reward: {
      xp: 2000,
    },
  },
];

const mockElements: BaseElement[] = [
  {
    id: "1",
    elementType: ElementType.REACTOR,
    level: 1,
    power: 100,
    rarity: Rarity.RARE,
    mintedAt: Date.now(),
  },
  {
    id: "2",
    elementType: ElementType.LIVING_MODULE,
    level: 2,
    power: 200,
    rarity: Rarity.COMMON,
    mintedAt: Date.now(),
  },
];

export default function BaseMorning() {
  const { isConnected } = useAccount();
  const [selectedElements, setSelectedElements] = useState<BaseElement[]>([]);
  const { playerData, elements, isLoading, checkIn, fuseElements } = useBaseMorningContract();
  const [mounted, setMounted] = useState(false);
  const [activeView, setActiveView] = useState("dashboard");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleElementSelect = (element: BaseElement) => {
    if (selectedElements.length < 3) {
      setSelectedElements([...selectedElements, element]);
    }
  };

  const handleFuse = async () => {
    if (selectedElements.length === 3) {
      await fuseElements(selectedElements.map(e => e.id));
      setSelectedElements([]);
    }
  };

  const handleStartMission = async (missionId: number, elementIds: string[]) => {
    try {
      console.log(`Starting mission ${missionId} with elements:`, elementIds);
      // TODO: Implement actual contract call
      // await startMission(missionId, elementIds);
    } catch (error) {
      console.error("Failed to start mission:", error);
    }
  };

  const handleCompleteMission = async (missionId: number) => {
    try {
      console.log(`Completing mission ${missionId}`);
      // TODO: Implement actual contract call
      // await completeMission(missionId);
    } catch (error) {
      console.error("Failed to complete mission:", error);
    }
  };

  const handleCreateTrade = async (tokenId: string, price: bigint) => {
    try {
      console.log(`Creating trade for token ${tokenId} at price ${price}`);
      // TODO: Implement actual contract call
      // await createTrade(tokenId, price);
    } catch (error) {
      console.error("Failed to create trade:", error);
    }
  };

  const handleCancelTrade = async (tradeId: number) => {
    try {
      console.log(`Cancelling trade ${tradeId}`);
      // TODO: Implement actual contract call
      // await cancelTrade(tradeId);
    } catch (error) {
      console.error("Failed to cancel trade:", error);
    }
  };

  const handleCompleteTrade = async (tradeId: number, price: bigint) => {
    try {
      console.log(`Completing trade ${tradeId} for price ${price}`);
      // TODO: Implement actual contract call
      // await completeTrade(tradeId, price);
    } catch (error) {
      console.error("Failed to complete trade:", error);
    }
  };

  // Animation variants
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { 
      opacity: 1,
      transition: { 
        when: "beforeChildren",
        staggerChildren: 0.1,
        duration: 0.3
      }
    },
    exit: {
      opacity: 0,
      transition: { duration: 0.2 }
    }
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: { 
      y: 0, 
      opacity: 1,
      transition: { type: "spring", stiffness: 300, damping: 24 }
    }
  };

  const navigationItems = [
    {
      name: "Dashboard",
      icon: Home,
      view: "dashboard",
      description: "Command center overview"
    },
    {
      name: "Player Stats",
      icon: User,
      view: "player-stats",
      description: "Your progress and achievements"
    },
    {
      name: "Leaderboard",
      icon: Trophy,
      view: "leaderboard",
      description: "Global player rankings"
    },
    {
      name: "Game Stats",
      icon: Target,
      view: "game-stats",
      description: "Live game statistics"
    },
    {
      name: "PvP Arena",
      icon: Swords,
      view: "pvp-arena",
      description: "Battle other commanders"
    },
    {
      name: "Alliances",
      icon: Shield,
      view: "alliances",
      description: "Join or create alliances"
    },
    {
      name: "Missions",
      icon: Target,
      view: "missions",
      description: "Active objectives & rewards"
    },
    {
      name: "Marketplace",
      icon: ShoppingCart,
      view: "marketplace",
      description: "Trade elements with others"
    },
    {
      name: "Bonuses",
      icon: Trophy,
      view: "bonuses",
      description: "Base Level bonuses & rewards"
    },
    {
      name: "Element Forge",
      icon: Gamepad2,
      view: "game-panel",
      description: "Manage and fuse elements"
    },
    {
      name: "Collection",
      icon: Layers,
      view: "nft-collection",
      description: "Your element vault"
    },
    {
      name: "Game Guide",
      icon: BookOpen,
      view: "game-guide",
      description: "Strategic handbook"
    },
    {
      name: "Admin Panel",
      icon: Lock,
      view: "admin-panel",
      description: "Admin control center"
    },
  ];

  const renderContent = () => {
    switch (activeView) {
      case "player-stats":
        return (
          <AnimatePresence mode="wait">
            <motion.div
              key="player-stats"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <PlayerStats
                player={playerData}
                achievements={mockAchievements}
                elements={elements || []}
              />
            </motion.div>
          </AnimatePresence>
        );
      case "game-panel":
        return (
          <AnimatePresence mode="wait">
            <motion.div
              key="game-panel"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <GamePanel
                player={playerData}
                selectedElements={selectedElements}
                onElementSelect={handleElementSelect}
                onFuse={handleFuse}
                isLoading={isLoading}
                allElements={elements || []}
              />
            </motion.div>
          </AnimatePresence>
        );
      case "game-guide":
        return (
          <AnimatePresence mode="wait">
            <motion.div
              key="game-guide"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <GameGuide />
            </motion.div>
          </AnimatePresence>
        );
      case "leaderboard":
        return (
          <AnimatePresence mode="wait">
            <motion.div
              key="leaderboard"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <Leaderboard />
            </motion.div>
          </AnimatePresence>
        );
      case "pvp-arena":
        return (
          <AnimatePresence mode="wait">
            <motion.div
              key="pvp-arena"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="text-center py-20"
            >
              <h2 className="text-3xl font-bold text-cyan-400 mb-4">⚔️ PvP Arena</h2>
              <p className="text-gray-400 mb-8">Coming Soon - Battle other commanders!</p>
              <div className="bg-gradient-to-r from-red-900/20 to-orange-900/20 border border-red-500/30 rounded-xl p-8 max-w-2xl mx-auto">
                <p className="text-red-300">Still in development. Keep leveling your elements, battles are coming.</p>
              </div>
            </motion.div>
          </AnimatePresence>
        );
      case "game-stats":
        return (
          <AnimatePresence mode="wait">
            <motion.div
              key="game-stats"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <PublicStatsComponent />
            </motion.div>
          </AnimatePresence>
        );
      case "alliances":
        return (
          <AnimatePresence mode="wait">
            <motion.div
              key="alliances"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="text-center py-20"
            >
              <h2 className="text-3xl font-bold text-cyan-400 mb-4">🛡️ Alliances</h2>
              <p className="text-gray-400 mb-8">Coming Soon - Form powerful alliances!</p>
              <div className="bg-gradient-to-r from-blue-900/20 to-purple-900/20 border border-blue-500/30 rounded-xl p-8 max-w-2xl mx-auto">
                <p className="text-blue-300">Unite with other commanders to dominate the nexus!</p>
              </div>
            </motion.div>
          </AnimatePresence>
        );
      case "missions":
        return (
          <AnimatePresence mode="wait">
            <motion.div
              key="missions"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <MissionsPanel
                player={playerData}
                userElements={elements || []}
                isLoading={isLoading}
                onStartMission={handleStartMission}
                onCompleteMission={handleCompleteMission}
              />
            </motion.div>
          </AnimatePresence>
        );
      case "marketplace":
        return (
          <AnimatePresence mode="wait">
            <motion.div
              key="marketplace"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <MarketplacePanel
                player={playerData}
                userElements={elements || []}
                isLoading={isLoading}
                onCreateTrade={handleCreateTrade}
                onCancelTrade={handleCancelTrade}
                onCompleteTrade={handleCompleteTrade}
              />
            </motion.div>
          </AnimatePresence>
        );
      case "bonuses":
        return (
          <AnimatePresence mode="wait">
            <motion.div
              key="bonuses"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <BonusesPanel
                playerLevel={playerData?.baseLevel || 1}
                playerXp={playerData ? Number(playerData.xp) : 0}
              />
            </motion.div>
          </AnimatePresence>
        );
      case "nft-collection":
        return (
          <AnimatePresence mode="wait">
            <motion.div
              key="nft-collection"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <NFTCollection userElements={elements || []} />
            </motion.div>
          </AnimatePresence>
        );
      case "admin-panel":
        return (
          <AnimatePresence mode="wait">
            <motion.div
              key="admin-panel"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <AdminPanel />
            </motion.div>
          </AnimatePresence>
        );
      default:
        return (
          <AnimatePresence mode="wait">
            <motion.div
              key="dashboard"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="grid grid-cols-1 xl:grid-cols-12 gap-8"
            >
              {/* Left Column - Game Guide */}
              <motion.div variants={itemVariants} className="xl:col-span-3">
                <GameGuide />
              </motion.div>

              {/* Center Column - Game Panel and Actions */}
              <motion.div variants={itemVariants} className="xl:col-span-6">
                <div className="space-y-8">
                  <GamePanel
                    player={playerData}
                    selectedElements={selectedElements}
                    onElementSelect={handleElementSelect}
                    onFuse={handleFuse}
                    isLoading={isLoading}
                    allElements={elements || []}
                  />

                  {/* Daily Check-in for XP */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex justify-center"
                  >
                    <motion.button
                      whileHover={{ 
                        scale: 1.02,
                        filter: "drop-shadow(0 0 20px rgba(37, 99, 235, 0.5))"
                      }}
                      whileTap={{ scale: 0.98 }}
                      transition={{
                        type: "spring",
                        stiffness: 400,
                        damping: 15
                      }}
                      className={`
                        px-12 py-6 rounded-lg font-bold text-xl 
                        flex items-center gap-3 
                        relative overflow-hidden
                        ${isLoading
                          ? "bg-gray-700 cursor-not-allowed"
                          : "bg-gradient-to-r from-purple-600 via-purple-700 to-purple-800 hover:from-purple-700 hover:via-purple-800 hover:to-purple-900"
                        }
                        before:absolute before:inset-0 
                        before:bg-gradient-to-r before:from-transparent before:via-white/20 before:to-transparent
                        before:translate-x-[-200%] before:animate-[shine_2s_infinite]
                        before:transition-transform before:duration-1000
                      `}
                      onClick={checkIn}
                      disabled={isLoading}
                    >
                      <BeakerIcon className="w-8 h-8" />
                      {isLoading ? "Processing..." : "🎯 Collect Daily XP"}
                      <style jsx>{`
                        @keyframes shine {
                          100% {
                            transform: translateX(200%);
                          }
                        }
                      `}</style>
                    </motion.button>
                  </motion.div>

                  {/* Mint Element Buttons */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 }}
                    >
                      <MintButton />
                    </motion.div>
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                    >
                      <BatchMintButton />
                    </motion.div>
                  </div>

                  <NFTCollection userElements={elements || []} />
                </div>
              </motion.div>

              {/* Right Column - Player Stats */}
              <motion.div variants={itemVariants} className="xl:col-span-3">
                <PlayerStats
                  player={playerData}
                  achievements={mockAchievements}
                  elements={elements || []}
                />
              </motion.div>
            </motion.div>
          </AnimatePresence>
        );
    }
  };

  return (
    <>
      <SpaceBackground />
      
      {/* Mobile menu button */}
      <Button
        variant="outline"
        size="icon"
        className="fixed top-4 left-4 z-50 md:hidden bg-blue-600 text-white hover:bg-blue-700 hover:text-white"
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
      >
        {isSidebarOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
      </Button>

      {/* Sidebar */}
      <div className={cn(
        "fixed inset-y-0 left-0 z-40 w-72 bg-gray-900/90 backdrop-blur-md border-r border-blue-900/50 transition-transform duration-300 ease-in-out transform md:translate-x-0 shadow-xl shadow-blue-900/20",
        isSidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center justify-center h-20 border-b border-blue-900/30 bg-gradient-to-r from-blue-900/50 to-indigo-900/50">
            <motion.h1 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="text-2xl font-bold text-white"
            >
              Nexus<span className="text-cyan-400">Core</span>
            </motion.h1>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
            {navigationItems.map((item, index) => (
              <motion.button
                key={item.view}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 + index * 0.05, duration: 0.3 }}
                onClick={() => {
                  setActiveView(item.view);
                  setIsSidebarOpen(false);
                }}
                className={cn(
                  "flex items-center w-full px-4 py-3 text-sm font-medium rounded-lg transition-all duration-200 text-left group relative overflow-hidden",
                  activeView === item.view
                    ? "bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-md shadow-blue-900/30"
                    : "text-gray-300 hover:bg-gray-800/50 hover:text-white"
                )}
              >
                <div className="relative z-10 flex items-center w-full">
                  <item.icon className="mr-3 h-5 w-5" />
                  <div className="flex flex-col">
                    <span>{item.name}</span>
                    <span className="text-xs text-gray-400 group-hover:text-gray-300 transition-colors">
                      {item.description}
                    </span>
                  </div>
                  {activeView === item.view && (
                    <ChevronRight className="ml-auto h-4 w-4 text-blue-300" />
                  )}
                </div>
                {activeView === item.view && (
                  <motion.div 
                    layoutId="activeTab"
                    className="absolute inset-0 bg-gradient-to-r from-blue-600 to-blue-700 -z-0"
                  />
                )}
              </motion.button>
            ))}
          </nav>

          {/* Footer */}
          <div className="p-4 border-t border-blue-900/30 bg-gradient-to-r from-blue-900/30 to-indigo-900/30">
            <div className="flex items-center">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-md shadow-blue-900/30">
                <span className="text-sm font-medium text-white">BB</span>
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-white">BaseBook</p>
                <p className="text-xs text-blue-300">Smart Contract Tools</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="min-h-screen relative md:pl-72">
        <div className="max-w-[1920px] mx-auto px-4 py-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center mb-12"
          >
            <h1 className="text-5xl font-bold mb-4 text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600">
              {activeView === "dashboard" ? "NEXUS CORE" : navigationItems.find(item => item.view === activeView)?.name}
            </h1>
            <p className="text-xl text-cyan-300">Command your elements and build an empire on Base.</p>
          </motion.div>

          <AnimatePresence mode="wait">
            {renderContent()}
          </AnimatePresence>
        </div>
      </div>
    </>
  );
} 
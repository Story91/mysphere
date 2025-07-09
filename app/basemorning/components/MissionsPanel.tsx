"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Player, Mission, MissionProgress, MissionStatus, BaseElement, ElementType } from "../../../types/contract";
import { Clock, Trophy, Star, Target, Zap, Play, CheckCircle, Lock, AlertCircle, Timer } from "lucide-react";

interface MissionsPanelProps {
  player?: Player;
  userElements: BaseElement[];
  isLoading: boolean;
  onStartMission: (missionId: number, elementIds: string[]) => Promise<void>;
  onCompleteMission: (missionId: number) => Promise<void>;
}

// Mock missions data - in production this would come from the contract
const mockMissions: Mission[] = [
  {
    id: 1,
    name: "First Steps",
    description: "Complete your first daily check-in and mint your first element",
    duration: 3600, // 1 hour
    xpReward: 500,
    resourceReward: 100,
    minBaseLevel: 1,
    requiredElements: 1,
    requiredElementType: ElementType.REACTOR,
    isActive: true,
    isCompleted: false,
  },
  {
    id: 2,
    name: "Element Collector",
    description: "Collect 3 different element types to prove your versatility",
    duration: 7200, // 2 hours
    xpReward: 1000,
    resourceReward: 250,
    minBaseLevel: 2,
    requiredElements: 3,
    requiredElementType: ElementType.STORAGE,
    isActive: true,
    isCompleted: false,
  },
  {
    id: 3,
    name: "Fusion Master",
    description: "Perform your first fusion to create a stronger element",
    duration: 10800, // 3 hours
    xpReward: 1500,
    resourceReward: 500,
    minBaseLevel: 3,
    requiredElements: 3,
    requiredElementType: ElementType.DEFENSE_TOWER,
    isActive: true,
    isCompleted: false,
  },
  {
    id: 4,
    name: "Tech Innovator",
    description: "Reach level 5 and unlock advanced technology",
    duration: 14400, // 4 hours
    xpReward: 2000,
    resourceReward: 750,
    minBaseLevel: 5,
    requiredElements: 2,
    requiredElementType: ElementType.TECH_LAB,
    isActive: true,
    isCompleted: false,
  },
  {
    id: 5,
    name: "Living Harmony",
    description: "Create a sustainable ecosystem with living modules",
    duration: 18000, // 5 hours
    xpReward: 2500,
    resourceReward: 1000,
    minBaseLevel: 7,
    requiredElements: 4,
    requiredElementType: ElementType.LIVING_MODULE,
    isActive: true,
    isCompleted: false,
  },
];

const MissionsPanel: React.FC<MissionsPanelProps> = ({
  player,
  userElements,
  isLoading,
  onStartMission,
  onCompleteMission,
}) => {
  const [selectedMission, setSelectedMission] = useState<Mission | null>(null);
  const [selectedElements, setSelectedElements] = useState<string[]>([]);
  const [missionProgress, setMissionProgress] = useState<MissionProgress[]>([]);
  const [timeRemaining, setTimeRemaining] = useState<{ [key: number]: number }>({});

  // Mock mission progress - in production this would come from the contract
  useEffect(() => {
    const mockProgress: MissionProgress[] = mockMissions.map(mission => {
      const status = getMissionStatus(mission);
      return {
        missionId: mission.id,
        status,
        canComplete: status === MissionStatus.IN_PROGRESS,
        timeRemaining: status === MissionStatus.IN_PROGRESS ? mission.duration : undefined,
      };
    });
    setMissionProgress(mockProgress);
  }, [player, userElements]);

  // Timer for active missions
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeRemaining(prev => {
        const updated = { ...prev };
        Object.keys(updated).forEach(missionId => {
          if (updated[parseInt(missionId)] > 0) {
            updated[parseInt(missionId)] -= 1;
          }
        });
        return updated;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const getMissionStatus = (mission: Mission): MissionStatus => {
    if (!player) return MissionStatus.LOCKED;
    
    // Check if player level is sufficient
    if (player.baseLevel < mission.minBaseLevel) {
      return MissionStatus.LOCKED;
    }

    // Check if mission is in player's active missions
    if (player.activeMissions?.includes(mission.id)) {
      return MissionStatus.IN_PROGRESS;
    }

    // Check if player has completed this mission (mock check)
    const completedMissions: number[] = []; // This would come from contract
    if (completedMissions.includes(mission.id)) {
      return MissionStatus.COMPLETED;
    }

    return MissionStatus.AVAILABLE;
  };

  const getAvailableElements = (mission: Mission): BaseElement[] => {
    return userElements.filter(element => 
      element.elementType === mission.requiredElementType
    );
  };

  const canStartMission = (mission: Mission): boolean => {
    const status = getMissionStatus(mission);
    if (status !== MissionStatus.AVAILABLE) return false;
    
    const availableElements = getAvailableElements(mission);
    return availableElements.length >= mission.requiredElements;
  };

  const handleStartMission = async (mission: Mission) => {
    if (!canStartMission(mission)) return;
    
    const availableElements = getAvailableElements(mission);
    const elementsToUse = availableElements.slice(0, mission.requiredElements);
    
    try {
      await onStartMission(mission.id, elementsToUse.map(e => e.id));
      
      // Update local state
      setTimeRemaining(prev => ({
        ...prev,
        [mission.id]: mission.duration
      }));
      
      setSelectedMission(null);
      setSelectedElements([]);
    } catch (error) {
      console.error("Failed to start mission:", error);
    }
  };

  const handleCompleteMission = async (mission: Mission) => {
    try {
      await onCompleteMission(mission.id);
      
      // Update local state
      setTimeRemaining(prev => {
        const updated = { ...prev };
        delete updated[mission.id];
        return updated;
      });
    } catch (error) {
      console.error("Failed to complete mission:", error);
    }
  };

  const formatTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  };

  const getStatusIcon = (status: MissionStatus) => {
    switch (status) {
      case MissionStatus.LOCKED:
        return <Lock className="w-5 h-5 text-gray-500" />;
      case MissionStatus.AVAILABLE:
        return <Play className="w-5 h-5 text-green-400" />;
      case MissionStatus.IN_PROGRESS:
        return <Timer className="w-5 h-5 text-yellow-400" />;
      case MissionStatus.COMPLETED:
        return <CheckCircle className="w-5 h-5 text-blue-400" />;
      default:
        return <AlertCircle className="w-5 h-5 text-gray-400" />;
    }
  };

  const getStatusColor = (status: MissionStatus) => {
    switch (status) {
      case MissionStatus.LOCKED:
        return "from-gray-800 to-gray-900 border-gray-700";
      case MissionStatus.AVAILABLE:
        return "from-green-900/30 to-green-800/30 border-green-600/50";
      case MissionStatus.IN_PROGRESS:
        return "from-yellow-900/30 to-yellow-800/30 border-yellow-600/50";
      case MissionStatus.COMPLETED:
        return "from-blue-900/30 to-blue-800/30 border-blue-600/50";
      default:
        return "from-gray-800 to-gray-900 border-gray-700";
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-400"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center mb-8">
        <h2 className="text-4xl font-bold text-cyan-400 mb-2">🎯 Strategic Missions</h2>
        <p className="text-gray-300">Complete objectives to earn XP, resources, and advance your base</p>
      </div>

      {/* Mission Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {mockMissions.map((mission) => {
          const status = getMissionStatus(mission);
          const progress = missionProgress.find(p => p.missionId === mission.id);
          const remaining = timeRemaining[mission.id];
          
          return (
            <motion.div
              key={mission.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: mission.id * 0.1 }}
              className={`
                relative p-6 rounded-xl border-2 backdrop-blur-sm
                bg-gradient-to-br ${getStatusColor(status)}
                hover:scale-105 transition-all duration-300
                ${status === MissionStatus.LOCKED ? 'opacity-60' : ''}
              `}
            >
              {/* Mission Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  {getStatusIcon(status)}
                  <div>
                    <h3 className="text-xl font-bold text-white">{mission.name}</h3>
                    <p className="text-sm text-gray-300">Level {mission.minBaseLevel}+ Required</p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-gray-400">Mission #{mission.id}</div>
                  {remaining && (
                    <div className="text-sm text-yellow-400 font-mono">
                      {formatTime(remaining)}
                    </div>
                  )}
                </div>
              </div>

              {/* Mission Description */}
              <p className="text-gray-300 mb-4">{mission.description}</p>

              {/* Requirements */}
              <div className="space-y-2 mb-4">
                <div className="flex items-center gap-2 text-sm">
                  <Target className="w-4 h-4 text-cyan-400" />
                  <span className="text-gray-300">
                    {mission.requiredElements} {mission.requiredElementType} elements needed
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="w-4 h-4 text-cyan-400" />
                  <span className="text-gray-300">
                    Duration: {formatTime(mission.duration)}
                  </span>
                </div>
              </div>

              {/* Rewards */}
              <div className="flex items-center gap-4 mb-4">
                <div className="flex items-center gap-1 text-sm">
                  <Star className="w-4 h-4 text-yellow-400" />
                  <span className="text-yellow-400">{mission.xpReward} XP</span>
                </div>
                <div className="flex items-center gap-1 text-sm">
                  <Zap className="w-4 h-4 text-purple-400" />
                  <span className="text-purple-400">{mission.resourceReward} Resources</span>
                </div>
              </div>

              {/* Action Button */}
              <div className="flex justify-end">
                {status === MissionStatus.LOCKED && (
                  <button
                    disabled
                    className="px-4 py-2 bg-gray-700 text-gray-400 rounded-lg cursor-not-allowed"
                  >
                    Locked
                  </button>
                )}
                
                {status === MissionStatus.AVAILABLE && (
                  <button
                    onClick={() => handleStartMission(mission)}
                    disabled={!canStartMission(mission)}
                    className={`
                      px-6 py-2 rounded-lg font-semibold transition-all
                      ${canStartMission(mission)
                        ? 'bg-green-600 hover:bg-green-700 text-white'
                        : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                      }
                    `}
                  >
                    {canStartMission(mission) ? 'Start Mission' : 'Insufficient Elements'}
                  </button>
                )}
                
                {status === MissionStatus.IN_PROGRESS && (
                  <button
                    onClick={() => handleCompleteMission(mission)}
                                         disabled={Boolean(remaining && remaining > 0)}
                    className={`
                      px-6 py-2 rounded-lg font-semibold transition-all
                      ${remaining && remaining > 0
                        ? 'bg-yellow-600/50 text-yellow-300 cursor-not-allowed'
                        : 'bg-yellow-600 hover:bg-yellow-700 text-white'
                      }
                    `}
                  >
                    {remaining && remaining > 0 ? 'In Progress...' : 'Complete Mission'}
                  </button>
                )}
                
                {status === MissionStatus.COMPLETED && (
                  <button
                    disabled
                    className="px-6 py-2 bg-blue-600/50 text-blue-300 rounded-lg cursor-not-allowed"
                  >
                    Completed
                  </button>
                )}
              </div>

              {/* Progress Bar for Active Missions */}
              {status === MissionStatus.IN_PROGRESS && remaining && (
                <div className="mt-4">
                  <div className="w-full bg-gray-700 rounded-full h-2">
                    <div
                      className="bg-gradient-to-r from-yellow-400 to-orange-400 h-2 rounded-full transition-all duration-1000"
                      style={{
                        width: `${((mission.duration - remaining) / mission.duration) * 100}%`
                      }}
                    ></div>
                  </div>
                </div>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Empty State */}
      {mockMissions.length === 0 && (
        <div className="text-center py-20">
          <Trophy className="w-16 h-16 text-gray-500 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-400 mb-2">No Missions Available</h3>
          <p className="text-gray-500">Complete your registration to unlock strategic missions!</p>
        </div>
      )}
    </div>
  );
};

export default MissionsPanel; 
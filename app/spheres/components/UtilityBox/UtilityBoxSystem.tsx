'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useSpheresContract } from '../../hooks/useSpheresContract';
import { toast } from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import { useAccount } from 'wagmi';
import { Package, Shield, Gift, Zap, Star, Crown, Trophy, Ticket, TrendingUp, Calendar, Filter, ChevronDown, Download, Upload, RefreshCw, Database, AlertCircle } from 'lucide-react';
import PrizeEventListener, { DetectedPrize, useSavedPrizes } from './PrizeEventListener';
import PrizeRevealAnimation from './PrizeRevealAnimation';

interface Prize {
    icon: React.ComponentType<{ className?: string }>;
    name: string;
    description: string;
    chance: string;
    color: string;
}

// Utility function to generate valid transaction hash
const generateValidTxHash = (): string => {
    const chars = '0123456789abcdef';
    let result = '0x';
    for (let i = 0; i < 64; i++) {
        result += chars[Math.floor(Math.random() * 16)];
    }
    return result;
};

// Utility function to validate transaction hash format
const isValidTxHash = (hash: string): boolean => {
    return Boolean(hash) && hash.startsWith('0x') && hash.length === 66 && /^0x[a-fA-F0-9]{64}$/.test(hash);
};

// Utility function to create BaseScan URL with validation
const createBaseScanUrl = (txHash: string): string => {
    if (!isValidTxHash(txHash)) {
        console.warn('⚠️ Invalid transaction hash for BaseScan URL:', txHash);
        return '#';
    }
    return `https://sepolia.basescan.org/tx/${txHash}`;
};

// Prize icon mapping for history display
const PRIZE_ICONS = {
    'Legendary NFT': Trophy,
    'Achievement Voucher': Ticket,
    'Streak Saver': Shield,
    '1-Day Boost': Zap,
    '3-Day Boost': Zap,
    'Boost': Zap,
    '25 Respect Points': Gift,
    '5 Respect Points': Gift,
    'Respect Points': Gift,
    'Nothing': Package
};

const potentialPrizes: Prize[] = [
    { icon: Trophy, name: "Legendary NFT", description: "A unique, super rare collectible NFT.", chance: "1%", color: "text-yellow-400" },
    { icon: Ticket, name: "Achievement Voucher", description: "Use this to unlock any premium achievement for free.", chance: "4%", color: "text-purple-400" },
    { icon: Shield, name: "Streak Saver", description: "Saves your daily activity streak if you miss a day.", chance: "10%", color: "text-blue-400" },
    { icon: Star, name: "3-Day Boost", description: "A random 3-day boost for XP or reputation.", chance: "5%", color: "text-green-400" },
    { icon: Zap, name: "1-Day Boost", description: "A random 1-day boost for your stats.", chance: "10%", color: "text-green-500" },
    { icon: Gift, name: "25 Respect Points", description: "A solid boost to your community standing.", chance: "20%", color: "text-pink-400" },
    { icon: Package, name: "5 Respect Points", description: "A small bonus for your engagement.", chance: "20%", color: "text-gray-300" },
    { icon: Package, name: "Nothing", description: "Better luck next time! Try again.", chance: "30%", color: "text-gray-500" },
];

const PrizeCard = ({ prize }: { prize: Prize }) => (
    <div className="bg-white/5 p-4 rounded-xl border border-white/10 text-center">
        <prize.icon className={`h-8 w-8 mx-auto mb-3 ${prize.color}`} />
        <h4 className="font-semibold text-white">{prize.name}</h4>
        <p className="text-sm text-gray-400 mb-2">{prize.description}</p>
        <div className="text-xs font-bold text-purple-400 bg-purple-500/10 rounded-full px-2 py-1 inline-block">
            {prize.chance} Chance
        </div>
    </div>
);

// Achievement component
const AchievementBadge = ({ achievement, isUnlocked }: { achievement: any, isUnlocked: boolean }) => (
    <div className={`p-3 rounded-lg border ${isUnlocked ? 'bg-green-500/10 border-green-500/30' : 'bg-gray-500/10 border-gray-500/30'}`}>
        <div className="text-center">
            <div className={`text-2xl mb-1 ${isUnlocked ? '' : 'grayscale'}`}>{achievement.icon}</div>
            <div className={`text-sm font-semibold ${isUnlocked ? 'text-green-400' : 'text-gray-400'}`}>
                {achievement.name}
            </div>
            <div className="text-xs text-gray-500">{achievement.description}</div>
        </div>
    </div>
);

export default function UtilityBoxSystem() {
    const router = useRouter();
    const { address } = useAccount();
    const { utilityBoxFee, openUtilityBox, isLoading, userMemberships } = useSpheresContract();
    
    // Use the new enhanced hook
    const {
        prizes: prizeHistory,
        isLoading: isLoadingData,
        getStats,
        savePrize,
        clearPrizes,
        fetchHistoricalEvents,
        exportData,
        importData,
        loadPrizes
    } = useSavedPrizes(address);
    
    // Prize states
    const [currentPrize, setCurrentPrize] = useState<DetectedPrize | null>(null);
    const [showAnimation, setShowAnimation] = useState(false);
    const [isRevealing, setIsRevealing] = useState(false);

    // UI states  
    const [selectedCommunityId, setSelectedCommunityId] = useState<string>('');
    const [isOpening, setIsOpening] = useState(false);
    const [recentPrize, setRecentPrize] = useState<string | null>(null);
    const [showRevealAnimation, setShowRevealAnimation] = useState(false);
    const [revealPrize, setRevealPrize] = useState<{type: string, value: number, rarity: string} | null>(null);
    const [isAnimating, setIsAnimating] = useState(false);
    
    // History filtering state
    const [filterType, setFilterType] = useState<string>('all');
    const [showFullHistory, setShowFullHistory] = useState(false);
    
    // Data management states
    const [showDataPanel, setShowDataPanel] = useState(false);
    const [isFetchingHistory, setIsFetchingHistory] = useState(false);

    // Auto-select first community when memberships load
    useEffect(() => {
        if (userMemberships && userMemberships.length > 0 && !selectedCommunityId) {
            setSelectedCommunityId(userMemberships[0].communityId.toString());
        }
    }, [userMemberships, selectedCommunityId]);

    // Debug animation state changes
    useEffect(() => {
        console.log('🎬 Animation state changed:', {
            isAnimating,
            showRevealAnimation,
            revealPrize: revealPrize?.type,
            isOpening
        });
    }, [isAnimating, showRevealAnimation, revealPrize, isOpening]);

    // Calculate stats from prize history
    const stats = getStats();

    // Handle new prize detection from contract events
    const handlePrizeDetected = useCallback(async (prize: DetectedPrize) => {
        console.log('🎁 Real blockchain event detected:', prize);
        
        // Save to persistent storage using the hook
        await savePrize(prize);
        
        // Show toast for real events (not during animation)
        if (!isAnimating && !showRevealAnimation) {
            toast.success(`🔗 Blockchain verified: ${prize.type}`, {
                duration: 4000,
                icon: '⛓️'
            });
        } else {
            console.log('🎬 Animation in progress, will show toast later');
            // Show toast after animation completes
            setTimeout(() => {
                if (!isAnimating && !showRevealAnimation) {
                    toast.success(`🔗 Blockchain verified: ${prize.type}`, {
                        duration: 4000,
                        icon: '⛓️'
                    });
                }
            }, 2000);
        }
    }, [savePrize, isAnimating, showRevealAnimation]);

    // Helper function to get prize configuration
    const getPrizeConfig = (type: string, value: number) => {
        if (type === 'Nothing') {
            return {
                title: 'Try Again!',
                message: 'Nothing this time, but don\'t give up!',
                icon: '📦'
            };
        } else if (type.includes('Respect Points')) {
            return {
                title: 'Respect Points!',
                message: `You received ${value} respect points! 💎`,
                icon: '⭐'
            };
        } else if (type.includes('Boost')) {
            return {
                title: 'Boost Activated!',
                message: 'You received a temporary boost! ⚡',
                icon: '⚡'
            };
        } else if (type === 'Achievement Voucher') {
            return {
                title: 'Achievement Voucher!',
                message: 'You can unlock a premium achievement for free! 🏆',
                icon: '🎫'
            };
        } else if (type === 'Streak Saver') {
            return {
                title: 'Streak Saver!',
                message: 'You received a Streak Saver! 🛡️',
                icon: '🛡️'
            };
        } else if (type === 'Legendary NFT') {
            return {
                title: '🎉 LEGENDARY REWARD!',
                message: 'You won a unique NFT! 🔥',
                icon: '🏆'
            };
        }
        
        return {
            title: 'Unknown Prize',
            message: 'You received something special!',
            icon: '🎁'
        };
    };

    // Achievements system
    const achievements = [
        { 
            id: 'first_box', 
            name: 'First Box', 
            description: 'Open your first box', 
            icon: '📦',
            unlocked: stats.totalBoxes >= 1 
        },
        { 
            id: 'box_opener', 
            name: 'Box Opener', 
            description: 'Open 10 boxes', 
            icon: '📫',
            unlocked: stats.totalBoxes >= 10 
        },
        { 
            id: 'lucky_streak', 
            name: 'Lucky Streak', 
            description: 'Get 3 rare+ items', 
            icon: '🍀',
            unlocked: (stats.rareCount + stats.legendaryCount) >= 3 
        },
        { 
            id: 'legendary_hunter', 
            name: 'Legendary Hunter', 
            description: 'Get a legendary item', 
            icon: '🏆',
            unlocked: stats.legendaryCount >= 1 
        },
        { 
            id: 'point_collector', 
            name: 'Point Collector', 
            description: 'Collect 100 respect points', 
            icon: '💎',
            unlocked: stats.totalValue >= 100 
        },
        { 
            id: 'dedicated_player', 
            name: 'Dedicated Player', 
            description: 'Open 50 boxes', 
            icon: '🎯',
            unlocked: stats.totalBoxes >= 50 
        }
    ];

    const filteredPrizes = prizeHistory.filter((prize: DetectedPrize) => {
        if (filterType === 'all') return true;
        if (filterType === 'legendary') return prize.rarity === 'legendary';
        if (filterType === 'rare') return prize.rarity === 'rare' || prize.rarity === 'epic';
        if (filterType === 'common') return prize.rarity === 'common' || prize.rarity === 'uncommon';
        return prize.type === filterType;
    });

    const displayedPrizes = showFullHistory ? filteredPrizes : filteredPrizes.slice(0, 10);

    // Data management functions
    const handleFetchHistory = async () => {
        if (!address) {
            toast.error('Please connect your wallet first');
            return;
        }
        
        setIsFetchingHistory(true);
        try {
            await fetchHistoricalEvents();
            toast.success('Historical transactions fetched successfully!');
        } catch (error) {
            toast.error('Failed to fetch historical data');
        } finally {
            setIsFetchingHistory(false);
        }
    };

    const handleExportData = () => {
        if (prizeHistory.length === 0) {
            toast.error('No data to export');
            return;
        }
        
        exportData();
        toast.success('Data exported successfully!');
    };

    const handleImportData = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        
        if (file.type !== 'application/json') {
            toast.error('Please select a JSON file');
            return;
        }
        
        importData(file);
        toast.success('Data imported successfully!');
    };

    const handleClearData = async () => {
        if (window.confirm('Are you sure you want to clear all prize history? This action cannot be undone.')) {
            await clearPrizes();
            toast.success('All data cleared successfully');
        }
    };

    const handleCleanMockData = async () => {
        if (!address) return;
        
        const mockCount = prizeHistory.filter(p => p.blockNumber === 0).length;
        if (mockCount === 0) {
            toast('No mock data found to clean', { icon: 'ℹ️' });
            return;
        }
        
        if (window.confirm(`Found ${mockCount} mock transactions. Clean them up?`)) {
            const realPrizes = prizeHistory.filter(p => p.blockNumber > 0);
            
            // Update localStorage
            localStorage.setItem(`prizeHistory_${address}`, JSON.stringify(realPrizes));
            
            // Reload data to reflect changes
            await loadPrizes();
            
            toast.success(`Cleaned ${mockCount} mock transactions`);
        }
    };

    const handleOpenBox = async () => {
        if (!selectedCommunityId) {
            toast.error("Please select a community first.");
            return;
        }
        
        // Prevent opening box during animation
        if (isAnimating || showRevealAnimation) {
            toast.error("Please wait for current animation to finish.");
            return;
        }
        
        setIsOpening(true);

        // Generate simulated prize for animation (works immediately)
        const generateRandomPrize = () => {
            const random = Math.random() * 100;
            if (random < 1) return { type: 'Legendary NFT', value: 1, rarity: 'legendary' };
            if (random < 5) return { type: 'Achievement Voucher', value: 1, rarity: 'epic' };
            if (random < 15) return { type: 'Streak Saver', value: 1, rarity: 'rare' };
            if (random < 20) return { type: '3-Day Boost', value: 3, rarity: 'uncommon' };
            if (random < 30) return { type: '1-Day Boost', value: 1, rarity: 'uncommon' };
            if (random < 50) return { type: '25 Respect Points', value: 25, rarity: 'uncommon' };
            if (random < 70) return { type: '5 Respect Points', value: 5, rarity: 'common' };
            return { type: 'Nothing', value: 0, rarity: 'common' };
        };

        const simulatedPrize = generateRandomPrize();

        const promise = openUtilityBox(Number(selectedCommunityId));

        toast.promise(promise, {
            loading: 'Confirm transaction to open the box...',
            success: '',  // We'll handle success with animation
            error: (err) => `Error: ${err.message || 'Transaction failed'}`
        });

        try {
            await promise;
            
            // Reset and set animation state
            console.log('🎬 Starting new animation for prize:', simulatedPrize);
            setShowRevealAnimation(false); // Ensure clean slate
            setIsAnimating(true);
            setRevealPrize(simulatedPrize);
            
            // Small delay to ensure state is updated
            setTimeout(() => {
                setShowRevealAnimation(true);
            }, 100);
            
            // No mock data - only real blockchain events will be saved
            console.log('🔗 Transaction successful, waiting for real blockchain events...');
            
        } catch (e) {
            // Toast will display the error
        } finally {
            setIsOpening(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-b from-blue-900 via-purple-900 to-indigo-900 p-6">
            {/* Real Contract Event Listener */}
            <PrizeEventListener 
          
                onPrizeDetected={handlePrizeDetected}
                onTransactionProcessed={(txHash) => console.log('Transaction processed:', txHash)}
            />
            
            {/* Prize Reveal Animation */}
            <PrizeRevealAnimation 
                isRevealing={showRevealAnimation}
                finalPrize={revealPrize}
                onRevealComplete={() => {
                    console.log('🎬 Animation completed, cleaning up state');
                    setShowRevealAnimation(false);
                    setIsAnimating(false);  // End animation state
                    
                    // Show success toast AFTER animation completes (proper sequencing)
                    if (revealPrize) {
                        const prizeConfig = getPrizeConfig(revealPrize.type, revealPrize.value);
                        console.log('🎉 Showing success toast:', prizeConfig);
                        toast.success(`🎁 ${prizeConfig.title} - ${prizeConfig.message}`, {
                            duration: 6000
                        });
                    }
                    
                    setRevealPrize(null);  // Clear prize data last
                    console.log('🎬 All animation state cleared');
                }}
            />
            
            {/* Header */}
            <div className="text-center mb-8">
                <motion.h1 
                    className="text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600 mb-4"
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6 }}
                >
                    🎁 Utility Box System
                </motion.h1>
                <p className="text-xl text-gray-300 max-w-2xl mx-auto">
                    Open boxes to discover amazing prizes! From legendary NFTs to useful boosts and respect points.
                </p>
            </div>

            {/* Data Management Panel Toggle */}
            <div className="mb-6 flex justify-center">
                <button
                    onClick={() => setShowDataPanel(!showDataPanel)}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-800/50 hover:bg-gray-700/50 rounded-lg border border-gray-600 text-gray-300 transition-colors"
                >
                    <Database className="h-4 w-4" />
                    Data Management
                    <ChevronDown className={`h-4 w-4 transition-transform ${showDataPanel ? 'rotate-180' : ''}`} />
                </button>
            </div>

            {/* Data Management Panel */}
            {showDataPanel && (
                <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="mb-8 bg-gray-800/30 rounded-xl p-6 border border-gray-700"
                >
                    <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                        <Database className="h-5 w-5" />
                        Prize Data Management
                    </h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                        {/* Fetch Historical Data */}
                        <button
                            onClick={handleFetchHistory}
                            disabled={isFetchingHistory || !address}
                            className="flex items-center gap-2 px-4 py-3 bg-blue-600/20 hover:bg-blue-600/30 disabled:bg-gray-600/20 disabled:cursor-not-allowed rounded-lg border border-blue-400/30 text-blue-300 transition-colors"
                        >
                            <RefreshCw className={`h-4 w-4 ${isFetchingHistory ? 'animate-spin' : ''}`} />
                            {isFetchingHistory ? 'Fetching...' : 'Fetch History'}
                        </button>

                        {/* Clean Mock Data */}
                        <button
                            onClick={handleCleanMockData}
                            disabled={!address || prizeHistory.filter(p => p.blockNumber === 0).length === 0}
                            className="flex items-center gap-2 px-4 py-3 bg-orange-600/20 hover:bg-orange-600/30 disabled:bg-gray-600/20 disabled:cursor-not-allowed rounded-lg border border-orange-400/30 text-orange-300 transition-colors"
                        >
                            <Package className="h-4 w-4" />
                            Clean Mock
                        </button>

                        {/* Export Data */}
                        <button
                            onClick={handleExportData}
                            disabled={prizeHistory.length === 0}
                            className="flex items-center gap-2 px-4 py-3 bg-green-600/20 hover:bg-green-600/30 disabled:bg-gray-600/20 disabled:cursor-not-allowed rounded-lg border border-green-400/30 text-green-300 transition-colors"
                        >
                            <Download className="h-4 w-4" />
                            Export Data
                        </button>

                        {/* Import Data */}
                        <label className="flex items-center gap-2 px-4 py-3 bg-purple-600/20 hover:bg-purple-600/30 rounded-lg border border-purple-400/30 text-purple-300 cursor-pointer transition-colors">
                            <Upload className="h-4 w-4" />
                            Import Data
                            <input
                                type="file"
                                accept=".json"
                                onChange={handleImportData}
                                className="hidden"
                            />
                        </label>

                        {/* Clear Data */}
                        <button
                            onClick={handleClearData}
                            disabled={prizeHistory.length === 0}
                            className="flex items-center gap-2 px-4 py-3 bg-red-600/20 hover:bg-red-600/30 disabled:bg-gray-600/20 disabled:cursor-not-allowed rounded-lg border border-red-400/30 text-red-300 transition-colors"
                        >
                            <AlertCircle className="h-4 w-4" />
                            Clear All
                        </button>
                    </div>

                    {/* Data Status */}
                    <div className="mt-4 text-sm text-gray-400">
                        <p>💾 Stored prizes: {prizeHistory.length} 
                            {prizeHistory.length > 0 && (
                                <span className="ml-2">
                                    (🔗 {prizeHistory.filter(p => p.blockNumber > 0).length} real, 
                                     🎭 {prizeHistory.filter(p => p.blockNumber === 0).length} mock)
                                </span>
                            )}
                        </p>
                        <p>🔄 Storage: localStorage + IndexedDB backup</p>
                        {!address && <p className="text-yellow-400">⚠️ Connect wallet to manage data</p>}
                        
                        {/* Mock data warning */}
                        {prizeHistory.filter(p => p.blockNumber === 0).length > 0 && (
                            <p className="text-orange-400 mt-1">
                                ⚠️ Mock data detected - use "Clean Mock" to remove fake transactions
                            </p>
                        )}
                        
                        {/* Debug Info */}
                        {process.env.NODE_ENV === 'development' && (
                            <div className="mt-2 pt-2 border-t border-gray-600">
                                <p className="text-xs">🔧 Debug Info:</p>
                                <p className="text-xs">- localStorage available: {typeof(Storage) !== "undefined" ? "✅" : "❌"}</p>
                                <p className="text-xs">- IndexedDB available: {typeof(indexedDB) !== "undefined" ? "✅" : "❌"}</p>
                                <p className="text-xs">- Address: {address?.slice(0, 8)}...{address?.slice(-4)}</p>
                                <p className="text-xs">- Storage key: prizeHistory_{address?.slice(0, 8)}</p>
                            </div>
                        )}
                    </div>
                </motion.div>
            )}

            {/* Stats Dashboard */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <motion.div 
                    className="bg-gradient-to-r from-purple-600/20 to-purple-700/20 border border-purple-400/30 rounded-xl p-6"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                >
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-gray-300 text-sm">Total Boxes Opened</p>
                            <p className="text-2xl font-bold text-white">{stats.totalBoxes}</p>
                        </div>
                        <Package className="h-8 w-8 text-purple-400" />
                    </div>
                </motion.div>

                <motion.div 
                    className="bg-gradient-to-r from-yellow-600/20 to-yellow-700/20 border border-yellow-400/30 rounded-xl p-6"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                >
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-gray-300 text-sm">Legendary Items</p>
                            <p className="text-2xl font-bold text-white">{stats.legendaryCount}</p>
                        </div>
                        <Crown className="h-8 w-8 text-yellow-400" />
                    </div>
                </motion.div>

                <motion.div 
                    className="bg-gradient-to-r from-pink-600/20 to-pink-700/20 border border-pink-400/30 rounded-xl p-6"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                >
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-gray-300 text-sm">Respect Points</p>
                            <p className="text-2xl font-bold text-white">{stats.totalValue}</p>
                        </div>
                        <Star className="h-8 w-8 text-pink-400" />
                    </div>
                </motion.div>

                <motion.div 
                    className="bg-gradient-to-r from-blue-600/20 to-blue-700/20 border border-blue-400/30 rounded-xl p-6"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                >
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-gray-300 text-sm">Rare+ Items</p>
                            <p className="text-2xl font-bold text-white">{stats.rareCount + stats.legendaryCount}</p>
                        </div>
                        <Trophy className="h-8 w-8 text-blue-400" />
                    </div>
                </motion.div>
            </div>

            {/* Loading indicator for data operations */}
            {isLoadingData && (
                <div className="text-center mb-4">
                    <p className="text-gray-400">Loading prize data...</p>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Utility Box */}
                <div className="space-y-6">
                    <div className="bg-white/5 p-8 rounded-xl border border-white/10">
                        <h2 className="text-2xl font-bold text-white mb-6 text-center">
                            🎁 Open a Utility Box
                        </h2>
                        
                        <div className="text-center mb-6">
                            <div className="inline-block p-6 bg-gradient-to-r from-purple-500/20 to-pink-500/20 rounded-2xl border border-purple-500/30">
                                <Package className="h-16 w-16 text-purple-400 mx-auto mb-4" />
                                <p className="text-lg font-semibold text-white">Ready to open!</p>
                                <p className="text-sm text-gray-400">Cost: {utilityBoxFee || '0.0001'} ETH</p>
                            </div>
                        </div>
                        
                        <div className="space-y-4">
                            {userMemberships && userMemberships.length > 0 ? (
                                <>
                                    <select
                                        value={selectedCommunityId}
                                        onChange={(e) => setSelectedCommunityId(e.target.value)}
                                        className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                                    >
                                        <option value="" disabled>Select a community</option>
                                        {userMemberships.map(membership => (
                                            <option key={membership.communityId} value={membership.communityId}>
                                                Community {membership.communityId} (Level {membership.level})
                                            </option>
                                        ))}
                                    </select>

                                    <button
                                        onClick={handleOpenBox}
                                        disabled={isOpening || isLoading || !selectedCommunityId || !address || isAnimating || showRevealAnimation}
                                        className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-4 rounded-lg transition-all disabled:bg-gray-600 disabled:cursor-not-allowed"
                                    >
                                        {(isOpening || isAnimating || showRevealAnimation) ? (
                                            <div className="flex items-center justify-center gap-2">
                                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                                {isOpening && !isAnimating ? 'Opening...' :
                                                 isAnimating || showRevealAnimation ? 'Revealing...' : 'Processing...'}
                                            </div>
                                        ) : (
                                            `Open Box (${utilityBoxFee || '0.0001'} ETH)`
                                        )}
                                    </button>
                                </>
                            ) : (
                                <div className="text-center text-gray-400 py-6">
                                    <p className="mb-4">You must be a member of at least one community to open boxes.</p>
                                    <button 
                                        onClick={() => router.push('/spheres/community-browser')}
                                        className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
                                    >
                                        Browse Communities →
                                    </button>
                                </div>
                            )}
                        </div>

                        {!address && (
                            <div className="text-center text-yellow-400 mt-4">
                                ⚠️ Please connect your wallet to open boxes
                            </div>
                        )}

                        {/* Temporary Debug Panel */}
                        {address && (
                            <div className="mt-6 p-4 bg-gray-900/50 rounded-lg border border-gray-700">
                                <h4 className="text-sm font-semibold text-gray-300 mb-2">🔧 Debug Info</h4>
                                <div className="text-xs text-gray-400 space-y-1">
                                    <div>Connected Address: {address}</div>
                                    <div>Selected Community: {selectedCommunityId || 'None'}</div>
                                    <div>Event Listener Active: ✅</div>
                                    <div>Prize History Count: {prizeHistory.length}</div>
                                    <div>Last Transaction: {prizeHistory[0]?.txHash?.slice(0, 10) || 'None'}...</div>
                                    <div>Animation Playing: {showRevealAnimation ? '🎬 Yes' : '⏸️ No'}</div>
                                    <div>Current Prize: {revealPrize?.type || 'None'}</div>
                                    <div>Is Opening: {isOpening ? '⏳ Yes' : '✅ Ready'}</div>
                                </div>
                                <div className="mt-2 text-xs text-blue-400">
                                    Check browser console for event logs
                                </div>
                                
                                {/* Test Animation Button */}
                                <button
                                    onClick={() => {
                                        console.log('🧪 Testing animation manually...');
                                        const testPrize = { type: 'Legendary NFT', value: 1, rarity: 'legendary' };
                                        setRevealPrize(testPrize);
                                        setShowRevealAnimation(true);
                                    }}
                                    className="mt-2 text-xs text-yellow-400 hover:text-yellow-300 transition-colors bg-yellow-500/10 rounded-lg px-3 py-2"
                                >
                                    🧪 Test Animation
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Potential Prizes */}
                    <div className="bg-white/5 p-6 rounded-xl border border-white/10">
                        <h3 className="text-xl font-bold text-white mb-4">🎯 Possible Rewards</h3>
                        <div className="grid grid-cols-2 gap-3">
                            {potentialPrizes.map((prize, index) => (
                                <PrizeCard key={index} prize={prize} />
                            ))}
                        </div>
                    </div>
                </div>

                {/* Collection & History */}
                <div className="space-y-6">
                    {/* Achievements */}
                    <div className="bg-white/5 p-6 rounded-xl border border-white/10">
                        <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                            <Crown className="h-6 w-6 text-yellow-400" />
                            Collector Achievements
                        </h3>
                        <div className="grid grid-cols-2 gap-3">
                            {achievements.map((achievement) => (
                                <AchievementBadge 
                                    key={achievement.id} 
                                    achievement={achievement} 
                                    isUnlocked={achievement.unlocked}
                                />
                            ))}
                        </div>
                    </div>

                    {/* Prize History */}
                    <div className="bg-white/5 p-6 rounded-xl border border-white/10">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-xl font-bold text-white flex items-center gap-2">
                                <Calendar className="h-6 w-6 text-purple-400" />
                                Prize History ({prizeHistory.length} total)
                            </h3>
                            <div className="flex items-center gap-4">
                                <select
                                    value={filterType}
                                    onChange={(e) => setFilterType(e.target.value)}
                                    className="bg-white/10 border border-white/20 rounded px-3 py-1 text-white text-sm"
                                >
                                    <option value="all">All</option>
                                    <option value="legendary">Legendary</option>
                                    <option value="rare">Rare</option>
                                    <option value="common">Common</option>
                                </select>
                                
                                {prizeHistory.length > 0 && (
                                    <button
                                        onClick={async () => {
                                            if (confirm('Are you sure you want to clear all prize history?')) {
                                                await clearPrizes(); 
                                                toast.success('Prize history cleared!');
                                            }
                                        }}
                                        className="text-red-400 hover:text-red-300 text-sm"
                                    >
                                        Clear All
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Prize List or Empty State */}
                        {prizeHistory.length > 0 ? (
                            <>
                                <div className="space-y-3">
                                    {displayedPrizes.map((prize: DetectedPrize, index: number) => {
                                        const Icon = PRIZE_ICONS[prize.type as keyof typeof PRIZE_ICONS] || Package;
                                        const rarityColors = {
                                            legendary: 'border-yellow-400/50 bg-yellow-400/5',
                                            rare: 'border-purple-400/50 bg-purple-400/5',
                                            epic: 'border-purple-400/50 bg-purple-400/5',
                                            common: 'border-gray-400/50 bg-gray-400/5',
                                            uncommon: 'border-gray-400/50 bg-gray-400/5'
                                        };
                                        
                                        return (
                                            <div 
                                                key={index}
                                                className={`p-3 rounded-lg border ${rarityColors[prize.rarity] || rarityColors.common}`}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <Icon className={`h-6 w-6 ${
                                                        prize.rarity === 'legendary' ? 'text-yellow-400' :
                                                        prize.rarity === 'rare' ? 'text-purple-400' :
                                                        prize.rarity === 'epic' ? 'text-purple-400' :
                                                        'text-gray-400'
                                                    }`} />
                                                    <div className="flex-1">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-semibold text-white">{prize.type}</span>
                                                            {prize.value > 0 && (
                                                                <span className="text-green-400">+{prize.value}</span>
                                                            )}
                                                            <span className={`text-xs px-2 py-1 rounded-full ${
                                                                prize.rarity === 'legendary' ? 'bg-yellow-400/20 text-yellow-400' :
                                                                prize.rarity === 'rare' ? 'bg-purple-400/20 text-purple-400' : 
                                                                prize.rarity === 'epic' ? 'bg-purple-400/20 text-purple-400' :
                                                                'bg-gray-400/20 text-gray-400'
                                                            }`}>
                                                                {prize.rarity}
                                                            </span>
                                                            {/* Real vs Mock indicator */}
                                                            <span className={`text-xs px-2 py-1 rounded-full ${
                                                                prize.blockNumber > 0 
                                                                    ? 'bg-green-400/20 text-green-400' 
                                                                    : 'bg-red-400/20 text-red-400'
                                                            }`}>
                                                                {prize.blockNumber > 0 ? '🔗 Real' : '🎭 Mock'}
                                                            </span>
                                                        </div>
                                                        <div className="text-sm text-gray-400">
                                                            {new Date(prize.timestamp).toLocaleString()}
                                                        </div>
                                                        <div className="flex flex-col gap-1">
                                                            <div className={`text-xs font-mono ${isValidTxHash(prize.txHash) ? 'text-gray-500' : 'text-red-400'}`}>
                                                                {prize.txHash}
                                                                {!isValidTxHash(prize.txHash) && (
                                                                    <span className="ml-1 text-red-400" title="Invalid transaction hash format">⚠️</span>
                                                                )}
                                                            </div>
                                                            {isValidTxHash(prize.txHash) ? (
                                                                <a
                                                                    href={createBaseScanUrl(prize.txHash)}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="text-blue-400 hover:text-blue-300 text-xs underline"
                                                                    onClick={() => console.log('🔗 Opening BaseScan link:', createBaseScanUrl(prize.txHash), 'Hash valid:', isValidTxHash(prize.txHash))}
                                                                >
                                                                    View on BaseScan →
                                                                </a>
                                                            ) : (
                                                                <span className="text-red-400 text-xs">
                                                                    Invalid transaction hash
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Show More Button */}
                                {filteredPrizes.length > 10 && (
                                    <div className="mt-4 text-center">
                                        <button
                                            onClick={() => setShowFullHistory(!showFullHistory)}
                                            className="flex items-center gap-2 mx-auto text-purple-400 hover:text-purple-300 transition-colors"
                                        >
                                            {showFullHistory ? 'Show Less' : `Show All (${filteredPrizes.length - 10} more)`}
                                            <ChevronDown className={`h-4 w-4 transition-transform ${showFullHistory ? 'rotate-180' : ''}`} />
                                        </button>
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="text-center py-12">
                                <Package className="h-16 w-16 text-gray-600 mx-auto mb-4" />
                                <p className="text-gray-400 text-lg">No prizes yet</p>
                                <p className="text-gray-500 text-sm">Open your first box to start collecting!</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
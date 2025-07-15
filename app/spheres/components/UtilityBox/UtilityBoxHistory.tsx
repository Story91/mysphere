'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { Crown, Shield, Ticket, Zap, Star, Package, Coins, Clock, Trophy, Gift, TrendingUp } from 'lucide-react';

interface UtilityBoxReward {
    id: string;
    timestamp: number;
    transactionHash: string;
    type: string;
    value?: number;
    rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
    communityId: number;
}

interface UserLuckStats {
    totalBoxesOpened: number;
    legendaryCount: number;
    epicCount: number;
    rareCount: number;
    totalValueWon: number;
    luckPercentage: number;
}

const rarityColors = {
    common: "border-gray-500 bg-gray-500/10 text-gray-300",
    uncommon: "border-green-500 bg-green-500/10 text-green-300",
    rare: "border-blue-500 bg-blue-500/10 text-blue-300",
    epic: "border-purple-500 bg-purple-500/10 text-purple-300",
    legendary: "border-yellow-500 bg-yellow-500/10 text-yellow-300"
};

const getRewardIcon = (type: string) => {
    switch (type) {
        case 'NFT': return Crown;
        case 'Achievement Voucher': return Ticket;
        case 'Streak Saver': return Shield;
        case '3-Day Boost': return Zap;
        case '1-Day Boost': return Star;
        case 'Respect Points': return Coins;
        default: return Package;
    }
};

const getRewardValue = (type: string, value?: number) => {
    if (type === 'Respect Points' && value) return `+${value} Punktów`;
    if (type === 'NFT') return 'Legendary NFT';
    if (type === 'Achievement Voucher') return 'Darmowe Osiągnięcie';
    if (type === 'Streak Saver') return 'Ochrona Serii';
    if (type === '3-Day Boost') return '3 Dni Boost';
    if (type === '1-Day Boost') return '1 Dzień Boost';
    return 'Nic';
};

const HistoryCard = ({ reward }: { reward: UtilityBoxReward }) => {
    const IconComponent = getRewardIcon(reward.type);
    const date = new Date(reward.timestamp).toLocaleDateString('pl-PL');
    const time = new Date(reward.timestamp).toLocaleTimeString('pl-PL');
    
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ scale: 1.02 }}
            className={`p-4 rounded-xl border transition-all ${rarityColors[reward.rarity]} hover:shadow-lg`}
        >
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-3">
                    <div className={`p-2 rounded-lg ${rarityColors[reward.rarity]}`}>
                        <IconComponent className="h-5 w-5" />
                    </div>
                    <div>
                        <h4 className="font-semibold text-white">{getRewardValue(reward.type, reward.value)}</h4>
                        <p className="text-sm text-gray-400">Społeczność #{reward.communityId}</p>
                    </div>
                </div>
                <div className={`px-3 py-1 rounded-full text-xs font-bold ${rarityColors[reward.rarity]}`}>
                    {reward.rarity.toUpperCase()}
                </div>
            </div>
            
            <div className="flex items-center justify-between text-sm text-gray-400">
                <div className="flex items-center space-x-1">
                    <Clock className="h-4 w-4" />
                    <span>{date} {time}</span>
                </div>
                <a 
                    href={`https://basescan.org/tx/${reward.transactionHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 text-xs"
                >
                    Zobacz TX →
                </a>
            </div>
        </motion.div>
    );
};

const LuckStatsCard = ({ stats }: { stats: UserLuckStats }) => (
    <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10">
        <div className="flex items-center space-x-3 mb-6">
            <div className="p-3 rounded-lg bg-purple-500/20">
                <TrendingUp className="h-6 w-6 text-purple-400" />
            </div>
            <div>
                <h3 className="text-xl font-bold text-white">📊 Statystyki Szczęścia</h3>
                <p className="text-gray-400">Twoje osiągnięcia w otwieraniu boxów</p>
            </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="text-center">
                <div className="text-2xl font-bold text-white">{stats.totalBoxesOpened}</div>
                <div className="text-sm text-gray-400">Otwarte Boxy</div>
            </div>
            
            <div className="text-center">
                <div className="text-2xl font-bold text-yellow-400">{stats.legendaryCount}</div>
                <div className="text-sm text-gray-400">Legendary</div>
            </div>
            
            <div className="text-center">
                <div className="text-2xl font-bold text-purple-400">{stats.epicCount}</div>
                <div className="text-sm text-gray-400">Epic</div>
            </div>
            
            <div className="text-center">
                <div className="text-2xl font-bold text-blue-400">{stats.rareCount}</div>
                <div className="text-sm text-gray-400">Rare</div>
            </div>
            
            <div className="text-center">
                <div className="text-2xl font-bold text-green-400">{stats.luckPercentage.toFixed(1)}%</div>
                <div className="text-sm text-gray-400">Wskaźnik Szczęścia</div>
            </div>
            
            <div className="text-center">
                <div className="text-2xl font-bold text-pink-400">{stats.totalValueWon}</div>
                <div className="text-sm text-gray-400">Łączne Punkty</div>
            </div>
        </div>

        {/* Luck meter */}
        <div className="mt-6">
            <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-400">Poziom Szczęścia</span>
                <span className="text-sm text-white font-semibold">{stats.luckPercentage > 50 ? 'Szczęściarz!' : stats.luckPercentage > 30 ? 'Niezły' : 'Potrzebujesz więcej szczęścia'}</span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-3">
                <div 
                    className={`h-3 rounded-full transition-all duration-1000 ${
                        stats.luckPercentage > 70 ? 'bg-gradient-to-r from-yellow-400 to-yellow-600' :
                        stats.luckPercentage > 50 ? 'bg-gradient-to-r from-purple-400 to-purple-600' :
                        stats.luckPercentage > 30 ? 'bg-gradient-to-r from-blue-400 to-blue-600' :
                        'bg-gradient-to-r from-gray-400 to-gray-600'
                    }`}
                    style={{ width: `${Math.min(stats.luckPercentage, 100)}%` }}
                />
            </div>
        </div>
    </div>
);

export default function UtilityBoxHistory() {
    const router = useRouter();
    const [rewards, setRewards] = useState<UtilityBoxReward[]>([]);
    const [luckStats, setLuckStats] = useState<UserLuckStats | null>(null);
    const [filter, setFilter] = useState<'all' | 'legendary' | 'epic' | 'rare'>('all');

    // Mock data - w rzeczywistej implementacji pobierać z localStorage lub API
    useEffect(() => {
        // Przykładowe dane - w prawdziwej aplikacji ładować z persistent storage
        const mockRewards: UtilityBoxReward[] = [
            {
                id: '1',
                timestamp: Date.now() - 86400000, // 1 dzień temu
                transactionHash: '0x1234567890abcdef1234567890abcdef12345678',
                type: 'NFT',
                rarity: 'legendary',
                communityId: 1
            },
            {
                id: '2',
                timestamp: Date.now() - 172800000, // 2 dni temu
                transactionHash: '0x2234567890abcdef1234567890abcdef12345679',
                type: 'Achievement Voucher',
                rarity: 'epic',
                communityId: 2
            },
            {
                id: '3',
                timestamp: Date.now() - 259200000, // 3 dni temu
                transactionHash: '0x3234567890abcdef1234567890abcdef12345680',
                type: 'Respect Points',
                value: 25,
                rarity: 'uncommon',
                communityId: 1
            },
            {
                id: '4',
                timestamp: Date.now() - 345600000, // 4 dni temu
                transactionHash: '0x4234567890abcdef1234567890abcdef12345681',
                type: 'Streak Saver',
                rarity: 'rare',
                communityId: 3
            }
        ];

        setRewards(mockRewards);

        // Oblicz statystyki szczęścia
        const totalBoxes = mockRewards.length + 6; // + boxes that gave nothing
        const legendaryCount = mockRewards.filter(r => r.rarity === 'legendary').length;
        const epicCount = mockRewards.filter(r => r.rarity === 'epic').length;
        const rareCount = mockRewards.filter(r => r.rarity === 'rare').length;
        const totalValueWon = mockRewards.reduce((sum, r) => sum + (r.value || 0), 0) + (legendaryCount * 100) + (epicCount * 50) + (rareCount * 25);
        
        // Oblicz wskaźnik szczęścia na podstawie rzadkości nagród
        const luckScore = (legendaryCount * 10) + (epicCount * 5) + (rareCount * 2);
        const luckPercentage = Math.min((luckScore / totalBoxes) * 10, 100);

        setLuckStats({
            totalBoxesOpened: totalBoxes,
            legendaryCount,
            epicCount,
            rareCount,
            totalValueWon,
            luckPercentage
        });
    }, []);

    const filteredRewards = rewards.filter(reward => {
        if (filter === 'all') return true;
        return reward.rarity === filter;
    });

    if (!luckStats) {
        return <div className="text-white">Ładowanie...</div>;
    }

    return (
        <div className="space-y-8">
            <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center space-x-4"
            >
                <button
                    onClick={() => router.back()}
                    className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                >
                    <Crown className="h-5 w-5 text-white" />
                </button>
                <div className="text-left">
                    <h2 className="text-3xl font-bold text-white mb-1">🎁 Historia Utility Box</h2>
                    <p className="text-gray-300">
                        Twoje wszystkie nagrody z otwieranych boxów i statystyki szczęścia
                    </p>
                </div>
            </motion.div>

            {/* Statystyki szczęścia */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
            >
                <LuckStatsCard stats={luckStats} />
            </motion.div>

            {/* Filtry */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="flex flex-wrap gap-3"
            >
                {[
                    { key: 'all', label: 'Wszystkie', icon: Gift },
                    { key: 'legendary', label: 'Legendary', icon: Crown },
                    { key: 'epic', label: 'Epic', icon: Trophy },
                    { key: 'rare', label: 'Rare', icon: Star }
                ].map(({ key, label, icon: Icon }) => (
                    <button
                        key={key}
                        onClick={() => setFilter(key as any)}
                        className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-all ${
                            filter === key 
                                ? 'bg-purple-600 text-white' 
                                : 'bg-white/10 text-gray-400 hover:bg-white/20 hover:text-white'
                        }`}
                    >
                        <Icon className="h-4 w-4" />
                        <span className="font-semibold">{label}</span>
                    </button>
                ))}
            </motion.div>

            {/* Lista nagród */}
            <div className="space-y-4">
                {filteredRewards.length > 0 ? (
                    <>
                        <h3 className="text-xl font-bold text-white">
                            {filter === 'all' ? 'Wszystkie nagrody' : `${filter.charAt(0).toUpperCase() + filter.slice(1)} nagrody`} 
                            ({filteredRewards.length})
                        </h3>
                        <div className="grid gap-4">
                            {filteredRewards.map((reward, index) => (
                                <motion.div
                                    key={reward.id}
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: index * 0.1 }}
                                >
                                    <HistoryCard reward={reward} />
                                </motion.div>
                            ))}
                        </div>
                    </>
                ) : (
                    <div className="text-center text-gray-400 py-12">
                        <Package className="h-16 w-16 mx-auto mb-4 opacity-50" />
                        <h3 className="text-xl font-semibold mb-2">Brak nagród w tej kategorii</h3>
                        <p>Spróbuj zmienić filtr lub otwórz więcej boxów!</p>
                    </div>
                )}
            </div>

            {/* Call to action */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="text-center"
            >
                <button
                    onClick={() => router.push('/spheres/utility-box')}
                    className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-bold py-4 px-8 rounded-lg transition-all shadow-lg"
                >
                    🎁 Otwórz kolejny Box!
                </button>
            </motion.div>
        </div>
    );
} 
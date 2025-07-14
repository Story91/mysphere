'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useSpheresContract } from '../../hooks/useSpheresContract';
import { toast } from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import { Package, Shield, Gift, Zap, Star, Crown, Trophy, Ticket } from 'lucide-react';

interface Prize {
    icon: React.ComponentType<{ className?: string }>;
    name: string;
    description: string;
    chance: string;
    color: string;
}

const potentialPrizes: Prize[] = [
    { icon: Trophy, name: "Legendary NFT", description: "A unique, super rare collectible NFT.", chance: "1%", color: "text-yellow-400" },
    { icon: Ticket, name: "Achievement Voucher", description: "Use this to unlock any premium achievement for free.", chance: "4%", color: "text-purple-400" },
    { icon: Shield, name: "Streak Saver", description: "Saves your daily activity streak if you miss a day.", chance: "10%", color: "text-blue-400" },
    { icon: Star, name: "3-Day Boost", description: "A random 3-day boost for XP or reputation.", chance: "5%", color: "text-green-400" },
    { icon: Zap, name: "1-Day Boost", description: "A random 1-day boost for your stats.", chance: "10%", color: "text-green-500" },
    { icon: Gift, name: "25 Respect Points", description: "A solid boost to your community standing.", chance: "20%", color: "text-pink-400" },
    { icon: Package, name: "5 Respect Points", description: "A small bonus for your engagement.", chance: "20%", color: "text-gray-300" },
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

export default function UtilityBoxSystem() {
    const router = useRouter();
    const { 
        utilityBoxFee,
        userMemberships, 
        openUtilityBox, 
        isLoading: contractLoading 
    } = useSpheresContract();

    const [selectedCommunityId, setSelectedCommunityId] = useState<string>('');
    const [isOpening, setIsOpening] = useState(false);

    const handleOpenBox = async () => {
        if (!selectedCommunityId) {
            toast.error("Please select a community first.");
            return;
        }
        
        setIsOpening(true);

        const promise = openUtilityBox(Number(selectedCommunityId));

        toast.promise(promise, {
            loading: 'Confirm transaction to open the box...',
            success: 'Box opened successfully! Check your activity feed for rewards.',
            error: (err) => `Error: ${err.message || 'Transaction failed'}`
        });

        try {
            await promise;
        } catch (e) {
            // Toast will display the error
        } finally {
            setIsOpening(false);
        }
    };

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
                    <h2 className="text-3xl font-bold text-white mb-1">Utility Box</h2>
                    <p className="text-gray-300">
                        Open a mystery box to win exclusive rewards. You must be a member of a community to participate.
                    </p>
                </div>
            </motion.div>

            {/* Main Box Area */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
                <motion.div
                    initial={{ opacity: 0, x: -50 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2 }}
                    className="bg-white/5 backdrop-blur-sm rounded-2xl p-8 border border-white/10 text-center"
                >
                    <Package className="h-24 w-24 mx-auto text-purple-400 mb-6" />
                    <h3 className="text-2xl font-bold text-white mb-4">Mystery Utility Box</h3>
                    
                    {userMemberships && userMemberships.length > 0 ? (
                        <div className="space-y-4">
                            <select
                                value={selectedCommunityId}
                                onChange={(e) => setSelectedCommunityId(e.target.value)}
                                className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                            >
                                <option value="" disabled>Select a community to open in</option>
                                {userMemberships.map(membership => (
                                    <option key={membership.communityId} value={membership.communityId}>
                                        Community #{membership.communityId}
                                    </option>
                                ))}
                            </select>

                            <button
                                onClick={handleOpenBox}
                                disabled={isOpening || contractLoading || !selectedCommunityId}
                                className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-4 rounded-lg transition-all disabled:bg-gray-600 disabled:cursor-not-allowed"
                            >
                                {isOpening ? 'Opening...' : `Open Box (${utilityBoxFee || '0'} ETH)`}
                            </button>
                        </div>
                    ) : (
                        <div className="text-center text-gray-400">
                            <p>You must be a member of at least one community to open a box.</p>
                            <button onClick={() => router.push('/spheres/community-browser')} className="mt-4 text-purple-400 font-semibold">
                                Browse Communities
                            </button>
                        </div>
                    )}
                </motion.div>

                {/* Prize Pool */}
                <motion.div
                    initial={{ opacity: 0, x: 50 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.4 }}
                    className="space-y-4"
                >
                    <h3 className="text-xl font-bold text-white text-center">What's Inside?</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {potentialPrizes.map(prize => (
                            <PrizeCard key={prize.name} prize={prize} />
                        ))}
                    </div>
                </motion.div>
            </div>
        </div>
    );
}
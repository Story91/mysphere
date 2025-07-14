'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useSpheresContract, Community } from '../../hooks/useSpheresContract';
import { parseEther, isAddress, Address } from 'viem';
import { toast } from 'react-hot-toast';

const UsersIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.653-.124-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.653.124-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
);

const CoinsIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v.01M12 6v-1h4v1m-4 0h-4v-1h4m0-4v-1h4v1m-4 0h-4v-1h4m12 12v-1h-4v1m4 0h4v-1h-4m-4-1v-1h4v1m-4 0h-4v-1h4" />
    </svg>
);

const JoinModal = ({ community, onClose, onConfirm }: { community: Community, onClose: () => void, onConfirm: (lifetime: boolean, referrer: string) => void }) => {
    const [isLifetime, setIsLifetime] = useState(false);
    const [referrer, setReferrer] = useState('');

    const fee = isLifetime 
        ? parseFloat(community.lifetimeSubFeeEth) 
        : parseFloat(community.monthlySubFeeEth);
    
    const totalFee = fee + parseFloat(community.joinFeeEth);

    return (
        <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50"
            onClick={onClose}
        >
            <motion.div 
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                className="bg-slate-800 rounded-2xl p-8 border border-white/10 w-full max-w-md"
                onClick={(e) => e.stopPropagation()}
            >
                <h2 className="text-2xl font-bold text-white mb-4">Join {community.name}</h2>
                <div className="space-y-4">
                    <div>
                        <label className="text-sm text-gray-400">Subscription Type</label>
                        <div className="flex gap-4 mt-2">
                            <button onClick={() => setIsLifetime(false)} className={`flex-1 p-3 rounded-lg ${!isLifetime ? 'bg-purple-600' : 'bg-white/10'}`}>Monthly ({community.monthlySubFeeEth} ETH)</button>
                            <button onClick={() => setIsLifetime(true)} className={`flex-1 p-3 rounded-lg ${isLifetime ? 'bg-purple-600' : 'bg-white/10'}`}>Lifetime ({community.lifetimeSubFeeEth} ETH)</button>
                        </div>
                    </div>
                    <div>
                        <label htmlFor="referrer" className="text-sm text-gray-400">Referrer Address (Optional)</label>
                        <input 
                            id="referrer"
                            type="text"
                            value={referrer}
                            onChange={(e) => setReferrer(e.target.value)}
                            placeholder="0x..."
                            className="w-full mt-2 bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                    </div>
                    <div className="border-t border-white/10 pt-4">
                        <p className="flex justify-between"><span>Join Fee:</span> <span>{community.joinFeeEth} ETH</span></p>
                        <p className="flex justify-between"><span>Subscription Fee:</span> <span>{fee.toFixed(4)} ETH</span></p>
                        <p className="flex justify-between font-bold text-lg mt-2"><span>Total:</span> <span>{totalFee.toFixed(4)} ETH</span></p>
                    </div>
                </div>
                <div className="flex gap-4 mt-6">
                    <button onClick={onClose} className="flex-1 py-3 rounded-lg bg-white/10 hover:bg-white/20">Cancel</button>
                    <button onClick={() => onConfirm(isLifetime, referrer)} className="flex-1 py-3 rounded-lg bg-purple-600 hover:bg-purple-700 font-semibold">Confirm & Join</button>
                </div>
            </motion.div>
        </motion.div>
    )
}

const CommunityCard = ({ community, onJoin }: { community: Community, onJoin: (communityId: number) => void }) => {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white/5 backdrop-blur-md rounded-2xl p-6 border border-white/10 flex flex-col justify-between"
      >
        <div>
          <h3 className="text-xl font-bold text-white mb-2">{community.name}</h3>
          <p className="text-sm text-gray-300 mb-4 h-20 overflow-hidden">{community.description}</p>
          
          <div className="grid grid-cols-2 gap-4 text-sm mb-4">
            <div className="flex items-center space-x-2">
                <UsersIcon />
                <span className="text-gray-300">{community.totalMembers} Members</span>
            </div>
            <div className="flex items-center space-x-2">
                <CoinsIcon />
                <span className="text-gray-300">{community.joinFeeEth} ETH Join Fee</span>
            </div>
          </div>
        </div>
        
        <button
          onClick={() => onJoin(community.id)}
          className="w-full mt-4 bg-purple-600/50 hover:bg-purple-600 text-white font-bold py-2 px-4 rounded-lg transition-colors"
        >
          Join Community
        </button>
      </motion.div>
    );
};

export default function CommunityBrowser() {
  const router = useRouter();
  const { communities, isLoading, joinCommunity, userMemberships } = useSpheresContract();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCommunity, setSelectedCommunity] = useState<Community | null>(null);

  const filteredCommunities = communities.filter(community => 
    community.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleJoinClick = (communityId: number) => {
    const community = communities.find(c => c.id === communityId);
    if (community) {
        setSelectedCommunity(community);
    }
  };

  const handleConfirmJoin = async (lifetime: boolean, referrer: string) => {
    if (!selectedCommunity) return;

    const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address;
    let referrerAddress: Address = ZERO_ADDRESS;

    if (referrer.trim()) { 
        if (isAddress(referrer)) {
            referrerAddress = referrer;
        } else {
            toast.error("Invalid referrer address provided.");
            return;
        }
    }

    const fee = lifetime 
        ? parseFloat(selectedCommunity.lifetimeSubFeeEth) 
        : parseFloat(selectedCommunity.monthlySubFeeEth);
    
    const isAlreadyMember = userMemberships?.some(m => m.communityId === selectedCommunity.id);
    const joinFee = isAlreadyMember ? 0 : parseFloat(selectedCommunity.joinFeeEth);
    
    const totalFee = fee + joinFee;
    const value = parseEther(totalFee.toString());

    const promise = joinCommunity(selectedCommunity.id, lifetime, referrerAddress, value);
    
    toast.promise(promise, {
        loading: 'Processing join transaction...',
        success: 'Successfully joined community!',
        error: (err) => `Error: ${err.message || 'Transaction failed'}`
    });

    try {
        await promise;
    } catch (e) {
        // toast handles error display
    } finally {
        setSelectedCommunity(null);
    }
  };

  return (
    <>
        {selectedCommunity && (
            <JoinModal 
                community={selectedCommunity}
                onClose={() => setSelectedCommunity(null)}
                onConfirm={handleConfirmJoin}
            />
        )}
        <div className="space-y-6">
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
        >
            <div className="flex items-center space-x-4">
                <button
                    onClick={() => router.back()}
                    className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                </button>
                <div className="text-left">
                    <h2 className="text-3xl font-bold text-white mb-1">Browse Communities 🔍</h2>
                    <p className="text-gray-300">
                    Discover and join amazing communities in the Spheres ecosystem
                    </p>
                </div>
            </div>
            <div className="w-full md:w-auto">
                <input 
                    type="text"
                    placeholder="Search communities..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
            </div>
        </motion.div>

        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
        >
            {isLoading && (
                <div className="text-center p-8">
                    <p className="text-white">Loading communities...</p>
                </div>
            )}

            {!isLoading && filteredCommunities.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredCommunities.map(community => (
                        <CommunityCard key={community.id} community={community} onJoin={handleJoinClick} />
                    ))}
                </div>
            )}

            {!isLoading && filteredCommunities.length === 0 && (
                <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-8 border border-white/10 text-center">
                    <div className="text-6xl mb-4">🤷</div>
                    <h3 className="text-xl font-bold text-white mb-2">No Communities Found</h3>
                    <p className="text-gray-400">
                        No communities match your search term, or no communities have been created yet.
                    </p>
                </div>
            )}
        </motion.div>
        </div>
    </>
  );
} 
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther, formatEther, Address } from 'viem';
import { toast } from 'react-hot-toast';

// Contract configuration
export const CONTRACT_ADDRESS = "0xdE9f006A063eeE1f0dDb15A8198E573B36aCc070" as Address;

// Import ABI from artifacts
import HybridCommunityPlatformArtifacts from '../artifacts/app/spheres/contracts/spheres-core.sol/HybridCommunityPlatform.json';

// Complete ABI for HybridCommunityPlatform
export const CONTRACT_ABI = HybridCommunityPlatformArtifacts.abi;

// Simplified enums
export enum CommunityStatus {
  ACTIVE = 0,
  SUSPENDED = 1,
  CLOSED = 2
}

export enum MemberRole {
  MEMBER = 0,
  MODERATOR = 1,
  ADMIN = 2
}

// Interface definitions
export interface PlatformStats {
  totalCommunities: number;
  totalMembers: number;
  totalTransactions: number;
  activeCommunities: number;
  totalVolume: string;
  totalPlatformFees: string;
}

export interface Community {
  id: number;
  creator: Address;
  name: string;
  description: string;
  joinFeeEth: string;
  monthlySubFeeEth: string;
  lifetimeSubFeeEth: string;
  balance: string;
  withdrawableBalance: string;
  totalMembers: number;
  status: CommunityStatus;
}

export interface Member {
  communityId: number;
  subscriptionExpiresAt: number;
  respectPoints: number;
  totalSpent: number;
  lastActiveTime: number;
  referralCount: number;
  level: number;
  reputation: number;
  currentStreak: number;
  longestStreak: number;
  totalEventsParticipated: number;
  totalEventsWon: number;
  totalRatings: number;
  ratingSum: number;
  lifetime: boolean;
  mentorAddress: Address | null;
}

export interface ContractData {
  communityIdCounter: number;
  platformStats: PlatformStats | null;
  isPaused: boolean;
  owner: Address | null;
  creationFee: string;
  utilityBoxFee: string;
  achievementUnlockFee: string;
  boostPurchaseFee: string;
  eventPlatformFee: string;
  withdrawalFeePercentage: number;
  defaultPlatformFeePercentage: number;
  maxPlatformFeePercentage: number;
}

// Main hook
export function useSpheresContract() {
  const { address } = useAccount();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [communities, setCommunities] = useState<Community[]>([]);
  
  // Debug wallet connection
  useEffect(() => {
    console.log('🔗 Wallet Status:');
    console.log('Address:', address);
    console.log('Has Address:', !!address);
  }, [address]);

  // Read contract data
  const { data: communityIdCounter, refetch: refetchCommunityIdCounter } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'communityIdCounter',
    query: { enabled: !!address },
  });

  const { data: platformStatsRaw, refetch: refetchPlatformStats } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'platformStats',
    query: { enabled: !!address },
  });

  const { data: isPaused, refetch: refetchPaused } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'paused',
    query: { enabled: !!address },
  });

  const { data: owner, error: ownerError, refetch: refetchOwner } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'owner',
    query: { enabled: !!address },
  });
  
  // Debug owner loading
  useEffect(() => {
    if (owner) {
      console.log('📋 Owner loaded from contract:', owner);
    }
    if (ownerError) {
      console.error('🚨 Error fetching owner:', ownerError);
    }
  }, [owner, ownerError]);

  const { data: creationFeeRaw, refetch: refetchCreationFee } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'creationFeeEth',
    query: { enabled: !!address },
  });

  const { data: utilityBoxFeeRaw, refetch: refetchUtilityBoxFee } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'utilityBoxFee',
    query: { enabled: !!address },
  });

  const { data: achievementUnlockFeeRaw, refetch: refetchAchievementUnlockFee } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'achievementUnlockFee',
    query: { enabled: !!address },
  });

  const { data: boostPurchaseFeeRaw, refetch: refetchBoostPurchaseFee } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'boostPurchaseFee',
    query: { enabled: !!address },
  });

  const { data: eventPlatformFeeRaw, refetch: refetchEventPlatformFee } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'eventPlatformFee',
    query: { enabled: !!address },
  });

  const { data: withdrawalFeePercentageRaw, refetch: refetchWithdrawalFeePercentage } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'withdrawalFeePercentage',
    query: { enabled: !!address },
  });

  const { data: defaultPlatformFeePercentageRaw, refetch: refetchDefaultPlatformFeePercentage } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'defaultPlatformFeePercentage',
    query: { enabled: !!address },
  });

  const { data: maxPlatformFeePercentageRaw, refetch: refetchMaxPlatformFeePercentage } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'maxPlatformFeePercentage',
    query: { enabled: !!address },
  });

  // Write contract functions
  const { writeContract: writeContractFn, data: hash, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });

  // Format contract data
  const contractData: ContractData = {
    communityIdCounter: Number(communityIdCounter || 0),
    platformStats: platformStatsRaw && Array.isArray(platformStatsRaw) ? {
      totalCommunities: Number(platformStatsRaw[0]),
      totalMembers: Number(platformStatsRaw[1]),
      totalTransactions: Number(platformStatsRaw[2]),
      activeCommunities: Number(platformStatsRaw[3]),
      totalVolume: formatEther(platformStatsRaw[4] || 0n),
      totalPlatformFees: formatEther(platformStatsRaw[5] || 0n),
    } : null,
    isPaused: Boolean(isPaused) || false,
    owner: (owner as Address) || null,
    creationFee: formatEther((creationFeeRaw as bigint) || 0n),
    utilityBoxFee: formatEther((utilityBoxFeeRaw as bigint) || 0n),
    achievementUnlockFee: formatEther((achievementUnlockFeeRaw as bigint) || 0n),
    boostPurchaseFee: formatEther((boostPurchaseFeeRaw as bigint) || 0n),
    eventPlatformFee: formatEther((eventPlatformFeeRaw as bigint) || 0n),
    withdrawalFeePercentage: Number(withdrawalFeePercentageRaw || 0),
    defaultPlatformFeePercentage: Number(defaultPlatformFeePercentageRaw || 0),
    maxPlatformFeePercentage: Number(maxPlatformFeePercentageRaw || 0),
  };

  // Helper function to execute transactions
  const executeTransaction = useCallback(async (
    functionName: string,
    args: any[],
    value: bigint = 0n,
    successMessage: string = 'Transaction successful!'
  ) => {
    try {
      setIsLoading(true);
      setError(null);

      await writeContractFn({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName,
        args,
        value,
      });

      toast.success(successMessage);
      
      // Refetch contract data after successful transaction
      setTimeout(() => {
        refetchCommunityIdCounter();
        refetchPlatformStats();
        refetchPaused();
        refetchOwner();
        refetchCreationFee();
        refetchUtilityBoxFee();
        refetchAchievementUnlockFee();
        refetchBoostPurchaseFee();
        refetchEventPlatformFee();
        refetchWithdrawalFeePercentage();
        refetchDefaultPlatformFeePercentage();
        refetchMaxPlatformFeePercentage();
      }, 2000);

    } catch (err: any) {
      const errorMessage = err?.message || 'Transaction failed';
      setError(errorMessage);
      toast.error(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [writeContractFn, refetchCommunityIdCounter, refetchPlatformStats, refetchPaused, refetchOwner, refetchCreationFee, refetchUtilityBoxFee, refetchAchievementUnlockFee, refetchBoostPurchaseFee, refetchEventPlatformFee, refetchWithdrawalFeePercentage, refetchDefaultPlatformFeePercentage, refetchMaxPlatformFeePercentage]);

  // Helper functions
  const getCommunityDetails = useCallback(async (communityId: number): Promise<Community | null> => {
    try {
      // In real implementation, this would use useReadContract for specific community
      const community = communities.find(c => c.id === communityId);
      return community || null;
    } catch (err) {
      console.error('Error fetching community details:', err);
      return null;
    }
  }, [communities]);

  const getMemberDetails = useCallback(async (communityId: number, memberAddress: Address): Promise<Member | null> => {
    try {
      // This would use useReadContract with getMemberDetails function
      // For now, return null as placeholder
      return null;
    } catch (err) {
      console.error('Error fetching member details:', err);
      return null;
    }
  }, []);

  const isGloballyBanned = useCallback(async (userAddress: Address): Promise<boolean> => {
    try {
      // This would use useReadContract with globalBannedUsers function
      return false;
    } catch (err) {
      console.error('Error checking global ban status:', err);
      return false;
    }
  }, []);

  // Admin functions - Real contract interactions
  const globalBanUser = useCallback(async (userAddress: Address) => {
    return executeTransaction('globalBanUser', [userAddress], 0n, 'User banned globally!');
  }, [executeTransaction]);

  const globalUnbanUser = useCallback(async (userAddress: Address) => {
    return executeTransaction('globalUnbanUser', [userAddress], 0n, 'User unbanned!');
  }, [executeTransaction]);

  const suspendCommunity = useCallback(async (communityId: number) => {
    return executeTransaction('suspendCommunity', [BigInt(communityId)], 0n, 'Community suspended!');
  }, [executeTransaction]);

  const reactivateCommunity = useCallback(async (communityId: number) => {
    return executeTransaction('reactivateCommunity', [BigInt(communityId)], 0n, 'Community reactivated!');
  }, [executeTransaction]);

  const setPlatformFeePercentage = useCallback(async (communityId: number, percentage: number) => {
    return executeTransaction('setPlatformFeePercentage', [BigInt(communityId), BigInt(percentage)], 0n, 'Platform fee updated!');
  }, [executeTransaction]);

  const setCreationFee = useCallback(async (fee: string) => {
    return executeTransaction('setCreationFee', [parseEther(fee)], 0n, 'Creation fee updated!');
  }, [executeTransaction]);

  const setUtilityBoxFee = useCallback(async (fee: string) => {
    return executeTransaction('setUtilityBoxFee', [parseEther(fee)], 0n, 'Utility box fee updated!');
  }, [executeTransaction]);

  const setAchievementUnlockFee = useCallback(async (fee: string) => {
    return executeTransaction('setAchievementUnlockFee', [parseEther(fee)], 0n, 'Achievement unlock fee updated!');
  }, [executeTransaction]);

  const setBoostPurchaseFee = useCallback(async (fee: string) => {
    return executeTransaction('setBoostPurchaseFee', [parseEther(fee)], 0n, 'Boost purchase fee updated!');
  }, [executeTransaction]);

  const setEventPlatformFee = useCallback(async (fee: string) => {
    return executeTransaction('setEventPlatformFee', [parseEther(fee)], 0n, 'Event platform fee updated!');
  }, [executeTransaction]);

  const setWithdrawalFeePercentage = useCallback(async (percentage: number) => {
    return executeTransaction('setWithdrawalFeePercentage', [BigInt(percentage)], 0n, 'Withdrawal fee percentage updated!');
  }, [executeTransaction]);

  const pausePlatform = useCallback(async () => {
    return executeTransaction('pause', [], 0n, 'Platform paused!');
  }, [executeTransaction]);

  const unpausePlatform = useCallback(async () => {
    return executeTransaction('unpause', [], 0n, 'Platform resumed!');
  }, [executeTransaction]);

  const emergencyWithdraw = useCallback(async (to: Address, amount: string) => {
    return executeTransaction('emergencyWithdraw', [to, parseEther(amount)], 0n, 'Emergency withdrawal completed!');
  }, [executeTransaction]);

  // User functions
  const createCommunity = useCallback(async (name: string, description: string, joinFee: string, monthlyFee: string, lifetimeFee: string) => {
    return executeTransaction('createCommunity', [
      name,
      description,
      parseEther(joinFee),
      parseEther(monthlyFee),
      parseEther(lifetimeFee)
    ], parseEther(contractData.creationFee), 'Community created successfully!');
  }, [executeTransaction, contractData.creationFee]);

  const joinCommunity = useCallback(async (communityId: number, isLifetime: boolean, referrer: Address, value: string) => {
    return executeTransaction('joinCommunity', [
      BigInt(communityId),
      isLifetime,
      referrer
    ], parseEther(value), 'Successfully joined community!');
  }, [executeTransaction]);

  const openUtilityBox = useCallback(async (communityId: number) => {
    return executeTransaction('openUtilityBox', [BigInt(communityId)], parseEther(contractData.utilityBoxFee), 'Utility box opened!');
  }, [executeTransaction, contractData.utilityBoxFee]);

  // Computed values - with debugging
  console.log('🔍 Admin Check Debug:');
  console.log('User address:', address);
  console.log('Contract owner:', contractData.owner);
  console.log('Owner raw data:', owner);
  console.log('Address exists:', !!address);
  console.log('Owner exists:', !!contractData.owner);
  
  const isAdmin = !!(address && contractData.owner && 
    address.toLowerCase() === contractData.owner.toLowerCase());
  
  console.log('✅ Final isAdmin result:', isAdmin);

  const getAllCommunities = useCallback(() => {
    return communities;
  }, [communities]);

  const refetchAll = useCallback(() => {
    refetchCommunityIdCounter();
    refetchPlatformStats();
    refetchPaused();
    refetchOwner();
    refetchCreationFee();
    refetchUtilityBoxFee();
    refetchAchievementUnlockFee();
    refetchBoostPurchaseFee();
    refetchEventPlatformFee();
    refetchWithdrawalFeePercentage();
    refetchDefaultPlatformFeePercentage();
    refetchMaxPlatformFeePercentage();
  }, [refetchCommunityIdCounter, refetchPlatformStats, refetchPaused, refetchOwner, refetchCreationFee, refetchUtilityBoxFee, refetchAchievementUnlockFee, refetchBoostPurchaseFee, refetchEventPlatformFee, refetchWithdrawalFeePercentage, refetchDefaultPlatformFeePercentage, refetchMaxPlatformFeePercentage]);

  return {
    // Contract data
    ...contractData,
    
    // Helper functions
    getCommunityDetails,
    getMemberDetails,
    isGloballyBanned,
    getAllCommunities,
    refetchAll,
    
    // User functions
    createCommunity,
    joinCommunity,
    openUtilityBox,
    
    // Admin functions
    globalBanUser,
    globalUnbanUser,
    suspendCommunity,
    reactivateCommunity,
    pausePlatform,
    unpausePlatform,
    emergencyWithdraw,
    setCreationFee,
    setUtilityBoxFee,
    setAchievementUnlockFee,
    setBoostPurchaseFee,
    setEventPlatformFee,
    setWithdrawalFeePercentage,
    setPlatformFeePercentage,
    
    // State
    isLoading: isLoading || isConfirming,
    error: error || writeError?.message,
    address,
    isConnected: !!address,
    isAdmin,
    
    // Transaction status
    hash,
    isConfirming,
    isConfirmed,
    
    // Constants
    CONTRACT_ADDRESS,
    CONTRACT_ABI,
    
    // Communities data
    communities,
    
    // Utilities
    formatEther,
    parseEther,
    
    // Enums
    CommunityStatus,
    MemberRole
  };
} 
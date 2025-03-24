'use client';

import { useState, useEffect } from 'react';
import { BrowserProvider, Contract, parseUnits, formatUnits } from 'ethers';
import { useAccount } from 'wagmi';
import { motion } from 'framer-motion';

// ABI dla kontraktu stakingowego
const STAKING_ABI = [
  "function stake(uint256 amount) external",
  "function withdraw(uint256 amount) external",
  "function getReward() external",
  "function balanceOf(address account) external view returns (uint256)",
  "function earned(address account) external view returns (uint256)",
  "function totalSupply() external view returns (uint256)",
  "function rewardRate() external view returns (uint256)",
  "function lastTimeRewardApplicable() external view returns (uint256)",
  "function rewardPerToken() external view returns (uint256)",
  "function minimumStake() external view returns (uint256)",
  "function minimumStakingPeriod() external view returns (uint256)"
];

// Adres kontraktu stakingowego (do zmiany na właściwy po deployu)
const STAKING_CONTRACT_ADDRESS = "0x..."; // TODO: Dodać właściwy adres po deployu
const TOKEN_CONTRACT_ADDRESS = "0x26F732eD652A63aE66F365936fdDD2389c051B31";

// Stałe ze smart kontraktu
const MINIMUM_STAKE = parseUnits('10000000', 18); // 10M tokenów
const MINIMUM_STAKING_PERIOD = 7 * 24 * 60 * 60; // 7 dni w sekundach
const REWARD_RATE = parseUnits('38.58', 18); // 38.58 tokenów na sekundę

// ABI dla tokenu ERC20
const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address account) external view returns (uint256)"
];

export default function StakingComponent() {
  const { address, isConnected } = useAccount();
  
  // Stan komponentu
  const [stakedAmount, setStakedAmount] = useState('0');
  const [earnedRewards, setEarnedRewards] = useState('0');
  const [walletBalance, setWalletBalance] = useState('0');
  const [stakeAmount, setStakeAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [isApproved, setIsApproved] = useState(false);
  const [totalStakers, setTotalStakers] = useState(0);
  const [minimumStake, setMinimumStake] = useState('10000000');
  const [stakingPeriod, setStakingPeriod] = useState(MINIMUM_STAKING_PERIOD.toString());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [rewardRate, setRewardRate] = useState('38.58');

  // Inicjalizacja kontraktów
  const getContracts = async () => {
    if (typeof window !== 'undefined' && window.ethereum) {
      const provider = new BrowserProvider(window.ethereum as any);
      const signer = await provider.getSigner();
      const stakingContract = new Contract(STAKING_CONTRACT_ADDRESS, STAKING_ABI, signer);
      const tokenContract = new Contract(TOKEN_CONTRACT_ADDRESS, ERC20_ABI, signer);
      return { stakingContract, tokenContract, provider };
    }
    return null;
  };

  // Pobieranie danych
  const fetchData = async () => {
    try {
      const contracts = await getContracts();
      if (!contracts || !address) return;

      const { stakingContract, tokenContract } = contracts;

      // Pobierz dane stakingu
      const [
        stakedBal,
        earned,
        walletBal,
        totalSupply
      ] = await Promise.all([
        stakingContract.balanceOf(address),
        stakingContract.earned(address),
        tokenContract.balanceOf(address),
        stakingContract.totalSupply()
      ]);

      // Oblicz przybliżoną liczbę stakerów (zakładając średnio 10M tokenów na stakera)
      const estimatedStakers = Math.min(50, Math.ceil(Number(formatUnits(totalSupply, 18)) / 10000000));

      setStakedAmount(formatUnits(stakedBal, 18));
      setEarnedRewards(formatUnits(earned, 18));
      setWalletBalance(formatUnits(walletBal, 18));
      setTotalStakers(estimatedStakers);

      // Sprawdź allowance
      const allowance = await tokenContract.allowance(address, STAKING_CONTRACT_ADDRESS);
      setIsApproved(allowance > 0);

    } catch (err) {
      console.error('Error fetching staking data:', err);
      setError('Error fetching staking data');
    }
  };

  // Validate stake amount
  const validateStakeAmount = (amount: string): boolean => {
    const amountBN = parseUnits(amount || '0', 18);
    return amountBN >= MINIMUM_STAKE;
  };

  // Approve tokeny
  const handleApprove = async () => {
    try {
      setIsLoading(true);
      setError('');
      
      const contracts = await getContracts();
      if (!contracts) return;

      const { tokenContract } = contracts;
      const tx = await tokenContract.approve(
        STAKING_CONTRACT_ADDRESS,
        parseUnits('1000000000', 18) // Approve 1B tokens
      );
      await tx.wait();
      setIsApproved(true);
    } catch (err) {
      console.error('Error approving tokens:', err);
      setError('Error approving tokens');
    } finally {
      setIsLoading(false);
    }
  };

  // Stake tokeny
  const handleStake = async () => {
    try {
      setIsLoading(true);
      setError('');

      if (!validateStakeAmount(stakeAmount)) {
        throw new Error(`Minimum stake amount is ${formatUnits(MINIMUM_STAKE, 18)} $AIS`);
      }

      const contracts = await getContracts();
      if (!contracts) return;

      const { stakingContract } = contracts;
      const amount = parseUnits(stakeAmount, 18);
      
      // Sprawdź czy nie przekroczono limitu stakerów
      if (totalStakers >= 50) {
        throw new Error('Maximum number of stakers reached (50)');
      }

      const tx = await stakingContract.stake(amount);
      await tx.wait();
      await fetchData();
      setStakeAmount('');
    } catch (err: any) {
      console.error('Error staking tokens:', err);
      setError(err.message || 'Error staking tokens');
    } finally {
      setIsLoading(false);
    }
  };

  // Withdraw tokeny
  const handleWithdraw = async () => {
    try {
      setIsLoading(true);
      setError('');

      const contracts = await getContracts();
      if (!contracts) return;

      const { stakingContract } = contracts;
      const amount = parseUnits(withdrawAmount, 18);
      const tx = await stakingContract.withdraw(amount);
      await tx.wait();
      await fetchData();
      setWithdrawAmount('');
    } catch (err) {
      console.error('Error withdrawing tokens:', err);
      setError('Error withdrawing tokens');
    } finally {
      setIsLoading(false);
    }
  };

  // Claim nagrody
  const handleClaim = async () => {
    try {
      setIsLoading(true);
      setError('');

      const contracts = await getContracts();
      if (!contracts) return;

      const { stakingContract } = contracts;
      const tx = await stakingContract.getReward();
      await tx.wait();
      await fetchData();
    } catch (err) {
      console.error('Error claiming rewards:', err);
      setError('Error claiming rewards');
    } finally {
      setIsLoading(false);
    }
  };

  // Aktualizuj dane co 30 sekund
  useEffect(() => {
    if (isConnected && address) {
      fetchData();
      const interval = setInterval(fetchData, 30000);
      return () => clearInterval(interval);
    }
  }, [isConnected, address]);

  if (!isConnected) {
    return (
      <div className="text-center p-8">
        <p className="text-blue-400 text-lg">Please connect your wallet to use staking features</p>
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Staking Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="bg-[#1E2025] rounded-2xl p-6">
          <h3 className="text-xl font-bold text-blue-400 mb-4">Your Staking Stats</h3>
          <div className="space-y-4">
            <div>
              <p className="text-blue-300">Staked Amount</p>
              <p className="text-2xl font-bold text-blue-400 font-mono">
                {parseFloat(stakedAmount).toLocaleString()} $AIS
              </p>
            </div>
            <div>
              <p className="text-blue-300">Earned Rewards</p>
              <p className="text-2xl font-bold text-green-400 font-mono">
                {parseFloat(earnedRewards).toLocaleString()} $AIS
              </p>
            </div>
            <div>
              <p className="text-blue-300">Wallet Balance</p>
              <p className="text-2xl font-bold text-blue-400 font-mono">
                {parseFloat(walletBalance).toLocaleString()} $AIS
              </p>
            </div>
          </div>
        </div>

        <div className="bg-[#1E2025] rounded-2xl p-6">
          <h3 className="text-xl font-bold text-blue-400 mb-4">Staking Info</h3>
          <div className="space-y-4">
            <div>
              <p className="text-blue-300">Minimum Stake</p>
              <p className="text-xl font-bold text-blue-400 font-mono">
                {parseFloat(minimumStake).toLocaleString()} $AIS
              </p>
            </div>
            <div>
              <p className="text-blue-300">Minimum Staking Period</p>
              <p className="text-xl font-bold text-blue-400 font-mono">
                {Math.floor(parseInt(stakingPeriod) / 86400)} days
              </p>
            </div>
            <div>
              <p className="text-blue-300">Total Stakers</p>
              <p className="text-xl font-bold text-blue-400 font-mono">
                {totalStakers}/50
              </p>
            </div>
            <div>
              <p className="text-blue-300">Reward Rate</p>
              <p className="text-xl font-bold text-blue-400 font-mono">
                {rewardRate} $AIS/sec
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="space-y-6">
        {!isApproved ? (
          <div className="relative group">
            {/* Animated gradient border */}
            <div className="absolute -inset-0.5 bg-gradient-to-r from-[#00F0FF] via-[#FF00F5] to-[#0029FF] rounded-xl blur opacity-75 group-hover:opacity-100 animate-gradient-shift transition duration-1000 group-hover:duration-300"></div>
            
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleApprove}
              disabled={isLoading}
              className="relative w-full bg-gradient-to-br from-[#4b0082] via-[#9400d3] to-[#8a2be2] text-white py-4 rounded-xl font-bold text-lg transition-all duration-300 disabled:opacity-50 border border-[#8F00FF]/30 flex items-center justify-center gap-3 shadow-[0_0_15px_rgba(143,0,255,0.5)]"
            >
              <span className="text-2xl">🔒</span>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#00FFFF] via-[#FA00FF] to-[#00FFFF] animate-gradient-shift">
                {isLoading ? 'Approving...' : 'Approve Staking'}
              </span>
            </motion.button>
          </div>
        ) : (
          <>
            {/* Stake Section */}
            <div className="bg-[#1E2025] rounded-2xl p-6">
              <h3 className="text-xl font-bold text-blue-400 mb-4">Stake Tokens</h3>
              <div className="space-y-4">
                <div>
                  <input
                    type="number"
                    value={stakeAmount}
                    onChange={(e) => setStakeAmount(e.target.value)}
                    placeholder="Amount to stake"
                    className="w-full bg-[#2A2D36] text-blue-400 p-4 rounded-xl border border-blue-500/20 focus:outline-none focus:border-blue-500"
                  />
                  <p className="text-sm text-blue-400 mt-2">
                    Minimum stake: {parseFloat(minimumStake).toLocaleString()} $AIS
                  </p>
                </div>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleStake}
                  disabled={isLoading || !stakeAmount || !validateStakeAmount(stakeAmount)}
                  className="w-full bg-green-500 text-white py-4 rounded-xl font-bold text-lg hover:bg-green-600 transition-all duration-300 disabled:opacity-50"
                >
                  {isLoading ? 'Staking...' : 'Stake'}
                </motion.button>
              </div>
            </div>

            {/* Withdraw Section */}
            <div className="bg-[#1E2025] rounded-2xl p-6">
              <h3 className="text-xl font-bold text-blue-400 mb-4">Withdraw Tokens</h3>
              <div className="space-y-4">
                <div>
                  <input
                    type="number"
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    placeholder="Amount to withdraw"
                    className="w-full bg-[#2A2D36] text-blue-400 p-4 rounded-xl border border-blue-500/20 focus:outline-none focus:border-blue-500"
                  />
                  <p className="text-sm text-blue-400 mt-2">
                    Minimum staking period: {Math.floor(parseInt(stakingPeriod) / 86400)} days
                  </p>
                </div>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleWithdraw}
                  disabled={isLoading || !withdrawAmount || parseFloat(withdrawAmount) <= 0}
                  className="w-full bg-red-500 text-white py-4 rounded-xl font-bold text-lg hover:bg-red-600 transition-all duration-300 disabled:opacity-50"
                >
                  {isLoading ? 'Withdrawing...' : 'Withdraw'}
                </motion.button>
              </div>
            </div>

            {/* Claim Rewards */}
            <div className="bg-[#1E2025] rounded-2xl p-6">
              <h3 className="text-xl font-bold text-blue-400 mb-4">Claim Rewards</h3>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleClaim}
                disabled={isLoading || parseFloat(earnedRewards) <= 0}
                className="w-full bg-[#0052FF] text-white py-4 rounded-xl font-bold text-lg hover:bg-[#0052FF]/90 transition-all duration-300 disabled:opacity-50"
              >
                {isLoading ? 'Claiming...' : 'Claim Rewards'}
              </motion.button>
            </div>
          </>
        )}

        {error && (
          <div className="bg-[#1E2025] border border-[#00F0FF]/30 text-blue-400 p-6 rounded-xl mt-4 shadow-[0_0_10px_rgba(0,240,255,0.2)]">
            <h4 className="text-lg font-bold mb-2 text-transparent bg-clip-text bg-gradient-to-r from-[#00FFFF] via-[#FA00FF] to-[#00FFFF] animate-gradient-shift">Staking Contract Testing Phase</h4>
            <p className="mb-2">The staking contract is currently in development and not yet deployed to the mainnet.</p>
            <p>Once the contract is deployed and audited, the Approve Staking button will become fully functional.</p>
            <p className="mt-4 text-sm text-blue-300">Technical details: {error}</p>
          </div>
        )}
      </div>

      {/* CSS styles for animated gradients */}
      <style jsx global>{`
        @keyframes gradient-shift {
          0% { background-position: 0% 50% }
          50% { background-position: 100% 50% }
          100% { background-position: 0% 50% }
        }
        .animate-gradient-shift {
          background-size: 200% auto;
          animation: gradient-shift 3s linear infinite;
        }
      `}</style>
    </div>
  );
} 
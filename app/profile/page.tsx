'use client';

import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { base } from 'wagmi/chains';
import { IdentityCard } from '@coinbase/onchainkit/identity';
import { calculateRanking } from '../utils/ranking';
import IdentityComponent from '../components/Identity/Identity';

const BASESCAN_API_KEY = 'YB9ZQ71MVDJU3CQQXFJ6GQ4Y17MPKEQCBN';

interface Stats {
  transactions: number;
  tokens: number;
  nfts: number;
  contracts: number;
  transactionPoints: number;
  tokenPoints: number;
  nftPoints: number;
  contractPoints: number;
}

export default function ProfilePage() {
  const { address } = useAccount();
  const [stats, setStats] = useState<Stats>({
    transactions: 0,
    tokens: 0,
    nfts: 0,
    contracts: 0,
    transactionPoints: 0,
    tokenPoints: 0,
    nftPoints: 0,
    contractPoints: 0
  });

  useEffect(() => {
    async function fetchData() {
      if (!address) return;

      try {
        const [txResponse, nftResponse, tokenResponse] = await Promise.all([
          fetch(`https://api.basescan.org/api?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&sort=desc&apikey=${BASESCAN_API_KEY}`),
          fetch(`https://api.basescan.org/api?module=account&action=tokennfttx&address=${address}&apikey=${BASESCAN_API_KEY}`),
          fetch(`https://api.basescan.org/api?module=account&action=tokentx&address=${address}&apikey=${BASESCAN_API_KEY}`)
        ]);

        const [txData, nftData, tokenData] = await Promise.all([
          txResponse.json(),
          nftResponse.json(),
          tokenResponse.json()
        ]);

        const rankingStats = calculateRanking(
          txData.status === '1' ? txData.result : [],
          tokenData.status === '1' ? tokenData.result : [],
          nftData.status === '1' ? nftData.result : []
        );

        setStats({
          transactions: rankingStats.stats.transactions,
          tokens: rankingStats.stats.tokens,
          nfts: rankingStats.stats.nfts,
          contracts: rankingStats.stats.contracts,
          transactionPoints: rankingStats.breakdown.transactionPoints,
          tokenPoints: rankingStats.breakdown.tokenPoints,
          nftPoints: rankingStats.breakdown.nftPoints,
          contractPoints: rankingStats.breakdown.uniqueContractPoints
        });
      } catch (error) {
        console.error('Error fetching data:', error);
      }
    }

    if (address) {
      fetchData();
    }
  }, [address]);

  return (
    <div className="min-h-screen bg-black">
      {/* Matrix background effect */}
      <div className="fixed inset-0 bg-black opacity-90">
        <div className="absolute inset-0 bg-[url('/matrix.png')] opacity-10 animate-matrix"></div>
      </div>

      {/* Cyber grid background */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,82,255,0.1)_0%,transparent_70%)]"></div>
      <div className="absolute inset-0" style={{
        backgroundImage: 'linear-gradient(0deg, transparent 24%, rgba(0, 82, 255, 0.05) 25%, rgba(0, 82, 255, 0.05) 26%, transparent 27%, transparent 74%, rgba(0, 82, 255, 0.05) 75%, rgba(0, 82, 255, 0.05) 76%, transparent 77%, transparent), linear-gradient(90deg, transparent 24%, rgba(0, 82, 255, 0.05) 25%, rgba(0, 82, 255, 0.05) 26%, transparent 27%, transparent 74%, rgba(0, 82, 255, 0.05) 75%, rgba(0, 82, 255, 0.05) 76%, transparent 77%, transparent)',
        backgroundSize: '50px 50px'
      }}></div>

      {/* Glowing orbs */}
      <div className="absolute top-0 left-1/3 w-96 h-96 bg-[#0052FF]/20 rounded-full filter blur-3xl animate-pulse"></div>
      <div className="absolute top-1/2 left-1/4 w-80 h-80 bg-[#0052FF]/15 rounded-full filter blur-3xl animate-pulse delay-300"></div>
      <div className="absolute bottom-0 left-1/3 w-96 h-96 bg-[#0052FF]/10 rounded-full filter blur-3xl animate-pulse delay-200"></div>

      {/* Main content */}
      <div className="relative z-10">
        <div className="container mx-auto px-4 py-8">
          <IdentityComponent />
        </div>
      </div>
    </div>
  );
} 
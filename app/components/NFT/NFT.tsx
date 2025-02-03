'use client';

import { useState, useEffect } from 'react';
import { useAccount, useContractWrite, useTransaction } from 'wagmi';
import { parseEther } from 'viem';
import { NFTCard, NFTCardDefault, NFTMintCard, NFTMintCardDefault } from '@coinbase/onchainkit/nft';
import { NFTMedia, NFTTitle, NFTOwner, NFTLastSoldPrice, NFTNetwork } from '@coinbase/onchainkit/nft/view';
import { NFTCreator, NFTCollectionTitle, NFTQuantitySelector, NFTAssetCost, NFTMintButton } from '@coinbase/onchainkit/nft/mint';
import { motion, AnimatePresence } from 'framer-motion';

const BASESCAN_API_KEY = 'YB9ZQ71MVDJU3CQQXFJ6GQ4Y17MPKEQCBN';
const ITEMS_PER_PAGE = 15; // 3 columns x 5 rows

interface NFTMetadata {
  name?: string;
  description?: string;
  image?: string;
  attributes?: Array<{
    trait_type: string;
    value: string | number;
  }>;
  external_url?: string;
  animation_url?: string;
  background_color?: string;
  youtube_url?: string;
}

interface NFTData {
  contractAddress: string;
  tokenID: string;
  tokenName?: string;
  timeStamp: string;
  metadata?: NFTMetadata;
}

interface NFTTransaction {
  contractAddress: string;
  tokenID: string;
  tokenName: string;
  timeStamp: string;
}

const themes = [
  { id: 'base', name: 'Base', gradient: 'from-[#0052FF] via-[#1E4DD8] to-[#4C8FFF]' },
  { id: 'cyberpunk', name: 'Cyberpunk', gradient: 'from-[#FF00FF] via-[#FF00CC] to-[#FF0099]' },
  { id: 'hacker', name: 'Hacker', gradient: 'from-[#00FF00] via-[#00CC00] to-[#008800]' },
];

export default function NFTComponent() {
  const { address, isConnected } = useAccount();
  const [activeTab, setActiveTab] = useState<'view' | 'mint'>('mint');
  const [nfts, setNfts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [activeTheme, setActiveTheme] = useState(themes[0]);
  const [showAll, setShowAll] = useState(false);
  const [openFaqs, setOpenFaqs] = useState([false, false, false, false]);

  useEffect(() => {
    async function fetchNFTs() {
      if (!address) return;
      setLoading(true);

      try {
        const response = await fetch(
          `https://api.basescan.org/api?module=account&action=tokennfttx&address=${address}&apikey=${BASESCAN_API_KEY}`
        );
        const data = await response.json();

        if (data.status === '1' && Array.isArray(data.result)) {
          const uniqueNFTs = data.result.reduce((acc: NFTData[], tx: NFTTransaction) => {
            const key = `${tx.contractAddress}-${tx.tokenID}`;
            if (!acc.find(nft => `${nft.contractAddress}-${nft.tokenID}` === key)) {
              acc.push({
                contractAddress: tx.contractAddress,
                tokenID: tx.tokenID,
                tokenName: tx.tokenName,
                timeStamp: tx.timeStamp,
                metadata: undefined
              });
            }
            return acc;
          }, []);

          // Fetch metadata for each NFT
          const nftsWithMetadata = await Promise.all(
            uniqueNFTs.map(async (nft: NFTData) => {
              try {
                const metadataResponse = await fetch(
                  `https://api.basescan.org/api?module=token&action=tokenuri&contractaddress=${nft.contractAddress}&tokenid=${nft.tokenID}&apikey=${BASESCAN_API_KEY}`
                );
                const metadataData = await metadataResponse.json();
                
                if (metadataData.status === '1' && metadataData.result) {
                  try {
                    const metadata: NFTMetadata = await fetch(metadataData.result).then(res => res.json());
                    return { ...nft, metadata };
                  } catch (e) {
                    console.error('Error fetching metadata content:', e);
                    return nft;
                  }
                }
                return nft;
              } catch (e) {
                console.error('Error fetching metadata URI:', e);
                return nft;
              }
            })
          );

          nftsWithMetadata.sort((a: NFTData, b: NFTData) => Number(b.timeStamp) - Number(a.timeStamp));
          setNfts(nftsWithMetadata);
        }
      } catch (error) {
        console.error('Error fetching NFTs:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchNFTs();
  }, [address]);

  const filteredNfts = nfts
    .filter((nft) => nft.tokenName?.toLowerCase().includes(searchTerm.toLowerCase()))
    .sort((a, b) => {
      if (sortOrder === 'newest') {
        return Number(b.timeStamp) - Number(a.timeStamp);
      }
      return Number(a.timeStamp) - Number(b.timeStamp);
    });

  const displayedNfts = showAll ? filteredNfts : filteredNfts.slice(0, ITEMS_PER_PAGE);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1
    }
  };

  return (
    <div className="space-y-6">
      {/* Theme selector and tabs */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-8">
        <div className="flex justify-center space-x-6">
          <button
            onClick={() => setActiveTab('view')}
            className={`px-8 py-3 rounded-xl font-medium transition-all duration-300 transform hover:scale-105 hover:shadow-xl ${
              activeTab === 'view'
                ? `bg-gradient-to-r ${activeTheme.gradient} text-white shadow-lg`
                : `bg-black/50 backdrop-blur-xl border ${
                    activeTheme.id === 'base'
                      ? 'border-[#0052FF]/30 text-[#0052FF] hover:border-[#0052FF]/50'
                      : activeTheme.id === 'cyberpunk'
                      ? 'border-[#FF00FF]/30 text-[#FF00FF] hover:border-[#FF00FF]/50'
                      : 'border-[#00FF00]/30 text-[#00FF00] hover:border-[#00FF00]/50'
                  }`
            }`}
          >
            My NFTs
          </button>
          <button
            onClick={() => setActiveTab('mint')}
            className={`px-8 py-3 rounded-xl font-medium transition-all duration-300 transform hover:scale-105 hover:shadow-xl ${
              activeTab === 'mint'
                ? `bg-gradient-to-r ${activeTheme.gradient} text-white shadow-lg`
                : `bg-black/50 backdrop-blur-xl border ${
                    activeTheme.id === 'base'
                      ? 'border-[#0052FF]/30 text-[#0052FF] hover:border-[#0052FF]/50'
                      : activeTheme.id === 'cyberpunk'
                      ? 'border-[#FF00FF]/30 text-[#FF00FF] hover:border-[#FF00FF]/50'
                      : 'border-[#00FF00]/30 text-[#00FF00] hover:border-[#00FF00]/50'
                  }`
            }`}
          >
            Mint NFT
          </button>
        </div>
        
        {activeTab === 'view' && (
          <div className="flex items-center space-x-2">
            <span className={`${
              activeTheme.id === 'base'
                ? 'text-[#0052FF]'
                : activeTheme.id === 'cyberpunk'
                ? 'text-[#FF00FF]'
                : 'text-[#00FF00]'
            }`}>Theme:</span>
            <select
              value={activeTheme.id}
              onChange={(e) => setActiveTheme(themes.find(t => t.id === e.target.value) || themes[0])}
              className={`px-4 py-2 rounded-lg bg-black/50 backdrop-blur-xl border focus:ring-2 transition-all duration-300 ${
                activeTheme.id === 'base'
                  ? 'border-[#0052FF]/30 text-[#0052FF] focus:ring-[#0052FF]/50 focus:border-[#0052FF]/50'
                  : activeTheme.id === 'cyberpunk'
                  ? 'border-[#FF00FF]/30 text-[#FF00FF] focus:ring-[#FF00FF]/50 focus:border-[#FF00FF]/50'
                  : 'border-[#00FF00]/30 text-[#00FF00] focus:ring-[#00FF00]/50 focus:border-[#00FF00]/50'
              }`}
            >
              {themes.map((theme) => (
                <option key={theme.id} value={theme.id}>
                  {theme.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {activeTab === 'view' ? (
        <div>
          {loading ? (
            <div className="flex justify-center items-center min-h-[200px]">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#0052FF]"></div>
            </div>
          ) : (
            <>
              <div className="mb-6 flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <input
                    type="text"
                    placeholder="Search by name..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className={`w-full px-4 py-2 rounded-lg bg-black/50 backdrop-blur-xl border focus:ring-2 transition-all duration-300 ${
                      activeTheme.id === 'base'
                        ? 'border-[#0052FF]/30 text-[#0052FF] focus:ring-[#0052FF]/50 focus:border-[#0052FF]/50'
                        : activeTheme.id === 'cyberpunk'
                        ? 'border-[#FF00FF]/30 text-[#FF00FF] focus:ring-[#FF00FF]/50 focus:border-[#FF00FF]/50'
                        : 'border-[#00FF00]/30 text-[#00FF00] focus:ring-[#00FF00]/50 focus:border-[#00FF00]/50'
                    }`}
                  />
                </div>
                <div className="flex-none">
                  <select
                    value={sortOrder}
                    onChange={(e) => setSortOrder(e.target.value as 'newest' | 'oldest')}
                    className={`px-4 py-2 rounded-lg bg-black/50 backdrop-blur-xl border focus:ring-2 transition-all duration-300 ${
                      activeTheme.id === 'base'
                        ? 'border-[#0052FF]/30 text-[#0052FF] focus:ring-[#0052FF]/50 focus:border-[#0052FF]/50'
                        : activeTheme.id === 'cyberpunk'
                        ? 'border-[#FF00FF]/30 text-[#FF00FF] focus:ring-[#FF00FF]/50 focus:border-[#FF00FF]/50'
                        : 'border-[#00FF00]/30 text-[#00FF00] focus:ring-[#00FF00]/50 focus:border-[#00FF00]/50'
                    }`}
                  >
                    <option value="newest">Newest first</option>
                    <option value="oldest">Oldest first</option>
                  </select>
                </div>
              </div>

              <div className="relative">
                <div className={`absolute inset-0 bg-gradient-to-r ${
                  activeTheme.id === 'base'
                    ? 'from-transparent via-[#0052FF]/5 to-transparent'
                    : activeTheme.id === 'cyberpunk'
                    ? 'from-transparent via-[#FF00FF]/5 to-transparent'
                    : 'from-transparent via-[#00FF00]/5 to-transparent'
                }`}></div>
                <motion.div
                  variants={containerVariants}
                  initial="hidden"
                  animate="visible"
                  className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6"
                >
                  <AnimatePresence>
                    {displayedNfts.map((nft: NFTData) => (
                      <motion.div 
                        key={`${nft.contractAddress}-${nft.tokenID}`} 
                        variants={itemVariants}
                        className="aspect-square group relative"
                      >
                        <NFTCard
                          contractAddress={nft.contractAddress}
                          tokenId={nft.tokenID}
                          className={`h-full bg-black/50 backdrop-blur-xl rounded-xl overflow-hidden border transition-all duration-300 group-hover:scale-105 group-hover:shadow-xl ${
                            activeTheme.id === 'base'
                              ? 'border-[#0052FF]/30 group-hover:shadow-[#0052FF]/20'
                              : activeTheme.id === 'cyberpunk'
                              ? 'border-[#FF00FF]/30 group-hover:shadow-[#FF00FF]/20'
                              : 'border-[#00FF00]/30 group-hover:shadow-[#00FF00]/20'
                          }`}
                        >
                          <NFTMedia square={true} className="aspect-square object-cover" />
                          <div className="p-4">
                            <NFTTitle className="text-lg font-semibold text-gray-300" />
                            <NFTOwner className="text-sm text-gray-400" />
                            <NFTLastSoldPrice className={`text-sm font-medium ${
                              activeTheme.id === 'base'
                                ? 'text-[#0052FF]'
                                : activeTheme.id === 'cyberpunk'
                                ? 'text-[#FF00FF]'
                                : 'text-[#00FF00]'
                            }`} />
                            <NFTNetwork className="text-xs text-gray-500" />
                          </div>
                        </NFTCard>

                        {/* Hover Card */}
                        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-all duration-300 overflow-hidden rounded-xl">
                          {/* Rozmazane NFT w tle */}
                          <NFTCard
                            contractAddress={nft.contractAddress}
                            tokenId={nft.tokenID}
                            className="absolute inset-0"
                            theme={activeTheme.id}
                          >
                            <NFTMedia square={true} className="w-full h-full object-cover filter blur-sm opacity-70" />
                          </NFTCard>
                          
                          {/* Informacje ze świecącym tekstem */}
                          <div className="absolute inset-0 flex items-center justify-center">
                            <NFTCard
                              contractAddress={nft.contractAddress}
                              tokenId={nft.tokenID}
                              theme={activeTheme.id}
                            >
                              <div className="space-y-2">
                                <NFTTitle className={`text-lg font-bold ${
                                  activeTheme.id === 'base'
                                    ? 'text-[#0052FF] drop-shadow-[0_0_8px_rgba(0,82,255,0.8)]'
                                    : activeTheme.id === 'cyberpunk'
                                    ? 'text-[#FF00FF] drop-shadow-[0_0_8px_rgba(255,0,255,0.8)]'
                                    : 'text-[#00FF00] drop-shadow-[0_0_8px_rgba(0,255,0,0.7)]'
                                }`} />
                                <NFTOwner className={`text-sm ${
                                  activeTheme.id === 'base'
                                    ? 'text-[#0052FF] drop-shadow-[0_0_5px_rgba(0,82,255,0.6)]'
                                    : activeTheme.id === 'cyberpunk'
                                    ? 'text-[#FF00FF] drop-shadow-[0_0_5px_rgba(255,0,255,0.6)]'
                                    : 'text-[#00FF00] drop-shadow-[0_0_5px_rgba(0,255,0,0.6)]'
                                }`} />
                                <NFTLastSoldPrice className={`text-sm font-medium ${
                                  activeTheme.id === 'base'
                                    ? 'text-[#0052FF] drop-shadow-[0_0_5px_rgba(0,82,255,0.6)]'
                                    : activeTheme.id === 'cyberpunk'
                                    ? 'text-[#FF00FF] drop-shadow-[0_0_5px_rgba(255,0,255,0.6)]'
                                    : 'text-[#00FF00] drop-shadow-[0_0_5px_rgba(0,255,0,0.6)]'
                                }`} />
                                <NFTNetwork className={`text-sm ${
                                  activeTheme.id === 'base'
                                    ? 'text-[#0052FF]/90 drop-shadow-[0_0_5px_rgba(0,82,255,0.6)]'
                                    : activeTheme.id === 'cyberpunk'
                                    ? 'text-[#FF00FF]/90 drop-shadow-[0_0_5px_rgba(255,0,255,0.6)]'
                                    : 'text-[#00FF00]/90 drop-shadow-[0_0_5px_rgba(0,255,0,0.6)]'
                                }`} />
                                
                                <div className={`text-xs space-y-1 ${
                                  activeTheme.id === 'base'
                                    ? 'text-[#0052FF] drop-shadow-[0_0_5px_rgba(0,82,255,0.6)]'
                                    : activeTheme.id === 'cyberpunk'
                                    ? 'text-[#FF00FF] drop-shadow-[0_0_5px_rgba(255,0,255,0.6)]'
                                    : 'text-[#00FF00] drop-shadow-[0_0_5px_rgba(0,255,0,0.6)]'
                                } pt-2`}>
                                  <div>Contract: {nft.contractAddress}</div>
                                  <div>Token ID: {nft.tokenID}</div>
                                  <div>Minted: {new Date(Number(nft.timeStamp) * 1000).toLocaleDateString()}</div>
                                </div>
                              </div>
                            </NFTCard>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </motion.div>
              </div>

              {filteredNfts.length > ITEMS_PER_PAGE && (
                <div className="mt-8 text-center">
                  <button
                    onClick={() => setShowAll(!showAll)}
                    className={`px-8 py-3 rounded-xl font-medium transition-all duration-300 transform hover:scale-105 hover:shadow-xl bg-black/50 backdrop-blur-xl border ${
                      activeTheme.id === 'base'
                        ? 'border-[#0052FF]/30 text-[#0052FF] hover:border-[#0052FF]/50'
                        : activeTheme.id === 'cyberpunk'
                        ? 'border-[#FF00FF]/30 text-[#FF00FF] hover:border-[#FF00FF]/50'
                        : 'border-[#00FF00]/30 text-[#00FF00] hover:border-[#00FF00]/50'
                    }`}
                  >
                    {showAll ? 'Show Less' : 'Show More'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <>
          {/* Collection info */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
            <motion.div 
              initial={{ opacity: 0, x: -50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6 }}
              className={`cyber-card bg-black/50 backdrop-blur-xl rounded-xl p-6 border shadow-lg transition-all duration-300 ${
                activeTheme.id === 'base'
                  ? 'border-[#0052FF]/30 shadow-[0_0_15px_rgba(0,82,255,0.3)] hover:shadow-[0_0_30px_rgba(0,82,255,0.5)]'
                  : activeTheme.id === 'cyberpunk'
                  ? 'border-[#FF00FF]/30 shadow-[0_0_15px_rgba(255,0,255,0.3)] hover:shadow-[0_0_30px_rgba(255,0,255,0.5)]'
                  : 'border-[#00FF00]/30 shadow-[0_0_15px_rgba(0,255,0,0.3)] hover:shadow-[0_0_30px_rgba(0,255,0,0.5)]'
              }`}
              style={{ fontFamily: '"Share Tech Mono", monospace' }}
            >
              <div className={`text-xl font-bold mb-2 cyber-glitch ${
                activeTheme.id === 'base'
                  ? 'text-[#0052FF]'
                  : activeTheme.id === 'cyberpunk'
                  ? 'text-[#FF00FF]'
                  : 'text-[#00FF00]'
              }`}>SPHERE Pioneer</div>
              <p className="text-[#4C8FFF] text-sm">
                Your gateway to the SPHERE universe. As a Pioneer, you gain access to core platform features, exclusive events, and future rewards. Begin your journey in the SPHERE ecosystem and shape the future of decentralized innovation.
              </p>
              <div className={`absolute -bottom-1 left-0 w-full h-1 bg-gradient-to-r from-transparent ${
                activeTheme.id === 'base'
                  ? 'via-[#0052FF]'
                  : activeTheme.id === 'cyberpunk'
                  ? 'via-[#FF00FF]'
                  : 'via-[#00FF00]'
              } to-transparent`}></div>
            </motion.div>
            
            <motion.div 
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className={`cyber-card bg-black/50 backdrop-blur-xl rounded-xl p-6 border shadow-lg transition-all duration-300 ${
                activeTheme.id === 'base'
                  ? 'border-[#0052FF]/30 shadow-[0_0_15px_rgba(0,82,255,0.3)] hover:shadow-[0_0_30px_rgba(0,82,255,0.5)]'
                  : activeTheme.id === 'cyberpunk'
                  ? 'border-[#FF00FF]/30 shadow-[0_0_15px_rgba(255,0,255,0.3)] hover:shadow-[0_0_30px_rgba(255,0,255,0.5)]'
                  : 'border-[#00FF00]/30 shadow-[0_0_15px_rgba(0,255,0,0.3)] hover:shadow-[0_0_30px_rgba(0,255,0,0.5)]'
              }`}
              style={{ fontFamily: '"Share Tech Mono", monospace' }}
            >
              <div className={`text-xl font-bold mb-2 cyber-glitch ${
                activeTheme.id === 'base'
                  ? 'text-[#0052FF]'
                  : activeTheme.id === 'cyberpunk'
                  ? 'text-[#FF00FF]'
                  : 'text-[#00FF00]'
              }`}>SPHERE Guardian</div>
              <p className="text-[#4C8FFF] text-sm">
                Guardian of the SPHERE ecosystem. This tier unlocks advanced features, priority access to new functionalities, and special rewards. Join an elite group of Guardians and help protect and grow the network.
              </p>
              <div className={`absolute -bottom-1 left-0 w-full h-1 bg-gradient-to-r from-transparent ${
                activeTheme.id === 'base'
                  ? 'via-[#0052FF]'
                  : activeTheme.id === 'cyberpunk'
                  ? 'via-[#FF00FF]'
                  : 'via-[#00FF00]'
              } to-transparent`}></div>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className={`cyber-card bg-black/50 backdrop-blur-xl rounded-xl p-6 border shadow-lg transition-all duration-300 ${
                activeTheme.id === 'base'
                  ? 'border-[#0052FF]/30 shadow-[0_0_15px_rgba(0,82,255,0.3)] hover:shadow-[0_0_30px_rgba(0,82,255,0.5)]'
                  : activeTheme.id === 'cyberpunk'
                  ? 'border-[#FF00FF]/30 shadow-[0_0_15px_rgba(255,0,255,0.3)] hover:shadow-[0_0_30px_rgba(255,0,255,0.5)]'
                  : 'border-[#00FF00]/30 shadow-[0_0_15px_rgba(0,255,0,0.3)] hover:shadow-[0_0_30px_rgba(0,255,0,0.5)]'
              }`}
              style={{ fontFamily: '"Share Tech Mono", monospace' }}
            >
              <div className={`text-xl font-bold mb-2 cyber-glitch ${
                activeTheme.id === 'base'
                  ? 'text-[#0052FF]'
                  : activeTheme.id === 'cyberpunk'
                  ? 'text-[#FF00FF]'
                  : 'text-[#00FF00]'
              }`}>SPHERE Master</div>
              <p className="text-[#4C8FFF] text-sm">
                The highest tier in the SPHERE hierarchy. As a Master, you receive full access to all features, exclusive VIP privileges, participation in key decisions, and maximum rewards. Become a SPHERE legend.
              </p>
              <div className={`absolute -bottom-1 left-0 w-full h-1 bg-gradient-to-r from-transparent ${
                activeTheme.id === 'base'
                  ? 'via-[#0052FF]'
                  : activeTheme.id === 'cyberpunk'
                  ? 'via-[#FF00FF]'
                  : 'via-[#00FF00]'
              } to-transparent`}></div>
            </motion.div>
          </div>

          {/* NFT Minting Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* SPHERE Pioneer */}
            <div className="group relative">
              <div className="absolute -inset-[1px] bg-gradient-to-r from-[#0052FF]/50 via-[#4C8FFF]/50 to-[#0052FF]/50 rounded-xl blur-md group-hover:blur-xl transition-all duration-300 opacity-20 group-hover:opacity-30"></div>
              <NFTMintCard 
                contractAddress="0x8edb8B2383f41e14b49414dd32c4A786Ed2e277d"
                className="relative bg-black/50 backdrop-blur-xl rounded-xl overflow-hidden border border-[#0052FF]/30 transition-all duration-300 group-hover:border-[#0052FF]/50 group-hover:shadow-xl group-hover:shadow-[#0052FF]/20"
              > 
                <NFTCreator className="font-['Share_Tech_Mono']" />
                <NFTMedia className="aspect-square object-cover" />
                <NFTCollectionTitle className="font-['Share_Tech_Mono'] text-[#0052FF]" />
                <NFTQuantitySelector className="font-['Share_Tech_Mono']" />
                <NFTAssetCost className="font-['Share_Tech_Mono'] text-[#0052FF]" />
                <NFTMintButton 
                  className="!bg-transparent !text-[#0052FF] !border-2 !border-[#0052FF] hover:!bg-[#0052FF]/10 font-semibold px-6 py-3 rounded-xl transform -translate-x-[2px] -translate-y-[2px] transition-all duration-300 shadow-[4px_4px_0_#0052FF] hover:shadow-[8px_8px_0_#0052FF] hover:-translate-x-[4px] hover:-translate-y-[4px] active:shadow-none active:translate-x-0 active:translate-y-0"
                  disabled={false}
                  pendingOverride="Transaction in progress..."
                  successOverride="Success!"
                  errorOverride="Transaction failed"
                />
              </NFTMintCard>
            </div>

            {/* SPHERE Guardian */}
            <div className="group relative">
              <div className="absolute -inset-[1px] bg-gradient-to-r from-[#0052FF]/50 via-[#4C8FFF]/50 to-[#0052FF]/50 rounded-xl blur-md group-hover:blur-xl transition-all duration-300 opacity-20 group-hover:opacity-30"></div>
              <NFTMintCard 
                contractAddress="0x4087EFD20F2A91ADeAa2b7259F61d04d1e5B233E"
                className="relative bg-black/50 backdrop-blur-xl rounded-xl overflow-hidden border border-[#0052FF]/30 transition-all duration-300 group-hover:border-[#0052FF]/50 group-hover:shadow-xl group-hover:shadow-[#0052FF]/20"
              > 
                <NFTCreator className="font-['Share_Tech_Mono']" />
                <NFTMedia className="aspect-square object-cover" />
                <NFTCollectionTitle className="font-['Share_Tech_Mono'] text-[#0052FF]" />
                <NFTQuantitySelector className="font-['Share_Tech_Mono']" />
                <NFTAssetCost className="font-['Share_Tech_Mono'] text-[#0052FF]" />
                <NFTMintButton 
                  className="!bg-transparent !text-[#0052FF] !border-2 !border-[#0052FF] hover:!bg-[#0052FF]/10 font-semibold px-6 py-3 rounded-xl transform -translate-x-[2px] -translate-y-[2px] transition-all duration-300 shadow-[4px_4px_0_#0052FF] hover:shadow-[8px_8px_0_#0052FF] hover:-translate-x-[4px] hover:-translate-y-[4px] active:shadow-none active:translate-x-0 active:translate-y-0"
                  disabled={false}
                  pendingOverride="Transaction in progress..."
                  successOverride="Success!"
                  errorOverride="Transaction failed"
                />
              </NFTMintCard>
            </div>

            {/* SPHERE Master */}
            <div className="group relative">
              <div className="absolute -inset-[1px] bg-gradient-to-r from-[#0052FF]/50 via-[#4C8FFF]/50 to-[#0052FF]/50 rounded-xl blur-md group-hover:blur-xl transition-all duration-300 opacity-20 group-hover:opacity-30"></div>
              <NFTMintCard 
                contractAddress="0x6d55153A6B1d1157f19D403DEd541fbe6De48C5A"
                className="relative bg-black/50 backdrop-blur-xl rounded-xl overflow-hidden border border-[#0052FF]/30 transition-all duration-300 group-hover:border-[#0052FF]/50 group-hover:shadow-xl group-hover:shadow-[#0052FF]/20"
              > 
                <NFTCreator className="font-['Share_Tech_Mono']" />
                <NFTMedia className="aspect-square object-cover" />
                <NFTCollectionTitle className="font-['Share_Tech_Mono'] text-[#0052FF]" />
                <NFTQuantitySelector className="font-['Share_Tech_Mono']" />
                <NFTAssetCost className="font-['Share_Tech_Mono'] text-[#0052FF]" />
                <NFTMintButton 
                  className="!bg-transparent !text-[#0052FF] !border-2 !border-[#0052FF] hover:!bg-[#0052FF]/10 font-semibold px-6 py-3 rounded-xl transform -translate-x-[2px] -translate-y-[2px] transition-all duration-300 shadow-[4px_4px_0_#0052FF] hover:shadow-[8px_8px_0_#0052FF] hover:-translate-x-[4px] hover:-translate-y-[4px] active:shadow-none active:translate-x-0 active:translate-y-0"
                  disabled={false}
                  pendingOverride="Transaction in progress..."
                  successOverride="Success!"
                  errorOverride="Transaction failed"
                />
              </NFTMintCard>
            </div>
          </div>

          {/* FAQ Section */}
          <div className="mt-20 max-w-3xl mx-auto">
            <h2 className="text-3xl font-['Share_Tech_Mono'] text-center text-[#0052FF] mb-10">
              Frequently Asked Questions
            </h2>
            
            <div className="space-y-4">
              {[
                {
                  question: "What are SPHERE NFTs?",
                  answer: "SPHERE NFTs are unique digital assets that provide different levels of access and benefits within the SPHERE ecosystem. Each tier (Pioneer, Guardian, and Master) offers increasing privileges and rewards."
                },
                {
                  question: "How do I mint a SPHERE NFT?",
                  answer: "To mint a SPHERE NFT, connect your wallet, select your desired tier, and click the mint button. Make sure you have enough ETH in your wallet to cover the minting cost and gas fees."
                },
                {
                  question: "What benefits do SPHERE NFTs provide?",
                  answer: "Each SPHERE NFT tier offers unique benefits. Pioneer NFTs provide basic access and future rewards, Guardian NFTs unlock enhanced features and exclusive events, while Master NFTs grant full access to all features and VIP privileges."
                },
                {
                  question: "Can I trade my SPHERE NFTs?",
                  answer: "Yes, SPHERE NFTs can be traded on supported NFT marketplaces. However, remember that the benefits and access levels are tied to the NFT ownership, so selling your NFT will transfer these privileges to the new owner."
                }
              ].map((item, index) => (
                <motion.div 
                  key={index}
                  className="group -mt-2 first:mt-0"
                  initial={false}
                >
                  <motion.div 
                    className={`bg-black/50 backdrop-blur-xl rounded-xl border overflow-hidden transition-all duration-300 relative ${
                      openFaqs[index] 
                        ? 'border-[#0052FF] shadow-lg shadow-[#0052FF]/20 z-10' 
                        : 'border-[#0052FF]/30 hover:border-[#0052FF]/50'
                    }`}
                  >
                    <button 
                      onClick={() => {
                        const newOpenStates = [...openFaqs];
                        for (let i = 0; i < newOpenStates.length; i++) {
                          newOpenStates[i] = i === index ? !newOpenStates[i] : false;
                        }
                        setOpenFaqs(newOpenStates);
                      }}
                      className="w-full px-6 py-4 flex items-center justify-between text-left group"
                    >
                      <span className={`font-['Share_Tech_Mono'] transition-colors duration-300 ${
                        openFaqs[index] ? 'text-[#0052FF]' : 'text-white group-hover:text-[#0052FF]/80'
                      }`}>
                        {item.question}
                      </span>
                      <span className={`text-[#0052FF] transition-transform duration-300 ${
                        openFaqs[index] ? 'rotate-180' : ''
                      }`}>▼</span>
                    </button>
                    <motion.div 
                      initial={false}
                      animate={{
                        height: openFaqs[index] ? 'auto' : 0,
                        opacity: openFaqs[index] ? 1 : 0
                      }}
                      transition={{
                        duration: 0.3,
                        ease: "easeInOut"
                      }}
                      className="overflow-hidden"
                    >
                      <div className="px-6 pb-4 text-gray-400 font-['Share_Tech_Mono']">
                        {item.answer}
                      </div>
                    </motion.div>
                  </motion.div>
                </motion.div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
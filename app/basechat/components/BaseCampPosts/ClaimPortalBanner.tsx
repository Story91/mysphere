import React, { useState, useEffect, useCallback } from 'react';
import { useAccount, useContractRead, useWalletClient, usePublicClient, useChainId, useSwitchChain } from 'wagmi';
import { toast } from 'react-hot-toast';
import { baseCampChain } from '../../../contracts/BaseCampPostContract';
import { describeWalletError } from '../../../components/useTxFeedback';

// Kontrakt nie ma gornego limitu; ta liczba istnieje tylko po to, zeby UI
// mialo co pokazac, gdyby limit kiedys wrocil.
const CLAIM_SUPPLY_CAP = 999999;

const PORTAL_NFT_ADDRESS = "0x57CC99c9E1942a34a0cfF7FCC27c227455f14587";
const PORTAL_NFT_ABI = [{"inputs":[],"stateMutability":"nonpayable","type":"constructor"},{"inputs":[{"internalType":"address","name":"sender","type":"address"},{"internalType":"uint256","name":"balance","type":"uint256"},{"internalType":"uint256","name":"needed","type":"uint256"},{"internalType":"uint256","name":"tokenId","type":"uint256"}],"name":"ERC1155InsufficientBalance","type":"error"},{"inputs":[{"internalType":"address","name":"approver","type":"address"}],"name":"ERC1155InvalidApprover","type":"error"},{"inputs":[{"internalType":"uint256","name":"idsLength","type":"uint256"},{"internalType":"uint256","name":"valuesLength","type":"uint256"}],"name":"ERC1155InvalidArrayLength","type":"error"},{"inputs":[{"internalType":"address","name":"operator","type":"address"}],"name":"ERC1155InvalidOperator","type":"error"},{"inputs":[{"internalType":"address","name":"receiver","type":"address"}],"name":"ERC1155InvalidReceiver","type":"error"},{"inputs":[{"internalType":"address","name":"sender","type":"address"}],"name":"ERC1155InvalidSender","type":"error"},{"inputs":[{"internalType":"address","name":"operator","type":"address"},{"internalType":"address","name":"owner","type":"address"}],"name":"ERC1155MissingApprovalForAll","type":"error"},{"inputs":[{"internalType":"address","name":"owner","type":"address"}],"name":"OwnableInvalidOwner","type":"error"},{"inputs":[{"internalType":"address","name":"account","type":"address"}],"name":"OwnableUnauthorizedAccount","type":"error"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"account","type":"address"},{"indexed":true,"internalType":"address","name":"operator","type":"address"},{"indexed":false,"internalType":"bool","name":"approved","type":"bool"}],"name":"ApprovalForAll","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"previousOwner","type":"address"},{"indexed":true,"internalType":"address","name":"newOwner","type":"address"}],"name":"OwnershipTransferred","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"operator","type":"address"},{"indexed":true,"internalType":"address","name":"from","type":"address"},{"indexed":true,"internalType":"address","name":"to","type":"address"},{"indexed":false,"internalType":"uint256[]","name":"ids","type":"uint256[]"},{"indexed":false,"internalType":"uint256[]","name":"values","type":"uint256[]"}],"name":"TransferBatch","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"operator","type":"address"},{"indexed":true,"internalType":"address","name":"from","type":"address"},{"indexed":true,"internalType":"address","name":"to","type":"address"},{"indexed":false,"internalType":"uint256","name":"id","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"value","type":"uint256"}],"name":"TransferSingle","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"string","name":"value","type":"string"},{"indexed":true,"internalType":"uint256","name":"id","type":"uint256"}],"name":"URI","type":"event"},{"inputs":[],"name":"TOKEN_ID","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"account","type":"address"},{"internalType":"uint256","name":"id","type":"uint256"}],"name":"balanceOf","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address[]","name":"accounts","type":"address[]"},{"internalType":"uint256[]","name":"ids","type":"uint256[]"}],"name":"balanceOfBatch","outputs":[{"internalType":"uint256[]","name":"","type":"uint256[]"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"claim","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"","type":"address"}],"name":"hasClaimed","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"account","type":"address"},{"internalType":"address","name":"operator","type":"address"}],"name":"isApprovedForAll","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"maxSupply","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"name","outputs":[{"internalType":"string","name":"","type":"string"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"owner","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"renounceOwnership","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"from","type":"address"},{"internalType":"address","name":"to","type":"address"},{"internalType":"uint256[]","name":"ids","type":"uint256[]"},{"internalType":"uint256[]","name":"values","type":"uint256[]"},{"internalType":"bytes","name":"data","type":"bytes"}],"name":"safeBatchTransferFrom","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"from","type":"address"},{"internalType":"address","name":"to","type":"address"},{"internalType":"uint256","name":"id","type":"uint256"},{"internalType":"uint256","name":"value","type":"uint256"},{"internalType":"bytes","name":"data","type":"bytes"}],"name":"safeTransferFrom","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"operator","type":"address"},{"internalType":"bool","name":"approved","type":"bool"}],"name":"setApprovalForAll","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"string","name":"newuri","type":"string"}],"name":"setURI","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"bytes4","name":"interfaceId","type":"bytes4"}],"name":"supportsInterface","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"symbol","outputs":[{"internalType":"string","name":"","type":"string"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"totalClaimed","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"newOwner","type":"address"}],"name":"transferOwnership","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"","type":"uint256"}],"name":"uri","outputs":[{"internalType":"string","name":"","type":"string"}],"stateMutability":"view","type":"function"}];

// Interface for NFT metadata
interface NFTMetadata {
  name: string;
  description: string;
  image: string;
  attributes?: Array<{
    trait_type: string;
    value: string | number;
  }>;
}

// Fixed NFT metadata for preview
const fixedNFTMetadata: NFTMetadata = {
  "name": "MySphere X CampNetwork",
  "description": "Exclusive NFT for the MySphere X Camp community members",
  "image": "/MSxCAMP.png",
  "attributes": [
    {"trait_type":"Collection","value":"MySphere X"},
    {"trait_type":"Edition","value":"Limited"},
    {"trait_type":"Network","value":"Camp"},
    {"trait_type":"Floor Price","value":"10 $CAMP"}
  ]
};

const ClaimPortalBanner = () => {
  const [showBanner, setShowBanner] = useState(true);
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const { switchChainAsync } = useSwitchChain();
  const [totalClaimed, setTotalClaimed] = useState(0);
  const [claimed, setClaimed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  // Check if we're on BaseCamp network
  const isBaseCampNetwork = chainId === baseCampChain.id;

  // Check if user has already claimed the NFT
  const { data: hasClaimedData } = useContractRead({
    address: PORTAL_NFT_ADDRESS,
    abi: PORTAL_NFT_ABI,
    functionName: 'hasClaimed',
    args: [address],
    chainId: baseCampChain.id,
  });

  // Get total claimed NFTs
  const { data: totalClaimedData } = useContractRead({
    address: PORTAL_NFT_ADDRESS,
    abi: PORTAL_NFT_ABI,
    functionName: 'totalClaimed',
    chainId: baseCampChain.id,
  });

  // Update states when data is loaded
  useEffect(() => {
    if (hasClaimedData !== undefined) {
      setClaimed(!!hasClaimedData);
    }

    if (totalClaimedData) {
      setTotalClaimed(Number(totalClaimedData));
    }
  }, [hasClaimedData, totalClaimedData]);

  // Show NFT preview - simplified to prevent re-renders
  const handleShowPreview = useCallback(() => {
    // Only try to switch network when claiming, not when previewing
    setShowPreviewModal(true);
  }, []);

  // Handle claim function with proper wagmi v2 pattern
  const handleClaim = useCallback(async () => {
    if (!isConnected || !address || claimed || isLoading) {
      return;
    }

    if (!walletClient || !publicClient) {
      toast.error('Wallet not connected properly');
      return;
    }

    // Toast `loading` nie znika sam - bez zdjecia po ID zostawal na ekranie
    // obok komunikatu o sukcesie albo bledzie.
    let loadingToastId: string | undefined;

    try {
      setIsLoading(true);
      loadingToastId = toast.loading('Preparing to purchase NFT...');

      // `switchChainAsync`, nie `switchChain`: ta druga to mutacja bez promisy,
      // wiec `catch` ponizej nigdy sie nie wykonywal, a "Switched to Camp
      // Network" pokazywalo sie nawet po odmowie w portfelu.
      if (!isBaseCampNetwork) {
        try {
          await switchChainAsync({ chainId: baseCampChain.id });
          toast.success('Switched to Camp Network');
        } catch (switchError) {
          console.error('Failed to switch network:', switchError);
          toast.error('Please switch to Camp Network manually');
          return;
        }
      }

      // Format the address properly
      const formattedAddress = PORTAL_NFT_ADDRESS.startsWith('0x') 
        ? PORTAL_NFT_ADDRESS as `0x${string}` 
        : `0x${PORTAL_NFT_ADDRESS}` as `0x${string}`;

      // Prepare transaction request using public client
      const { request } = await publicClient.simulateContract({
        address: formattedAddress,
        abi: PORTAL_NFT_ABI,
        functionName: 'claim',
        args: [],
        account: address,
        chain: baseCampChain,
      });

      // Send transaction using wallet client
      const txHash = await walletClient.writeContract({
        ...request,
        chain: baseCampChain,
      });
      
      toast.success('Purchase transaction sent!');

      setClaimed(true);

      // Close the preview modal
      setShowPreviewModal(false);

    } catch (error) {
      console.error('Purchase transaction error:', error);
      const info = describeWalletError(error, {
        network: 'Camp Network',
        gasSymbol: baseCampChain.nativeCurrency.symbol,
      });
      // Odmowa w portfelu to nie awaria - nie straszymy czerwonym bledem.
      if (info.isFailure) {
        toast.error('Failed to purchase NFT: ' + info.message);
      } else {
        toast(info.message);
      }
    } finally {
      if (loadingToastId) toast.dismiss(loadingToastId);
      setIsLoading(false);
    }
  }, [
    isConnected,
    address,
    claimed,
    isLoading,
    walletClient,
    publicClient,
    isBaseCampNetwork,
    switchChainAsync
  ]);

  if (!showBanner) {
    return null;
  }

  // Modal renderowany inline. Wczesniej byl komponentem definiowanym w ciele
  // rendera, wiec przy kazdym renderze React dostawal NOWY typ komponentu
  // i przemontowywal caly modal od zera - stad migotanie, ktore probowano
  // leczyc komentarzem "simplified to prevent flickering".
  const previewModal = showPreviewModal ? (
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50"
           onClick={() => setShowPreviewModal(false)}>
        <div
          role="dialog"
          aria-modal="true"
          aria-label={fixedNFTMetadata.name}
          className="bg-gradient-to-r from-black/90 to-orange-700/90 p-6 rounded-xl max-w-md w-full mx-4 shadow-2xl border border-orange-500/30"
          onClick={e => e.stopPropagation()}
        >
          <div className="text-center mb-4">
            <h2 className="text-xl font-bold text-white">{fixedNFTMetadata.name}</h2>
            <p className="text-orange-200 text-sm mt-1">{fixedNFTMetadata.description}</p>
          </div>
          
          <div className="relative w-full aspect-square mb-4 overflow-hidden rounded-lg shadow-xl border-2 border-orange-500/50 bg-black/50">
            <img 
              src="/MSxCAMP.png"
              alt={fixedNFTMetadata.name}
              className="w-full h-full object-cover"
            />
          </div>
          
          {fixedNFTMetadata.attributes && fixedNFTMetadata.attributes.length > 0 && (
            <div className="mb-4">
              <h3 className="text-white font-medium mb-2">Attributes</h3>
              <div className="grid grid-cols-2 gap-2">
                {fixedNFTMetadata.attributes.map((attr, idx) => (
                  <div key={idx} className="bg-black/50 p-2 rounded-md">
                    <div className="text-orange-300 text-xs">{attr.trait_type}</div>
                    <div className="text-white font-medium">{attr.value}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          <div className="flex space-x-3 justify-center mt-4">
            <button
              type="button"
              onClick={() => setShowPreviewModal(false)}
              className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleClaim}
              disabled={isLoading}
              className={`px-6 py-2 ${
                isLoading 
                  ? "bg-orange-800" 
                  : "bg-orange-600 hover:bg-orange-500"
              } text-white rounded-lg font-medium transition-colors`}
            >
              {isLoading ? "Processing..." : "Confirm Purchase"}
            </button>
          </div>
        </div>
      </div>
  ) : null;

  return (
    <>
      <div className="w-full p-4 mb-6 rounded-lg bg-gradient-to-r from-black via-orange-800 to-orange-600 text-white">
        <div className="flex flex-col sm:flex-row items-center justify-between">
          <div className="mb-4 sm:mb-0 text-center sm:text-left">
            <h3 className="text-lg font-bold mb-1">
              Get your PORTAL NFT on Camp Network Mainnet
            </h3>
            <p className="text-sm text-orange-100">
              Post for free, get exclusive PORTAL NFT for 10 $CAMP
            </p>
            <div className="w-full mt-2">
              <div className="flex justify-between text-xs text-white mb-1">
                <span>Progress</span>
                <span>{totalClaimed} / ∞ claimed</span>
              </div>
              <div className="w-full bg-gray-800 rounded-full h-2">
                <div 
                  className="bg-orange-400 h-2 rounded-full" 
                  style={{ width: `${Math.min((totalClaimed / 100) * 100, 100)}%` }}
                ></div>
              </div>
            </div>
          </div>
          
          <div className="flex flex-col items-center">
            {!isConnected ? (
              <div className="text-white text-center mb-2 text-sm">Connect wallet to claim</div>
            ) : claimed ? (
              <div className="px-4 py-2 bg-green-500 text-white rounded text-sm font-medium">
                Already Claimed ✓
              </div>
            ) : totalClaimed >= CLAIM_SUPPLY_CAP ? (
              <div className="px-4 py-2 bg-gray-500 text-white rounded text-sm font-medium">
                All NFTs Claimed
              </div>
            ) : (
              <button
                type="button"
                onClick={handleShowPreview}
                disabled={isLoading}
                className={`px-4 py-2 ${
                  isLoading 
                    ? "bg-gray-500" 
                    : "bg-white hover:bg-orange-100"
                } text-orange-800 rounded text-sm font-medium transition duration-200`}
              >
                {isLoading ? "Processing..." : "10 $CAMP"}
              </button>
            )}
            
            <button
              type="button"
              onClick={() => setShowBanner(false)}
              className="mt-3 text-xs text-orange-200 underline"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
      
      {/* NFT Preview Modal */}
      {previewModal}
    </>
  );
};

export default ClaimPortalBanner; 
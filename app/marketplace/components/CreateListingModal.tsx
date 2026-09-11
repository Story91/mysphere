"use client";

import { useEffect, useMemo, useState } from 'react';
import { useAccount } from 'wagmi';
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { toast } from 'react-hot-toast';
import { MARKETPLACE_ADDRESS, MARKETPLACE_ABI, DEFAULT_IP_NFT_CONTRACT, LICENSE_PRESETS } from '../config/simpleMarketplace';
import { createCampPublicClient } from '../config/campClient';
import { parseEther } from 'viem';
import { fetchIpNftsFor } from '../../mycamp/api/fetchIpNfts';

interface CreateListingModalProps {
  onClose: () => void;
  prefillTokenId?: string;
}

export default function CreateListingModal({ onClose, prefillTokenId }: CreateListingModalProps) {
  const { address } = useAccount();
  const [tokenId, setTokenId] = useState(prefillTokenId || '');
  const [nftContract, setNftContract] = useState<string>('');
  const [price, setPrice] = useState('');
  const [royaltyPercent, setRoyaltyPercent] = useState('5');
  const [commercialUse, setCommercialUse] = useState(false);
  const [derivativeWorks, setDerivativeWorks] = useState(false);
  const [licenseDuration, setLicenseDuration] = useState('0'); // 0 = permanent
  const [allowAccess, setAllowAccess] = useState(false);
  const [accessPrice, setAccessPrice] = useState('');
  const [accessDuration, setAccessDuration] = useState('30'); // days
  const [selectedPreset, setSelectedPreset] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const { writeContract, data: txHash, isPending } = useWriteContract();
  const { writeContract: writeUpdateTerms, data: updateTermsHash } = useWriteContract();
  const { isLoading: isConfirming, isSuccess, isError: isTxError, error: txError } = useWaitForTransactionReceipt({ hash: txHash });
  const { isLoading: isSavingTerms, isSuccess: saveTermsSuccess, isError: saveTermsError, error: saveTermsErrorObj } = useWaitForTransactionReceipt({ hash: updateTermsHash });
  const [myNfts, setMyNfts] = useState<any[]>([]);
  const [loadingNfts, setLoadingNfts] = useState(true);

  // ERC721 minimal ABI for checks/approve
  const ERC721_ABI = [
    { name: 'ownerOf', type: 'function', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'address' }] },
    { name: 'getApproved', type: 'function', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'address' }] },
    { name: 'isApprovedForAll', type: 'function', stateMutability: 'view', inputs: [{ type: 'address' }, { type: 'address' }], outputs: [{ type: 'bool' }] },
    { name: 'approve', type: 'function', stateMutability: 'nonpayable', inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [] },
    { name: 'setApprovalForAll', type: 'function', stateMutability: 'nonpayable', inputs: [{ type: 'address' }, { type: 'bool' }], outputs: [] },
  ] as const;

  const [isChecking, setIsChecking] = useState(false);
  const [isApproved, setIsApproved] = useState<boolean>(false);
  const [ownerOk, setOwnerOk] = useState<boolean>(true);
  const [alreadyListed, setAlreadyListed] = useState(false);
  const [termsReady, setTermsReady] = useState(false);
  const [creatorAddress, setCreatorAddress] = useState<string | null>(null);
  const { writeContract: writeErc721, data: approveHash } = useWriteContract();
  const { isLoading: isApproving, isSuccess: approveSuccess } = useWaitForTransactionReceipt({ hash: approveHash });

  useEffect(() => {
    let ignore = false;
    const load = async () => {
      if (!address) {
        setLoadingNfts(false);
        return;
      }
      
      setLoadingNfts(true);
      try {
        const items = await fetchIpNftsFor(address);
        
        // Check which NFTs are already in auctions
        const client = createCampPublicClient();
        
        const auctionCount = await client.readContract({
          address: MARKETPLACE_ADDRESS as `0x${string}`,
          abi: MARKETPLACE_ABI,
          functionName: 'auctionCount',
        }) as bigint;
        
        const auctionedTokenIds = new Set<string>();
        
        for (let i = 1n; i <= auctionCount; i++) {
          try {
            const auction = await client.readContract({
              address: MARKETPLACE_ADDRESS as `0x${string}`,
              abi: MARKETPLACE_ABI,
              functionName: 'auctions',
              args: [i],
            }) as any;
            
            // auction[9] is active, auction[1] is nftContract, auction[2] is tokenId
            if (auction[9] && auction[1]?.toLowerCase() === DEFAULT_IP_NFT_CONTRACT.toLowerCase()) {
              auctionedTokenIds.add(auction[2].toString());
            }
          } catch {}
        }
        
        // Filter out NFTs that are in auction
        const availableItems = items.filter(item => !auctionedTokenIds.has(item.tokenId));
        
        if (!ignore) {
          setMyNfts(availableItems);
          setLoadingNfts(false);
        }
      } catch (error) {
        console.error('Error loading NFTs:', error);
        if (!ignore) {
          setLoadingNfts(false);
        }
      }
    };
    load();
    return () => { ignore = true; };
  }, [address]);

  const handlePresetSelect = (presetName: string) => {
    const preset = LICENSE_PRESETS.find(p => p.name === presetName);
    if (preset) {
      setCommercialUse(preset.commercialUse);
      setDerivativeWorks(preset.derivativeWorks);
      setLicenseDuration(preset.duration.toString());
      setSelectedPreset(presetName);
    }
  };

  const handleCreateListing = async () => {
    setSubmitError(null);
    setSubmitSuccess(false);
    if (!address || !tokenId || !price) {
      setSubmitError('Select NFT and fill required fields');
      return;
    }
    // When user selection has no explicit contract (edge from older data), default to primary IP collection
    const contractToUse = (nftContract || DEFAULT_IP_NFT_CONTRACT) as `0x${string}`;
    if (!ownerOk) {
      toast.error('You are not the token owner');
      return;
    }
    if (!isApproved) {
      toast.error('Approve marketplace to transfer this token first');
      return;
    }
    // If access is enabled for internal collection, require saved terms first
    const mustHaveTerms = nftContract?.toLowerCase() === DEFAULT_IP_NFT_CONTRACT.toLowerCase() && allowAccess;
    if (mustHaveTerms && !termsReady) {
      toast.error('Save access terms first');
      return;
    }
    try {
      setIsSubmitting(true);
      const royaltyBps = Math.floor(parseFloat(royaltyPercent) * 100);
      const licenseSec = BigInt(parseInt(licenseDuration || '0') * 24 * 60 * 60);
      writeContract({
        address: MARKETPLACE_ADDRESS as `0x${string}`,
        abi: MARKETPLACE_ABI,
        functionName: 'createListing',
        args: [
          contractToUse,
          BigInt(tokenId),
          parseEther(price),
          BigInt(royaltyBps),
          '0x0000000000000000000000000000000000000000' as `0x${string}`,
          commercialUse,
          derivativeWorks,
          licenseSec,
        ],
      });
      toast.loading('Submitting listing...');

      // Note: terms are saved explicitly via Save Terms button before listing
    } catch (e: any) {
      setSubmitError('Failed to submit');
      toast.error('Failed to submit listing');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Check ownership and approve state whenever selection changes
  const refreshApprovalState = async () => {
    if (!address || !tokenId || !nftContract) return;
    setIsChecking(true);
    try {
      const client = createCampPublicClient();
      const owner = await client.readContract({ address: nftContract as `0x${string}`, abi: ERC721_ABI, functionName: 'ownerOf', args: [BigInt(tokenId)] }) as string;
      const ownerMatch = owner?.toLowerCase() === address.toLowerCase();
      setOwnerOk(ownerMatch);
      if (!ownerMatch) {
        setIsApproved(false);
        return;
      }
      const approved = await client.readContract({ address: nftContract as `0x${string}`, abi: ERC721_ABI, functionName: 'getApproved', args: [BigInt(tokenId)] }) as string;
      const approvedForAll = await client.readContract({ address: nftContract as `0x${string}`, abi: ERC721_ABI, functionName: 'isApprovedForAll', args: [address, MARKETPLACE_ADDRESS] }) as boolean;
      const isApprovedNow = approved?.toLowerCase() === MARKETPLACE_ADDRESS.toLowerCase() || approvedForAll;
      console.log('🔍 Approval check details:', { 
        tokenId, 
        nftContract, 
        userAddress: address,
        approved, 
        approvedForAll, 
        MARKETPLACE_ADDRESS, 
        tokenMatch: approved?.toLowerCase() === MARKETPLACE_ADDRESS.toLowerCase(),
        isApprovedNow 
      });
      setIsApproved(isApprovedNow);

      // Check if token is already listed on marketplace
      // Get listing count first
      const listingCount = await client.readContract({
        address: MARKETPLACE_ADDRESS as `0x${string}`,
        abi: MARKETPLACE_ABI,
        functionName: 'getListingCount',
      }) as bigint;

      let isListed = false;
      for (let i = 1n; i <= listingCount; i++) {
        try {
          const listing = await client.readContract({
            address: MARKETPLACE_ADDRESS as `0x${string}`,
            abi: MARKETPLACE_ABI,
            functionName: 'listings',
            args: [i],
          }) as any;
          
          // listing[2] is tokenId, listing[1] is nftContract, listing[6] is isActive
          if (listing[6] && 
              listing[1]?.toLowerCase() === nftContract.toLowerCase() && 
              listing[2].toString() === tokenId) {
            isListed = true;
            break;
          }
        } catch {}
      }
      setAlreadyListed(isListed);

    } catch (e) {
      console.error('Approval check error:', e);
      setIsApproved(false);
      setAlreadyListed(false);
    } finally {
      setIsChecking(false);
    }
  };

  useEffect(() => { refreshApprovalState(); }, [address, tokenId, nftContract]);

  // Load existing terms on token change (internal IP only)
  useEffect(() => {
    const readTerms = async () => {
      setTermsReady(false);
      if (!tokenId || !nftContract) return;
      try {
        if (nftContract.toLowerCase() !== DEFAULT_IP_NFT_CONTRACT.toLowerCase()) return;
        const client = createCampPublicClient();
        // Creator is not authoritative anymore; owner controls terms. Kept for display only if needed.
        try {
          const c = await client.readContract({ address: MARKETPLACE_ADDRESS as `0x${string}`, abi: MARKETPLACE_ABI, functionName: 'tokenCreators', args: [BigInt(tokenId)] }) as `0x${string}`;
          setCreatorAddress(c);
        } catch {}
        const t = await client.readContract({ address: MARKETPLACE_ADDRESS as `0x${string}`, abi: MARKETPLACE_ABI, functionName: 'getTerms', args: [BigInt(tokenId)] }) as any;
        const priceOk = (t?.price ?? 0n) > 0n;
        const durationOk = (t?.duration ?? 0n) > 0n;
        setTermsReady(Boolean(priceOk && durationOk));
        if (priceOk) setAccessPrice(String(Number(t.price) / 1e18));
        if (durationOk) setAccessDuration(String(Number(t.duration) / 86400));
      } catch {}
    };
    readTerms();
  }, [tokenId, nftContract, address]);

  // After saving terms tx confirmed
  useEffect(() => {
    if (saveTermsSuccess) {
      toast.dismiss();
      toast.success('Access terms saved');
      setTermsReady(true);
    }
  }, [saveTermsSuccess]);

  useEffect(() => {
    if (saveTermsError) {
      toast.dismiss();
      const msg = (saveTermsErrorObj as any)?.message || '';
      if (msg.toLowerCase().includes('not token owner')) {
        toast.error('Only the current token owner can set access terms');
      } else {
        toast.error('Failed to save access terms');
      }
      setTermsReady(false);
    }
  }, [saveTermsError, saveTermsErrorObj]);

  useEffect(() => {
    if (approveSuccess) {
      toast.dismiss();
      toast.success('Marketplace approved - refreshing status...');
      // Wait a bit for blockchain state to update, then refresh
      setTimeout(() => {
        console.log('Auto-refreshing approval state after success...');
        refreshApprovalState();
      }, 3000);
    }
  }, [approveSuccess]);

  // Track tx state → success/error toasts and banner
  useEffect(() => {
    if (isSuccess && !submitSuccess) {
      setSubmitSuccess(true);
      toast.dismiss();
      toast.success('Listing created successfully');
      
      // Trigger refresh in MyIP component
      if (typeof window !== 'undefined') {
        localStorage.setItem('marketplace-listing-created', Date.now().toString());
        window.dispatchEvent(new StorageEvent('storage', { key: 'marketplace-listing-created' }));
      }
      
      // Auto-close modal after success
      setTimeout(() => {
        onClose();
      }, 2500);
    }
  }, [isSuccess, submitSuccess, onClose]);

  useEffect(() => {
    if (isTxError && !submitError) {
      const msg = txError?.message?.split('\n')[0] || 'Transaction failed';
      setSubmitError(msg);
      toast.dismiss();
      toast.error(msg.includes('0xcc6ba30b') ? 'Contract does not support createListing at this address' : msg);
    }
  }, [isTxError, submitError, txError]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex justify-between items-start mb-6">
          <h2 className="text-2xl font-bold text-white">List IP NFT for Sale</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Loading state */}
        {loadingNfts && (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-orange-500"></div>
            <span className="ml-3 text-gray-400">Loading your NFTs...</span>
          </div>
        )}

        {/* Form */}
        {!loadingNfts && (
        <div className="space-y-6">
          {/* Select NFT */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm text-gray-400">Select your IP NFT</label>
              <span className="text-xs text-gray-500">{address ? '' : 'Connect wallet to see your IP'}</span>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-60 overflow-y-auto">
              {myNfts.map((n) => (
                <button
                  key={`${n.contract}-${n.tokenId}`}
                  onClick={() => { setTokenId(n.tokenId); setNftContract(n.contract); }}
                  className={`relative aspect-square rounded-lg overflow-hidden border ${
                    tokenId === n.tokenId ? 'border-orange-500 ring-2 ring-orange-500/40' : 'border-gray-700'
                  }`}
                  title={n?.metadata?.name || `#${n.tokenId}`}
                >
                  {n.image ? (
                    <img src={n.image} alt={n?.metadata?.name || 'IP'} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-zinc-800" />
                  )}
                  <div className="absolute bottom-1 left-1 text-[10px] px-1.5 py-0.5 rounded bg-black/70 text-white">#{n.tokenId}</div>
                </button>
              ))}
            </div>
            <div className="mt-2 text-xs text-gray-400 break-all">
              Selected Token: {tokenId || '—'}
              {nftContract && (
                <>
                  <span className="ml-2">Contract:</span>
                  <a className="underline ml-1" href={`https://camp.cloud.blockscout.com/token/${nftContract}`} target="_blank" rel="noreferrer">{nftContract.slice(0,6)}...{nftContract.slice(-4)}</a>
                </>
              )}
              {tokenId && nftContract && (
                <button 
                  onClick={refreshApprovalState}
                  disabled={isChecking}
                  className="ml-2 px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs"
                >
                  {isChecking ? '...' : '🔄'}
                </button>
              )}
            </div>
          </div>

          {/* Sale Price */}
          <div>
            <label className="text-sm text-gray-400 block mb-2">Sale Price (CAMP)</label>
            <input
              type="number"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0.00"
              className="w-full bg-black/50 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-orange-500 focus:outline-none"
            />
          </div>

          {/* Royalty */}
          <div>
            <label className="text-sm text-gray-400 block mb-2">Creator Royalty (%)</label>
            <input
              type="number"
              min="0"
              max="10"
              step="0.1"
              value={royaltyPercent}
              onChange={(e) => setRoyaltyPercent(e.target.value)}
              className="w-full bg-black/50 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-orange-500 focus:outline-none"
            />
            <p className="text-xs text-gray-500 mt-1">Max 10%</p>
          </div>

          {/* License Presets */}
          <div>
            <label className="text-sm text-gray-400 block mb-2">License Preset</label>
            <div className="grid grid-cols-2 gap-2">
              {LICENSE_PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  onClick={() => handlePresetSelect(preset.name)}
                  className={`py-2 px-3 rounded-lg border text-sm transition-all ${
                    selectedPreset === preset.name
                      ? 'bg-orange-500 text-white border-orange-500'
                      : 'bg-black/50 text-gray-400 border-gray-700 hover:border-gray-600'
                  }`}
                >
                  {preset.name}
                </button>
              ))}
            </div>
          </div>

          {/* License Terms */}
          <div className="bg-black/50 border border-gray-700 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-white mb-3">License Terms</h3>
            <div className="space-y-3">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={commercialUse}
                  onChange={(e) => setCommercialUse(e.target.checked)}
                  className="w-4 h-4"
                />
                <span className="text-sm text-gray-300">Allow Commercial Use</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={derivativeWorks}
                  onChange={(e) => setDerivativeWorks(e.target.checked)}
                  className="w-4 h-4"
                />
                <span className="text-sm text-gray-300">Allow Derivative Works</span>
              </label>
              <div>
                <label className="text-xs text-gray-400 block mb-1">License Duration (days, 0 = permanent)</label>
                <input
                  type="number"
                  min="0"
                  value={licenseDuration}
                  onChange={(e) => setLicenseDuration(e.target.value)}
                  className="w-full bg-black/50 border border-gray-700 rounded px-2 py-1 text-white text-sm focus:border-orange-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Access Options */}
          <div className="bg-black/50 border border-gray-700 rounded-lg p-4">
            <label className="flex items-center gap-2 mb-3">
              <input
                type="checkbox"
                checked={allowAccess}
                onChange={(e) => setAllowAccess(e.target.checked)}
                className="w-4 h-4"
              />
              <span className="text-sm font-semibold text-white">Allow Temporary Access</span>
            </label>
            {/* Disable form if NFT is not from internal IP contract (creator not controlled) */}
            {allowAccess && nftContract && nftContract.toLowerCase() !== DEFAULT_IP_NFT_CONTRACT.toLowerCase() && (
              <div className="text-xs text-amber-400">Access terms are only available for IP minted in the marketplace collection. This NFT contract is external.</div>
            )}
            {allowAccess && nftContract && nftContract.toLowerCase() === DEFAULT_IP_NFT_CONTRACT.toLowerCase() && (
              <div className="space-y-3">
                {!ownerOk && (
                  <div className="text-xs text-amber-400">Only the current token owner can set access terms.</div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Access Price per Period (CAMP)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={accessPrice}
                      onChange={(e) => setAccessPrice(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-black/50 border border-gray-700 rounded px-2 py-1 text-white text-sm focus:border-orange-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Period Duration (days)</label>
                    <input
                      type="number"
                      min="1"
                      value={accessDuration}
                      onChange={(e) => setAccessDuration(e.target.value)}
                      className="w-full bg-black/50 border border-gray-700 rounded px-2 py-1 text-white text-sm focus:border-orange-500 focus:outline-none"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      try {
                        const accessSec = BigInt(parseInt(accessDuration) * 24 * 60 * 60);
                        writeUpdateTerms({
                          address: MARKETPLACE_ADDRESS as `0x${string}`,
                          abi: MARKETPLACE_ABI,
                          functionName: 'updateTerms',
                          args: [
                            BigInt(tokenId || '0'),
                            {
                              price: parseEther(accessPrice || '0'),
                              duration: accessSec,
                              royaltyBps: BigInt(Math.floor(parseFloat(royaltyPercent) * 100) || 0),
                              paymentToken: '0x0000000000000000000000000000000000000000' as `0x${string}`,
                            },
                          ],
                        });
                        toast.loading('Saving access terms...');
                      } catch {
                        toast.error('Invalid access terms');
                      }
                    }}
                    disabled={!tokenId || isSavingTerms || !ownerOk}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                  >
                    {isSavingTerms ? 'Saving...' : (termsReady ? 'Update Terms' : 'Save Terms')}
                  </button>
                  {termsReady ? (
                    <span className="text-xs text-green-400">Terms ready ✓</span>
                  ) : (
                    <span className="text-xs text-gray-400">Save terms before listing</span>
                  )}
                </div>
                {termsReady && (
                  <div className="text-xs text-green-300 bg-green-500/10 border border-green-500/30 rounded px-2 py-1 inline-flex items-center gap-2">
                    <span>Saved terms:</span>
                    <span className="font-semibold">{accessPrice || '—'} CAMP</span>
                    <span>•</span>
                    <span className="font-semibold">{accessDuration || '—'} days</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Error Message */}
          {submitError && (
            <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3">
              <p className="text-red-400 text-sm">
                {submitError}
              </p>
            </div>
          )}

          {/* Success Message */}
          {submitSuccess && (
            <div className="bg-green-500/10 border border-green-500/50 rounded-lg p-3">
              <p className="text-green-400 text-sm">
                Listing created successfully! 🎉
              </p>
            </div>
          )}

          {/* Approval Status */}
          {tokenId && nftContract && (
            <div className={`text-sm p-3 rounded-lg border flex justify-between items-center ${
              isChecking ? 'bg-yellow-500/10 border-yellow-500/50 text-yellow-400' :
              !ownerOk ? 'bg-red-500/10 border-red-500/50 text-red-400' :
              alreadyListed ? 'bg-orange-500/10 border-orange-500/50 text-orange-400' :
              isApproved ? 'bg-green-500/10 border-green-500/50 text-green-400' :
              'bg-orange-500/10 border-orange-500/50 text-orange-400'
            }`}>
              <span>
                {isChecking ? '🔄 Checking ownership and approval...' :
                 !ownerOk ? '❌ You are not the owner of this token' :
                 alreadyListed ? '🏷️ This token is already listed on marketplace' :
                 isApproved ? '✅ Marketplace approved - ready to list!' :
                 '⚠️ Approve marketplace to transfer this token first'}
              </span>
              <button 
                onClick={refreshApprovalState}
                disabled={isChecking}
                className="ml-2 px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs font-mono"
                title="Refresh approval status"
              >
                {isChecking ? '...' : '🔄'}
              </button>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-3 px-4 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
            {/* Approve button for external collections */}
            {!isApproved && ownerOk && nftContract && (
              <div className="flex gap-2">
                <button
                  onClick={() => { writeErc721({ address: nftContract as `0x${string}`, abi: ERC721_ABI, functionName: 'approve', args: [MARKETPLACE_ADDRESS as `0x${string}`, BigInt(tokenId || '0')] }); toast.loading('Approving marketplace...'); }}
                  disabled={isApproving || !tokenId}
                  className="py-3 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm"
                >
                  {isApproving ? 'Approving...' : 'Approve Token'}
                </button>
                <button
                  onClick={() => { writeErc721({ address: nftContract as `0x${string}`, abi: ERC721_ABI, functionName: 'setApprovalForAll', args: [MARKETPLACE_ADDRESS as `0x${string}`, true] }); toast.loading('Approving all tokens...'); }}
                  disabled={isApproving}
                  className="py-3 px-4 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm"
                >
                  Approve All
                </button>
              </div>
            )}
            <button
              onClick={handleCreateListing}
              disabled={isSubmitting || !address || !tokenId || !price || !ownerOk || !isApproved || alreadyListed || (allowAccess && nftContract?.toLowerCase() === DEFAULT_IP_NFT_CONTRACT.toLowerCase() && !termsReady)}
              className="flex-1 py-3 px-4 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold rounded-lg hover:from-orange-600 hover:to-amber-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting || isPending || isConfirming ? 'Processing...' : 'Create Listing'}
            </button>
          </div>
        </div>
        )}
      </div>
    </div>
  );
}

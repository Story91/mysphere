"use client";

import { useState, useEffect } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { formatEther, parseEther } from 'viem';
import { toast } from 'react-hot-toast';
import { MARKETPLACE_ADDRESS, MARKETPLACE_ABI, DEFAULT_IP_NFT_CONTRACT } from '../config/simpleMarketplace';
import { createCampPublicClient } from '../config/campClient';
import CreateAuctionModal from './CreateAuctionModal';
import BidModal from './BidModal';

export default function DashboardView() {
  const { address, isConnected } = useAccount();
  const [activeTab, setActiveTab] = useState<'listings' | 'offers' | 'earnings' | 'access' | 'auctions'>('listings');
  const [myListings, setMyListings] = useState<any[]>([]);
  type OfferRow = { buyer: string; price: bigint; duration: bigint; isActive: boolean; listingId: number; offerIndex: number };
  const [myOffers, setMyOffers] = useState<OfferRow[]>([]);
  const [myAccess, setMyAccess] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [myAuctions, setMyAuctions] = useState<Array<{ auctionId: number; nftContract: string; tokenId: bigint; minPrice: bigint; endTime: bigint; highestBid: bigint; highestBidder: string; active: boolean }>>([]);
  const [activeAuctions, setActiveAuctions] = useState<Array<{ auctionId: number; nftContract: string; tokenId: bigint; minPrice: bigint; endTime: bigint; highestBid: bigint; highestBidder: string; seller: string; active: boolean }>>([]);
  const [showCreateAuction, setShowCreateAuction] = useState<{ nftContract: `0x${string}`; tokenId: bigint } | null>(null);
  const [showBid, setShowBid] = useState<{ auctionId: bigint; minPrice: bigint } | null>(null);
  const [showRenewAccess, setShowRenewAccess] = useState<{ tokenId: string; terms: any } | null>(null);

  // Access management state
  const [selectedTokenId, setSelectedTokenId] = useState<string>('');
  const [selectedTerms, setSelectedTerms] = useState<{ price: bigint; duration: bigint; royaltyBps: bigint; paymentToken: string } | null>(null);
  const [hasAccessState, setHasAccessState] = useState<boolean>(false);
  const [expiryTs, setExpiryTs] = useState<bigint | null>(null);
  const [periods, setPeriods] = useState<number>(1);
  const [accessCandidates, setAccessCandidates] = useState<Array<{ tokenId: bigint; listingId: bigint; terms: { price: bigint; duration: bigint; paymentToken: string } }>>([]);

  // Media preview (only shown when user has access)
  const [previewType, setPreviewType] = useState<'image' | 'audio' | 'video' | 'text' | 'unknown'>('unknown');
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [previewMime, setPreviewMime] = useState<string>('');
  const [previewText, setPreviewText] = useState<string>('');
  const [isLoadingText, setIsLoadingText] = useState<boolean>(false);

  // Read user earnings (creator/seller), and platform earnings for contract owner
  const { data: userEarnings } = useReadContract({
    address: MARKETPLACE_ADDRESS as `0x${string}`,
    abi: MARKETPLACE_ABI,
    functionName: 'userEarnings',
    args: address ? [address] : undefined,
  });

  const { data: platformFeeBps } = useReadContract({
    address: MARKETPLACE_ADDRESS as `0x${string}`,
    abi: MARKETPLACE_ABI,
    functionName: 'platformFeeBps',
  });

  const { data: contractOwner } = useReadContract({
    address: MARKETPLACE_ADDRESS as `0x${string}`,
    abi: MARKETPLACE_ABI,
    functionName: 'owner',
  });

  const isOwner = Boolean(address && contractOwner && address.toLowerCase() === String(contractOwner).toLowerCase());

  // Platform fees accrued (owner withdraws these)
  const { data: platformFeesAccrued } = useReadContract({
    address: MARKETPLACE_ADDRESS as `0x${string}`,
    abi: MARKETPLACE_ABI,
    functionName: 'platformFeesAccrued',
  });

  // Pending returns (escrow refunds) for current user
  const { data: myPendingReturns, refetch: refetchPendingReturns } = useReadContract({
    address: MARKETPLACE_ADDRESS as `0x${string}`,
    abi: MARKETPLACE_ABI,
    functionName: 'pendingReturns',
    args: address ? [address as `0x${string}`] : undefined,
  });

  // Inspector state
  const [inspectAddr, setInspectAddr] = useState<string>('');
  const [inspectAmount, setInspectAmount] = useState<bigint | null>(null);
  const [contractBalance, setContractBalance] = useState<bigint | null>(null);

  const refreshInspector = async () => {
    try {
      const client = createCampPublicClient();
      const bal = await client.getBalance({ address: MARKETPLACE_ADDRESS as `0x${string}` });
      setContractBalance(bal);
      if (inspectAddr && /^0x[a-fA-F0-9]{40}$/.test(inspectAddr)) {
        const amt = await client.readContract({ address: MARKETPLACE_ADDRESS as `0x${string}`, abi: MARKETPLACE_ABI, functionName: 'userEarnings', args: [inspectAddr as `0x${string}`] }) as bigint;
        setInspectAmount(amt);
      }
    } catch {}
  };
  useEffect(() => { refreshInspector(); }, [address]);

  // Withdraw earnings
  const { writeContract: withdrawEarnings, data: withdrawHash } = useWriteContract();
  const { isLoading: isWithdrawing, isSuccess: withdrawSuccess } = useWaitForTransactionReceipt({ 
    hash: withdrawHash 
  });

  // Withdraw pending returns (offers/auctions refunds)
  const { writeContract: withdrawPending, data: withdrawPendingHash } = useWriteContract();
  const { isLoading: isWithdrawingPending, isSuccess: withdrawPendingSuccess } = useWaitForTransactionReceipt({ hash: withdrawPendingHash });

  // Withdraw platform fees (only contract owner)
  const { writeContract: withdrawFees, data: withdrawFeesHash } = useWriteContract();
  const { isLoading: isWithdrawingFees, isSuccess: withdrawFeesSuccess } = useWaitForTransactionReceipt({ hash: withdrawFeesHash });

  // Cancel listing
  const { writeContract: cancelListing, data: cancelHash } = useWriteContract();
  const { isLoading: isCancelling, isSuccess: cancelSuccess } = useWaitForTransactionReceipt({ 
    hash: cancelHash 
  });

  // Accept offer
  const { writeContract: acceptOffer, data: acceptHash } = useWriteContract();
  const { isLoading: isAccepting, isSuccess: acceptSuccess } = useWaitForTransactionReceipt({ 
    hash: acceptHash 
  });

  // Auctions actions
  const { writeContract: writeFinalizeAuction, data: finalizeHash } = useWriteContract();
  const { isLoading: isFinalizing, isSuccess: finalizeSuccess } = useWaitForTransactionReceipt({ hash: finalizeHash });
  const { writeContract: writeCancelAuction, data: cancelAuctionHash } = useWriteContract();
  const { isLoading: isCancelAuctionLoading, isSuccess: cancelAuctionSuccess } = useWaitForTransactionReceipt({ hash: cancelAuctionHash });

  // Fetch user's listings
  const fetchMyListings = async () => {
    if (!address) return;
    
    try {
      const client = createCampPublicClient();

      // Get listing count
      const listingCount = await client.readContract({
        address: MARKETPLACE_ADDRESS as `0x${string}`,
        abi: MARKETPLACE_ABI,
        functionName: 'getListingCount',
      }) as bigint;

      const userListings: any[] = [];
      const allOffers: OfferRow[] = [];
      
      // Check each listing
      for (let i = 1; i <= Number(listingCount); i++) {
        const listing = await client.readContract({
          address: MARKETPLACE_ADDRESS as `0x${string}`,
          abi: MARKETPLACE_ABI,
          functionName: 'listings',
          args: [BigInt(i)],
        }) as any;
        
        // listing is array [seller, nftContract, tokenId, price, royaltyBps, paymentToken, isActive, createdAt, commercialUse, derivativeWorks, licenseDuration]
        if (listing && listing[0]?.toLowerCase() === address.toLowerCase()) {
          // Get offers for this listing
          const offers: OfferRow[] = [];
          try {
            // Try to get offers (this might not work if no getter exists)
            for (let j = 0; j < 10; j++) { // Check up to 10 offers
              try {
                const offer = await client.readContract({
                  address: MARKETPLACE_ADDRESS as `0x${string}`,
                  abi: MARKETPLACE_ABI,
                  functionName: 'offers',
                  args: [BigInt(i), BigInt(j)],
                }) as any;
                console.log(`🔍 Offer ${i}-${j}:`, offer);
                
                // Handle both array and object structures
                const buyer = Array.isArray(offer) ? offer[0] : offer?.buyer;
                const price = Array.isArray(offer) ? offer[1] : offer?.price;
                const isActive = Array.isArray(offer) ? offer[3] : offer?.isActive;
                
                if (offer && buyer && buyer !== '0x0000000000000000000000000000000000000000') {
                  offers.push({ 
                    buyer,
                    price,
                    duration: Array.isArray(offer) ? offer[2] : offer?.duration,
                    isActive,
                    listingId: i, 
                    offerIndex: j 
                  });
                  console.log(`✅ Added offer ${i}-${j}:`, { buyer, price, isActive });
                }
              } catch {
                break; // No more offers
              }
            }
          } catch {}
          
          userListings.push({ 
            seller: listing[0],
            nftContract: listing[1], 
            tokenId: listing[2],
            price: listing[3],
            royaltyBps: listing[4],
            paymentToken: listing[5],
            isActive: listing[6],
            createdAt: listing[7],
            commercialUse: listing[8],
            derivativeWorks: listing[9],
            licenseDuration: listing[10],
            listingId: i,
            offers 
          });
          
          // Collect offers for later processing
          if (listing[6] && offers.length > 0) { // listing[6] is isActive
            const activeOffers = offers.filter(o => o.isActive);
            allOffers.push(...activeOffers);
          }
        }
      }
      
      setMyListings(userListings);
      setMyOffers(allOffers);
      console.log('📋 Found', userListings.length, 'listings and', allOffers.length, 'offers');
    } catch (error) {
      console.error('Error fetching listings:', error);
    }
  };

  // Fetch user's auctions (seller side)
  const fetchMyAuctions = async () => {
    if (!address) return;
    try {
      const client = createCampPublicClient();
      const count = await client.readContract({ address: MARKETPLACE_ADDRESS as `0x${string}`, abi: MARKETPLACE_ABI, functionName: 'auctionCount' }) as bigint;
      const rows: Array<{ auctionId: number; nftContract: string; tokenId: bigint; minPrice: bigint; endTime: bigint; highestBid: bigint; highestBidder: string; active: boolean }> = [];
      for (let i = 1; i <= Number(count); i++) {
        try {
          const a = await client.readContract({ address: MARKETPLACE_ADDRESS as `0x${string}`, abi: MARKETPLACE_ABI, functionName: 'auctions', args: [BigInt(i)] }) as any;
          const seller: string = a[0];
          if (seller && seller.toLowerCase() === address.toLowerCase()) {
            rows.push({ auctionId: i, nftContract: a[1], tokenId: a[2], minPrice: a[3], endTime: a[5], highestBidder: a[6], highestBid: a[7], active: a[9] });
          }
        } catch {}
      }
      setMyAuctions(rows);
    } catch {}
  };

  // Fetch all auctions where user has participated (current leader or has pending returns from being outbid)
  const fetchActiveAuctions = async () => {
    if (!address) return;
    try {
      const client = createCampPublicClient();
      const count = await client.readContract({ address: MARKETPLACE_ADDRESS as `0x${string}`, abi: MARKETPLACE_ABI, functionName: 'auctionCount' }) as bigint;
      
      // Check if user has pending returns (indicator they've been outbid)
      const pendingReturns = await client.readContract({
        address: MARKETPLACE_ADDRESS as `0x${string}`,
        abi: MARKETPLACE_ABI,
        functionName: 'pendingReturns',
        args: [address]
      }) as bigint;
      
      const rows: Array<{ auctionId: number; nftContract: string; tokenId: bigint; minPrice: bigint; endTime: bigint; highestBid: bigint; highestBidder: string; seller: string; active: boolean }> = [];
      
      for (let i = 1; i <= Number(count); i++) {
        try {
          const a = await client.readContract({ address: MARKETPLACE_ADDRESS as `0x${string}`, abi: MARKETPLACE_ABI, functionName: 'auctions', args: [BigInt(i)] }) as any;
          const active: boolean = a[9]; // Index 9 is 'active'
          if (!active) continue;
          
          const highestBidder: string = a[6]; // Index 6 is 'highestBidder'
          const seller: string = a[0];
          
          // Show if user is highest bidder OR has pending returns (was outbid) OR is the seller
          const isHighestBidder = highestBidder && highestBidder.toLowerCase() === address.toLowerCase();
          const hasPendingReturns = pendingReturns > 0n;
          const isSeller = seller && seller.toLowerCase() === address.toLowerCase();
          
          if (isHighestBidder || hasPendingReturns) {
            rows.push({ 
              auctionId: i, 
              nftContract: a[1], 
              tokenId: a[2], 
              minPrice: a[3], 
              endTime: a[5], // Index 5 is 'endTime'
              highestBidder: a[6], // Index 6 is 'highestBidder'
              highestBid: a[7], // Index 7 is 'highestBid'
              seller, 
              active 
            });
          }
        } catch {}
      }
      setActiveAuctions(rows);
    } catch {}
  };

  // Fetch only NFTs where user has purchased access
  const fetchAccessData = async () => {
    if (!address) return;
    try {
      const client = createCampPublicClient();
      
      const purchasedAccess: any[] = [];
      
      // 🔄 PERMANENT SOLUTION: Scan user's transactions for buyAccessOwner calls
      console.log('🔍 Scanning blockchain for access purchases by user:', address);
      
      const discoveredTokens = new Set<string>();
      
      try {
        // Scan Blockscout for user's buyAccessOwner transactions
        const BLOCKSCOUT = 'https://basecamp.cloud.blockscout.com/api';
        const response = await fetch(
          `${BLOCKSCOUT}?module=account&action=txlist&address=${address}&sort=desc&page=1&offset=50&filterby=to&tag=latest`,
          { 
            signal: AbortSignal.timeout(8000), // Shorter timeout
            cache: 'default' // Allow caching
          }
        );
        
        if (response.ok) {
          const data = await response.json();
          
          if (data.result && Array.isArray(data.result)) {
            for (const tx of data.result) {
              // Look for transactions TO our marketplace contract
              if (tx.to?.toLowerCase() === MARKETPLACE_ADDRESS.toLowerCase()) {
                // Check if it's a buyAccessOwner call (method ID: 0x79f205d0)
                if (tx.functionName?.includes('buyAccessOwner') || tx.input?.includes('79f205d0')) {
                  try {
                    // Decode the transaction input to get tokenId
                    // buyAccessOwner(uint256 tokenId, uint256 periods)
                    if (tx.input && tx.input.length >= 74) { // 10 chars for method + 64 chars for tokenId
                      const tokenIdHex = tx.input.slice(10, 74); // Skip method ID, get first parameter
                      console.log('🔍 Raw tokenId hex:', tokenIdHex);
                      
                      try {
                        const tokenId = BigInt('0x' + tokenIdHex).toString();
                        const MAX_UINT256_FOR_CHECK = BigInt('115792089237316195423570985008687907853269984665640564039457584007913129639935');
                        
                        if (BigInt(tokenId) <= MAX_UINT256_FOR_CHECK) {
                          discoveredTokens.add(tokenId);
                          console.log('✅ Found valid access purchase for token:', tokenId.slice(0, 20) + '...');
                        } else {
                          console.warn('⚠️ Token ID from transaction exceeds uint256 limit:', tokenId.slice(0, 20) + '...');
                          console.warn('   This might be a decoding error or invalid token');
                        }
                      } catch (e) {
                        console.error('❌ Error decoding tokenId from hex:', tokenIdHex, e);
                      }
                    }
                  } catch (e) {
                    console.log('Could not decode transaction input:', e);
                  }
                }
              }
            }
          }
        }
      } catch (e) {
        console.log('Could not fetch transaction history, falling back to localStorage');
      }
      
      // Fallback: localStorage + historical tokens
      const storedTokens = JSON.parse(localStorage.getItem('purchasedAccessTokens') || '[]');
      storedTokens.forEach((token: string) => discoveredTokens.add(token));
      
      // TEMP FIX: Use smaller token IDs that we know work
      const historicalTokens = [
        // Original large tokens (might be invalid):
        // '75117149098375702349250163325806135937493141262498324727099239402774025624205',
        // '140581521928766776335397740136738185046598277167208910377335354847282213258151',
        
        // Let's try some smaller test tokens that might exist:
        '1', '2', '3', '100', '1000', '10000'
      ];
      
      console.log('🧪 Testing with smaller token IDs to verify the system works');
      
      // Alternative approach: scan AccessPurchased events for this user
      try {
        console.log('🔍 Scanning AccessPurchased events for user:', address);
        
        // Look for AccessPurchased events in recent transactions
        const BLOCKSCOUT = 'https://camp.cloud.blockscout.com/api';
        const logsResponse = await fetch(
          `${BLOCKSCOUT}?module=logs&action=getLogs&address=${MARKETPLACE_ADDRESS}&topic0=0x79f205d05e1d9f99a7e4a6d2e5d9fc75c372c7033d239fefe5e5dec18d472bd9&topic2=0x000000000000000000000000${address.slice(2)}&fromBlock=0&toBlock=latest`,
          { signal: AbortSignal.timeout(5000) }
        );
        
        if (logsResponse.ok) {
          const logsData = await logsResponse.json();
          if (logsData.result && Array.isArray(logsData.result)) {
            logsData.result.forEach((log: any) => {
              try {
                // AccessPurchased(uint256 indexed tokenId, address indexed buyer, uint256 periods, uint256 expiryTime)
                // topic1 should be tokenId
                if (log.topics && log.topics[1]) {
                  const tokenIdFromLog = BigInt(log.topics[1]).toString();
                  discoveredTokens.add(tokenIdFromLog);
                  console.log('✅ Found access from event log for token:', tokenIdFromLog.slice(0, 20) + '...');
                }
              } catch (e) {
                console.log('Could not decode log:', e);
              }
            });
          }
        }
      } catch (e) {
        console.log('Could not fetch event logs');
      }
      
      historicalTokens.forEach(token => discoveredTokens.add(token));
      
      console.log('🎯 Total discovered tokens:', discoveredTokens.size);
      
      // Convert to BigInt for contract calls with validation
      const specificTokens: bigint[] = [];
      const MAX_UINT256 = BigInt('115792089237316195423570985008687907853269984665640564039457584007913129639935');
      
      // Debug: Check if our historical tokens are valid
      console.log('🔍 Validating historical tokens...');
      console.log('MAX_UINT256:', MAX_UINT256.toString());
      historicalTokens.forEach(token => {
        const bigintToken = BigInt(token);
        const isValid = bigintToken <= MAX_UINT256;
        console.log(`Token ${token.slice(0, 20)}... is ${isValid ? 'valid' : 'INVALID (too large)'}`);
      });
      
      for (const tokenIdStr of discoveredTokens) {
        try {
          const tokenId = BigInt(tokenIdStr);
          if (tokenId >= 0n && tokenId <= MAX_UINT256) {
            specificTokens.push(tokenId);
            console.log('✅ Valid token ID:', tokenIdStr.slice(0, 20) + '...');
          } else {
            console.warn('⚠️ Token ID exceeds uint256 range:', tokenIdStr.slice(0, 20) + '...');
          }
        } catch (e) {
          console.warn('⚠️ Invalid token ID format:', tokenIdStr);
        }
      }
      
      // Check tokens with rate limiting and error handling
      for (let i = 0; i < specificTokens.length; i++) {
        const tokenId = specificTokens[i];
        try {
          console.log(`🔍 Checking access for token ${i + 1}/${specificTokens.length}:`, tokenId.toString().slice(0, 20) + '...', 'user:', address);
          
          // Add delay between requests to prevent rate limiting
          if (i > 0) {
            await new Promise(resolve => setTimeout(resolve, 200)); // 200ms delay between contract calls
          }
          
          const has = await client.readContract({
        address: MARKETPLACE_ADDRESS as `0x${string}`,
        abi: MARKETPLACE_ABI,
            functionName: 'hasAccess',
            args: [tokenId, address],
          }) as boolean;

          console.log('📊 hasAccess result:', has, 'for token:', tokenId.toString().slice(0, 20) + '...');

          if (has) {
            console.log('✅ User has access to large token:', tokenId.toString().slice(0, 20) + '...');
            
            // Get subscription expiry
            const accessInfo = await client.readContract({
            address: MARKETPLACE_ADDRESS as `0x${string}`,
            abi: MARKETPLACE_ABI,
              functionName: 'accessInfo',
              args: [tokenId, address],
          }) as any;
            
            console.log('📅 AccessInfo:', accessInfo, 'for token:', tokenId.toString().slice(0, 20) + '...');
            
            const exp = Number(accessInfo[0]); // expiryTime is first field (index 0)
            const now = Date.now() / 1000;
            
            console.log('⏰ Expiry check - exp:', exp, 'now:', now, 'valid:', exp > now);
            
            if (exp > now) {
              // Get terms for this token
          const terms = await client.readContract({
            address: MARKETPLACE_ADDRESS as `0x${string}`,
            abi: MARKETPLACE_ABI,
            functionName: 'getTerms',
                args: [tokenId],
          }) as any;

              // Try to fetch NFT metadata
              let metadata: any = {};
              try {
                const tokenURI = await client.readContract({
                  address: DEFAULT_IP_NFT_CONTRACT as `0x${string}`,
                  abi: [{
                    inputs: [{name: 'tokenId', type: 'uint256'}],
                    name: 'tokenURI',
                    outputs: [{name: '', type: 'string'}],
                    stateMutability: 'view',
                    type: 'function'
                  }],
                  functionName: 'tokenURI',
                  args: [tokenId],
                }) as string;
                
                if (tokenURI) {
                  const ipfsUrl = tokenURI.replace('ipfs://', 'https://ipfs.io/ipfs/');
                  const response = await fetch(ipfsUrl);
                  metadata = await response.json();
                }
              } catch (e) {
                console.error('Error fetching metadata for large token:', e);
                metadata = {
                  name: `IP NFT #${tokenId.toString().slice(0, 8)}...`,
                  image: '/placeholder.png'
                };
              }
              
              // Get additional access info (periods remaining)
              const periodsRemaining = Number(accessInfo[1]); // second field in AccessInfo struct
              
              purchasedAccess.push({
                tokenId: tokenId.toString(),
                name: metadata.name || `IP NFT #${tokenId.toString().slice(0, 8)}...`,
                image: metadata.image || '/placeholder.png',
                expiryTime: exp,
                periodsRemaining,
                metadata,
                terms
              });
            }
          }
        } catch (e: any) {
          if (e.message?.includes('IntegerOutOfRangeError')) {
            console.warn('⚠️ Token ID exceeds safe range, skipping:', tokenId.toString().slice(0, 20) + '...');
          } else if (e.message?.includes('rate limit') || e.message?.includes('too many requests')) {
            console.warn('⚠️ Rate limited, waiting before retry...');
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
            // Could add retry logic here if needed
          } else {
            console.error('❌ Error checking access for token:', tokenId.toString().slice(0, 20) + '...', e.message);
          }
        }
      }
      
      // We now only check specific tokens from localStorage + historical tokens
      // This is much faster and more accurate than scanning ranges
      
      console.log('🎯 Final purchasedAccess array:', purchasedAccess);
      console.log('📋 Setting myAccess to:', purchasedAccess.length, 'items');
      
      setMyAccess(purchasedAccess);
      // Clear candidates since we're not showing available access anymore
      setAccessCandidates([]);
    } catch (e) {
      console.error('❌ Error fetching access data:', e);
    }
  };

  // Initialize historical tokens in localStorage (one-time setup)
  useEffect(() => {
    const storedTokens = JSON.parse(localStorage.getItem('purchasedAccessTokens') || '[]');
    const historicalTokens = [
      '75117149098375702349250163325806135937493141262498324727099239402774025624205',
      '140581521928766776335397740136738185046598277167208910377335354847282213258151',
    ];
    
    let updated = false;
    historicalTokens.forEach(token => {
      if (!storedTokens.includes(token)) {
        storedTokens.push(token);
        updated = true;
      }
    });
    
    if (updated) {
      localStorage.setItem('purchasedAccessTokens', JSON.stringify(storedTokens));
      console.log('💾 Added historical tokens to localStorage');
    }
  }, []);

  // Load data on mount with rate limiting
  useEffect(() => {
    if (address) {
      setLoading(true);
      setMyOffers([]); // Reset offers
      setMyListings([]); // Reset listings
      setMyAuctions([]);
      
      // Add delays between API calls to prevent "too many requests"
      const loadDataSequentially = async () => {
        try {
          await fetchMyListings();
          await new Promise(resolve => setTimeout(resolve, 500)); // 500ms delay
          
          await fetchAccessData();
          await new Promise(resolve => setTimeout(resolve, 500)); // 500ms delay
          
          await fetchMyAuctions();
          await new Promise(resolve => setTimeout(resolve, 500)); // 500ms delay
          
          await fetchActiveAuctions();
        } catch (error) {
          console.error('Error loading dashboard data:', error);
        } finally {
          setLoading(false);
        }
      };
      
      loadDataSequentially();
    }
  }, [address]);

  // Helper to load terms and user access for selected token
  const refreshSelectedAccess = async (tokenIdStr: string) => {
    if (!tokenIdStr) return;
    try {
      const tokenId = BigInt(tokenIdStr);
      const client = createCampPublicClient();
      const terms = await client.readContract({
        address: MARKETPLACE_ADDRESS as `0x${string}`,
        abi: MARKETPLACE_ABI,
        functionName: 'getTerms',
        args: [tokenId],
      }) as any;
      setSelectedTerms({
        price: terms.price as bigint,
        duration: terms.duration as bigint,
        royaltyBps: terms.royaltyBps as bigint,
        paymentToken: terms.paymentToken as string,
      });
      const has = await client.readContract({
        address: MARKETPLACE_ADDRESS as `0x${string}`,
        abi: MARKETPLACE_ABI,
        functionName: 'hasAccess',
        args: [tokenId, address!],
      }) as boolean;
      setHasAccessState(has);
      const exp = await client.readContract({
        address: MARKETPLACE_ADDRESS as `0x${string}`,
        abi: MARKETPLACE_ABI,
        functionName: 'subscriptionExpiry',
        args: [tokenId, address!],
      }) as bigint;
      setExpiryTs(exp);

      // Load tokenURI and build media preview (only when user has access)
      // Get tokenURI from IP NFT contract directly
      try {
        // Fetch from IP NFT contract
        const ipNftAbi = [
          {
            inputs: [{ name: "tokenId", type: "uint256" }],
            name: "tokenURI",
            outputs: [{ name: "", type: "string" }],
            stateMutability: "view",
            type: "function"
          }
        ];
        const uri = await client.readContract({
          address: DEFAULT_IP_NFT_CONTRACT as `0x${string}`,
          abi: ipNftAbi,
          functionName: 'tokenURI',
          args: [tokenId],
        }) as string;
        const metaUrl = uri?.startsWith('http') ? uri : uri?.replace('ipfs://', 'https://ipfs.io/ipfs/');
        if (metaUrl) {
          const meta = await fetch(metaUrl, { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null);
          const anim = meta?.animation_url || meta?.animationUrl || '';
          const img = meta?.image || '';
          const media = anim || img || '';
          const mediaHttp = media?.startsWith('http') ? media : media?.replace('ipfs://', 'https://ipfs.io/ipfs/');
          const mime = (meta?.properties?.mimeType || meta?.mimeType || '').toString();
          let type: 'image' | 'audio' | 'video' | 'text' | 'unknown' = 'unknown';
          const lower = (mime || media).toLowerCase();
          if (lower.includes('audio') || lower.endsWith('.mp3') || lower.endsWith('.wav')) type = 'audio';
          else if (lower.includes('video') || lower.endsWith('.mp4') || lower.endsWith('.webm')) type = 'video';
          else if (lower.includes('text') || lower.endsWith('.txt') || lower.endsWith('.md')) type = 'text';
          else if (lower.includes('image') || lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.gif')) type = 'image';
          setPreviewType(type);
          setPreviewUrl(mediaHttp);
          setPreviewMime(mime);
          // load text content lazily
          if (type === 'text' && mediaHttp) {
            setIsLoadingText(true);
            try {
              const res = await fetch(mediaHttp, { cache: 'no-store' });
              const txt = await res.text();
              setPreviewText(txt);
            } catch {
              setPreviewText('Failed to load text');
            } finally {
              setIsLoadingText(false);
            }
          } else {
            setPreviewText('');
          }
        }
      } catch {}
    } catch (e) {
      console.error('Failed to refresh access info:', e);
    }
  };

  // Handle withdraw
  const handleWithdraw = () => {
    if (!userEarnings || userEarnings === 0n) {
      toast.error('No earnings to withdraw');
      return;
    }

    withdrawEarnings({
      address: MARKETPLACE_ADDRESS as `0x${string}`,
      abi: MARKETPLACE_ABI,
      functionName: 'withdrawEarnings',
    });
    
    toast.loading('Processing withdrawal...');
  };

  const handleWithdrawPendingReturns = () => {
    if (!myPendingReturns || myPendingReturns === 0n) {
      toast.error('No pending returns');
      return;
    }
    withdrawPending({ address: MARKETPLACE_ADDRESS as `0x${string}`, abi: MARKETPLACE_ABI, functionName: 'withdrawPendingReturns' });
    toast.loading('Withdrawing pending returns...');
  };

  const handleWithdrawPlatformFees = () => {
    if (!platformFeesAccrued || platformFeesAccrued === 0n) {
      toast.error('No platform fees to withdraw');
      return;
    }
    if (!address || !contractOwner || String(contractOwner).toLowerCase() !== address.toLowerCase()) {
      toast.error('Only contract owner can withdraw fees');
      return;
    }
    withdrawFees({ address: MARKETPLACE_ADDRESS as `0x${string}`, abi: MARKETPLACE_ABI, functionName: 'withdrawPlatformFees' });
    toast.loading('Withdrawing platform fees...');
  };

  // Handle cancel listing
  const handleCancelListing = (listingId: number) => {
    cancelListing({
      address: MARKETPLACE_ADDRESS as `0x${string}`,
      abi: MARKETPLACE_ABI,
      functionName: 'cancelListing',
      args: [BigInt(listingId)],
    });
    
    toast.loading('Cancelling listing...');
  };

  // Handle accept offer
  const handleAcceptOffer = (listingId: number, offerIndex: number) => {
    acceptOffer({
      address: MARKETPLACE_ADDRESS as `0x${string}`,
      abi: MARKETPLACE_ABI,
      functionName: 'acceptOffer',
      args: [BigInt(listingId), BigInt(offerIndex)],
    });
    
    toast.loading('Accepting offer...');
  };

  // Buy/Renew Access
  const { writeContract: writeBuyAccess, data: buyHash } = useWriteContract();
  const { writeContract: writeRenewAccess, data: renewHash } = useWriteContract();
  const { isLoading: isBuying, isSuccess: buySuccess } = useWaitForTransactionReceipt({ hash: buyHash });
  const { isLoading: isRenewing, isSuccess: renewSuccess } = useWaitForTransactionReceipt({ hash: renewHash });

  const handleBuyAccess = () => {
    if (!selectedTokenId || !selectedTerms) {
      toast.error('Select token first');
      return;
    }
    if (selectedTerms.paymentToken !== '0x0000000000000000000000000000000000000000') {
      toast.error('This listing uses ERC20 payment token. UI for approvals not implemented yet.');
      return;
    }
    const value = (selectedTerms.price || 0n) * BigInt(Math.max(1, periods));
    writeBuyAccess({
      address: MARKETPLACE_ADDRESS as `0x${string}`,
      abi: MARKETPLACE_ABI,
      functionName: 'buyAccessOwner',
      args: [BigInt(selectedTokenId), BigInt(Math.max(1, periods))],
      value,
    });
    toast.loading('Purchasing access...');
  };

  const handleRenewAccess = () => {
    if (!selectedTokenId || !selectedTerms) {
      toast.error('Select token first');
      return;
    }
    if (selectedTerms.paymentToken !== '0x0000000000000000000000000000000000000000') {
      toast.error('This listing uses ERC20 payment token. UI for approvals not implemented yet.');
      return;
    }
    const value = (selectedTerms.price || 0n) * BigInt(Math.max(1, periods));
    writeRenewAccess({
      address: MARKETPLACE_ADDRESS as `0x${string}`,
      abi: MARKETPLACE_ABI,
      functionName: 'renewAccessOwner',
      args: [BigInt(selectedTokenId), BigInt(Math.max(1, periods))],
      value,
    });
    toast.loading('Renewing access...');
  };

  // Success handlers
  useEffect(() => {
    if (withdrawSuccess) {
      toast.dismiss();
      toast.success('Earnings withdrawn successfully!');
    }
  }, [withdrawSuccess]);

  useEffect(() => {
    if (withdrawPendingSuccess) {
      toast.dismiss();
      toast.success('Pending returns withdrawn!');
      refetchPendingReturns?.();
    }
  }, [withdrawPendingSuccess]);

  useEffect(() => {
    if (withdrawFeesSuccess) {
      toast.dismiss();
      toast.success('Platform fees withdrawn!');
    }
  }, [withdrawFeesSuccess]);

  useEffect(() => {
    if (cancelSuccess) {
      toast.dismiss();
      toast.success('Listing cancelled successfully!');
      fetchMyListings();
    }
  }, [cancelSuccess]);

  useEffect(() => {
    if (acceptSuccess) {
      toast.dismiss();
      toast.success('Offer accepted successfully!');
      fetchMyListings();
    }
  }, [acceptSuccess]);

  useEffect(() => { if (finalizeSuccess) { toast.dismiss(); toast.success('Auction finalized'); fetchMyAuctions(); } }, [finalizeSuccess]);
  useEffect(() => { if (cancelAuctionSuccess) { toast.dismiss(); toast.success('Auction cancelled'); fetchMyAuctions(); } }, [cancelAuctionSuccess]);

  useEffect(() => {
    if (buySuccess) {
      toast.dismiss();
      toast.success('Access purchased!');
      refreshSelectedAccess(selectedTokenId);
      fetchAccessData();
    }
  }, [buySuccess]);

  useEffect(() => {
    if (renewSuccess) {
      toast.dismiss();
      toast.success('Access renewed!');
      refreshSelectedAccess(selectedTokenId);
      fetchAccessData();
    }
  }, [renewSuccess]);

  // ORIGIN STATS
  const [originStats, setOriginStats] = useState<{ multiplier: bigint; points: bigint; active: boolean; uploadsCount: bigint } | null>(null);
  const [originConsent, setOriginConsentState] = useState<boolean>(false);
  // Origin consent was removed from optimized contract
  // const { writeContract: writeConsent, data: consentHash } = useWriteContract();
  // const { isSuccess: consentSuccess } = useWaitForTransactionReceipt({ hash: consentHash });
  const consentSuccess = false;

  const loadOrigin = async () => {
    if (!address) return;
    try {
      const client = createCampPublicClient();
      // getOriginUsage and userConsent were removed from optimized contract
      // Set default values
      const multiplier = BigInt(1);
      const points = BigInt(0);
      const active = false;
      const uploadsCount = BigInt(0);
      setOriginStats({ multiplier, points, active, uploadsCount });
      setOriginConsentState(false);
    } catch {}
  };

  useEffect(() => { if (address) loadOrigin(); }, [address]);
  useEffect(() => { if (consentSuccess) { toast.success('Consent updated'); loadOrigin(); } }, [consentSuccess]);

  // Live timers and polling for auctions
  const [nowTs, setNowTs] = useState<number>(Math.floor(Date.now() / 1000));
  useEffect(() => {
    const tick = setInterval(() => setNowTs(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(tick);
  }, []);
  useEffect(() => {
    if (!address) return;
    const poll = setInterval(() => {
      fetchActiveAuctions();
      fetchMyAuctions();
    }, 20000);
    return () => clearInterval(poll);
  }, [address]);

  const formatTimeLeft = (endTime: bigint | number) => {
    const end = Number(endTime);
    const seconds = Math.max(0, end - nowTs);
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (days > 0) return `${days}d ${hours}h`;
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${pad(hours)}:${pad(minutes)}:${pad(secs)}`;
  };

  if (!isConnected) {
    return (
      <div className="text-center py-20">
        <div className="text-6xl mb-4">🔐</div>
        <h2 className="text-2xl font-bold text-soft-ink mb-4">Connect Wallet</h2>
        <p className="text-gray-400">Connect your wallet to view your dashboard</p>
      </div>
    );
  }

  return (
    <div>
      {/* Dashboard Header */}
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-soft-ink mb-2">My Dashboard</h2>
        <p className="text-gray-400">Manage your listings, offers, and earnings</p>
      </div>

      {/* Tabs - Mobile Responsive */}
      <div className="flex flex-wrap gap-1 sm:gap-2 mb-8 border-b border-soft-line overflow-x-auto">
        {[
          { id: 'listings', label: 'My Listings', icon: '📋', shortLabel: 'Listings' },
          { id: 'offers', label: 'Offers Received', icon: '💰', shortLabel: 'Offers' },
          { id: 'earnings', label: 'Earnings', icon: '💵', shortLabel: 'Earnings' },
          { id: 'access', label: 'My Access', icon: '🔑', shortLabel: 'Access' },
          { id: 'auctions', label: 'Auctions', icon: '🔨', shortLabel: 'Auctions' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-3 sm:px-6 py-2 sm:py-3 font-medium transition-all text-sm sm:text-base whitespace-nowrap ${
              activeTab === tab.id
                ? 'text-soft-ink border-t-2 border-b-2 border-soft-primary'
                : 'text-soft-ink-muted hover:text-soft-ink'
            }`}
          >
            <span className="mr-1 sm:mr-2">{tab.icon}</span>
            <span className="hidden sm:inline">{tab.label}</span>
            <span className="sm:hidden">{tab.shortLabel}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-soft-accent border-t-transparent mx-auto mb-4"></div>
          <p className="text-gray-400">Loading dashboard...</p>
        </div>
      ) : (
        <>
          {/* My Listings Tab */}
          {activeTab === 'listings' && (
            <div>
              <h3 className="text-xl font-bold text-soft-ink mb-6">My Active Listings</h3>
              {myListings.filter(l => l.isActive).length === 0 ? (
                <div className="bg-white border border-soft-line rounded-xl p-12 text-center">
                  <div className="text-5xl mb-4">📦</div>
                  <p className="text-gray-400 mb-4">You don't have any active listings</p>
                  <p className="text-soft-ink-soft text-sm">List your IP NFTs to start selling</p>
                </div>
              ) : (
                <div className="grid gap-4">
                  {myListings.filter(l => l.isActive).map((listing) => (
                    <ListingCardWithPreview
                      key={listing.listingId}
                      listing={listing}
                      onCancel={handleCancelListing}
                      isCancelling={isCancelling}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Offers Tab */}
          {activeTab === 'offers' && (
            <div>
              <h3 className="text-xl font-bold text-soft-ink mb-6">Offers Received</h3>
              {myOffers.length === 0 ? (
                <div className="bg-white border border-soft-line rounded-xl p-12 text-center">
                  <div className="text-5xl mb-4">💌</div>
                  <p className="text-gray-400">No offers received yet</p>
                  <p className="text-soft-ink-soft text-sm mt-2">Offers will appear here when buyers make them</p>
                </div>
              ) : (
                <div className="grid gap-4">
                  {myOffers.map((offer, index) => (
                    <div key={`${offer.listingId}-${offer.offerIndex}`} className="bg-white border border-soft-line rounded-xl p-4 sm:p-6">
                      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
                        <div>
                          <h4 className="text-white font-semibold mb-2">
                            Offer for Listing #{offer.listingId}
                          </h4>
                          <p className="text-soft-ink-muted text-sm">
                            Amount: <span className="text-orange-400 font-bold">{formatEther(offer.price || 0n)} CAMP</span>
                          </p>
                          <p className="text-soft-ink-muted text-sm">
                            From: <span className="text-white">{offer.buyer?.slice(0, 6)}...{offer.buyer?.slice(-4)}</span>
                          </p>
                          <p className="text-soft-ink-muted text-sm">
                            Duration: <span className="text-white">{Number(offer.duration) / 86400} days</span>
                          </p>
                        </div>
                        <div className="flex gap-2 justify-end sm:justify-start">
                          <button
                            onClick={() => handleAcceptOffer(offer.listingId, offer.offerIndex)}
                            disabled={isAccepting}
                            className="px-4 py-2 bg-[#0b9a51] text-white rounded-lg hover:bg-[#0b9a51] transition-colors disabled:opacity-50"
                          >
                            Accept
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Earnings Tab */}
          {activeTab === 'earnings' && (
            <div>
              <h3 className="text-xl font-bold text-soft-ink mb-6">My Earnings</h3>
              <div className="bg-soft-surface-sunken border border-soft-line rounded-xl p-4 sm:p-8">
                <div className="text-center">
                  <p className="text-gray-300 mb-2">Available to Withdraw</p>
                  <p className="text-3xl sm:text-5xl font-bold text-soft-accent-deep mb-4 sm:mb-8">
                    {userEarnings ? formatEther(userEarnings) : '0'} CAMP
                  </p>
                  <button
                    onClick={handleWithdraw}
                    disabled={!userEarnings || userEarnings === 0n || isWithdrawing}
                    className="px-8 py-3 bg-soft-primary text-white font-bold rounded-lg hover:bg-soft-primary-deep transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                  >
                    {isWithdrawing ? 'Processing...' : 'Withdraw Earnings'}
                  </button>
                  <p className="text-soft-ink-soft text-sm mt-4">
                    Earnings come from sales, royalties, and access fees
                  </p>
                </div>
              </div>

              {/* Pending Returns Section - always show */}
              <div className="mt-6 bg-soft-surface-sunken border border-soft-line rounded-xl p-4 sm:p-6">
                <div className="text-center">
                  <p className="text-gray-300 mb-2">Auction Refunds Available</p>
                  <p className="text-2xl sm:text-3xl font-bold text-soft-info mb-4">
                    {myPendingReturns ? formatEther(myPendingReturns) : '0'} CAMP
                  </p>
                  <button
                    onClick={handleWithdrawPendingReturns}
                    disabled={!myPendingReturns || myPendingReturns === 0n || isWithdrawingPending}
                    className="px-6 py-2 bg-soft-primary text-white font-bold rounded-lg hover:bg-soft-primary-deep transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                  >
                    {isWithdrawingPending ? 'Processing...' : 'Withdraw Refunds'}
                  </button>
                  <p className="text-soft-ink-soft text-xs mt-3">
                    Refunds from unsuccessful auctions or overbids
                  </p>
                </div>
              </div>


            </div>
          )}

          {/* Access Tab */}
          {activeTab === 'access' && (
            <div>
              <h3 className="text-xl font-bold text-soft-ink mb-6">My Access Rights</h3>
              {/* (rest of access UI continues below) */}
                  </div>
          )}

          {/* Auctions Tab */}
          {activeTab === 'auctions' && (
            <div>
              <h3 className="text-xl font-bold text-soft-ink mb-6">My Auctions</h3>
              {myAuctions.filter(a => a.active).length === 0 ? (
                <div className="bg-white border border-soft-line rounded-xl p-12 text-center text-soft-ink-muted">You have no auctions</div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {myAuctions.filter(a => a.active).map(a => (
                    <AuctionCardWithPreview
                      key={a.auctionId}
                      auction={a}
                      onFinalize={() => writeFinalizeAuction({ address: MARKETPLACE_ADDRESS as `0x${string}`, abi: MARKETPLACE_ABI, functionName: 'finalizeAuction', args: [BigInt(a.auctionId)] })}
                      onCancel={() => writeCancelAuction({ address: MARKETPLACE_ADDRESS as `0x${string}`, abi: MARKETPLACE_ABI, functionName: 'cancelAuction', args: [BigInt(a.auctionId)] })}
                      isFinalizing={isFinalizing}
                      isCancelling={isCancelAuctionLoading}
                      formatTimeLeft={formatTimeLeft}
                    />
                    ))}
                  </div>
          )}

              <h3 className="text-xl font-bold text-soft-ink mt-10 mb-4">My Bids</h3>
              {activeAuctions.length === 0 ? (
                <div className="bg-white border border-soft-line rounded-xl p-12 text-center text-soft-ink-muted">You're not currently bidding on any auctions</div>
              ) : (
                <div className="grid gap-3">
                  {activeAuctions.map(a => {
                    const isWinning = Boolean(a.highestBidder && address && a.highestBidder.toLowerCase() === address.toLowerCase());
                    const auctionEnded = Number(a.endTime) <= nowTs;
                    
                    return (
                      <BidCardWithNFTPreview
                        key={`act-${a.auctionId}`}
                        auction={a}
                        isWinning={isWinning}
                        auctionEnded={auctionEnded}
                        formatTimeLeft={formatTimeLeft}
                        formatEther={(value: bigint) => formatEther(value)}
                        onClaimNFT={() => writeFinalizeAuction({ 
                          address: MARKETPLACE_ADDRESS as `0x${string}`, 
                          abi: MARKETPLACE_ABI, 
                          functionName: 'finalizeAuction', 
                          args: [BigInt(a.auctionId)] 
                        })}
                        onIncreaseBid={() => setShowBid({ auctionId: BigInt(a.auctionId), minPrice: a.highestBid > 0n ? a.highestBid : a.minPrice })}
                        isFinalizing={Boolean(isFinalizing)}
                      />
                    );
                  })}
                      </div>
              )}
                      </div>
          )}

          {activeTab === 'access' && (
            <>
              <h3 className="text-xl font-bold text-soft-ink mb-4">My Purchased Access</h3>
              {myAccess.length === 0 ? (
                <div className="bg-white border border-soft-line rounded-xl p-12 text-center">
                  <p className="text-soft-ink-muted text-lg mb-2">No Active Access Rights</p>
                  <p className="text-soft-ink-soft text-sm">You haven't purchased access to any NFTs yet.</p>
                  <p className="text-soft-ink-soft text-sm mt-2">Browse the marketplace to find NFTs with temporary access available.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {myAccess.map((access) => (
                    <AccessCard key={access.tokenId.toString()} access={access} onRenew={() => {
                      setShowRenewAccess({
                        tokenId: access.tokenId.toString(),
                        terms: access.terms
                      });
                    }} />
                  ))}
                            </div>
                          )}
            </>
          )}
        </>
      )}
      {/* Modals */}
      {showCreateAuction && (
        <CreateAuctionModal nftContract={showCreateAuction.nftContract} tokenId={showCreateAuction.tokenId} onClose={() => setShowCreateAuction(null)} />
      )}
      {showBid && (
        <BidModal auctionId={showBid.auctionId} minPrice={showBid.minPrice} onClose={() => setShowBid(null)} />
      )}
      {showRenewAccess && (
        <RenewAccessModal 
          tokenId={showRenewAccess.tokenId} 
          terms={showRenewAccess.terms} 
          onClose={() => setShowRenewAccess(null)} 
        />
                      )}
                    </div>
  );
}

// Component for displaying purchased access as a card
function AccessCard({ access, onRenew }: { access: any; onRenew: () => void }) {
  const [timeLeft, setTimeLeft] = useState<string>('');
  
  // Live countdown timer
  useEffect(() => {
    const updateTimer = () => {
      const now = Math.floor(Date.now() / 1000);
      const expiry = Number(access.expiryTime);
      const diff = expiry - now;
      
      if (diff <= 0) {
        setTimeLeft('Expired');
      } else {
        const days = Math.floor(diff / 86400);
        const hours = Math.floor((diff % 86400) / 3600);
        const minutes = Math.floor((diff % 3600) / 60);
        const seconds = diff % 60;
        
        if (days > 0) {
          setTimeLeft(`${days}d ${hours}h ${minutes}m`);
        } else if (hours > 0) {
          setTimeLeft(`${hours}h ${minutes}m ${seconds}s`);
        } else {
          setTimeLeft(`${minutes}m ${seconds}s`);
        }
      }
    };
    
    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [access.expiryTime]);
  
  const imageUrl = access.metadata?.image?.startsWith('ipfs://') 
    ? access.metadata.image.replace('ipfs://', 'https://ipfs.io/ipfs/')
    : access.metadata?.image;
  
  return (
    <div className="bg-white border border-soft-line rounded-xl overflow-hidden hover:border-soft-line transition-all">
      {/* NFT Image */}
      <div className="aspect-square bg-soft-surface-sunken relative">
        {imageUrl ? (
          <img 
            src={imageUrl} 
            alt={access.metadata?.name || `Token #${access.tokenId}`}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-soft-ink-soft">
            <span className="text-4xl">🖼️</span>
          </div>
        )}
        
        {/* Time left badge */}
        <div className={`absolute top-2 right-2 px-2 sm:px-3 py-1 rounded-full text-xs font-semibold ${
          timeLeft === 'Expired' ? 'bg-red-500/80' : 'bg-green-500/80'
        } text-soft-ink backdrop-blur`}>
          {timeLeft === 'Expired' ? '⏱️ Expired' : `⏱️ ${timeLeft}`}
                </div>
              </div>

      {/* Card Content */}
      <div className="p-3 sm:p-4">
        <h4 className="text-soft-ink font-semibold text-lg mb-1">
          {access.metadata?.name || `Token #${access.tokenId}`}
        </h4>
        
        <p className="text-soft-ink-muted text-sm mb-3">
          Token ID: #{access.tokenId.toString()}
        </p>
        
        {/* Access Terms */}
        {access.terms && (
          <div className="text-xs text-soft-ink-soft mb-3">
            <div>Price: {formatEther(access.terms.price)} CAMP per period</div>
            <div>Duration: {Number(access.terms.duration) / 86400} days per period</div>
            {access.periodsRemaining !== undefined && (
              <div className="text-cyan-400 font-medium">
                Periods Remaining: {access.periodsRemaining}
                    </div>
            )}
                </div>
              )}
        
        {/* Expiry Date */}
        <div className="text-xs text-soft-ink-muted mb-4">
          Expires: {new Date(Number(access.expiryTime) * 1000).toLocaleString()}
            </div>
        
        {/* Renew Button */}
        {timeLeft !== 'Expired' && (
          <button
            onClick={onRenew}
            className="w-full px-3 py-2 bg-soft-primary text-white rounded-lg text-sm hover:bg-soft-primary-deep transition-all"
          >
            Renew Access
          </button>
        )}
      </div>
    </div>
  );
}

function AccessTermsInline({ tokenId }: { tokenId: string }) {
  const [terms, setTerms] = useState<{ price: bigint; duration: bigint } | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const client = createCampPublicClient();
        const t = await client.readContract({ address: MARKETPLACE_ADDRESS as `0x${string}`, abi: MARKETPLACE_ABI, functionName: 'getTerms', args: [BigInt(tokenId)] }) as any;
        if (t && (t.price ?? 0n) > 0n && (t.duration ?? 0n) > 0n) setTerms({ price: t.price, duration: t.duration });
      } catch {}
    })();
  }, [tokenId]);
  if (!terms) return <p className="text-soft-ink-soft text-xs">No access terms</p>;
  return (
    <p className="text-soft-ink-muted text-sm">Terms: <span className="text-white font-semibold">{Number(terms.price) / 1e18} CAMP</span> / <span className="text-white">{Number(terms.duration) / 86400} days</span></p>
  );
}

// AuctionCard component with NFT preview
function AuctionCardWithPreview({ 
  auction, 
  onFinalize, 
  onCancel, 
  isFinalizing, 
  isCancelling,
  formatTimeLeft 
}: { 
  auction: any; 
  onFinalize: () => void; 
  onCancel: () => void; 
  isFinalizing: boolean; 
  isCancelling: boolean;
  formatTimeLeft: (endTime: bigint | number) => string;
}) {
  const [nftData, setNftData] = useState<{ image?: string; name?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const fetchNFTData = async () => {
      try {
        const client = createCampPublicClient();

        const ERC721_ABI = [
          { name: 'tokenURI', type: 'function', stateMutability: 'view', inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [{ type: 'string' }] }
        ] as const;

        const tokenUri = await client.readContract({
          address: (auction.nftContract || DEFAULT_IP_NFT_CONTRACT) as `0x${string}`,
          abi: ERC721_ABI,
          functionName: 'tokenURI',
          args: [BigInt(auction.tokenId)],
        }) as string;

        const metaUrl = tokenUri?.startsWith('ipfs://') ? tokenUri.replace('ipfs://', 'https://ipfs.io/ipfs/') : tokenUri;
        if (metaUrl) {
          const metadata = await fetch(metaUrl, { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null);
          setNftData({
            image: metadata?.image?.replace('ipfs://', 'https://ipfs.io/ipfs/'),
            name: metadata?.name
          });
        }
      } catch (error) {
        console.error('Error fetching NFT data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchNFTData();
  }, [auction]);

  const handleCopyTokenId = () => {
    navigator.clipboard.writeText(auction.tokenId.toString());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-white border border-soft-line rounded-xl overflow-hidden hover:border-soft-line transition-all">
      {/* NFT Image */}
      <div className="aspect-square bg-soft-surface-sunken relative">
        {loading ? (
          <div className="w-full h-full flex items-center justify-center">
            <div className="text-gray-500">Loading...</div>
          </div>
        ) : nftData?.image ? (
          <img 
            src={nftData.image} 
            alt={nftData.name || `Token #${auction.tokenId}`}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-soft-ink-soft">
            <span className="text-4xl">🖼️</span>
          </div>
        )}
        
        {/* Auction ID Badge */}
        <div className="absolute top-2 left-2 px-2 py-1 bg-black/80 rounded text-xs text-soft-ink font-semibold">
          Auction #{auction.auctionId}
        </div>
      </div>
      
      {/* Card Content */}
      <div className="p-3 sm:p-4">
        <h4 className="text-soft-ink font-semibold text-lg mb-1">
          {nftData?.name || `Token #${auction.tokenId}`}
        </h4>
        
        {/* Token ID with copy */}
        <div className="flex items-center gap-2 mb-3">
          <span className="text-soft-ink-muted text-sm">
            ID: {auction.tokenId.toString().slice(0, 8)}...{auction.tokenId.toString().slice(-6)}
          </span>
          <button
            onClick={handleCopyTokenId}
            className="text-soft-ink-muted hover:text-soft-ink transition-colors text-sm"
            title="Copy full token ID"
          >
            {copied ? '✓' : '📋'}
          </button>
        </div>
        
        {/* Auction Details */}
        <div className="space-y-1 text-sm mb-4">
          <div className="text-gray-400">
            Min: <span className="text-white">{formatEther(auction.minPrice)} CAMP</span>
          </div>
          <div className="text-gray-400">
            Highest: <span className="text-orange-400 font-semibold">{formatEther(auction.highestBid)} CAMP</span>
          </div>
          <div className="text-gray-400">
            Time left: <span className="text-yellow-400">{formatTimeLeft(auction.endTime)}</span>
          </div>
          {auction.highestBidder && (
            <div className="text-gray-400">
              Top bidder: <span className="text-white">{auction.highestBidder.slice(0,6)}...{auction.highestBidder.slice(-4)}</span>
            </div>
          )}
        </div>
        
        {/* Action Buttons */}
        <div className="flex gap-2">
          <button 
            onClick={onFinalize} 
            disabled={isFinalizing} 
            className={`flex-1 px-3 py-2 text-soft-ink rounded-lg disabled:opacity-50 transition-colors ${
              auction.highestBid >= auction.reservePrice
                ? 'bg-[#0b9a51] hover:bg-[#08803f]'
                : 'bg-soft-primary hover:bg-soft-primary-deep'
            }`}
            title={auction.highestBid < auction.reservePrice ? 
              `Reserve price (${formatEther(auction.reservePrice)} CAMP) not met. Will return funds to bidder.` : 
              'Reserve price met. Will transfer NFT to winner.'
            }
          >
            {isFinalizing ? 'Processing...' : (
              auction.highestBid >= auction.reservePrice ? 'Finalize' : 'Return Funds'
            )}
          </button>
          <button 
            onClick={onCancel} 
            disabled={isCancelling || auction.highestBid > 0n} 
            className="flex-1 px-3 py-2 bg-[#a32020] text-white rounded-lg hover:bg-[#8a1a1a] disabled:opacity-50 transition-colors"
            title={auction.highestBid > 0n ? "Cannot cancel auction with bids" : ""}
          >
            {isCancelling ? 'Processing...' : 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ListingCard component with NFT preview
function ListingCardWithPreview({ listing, onCancel, isCancelling }: { listing: any; onCancel: (id: number) => void; isCancelling: boolean }) {
  const [nftData, setNftData] = useState<{ image?: string; name?: string; type?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [terms, setTerms] = useState<{ price: bigint; duration: bigint } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const fetchNFTData = async () => {
      try {
        const client = createCampPublicClient();

        const ERC721_ABI = [
          { name: 'tokenURI', type: 'function', stateMutability: 'view', inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [{ type: 'string' }] }
        ] as const;

        const tokenUri = await client.readContract({
          address: listing.nftContract as `0x${string}`,
          abi: ERC721_ABI,
          functionName: 'tokenURI',
          args: [BigInt(listing.tokenId)],
        }) as string;

        const metaUrl = tokenUri?.startsWith('ipfs://') ? tokenUri.replace('ipfs://', 'https://ipfs.io/ipfs/') : tokenUri;
        if (metaUrl) {
          const metadata = await fetch(metaUrl, { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null);
          setNftData({
            image: metadata?.image?.replace('ipfs://', 'https://ipfs.io/ipfs/'),
            name: metadata?.name,
            type: metadata?.properties?.type || metadata?.attributes?.find((a: any) => a.trait_type === 'Media Type')?.value || 'image'
          });
        }
      } catch (error) {
        console.error('Error fetching NFT data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchNFTData();
    (async () => {
      try {
        if ((listing.nftContract as string)?.toLowerCase() !== DEFAULT_IP_NFT_CONTRACT.toLowerCase()) return;
        const client = createCampPublicClient();
        const t = await client.readContract({ address: MARKETPLACE_ADDRESS as `0x${string}`, abi: MARKETPLACE_ABI, functionName: 'getTerms', args: [BigInt(listing.tokenId)] }) as any;
        if ((t?.price ?? 0n) > 0n && (t?.duration ?? 0n) > 0n) setTerms({ price: t.price as bigint, duration: t.duration as bigint });
      } catch {}
    })();
  }, [listing.tokenId, listing.nftContract]);

  return (
    <div className="bg-white border border-soft-line rounded-xl p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row gap-4">
        {/* NFT Preview */}
        <div className="w-full sm:w-20 h-40 sm:h-20 rounded-lg overflow-hidden border border-soft-line flex-shrink-0">
          {loading ? (
            <div className="w-full h-full bg-white animate-pulse flex items-center justify-center">
              <div className="text-xs text-soft-ink-soft">⏳</div>
            </div>
          ) : nftData?.image ? (
            <img
              src={nftData.image}
              alt={nftData.name || 'NFT'}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-soft-surface-sunken flex items-center justify-center">
              <div className="text-xs text-soft-ink-soft">
                {nftData?.type === 'audio' ? '🎵' : 
                 nftData?.type === 'video' ? '🎥' : 
                 nftData?.type === 'text' ? '📄' : '📷'}
              </div>
            </div>
          )}
        </div>

        {/* Listing Info */}
        <div className="flex-1 min-w-0">
          <h4 className="text-soft-ink font-semibold text-base sm:text-lg mb-2 truncate">
            {nftData?.name || `Listing #${listing.listingId}`}
          </h4>
          <div className="space-y-1 text-sm">
            <div className="flex items-center gap-2">
              <p className="text-gray-400">
                Token ID: <span className="text-white">
                  {listing.tokenId?.toString().length > 20 
                    ? `${listing.tokenId.toString().slice(0, 8)}...${listing.tokenId.toString().slice(-6)}`
                    : listing.tokenId?.toString()}
                </span>
              </p>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(listing.tokenId?.toString() || '');
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="text-soft-ink-muted hover:text-soft-ink transition-colors text-xs"
                title="Copy full token ID"
              >
                {copied ? '✓' : '📋'}
              </button>
            </div>
            <p className="text-gray-400">
              Price: <span className="text-orange-400 font-bold">{listing.price ? formatEther(listing.price) : '0'} CAMP</span>
            </p>
            {terms && (
              <p className="text-gray-400">
                Terms: <span className="text-white font-semibold">{Number(terms.price) / 1e18} CAMP</span> / <span className="text-white">{Number(terms.duration) / 86400} days</span>
              </p>
            )}
            <p className="text-gray-400">
              Type: <span className="text-white">{nftData?.type || 'Unknown'}</span>
            </p>
            <p className="text-gray-400">
              Status: <span className="text-green-400">🟢 Active</span>
            </p>
            {listing.offers?.length > 0 && (
              <p className="text-gray-400">
                Offers: <span className="text-yellow-400">{listing.offers.length} pending</span>
              </p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2">
          <button
            onClick={() => onCancel(listing.listingId)}
            disabled={isCancelling}
            className="px-4 py-2 bg-red-500/80 text-white rounded-lg hover:bg-[#a32020] transition-colors disabled:opacity-50"
          >
            {isCancelling ? 'Cancelling...' : 'Cancel Listing'}
          </button>

          <a
                            href={`https://camp.cloud.blockscout.com/token/${listing.nftContract}/instance/${listing.tokenId}`}
            target="_blank"
            rel="noreferrer"
            className="px-4 py-2 bg-soft-surface-sunken text-soft-ink text-center rounded-lg hover:bg-soft-line transition-colors text-xs"
          >
            View NFT
          </a>
        </div>
      </div>
    </div>
  );
}

// Component for displaying bid cards with NFT preview (for My Bids section)
function BidCardWithNFTPreview({ 
  auction, 
  isWinning, 
  auctionEnded, 
  formatTimeLeft, 
  formatEther, 
  onClaimNFT, 
  onIncreaseBid, 
  isFinalizing 
}: { 
  auction: any; 
  isWinning: boolean; 
  auctionEnded: boolean; 
  formatTimeLeft: (endTime: bigint | number) => string;
  formatEther: (value: bigint) => string;
  onClaimNFT: () => void; 
  onIncreaseBid: () => void; 
  isFinalizing: boolean; 
}) {
  const [nftData, setNftData] = useState<{ image?: string; name?: string; type?: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchNFTData = async () => {
      try {
        const client = createCampPublicClient();

        const ERC721_ABI = [
          { name: 'tokenURI', type: 'function', stateMutability: 'view', inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [{ type: 'string' }] }
        ] as const;

        const tokenUri = await client.readContract({
          address: (auction.nftContract || DEFAULT_IP_NFT_CONTRACT) as `0x${string}`,
          abi: ERC721_ABI,
          functionName: 'tokenURI',
          args: [BigInt(auction.tokenId)],
        }) as string;

        const metaUrl = tokenUri?.startsWith('ipfs://') ? tokenUri.replace('ipfs://', 'https://ipfs.io/ipfs/') : tokenUri;
        if (metaUrl) {
          const metadata = await fetch(metaUrl, { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null);
          setNftData({
            image: metadata?.image?.replace('ipfs://', 'https://ipfs.io/ipfs/'),
            name: metadata?.name,
            type: metadata?.properties?.type || 'Unknown'
          });
        }
      } catch (error) {
        console.error('Error fetching NFT data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchNFTData();
  }, [auction]);

  return (
    <div className={`bg-white border rounded-xl p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 ${
      isWinning ? 'border-transparent ring-2 ring-green-500/20' : 'border-gray-700'
    }`}>
      {/* NFT Image */}
      <div className="w-full sm:w-16 h-32 sm:h-16 bg-soft-surface-sunken rounded-lg overflow-hidden flex-shrink-0">
        {loading ? (
          <div className="w-full h-full flex items-center justify-center text-soft-ink-soft text-xs">
            Loading...
          </div>
        ) : nftData?.image ? (
          <img 
            src={nftData.image} 
            alt={nftData.name || `Token #${auction.tokenId}`}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-soft-ink-soft">
            <span className="text-2xl">🖼️</span>
          </div>
        )}
      </div>

      {/* Auction Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-white font-semibold">
            {nftData?.name || `Token #${auction.tokenId.toString().slice(0, 8)}...`}
          </span>
          <span className="text-soft-ink-muted text-sm">
            Auction #{auction.auctionId}
          </span>
          {isWinning && (
            <span className={`px-2 py-0.5 rounded text-xs font-bold ${
              auctionEnded ? 'bg-[#0b9a51] text-white' : 'bg-[#edfff4] border border-[#9de7bb] text-[#0b9a51] border border-transparent'
            }`}>
              {auctionEnded ? '🏆 WON!' : '✅ WINNING'}
            </span>
          )}
          {!isWinning && auction.highestBidder && (
            <span className="px-2 py-0.5 rounded bg-[#ffefef] border border-[#f3b4b4] text-[#a32020] border border-transparent text-xs font-bold">
              ❌ OUTBID
            </span>
          )}
        </div>
        
        <div className="text-soft-ink-muted text-sm">
          Min: {formatEther(auction.minPrice)} CAMP • 
          Highest: <span className={isWinning ? 'text-green-400 font-semibold' : ''}>{formatEther(auction.highestBid)} CAMP</span> • 
          Time left: <span className={auctionEnded ? 'text-red-400' : ''}>{formatTimeLeft(auction.endTime)}</span>
        </div>
        
        {auction.highestBidder && (
          <div className="text-soft-ink-muted text-sm">
            Top bidder: <span className={`${isWinning ? 'text-green-400' : 'text-white'}`}>
              {isWinning ? 'You' : `${auction.highestBidder.slice(0,6)}...${auction.highestBidder.slice(-4)}`}
            </span>
          </div>
        )}
      </div>

      {/* Action Button */}
      <div className="flex-shrink-0">
        {auctionEnded && isWinning ? (
          <button
            onClick={onClaimNFT}
            disabled={isFinalizing}
            className="px-4 py-2 bg-[#0b9a51] text-white rounded font-semibold hover:bg-[#08803f] disabled:opacity-50"
          >
            {isFinalizing ? 'Processing...' : 'Claim NFT'}
          </button>
        ) : !auctionEnded && (
          <button
            onClick={onIncreaseBid}
            className="px-4 py-2 bg-soft-primary text-white rounded hover:bg-soft-primary-deep"
          >
            {isWinning ? 'Increase Bid' : 'Bid Higher'}
          </button>
        )}
      </div>
    </div>
  );
}

// Modal for renewing access to NFT
function RenewAccessModal({ tokenId, terms, onClose }: { tokenId: string; terms: any; onClose: () => void }) {
  const { address } = useAccount();
  const [periods, setPeriods] = useState<string>('1');
  const [loading, setLoading] = useState(false);

  const { writeContract, data: hash, error } = useWriteContract();
  const { isLoading, isSuccess, isError } = useWaitForTransactionReceipt({ hash });

  const totalPrice = terms ? (Number(terms.price) / 1e18) * parseInt(periods || '1') : 0;
  const durationDays = terms ? Number(terms.duration) / 86400 : 0;

  const handleRenewAccess = async () => {
    if (!address || !periods || !terms) return;
    
    try {
      setLoading(true);
      writeContract({
        address: MARKETPLACE_ADDRESS as `0x${string}`,
        abi: MARKETPLACE_ABI,
        functionName: 'renewAccessOwner',
        args: [BigInt(tokenId), BigInt(periods)],
        value: parseEther(totalPrice.toString()),
      });
      toast.loading('Renewing access...');
    } catch (error: any) {
      toast.error('Failed to renew access');
      console.error('Renew access error:', error);
    } finally {
      setLoading(false);
    }
  };

  if (isSuccess) {
    toast.dismiss();
    toast.success('Access renewed successfully!');
    setTimeout(onClose, 2000);
  }

  if (isError) {
    toast.dismiss();
    toast.error('Access renewal failed');
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={onClose}>
      <div className="bg-white border border-soft-line rounded-[26px] max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-soft-ink">Renew Access</h2>
          <button onClick={onClose} className="text-soft-ink-muted hover:text-soft-ink">✕</button>
        </div>

        <div className="space-y-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <p className="text-soft-ink-muted text-sm">Token ID:</p>
              <div className="flex items-center gap-1">
                <span className="text-soft-ink text-sm font-mono">#{tokenId.slice(0, 8)}...{tokenId.slice(-8)}</span>
                <button
                  onClick={() => navigator.clipboard.writeText(tokenId)}
                  className="px-2 py-1 bg-soft-surface-sunken hover:bg-soft-surface-sunken text-soft-ink-muted text-xs rounded transition-colors"
                  title="Copy full Token ID"
                >
                  📋
                </button>
              </div>
            </div>
            {terms && (
              <div className="bg-white rounded-lg p-3 text-sm">
                <p className="text-gray-400">Price per period: <span className="text-white font-semibold">{(Number(terms.price) / 1e18).toFixed(4)} CAMP</span></p>
                <p className="text-gray-400">Duration per period: <span className="text-white">{durationDays} days</span></p>
              </div>
            )}
          </div>

          <div>
            <label className="block text-soft-ink-muted text-sm font-medium mb-2">
              Number of periods to renew
            </label>
            <input
              type="number"
              min="1"
              max="365"
              value={periods}
              onChange={(e) => setPeriods(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-soft-line rounded-lg text-soft-ink focus:outline-none focus:border-cyan-500"
              placeholder="1"
            />
          </div>

          <div className="bg-cyan-900/30 border border-cyan-500/30 rounded-lg p-3">
            <p className="text-soft-info text-sm">
              <span className="font-medium">Total cost:</span> {totalPrice.toFixed(4)} CAMP
            </p>
            <p className="text-soft-info text-xs mt-1">
              This will extend your access by {parseInt(periods || '1') * durationDays} days
            </p>
          </div>

          <button
            onClick={handleRenewAccess}
            disabled={loading || isLoading || !periods || parseInt(periods) < 1}
            className="w-full px-4 py-3 bg-soft-primary text-white rounded-lg font-medium hover:bg-soft-primary-deep disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {loading || isLoading ? 'Renewing...' : `Renew Access (${totalPrice.toFixed(4)} CAMP)`}
          </button>
        </div>
      </div>
    </div>
  );
}

import { NextRequest, NextResponse } from 'next/server';

const BASECAMP_API_URL = 'https://basecamp.cloud.blockscout.com/api/v2';
const CAMP_NFT_CONTRACT = '0x1eD74B27f846C699A90926daD057A7f6FD22C126';

interface WalletStats {
  transactions: number;
  tokens: number;
  nfts: number;
  contracts: number;
  transactionsPoints: number;
  tokensPoints: number;
  nftsPoints: number;
  contractsPoints: number;
  hasCampNFT: boolean;
  campNFTDetails?: {
    contractAddress: string;
    tokenId: string;
    name: string;
    image?: string;
  };
}

// Point multipliers based on the image data
const POINT_MULTIPLIERS = {
  transactions: 15, // 33570 / 2246 ≈ 15
  tokens: 50,       // 22350 / 447 = 50
  nfts: 100,        // 136400 / 1364 = 100
  contracts: 25     // 11125 / 445 = 25
};

async function fetchWalletData(address: string): Promise<WalletStats> {
  try {
    // Fetch transactions count
    const transactionsResponse = await fetch(
      `${BASECAMP_API_URL}/addresses/${address}/transactions?filter=to%20%7C%20from`,
      {
        headers: {
          'Accept': 'application/json',
        },
      }
    );
    
    // Fetch tokens
    const tokensResponse = await fetch(
      `${BASECAMP_API_URL}/addresses/${address}/tokens`,
      {
        headers: {
          'Accept': 'application/json',
        },
      }
    );
    
    // Fetch NFTs
    const nftsResponse = await fetch(
      `${BASECAMP_API_URL}/addresses/${address}/nft`,
      {
        headers: {
          'Accept': 'application/json',
        },
      }
    );
    
    // For contracts, we'll check if the address is a contract
    const addressResponse = await fetch(
      `${BASECAMP_API_URL}/addresses/${address}`,
      {
        headers: {
          'Accept': 'application/json',
        },
      }
    );

    let transactions = 0;
    let tokens = 0;
    let nfts = 0;
    let contracts = 0;
    let hasCampNFT = false;
    let campNFTDetails = undefined;

    // Parse transactions
    if (transactionsResponse.ok) {
      const transactionsData = await transactionsResponse.json();
      // Count total transactions (sent + received)
      if (transactionsData.items) {
        transactions = transactionsData.items.length;
        
        // If there are next_page_params, we need to estimate total count
        // For now, we'll use the current page count as a base
        if (transactionsData.next_page_params) {
          // Estimate based on pagination - this is a rough estimate
          transactions = Math.min(transactions * 20, 10000); // Cap at reasonable number
        }
      }
    }

    // Parse tokens
    if (tokensResponse.ok) {
      const tokensData = await tokensResponse.json();
      if (tokensData.items) {
        tokens = tokensData.items.length;
      }
    }

    // Parse NFTs
    if (nftsResponse.ok) {
      const nftsData = await nftsResponse.json();
      if (nftsData.items) {
        nfts = nftsData.items.length;
        
        // Check for specific Camp NFT
        const campNFT = nftsData.items.find((nft: any) => 
          nft.token?.address?.toLowerCase() === CAMP_NFT_CONTRACT.toLowerCase()
        );
        
        if (campNFT) {
          hasCampNFT = true;
          campNFTDetails = {
            contractAddress: campNFT.token?.address || CAMP_NFT_CONTRACT,
            tokenId: campNFT.id || '1',
            name: campNFT.token?.name || 'MSxCAMP NFT',
            image: campNFT.image_url || '/MSxCAMP.png'
          };
        }
      }
    }

    // Parse contracts (if address has created contracts)
    if (addressResponse.ok) {
      const addressData = await addressResponse.json();
      // This is simplified - in reality we'd need to check created contracts
      contracts = addressData.is_contract ? 1 : 0;
    }

    // Calculate points
    const transactionsPoints = transactions * POINT_MULTIPLIERS.transactions;
    const tokensPoints = tokens * POINT_MULTIPLIERS.tokens;
    const nftsPoints = nfts * POINT_MULTIPLIERS.nfts;
    const contractsPoints = contracts * POINT_MULTIPLIERS.contracts;

    return {
      transactions,
      tokens,
      nfts,
      contracts,
      transactionsPoints,
      tokensPoints,
      nftsPoints,
      contractsPoints,
      hasCampNFT,
      campNFTDetails,
    };

  } catch (error) {
    console.error('Error fetching wallet data:', error);
    // Return default values on error
    return {
      transactions: 0,
      tokens: 0,
      nfts: 0,
      contracts: 0,
      transactionsPoints: 0,
      tokensPoints: 0,
      nftsPoints: 0,
      contractsPoints: 0,
      hasCampNFT: false,
      campNFTDetails: undefined,
    };
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.nextUrl);
    const address = searchParams.get('address');

    if (!address) {
      return NextResponse.json(
        { error: 'Address parameter is required' },
        { status: 400 }
      );
    }

    // Validate address format (basic check)
    if (!address.match(/^0x[a-fA-F0-9]{40}$/)) {
      return NextResponse.json(
        { error: 'Invalid address format' },
        { status: 400 }
      );
    }

    const walletStats = await fetchWalletData(address);

    return NextResponse.json({
      success: true,
      data: walletStats,
      address,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 
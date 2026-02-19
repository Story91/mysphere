import { NextRequest, NextResponse } from 'next/server';

const BASECAMP_API_URL = 'https://camp.cloud.blockscout.com/api/v2';
const CAMP_NFT_CONTRACT = '0x57CC99c9E1942a34a0cfF7FCC27c227455f14587';

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
    // Fetch ALL transactions with pagination
    let allTransactions = [];
    let nextPageParams = null;
    let pageCount = 0;
    const maxPages = 10; // Zwiększam limit stron dla portfeli
    
    console.log(`🔍 Pobieranie wszystkich transakcji dla portfela: ${address}`);
    
    do {
      // Buduj URL z parametrami paginacji
      let apiUrl = `${BASECAMP_API_URL}/addresses/${address}/transactions?filter=to%20%7C%20from`;
      
      if (nextPageParams) {
        // Dodaj parametry następnej strony
        const params = new URLSearchParams(nextPageParams);
        apiUrl += `&${params.toString()}`;
      }
      
      console.log(`📡 Pobieranie strony ${pageCount + 1} dla portfela: ${apiUrl}`);
      
      const transactionsResponse = await fetch(apiUrl, {
        headers: {
          'Accept': 'application/json',
        },
      });
      
      if (!transactionsResponse.ok) {
        console.warn(`❌ Błąd API dla strony ${pageCount + 1}: ${transactionsResponse.status}`);
        break;
      }
      
      const txData = await transactionsResponse.json();
      
      if (txData && txData.items && Array.isArray(txData.items)) {
        allTransactions.push(...txData.items);
        nextPageParams = txData.next_page_params;
        pageCount++;
        
        console.log(`📄 Strona ${pageCount}: ${txData.items.length} transakcji, razem: ${allTransactions.length}`);
        
        // Sprawdź czy są następne strony
        if (!nextPageParams || pageCount >= maxPages) {
          break;
        }
      } else {
        console.warn(`⚠️ Nieprawidłowa struktura danych na stronie ${pageCount + 1}`);
        break;
      }
      
    } while (nextPageParams && pageCount < maxPages);
    
    console.log(`✅ Portfel ${address}: ${allTransactions.length} transakcji (${pageCount} stron)`);
    
    // Teraz pobierz pozostałe dane (bez zmian)
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
    
    // Fetch Internal Transactions (contracts calls)
    const internalTxnsResponse = await fetch(
      `${BASECAMP_API_URL}/addresses/${address}/internal-transactions`,
      {
        headers: {
          'Accept': 'application/json',
        },
      }
    );

    // Get address details to check for created contracts count
    const addressResponse = await fetch(
      `${BASECAMP_API_URL}/addresses/${address}`,
      {
        headers: {
          'Accept': 'application/json',
        },
      }
    );

    let transactions = allTransactions.length; // Użyj rzeczywistej liczby z paginacji
    let tokens = 0;
    let nfts = 0;
    let contracts = 0;
    let hasCampNFT = false;
    let campNFTDetails = undefined;

    // Parse address details for additional info (ale transakcje już mamy z paginacji)
    let addressData = null;
    if (addressResponse.ok) {
      addressData = await addressResponse.json();
      console.log('Address data:', {
        address,
        api_transactions_count: addressData.transactions_count,
        paginated_transactions: transactions,
        timestamp: new Date().toISOString()
      });
    } else {
      console.error('Address API failed:', addressResponse.status, addressResponse.statusText);
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

    // Parse internal transactions (contract calls)
    if (internalTxnsResponse.ok) {
      const internalTxnsData = await internalTxnsResponse.json();
      if (internalTxnsData.items) {
        contracts = internalTxnsData.items.length;
        console.log('Internal transactions data:', {
          address,
          internalTxnsCount: contracts,
          totalItems: internalTxnsData.items.length
        });
      }
    } else {
              console.error('Unique Contracts API failed:', internalTxnsResponse.status, internalTxnsResponse.statusText);
    }

    // Calculate points
    const transactionsPoints = transactions * POINT_MULTIPLIERS.transactions;
    const tokensPoints = tokens * POINT_MULTIPLIERS.tokens;
    const nftsPoints = nfts * POINT_MULTIPLIERS.nfts;
    const contractsPoints = contracts * POINT_MULTIPLIERS.contracts;

    const result = {
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

    console.log('Final wallet stats:', {
      address,
      result,
      timestamp: new Date().toISOString()
    });

    return result;

  } catch (error) {
    console.error('Error fetching wallet data:', error);
    
    // Log more details for debugging
    console.error('Error details:', {
      address,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
    
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
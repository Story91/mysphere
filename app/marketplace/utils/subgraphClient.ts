/**
 * Subgraph client for IP Marketplace
 * Handles all GraphQL queries to reduce RPC load
 */

const SUBGRAPH_ENDPOINTS = {
  ipmarket: 'https://api.goldsky.com/api/public/project_cmem23dhric5h01xe8u6jgs7j/subgraphs/IpMarket/1.0.0/gn',
  ipmarket3: 'https://api.goldsky.com/api/public/project_cmem23dhric5h01xe8u6jgs7j/subgraphs/IpMarket3/1.0.0/gn'
};

const GOLDSKY_API_KEY = process.env.NEXT_PUBLIC_GOLDSKY_API_KEY || '';

// Rate limiting info from Goldsky docs: 50 requests per 10 seconds for public endpoints
const RATE_LIMIT = {
  requests: 50,
  windowMs: 10 * 1000, // 10 seconds
  timestamps: [] as number[]
};

interface SubgraphResponse<T = any> {
  data?: T;
  errors?: Array<{
    message: string;
    path?: string[];
  }>;
}

class SubgraphClient {
  private baseUrl: string;

  constructor(endpoint: 'ipmarket' | 'ipmarket3' = 'ipmarket3') {
    this.baseUrl = SUBGRAPH_ENDPOINTS[endpoint];
  }

  private checkRateLimit(): boolean {
    const now = Date.now();
    
    // Remove timestamps older than the window
    RATE_LIMIT.timestamps = RATE_LIMIT.timestamps.filter(
      timestamp => now - timestamp < RATE_LIMIT.windowMs
    );
    
    // Check if we're under the limit
    if (RATE_LIMIT.timestamps.length >= RATE_LIMIT.requests) {
      console.warn('⚠️ Rate limit reached, waiting...');
      return false;
    }
    
    // Add current timestamp
    RATE_LIMIT.timestamps.push(now);
    return true;
  }

  private async query<T = any>(query: string, variables?: Record<string, any>): Promise<T> {
    // Check rate limit for public endpoints
    if (!GOLDSKY_API_KEY && !this.checkRateLimit()) {
      // Wait a bit before retrying
      await new Promise(resolve => setTimeout(resolve, 1000));
      if (!this.checkRateLimit()) {
        throw new Error('Rate limit exceeded. Please wait before making more requests.');
      }
    }

    const body = JSON.stringify({ query, variables });
    
    console.log('🔍 Subgraph Query:', { 
      url: this.baseUrl,
      query: query.replace(/\s+/g, ' ').trim(), 
      variables,
      hasApiKey: !!GOLDSKY_API_KEY,
      rateLimitStatus: `${RATE_LIMIT.timestamps.length}/${RATE_LIMIT.requests}`
    });
    
    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(GOLDSKY_API_KEY && { 'Authorization': `Bearer ${GOLDSKY_API_KEY}` })
        },
        body,
        cache: 'no-store' // Always get fresh data for marketplace
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ HTTP Error:', { status: response.status, statusText: response.statusText, body: errorText });
        
        // Special handling for rate limit (429) errors
        if (response.status === 429) {
          throw new Error('Rate limit exceeded. Consider upgrading to Goldsky Scale plan for higher limits.');
        }
        
        throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
      }

      const result: SubgraphResponse<T> = await response.json();
      
      if (result.errors?.length) {
        console.error('❌ Subgraph GraphQL errors:', result.errors);
        throw new Error(`GraphQL errors: ${result.errors.map(e => e.message).join(', ')}`);
      }

      console.log('✅ Subgraph response received:', { 
        dataKeys: Object.keys(result.data || {}),
        rateLimitRemaining: `${RATE_LIMIT.requests - RATE_LIMIT.timestamps.length}/${RATE_LIMIT.requests}`
      });
      return result.data as T;
    } catch (error) {
      console.error('❌ Subgraph query failed:', error);
      throw error;
    }
  }

  /**
   * Test basic subgraph connectivity
   */
  async testConnection() {
    const query = `
      query {
        _meta {
          deployment
          hasIndexingErrors
          block {
            number
          }
        }
      }
    `;
    
    try {
      const result = await this.query(query);
      console.log('🎯 Subgraph connection test successful:', result);
      return { success: true, data: result };
    } catch (error) {
      console.error('🚫 Subgraph connection test failed:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * Get active listings with pagination
   */
  async getActiveListings(params: {
    first?: number;
    skip?: number;
    orderBy?: 'id' | 'listingId' | 'price';
    orderDirection?: 'asc' | 'desc';
  } = {}) {
    const { first = 50, skip = 0, orderBy = 'id', orderDirection = 'desc' } = params;
    
    const query = `
      query GetActiveListings($first: Int!, $skip: Int!, $orderBy: ListingCreated_orderBy!, $orderDirection: OrderDirection!) {
        listingCreateds(
          first: $first
          skip: $skip
          orderBy: $orderBy
          orderDirection: $orderDirection
        ) {
          id
          listingId
          seller
          tokenId
          price
        }
        
        # Get sold listings to filter out
        listingSolds {
          listingId
        }
        
        # Get cancelled listings to filter out  
        listingCancelleds {
          listingId
        }
      }
    `;

    const variables = { first, skip, orderBy, orderDirection };
    const result = await this.query(query, variables);
    
    // Filter out sold and cancelled listings client-side
    const soldListingIds = new Set(result.listingSolds?.map((sale: any) => sale.listingId) || []);
    const cancelledListingIds = new Set(result.listingCancelleds?.map((cancel: any) => cancel.listingId) || []);
    
    const activeListings = result.listingCreateds?.filter((listing: any) => 
      !soldListingIds.has(listing.listingId) && !cancelledListingIds.has(listing.listingId)
    ) || [];

    return {
      listings: activeListings,
      totalActive: activeListings.length,
      totalCreated: result.listingCreateds?.length || 0
    };
  }

  /**
   * Get active auctions with pagination
   */
  async getActiveAuctions(params: {
    first?: number;
    skip?: number;
    orderBy?: 'id' | 'auctionId' | 'minPrice';
    orderDirection?: 'asc' | 'desc';
  } = {}) {
    const { first = 50, skip = 0, orderBy = 'id', orderDirection = 'desc' } = params;
    
    const query = `
      query GetActiveAuctions($first: Int!, $skip: Int!, $orderBy: AuctionCreated_orderBy!, $orderDirection: OrderDirection!) {
        auctionCreateds(
          first: $first
          skip: $skip
          orderBy: $orderBy
          orderDirection: $orderDirection
        ) {
          id
          auctionId
          seller
          tokenId
          minPrice
          endTime
        }
        
        # Get finalized auctions to filter out
        auctionFinalizeds {
          auctionId
        }
        
        # Get cancelled auctions to filter out
        auctionCancelleds {
          auctionId
        }
      }
    `;

    const variables = { first, skip, orderBy, orderDirection };
    const result = await this.query(query, variables);
    
    // Filter out finalized and cancelled auctions, plus expired ones
    const finalizedAuctionIds = new Set(result.auctionFinalizeds?.map((auction: any) => auction.auctionId) || []);
    const cancelledAuctionIds = new Set(result.auctionCancelleds?.map((auction: any) => auction.auctionId) || []);
    const currentTime = Math.floor(Date.now() / 1000);
    
    const activeAuctions = result.auctionCreateds?.filter((auction: any) => 
      !finalizedAuctionIds.has(auction.auctionId) && 
      !cancelledAuctionIds.has(auction.auctionId) &&
      parseInt(auction.endTime) > currentTime // Not expired
    ) || [];

    return {
      auctions: activeAuctions,
      totalActive: activeAuctions.length,
      totalCreated: result.auctionCreateds?.length || 0
    };
  }

  /**
   * Get recent marketplace activity (sales, auctions, etc.)
   */
  async getMarketplaceActivity(limit: number = 20) {
    const query = `
      query GetMarketplaceActivity($limit: Int!) {
        listingSolds(first: $limit, orderBy: id, orderDirection: desc) {
          id
          listingId
          buyer
          price
        }
        
        auctionFinalizeds(first: $limit, orderBy: id, orderDirection: desc) {
          id
          auctionId
          winner
          amount
          sold
        }
        
        accessPurchaseds(first: $limit, orderBy: id, orderDirection: desc) {
          id
          tokenId
          buyer
          periods
          expiryTime
        }
      }
    `;

    const variables = { limit };
    return await this.query(query, variables);
  }

  /**
   * Get user's listings
   */
  async getUserListings(userAddress: string, activeOnly: boolean = false) {
    const query = `
      query GetUserListings($seller: String!) {
        listingCreateds(where: { seller: $seller }, orderBy: id, orderDirection: desc) {
          id
          listingId
          seller
          tokenId
          price
        }
        ${activeOnly ? `
        listingSolds(where: { seller: $seller }) {
          listingId
        }
        listingCancelleds(where: { seller: $seller }) {
          listingId
        }
        ` : ''}
      }
    `;

    const variables = { seller: userAddress.toLowerCase() };
    const result = await this.query(query, variables);
    
    if (activeOnly) {
      const soldListingIds = new Set(result.listingSolds?.map((sale: any) => sale.listingId) || []);
      const cancelledListingIds = new Set(result.listingCancelleds?.map((cancel: any) => cancel.listingId) || []);
      
      const activeListings = result.listingCreateds?.filter((listing: any) => 
        !soldListingIds.has(listing.listingId) && !cancelledListingIds.has(listing.listingId)
      ) || [];
      
      return { listings: activeListings };
    }
    
    return result;
  }

  /**
   * Get marketplace statistics
   */
  async getMarketplaceStats() {
    const query = `
      query GetMarketplaceStats {
        listingCreateds {
          id
          price
        }
        listingSolds {
          id
          price
        }
        auctionCreateds {
          id
        }
        auctionFinalizeds {
          id
          amount
        }
      }
    `;

    const result = await this.query(query);
    
    const totalListings = result.listingCreateds?.length || 0;
    const totalSales = result.listingSolds?.length || 0;
    const totalAuctions = result.auctionCreateds?.length || 0;
    
    // Calculate volume from sales
    const salesVolume = result.listingSolds?.reduce((sum: number, sale: any) => {
      return sum + (parseFloat(sale.price) / 1e18); // Convert from wei to ETH
    }, 0) || 0;
    
    const auctionVolume = result.auctionFinalizeds?.reduce((sum: number, auction: any) => {
      return sum + (parseFloat(auction.amount) / 1e18); // Convert from wei to ETH  
    }, 0) || 0;
    
    return {
      totalListings,
      totalSales,
      totalAuctions,
      totalVolume: salesVolume + auctionVolume,
      salesVolume,
      auctionVolume
    };
  }
}

// Export singleton instance
export const subgraphClient = new SubgraphClient('ipmarket3');
export default SubgraphClient;

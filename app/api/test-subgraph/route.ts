import { NextRequest, NextResponse } from 'next/server';

// Testujemy oba endpointy
const ENDPOINTS = {
  ipmarket: 'https://api.goldsky.com/api/public/project_cmem23dhric5h01xe8u6jgs7j/subgraphs/IpMarket/1.0.0/gn',
  ipmarket3: 'https://api.goldsky.com/api/public/project_cmem23dhric5h01xe8u6jgs7j/subgraphs/IpMarket3/1.0.0/gn'
};

// API Key - TYMCZASOWO - zastąp swoim kluczem
const GOLDSKY_API_KEY = process.env.GOLDSKY_API_KEY || 'WKLEJ_TUTAJ_SWOJ_API_KEY';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') || 'meta';
  const endpoint = searchParams.get('endpoint') || 'ipmarket'; // Domyślnie publiczny
  const limit = parseInt(searchParams.get('limit') || '10');
  
  const SUBGRAPH_URL = ENDPOINTS[endpoint as keyof typeof ENDPOINTS] || ENDPOINTS.ipmarket;

  try {
    let query = '';
    
    switch (action) {
      case 'meta':
        query = `
          query {
            _meta {
              deployment
              hasIndexingErrors
              block {
                number
                hash
              }
            }
          }
        `;
        break;
        
      case 'schema':
        query = `
          query {
            __type(name: "Query") {
              fields {
                name
                type {
                  name
                  kind
                }
              }
            }
          }
        `;
        break;
        
      case 'listings':
        query = `
          query {
            listingCreateds(first: ${limit}, orderBy: id, orderDirection: desc) {
              id
              listingId
              seller
              tokenId
              price
            }
          }
        `;
        break;
        
      case 'sales':
        query = `
          query {
            listingSolds(first: ${limit}, orderBy: id, orderDirection: desc) {
              id
              listingId
              buyer
              price
            }
          }
        `;
        break;
        
      case 'access':
        query = `
          query {
            accessPurchaseds(first: ${limit}, orderBy: id, orderDirection: desc) {
              id
              tokenId
              buyer
              periods
              expiryTime
            }
          }
        `;
        break;
        
      default:
        query = `
          query {
            _meta {
              block {
                number
              }
            }
          }
        `;
    }

    console.log(`Testing ${endpoint} - Action: ${action}`);
    console.log(`Query: ${query}`);

    const response = await fetch(SUBGRAPH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GOLDSKY_API_KEY}`,
      },
      body: JSON.stringify({ query }),
    });

    const data = await response.json();
    
    console.log(`${endpoint} Response:`, JSON.stringify(data, null, 2));
    
    if (!response.ok) {
      return NextResponse.json({ 
        error: `Request failed: ${response.status}`, 
        endpoint: SUBGRAPH_URL,
        details: data 
      }, { status: 400 });
    }

    if (data.errors) {
      return NextResponse.json({ 
        error: 'GraphQL errors', 
        endpoint: SUBGRAPH_URL,
        details: data.errors 
      }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      action,
      endpoint: SUBGRAPH_URL,
      data: data.data
    });

  } catch (error) {
    console.error(`Error testing ${endpoint}:`, error);
    return NextResponse.json(
      { 
        error: 'Request failed', 
        endpoint: SUBGRAPH_URL,
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}

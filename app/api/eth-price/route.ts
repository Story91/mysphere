import { NextResponse } from 'next/server';

let cachedData: any = null;
let lastFetch = 0;
const CACHE_DURATION = 60000; // 1 minuta

export async function GET() {
  try {
    // Sprawdź czy mamy aktualne dane w cache
    const now = Date.now();
    if (cachedData && (now - lastFetch) < CACHE_DURATION) {
      return NextResponse.json(cachedData);
    }

    const response = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd&include_24hr_change=true',
      {
        headers: {
          'Accept': 'application/json',
          'Cache-Control': 'no-cache'
        },
        next: { revalidate: 60 }
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    
    // Aktualizuj cache
    cachedData = data;
    lastFetch = now;

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching ETH price:', error);
    return NextResponse.json(
      { error: 'Failed to fetch ETH price' },
      { status: 500 }
    );
  }
} 
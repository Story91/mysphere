import { NextResponse } from 'next/server';

const CONTRACT_ADDRESS = "0xdE9f006A063eeE1f0dDb15A8198E573B36aCc070";
const BASESCAN_API_KEY = process.env.NEXT_PUBLIC_BASESCAN_API_KEY || 'YB9ZQ71MVDJU3CQQXFJ6GQ4Y17MPKEQCBN';
const BASESCAN_API_URL = `https://api-sepolia.basescan.org/api?module=account&action=txlist&address=${CONTRACT_ADDRESS}&startblock=0&endblock=99999999&sort=asc&apikey=${BASESCAN_API_KEY}`;

// Prosty cache w pamięci
let cachedData: { count: number; timestamp: number } | null = null;
const CACHE_DURATION = 60 * 1000; // 1 minuta w milisekundach

export async function GET() {
  const now = Date.now();

  // Sprawdź, czy mamy ważne dane w cache
  if (cachedData && now - cachedData.timestamp < CACHE_DURATION) {
    return NextResponse.json({ count: cachedData.count, source: 'cache' });
  }

  try {
    const response = await fetch(BASESCAN_API_URL);
    if (!response.ok) {
      // Jeśli zapytanie do API się nie powiedzie, ale mamy stare dane w cache, zwróć je
      if (cachedData) {
        return NextResponse.json({ count: cachedData.count, source: 'stale-cache' });
      }
      throw new Error(`Failed to fetch from Basescan API: ${response.statusText}`);
    }
    const data = await response.json();

    if (data.status === '1' && Array.isArray(data.result)) {
      const transactionCount = data.result.length;
      
      // Zaktualizuj cache
      cachedData = {
        count: transactionCount,
        timestamp: now,
      };

      return NextResponse.json({ count: transactionCount, source: 'api' });
    } else {
      if (data.message === 'No transactions found') {
        // Zaktualizuj cache z zerową wartością
        cachedData = {
            count: 0,
            timestamp: now,
        };
        return NextResponse.json({ count: 0, source: 'api' });
      }
      // Jeśli API zwróci błąd, zwróć stare dane z cache, jeśli istnieją
      if (cachedData) {
        return NextResponse.json({ count: cachedData.count, source: 'stale-cache-on-error' });
      }
      console.error('Basescan API error:', data.message);
      throw new Error(`Basescan API Error: ${data.message}`);
    }
  } catch (error) {
    // Jeśli wystąpi błąd sieciowy, również spróbuj zwrócić stare dane
    if (cachedData) {
        return NextResponse.json({ count: cachedData.count, source: 'stale-cache-on-exception' });
    }
    console.error('Error fetching transaction count:', error);
    return NextResponse.json({ error: 'Failed to fetch transaction count' }, { status: 500 });
  }
} 
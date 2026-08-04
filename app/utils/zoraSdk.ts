import { setApiKey, getCoin, getCoins } from '@zoralabs/coins-sdk';

// Cache na 10 minut (w milisekundach)
const CACHE_EXPIRY = 10 * 60 * 1000;

// Ustaw API key dla Zora - należy zastąpić rzeczywistym kluczem
// lub ustawić w zmiennych środowiskowych
// UWAGA: NEXT_PUBLIC_ZORA_API_KEY nie jest ustawiony w env - przekazywany jest pusty string,
// wiec SDK Zory dziala na limitach anonimowych (rate limit dla ruchu bez klucza).
setApiKey(process.env.NEXT_PUBLIC_ZORA_API_KEY || '');

// Cache dla wyników zapytań
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

interface CoinCache {
  [address: string]: CacheEntry<any>;
}

// Cache dla pojedynczych tokenów
const coinCache: CoinCache = {};

/**
 * Pobiera dane o tokenie Zora z cache lub z API
 * @param address Adres kontraktu tokenu
 * @returns Dane o tokenie
 */
export const getCachedCoin = async (address: string) => {
  const normalizedAddress = address.toLowerCase();
  const now = Date.now();
  
  // Sprawdź cache
  if (coinCache[normalizedAddress] && 
      now - coinCache[normalizedAddress].timestamp < CACHE_EXPIRY) {
    console.log(`Using cached data for token ${normalizedAddress}`);
    return coinCache[normalizedAddress].data;
  }
  
  // Pobierz świeże dane
  try {
    console.log(`Fetching fresh data for token ${normalizedAddress}`);
    const response = await getCoin({ address: normalizedAddress });
    
    // Zapisz w cache
    coinCache[normalizedAddress] = {
      data: response,
      timestamp: now
    };
    
    return response;
  } catch (error) {
    console.error(`Error fetching data for token ${normalizedAddress}:`, error);
    throw error;
  }
};

/**
 * Pobiera dane o wielu tokenach Zora jednocześnie
 * @param addresses Adresy kontraktów tokenów
 * @returns Dane o tokenach
 */
export const getCachedCoins = async (addresses: string[]) => {
  if (!addresses.length) return [];
  
  const now = Date.now();
  const addressesToFetch: string[] = [];
  const results: any[] = [];
  
  // Sprawdź które adresy są w cache
  addresses.forEach(address => {
    const normalizedAddress = address.toLowerCase();
    
    if (coinCache[normalizedAddress] && 
        now - coinCache[normalizedAddress].timestamp < CACHE_EXPIRY) {
      console.log(`Using cached data for token ${normalizedAddress}`);
      results.push(coinCache[normalizedAddress].data);
    } else {
      addressesToFetch.push(normalizedAddress);
    }
  });
  
  // Pobierz brakujące dane
  if (addressesToFetch.length > 0) {
    try {
      console.log(`Batch fetching data for ${addressesToFetch.length} tokens`);
      // Uwaga: getCoins może mieć ograniczenie na liczbę adresów
      // Dla większej liczby tokenów, należy podzielić zapytanie na partie
      const responses = await Promise.all(
        addressesToFetch.map(address => getCoin({ address }))
      );
      
      // Zapisz w cache
      responses.forEach((response, index) => {
        const address = addressesToFetch[index];
        coinCache[address] = {
          data: response,
          timestamp: now
        };
        results.push(response);
      });
    } catch (error) {
      console.error(`Error fetching batch token data:`, error);
      throw error;
    }
  }
  
  return results;
};

export const clearCache = () => {
  Object.keys(coinCache).forEach(key => {
    delete coinCache[key];
  });
  console.log('Zora SDK cache cleared');
};

export default {
  getCachedCoin,
  getCachedCoins,
  clearCache
}; 
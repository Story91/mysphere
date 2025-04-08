// Funkcja do instalacji w aplikacji
export function installMerkleProxy() {
  if (typeof window !== 'undefined') {
    // Przechowujemy oryginalną implementację fetch
    const originalFetch = window.fetch;
    
    // Nadpisujemy globalną funkcję fetch
    window.fetch = async function(input, init) {
      // Pobieramy URL z żądania
      const url = input instanceof Request ? input.url : String(input);
      
      // Sprawdzamy, czy URL wskazuje na merkle.io
      if (url.includes('eth.merkle.io')) {
        console.log('Intercepting request to eth.merkle.io');
        
        // Przekierowujemy na nasze proxy
        const proxyUrl = '/api/merkle-proxy';
        
        // Tworzymy nowe żądanie do naszego proxy
        let body = init?.body;
        
        // Jeśli input jest obiektem Request, musimy pobrać jego ciało
        if (input instanceof Request && !init?.body) {
          try {
            body = await input.clone().text();
          } catch (error) {
            console.error('Failed to clone request body:', error);
          }
        }
        
        try {
          // Wywołujemy nasze proxy
          return await originalFetch(proxyUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(init?.headers || {}),
            },
            body: body,
            ...init,
          });
        } catch (error) {
          console.error('Error with proxy request:', error);
          // W przypadku niepowodzenia, zwracamy komunikat o błędzie
          return new Response(JSON.stringify({ error: 'Proxy request failed' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }
      
      // Dla wszystkich innych URL-i, używamy oryginalnej implementacji
      // ale dodajemy obsługę błędów dla Basescan API
      try {
        return await originalFetch(input, init);
      } catch (error) {
        console.error(`Fetch error for ${url}:`, error);
        
        // Jeśli to żądanie do Basescan, zwracamy pusty wynik aby uniknąć błędów UI
        if (url.includes('api.basescan.org')) {
          console.log('Returning empty response for Basescan API');
          const emptyResponse = url.includes('tokennfttx') || url.includes('tokentx') || url.includes('txlist')
            ? { status: "1", message: "OK", result: [] }
            : { status: "1", message: "OK", result: "0" };
            
          return new Response(JSON.stringify(emptyResponse), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        
        // Dla innych URL-i przepuszczamy błąd dalej
        throw error;
      }
    };
  }
} 
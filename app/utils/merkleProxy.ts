/**
 * Przekierowanie zadan do eth.merkle.io na publiczny RPC z CORS.
 *
 * Dlaczego to wciaz istnieje, skoro wagmi ma juz transport dla mainnetu (chain 1
 * -> eth.llamarpc.com w app/providers.tsx): komponenty Identity/useName z
 * OnchainKit tworza WLASNEGO klienta viem do rozwiazywania ENS/Basename i nie
 * korzystaja z transportow wagmi. Viem domyslnie strzela wtedy w eth.merkle.io,
 * ktore potrafi zwracac bledy w petli.
 *
 * Co zostalo usuniete wzgledem poprzedniej wersji:
 *  - try/catch owijajacy KAZDY request aplikacji (podatek na kazde fetch),
 *  - fabrykowanie odpowiedzi 200 dla api.basescan.org - ten host jest wolany
 *    wylacznie z trasy serwerowej /api/refresh-stats, wiec branch nigdy nie
 *    dzialal w przegladarce, a maskowal prawdziwe bledy sieciowe.
 *
 * Requesty niepasujace do eth.merkle.io ida teraz prosto do oryginalnego fetch,
 * bez zadnej dodatkowej pracy.
 */

const MERKLE_HOST = 'eth.merkle.io';
const FALLBACK_RPC = 'https://ethereum-rpc.publicnode.com';

let installed = false;

export function installMerkleProxy() {
  if (typeof window === 'undefined' || installed) return;
  installed = true;

  const originalFetch = window.fetch;

  window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
    const url = input instanceof Request ? input.url : String(input);

    if (!url.includes(MERKLE_HOST)) {
      return originalFetch(input, init);
    }

    return (async () => {
      let body = init?.body;
      if (input instanceof Request && !init?.body) {
        try {
          body = await input.clone().text();
        } catch (error) {
          console.error('Failed to clone request body:', error);
        }
      }

      try {
        return await originalFetch(FALLBACK_RPC, {
          ...init,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(init?.headers || {}),
          },
          body,
        });
      } catch (error) {
        console.error('Error with fallback RPC request:', error);
        return new Response(JSON.stringify({ error: 'RPC request failed' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    })();
  } as typeof window.fetch;
}

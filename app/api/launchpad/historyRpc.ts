/**
 * SKAD SERWER BIERZE RPC DO SKANU HISTORII.
 *
 * ===========================================================================
 * DLACZEGO LISTA, A NIE JEDEN ADRES
 * ===========================================================================
 * 13 sierpnia 2026 w `.env.local` stal endpoint Alchemy, ktory na kazde
 * zapytanie odpowiadal `401 Must be authenticated!`. Trasa historii czytala go
 * jako pierwszy i - gdyby byl jedynym wyborem - KAZDY skan konczylby sie
 * bledem, mimo ze publiczny RPC Base stoi obok i dziala. Zepsuta zmienna
 * srodowiskowa nie moze kasowac funkcji, ktora umie sie bez niej obejsc.
 *
 * Stad kolejka: najpierw wlasny endpoint (CDP - platny, bez odmow "over rate
 * limit" przy wielu ogladajacych naraz), a za nim publiczny RPC sieci jako
 * zapas. `undefined` znaczy "domyslny transport viem", czyli wlasnie publiczny.
 *
 * ===========================================================================
 * DLACZEGO KAZDA SIEC MA WLASNA ZMIENNA
 * ===========================================================================
 * Klucz CDP jest wystawiony NA KONKRETNA SIEC - adres Base mainnet nie
 * obsluzy Sepolii. Podanie jednego endpointu wszystkim sieciom konczyloby sie
 * skanem Sepolii pod adresem mainnetu, czyli pusta historia bez sladu bledu.
 */

/** Zmienna srodowiskowa z wlasnym RPC dla danej sieci. Brak = tylko publiczny. */
const ENV_BY_CHAIN: Record<number, string> = {
  8453: 'BASE_RPC_URL',
  84532: 'BASE_SEPOLIA_RPC_URL',
  5042002: 'ARC_TESTNET_RPC_URL',
};

/**
 * Adresy RPC do wyprobowania, w kolejnosci. `undefined` to domyslny transport
 * viem (publiczny RPC sieci) i stoi na koncu ZAWSZE - to jest ten zapas.
 */
export function rpcCandidates(chainId: number, env: Record<string, string | undefined>): (string | undefined)[] {
  const name = ENV_BY_CHAIN[chainId];
  const configured = name ? env[name]?.trim() : undefined;
  return configured ? [configured, undefined] : [undefined];
}

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
  // Publiczny RPC Robinhooda jest przez jego wlasna dokumentacje oznaczony jako
  // "not recommended for production", a serwerowy skan agregatu tablicy strzela
  // w niego oknami po milion blokow. Zmienna byla tu potrzebna od poczatku -
  // brakowalo jej dlatego, ze do tej pory serwer skanowal tylko historie
  // pojedynczego tokena, a tej na Robinhoodzie nikt nie otwieral.
  4663: 'ROBINHOOD_RPC_URL',
  5042002: 'ARC_TESTNET_RPC_URL',
};

/**
 * Adresy RPC do wyprobowania, w kolejnosci. `undefined` to domyslny transport
 * viem (publiczny RPC sieci) i stoi zaraz za wlasnym endpointem.
 *
 * ===========================================================================
 * DLACZEGO KOLEJKA SIEGA POZA PIERWSZY ADRES SIECI
 * ===========================================================================
 * `http(undefined)` bierze z definicji sieci WYLACZNIE `rpcUrls.default.http[0]`
 * i nigdy nie zaglada do reszty listy. Na Arc pierwszym adresem jest
 * Blockdaemon, ktory ma PRZYCIETA HISTORIE: `eth_chainId` i `eth_blockNumber`
 * odpowiadaja normalnie, a `eth_getLogs` przy bloku wdrozenia oddaje
 * `4444 pruned history unavailable`. Drugi adres z tej samej listy
 * (`rpc.testnet.arc.io`) ma historie komplet - tyle ze nikt go nigdy nie pytal.
 *
 * Przekazanie `fallbacks` (zwykle `net.chain.rpcUrls.default.http`) sprawia, ze
 * kolejka obejmuje CALA liste sieci. Samo to nie wystarczy - wolajacy musi
 * jeszcze sprawdzac to, na czym mu zalezy (patrz probe w
 * `/api/launchpad/board/stats`: endpoint zdaje egzamin dopiero, gdy odda
 * `getLogs` na realnym oknie, a nie gdy odda numer bloku).
 */
export function rpcCandidates(
  chainId: number,
  env: Record<string, string | undefined>,
  fallbacks: readonly string[] = []
): (string | undefined)[] {
  const name = ENV_BY_CHAIN[chainId];
  const configured = name ? env[name]?.trim() : undefined;

  const queue: (string | undefined)[] = configured ? [configured, undefined] : [undefined];

  // Pierwszy adres sieci jest juz reprezentowany przez `undefined`, wiec
  // dokladamy wylacznie te dalsze - i tylko rozne od wlasnego endpointu.
  for (const url of fallbacks.slice(1)) {
    if (url && url !== configured) queue.push(url);
  }

  return queue;
}

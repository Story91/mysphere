// Globalna konfiguracja Camp Mainnet (bez .env)
// PL: Centralny przełącznik i stałe sieci – włączone dla mainnet

export const ENABLE_CAMP_MAINNET = true as const;

/**
 * RPC: rpc-mainnet.campnetwork.xyz, NIE rpc.camp.raas.gelato.cloud.
 *
 * ZMIERZONE 2026-09-11: host gelato nie istnieje w DNS (NXDOMAIN, takze przez
 * Google DNS 8.8.8.8), a byl jedynym RPC dla chainId 484 w aplikacji - kazdy
 * odczyt i kazde postowanie na Camp konczyly sie ENOTFOUND. Blockscout Camp
 * nadal dziala i potwierdza kontrakt postow pod 0x71bE438e... Nowy host:
 * eth_chainId 0x1e4, pelny wezel (eth_feeHistory dziala), CORS `*`.
 * Zapas: eth-rpc Blockscouta - obsluguje call/estimateGas/sendRawTransaction,
 * ale nie eth_feeHistory, wiec stoi na drugim miejscu.
 */
export const CAMP_MAINNET = {
  CHAIN_ID: 484,
  RPC_HTTP: 'https://rpc-mainnet.campnetwork.xyz',
  RPC_HTTP_FALLBACK: 'https://camp.cloud.blockscout.com/api/eth-rpc',
  // Dawny wss://ws.camp.raas.gelato.cloud tez zniknal z DNS. Nigdzie nie byl
  // uzywany; brak WS = polling po HTTP.
  EXPLORER: 'https://camp.cloud.blockscout.com',
} as const;

 
// Globalna konfiguracja Camp Mainnet (bez .env)
// PL: Centralny przełącznik i stałe sieci – trzymamy wyłączone domyślnie

export const ENABLE_CAMP_MAINNET = false as const;

export const CAMP_MAINNET = {
  CHAIN_ID: 484,
  RPC_HTTP: 'https://rpc.camp.raas.gelato.cloud',
  RPC_WS: 'wss://ws.camp.raas.gelato.cloud',
  EXPLORER: 'https://camp.cloud.blockscout.com',
} as const;

 
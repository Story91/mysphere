import { NextResponse } from 'next/server';
import { JsonRpcProvider, Wallet } from 'ethers';
import { runPerpsKeeper, type DeploymentFile, type PythAdaptersFile } from '@/lib/keeper/perpsKeeperCore';
import derivTestnet from '@/deployments/derivativeMarket.5042002.json';
import derivMainnet from '@/deployments/derivativeMarket.5042.json';
import pythTestnet from '@/deployments/pythAdapters.5042002.json';
import pythMainnet from '@/deployments/pythAdapters.5042.json';

/**
 * KEEPER PERPOW JAKO TRASA HTTP - odpalany cronem, nie z laptopa.
 *
 * ===========================================================================
 * PO CO
 * ===========================================================================
 * Rynki perp na Arc wymagaja regularnej obecnosci: rozliczenia fundingu,
 * likwidacji pozycji pod woda, swiezej ceny Pytha w naszym odbiorniku i
 * heartbeatu rejestru cen (bez wpisu co godzine `openPosition` rewertuje
 * OracleInactive). Do 16.09.2026 robil to skrypt z Harmonogramu zadan na
 * laptopie wlasciciela i dwa razy stanal po cichu. Ta trasa robi dokladnie to
 * samo (ten sam rdzen: lib/keeper/perpsKeeperCore.ts), ale z chmury.
 *
 * ===========================================================================
 * BEZPIECZENSTWO
 * ===========================================================================
 * - Wywolanie wymaga `Authorization: Bearer <CRON_SECRET>`. Cron Vercela
 *   dodaje ten naglowek sam, gdy zmienna CRON_SECRET jest ustawiona w
 *   projekcie; zewnetrzny cron (cron-job.org) musi go podac. Bez sekretu
 *   trasa odpowiada 503 i NIE wykonuje niczego - lepiej martwy keeper niz
 *   publiczny przycisk "wyslij transakcje z naszego klucza".
 * - Klucz keepera to OSOBNA zmienna KEEPER_PRIVATE_KEY, nie ADMIN_PRIVATE_KEY.
 *   Ma trzymac kilka USDC na gaz i nic wiecej: likwidacje i heartbeat nie
 *   wymagaja zadnych uprawnien poza byciem wystawca feedu (rejestr sprawdza
 *   `publisher`), wiec wystawce feedow trzeba ustawic na ten adres albo
 *   zostawic go tworca (patrz PriceOracleRegistry.setPublisher).
 * - Zero parametrow z zapytania trafia do transakcji. Wszystko, co keeper
 *   robi, wynika ze stanu lancucha i env.
 *
 * ===========================================================================
 * KONFIGURACJA (env w Vercelu)
 * ===========================================================================
 *   CRON_SECRET             wymagany
 *   KEEPER_PRIVATE_KEY      wymagany; portfel z USDC na gaz na wybranym Arc
 *   KEEPER_CHAIN_ID         5042002 (domyslnie) albo 5042
 *   KEEPER_RPC_URL          opcjonalnie; domyslnie Blockdaemon (testnet) /
 *                           rpc.mainnet.arc.io (mainnet)
 *   PYTH_API_KEY            opcjonalnie; bez niego Pyth tylko raportowany
 *   KEEPER_SCAN_BLOCKS      domyslnie 200000
 *   KEEPER_DRY_RUN=tak      same odczyty, zero transakcji
 *
 * Harmonogram: vercel.json -> crons -> "/api/keeper/perps" co 15 min. Plan
 * Hobby Vercela pozwala tylko na jeden bieg dziennie; wtedy cron zewnetrzny
 * (cron-job.org, GitHub Actions) uderza w te sama trase z tym samym sekretem.
 *
 * Odpowiedz: JSON z pelnym raportem keepera; `gasLow: true` gdy saldo ponizej
 * progu - to sygnal do alarmu, nie blad HTTP (cron ma widziec 200).
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Vercel Pro pozwala do 300 s; Hobby tnie na 60 s. Skan pozycji przy
// KEEPER_SCAN_BLOCKS=200000 to ok. 20-40 zapytan getLogs - miesci sie.
export const maxDuration = 60;

const DEFAULT_RPC: Record<number, string> = {
  5042002: 'https://rpc.blockdaemon.testnet.arc.io',
  5042: 'https://rpc.mainnet.arc.io',
};

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get('authorization') || '';
  return header === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'CRON_SECRET nie jest ustawione - keeper wylaczony' }, { status: 503 });
  }
  if (!authorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const key = process.env.KEEPER_PRIVATE_KEY;
  if (!key) {
    return NextResponse.json({ error: 'KEEPER_PRIVATE_KEY nie jest ustawione' }, { status: 503 });
  }

  const chainId = Number(process.env.KEEPER_CHAIN_ID || 5042002);
  const rpc = process.env.KEEPER_RPC_URL || DEFAULT_RPC[chainId];
  if (!rpc) return NextResponse.json({ error: `nieznany chainId ${chainId}` }, { status: 400 });

  const provider = new JsonRpcProvider(rpc, { chainId, name: `arc-${chainId}` }, { staticNetwork: true });
  const signer = new Wallet(key, provider);
  const deployment = (chainId === 5042 ? derivMainnet : derivTestnet) as DeploymentFile;
  const pythAdapters = (chainId === 5042 ? pythMainnet : pythTestnet) as PythAdaptersFile;

  const startedAt = Date.now();
  try {
    const report = await runPerpsKeeper({
      provider,
      signer,
      chainId,
      execute: process.env.KEEPER_DRY_RUN !== 'tak',
      deployment,
      pythAdapters,
      scanBlocks: process.env.KEEPER_SCAN_BLOCKS ? Number(process.env.KEEPER_SCAN_BLOCKS) : undefined,
      pythApiKey: process.env.PYTH_API_KEY,
      hermesUrl: process.env.HERMES_URL,
      gasAlertUsdc: process.env.GAS_ALERT_USDC,
    });
    return NextResponse.json({ ok: true, ms: Date.now() - startedAt, ...report });
  } catch (error) {
    const message = error instanceof Error ? error.message.split('\n')[0] : String(error);
    return NextResponse.json({ ok: false, ms: Date.now() - startedAt, chainId, error: message }, { status: 500 });
  }
}

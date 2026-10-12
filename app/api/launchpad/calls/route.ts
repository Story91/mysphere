import { NextResponse } from 'next/server';
import { createPublicClient, encodeAbiParameters, erc20Abi, getAbiItem, getAddress, http, keccak256, parseAbi, type Address, type Hex } from 'viem';
import { base } from 'viem/chains';
import { allDeploymentsOfChain, LAUNCHPAD_NETWORKS, launchpadAbi, LAUNCH_STATE } from '../../../startpad/config';
import { decodeTradeMessage } from '../../../startpad/[address]/tradeMessage';
import { stateViewAbi } from '../../../startpad/[address]/poolPrice';
import { rpcCandidates } from '../historyRpc';
import { verifiedHumans } from '../humanCheck';

/**
 * GET /api/launchpad/calls - "Calls": kupna z wiadomoscia jako sprawdzalne
 * prognozy. Wiadomosc, cena wejscia i portfel sa na lancuchu (Bought + dopisek
 * w calldata, patrz tradeMessage.ts), wiec wyniku nie da sie podrobic - w
 * przeciwienstwie do rankingow callerow na Telegramie ze zrzutow ekranu.
 *
 * Wynik = cena teraz / srednia cena wejscia, w walucie rynku (ETH albo perp).
 * Portfele z Coinbase Verification dostaja plakietke (humanCheck.ts).
 *
 * Skan: Bought ze wszystkich launchpadow Base z ostatnich 7 dni, przyrostowo
 * w pamieci instancji; wejscie transakcji tylko dla kupien (cache po hashu).
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CHAIN_ID = base.id;
const LOOKBACK_BLOCKS = 7n * 43_200n; // ~7 dni po 2 s
const TTL_MS = 60_000;
const MAX_TX_FETCH = 250;
const SECONDS_PER_BLOCK = 2;

const BOUGHT = getAbiItem({ abi: launchpadAbi, name: 'Bought' });
const launchOfAbi = parseAbi([
  'function launchOf(address token) view returns (address creator, uint8 state, uint256 ethReserve, uint256 tokenReserve, uint40 startedAt, bytes32 launchId)',
]);
const STATE_VIEW = '0xa3c0c9b65bad0b08107aa264b0f3db444b867a71' as const;
const NATIVE = '0x0000000000000000000000000000000000000000' as const;

type Dep = { launchpad: Address; hook: Address; rVirt: number; quote: Address | null; quoteSymbol: string; marketId: string | null };

type Buy = {
  txHash: Hex;
  block: bigint;
  token: Address;
  buyer: Address;
  paid: bigint; // ethNet - waluta rynku, 18 miejsc
  tokens: bigint;
  launchpad: Address;
};

const scannedTo = new Map<string, bigint>();
const buys = new Map<string, Buy>(); // txHash-token
const messages = new Map<string, string | null>(); // txHash -> wiadomosc albo null
let cached: { at: number; body: unknown } | null = null;

const makeClient = (url: string | undefined) =>
  createPublicClient({ chain: base, transport: http(url, { fetchOptions: { cache: 'no-store' } }) });

function deployments(): Dep[] {
  const net = LAUNCHPAD_NETWORKS[CHAIN_ID];
  if (!net) return [];
  return allDeploymentsOfChain(net).map((d) => {
    const m = d.marketId ? net.markets?.find((x) => x.id === d.marketId) : undefined;
    return {
      launchpad: d.launchpad as Address,
      hook: d.hook as Address,
      rVirt: m ? m.rVirt : net.rVirt,
      quote: m ? (m.quote.address as Address) : null,
      quoteSymbol: m ? m.quote.symbol : 'ETH',
      marketId: m ? m.id : null,
    };
  });
}

/** Cena tokena w walucie rynku z puli v4 po graduacji (sqrtPrice -> kierunek z kolejnosci walut). */
function poolPrice(sqrtPriceX96: bigint, quote: Address | null, token: Address): number {
  const p = (Number(sqrtPriceX96) / 2 ** 96) ** 2; // currency1 za currency0 (oba 18 miejsc)
  const q = quote ?? NATIVE;
  const quoteIs0 = BigInt(q) < BigInt(token);
  return quoteIs0 ? (p > 0 ? 1 / p : 0) : p;
}

async function refresh() {
  const deps = deployments();
  const net = LAUNCHPAD_NETWORKS[CHAIN_ID]!;
  let client: ReturnType<typeof makeClient> | null = null;
  let head = 0n;
  for (const url of rpcCandidates(CHAIN_ID, process.env, base.rpcUrls.default.http)) {
    try {
      const c = makeClient(url);
      head = await c.getBlockNumber();
      const floor = head > LOOKBACK_BLOCKS ? head - LOOKBACK_BLOCKS : 0n;
      const addresses = deps.map((d) => d.launchpad);
      const key = addresses.join(',');
      let from = scannedTo.get(key) ?? floor;
      if (from < floor) from = floor;
      // Okna po 4 naraz - zimny start (7 dni = ~32 okna) w kilka sekund zamiast kilkudziesieciu.
      const windows: Array<[bigint, bigint]> = [];
      for (let f = from; f <= head; f += net.scanWindow) windows.push([f, f + net.scanWindow - 1n > head ? head : f + net.scanWindow - 1n]);
      for (let i = 0; i < windows.length; i += 4) {
        const batch = windows.slice(i, i + 4);
        const results = await Promise.all(batch.map(([f, t]) => c.getLogs({ address: addresses, event: BOUGHT, fromBlock: f, toBlock: t })));
        for (const log of results.flat()) {
          if (!log.transactionHash || !log.args.token || !log.args.buyer) continue;
          buys.set(`${log.transactionHash}-${log.args.token}`, {
            txHash: log.transactionHash,
            block: log.blockNumber ?? 0n,
            token: getAddress(log.args.token),
            buyer: getAddress(log.args.buyer),
            paid: log.args.ethNet ?? 0n,
            tokens: log.args.tokensOut ?? 0n,
            launchpad: getAddress(log.address),
          });
        }
        scannedTo.set(key, batch[batch.length - 1][1] + 1n);
      }
      client = c;
      break;
    } catch {
      // nastepny wezel
    }
  }
  if (!client) throw new Error('rpc');

  // Wiadomosci: wejscie transakcji tylko dla kupien, ktorych jeszcze nie znamy.
  const floor = head > LOOKBACK_BLOCKS ? head - LOOKBACK_BLOCKS : 0n;
  for (const [k, b] of buys) if (b.block < floor) buys.delete(k);
  const unknown = [...buys.values()].filter((b) => !messages.has(b.txHash)).sort((a, b) => (a.block < b.block ? 1 : -1)).slice(0, MAX_TX_FETCH);
  for (let i = 0; i < unknown.length; i += 8) {
    await Promise.all(
      unknown.slice(i, i + 8).map(async (b) => {
        try {
          const tx = await client!.getTransaction({ hash: b.txHash });
          messages.set(b.txHash, decodeTradeMessage(tx.input));
        } catch {
          // zostaje nieznane - sprobujemy przy nastepnym odswiezeniu
        }
      })
    );
  }

  const calls = [...buys.values()].filter((b) => messages.get(b.txHash));
  if (calls.length === 0) return { ok: true, calls: [], leaders: [], head: head.toString() };

  const depOf = new Map(deps.map((d) => [d.launchpad.toLowerCase(), d]));
  const tokens = [...new Map(calls.map((c) => [c.token.toLowerCase(), c])).values()];
  const [states, symbols] = await Promise.all([
    client.multicall({
      allowFailure: true,
      contracts: tokens.map((c) => ({ address: c.launchpad, abi: launchOfAbi, functionName: 'launchOf', args: [c.token] }) as const),
    }),
    client.multicall({
      allowFailure: true,
      contracts: tokens.map((c) => ({ address: c.token, abi: erc20Abi, functionName: 'symbol' }) as const),
    }),
  ]);

  const priceNow = new Map<string, number>();
  const symbolOf = new Map<string, string>();
  const graduated: Array<{ token: Address; dep: Dep }> = [];
  tokens.forEach((c, i) => {
    const dep = depOf.get(c.launchpad.toLowerCase())!;
    const s = symbols[i];
    if (s?.status === 'success') symbolOf.set(c.token.toLowerCase(), s.result as string);
    const r = states[i];
    if (r?.status !== 'success') return;
    const [, st, ethReserve, tokenReserve] = r.result;
    if (LAUNCH_STATE[Number(st)] === 'Graduated') {
      graduated.push({ token: c.token, dep });
      return;
    }
    const tr = Number(tokenReserve) / 1e18;
    if (tr > 0) priceNow.set(c.token.toLowerCase(), (dep.rVirt + Number(ethReserve) / 1e18) / tr);
  });
  if (graduated.length) {
    const slots = await client.multicall({
      allowFailure: true,
      contracts: graduated.map(({ token, dep }) => {
        const q = dep.quote ?? NATIVE;
        const [c0, c1] = BigInt(q) < BigInt(token) ? [q, token] : [token, q];
        const poolId = keccak256(
          encodeAbiParameters(
            [{ type: 'address' }, { type: 'address' }, { type: 'uint24' }, { type: 'int24' }, { type: 'address' }],
            [c0, c1, 3000, 60, dep.hook]
          )
        );
        return { address: STATE_VIEW, abi: stateViewAbi, functionName: 'getSlot0', args: [poolId] } as const;
      }),
    });
    graduated.forEach(({ token, dep }, i) => {
      const r = slots[i];
      if (r?.status === 'success') priceNow.set(token.toLowerCase(), poolPrice(r.result[0] as bigint, dep.quote, token));
    });
  }

  const humans = await verifiedHumans(calls.map((c) => c.buyer)).catch(() => new Set<Address>());
  const now = Math.floor(Date.now() / 1000);
  const rows = calls
    .map((c) => {
      const dep = depOf.get(c.launchpad.toLowerCase())!;
      const entry = c.tokens > 0n ? Number(c.paid) / Number(c.tokens) : 0;
      const current = priceNow.get(c.token.toLowerCase()) ?? null;
      return {
        txHash: c.txHash,
        token: c.token,
        symbol: symbolOf.get(c.token.toLowerCase()) ?? '',
        marketId: dep.marketId,
        quoteSymbol: dep.quoteSymbol,
        buyer: c.buyer,
        verified: humans.has(c.buyer),
        message: messages.get(c.txHash) as string,
        paid: Number(c.paid) / 1e18,
        multiple: current !== null && entry > 0 ? current / entry : null,
        ts: now - Number(head - c.block) * SECONDS_PER_BLOCK,
      };
    })
    .sort((a, b) => (b.multiple ?? 0) - (a.multiple ?? 0));

  // Ranking callerow: najlepszy wynik i liczba calli na portfel.
  const byBuyer = new Map<string, { buyer: Address; verified: boolean; calls: number; best: number }>();
  for (const r of rows) {
    const e = byBuyer.get(r.buyer) ?? { buyer: r.buyer, verified: r.verified, calls: 0, best: 0 };
    e.calls += 1;
    e.best = Math.max(e.best, r.multiple ?? 0);
    byBuyer.set(r.buyer, e);
  }
  const leaders = [...byBuyer.values()].sort((a, b) => b.best - a.best).slice(0, 20);
  return { ok: true, calls: rows.slice(0, 100), leaders, head: head.toString() };
}

export async function GET() {
  try {
    if (!cached || Date.now() - cached.at > TTL_MS) cached = { at: Date.now(), body: await refresh() };
  } catch {
    if (!cached) return NextResponse.json({ ok: false, error: 'rpc' }, { status: 502 });
  }
  return NextResponse.json(cached.body, { headers: { 'Cache-Control': 'public, max-age=30, stale-while-revalidate=120' } });
}

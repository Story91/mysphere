import { NextResponse, type NextRequest } from 'next/server';
import { createPublicClient, formatEther, getAddress, http, parseAbi, parseAbiItem, type Address } from 'viem';
import { base } from 'viem/chains';
import { LAUNCHPAD_NETWORKS, LAUNCH_STATE } from '../../../startpad/config';
import type { Clash, ClashSide, ClashToken } from '../../../startpad/duel';
import { parseMetadataUri } from '../../../startpad/metadata';
import { rpcCandidates } from '../historyRpc';

/**
 * GET /api/launchpad/clashes[?id=...|?token=0x..] - starcia Asset Clash.
 *
 * Bez rejestru: pary skladane z `Launched` + `LaunchMetadataSet` launchpadow
 * wszystkich rynkow perpow (metadane niosa `duel.id` i strone a/b). Para liczy
 * sie tylko, gdy obie strony ma TEN SAM tworca i lezą na ROZNYCH perpach.
 * Skan przyrostowy w pamieci instancji, stan krzywych z `launchOf`, NAV i
 * zmiana 24h perpow z API Flash (jak /api/launchpad/perps).
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CHAIN_ID = base.id;
const T0 = 1_000_000_000;
const TTL_MS = 30_000;

const EVENTS = [
  parseAbiItem(
    'event Launched(address indexed token, address indexed creator, bytes32 indexed launchId, string name, string symbol, uint256 totalSupply, uint256 curveSupply, uint256 tMin, uint256 rVirt, uint16 feeBps, uint16 creatorFeeBps, uint40 startedAt)'
  ),
  parseAbiItem('event LaunchMetadataSet(address indexed token, string metadataURI)'),
] as const;
const launchOfAbi = parseAbi([
  'function launchOf(address token) view returns (address creator, uint8 state, uint256 ethReserve, uint256 tokenReserve, uint40 startedAt, bytes32 launchId)',
]);

type Market = NonNullable<(typeof LAUNCHPAD_NETWORKS)[number]['markets']>[number];

type Entry = {
  token: Address;
  market: Market;
  creator?: Address;
  name?: string;
  symbol?: string;
  startedAt?: number;
  duel?: { id: string; side: ClashSide; ticker: string };
  image?: string | null;
  description?: string | null;
};

const scanned = new Map<string, bigint>(); // launchpad -> ostatni zeskanowany blok
const entries = new Map<string, Entry>(); // token -> wpis
let cached: { at: number; clashes: Clash[] } | null = null;

const makeClient = (url: string | undefined) =>
  createPublicClient({ chain: base, transport: http(url, { fetchOptions: { cache: 'no-store' } }) });

async function flash(): Promise<Map<string, { nav: number; change: number | null }>> {
  try {
    const res = await fetch('https://api.tryflash.app/v1/perps', { cache: 'no-store', signal: AbortSignal.timeout(5000) });
    const body = (await res.json()) as { items?: Array<{ token?: string; navPriceUsd?: number; priceUsd?: number; change24hPct?: number }> };
    const out = new Map<string, { nav: number; change: number | null }>();
    for (const i of body.items ?? []) {
      const p = i.navPriceUsd ?? i.priceUsd;
      if (i.token && typeof p === 'number') out.set(i.token.toLowerCase(), { nav: p, change: typeof i.change24hPct === 'number' ? i.change24hPct : null });
    }
    return out;
  } catch {
    return new Map();
  }
}

async function refresh(): Promise<Clash[]> {
  const net = LAUNCHPAD_NETWORKS[CHAIN_ID];
  const markets = net?.markets ?? [];
  let client: ReturnType<typeof makeClient> | null = null;
  for (const url of rpcCandidates(CHAIN_ID, process.env, base.rpcUrls.default.http)) {
    try {
      const c = makeClient(url);
      const head = await c.getBlockNumber();
      for (const m of markets) {
        const lp = m.launchpad.toLowerCase();
        let from = (scanned.get(lp) ?? m.deployBlock - 1n) + 1n;
        while (from <= head) {
          const to = from + net!.scanWindow - 1n > head ? head : from + net!.scanWindow - 1n;
          const logs = await c.getLogs({ address: m.launchpad as Address, events: EVENTS, fromBlock: from, toBlock: to });
          for (const log of logs) {
            const token = getAddress(log.args.token as Address);
            const e = entries.get(token) ?? { token, market: m };
            if (log.eventName === 'Launched') {
              e.creator = log.args.creator as Address;
              e.name = log.args.name as string;
              e.symbol = log.args.symbol as string;
              e.startedAt = Number(log.args.startedAt ?? 0);
            } else {
              const meta = parseMetadataUri(log.args.metadataURI as string);
              if (meta.duel) e.duel = meta.duel;
              e.image = meta.image;
              e.description = meta.description;
            }
            entries.set(token, e);
          }
          scanned.set(lp, to);
          from = to + 1n;
        }
      }
      client = c;
      break;
    } catch {
      // nastepny wezel
    }
  }
  if (!client) throw new Error('rpc');

  const byId = new Map<string, { a?: Entry; b?: Entry }>();
  for (const e of entries.values()) {
    if (!e.duel || !e.creator) continue;
    const slot = byId.get(e.duel.id) ?? {};
    if (!slot[e.duel.side]) slot[e.duel.side] = e;
    byId.set(e.duel.id, slot);
  }
  const pairs = [...byId.entries()].filter(([, p]) => {
    if (p.a && p.b) {
      return p.a.creator?.toLowerCase() === p.b.creator?.toLowerCase() && p.a.market.id !== p.b.market.id;
    }
    return Boolean(p.a || p.b);
  });

  const tokens = pairs.flatMap(([, p]) => [p.a, p.b].filter((x): x is Entry => Boolean(x)));
  const states = tokens.length
    ? await client.multicall({
        allowFailure: true,
        contracts: tokens.map((t) => ({ address: t.market.launchpad as Address, abi: launchOfAbi, functionName: 'launchOf', args: [t.token] }) as const),
      })
    : [];
  const prices = await flash();
  const stateOf = new Map<string, ClashToken>();
  tokens.forEach((t, i) => {
    const r = states[i];
    if (r?.status !== 'success') return;
    const [, st, reserve, tokenReserve] = r.result;
    const m = t.market;
    const raised = Number(formatEther(reserve));
    const state = (LAUNCH_STATE[Number(st)] ?? 'Curve') as ClashToken['state'];
    const tr = Number(formatEther(tokenReserve));
    // Po graduacji krzywej nie ma - cena konca krzywej: (5 * R_VIRT) / 2e8.
    const priceInPerp = state === 'Graduated' ? (m.rVirt * 5) / 200_000_000 : tr > 0 ? (m.rVirt + raised) / tr : 0;
    const f = prices.get(m.quote.address.toLowerCase()) ?? null;
    stateOf.set(t.token.toLowerCase(), {
      address: t.token,
      name: t.name ?? '',
      symbol: t.symbol ?? '',
      marketId: m.id,
      perpSymbol: m.quote.symbol,
      state,
      raised: state === 'Graduated' ? m.rVirt * 4 : raised,
      priceInPerp,
      sinceLaunchPct: (priceInPerp / (m.rVirt / T0) - 1) * 100,
      mcapUsd: f === null ? null : priceInPerp * f.nav * T0,
      perpChange24h: f?.change ?? null,
      launchpad: m.launchpad as Address,
    });
  });

  return pairs
    .map(([id, p]) => {
      const any = (p.a ?? p.b)!;
      return {
        id,
        ticker: any.duel!.ticker,
        creator: any.creator!,
        image: p.a?.image ?? p.b?.image ?? null,
        description: p.a?.description ?? p.b?.description ?? null,
        startedAt: Math.min(p.a?.startedAt ?? Infinity, p.b?.startedAt ?? Infinity),
        a: p.a ? stateOf.get(p.a.token.toLowerCase()) ?? null : null,
        b: p.b ? stateOf.get(p.b.token.toLowerCase()) ?? null : null,
      } satisfies Clash;
    })
    .sort((x, y) => y.startedAt - x.startedAt);
}

export async function GET(request: NextRequest) {
  try {
    if (!cached || Date.now() - cached.at > TTL_MS) cached = { at: Date.now(), clashes: await refresh() };
  } catch {
    if (!cached) return NextResponse.json({ ok: false, error: 'rpc' }, { status: 502 });
  }
  const id = request.nextUrl.searchParams.get('id');
  const token = request.nextUrl.searchParams.get('token')?.toLowerCase();
  let clashes = cached.clashes;
  if (id) clashes = clashes.filter((c) => c.id === id);
  if (token) clashes = clashes.filter((c) => c.a?.address.toLowerCase() === token || c.b?.address.toLowerCase() === token);
  return NextResponse.json({ ok: true, clashes }, { headers: { 'Cache-Control': 'public, max-age=15, stale-while-revalidate=60' } });
}

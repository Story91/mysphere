import { NextResponse, type NextRequest } from 'next/server';
import { createPublicClient, formatEther, getAddress, http, parseAbi, parseAbiItem, type Address } from 'viem';
import { base } from 'viem/chains';
import { LAUNCHPAD_NETWORKS, LAUNCH_STATE } from '../../../startpad/config';
import { DUEL_MARKETS, type Duel, type DuelSide, type DuelToken } from '../../../startpad/duel';
import { parseMetadataUri } from '../../../startpad/metadata';
import { rpcCandidates } from '../historyRpc';

/**
 * GET /api/launchpad/duels[?id=...] - pojedynki Bull vs Bear (ETH2xL vs ETH2xS).
 *
 * Bez rejestru: pary skladane z `Launched` + `LaunchMetadataSet` obu
 * launchpadow (metadane niosa `duel.id` i strone). Para liczy sie tylko, gdy
 * oba tokeny ma TEN SAM tworca. Skan przyrostowy w pamieci instancji, stan
 * krzywych z `launchOf`, NAV perpow z API Flash (jak /api/launchpad/perps).
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

type Entry = {
  token: Address;
  side: DuelSide;
  launchpad: Address;
  creator?: Address;
  name?: string;
  symbol?: string;
  startedAt?: number;
  duel?: { id: string; side: DuelSide; ticker: string };
  image?: string | null;
  description?: string | null;
};

const scanned = new Map<string, bigint>(); // launchpad -> ostatni zeskanowany blok
const entries = new Map<string, Entry>(); // token -> wpis
let cached: { at: number; duels: Duel[] } | null = null;

const makeClient = (url: string | undefined) =>
  createPublicClient({ chain: base, transport: http(url, { fetchOptions: { cache: 'no-store' } }) });

function market(side: DuelSide) {
  const net = LAUNCHPAD_NETWORKS[CHAIN_ID];
  return (net?.markets ?? []).find((m) => m.id === DUEL_MARKETS[side]) ?? null;
}

async function navOf(): Promise<Map<string, number>> {
  try {
    const res = await fetch('https://api.tryflash.app/v1/perps', { cache: 'no-store', signal: AbortSignal.timeout(5000) });
    const body = (await res.json()) as { items?: Array<{ token?: string; navPriceUsd?: number; priceUsd?: number }> };
    const out = new Map<string, number>();
    for (const i of body.items ?? []) {
      const p = i.navPriceUsd ?? i.priceUsd;
      if (i.token && typeof p === 'number') out.set(i.token.toLowerCase(), p);
    }
    return out;
  } catch {
    return new Map();
  }
}

async function refresh(): Promise<Duel[]> {
  const net = LAUNCHPAD_NETWORKS[CHAIN_ID];
  const sides: DuelSide[] = ['bull', 'bear'];
  let client: ReturnType<typeof makeClient> | null = null;
  for (const url of rpcCandidates(CHAIN_ID, process.env, base.rpcUrls.default.http)) {
    try {
      const c = makeClient(url);
      const head = await c.getBlockNumber();
      for (const side of sides) {
        const m = market(side);
        if (!m) continue;
        const lp = m.launchpad.toLowerCase();
        let from = (scanned.get(lp) ?? m.deployBlock - 1n) + 1n;
        while (from <= head) {
          const to = from + net.scanWindow - 1n > head ? head : from + net.scanWindow - 1n;
          const logs = await c.getLogs({ address: m.launchpad as Address, events: EVENTS, fromBlock: from, toBlock: to });
          for (const log of logs) {
            const token = getAddress(log.args.token as Address);
            const e = entries.get(token) ?? { token, side, launchpad: m.launchpad as Address };
            if (log.eventName === 'Launched') {
              e.creator = log.args.creator as Address;
              e.name = log.args.name as string;
              e.symbol = log.args.symbol as string;
              e.startedAt = Number(log.args.startedAt ?? 0);
            } else {
              const meta = parseMetadataUri(log.args.metadataURI as string);
              if (meta.duel && meta.duel.side === side) e.duel = meta.duel;
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

  // Grupowanie po id pojedynku; strona musi sie zgadzac z rynkiem, tworca z para.
  const byId = new Map<string, { bull?: Entry; bear?: Entry }>();
  for (const e of entries.values()) {
    if (!e.duel || !e.creator) continue;
    const slot = byId.get(e.duel.id) ?? {};
    if (!slot[e.side]) slot[e.side] = e;
    byId.set(e.duel.id, slot);
  }
  const pairs = [...byId.entries()].filter(([, p]) => {
    if (p.bull && p.bear) return p.bull.creator?.toLowerCase() === p.bear.creator?.toLowerCase();
    return Boolean(p.bull || p.bear);
  });

  const tokens = pairs.flatMap(([, p]) => [p.bull, p.bear].filter((x): x is Entry => Boolean(x)));
  const states = tokens.length
    ? await client.multicall({
        allowFailure: true,
        contracts: tokens.map((t) => ({ address: t.launchpad, abi: launchOfAbi, functionName: 'launchOf', args: [t.token] }) as const),
      })
    : [];
  const nav = await navOf();
  const stateOf = new Map<string, DuelToken>();
  tokens.forEach((t, i) => {
    const r = states[i];
    if (r?.status !== 'success') return;
    const [, st, reserve, tokenReserve] = r.result;
    const m = market(t.side)!;
    const rVirt = m.rVirt;
    const raised = Number(formatEther(reserve));
    const state = (LAUNCH_STATE[Number(st)] ?? 'Curve') as DuelToken['state'];
    const tr = Number(formatEther(tokenReserve));
    // Spot na krzywej: (R_VIRT + rezerwa) / tokeny na krzywej. Po graduacji krzywej nie ma -
    // bierzemy cene konca krzywej (4*R_VIRT zebrane, T_MIN tokenow): (5*R_VIRT)/2e8.
    const priceInPerp = state === 'Graduated' ? (rVirt * 5) / 200_000_000 : tr > 0 ? (rVirt + raised) / tr : 0;
    const navUsd = nav.get(m.quote.address.toLowerCase()) ?? null;
    stateOf.set(t.token.toLowerCase(), {
      address: t.token,
      name: t.name ?? '',
      symbol: t.symbol ?? '',
      state,
      raised: state === 'Graduated' ? rVirt * 4 : raised,
      priceInPerp,
      mcapUsd: navUsd === null ? null : priceInPerp * navUsd * T0,
      launchpad: t.launchpad,
    });
  });

  return pairs
    .map(([id, p]) => {
      const any = (p.bull ?? p.bear)!;
      return {
        id,
        ticker: any.duel!.ticker,
        creator: any.creator!,
        image: p.bull?.image ?? p.bear?.image ?? null,
        description: p.bull?.description ?? p.bear?.description ?? null,
        startedAt: Math.min(p.bull?.startedAt ?? Infinity, p.bear?.startedAt ?? Infinity),
        bull: p.bull ? stateOf.get(p.bull.token.toLowerCase()) ?? null : null,
        bear: p.bear ? stateOf.get(p.bear.token.toLowerCase()) ?? null : null,
      } satisfies Duel;
    })
    .sort((a, b) => b.startedAt - a.startedAt);
}

export async function GET(request: NextRequest) {
  try {
    if (!cached || Date.now() - cached.at > TTL_MS) cached = { at: Date.now(), duels: await refresh() };
  } catch {
    if (!cached) return NextResponse.json({ ok: false, error: 'rpc' }, { status: 502 });
  }
  const id = request.nextUrl.searchParams.get('id');
  const token = request.nextUrl.searchParams.get('token')?.toLowerCase();
  let duels = cached.duels;
  if (id) duels = duels.filter((d) => d.id === id);
  if (token) duels = duels.filter((d) => d.bull?.address.toLowerCase() === token || d.bear?.address.toLowerCase() === token);
  return NextResponse.json(
    { ok: true, duels },
    { headers: { 'Cache-Control': 'public, max-age=15, stale-while-revalidate=60' } }
  );
}

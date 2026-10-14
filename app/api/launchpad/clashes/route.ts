import { NextResponse, NextRequest } from 'next/server';
import { createPublicClient, formatEther, getAddress, http, parseAbi, type Address } from 'viem';
import { base } from 'viem/chains';
import { LAUNCHPAD_NETWORKS, LAUNCH_STATE } from '../../../startpad/config';
import type { Clash, ClashSide, ClashToken } from '../../../startpad/duel';
import { parseMetadataUri } from '../../../startpad/metadata';
import { rpcCandidates } from '../historyRpc';
import { GET as boardGet } from '../board/route';

/**
 * GET /api/launchpad/clashes[?id=...|?token=0x..] - starcia Asset Clash / Bull vs Bear.
 *
 * Bez rejestru i BEZ SKANU LOGOW. Do 14.10 trasa skanowala `Launched` +
 * `LaunchMetadataSet` siedmiu launchpadow od bloku wdrozenia, w oknach po 9 500
 * blokow, w pamieci instancji: kazda zimna instancja przeliczala to od zera
 * (45-60 s, a pod obciazeniem 502), wiec karta wisiala na "Reading clashes from
 * Base..." i nie odswiezala sie. Teraz lista tokenow idzie z TRWALEGO indeksu
 * tablicy (`/api/launchpad/board?m=`, ten sam, na ktorym stoi hub), a metadane
 * (`duel.id`, strona a/b) czyta jeden multicall `metadataURI` - sa niezmienne,
 * wiec raz na token i do pamieci. Para liczy sie tylko, gdy obie strony ma TEN
 * SAM tworca i lezą na ROZNYCH perpach. Stan krzywych z `launchOf`, NAV i zmiana
 * 24h perpow z API Flash (jak /api/launchpad/perps).
 *
 * Blad odczytu NIE trafia do cache jako "pusto": rzut wraca do GET, ktory oddaje
 * poprzedni wynik albo 502, a klient ponawia.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const maxDuration = 30;

const CHAIN_ID = base.id;
const T0 = 1_000_000_000;
const TTL_MS = 30_000;
const META_CHUNK = 60;

const launchOfAbi = parseAbi([
  'function launchOf(address token) view returns (address creator, uint8 state, uint256 ethReserve, uint256 tokenReserve, uint40 startedAt, bytes32 launchId)',
]);
const metadataAbi = parseAbi(['function metadataURI(address token) view returns (string)']);

type Market = NonNullable<(typeof LAUNCHPAD_NETWORKS)[number]['markets']>[number];

type Entry = {
  token: Address;
  market: Market;
  creator?: Address;
  name?: string;
  symbol?: string;
  startedAt?: number;
  /** Metadane ssa niezmienne: raz przeczytane zostaja w pamieci instancji. */
  metaRead: boolean;
  duel?: { id: string; side: ClashSide; ticker: string };
  image?: string | null;
  description?: string | null;
};

type BoardToken = { address?: string; name?: string; symbol?: string; creator?: string; startedAt?: number };

const entries = new Map<string, Entry>(); // token(lower) -> wpis
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

/** Lista startow rynku z trwalego indeksu tablicy - wolana jako funkcja, bez dodatkowego HTTP. */
async function boardTokens(marketId: string): Promise<BoardToken[]> {
  const res = await boardGet(new NextRequest(`http://localhost/api/launchpad/board?chainId=${CHAIN_ID}&m=${encodeURIComponent(marketId)}`));
  if (!res.ok) throw new Error('board');
  const body = (await res.json()) as { tokens?: BoardToken[] };
  return body.tokens ?? [];
}

async function pickClient(): Promise<ReturnType<typeof makeClient>> {
  for (const url of rpcCandidates(CHAIN_ID, process.env, base.rpcUrls.default.http)) {
    try {
      const c = makeClient(url);
      await c.getBlockNumber();
      return c;
    } catch {
      // nastepny wezel
    }
  }
  throw new Error('rpc');
}

async function refresh(): Promise<Clash[]> {
  const net = LAUNCHPAD_NETWORKS[CHAIN_ID];
  const markets = net?.markets ?? [];

  // 1) Tozsamosc tokenow ze wszystkich rynkow perpow (blad jednego rynku = blad calosci).
  const perMarket = await Promise.all(markets.map(async (m) => ({ m, tokens: await boardTokens(m.id) })));
  for (const { m, tokens } of perMarket) {
    for (const t of tokens) {
      if (!t.address || !/^0x[0-9a-fA-F]{40}$/.test(t.address)) continue;
      const token = getAddress(t.address);
      const key = token.toLowerCase();
      const e = entries.get(key) ?? { token, market: m, metaRead: false };
      e.creator = t.creator ? getAddress(t.creator) : e.creator;
      e.name = t.name ?? e.name;
      e.symbol = t.symbol ?? e.symbol;
      e.startedAt = Number(t.startedAt ?? e.startedAt ?? 0);
      entries.set(key, e);
    }
  }

  const client = await pickClient();

  // 2) Metadane (duel) - tylko tokeny, ktorych jeszcze nie czytalismy.
  const unread = [...entries.values()].filter((e) => !e.metaRead);
  for (let i = 0; i < unread.length; i += META_CHUNK) {
    const chunk = unread.slice(i, i + META_CHUNK);
    const results = await client.multicall({
      allowFailure: true,
      contracts: chunk.map((e) => ({ address: e.market.launchpad as Address, abi: metadataAbi, functionName: 'metadataURI', args: [e.token] }) as const),
    });
    chunk.forEach((e, j) => {
      const r = results[j];
      if (r?.status !== 'success') throw new Error('rpc');
      const meta = parseMetadataUri(r.result as string);
      e.duel = meta.duel ?? undefined;
      e.image = meta.image;
      e.description = meta.description;
      e.metaRead = true;
    });
  }

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
  // Czesciowy blad odczytu (RPC pod obciazeniem) nie moze wpasc do cache jako "ta strona nie
  // wystartowala": karta pokazywalaby "Side not launched yet" przy dwoch istniejacych tokenach.
  if (states.some((r) => r.status !== 'success')) throw new Error('rpc');
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
      image: t.image ?? null,
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
    // Stary wynik zostaje, ale nastepna proba dopiero za ~5 s - nie bijemy w padajacy RPC przy kazdym zapytaniu.
    cached.at = Date.now() - TTL_MS + 5_000;
  }
  const id = request.nextUrl.searchParams.get('id');
  const token = request.nextUrl.searchParams.get('token')?.toLowerCase();
  let clashes = cached.clashes;
  if (id) clashes = clashes.filter((c) => c.id === id);
  if (token) clashes = clashes.filter((c) => c.a?.address.toLowerCase() === token || c.b?.address.toLowerCase() === token);
  return NextResponse.json({ ok: true, clashes }, { headers: { 'Cache-Control': 'public, max-age=15, s-maxage=15, stale-while-revalidate=60' } });
}

import { NextResponse } from 'next/server';
import { createPublicClient, http, parseAbiItem, type Address, type PublicClient } from 'viem';
import { base } from 'viem/chains';
import { rpcCandidates } from '../../launchpad/historyRpc';
import {
  EPOCH_BLOCKS,
  SEASON_GENESIS_BLOCK,
  epochRange,
  scoreEpoch,
  type TokenEpochInput,
} from '../../../startpad/sphere/season/epochMath';

/**
 * API sezonu volume mining (faza 1A - SHADOW: liczymy i publikujemy, nie
 * wyplacamy). Deterministyczny skan logow po ZAKRESACH BLOKOW epoki - nie po
 * czasie settle/harvest (spec 6.1: timing rozliczen nie moze byc gietka
 * zmienna). Dane zrodlowe zwracamy razem z wynikiem, zeby kazdy mogl
 * przeliczyc epoke u siebie tym samym epochMath.
 *
 * v1 (nazwane uproszczenia, zgodne ze specem):
 *  - post-grad wolumen z HookFeeTaken(isEth) * 100 (proxy 1%), bez
 *    wykluczenia adresow tworcy (atrybucja swapow v4 wymaga eventow
 *    PoolManagera - kandydat na v2);
 *  - LP fee poza capem reguly 0 (nieprzypisywalne do blokow);
 *  - mnoznik traderow liczony z krzywej.
 */

const LAUNCHPAD = '0xCF541A7EcE881945833ff1680dFc067C5Dd4cE2D' as Address;
const HOOK = '0x71028Ea6999e2c415b46cc022ED0A9fDca2e2044' as Address;
const SAFE = '0x83E2DE974FC6B866FDb78AEFa5596d58fDc4142F' as Address;
const CHAIN_ID = 8453;
const CHUNK = 9_500n; // publiczne RPC Base tna getLogs ~10k blokow
const REFRESH_MS = 5 * 60 * 1000;

const EV = {
  bought: parseAbiItem(
    'event Bought(address indexed token, address indexed buyer, uint256 ethIn, uint256 ethNet, uint256 feeEth, uint256 tokensOut, uint256 refund, uint256 ethReserveAfter, uint256 tokenReserveAfter)'
  ),
  sold: parseAbiItem(
    'event Sold(address indexed token, address indexed seller, uint256 tokensIn, uint256 ethGross, uint256 feeEth, uint256 ethOut, uint256 ethReserveAfter, uint256 tokenReserveAfter)'
  ),
  feeAccrued: parseAbiItem('event FeeAccrued(address indexed token, address indexed account, uint256 amount, uint8 kind)'),
  hookFee: parseAbiItem('event HookFeeTaken(address indexed token, bool indexed isEth, uint256 amount)'),
} as const;

type LaunchMeta = { creator: string; startedAt: bigint; symbol: string };

const LAUNCH_OF_ABI = [
  {
    type: 'function',
    name: 'launchOf',
    stateMutability: 'view',
    inputs: [{ name: 'token', type: 'address' }],
    outputs: [
      { name: 'creator', type: 'address' },
      { name: 'state', type: 'uint8' },
      { name: 'ethReserve', type: 'uint256' },
      { name: 'tokenReserve', type: 'uint256' },
      { name: 'startedAt', type: 'uint40' },
      { name: 'launchId', type: 'bytes32' },
    ],
  },
  { type: 'function', name: 'symbol', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'string' }] },
] as const;

// Cache w pamieci modulu: metadane tokenow (immutable po launchu) + wynik
// epoki odswiezany co REFRESH_MS. Restart procesu liczy od nowa -
// determinizm epochMath gwarantuje ten sam wynik.
const g = globalThis as unknown as {
  __sphereLaunches?: Map<string, LaunchMeta>;
  __sphereSeasonV2?: { at: number; body: unknown };
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Skan sekwencyjny z throttlem i rotacja transportow. Publiczny RPC Base
 * odmawia "over rate limit" przy rownoleglych getLogs - chunk po chunku
 * z odstepem 120 ms miesci sie w limicie, a przy odmowie: backoff i kolejny
 * transport z listy (doktryna historyRpc: zepsuty endpoint nie kasuje funkcji).
 */
async function scanRange<T>(
  clients: PublicClient[],
  from: bigint,
  to: bigint,
  fetch: (client: PublicClient, a: bigint, b: bigint) => Promise<T[]>
): Promise<T[]> {
  const out: T[] = [];
  let ci = 0;
  for (let a = from; a <= to; a += CHUNK) {
    const b = a + CHUNK - 1n > to ? to : a + CHUNK - 1n;
    let done = false;
    for (let attempt = 0; attempt < 6 && !done; attempt++) {
      try {
        out.push(...(await fetch(clients[ci], a, b)));
        done = true;
      } catch {
        ci = (ci + 1) % clients.length;
        await sleep(400 * (attempt + 1));
      }
    }
    if (!done) throw new Error(`getLogs nie przeszedl dla zakresu ${a}-${b} na zadnym RPC`);
    await sleep(120);
  }
  return out;
}

export async function GET() {
  const cached = g.__sphereSeasonV2;
  if (cached && Date.now() - cached.at < REFRESH_MS) {
    return NextResponse.json(cached.body, { headers: { 'x-sphere-cache': 'hit' } });
  }

  const env = process.env as Record<string, string | undefined>;
  const urls = [
    ...(rpcCandidates(CHAIN_ID, env).filter(Boolean) as string[]),
    env.NEXT_PUBLIC_INFURA_BASE_ENDPOINT?.trim(),
    'https://mainnet.base.org',
    'https://base-rpc.publicnode.com',
  ].filter((u, i, arr): u is string => Boolean(u) && arr.indexOf(u) === i);
  const clients = urls.map((u) => createPublicClient({ chain: base, transport: http(u) }));
  const client = clients[0];

  const head = await client.getBlockNumber();
  const { epochIndex, fromBlock, toBlock } = epochRange(head);
  const scanTo = head < toBlock ? head : toBlock;

  // ---- 1. zdarzenia epoki (SEKWENCYJNIE - rate limit publicznego RPC) ------
  const bought = await scanRange(clients, fromBlock, scanTo, (c, a, b) =>
    c.getLogs({ address: LAUNCHPAD, event: EV.bought, fromBlock: a, toBlock: b })
  );
  const sold = await scanRange(clients, fromBlock, scanTo, (c, a, b) =>
    c.getLogs({ address: LAUNCHPAD, event: EV.sold, fromBlock: a, toBlock: b })
  );
  const fees = await scanRange(clients, fromBlock, scanTo, (c, a, b) =>
    c.getLogs({ address: LAUNCHPAD, event: EV.feeAccrued, args: { account: SAFE }, fromBlock: a, toBlock: b })
  );
  const hookFees = await scanRange(clients, fromBlock, scanTo, (c, a, b) =>
    c.getLogs({ address: HOOK, event: EV.hookFee, args: { isEth: true }, fromBlock: a, toBlock: b })
  );

  // ---- 2. metadane AKTYWNYCH tokenow (launchOf + symbol, cache trwaly) -----
  // Tanio: zamiast skanu Launched od genesis, czytamy launchOf tylko dla
  // tokenow widocznych w epoce. launchOf oddaje creator + startedAt; token
  // spoza tego wdrozenia oddaje creator=0 i wypada z allowlisty.
  const launches = (g.__sphereLaunches ??= new Map<string, LaunchMeta>());
  const activeTokens = new Set<string>();
  for (const log of [...bought, ...sold, ...fees, ...hookFees]) {
    activeTokens.add((log.args.token as string).toLowerCase());
  }
  await Promise.all(
    [...activeTokens]
      .filter((t) => !launches.has(t))
      .map(async (token) => {
        try {
          const [l, symbol] = await Promise.all([
            client.readContract({ address: LAUNCHPAD, abi: LAUNCH_OF_ABI, functionName: 'launchOf', args: [token as Address] }),
            client.readContract({ address: token as Address, abi: LAUNCH_OF_ABI, functionName: 'symbol' }).catch(() => '?'),
          ]);
          const creator = (l as readonly unknown[])[0] as string;
          const startedAt = BigInt((l as readonly unknown[])[4] as bigint);
          if (creator && creator !== '0x0000000000000000000000000000000000000000') {
            launches.set(token, { creator, startedAt, symbol: symbol as string });
          }
        } catch {
          /* token spoza wdrozenia - pomijamy */
        }
      })
  );

  // ---- 3. agregacja per token + histogram dzienny pod wykres ---------------
  const perToken = new Map<string, TokenEpochInput & { traders: Set<string> }>();
  const ensure = (token: string): (TokenEpochInput & { traders: Set<string> }) | null => {
    const key = token.toLowerCase();
    const meta = launches.get(key);
    if (!meta) return null; // spoza allowlisty tego wdrozenia
    let row = perToken.get(key);
    if (!row) {
      row = {
        token: key,
        creator: meta.creator,
        startedAt: meta.startedAt,
        curveBuyNet: 0n,
        curveSellGross: 0n,
        curveSelfVolume: 0n,
        hookEthFees: 0n,
        protocolFeeEth: 0n,
        uniqueTraders: 0,
        traders: new Set<string>(),
      };
      perToken.set(key, row);
    }
    return row;
  };

  const DAY_BLOCKS = EPOCH_BLOCKS / 7n;
  const daily = Array.from({ length: 7 }, () => 0n);
  const dayOf = (block: bigint) => Number((block - fromBlock) / DAY_BLOCKS);

  for (const log of bought) {
    const row = ensure(log.args.token as string);
    if (!row) continue;
    const buyer = (log.args.buyer as string).toLowerCase();
    const net = log.args.ethNet as bigint;
    if (buyer === row.creator.toLowerCase()) row.curveSelfVolume += net;
    else {
      row.curveBuyNet += net;
      row.traders.add(buyer);
      daily[Math.min(6, dayOf(log.blockNumber!))] += net;
    }
  }
  for (const log of sold) {
    const row = ensure(log.args.token as string);
    if (!row) continue;
    const seller = (log.args.seller as string).toLowerCase();
    const gross = log.args.ethGross as bigint;
    if (seller === row.creator.toLowerCase()) row.curveSelfVolume += gross;
    else {
      row.curveSellGross += gross;
      row.traders.add(seller);
      daily[Math.min(6, dayOf(log.blockNumber!))] += gross;
    }
  }
  for (const log of fees) {
    const row = ensure(log.args.token as string);
    if (row) row.protocolFeeEth += log.args.amount as bigint;
  }
  for (const log of hookFees) {
    const row = ensure(log.args.token as string);
    if (!row) continue;
    row.hookEthFees += log.args.amount as bigint;
    daily[Math.min(6, dayOf(log.blockNumber!))] += (log.args.amount as bigint) * 100n;
  }

  const inputs: TokenEpochInput[] = [...perToken.values()].map((r) => ({ ...r, uniqueTraders: r.traders.size }));

  // Koniec epoki w unixie - do bramki wieku i odliczania w UI.
  const headTs = (await client.getBlock({ blockNumber: head })).timestamp;
  const epochEndUnix = headTs + (toBlock > head ? (toBlock - head) * 2n : 0n);

  const result = scoreEpoch(inputs, epochIndex, fromBlock, toBlock, epochEndUnix);

  const body = {
    shadow: true,
    computedAtBlock: head.toString(),
    epoch: {
      index: result.epochIndex,
      fromBlock: result.fromBlock.toString(),
      toBlock: result.toBlock.toString(),
      endsAtUnix: epochEndUnix.toString(),
      progressBps: Number(((scanTo - fromBlock) * 10_000n) / EPOCH_BLOCKS),
    },
    totals: {
      externalVolumeEth: result.totalExternalVolume.toString(),
      protocolEth: result.totalProtocolEth.toString(),
      creators: result.creators.length,
      tokens: inputs.length,
    },
    dailyVolumeEth: daily.map((d) => d.toString()),
    creators: result.creators.slice(0, 50).map((c) => ({
      creator: c.creator,
      shareBps: Number(c.shareBps),
      netProtocolEth: c.netProtocolEth.toString(),
      rewardCapEth: c.rewardCapEth.toString(),
      capBinding: c.capBinding,
      tokens: c.tokens.map((t) => ({
        token: t.token,
        symbol: launches.get(t.token)?.symbol ?? '?',
        externalVolumeEth: t.externalVolume.toString(),
        selfVolumeEth: t.curveSelfVolume.toString(),
        uniqueTraders: t.uniqueTraders,
        traderMultiplierBps: Number(t.traderMultiplierBps),
        ageEligible: t.ageEligible,
        weight: t.weight.toString(),
        cappedWeight: t.cappedWeight.toString(),
      })),
    })),
  };

  g.__sphereSeasonV2 = { at: Date.now(), body };
  return NextResponse.json(body, { headers: { 'x-sphere-cache': 'miss' } });
}

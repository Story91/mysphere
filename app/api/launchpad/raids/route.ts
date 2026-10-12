import { NextResponse, type NextRequest } from 'next/server';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { RAID_STATUS, raidVaultAbi, raidVaultOf, type RaidView } from '../../../startpad/raid';
import { rpcCandidates } from '../historyRpc';

/**
 * GET /api/launchpad/raids[?token=0x..] - raidy z RaidVault (Base): stan, pula,
 * terminy, notka lidera. Odczyt `raidCount` + `raidOf` multicallem (ostatnie 300).
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_RAIDS = 300;

export async function GET(request: NextRequest) {
  const vault = raidVaultOf(base.id);
  if (!vault) return NextResponse.json({ ok: true, raids: [], vault: null });
  const token = request.nextUrl.searchParams.get('token')?.toLowerCase() ?? null;
  for (const url of rpcCandidates(base.id, process.env, base.rpcUrls.default.http)) {
    try {
      const client = createPublicClient({ chain: base, transport: http(url, { fetchOptions: { cache: 'no-store' } }) });
      const count = Number(await client.readContract({ address: vault, abi: raidVaultAbi, functionName: 'raidCount' }));
      const from = Math.max(0, count - MAX_RAIDS);
      const ids = Array.from({ length: count - from }, (_, i) => from + i);
      const res = ids.length
        ? await client.multicall({
            allowFailure: true,
            contracts: ids.map((id) => ({ address: vault, abi: raidVaultAbi, functionName: 'raidOf', args: [BigInt(id)] }) as const),
          })
        : [];
      const raids: RaidView[] = [];
      res.forEach((r, i) => {
        if (r.status !== 'success') return;
        const x = r.result;
        if (token && x.token.toLowerCase() !== token) return;
        raids.push({
          id: ids[i],
          leader: x.leader,
          mode: x.mode === 0 ? 'eth' : 'perp',
          status: RAID_STATUS[x.status] ?? 'None',
          launchpad: x.launchpad,
          token: x.token,
          executeAfter: Number(x.executeAfter),
          expiresAt: Number(x.expiresAt),
          totalEth: x.totalEth.toString(),
          tokensBought: x.tokensBought.toString(),
          note: x.note,
        });
      });
      raids.reverse();
      return NextResponse.json({ ok: true, raids, vault }, { headers: { 'Cache-Control': 'public, max-age=10, stale-while-revalidate=30' } });
    } catch {
      // nastepny wezel
    }
  }
  return NextResponse.json({ ok: false, error: 'rpc' }, { status: 502 });
}

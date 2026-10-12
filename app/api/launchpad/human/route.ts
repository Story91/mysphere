import { NextResponse, type NextRequest } from 'next/server';
import { createPublicClient, getAddress, http, isAddress, parseAbi, type Address, type Hex } from 'viem';
import { base } from 'viem/chains';
import { rpcCandidates } from '../historyRpc';

/**
 * GET /api/launchpad/human?addresses=0x..,0x.. - ktore portfele maja Coinbase
 * Verification ("Coinbase Verified Account", EAS na Base).
 *
 * Plakietka "verified humans" na stronie tokena - bez zmian w kontraktach.
 * Indexer Coinbase daje uid atestacji dla adresu, a sama atestacja jest
 * sprawdzana w EAS: schemat, odbiorca, atestator Coinbase, brak odwolania i wygasniecia.
 * Rozpoznanie i adresy: docs/STARTPAD-HUMAN-LAUNCH.md.
 *
 * Tylko odczyt, tylko Base mainnet, najwyzej 100 adresow na zapytanie.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const INDEXER = '0x2c7eE1E5f416dfF40054c27A62f7B357C4E8619C' as const;
const EAS = '0x4200000000000000000000000000000000000021' as const;
const SCHEMA = '0xf8b05c79f090979bf4a80270aba232dff11a10d9ca55c4f88de95317970f0de9' as const;
// Atestator Coinbase - odczytany z prawdziwych atestacji 2026-10-12 (jesse.base.eth i inne).
const ATTESTER = '0x357458739F90461b99789350868CD7CF330Dd7EE' as const;
const ZERO_UID = `0x${'0'.repeat(64)}`;
const MAX_ADDRESSES = 100;
const TTL_MS = 10 * 60_000;

const indexerAbi = parseAbi(['function getAttestationUid(address recipient, bytes32 schemaUid) view returns (bytes32)']);
const easAbi = parseAbi([
  'function getAttestation(bytes32 uid) view returns ((bytes32 uid, bytes32 schema, uint64 time, uint64 expirationTime, uint64 revocationTime, bytes32 refUID, address recipient, address attester, bool revocable, bytes data))',
]);

const cache = new Map<string, { at: number; verified: boolean }>();

export async function GET(request: NextRequest) {
  const raw = (request.nextUrl.searchParams.get('addresses') ?? '').split(',').map((a) => a.trim()).filter(Boolean);
  const addresses = [...new Set(raw.filter((a) => isAddress(a)).map((a) => getAddress(a)))].slice(0, MAX_ADDRESSES);
  if (addresses.length === 0) return NextResponse.json({ ok: true, verified: [], checked: 0 });

  const now = Date.now();
  const todo = addresses.filter((a) => {
    const hit = cache.get(a);
    return !hit || now - hit.at > TTL_MS;
  });

  if (todo.length > 0) {
    let done = false;
    for (const url of rpcCandidates(base.id, process.env, base.rpcUrls.default.http)) {
      try {
        const client = createPublicClient({ chain: base, transport: http(url, { fetchOptions: { cache: 'no-store' } }) });
        const uids = await client.multicall({
          allowFailure: false,
          contracts: todo.map((a) => ({ address: INDEXER, abi: indexerAbi, functionName: 'getAttestationUid', args: [a, SCHEMA] }) as const),
        });
        const withUid = todo.map((a, i) => ({ address: a, uid: uids[i] as Hex })).filter((x) => x.uid !== ZERO_UID);
        const atts = withUid.length
          ? await client.multicall({
              allowFailure: true,
              contracts: withUid.map((x) => ({ address: EAS, abi: easAbi, functionName: 'getAttestation', args: [x.uid] }) as const),
            })
          : [];
        const nowSec = BigInt(Math.floor(now / 1000));
        const ok = new Set<Address>();
        withUid.forEach((x, i) => {
          const r = atts[i];
          if (r?.status !== 'success') return;
          const a = r.result;
          if (
            a.schema.toLowerCase() === SCHEMA &&
            getAddress(a.recipient) === x.address &&
            getAddress(a.attester) === ATTESTER &&
            a.revocationTime === 0n &&
            (a.expirationTime === 0n || a.expirationTime > nowSec)
          ) {
            ok.add(x.address);
          }
        });
        for (const a of todo) cache.set(a, { at: now, verified: ok.has(a) });
        done = true;
        break;
      } catch {
        // nastepny wezel z kolejki
      }
    }
    if (!done) return NextResponse.json({ ok: false, error: 'rpc' }, { status: 502 });
  }

  const verified = addresses.filter((a) => cache.get(a)?.verified);
  return NextResponse.json(
    { ok: true, verified, checked: addresses.length },
    { headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=600' } }
  );
}

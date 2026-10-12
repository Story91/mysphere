import { NextResponse, type NextRequest } from 'next/server';
import { getAddress, isAddress } from 'viem';
import { verifiedHumans } from '../humanCheck';

/**
 * GET /api/launchpad/human?addresses=0x..,0x.. - ktore portfele maja Coinbase
 * Verification ("Coinbase Verified Account", EAS na Base).
 *
 * Plakietka "verified humans" na stronie tokena - bez zmian w kontraktach.
 * Sprawdzenie: humanCheck.ts (indexer Coinbase + atestacja w EAS).
 * Tylko odczyt, tylko Base mainnet, najwyzej 100 adresow na zapytanie.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_ADDRESSES = 100;

export async function GET(request: NextRequest) {
  const raw = (request.nextUrl.searchParams.get('addresses') ?? '').split(',').map((a) => a.trim()).filter(Boolean);
  const addresses = [...new Set(raw.filter((a) => isAddress(a)).map((a) => getAddress(a)))].slice(0, MAX_ADDRESSES);
  if (addresses.length === 0) return NextResponse.json({ ok: true, verified: [], checked: 0 });
  try {
    const ok = await verifiedHumans(addresses);
    return NextResponse.json(
      { ok: true, verified: addresses.filter((a) => ok.has(a)), checked: addresses.length },
      { headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=600' } }
    );
  } catch {
    return NextResponse.json({ ok: false, error: 'rpc' }, { status: 502 });
  }
}

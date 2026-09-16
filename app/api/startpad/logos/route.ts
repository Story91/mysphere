import { NextRequest, NextResponse } from 'next/server';
import { list } from '@vercel/blob';
import { LAUNCHPAD_NETWORKS } from '../../../startpad/config';

/**
 * LOGO TOKENOW Z VERCEL BLOB - z pominieciem Firestore.
 *
 * Firestore trzymal logo jako data-URL base64 (do 200 KB na dokument) i przy
 * kazdym odczycie tablicy lecialy megabajty egressu - darmowy limit padal.
 * Teraz obrazki zyja w Blobie pod DETERMINISTYCZNA sciezka
 * `startpad/logos/{chainId}/{token}`, a ten route listuje je jednym `list()`
 * i oddaje mape token -> URL na CDN. Zero odczytow Firestore.
 *
 * GET /api/startpad/logos?chainId=84532  ->  { logos: { "0xabc...": "https://..." } }
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Lista zamknieta, bo `chainId` idzie prosto do sciezki w Blobie - bez niej
 * dowolny ciag z adresu listowalby dowolny prefiks kubelka.
 *
 * LICZY SIE Z `LAUNCHPAD_NETWORKS`, NIE Z RECZNEJ LISTY. Recznie wpisane id
 * rozjechaly sie z aplikacja: Arc mainnet (5042) dostal wpis w konfiguracji i
 * wlasny kubelek `startpad/logos/5042/`, POST wgrywal tam obrazki poprawnie,
 * ale ten route odpowiadal 400 i pusta mapa - wiec KAZDE logo na Arc mainnet
 * bylo niewidoczne (token ARPE, 16.09.2026). Klucze `LAUNCHPAD_NETWORKS` sa
 * nasze i zawsze liczbowe, wiec gwarancja "zaden obcy prefiks" zostaje, a
 * nowa siec dziala od razu po dodaniu do konfiguracji.
 */
const ALLOWED_CHAINS = new Set(Object.keys(LAUNCHPAD_NETWORKS));
const TOKEN_RE = /^0x[0-9a-f]{40}$/;

export async function GET(request: NextRequest) {
  const chainId = request.nextUrl.searchParams.get('chainId') ?? '84532';
  if (!ALLOWED_CHAINS.has(chainId)) {
    return NextResponse.json({ logos: {} }, { status: 400, headers: { 'cache-control': 'no-store' } });
  }

  try {
    const { blobs } = await list({
      prefix: `startpad/logos/${chainId}/`,
      token: process.env.BLOB_READ_WRITE_TOKEN,
      limit: 1000,
    });
    const logos: Record<string, string> = {};
    for (const blob of blobs) {
      const token = blob.pathname.split('/').pop()?.toLowerCase();
      if (token && TOKEN_RE.test(token)) logos[token] = blob.url;
    }
    return NextResponse.json(
      { logos },
      { headers: { 'cache-control': 'public, max-age=60, stale-while-revalidate=300' } }
    );
  } catch {
    // Blad Bloba nie moze wywalac tablicy - oddajemy pustke, karty pokazuja glyph.
    return NextResponse.json({ logos: {} }, { headers: { 'cache-control': 'no-store' } });
  }
}

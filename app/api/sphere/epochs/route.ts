import { NextResponse } from 'next/server';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { rpcCandidates } from '../../launchpad/historyRpc';
import { EPOCH_BLOCKS, EXCLUDED_TOKENS, SEASON_GENESIS_BLOCK } from '../../../startpad/sphere/season/epochMath';

/**
 * Lista ZAMKNIETYCH epok sezonu + podsumowania z opublikowanych manifestow.
 *
 * Zrodlem prawdy sa pliki epoch-N.json pisane przez scripts/sphere/publishEpoch.ts
 * - dokladnie te, ktorych manifestHash poszedl w propose() na
 * SphereStreamingMerkleDistributor. Trasa NICZEGO nie przelicza: czyta manifesty
 * i dokleja numer biezacej epoki, zeby panel wiedzial, ktore epoki sa historia.
 *
 * ===========================================================================
 * SKAD CZYTAMY MANIFESTY - POPRAWKA 2026-09-10
 * ===========================================================================
 * Trasa czytala WYLACZNIE scripts/output/sphere-epochs. Na produkcji ten
 * katalog NIE ISTNIEJE: `.vercelignore` wyklucza CALE `scripts/` z deploya
 * (jest tam nawet ostrzezenie "NIE WOLNO tam trzymac niczego, co jest
 * potrzebne przy buildzie"). readdirSync leciala z ENOENT, `catch` zwracal
 * pusta mape i KAZDA epoka raportowala `manifest: null` - strona pisala
 * "Manifest not published yet" o roocie, ktory stoi aktywny w dystrybutorze.
 * outputFileTracingIncludes w next.config.js tego nie ratuje: sledzenie
 * dokleja pliki, ktore zostaly WGRANE, a te sa wyciete przed buildem.
 *
 * publishEpoch.ts pisze ten sam plik w TRZY miejsca (scripts/output, public/
 * i Blob), wiec bierzemy je po kolei:
 *   1. fs scripts/output/sphere-epochs  - lokalnie, zaraz po publikacji;
 *   2. fs public/sphere-epochs          - kopia w repo (gdyby kiedys byla
 *                                         sledzona do bundla funkcji);
 *   3. Blob                             - tam automat epoki publikuje BEZ
 *                                         deployu, wiec bywa najswiezszy;
 *   4. wlasny origin /sphere-epochs     - statyk z public/, zawsze wdrozony.
 * Punkt 4 dziala na Vercelu bez zadnej zmiany w next.config.js - to ta sama
 * droga, ktora od poczatku dziala w karcie Claim (SphereRewardsClaim.tsx).
 *
 * Mapa `cumulative` i tablica `board` ida do klienta w calosci: to publiczne
 * dane manifestu, a panel liczy z nich przyrost naleznosci konta per epoka
 * (dystrybutor jest kumulatywny - patrz sekcja 6.1 tokenomiki) i pokazuje
 * tablice tworcow ostatniej epoki, ktora cokolwiek punktowala.
 */

const CHAIN_ID = 8453;
const REFRESH_MS = 5 * 60 * 1000;
const MAX_EPOCH_ROWS = 200;
/** Ile numerow epok probujemy po HTTP, gdy latest.json nie dojechal. */
const HTTP_PROBE_DEPTH = 12;

export const dynamic = 'force-dynamic';

/** Wiersz tablicy tworcow - PRZEPISANY z manifestu, nic tu nie jest liczone. */
type ManifestCreator = {
  creator: string;
  shareBps: number;
  netProtocolEth: string;
  rewardCapEth: string;
  /** Tokeny tego tworcy z `inputs` manifestu, bez wykluczonych z sezonu. */
  tokens: string[];
};

type ManifestSummary = {
  closedAtPublish: boolean;
  externalVolumeEth: string;
  protocolEth: string;
  creators: number;
  tokens: number;
  poolSphere: string;
  root: string | null;
  manifestHash: string;
  cumulative: Record<string, string>;
  board: ManifestCreator[];
  url: string;
};

type EpochRowBody = {
  index: number;
  fromBlock: string;
  toBlock: string;
  manifest: ManifestSummary | null;
};

type Entry = ManifestSummary & { closedFlag: boolean };

const g = globalThis as unknown as {
  __sphereEpochsV2?: { at: number; body: unknown };
  /** Manifesty ZAMKNIETYCH epok sa niezmienne - pamietamy je na stale. */
  __sphereEpochClosed?: Map<number, Entry>;
};

const MANIFEST_DIRS = [
  join(process.cwd(), 'scripts', 'output', 'sphere-epochs'),
  join(process.cwd(), 'public', 'sphere-epochs'),
];

/**
 * Host Bloba to id sklepu bez prefiksu `store_`, malymi literami (env trzyma
 * "store_SaqX..." w cudzyslowie i z wielkimi literami) - ta sama normalizacja,
 * co w SphereRewardsClaim.
 */
function blobBase(): string | null {
  const raw = process.env.NEXT_PUBLIC_VERCEL_BLOB_STORE_ID ?? '';
  const id = raw.replace(/["']/g, '').replace(/^store_/i, '').toLowerCase();
  return id ? `https://${id}.public.blob.vercel-storage.com/sphere-epochs` : null;
}

/** Wlasny origin zapytania - statyki z public/ sa pod nim zawsze. */
function originOf(req: Request): string | null {
  try {
    const url = new URL(req.url);
    const proto = req.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '');
    const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? url.host;
    return host ? `${proto}://${host}` : null;
  } catch {
    return null;
  }
}

/** Surowa tresc manifestu z pierwszego zrodla, ktore ja ma. */
async function readManifestText(name: string, req: Request): Promise<string | null> {
  for (const dir of MANIFEST_DIRS) {
    try {
      return readFileSync(join(dir, name), 'utf8');
    } catch {
      /* nastepne zrodlo */
    }
  }
  const origin = originOf(req);
  const bases = [blobBase(), origin ? `${origin}/sphere-epochs` : null].filter((b): b is string => Boolean(b));
  for (const b of bases) {
    try {
      const r = await fetch(`${b}/${name}`, { cache: 'no-store' });
      if (r.ok) return await r.text();
    } catch {
      /* nastepne zrodlo */
    }
  }
  return null;
}

/**
 * Ktore numery epok maja opublikowany manifest. Z dysku - listing katalogu;
 * bez dysku - `latest.json` podaje najnowszy numer, a reszta to 0..N (przy
 * braku latest.json probujemy plytko w tyl, zeby jeden zgubiony plik indeksu
 * nie kasowal calej historii).
 */
async function publishedIndexes(req: Request): Promise<number[]> {
  const found = new Set<number>();
  for (const dir of MANIFEST_DIRS) {
    try {
      for (const f of readdirSync(dir)) {
        const m = /^epoch-(\d+)\.json$/.exec(f);
        if (m) found.add(Number(m[1]));
      }
    } catch {
      /* katalog nie istnieje w tym wdrozeniu */
    }
  }
  if (found.size > 0) return [...found].sort((a, b) => a - b);

  const latestRaw = await readManifestText('latest.json', req);
  if (latestRaw) {
    try {
      const newest = Number((JSON.parse(latestRaw) as { epoch?: unknown }).epoch);
      if (Number.isInteger(newest) && newest >= 0) {
        return Array.from({ length: newest + 1 }, (_, i) => i);
      }
    } catch {
      /* uszkodzony indeks nie moze polozyc listy */
    }
  }
  return Array.from({ length: HTTP_PROBE_DEPTH }, (_, i) => i);
}

function summarize(raw: Record<string, unknown>, idx: number): Entry {
  const result = (raw.result ?? {}) as { creators?: unknown[]; totalExternalVolume?: unknown; totalProtocolEth?: unknown };
  const inputs = Array.isArray(raw.inputs) ? (raw.inputs as { token?: string; creator?: string }[]) : [];
  // Tokeny per tworca - wprost z `inputs`, z pominieciem wykluczonych z sezonu
  // (SPHERE). Wykluczony token nie wszedl do punktacji, wiec nie moze stac
  // przy nagrodzie jako jej powod.
  const tokensOf = new Map<string, string[]>();
  for (const i of inputs) {
    const token = String(i.token ?? '').toLowerCase();
    const creator = String(i.creator ?? '').toLowerCase();
    if (!token || !creator || EXCLUDED_TOKENS.has(token)) continue;
    tokensOf.set(creator, [...(tokensOf.get(creator) ?? []), token]);
  }
  const rows = Array.isArray(result.creators) ? (result.creators as Record<string, unknown>[]) : [];
  const board: ManifestCreator[] = rows.map((c) => {
    const creator = String(c.creator ?? '').toLowerCase();
    return {
      creator,
      shareBps: Number(c.shareBps ?? 0),
      netProtocolEth: String(c.netProtocolEth ?? '0'),
      rewardCapEth: String(c.rewardCapEth ?? '0'),
      tokens: tokensOf.get(creator) ?? [],
    };
  });
  return {
    closedFlag: Boolean(raw.closed),
    closedAtPublish: Boolean(raw.closed),
    externalVolumeEth: String(result.totalExternalVolume ?? '0'),
    protocolEth: String(result.totalProtocolEth ?? '0'),
    creators: board.length,
    tokens: inputs.length,
    poolSphere: String(raw.poolSphere ?? '0'),
    root: (raw.root as string | undefined) ?? null,
    manifestHash: String(raw.manifestHash ?? ''),
    cumulative: (raw.cumulative ?? {}) as Record<string, string>,
    board,
    // Kanoniczny publiczny plik (publishEpoch pisze te sama tresc do
    // public/sphere-epochs i na Blob) - statyczny, wiec tani i wieczny.
    url: `/sphere-epochs/epoch-${idx}.json`,
  };
}

async function readManifests(req: Request): Promise<Map<number, Entry>> {
  const closedMemo = (g.__sphereEpochClosed ??= new Map<number, Entry>());
  const out = new Map<number, Entry>();
  const indexes = await publishedIndexes(req);
  await Promise.all(
    indexes.map(async (idx) => {
      // Epoka zamknieta ma manifest niezmienny z definicji (root poszedl juz
      // w propose) - drugi raz jej nie sciagamy.
      const cached = closedMemo.get(idx);
      if (cached) {
        out.set(idx, cached);
        return;
      }
      const text = await readManifestText(`epoch-${idx}.json`, req);
      if (!text) return;
      try {
        const entry = summarize(JSON.parse(text) as Record<string, unknown>, idx);
        out.set(idx, entry);
        if (entry.closedFlag) closedMemo.set(idx, entry);
      } catch {
        /* uszkodzony plik nie moze polozyc calej listy */
      }
    })
  );
  return out;
}

/**
 * Glowa lancucha = MAKSIMUM ze wszystkich transportow, nie pierwszy sukces.
 * Publiczny RPC potrafi byc DNI za lancuchem bez zadnego bledu (zmierzone
 * 2026-09-06 w trasie sezonu) - pierwszy-sukces zanizalby wtedy numer
 * biezacej epoki i lista "zamknietych" tygodni klamalaby.
 */
async function headBlock(): Promise<bigint | null> {
  const env = process.env as Record<string, string | undefined>;
  const urls = [
    ...(rpcCandidates(CHAIN_ID, env).filter(Boolean) as string[]),
    env.NEXT_PUBLIC_INFURA_BASE_ENDPOINT?.trim(),
    'https://mainnet.base.org',
    'https://base-rpc.publicnode.com',
  ].filter((u, i, arr): u is string => Boolean(u) && arr.indexOf(u) === i);
  const votes = await Promise.allSettled(
    urls.map((u) => createPublicClient({ chain: base, transport: http(u) }).getBlockNumber())
  );
  const head = votes.reduce<bigint>((max, h) => (h.status === 'fulfilled' && h.value > max ? h.value : max), 0n);
  return head === 0n ? null : head;
}

export async function GET(req: Request) {
  const cached = g.__sphereEpochsV2;
  if (cached && Date.now() - cached.at < REFRESH_MS) {
    return NextResponse.json(cached.body, { headers: { 'x-sphere-cache': 'hit' } });
  }

  const manifests = await readManifests(req);

  /**
   * NUMER BIEZACEJ EPOKI - MAKSIMUM Z DWOCH ZRODEL, NIE SAM RPC.
   *
   * Wzor jest ten sam, co w epochRange() (/api/sphere/season): (head - genesis)
   * / EPOCH_BLOCKS. Sam wzor jednak nie wystarcza, bo zalezy od glowy lancucha,
   * a ta bywa zanizona: zmierzone 10.09.2026 na produkcji, na tym samym
   * wdrozeniu i w tej samej minucie, dwie instancje tej trasy oddawaly
   * currentEpochIndex 4 i 3 (drugiej odpowiedzial tylko RPC spozniony o ~39 h,
   * reszta transportow odmowila). Sezon pokazywal wtedy epoke 4, historia
   * epoke 3 - i epoka 3, ktora MA manifest i czeka jako pending root, nie
   * pojawiala sie w "Previous epochs" wcale.
   *
   * Manifest jest dowodem, ktory nie potrafi sie spoznic:
   *   closed=true dla epoki N  -> lancuch minal toBlock(N) -> biezaca >= N+1
   *   closed=false dla epoki N -> publikacja W TRAKCIE N   -> biezaca >= N
   * Bierzemy wieksza z dwoch liczb. Zawyzenie jest niemozliwe (manifest
   * powstaje z przeskanowanych blokow), a zanizenie przestaje byc mozliwe.
   */
  const head = await headBlock();
  const rpcIndex =
    head === null ? null : Number((head > SEASON_GENESIS_BLOCK ? head - SEASON_GENESIS_BLOCK : 0n) / EPOCH_BLOCKS);
  let manifestFloor = 0;
  for (const [idx, m] of manifests) manifestFloor = Math.max(manifestFloor, idx + (m.closedFlag ? 1 : 0));
  const currentEpochIndex = Math.max(rpcIndex ?? 0, manifestFloor);
  const headSource =
    rpcIndex === null ? 'manifest-fallback' : manifestFloor > rpcIndex ? 'manifest-floor' : 'rpc';

  const epochs: EpochRowBody[] = [];
  for (let i = currentEpochIndex - 1; i >= 0 && epochs.length < MAX_EPOCH_ROWS; i--) {
    const fromBlock = SEASON_GENESIS_BLOCK + BigInt(i) * EPOCH_BLOCKS;
    const entry = manifests.get(i);
    let manifest: ManifestSummary | null = null;
    if (entry) {
      const { closedFlag: _closedFlag, ...summary } = entry;
      manifest = summary;
    }
    epochs.push({
      index: i,
      fromBlock: fromBlock.toString(),
      toBlock: (fromBlock + EPOCH_BLOCKS - 1n).toString(),
      manifest,
    });
  }

  const body = {
    currentEpochIndex,
    headSource,
    epochs,
  };
  g.__sphereEpochsV2 = { at: Date.now(), body };
  return NextResponse.json(body, { headers: { 'x-sphere-cache': 'miss' } });
}

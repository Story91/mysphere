import { NextResponse } from 'next/server';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { rpcCandidates } from '../../launchpad/historyRpc';
import { EPOCH_BLOCKS, SEASON_GENESIS_BLOCK } from '../../../startpad/sphere/season/epochMath';

/**
 * Lista ZAMKNIETYCH epok sezonu + podsumowania z opublikowanych manifestow.
 *
 * Zrodlem prawdy sa pliki scripts/output/sphere-epochs/epoch-N.json pisane
 * przez scripts/sphere/publishEpoch.ts - dokladnie te, ktorych manifestHash
 * pojdzie w propose() na SphereStreamingMerkleDistributor. Trasa NICZEGO nie
 * przelicza: czyta manifesty z dysku i dokleja numer biezacej epoki (jeden
 * getBlockNumber), zeby panel wiedzial, ktore epoki sa juz historia.
 *
 * Manifesty trafiaja do bundla funkcji przez outputFileTracingIncludes
 * w next.config.js - fs w drzewie zrodel nie jest sledzone samo z siebie
 * na Vercelu (ta sama lekcja co przy krojach kart OG).
 *
 * Mapa `cumulative` idzie do klienta w calosci: to publiczne dane manifestu,
 * a panel liczy z niej przyrost naleznosci konta per epoka (dystrybutor
 * jest kumulatywny - patrz sekcja 6.1 tokenomiki).
 */

const CHAIN_ID = 8453;
const REFRESH_MS = 5 * 60 * 1000;
const MAX_EPOCH_ROWS = 200;

export const dynamic = 'force-dynamic';

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
  url: string;
};

type EpochRowBody = {
  index: number;
  fromBlock: string;
  toBlock: string;
  manifest: ManifestSummary | null;
};

const g = globalThis as unknown as {
  __sphereEpochsV1?: { at: number; body: unknown };
};

function readManifests(): Map<number, ManifestSummary & { closedFlag: boolean }> {
  const dir = join(process.cwd(), 'scripts', 'output', 'sphere-epochs');
  const out = new Map<number, ManifestSummary & { closedFlag: boolean }>();
  let files: string[] = [];
  try {
    files = readdirSync(dir);
  } catch {
    return out; // katalog jeszcze nie istnieje - zadnych publikacji
  }
  for (const f of files) {
    const m = /^epoch-(\d+)\.json$/.exec(f);
    if (!m) continue;
    try {
      const raw = JSON.parse(readFileSync(join(dir, f), 'utf8'));
      const idx = Number(m[1]);
      out.set(idx, {
        closedFlag: Boolean(raw.closed),
        closedAtPublish: Boolean(raw.closed),
        externalVolumeEth: String(raw.result?.totalExternalVolume ?? '0'),
        protocolEth: String(raw.result?.totalProtocolEth ?? '0'),
        creators: Array.isArray(raw.result?.creators) ? raw.result.creators.length : 0,
        tokens: Array.isArray(raw.inputs) ? raw.inputs.length : 0,
        poolSphere: String(raw.poolSphere ?? '0'),
        root: raw.root ?? null,
        manifestHash: String(raw.manifestHash ?? ''),
        cumulative: (raw.cumulative ?? {}) as Record<string, string>,
        // Kanoniczny publiczny plik (publishEpoch pisze te sama tresc do
        // public/sphere-epochs i na Blob) - statyczny, wiec tani i wieczny.
        url: `/sphere-epochs/epoch-${idx}.json`,
      });
    } catch {
      /* uszkodzony plik nie moze polozyc calej listy */
    }
  }
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

export async function GET() {
  const cached = g.__sphereEpochsV1;
  if (cached && Date.now() - cached.at < REFRESH_MS) {
    return NextResponse.json(cached.body, { headers: { 'x-sphere-cache': 'hit' } });
  }

  const manifests = readManifests();

  const head = await headBlock();
  let currentEpochIndex: number;
  if (head !== null) {
    const sinceGenesis = head > SEASON_GENESIS_BLOCK ? head - SEASON_GENESIS_BLOCK : 0n;
    currentEpochIndex = Number(sinceGenesis / EPOCH_BLOCKS);
  } else if (manifests.size > 0) {
    // Fallback bez RPC: manifest z closed=false byl publikowany W TRAKCIE
    // swojej epoki (biezaca >= jego indeks), closed=true - po niej.
    const newestIdx = Math.max(...manifests.keys());
    currentEpochIndex = newestIdx + (manifests.get(newestIdx)!.closedFlag ? 1 : 0);
  } else {
    currentEpochIndex = 0;
  }

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
    headSource: head !== null ? 'rpc' : 'manifest-fallback',
    epochs,
  };
  g.__sphereEpochsV1 = { at: Date.now(), body };
  return NextResponse.json(body, { headers: { 'x-sphere-cache': 'miss' } });
}

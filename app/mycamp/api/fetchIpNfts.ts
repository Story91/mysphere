import { createPublicClient, http } from 'viem';
import { baseCampChain } from '@/app/contracts/BaseCampPostContract';
import { ipfsToHttp } from '@/utils/ipfs';

type NftTx = {
  contractAddress: string;
  tokenID: string;
  tokenSymbol?: string;
  tokenName?: string;
  from: string;
  to: string;
  timeStamp: string;
};

const ERC721_ABI = [
  {
    name: 'tokenURI',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ type: 'string' }],
  },
  {
    // Camp Origin oznacza tu stan pracy: 0 ACTIVE, 1 DELETED, 2 DISPUTED.
    name: 'dataStatus',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ type: 'uint8' }],
  },
] as const;

/**
 * Stan pracy wedlug Camp Origin.
 *
 * PO CO TO CZYTAMY: wystawienie na sprzedaz pracy zgloszonej jako naruszenie
 * albo usunietej przez tworce to nie jest usterka kosmetyczna, tylko ryzyko
 * prawne i strata pieniedzy kupujacego. Camp prowadzi ten rejestr w kontrakcie
 * IpNFT, wiec wystarczy go przeczytac - nie potrzeba do tego sesji SDK.
 *
 * Blad odczytu NIE ukrywa pracy. Starsze kolekcje moga nie miec tej funkcji,
 * a chowanie czyjegos NFT dlatego, ze RPC nie odpowiedzialo, byloby gorsze
 * od pokazania go.
 */
export const DATA_STATUS = { ACTIVE: 0, DELETED: 1, DISPUTED: 2 } as const;

async function readDataStatus(
  client: ReturnType<typeof createPublicClient>,
  contract: string,
  tokenId: string,
): Promise<number> {
  try {
    const v = await client.readContract({
      address: contract as `0x${string}`,
      abi: ERC721_ABI,
      functionName: 'dataStatus',
      args: [BigInt(tokenId)],
    });
    return Number(v);
  } catch {
    return DATA_STATUS.ACTIVE;
  }
}

const BLOCKSCOUT = 'https://camp.cloud.blockscout.com/api';

export async function fetchIpNftsFor(address: string) {
  const res = await fetch(`${BLOCKSCOUT}?module=account&action=tokennfttx&address=${address}`);
  const json = await res.json();
  const result = (json?.result || []) as NftTx[];

  // IP NFT Origin na Camp mainnet (484). Stary 0xF907...324E to Basecamp
  // testnet - na 484 nie ma kodu. Adres z DATANFT_CONTRACT_ADDRESS w
  // @campnetwork/origin 1.3.2, potwierdzony eth_getCode + Blockscout (ERC-721 'IP NFT').
  const IP_NFT_CONTRACT = '0x39EeE1C3989f0dD543Dee60f8582F7F81F522C38';
  
  const ipNftTransfers = result.filter((tx) =>
    tx.contractAddress.toLowerCase() === IP_NFT_CONTRACT.toLowerCase() ||
    (tx.tokenSymbol || '').toUpperCase() === 'IP' || 
    (tx.tokenName || '').toLowerCase().includes('ipnft')
  );

  const lastByKey = new Map<string, NftTx>();
  for (const tx of ipNftTransfers) {
    const key = `${tx.contractAddress}-${tx.tokenID}`;
    const prev = lastByKey.get(key);
    if (!prev || Number(tx.timeStamp) > Number(prev.timeStamp)) lastByKey.set(key, tx);
  }
  const owned = [...lastByKey.values()].filter(
    (tx) => tx.to && tx.to.toLowerCase() === address.toLowerCase()
  );

  const client = createPublicClient({
    chain: baseCampChain,
    transport: http(baseCampChain.rpcUrls.default.http[0]),
  });

  const items = await Promise.all(
    owned.map(async (o) => {
      let tokenUri = '';
      let metadata: any = null;
      let image = '';
      let mediaType: 'image' | 'video' | 'audio' | 'text' | 'unknown' = 'unknown';
      try {
        tokenUri = (await client.readContract({
          address: o.contractAddress as `0x${string}`,
          abi: ERC721_ABI,
          functionName: 'tokenURI',
          args: [BigInt(o.tokenID)],
        })) as string;
        const metaUrl = ipfsToHttp(tokenUri);
        if (metaUrl) {
          metadata = await fetch(metaUrl, {
            // BEZ `cache: 'no-store'`: tresc IPFS jest adresowana skrotem, wiec
            // nie ma czego odswiezac, a /api/ipfs oddaje ja z naglowkiem
            // `immutable`. Wczesniejsze `no-store` kazalo przegladarce
            // pobierac kazda metadana od nowa przy kazdym wejsciu.
            // Limit czasu, bo bez niego jedna zawieszona bramka trzymala
            // cale Promise.all - i siatka nie pokazywala sie wcale.
            signal: AbortSignal.timeout(12_000),
          })
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null);
          if (metadata?.image) image = ipfsToHttp(metadata.image);
          // prosta detekcja typu medium na podstawie metadata
          const animUrl = metadata?.animation_url || metadata?.animationUrl;
          const mime = (metadata?.properties?.mimeType || metadata?.mimeType || '').toString().toLowerCase();
          const ext = (animUrl || image || '').split('?')[0].split('#')[0].split('.').pop()?.toLowerCase();
          const isVideo = mime.startsWith('video/') || ['mp4','webm','mov','m4v'].includes(ext || '');
          const isAudio = mime.startsWith('audio/') || ['mp3','wav','ogg','m4a','flac'].includes(ext || '');
          const isText  = mime.startsWith('text/')  || ['txt','md','rtf','csv','json'].includes(ext || '');
          if (isVideo) mediaType = 'video';
          else if (isAudio) mediaType = 'audio';
          else if (isText) mediaType = 'text';
          else if (image) mediaType = 'image';
          else if (metadata?.text || metadata?.content) mediaType = 'text';
        }
      } catch {}
      // Ensure consistent contract address format for IP NFT
      const contractAddress = o.contractAddress.toLowerCase() === IP_NFT_CONTRACT.toLowerCase() 
        ? IP_NFT_CONTRACT 
        : o.contractAddress;
        
      const mediaUrl = (metadata?.animation_url || metadata?.animationUrl || image) ? ipfsToHttp(metadata?.animation_url || metadata?.animationUrl || image) : '';
      const mimeOut = (metadata?.properties?.mimeType || metadata?.mimeType || '').toString();
      const status = await readDataStatus(client, o.contractAddress, o.tokenID);
      return {
        status,
        contract: contractAddress,
        tokenId: o.tokenID,
        tokenUri,
        metadata,
        image,
        mediaUrl,
        mime: mimeOut,
        type: mediaType,
      };
    })
  );

  // Prace usuniete i zgloszone jako naruszenie nie trafiaja do siatki.
  return items.filter((i: any) => i.status === DATA_STATUS.ACTIVE);
}

export async function fetchRecentIpNfts(limit: number = 50) {
  const IP_NFT_CONTRACT = '0x39EeE1C3989f0dD543Dee60f8582F7F81F522C38';
  const res = await fetch(`${BLOCKSCOUT}?module=account&action=tokennfttx&contractaddress=${IP_NFT_CONTRACT}`);
  const json = await res.json();
  const result = (json?.result || []) as NftTx[];

  // Sort by timestamp desc and take unique token IDs
  const sorted = [...result].sort((a, b) => Number(b.timeStamp) - Number(a.timeStamp));
  const seen = new Set<string>();
  const latestUnique: NftTx[] = [];
  for (const tx of sorted) {
    if (!seen.has(tx.tokenID)) {
      seen.add(tx.tokenID);
      latestUnique.push(tx);
    }
    if (latestUnique.length >= limit) break;
  }

  const client = createPublicClient({
    chain: baseCampChain,
    transport: http(baseCampChain.rpcUrls.default.http[0]),
  });

  const items = await Promise.all(
    latestUnique.map(async (o) => {
      let tokenUri = '';
      let metadata: any = null;
      let image = '';
      let mediaType: 'image' | 'video' | 'audio' | 'text' | 'unknown' = 'unknown';
      try {
        tokenUri = (await client.readContract({
          address: IP_NFT_CONTRACT as `0x${string}`,
          abi: ERC721_ABI,
          functionName: 'tokenURI',
          args: [BigInt(o.tokenID)],
        })) as string;
        const metaUrl = ipfsToHttp(tokenUri);
        if (metaUrl) {
          metadata = await fetch(metaUrl, {
            // BEZ `cache: 'no-store'`: tresc IPFS jest adresowana skrotem, wiec
            // nie ma czego odswiezac, a /api/ipfs oddaje ja z naglowkiem
            // `immutable`. Wczesniejsze `no-store` kazalo przegladarce
            // pobierac kazda metadana od nowa przy kazdym wejsciu.
            // Limit czasu, bo bez niego jedna zawieszona bramka trzymala
            // cale Promise.all - i siatka nie pokazywala sie wcale.
            signal: AbortSignal.timeout(12_000),
          })
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null);
          if (metadata?.image) image = ipfsToHttp(metadata.image);
          const animUrl = metadata?.animation_url || metadata?.animationUrl;
          const mime = (metadata?.properties?.mimeType || metadata?.mimeType || '').toString().toLowerCase();
          const ext = (animUrl || image || '').split('?')[0].split('#')[0].split('.').pop()?.toLowerCase();
          const isVideo = mime.startsWith('video/') || ['mp4','webm','mov','m4v'].includes(ext || '');
          const isAudio = mime.startsWith('audio/') || ['mp3','wav','ogg','m4a','flac'].includes(ext || '');
          const isText  = mime.startsWith('text/')  || ['txt','md','rtf','csv','json'].includes(ext || '');
          if (isVideo) mediaType = 'video';
          else if (isAudio) mediaType = 'audio';
          else if (isText) mediaType = 'text';
          else if (image) mediaType = 'image';
          else if (metadata?.text || metadata?.content) mediaType = 'text';
        }
      } catch {}

      const mediaUrl = (metadata?.animation_url || metadata?.animationUrl || image) ? ipfsToHttp(metadata?.animation_url || metadata?.animationUrl || image) : '';
      const mimeOut = (metadata?.properties?.mimeType || metadata?.mimeType || '').toString();
      const status = await readDataStatus(client, IP_NFT_CONTRACT, o.tokenID);
      return {
        status,
        contract: IP_NFT_CONTRACT,
        tokenId: o.tokenID,
        tokenUri,
        metadata,
        image,
        mediaUrl,
        mime: mimeOut,
        type: mediaType,
        isListed: false,
      };
    })
  );

  // Prace usuniete i zgloszone jako naruszenie nie trafiaja do siatki.
  return items.filter((i: any) => i.status === DATA_STATUS.ACTIVE);
}



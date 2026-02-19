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
] as const;

const BLOCKSCOUT = 'https://camp.cloud.blockscout.com/api';

export async function fetchIpNftsFor(address: string) {
  const res = await fetch(`${BLOCKSCOUT}?module=account&action=tokennfttx&address=${address}`);
  const json = await res.json();
  const result = (json?.result || []) as NftTx[];

  // IP NFT contract address from Origin SDK
  const IP_NFT_CONTRACT = '0xF90733b9eCDa3b49C250B2C3E3E42c96fC93324E';
  
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
          metadata = await fetch(metaUrl, { cache: 'no-store' })
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
      return {
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

  return items;
}

export async function fetchRecentIpNfts(limit: number = 50) {
  const IP_NFT_CONTRACT = '0xF90733b9eCDa3b49C250B2C3E3E42c96fC93324E';
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
          metadata = await fetch(metaUrl, { cache: 'no-store' })
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
      return {
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

  return items;
}



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

const BLOCKSCOUT = 'https://basecamp.cloud.blockscout.com/api';

export async function fetchIpNftsFor(address: string) {
  const res = await fetch(`${BLOCKSCOUT}?module=account&action=tokennfttx&address=${address}`);
  const json = await res.json();
  const result = (json?.result || []) as NftTx[];

  const ipNftTransfers = result.filter((tx) =>
    (tx.tokenSymbol || '').toUpperCase() === 'IP' || (tx.tokenName || '').toLowerCase().includes('ipnft')
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
          if (isVideo) mediaType = 'video';
          else if (isAudio) mediaType = 'audio';
          else if (image) mediaType = 'image';
          else if (metadata?.text || metadata?.content || typeof metadata?.description === 'string') mediaType = 'text';
        }
      } catch {}
      return {
        contract: o.contractAddress,
        tokenId: o.tokenID,
        tokenUri,
        metadata,
        image,
        type: mediaType,
      };
    })
  );

  return items;
}



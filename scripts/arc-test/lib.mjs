// Wspolne stale i helpery dla testu round-trip Base <-> Arc (CCTP v2).
import { createPublicClient, createWalletClient, http, defineChain, pad } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';

export const arc = defineChain({
  id: 5042,
  name: 'Arc',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: [process.env.ARC_RPC_URL ?? 'https://rpc.arc-scan.org'] } },
  blockExplorers: { default: { name: 'ArcScan', url: 'https://arc-scan.org' } },
});

// Kanoniczne adresy CCTP v2 — te same na Base i na Arc (zweryfikowane on-chain 2026-08-31).
export const TOKEN_MESSENGER_V2 = '0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d';
export const MESSAGE_TRANSMITTER_V2 = '0x81D40F21F12A8F0E3252Bccb954D722d4c464B64';

export const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
export const USDC_ARC = '0x3600000000000000000000000000000000000000'; // natywne USDC na Arc, 6 decimals

export const DOMAIN_BASE = 6;
export const DOMAIN_ARC = 26;

export const IRIS = 'https://iris-api.circle.com';

export const erc20Abi = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'allowance', stateMutability: 'view', inputs: [{ type: 'address' }, { type: 'address' }], outputs: [{ type: 'uint256' }] },
];

export const tokenMessengerAbi = [
  {
    type: 'function', name: 'depositForBurn', stateMutability: 'nonpayable',
    inputs: [
      { name: 'amount', type: 'uint256' },
      { name: 'destinationDomain', type: 'uint32' },
      { name: 'mintRecipient', type: 'bytes32' },
      { name: 'burnToken', type: 'address' },
      { name: 'destinationCaller', type: 'bytes32' },
      { name: 'maxFee', type: 'uint256' },
      { name: 'minFinalityThreshold', type: 'uint32' },
    ],
    outputs: [],
  },
];

export const messageTransmitterAbi = [
  {
    type: 'function', name: 'receiveMessage', stateMutability: 'nonpayable',
    inputs: [{ name: 'message', type: 'bytes' }, { name: 'attestation', type: 'bytes' }],
    outputs: [{ type: 'bool' }],
  },
];

export function getAccount() {
  const pk = process.env.PRIVATE_KEY;
  if (!pk) { console.error('Ustaw PRIVATE_KEY w env (0x...)'); process.exit(1); }
  return privateKeyToAccount(pk.startsWith('0x') ? pk : `0x${pk}`);
}

export function clients(chain) {
  const rpc = chain.id === 5042 ? (process.env.ARC_RPC_URL ?? 'https://rpc.arc-scan.org') : (process.env.BASE_RPC_URL ?? 'https://mainnet.base.org');
  const account = getAccount();
  return {
    account,
    pub: createPublicClient({ chain, transport: http(rpc) }),
    wallet: createWalletClient({ chain, transport: http(rpc), account }),
  };
}

export const addressToBytes32 = (addr) => pad(addr, { size: 32 });
export const ZERO_BYTES32 = '0x' + '0'.repeat(64);

// Fast-transfer fee (w bps) dla pary domen; maxFee liczone od kwoty.
export async function fastMaxFee(srcDomain, dstDomain, amount) {
  const res = await fetch(`${IRIS}/v2/burn/USDC/fees/${srcDomain}/${dstDomain}`);
  const fees = await res.json();
  const fast = fees.find((f) => f.finalityThreshold === 1000);
  if (!fast) throw new Error(`Brak fast-transfer dla ${srcDomain}->${dstDomain}: ${JSON.stringify(fees)}`);
  const bps = fast.minimumFee; // moze byc ulamkowe (np. 0.25)
  const fee = BigInt(Math.ceil(Number(amount) * bps / 10000)) + 1n; // +1 zapasu na zaokraglenie
  return fee;
}

// Czeka az Iris wystawi atestacje dla burna z danego tx.
export async function waitForAttestation(srcDomain, txHash) {
  const url = `${IRIS}/v2/messages/${srcDomain}?transactionHash=${txHash}`;
  process.stdout.write('Czekam na atestacje Circle ');
  for (;;) {
    const res = await fetch(url);
    if (res.ok) {
      const body = await res.json();
      const msg = body?.messages?.find((m) => m.status === 'complete');
      if (msg?.attestation && msg.attestation !== 'PENDING') { console.log('\nAtestacja gotowa.'); return msg; }
    }
    process.stdout.write('.');
    await new Promise((r) => setTimeout(r, 5000));
  }
}

export const fmtUsdc = (v) => `${(Number(v) / 1e6).toFixed(6)} USDC`;

# Launchpad frontend, kawalek 1 (rdzen handlu) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dowiezc `/launchpad` i `/launchpad/[address]`, na ktorych da sie zobaczyc tokeny z krzywej, kupic, sprzedac i awansowac — bez metadanych i bez tworzenia tokena.

**Architecture:** Prymitywy RPC (`call`/`scanLogs`/`multicall`) wychodza z `app/utils/b20/market.ts` do fabryki `createRpc(urls)` w `app/utils/chain/rpc.ts`, wspolnej dla obu produktow. Warstwa domenowa launchpada (`app/utils/launchpad/*`) czyta jeden kontrakt `CurveLaunchpad` przez `Launched` + `multicall(launchOf)`. Strony sa server componentami, panele handlu client componentami na wagmi/viem.

**Tech Stack:** Next.js App Router, TypeScript, viem, wagmi, Tailwind (design system `soft-*`), vitest (nowy, tylko dla modulu arytmetyki).

## Global Constraints

- Jezyk komentarzy i dokumentacji: polski **bez znakow diakrytycznych** (konwencja repozytorium).
- Design system: klasy `soft-*`, `font-soft-display`, `rounded-pill`, `shadow-card`, `[transition-duration:var(--dur-press)]`, `ease-out-strong`. Nie wprowadzac nowych tokenow kolorystycznych.
- `app/b20/**` i `app/utils/b20/token.ts`, `create.ts`, `addressing.ts`, `format.ts` **nie zmieniaja zachowania**. Jedyna dozwolona zmiana w `market.ts` to podmiana trzech funkcji prywatnych na `createRpc`.
- Adresy kontraktow **nigdy w kodzie** — wylacznie `process.env.NEXT_PUBLIC_LAUNCHPAD_*`.
- Stale kontraktu uzywane w planie (zweryfikowane w zrodle):
  `MAX_BUY = 100 ether`, `LAUNCH_WINDOW = 300`, `WINDOW_ADDR_CAP = 16_000_000e18`,
  `T0 = 1e9 * 1e18`, `T_MIN = 2e8 * 1e18`, `R_VIRT = 0.75 ether`, zbiorka `G = 3 ether`.
- `enum State { None = 0, Curve = 1, Locked = 2, Graduated = 3 }`.
- Adresy PoolManagera (sprawdzone `eth_getCode`, 24 009 bajtow kazdy): Base 8453 `0x498581fF718922c3f8e6A244956aF099B2652b2b`, Base Sepolia 84532 `0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408`, Robinhood 4663 `0x8366a39cc670b4001a1121b8f6a443a643e40951`.
- Kazdy commit: `npx tsc --noEmit` musi przechodzic.

---

### Task 1: Wydzielenie prymitywow RPC do `createRpc`

**Files:**
- Create: `app/utils/chain/rpc.ts`
- Modify: `app/utils/b20/market.ts` (usuniecie `rpcCall`/`scanLogs`/`multicall`/`MULTICALL_ABI`/`hexBlock` oraz stalych `MAX_LOG_RANGE`, `MULTICALL_CHUNK`, `MULTICALL3`, typu `RpcLog`; dodanie `const rpc = createRpc(RPCS)`)
- Test: brak (czysta przeprowadzka; kontrola to `tsc` + reczny odczyt `/b20`)

**Interfaces:**
- Consumes: nic
- Produces:
  ```ts
  export type RpcLog = {
    address: string; blockNumber: string; blockTimestamp?: string;
    data: string; topics: string[]; transactionHash: string;
  };
  export type RpcClient = {
    call<T>(method: string, params: unknown[]): Promise<T>;
    scanLogs(address: Address, topics: (string | string[] | null)[], fromBlock: bigint, toBlock: bigint): Promise<RpcLog[]>;
    multicall(calls: { target: Address; callData: Hex }[]): Promise<{ success: boolean; returnData: Hex }[]>;
  };
  export function createRpc(urls: string[]): RpcClient;
  export const MULTICALL3: Address;
  export const hexBlock: (n: bigint) => string;
  ```

- [ ] **Step 1: Utworz `app/utils/chain/rpc.ts`**

```ts
import { decodeFunctionResult, encodeFunctionData, type Address, type Hex } from 'viem';

/**
 * Prymitywy RPC wspolne dla B20 explorera i launchpada.
 *
 * DLACZEGO FABRYKA, A NIE GOLE FUNKCJE: `rpcCall` pamieta w `index`, ktory
 * endpoint ostatnio odpowiedzial, zeby nie trafiac w padniety przy kazdym
 * zapytaniu. Przy dwoch sieciach jedna zmienna modulowa mieszalaby lepkosc
 * Base z lepkoscia Robinhooda. Kazda siec dostaje wlasna instancje.
 */

/** Twardy limit publicznego RPC Base: -32614 powyzej 10 000 blokow. */
const MAX_LOG_RANGE = 10_000n;

/** Ile odczytow miesci sie w jednym multicall3 bez przekroczenia limitu odpowiedzi. */
const MULTICALL_CHUNK = 300;

export const MULTICALL3: Address = '0xcA11bde05977b3631167028862bE2a173976CA11';

export const hexBlock = (n: bigint) => `0x${n.toString(16)}`;

export type RpcLog = {
  address: string;
  blockNumber: string;
  blockTimestamp?: string;
  data: string;
  topics: string[];
  transactionHash: string;
};

const MULTICALL_ABI = [
  {
    name: 'aggregate3',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'calls',
        type: 'tuple[]',
        components: [
          { name: 'target', type: 'address' },
          { name: 'allowFailure', type: 'bool' },
          { name: 'callData', type: 'bytes' },
        ],
      },
    ],
    outputs: [
      {
        name: 'returnData',
        type: 'tuple[]',
        components: [
          { name: 'success', type: 'bool' },
          { name: 'returnData', type: 'bytes' },
        ],
      },
    ],
  },
] as const;

export type RpcClient = {
  call<T>(method: string, params: unknown[]): Promise<T>;
  scanLogs(
    address: Address,
    topics: (string | string[] | null)[],
    fromBlock: bigint,
    toBlock: bigint
  ): Promise<RpcLog[]>;
  multicall(
    calls: { target: Address; callData: Hex }[]
  ): Promise<{ success: boolean; returnData: Hex }[]>;
};

export function createRpc(urls: string[]): RpcClient {
  if (urls.length === 0) throw new Error('createRpc: pusta lista endpointow');
  let index = 0;

  async function call<T>(method: string, params: unknown[]): Promise<T> {
    let lastError = '';
    // Kazdy RPC dostaje szanse. Jeden padniety endpoint nie ma prawa zamienic
    // sie w falszywe "nie ma tokenow".
    for (let attempt = 0; attempt < urls.length; attempt += 1) {
      const url = urls[(index + attempt) % urls.length];
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
          cache: 'no-store',
          signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) {
          lastError = `${url} -> HTTP ${res.status}`;
          continue;
        }
        const json = (await res.json()) as { result?: T; error?: { message?: string } };
        if (json.error) {
          lastError = `${url} -> ${json.error.message ?? 'rpc error'}`;
          continue;
        }
        // Ten endpoint dziala - zacznij od niego nastepnym razem.
        index = (index + attempt) % urls.length;
        return json.result as T;
      } catch (err) {
        lastError = `${url} -> ${err instanceof Error ? err.message : String(err)}`;
      }
    }
    throw new Error(lastError || 'no rpc endpoint answered');
  }

  /**
   * getLogs po calym oknie, w kawalkach po 10 000 blokow.
   *
   * Kawalki leca po piec naraz, a nie wszystkie: przy okolo trzydziestu szybkich
   * zapytaniach pod rzad publiczne RPC Base odpowiada -32016 over rate limit.
   * Piatka zmierzona jako bezpieczna.
   */
  async function scanLogs(
    address: Address,
    topics: (string | string[] | null)[],
    fromBlock: bigint,
    toBlock: bigint
  ): Promise<RpcLog[]> {
    const ranges: [bigint, bigint][] = [];
    for (let b = fromBlock; b <= toBlock; b += MAX_LOG_RANGE) {
      const end = b + MAX_LOG_RANGE - 1n > toBlock ? toBlock : b + MAX_LOG_RANGE - 1n;
      ranges.push([b, end]);
    }
    const out: RpcLog[] = [];
    for (let i = 0; i < ranges.length; i += 5) {
      const batch = ranges.slice(i, i + 5);
      const results = await Promise.all(
        batch.map(([f, t]) =>
          call<RpcLog[]>('eth_getLogs', [
            { address, topics, fromBlock: hexBlock(f), toBlock: hexBlock(t) },
          ])
        )
      );
      for (const r of results) out.push(...r);
    }
    return out;
  }

  async function multicall(
    calls: { target: Address; callData: Hex }[]
  ): Promise<{ success: boolean; returnData: Hex }[]> {
    const out: { success: boolean; returnData: Hex }[] = [];
    for (let i = 0; i < calls.length; i += MULTICALL_CHUNK) {
      const chunk = calls.slice(i, i + MULTICALL_CHUNK);
      const data = encodeFunctionData({
        abi: MULTICALL_ABI,
        functionName: 'aggregate3',
        args: [chunk.map((c) => ({ target: c.target, allowFailure: true, callData: c.callData }))],
      });
      const raw = await call<Hex>('eth_call', [{ to: MULTICALL3, data }, 'latest']);
      const decoded = decodeFunctionResult({
        abi: MULTICALL_ABI,
        functionName: 'aggregate3',
        data: raw,
      });
      for (const r of decoded) out.push({ success: r.success, returnData: r.returnData });
    }
    return out;
  }

  return { call, scanLogs, multicall };
}
```

- [ ] **Step 2: Podmien w `market.ts`**

W `market.ts` usun definicje: `rpcCall`, `scanLogs`, `multicall`, `MULTICALL_ABI`, `hexBlock`, `type RpcLog`, `let rpcIndex`, oraz stale `MAX_LOG_RANGE`, `MULTICALL_CHUNK`, `MULTICALL3`. Dodaj na gorze:

```ts
import { createRpc, hexBlock, type RpcLog } from '../chain/rpc';
```

i tuz pod definicja `RPCS`:

```ts
const rpc = createRpc(RPCS);
```

Nastepnie zamien wszystkie wywolania: `rpcCall(` -> `rpc.call(`, `scanLogs(` -> `rpc.scanLogs(`, `multicall(` -> `rpc.multicall(`.

**Nie zmieniaj niczego innego.** Jesli `decodeFunctionResult`/`encodeFunctionData` przestana byc uzywane w `market.ts`, usun je z importu viem.

- [ ] **Step 3: Sprawdz, ze typy sie zgadzaja**

Run: `npx tsc --noEmit`
Expected: PASS, zero bledow.

- [ ] **Step 4: Sprawdz recznie, ze `/b20` dziala**

Run: `npm run dev`, otworz `http://localhost:3000/b20`
Expected: lista tokenow laduje sie tak samo jak przed zmiana — te same wiersze, te same zakladki, te same liczby.

- [ ] **Step 5: Commit**

```bash
git add app/utils/chain/rpc.ts app/utils/b20/market.ts
git commit -m "refactor: prymitywy RPC wychodza z market.ts do wspolnej fabryki"
```

---

### Task 2: Konfiguracja sieci i ABI

**Files:**
- Create: `app/utils/launchpad/config.ts`
- Create: `app/utils/launchpad/abi.ts`
- Modify: `.env.example` (dopisanie zmiennych; jesli plik nie istnieje — utworz)

**Interfaces:**
- Consumes: `createRpc` z Task 1
- Produces:
  ```ts
  export type LaunchpadChain = {
    chainId: number; name: string; pad: Address; deployBlock: bigint; rpc: RpcClient;
  };
  export function getChain(chainId: number): LaunchpadChain | null;
  export function supportedChainIds(): number[];
  export const DEFAULT_CHAIN_ID: number;
  export const LAUNCHPAD_ABI: readonly [...];  // viem const-asserted
  export const STATE = { None: 0, Curve: 1, Locked: 2, Graduated: 3 } as const;
  ```

- [ ] **Step 1: Utworz `app/utils/launchpad/config.ts`**

```ts
import { getAddress, type Address } from 'viem';
import { createRpc, type RpcClient } from '../chain/rpc';

/**
 * Adresy launchpada per siec. NIC nie jest zaszyte w kodzie - siec bez
 * kompletu zmiennych po prostu nie istnieje dla tego modulu, a UI ma o tym
 * powiedziec wprost zamiast pokazac pusta liste udajaca brak tokenow.
 */

export type LaunchpadChain = {
  chainId: number;
  name: string;
  pad: Address;
  deployBlock: bigint;
  rpc: RpcClient;
};

type ChainSeed = { chainId: number; name: string; rpcs: (string | undefined)[] };

const SEEDS: ChainSeed[] = [
  {
    chainId: 8453,
    name: 'Base',
    rpcs: [process.env.BASE_RPC_URL, 'https://mainnet.base.org', 'https://base-rpc.publicnode.com'],
  },
  {
    chainId: 84532,
    name: 'Base Sepolia',
    rpcs: [process.env.BASE_SEPOLIA_RPC_URL, 'https://sepolia.base.org'],
  },
  {
    chainId: 4663,
    name: 'Robinhood Chain',
    rpcs: [process.env.ROBINHOOD_RPC_URL, 'https://rpc.mainnet.chain.robinhood.com'],
  },
];

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.length > 0 ? v : undefined;
}

function build(seed: ChainSeed): LaunchpadChain | null {
  const pad = env(`NEXT_PUBLIC_LAUNCHPAD_PAD_${seed.chainId}`);
  const block = env(`NEXT_PUBLIC_LAUNCHPAD_BLOCK_${seed.chainId}`);
  if (!pad || !block) return null;
  const urls = seed.rpcs.filter(Boolean) as string[];
  if (urls.length === 0) return null;
  return {
    chainId: seed.chainId,
    name: seed.name,
    pad: getAddress(pad),
    deployBlock: BigInt(block),
    rpc: createRpc(urls),
  };
}

const CHAINS = new Map<number, LaunchpadChain>();
for (const seed of SEEDS) {
  const built = build(seed);
  if (built) CHAINS.set(seed.chainId, built);
}

export function getChain(chainId: number): LaunchpadChain | null {
  return CHAINS.get(chainId) ?? null;
}

export function supportedChainIds(): number[] {
  return [...CHAINS.keys()];
}

/** Pierwsza skonfigurowana siec. Uzywana, gdy portfel nie jest podlaczony. */
export const DEFAULT_CHAIN_ID = SEEDS.find((s) => CHAINS.has(s.chainId))?.chainId ?? 8453;
```

- [ ] **Step 2: Utworz `app/utils/launchpad/abi.ts`**

Sygnatury przepisane 1:1 ze zrodla `contracts/launchpad/CurveLaunchpad.sol`.

```ts
export const STATE = { None: 0, Curve: 1, Locked: 2, Graduated: 3 } as const;
export type StateValue = (typeof STATE)[keyof typeof STATE];

export const LAUNCHPAD_ABI = [
  {
    type: 'event',
    name: 'Launched',
    inputs: [
      { name: 'token', type: 'address', indexed: true },
      { name: 'creator', type: 'address', indexed: true },
      { name: 'launchId', type: 'bytes32', indexed: true },
      { name: 'name', type: 'string', indexed: false },
      { name: 'symbol', type: 'string', indexed: false },
      { name: 'totalSupply', type: 'uint256', indexed: false },
      { name: 'curveSupply', type: 'uint256', indexed: false },
      { name: 'tMin', type: 'uint256', indexed: false },
      { name: 'rVirt', type: 'uint256', indexed: false },
      { name: 'feeBps', type: 'uint16', indexed: false },
      { name: 'creatorFeeBps', type: 'uint16', indexed: false },
      { name: 'startedAt', type: 'uint40', indexed: false },
    ],
  },
  {
    type: 'function',
    name: 'launchOf',
    stateMutability: 'view',
    inputs: [{ name: 'token', type: 'address' }],
    outputs: [
      { name: 'creator', type: 'address' },
      { name: 'state', type: 'uint8' },
      { name: 'ethReserve', type: 'uint256' },
      { name: 'tokenReserve', type: 'uint256' },
      { name: 'startedAt', type: 'uint40' },
      { name: 'launchId', type: 'bytes32' },
    ],
  },
  {
    type: 'function',
    name: 'quoteBuy',
    stateMutability: 'view',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'ethIn', type: 'uint256' },
    ],
    outputs: [
      { name: 'tokensOut', type: 'uint256' },
      { name: 'fee', type: 'uint256' },
      { name: 'refund', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'quoteSell',
    stateMutability: 'view',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'tokensIn', type: 'uint256' },
    ],
    outputs: [
      { name: 'ethOut', type: 'uint256' },
      { name: 'fee', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'buy',
    stateMutability: 'payable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'minTokensOut', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [{ name: 'tokensOut', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'sell',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'tokensIn', type: 'uint256' },
      { name: 'minEthOut', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [{ name: 'ethOut', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'graduate',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'token', type: 'address' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'gradFeeOf',
    stateMutability: 'view',
    inputs: [{ name: 'token', type: 'address' }],
    outputs: [
      { name: 'fee', type: 'uint256' },
      { name: 'callerReward', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'claimable',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'claim',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  {
    type: 'function',
    name: 'windowBought',
    stateMutability: 'view',
    inputs: [
      { name: '', type: 'address' },
      { name: '', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  { type: 'error', name: 'Slippage', inputs: [] },
  { type: 'error', name: 'SlippageRequired', inputs: [] },
  { type: 'error', name: 'Expired', inputs: [] },
  { type: 'error', name: 'WindowCap', inputs: [] },
  { type: 'error', name: 'BuyTooLarge', inputs: [] },
  { type: 'error', name: 'CreatorLocked', inputs: [] },
  { type: 'error', name: 'CurveIsLocked', inputs: [] },
  { type: 'error', name: 'AlreadyGraduated', inputs: [] },
  { type: 'error', name: 'NotLocked', inputs: [] },
  { type: 'error', name: 'UnknownToken', inputs: [] },
  { type: 'error', name: 'ZeroAmount', inputs: [] },
  { type: 'error', name: 'DustTrade', inputs: [] },
  { type: 'error', name: 'ReserveTooSmallToGraduate', inputs: [] },
  { type: 'error', name: 'NothingToClaim', inputs: [] },
  { type: 'error', name: 'Arithmetic', inputs: [] },
  { type: 'error', name: 'Reentrancy', inputs: [] },
  { type: 'error', name: 'EthTransferFailed', inputs: [] },
  { type: 'error', name: 'TokenTransferFailed', inputs: [] },
  { type: 'error', name: 'WrongTokenAddress', inputs: [] },
  { type: 'error', name: 'SupplyMismatch', inputs: [] },
  { type: 'error', name: 'ZeroAddress', inputs: [] },
] as const;

export const ERC20_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: '', type: 'address' },
      { name: '', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;
```

- [ ] **Step 3: Dopisz zmienne do `.env.example`**

```
# Launchpad - adresy per siec. Bez kompletu (PAD + BLOCK) siec nie jest widoczna.
NEXT_PUBLIC_LAUNCHPAD_PAD_84532=
NEXT_PUBLIC_LAUNCHPAD_BLOCK_84532=
NEXT_PUBLIC_LAUNCHPAD_PAD_8453=
NEXT_PUBLIC_LAUNCHPAD_BLOCK_8453=
NEXT_PUBLIC_LAUNCHPAD_PAD_4663=
NEXT_PUBLIC_LAUNCHPAD_BLOCK_4663=
BASE_SEPOLIA_RPC_URL=
```

- [ ] **Step 4: Sprawdz typy**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/utils/launchpad/config.ts app/utils/launchpad/abi.ts .env.example
git commit -m "feat: konfiguracja trzech sieci launchpada i ABI"
```

---

### Task 3: Modul arytmetyki + vitest

**Files:**
- Create: `app/utils/launchpad/math.ts`
- Create: `app/utils/launchpad/math.test.ts`
- Create: `vitest.config.ts`
- Modify: `package.json` (skrypt `test:unit`, devDependency `vitest`)

**Interfaces:**
- Consumes: nic
- Produces:
  ```ts
  export const T0: bigint;            // 1e9 * 1e18
  export const T_MIN: bigint;         // 2e8 * 1e18
  export const R_VIRT: bigint;        // 0.75e18
  export const GOAL_ETH: bigint;      // 3e18
  export const MAX_BUY: bigint;       // 100e18
  export const LAUNCH_WINDOW_S: number;   // 300
  export const WINDOW_ADDR_CAP: bigint;   // 16_000_000e18
  export function progressBps(ethReserve: bigint): number;
  export function spotPriceWei(ethReserve: bigint, tokenReserve: bigint): bigint;
  export function marketCapWei(ethReserve: bigint, tokenReserve: bigint): bigint;
  export function applySlippage(amount: bigint, slippageBps: number): bigint;
  export function windowRemaining(alreadyBought: bigint): bigint;
  export function deadlineFromNow(seconds?: number): bigint;
  ```

- [ ] **Step 1: Zainstaluj vitest**

```bash
npm install --save-dev vitest
```

- [ ] **Step 2: Utworz `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Wylacznie moduly czystej arytmetyki. Komponentow i integracji ten
    // zestaw NIE pokrywa - to swiadomy dlug opisany w specyfikacji §9.
    include: ['app/utils/**/*.test.ts'],
    environment: 'node',
  },
});
```

- [ ] **Step 3: Dodaj skrypt do `package.json`**

W sekcji `"scripts"` dopisz:

```json
"test:unit": "vitest run",
```

- [ ] **Step 4: Napisz testy (maja padac)**

Utworz `app/utils/launchpad/math.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  GOAL_ETH,
  T0,
  T_MIN,
  WINDOW_ADDR_CAP,
  applySlippage,
  deadlineFromNow,
  marketCapWei,
  progressBps,
  spotPriceWei,
  windowRemaining,
} from './math';

describe('progressBps', () => {
  it('zero rezerwy to zero postepu', () => {
    expect(progressBps(0n)).toBe(0);
  });

  it('pelna zbiorka to dokladnie 10 000 bps', () => {
    expect(progressBps(GOAL_ETH)).toBe(10_000);
  });

  it('polowa zbiorki to 5 000 bps', () => {
    expect(progressBps(GOAL_ETH / 2n)).toBe(5_000);
  });

  it('rezerwa ponad cel jest przycieta do 10 000, a nie przekracza paska', () => {
    expect(progressBps(GOAL_ETH * 2n)).toBe(10_000);
  });
});

describe('spotPriceWei', () => {
  it('kurs startowy to 7.5e-10 ETH za token', () => {
    // (R_VIRT + 0) * 1e18 / T0 = 0.75e18 * 1e18 / 1e27 = 750_000_000 wei
    expect(spotPriceWei(0n, T0)).toBe(750_000_000n);
  });

  it('na progu kurs jest 25x wyzszy niz na starcie', () => {
    const start = spotPriceWei(0n, T0);
    const atThreshold = spotPriceWei(GOAL_ETH, T_MIN);
    expect(atThreshold / start).toBe(25n);
  });
});

describe('marketCapWei', () => {
  it('kapitalizacja na progu to 18.75 ETH', () => {
    expect(marketCapWei(GOAL_ETH, T_MIN)).toBe(18_750_000_000_000_000_000n);
  });
});

describe('applySlippage', () => {
  it('2% z 1000 daje 980', () => {
    expect(applySlippage(1000n, 200)).toBe(980n);
  });

  it('zerowy poslizg nie rusza kwoty', () => {
    expect(applySlippage(1000n, 0)).toBe(1000n);
  });

  it('zaokragla W DOL, zeby minOut nigdy nie byl wyzszy niz zamierzony', () => {
    // 999 * 9800 / 10000 = 979.02 -> 979
    expect(applySlippage(999n, 200)).toBe(979n);
  });

  it('odrzuca poslizg spoza zakresu', () => {
    expect(() => applySlippage(1000n, -1)).toThrow();
    expect(() => applySlippage(1000n, 10_001)).toThrow();
  });
});

describe('windowRemaining', () => {
  it('nic nie kupione to caly limit', () => {
    expect(windowRemaining(0n)).toBe(WINDOW_ADDR_CAP);
  });

  it('limit wyczerpany to zero, nie liczba ujemna', () => {
    expect(windowRemaining(WINDOW_ADDR_CAP)).toBe(0n);
    expect(windowRemaining(WINDOW_ADDR_CAP * 2n)).toBe(0n);
  });
});

describe('deadlineFromNow', () => {
  it('domyslnie 20 minut do przodu', () => {
    const now = BigInt(Math.floor(Date.now() / 1000));
    const d = deadlineFromNow();
    expect(d - now).toBeGreaterThanOrEqual(1199n);
    expect(d - now).toBeLessThanOrEqual(1201n);
  });
});
```

- [ ] **Step 5: Uruchom testy i sprawdz, ze PADAJA**

Run: `npm run test:unit`
Expected: FAIL — `Failed to resolve import "./math"`.

- [ ] **Step 6: Napisz `app/utils/launchpad/math.ts`**

```ts
/**
 * Czysta arytmetyka launchpada. JEDYNY modul frontendu pokryty testami.
 *
 * Uzasadnienie jest waskie: to sa funkcje, ktore decyduja o liczbie pokazanej
 * czlowiekowi, ZANIM wyda pieniadze. Pomylka o rzad wielkosci w `applySlippage`
 * to nie literowka w UI, to czyjes straty.
 *
 * Stale przepisane 1:1 z `contracts/launchpad/CurveLaunchpad.sol`.
 */

export const T0 = 1_000_000_000n * 10n ** 18n;
export const T_MIN = 200_000_000n * 10n ** 18n;
export const R_VIRT = 750_000_000_000_000_000n; // 0.75 ETH
export const GOAL_ETH = 3_000_000_000_000_000_000n; // 3.00 ETH - zbiorka domyka sie DOKLADNIE tu
export const MAX_BUY = 100n * 10n ** 18n;
export const LAUNCH_WINDOW_S = 300;
export const WINDOW_ADDR_CAP = 16_000_000n * 10n ** 18n;

/**
 * Postep do progu liczony w ETH, nie w tokenach: zbiorka domyka sie na
 * dokladnie 3.00 ETH, wiec to jest uczciwy ulamek i czytelny dla czlowieka.
 * Wersja tokenowa dalaby te sama liczbe, ale nikt nie wie, czym jest 200 mln.
 */
export function progressBps(ethReserve: bigint): number {
  if (ethReserve <= 0n) return 0;
  if (ethReserve >= GOAL_ETH) return 10_000;
  return Number((ethReserve * 10_000n) / GOAL_ETH);
}

/** Ta sama formula, co `spotPriceWeiPerToken` w kontrakcie: (R_VIRT + eth) * 1e18 / tok. */
export function spotPriceWei(ethReserve: bigint, tokenReserve: bigint): bigint {
  if (tokenReserve === 0n) return 0n;
  return ((R_VIRT + ethReserve) * 10n ** 18n) / tokenReserve;
}

/** Kapitalizacja = cena za token * CALA podaz, nie tylko ta na krzywej. */
export function marketCapWei(ethReserve: bigint, tokenReserve: bigint): bigint {
  return (spotPriceWei(ethReserve, tokenReserve) * T0) / 10n ** 18n;
}

/**
 * Zaokraglenie W DOL jest tu obowiazkowe: `minOut` wyzszy od zamierzonego
 * zwiekszalby szanse na rewert `Slippage`, czyli dzialalby przeciwko
 * uzytkownikowi.
 */
export function applySlippage(amount: bigint, slippageBps: number): bigint {
  if (!Number.isInteger(slippageBps) || slippageBps < 0 || slippageBps > 10_000) {
    throw new Error(`poslizg poza zakresem 0-10000 bps: ${slippageBps}`);
  }
  return (amount * BigInt(10_000 - slippageBps)) / 10_000n;
}

/** Limit okna jest SKUMULOWANY per adres, nie per transakcja. */
export function windowRemaining(alreadyBought: bigint): bigint {
  if (alreadyBought >= WINDOW_ADDR_CAP) return 0n;
  return WINDOW_ADDR_CAP - alreadyBought;
}

/** Termin jest OBOWIAZKOWY w kontrakcie - brak daje `Expired`. */
export function deadlineFromNow(seconds = 1200): bigint {
  return BigInt(Math.floor(Date.now() / 1000) + seconds);
}
```

- [ ] **Step 7: Uruchom testy i sprawdz, ze PRZECHODZA**

Run: `npm run test:unit`
Expected: PASS, wszystkie przypadki zielone.

- [ ] **Step 8: Commit**

```bash
git add app/utils/launchpad/math.ts app/utils/launchpad/math.test.ts vitest.config.ts package.json package-lock.json
git commit -m "feat: arytmetyka launchpada z testami jednostkowymi"
```

---

### Task 4: Mapowanie bledow kontraktu

**Files:**
- Create: `app/utils/launchpad/errors.ts`
- Create: `app/utils/launchpad/errors.test.ts`

**Interfaces:**
- Consumes: `LAUNCHPAD_ABI` z Task 2, `WINDOW_ADDR_CAP` z Task 3
- Produces:
  ```ts
  export function explainError(err: unknown, ctx?: { windowLeft?: bigint }): string;
  ```

- [ ] **Step 1: Napisz test (ma padac)**

Utworz `app/utils/launchpad/errors.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { BaseError, ContractFunctionRevertedError } from 'viem';
import { explainError } from './errors';

function revert(name: string) {
  const inner = new ContractFunctionRevertedError({
    abi: [{ type: 'error', name, inputs: [] }],
    data: undefined,
    functionName: 'buy',
  });
  // viem chodzi po `walk`, wiec wystarczy blad z ta przyczyna w srodku.
  (inner as unknown as { data: { errorName: string } }).data = { errorName: name };
  const outer = new BaseError('revert');
  (outer as unknown as { cause: unknown }).cause = inner;
  return outer;
}

describe('explainError', () => {
  it('Slippage mowi o zmianie ceny, nie o kodzie', () => {
    expect(explainError(revert('Slippage'))).toContain('Cena zmienila sie');
  });

  it('CurveIsLocked mowi, ze sprzedaz nadal dziala', () => {
    expect(explainError(revert('CurveIsLocked'))).toContain('sprzedaz dziala');
  });

  it('WindowCap podaje pozostaly limit, gdy go znamy', () => {
    const msg = explainError(revert('WindowCap'), { windowLeft: 5_000_000n * 10n ** 18n });
    expect(msg).toContain('5 000 000');
  });

  it('blad wewnetrzny dostaje generyk, a nie mile zdanie', () => {
    expect(explainError(revert('Arithmetic'))).toContain('Cos poszlo nie tak');
  });

  it('odrzucenie w portfelu nie jest bledem kontraktu', () => {
    expect(explainError(new Error('User rejected the request'))).toContain('Odrzucono');
  });
});
```

- [ ] **Step 2: Uruchom i sprawdz, ze pada**

Run: `npm run test:unit`
Expected: FAIL — `Failed to resolve import "./errors"`.

- [ ] **Step 3: Napisz `app/utils/launchpad/errors.ts`**

```ts
import { BaseError, ContractFunctionRevertedError } from 'viem';
import { WINDOW_ADDR_CAP } from './math';

/**
 * Custom errors kontraktu na zdania po polsku.
 *
 * Bledy, ktore sa NASZE (asercje, ktore nie maja prawa odpasc, albo bugi UI),
 * NIE dostaja ladnych komunikatow - ubranie ich w mile zdanie ukryloby wlasny
 * bug. Dostaja generyk plus pelny blad do konsoli.
 */

const HUMAN: Record<string, string> = {
  Slippage: 'Cena zmienila sie w trakcie. Podnies poslizg albo sprobuj ponownie.',
  Expired: 'Transakcja czekala za dlugo. Sprobuj ponownie.',
  BuyTooLarge: 'Maksymalne kupno to 100 ETH.',
  CreatorLocked: 'Tworca nie moze sprzedawac przed zamknieciem krzywej.',
  CurveIsLocked: 'Krzywa zamknieta - kupno niedostepne, sprzedaz dziala.',
  AlreadyGraduated: 'Token awansowal. Handel odbywa sie w puli.',
  NotLocked: 'Token nie domknal jeszcze zbiorki.',
  UnknownToken: 'Tego tokena nie ma na launchpadzie.',
  ZeroAmount: 'Kwota jest za mala.',
  DustTrade: 'Kwota jest za mala.',
  ReserveTooSmallToGraduate: 'Za malo ETH w rezerwie, zeby otworzyc pule.',
  NothingToClaim: 'Nie masz nic do odebrania.',
};

const GENERIC = 'Cos poszlo nie tak. Sprobuj ponownie.';

function groupThousands(n: bigint): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

export function explainError(err: unknown, ctx?: { windowLeft?: bigint }): string {
  if (err instanceof Error && /user rejected|user denied/i.test(err.message)) {
    return 'Odrzucono w portfelu.';
  }

  let name: string | undefined;
  if (err instanceof BaseError) {
    const reverted = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError) {
      name = reverted.data?.errorName;
    }
  }

  if (!name) {
    console.error('[launchpad] nierozpoznany blad', err);
    return GENERIC;
  }

  if (name === 'WindowCap') {
    const cap = groupThousands(WINDOW_ADDR_CAP / 10n ** 18n);
    if (ctx?.windowLeft !== undefined) {
      const left = groupThousands(ctx.windowLeft / 10n ** 18n);
      return `Trwa okno startowe - zostalo ci jeszcze ${left} tokenow z limitu ${cap}.`;
    }
    return `Trwa okno startowe - limit na adres to ${cap} tokenow.`;
  }

  const human = HUMAN[name];
  if (human) return human;

  // Asercje i bledy naszego UI. Nie ubieramy ich w mile zdania.
  console.error(`[launchpad] blad wewnetrzny: ${name}`, err);
  return GENERIC;
}
```

- [ ] **Step 4: Uruchom testy**

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/utils/launchpad/errors.ts app/utils/launchpad/errors.test.ts
git commit -m "feat: custom errors launchpada na zdania po polsku"
```

---

### Task 5: Warstwa danych — feed

**Files:**
- Create: `app/utils/launchpad/feed.ts`

**Interfaces:**
- Consumes: `getChain`, `DEFAULT_CHAIN_ID` (Task 2), `LAUNCHPAD_ABI`, `STATE` (Task 2), `progressBps`, `spotPriceWei`, `marketCapWei` (Task 3)
- Produces:
  ```ts
  export type LaunchpadToken = {
    address: Address; creator: Address; name: string; symbol: string;
    state: 1 | 2 | 3; ethReserve: bigint; tokenReserve: bigint;
    startedAt: number; progressBps: number; priceWei: bigint; marketCapWei: bigint;
  };
  export type FeedSnapshot = {
    chainId: number; chainName: string; tokens: LaunchpadToken[];
    counts: { curve: number; locked: number; graduated: number };
    fetchedAt: number;
  };
  export type FeedResult =
    | { ok: true; snapshot: FeedSnapshot; stale: boolean }
    | { ok: false; reason: 'not-configured' | 'rpc-failed'; chainId: number; message: string };
  export async function getFeed(chainId?: number): Promise<FeedResult>;
  ```

- [ ] **Step 1: Utworz `app/utils/launchpad/feed.ts`**

```ts
import {
  decodeAbiParameters,
  decodeFunctionResult,
  encodeFunctionData,
  getAddress,
  type Address,
  type Hex,
} from 'viem';
import { DEFAULT_CHAIN_ID, getChain } from './config';
import { LAUNCHPAD_ABI } from './abi';
import { marketCapWei, progressBps, spotPriceWei } from './math';

/**
 * Lista tokenow launchpada.
 *
 * Wszystko emituje JEDEN kontrakt, wiec odczyt jest o rzad wielkosci tanszy niz
 * `/b20`, gdzie trzeba szukac pul po calym lancuchu: jedno `scanLogs` po
 * `Launched` plus jedno `multicall(launchOf)`.
 */

export type LaunchpadToken = {
  address: Address;
  creator: Address;
  name: string;
  symbol: string;
  state: 1 | 2 | 3;
  ethReserve: bigint;
  tokenReserve: bigint;
  startedAt: number;
  progressBps: number;
  priceWei: bigint;
  marketCapWei: bigint;
};

export type FeedSnapshot = {
  chainId: number;
  chainName: string;
  tokens: LaunchpadToken[];
  counts: { curve: number; locked: number; graduated: number };
  fetchedAt: number;
};

export type FeedResult =
  | { ok: true; snapshot: FeedSnapshot; stale: boolean }
  | { ok: false; reason: 'not-configured' | 'rpc-failed'; chainId: number; message: string };

/** Krzywa rusza sie szybciej niz tablica pul, wiec cache jest krotszy niz w market.ts. */
const TTL_MS = 30_000;
/** Powyzej tego stare dane sa wciaz lepsze niz cisza, ale musza byc opisane jako stare. */
const STALE_MS = 5 * 60_000;

const TOPIC_LAUNCHED: Hex =
  '0x' as Hex; // wyliczany ponizej w `topicLaunched()`

import { encodeEventTopics } from 'viem';

function topicLaunched(): Hex {
  const [topic] = encodeEventTopics({ abi: LAUNCHPAD_ABI, eventName: 'Launched' });
  return topic as Hex;
}

type CacheEntry = { snapshot: FeedSnapshot; at: number; inflight: Promise<FeedSnapshot> | null };
const cache = new Map<number, CacheEntry>();

async function build(chainId: number): Promise<FeedSnapshot> {
  const chain = getChain(chainId);
  if (!chain) throw new Error(`launchpad nie jest skonfigurowany dla chainId ${chainId}`);

  const head = BigInt(await chain.rpc.call<string>('eth_blockNumber', []));
  const logs = await chain.rpc.scanLogs(chain.pad, [topicLaunched()], chain.deployBlock, head);

  // `token` i `creator` sa indeksowane, reszta siedzi w `data`.
  const seeds = logs.map((log) => {
    const [name, symbol, , , , , , , startedAt] = decodeAbiParameters(
      [
        { type: 'string' },
        { type: 'string' },
        { type: 'uint256' },
        { type: 'uint256' },
        { type: 'uint256' },
        { type: 'uint256' },
        { type: 'uint16' },
        { type: 'uint16' },
        { type: 'uint40' },
      ],
      log.data as Hex
    );
    return {
      address: getAddress(`0x${log.topics[1].slice(26)}`),
      creator: getAddress(`0x${log.topics[2].slice(26)}`),
      name: name as string,
      symbol: symbol as string,
      startedAt: Number(startedAt as bigint),
    };
  });

  const calls = seeds.map((s) => ({
    target: chain.pad,
    callData: encodeFunctionData({
      abi: LAUNCHPAD_ABI,
      functionName: 'launchOf',
      args: [s.address],
    }),
  }));
  const results = calls.length > 0 ? await chain.rpc.multicall(calls) : [];

  const tokens: LaunchpadToken[] = [];
  seeds.forEach((seed, i) => {
    const r = results[i];
    if (!r?.success) return;
    const [creator, state, ethReserve, tokenReserve] = decodeFunctionResult({
      abi: LAUNCHPAD_ABI,
      functionName: 'launchOf',
      data: r.returnData,
    }) as [Address, number, bigint, bigint, number, Hex];

    // State.None (0) znaczy, ze kontrakt go nie zna - nie pokazujemy widma.
    if (state === 0) return;

    tokens.push({
      address: seed.address,
      creator: getAddress(creator),
      name: seed.name,
      symbol: seed.symbol,
      state: state as 1 | 2 | 3,
      ethReserve,
      tokenReserve,
      startedAt: seed.startedAt,
      progressBps: progressBps(ethReserve),
      priceWei: state === 3 ? 0n : spotPriceWei(ethReserve, tokenReserve),
      marketCapWei: state === 3 ? 0n : marketCapWei(ethReserve, tokenReserve),
    });
  });

  tokens.sort((a, b) => b.startedAt - a.startedAt);

  return {
    chainId: chain.chainId,
    chainName: chain.name,
    tokens,
    counts: {
      curve: tokens.filter((t) => t.state === 1).length,
      locked: tokens.filter((t) => t.state === 2).length,
      graduated: tokens.filter((t) => t.state === 3).length,
    },
    fetchedAt: Date.now(),
  };
}

export async function getFeed(chainId: number = DEFAULT_CHAIN_ID): Promise<FeedResult> {
  const chain = getChain(chainId);
  if (!chain) {
    return {
      ok: false,
      reason: 'not-configured',
      chainId,
      message: `Launchpad nie jest wdrozony na tej sieci (chainId ${chainId}).`,
    };
  }

  const entry = cache.get(chainId);
  const age = entry ? Date.now() - entry.at : Infinity;

  if (entry && age < TTL_MS) return { ok: true, snapshot: entry.snapshot, stale: false };

  try {
    const inflight = entry?.inflight ?? build(chainId);
    if (entry) entry.inflight = inflight;
    const snapshot = await inflight;
    cache.set(chainId, { snapshot, at: Date.now(), inflight: null });
    return { ok: true, snapshot, stale: false };
  } catch (err) {
    if (entry) entry.inflight = null;
    // Stare dane opisane jako stare sa lepsze niz cisza.
    if (entry && age < STALE_MS) return { ok: true, snapshot: entry.snapshot, stale: true };
    return {
      ok: false,
      reason: 'rpc-failed',
      chainId,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
```

- [ ] **Step 2: Usun martwa stala `TOPIC_LAUNCHED`**

Usun linie:

```ts
const TOPIC_LAUNCHED: Hex =
  '0x' as Hex; // wyliczany ponizej w `topicLaunched()`
```

i przenies `import { encodeEventTopics } from 'viem';` do glownego importu viem na gorze pliku.

- [ ] **Step 3: Sprawdz typy**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/utils/launchpad/feed.ts
git commit -m "feat: warstwa danych feedu launchpada"
```

---

### Task 6: Warstwa danych — pojedynczy token

**Files:**
- Create: `app/utils/launchpad/token.ts`

**Interfaces:**
- Consumes: `getChain` (Task 2), `LAUNCHPAD_ABI` (Task 2), funkcje z Task 3
- Produces:
  ```ts
  export type TokenDetail = LaunchpadToken & {
    chainId: number; chainName: string; pad: Address; inWindow: boolean;
  };
  export async function getTokenDetail(chainId: number, address: string): Promise<TokenDetail | null>;
  ```

- [ ] **Step 1: Utworz `app/utils/launchpad/token.ts`**

```ts
import { decodeFunctionResult, encodeFunctionData, getAddress, isAddress, type Address, type Hex } from 'viem';
import { getChain } from './config';
import { LAUNCHPAD_ABI } from './abi';
import { LAUNCH_WINDOW_S, marketCapWei, progressBps, spotPriceWei } from './math';
import { getFeed, type LaunchpadToken } from './feed';

export type TokenDetail = LaunchpadToken & {
  chainId: number;
  chainName: string;
  pad: Address;
  /** Czy token jest jeszcze w oknie startowym - wtedy obowiazuje limit per adres. */
  inWindow: boolean;
};

/**
 * Nazwa i symbol nie sa w `launchOf` - siedza w zdarzeniu `Launched`. Bierzemy
 * je z feedu (ktory i tak jest zcache'owany), a stan czytamy swiezo, zeby pasek
 * postepu nie klamal.
 */
export async function getTokenDetail(chainId: number, address: string): Promise<TokenDetail | null> {
  if (!isAddress(address)) return null;
  const chain = getChain(chainId);
  if (!chain) return null;

  const token = getAddress(address);

  const feed = await getFeed(chainId);
  if (!feed.ok) return null;
  const seed = feed.snapshot.tokens.find((t) => t.address === token);
  if (!seed) return null;

  const raw = await chain.rpc.call<Hex>('eth_call', [
    {
      to: chain.pad,
      data: encodeFunctionData({ abi: LAUNCHPAD_ABI, functionName: 'launchOf', args: [token] }),
    },
    'latest',
  ]);
  const [creator, state, ethReserve, tokenReserve, startedAt] = decodeFunctionResult({
    abi: LAUNCHPAD_ABI,
    functionName: 'launchOf',
    data: raw,
  }) as [Address, number, bigint, bigint, number, Hex];

  if (state === 0) return null;

  const started = Number(startedAt);
  return {
    address: token,
    creator: getAddress(creator),
    name: seed.name,
    symbol: seed.symbol,
    state: state as 1 | 2 | 3,
    ethReserve,
    tokenReserve,
    startedAt: started,
    progressBps: progressBps(ethReserve),
    priceWei: state === 3 ? 0n : spotPriceWei(ethReserve, tokenReserve),
    marketCapWei: state === 3 ? 0n : marketCapWei(ethReserve, tokenReserve),
    chainId: chain.chainId,
    chainName: chain.name,
    pad: chain.pad,
    inWindow: Math.floor(Date.now() / 1000) < started + LAUNCH_WINDOW_S,
  };
}
```

- [ ] **Step 2: Sprawdz typy**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/utils/launchpad/token.ts
git commit -m "feat: odczyt pojedynczego tokena launchpada"
```

---

### Task 7: Strona feedu `/launchpad`

**Files:**
- Create: `app/launchpad/page.tsx`
- Create: `app/launchpad/LaunchpadFeed.tsx`

**Interfaces:**
- Consumes: `getFeed`, `FeedResult`, `LaunchpadToken` (Task 5)
- Produces: nic dla innych taskow

- [ ] **Step 1: Utworz `app/launchpad/LaunchpadFeed.tsx`**

```tsx
'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { formatEther } from 'viem';
import type { FeedSnapshot, LaunchpadToken } from '../utils/launchpad/feed';

type Tab = 'curve' | 'locked' | 'graduated';
type Sort = 'newest' | 'progress' | 'mcap';

const STATE_OF: Record<Tab, 1 | 2 | 3> = { curve: 1, locked: 2, graduated: 3 };

function eth(v: bigint, digits = 2): string {
  return Number(formatEther(v)).toFixed(digits);
}

function age(startedAt: number): string {
  const s = Math.max(0, Math.floor(Date.now() / 1000) - startedAt);
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86_400)}d`;
}

function Bar({ bps }: { bps: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-pill bg-soft-line">
      <div className="h-full rounded-pill bg-soft-ink" style={{ width: `${bps / 100}%` }} />
    </div>
  );
}

function Row({ t }: { t: LaunchpadToken }) {
  return (
    <Link
      href={`/launchpad/${t.address}`}
      className="flex items-center gap-3 border-b border-soft-line px-3 py-2.5 transition-transform [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.99]"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="font-soft-display text-[13px] font-bold text-soft-ink">${t.symbol}</span>
          <span className="truncate text-[12px] text-soft-ink-faint">{t.name}</span>
        </div>
        {t.state === 1 ? (
          <div className="mt-1.5 flex items-center gap-2">
            <Bar bps={t.progressBps} />
            <span className="shrink-0 text-[11px] tabular-nums text-soft-ink-faint">
              {eth(t.ethReserve)}/3.0
            </span>
          </div>
        ) : null}
      </div>
      <div className="shrink-0 text-right text-[11px] tabular-nums text-soft-ink-faint">
        {t.state === 3 ? <div>awansowal</div> : <div>MC {eth(t.marketCapWei)} ETH</div>}
        <div>{age(t.startedAt)}</div>
      </div>
    </Link>
  );
}

export default function LaunchpadFeed({
  snapshot,
  stale,
}: {
  snapshot: FeedSnapshot;
  stale: boolean;
}) {
  const [tab, setTab] = useState<Tab>('curve');
  const [sort, setSort] = useState<Sort>('newest');

  const nearGraduation = useMemo(
    () =>
      snapshot.tokens
        .filter((t) => t.state === 1 && t.ethReserve > 0n)
        .sort((a, b) => (b.ethReserve > a.ethReserve ? 1 : -1))
        .slice(0, 3),
    [snapshot.tokens]
  );

  const rows = useMemo(() => {
    const list = snapshot.tokens.filter((t) => t.state === STATE_OF[tab]);
    if (sort === 'progress') return [...list].sort((a, b) => b.progressBps - a.progressBps);
    if (sort === 'mcap')
      return [...list].sort((a, b) => (b.marketCapWei > a.marketCapWei ? 1 : -1));
    return [...list].sort((a, b) => b.startedAt - a.startedAt);
  }, [snapshot.tokens, tab, sort]);

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'curve', label: 'Na krzywej', count: snapshot.counts.curve },
    { id: 'locked', label: 'Zamkniete', count: snapshot.counts.locked },
    { id: 'graduated', label: 'Awansowane', count: snapshot.counts.graduated },
  ];

  return (
    <div>
      {stale ? (
        <p className="mb-3 rounded-card border border-soft-line bg-soft-surface px-3 py-2 text-[12px] text-soft-ink-faint">
          Dane sprzed {Math.round((Date.now() - snapshot.fetchedAt) / 60_000)} min — RPC nie
          odpowiada.
        </p>
      ) : null}

      {nearGraduation.length > 0 ? (
        <section className="mb-5">
          <h2 className="mb-2 font-soft-display text-[12.5px] font-bold text-soft-ink">
            Blisko awansu
          </h2>
          <div className="grid grid-cols-3 gap-2">
            {nearGraduation.map((t) => (
              <Link
                key={t.address}
                href={`/launchpad/${t.address}`}
                className="rounded-card border border-soft-line bg-soft-surface p-2.5 shadow-card"
              >
                <div className="font-soft-display text-[13px] font-bold text-soft-ink">
                  ${t.symbol}
                </div>
                <div className="my-1.5">
                  <Bar bps={t.progressBps} />
                </div>
                <div className="text-[11px] tabular-nums text-soft-ink-faint">
                  {eth(t.ethReserve)} / 3.0 ETH
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <div className="mb-2 flex gap-1.5">
        {tabs.map((x) => (
          <button
            key={x.id}
            type="button"
            onClick={() => setTab(x.id)}
            aria-pressed={tab === x.id}
            className={`rounded-pill border px-3 py-1.5 font-soft-display text-[12px] font-bold ${
              tab === x.id
                ? 'border-soft-line-strong bg-soft-surface text-soft-ink shadow-card'
                : 'border-transparent text-soft-ink-faint'
            }`}
          >
            {x.label} {x.count}
          </button>
        ))}
      </div>

      <div className="mb-3 flex gap-3 text-[11.5px]">
        {(
          [
            ['newest', 'Najnowsze'],
            ['progress', 'Blisko progu'],
            ['mcap', 'Kapitalizacja'],
          ] as [Sort, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setSort(id)}
            className={sort === id ? 'font-bold text-soft-ink' : 'text-soft-ink-faint'}
          >
            {label}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="py-8 text-center text-[12.5px] text-soft-ink-faint">
          Nic tu jeszcze nie ma.
        </p>
      ) : (
        <div>
          {rows.map((t) => (
            <Row key={t.address} t={t} />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Utworz `app/launchpad/page.tsx`**

```tsx
import { getFeed } from '../utils/launchpad/feed';
import LaunchpadFeed from './LaunchpadFeed';

export const dynamic = 'force-dynamic';

export default async function LaunchpadPage() {
  const result = await getFeed();

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-6">
      <h1 className="mb-1 font-soft-display text-[20px] font-bold text-soft-ink">Launchpad</h1>
      <p className="mb-5 text-[12.5px] text-soft-ink-faint">
        Tokeny na krzywej. Kazdy startuje bez wlasciciela, bez mintu i bez pauzy.
      </p>

      {result.ok ? (
        <LaunchpadFeed snapshot={result.snapshot} stale={result.stale} />
      ) : (
        <p className="rounded-card border border-soft-line bg-soft-surface px-3 py-3 text-[12.5px] text-soft-ink-faint">
          {result.message}
        </p>
      )}
    </main>
  );
}
```

- [ ] **Step 3: Sprawdz typy i uruchom**

Run: `npx tsc --noEmit && npm run dev`, otworz `http://localhost:3000/launchpad`
Expected: bez skonfigurowanych zmiennych ENV strona pokazuje komunikat „Launchpad nie jest wdrozony na tej sieci", a **nie** pusta liste ani bledu.

- [ ] **Step 4: Commit**

```bash
git add app/launchpad/page.tsx app/launchpad/LaunchpadFeed.tsx
git commit -m "feat: feed launchpada z paskiem postepu do awansu"
```

---

### Task 8: Strona tokena — naglowek, postep, panel odbioru

**Files:**
- Create: `app/launchpad/[address]/page.tsx`
- Create: `app/launchpad/[address]/ClaimPanel.tsx`

**Interfaces:**
- Consumes: `getTokenDetail` (Task 6), `LAUNCHPAD_ABI` (Task 2), `explainError` (Task 4)
- Produces: nic dla innych taskow

- [ ] **Step 1: Utworz `app/launchpad/[address]/ClaimPanel.tsx`**

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatEther, type Address } from 'viem';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { LAUNCHPAD_ABI } from '../../utils/launchpad/abi';
import { explainError } from '../../utils/launchpad/errors';

/**
 * Odbior salda. Dziala dla KAZDEGO, kto ma saldo - tworcy, protokolu i tego,
 * kto wywolal `graduate()`. Kontrakt ksieguje, nie pushuje, wiec bez tego
 * panelu pieniadze leza nieodebrane.
 */
export default function ClaimPanel({ pad }: { pad: Address }) {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const [amount, setAmount] = useState<bigint | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const read = useCallback(async () => {
    if (!publicClient || !address) return;
    const v = await publicClient.readContract({
      address: pad,
      abi: LAUNCHPAD_ABI,
      functionName: 'claimable',
      args: [address],
    });
    setAmount(v as bigint);
  }, [publicClient, address, pad]);

  useEffect(() => {
    void read();
  }, [read]);

  const claim = async () => {
    if (!walletClient || !publicClient || !address) return;
    setBusy(true);
    setMsg(null);
    try {
      await publicClient.simulateContract({
        address: pad,
        abi: LAUNCHPAD_ABI,
        functionName: 'claim',
        account: address,
      });
      const hash = await walletClient.writeContract({
        address: pad,
        abi: LAUNCHPAD_ABI,
        functionName: 'claim',
      });
      await publicClient.waitForTransactionReceipt({ hash });
      await read();
    } catch (err) {
      setMsg(explainError(err));
    } finally {
      setBusy(false);
    }
  };

  if (!isConnected || amount === null || amount === 0n) return null;

  return (
    <div className="mt-4 rounded-card border border-soft-line bg-soft-surface px-3 py-3 shadow-card">
      <p className="mb-2 text-[12px] text-soft-ink-faint">
        Tworca zarabia 0,4% z kazdej wymiany — takze po awansie.
      </p>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] tabular-nums text-soft-ink">
          Do odebrania: {Number(formatEther(amount)).toFixed(4)} ETH
        </span>
        <button
          type="button"
          onClick={claim}
          disabled={busy}
          className="rounded-pill border border-soft-line-strong bg-soft-surface px-3.5 py-1.5 font-soft-display text-[12.5px] font-bold text-soft-ink shadow-card disabled:opacity-50"
        >
          {busy ? 'Odbieram…' : 'Odbierz'}
        </button>
      </div>
      {msg ? <p className="mt-2 text-[12px] text-soft-ink-faint">{msg}</p> : null}
    </div>
  );
}
```

- [ ] **Step 2: Utworz `app/launchpad/[address]/page.tsx`**

```tsx
import { notFound } from 'next/navigation';
import { formatEther } from 'viem';
import { DEFAULT_CHAIN_ID } from '../../utils/launchpad/config';
import { getTokenDetail } from '../../utils/launchpad/token';
import ClaimPanel from './ClaimPanel';
import TradePanel from './TradePanel';

export const dynamic = 'force-dynamic';

const STATE_LABEL: Record<1 | 2 | 3, string> = {
  1: 'Na krzywej',
  2: 'Zamknieta',
  3: 'Awansowal',
};

export default async function TokenPage({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  const t = await getTokenDetail(DEFAULT_CHAIN_ID, address);
  if (!t) notFound();

  const reserve = Number(formatEther(t.ethReserve)).toFixed(2);
  const missing = Number(formatEther(3_000_000_000_000_000_000n - t.ethReserve)).toFixed(2);

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-6">
      <div className="mb-1 flex items-baseline gap-2">
        <h1 className="font-soft-display text-[20px] font-bold text-soft-ink">${t.symbol}</h1>
        <span className="text-[13px] text-soft-ink-faint">{t.name}</span>
        <span className="ml-auto rounded-pill border border-soft-line px-2.5 py-1 text-[11px] text-soft-ink-faint">
          {STATE_LABEL[t.state]}
        </span>
      </div>
      <p className="mb-4 font-mono text-[11px] text-soft-ink-faint">{t.address}</p>

      {t.state === 1 ? (
        <div className="mb-4 rounded-card border border-soft-line bg-soft-surface px-3 py-3 shadow-card">
          <div className="mb-2 h-2 w-full overflow-hidden rounded-pill bg-soft-line">
            <div
              className="h-full rounded-pill bg-soft-ink"
              style={{ width: `${t.progressBps / 100}%` }}
            />
          </div>
          <p className="text-[12.5px] tabular-nums text-soft-ink">
            {reserve} / 3.00 ETH
            <span className="ml-2 text-soft-ink-faint">do awansu brakuje {missing} ETH</span>
          </p>
        </div>
      ) : null}

      <TradePanel
        pad={t.pad}
        token={t.address}
        symbol={t.symbol}
        state={t.state}
        inWindow={t.inWindow}
      />

      <ClaimPanel pad={t.pad} />
    </main>
  );
}
```

- [ ] **Step 3: Sprawdz typy**

Run: `npx tsc --noEmit`
Expected: FAIL — `Cannot find module './TradePanel'`. To jest oczekiwane; TradePanel powstaje w Task 9.

- [ ] **Step 4: Commit**

```bash
git add app/launchpad/[address]/page.tsx app/launchpad/[address]/ClaimPanel.tsx
git commit -m "feat: strona tokena launchpada z paskiem postepu i odbiorem salda"
```

---

### Task 9: Panel handlu

**Files:**
- Create: `app/launchpad/[address]/TradePanel.tsx`

**Interfaces:**
- Consumes: `LAUNCHPAD_ABI`, `ERC20_ABI` (Task 2), `applySlippage`, `deadlineFromNow`, `windowRemaining` (Task 3), `explainError` (Task 4)
- Produces: domyslny eksport `TradePanel` uzywany w Task 8

- [ ] **Step 1: Utworz `app/launchpad/[address]/TradePanel.tsx`**

```tsx
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatEther, parseEther, type Address } from 'viem';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { ERC20_ABI, LAUNCHPAD_ABI } from '../../utils/launchpad/abi';
import { explainError } from '../../utils/launchpad/errors';
import { applySlippage, deadlineFromNow, windowRemaining } from '../../utils/launchpad/math';

type Side = 'buy' | 'sell';

/** Poslizg w bps. 2% jest domyslne, bo ktos moze wejsc przed toba i cena wzrosnie. */
const DEFAULT_SLIPPAGE_BPS = 200;

function fmtTokens(v: bigint): string {
  const whole = v / 10n ** 18n;
  return whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

export default function TradePanel({
  pad,
  token,
  symbol,
  state,
  inWindow,
}: {
  pad: Address;
  token: Address;
  symbol: string;
  state: 1 | 2 | 3;
  inWindow: boolean;
}) {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [side, setSide] = useState<Side>(state === 1 ? 'buy' : 'sell');
  const [input, setInput] = useState('');
  const [slippageBps, setSlippageBps] = useState(DEFAULT_SLIPPAGE_BPS);
  const [quote, setQuote] = useState<{ out: bigint; fee: bigint; refund: bigint } | null>(null);
  const [windowLeft, setWindowLeft] = useState<bigint | null>(null);
  const [balance, setBalance] = useState<bigint>(0n);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const amount = useMemo(() => {
    try {
      return input.trim() === '' ? 0n : parseEther(input.trim());
    } catch {
      return 0n;
    }
  }, [input]);

  // Saldo tokena i pozostaly limit okna.
  useEffect(() => {
    if (!publicClient || !address) return;
    let alive = true;
    void (async () => {
      const bal = (await publicClient.readContract({
        address: token,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [address],
      })) as bigint;
      if (alive) setBalance(bal);

      if (inWindow) {
        const bought = (await publicClient.readContract({
          address: pad,
          abi: LAUNCHPAD_ABI,
          functionName: 'windowBought',
          args: [token, address],
        })) as bigint;
        if (alive) setWindowLeft(windowRemaining(bought));
      }
    })();
    return () => {
      alive = false;
    };
  }, [publicClient, address, token, pad, inWindow, busy]);

  // Wycena. `quoteBuy` zwraca DOKLADNIE to, co wykona `buy`, wiec liczba na
  // ekranie jest ta, ktora uzytkownik dostanie - nie szacunkiem.
  useEffect(() => {
    if (!publicClient || amount === 0n) {
      setQuote(null);
      return;
    }
    let alive = true;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          if (side === 'buy') {
            const [out, fee, refund] = (await publicClient.readContract({
              address: pad,
              abi: LAUNCHPAD_ABI,
              functionName: 'quoteBuy',
              args: [token, amount],
            })) as [bigint, bigint, bigint];
            if (alive) setQuote({ out, fee, refund });
          } else {
            const [out, fee] = (await publicClient.readContract({
              address: pad,
              abi: LAUNCHPAD_ABI,
              functionName: 'quoteSell',
              args: [token, amount],
            })) as [bigint, bigint];
            if (alive) setQuote({ out, fee, refund: 0n });
          }
        } catch {
          if (alive) setQuote(null);
        }
      })();
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [publicClient, pad, token, amount, side]);

  const submit = useCallback(async () => {
    if (!walletClient || !publicClient || !address || !quote || amount === 0n) return;
    setBusy(true);
    setMsg(null);
    try {
      const deadline = deadlineFromNow();
      if (side === 'buy') {
        const minOut = applySlippage(quote.out, slippageBps);
        // Symulacja PRZED portfelem: rewert widzimy, zanim ktos kliknie.
        await publicClient.simulateContract({
          address: pad,
          abi: LAUNCHPAD_ABI,
          functionName: 'buy',
          args: [token, minOut, deadline],
          value: amount,
          account: address,
        });
        const hash = await walletClient.writeContract({
          address: pad,
          abi: LAUNCHPAD_ABI,
          functionName: 'buy',
          args: [token, minOut, deadline],
          value: amount,
        });
        await publicClient.waitForTransactionReceipt({ hash });
      } else {
        const allowance = (await publicClient.readContract({
          address: token,
          abi: ERC20_ABI,
          functionName: 'allowance',
          args: [address, pad],
        })) as bigint;
        if (allowance < amount) {
          const approveHash = await walletClient.writeContract({
            address: token,
            abi: ERC20_ABI,
            functionName: 'approve',
            args: [pad, amount],
          });
          await publicClient.waitForTransactionReceipt({ hash: approveHash });
        }
        const minEthOut = applySlippage(quote.out, slippageBps);
        await publicClient.simulateContract({
          address: pad,
          abi: LAUNCHPAD_ABI,
          functionName: 'sell',
          args: [token, amount, minEthOut, deadline],
          account: address,
        });
        const hash = await walletClient.writeContract({
          address: pad,
          abi: LAUNCHPAD_ABI,
          functionName: 'sell',
          args: [token, amount, minEthOut, deadline],
        });
        await publicClient.waitForTransactionReceipt({ hash });
      }
      setInput('');
      setQuote(null);
    } catch (err) {
      setMsg(explainError(err, { windowLeft: windowLeft ?? undefined }));
    } finally {
      setBusy(false);
    }
  }, [walletClient, publicClient, address, quote, amount, side, slippageBps, pad, token, windowLeft]);

  if (state === 3) {
    return (
      <p className="rounded-card border border-soft-line bg-soft-surface px-3 py-3 text-[12.5px] text-soft-ink-faint">
        Token awansowal. Handel odbywa sie w puli Uniswap v4.
      </p>
    );
  }

  const canBuy = state === 1;

  return (
    <div className="rounded-card border border-soft-line bg-soft-surface p-3 shadow-card">
      <div className="mb-3 flex gap-1.5">
        <button
          type="button"
          disabled={!canBuy}
          onClick={() => setSide('buy')}
          className={`rounded-pill px-3.5 py-1.5 font-soft-display text-[12.5px] font-bold disabled:opacity-40 ${
            side === 'buy' ? 'bg-soft-ink text-soft-surface' : 'text-soft-ink-faint'
          }`}
        >
          Kup
        </button>
        <button
          type="button"
          onClick={() => setSide('sell')}
          className={`rounded-pill px-3.5 py-1.5 font-soft-display text-[12.5px] font-bold ${
            side === 'sell' ? 'bg-soft-ink text-soft-surface' : 'text-soft-ink-faint'
          }`}
        >
          Sprzedaj
        </button>
      </div>

      {!canBuy ? (
        <p className="mb-3 text-[12px] text-soft-ink-faint">
          Krzywa zamknieta — kupno niedostepne, sprzedaz dziala.
        </p>
      ) : null}

      {inWindow && windowLeft !== null ? (
        <p className="mb-3 text-[12px] text-soft-ink-faint">
          Okno startowe: zostalo ci {fmtTokens(windowLeft)} {symbol} z limitu 16 000 000.
        </p>
      ) : null}

      <input
        inputMode="decimal"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder={side === 'buy' ? '0.0 ETH' : `0 ${symbol}`}
        className="w-full rounded-card border border-soft-line bg-transparent px-3 py-2 text-[15px] tabular-nums text-soft-ink outline-none"
      />

      {side === 'sell' && balance > 0n ? (
        <div className="mt-2 flex gap-1.5">
          {[25, 50, 75, 100].map((pct) => (
            <button
              key={pct}
              type="button"
              onClick={() => setInput(formatEther((balance * BigInt(pct)) / 100n))}
              className="rounded-pill border border-soft-line px-2.5 py-1 text-[11px] text-soft-ink-faint"
            >
              {pct === 100 ? 'Max' : `${pct}%`}
            </button>
          ))}
        </div>
      ) : null}

      {quote ? (
        <dl className="mt-3 space-y-1 text-[12px]">
          <div className="flex justify-between">
            <dt className="text-soft-ink-faint">dostaniesz</dt>
            <dd className="tabular-nums text-soft-ink">
              {side === 'buy'
                ? `~${fmtTokens(quote.out)} ${symbol}`
                : `~${Number(formatEther(quote.out)).toFixed(5)} ETH`}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-soft-ink-faint">oplata</dt>
            <dd className="tabular-nums text-soft-ink-faint">
              {Number(formatEther(quote.fee)).toFixed(5)} ETH (1%)
            </dd>
          </div>
          {quote.refund > 0n ? (
            <div className="flex justify-between">
              <dt className="text-soft-ink-faint">zwrot (prog domkniety)</dt>
              <dd className="tabular-nums text-soft-ink">
                {Number(formatEther(quote.refund)).toFixed(5)} ETH
              </dd>
            </div>
          ) : null}
          <div className="flex justify-between">
            <dt className="text-soft-ink-faint">poslizg</dt>
            <dd>
              <select
                value={slippageBps}
                onChange={(e) => setSlippageBps(Number(e.target.value))}
                className="bg-transparent text-soft-ink outline-none"
              >
                <option value={100}>1%</option>
                <option value={200}>2%</option>
                <option value={500}>5%</option>
              </select>
            </dd>
          </div>
        </dl>
      ) : null}

      <button
        type="button"
        onClick={submit}
        disabled={!isConnected || busy || amount === 0n || !quote}
        className="mt-3 w-full rounded-pill border border-soft-line-strong bg-soft-ink px-4 py-2 font-soft-display text-[13px] font-bold text-soft-surface disabled:opacity-40"
      >
        {!isConnected
          ? 'Podlacz portfel'
          : busy
            ? 'Wysylam…'
            : side === 'buy'
              ? `Kup ${symbol}`
              : `Sprzedaj ${symbol}`}
      </button>

      {msg ? <p className="mt-2 text-[12px] text-soft-ink">{msg}</p> : null}
    </div>
  );
}
```

- [ ] **Step 2: Sprawdz typy**

Run: `npx tsc --noEmit`
Expected: PASS — Task 8 przestaje sie skarzyc na brakujacy modul.

- [ ] **Step 3: Commit**

```bash
git add app/launchpad/[address]/TradePanel.tsx
git commit -m "feat: panel kupna i sprzedazy na krzywej"
```

---

### Task 10: Przycisk awansu

**Files:**
- Create: `app/launchpad/[address]/GraduateButton.tsx`
- Modify: `app/launchpad/[address]/page.tsx` (dodanie przycisku dla `state === 2`)

**Interfaces:**
- Consumes: `LAUNCHPAD_ABI` (Task 2), `explainError` (Task 4)
- Produces: domyslny eksport `GraduateButton`

- [ ] **Step 1: Utworz `app/launchpad/[address]/GraduateButton.tsx`**

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatEther, type Address } from 'viem';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { LAUNCHPAD_ABI } from '../../utils/launchpad/abi';
import { explainError } from '../../utils/launchpad/errors';

/**
 * `graduate()` jest BEZUPRAWNIENIOWE - wolac moze ktokolwiek, a wolajacy
 * dostaje polowe oplaty awansowej. Nagroda jest wieksza od kosztu gazu o dwa
 * rzedy wielkosci, wiec ten przycisk jest realna oferta, nie ozdoba.
 */
export default function GraduateButton({ pad, token }: { pad: Address; token: Address }) {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const [reward, setReward] = useState<bigint | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!publicClient) return;
    let alive = true;
    void (async () => {
      try {
        const [, callerReward] = (await publicClient.readContract({
          address: pad,
          abi: LAUNCHPAD_ABI,
          functionName: 'gradFeeOf',
          args: [token],
        })) as [bigint, bigint];
        if (alive) setReward(callerReward);
      } catch {
        if (alive) setReward(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [publicClient, pad, token]);

  const run = useCallback(async () => {
    if (!walletClient || !publicClient || !address) return;
    setBusy(true);
    setMsg(null);
    try {
      await publicClient.simulateContract({
        address: pad,
        abi: LAUNCHPAD_ABI,
        functionName: 'graduate',
        args: [token],
        account: address,
      });
      const hash = await walletClient.writeContract({
        address: pad,
        abi: LAUNCHPAD_ABI,
        functionName: 'graduate',
        args: [token],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      window.location.reload();
    } catch (err) {
      setMsg(explainError(err));
    } finally {
      setBusy(false);
    }
  }, [walletClient, publicClient, address, pad, token]);

  return (
    <div className="mb-4 rounded-card border border-soft-line bg-soft-surface px-3 py-3 shadow-card">
      <p className="mb-2 text-[12.5px] text-soft-ink">
        Krzywa domknieta. Kazdy moze otworzyc pule — wolajacy dostaje nagrode
        {reward !== null ? ` ${Number(formatEther(reward)).toFixed(4)} ETH` : ''}.
      </p>
      <button
        type="button"
        onClick={run}
        disabled={!isConnected || busy}
        className="w-full rounded-pill border border-soft-line-strong bg-soft-ink px-4 py-2 font-soft-display text-[13px] font-bold text-soft-surface disabled:opacity-40"
      >
        {busy ? 'Awansuje…' : 'Awansuj token'}
      </button>
      {msg ? <p className="mt-2 text-[12px] text-soft-ink">{msg}</p> : null}
    </div>
  );
}
```

- [ ] **Step 2: Podepnij w `app/launchpad/[address]/page.tsx`**

Dodaj import obok pozostalych:

```tsx
import GraduateButton from './GraduateButton';
```

i wstaw tuz **przed** `<TradePanel ... />`:

```tsx
{t.state === 2 ? <GraduateButton pad={t.pad} token={t.address} /> : null}
```

- [ ] **Step 3: Sprawdz typy**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/launchpad/[address]/GraduateButton.tsx app/launchpad/[address]/page.tsx
git commit -m "feat: bezuprawnieniowy przycisk awansu z widoczna nagroda"
```

---

### Task 11: Wdrozenie na Base Sepolia i pelny przebieg reczny

**Files:**
- Modify: `.env.local` (adresy z wdrozenia — plik **nie** idzie do gita)
- Modify: `docs/superpowers/specs/2026-08-10-launchpad-frontend-rdzen-handlu-design.md` (odhaczenie przebiegu)

**Interfaces:**
- Consumes: wszystko z Taskow 1-10
- Produces: dzialajaca instancja na Sepolii

- [ ] **Step 1: Wdroz kontrakty na Base Sepolia**

```bash
FEE_RECIPIENT=0xTWOJ_ADRES npm run launchpad:deploy:sepolia
```

Zapisz z wyjscia: adres `CurveLaunchpad` i numer bloku wdrozenia.

- [ ] **Step 2: Wpisz adresy do `.env.local`**

```
NEXT_PUBLIC_LAUNCHPAD_PAD_84532=0x...
NEXT_PUBLIC_LAUNCHPAD_BLOCK_84532=...
```

- [ ] **Step 3: Wypusc testowy token skryptem**

Skryptu tworzacego token jeszcze nie ma (to kawalek 3). Uzyj konsoli hardhata:

```bash
npx hardhat console --network base-sepolia
```

```js
const pad = await ethers.getContractAt('CurveLaunchpad', '0xADRES_PADA');
const deadline = Math.floor(Date.now() / 1000) + 1200;
await (await pad.launch('Test Token', 'TEST', 0, deadline)).wait();
```

- [ ] **Step 4: Przejdz pelna sciezke w przegladarce**

Run: `npm run dev`, otworz `http://localhost:3000/launchpad`

Sprawdz po kolei i **zapisz wynik kazdego punktu**:

1. token widoczny na liscie w zakladce „Na krzywej"
2. wejscie na strone tokena pokazuje pasek 0.00 / 3.00 ETH
3. kupno za 0.01 ETH przechodzi, pasek rosnie
4. w oknie startowym (pierwsze 300 s) widoczny komunikat o pozostalym limicie
5. proba kupna ponad limit okna daje zdanie po polsku, **nie** okno MetaMaska
6. sprzedaz polowy pozycji przechodzi (dwie transakcje: approve + sell)
7. kupno za 5 ETH domyka prog — widoczny „zwrot", stan zmienia sie na „Zamknieta"
8. w stanie „Zamknieta" kupno jest niedostepne, sprzedaz dziala
9. przycisk „Awansuj token" pokazuje nagrode i przechodzi
10. po awansie panel handlu mowi o puli, a `claimable` pokazuje saldo do odbioru

- [ ] **Step 5: Odhacz przebieg w specyfikacji**

W `docs/superpowers/specs/2026-08-10-launchpad-frontend-rdzen-handlu-design.md`, w sekcji „Czego ta specyfikacja NIE pokrywa testami", dopisz na koncu:

```
Pelny przebieg reczny na Base Sepolia wykonany <DATA>, wszystkie 10 punktow zielone.
```

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/specs/2026-08-10-launchpad-frontend-rdzen-handlu-design.md
git commit -m "docs: potwierdzony pelny przebieg launchpada na Base Sepolia"
```

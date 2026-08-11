/**
 * Kontrola koncowa ZYWEGO wdrozenia Base mainnet.
 *
 * Nie forkuje - pyta prawdziwy RPC Base mainnet o realny launchpad i sprawdza,
 * ze odpowiada dokladnie tak, jak zaklada frontend:
 *  - stale krzywej i oplat = to, co config/UI pokazuje,
 *  - wiazania HOOK/VAULT/FEE_RECIPIENT spojne,
 *  - selektory advanced (MAX_BUYBACK_BPS) i vanity (predictVanityToken) ISTNIEJA
 *    (bez nich UI nie zaswieca sekcji),
 *  - miner offline (predictLaunchpadVanity) daje adres ZGODNY co do bitu z zywym
 *    predictVanityToken - czyli to, co user wykopie, to, co realnie powstanie.
 *
 *   TS_NODE_PROJECT=./hardhat.tsconfig.json npx ts-node scripts/launchpad/mainnetLiveCheck.ts
 */
import {
  JsonRpcProvider,
  Contract,
  keccak256,
  solidityPacked,
  AbiCoder,
  getBytes,
  hexlify,
  getAddress,
} from "ethers";

const RPC = process.env.BASE_RPC_URL || "https://mainnet.base.org";
const LAUNCHPAD = "0xCF541A7EcE881945833ff1680dFc067C5Dd4cE2D";
const VAULT = "0x6108aDCb176D2A4A6283A06bb0Dd468b86A6AB63";
const HOOK = "0x71028Ea6999e2c415b46cc022ED0A9fDca2e2044";
const FACTORY = "0xEC7db55Bc081289820097703B3A66003092844D1";
const SAFE = "0x83E2DE974FC6B866FDb78AEFa5596d58fDc4142F";
const CHAIN_ID = 8453;
const PREFIX = "0xb2000000000000000000";
const coder = AbiCoder.defaultAbiCoder();

const padAbi = [
  "function T0() view returns (uint256)",
  "function R_VIRT() view returns (uint256)",
  "function FEE_BPS() view returns (uint16)",
  "function CREATOR_FEE_BPS() view returns (uint16)",
  "function MAX_BUYBACK_BPS() view returns (uint16)",
  "function VAULT() view returns (address)",
  "function HOOK() view returns (address)",
  "function TOKEN_FACTORY() view returns (address)",
  "function predictVanityToken(address creator, bytes32 vanitySalt) view returns (address)",
];
const hookAbi = [
  "function FEE_RECIPIENT() view returns (address)",
  "function PROTOCOL_SHARE_BPS() view returns (uint16)",
  "function VAULT() view returns (address)",
];

// Miner offline - te same 3 kroki co app/utils/b20/launchpadVanity.ts.
function predictOffline(creator: string, vanitySalt: string): string {
  const launchId = keccak256(
    coder.encode(["address", "address", "bytes32", "uint256"], [LAUNCHPAD, creator, vanitySalt, CHAIN_ID]),
  );
  const effSalt = keccak256(solidityPacked(["address", "bytes32"], [LAUNCHPAD, launchId]));
  const tail = getBytes(keccak256(coder.encode(["address", "bytes32"], [FACTORY, effSalt]))).slice(0, 9);
  const bytes = new Uint8Array(20);
  bytes.set(getBytes(PREFIX), 0);
  bytes[10] = 0;
  bytes.set(tail, 11);
  return getAddress(hexlify(bytes));
}

let fails = 0;
function check(label: string, got: unknown, want: unknown) {
  const ok = String(got).toLowerCase() === String(want).toLowerCase();
  if (!ok) fails += 1;
  console.log(ok ? "  ok  " : " FAIL ", label.padEnd(34), String(got));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Publiczny RPC lubi rate-limit; odczyty przez ten wrapper ponawiaja z backoffem. */
async function rd<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const out = await fn();
      await sleep(250); // odstep, zeby nie wpasc w limit przy nastepnym
      return out;
    } catch (error) {
      const msg = String((error as { info?: { error?: { message?: string } } })?.info?.error?.message ?? error);
      if (attempt < 6 && /rate limit|-32016|too many/i.test(msg)) {
        await sleep(1500);
        continue;
      }
      throw error;
    }
  }
}

async function main() {
  const provider = new JsonRpcProvider(RPC);
  const net = await provider.getNetwork();
  console.log("RPC        ", RPC, "chainId", net.chainId.toString());
  console.log("launchpad  ", LAUNCHPAD);
  console.log("");

  const pad = new Contract(LAUNCHPAD, padAbi, provider);
  const hook = new Contract(HOOK, hookAbi, provider);

  check("T0 = 1e9 * 1e18", await rd(() => pad.T0()), 1_000_000_000n * 10n ** 18n);
  check("R_VIRT = 0.75 ETH", await rd(() => pad.R_VIRT()), 750_000_000_000_000_000n);
  check("FEE_BPS", await rd(() => pad.FEE_BPS()), 100n);
  check("CREATOR_FEE_BPS", await rd(() => pad.CREATOR_FEE_BPS()), 70n);
  check("MAX_BUYBACK_BPS exists (advanced)", (await rd(() => pad.MAX_BUYBACK_BPS())) >= 0n, true);
  check("VAULT()", await rd(() => pad.VAULT()), VAULT);
  check("HOOK()", await rd(() => pad.HOOK()), HOOK);
  check("TOKEN_FACTORY()", await rd(() => pad.TOKEN_FACTORY()), FACTORY);
  check("hook.FEE_RECIPIENT == Safe", await rd(() => hook.FEE_RECIPIENT()), SAFE);
  check("hook.PROTOCOL_SHARE_BPS", await rd(() => hook.PROTOCOL_SHARE_BPS()), 3000n);
  check("hook.VAULT == vault", await rd(() => hook.VAULT()), VAULT);

  console.log("");
  // Vanity: selektor istnieje + miner offline == lancuch, co do bitu.
  const creator = SAFE;
  const salt = "0x" + "9a".repeat(32);
  const onchain = await rd(() => pad.predictVanityToken(creator, salt));
  const offline = predictOffline(creator, salt);
  console.log("predictVanityToken onchain ", onchain);
  console.log("predictLaunchpadVanity off ", offline);
  check("vanity: offline == onchain", offline, onchain);
  check("vanity: adres to B20 ASSET", onchain.toLowerCase().startsWith("0xb2000000"), true);

  console.log("");
  if (fails === 0) {
    console.log("WSZYSTKO OK: zywe wdrozenie zgadza sie z frontem, vanity dziala i miner nie klamie.");
  } else {
    console.log(`${fails} KONTROLI ODPADLO - patrz FAIL wyzej.`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

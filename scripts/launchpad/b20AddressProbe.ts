/**
 * Czy potrafimy ODTWORZYC adres B20 w JS, bit w bit z precompile?
 *
 * Vanity mining musi liczyc adres OFFLINE (16^4 prob dla 4 znakow - eth_call
 * per proba odpada). Adres liczy precompile 0xB20f wbudowany w node Base, wiec
 * jego preimage nie wynika z naszego Solidity - trzeba go ZGADNAC i SPRAWDZIC
 * wzgledem prawdy z lancucha.
 *
 * Prawda z lancucha: `B20TokenFactory.predictTokenFor(deployer, salt)` (jest juz
 * wdrozony na Base Sepolii). Ten skrypt liczy adres kilkoma kandydatami kodowania
 * i mowi, KTORY zgadza sie z lancuchem - albo ze zaden (wtedy miner offline jest
 * niemozliwy i vanity musi isc przez eth_call/inny wzor).
 *
 * Uruchomienie:
 *   TS_NODE_PROJECT=./hardhat.tsconfig.json npx hardhat run scripts/launchpad/b20AddressProbe.ts --network baseSepolia
 * lub bez sieci hardhata (czysty RPC):
 *   BASE_SEPOLIA_RPC=https://sepolia.base.org npx ts-node scripts/launchpad/b20AddressProbe.ts
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

const RPC = process.env.BASE_SEPOLIA_RPC || "https://sepolia.base.org";
// B20TokenFactory na Base Sepolii (docs/LAUNCHPAD-STAN.md / config.ts).
const FACTORY = "0x8ad50FFdD5957C34519e922c1Ff18e3DF089565F";
const VARIANT_ASSET = 0;
const PREFIX = "0xb2000000000000000000"; // 10 bajtow: 0xB2 + 9x00

// Kandydaci deployera i salta - dowolne, byle stale (probe deterministyczny).
const DEPLOYER = "0x83C68Dbf0E79f934FcCCd3Ca015103A768C21E83";
const SALT = "0x" + "42".repeat(32);

const abi = ["function predictTokenFor(address deployer, bytes32 salt) view returns (address)"];

/** effectiveSalt = keccak256(abi.encodePacked(deployer, salt)) - z B20TokenFactory. */
function effectiveSalt(deployer: string, salt: string): string {
  return keccak256(solidityPacked(["address", "bytes32"], [deployer, salt]));
}

/** Adres z 9-bajtowego ogona: PREFIX + wariant + pierwsze 9 bajtow ogona. */
function assembleFromTail(tailHash: string): string {
  const tail = getBytes(tailHash).slice(0, 9); // pierwsze 9 bajtow
  const bytes = new Uint8Array(20);
  bytes.set(getBytes(PREFIX), 0); // 10 bajtow prefiksu
  bytes[10] = VARIANT_ASSET; // bajt wariantu
  bytes.set(tail, 11); // 9 bajtow ogona
  return getAddress(hexlify(bytes));
}

// Rozne preimage'y wewnetrznego keccaka (deployer w getB20Address = FACTORY).
function candidates(factory: string, salt: string): Record<string, string> {
  const coder = AbiCoder.defaultAbiCoder();
  const variantByte = "0x" + VARIANT_ASSET.toString(16).padStart(2, "0");
  return {
    "packed(addr,bytes32)": keccak256(solidityPacked(["address", "bytes32"], [factory, salt])),
    "packed(u8,addr,bytes32)": keccak256(
      solidityPacked(["uint8", "address", "bytes32"], [VARIANT_ASSET, factory, salt]),
    ),
    "packed(addr,bytes32,u8)": keccak256(
      solidityPacked(["address", "bytes32", "uint8"], [factory, salt, VARIANT_ASSET]),
    ),
    "abi(addr,bytes32)": keccak256(coder.encode(["address", "bytes32"], [factory, salt])),
    "abi(u8,addr,bytes32)": keccak256(
      coder.encode(["uint8", "address", "bytes32"], [VARIANT_ASSET, factory, salt]),
    ),
    "packed(bytes1,addr,bytes32)": keccak256(
      solidityPacked(["bytes1", "address", "bytes32"], [variantByte, factory, salt]),
    ),
  };
}

async function main() {
  const provider = new JsonRpcProvider(RPC);
  const net = await provider.getNetwork();
  console.log("RPC        ", RPC, "chainId", net.chainId.toString());
  console.log("factory    ", FACTORY);

  const factory = new Contract(FACTORY, abi, provider);
  const onchain: string = await factory.predictTokenFor(DEPLOYER, SALT);
  console.log("onchain    ", onchain);

  if (!onchain.toLowerCase().startsWith("0xb200000000000000000000")) {
    console.log("UWAGA: onchain nie ma prefiksu B20 ASSET - fabryka moze byc inna albo RPC zly.");
  }

  const es = effectiveSalt(DEPLOYER, SALT);
  console.log("effSalt    ", es);
  console.log("");

  let hit: string | null = null;
  for (const [label, tailHash] of Object.entries(candidates(FACTORY, es))) {
    let computed = "<blad>";
    try {
      computed = assembleFromTail(tailHash);
    } catch {
      /* zly ksztalt */
    }
    const ok = computed.toLowerCase() === onchain.toLowerCase();
    console.log(ok ? "  MATCH " : "        ", label.padEnd(30), computed);
    if (ok) hit = label;
  }

  console.log("");
  if (hit) {
    console.log(`OK: preimage = "${hit}". Miner offline jest wiarygodny tym wzorem.`);
  } else {
    console.log("BRAK: zaden kandydat nie trafil. Trzeba innego wzoru albo mining przez eth_call.");
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

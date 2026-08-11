/**
 * Czy caly lancuszek vanity launchpada zgadza sie z lancuchem?
 *
 * predictLaunchpadVanity (JS, viem) sklada: launchId -> effectiveSalt ->
 * getB20Address. getB20Address juz sprawdzony (b20AddressProbe). Tu domykamy
 * calosc: liczymy adres TA SAMA droga w ethers i porownujemy z tym, co odda
 * ZYWY `B20TokenFactory.predictTokenFor(launchpad, launchId)` na Base Sepolii.
 * predictTokenFor to dokladnie ta funkcja, ktora launchVanity wola posrednio.
 *
 *   TS_NODE_PROJECT=./hardhat.tsconfig.json npx ts-node scripts/launchpad/vanityCompositionProbe.ts
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
const FACTORY = "0x8ad50FFdD5957C34519e922c1Ff18e3DF089565F"; // B20TokenFactory Base Sepolia
const LAUNCHPAD = "0x4Cc0ff50912400eeeC38db45ef5CEf00f5Ad1A48"; // CurveLaunchpad Base Sepolia (dowolny 'launchpad' do testu wzoru)
const CREATOR = "0x83C68Dbf0E79f934FcCCd3Ca015103A768C21E83";
const VANITY_SALT = "0x" + "7c".repeat(32);
const CHAIN_ID = 84532;
const PREFIX = "0xb2000000000000000000";
const coder = AbiCoder.defaultAbiCoder();

const abi = ["function predictTokenFor(address deployer, bytes32 salt) view returns (address)"];

function launchId(): string {
  return keccak256(
    coder.encode(["address", "address", "bytes32", "uint256"], [LAUNCHPAD, CREATOR, VANITY_SALT, CHAIN_ID]),
  );
}
function predictJs(lid: string): string {
  const effSalt = keccak256(solidityPacked(["address", "bytes32"], [LAUNCHPAD, lid]));
  const tail = getBytes(keccak256(coder.encode(["address", "bytes32"], [FACTORY, effSalt]))).slice(0, 9);
  const bytes = new Uint8Array(20);
  bytes.set(getBytes(PREFIX), 0);
  bytes[10] = 0;
  bytes.set(tail, 11);
  return getAddress(hexlify(bytes));
}

async function main() {
  const provider = new JsonRpcProvider(RPC);
  const lid = launchId();
  const js = predictJs(lid);
  const factory = new Contract(FACTORY, abi, provider);
  const onchain: string = await factory.predictTokenFor(LAUNCHPAD, lid);
  console.log("launchId ", lid);
  console.log("JS       ", js);
  console.log("onchain  ", onchain);
  const ok = js.toLowerCase() === onchain.toLowerCase();
  console.log(ok ? "\nMATCH: lancuszek vanity zgadza sie z lancuchem." : "\nMISMATCH: wzor zly.");
  if (!ok) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

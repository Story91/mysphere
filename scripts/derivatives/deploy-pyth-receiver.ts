import { ethers, network } from "hardhat";
import fs from "fs";
import path from "path";

/**
 * WDROZENIE PythReceiver NA ARC (testnet 5042002 albo mainnet 5042).
 *
 * MAINNET: Pyth NIE ma kontraktu na Arc mainnet (docs Pytha listuja tylko
 * testnet), wiec ten odbiornik jest tam JEDYNYM zrodlem indeksu. Owner =
 * wdrazajacy tylko na start - na mainnecie przekazac na multisig.
 *
 * Straznicy i emiter z deployments/pythSigners.json (odzyskane z prawdziwych
 * podpisow Hermesa przez collect-pyth-signers.ts). Quorum 3 = tyle podpisow
 * niesie kazda aktualizacja Hermesa (zaobserwowane na 40 VAA z 11.09.2026).
 * Owner = wdrazajacy; na testnecie wystarczy, na mainnecie NIE.
 *
 * UZYCIE
 *   CONFIRM=tak npx cross-env TS_NODE_PROJECT=./hardhat.tsconfig.json \
 *     hardhat run scripts/derivatives/deploy-pyth-receiver.ts --network arcTestnet
 */
/** Oba lancuchy Arc; plik wyjsciowy bierze nazwe z PRAWDZIWEGO chainId. */
const ARC_CHAIN_IDS = new Set([5042002, 5042]);

async function main() {
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const isLocal = network.name === "hardhat" || network.name === "localhost";
  if (!isLocal && !ARC_CHAIN_IDS.has(chainId)) throw new Error(`Oczekiwalem Arc (5042002 albo 5042), dostalem ${chainId}.`);
  if (!isLocal && process.env.CONFIRM !== "tak") throw new Error("To wdraza kontrakt. Powtorz z CONFIRM=tak.");

  const signersFile = path.join(__dirname, "..", "..", "deployments", "pythSigners.json");
  const signers = JSON.parse(fs.readFileSync(signersFile, "utf8"));
  const guardians: string[] = Object.keys(signers.guardians)
    .map(Number)
    .sort((a, b) => a - b)
    .map((i) => signers.guardians[i]);
  const [srcChain, srcEmitter] = (signers.emitters[0] as string).split(":");
  const quorum = Number(process.env.QUORUM || 3);

  const [deployer] = await ethers.getSigners();
  console.log("straznicy", guardians.length, "quorum", quorum, "zestaw", signers.guardianSet, "emiter", srcChain, srcEmitter);
  const receiver = await (await ethers.getContractFactory("PythReceiver")).deploy(
    guardians,
    quorum,
    signers.guardianSet,
    Number(srcChain),
    srcEmitter
  );
  await receiver.waitForDeployment();
  const address = await receiver.getAddress();
  console.log(`PythReceiver: ${address} (owner ${deployer.address})`);

  if (!isLocal) {
    const file = path.join(__dirname, "..", "..", "deployments", `pythReceiver.${chainId}.json`);
    fs.writeFileSync(
      file,
      JSON.stringify(
        { chainId, receiver: address, owner: deployer.address, guardians, quorum, guardianSet: signers.guardianSet, sourceChain: Number(srcChain), sourceEmitter: srcEmitter, deployedAt: new Date().toISOString() },
        null,
        2
      ) + "\n"
    );
    console.log(`zapisano ${file}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

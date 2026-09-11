import { ethers, network } from "hardhat";
import fs from "fs";
import path from "path";

/**
 * WDROZENIE PythReceiver NA ARC TESTNET.
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
const CHAIN_ID = 5042002;

async function main() {
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const isLocal = network.name === "hardhat" || network.name === "localhost";
  if (!isLocal && chainId !== CHAIN_ID) throw new Error(`Oczekiwalem Arc Testnet (${CHAIN_ID}), dostalem ${chainId}.`);
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
    const file = path.join(__dirname, "..", "..", "deployments", `pythReceiver.${CHAIN_ID}.json`);
    fs.writeFileSync(
      file,
      JSON.stringify(
        { chainId: CHAIN_ID, receiver: address, owner: deployer.address, guardians, quorum, guardianSet: signers.guardianSet, sourceChain: Number(srcChain), sourceEmitter: srcEmitter, deployedAt: new Date().toISOString() },
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

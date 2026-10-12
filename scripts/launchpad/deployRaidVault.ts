import { ethers, network } from "hardhat";
import { getAddress } from "ethers";
import { mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";

/**
 * WDROZENIE RaidVault (contracts/launchpad/raid/RaidVault.sol) - wspolne kupno
 * ekipy. Kontrakt bez konstruktora i bez wlasciciela: jeden na siec, dla
 * rynku ETH i rynkow perpow (przez PerpZap). Symulacja pelnego raidu na zywym
 * Base (eth_simulateV1, oba tryby) przeszla 2026-10-12 przed wdrozeniem.
 *
 *   npm run launchpad:deploy:raid:base
 */
async function main() {
  const [signer] = await ethers.getSigners();
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const Raid = await ethers.getContractFactory("RaidVault");
  const raid = await Raid.deploy();
  const receipt = await raid.deploymentTransaction()!.wait();
  const address = getAddress(await raid.getAddress());
  if ((await raid.raidCount()) !== 0n) throw new Error("raidCount != 0 po wdrozeniu");
  const record = {
    network: network.name,
    chainId,
    raidVault: address,
    deployer: getAddress(signer.address),
    deployTx: receipt!.hash,
    deployBlock: receipt!.blockNumber,
    deployedAt: new Date().toISOString(),
  };
  const outputPath = join(process.cwd(), "scripts", "output", `raid-vault-${network.name}.json`);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(record, null, 2) + "\n", { encoding: "utf8" });
  console.log("WDROZONE", JSON.stringify(record, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

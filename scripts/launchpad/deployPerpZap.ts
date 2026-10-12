import { ethers, network } from "hardhat";
import { getAddress } from "ethers";
import { mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { resolvePoolManager } from "./plan";
import { verifyPoolManagerCode } from "./verifyPoolManager";
import { simulateZapBuy } from "./perpZapSim";

/**
 * WDROZENIE PerpBuyZap (ETH -> USDC -> perp -> mem na krzywej Q, jedna transakcja).
 *
 * Jeden zap obsluguje wszystkie rynki perpow sieci - launchpad i klucze pul
 * podaje wolajacy. Przed wdrozeniem i po nim skrypt symuluje kupno za ETH na
 * zywym launchpadzie (SIM_LAUNCHPAD + SIM_TOKEN), zeby nie zapisac adresu
 * zapa, ktory nie umie kupic.
 *
 *   SIM_LAUNCHPAD=0x86B7... SIM_TOKEN=0xb200... npm run launchpad:deploy:zap:base
 *   DRY_RUN=1 - tylko symulacja z kodem podstawionym, bez wdrozenia.
 *   ZAP_CONTRACT=PerpBuyZap - v1 (tylko kupno); domyslnie PerpZap (v2, kupno i sprzedaz).
 */
const ZAP_CONTRACT = process.env.ZAP_CONTRACT ?? "PerpZap";

async function main() {
  const simLaunchpad = process.env.SIM_LAUNCHPAD ? getAddress(process.env.SIM_LAUNCHPAD) : null;
  const simToken = process.env.SIM_TOKEN ? getAddress(process.env.SIM_TOKEN) : null;
  if (!simLaunchpad || !simToken) throw new Error("SIM_LAUNCHPAD i SIM_TOKEN sa wymagane - zap jest sprawdzany kupnem na zywej krzywej.");

  const [signer] = await ethers.getSigners();
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const { address: poolManager, source } = resolvePoolManager(chainId);
  const pmCode = await ethers.provider.getCode(poolManager);
  if (pmCode === "0x") throw new Error(`Pod ${poolManager} nie ma kodu (chainId ${chainId}, ${source}).`);
  verifyPoolManagerCode(chainId, pmCode);

  const Zap = await ethers.getContractFactory(ZAP_CONTRACT);

  // 1. Symulacja PRZED wdrozeniem: kod uruchomieniowy z wpisanym PoolManagerem
  // (immutable) pod adresem, pod ktory zap faktycznie trafi.
  const nonce = await signer.getNonce("pending");
  const predicted = ethers.getCreateAddress({ from: signer.address, nonce });
  const runtime = await localRuntime(poolManager);
  const pre = await simulateZapBuy({ zap: predicted, launchpad: simLaunchpad, token: simToken, ethIn: ethers.parseEther("0.001"), code: runtime });
  console.log(`symulacja przed: 0.001 ETH -> ${ethers.formatEther(pre.perpIn)} perpa -> ${ethers.formatEther(pre.tokensOut)} tokenow, gaz ${pre.gas}`);
  if (process.env.DRY_RUN) return;

  // 2. Wdrozenie i 3. ta sama symulacja na prawdziwym kontrakcie.
  const zap = await Zap.deploy(poolManager);
  const receipt = await zap.deploymentTransaction()!.wait();
  const address = getAddress(await zap.getAddress());
  if (address !== getAddress(predicted)) throw new Error(`adres ${address} != przewidziany ${predicted}`);
  const post = await simulateZapBuy({ zap: address, launchpad: simLaunchpad, token: simToken, ethIn: ethers.parseEther("0.001") });
  console.log(`symulacja po: 0.001 ETH -> ${ethers.formatEther(post.perpIn)} perpa -> ${ethers.formatEther(post.tokensOut)} tokenow`);

  const record = {
    network: network.name,
    chainId,
    zap: address,
    contract: ZAP_CONTRACT,
    poolManager,
    deployer: getAddress(signer.address),
    deployTx: receipt!.hash,
    deployBlock: receipt!.blockNumber,
    deployedAt: new Date().toISOString(),
  };
  const outputPath = join(process.cwd(), "scripts", "output", `${ZAP_CONTRACT === "PerpBuyZap" ? "perp-zap" : "perp-zap-v2"}-${network.name}.json`);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(record, null, 2) + "\n", { encoding: "utf8" });
  console.log("WDROZONE", JSON.stringify(record, null, 2));
}

/**
 * Kod uruchomieniowy z wypelnionym immutable: konstruktor wykonany lokalnie
 * (eth_call z kodem inicjalizujacym zwraca kod uruchomieniowy).
 */
async function localRuntime(poolManager: string) {
  const Zap = await ethers.getContractFactory(ZAP_CONTRACT);
  const deployTx = await Zap.getDeployTransaction(poolManager);
  return ethers.provider.call({ data: deployTx.data });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

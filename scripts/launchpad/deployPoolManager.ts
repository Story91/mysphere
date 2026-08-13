import hre from "hardhat";

/**
 * WDROZENIE POOLMANAGERA UNISWAPA v4 NA SIECI, KTORA GO NIE MA.
 *
 * ===========================================================================
 * KIEDY TEGO UZYWAC, A KIEDY NIE
 * ===========================================================================
 * NIE uzywac na Base, Base Sepolii ani Robinhoodzie. Tam PoolManager jest
 * wdrozony przez Uniswapa, stoi w mapie `KNOWN_POOL_MANAGERS` w plan.ts i
 * korzysta z niego caly ekosystem - postawienie obok drugiego znaczyloby pule
 * bez ruchu, bez routingu i bez agregatorow.
 *
 * TAK uzywac tam, gdzie Uniswapa nie ma, a lancuch spelnia jego wymagania.
 * Pierwszy taki przypadek to Arc: `eth_getCode` na trzech kanonicznych adresach
 * oddaje pustke, oficjalna lista wdrozen v4 Arc nie wymienia, a transient
 * storage (EIP-1153) dziala - sprawdzone opcode po opcodzie przez `eth_call`.
 *
 * ===========================================================================
 * CO TEN SKRYPT ROBI, ZANIM COKOLWIEK WYDA
 * ===========================================================================
 * Najpierw SYMULUJE wdrozenie przez `eth_call` z pustym `to`. To wykonuje
 * konstruktor na prawdziwym stanie sieci i oddaje kod runtime, nie wydajac ani
 * grosza. Dopiero gdy symulacja odda kod odpowiedniej dlugosci, wysylamy
 * transakcje. Dzieki temu roznica miedzy "u nas sie kompiluje" a "tam sie
 * wdroży" wychodzi ZA DARMO, a nie po zaplaceniu za nieudana transakcje.
 *
 * Wlascicielem zostaje deployer. W v4 wlasciciel moze wylacznie ustawiac
 * oplate protokolu (do 0.1% swapa) i jej odbiorce - nie ma zadnej wladzy nad
 * pulami, plynnoscia ani cudzymi pieniedzmi.
 */

async function main() {
  const { ethers, network } = hre as any;
  const [deployer] = await ethers.getSigners();
  const chainId = Number((await ethers.provider.getNetwork()).chainId);

  console.log("Siec       ", network.name, `(chainId ${chainId})`);
  console.log("Deployer   ", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Saldo      ", ethers.formatEther(balance), "jednostek natywnych");

  const factory = await ethers.getContractFactory(
    "@uniswap/v4-core/src/PoolManager.sol:PoolManager"
  );
  const initCode = (await factory.getDeployTransaction(deployer.address)).data as string;

  // ---------------------------------------------------------------------
  // 1. SYMULACJA - konstruktor na prawdziwym stanie sieci, za zero
  // ---------------------------------------------------------------------
  const simulated = await ethers.provider.call({ from: deployer.address, data: initCode });
  const runtimeBytes = (simulated.length - 2) / 2;
  if (runtimeBytes < 1000) {
    throw new Error(
      `Symulacja wdrozenia oddala ${runtimeBytes} B kodu. Konstruktor nie przeszedl na tej sieci - ` +
        `wdrozenie na zywo tez by nie przeszlo, tylko juz za pieniadze.`
    );
  }
  // EIP-170. Przekroczenie tego progu na wiekszosci sieci konczy sie
  // transakcja, ktora zuzywa caly gaz i nie zostawia kontraktu.
  if (runtimeBytes > 24_576) {
    throw new Error(`Kod runtime ma ${runtimeBytes} B i przekracza limit 24 576 B (EIP-170).`);
  }
  console.log("Symulacja   OK -", runtimeBytes, "B kodu runtime");

  const gas = await ethers.provider.estimateGas({ from: deployer.address, data: initCode });
  const fee = await ethers.provider.getFeeData();
  const price = fee.gasPrice ?? 0n;
  console.log("Gaz        ", gas.toString(), "| koszt", ethers.formatEther(gas * price), "jednostek");

  // ---------------------------------------------------------------------
  // 2. WDROZENIE
  // ---------------------------------------------------------------------
  const poolManager = await factory.deploy(deployer.address);
  console.log("Transakcja ", poolManager.deploymentTransaction()?.hash);
  await poolManager.waitForDeployment();
  const address = await poolManager.getAddress();

  // ---------------------------------------------------------------------
  // 3. WERYFIKACJA ODCZYTEM Z ZEWNATRZ, a nie zaufaniem do odpowiedzi deploya
  // ---------------------------------------------------------------------
  const onchain = await ethers.provider.getCode(address);
  const onchainBytes = (onchain.length - 2) / 2;
  const owner = await poolManager.owner();

  console.log("");
  console.log("PoolManager", address);
  console.log("Kod        ", onchainBytes, "B", onchainBytes === runtimeBytes ? "(zgadza sie z symulacja)" : "(ROZNI SIE OD SYMULACJI)");
  console.log("Wlasciciel ", owner);
  console.log("");
  console.log("Dopisz do KNOWN_POOL_MANAGERS w scripts/launchpad/plan.ts:");
  console.log(`  ${chainId}: "${address}",`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

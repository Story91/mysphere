import { ethers } from "hardhat";
import { getAddress } from "ethers";
import { buildPlan, readCommonEnv, resolvePoolManager, HOOK_REQUIRED_FLAGS } from "./launchpad/plan";

/**
 * KOPALNIA ADRESU HOOKA - sam podglad, bez wdrazania.
 *
 * ===========================================================================
 * PO CO
 * ===========================================================================
 * Uniswap v4 czyta uprawnienia hooka z DOLNYCH 14 BITOW jego adresu i odrzuca
 * kazda pule, ktorej hook ma tam cokolwiek innego (`HookAddressNotValid`).
 * Adresu nie da sie wiec wybrac - trzeba go WYKOPAC: szukamy salta CREATE2,
 * dla ktorego wyliczony adres ma dokladnie `HOOK_REQUIRED_FLAGS`.
 *
 * ===========================================================================
 * KIEDY UZYWAC TEGO, A KIEDY deploy.ts
 * ===========================================================================
 * Do WDROZENIA sluzy `scripts/launchpad/deploy.ts`, ktory kopie i wdraza
 * w jednym przebiegu - i tylko tak salt na pewno przezyje do transakcji.
 *
 * Ten skrypt istnieje do PODGLADU: zobaczyc adresy, zanim cokolwiek pojdzie
 * na siec, albo odtworzyc plan po fakcie. Rachunek stoi w `launchpad/plan.ts`
 * i jest ten sam dla obu, wiec nie ma jak sie rozjechac.
 *
 * OSTRZEZENIE, ktore trzeba przeczytac: salt jest wazny wylacznie dla trojki
 * (wdrazajacy, nonce, argumenty konstruktora hooka). Kazda transakcja wyslana
 * z tego adresu po wykopaniu - takze wdrozenie fabryki tokena - podnosi nonce
 * i uniewaznia wynik.
 *
 * ===========================================================================
 * UZYCIE
 * ===========================================================================
 *   FEE_RECIPIENT=0x... npx hardhat run scripts/mineHookAddress.ts --network base
 *
 *   FEE_RECIPIENT        (wymagane) adres odbiorcy oplat protokolu
 *   PROTOCOL_SHARE_BPS   udzial protokolu (domyslnie 6000)
 *   POOL_MANAGER         adres v4 PoolManager; wymagany poza sprawdzonymi sieciami
 *   DEPLOYER             adres, ktory wysle transakcje (domyslnie signer[0])
 *   DEPLOYER_NONCE       nonce tej transakcji (domyslnie `pending` z sieci)
 */

async function main() {
  const { feeRecipient, protocolShareBps } = readCommonEnv();

  const signers = await ethers.getSigners();
  const deployer = getAddress(process.env.DEPLOYER ?? signers[0].address);
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const { address: poolManager, source: pmSource } = resolvePoolManager(chainId);

  const nonce =
    process.env.DEPLOYER_NONCE !== undefined
      ? Number(process.env.DEPLOYER_NONCE)
      : await ethers.provider.getTransactionCount(deployer, "pending");

  console.log("siec            ", `chainId ${chainId}`);
  console.log("wdrazajacy      ", deployer);
  console.log("nonce           ", nonce);
  console.log("PoolManager     ", poolManager, `[${pmSource}]`);
  console.log("feeRecipient    ", feeRecipient);
  console.log("protocolShareBps", protocolShareBps.toString());
  console.log("szukane bity    ", `0x${HOOK_REQUIRED_FLAGS.toString(16)}`);
  console.log("");

  const started = Date.now();
  const plan = await buildPlan({ poolManager, feeRecipient, protocolShareBps, deployer, nonce });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);

  console.log(`ZNALEZIONE po ${plan.attempts} probach (${seconds}s)`);
  console.log("");
  console.log("initCodeHash    ", plan.initCodeHash);
  console.log("hookSalt        ", plan.hookSalt);
  console.log("launchpad bedzie", plan.launchpad);
  console.log("vault bedzie    ", plan.vault);
  console.log("hook bedzie     ", plan.hook);
  console.log("");
  console.log("Konstruktor launchpada, po kolei:");
  console.log(`  poolManager       ${poolManager}`);
  console.log(`  feeBps            <ustal, sufit 100 = 1%>`);
  console.log(`  creatorFeeBps     <ustal, <= feeBps>`);
  console.log(`  feeRecipient      ${feeRecipient}`);
  console.log(`  protocolShareBps  ${protocolShareBps}`);
  console.log(`  tokenFactory      <B20TokenFactory albo PlainTokenFactory>`);
  console.log(`  hookSalt          ${plan.hookSalt}`);
  console.log("");
  console.log("UWAGA: salt jest wazny WYLACZNIE dla tej trojki (wdrazajacy, nonce,");
  console.log("argumenty hooka). Zmiana ktoregokolwiek - takze wyslanie po drodze");
  console.log("innej transakcji z tego adresu - uniewaznia wynik.");
  console.log("Dlatego do wdrozenia uzywaj scripts/launchpad/deploy.ts, ktory kopie");
  console.log("i wysyla w jednym przebiegu.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

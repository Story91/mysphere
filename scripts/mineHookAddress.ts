import { ethers } from "hardhat";
import {
  concat,
  getAddress,
  getCreateAddress,
  getCreate2Address,
  keccak256,
  toBeHex,
  zeroPadValue,
} from "ethers";

/**
 * KOPALNIA ADRESU HOOKA.
 *
 * ===========================================================================
 * PO CO
 * ===========================================================================
 * Uniswap v4 czyta uprawnienia hooka z DOLNYCH 14 BITOW jego adresu i odrzuca
 * kazda pule, ktorej hook ma tam cokolwiek innego (`HookAddressNotValid`).
 * Adresu nie da sie wiec wybrac - trzeba go WYKOPAC: szukamy salta CREATE2,
 * dla ktorego wyliczony adres ma dokladnie bity `HOOK_REQUIRED_FLAGS`.
 *
 * Trafien jest srednio jedno na 2^14 = 16 384 prob, wiec to sekundy, a nie
 * godziny. Kopanie jest tu formalnoscia, ale formalnoscia BLOKUJACA: bez salta
 * nie da sie wdrozyc launchpada.
 *
 * ===========================================================================
 * LANCUCH ADRESOW - I DLACZEGO DA SIE GO POLICZYC PRZED PIERWSZA TRANSAKCJA
 * ===========================================================================
 *   wdrazajacy + nonce      -> launchpad   (CREATE, adres nie zalezy od argumentow)
 *   launchpad  + nonce 1    -> vault       (CREATE, pierwsze `new` w konstruktorze)
 *   vault + salt + initCode -> hook        (CREATE2, to kopiemy)
 *
 * Kluczowa wlasnosc: adres kontraktu tworzonego przez CREATE NIE ZALEZY od
 * argumentow konstruktora. Dlatego salt hooka, ktory jest argumentem
 * konstruktora launchpada, nie zmienia adresu launchpada ani vaulta - i kolo
 * zaleznosci sie nie zamyka.
 *
 * Konstruktor hooka bierze `(feeRecipient, protocolShareBps)`, a te WCHODZA
 * do kodu tworzacego, wiec musza byc znane tutaj i musza byc identyczne z tymi,
 * ktore pojda do launchpada. Rozjazd wychwyci `LiquidityVault` przy wdrozeniu
 * (`HookConfigMismatch`), ale lepiej nie doprowadzac - stad wypis na koncu.
 *
 * ===========================================================================
 * UZYCIE
 * ===========================================================================
 *   npx hardhat run scripts/mineHookAddress.ts --network base
 *
 * Zmienne srodowiskowe (wszystkie opcjonalne poza pierwsza):
 *   FEE_RECIPIENT        adres odbiorcy oplat protokolu
 *   PROTOCOL_SHARE_BPS   udzial protokolu w oplatach LP i hooka (domyslnie 6000)
 *   DEPLOYER             adres, ktory wysle transakcje (domyslnie signer[0])
 *   DEPLOYER_NONCE       nonce tej transakcji (domyslnie odczytany z sieci)
 */

/** Musi zgadzac sie z `HOOK_ALL_MASK` w `contracts/launchpad/B20LaunchHook.sol`. */
const HOOK_ALL_MASK = (1n << 14n) - 1n;

/**
 * Musi zgadzac sie z `HOOK_REQUIRED_FLAGS` tamze:
 * BEFORE_INITIALIZE (13) | AFTER_SWAP (6) | AFTER_SWAP_RETURNS_DELTA (2).
 */
const HOOK_REQUIRED_FLAGS = (1n << 13n) | (1n << 6n) | (1n << 2n);

/** Po tylu probach bez trafienia cos jest nie tak z zalozeniami, a nie ze szczesciem. */
const MAX_ATTEMPTS = 20_000_000;

async function main() {
  const feeRecipient = process.env.FEE_RECIPIENT;
  if (!feeRecipient) {
    throw new Error("FEE_RECIPIENT jest wymagany - to adres, ktory bedzie odbieral oplaty protokolu.");
  }
  const protocolShareBps = BigInt(process.env.PROTOCOL_SHARE_BPS ?? "6000");
  if (protocolShareBps > 8000n) {
    // Ten sam sufit, co MAX_PROTOCOL_SHARE_BPS w LiquidityVault. Sprawdzamy tu,
    // zeby nie kopac przez minute pod deploy, ktory i tak zrewertuje.
    throw new Error(`PROTOCOL_SHARE_BPS=${protocolShareBps} przekracza sufit 8000 (podloga 20% dla tworcy).`);
  }

  const signers = await ethers.getSigners();
  const deployer = getAddress(process.env.DEPLOYER ?? signers[0].address);
  const nonce =
    process.env.DEPLOYER_NONCE !== undefined
      ? Number(process.env.DEPLOYER_NONCE)
      : await ethers.provider.getTransactionCount(deployer);

  // --- lancuch adresow ---
  const launchpad = getCreateAddress({ from: deployer, nonce });
  // Vault jest PIERWSZYM kontraktem tworzonym przez launchpad. Nonce kontraktu
  // startuje od 1 (EIP-161), a nie od 0 - to jest miejsce, w ktorym najlatwiej
  // sie pomylic i wykopac salt pod adres, ktory nigdy nie powstanie.
  const vault = getCreateAddress({ from: launchpad, nonce: 1 });

  // --- kod tworzacy hooka razem z argumentami ---
  const hookArtifact = await ethers.getContractFactory("B20LaunchHook");
  const initCode = concat([
    hookArtifact.bytecode,
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "uint16"],
      [feeRecipient, protocolShareBps]
    ),
  ]);
  const initCodeHash = keccak256(initCode);

  console.log("wdrazajacy      ", deployer);
  console.log("nonce           ", nonce);
  console.log("launchpad bedzie", launchpad);
  console.log("vault bedzie    ", vault);
  console.log("initCodeHash    ", initCodeHash);
  console.log("szukane bity    ", `0x${HOOK_REQUIRED_FLAGS.toString(16)}`);
  console.log("");

  const started = Date.now();
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const salt = zeroPadValue(toBeHex(i), 32);
    const candidate = getCreate2Address(vault, salt, initCodeHash);

    if ((BigInt(candidate) & HOOK_ALL_MASK) === HOOK_REQUIRED_FLAGS) {
      const seconds = ((Date.now() - started) / 1000).toFixed(1);
      console.log(`ZNALEZIONE po ${i + 1} probach (${seconds}s)`);
      console.log("");
      console.log("hookSalt        ", salt);
      console.log("hook bedzie     ", candidate);
      console.log("");
      console.log("Konstruktor launchpada:");
      console.log(`  feeBps            <ustal>`);
      console.log(`  creatorFeeBps     <ustal>`);
      console.log(`  feeRecipient      ${getAddress(feeRecipient)}`);
      console.log(`  protocolShareBps  ${protocolShareBps}`);
      console.log(`  tokenFactory      <adres B20TokenFactory albo PlainTokenFactory>`);
      console.log(`  hookSalt          ${salt}`);
      console.log("");
      console.log("UWAGA: salt jest wazny WYLACZNIE dla tej trojki");
      console.log("(wdrazajacy, nonce, argumenty hooka). Zmiana ktoregokolwiek");
      console.log("z nich - takze wyslanie po drodze innej transakcji z tego");
      console.log("adresu - uniewaznia wynik i trzeba kopac od nowa.");
      return;
    }
  }

  throw new Error(
    `Brak trafienia w ${MAX_ATTEMPTS} probach. Przy 1/16384 to jest niemozliwe ` +
      `statystycznie - sprawdz, czy HOOK_REQUIRED_FLAGS tutaj zgadza sie z kontraktem.`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

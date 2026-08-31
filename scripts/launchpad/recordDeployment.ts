import { ethers, network } from "hardhat";
import { getAddress } from "ethers";
import { mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";

/**
 * Odtwarza plik wdrozenia dla kontraktow, ktore JUZ stoja w sieci.
 *
 * ===========================================================================
 * PO CO TO ISTNIEJE
 * ===========================================================================
 * `deploy.ts` przez dlugi czas wypisywal swoj JSON wylacznie na ekran, a plik
 * `scripts/output/launchpad-<siec>.json` byl uzupelniany recznie. Po kolejnym
 * wdrozeniu na dysku zostawaly wiec STARE adresy - a to wlasnie ten plik czyta
 * `launchpad:env`, czyli zrodlo konfiguracji frontu.
 *
 * `deploy.ts` juz zapisuje plik sam. Ten skrypt sluzy do naprawy sytuacji, w
 * ktorej wdrozenie odbylo sie WCZESNIEJ i pliku nie ma albo jest nieaktualny.
 *
 * ===========================================================================
 * SKAD BIERZE SIE BLOK WDROZENIA
 * ===========================================================================
 * Nie z pliku i nie z pamieci - z LANCUCHA. Szukamy binarnie pierwszego bloku,
 * w ktorym pod adresem launchpada jest juz kod. To jest odczyt sprawdzalny
 * przez kazdego i nie zalezy od tego, czy ktos poprawnie zanotowal wynik.
 *
 * Blok jest wazny, bo od niego front zaczyna skanowanie zdarzen. Podanie
 * zbyt wczesnego to tylko wolniejszy skan; zbyt POZNY gubi starty i wyglada
 * jak "nikt jeszcze nic nie wystartowal".
 *
 * Uzycie:
 *   $env:LAUNCHPAD="0x..."; npx hardhat run scripts/launchpad/recordDeployment.ts --network base-sepolia
 */

async function firstBlockWithCode(address: string, low: number, high: number): Promise<number> {
  // Niezmiennik: w `low` kodu NIE MA, w `high` kod JEST.
  while (low + 1 < high) {
    const mid = Math.floor((low + high) / 2);
    const code = await ethers.provider.getCode(address, mid);
    if (code === "0x") low = mid;
    else high = mid;
  }
  return high;
}

async function main() {
  const launchpadAddress = process.env.LAUNCHPAD;
  if (!launchpadAddress) throw new Error("LAUNCHPAD jest wymagane.");
  const launchpad = getAddress(launchpadAddress);

  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const latest = await ethers.provider.getBlockNumber();

  if ((await ethers.provider.getCode(launchpad)) === "0x") {
    throw new Error(`Pod ${launchpad} nie ma kodu na tej sieci (chainId ${chainId}).`);
  }

  // Dolna granica: 200 000 blokow wstecz to na Base okolo czterech dni. Gdyby
  // kod istnial juz tam, cofamy sie dalej, zamiast zwrocic zla liczbe.
  let low = Math.max(0, latest - 200_000);
  while (low > 0 && (await ethers.provider.getCode(launchpad, low)) !== "0x") {
    low = Math.max(0, low - 200_000);
  }

  console.log(`szukam bloku wdrozenia w zakresie ${low}..${latest}`);
  const deployBlock = await firstBlockWithCode(launchpad, low, latest);

  const pad = new ethers.Contract(
    launchpad,
    [
      "function VAULT() view returns (address)",
      "function HOOK() view returns (address)",
      "function TOKEN_FACTORY() view returns (address)",
      "function FEE_RECIPIENT() view returns (address)",
      "function FEE_BPS() view returns (uint16)",
      "function CREATOR_FEE_BPS() view returns (uint16)",
    ],
    ethers.provider
  );
  const vault = getAddress(await pad.VAULT());
  const hook = getAddress(await pad.HOOK());

  const vaultContract = new ethers.Contract(
    vault,
    ["function PROTOCOL_SHARE_BPS() view returns (uint16)", "function POOL_MANAGER() view returns (address)"],
    ethers.provider
  );

  const record = {
    chainId,
    network: network.name,
    poolManager: getAddress(await vaultContract.POOL_MANAGER()),
    tokenFactory: getAddress(await pad.TOKEN_FACTORY()),
    launchpad,
    vault,
    hook,
    feeBps: (await pad.FEE_BPS()).toString(),
    creatorFeeBps: (await pad.CREATOR_FEE_BPS()).toString(),
    protocolShareBps: (await vaultContract.PROTOCOL_SHARE_BPS()).toString(),
    feeRecipient: getAddress(await pad.FEE_RECIPIENT()),
    deployBlock,
    recordedAt: new Date().toISOString(),
  };

  const outputPath = join(process.cwd(), "scripts", "output", `launchpad-${network.name}.json`);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(record, null, 2) + "\n", { encoding: "utf8" });

  console.log(JSON.stringify(record, null, 2));
  console.log(`\nZapisano ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

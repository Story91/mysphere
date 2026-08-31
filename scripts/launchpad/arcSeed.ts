import hre, { ethers } from "hardhat";
import { getAddress, type Contract, type ContractTransactionReceipt } from "ethers";

/**
 * ZASIEW TABLICY: kilka tokenow, ktore ZOSTAJA NA KRZYWEJ.
 *
 * ===========================================================================
 * PO CO OSOBNY SKRYPT, SKORO JEST JUZ PELNY PRZEBIEG
 * ===========================================================================
 * `sepoliaFlow.ts` zawsze konczy graduacja - i o to w nim chodzi, bo sprawdza
 * najtrudniejszy kawalek. Skutek uboczny: po samych jego przebiegach tablica
 * ma wylacznie tokeny PO graduacji. Nie widac wtedy ani paska postepu krzywej,
 * ani sparkline'a, ani panelu kupowania, ani stanu "Curve" - czyli wiekszosci
 * tego, na co ktos patrzy wchodzac na startpada.
 *
 * Ten skrypt startuje N tokenow i kupuje na kazdym MALO, zostawiajac je zywe.
 *
 * ===========================================================================
 * DLACZEGO NAJPIERW WSZYSTKIE STARTY, A DOPIERO POTEM KUPNA
 * ===========================================================================
 * Przez pierwsze 300 sekund zycia tokena obowiazuje `WINDOW_ADDR_CAP`: jeden
 * adres nie kupi wiecej niz 16 mln tokenow, co przy cenie startowej wychodzi
 * grubo ponizej centa. Kupno musi wiec poczekac, az okno minie.
 *
 * Okna wszystkich tokenow biegna ROWNOLEGLE, wiec startujemy najpierw
 * wszystkie, czekamy raz i dopiero potem kupujemy. Trzy tokeny kosztuja przez
 * to jedno oczekiwanie, a nie trzy - piec minut zamiast pietnastu.
 *
 * ===========================================================================
 * LOGO: DLACZEGO `data:application/json`, A NIE ADRES OBRAZKA
 * ===========================================================================
 * `metadataURI` niosacy sam adres obrazka interfejs pokaze jako ODNOSNIK, nie
 * jako logo - `parseMetadataUri` szuka pola `image` w JSON-ie i tylko wtedy ma
 * prawo cokolwiek wyrenderowac. To nie jest kaprys: pod obcym adresem moze
 * lezec cokolwiek, wiec zgoda na "to jest obrazek" musi byc wpisana wprost.
 *
 * Uzywamy tej samej sciezki, co formularz startu - JSON zapakowany w URI, bez
 * zadnego backendu w srodku. Same obrazki to assety, ktore juz stoja na
 * mysphere.fun, wiec zaden test nie wisi na cudzej bramie IPFS.
 *
 * `metadataURI` NIE MA SETTERA - ustawia sie raz, przy starcie. Tokenom
 * zasianym wczesniej logo dopisze sie wylacznie przez profil (podpisem tworcy),
 * a nie tym skryptem.
 *
 * Uzycie (kwoty w jednostce natywnej sieci; na Arc to USDC):
 *   SEED_COUNT=3 SEED_BUY=0.5 npm run launchpad:seed:arc
 */

const LAUNCH_WINDOW = 300;

/**
 * Obrazki tokenow testowych. Kazdy inny, zeby na tablicy bylo widac, ze logo
 * idzie z tokena, a nie ze wspolnego zapasu - przy szesciu tych samych
 * kolkach nie odroznisz dzialajacego odczytu od przypadku.
 */
const SEED_LOGOS = [
  { image: 'https://mysphere.fun/SphereWhite.png', description: 'Test launch on Arc. No value, no promises.' },
  { image: 'https://mysphere.fun/ethlogo.png', description: 'Arc testnet probe token.' },
  { image: 'https://mysphere.fun/Base_square_blue.png', description: 'Curve mechanics check on Arc.' },
  { image: 'https://mysphere.fun/Camp.png', description: 'Seeded to keep the board alive.' },
  { image: 'https://mysphere.fun/talent.png', description: 'Testnet only. Do not buy.' },
  { image: 'https://mysphere.fun/Kaito-AI.png', description: 'Arc curve, small size, staying live.' },
];

function metadataUriFor(index: number) {
  const entry = SEED_LOGOS[index % SEED_LOGOS.length];
  const json = JSON.stringify({ image: entry.image, description: entry.description });
  return `data:application/json;base64,${Buffer.from(json, 'utf8').toString('base64')}`;
}

function requireAddress(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} jest wymagane.`);
  return getAddress(value);
}

function parseEvent(contract: Contract, receipt: ContractTransactionReceipt, eventName: string) {
  for (const log of receipt.logs) {
    try {
      const parsed = contract.interface.parseLog(log);
      if (parsed?.name === eventName) return parsed;
    } catch {
      // Log z innego kontraktu.
    }
  }
  throw new Error(`Brak eventu ${eventName}.`);
}

/**
 * Powtarza ODCZYT, gdy wezel nie ma jeszcze swiezego stanu. Ta sama pulapka,
 * co w `deploy.ts` i w pelnym przebiegu: `launchOf` dla nieznanego tokena nie
 * rewertuje, tylko oddaje zera.
 */
async function retryRead<T>(label: string, read: () => Promise<T>, attempts = 8): Promise<T> {
  let last: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await read();
    } catch (error) {
      last = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
  }
  throw last;
}

async function waitUntil(target: number, label: string) {
  while (true) {
    const block = await ethers.provider.getBlock("latest");
    if (!block) throw new Error("Brak latest block.");
    const remaining = target - block.timestamp;
    if (remaining <= 0) return;
    console.log(`${label}: pozostalo okolo ${remaining}s`);
    await new Promise((resolve) => setTimeout(resolve, Math.min(15_000, Math.max(2_000, remaining * 1000))));
  }
}

async function main() {
  if (process.env.SEED_CONFIRM !== "tak") {
    throw new Error("To wysyla transakcje. Powtorz z SEED_CONFIRM=tak.");
  }

  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const nativeSymbol = chainId === 5042002 ? "USDC" : "ETH";
  const launchpadAddress = requireAddress("LAUNCHPAD");
  const count = Number(process.env.SEED_COUNT ?? "3");
  const buy = ethers.parseEther(process.env.SEED_BUY ?? "0.5");
  const prefix = process.env.SEED_PREFIX ?? "Arc";

  const [signer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(signer.address);
  const needed = buy * BigInt(count) + ethers.parseEther("0.05");
  if (balance < needed) {
    throw new Error(
      `Za malo srodkow: potrzeba ${ethers.formatEther(needed)} ${nativeSymbol}, jest ${ethers.formatEther(balance)}.`
    );
  }

  console.log("siec     ", hre.network.name, `(chainId ${chainId})`);
  console.log("launchpad", launchpadAddress);
  console.log("plan     ", `${count} tokenow po ${ethers.formatEther(buy)} ${nativeSymbol}`);

  const pad = await ethers.getContractAt("CurveLaunchpad", launchpadAddress);

  // Ekonomia zasianych tokenow ma byc DOKLADNIE domyslna - `launchAdvanced`
  // rozni sie od `launch` wylacznie tym, ze przyjmuje logo. Dlatego oplaty i
  // limit okna czytamy z WDROZONEGO kontraktu zamiast wpisywac je tutaj: gdyby
  // ktos wdrozyl launchpada z innymi stawkami, wpisane liczby po cichu
  // zasialyby tokeny na innych zasadach niz reszta sieci.
  const feeBps = await pad.FEE_BPS();
  const creatorFeeBps = await pad.CREATOR_FEE_BPS();
  const windowCap = await pad.WINDOW_ADDR_CAP();

  // ---------------------------------------------------------------------
  // 1. STARTY - wszystkie naraz, zeby okna biegly rownolegle
  // ---------------------------------------------------------------------
  const tokens: { address: string; symbol: string; startedAt: number }[] = [];
  for (let index = 0; index < count; index += 1) {
    const stamp = Date.now().toString(36).slice(-4).toUpperCase();
    const symbol = `${prefix.toUpperCase().slice(0, 3)}${stamp}`.slice(0, 11);
    const name = `${prefix} Seed ${index + 1}`;
    const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 600;

    const receipt = (await (
      await pad.launchAdvanced(
        name,
        symbol,
        0,
        deadline,
        feeBps,
        creatorFeeBps,
        0,
        windowCap,
        [signer.address],
        [10_000],
        metadataUriFor(index)
      )
    ).wait())!;
    const launched = parseEvent(pad, receipt, "Launched");
    const address = getAddress(launched.args[0]);
    const startedAt = Number(launched.args.startedAt);
    tokens.push({ address, symbol, startedAt });
    console.log(`start ${index + 1}/${count}`, symbol, address, `gaz ${receipt.gasUsed}`);
  }

  // ---------------------------------------------------------------------
  // 2. JEDNO oczekiwanie na okno najmlodszego tokena
  // ---------------------------------------------------------------------
  const lastWindowEnd = Math.max(...tokens.map((token) => token.startedAt)) + LAUNCH_WINDOW + 1;
  await waitUntil(lastWindowEnd, "okno startowe");

  // ---------------------------------------------------------------------
  // 3. KUPNA - male, zeby token ZOSTAL na krzywej
  // ---------------------------------------------------------------------
  for (const token of tokens) {
    const quote = await retryRead("quoteBuy", () => pad.quoteBuy(token.address, buy));
    const minOut = (quote[0] * 9900n) / 10_000n;
    const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 600;
    const receipt = (await (await pad.buy(token.address, minOut, deadline, { value: buy })).wait())!;

    const launch = await retryRead("launchOf", () => pad.launchOf(token.address));
    const raised = ethers.formatEther(launch[2]);
    console.log(
      `kupno ${token.symbol}`,
      `rezerwa ${raised} ${nativeSymbol}`,
      `stan ${["None", "Curve", "Locked", "Graduated"][Number(launch[1])]}`,
      `gaz ${receipt.gasUsed}`
    );
  }

  console.log("");
  console.log("Tokeny na krzywej:");
  for (const token of tokens) console.log(` ${token.symbol}  ${token.address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

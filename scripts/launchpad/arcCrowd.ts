import hre, { ethers } from "hardhat";
import { getAddress, keccak256, toUtf8Bytes, Wallet, type Contract } from "ethers";

/**
 * TLUM: wiele portfeli handluje na krzywej naraz.
 *
 * ===========================================================================
 * PO CO, SKORO MAMY JUZ PELNY PRZEBIEG I ZASIEW
 * ===========================================================================
 * Tamte dwa chodza z JEDNEGO portfela i przez to daja obraz, ktory klamie na
 * najwazniejszym polu. Token kupiony w calosci przez jeden adres pokazuje
 * "jeden portfel trzyma 80% podazy" - i tak wygladal kazdy nasz token, co
 * kosztowalo nas juz jedna falszywa panike przy zakladce Holders.
 *
 * Prawdziwy rynek to kilkunastu kupujacych z roznymi pozycjami, czesc
 * sprzedajaca po drodze. Dopiero wtedy widac, czy dziala rozklad posiadaczy,
 * historia transakcji, sparkline i cena skaczaca w obie strony.
 *
 * ===========================================================================
 * SKAD PORTFELE I DLACZEGO NIE LOSOWE
 * ===========================================================================
 * Klucze sa WYPROWADZONE z jednego ziarna przez keccak, wiec ten sam przebieg
 * mozna powtorzyc i trafic w te same adresy - inaczej po kazdym uruchomieniu
 * zostawalaby garstka testowych dolarow w portfelach, ktorych nikt juz nigdy
 * nie znajdzie. To sa klucze TESTOWE i jawne z zalozenia; nie wolno na nie
 * wyslac niczego z sieci glownej.
 *
 * Uzycie:
 *   CROWD_TOKENS=0x..,0x.. CROWD_WALLETS=10 CROWD_FUND=1 CROWD_ROUNDS=5 \
 *   npm run launchpad:crowd:arc
 */

/** Ziarno kluczy. Zmiana tego napisu = inny zestaw portfeli. */
const SEED = "mysphere-arc-crowd-v1";

/**
 * Ile zostawiamy w portfelu na gaz przy sprzedazy i przy kolejnych rundach.
 * Arc liczy gaz w USDC, a zwykla transakcja kosztuje okolo 0,003 - ten zapas
 * starcza na kilkadziesiat.
 */
const GAS_RESERVE = ethers.parseEther("0.2");

/** Deterministyczny generator - ten sam przebieg da te same kwoty. */
function makeRandom(seed: string) {
  let state = BigInt(keccak256(toUtf8Bytes(seed)));
  return () => {
    state = BigInt(keccak256(toUtf8Bytes(state.toString()))) ;
    return Number(state % 1_000_000n) / 1_000_000;
  };
}

function walletFor(index: number) {
  return new Wallet(keccak256(toUtf8Bytes(`${SEED}/${index}`)), ethers.provider);
}

async function main() {
  if (process.env.CROWD_CONFIRM !== "tak") {
    throw new Error("To wysyla transakcje z wielu portfeli. Powtorz z CROWD_CONFIRM=tak.");
  }

  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const unit = chainId === 5042002 ? "USDC" : "ETH";
  const launchpadAddress = getAddress(process.env.LAUNCHPAD ?? "");
  const tokens = (process.env.CROWD_TOKENS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map(getAddress);
  if (tokens.length === 0) throw new Error("CROWD_TOKENS jest wymagane (adresy po przecinku).");

  const count = Number(process.env.CROWD_WALLETS ?? "10");
  const fund = ethers.parseEther(process.env.CROWD_FUND ?? "1");
  const rounds = Number(process.env.CROWD_ROUNDS ?? "5");
  const random = makeRandom(`${SEED}/run`);

  const [admin] = await ethers.getSigners();
  const pad = (await ethers.getContractAt("CurveLaunchpad", launchpadAddress)) as Contract;

  /**
   * WIELKOSC ZLECENIA IDZIE ZE SKALI KRZYWEJ, A NIE Z WPISANEJ LICZBY.
   *
   * Stalo tu "od 0,01 do 0,15" - dobrane pod launchpada, ktory zbieral 3 USDC.
   * Na krzywej z progiem 1000 USDC taka transakcja nie rusza ceny o nic
   * widocznego: wykres zostaje plaski, pasek postepu nie drgnie i caly przebieg
   * udaje handel, zamiast go pokazywac.
   *
   * Teraz zakres to 0,1% - 1% progu zbiorki, wiec ten sam skrypt daje sensowny
   * ruch na kazdej skali: 1-10 USDC przy progu 1000, 0,02-0,2 przy progu 20.
   */
  const rVirt = (await pad.R_VIRT()) as bigint;
  const target = rVirt * 4n;
  const minTrade = target / 1_000n;
  const maxTrade = target / 100n;

  console.log("siec     ", hre.network.name, `(chainId ${chainId})`);
  console.log("launchpad", launchpadAddress);
  console.log("prog     ", `${ethers.formatEther(target)} ${unit}`);
  console.log("zlecenia ", `${ethers.formatEther(minTrade)} - ${ethers.formatEther(maxTrade)} ${unit}`);
  console.log("tokeny   ", tokens.length);
  console.log("portfele ", count, `po ${ethers.formatEther(fund)} ${unit}`);
  console.log("rundy    ", rounds);
  console.log("");

  // ---------------------------------------------------------------------
  // 1. ZASILENIE - sekwencyjnie, bo nonce admina musi isc po kolei
  // ---------------------------------------------------------------------
  const wallets = Array.from({ length: count }, (_, index) => walletFor(index));
  let funded = 0;
  for (const wallet of wallets) {
    const balance = await ethers.provider.getBalance(wallet.address);
    if (balance >= fund) continue;
    const tx = await admin.sendTransaction({ to: wallet.address, value: fund - balance });
    await tx.wait();
    funded += 1;
  }
  console.log(`zasilone portfele: ${funded} (reszta miala juz srodki)`);

  // ---------------------------------------------------------------------
  // 2. HANDEL
  // ---------------------------------------------------------------------
  let buys = 0;
  let sells = 0;
  let skipped = 0;

  for (let round = 1; round <= rounds; round += 1) {
    for (const [index, wallet] of wallets.entries()) {
      const token = tokens[Math.floor(random() * tokens.length) % tokens.length];
      const state = Number((await pad.launchOf(token))[1]);
      // 1 = Curve. Poza nim kupno rewertuje, wiec token wypada z puli losowania.
      if (state !== 1) {
        skipped += 1;
        continue;
      }

      const balance = await ethers.provider.getBalance(wallet.address);
      if (balance <= GAS_RESERVE) {
        skipped += 1;
        continue;
      }

      // Co czwarty ruch to sprzedaz polowy pozycji - inaczej wykres rosnie
      // monotonicznie i nie widac, czy spadki w ogole sie rysuja.
      const sell = random() < 0.25;
      const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 600;

      try {
        if (sell) {
          const erc = await ethers.getContractAt("LaunchToken", token, wallet);
          const held = (await erc.balanceOf(wallet.address)) as bigint;
          if (held === 0n) {
            skipped += 1;
            continue;
          }
          const amount = held / 2n;
          const allowance = (await erc.allowance(wallet.address, launchpadAddress)) as bigint;
          if (allowance < amount) {
            await (await erc.approve(launchpadAddress, ethers.MaxUint256)).wait();
          }
          const quote = await pad.quoteSell(token, amount);
          // Bufor 10%: przy kilkunastu portfelach handlujacych naraz cena
          // rusza sie miedzy wycena a wejsciem do bloku.
          const minOut = (quote[0] * 9000n) / 10_000n;
          if (minOut === 0n) {
            skipped += 1;
            continue;
          }
          await (await pad.connect(wallet).sell(token, amount, minOut, deadline)).wait();
          sells += 1;
        } else {
          const spendable = balance - GAS_RESERVE;
          // Ulamek progu, a nie stala kwota - dosc, zeby ruszyc cena, za malo,
          // zeby jeden portfel domknal krzywa.
          const draw = BigInt(Math.floor(random() * 1_000));
          const wanted = minTrade + ((maxTrade - minTrade) * draw) / 1_000n;
          const value = wanted > spendable ? spendable : wanted;
          // Ponizej polowy dolnego widelka transakcja jest juz tylko oplata za
          // gaz - portfel przepuszcza runde i zostawia srodki na nastepna.
          if (value < minTrade / 2n) {
            skipped += 1;
            continue;
          }
          const quote = await pad.quoteBuy(token, value);
          const minOut = (quote[0] * 9000n) / 10_000n;
          if (minOut === 0n) {
            skipped += 1;
            continue;
          }
          await (await pad.connect(wallet).buy(token, minOut, deadline, { value })).wait();
          buys += 1;
        }
      } catch (error) {
        // Kolizja z innym portfelem, poslizg, domkniecie krzywej w tej samej
        // chwili - to sa normalne zdarzenia na rynku, nie bledy skryptu.
        skipped += 1;
      }
    }
    console.log(`runda ${round}/${rounds}: kupna ${buys}, sprzedaze ${sells}, pominiete ${skipped}`);
  }

  // ---------------------------------------------------------------------
  // 3. GRADUACJA TOKENOW, KTORE DOMKNELY KRZYWA
  // ---------------------------------------------------------------------
  // Krzywa domknieta przez tlum zostaje w stanie Locked, dopoki ktos nie wywola
  // `graduate()`. Na produkcji zrobi to bot dla nagrody; tutaj robi to admin,
  // zeby przebieg konczyl sie ZYWA PULA, a nie tokenem czekajacym w polowie
  // drogi. Wywolanie jest bezuprawnieniowe, wiec kto je wysle, nie ma znaczenia.
  for (const token of tokens) {
    const state = Number((await pad.launchOf(token))[1]);
    if (state !== 2) continue;
    try {
      const receipt = await (await pad.graduate(token)).wait();
      console.log(`graduacja ${token}: blok ${receipt?.blockNumber}, gaz ${receipt?.gasUsed}`);
    } catch (error) {
      console.log(`graduacja ${token} nie przeszla:`, String(error).slice(0, 120));
    }
  }

  // ---------------------------------------------------------------------
  // 4. PODSUMOWANIE - stan krzywych i rozklad posiadaczy
  // ---------------------------------------------------------------------
  console.log("");
  for (const token of tokens) {
    const launch = await pad.launchOf(token);
    const erc = await ethers.getContractAt("LaunchToken", token);
    const symbol = await erc.symbol();
    let holders = 0;
    for (const wallet of wallets) {
      if (((await erc.balanceOf(wallet.address)) as bigint) > 0n) holders += 1;
    }
    console.log(
      symbol.padEnd(10),
      `rezerwa ${Number(ethers.formatEther(launch[2])).toFixed(3)} ${unit}`,
      `| stan ${["None", "Curve", "Locked", "Graduated"][Number(launch[1])]}`,
      `| portfeli z pozycja ${holders}/${wallets.length}`
    );
  }
  console.log("");
  console.log(`RAZEM: ${buys} kupien, ${sells} sprzedazy, ${buys + sells} transakcji handlowych.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

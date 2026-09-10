import { ethers, network } from "hardhat";
import { getAddress } from "ethers";

/**
 * ZASIEWA HISTORIE CEN - kilka kolejnych submitPrice w odstepach >60s, zeby
 * sparkline na /derivatives/<rynek> mial z czego rysowac wykres (potrzebuje
 * >=2 punktow, sensownie wyglada dopiero od kilku).
 *
 * Kazde zgloszenie idzie od PUBLISHERA/TWORCY FEEDU, nie dowolnego adresu -
 * domyslnie wiec z ADMIN_PRIVATE_KEY, tego samego portfela, ktory zalozyl
 * ARC-USD. Zero USDC nie przechodzi z rak do rak w tym skrypcie -
 * submitPrice tylko zapisuje liczbe, kosztuje sam gaz.
 *
 * UZYCIE
 *   CONFIRM=tak npx cross-env TS_NODE_PROJECT=./hardhat.tsconfig.json \
 *     hardhat run scripts/seed-price-history.ts --network arcTestnet
 *
 * Zmienne srodowiskowe:
 *   MARKET     adres rynku (domyslnie ARC-USD)
 *   STEPS      ile zgloszen, domyslnie 6 (razem z cena startowa = 7 punktow)
 *   MOVE_PCT   maksymalny ruch na krok w %, domyslnie 3 (limit kontraktu 10)
 *   CONFIRM    musi byc "tak" na sieci innej niz lokalna
 *
 * Caly przebieg zajmuje okolo (STEPS-1) * 65 sekund - skrypt sam czeka
 * miedzy krokami, nie trzeba nic odpalac recznie w petli.
 */
async function main() {
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const isLocal = network.name === "hardhat" || network.name === "localhost";

  if (!isLocal && process.env.CONFIRM !== "tak") {
    throw new Error(
      "To wysyla kilka prawdziwych transakcji (submitPrice, bez USDC - sam gaz) w odstepach >60s.\n" +
        "Powtorz z CONFIRM=tak, jesli na pewno o to chodzi."
    );
  }

  const marketAddress = getAddress(process.env.MARKET ?? "0xfe9a2f71373A4C137c60d7990cBDcc92774C0F3d");
  const steps = Number(process.env.STEPS ?? "6");
  const movePct = Number(process.env.MOVE_PCT ?? "3");

  const market = await ethers.getContractAt("DerivativeMarket", marketAddress);
  const oracleAddress = getAddress(await market.ORACLE());
  const oracle = await ethers.getContractAt("PriceOracleRegistry", oracleAddress);
  const marketId: bigint = await market.ORACLE_MARKET_ID();

  console.log("siec    ", `${network.name} (chainId ${chainId})`);
  console.log("rynek   ", marketAddress);
  console.log("krokow  ", steps, `(max ${movePct}% ruchu na krok, min. 61s odstepu)`);
  console.log("");

  const meta = await oracle.getMarket(marketId);
  let price: bigint = meta[3];
  console.log("cena startowa", `$${ethers.formatEther(price)}`);

  for (let i = 1; i <= steps; i++) {
    // Losowy krok w [-movePct, +movePct] (nigdy dokladnie 0 - zeby bylo
    // widac ruch na wykresie zamiast plaskiej kreski).
    let pct = (Math.random() * 2 - 1) * movePct;
    if (pct === 0) pct = movePct / 4;
    const factor = 1 + pct / 100;
    const next = (price * BigInt(Math.round(factor * 1_000_000))) / 1_000_000n;
    price = next > 0n ? next : price;

    await (
      await oracle.submitPrice(marketId, price, BigInt(Math.floor(Date.now() / 1000)))
    ).wait();
    console.log(`krok ${i}/${steps}  $${ethers.formatEther(price)}`);

    if (i < steps) {
      console.log("  czekam 65s (kontrakt wymaga min. 60s miedzy zgloszeniami)...");
      await new Promise((resolve) => setTimeout(resolve, 65_000));
    }
  }

  console.log("");
  console.log(`GOTOWE - sparkline powinien miec teraz ${steps + 1} punktow.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

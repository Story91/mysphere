import { ethers, network } from "hardhat";
import { getAddress } from "ethers";

/**
 * TEST CYKLU ZYCIA POZYCJI - otworz, przeczytaj, zamknij.
 *
 * Male wywazenie celowo: 20 USDC depozytu, 2x dzwigni = 40 USD notionalu,
 * daleko od limitu OI $200 swiezego rynku na probacji (bond 100 USDC * 2).
 *
 * Trzy kroki, kazdy osobna transakcja:
 *   1. approve USDC dla rynku (jesli trzeba) + openPosition
 *   2. odczyt getPosition / unrealizedPnl / liquidationPrice / marginRatioBps
 *   3. closePosition
 *
 * UZYCIE
 *   CONFIRM=tak npx cross-env TS_NODE_PROJECT=./hardhat.tsconfig.json \
 *     hardhat run scripts/test-derivative-market-lifecycle.ts --network arcTestnet
 *
 * Zmienne srodowiskowe:
 *   MARKET     adres rynku (domyslnie ten z pierwszego przykladowego ARC-USD)
 *   MARGIN     depozyt w USDC, domyslnie "20"
 *   LEVERAGE   dzwignia calkowita, domyslnie "2"
 *   SIDE       "long" albo "short", domyslnie "long"
 *   CLOSE      "nie" zeby zostawic pozycje otwarta zamiast ja zamykac
 *   CONFIRM    musi byc "tak" na sieci innej niz lokalna
 */
async function main() {
  const [signer] = await ethers.getSigners();
  const trader = getAddress(signer.address);
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const isLocal = network.name === "hardhat" || network.name === "localhost";

  if (!isLocal && process.env.CONFIRM !== "tak") {
    throw new Error(
      "To wysyla prawdziwe transakcje (depozyt marginu, ew. zamkniecie pozycji).\n" +
        "Powtorz z CONFIRM=tak, jesli na pewno o to chodzi."
    );
  }

  const marketAddress = getAddress(
    process.env.MARKET ?? "0xfe9a2f71373A4C137c60d7990cBDcc92774C0F3d"
  );
  const isLong = (process.env.SIDE ?? "long").toLowerCase() !== "short";
  const marginUsdc = ethers.parseUnits(process.env.MARGIN ?? "20", 6);
  const leverage = Number(process.env.LEVERAGE ?? "2");
  const shouldClose = (process.env.CLOSE ?? "tak").toLowerCase() !== "nie";

  const market = await ethers.getContractAt("DerivativeMarket", marketAddress);
  const usdcAddress = getAddress(await market.USDC());
  const usdc = await ethers.getContractAt("IERC20", usdcAddress);

  console.log("siec       ", `${network.name} (chainId ${chainId})`);
  console.log("trader     ", trader);
  console.log("rynek      ", marketAddress);
  console.log("kierunek   ", isLong ? "long" : "short");
  console.log("margin     ", ethers.formatUnits(marginUsdc, 6), "USDC");
  console.log("dzwignia   ", `${leverage}x`);
  console.log("");

  const allowance: bigint = await usdc.allowance(trader, marketAddress);
  if (allowance < marginUsdc) {
    console.log("zatwierdzam USDC dla rynku...");
    await (await usdc.approve(marketAddress, marginUsdc)).wait();
  }

  console.log("otwieram pozycje...");
  await (await market.openPosition(isLong, marginUsdc, leverage)).wait();

  const pos = await market.getPosition(trader);
  const pnl: bigint = await market.unrealizedPnl(trader);
  const liqPrice: bigint = await market.liquidationPrice(trader);
  const ratioBps: bigint = await market.marginRatioBps(trader);

  console.log("");
  console.log("POZYCJA OTWARTA");
  console.log("  rozmiar (WAD)    ", ethers.formatEther(pos.size));
  console.log("  margin (WAD)     ", ethers.formatEther(pos.margin));
  console.log("  notional (WAD)   ", ethers.formatEther(pos.openNotional));
  console.log("  cena wejscia     ", `$${ethers.formatEther(pos.entryPrice)}`);
  console.log("  PnL (WAD)        ", ethers.formatEther(pnl));
  console.log("  cena likwidacji  ", liqPrice === 0n ? "nieosiagalna" : `$${ethers.formatEther(liqPrice)}`);
  console.log("  margin ratio     ", `${Number(ratioBps) / 100}%`);

  if (!shouldClose) {
    console.log("");
    console.log("CLOSE=nie - pozycja zostaje otwarta.");
    return;
  }

  console.log("");
  console.log("zamykam pozycje...");
  const closeTx = await market.closePosition();
  const receipt = await closeTx.wait();

  console.log("");
  console.log("GOTOWE");
  console.log(JSON.stringify({ market: marketAddress, trader, side: isLong ? "long" : "short", tx: receipt?.hash }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

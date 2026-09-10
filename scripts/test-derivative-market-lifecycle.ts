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
 *
 * TRADER_MNEMONIC (w .env.local) - jesli ustawiona, transakcje podpisuje TEN
 * portfel zamiast domyslnego konta hardhata (ADMIN_PRIVATE_KEY). Wazne przy
 * handlu na wlasnym rynku: tworca feedu moze otworzyc na nim najwyzej 2%
 * limitu OI (CREATOR_OI_CAP_BPS w DerivativeMarket.sol - ochrona przed
 * manipulacja wlasna cena), wiec ten sam portfel co przy
 * create-sample-derivative-market.ts czesto w ogole nie przejdzie.
 * Portfel z TRADER_MNEMONIC potrzebuje wlasnego zasilenia w USDC i gaz.
 */
async function main() {
  const provider = ethers.provider;
  const trader = process.env.TRADER_MNEMONIC
    ? ethers.Wallet.fromPhrase(process.env.TRADER_MNEMONIC).connect(provider)
    : (await ethers.getSigners())[0];
  const traderAddress = getAddress(trader.address);
  const chainId = Number((await provider.getNetwork()).chainId);
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

  const market = (await ethers.getContractAt("DerivativeMarket", marketAddress)).connect(trader);
  const usdcAddress = getAddress(await market.USDC());
  const usdc = (await ethers.getContractAt("IERC20", usdcAddress)).connect(trader);
  const oracleAddress = getAddress(await market.ORACLE());
  const oracle = (await ethers.getContractAt("PriceOracleRegistry", oracleAddress)).connect(trader);
  const oracleMarketId: bigint = await market.ORACLE_MARKET_ID();

  console.log("siec       ", `${network.name} (chainId ${chainId})`);
  console.log("trader     ", traderAddress);
  console.log("rynek      ", marketAddress);
  console.log("kierunek   ", isLong ? "long" : "short");
  console.log("margin     ", ethers.formatUnits(marginUsdc, 6), "USDC");
  console.log("dzwignia   ", `${leverage}x`);
  console.log("");

  // `openPosition` wymaga swiezej ceny (ORACLE.isActive) - MAX_PRICE_AGE to
  // 1h, wiec feed bez zadnego submitPrice od rejestracji po godzinie
  // przestaje byc "aktywny". Odswiezamy TA SAMA cena (0% odchylenia,
  // zawsze przechodzi limit 10%), zeby transakcja ponizej nie wywalila sie
  // na OracleInactive().
  const isActive: boolean = await oracle.isActive(oracleMarketId);
  if (!isActive) {
    const meta = await oracle.getMarket(oracleMarketId);
    const lastPrice: bigint = meta[3];
    console.log(`feed nieaktywny (starszy niz 1h) - odswiezam cena ${ethers.formatEther(lastPrice)} USD...`);
    await (
      await oracle.submitPrice(oracleMarketId, lastPrice, BigInt(Math.floor(Date.now() / 1000)))
    ).wait();
  }

  const allowance: bigint = await usdc.allowance(traderAddress, marketAddress);
  if (allowance < marginUsdc) {
    console.log("zatwierdzam USDC dla rynku...");
    await (await usdc.approve(marketAddress, marginUsdc)).wait();
  }

  console.log("otwieram pozycje...");
  await (await market.openPosition(isLong, marginUsdc, leverage)).wait();

  const pos = await market.getPosition(traderAddress);
  const pnl: bigint = await market.unrealizedPnl(traderAddress);
  const liqPrice: bigint = await market.liquidationPrice(traderAddress);
  const ratioBps: bigint = await market.marginRatioBps(traderAddress);

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
  console.log(JSON.stringify({ market: marketAddress, trader: traderAddress, side: isLong ? "long" : "short", tx: receipt?.hash }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

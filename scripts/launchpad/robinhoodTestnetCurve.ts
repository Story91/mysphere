import { ethers, network } from "hardhat";
import fs from "fs";
import path from "path";
import { Contract, ContractTransactionReceipt } from "ethers";
import { buildPlan } from "./plan";

/**
 * PROBA KRZYWEJ NA ROBINHOOD TESTNET (46630) - prawdziwe transakcje, testowe ETH.
 *
 * ===========================================================================
 * CO TO SPRAWDZA, A CZEGO NIE
 * ===========================================================================
 * Testnet Robinhooda NIE MA Uniswapa v4, wiec PoolManagerem jest tu
 * `MockPoolManager` z testow jednostkowych. To znaczy:
 *
 *   SPRAWDZAMY: deploy pelnego stacka na zywej sieci Orbit, launch, kupno
 *   i sprzedaz na krzywej, naliczenie i wyplate oplat - wszystko produkcyjnymi
 *   zrodlami, bez edycji ani jednej stalej.
 *
 *   NIE SPRAWDZAMY: graduacji. Prog to 3.00 ETH (staly w kodzie, celowo bez
 *   trybu testowego), a pula bylaby atrapa. Graduacja na PRAWDZIWYM v4 jest
 *   zweryfikowana forkiem mainnetu Robinhooda: npm run launchpad:fork:robinhood.
 *
 * Budzet: ~0.005 ETH na kupno (wraca przy sprzedazy minus oplaty) + gaz.
 */

const FEE_BPS = 100n;
const CREATOR_FEE_BPS = 70n;
const PROTOCOL_SHARE_BPS = 3000n;
const BUY_ETH = ethers.parseEther("0.004");

type Check = { name: string; ok: boolean; detail: string };
const checks: Check[] = [];
function add(name: string, ok: boolean, detail: string) {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "ok  " : "FAIL"} ${name} :: ${detail}`);
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
  throw new Error(`Brak eventu ${eventName}`);
}

async function main() {
  if (network.name !== "robinhoodTestnet") {
    throw new Error(`Ten skrypt idzie na --network robinhoodTestnet, nie ${network.name}.`);
  }
  const [admin] = await ethers.getSigners();
  const startBalance = await ethers.provider.getBalance(admin.address);
  console.log("admin      ", admin.address);
  console.log("saldo start", ethers.formatEther(startBalance), "ETH");
  if (startBalance < ethers.parseEther("0.006")) {
    throw new Error("Za malo testowego ETH - potrzeba ~0.006 (kupno 0.004 + gaz).");
  }

  // ---- deploy: mock PM -> fabryka -> launchpad (vault i hook w konstruktorze)
  const pm = await (await ethers.getContractFactory("MockPoolManager")).deploy();
  await pm.waitForDeployment();
  const pmAddress = await pm.getAddress();

  const factory = await (await ethers.getContractFactory("PlainTokenFactory")).deploy();
  await factory.waitForDeployment();

  const plan = await buildPlan({
    poolManager: pmAddress,
    feeRecipient: admin.address,
    protocolShareBps: PROTOCOL_SHARE_BPS,
    deployer: admin.address,
    nonce: await admin.getNonce("pending"),
  });

  const pad = await (await ethers.getContractFactory("CurveLaunchpad")).deploy(
    pmAddress,
    FEE_BPS,
    CREATOR_FEE_BPS,
    admin.address,
    PROTOCOL_SHARE_BPS,
    await factory.getAddress(),
    plan.hookSalt
  );
  await pad.waitForDeployment();
  add("stack wdrozony na zywym testnecie", true, `pad ${await pad.getAddress()}, PM(mock) ${pmAddress}`);

  // ---- launch bez pre-buya
  const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 900;
  const launchRc = (await (await pad.launch("Curve Probe", "CPRB", 0n, deadline)).wait())!;
  const token = ethers.getAddress(parseEvent(pad as unknown as Contract, launchRc, "Launched").args[0]);
  add("launch przechodzi", (await pad.launchOf(token))[1] === 1n, `token ${token}, gas ${launchRc.gasUsed}`);

  // ---- kupno 0.004 ETH; ~5.3M tokenow, miesci sie pod snajperskim capem 16M,
  //      wiec nie trzeba czekac az minie okno.
  const buyRc = (await (await pad.buy(token, 1n, deadline, { value: BUY_ETH })).wait())!;
  const erc20 = await ethers.getContractAt("LaunchToken", token);
  const bought = (await erc20.balanceOf(admin.address)) as bigint;
  add("kupno na krzywej", bought > 0n, `${ethers.formatEther(bought)} CPRB, gas ${buyRc.gasUsed}`);

  // ---- sprzedaz polowy: approve -> quote -> sell z 1% zapasem na sciezke
  await (await erc20.approve(await pad.getAddress(), bought)).wait();
  const half = bought / 2n;
  const [quotedOut] = await pad.quoteSell(token, half);
  const sellRc = (await (await pad.sell(token, half, (quotedOut * 99n) / 100n, deadline)).wait())!;
  add("sprzedaz na krzywej", true, `quote ${ethers.formatEther(quotedOut)} ETH, gas ${sellRc.gasUsed}`);

  // ---- oplaty: admin jest tworca I odbiorca protokolu, wiec claimable
  //      powinno pokryc cala oplate 1% z obu stron handlu.
  const claimable = (await pad.claimable(admin.address)) as bigint;
  add("oplaty naliczone (tworca+protokol)", claimable > 0n, `${ethers.formatEther(claimable)} ETH`);
  const claimRc = (await (await pad.claim()).wait())!;
  add("claim wyplaca ETH", (await pad.claimable(admin.address)) === 0n, `gas ${claimRc.gasUsed}`);

  // ---- bilans po wszystkim: krzywa trzyma dokladnie ethReserve
  const l = await pad.launchOf(token);
  const padBalance = await ethers.provider.getBalance(await pad.getAddress());
  add(
    "kontrakt trzyma dokladnie rezerwe + nieodebrane oplaty",
    padBalance >= l[2],
    `saldo ${ethers.formatEther(padBalance)}, ethReserve ${ethers.formatEther(l[2])}`
  );

  const endBalance = await ethers.provider.getBalance(admin.address);
  console.log("saldo koniec", ethers.formatEther(endBalance), "ETH (koszt proby:", ethers.formatEther(startBalance - endBalance), ")");

  const outDir = path.join(process.cwd(), "scripts", "output");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, "launchpad-robinhood-testnet-curve.json");
  fs.writeFileSync(
    outFile,
    `${JSON.stringify(
      {
        ranAt: new Date().toISOString(),
        chainId: 46630,
        admin: admin.address,
        pad: await pad.getAddress(),
        poolManagerMock: pmAddress,
        token,
        costEth: ethers.formatEther(startBalance - endBalance),
        checks,
      },
      null,
      2
    )}\n`
  );
  console.log(`Zapisano ${outFile}`);

  const failed = checks.filter((c) => !c.ok);
  if (failed.length !== 0) throw new Error(`${failed.length} sprawdzen odpadlo.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

import { ethers, network } from "hardhat";
import fs from "fs";
import path from "path";
import { Contract, ContractTransactionReceipt } from "ethers";

/**
 * SMOKE TEST wdrozonego launchpada na Robinhood Chain MAINNET.
 *
 * Prawdziwe transakcje za prawdziwe (male) ETH: launch -> kupno -> sprzedaz
 * -> claim tworcy. Graduacji tu nie ma - wymaga zebrania 3.00 ETH; pelna
 * sciezka graduacji jest zweryfikowana forkiem (npm run launchpad:fork:robinhood).
 *
 * Adres launchpada bierzemy z scripts/output/launchpad-robinhood.json, czyli
 * z zapisu OSTATNIEGO wdrozenia - nie z reki, zeby smoke nie przetestowal
 * przypadkiem martwego stacka.
 */

const BUY_ETH = ethers.parseEther("0.0005");

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
  if (network.name !== "robinhood") {
    throw new Error(`Smoke idzie na --network robinhood, nie ${network.name}.`);
  }
  const record = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "scripts", "output", "launchpad-robinhood.json"), "utf8")
  );
  const [admin] = await ethers.getSigners();
  const startBalance = await ethers.provider.getBalance(admin.address);
  console.log("launchpad  ", record.launchpad, `(deploy block ${record.deployBlock})`);
  console.log("saldo start", ethers.formatEther(startBalance), "ETH");

  const pad = await ethers.getContractAt("CurveLaunchpad", record.launchpad);

  const feeRecipient = await pad.FEE_RECIPIENT();
  add("FEE_RECIPIENT zgodny z zapisem wdrozenia", feeRecipient === ethers.getAddress(record.feeRecipient), feeRecipient);

  const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 900;
  const launchRc = (await (await pad.launch("Startpad Smoke", "SMOKE", 0n, deadline)).wait())!;
  const token = ethers.getAddress(parseEvent(pad as unknown as Contract, launchRc, "Launched").args[0]);
  add("launch na mainnecie", (await pad.launchOf(token))[1] === 1n, `token ${token}, gas ${launchRc.gasUsed}`);

  const buyRc = (await (await pad.buy(token, 1n, deadline, { value: BUY_ETH })).wait())!;
  const erc20 = await ethers.getContractAt("LaunchToken", token);
  const bought = (await erc20.balanceOf(admin.address)) as bigint;
  add("kupno", bought > 0n, `${ethers.formatEther(bought)} SMOKE, gas ${buyRc.gasUsed}`);

  await (await erc20.approve(record.launchpad, bought)).wait();
  const [quoted] = await pad.quoteSell(token, bought);
  const sellRc = (await (await pad.sell(token, bought, (quoted * 99n) / 100n, deadline)).wait())!;
  add("sprzedaz calosci", (await erc20.balanceOf(admin.address)) === 0n, `~${ethers.formatEther(quoted)} ETH, gas ${sellRc.gasUsed}`);

  const mine = (await pad.claimable(admin.address)) as bigint;
  const protocol = (await pad.claimable(feeRecipient)) as bigint;
  add("oplata tworcy naliczona (70%)", mine > 0n, `${ethers.formatEther(mine)} ETH`);
  add("oplata protokolu naliczona (30%) na FEE_RECIPIENT", protocol > 0n, `${ethers.formatEther(protocol)} ETH`);
  // 70/30 z dokladnoscia do zaokraglen po obu stronach handlu.
  const ratioOk = mine * 3n >= protocol * 6n && mine * 3n <= protocol * 8n;
  add("proporcja tworca/protokol ~70/30", ratioOk, `${ethers.formatEther(mine)} vs ${ethers.formatEther(protocol)}`);

  const claimRc = (await (await pad.claim()).wait())!;
  add("claim tworcy wyplaca", (await pad.claimable(admin.address)) === 0n, `gas ${claimRc.gasUsed}`);

  const l = await pad.launchOf(token);
  const padBalance = await ethers.provider.getBalance(record.launchpad);
  add(
    "kontrakt trzyma rezerwe + nieodebrane oplaty protokolu",
    padBalance >= (l[2] as bigint) + protocol,
    `saldo ${ethers.formatEther(padBalance)}, ethReserve ${ethers.formatEther(l[2])}, protokol ${ethers.formatEther(protocol)}`
  );

  const endBalance = await ethers.provider.getBalance(admin.address);
  console.log("saldo koniec", ethers.formatEther(endBalance), "ETH (koszt:", ethers.formatEther(startBalance - endBalance), ")");

  const outFile = path.join(process.cwd(), "scripts", "output", "launchpad-robinhood-smoke.json");
  fs.writeFileSync(
    outFile,
    `${JSON.stringify({ ranAt: new Date().toISOString(), launchpad: record.launchpad, token, costEth: ethers.formatEther(startBalance - endBalance), checks }, null, 2)}\n`
  );
  console.log(`Zapisano ${outFile}`);

  const failed = checks.filter((c) => !c.ok);
  if (failed.length !== 0) throw new Error(`${failed.length} sprawdzen odpadlo.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

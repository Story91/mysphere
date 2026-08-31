import { ethers } from "hardhat";

/**
 * Podglad przebiegu na zywo - WYLACZNIE ODCZYT.
 *
 * Nie wysyla ani jednej transakcji i nie potrzebuje klucza. Sluzy do patrzenia,
 * jak kolejne etapy laduja na lancuchu, gdy ktos inny wykonuje `flow:sepolia`:
 *
 *   Launched -> Bought -> CurveLocked -> Graduated -> (oplaty hooka)
 *
 * Po co osobno, skoro front to pokazuje: front pokazuje STAN, a tu widac
 * KOLEJNOSC i dokladne liczby ze zdarzen. Gdy cos odpadnie w polowie, roznica
 * miedzy "nie doszlo do graduacji" a "graduacja przeszla, ale settle odpadl"
 * jest cala diagnoza.
 *
 * Uzycie:
 *   $env:LAUNCHPAD="0x..."; npx hardhat run scripts/launchpad/watchFlow.ts --network base-sepolia
 *
 * Opcjonalnie `WATCH_FROM_BLOCK` (domyslnie 500 blokow wstecz) i
 * `WATCH_SECONDS` (domyslnie 240).
 */

const LAUNCHPAD_ABI = [
  "event Launched(address indexed token,address indexed creator,bytes32 indexed launchId,string name,string symbol,uint256 totalSupply,uint256 curveSupply,uint256 tMin,uint256 rVirt,uint16 feeBps,uint16 creatorFeeBps,uint40 startedAt)",
  "event Bought(address indexed token,address indexed buyer,uint256 ethIn,uint256 ethNet,uint256 feeEth,uint256 tokensOut,uint256 refund,uint256 ethReserveAfter,uint256 tokenReserveAfter)",
  "event Sold(address indexed token,address indexed seller,uint256 tokensIn,uint256 ethGross,uint256 feeEth,uint256 ethOut,uint256 ethReserveAfter,uint256 tokenReserveAfter)",
  "event CurveLocked(address indexed token,uint256 ethReserve,uint256 tokenReserve)",
  "event Graduated(address indexed token,bytes32 indexed poolId,address indexed caller,uint256 ethToPool,uint256 tokensToPool,uint256 tokensToDead,uint256 gradFee,uint160 sqrtPriceX96)",
];

function eth(value: bigint) {
  return `${ethers.formatEther(value)} ETH`;
}

async function main() {
  const address = process.env.LAUNCHPAD;
  if (!address) throw new Error("LAUNCHPAD jest wymagane.");

  const seconds = Number(process.env.WATCH_SECONDS ?? "240");
  const latest = await ethers.provider.getBlockNumber();
  let from = Number(process.env.WATCH_FROM_BLOCK ?? Math.max(0, latest - 500));

  const pad = new ethers.Contract(address, LAUNCHPAD_ABI, ethers.provider);
  console.log(`podglad ${address} od bloku ${from}, przez ${seconds} s (tylko odczyt)`);

  const deadline = Date.now() + seconds * 1000;
  const seen = new Set<string>();

  while (Date.now() < deadline) {
    const head = await ethers.provider.getBlockNumber();
    if (head >= from) {
      // Publiczny RPC Base Sepolia odrzuca szersze zakresy niz ~2000 blokow.
      const to = Math.min(head, from + 1_900);
      const logs = await ethers.provider.getLogs({ address, fromBlock: from, toBlock: to }).catch(() => []);

      for (const log of logs) {
        const key = `${log.transactionHash}-${log.index}`;
        if (seen.has(key)) continue;
        seen.add(key);

        let parsed;
        try {
          parsed = pad.interface.parseLog(log);
        } catch {
          continue; // zdarzenie spoza tego ABI - nie zgadujemy
        }
        if (!parsed) continue;

        const a = parsed.args;
        if (parsed.name === "Launched") {
          console.log(`[blok ${log.blockNumber}] START      ${a.symbol}  ${a.token}  fee ${a.feeBps}bps / tworca ${a.creatorFeeBps}bps`);
        } else if (parsed.name === "Bought") {
          console.log(`[blok ${log.blockNumber}] KUPNO      ${eth(a.ethIn)} -> rezerwa ${eth(a.ethReserveAfter)}  (oplata ${eth(a.feeEth)}, zwrot ${eth(a.refund)})`);
        } else if (parsed.name === "Sold") {
          console.log(`[blok ${log.blockNumber}] SPRZEDAZ   ${eth(a.ethOut)} -> rezerwa ${eth(a.ethReserveAfter)}`);
        } else if (parsed.name === "CurveLocked") {
          console.log(`[blok ${log.blockNumber}] ZAMKNIECIE krzywej przy ${eth(a.ethReserve)}`);
        } else if (parsed.name === "Graduated") {
          console.log(`[blok ${log.blockNumber}] AWANS      do puli ${eth(a.ethToPool)}, spalone ${ethers.formatEther(a.tokensToDead)} tokenow, oplata ${eth(a.gradFee)}`);
          console.log(`                     poolId ${a.poolId}`);
        }
      }
      from = to + 1;
    }
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }

  console.log(`koniec podgladu. Zdarzen: ${seen.size}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

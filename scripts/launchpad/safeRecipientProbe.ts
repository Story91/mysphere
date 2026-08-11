import { ethers, network } from "hardhat";

/**
 * Czy Safe dziala jako FEE_RECIPIENT?
 *
 * FEE_RECIPIENT dostaje ETH przez pull: claimFor(FEE_RECIPIENT) -> _sendEth ->
 * `FEE_RECIPIENT.call{value}("")`. Jedyne, co moze pojsc nie tak, to Safe
 * odrzucajacy taki plain-ETH call. Testujemy DOKLADNIE ten mechanizm na forku
 * Base mainnet, na Twoim prawdziwym Safe - za darmo, bez wpisywania go gdzies
 * na stale.
 *
 * Tokeny (claimTokenFor) to zwykly ERC20 `transfer` - nie wola odbiorcy, wiec
 * Safe zawsze je przyjmie; tu sprawdzamy trudniejszy przypadek: natywne ETH.
 */
const SAFE = "0x83E2DE974FC6B866FDb78AEFa5596d58fDc4142F";
const BASE_RPC = process.env.BASE_RPC_URL || "https://mainnet.base.org";

async function main() {
  await network.provider.request({
    method: "hardhat_reset",
    params: [{ forking: { jsonRpcUrl: BASE_RPC } }],
  });
  const provider = ethers.provider;
  const chainId = Number((await provider.getNetwork()).chainId);
  console.log("fork          ", `chainId ${chainId}, RPC ${BASE_RPC}`);
  console.log("Safe          ", SAFE);

  const code = await provider.getCode(SAFE);
  const codeBytes = (code.length - 2) / 2;
  console.log("Safe kod      ", codeBytes, "B", code === "0x" ? "<- BRAK KODU na Base!" : "");
  if (code === "0x") throw new Error("Safe nie ma kodu na Base mainnet - zly adres albo Safe nie wdrozony na Base.");

  const [s] = await ethers.getSigners();
  const amount = ethers.parseEther("0.05");
  const before = await provider.getBalance(SAFE);

  // Dokladnie mechanizm _sendEth: message call z wartoscia i PUSTA calldata.
  // (EOA czy kontrakt jako nadawca - receive() Safe traktuje tak samo.)
  const tx = await s.sendTransaction({ to: SAFE, value: amount });
  await tx.wait();

  const after = await provider.getBalance(SAFE);
  console.log("saldo przed   ", ethers.formatEther(before), "ETH");
  console.log("saldo po      ", ethers.formatEther(after), "ETH");
  console.log("delta         ", ethers.formatEther(after - before), "ETH");

  if (after - before !== amount) {
    throw new Error(`Safe NIE przyjal dokladnej kwoty (delta ${ethers.formatEther(after - before)} != 0.05).`);
  }
  console.log("");
  console.log("OK: Safe przyjmuje plain-ETH call z pusta calldata - dokladnie tak,");
  console.log("jak claimFor -> _sendEth wysyla do FEE_RECIPIENT. Safe nadaje sie");
  console.log("na FEE_RECIPIENT (ETH + tokeny).");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

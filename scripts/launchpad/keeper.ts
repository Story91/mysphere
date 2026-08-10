import { ethers } from "hardhat";

const CHAIN_ID = 84532;
const DEPLOY_BLOCK = 45_277_715;
// Public Base Sepolia RPC odrzuca eth_getLogs powyzej 2000 blokow.
const WINDOW = 1_900;
const LAUNCHPAD_ABI = [
  "function HOOK() view returns (address)",
  "function VAULT() view returns (address)",
  "event Launched(address indexed token,address indexed creator,bytes32 indexed launchId,string name,string symbol,uint256 totalSupply,uint256 curveSupply,uint256 tMin,uint256 rVirt,uint16 feeBps,uint16 creatorFeeBps,uint40 startedAt)",
  "function launchOf(address) view returns (address creator,uint8 state,uint256 ethReserve,uint256 tokenReserve,uint40 startedAt,bytes32 launchId)",
  "function gradFeeOf(address) view returns (uint256 fee,uint256 callerReward)",
  "function graduate(address) external",
];
const HOOK_ABI = [
  "function pendingEth(address) view returns (uint256)",
  "function settle(address) external",
  "function pendingBuybackEth(address) view returns (uint256)",
  "function buybackTokens(address) view returns (uint256)",
  "function executeBuyback(address token,uint256 minTokensOut,uint256 deadline) external returns (uint256)",
];
const VAULT_ABI = ["function harvest(address) external"];

async function main() {
  const network = await ethers.provider.getNetwork();
  if (Number(network.chainId) !== CHAIN_ID) throw new Error(`Oczekiwalem Base Sepolia (${CHAIN_ID}), dostalem ${network.chainId}.`);
  const launchpadAddress = process.env.LAUNCHPAD;
  if (!launchpadAddress) throw new Error("LAUNCHPAD jest wymagane.");

  const pad = new ethers.Contract(launchpadAddress, LAUNCHPAD_ABI, ethers.provider);
  const hookAddress = await pad.getFunction("HOOK")().catch(() => null);
  if (!hookAddress) throw new Error("Nie odczytalem HOOK() z launchpada.");
  const hook = new ethers.Contract(hookAddress, HOOK_ABI, ethers.provider);
  const vaultAddress = await pad.getFunction("VAULT")();
  const vault = new ethers.Contract(vaultAddress, VAULT_ABI, ethers.provider);
  const latest = await ethers.provider.getBlockNumber();
  const launchedTopic = pad.interface.getEvent("Launched").topicHash;
  const tokens = new Map<string, { symbol: string; name: string; creator: string }>();
  for (let from = DEPLOY_BLOCK; from <= latest; from += WINDOW) {
    const to = Math.min(latest, from + WINDOW - 1);
    const logs = await ethers.provider.getLogs({ address: launchpadAddress, topics: [launchedTopic], fromBlock: from, toBlock: to });
    for (const log of logs) {
      const parsed = pad.interface.parseLog(log);
      if (parsed) tokens.set(parsed.args.token, { symbol: parsed.args.symbol, name: parsed.args.name, creator: parsed.args.creator });
    }
  }

  const [signer] = await ethers.getSigners();
  const execute = process.env.KEEPER_CONFIRM === "tak";
  const report: Array<Record<string, string | number | boolean>> = [];
  for (const [token, meta] of tokens) {
    const state = await pad.launchOf(token);
    const row: Record<string, string | number | boolean> = { token, symbol: meta.symbol, state: Number(state.state), reserveEth: ethers.formatEther(state.ethReserve), execute };
    if (Number(state.state) === 2) {
      const reward = await pad.gradFeeOf(token);
      row.callerRewardEth = ethers.formatEther(reward.callerReward);
      if (execute) {
        const tx = await pad.connect(signer).graduate(token);
        await tx.wait();
        row.graduateTx = tx.hash;
      }
    }
    if (Number(state.state) === 3) {
      const pendingEth = await hook.pendingEth(token);
      row.pendingHookEth = ethers.formatEther(pendingEth);
      if (execute && pendingEth > 0n) {
        const tx = await hook.connect(signer).settle(token);
        await tx.wait();
        row.settleTx = tx.hash;
      }
      // AUTO-BUYBACK. Odczyt jest zawsze; wykonanie - nigdy samo z siebie.
      //
      // `executeBuyback` robi prawdziwa wymiane ETH -> token w puli v4, wiec
      // jest podatna na kanapke dokladnie tak, jak kazda inna. Bez wyceny po
      // stronie skryptu jedyne, co keeper moglby tu podac, to `minTokensOut`
      // rowne jedynce - czyli zgoda na dowolna cene. Dlatego kwote minimalna
      // musi podac czlowiek przez `KEEPER_BUYBACK_MIN_TOKENS` (w calych
      // tokenach), a bez niej keeper tylko RAPORTUJE zalegly buyback.
      try {
        const pendingBuyback = await hook.pendingBuybackEth(token);
        row.pendingBuybackEth = ethers.formatEther(pendingBuyback);
        row.boughtBackTokens = ethers.formatEther(await hook.buybackTokens(token));
        const minTokensRaw = process.env.KEEPER_BUYBACK_MIN_TOKENS;
        if (execute && pendingBuyback > 0n) {
          if (!minTokensRaw) {
            row.buybackSkipped = "brak KEEPER_BUYBACK_MIN_TOKENS - nie wysylam wymiany bez granicy ceny";
          } else {
            const deadline = Math.floor(Date.now() / 1000) + 600;
            const tx = await hook
              .connect(signer)
              .executeBuyback(token, ethers.parseEther(minTokensRaw), deadline);
            await tx.wait();
            row.buybackTx = tx.hash;
          }
        }
      } catch (error) {
        // Starsze wdrozenie hooka nie ma tych selektorow. To nie jest blad
        // keepera i nie moze przerwac reszty przebiegu.
        row.buybackUnsupported = error instanceof Error ? error.message.split("\n")[0] : String(error);
      }
      if (execute) {
        try {
          const tx = await vault.connect(signer).harvest(token);
          await tx.wait();
          row.harvestTx = tx.hash;
        } catch (error) {
          row.harvestError = error instanceof Error ? error.message.split("\n")[0] : String(error);
        }
      }
    }
    report.push(row);
  }
  console.log(JSON.stringify({ network: "base-sepolia", launchpad: launchpadAddress, latestBlock: latest, execute, tokens: report }, null, 2));
  if (!execute) console.log("Dry-run: ustaw KEEPER_CONFIRM=tak dopiero po sprawdzeniu raportu.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

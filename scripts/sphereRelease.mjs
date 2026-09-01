// Przepycha dev-buy SPHERE z escrow do vestingu - releaseToken() jest
// bezuprawnieniowy, kierunek TOKEN_TARGET zaszyty w kontrakcie na zawsze.
// Uzycie: node scripts/sphereRelease.mjs
import { ethers } from "ethers";
import { readFileSync } from "node:fs";

const ESCROW = "0xe984986f4F1E067f697b548D5fe942813d03Da37";
const TOKEN = "0xB200000000000000000000BA5eDb84c678432476";
const VESTING = "0xB5dE95224F2bEDee2e7Ca7170F5B6a02641255AD";

function validKey(v) {
  if (!v) return null;
  const hex = v.trim().replace(/^0x/i, "");
  return /^[0-9a-fA-F]{64}$/.test(hex) ? "0x" + hex : null;
}
function keyFromEnvLocal() {
  try {
    const txt = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    const grab = (n) => { const m = txt.match(new RegExp("^" + n + "=(.*)$", "m")); return m ? m[1].trim().replace(/^["']|["']$/g, "") : null; };
    return grab("ADMIN_PRIVATE_KEY") || grab("PRIVATE_KEY");
  } catch { return null; }
}
const pk = validKey(process.env.ADMIN_PRIVATE_KEY) || validKey(process.env.PRIVATE_KEY) || validKey(keyFromEnvLocal());
if (!pk) { console.error("Brak klucza."); process.exit(1); }

const p = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL ?? "https://mainnet.base.org", 8453, { staticNetwork: true });
const w = new ethers.Wallet(pk, p);
const esc = new ethers.Contract(ESCROW, ["function releaseToken(address token)"], w);
const tok = new ethers.Contract(TOKEN, ["function balanceOf(address) view returns (uint256)"], p);

console.log("escrow ma:", ethers.formatEther(await tok.balanceOf(ESCROW)), "SPHERE");
const tx = await esc.releaseToken(ethers.ZeroAddress);
console.log("tx:", tx.hash);
await tx.wait();
console.log("vesting ma teraz:", ethers.formatEther(await tok.balanceOf(VESTING)), "SPHERE");
console.log("escrow ma teraz:", ethers.formatEther(await tok.balanceOf(ESCROW)), "SPHERE");

import { keccak256, recoverAddress, Signature } from "ethers";
import fs from "fs";
import path from "path";

/**
 * ZBIERANIE ZESTAWU PODPISUJACYCH HERMESA - dla wlasnego odbiornika Pytha.
 *
 * Po upgrade z 26.08.2026 Hermes podpisuje aktualizacje "guardian set 1":
 * kilka kluczy, z ktorych kazda aktualizacja niesie 3 podpisy. Kontrakt
 * Pytha na Arc testnet tego zestawu nie zna, wiec stawiamy wlasny odbiornik
 * (contracts/derivatives/PythReceiver.sol) i musimy mu podac PELNA liste
 * kluczy z indeksami. Jedna aktualizacja pokazuje 3 z nich - ten skrypt
 * pobiera wiele aktualizacji z roznych chwil i sklada mape indeks -> adres
 * przez ecrecover z podpisu nad podwojnym keccakiem ciala VAA.
 *
 * Wynik: deployments/pythSigners.json (+ dwa fixture'y do testow w
 * test/fixtures/pyth-*.json). Wymaga PYTH_API_KEY w srodowisku
 * (hardhat laduje .env.local; poza nim: `npx dotenv -e .env.local`).
 */

const HERMES = process.env.HERMES_URL || "https://hermes.pyth.network";
const KEY = process.env.PYTH_API_KEY;
const IDS: Record<string, string> = {
  "BTC/USD": "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
  "AAPL/USD": "0x49f6b65cb1de6b10eaf75e7c03ca029c306d0357e91b5311b175084a5ad55688",
  "ETH/USD": "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
};

type Vaa = { guardianSet: number; signers: Record<number, string>; emitterChain: number; emitter: string };

function parseVaaFromUpdate(hex: string): Vaa {
  const b = Buffer.from(hex.replace(/^0x/, ""), "hex");
  if (b.readUInt32BE(0) !== 0x504e4155) throw new Error("brak magic PNAU");
  let o = 6;
  const trailing = b[o++];
  o += trailing;
  const updateType = b[o++];
  if (updateType !== 0) throw new Error(`nieznany update type ${updateType}`);
  const vaaLen = b.readUInt16BE(o);
  o += 2;
  const vaa = b.subarray(o, o + vaaLen);
  const guardianSet = vaa.readUInt32BE(1);
  const n = vaa[5];
  let p = 6;
  const sigs: { idx: number; r: string; s: string; v: number }[] = [];
  for (let i = 0; i < n; i++) {
    sigs.push({
      idx: vaa[p],
      r: "0x" + vaa.subarray(p + 1, p + 33).toString("hex"),
      s: "0x" + vaa.subarray(p + 33, p + 65).toString("hex"),
      v: vaa[p + 65] + 27,
    });
    p += 66;
  }
  const body = vaa.subarray(p);
  const digest = keccak256(keccak256(body));
  const signers: Record<number, string> = {};
  for (const s of sigs) signers[s.idx] = recoverAddress(digest, Signature.from({ r: s.r, s: s.s, v: s.v }));
  return { guardianSet, signers, emitterChain: body.readUInt16BE(8), emitter: "0x" + body.subarray(10, 42).toString("hex") };
}

async function fetchUpdate(ids: string[], at?: number) {
  const params = ids.map((id) => `ids[]=${id}`).join("&") + "&encoding=hex&parsed=true";
  const url = at ? `${HERMES}/v2/updates/price/${at}?${params}` : `${HERMES}/v2/updates/price/latest?${params}`;
  const res = await fetch(url, { headers: KEY ? { Authorization: `Bearer ${KEY}` } : {} });
  if (!res.ok) throw new Error(`Hermes ${res.status} ${(await res.text()).slice(0, 80)}`);
  return (await res.json()) as { binary: { data: string[] }; parsed: unknown[] };
}

async function main() {
  if (!KEY) throw new Error("PYTH_API_KEY jest wymagane.");
  const signers: Record<number, Set<string>> = {};
  const emitters = new Set<string>();
  let guardianSet: number | null = null;
  const now = Math.floor(Date.now() / 1000);
  const rounds = Number(process.env.ROUNDS || 40);
  for (let i = 0; i < rounds; i++) {
    // Rozne chwile = rozne VAA = rozne trojki podpisujacych.
    const at = now - 30 - i * 97;
    try {
      const j = await fetchUpdate([IDS["BTC/USD"]], at);
      const v = parseVaaFromUpdate(j.binary.data[0]);
      guardianSet = v.guardianSet;
      emitters.add(`${v.emitterChain}:${v.emitter}`);
      for (const [idx, addr] of Object.entries(v.signers)) (signers[Number(idx)] ??= new Set()).add(addr);
      process.stdout.write(`\r${i + 1}/${rounds} indeksy: ${Object.keys(signers).sort().join(",")}   `);
    } catch (e) {
      process.stdout.write(`\r${i + 1}/${rounds} blad: ${(e as Error).message.slice(0, 60)}   `);
    }
    // 10 zapytan / 10 s na IP.
    await new Promise((r) => setTimeout(r, 1100));
  }
  console.log("");
  const out: Record<string, unknown> = { guardianSet, collectedAt: new Date().toISOString(), emitters: [...emitters], guardians: {} as Record<number, string> };
  for (const [idx, set] of Object.entries(signers)) {
    if (set.size !== 1) throw new Error(`indeks ${idx} ma ${set.size} rozne adresy: ${[...set].join(", ")}`);
    (out.guardians as Record<number, string>)[Number(idx)] = [...set][0];
  }
  const file = path.join(__dirname, "..", "..", "deployments", "pythSigners.json");
  fs.writeFileSync(file, JSON.stringify(out, null, 2) + "\n");
  console.log(JSON.stringify(out, null, 2));

  // Fixture'y do testow: aktualne aktualizacje BTC i AAPL z rozpakowana cena.
  const fixDir = path.join(__dirname, "..", "..", "test", "fixtures");
  fs.mkdirSync(fixDir, { recursive: true });
  for (const [name, id] of Object.entries(IDS)) {
    const j = await fetchUpdate([id]);
    const slug = name.split("/")[0].toLowerCase();
    fs.writeFileSync(path.join(fixDir, `pyth-${slug}.json`), JSON.stringify({ symbol: name, id, binary: j.binary.data[0], parsed: j.parsed[0] }, null, 2) + "\n");
    await new Promise((r) => setTimeout(r, 1100));
  }
  console.log(`fixture'y zapisane w ${fixDir}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

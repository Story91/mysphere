import { JsonRpcProvider, Wallet, Contract, formatUnits } from "ethers";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

/**
 * ODBIOR USDC NA ARC - druga polowa mostu CCTP, gdy pierwsza poszla osobno.
 *
 * `bridge-usdc-to-arc.ts` czeka na attestation 10 minut. Tryb standardowy
 * CCTP (finalityThreshold 2000) czeka na finalnosc Base na Ethereum, a to
 * zwykle 13-20 minut - wiec pierwszy bieg 15.09.2026 skonczyl sie na
 * `pending_confirmations`. Spalone USDC NIE przepada: attestation nie
 * wygasa, a odebrac moze ktokolwiek (destinationCaller = 0).
 *
 * Ten skrypt bierze hash spalenia na Base, pobiera message + attestation
 * z Iris i wola `receiveMessage` na Arc. Wolanie kosztuje gaz w USDC na
 * Arc - przy PIERWSZYM odbiorze portfel ma tam 0, wiec... nie zaplaci.
 * Dlatego jest tez tryb FAST w moscie (finalityThreshold 1000, oplata
 * 0,325 bps): Circle sam mintuje po stronie Arc bez naszej transakcji?
 * NIE - w CCTP v2 odbior zawsze wymaga receiveMessage na docelowej sieci.
 * Rozwiazanie na pierwszy raz: ten skrypt probuje odebrac z naszego
 * portfela; gdy zabraknie gazu, mowi to wprost i podaje gotowe dane, zeby
 * odbior zrobil KTOKOLWIEK z gazem na Arc (np. przez explorer) na nasza
 * korzysc - mint idzie na mintRecipient z wiadomosci, nie do wolajacego.
 *
 * UZYCIE
 *   BURN_TX=0x... npx cross-env TS_NODE_PROJECT=./hardhat.tsconfig.json \
 *     ts-node scripts/arc/receive-usdc-on-arc.ts
 * albo: npm run arc:receive  (z BURN_TX w srodowisku)
 *
 * Zmienne: BURN_TX (wymagane), ARC_RPC (domyslnie rpc.arc-scan.org),
 * ARC_MESSAGE_TRANSMITTER (kanoniczny 0x81D40F21...), ADMIN_PRIVATE_KEY (.env.local)
 */

const IRIS = "https://iris-api.circle.com";
const BASE_DOMAIN = 6;
const ARC_RPC = process.env.ARC_RPC || "https://rpc.arc-scan.org";
const ARC_MESSAGE_TRANSMITTER =
  process.env.ARC_MESSAGE_TRANSMITTER || "0x81D40F21F12A8F0E3252Bccb954D722d4c464B64";

async function withRetry<T>(fn: () => Promise<T>, tries = 12): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw last;
}

async function main() {
  const burnTx = process.env.BURN_TX;
  if (!burnTx || !/^0x[0-9a-fA-F]{64}$/.test(burnTx)) throw new Error("BURN_TX musi byc hashem transakcji spalenia na Base.");
  const key = process.env.ADMIN_PRIVATE_KEY;
  if (!key) throw new Error("ADMIN_PRIVATE_KEY (w .env.local) jest wymagane.");

  console.log("pytam Iris o attestation...");
  let att: { status?: string; message?: string; attestation?: string } | null = null;
  for (let i = 0; i < 90; i++) {
    const res = await fetch(`${IRIS}/v2/messages/${BASE_DOMAIN}?transactionHash=${burnTx}`);
    if (res.ok) {
      const json = (await res.json()) as { messages?: typeof att[] };
      att = json.messages?.[0] ?? null;
      if (att?.status === "complete" && att.message && att.attestation) break;
    }
    process.stdout.write(`\r  proba ${i + 1}/90, status: ${att?.status ?? "brak"}   `);
    await new Promise((r) => setTimeout(r, 20_000));
  }
  console.log("");
  if (!att?.message || !att.attestation) throw new Error("Attestation nadal niegotowe po 30 min. Sprobuj pozniej - nic nie przepada.");
  console.log("attestation gotowe.");

  const arc = new JsonRpcProvider(ARC_RPC, { chainId: 5042, name: "arc" }, { staticNetwork: true });
  const code = await withRetry(() => arc.getCode(ARC_MESSAGE_TRANSMITTER));
  if (code === "0x") throw new Error(`Brak kodu pod ${ARC_MESSAGE_TRANSMITTER} na Arc.`);

  const signer = new Wallet(key, arc);
  const gas = await withRetry(() => arc.getBalance(signer.address));
  console.log(`portfel ${signer.address} ma na Arc ${formatUnits(gas, 18)} USDC gazu`);
  const mt = new Contract(ARC_MESSAGE_TRANSMITTER, ["function receiveMessage(bytes message,bytes attestation)"], signer);

  if (gas === 0n) {
    console.log("\nZERO GAZU NA ARC - nie odbierzemy sami. Dane do odbioru przez dowolny adres z gazem:");
    console.log(`  kontrakt:    ${ARC_MESSAGE_TRANSMITTER}`);
    console.log(`  funkcja:     receiveMessage(bytes,bytes)`);
    console.log(`  message:     ${att.message}`);
    console.log(`  attestation: ${att.attestation}`);
    return;
  }

  console.log("odbieram na Arc (receiveMessage)...");
  const tx = await withRetry(() => mt.receiveMessage(att!.message, att!.attestation));
  console.log(`wyslane: ${tx.hash}`);
  await withRetry(() => tx.wait());
  console.log(`GOTOWE. saldo Arc: ${formatUnits(await withRetry(() => arc.getBalance(signer.address)), 18)} USDC`);
}

main().catch((e) => {
  console.error(e.shortMessage || e.message || e);
  process.exitCode = 1;
});

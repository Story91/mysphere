import { ethers } from "hardhat";
import { JsonRpcProvider, Wallet, Contract, formatUnits, parseUnits, getAddress, zeroPadValue } from "ethers";

/**
 * MOST USDC Z BASE NA ARC MAINNET PRZEZ CCTP V2 (Circle).
 *
 * ===========================================================================
 * PO CO TO ISTNIEJE
 * ===========================================================================
 * Gaz na Arc to USDC. Portfel bez USDC na Arc nie wysle tam ANI JEDNEJ
 * transakcji - wiec dopoki nie przemostkujemy, launchpad nie ma jak powstac.
 * CCTP pali USDC na Base i mintuje je na Arc; to nie jest wrapper ani
 * custodialny vault, tylko natywny mechanizm Circle.
 *
 * ===========================================================================
 * CO SPRAWDZONE 15.09.2026, DZIEN PRZED STARTEM MAINNETU
 * ===========================================================================
 * Iris API Circle (mainnetowe `iris-api.circle.com`) ZNA juz trase 6 -> 26,
 * czyli Base -> Arc:
 *     finalityThreshold 1000 (fast):     minimumFee 0.325 bps
 *     finalityThreshold 2000 (standard): minimumFee 0
 * Czyli domena Arc to 26 takze na mainnecie, a standardowy transfer jest
 * DARMOWY - placi sie tylko gaz po obu stronach.
 *
 * POPRAWKA Z TEGO SAMEGO DNIA: kontrakty CCTP na Arc mainnet STOJA - tylko
 * nie pod adresami testnetowymi (0x8FE6B9..., 0xE737e5...), ktorych szukalem
 * najpierw, lecz pod kanonicznymi adresami CCTP v2 mainnet, tymi samymi co
 * na Base i kazdej innej sieci (Circle stawia je przez CREATE2):
 *     TokenMessengerV2     0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d
 *     MessageTransmitterV2 0x81D40F21F12A8F0E3252Bccb954D722d4c464B64
 *     TokenMinterV2        0xfd78EE919681417d192449715b2594ab58f5D002
 * Sprawdzone odczytem: `localDomain()` na Arc oddaje 26, a
 * `remoteTokenMessengers(6)` wskazuje Base. Trasa dziala w obie strony.
 * Skrypt i tak sprawdza `getCode` przed odbiorem - gdyby Circle cos przestawil.
 *
 * RPC Arc: `rpc.arc-scan.org` dziala, ale co drugie zapytanie oddaje 503 -
 * stad ponawianie w `withRetry`.
 *
 * ===========================================================================
 * TRZY KROKI, KAZDY ODWRACALNY DO MOMENTU SPALENIA
 * ===========================================================================
 *   1. approve USDC dla TokenMessengerV2 na Base
 *   2. depositForBurn - USDC znika z Base
 *   3. attestation z Iris + receiveMessage na Arc - USDC pojawia sie na Arc
 *
 * Krok 3 moze zawolac KTOKOLWIEK (destinationCaller = 0), wiec gdy zabraknie
 * nam gazu na Arc, transakcje moze doslac ktos inny na nasza korzysc.
 * Attestation nie wygasa - raz spalone USDC da sie odebrac pozniej.
 *
 * UZYCIE
 *   AMOUNT=10 CONFIRM=tak npx cross-env TS_NODE_PROJECT=./hardhat.tsconfig.json \
 *     hardhat run scripts/arc/bridge-usdc-to-arc.ts --network base
 *
 * Zmienne:
 *   AMOUNT      ile USDC przerzucic, domyslnie "10"
 *   ARC_RPC     RPC Arc mainnet (bez niego skrypt zrobi kroki 1-2 i zatrzyma
 *               sie przed 3, podajac gotowy message i attestation do odebrania)
 *   RECIPIENT   adres na Arc, domyslnie ten sam co nadawca
 *   FAST        "tak" = finalityThreshold 1000 (szybciej, oplata 0,325 bps)
 *   CONFIRM     musi byc "tak" - to prawdziwe pieniadze
 */

const BASE_DOMAIN = 6;
const ARC_DOMAIN = 26;
const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const BASE_TOKEN_MESSENGER = "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d";
const IRIS = "https://iris-api.circle.com";

/** MessageTransmitterV2 na Arc mainnet - kanoniczny adres CCTP v2 (patrz naglowek). */
const ARC_MESSAGE_TRANSMITTER =
  process.env.ARC_MESSAGE_TRANSMITTER || "0x81D40F21F12A8F0E3252Bccb954D722d4c464B64";
const ARC_RPC_DEFAULT = "https://rpc.arc-scan.org";

/** RPC Arc bywa niestabilne (503 co drugie zapytanie) - ponawiamy, nie poddajemy sie. */
async function withRetry<T>(fn: () => Promise<T>, tries = 10): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 2500));
    }
  }
  throw last;
}

const ERC20 = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
];
const TOKEN_MESSENGER = [
  "function depositForBurn(uint256 amount,uint32 destinationDomain,bytes32 mintRecipient,address burnToken,bytes32 destinationCaller,uint256 maxFee,uint32 minFinalityThreshold)",
];
const MESSAGE_TRANSMITTER = ["function receiveMessage(bytes message,bytes attestation)"];

type Attestation = { status: string; message?: string; attestation?: string; eventNonce?: string };

async function fetchAttestation(txHash: string): Promise<Attestation | null> {
  const url = `${IRIS}/v2/messages/${BASE_DOMAIN}?transactionHash=${txHash}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const json = (await res.json()) as { messages?: Attestation[] };
  return json.messages?.[0] ?? null;
}

async function main() {
  const [signer] = await ethers.getSigners();
  const me = getAddress(signer.address);
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  if (chainId !== 8453) throw new Error(`Ten skrypt startuje z BASE (8453), dostalem ${chainId}.`);
  if (process.env.CONFIRM !== "tak") {
    throw new Error("To pali prawdziwe USDC na Base. Powtorz z CONFIRM=tak.");
  }

  const amount = parseUnits(process.env.AMOUNT || "10", 6);
  const recipient = getAddress(process.env.RECIPIENT || me);
  const fast = (process.env.FAST || "nie").toLowerCase() === "tak";
  const finality = fast ? 1000 : 2000;

  const usdc = new Contract(BASE_USDC, ERC20, signer);
  const balance: bigint = await usdc.balanceOf(me);
  console.log(`nadawca      ${me}`);
  console.log(`saldo Base   ${formatUnits(balance, 6)} USDC`);
  console.log(`przerzucam   ${formatUnits(amount, 6)} USDC -> ${recipient} na Arc (domena ${ARC_DOMAIN})`);
  console.log(`tryb         ${fast ? "fast (oplata 0,325 bps)" : "standard (bez oplaty)"}`);
  if (balance < amount) throw new Error(`Za malo USDC na Base: masz ${formatUnits(balance, 6)}.`);

  // maxFee: dla standardu 0, dla fast bierzemy z zapasem 1 bps kwoty.
  const maxFee = fast ? amount / 10_000n : 0n;

  const allowance: bigint = await usdc.allowance(me, BASE_TOKEN_MESSENGER);
  if (allowance < amount) {
    console.log("zatwierdzam USDC dla TokenMessengerV2...");
    await (await usdc.approve(BASE_TOKEN_MESSENGER, amount)).wait();
  }

  console.log("pale USDC na Base (depositForBurn)...");
  const tm = new Contract(BASE_TOKEN_MESSENGER, TOKEN_MESSENGER, signer);
  const burnTx = await tm.depositForBurn(
    amount,
    ARC_DOMAIN,
    zeroPadValue(recipient, 32),
    BASE_USDC,
    // destinationCaller = 0: odebrac moze KTOKOLWIEK, takze nie my.
    zeroPadValue("0x0000000000000000000000000000000000000000", 32),
    maxFee,
    finality,
  );
  const burnReceipt = await burnTx.wait();
  console.log(`spalone, tx: ${burnTx.hash} (blok ${burnReceipt?.blockNumber})`);

  console.log("czekam na attestation z Circle...");
  let att: Attestation | null = null;
  for (let i = 0; i < 60; i++) {
    att = await fetchAttestation(burnTx.hash);
    if (att?.status === "complete" && att.message && att.attestation) break;
    process.stdout.write(`\r  proba ${i + 1}/60, status: ${att?.status ?? "brak"}   `);
    await new Promise((r) => setTimeout(r, 10_000));
  }
  console.log("");
  if (!att?.message || !att.attestation) {
    console.log("Attestation jeszcze nie gotowe. NIC NIE PRZEPADLO - sprobuj pozniej:");
    console.log(`  curl "${IRIS}/v2/messages/${BASE_DOMAIN}?transactionHash=${burnTx.hash}"`);
    return;
  }
  console.log("attestation gotowe.");

  const arcRpc = process.env.ARC_RPC || ARC_RPC_DEFAULT;
  const arc = new JsonRpcProvider(arcRpc);
  const code = await withRetry(() => arc.getCode(ARC_MESSAGE_TRANSMITTER));
  if (code === "0x") {
    throw new Error(
      `Pod ${ARC_MESSAGE_TRANSMITTER} na Arc NIE MA KODU. USDC jest spalone i czeka - ` +
        `znajdz wlasciwy MessageTransmitterV2 i podaj go w ARC_MESSAGE_TRANSMITTER.`,
    );
  }
  const key = process.env.ADMIN_PRIVATE_KEY;
  if (!key) throw new Error("ADMIN_PRIVATE_KEY jest wymagane do odbioru na Arc.");
  const arcSigner = new Wallet(key, arc);
  const mt = new Contract(ARC_MESSAGE_TRANSMITTER, MESSAGE_TRANSMITTER, arcSigner);
  console.log("odbieram na Arc (receiveMessage)...");
  const recv = await withRetry(() => mt.receiveMessage(att!.message, att!.attestation));
  await withRetry(() => recv.wait());
  console.log(`GOTOWE. tx na Arc: ${recv.hash}`);
  console.log(`saldo Arc: ${formatUnits(await withRetry(() => arc.getBalance(recipient)), 18)} USDC`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

import { config as loadEnv } from "dotenv";
import { put } from "@vercel/blob";
import { JsonRpcProvider, Contract, getAddress } from "ethers";

/**
 * PRZENOSI LOGO Z LANCUCHA DO BLOBA, ZEBY POKAZALO SIE NA TABLICY.
 *
 * ===========================================================================
 * PO CO, SKORO LOGO JUZ JEST W `metadataURI`
 * ===========================================================================
 * Bo tablica go stamtad NIE CZYTA. Sciezki sa dwie i to nie jest przypadek:
 *
 *   - strona tokena, karta udostepniania i `/api/launchpad/card` wolaja
 *     `pickTokenImage`, ktore zaglada do `metadataURI` z lancucha;
 *   - siatka na tablicy bierze logo wylacznie z `/api/startpad/logos`, a ten
 *     route listuje kubelek Vercel Blob `startpad/logos/{chainId}/{token}`.
 *
 * Powod jest praktyczny: tablica pokazuje kilkadziesiat tokenow naraz i nie
 * moze na kazde wejscie robic kilkudziesieciu odczytow `metadataURI` plus tylu
 * samo pobran cudzych obrazkow. Jedno `list()` na kubelku zalatwia calosc.
 *
 * Skutek uboczny: token wystartowany z logo NA LANCUCHU, ale bez przejscia
 * przez nasz formularz, ma logo wszedzie POZA siatka. Dla tokenow zasianych
 * skryptem trzeba wiec dosypac je do Bloba recznie - i to robi ten plik.
 *
 * Uzycie:
 *   LOGO_TOKENS=0x..,0x.. npx cross-env TS_NODE_PROJECT=./hardhat.tsconfig.json \
 *     ts-node scripts/launchpad/arcLogosToBlob.ts
 */

loadEnv({ path: ".env.local" });

const CHAIN_ID = 5042002;
const RPC = "https://rpc.blockdaemon.testnet.arc.io";
const LAUNCHPAD = "0xe984986f4F1E067f697b548D5fe942813d03Da37";
const JSON_PREFIX = "data:application/json;base64,";

async function main() {
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
  if (!blobToken) throw new Error("BLOB_READ_WRITE_TOKEN jest wymagany (patrz .env.local).");

  const tokens = (process.env.LOGO_TOKENS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map(getAddress);
  if (tokens.length === 0) throw new Error("LOGO_TOKENS jest wymagane (adresy po przecinku).");

  const provider = new JsonRpcProvider(RPC);
  const pad = new Contract(LAUNCHPAD, ["function metadataURI(address) view returns (string)"], provider);

  for (const token of tokens) {
    const uri: string = await pad.metadataURI(token);
    if (!uri.startsWith(JSON_PREFIX)) {
      console.log(`${token}  pominiety - metadataURI nie jest naszym JSON-em`);
      continue;
    }

    const parsed = JSON.parse(Buffer.from(uri.slice(JSON_PREFIX.length), "base64").toString("utf8")) as {
      image?: string;
    };
    const image = parsed.image;
    // Tylko https. `ipfs://` nie ma czego wgrac bez bramy, a `data:` juz jest
    // obrazkiem i nie przechodzi przez ten kanal.
    if (!image || !image.startsWith("https://")) {
      console.log(`${token}  pominiety - brak obrazka https w metadanych`);
      continue;
    }

    const response = await fetch(image);
    if (!response.ok) {
      console.log(`${token}  pominiety - ${image} oddaje ${response.status}`);
      continue;
    }
    const contentType = response.headers.get("content-type") ?? "image/png";
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length === 0 || bytes.length > 2_000_000) {
      console.log(`${token}  pominiety - obrazek ma ${bytes.length} B`);
      continue;
    }

    // Ta sama sciezka i te same opcje, co w `/api/launchpad/token` - inaczej
    // powstalby drugi, rownolegly uklad nazw i tablica widzialaby tylko jeden.
    const blob = await put(`startpad/logos/${CHAIN_ID}/${token.toLowerCase()}`, bytes, {
      access: "public",
      token: blobToken,
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType,
    });
    console.log(`${token}  ${bytes.length} B  ->  ${blob.url}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

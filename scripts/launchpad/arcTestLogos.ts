import { config as loadEnv } from "dotenv";
import { put } from "@vercel/blob";
import { getAddress } from "ethers";
import sharp from "sharp";

/**
 * LOGO TOKENOW TESTOWYCH - RYSOWANE, NIE POZYCZANE.
 *
 * ===========================================================================
 * DLACZEGO NIE CUDZE ZNAKI
 * ===========================================================================
 * Pierwszy zasiew Arc dostal logotypy Base, Ethereum, Kaito, Campa i MySphere.
 * Dzialalo, ale znaczylo cos, czego nie chcemy znaczyc: token o nazwie
 * "Arc Seed 3" ze znakiem Base wyglada na projekt Base. Na testnecie to tylko
 * balagan, ale ten sam skrypt kiedys pojdzie gdzie indziej.
 *
 * Te logo sa WYGENEROWANE: dwie litery symbolu na kolowym gradiencie, kolor
 * wyprowadzony z adresu tokena. Nikogo nie udaja, kazde jest inne i kazde
 * wyglada tak samo w siatce, na stronie tokena i na karcie udostepniania.
 *
 * SVG idzie przez sharpa do PNG, bo SVG to XML ze skryptami - `resolveMediaUrl`
 * przepuszcza w kanale data: wylacznie raster i ma racje.
 *
 * Uzycie:
 *   LOGO_TOKENS=0x..,0x.. npx ts-node scripts/launchpad/arcTestLogos.ts
 */

loadEnv({ path: ".env.local" });

const CHAIN_ID = 5042002;

/**
 * Paleta. Kolor wybiera sie z ADRESU, wiec jest staly przez cale zycie tokena
 * i nie wymaga zapisu nigdzie - ta sama zasada, co `tokenAccent` w interfejsie.
 */
const PALETTE = [
  ["#6D5BD0", "#2A1E5C"],
  ["#2E8B74", "#10352C"],
  ["#C4703A", "#40200E"],
  ["#3B6FD4", "#132747"],
  ["#C2456F", "#3F1224"],
  ["#3E8E9C", "#122E33"],
  ["#8A6BC1", "#2B1B44"],
  ["#5F8F3E", "#1E2E13"],
];

function paletteFor(address: string): [string, string] {
  let hash = 0;
  for (const char of address.toLowerCase()) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return PALETTE[hash % PALETTE.length] as [string, string];
}

/**
 * Dwa znaki na kole. Trzy juz sie nie mieszcza czytelnie w 256 px.
 *
 * Domysl to dwa PIERWSZE znaki symbolu, bo tak dziala kazdy monogram. Etykiete
 * mozna jednak podac wprost i jest po temu konkretny powod: szesc tokenow
 * zasianych na Arc ma symbole ARCWOW8, ARCWQI8, ARCWRXG... czyli wspolny
 * czteroznakowy przedrostek. Kazde kolko wyszloby "AR" i rozniloby je wylacznie
 * tlo - a logo, ktore nie odroznia, nie jest logo.
 */
function labelFor(symbol: string, override?: string): string {
  const source = (override ?? symbol).replace(/[^A-Za-z0-9]/g, "");
  return source.slice(0, 2).toUpperCase() || "??";
}

function svgFor(label: string, address: string): string {
  const [light, dark] = paletteFor(address);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <defs>
    <radialGradient id="g" cx="35%" cy="28%" r="85%">
      <stop offset="0%" stop-color="${light}"/>
      <stop offset="100%" stop-color="${dark}"/>
    </radialGradient>
  </defs>
  <circle cx="128" cy="128" r="128" fill="url(#g)"/>
  <circle cx="128" cy="128" r="118" fill="none" stroke="#ffffff" stroke-opacity="0.16" stroke-width="3"/>
  <text x="128" y="128" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="104"
        font-weight="700" text-anchor="middle" dominant-baseline="central"
        letter-spacing="2">${label}</text>
</svg>`;
}

async function main() {
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
  if (!blobToken) throw new Error("BLOB_READ_WRITE_TOKEN jest wymagany (patrz .env.local).");

  // Trojki `adres:SYMBOL[:ETYKIETA]`. Symbol rysujemy na obrazku, wiec odczyt
  // z lancucha kosztowalby jedno polaczenie RPC po nic.
  const entries = (process.env.LOGO_TOKENS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((row) => {
      const [address, symbol, label] = row.split(":");
      if (!symbol) throw new Error(`LOGO_TOKENS oczekuje par adres:SYMBOL, dostalem "${row}".`);
      return { address: getAddress(address), symbol, label: labelFor(symbol, label) };
    });
  if (entries.length === 0) {
    throw new Error("LOGO_TOKENS jest wymagane (adres:SYMBOL[:ETYKIETA] po przecinku).");
  }

  const labels = new Set(entries.map((entry) => entry.label));
  if (labels.size < entries.length) {
    console.log(`UWAGA: ${entries.length} tokenow, a tylko ${labels.size} roznych etykiet.`);
    console.log("Kolka beda sie roznic samym kolorem. Podaj trzeci czlon: adres:SYMBOL:ETYKIETA.");
  }

  for (const entry of entries) {
    const png = await sharp(Buffer.from(svgFor(entry.label, entry.address))).png().toBuffer();
    const blob = await put(`startpad/logos/${CHAIN_ID}/${entry.address.toLowerCase()}`, png, {
      access: "public",
      token: blobToken,
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "image/png",
    });
    console.log(`${entry.symbol.padEnd(9)} ${entry.label}  ${entry.address}  ${png.length} B  ->  ${blob.url}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

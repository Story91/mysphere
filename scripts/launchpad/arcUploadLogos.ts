import { config as loadEnv } from "dotenv";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { list, put } from "@vercel/blob";
import { createPublicClient, http, getAddress, parseAbi } from "viem";
import sharp from "sharp";
import { arcTestnet } from "../../app/startpad/arcChain";

/**
 * PRAWDZIWE LOGO DLA TOKENOW TESTOWYCH NA ARC.
 *
 * ===========================================================================
 * PO CO OSOBNY SKRYPT OBOK `arcTestLogos.ts`
 * ===========================================================================
 * Tamten RYSUJE monogramy: dwie litery na kolowym gradiencie. To bylo dobre,
 * dopoki nie bylo nic lepszego - ale kolko z napisem "AR" nie jest logo, tylko
 * zaslepka, a tablica z szescioma zaslepkami wyglada jak niedokonczona.
 *
 * Ten skrypt wgrywa GOTOWE obrazki z katalogu. Nie generuje niczego i nie
 * zgaduje: bierze pliki po kolei i przypisuje je tokenom posortowanym po
 * adresie, wiec kolejne uruchomienie da ten sam wynik.
 *
 * ===========================================================================
 * DLACZEGO PRZEZ SHARPA, SKORO TO JUZ PNG
 * ===========================================================================
 * Bo wejscie ma po dwa megabajty na plik. Karta udostepniania osadza logo jako
 * `data:`, tablica pobiera je przy kazdym wejsciu, a bok, w ktorym to logo
 * kiedykolwiek widac, to 128 px. Dwa megabajty na kolko o boku 44 px to koszt
 * bez zadnego zysku - `sharp` sprowadza je do 256 px i kilkunastu kilobajtow.
 *
 * Uzycie:
 *   npx ts-node --project hardhat.tsconfig.json scripts/launchpad/arcUploadLogos.ts
 *   LOGO_DIR="public/Nowy folder" LOGO_TOKENS=0x..,0x.. ... (opcjonalne nadpisania)
 */

loadEnv({ path: ".env.local" });

const CHAIN_ID = arcTestnet.id;
const DEFAULT_DIR = "public/Nowy folder";
/** Bok logo na karcie to 104-128 px; 256 daje zapas na gestych ekranach. */
const SIZE = 256;

const erc20 = parseAbi(["function symbol() view returns (string)"]);

async function main() {
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
  if (!blobToken) throw new Error("BLOB_READ_WRITE_TOKEN jest wymagany (patrz .env.local).");

  const dir = process.env.LOGO_DIR ?? DEFAULT_DIR;
  const files = readdirSync(dir)
    .filter((name) => /\.(png|jpe?g|webp)$/i.test(name))
    .sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
  if (files.length === 0) throw new Error(`Brak obrazkow w "${dir}".`);

  // Adresy: albo podane wprost, albo TE, KTORE JUZ MAJA logo w Blobie - czyli
  // dokladnie tokeny zasiane na Arc. Czytanie ich z lancucha wymagaloby skanu
  // zdarzen, a ta lista jest tym samym zbiorem i kosztuje jedno zapytanie.
  const explicit = (process.env.LOGO_TOKENS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  let addresses: string[];
  if (explicit.length > 0) {
    addresses = explicit.map((value) => getAddress(value));
  } else {
    const { blobs } = await list({ prefix: `startpad/logos/${CHAIN_ID}/`, token: blobToken, limit: 100 });
    addresses = blobs
      .map((blob) => blob.pathname.split("/").pop() ?? "")
      .filter((name) => /^0x[0-9a-f]{40}$/.test(name))
      .sort()
      .map((value) => getAddress(value));
  }
  if (addresses.length === 0) throw new Error("Nie znalazlem tokenow Arc do opisania.");

  const client = createPublicClient({ chain: arcTestnet, transport: http() });
  const pairs = Math.min(files.length, addresses.length);
  if (files.length !== addresses.length) {
    console.log(`Obrazkow ${files.length}, tokenow ${addresses.length} - wgrywam ${pairs} par.`);
  }

  for (let index = 0; index < pairs; index += 1) {
    const address = addresses[index];
    const file = files[index];

    // Symbol tylko po to, zeby przypisanie bylo widoczne w logu. Nieudany
    // odczyt nie moze zatrzymac wgrywania - obrazek i tak trafia pod adres.
    const symbol = await client
      .readContract({ address: address as `0x${string}`, abi: erc20, functionName: "symbol" })
      .catch(() => "?");

    const png = await sharp(readFileSync(join(dir, file)))
      .resize(SIZE, SIZE, { fit: "cover", position: "centre" })
      .png({ quality: 90 })
      .toBuffer();

    const blob = await put(`startpad/logos/${CHAIN_ID}/${address.toLowerCase()}`, png, {
      access: "public",
      token: blobToken,
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "image/png",
    });

    const kb = (png.length / 1024).toFixed(0);
    console.log(`${file.padEnd(8)} -> ${String(symbol).padEnd(10)} ${address}  ${kb} kB  ${blob.url}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

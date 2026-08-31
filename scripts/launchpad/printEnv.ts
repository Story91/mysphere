import { appendFileSync, readFileSync } from "fs";
import { join } from "path";

/**
 * Wypisuje gotowe linie `.env.local` z wyniku ostatniego wdrozenia.
 *
 * ===========================================================================
 * PO CO TO ISTNIEJE
 * ===========================================================================
 * Po kazdym wdrozeniu trzeba przeniesc do frontu CZTERY wartosci: trzy adresy
 * i BLOK WDROZENIA. Ta czwarta jest najlatwiejsza do przeoczenia, a jej
 * pominiecie nie daje zadnego bledu - tablica po prostu skanuje zdarzenia od
 * bloku starego wdrozenia i pokazuje pustke albo cudze tokeny. Objaw wyglada
 * jak "nikt jeszcze nic nie wystartowal", a nie jak pomylka konfiguracji.
 *
 * Uzycie:
 *   npm run launchpad:env               wypisuje na ekran
 *   npm run launchpad:env -- --write    dopisuje do .env.local
 *
 * ===========================================================================
 * DLACZEGO JEST `--write`, A NIE PRZEKIEROWANIE POWLOKI
 * ===========================================================================
 * `npm run launchpad:env >> .env.local` w PowerShellu dopisuje w UTF-16, a
 * plik jest w UTF-8. Powstaje plik o DWOCH kodowaniach: poczatek czytelny,
 * koniec jako bajty z zerami. dotenv nie zglasza przy tym bledu - po prostu
 * nie widzi dopisanych zmiennych, wiec front dalej gada ze STARYM wdrozeniem
 * i wyglada to jak blad kontraktu, a nie konfiguracji. Zdarzylo sie naprawde.
 *
 * Do tego `npm run` wypisuje na stdout swoj naglowek (`> basebook@0.1.0 ...`),
 * ktory przy przekierowaniu tez ladowal do pliku.
 *
 * Zapis po stronie Node omija obie pulapki: kodowanie jest jawne, a do pliku
 * trafiaja WYLACZNIE linie konfiguracji.
 */

const OUTPUT = join(process.cwd(), "scripts", "output", "launchpad-base-sepolia.json");

type Deployment = {
  launchpad?: string;
  vault?: string;
  hook?: string;
  observedBlock?: number;
  deployBlock?: number;
};

function main() {
  let raw: string;
  try {
    raw = readFileSync(OUTPUT, "utf8");
  } catch {
    throw new Error(`Nie znalazlem ${OUTPUT}. Najpierw uruchom launchpad:deploy:sepolia.`);
  }

  const data = JSON.parse(raw) as Deployment;
  const missing = (["launchpad", "vault", "hook"] as const).filter((key) => !data[key]);
  if (missing.length > 0) {
    throw new Error(`W pliku wdrozenia brakuje: ${missing.join(", ")}.`);
  }

  // `deployBlock` jesli jest, inaczej `observedBlock` - to blok, w ktorym
  // kontrakty zostaly odczytane, wiec zdarzen sprzed niego nie ma.
  const block = data.deployBlock ?? data.observedBlock;
  if (block === undefined) {
    throw new Error("W pliku wdrozenia nie ma ani `deployBlock`, ani `observedBlock`.");
  }

  const lines = [
    `NEXT_PUBLIC_LAUNCHPAD_SEPOLIA_ADDRESS=${data.launchpad}`,
    `NEXT_PUBLIC_LIQUIDITY_VAULT_SEPOLIA_ADDRESS=${data.vault}`,
    `NEXT_PUBLIC_LAUNCH_HOOK_SEPOLIA_ADDRESS=${data.hook}`,
    `NEXT_PUBLIC_LAUNCHPAD_DEPLOY_BLOCK=${block}`,
  ];

  if (!process.argv.includes("--write")) {
    for (const line of lines) console.log(line);
    console.log("");
    console.log("Aby dopisac do .env.local: npm run launchpad:env -- --write");
    return;
  }

  const target = join(process.cwd(), ".env.local");
  // Jawne UTF-8. Wiodace przelamanie chroni przed sklejeniem z ostatnia linia,
  // gdy plik nie konczy sie znakiem konca wiersza.
  appendFileSync(target, ["", ...lines, ""].join("\n"), { encoding: "utf8" });
  console.log(`Dopisano ${lines.length} zmiennych do .env.local`);
  console.log("UWAGA: stare wpisy tych samych kluczy zostaly WYZEJ w pliku.");
  console.log("Usun je, zeby nie zgadywac, ktora wartosc wygrywa.");
}

main();

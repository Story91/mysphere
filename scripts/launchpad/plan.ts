import { ethers } from "hardhat";
import { concat, getAddress, getCreateAddress, getCreate2Address, keccak256, toBeHex, zeroPadValue } from "ethers";

/**
 * PLAN WDROZENIA LAUNCHPADA - jedno miejsce, w ktorym policzone sa adresy.
 *
 * ===========================================================================
 * PO CO TEN PLIK ISTNIEJE OSOBNO
 * ===========================================================================
 * Bo kopalnia adresu hooka i skrypt wdrozeniowy musza liczyc DOKLADNIE TO SAMO.
 * Gdy to samo rownanie stoi w dwoch plikach, predzej czy pozniej rozjedzie sie
 * przy pierwszej zmianie konstruktora - a objawi sie to `BadHookAddress` przy
 * wdrozeniu na sieci, gdzie kazda proba kosztuje.
 *
 * ===========================================================================
 * LANCUCH ADRESOW
 * ===========================================================================
 *   wdrazajacy + nonce      -> launchpad   (CREATE, adres NIE zalezy od argumentow)
 *   launchpad  + nonce 1    -> vault       (CREATE, pierwsze `new` w konstruktorze)
 *   vault + salt + initCode -> hook        (CREATE2, to kopiemy)
 *
 * Kluczowa wlasnosc: adres kontraktu tworzonego przez CREATE nie zalezy od
 * argumentow konstruktora. Dlatego salt hooka, ktory JEST argumentem
 * konstruktora launchpada, nie zmienia adresu launchpada ani vaulta - i kolo
 * zaleznosci sie nie zamyka.
 *
 * Konstruktor hooka bierze `(poolManager, feeRecipient, protocolShareBps)`,
 * a te wchodza do kodu tworzacego. Zmiana KTOREJKOLWIEK z tych trzech wartosci
 * uniewaznia wykopany salt.
 */

/** Musi zgadzac sie z `HOOK_ALL_MASK` w `contracts/launchpad/B20LaunchHook.sol`. */
export const HOOK_ALL_MASK = (1n << 14n) - 1n;

/**
 * Musi zgadzac sie z `HOOK_REQUIRED_FLAGS` tamze:
 * BEFORE_INITIALIZE (13) | AFTER_SWAP (6) | AFTER_SWAP_RETURNS_DELTA (2) = 0x2044.
 */
export const HOOK_REQUIRED_FLAGS = (1n << 13n) | (1n << 6n) | (1n << 2n);

/** Po tylu probach bez trafienia cos jest nie tak z zalozeniami, a nie ze szczesciem. */
const MAX_ATTEMPTS = 20_000_000;

/**
 * Adresy Uniswap v4 PoolManager, ktore SPRAWDZILISMY.
 *
 * ===========================================================================
 * DLACZEGO TA MAPA MA JEDEN WPIS, A NIE SZESC
 * ===========================================================================
 * Bo adres, ktorego nikt z nas nie odczytal z lancucha, nie jest wiedza - jest
 * zgadywaniem przepisanym z dokumentacji. Wpisanie tu Sepolii "z pamieci"
 * zrobiloby dokladnie to, przed czym broni `PoolManagerHasNoCode`: dalo
 * wdrozeniu wygladajaca poprawnie wartosc, ktorej nikt juz pozniej nie
 * kwestionuje.
 *
 * Kazda inna siec podaje adres przez `POOL_MANAGER=0x...`, a skrypt i tak
 * sprawdza `eth_getCode` przed wyslaniem czegokolwiek. Gdy adres zostanie
 * potwierdzony transakcja na tej sieci - wtedy, i dopiero wtedy, dopisuje sie
 * go tutaj razem z data i sposobem sprawdzenia.
 *
 * Zrodlo adresow: https://docs.uniswap.org/contracts/v4/deployments
 */
/**
 * Kazdy wpis TU zostal sprawdzony `eth_getCode` na zywej sieci, a nie przepisany
 * z dokumentacji. Wszystkie trzy oddaja 24 009 bajtow - co do bajta tyle samo,
 * czyli to ten sam kontrakt. Zgodnosc rozmiaru jest tania kontrola i wylapuje
 * przepisanie adresu proxy albo zupelnie innego kontraktu.
 *
 * Robinhood testnet (46630) NIE MA wpisu: dokumentacja Uniswapa nie wymienia
 * tam wdrozenia v4. Jesli kiedys bedzie, wpisz go dopiero po `eth_getCode`.
 */
export const KNOWN_POOL_MANAGERS: Record<number, string> = {
  // Base mainnet. 24 009 bajtow kodu, sprawdzone `eth_getCode`.
  8453: "0x498581fF718922c3f8e6A244956aF099B2652b2b",
  // Base Sepolia. 24 009 bajtow, sprawdzone `eth_getCode` 2026-08-10.
  84532: "0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408",
  // Robinhood Chain. 24 009 bajtow, sprawdzone `eth_getCode` 2026-08-10.
  4663: "0x8366a39cc670b4001a1121b8f6a443a643e40951",
  /**
   * Arc testnet (Circle). JEDYNY wpis w tej mapie, ktorego nie postawil
   * Uniswap - na Arc v4 nie ma i nie zostal zapowiedziany. Postawiony przez
   * nas ze zrodel `@uniswap/v4-core` 1.0.2 skryptem `deployPoolManager.ts`.
   *
   * 24 050 bajtow, a nie 24 009 jak trzy wpisy wyzej, i to jest w porzadku:
   * tamte pochodza z wdrozen Uniswapa, ktore kompilowal Foundry z wylaczonym
   * `bytecode_hash`, u nas metadane zostaja. Kod zweryfikowany `eth_getCode`
   * 2026-08-13, blok wdrozenia 56843204.
   *
   * Pomiary sieci i uzasadnienie: docs/LAUNCHPAD-STAN.md, sekcja Arc.
   */
  5042002: "0xd02A166A186bcc5C537FeCD5103E9c1A94Bb49D6",
  /**
   * Arc MAINNET (chainId 5042). W odroznieniu od testnetu tego NIE stawialismy
   * my - byl juz na lancuchu, gdy 11.09.2026 pierwszy raz tam zajrzelismy.
   *
   * Dlaczego mu ufamy: 24 009 bajtow i hash kodu `0xbd38811...` IDENTYCZNY z
   * PoolManagerem na Robinhood Chain pod TYM SAMYM adresem - czyli z tym, na
   * ktorym nasz launchpad juz graduuje tokeny w produkcji. To nie jest "inny
   * v4 o podobnym rozmiarze", tylko ten sam bajtkod. Sprawdzone `eth_getCode`
   * na obu sieciach naraz 12.09.2026; `extsload` odpowiada, wiec singleton
   * dziala. (Wdrozenie Uniswapa na Base ma inny hash - tam metadane sa inne,
   * bo kompilowal je Foundry z wylaczonym `bytecode_hash`.)
   *
   * Skutek praktyczny: na mainnecie NIE powtarzamy `deployPoolManager.ts`.
   */
  5042: "0x8366a39CC670B4001A1121B8F6A443A643e40951",
};

export type PlanInput = {
  poolManager: string;
  feeRecipient: string;
  protocolShareBps: bigint;
  deployer: string;
  nonce: number;
};

export type Plan = PlanInput & {
  launchpad: string;
  vault: string;
  hook: string;
  hookSalt: string;
  initCodeHash: string;
  attempts: number;
};

/**
 * Kod tworzacy hooka razem z argumentami konstruktora.
 *
 * Kolejnosc i typy MUSZA zgadzac sie z `B20LaunchHook.constructor`. Rozjazd
 * daje initCodeHash, ktory nie odpowiada niczemu - salt wykopany pod taki hash
 * wskazuje na adres, pod ktorym nigdy nic nie powstanie, a `LiquidityVault`
 * odbije to jako `BadHookAddress` dopiero przy wdrozeniu.
 */
export async function hookInitCode(poolManager: string, feeRecipient: string, protocolShareBps: bigint) {
  const artifact = await ethers.getContractFactory("B20LaunchHook");
  return concat([
    artifact.bytecode,
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "address", "uint16"],
      [getAddress(poolManager), getAddress(feeRecipient), protocolShareBps]
    ),
  ]);
}

/**
 * Liczy caly lancuch adresow i kopie salt hooka.
 *
 * Trafien jest srednio jedno na 2^14 = 16 384 prob, wiec to sekundy, a nie
 * godziny. Kopanie jest formalnoscia, ale formalnoscia BLOKUJACA: bez salta
 * launchpada nie da sie wdrozyc.
 */
export async function buildPlan(input: PlanInput): Promise<Plan> {
  const launchpad = getCreateAddress({ from: getAddress(input.deployer), nonce: input.nonce });
  // Vault jest PIERWSZYM kontraktem tworzonym przez launchpad. Nonce kontraktu
  // startuje od 1 (EIP-161), a nie od 0 - to jest miejsce, w ktorym najlatwiej
  // sie pomylic i wykopac salt pod adres, ktory nigdy nie powstanie.
  const vault = getCreateAddress({ from: launchpad, nonce: 1 });

  const initCodeHash = keccak256(await hookInitCode(input.poolManager, input.feeRecipient, input.protocolShareBps));

  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const salt = zeroPadValue(toBeHex(i), 32);
    const candidate = getCreate2Address(vault, salt, initCodeHash);
    if ((BigInt(candidate) & HOOK_ALL_MASK) === HOOK_REQUIRED_FLAGS) {
      return { ...input, launchpad, vault, hook: candidate, hookSalt: salt, initCodeHash, attempts: i + 1 };
    }
  }

  throw new Error(
    `Brak trafienia w ${MAX_ATTEMPTS} probach. Przy 1/16384 to jest statystycznie ` +
      `niemozliwe - sprawdz, czy HOOK_REQUIRED_FLAGS w plan.ts zgadza sie z kontraktem.`
  );
}

/**
 * Adres PoolManagera dla tej sieci - z `POOL_MANAGER` albo z mapy sprawdzonych.
 *
 * Rzuca, gdy nie ma ani jednego, ani drugiego. Cisza z domyslnym adresem
 * bylaby tu najgorszym mozliwym zachowaniem: wdrozylaby vault wskazujacy
 * na cudzy kontrakt, nieodwracalnie.
 */
export function resolvePoolManager(chainId: number): { address: string; source: string } {
  const fromEnv = process.env.POOL_MANAGER;
  if (fromEnv) return { address: getAddress(fromEnv), source: "POOL_MANAGER (env)" };

  const known = KNOWN_POOL_MANAGERS[chainId];
  if (known) return { address: getAddress(known), source: `mapa sprawdzonych (chainId ${chainId})` };

  throw new Error(
    `Nie znam adresu PoolManagera dla chainId ${chainId}, a mapa sprawdzonych ma tylko ` +
      `[${Object.keys(KNOWN_POOL_MANAGERS).join(", ")}].\n` +
      `Podaj go jawnie: POOL_MANAGER=0x... npx hardhat run ... --network <siec>\n` +
      `Adres wez z https://docs.uniswap.org/contracts/v4/deployments i sprawdz eth_getCode ZANIM go uzyjesz.`
  );
}

/** Wspolna walidacja wejscia dla obu skryptow - lepiej odpasc tutaj niz po minucie kopania. */
export function readCommonEnv() {
  const feeRecipient = process.env.FEE_RECIPIENT;
  if (!feeRecipient) {
    throw new Error("FEE_RECIPIENT jest wymagany - to adres, ktory bedzie odbieral oplaty protokolu.");
  }
  // 3000 = 70% dla tworcy na puli i w oplatach LP - decyzja z 2026-08-10
  // (spojna z MAX_CREATOR_SHARE_BPS=7000 na krzywej; proporcja jak PONS).
  const protocolShareBps = BigInt(process.env.PROTOCOL_SHARE_BPS ?? "3000");
  // Ten sam sufit, co MAX_PROTOCOL_SHARE_BPS w LiquidityVault.
  if (protocolShareBps > 8000n) {
    throw new Error(`PROTOCOL_SHARE_BPS=${protocolShareBps} przekracza sufit 8000 (podloga 20% dla tworcy).`);
  }
  return { feeRecipient: getAddress(feeRecipient), protocolShareBps };
}

import { encodeAbiParameters, keccak256, type Address, type Hex } from 'viem';

/**
 * Adresowanie tokenow B20 - liczone U NAS, bez pytania sieci.
 *
 * ===========================================================================
 * DLACZEGO TO W OGOLE DA SIE POLICZYC
 * ===========================================================================
 * Fabryka B20 (precompile pod 0xB20f...0000 na kazdej sieci Base) nadaje
 * tokenom adresy DETERMINISTYCZNIE. Wzor zostal wyprowadzony przez porownanie
 * z odpowiedzia `getB20Address` na mainnecie, a nie przepisany z dokumentacji:
 *
 *     adres = 0xb2
 *           + 0x00 * 9          (razem 10 bajtow prefiksu)
 *           + bajt wariantu     (0x00 ASSET, 0x01 STABLECOIN)
 *           + pierwsze 9 bajtow keccak256(abi.encode(sender, salt))
 *
 * Sprawdzone: dla sendera 0xD4885A...030e i salt 0x11*32 lancuch oddaje
 * 0xb200000000000000000000C624349a28e9d73289, a `keccak256(abi.encode(...))`
 * zaczyna sie od c624349a28e9d73289. Warianty `solidityPacked` NIE pasuja -
 * kolejnosc i kodowanie maja tu znaczenie.
 *
 * ===========================================================================
 * CO Z TEGO WYNIKA - I DLACZEGO TO JEST CIEKAWE
 * ===========================================================================
 * Skoro adres zalezy wylacznie od `sender` i `salt`, a `salt` wybiera
 * zakladajacy, to adres tokena mozna WYKOPAC: probowac kolejnych soli, az
 * ogon adresu ulozy sie w slowo. Dziewiec bajtow ogona to 18 znakow hex -
 * miejsca jest az nadto.
 *
 * Cale kopanie dzieje sie w przegladarce i nie kosztuje ani jednego zapytania
 * do sieci. To rzadki przypadek, w ktorym cos efektownego jest jednoczesnie
 * darmowe: liczymy skroty lokalnie, a lancuch dowiaduje sie o wyniku dopiero
 * przy wdrozeniu.
 */

/** Precompile fabryki. Ten sam adres na mainnecie i na Sepolii. */
export const B20_FACTORY: Address = '0xB20f000000000000000000000000000000000000';

export type B20Variant = 'asset' | 'stablecoin';

/** 10 bajtow stalego prefiksu: 0xb2 i dziewiec zer. */
const PREFIX = 'b2' + '00'.repeat(9);

function variantByte(variant: B20Variant): string {
  return variant === 'stablecoin' ? '01' : '00';
}

/**
 * Adres, ktory fabryka nada temu senderowi przy tej soli.
 *
 * Czysta funkcja - zero wywolan sieciowych. Wynik jest w postaci malymi
 * literami; sumy kontrolnej EIP-55 celowo tu nie liczymy, bo do porownan
 * i do kopania potrzebna jest postac kanoniczna, a nie ozdobna.
 */
export function predictB20Address(
  sender: Address,
  salt: Hex,
  variant: B20Variant = 'asset'
): Address {
  const hash = keccak256(
    encodeAbiParameters([{ type: 'address' }, { type: 'bytes32' }], [sender, salt])
  );
  // `slice(2, 20)` to pierwsze 9 bajtow skrotu - patrz naglowek.
  return `0x${PREFIX}${variantByte(variant)}${hash.slice(2, 20)}` as Address;
}

/** Sol z liczby - deterministyczna, zeby dalo sie wznowic kopanie od miejsca przerwania. */
export function saltFromCounter(counter: bigint): Hex {
  return `0x${counter.toString(16).padStart(64, '0')}` as Hex;
}

export type VanityHit = {
  salt: Hex;
  address: Address;
  attempts: number;
};

/**
 * Co da sie ulozyc z ogona adresu.
 *
 * Tylko znaki, ktore istnieja w zapisie szesnastkowym. `o` i `l` NIE istnieja,
 * wiec slowo "cool" jest nieosiagalne - a `0` i `1` wygladaja jak `o` i `l`
 * na tyle, ze warto to czlowiekowi podpowiedziec, zamiast pozwolic mu kopac
 * w nieskonczonosc za czyms, czego nie ma.
 */
export const HEX_ALPHABET = '0123456789abcdef';

export function isMineable(pattern: string): boolean {
  const p = pattern.toLowerCase();
  return p.length > 0 && [...p].every((c) => HEX_ALPHABET.includes(c));
}

/** Podpowiedzi dla znakow, ktorych w hex nie ma. Klucz -> czym zastapic. */
export const HEX_SUBSTITUTES: Record<string, string> = {
  o: '0',
  l: '1',
  i: '1',
  s: '5',
  g: '6',
  t: '7',
  z: '2',
};

/**
 * Ile prob potrzeba SREDNIO na wzorzec danej dlugosci.
 *
 * 16^n, bo kazdy znak hex to jedna z szesnastu mozliwosci. Pokazujemy to
 * czlowiekowi PRZED startem, bo roznica miedzy czterema a osmioma znakami to
 * roznica miedzy sekunda a godzinami - i lepiej, zeby dowiedzial sie tego
 * z liczby niz z czekania.
 */
export function expectedAttempts(pattern: string): number {
  return Math.pow(16, pattern.length);
}

/**
 * Jedna partia kopania.
 *
 * Kopiemy PARTIAMI, a nie w petli bez konca, bo to ma chodzic w przegladarce:
 * petla, ktora nie oddaje sterowania, zawiesza karte. Wolajacy przeplata
 * partie oddaniem sterowania i moze w kazdej chwili przerwac.
 *
 * `prefix` dopasowujemy do POCZATKU dziewieciobajtowego ogona - czyli tuz za
 * bajtem wariantu. To najlepiej widoczne miejsce w adresie po prefiksie B20.
 */
export function mineBatch(
  sender: Address,
  pattern: string,
  variant: B20Variant,
  from: bigint,
  batchSize: number
): { hit: VanityHit | null; nextCounter: bigint } {
  const target = pattern.toLowerCase();
  const head = `0x${PREFIX}${variantByte(variant)}`;
  let counter = from;

  for (let i = 0; i < batchSize; i += 1) {
    const salt = saltFromCounter(counter);
    const address = predictB20Address(sender, salt, variant);
    // Ogon zaczyna sie zaraz za prefiksem i bajtem wariantu.
    if (address.slice(head.length).startsWith(target)) {
      return { hit: { salt, address, attempts: Number(counter - from) + 1 }, nextCounter: counter + 1n };
    }
    counter += 1n;
  }

  return { hit: null, nextCounter: counter };
}

import {
  encodeAbiParameters,
  encodeFunctionData,
  parseAbiParameters,
  type Address,
  type Hex,
} from 'viem';
import { B20_FACTORY } from './addressing';

/**
 * TWORZENIE TOKENA B20 - kodowanie transakcji.
 *
 * ===========================================================================
 * SKAD SIE WZIAL TEN KSZTALT WYWOLANIA - ODCZYTANY, NIE PRZEPISANY
 * ===========================================================================
 * Interfejs z base-std nie zgadza sie z tym, co robi lancuch (ta sama pulapka,
 * co przy zdarzeniu B20Created - podpis z dokumentacji dawal inny topic0 niz
 * realne logi). Dlatego ksztalt wywolania zostal ODCZYTANY Z REALNEJ TRANSAKCJI
 * na mainnecie, a potem POTWIERDZONY trzema niezaleznymi sprawdzeniami:
 *
 *  1. Selektor policzony z nazwy zgadza sie z selektorem realnej transakcji:
 *     keccak("createB20(uint8,bytes32,bytes,bytes[])")[0:4] == 0x62975e6a
 *  2. Ponowne zakodowanie argumentow odczytanych z tamtej transakcji daje
 *     CO DO BAJTU te sama calldata.
 *  3. `eth_call` na fabryce z naszym kodowaniem zwraca adres IDENTYCZNY z tym,
 *     ktory liczy lokalnie `predictB20Address`. Dwie niezalezne sciezki, jeden
 *     wynik - to jest dowod, a nie zbieznosc.
 *
 * ===========================================================================
 * DLACZEGO WOLAMY FABRYKE WPROST, A NIE PRZEZ WLASNY LAUNCHPAD
 * ===========================================================================
 * Bo launchpad nie jest wdrozony na zadnej sieci, a fabryka jest - i dziala
 * dzis, dla kazdego. Ma to jeden skutek uboczny, ktory jest tu ZALETA:
 * `msg.sender` w precompile to PORTFEL UZYTKOWNIKA, a nie posrednik. Adres
 * przewidziany przez `predictB20Address(wallet, salt)` jest wiec adresem, ktory
 * naprawde powstanie - i kopalnia adresow ma sens, zamiast kopac pod adres
 * launchpada, ktorego uzytkownik nigdy nie dostanie.
 *
 * ===========================================================================
 * CZEGO TA TRANSAKCJA NIE ROBI
 * ===========================================================================
 * NIE TWORZY PULI. Powstaje token i nic wiecej - nikt nie moze go kupic ani
 * sprzedac, dopoki ktos nie otworzy puli. Na naszej wlasnej liscie taki token
 * ma stan "no pool", dokladnie jak kazdy inny. Ekran tworzenia mowi to wprost
 * PRZED podpisem, bo obietnica "twoj token bedzie na DexScreener" bylaby
 * klamstwem: indeksery reaguja na powstanie PULI, nie tokena.
 */

/** Wariant ASSET. Wariant STABLECOIN ma inny ksztalt parametrow i tu go nie ma. */
const VARIANT_ASSET = 0;

/**
 * Pierwsze pole struktury parametrow. Zmierzone: `1` przechodzi, `0` i `2`
 * rewertuja. Nie wiemy, co znaczy, i dlatego jest STALA, a nie polem - lepiej
 * przepisac wartosc, ktora dziala, niz udawac, ze rozumiemy pole, ktorego
 * lancuch nam nie nazwal.
 */
const PARAMS_KIND = 1n;

export const B20_DECIMALS = 18;

/** Podaz kazdego tokena zrobionego tutaj. Stala, wiec nie jest polem formularza. */
export const B20_SUPPLY_TOKENS = 1_000_000_000n;
export const B20_SUPPLY_RAW = B20_SUPPLY_TOKENS * 10n ** BigInt(B20_DECIMALS);

const CREATE_ABI = [
  {
    name: 'createB20',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'variant', type: 'uint8' },
      { name: 'salt', type: 'bytes32' },
      { name: 'params', type: 'bytes' },
      { name: 'calls', type: 'bytes[]' },
    ],
    outputs: [{ name: 'token', type: 'address' }],
  },
] as const;

const MINT_ABI = [
  {
    name: 'mint',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
] as const;

/**
 * updateSupplyCap(uint256) - selektor 0xe5a97f07.
 * Nazwa potwierdzona dwa razy: policzona z keccak i odczytana z bazy podpisow
 * openchain, ktora oznacza ja jako pochodzaca ze zweryfikowanego kontraktu.
 */
const CAP_ABI = [
  {
    name: 'updateSupplyCap',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'cap', type: 'uint256' }],
    outputs: [],
  },
] as const;

export type CreatePlan = {
  name: string;
  symbol: string;
  /** Kto zostaje adminem tokena. `null` znaczy NIKT - i wtedy naprawde nikt. */
  admin: Address | null;
  salt: Hex;
  creator: Address;
};

/**
 * Calldata transakcji tworzacej.
 *
 * Kolejnosc wywolan po utworzeniu ma znaczenie i jest przemyslana:
 *   1. mint(creator, 1e27)  - bez tego token istnieje, ale nie ma ani jednej
 *                             sztuki i nikt nie moze nic z nim zrobic.
 *   2. updateSupplyCap(1e27) - sufit rowny podazy. Od tej chwili `mint`
 *                             rewertuje, bo dodruk przekroczylby sufit.
 *
 * Odwrotna kolejnosc tez przechodzi, ale ta gwarantuje `supplyCap == totalSupply`
 * niezaleznie od tego, jaki sufit mial token przed nasza zmiana.
 */
export function encodeCreateCall(plan: CreatePlan): Hex {
  const params = encodeAbiParameters(
    parseAbiParameters('(uint256, string, string, address, uint8)'),
    [
      [
        PARAMS_KIND,
        plan.name,
        plan.symbol,
        // Adres zerowy jako admin przechodzi symulacje. To jest jedyny sposob,
        // zeby zdanie "nikt nie moze tego zmienic" bylo prawdziwe, a nie
        // obietnica - nie ma adresu, ktory moglby cokolwiek zmienic.
        plan.admin ?? '0x0000000000000000000000000000000000000000',
        B20_DECIMALS,
      ],
    ]
  );

  const calls: Hex[] = [
    encodeFunctionData({
      abi: MINT_ABI,
      functionName: 'mint',
      args: [plan.creator, B20_SUPPLY_RAW],
    }),
    encodeFunctionData({
      abi: CAP_ABI,
      functionName: 'updateSupplyCap',
      args: [B20_SUPPLY_RAW],
    }),
  ];

  return encodeFunctionData({
    abi: CREATE_ABI,
    functionName: 'createB20',
    args: [VARIANT_ASSET, plan.salt, params, calls],
  });
}

export const B20_FACTORY_ADDRESS = B20_FACTORY;

/* -------------------------------------------------------------------------- */
/*  WALIDACJA POL                                                              */
/* -------------------------------------------------------------------------- */

export const NAME_MAX = 32;
export const SYMBOL_MAX = 10;

/**
 * Ticker podpowiadany z nazwy.
 *
 * Bierzemy pierwsze litery slow, a gdy slowo jest jedno - jego pierwsze znaki.
 * To NIE jest sztuczna inteligencja i nie udaje jej: to jest skrot, ktory
 * czlowiek i tak zaraz poprawi, i istnieje tylko po to, zeby pole nie bylo puste.
 */
export function suggestSymbol(name: string): string {
  const words = name
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return '';
  if (words.length === 1) return words[0].slice(0, SYMBOL_MAX);
  return words
    .map((w) => w[0])
    .join('')
    .slice(0, SYMBOL_MAX);
}

export function validateName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length === 0) return 'The token needs a name.';
  if (trimmed.length > NAME_MAX) return `The name has to fit in ${NAME_MAX} characters.`;
  return null;
}

export function validateSymbol(symbol: string): string | null {
  const trimmed = symbol.trim();
  if (trimmed.length === 0) return 'The token needs a ticker.';
  if (trimmed.length > SYMBOL_MAX) return `The ticker has to fit in ${SYMBOL_MAX} characters.`;
  if (!/^[A-Za-z0-9]+$/.test(trimmed)) return 'The ticker can only use letters and digits.';
  return null;
}

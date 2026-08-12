/**
 * ASK ESCROW - JEDYNE miejsce w aplikacji, ktore wie o kontrakcie.
 *
 * === PO CO OSOBNY PLIK ===
 * Kontrakt (contracts/AskEscrow.sol) stal wdrozony i zweryfikowany, a grep po
 * "AskEscrow" w app/ znajdowal same komentarze. Zeby to podpiac, potrzebne sa
 * cztery rzeczy, ktore latwo rozsypac po komponentach: adres, ABI, odwzorowanie
 * identyfikatora Firestore na bytes32 i jednostki. Kazda z nich rozsypana po
 * kilku plikach to osobna okazja do rozjazdu z lancuchem, a rozjazd tutaj
 * znaczy pieniadze zablokowane pod kluczem, ktorego nikt juz nie odtworzy.
 *
 * === CZEGO TEN PLIK NIE ROBI ===
 * Nie zna Reacta, nie zna wagmi i nie zna Firestore. Dostaje klienta viem od
 * wolajacego (przegladarka: usePublicClient/useWalletClient, serwer: wlasny
 * createPublicClient) i oddaje surowy wynik. Dzieki temu ta sama logika obsluguje
 * kompozytor, panel rozstrzygania i trase serwerowa sprawdzajaca rozstrzygniecie.
 */

import {
  BaseError,
  ContractFunctionRevertedError,
  encodeAbiParameters,
  formatUnits,
  keccak256,
  parseUnits,
  toBytes,
  type Address,
  type Hash,
} from 'viem';

import deployment8453 from '../../../deployments/askEscrow.8453.json';
import deployment84532 from '../../../deployments/askEscrow.84532.json';

/* ------------------------------------------------------------------ */
/*  WDROZENIA                                                          */
/* ------------------------------------------------------------------ */

export type AskEscrowDeployment = {
  chainId: number;
  /** Adres kontraktu escrow. */
  address: Address;
  /** Token rozliczeniowy TEGO wdrozenia - USDC, 6 miejsc. */
  token: Address;
  /**
   * Odbiorca oplaty ZADEKLAROWANY w pliku wdrozenia. W kontrakcie ta wartosc
   * jest immutable, wiec plik i lancuch nie maja prawa sie rozjechac - i wlasnie
   * dlatego pole tu jest: konsola operatora porownuje je z FEE_RECIPIENT()
   * odczytanym z lancucha. Rozjazd znaczylby, ze plik opisuje INNE wdrozenie.
   */
  feeRecipient: Address;
  feeBps: number;
  /** Hash transakcji wdrozeniowej - link do dowodu, nie do uzytku w kodzie. */
  deployTxHash: string;
};

/**
 * Mapa budowana Z PLIKOW deployments/askEscrow.<chainId>.json, a nie z adresow
 * wpisanych tutaj z palca. Pliki sa artefaktem wdrozenia (scripts/deployAskEscrow.js)
 * i to one sa zrodlem prawdy; przepisanie adresu do kodu robiloby drugie zrodlo,
 * ktore rozjedzie sie przy pierwszym ponownym wdrozeniu.
 */
const DEPLOYMENTS: Record<number, AskEscrowDeployment> = Object.fromEntries(
  [deployment8453, deployment84532].map((raw) => [
    raw.chainId,
    {
      chainId: raw.chainId,
      address: raw.address as Address,
      token: raw.token as Address,
      feeRecipient: raw.feeRecipient as Address,
      feeBps: raw.feeBps,
      deployTxHash: raw.txHash,
    },
  ])
);

/** USDC ma 6 miejsc, nie 18. To jest miejsce, w ktorym najlatwiej pomylic sie o 10^12. */
export const ESCROW_TOKEN_DECIMALS = 6;

/**
 * Oplata pobierana, gdy budzet WRACA do autora (niewykorzystane miejsca albo
 * wygasniecie). Czytana z wdrozenia, bo w kontrakcie jest immutable.
 */
export function escrowFeeBps(chainId: number): number | null {
  return DEPLOYMENTS[chainId]?.feeBps ?? null;
}

/** `null` = na tej sieci nie ma wdrozenia. Wolajacy MUSI to rozroznic. */
export function escrowDeployment(chainId: number | undefined): AskEscrowDeployment | null {
  if (typeof chainId !== 'number') return null;
  return DEPLOYMENTS[chainId] ?? null;
}

export function isEscrowAvailable(chainId: number | undefined): boolean {
  return escrowDeployment(chainId) !== null;
}

/** Sieci, na ktorych escrow w ogole istnieje - do komunikatu dla czlowieka. */
export const ESCROW_CHAIN_IDS: number[] = Object.keys(DEPLOYMENTS).map(Number);

/**
 * Blad rzucany, gdy ktos probuje uzyc escrow na sieci bez wdrozenia.
 *
 * JAWNY BLAD, NIE CICHE `undefined`: gdyby helper zwracal tu `undefined`, kod
 * wywolujacy wyslalby transakcje pod adres zerowy albo - gorzej - zapisal Aska
 * jako 'escrowed', nie blokujac ani centa. Dokument bez zablokowanych srodkow
 * klamie, a to jest dokladnie ten blad, ktory to repo ma udokumentowany.
 */
export class EscrowNotDeployedError extends Error {
  readonly chainId: number | undefined;
  constructor(chainId: number | undefined) {
    super(
      `Escrow is not deployed on network ${chainId ?? 'unknown'}. ` +
        `The Ask escrow contract only exists on ${ESCROW_CHAIN_IDS.join(', ')}.`
    );
    this.name = 'EscrowNotDeployedError';
    this.chainId = chainId;
  }
}

export function requireEscrowDeployment(chainId: number | undefined): AskEscrowDeployment {
  const found = escrowDeployment(chainId);
  if (!found) throw new EscrowNotDeployedError(chainId);
  return found;
}

/* ------------------------------------------------------------------ */
/*  IDENTYFIKATORY                                                     */
/* ------------------------------------------------------------------ */

/**
 * ODWZOROWANIE IDENTYFIKATORA FIRESTORE NA bytes32.
 *
 * ===================================================================
 * TO ODWZOROWANIE MUSI BYC STABILNE NA ZAWSZE. NIE ZMIENIAJ GO.
 * ===================================================================
 * Klucz escrow w kontrakcie to keccak256(abi.encode(author, askId)), a askId
 * bierze sie WYLACZNIE stad. Zmiana tej funkcji - inne kodowanie, inne
 * przycinanie, inna normalizacja wielkosci liter - daje inny askId dla tego
 * samego dokumentu, czyli inny klucz, czyli:
 *   - resolve() na juz sfinansowanym Asku konczy sie NotOpen,
 *   - srodki zostaja pod starym kluczem, do ktorego nie ma juz jak trafic,
 *   - jedynym wyjsciem jest settleExpired po deadline + 48h, minus oplata.
 * Kontrakt jest niezmienny i nie ma funkcji ratunkowej, wiec bledu tej klasy
 * nie da sie naprawic zadnym wdrozeniem aplikacji.
 *
 * Dlaczego keccak, a nie surowe bajty identyfikatora: identyfikatory Firestore
 * maja 20 znakow, wiec zmiescilyby sie w bytes32 po dopelnieniu - ale KAZDA
 * zmiana dlugosci identyfikatora w przyszlosci wywracalaby kodowanie. Skrot ma
 * zawsze 32 bajty, niezaleznie od tego, co dostanie.
 */
function idToBytes32(id: string): `0x${string}` {
  const trimmed = id.trim();
  if (trimmed === '') {
    throw new Error('Cannot map an empty document id onto the escrow contract.');
  }
  // toBytes na stringu daje UTF-8 - to jest CZESC odwzorowania, nie szczegol.
  return keccak256(toBytes(trimmed));
}

/** Identyfikator dokumentu Aska -> askId dla kontraktu. Patrz uwaga wyzej. */
export function askIdToBytes32(askDocId: string): `0x${string}` {
  return idToBytes32(askDocId);
}

/**
 * Identyfikator dokumentu ODPOWIEDZI -> answerRef w zdarzeniu SeatAwarded.
 *
 * To jest DOWOD, ktora odpowiedz dostala ktora wyplate: bez niego
 * rozstrzygniecie pieciu miejsc daje piec wpisow w logu, ktorych nie da sie
 * przypisac do konkretnych odpowiedzi. Kontrakt odrzuca ref rowny zeru
 * (MissingAnswerRef), wiec pustego identyfikatora nie da sie tu przemycic.
 */
export function answerIdToBytes32(answerDocId: string): `0x${string}` {
  return idToBytes32(answerDocId);
}

/**
 * Klucz escrow: keccak256(abi.encode(author, askId)) - dokladnie keyFor()
 * z kontraktu.
 *
 * Potrzebny WYLACZNIE po to, zeby trasa serwerowa mogla sprawdzic, ze zdarzenie
 * SeatAwarded, ktore czyta, pochodzi z TEGO Aska i TEGO autora, a nie z
 * dowolnego innego rozstrzygniecia w tym samym bloku. Bez tego porownania hash
 * cudzej transakcji byl by wystarczajacym "dowodem".
 *
 * Kodowanie musi byc identyczne jak w Solidity - stad encodeAbiParameters
 * (abi.encode), a nie encodePacked.
 */
export function escrowKeyFor(author: string, askDocId: string): `0x${string}` {
  return keccak256(
    encodeAbiParameters(
      [{ type: 'address' }, { type: 'bytes32' }],
      [author as Address, askIdToBytes32(askDocId)]
    )
  );
}

/* ------------------------------------------------------------------ */
/*  JEDNOSTKI                                                          */
/* ------------------------------------------------------------------ */

/**
 * Stawka za jedna odpowiedz w jednostkach bazowych USDC.
 *
 * MUSI byc liczona z perAnswerFor(budget, seats), a NIE z budget/seats:
 * perAnswerFor tnie w dol DO CENTA, wiec te dwie drogi daja rozne liczby, a
 * karta w feedzie pokazuje wynik perAnswerFor. Gdyby lancuch dostal cos innego,
 * odpowiadajacy zobaczylby na karcie inna kwote, niz przypisze mu kontrakt.
 * Uzasadnienie po stronie Solidity: komentarz przy fund() w AskEscrow.sol.
 */
export function perAnswerToUnits(perAnswer: number): bigint {
  if (!Number.isFinite(perAnswer) || perAnswer <= 0) {
    throw new Error('The amount per answer has to be a positive number.');
  }
  // perAnswerFor gwarantuje najwyzej dwa miejsca po przecinku, wiec toFixed(2)
  // oddaje te wartosc bez straty - i bez pylu z arytmetyki zmiennoprzecinkowej.
  return parseUnits(perAnswer.toFixed(2), ESCROW_TOKEN_DECIMALS);
}

/** Budzet do zablokowania. Kontrakt liczy go tak samo: perAnswer * seats. */
export function budgetToUnits(perAnswer: number, seats: number): bigint {
  if (!Number.isInteger(seats) || seats <= 0) {
    throw new Error('Seats have to be a whole number greater than zero.');
  }
  return perAnswerToUnits(perAnswer) * BigInt(seats);
}

/** Jednostki bazowe -> liczba do pokazania. Do formatowania, nigdy do liczenia. */
export function unitsToAmount(units: bigint): number {
  return Number(formatUnits(units, ESCROW_TOKEN_DECIMALS));
}

/**
 * Termin: repo trzyma MILISEKUNDY, kontrakt chce SEKUND.
 *
 * Konwersja siedzi w jednym miejscu, bo pomylka o 1000 daje albo termin w
 * przeszlosci (DeadlineInPast, nic sie nie zablokuje), albo termin za 30 tysiecy
 * lat (DeadlineTooFar, to samo). Zaokraglamy W DOL, zeby zapisany w Firestore
 * termin nigdy nie byl WCZESNIEJSZY niz ten na lancuchu.
 */
export function deadlineMsToSeconds(deadlineMs: number): bigint {
  if (!Number.isFinite(deadlineMs) || deadlineMs <= 0) {
    throw new Error('The deadline is not a valid timestamp.');
  }
  return BigInt(Math.floor(deadlineMs / 1000));
}

/** 48h z RESOLVE_GRACE - powielone tu WYLACZNIE po to, zeby UI liczylo to samo. */
export const RESOLVE_GRACE_MS = 48 * 60 * 60 * 1000;

/**
 * TRZY OKNA CZASU JEDNEGO ESCROW - i to, ktore z nich trwa, decyduje o tym,
 * co wolno zrobic z pieniedzmi.
 *
 * - `running`      przed terminem. Odpowiedzi wciaz wplywaja, budzet nie ma
 *                  jak wrocic (resolve przed terminem musi wypelnic KAZDE
 *                  miejsce, patrz EarlyResolveMustFillSeats).
 * - `resolving`    miedzy terminem a terminem + 48h. Autor czyta odpowiedzi
 *                  i przyjmuje te, ktore chce. settleExpired rewertuje tu
 *                  z TooEarly - okna sa ROZLACZNE, wiec nie ma sekundy,
 *                  w ktorej obie sciezki byly by otwarte.
 * - `recoverable`  po terminie + 48h. Nikomu juz nie da sie zaplacic; jedyne,
 *                  co zostalo, to zwrot budzetu autorowi minus oplata.
 */
export type EscrowWindow = 'running' | 'resolving' | 'recoverable';

export type EscrowTiming = {
  phase: EscrowWindow;
  /** Termin przyjmowania odpowiedzi, w ms. */
  deadlineMs: number;
  /** Termin + 48h: granica, od ktorej settleExpired przechodzi. W ms. */
  recoverableAtMs: number;
  /**
   * Ile ms zostalo DO KONCA biezacego okna. `null` w `recoverable` - tam nic
   * juz nie odlicza i zadna liczba nie ma tam znaczenia.
   */
  msLeft: number | null;
};

/**
 * Ktore okno trwa i ile mu zostalo.
 *
 * === DLACZEGO TERMIN MA PRZYJSC Z LANCUCHA, A NIE Z DOKUMENTU ===
 * Wolajacy podaje `deadlineMs` odczytany przez `escrowFor`, bo to TEN termin
 * sprawdza kontrakt przy settleExpired. Dokument Aska w Firestore trzyma wlasna
 * kopie i moglby sie z nim rozjechac (zapisujemy sekundy zaokraglone w dol) -
 * a interfejs, ktory obiecuje "mozna juz odzyskac" na sekunde przed lancuchem,
 * konczy sie rewertem TooEarly u czlowieka, ktory zrobil dokladnie to, co
 * kazalismy.
 *
 * GRANICA JEST OSTRA PO STRONIE KONTRAKTU: settleExpired wymaga
 * `block.timestamp > deadline + RESOLVE_GRACE` (ostra nierownosc), wiec
 * `recoverable` zaczyna sie DOPIERO powyzej tej chwili, nie na niej.
 */
export function escrowTiming(deadlineMs: number, now = Date.now()): EscrowTiming {
  const recoverableAtMs = deadlineMs + RESOLVE_GRACE_MS;

  if (now < deadlineMs) {
    return { phase: 'running', deadlineMs, recoverableAtMs, msLeft: deadlineMs - now };
  }
  if (now <= recoverableAtMs) {
    return { phase: 'resolving', deadlineMs, recoverableAtMs, msLeft: recoverableAtMs - now };
  }
  return { phase: 'recoverable', deadlineMs, recoverableAtMs, msLeft: null };
}

/** Ile z budzetu zabiera oplata i ile naprawde wraca do autora. */
export type EscrowRefundSplit = {
  /** Caly budzet, ktory wciaz lezy na kontrakcie. Jednostki bazowe. */
  budget: bigint;
  fee: bigint;
  /** To, co dostanie autor - jako SALDO do odebrania, nie jako przelew. */
  toAuthor: bigint;
  feeBps: number;
};

/**
 * Podzial zwracanego budzetu, liczony DOKLADNIE tak jak w kontrakcie:
 * oplata z zaokragleniem w dol, a autor dostaje RESZTE. Dzieki temu suma
 * schodzi sie co do jednostki i karta nie obiecuje ani centa wiecej, niz
 * przypisze lancuch.
 *
 * `null` = nie znamy stawki oplaty na tej sieci. Wolajacy MUSI wtedy napisac,
 * ze kwoty netto nie ustalono - pokazanie samego budzetu jako "wroci do ciebie"
 * byloby obietnica zawyzona o oplate.
 */
export function escrowRefundSplit(budget: bigint, chainId: number): EscrowRefundSplit | null {
  const feeBps = escrowFeeBps(chainId);
  if (feeBps === null) return null;

  const fee = (budget * BigInt(feeBps)) / 10_000n;
  return { budget, fee, toAuthor: budget - fee, feeBps };
}

/* ------------------------------------------------------------------ */
/*  ABI - tylko to, czego aplikacja naprawde uzywa                     */
/* ------------------------------------------------------------------ */

/**
 * Wycinek ABI. Celowo NIE jest to pelny artefakt kompilacji: mniejsze ABI
 * znaczy mniejszy bundle i - wazniejsze - lista funkcji, ktore aplikacja umie
 * wywolac, jest tu widoczna na jednym ekranie.
 *
 * BLEDY SA CZESCIA TEGO ABI I TO NIE JEST OZDOBNIK: bez nich viem nie potrafi
 * zdekodowac revertu z niestandardowym bledem i uzytkownik dostaje
 * "execution reverted" zamiast zdania (patrz describeEscrowError).
 */
export const ASK_ESCROW_ABI = [
  {
    type: 'function',
    name: 'fund',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'askId', type: 'bytes32' },
      { name: 'perAnswer', type: 'uint128' },
      { name: 'seats', type: 'uint32' },
      { name: 'deadline', type: 'uint64' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'resolve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'askId', type: 'bytes32' },
      { name: 'winners', type: 'address[]' },
      { name: 'answerRefs', type: 'bytes32[]' },
    ],
    outputs: [],
  },
  {
    /**
     * Zwrot wygaslego budzetu. BEZ UPRAWNIEN - adres docelowy siedzi w kluczu,
     * wiec wolajacy placi gaz i nie dostaje nic. Dlatego bierze `author`
     * jako argument, a nie msg.sender jak resolve().
     */
    type: 'function',
    name: 'settleExpired',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'author', type: 'address' },
      { name: 'askId', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'claim',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  {
    type: 'function',
    name: 'claimFor',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'claimable',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'escrowFor',
    stateMutability: 'view',
    inputs: [
      { name: 'author', type: 'address' },
      { name: 'askId', type: 'bytes32' },
    ],
    outputs: [
      { name: 'perAnswer', type: 'uint128' },
      { name: 'deadline', type: 'uint64' },
      { name: 'seats', type: 'uint32' },
      { name: 'budget', type: 'uint256' },
      { name: 'funded', type: 'bool' },
      { name: 'open', type: 'bool' },
    ],
  },
  {
    type: 'event',
    name: 'AskFunded',
    inputs: [
      { name: 'key', type: 'bytes32', indexed: true },
      { name: 'author', type: 'address', indexed: true },
      { name: 'askId', type: 'bytes32', indexed: true },
      { name: 'perAnswer', type: 'uint128', indexed: false },
      { name: 'seats', type: 'uint32', indexed: false },
      { name: 'deadline', type: 'uint64', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'SeatAwarded',
    inputs: [
      { name: 'key', type: 'bytes32', indexed: true },
      { name: 'recipient', type: 'address', indexed: true },
      { name: 'answerRef', type: 'bytes32', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'AskResolved',
    inputs: [
      { name: 'key', type: 'bytes32', indexed: true },
      { name: 'author', type: 'address', indexed: true },
      { name: 'seatsAwarded', type: 'uint32', indexed: false },
      { name: 'refundToAuthor', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'Claimed',
    inputs: [
      { name: 'account', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'caller', type: 'address', indexed: true },
    ],
  },
  { type: 'error', name: 'InvalidAmount', inputs: [] },
  { type: 'error', name: 'InvalidSeats', inputs: [] },
  { type: 'error', name: 'DeadlineInPast', inputs: [] },
  { type: 'error', name: 'DeadlineTooFar', inputs: [] },
  { type: 'error', name: 'AlreadyFunded', inputs: [] },
  { type: 'error', name: 'NotOpen', inputs: [] },
  { type: 'error', name: 'NoWinners', inputs: [] },
  { type: 'error', name: 'LengthMismatch', inputs: [] },
  { type: 'error', name: 'TooManyWinners', inputs: [] },
  { type: 'error', name: 'InvalidWinner', inputs: [] },
  { type: 'error', name: 'DuplicateWinner', inputs: [] },
  { type: 'error', name: 'MissingAnswerRef', inputs: [] },
  { type: 'error', name: 'ResolveWindowClosed', inputs: [] },
  { type: 'error', name: 'TooEarly', inputs: [] },
  { type: 'error', name: 'EarlyResolveMustFillSeats', inputs: [] },
  { type: 'error', name: 'NothingToClaim', inputs: [] },
  { type: 'error', name: 'TransferFailed', inputs: [] },
  { type: 'error', name: 'Reentrancy', inputs: [] },
] as const;

/**
 * Wycinek ERC-20: TYLKO allowance i approve.
 *
 * `transfer` juz w repo jest (ERC20_TRANSFER_ABI w TipNetworkConfig) i celowo go
 * tu nie powtarzamy - escrow nigdy nie przelewa tokena bezposrednio, robi to
 * kontrakt przez transferFrom.
 */
export const ERC20_ALLOWANCE_ABI = [
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

/* ------------------------------------------------------------------ */
/*  KLIENCI                                                            */
/* ------------------------------------------------------------------ */

/**
 * Minimalne ksztalty klientow viem, ktorych ten plik potrzebuje.
 *
 * DLACZEGO STRUKTURALNIE, A NIE `PublicClient` Z VIEM: wagmi zwraca klienta
 * sparametryzowanego lancuchem i transportem, wiec przypisanie go do golego
 * `PublicClient` wymaga rzutowania w KAZDYM komponencie. Interfejs opisujacy
 * tylko trzy uzywane metody przyjmuje i klienta z wagmi, i wlasnorecznie
 * zbudowanego createPublicClient na serwerze, bez ani jednego `as` u wolajacego.
 * Cena: argumenty tych metod nie sa tu typowane - dlatego kazdy helper nizej
 * przyjmuje parametry DZIEDZINOWE i sam sklada wywolanie.
 */
export interface EscrowReader {
  readContract(args: any): Promise<any>;
  simulateContract(args: any): Promise<{ request: any }>;
  waitForTransactionReceipt(args: any): Promise<{ status: 'success' | 'reverted' }>;
}

export interface EscrowSigner {
  writeContract(request: any): Promise<Hash>;
}

/* ------------------------------------------------------------------ */
/*  ODCZYTY                                                            */
/* ------------------------------------------------------------------ */

export type EscrowState = {
  /** Stawka za odpowiedz w jednostkach bazowych. */
  perAnswer: bigint;
  /** Termin w SEKUNDACH epoch - tak trzyma go kontrakt. */
  deadlineSeconds: bigint;
  /** Ile miejsc jeszcze zyje. 0 znaczy "zamkniete", nie "brak miejsc od poczatku". */
  seatsLeft: number;
  /** Kwota WCIAZ zablokowana. Po rozstrzygnieciu jest zerem - poszla na salda. */
  budget: bigint;
  /** Czy ten klucz byl kiedykolwiek sfinansowany (nagrobek zostaje na zawsze). */
  funded: boolean;
  /** Czy mozna jeszcze rozstrzygac. */
  open: boolean;
};

/**
 * Stan escrow jednego Aska. To jest odczyt, ktory chroni ODPOWIADAJACEGO:
 * pozwala mu sprawdzic PRZED napisaniem odpowiedzi, ze na jego miejsce naprawde
 * lezy zablokowana kwota. Bez niego slowo "escrow" jest reklama, nie faktem.
 */
export async function readEscrow(
  client: EscrowReader,
  chainId: number,
  author: string,
  askDocId: string
): Promise<EscrowState> {
  const { address } = requireEscrowDeployment(chainId);
  const result = (await client.readContract({
    address,
    abi: ASK_ESCROW_ABI,
    functionName: 'escrowFor',
    args: [author as Address, askIdToBytes32(askDocId)],
  })) as readonly [bigint, bigint, number, bigint, boolean, boolean];

  return {
    perAnswer: result[0],
    deadlineSeconds: result[1],
    seatsLeft: Number(result[2]),
    budget: result[3],
    funded: result[4],
    open: result[5],
  };
}

/**
 * Ile ten adres ma do odebrania. Zwraca jednostki bazowe.
 *
 * Rzuca bledem, gdy odczyt padnie - i to jest celowe. Zero zwrocone przy
 * nieudanym odczycie mowiloby czlowiekowi "nie masz nic", w chwili gdy tego
 * nie wiemy. Awaria != pustka.
 */
export async function readClaimable(
  client: EscrowReader,
  chainId: number,
  account: string
): Promise<bigint> {
  const { address } = requireEscrowDeployment(chainId);
  return (await client.readContract({
    address,
    abi: ASK_ESCROW_ABI,
    functionName: 'claimable',
    args: [account as Address],
  })) as bigint;
}

/** Ile autor ma juz dopuszczone dla kontraktu. Decyduje, czy approve jest potrzebne. */
async function readAllowance(
  client: EscrowReader,
  token: Address,
  owner: string,
  spender: Address
): Promise<bigint> {
  return (await client.readContract({
    address: token,
    abi: ERC20_ALLOWANCE_ABI,
    functionName: 'allowance',
    args: [owner as Address, spender],
  })) as bigint;
}

/* ------------------------------------------------------------------ */
/*  ZAPISY                                                             */
/* ------------------------------------------------------------------ */

/** Etapy widoczne dla interfejsu. Kazdy trwa i kazdy moze sie nie udac osobno. */
export type FundPhase = 'checking-allowance' | 'approving' | 'funding';

export type FundAskParams = {
  reader: EscrowReader;
  signer: EscrowSigner;
  chainId: number;
  /** Adres autora - MUSI byc tym, ktory podpisuje, bo kontrakt bierze msg.sender. */
  author: string;
  /** Identyfikator dokumentu Firestore. Nadany PRZED zapisem - patrz newAskId. */
  askDocId: string;
  /** Kwota za odpowiedz w USDC (wynik perAnswerFor). */
  perAnswer: number;
  seats: number;
  /** Termin w MILISEKUNDACH - ten sam, ktory trafi do Firestore. */
  deadlineMs: number;
  onPhase?: (phase: FundPhase) => void;
};

export type FundAskResult = {
  /** Hash transakcji fund - DOWOD zablokowania. Bez niego nie wolno pisac 'escrowed'. */
  fundTxHash: Hash;
  /** Hash approve, gdy byl potrzebny. `null` = limit juz wystarczal. */
  approveTxHash: Hash | null;
  /** Zablokowana kwota w jednostkach bazowych. */
  budgetUnits: bigint;
};

/**
 * Blokuje budzet Aska na kontrakcie: approve -> fund.
 *
 * === KOLEJNOSC I DLACZEGO JEST NIEODWRACALNA ===
 * Kontrakt pobiera budzet przez transferFrom, wiec bez wczesniejszego approve
 * fund cofnie sie w calosci. Approve robimy na DOKLADNIE budzet, a nie na
 * nieskonczonosc: dopuszczenie bez limitu zostaje w portfelu po tym, jak Ask
 * dawno sie zamknal, i jest to uprawnienie, ktorego nikt nie potrzebuje.
 *
 * Funkcja zwraca dopiero po POTWIERDZONEJ i NIECOFNIETEJ transakcji fund. To
 * jest warunek, od ktorego zalezy prawo do napisania `funding: 'escrowed'`
 * w Firestore - dokument bez zablokowanych srodkow klamie.
 */
export async function fundAsk(params: FundAskParams): Promise<FundAskResult> {
  const { address, token } = requireEscrowDeployment(params.chainId);
  const perAnswerUnits = perAnswerToUnits(params.perAnswer);
  const budget = budgetToUnits(params.perAnswer, params.seats);
  const deadline = deadlineMsToSeconds(params.deadlineMs);

  params.onPhase?.('checking-allowance');
  const allowance = await readAllowance(params.reader, token, params.author, address);

  let approveTxHash: Hash | null = null;
  if (allowance < budget) {
    params.onPhase?.('approving');
    const approveSim = await params.reader.simulateContract({
      address: token,
      abi: ERC20_ALLOWANCE_ABI,
      functionName: 'approve',
      args: [address, budget],
      account: params.author as Address,
    });
    approveTxHash = await params.signer.writeContract(approveSim.request);

    const approveReceipt = await params.reader.waitForTransactionReceipt({
      hash: approveTxHash,
    });
    if (approveReceipt.status !== 'success') {
      // Cofniete approve to brak dopuszczenia. Fund poszedlby w te sama sciane,
      // tylko drozej - i z mylacym komunikatem o samym fund.
      throw new Error(
        'The USDC approval reverted on-chain, so nothing was locked and nothing was charged. Try again.'
      );
    }
  }

  params.onPhase?.('funding');
  const fundSim = await params.reader.simulateContract({
    address,
    abi: ASK_ESCROW_ABI,
    functionName: 'fund',
    args: [askIdToBytes32(params.askDocId), perAnswerUnits, params.seats, deadline],
    account: params.author as Address,
  });
  const fundTxHash = await params.signer.writeContract(fundSim.request);

  const fundReceipt = await params.reader.waitForTransactionReceipt({
    hash: fundTxHash,
  });
  if (fundReceipt.status !== 'success') {
    // Ta sama zasada, ktora obowiazuje juz w usePaymentFlow: transakcja na
    // lancuchu, ktora sie cofnela, NIE jest sukcesem i nic po niej nie zapisujemy.
    throw new Error(
      'The escrow deposit reverted on-chain. Nothing was locked and the Ask was not created.'
    );
  }

  return { fundTxHash, approveTxHash, budgetUnits: budget };
}

/** Jeden zwyciezca: adres, ktory dostanie stawke, i odpowiedz, za ktora dostaje. */
export type EscrowWinner = {
  address: string;
  /** Identyfikator dokumentu odpowiedzi - trafi do logu jako answerRef. */
  answerDocId: string;
};

export type ResolveAskOnchainParams = {
  reader: EscrowReader;
  signer: EscrowSigner;
  chainId: number;
  /** Autor Aska. Kontrakt odtwarza klucz z msg.sender, wiec to musi byc podpisujacy. */
  author: string;
  askDocId: string;
  winners: EscrowWinner[];
};

/**
 * Rozstrzygniecie na lancuchu: pieniadze PRZESTAJA BYC AUTORA.
 *
 * UWAGA NA TO, CO TA FUNKCJA OBIECUJE. resolve() nie wysyla tokenow - przypisuje
 * salda. Odpowiadajacy dostaje pieniadze dopiero przez claim()/claimFor().
 * Interfejs nie ma prawa napisac po tej transakcji "paid out"; wolno napisac
 * "awarded" i pokazac, gdzie to odebrac.
 *
 * TERMINALNE I JEDNORAZOWE. Drugie wywolanie dla tego samego Aska konczy sie
 * NotOpen, wiec caly komplet zwyciezcow musi byc w jednej liscie.
 */
export async function resolveAskOnchain(params: ResolveAskOnchainParams): Promise<Hash> {
  const { address } = requireEscrowDeployment(params.chainId);
  if (params.winners.length === 0) {
    throw new Error('Pick at least one answer. The contract will not close an Ask with nobody paid.');
  }

  const addresses = params.winners.map((winner) => winner.address as Address);
  const refs = params.winners.map((winner) => answerIdToBytes32(winner.answerDocId));

  const simulation = await params.reader.simulateContract({
    address,
    abi: ASK_ESCROW_ABI,
    functionName: 'resolve',
    args: [askIdToBytes32(params.askDocId), addresses, refs],
    account: params.author as Address,
  });
  const txHash = await params.signer.writeContract(simulation.request);

  const receipt = await params.reader.waitForTransactionReceipt({
    hash: txHash,
  });
  if (receipt.status !== 'success') {
    throw new Error(
      'The resolve transaction reverted on-chain. Nobody was paid and the escrow is still open.'
    );
  }

  return txHash;
}

export type SettleExpiredParams = {
  reader: EscrowReader;
  signer: EscrowSigner;
  chainId: number;
  /** Autor, do ktorego wroci budzet. Zaszyty w kluczu, wiec nie da sie go podmienic. */
  author: string;
  askDocId: string;
  /**
   * Kto placi gaz. Zwykle ten sam adres co `author`, ale NIE MUSI - kontrakt
   * nie sprawdza wolajacego, bo nie ma czego przekierowac.
   */
  caller: string;
};

/**
 * Zwrot budzetu Aska, ktorego nikt nie rozstrzygnal.
 *
 * === CO TA FUNKCJA ROBI, A CZEGO NIE ===
 * Przypisuje autorowi SALDO (budzet minus oplata), dokladnie jak resolve().
 * NIE wysyla tokenow. Zeby pieniadze trafily do portfela, potrzebny jest drugi
 * podpis - claim(). Interfejs nie ma prawa napisac po tej transakcji, ze
 * srodki wrocily do portfela; wolno napisac, ze wrocily jako saldo, i pokazac,
 * gdzie je odebrac.
 *
 * === DLACZEGO `caller` JEST OSOBNO OD `author` ===
 * settleExpired nie ma uprawnien. Adres docelowy siedzi w kluczu
 * keccak256(author, askId), wiec wolajacy nie ma czego przekierowac - placi gaz
 * i nie dostaje nic. Dzieki temu autor nie potrzebuje ani gazu, ani zycia, zeby
 * pieniadze wrocily pod jego adres. Symulacja idzie z `caller`, zeby blad
 * pojawil sie PRZED oknem portfela, a nie po nim.
 */
export async function settleExpiredAsk(params: SettleExpiredParams): Promise<Hash> {
  const { address } = requireEscrowDeployment(params.chainId);

  const simulation = await params.reader.simulateContract({
    address,
    abi: ASK_ESCROW_ABI,
    functionName: 'settleExpired',
    args: [params.author as Address, askIdToBytes32(params.askDocId)],
    account: params.caller as Address,
  });
  const txHash = await params.signer.writeContract(simulation.request);

  const receipt = await params.reader.waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== 'success') {
    throw new Error(
      'The settle transaction reverted on-chain. The budget is still locked in the contract, exactly where it was.'
    );
  }

  return txHash;
}

/**
 * Odbior wlasnego salda.
 *
 * Wolamy `claim()`, a nie `claimFor(self)`: obie robia to samo, ale claim()
 * nie przyjmuje adresu, wiec nie ma pola, w ktore mozna wpisac cudzy.
 */
export async function claimPayout(
  reader: EscrowReader,
  signer: EscrowSigner,
  chainId: number,
  account: string
): Promise<Hash> {
  const { address } = requireEscrowDeployment(chainId);

  const simulation = await reader.simulateContract({
    address,
    abi: ASK_ESCROW_ABI,
    functionName: 'claim',
    args: [],
    account: account as Address,
  });
  const txHash = await signer.writeContract(simulation.request);

  const receipt = await reader.waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== 'success') {
    throw new Error('The claim reverted on-chain. Your balance in the contract is untouched.');
  }

  return txHash;
}

/* ------------------------------------------------------------------ */
/*  BLEDY -> ZDANIA                                                    */
/* ------------------------------------------------------------------ */

/**
 * Kazdy blad kontraktu dostaje ZDANIE PO ANGIELSKU.
 *
 * Surowy revert w interfejsie to nie komunikat: "EarlyResolveMustFillSeats()"
 * nie mowi czlowiekowi ani co zrobil zle, ani co ma zrobic teraz, ani czy
 * cokolwiek zostalo pobrane. Kazde zdanie ponizej mowi trzy rzeczy: co sie
 * stalo, dlaczego kontrakt tak ma i co robic dalej.
 */
const ERROR_SENTENCES: Record<string, string> = {
  InvalidAmount: 'The amount per answer has to be more than zero. Nothing was locked.',
  InvalidSeats: 'An Ask has to have between 1 and 20 seats. Nothing was locked.',
  DeadlineInPast:
    'By the time the transaction reached the chain the deadline had already passed. Nothing was locked. Pick a longer deadline and post again.',
  DeadlineTooFar:
    'The escrow contract will not hold money for more than 30 days. Nothing was locked. Pick a shorter deadline.',
  AlreadyFunded:
    'This Ask is already funded in escrow. The contract accepts one deposit per Ask and refuses a second, so you were not charged twice.',
  NotOpen:
    'There is no open escrow for this Ask: it was either never funded, or it has already been resolved or settled. Nothing changed.',
  NoWinners:
    'Pick at least one answer. The contract refuses to close an Ask with nobody paid, because that would be a free way out of a budget you announced.',
  LengthMismatch:
    'The list of winners and the list of answers did not line up, so the contract refused it. Nothing changed. Reload and try again.',
  TooManyWinners: 'You picked more answers than this Ask has seats. Nothing changed.',
  InvalidWinner:
    'One of the picked answers has no payable wallet, or it is your own address. The contract refuses both, so nothing changed.',
  DuplicateWinner:
    'The same wallet is picked twice. One seat per wallet. Drop the duplicate and try again, nothing changed.',
  MissingAnswerRef:
    'One of the picked answers had no id to record on-chain, so the payout would have had no proof attached. Nothing changed.',
  ResolveWindowClosed:
    'The 48-hour window for resolving after the deadline has closed. Nobody can be paid from this escrow any more; the budget can only go back to you, minus the fee.',
  TooEarly:
    'An unresolved Ask can only be settled 48 hours after its deadline. That window exists so the author has time to read the answers. Nothing changed.',
  EarlyResolveMustFillSeats:
    'Before the deadline you can only resolve by filling every seat. Otherwise you could read the answers coming in and take the unused budget back early. Pick exactly as many answers as there are seats, or wait for the deadline.',
  NothingToClaim:
    'This wallet has nothing to collect from the escrow contract right now. Nothing was sent.',
  TransferFailed:
    'The USDC transfer failed inside the contract. Nothing moved. The token most likely rejected the transfer for this address.',
  Reentrancy: 'The contract blocked a re-entrant call. Nothing changed. Try again.',
};

/** Odmowa podpisu w portfelu. Nie jest awaria i nie ma sie tak czytac. */
function isRejection(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as { code?: unknown; name?: unknown; message?: unknown };
  if (candidate.code === 4001) return true;
  if (candidate.name === 'UserRejectedRequestError') return true;
  const message = typeof candidate.message === 'string' ? candidate.message.toLowerCase() : '';
  return (
    message.includes('user rejected') ||
    message.includes('user denied') ||
    message.includes('request rejected')
  );
}

/**
 * Zdanie dla czlowieka z dowolnego bledu tej sciezki.
 *
 * Kolejnosc jest istotna: najpierw NAZWANY blad kontraktu (najwiecej tresci),
 * potem odmowa podpisu (nie awaria), potem wlasny blad tego modulu, a dopiero
 * na koncu pierwsza linia surowego komunikatu viem - te potrafia miec
 * kilkanascie linii z adresem dokumentacji i pelnymi argumentami wywolania.
 */
export function describeEscrowError(error: unknown): string {
  if (error instanceof EscrowNotDeployedError) {
    return 'Escrow is not available on the network your wallet is on. Switch to Base and try again. Nothing was charged.';
  }

  if (error instanceof BaseError) {
    const reverted = error.walk((inner) => inner instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError) {
      const name = reverted.data?.errorName;
      if (name && ERROR_SENTENCES[name]) return ERROR_SENTENCES[name];
      if (name) {
        return `The escrow contract refused this (${name}). Nothing changed.`;
      }
    }
  }

  if (isRejection(error)) return 'You rejected the request in your wallet. Nothing was charged.';

  if (error instanceof Error && error.message) {
    const firstLine = error.message.split('\n')[0]?.trim();
    if (firstLine) return firstLine.slice(0, 200);
  }

  return 'The escrow contract call did not go through. Nothing was charged.';
}

import { bytesToHex, hexToBytes, type Hex } from 'viem';

/**
 * Wiadomosc przy kupnie - "kazde kupno moze cos powiedziec".
 *
 * ===========================================================================
 * DLACZEGO DOPISEK DO CALLDATY, A NIE `memo` Z B20
 * ===========================================================================
 * Natywne memo B20 emituje zdarzenie `Memo` z WOLAJACYM, a tokeny przy kupnie
 * przesyla launchpad - wiec memo podpisaloby kazda wiadomosc adresem krzywej
 * (to samo zastrzezenie stoi w interfaces/IB20Asset.sol). Router, ktory kupuje
 * i odsyla tokeny z memo, psuje z kolei `Bought.buyer`, limit okna startowego
 * (liczony po `msg.sender`) i zwrot reszty.
 *
 * Dopisek omija oba problemy bez zmiany kontraktu: viem dokleja bajty za ABI
 * (`dataSuffix`), Solidity ich nie czyta, kupno jest bit w bit tym samym
 * kupnem, a tekst zostaje w danych transakcji na zawsze. Dziala od razu dla
 * kazdego istniejacego tokena.
 *
 * Format: MAGIC (5 B: "sphr" + wersja 0x01) | dlugosc (1 B) | UTF-8.
 *
 * Portfel-kontrakt (Coinbase Smart Wallet, 4337) owija nasza calldate w swoja,
 * wiec dopisek nie lezy na koncu `tx.input`, tylko gdzies w srodku. Dlatego
 * dekoder SZUKA znacznika zamiast ciac od konca.
 */

export const TRADE_MESSAGE_MAX_BYTES = 64;

const MAGIC = [0x73, 0x70, 0x68, 0x72, 0x01] as const;

const encoder = new TextEncoder();

export function messageByteLength(text: string): number {
  return encoder.encode(text).length;
}

/** Znaki kierunku tekstu - klasyka podszywania sie ("‮gnp.exe"). */
const BIDI = /[‎‏‪-‮⁦-⁩]/g;
/** C0 i C1. ZWJ (U+200D) celowo zostaje - skleja emoji rodzin i flag. */
const CONTROL = /[\u0000-\u001F\u007F-\u009F]/g;

export function cleanTradeMessage(text: string): string {
  return text.normalize('NFC').replace(BIDI, '').replace(CONTROL, ' ').replace(/\s+/g, ' ').trim();
}

/** Dopisek gotowy do `dataSuffix`. Null = nie ma czego wysylac. */
export function encodeTradeMessage(text: string): Hex | null {
  const clean = cleanTradeMessage(text);
  if (!clean) return null;
  const body = encoder.encode(clean);
  if (body.length > TRADE_MESSAGE_MAX_BYTES) {
    throw new RangeError(`A buy message can be at most ${TRADE_MESSAGE_MAX_BYTES} bytes.`);
  }
  const out = new Uint8Array(MAGIC.length + 1 + body.length);
  out.set(MAGIC, 0);
  out[MAGIC.length] = body.length;
  out.set(body, MAGIC.length + 1);
  return bytesToHex(out);
}

function readAt(bytes: Uint8Array, at: number): string | null {
  const lenAt = at + MAGIC.length;
  if (lenAt >= bytes.length) return null;
  const len = bytes[lenAt];
  if (len === 0 || len > TRADE_MESSAGE_MAX_BYTES) return null;
  const start = lenAt + 1;
  if (start + len > bytes.length) return null;
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(start, start + len));
  } catch {
    return null;
  }
  const clean = cleanTradeMessage(text);
  return clean || null;
}

/** Pierwsza poprawna wiadomosc w danych transakcji albo null. */
export function decodeTradeMessage(input: Hex): string | null {
  let bytes: Uint8Array;
  try {
    bytes = hexToBytes(input);
  } catch {
    return null;
  }
  const last = bytes.length - MAGIC.length;
  for (let i = 0; i <= last; i++) {
    if (bytes[i] !== MAGIC[0]) continue;
    let match = true;
    for (let j = 1; j < MAGIC.length; j++) {
      if (bytes[i + j] !== MAGIC[j]) {
        match = false;
        break;
      }
    }
    if (!match) continue;
    const text = readAt(bytes, i);
    if (text) return text;
  }
  return null;
}

/**
 * Tekst wiadomosci jest z lancucha, czyli od kogokolwiek. W tabeli transakcji
 * link albo "prawdziwy adres kontraktu" to gotowa przyneta na drainera, wiec
 * takie wiadomosci pokazujemy zaslepione. React i tak escapuje tekst; tu chodzi
 * o tresc, nie o HTML.
 */
const LINK = /(https?:\/\/|www\.|t\.me\/|\b[a-z0-9-]+\.(com|io|xyz|app|net|org|gg|fun|me|co|link|site|online|ru|cc|top|vip|pro|live|finance|claims?)\b)/i;
const ADDRESS = /0x[0-9a-f]{8,}/i;

export function displayTradeMessage(text: string): string {
  if (LINK.test(text)) return '[link hidden]';
  if (ADDRESS.test(text)) return '[address hidden]';
  return text;
}

/* ======================================================================== */
/*  Scena dla wiadomosci: poziomy, przypiecie, sciana pierwszych kupujacych   */
/* ======================================================================== */

/**
 * Wiekszy zakup, wieksza scena. Progi to czesci progu awansu krzywej, nie
 * stale ETH - na Arc jednostka natywna to USDC i "0,5" znaczyloby co innego.
 * Na Base (prog 3 ETH): glosna od 0,1 ETH, wieloryb od 0,5 ETH.
 */
export type MessageTier = 'normal' | 'loud' | 'whale';

export function messageTier(eth: bigint, targetWei: bigint): MessageTier {
  if (targetWei <= 0n) return 'normal';
  if (eth * 6n >= targetWei) return 'whale';
  if (eth * 30n >= targetWei) return 'loud';
  return 'normal';
}

/** Tekst na X po kupnie albo sprzedazy z wiadomoscia. Symbol ma byc juz oczyszczony. */
export function buildMessageShareText(input: { symbol: string; message: string; kind: 'buy' | 'sell' }): string {
  const quote = `“${displayTradeMessage(input.message)}”`;
  return input.kind === 'buy'
    ? `I aped $${input.symbol} and left a message onchain: ${quote} 🧾`
    : `Sold some $${input.symbol} and left a note onchain on the way out: ${quote} 🧾`;
}

/** Jak dlugo wiadomosc wieloryba wisi przypieta nad tabela. */
export const PIN_SECONDS = 3600;

type MessageTrade = {
  kind: 'buy' | 'sell';
  eth: bigint;
  ts: number;
  txHash: string | null;
  account: string;
};

/** Najnowsze kupno wieloryba z wiadomoscia z ostatniej godziny albo null. */
export function pickPinnedMessage<T extends MessageTrade>(
  trades: ReadonlyArray<T>,
  messages: ReadonlyMap<string, string>,
  targetWei: bigint,
  nowSec: number
): { trade: T; text: string } | null {
  let best: { trade: T; text: string } | null = null;
  for (const trade of trades) {
    if (trade.kind !== 'buy' || !trade.txHash) continue;
    if (nowSec - trade.ts > PIN_SECONDS) continue;
    if (messageTier(trade.eth, targetWei) !== 'whale') continue;
    const text = messages.get(trade.txHash) ?? messages.get(trade.txHash.toLowerCase());
    if (!text) continue;
    if (!best || trade.ts >= best.trade.ts) best = { trade, text };
  }
  return best;
}

/** Ilu pierwszych kupujacych trafia na sciane. */
export const GENESIS_SIZE = 10;

/** Pierwsze kupna w kolejnosci od najstarszego. Wejscie: historia od najstarszego. */
export function genesisBuys<T extends { kind: 'buy' | 'sell' }>(tradesOldestFirst: ReadonlyArray<T>): T[] {
  const out: T[] = [];
  for (const trade of tradesOldestFirst) {
    if (trade.kind !== 'buy') continue;
    out.push(trade);
    if (out.length === GENESIS_SIZE) break;
  }
  return out;
}

/**
 * Hash transakcji z identyfikatora wpisu paska tablicy (`${hash}-buy`,
 * `${hash}-sell` - boardScan.ts). Inne wpisy (start, swap w puli, pending)
 * wiadomosci nie niosa, wiec dostaja null i nie kosztuja zapytania.
 */
export function txHashFromFeedId(id: string): string | null {
  const match = /^(0x[0-9a-fA-F]{64})-(buy|sell)$/.exec(id);
  return match ? match[1].toLowerCase() : null;
}

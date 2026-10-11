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

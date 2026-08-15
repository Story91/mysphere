import { WEI } from './detailShared';

/**
 * WYCENA KRZYWEJ POLICZONA NA MIEJSCU.
 *
 * ===========================================================================
 * PO CO, SKORO KONTRAKT MA `quoteBuy`
 * ===========================================================================
 * Bo `quoteBuy` jest po drugiej stronie sieci. Panel handlu czeka 300 ms
 * (debounce) plus czas odpowiedzi RPC, wiec po wpisaniu kwoty pole "dostaniesz"
 * przez chwile jest puste. Krzywa jest deterministyczna i te sama liczbe da sie
 * policzyc w przegladarce od razu.
 *
 * ===========================================================================
 * CZYM TO NIE JEST
 * ===========================================================================
 * To NIE jest liczba, ktora podpisujesz. Minimum do transakcji dalej liczy sie
 * z odpowiedzi kontraktu (`quoteBuy`/`quoteSell`), bo tylko ona zna stan
 * krzywej w bloku, w ktorym transakcja wyladuje. To jest podglad na czas
 * oczekiwania - i dlatego kazde odchylenie od odpowiedzi kontraktu jest
 * ostrzezeniem, a nie szumem (patrz `quoteDrifts`).
 *
 * Wzory sa przepisane z `CurveLaunchpad._quoteBuy` i `quoteSell` co do
 * zaokraglenia: oplata W GORE, tokeny W DOL, czyli zawsze na niekorzysc
 * wolajacego. Inne zaokraglenie dawaloby podglad odrobine lepszy niz prawda, a
 * to jest gorszy blad niz podglad odrobine gorszy.
 */

/** Rezerwa awansu z kontraktu: krzywa sprzedaje 800M z miliarda. */
export const CURVE_T_MIN_WEI = 200_000_000n * WEI;

const mulDivDown = (a: bigint, b: bigint, denominator: bigint): bigint =>
  denominator === 0n ? 0n : (a * b) / denominator;

const mulDivUp = (a: bigint, b: bigint, denominator: bigint): bigint => {
  if (denominator === 0n) return 0n;
  const product = a * b;
  return product === 0n ? 0n : (product - 1n) / denominator + 1n;
};

export type BuyQuote = { tokensOut: bigint; fee: bigint; refund: bigint };
export type SellQuote = { ethOut: bigint; fee: bigint };

/**
 * Ile tokenow za `ethIn`. Kopia `_quoteBuy` razem z dociagnieciem ostatniego
 * kupna do progu: kupno, ktore sprowadziloby rezerwe ponizej `T_MIN`, dostaje
 * dokladnie tyle, ile do progu brakuje, a reszta ETH wraca jako `refund`.
 */
export function quoteBuyLocal(input: {
  ethIn: bigint;
  ethReserve: bigint;
  tokenReserve: bigint;
  feeBps: number;
  rVirtWei: bigint;
  tMinWei?: bigint;
}): BuyQuote {
  const { ethIn, ethReserve, tokenReserve, rVirtWei } = input;
  const tMin = input.tMinWei ?? CURVE_T_MIN_WEI;
  const feeBps = BigInt(Math.max(0, Math.round(input.feeBps)));
  if (ethIn <= 0n || tokenReserve <= 0n) return { tokensOut: 0n, fee: 0n, refund: 0n };

  let fee = mulDivUp(ethIn, feeBps, 10_000n);
  if (fee > ethIn) return { tokensOut: 0n, fee: 0n, refund: 0n };
  const eIn = ethIn - fee;
  const R = rVirtWei + ethReserve;

  let tokensOut = mulDivDown(tokenReserve, eIn, R + eIn);
  let refund = 0n;

  if (tokenReserve - tokensOut < tMin) {
    tokensOut = tokenReserve > tMin ? tokenReserve - tMin : 0n;
    const need = mulDivUp(R, tokensOut, tMin);
    fee = mulDivUp(need, feeBps, 10_000n);
    // Kontrakt rewertuje `Arithmetic()`, gdyby to nie wyszlo. Tu oddajemy
    // zerowy podglad - podglad nie ma prawa udawac, ze cos wie lepiej.
    if (need + fee > ethIn) return { tokensOut: 0n, fee: 0n, refund: 0n };
    refund = ethIn - need - fee;
  }

  return { tokensOut, fee, refund };
}

/** Ile ETH za `tokensIn`. Kopia `quoteSell`. */
export function quoteSellLocal(input: {
  tokensIn: bigint;
  ethReserve: bigint;
  tokenReserve: bigint;
  feeBps: number;
  rVirtWei: bigint;
}): SellQuote {
  const { tokensIn, ethReserve, tokenReserve, rVirtWei } = input;
  const feeBps = BigInt(Math.max(0, Math.round(input.feeBps)));
  if (tokensIn <= 0n) return { ethOut: 0n, fee: 0n };

  const gross = mulDivDown(rVirtWei + ethReserve, tokensIn, tokenReserve + tokensIn);
  const fee = mulDivUp(gross, feeBps, 10_000n);
  return { ethOut: gross - fee, fee };
}

/**
 * Czy podglad rozjechal sie z odpowiedzia kontraktu na tyle, ze przestal byc
 * podgladem.
 *
 * Zaokraglenia w mulDiv moga dac roznice pojedynczych jednostek i to jest
 * normalne. Roznica wieksza niz promil znaczy, ze nasza kopia wzoru przestala
 * odpowiadac wdrozonemu kontraktowi - wtedy podglad ma zniknac, a nie klamac.
 */
export function quoteDrifts(local: bigint, onchain: bigint): boolean {
  if (onchain <= 0n) return local > 0n;
  const diff = local > onchain ? local - onchain : onchain - local;
  return diff * 1_000n > onchain;
}

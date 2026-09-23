/**
 * Rozpoznawanie bledow portfela Solany - wspolne dla przycisku posta i strony
 * napiwku. Tlumaczymy tylko to, co umiemy rozpoznac; reszta idzie dalej
 * w oryginalnej tresci (ta sama zasada co `describeWalletError` po stronie EVM).
 */

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Odmowa podpisu to NIE awaria. Bez tego uzytkownik, ktory sam kliknal
 * "Cancel" w Phantomie, dostawalby czerwony toast "Transaction failed".
 */
export function isUserRejection(error: unknown): boolean {
  return /user rejected|user denied|rejected the request|request rejected/i.test(messageOf(error));
}

/** Brak SOL na oplate ma wlasny komunikat - inaczej uzytkownik nie wie, czego brakuje. */
export function isInsufficientFunds(error: unknown): boolean {
  return /insufficient (lamports|funds)|attempt to debit an account/i.test(messageOf(error));
}

/**
 * Przelew, po ktorym konto ODBIORCY mialoby mniej niz minimum rent. Sprawdzac
 * PRZED isInsufficientFunds - oba komunikaty zawieraja "insufficient funds",
 * a ten dotyczy portfela odbiorcy, nie placacego.
 */
export function isRentError(error: unknown): boolean {
  return /insufficient funds for rent/i.test(messageOf(error));
}

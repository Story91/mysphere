/**
 * Zamienia hash userOp z Base Pay na hash PRAWDZIWEJ transakcji.
 *
 * === PO CO ===
 * `pay()` z @base-org/account zwraca `id`, ktore wlasna dokumentacja SDK
 * opisuje jako "Transaction ID (userOp hash)". To zlecenie ERC-4337, nie
 * transakcja: lezy w jakiejs transakcji, ale ma wlasny hash, ktorego pod
 * /tx/ w eksploratorze nie ma.
 *
 * Zapisywalismy te wartosc do pola `txHash`, wiec kazda pozycja na stronie
 * Paid linkowala do pustej strony. ZMIERZONE: 17 z 17 identyfikatorow z
 * produkcyjnej kolekcji `tips` zwracalo `null` z eth_getTransactionByHash
 * na Base mainnet - i tak samo na Base Sepolia, Ethereum, Optimism oraz
 * Arbitrum. Na stronie, ktorej cala teza brzmi "kazda pozycja ma dowod,
 * ktory mozesz sprawdzic", nie ma gorszej wady.
 *
 * === DLACZEGO TO DZIALA ===
 * Bundler zna powiazanie userOp -> transakcja i oddaje je przez
 * eth_getUserOperationReceipt. Sam SDK to wola w getPaymentStatus(), ma
 * `receipt.transactionHash` w reku - i go wyrzuca, bo jego typ zwrotny nie
 * ma takiego pola. My pytamy o to samo i zatrzymujemy wynik.
 *
 * SPRAWDZONE NA ZYWO, nie zalozone:
 *   userOp 0x0230ff… -> tx 0xa8af69… (blok 0x22fb95c)
 *   userOp 0xdb6d5a… -> tx 0xf1f8a2… (blok 0x2036390)
 * Oba hashe transakcji potwierdzone przez eth_getTransactionByHash na Base.
 */

/**
 * Adres bundlera przepisany z @base-org/account
 * (dist/interface/payment/getPaymentStatus.js). Klucz jest zaszyty w SDK, a
 * wiec publiczny - to nie jest nasz sekret i nie ma go po co chowac w env.
 *
 * Gdyby Coinbase go kiedys zrotowalo, ta funkcja zacznie zwracac `null`, a
 * wolajacy zapisze hash userOp jak dotad. Czyli degradacja do stanu
 * sprzed tej zmiany, nie utrata tipa.
 */
const BUNDLER = {
  mainnet: 'https://api.developer.coinbase.com/rpc/v1/base/S-fOd2n2Oi4fl4e1Crm83XeDXZ7tkg8O',
  testnet:
    'https://api.developer.coinbase.com/rpc/v1/base-sepolia/S-fOd2n2Oi4fl4e1Crm83XeDXZ7tkg8O',
} as const;

/** Ile czekamy na bundler. Po tym czasie zapisujemy tip z tym, co mamy. */
const TIMEOUT_MS = 8000;

/**
 * @returns hash transakcji, albo `null` gdy nie da sie go ustalic.
 *
 * NIGDY nie rzuca. Wolajacy jest w sciezce PO udanej platnosci - blad tutaj
 * nie moze zabrac uzytkownikowi potwierdzenia ani zapisu tipa.
 */
export async function resolveUserOpToTxHash(
  userOpHash: string,
  options: { testnet?: boolean } = {}
): Promise<string | null> {
  if (!/^0x[0-9a-fA-F]{64}$/.test(userOpHash)) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(options.testnet ? BUNDLER.testnet : BUNDLER.mainnet, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_getUserOperationReceipt',
        params: [userOpHash],
      }),
      signal: controller.signal,
    });

    const json = await response.json();
    const txHash = json?.result?.receipt?.transactionHash;

    // Bundler moze jeszcze nie widziec kwitu (userOp swiezo wyslany) - wtedy
    // `result` jest null i to nie jest blad, tylko "jeszcze nie teraz".
    return typeof txHash === 'string' && /^0x[0-9a-fA-F]{64}$/.test(txHash) ? txHash : null;
  } catch (error) {
    console.warn('[resolveUserOpToTxHash] Nie udalo sie ustalic hasha transakcji:', error);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

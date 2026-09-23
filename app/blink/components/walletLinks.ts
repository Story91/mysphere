/**
 * Czysta logika "otworz te strone w portfelu" - bez Reacta i bez Solany,
 * zeby dalo sie ja sprawdzic w Node i zeby nie ciagnela stosu portfeli.
 *
 * === PO CO ===
 * Linki /blink/* ludzie otwieraja z aplikacji X na telefonie. Wbudowana
 * przegladarka X to goly WebView: nie ma rozszerzen, nie ma Wallet Standard,
 * a wallet-adapter celowo NIE dodaje tam Mobile Wallet Adapter (sprawdza
 * WebView w getEnvironment). Lista portfeli jest pusta, modal wyboru pokazywal
 * pustke - wlasciciel opisal to jako "nie wykrywa Phantoma" (23.09.2026).
 *
 * Jedyna droga z takiego WebView do portfela to universal link portfela,
 * ktory otwiera TEN SAM adres w przegladarce wbudowanej w portfel - tam
 * portfel jest wstrzykniety i strona dziala bez zmian.
 */

export type WalletBrowseLink = {
  id: 'phantom' | 'solflare' | 'backpack';
  label: string;
  href: string;
};

/**
 * Formaty z dokumentacji portfeli (deeplinki "browse"). `ref` to origin
 * strony - portfel pokazuje go jako zrodlo przekierowania.
 */
export function walletBrowseLinks(pageUrl: string, origin: string): WalletBrowseLink[] {
  const url = encodeURIComponent(pageUrl);
  const ref = encodeURIComponent(origin);
  return [
    { id: 'phantom', label: 'Phantom', href: `https://phantom.app/ul/browse/${url}?ref=${ref}` },
    { id: 'solflare', label: 'Solflare', href: `https://solflare.com/ul/v1/browse/${url}?ref=${ref}` },
    { id: 'backpack', label: 'Backpack', href: `https://backpack.app/ul/v1/browse/${url}?ref=${ref}` },
  ];
}

export const PHANTOM_DOWNLOAD_URL = 'https://phantom.com/download';

/**
 * Telefon czy komputer - tylko po to, zeby wybrac, co podpowiedziec (link do
 * aplikacji portfela czy rozszerzenie). iPadOS udaje Maca, stad dotyk.
 */
export function isMobileDevice(userAgent: string, maxTouchPoints = 0): boolean {
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(userAgent)) return true;
  return /Macintosh/i.test(userAgent) && maxTouchPoints > 1;
}

/**
 * Adres biezacej strony z dopisanymi parametrami (np. szkic odpowiedzi), zeby
 * po przejsciu do portfela czlowiek nie pisal wszystkiego od nowa. Pusta
 * wartosc usuwa parametr. Reszta adresu - w tym `?signature=` z linku
 * odzyskania - zostaje nietknieta.
 */
export function withCarriedParams(pageUrl: string, carry: Record<string, string | undefined>): string {
  try {
    const url = new URL(pageUrl);
    for (const [key, value] of Object.entries(carry)) {
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return pageUrl;
  }
}

/**
 * Odczyt i usuniecie przeniesionych parametrow. Usuwamy je z paska adresu,
 * zeby odswiezenie po wyslaniu nie wstawialo szkicu drugi raz.
 */
export function takeCarriedParams<K extends string>(keys: readonly K[]): Partial<Record<K, string>> {
  const found: Partial<Record<K, string>> = {};
  try {
    const url = new URL(window.location.href);
    let changed = false;
    for (const key of keys) {
      const value = url.searchParams.get(key);
      if (value !== null) {
        found[key] = value;
        url.searchParams.delete(key);
        changed = true;
      }
    }
    if (changed) window.history.replaceState(window.history.state, '', url.toString());
  } catch {
    /* brak dostepu do adresu - formularz startuje pusty */
  }
  return found;
}

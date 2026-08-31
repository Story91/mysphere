/**
 * KTORA SIEC POKAZUJE STARTPAD - czysta decyzja, bez `window` i bez importu
 * konfiguracji.
 *
 * ===========================================================================
 * ADRES WYGRYWA Z PAMIECIA I TO JEST CALA TRESC TEGO PLIKU
 * ===========================================================================
 * Wybor sieci zyl dotad wylacznie w localStorage. Parametr `?c=` istnial, ale
 * czytal go TYLKO serwer, przy generowaniu karty OG. Dlatego link do tokena z
 * Robinhooda mial poprawna karte w Telegramie, a po kliknieciu otwieral sie na
 * sieci ODBIORCY: przegladarka siegala do jego localStorage, ustawiala Base i
 * pytala launchpad Base o token, ktorego tam nie ma.
 *
 * Link ma pokazywac to, co nadawca chcial pokazac. Pamiec przegladarki jest
 * wygoda dla wracajacego, nie zdaniem o cudzym linku.
 *
 * Osobny plik, bo `config.ts` liczy to przy ladowaniu modulu i nie da sie tego
 * przetestowac bez calego DOM-u - a to jest dokladnie ta decyzja, ktora musi
 * miec test.
 */
export function pickChainId(input: {
  /** `window.location.search`, razem ze znakiem zapytania albo bez. */
  search: string;
  /** Wartosc z localStorage. `null`, gdy nic nie zapisano. */
  stored: string | null;
  /** Znane sieci - klucz to chainId. */
  networks: Record<number, unknown>;
  /** Siec domyslna, gdy nic innego nie pasuje. */
  fallback: number;
}): number {
  const known = (value: number) => Number.isFinite(value) && input.networks[value] !== undefined;

  try {
    const fromUrl = Number(new URLSearchParams(input.search).get('c'));
    if (known(fromUrl)) return fromUrl;
  } catch {
    // Zepsuty query string nie moze przewrocic wyboru sieci.
  }

  const fromStorage = Number(input.stored);
  if (known(fromStorage)) return fromStorage;

  return input.fallback;
}

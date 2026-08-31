/**
 * Fakty o skarbcu Morpho - ksztalt danych, o ktory opiera sie kontekst przy Asku.
 *
 * === DLACZEGO OPROCENTOWANIE JEST TU ROZBITE NA TRZY POLA ===
 * Skarbiec pokazuje jedno "7%", ale ta liczba jest sklejka dwoch rzeczy o zupelnie
 * roznej trwalosci: procentu, ktory placa pozyczkobiorcy (`netApyWithoutRewards`),
 * i CZASOWEJ DOPLATY w tokenach (`incentiveApy`), ktora ktos finansuje i moze
 * wylaczyc z dnia na dzien. Jedna duza liczba wyglada lepiej, wiec prawie nikt
 * tego nie rozdziela - i dlatego czlowiek nie wie, ile z jego zysku zniknie,
 * gdy program nagrod sie skonczy.
 *
 * === `null` ZNACZY "NIE ZMIERZYLISMY", NIGDY "ZERO" ===
 * Kazde pole nullowalne mowi o BRAKU POMIARU, a nie o wartosci rownej zeru.
 * `incentiveApy === null` (bo brakuje ktorejs skladowej) NIE WOLNO narysowac
 * jako "0% incentives" - to bylo by twierdzenie o skarbcu postawione w chwili,
 * w ktorej wlasnie nic o nim nie wiemy.
 */

export type VaultFacts = {
  address: string;
  chainId: 8453;
  name: string;
  curator: string | null;
  feeBps: number | null;
  totalAssetsUsd: number | null;
  netApy: number | null; // z nagrodami
  netApyWithoutRewards: number | null; // sam procent od pozyczkobiorcow
  incentiveApy: number | null; // roznica; null gdy brakuje skladowej
  fetchedAt: number;
  /**
   * DOPISANE do kontraktu (dopisywac wolno, usuwac i przemianowywac nie).
   *
   * Symbol aktywa ("USDC", "WETH"). Bez tego lista w kompozytorze pokazuje
   * "Gauntlet USDC Prime" obok "Gauntlet WETH Core" i jedyna roznica siedzi
   * w srodku nazwy wlasnej - a to sa skarbce na dwa rozne aktywa. `null`
   * znaczy "API nie podalo", nie "brak aktywa".
   */
  assetSymbol: string | null;
};

export type VaultFactsResult =
  | { ok: true; facts: VaultFacts }
  | { ok: false; reason: 'unavailable' | 'not-found' | 'malformed' };

/**
 * Lista kwalifikujacych sie skarbcow - ten sam dyskryminator, ten sam powod.
 *
 * Pusta lista i nieudany odczyt daja w UI ten sam widok, a znacza co innego:
 * "nie ma z czego wybrac" kontra "nie wiemy, z czego wybrac". Ta sama zasada
 * co pole `failed` w app/utils/asks/asks.ts.
 *
 * Elementy sa `VaultFacts`, a nie osobnym, chudszym ksztaltem. Jedno zapytanie
 * listujace zwraca komplet tych samych pol co zapytanie o jeden skarbiec, wiec
 * drugi typ bylby kosztem bez zysku: UI uczy sie JEDNEGO ksztaltu, a wybor
 * z listy moze od razu pokazac rozklad oprocentowania, nie dopytujac o nic.
 */
export type VaultListResult =
  | { ok: true; vaults: VaultFacts[] }
  | { ok: false; reason: 'unavailable' | 'not-found' | 'malformed' };

/**
 * Base. Jedyny lancuch, ktorego dotyka ta warstwa - stad literal `8453` w typie
 * `VaultFacts`, a nie `number`. Skarbiec z innego lancucha nie ma prawa
 * przejsc przez ten kod przez pomylke.
 */
export const MORPHO_CHAIN_ID = 8453 as const;

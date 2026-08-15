import type { CoreState } from './detailShared';

/**
 * TWOJE SALDA DO ODEBRANIA, LICZONE ZE ZDARZEN.
 *
 * ===========================================================================
 * OBJAW
 * ===========================================================================
 * Panel „Your claims" czytal sie RAZ, przy wejsciu na strone tokena, i stal do
 * przeladowania. Ktos handlowal twoim tokenem, oplata byla ci naliczana co do
 * wei, a ekran pokazywal liczbe sprzed. Zeby zobaczyc swoje pieniadze, trzeba
 * bylo odswiezyc strone - czyli zgadnac, ze cos sie zmienilo.
 *
 * ===========================================================================
 * DLACZEGO TO NIE KOSZTUJE ANI JEDNEGO ODCZYTU
 * ===========================================================================
 * Kontrakt emituje `FeeAccrued(token, account, amount, kind)` przy KAZDYM
 * naliczeniu, a strona i tak subskrybuje zdarzenia launchpada. Te logi juz
 * dolatywaly - byly tylko ignorowane. Doliczamy je do tego, co na ekranie,
 * dokladnie tak jak rezerwy bierzemy prosto z `ethReserveAfter`, a nie z
 * wlasnej arytmetyki.
 *
 * ===========================================================================
 * CZEGO TU NIE MA
 * ===========================================================================
 * Vault. `Harvested` niesie CALE oplaty puli, a nie twoja z nich czesc -
 * podzial robi `PROTOCOL_SHARE_BPS` wewnatrz kontraktu, z zaokragleniem w dol.
 * Odtwarzanie go tutaj znaczyloby druga implementacje tej samej reguly, ktora
 * moglaby sie z pierwsza rozjechac. Zamiast tego meldujemy `reload` i strona
 * doczytuje salda z lancucha - jedno wywolanie, i to tylko po graduacji.
 */

export type ClaimLog = {
  eventName?: string;
  args?: Record<string, unknown>;
};

export type ClaimContext = {
  /** Podlaczone konto, malymi literami. Null = nikt nie patrzy na swoje salda. */
  viewer: string | null;
  /** Adres tokena tej strony, malymi literami. */
  token: string;
  /** Czy podlaczone konto jest tworca TEGO tokena. */
  isCreator: boolean;
};

const lower = (value: unknown): string | null =>
  typeof value === 'string' ? value.toLowerCase() : null;

const wei = (value: unknown): bigint => (typeof value === 'bigint' ? value : 0n);

/**
 * Czy w tej paczce logow jest cos, czego nie umiemy policzyc na miejscu.
 *
 * Osobna funkcja, a nie pole w wyniku obliczenia: wolajacy potrzebuje tej
 * odpowiedzi POZA reduktorem Reacta, a reduktor w trybie scislym wola sie dwa
 * razy - skutek uboczny w srodku byl by wtedy policzony dwa razy.
 */
export function claimsNeedReload(logs: ClaimLog[], ctx: ClaimContext): boolean {
  if (!ctx.viewer) return false;
  return logs.some((log) => log.eventName === 'Harvested' && lower(log.args?.token) === ctx.token);
}

/**
 * Doklada do stanu skutki zdarzen, ktore da sie policzyc dokladnie.
 *
 * `reload: true` znaczy "widzialem cos, czego nie umiem policzyc" - wolajacy ma
 * wtedy doczytac salda z lancucha zamiast zgadywac.
 */
export function applyClaimLogs(
  core: CoreState,
  logs: ClaimLog[],
  ctx: ClaimContext
): { core: CoreState; reload: boolean } {
  if (!ctx.viewer) return { core, reload: false };

  let next = core;
  const patch = (change: Partial<CoreState>) => {
    next = { ...next, ...change };
  };

  for (const log of logs) {
    const name = log.eventName;
    const args = log.args ?? {};

    if (name === 'FeeAccrued') {
      // Saldo `claimable` jest per KONTO, a nie per token - oplata naliczona na
      // dowolnym tokenie powieksza to samo saldo. Dlatego tu NIE filtrujemy po
      // adresie tokena: gdyby ktos handlowal drugim twoim tokenem, liczba na
      // ekranie i tak by o tym mowila prawde.
      if (lower(args.account) !== ctx.viewer) continue;
      const amount = wei(args.amount);
      if (amount > 0n) patch({ launchClaimable: next.launchClaimable + amount });
      continue;
    }

    if (name === 'Claimed') {
      // `_payout` wyplaca CALE saldo i zeruje je w tej samej transakcji, wiec
      // po swoim claimie panel ma pokazac zero od razu, a nie do przeladowania.
      if (lower(args.account) !== ctx.viewer) continue;
      patch({ launchClaimable: 0n });
      continue;
    }

    if (name === 'HookFeeSettled') {
      // Hook ksieguje tworcy jego czesc oplat puli JUZ PO potraceniu
      // auto-buybacku, wiec `ethToCreator` i `tokenToCreator` sa dokladnie tym,
      // co doszlo do salda - bez odtwarzania podzialu po naszej stronie.
      if (!ctx.isCreator || lower(args.token) !== ctx.token) continue;
      const eth = wei(args.ethToCreator);
      const token = wei(args.tokenToCreator);
      if (eth > 0n || token > 0n) {
        patch({
          hookEthClaimable: next.hookEthClaimable + eth,
          hookTokenClaimable: next.hookTokenClaimable + token,
        });
      }
      continue;
    }

    // `Harvested` (oplaty puli) nie zmienia tu niczego - patrz naglowek i
    // `claimsNeedReload`: podzialu nie odtwarzamy, tylko doczytujemy.
  }

  return { core: next, reload: claimsNeedReload(logs, ctx) };
}

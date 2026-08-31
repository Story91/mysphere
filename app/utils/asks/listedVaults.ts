import type { VaultFacts, VaultListResult } from '../morpho/types';

/**
 * Notowane skarbce dla kompozytora - odczyt Z PRZEGLADARKI, przez wlasna trase.
 *
 * === DLACZEGO NIE PROSTO DO api.morpho.org ===
 * Bo cache ma stac w jednym miejscu i byc WSPOLNY dla wszystkich czytelnikow.
 * Zapytanie z przegladarki znaczy tyle zimnych cache, ilu ludzi otworzylo feed.
 * Pelne uzasadnienie stoi w app/utils/morpho/cache.ts; tutaj tylko klient tej
 * trasy.
 *
 * === DLACZEGO TEN PLIK NIE IMPORTUJE WARSTWY MORPHO ===
 * Poza typami - nic stamtad. Tamten kod trzyma cache w pamieci PROCESU
 * SERWERA, wiec wciagniety do bundla klienta bylby cache'em jednej karty
 * przegladarki, ktory na dodatek laczy sie z Morpho bezposrednio. Granica
 * jest tu celowa: serwer czyta Morpho, przegladarka czyta serwer.
 *
 * === NIC STAD NIE RZUCA ===
 * Kazda sciezka konczy sie `VaultListResult`, takze siec bez internetu i HTML
 * z proxy zamiast JSON-a. Rzucona obietnica przewrocilaby kompozytor, w ktorym
 * ktos wlasnie wpisuje budzet - a wybor skarbca jest w tym formularzu
 * DODATKIEM. Ask ma sie dac zalozyc, gdy Morpho milczy.
 */

const VAULTS_ENDPOINT = '/api/morpho/vaults';

/** Czy to naprawde `VaultFacts`, a nie cokolwiek, co przyszlo JSON-em. */
function looksLikeFacts(value: unknown): value is VaultFacts {
  if (typeof value !== 'object' || value === null) return false;
  const facts = value as Record<string, unknown>;
  return (
    typeof facts.address === 'string' &&
    facts.address !== '' &&
    typeof facts.name === 'string' &&
    typeof facts.fetchedAt === 'number'
  );
}

export async function loadListedVaults(): Promise<VaultListResult> {
  try {
    const response = await fetch(VAULTS_ENDPOINT, { headers: { Accept: 'application/json' } });
    const payload: unknown = await response.json();

    if (typeof payload !== 'object' || payload === null) return { ok: false, reason: 'malformed' };
    const body = payload as Record<string, unknown>;

    // Trasa oddaje `VaultListResult` takze przy awarii (503/502), wiec powod
    // bierzemy Z ODPOWIEDZI, a nie zgadujemy go z kodu HTTP.
    if (body.ok === false) {
      const reason = body.reason;
      return {
        ok: false,
        reason:
          reason === 'not-found' || reason === 'malformed' || reason === 'unavailable'
            ? reason
            : 'malformed',
      };
    }

    if (body.ok !== true || !Array.isArray(body.vaults)) return { ok: false, reason: 'malformed' };

    // Odsiewamy pojedyncze popsute wpisy zamiast odrzucac cala liste: jeden
    // skarbiec bez nazwy nie jest powodem, zeby zabrac czlowiekowi wybor
    // z pozostalych. Pusta lista po odsiewie to juz jednak nie jest lista.
    const vaults = body.vaults.filter(looksLikeFacts);
    if (vaults.length === 0 && body.vaults.length > 0) return { ok: false, reason: 'malformed' };

    return { ok: true, vaults };
  } catch (error) {
    // Brak sieci, przerwany fetch, HTML zamiast JSON-a. Z punktu widzenia
    // czlowieka to jedno: nie dalo sie sprawdzic.
    console.error('[asks] Lista skarbcow nie doszla:', error);
    return { ok: false, reason: 'unavailable' };
  }
}

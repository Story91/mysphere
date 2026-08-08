/**
 * WYBOR FACILITATORA PER SIEC.
 *
 * === PROBLEM, KTORY TEN PLIK ROZWIAZUJE ===
 * Odpowiedz 402 moze ogloszic WIELE pozycji w `accepts` - i to klient wybiera,
 * czym zaplaci. Ale kazda siec rozlicza sie u INNEGO facilitatora:
 *
 *   eip155:8453 (Base, USDC)            -> Coinbase CDP, WYMAGA kluczy w naglowku
 *   eip155:4663 (Robinhood Chain, USDG) -> https://x402.primer.systems, bez klucza
 *
 * Jedna zmienna X402_FACILITATOR_URL tego nie unosi i wlasnie na tym raz juz
 * polegl ten kod: route.ts sprawdzal `if (url)` PIERWSZE, wiec ustawienie adresu
 * CDP w tej zmiennej budowalo klienta BEZ uwierzytelnienia, a CDP bez klucza
 * odpowiada 401. Zamiast pilnowac kolejnosci ifow, wybor jest tu jawna mapa
 * siec -> facilitator.
 *
 * === DLACZEGO ROUTER, A NIE TABLICA KLIENTOW ===
 * x402ResourceServer przyjmuje TABLICE facilitatorow i sam mapuje
 * (wersja, siec, schemat) -> klient na podstawie ich odpowiedzi /supported,
 * przy czym WCZESNIEJSZY W TABLICY WYGRYWA (@x402/core, x402ResourceServer.
 * initialize). Wygladalo to na gotowe rozwiazanie i NIM NIE JEST, bo zakresy
 * facilitatorow SIE NAKLADAJA. Sprawdzone na zywo 2026-08-08:
 *
 *   CDP /supported    deklaruje eip155:8453, NIE deklaruje eip155:4663
 *   Primer /supported deklaruje eip155:4663 ORAZ eip155:8453
 *
 * Czyli przy naturalnej kolejnosci [Primer, CDP] - a taka wychodzi, gdy siec
 * glowna to Robinhood - platnosci na BASE poszlyby do Primera, mimo ze cala
 * konfiguracja i klucze mowia CDP. Nikt by tego nie zauwazyl, bo Primer Base
 * obsluguje i platnosc by przeszla. Ten router przypisuje siec do facilitatora
 * JAWNIE i nie zostawia tego kolejnosci elementow tablicy.
 */

import { HTTPFacilitatorClient } from '@x402/core/server';
import type { FacilitatorClient } from '@x402/core/server';
import type {
  Network,
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  SupportedKind,
  SupportedResponse,
  VerifyResponse,
} from '@x402/core/types';
// Uwierzytelnienie facilitatora Coinbase. Ten modul jest importowany WYLACZNIE
// z tras na runtime nodejs - CDP SDK stoi na axios i jose, ktore w Edge nie maja
// setImmediate ani CompressionStream i wywracaja wdrozenie (patrz route.ts).
import { createFacilitatorConfig } from '@coinbase/x402';
import type { AskFacilitatorPlan } from '../../api/asks/pricing';

/** Siec razem z planem facilitatora, ktory ma ja rozliczac. */
export interface NetworkFacilitatorPlan {
  network: Network;
  facilitator: AskFacilitatorPlan;
}

/**
 * Klucz tozsamosci facilitatora. Dwie sieci wskazujace ten sam plan dostaja
 * JEDNEGO klienta - inaczej odpytalibysmy ten sam /supported dwa razy przy
 * starcie instancji.
 */
function planKey(plan: AskFacilitatorPlan): string {
  switch (plan.kind) {
    case 'url':
      return `url:${plan.url}`;
    case 'cdp':
      return 'cdp';
    default:
      return 'public';
  }
}

/**
 * Buduje klienta HTTP dla jednego planu.
 *
 * Klucze CDP czytamy TUTAJ, a nie przy ladowaniu modulu: pricing.ts oddaje plan
 * `cdp` wylacznie wtedy, gdy obie zmienne sa ustawione, wiec brak kluczy w tym
 * miejscu oznacza, ze env zmienil sie pod nogami. Wtedy zamiast po cichu
 * zbudowac klienta bez naglowkow (czyli pewne 401 przy pierwszej platnosci)
 * odmawiamy glosno.
 */
function createFacilitatorClient(plan: AskFacilitatorPlan): FacilitatorClient {
  if (plan.kind === 'url') {
    return new HTTPFacilitatorClient({ url: plan.url });
  }
  if (plan.kind === 'cdp') {
    const id = process.env.CDP_API_KEY_ID?.trim();
    const secret = process.env.CDP_API_KEY_SECRET?.trim();
    if (!id || !secret) {
      throw new Error(
        'CDP facilitator selected without CDP_API_KEY_ID / CDP_API_KEY_SECRET - it would answer 401'
      );
    }
    return new HTTPFacilitatorClient(createFacilitatorConfig(id, secret));
  }
  // Publiczny x402.org. Dla EVM deklaruje wylacznie Base Sepolia.
  return new HTTPFacilitatorClient();
}

/**
 * Facilitator, ktory kieruje kazde verify/settle do wlasciwego facilitatora
 * po polu `network` wymagan.
 *
 * Implementuje interfejs FacilitatorClient (verify / settle / getSupported),
 * wiec x402ResourceServer dostaje go jako JEDNEGO klienta i cala niejednoznaczna
 * arytmetyka pierwszenstwa z tablicy facilitatorow po prostu nie zachodzi.
 */
export class NetworkRoutedFacilitatorClient implements FacilitatorClient {
  /** siec -> klient, ktory ma ja rozliczac. */
  private readonly clientByNetwork = new Map<string, FacilitatorClient>();

  /** klient -> sieci, ktore mu przypisalismy. Uzywane przy /supported. */
  private readonly networksByClient = new Map<FacilitatorClient, Network[]>();

  constructor(plans: NetworkFacilitatorPlan[]) {
    const byKey = new Map<string, FacilitatorClient>();
    for (const { network, facilitator } of plans) {
      const key = planKey(facilitator);
      let client = byKey.get(key);
      if (!client) {
        client = createFacilitatorClient(facilitator);
        byKey.set(key, client);
        this.networksByClient.set(client, []);
      }
      this.clientByNetwork.set(network, client);
      this.networksByClient.get(client)!.push(network);
    }
  }

  /** Sieci ogloszone przez ten router - do sond i do logow. */
  get networks(): Network[] {
    return Array.from(this.clientByNetwork.keys()) as Network[];
  }

  private pick(network: string): FacilitatorClient {
    const client = this.clientByNetwork.get(network);
    if (!client) {
      // Nie zgadujemy. Platnosc na sieci, ktorej nie ogloszilismy, ma zostac
      // odrzucona, a nie wyslana do przypadkowego facilitatora.
      throw new Error(`No facilitator is configured for network ${network}`);
    }
    return client;
  }

  verify(
    paymentPayload: PaymentPayload,
    paymentRequirements: PaymentRequirements
  ): Promise<VerifyResponse> {
    return this.pick(paymentRequirements.network).verify(paymentPayload, paymentRequirements);
  }

  settle(
    paymentPayload: PaymentPayload,
    paymentRequirements: PaymentRequirements
  ): Promise<SettleResponse> {
    return this.pick(paymentRequirements.network).settle(paymentPayload, paymentRequirements);
  }

  /**
   * Suma tego, co deklaruja podlegli facilitatorzy - ale PRZYCIETA do sieci,
   * ktore im przypisalismy. To jest miejsce, w ktorym zabijamy nakladanie sie
   * zakresow: Primer deklaruje takze eip155:8453, a mimo to nie zobaczy go tu
   * nikt, bo Base przypisalismy do CDP.
   *
   * === CO SIE DZIEJE, GDY JEDEN FACILITATOR NIE ODPOWIE ===
   * Podstawiamy za niego JEGO WLASNE sieci ze schematem `exact` i logujemy to
   * glosno. Powod jest konkretny: @x402/next wola initialize() przed pierwszym
   * zadaniem, a x402HTTPResourceServer.validateRouteConfiguration RZUCA, jesli
   * ktorakolwiek pozycja `accepts` nie ma pokrycia w /supported. Bez tego
   * podstawienia chwilowa awaria CDP wywracalaby cala trase POST /api/asks -
   * lacznie ze sciezka USDG, ktora z CDP nie ma nic wspolnego.
   *
   * TO NIE JEST OBIETNICA, ZE PLATNOSC PRZEJDZIE. Odpowiedz 402 to wycena,
   * nie gwarancja dostepnosci facilitatora. Jesli facilitator lezy, verify
   * odmowi i agent dostanie uczciwe 402 z powodem - nikomu nie pobierzemy
   * pieniedzy za nic.
   */
  async getSupported(): Promise<SupportedResponse> {
    const kinds: SupportedKind[] = [];
    const signers: Record<string, string[]> = {};
    const extensionSets: string[][] = [];

    for (const [client, networks] of this.networksByClient) {
      const mine = new Set<string>(networks);
      try {
        const supported = await client.getSupported();
        kinds.push(...supported.kinds.filter((kind) => mine.has(kind.network)));
        extensionSets.push(supported.extensions ?? []);
        for (const [family, list] of Object.entries(supported.signers ?? {})) {
          signers[family] = Array.from(new Set([...(signers[family] ?? []), ...list]));
        }
      } catch (error) {
        console.warn(
          `[x402] facilitator /supported nie odpowiedzial dla ${networks.join(', ')} - ` +
            `ogloszenie 402 zostaje, ale platnosci na tych sieciach beda odrzucane az do powrotu facilitatora: ${
              error instanceof Error ? error.message : String(error)
            }`
        );
        for (const network of networks) {
          kinds.push({ x402Version: 2, scheme: 'exact', network });
        }
        // Facilitator, ktorego nie odpytalismy, nie moze potwierdzic ZADNEGO
        // rozszerzenia - stad pusty zbior, ktory przetnie liste do zera.
        extensionSets.push([]);
      }
    }

    // PRZECIECIE, NIE SUMA. @x402/core trzyma jedna odpowiedz /supported na pare
    // (siec, schemat), ale my oddajemy jeden obiekt na wszystkie sieci - wiec
    // suma oznaczalaby przypisanie rozszerzen CDP takze sieci Robinhood.
    // Deklarujemy tylko to, co ma KAZDY z facilitatorow.
    const extensions =
      extensionSets.length === 0
        ? []
        : extensionSets.reduce((acc, set) => acc.filter((key) => set.includes(key)));

    return { kinds, extensions, signers };
  }
}

/**
 * Wspolne typy i stale warstwy monetyzacji (REDEFINICJA.md, faza 2:
 * "pieniadz w social, ale nie spekulacja").
 *
 * Dwa mechanizmy:
 *  1. tip-to-unlock - jednorazowa mikroplatnosc odblokowujaca fragment posta,
 *  2. wsparcie tworcy na okres - platnosc Z GORY za N dni dostepu.
 *
 * Celowo NIE ma tu zadnego tokena tworcy ani instrumentu spekulacyjnego -
 * to sa zwykle platnosci w ETH/USDC na Base.
 */

/** Tokeny obslugiwane przez monetyzacje. Celowo waskie - tylko Base. */
export type MonetizationToken = 'ETH' | 'USDC';

/** Monetyzacja dziala wylacznie na Base mainnet. */
export const MONETIZATION_NETWORK = 'base' as const;
export const MONETIZATION_CHAIN_ID = 8453;

/**
 * Domyslny token platnosci to USDC, bo transfer ERC-20 zostawia log Transfer,
 * ktory serwer moze zweryfikowac bez trace RPC. Przy natywnym ETH z portfela
 * smart-contract (Base Account) transfer jest wewnetrzny i nie widac go ani w
 * `tx.to`, ani w logach - patrz verifyPayment.ts.
 */
export const DEFAULT_UNLOCK_TOKEN: MonetizationToken = 'USDC';

/**
 * Pola premium doklejane do posta. WSZYSTKIE opcjonalne - post bez nich
 * zachowuje sie dokladnie jak dotad (brak zaslony, brak dodatkowych zapytan).
 */
export interface PremiumPostFields {
  /**
   * Znacznik, ze post ma platna czesc. Sama tresc NIE jest juz w dokumencie
   * posta - wydaje ja trasa /api/premium po sprawdzeniu odblokowania. To pole
   * jest jedynym, co feed musi wiedziec, zeby narysowac zaslone.
   */
  hasPremium?: boolean;
  /**
   * ZGODNOSC WSTECZ. Posty sprzed przeniesienia tresci do osobnej kolekcji
   * maja ja tutaj - i wciaz jest publiczna, bo feed czyta dokument posta w
   * calosci. Nowe posty tego pola nie zapisuja.
   */
  premiumContent?: string;
  /** Cena odblokowania jako string dziesietny, np. "0.5". */
  unlockPrice?: string;
  /** Token ceny. Brak = DEFAULT_UNLOCK_TOKEN. */
  unlockToken?: MonetizationToken;
}

/** Jak dokladnie serwer potwierdzil platnosc - zapisywane razem z rekordem. */
export type PaymentVerificationLevel =
  /** Sprawdzono odbiorce i kwote na lancuchu. */
  | 'strict'
  /** Potwierdzono tylko, ze transakcja weszla i NIE zostala cofnieta. */
  | 'receipt-only';

/** Rekord odblokowania: jeden dokument na pare (postId, walletAddress). */
export interface PostUnlock {
  postId: string;
  /** Zawsze lowercase - adresy porownujemy case-insensitive. */
  walletAddress: string;
  creatorAddress: string;
  amount: string;
  token: MonetizationToken;
  network: typeof MONETIZATION_NETWORK;
  chainId: number;
  txHash: string;
  unlockedAt: number;
  verified: PaymentVerificationLevel;
}

/** Poziomy wsparcia. Cena w USDC za 30 dni. */
export type SubscriptionTierId = 'supporter' | 'insider' | 'patron';

export interface SubscriptionTier {
  id: SubscriptionTierId;
  label: string;
  /** Cena za jeden 30-dniowy okres, w USDC. */
  pricePerPeriod: string;
  description: string;
}

export const SUBSCRIPTION_TIERS: SubscriptionTier[] = [
  { id: 'supporter', label: 'Supporter', pricePerPeriod: '1', description: 'Small thanks for the posts' },
  { id: 'insider', label: 'Insider', pricePerPeriod: '5', description: 'Regular backing for a creator' },
  { id: 'patron', label: 'Patron', pricePerPeriod: '25', description: 'Serious, long-term support' },
];

/** Dlugosc jednego okresu w dniach. */
export const SUBSCRIPTION_PERIOD_DAYS = 30;

/** Ile okresow mozna kupic jednym przelewem (30 / 90 / 180 dni). */
export const SUBSCRIPTION_PERIOD_CHOICES = [1, 3, 6];

export const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Rekord wsparcia: jeden dokument na pare (subscriberAddress, creatorAddress).
 *
 * UWAGA - to NIE jest subskrypcja odnawialna. Onchain nie ma tu zadnej
 * cyklicznosci: uzytkownik placi z gory za okres, a dostep gasnie o
 * `expiresAt`. Nic sie nie odnawia samo, nikt nie ma zgody na pobranie
 * kolejnej platnosci. Prawdziwa cyklicznosc wymagalaby spend permissions
 * (Base Account) albo subskrypcji x402 - poza zakresem tej fazy.
 */
export interface CreatorSubscription {
  subscriberAddress: string;
  creatorAddress: string;
  tier: SubscriptionTierId;
  /** Ile dni dostepu kupiono ostatnia platnoscia. */
  periodDays: number;
  /** Poczatek najwczesniejszego wsparcia (nie resetuje sie przy przedluzeniu). */
  startedAt: number;
  /** Moment wygasniecia dostepu. Po nim rekord zostaje, ale jest nieaktywny. */
  expiresAt: number;
  lastPaymentTx: string;
  amount: string;
  token: MonetizationToken;
  network: typeof MONETIZATION_NETWORK;
  chainId: number;
  updatedAt: number;
  verified: PaymentVerificationLevel;
}

/** Czy wsparcie jest w tej chwili aktywne. */
export function isSubscriptionActive(
  subscription: Pick<CreatorSubscription, 'expiresAt'> | null | undefined,
  now: number = Date.now()
): boolean {
  return !!subscription && subscription.expiresAt > now;
}

/**
 * Czy post w ogole ma czesc premium. Tania sciezka dla feedu.
 *
 * Nowe posty niosa `hasPremium`, stare - sama tresc w `premiumContent`.
 * Cena musi byc dodatnia w obu przypadkach: post z cena 0 nie jest platny,
 * tylko zle zapisany.
 */
export function hasPremiumContent(post: PremiumPostFields | null | undefined): boolean {
  const priced = !!post?.unlockPrice && parseFloat(post.unlockPrice) > 0;
  return priced && (post?.hasPremium === true || !!post?.premiumContent);
}

const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
const TX_HASH_REGEX = /^0x[a-fA-F0-9]{64}$/;

export function isValidAddress(value: unknown): value is string {
  return typeof value === 'string' && ADDRESS_REGEX.test(value);
}

export function isValidTxHash(value: unknown): value is `0x${string}` {
  return typeof value === 'string' && TX_HASH_REGEX.test(value);
}

/** Kwota jako dodatnia liczba dziesietna w stringu. */
export function isValidAmount(value: unknown): value is string {
  if (typeof value !== 'string' || value.trim() === '') return false;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0;
}

export function normalizeAddress(address: string): string {
  return address.toLowerCase();
}

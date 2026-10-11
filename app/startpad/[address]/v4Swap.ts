import { encodeAbiParameters, type Address } from 'viem';
import { base } from 'viem/chains';

/**
 * HANDEL PO GRADUACJI - przez pule Uniswap v4, nie przez krzywa.
 *
 * ===========================================================================
 * DLACZEGO UNIVERSAL ROUTER, A NIE WLASNY KONTRAKT
 * ===========================================================================
 * Pula v4 nie ma funkcji swap dla zwyklego portfela: kazda wymiana idzie
 * przez `PoolManager.unlock` i wymaga kontraktu z callbackiem. Uniswap
 * wystawia do tego Universal Router - kanoniczny, audytowany, ten sam, przez
 * ktory ida swapy z app.uniswap.org i agregatorow. Wlasny router to nowa
 * powierzchnia audytu za zero korzysci.
 *
 * Adresy WYLACZNIE dla sieci, w ktorych sa potwierdzone w oficjalnej liscie
 * wdrozen Uniswapa (developers.uniswap.org/contracts/v4/deployments,
 * odczyt 2026-09-02). Sieci bez wpisu nie dostaja handlu z puli - zgadniety
 * adres routera to gorsza odpowiedz niz jej brak.
 *
 * ===========================================================================
 * KODOWANIE (universal-router Commands.sol + v4-periphery Actions.sol)
 * ===========================================================================
 *   commands = 0x10 (V4_SWAP)
 *   inputs[0] = abi.encode(actions, params)
 *     actions = 0x06 SWAP_EXACT_IN_SINGLE | 0x0c SETTLE_ALL | 0x0f TAKE_ALL
 *     params[0] = abi.encode(ExactInputSingleParams{poolKey, zeroForOne,
 *                 amountIn, amountOutMinimum, hookData})
 *     params[1] = abi.encode(currencyIn,  amountIn)   // SETTLE_ALL
 *     params[2] = abi.encode(currencyOut, minOut)     // TAKE_ALL
 *
 * Natywny ETH jako currency0 = address(0): przy kupnie ETH idzie w msg.value,
 * przy sprzedazy token jest sciagany przez Permit2 (dwa zatwierdzenia:
 * token -> Permit2, Permit2 -> router).
 *
 * Oplata hooka (1%) jest brana z waluty NIEPODANEJ, czyli przy exactIn
 * z WYJSCIA - V4Quoter symuluje prawdziwy swap z hookiem, wiec jego
 * `amountOut` jest juz po oplacie. Nie liczymy jej recznie.
 */

/**
 * `routerTrusted` STERUJE WIELKOSCIA ZGODY, nie tym, czy handel dziala.
 *
 * Sprzedaz idzie przez dwie zgody: `token.approve(Permit2, max)` i
 * `Permit2.approve(token, router, kwota, 30 dni)`. Pierwsza jest bezpieczna na
 * kazdej sieci - Permit2 to jeden kanoniczny, audytowany kontrakt pod tym samym
 * adresem wszedzie i SAM Z SIEBIE nie ruszy ani jednego tokena bez tej drugiej.
 * Cale ryzyko siedzi w drugiej: to ona daje ROUTEROWI prawo pobrania tokenow.
 *
 * Na Base routerem jest kanoniczny UniversalRouter Uniswapa - ten sam, przez
 * ktory ida swapy z app.uniswap.org. Zgoda bez limitu jest tam standardem
 * i nie ma powodu meczyc uzytkownika zatwierdzaniem co sprzedaz.
 *
 * Na Arc routera NIKT nie potwierdza: znalezlismy go sami, przegladajac
 * zdarzenia PoolManagera, ma inny build niz wersja z Base, a jego operator to
 * `0x33F26c5d...51E8`, nie Uniswap. Nasz test dowodzi, ze DZIS dziala poprawnie
 * - nie dowodzi, kto go kontroluje ani jak zachowa sie jutro. Dlatego tam zgoda
 * jest na DOKLADNA KWOTE jednej sprzedazy: ewentualna szkoda jest ograniczona do
 * tego, co uzytkownik wlasnie sprzedaje, zamiast do calego salda przez 30 dni.
 *
 * Cena: na Arc kazda sprzedaz wymaga zatwierdzenia. To swiadomy kompromis -
 * jedno dodatkowe klikniecie za nieoddawanie calego salda obcemu kontraktowi.
 */
export const V4_BY_CHAIN: Record<
  number,
  { universalRouter: Address; permit2: Address; quoter: Address; routerTrusted: boolean } | undefined
> = {
  [base.id]: {
    universalRouter: '0x6ff5693b99212da76ad316178a184ab56d299b43',
    permit2: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
    quoter: '0x0d5e0f971ed27fbff6c2837bf31316121532048d',
    // Kanoniczny router z oficjalnej listy wdrozen Uniswapa.
    routerTrusted: true,
  },
  /**
   * ARC MAINNET (5042). Wyjatek od reguly "tylko z oficjalnej listy Uniswapa":
   * Uniswap NIE listuje Arc (odczyt 16.09.2026). Dlatego kazdy z tych trzech
   * adresow ma wlasny, osobny dowod - i zaden nie pochodzi z dokumentacji.
   *
   *   quoter   V4Quoter, 6118 B. Adres z docs.o1.exchange (sekcja Arc Mainnet),
   *            potwierdzony `eth_getCode`. Ten sam adres co V4Quoter na
   *            Robinhood Chain (4663), ktore Uniswap listuje OFICJALNIE - czyli
   *            to samo wdrozenie tego samego operatora na dwoch sieciach.
   *   permit2  kanoniczny, 9152 B, `eth_getCode` na 5042.
   *   universalRouter  ZNALEZIONY ODCZYTEM Z LANCUCHA, nie z dokumentacji:
   *            przeszukanie zdarzen `Swap` PoolManagera wskazalo go jako
   *            najaktywniejszego wolajacego (2889 swapow v4 w probce ~1800
   *            blokow). 24 546 B, ma selektor `execute(bytes,bytes[],uint256)`
   *            (0x3593564c), a w runtime ma ZASZYTE adresy naszego PoolManagera
   *            0x8366a39c... i Permit2 - czyli routuje dokladnie te pule,
   *            ktorych uzywamy.
   *
   * UWAGA: to INNY build niz Universal Router na Base (24 546 B vs 19 499 B),
   * wiec rownosc bajtkodu nie jest tu argumentem. Dowodem jest PRZEBIEG:
   * test/ArcForkMainnet.test.ts wykonuje przez ten router prawdziwy swap na
   * forku Arc, tym samym `encodeV4ExactInSingle`, ktorego uzywa to UI.
   * Gdyby router przestal dzialac, ten test spada - i to jest cala gwarancja,
   * jaka mamy. Zadna z tych trzech pozycji nie jest potwierdzona przez Uniswapa.
   */
  5042: {
    universalRouter: '0x4fca4a51ab4f23a7447b3284fbd7d73289a89fb1',
    permit2: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
    quoter: '0x8Dc178eFB8111BB0973Dd9d722ebeFF267c98F94',
    // Router spoza jakiejkolwiek listy - zgoda tylko na kwote jednej sprzedazy.
    routerTrusted: false,
  },
};

/** Parametry puli kanonicznej - stale CurveLaunchpad (POOL_FEE, POOL_TICK_SPACING). */
export const CANONICAL_POOL_FEE = 3000;
export const CANONICAL_TICK_SPACING = 60;
export const NATIVE = '0x0000000000000000000000000000000000000000' as Address;

export type PoolKey = {
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
};

/**
 * Klucz puli tokena z pada: ETH jako currency0, token jako currency1, hook
 * launchpada. Na rynku Q para to aktywo (ETH2xL...) i token, w kolejnosci
 * adresow - v4 wymaga currency0 < currency1 (patrz QuoteCurveLaunchpad.poolKeyOf).
 */
export function canonicalPoolKey(token: Address, hooks: Address, quote?: Address | null): PoolKey {
  if (!quote) return { currency0: NATIVE, currency1: token, fee: CANONICAL_POOL_FEE, tickSpacing: CANONICAL_TICK_SPACING, hooks };
  const quoteIs0 = BigInt(quote) < BigInt(token);
  return {
    currency0: quoteIs0 ? quote : token,
    currency1: quoteIs0 ? token : quote,
    fee: CANONICAL_POOL_FEE,
    tickSpacing: CANONICAL_TICK_SPACING,
    hooks,
  };
}

/** Kierunek KUPNA tokena w puli: ETH/aktywo -> token. Na rynku ETH zawsze zeroForOne. */
export function buyIsZeroForOne(token: Address, quote?: Address | null): boolean {
  return quote ? BigInt(quote) < BigInt(token) : true;
}

export const universalRouterAbi = [
  {
    type: 'function',
    name: 'execute',
    stateMutability: 'payable',
    inputs: [
      { name: 'commands', type: 'bytes' },
      { name: 'inputs', type: 'bytes[]' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [],
  },
] as const;

export const permit2Abi = [
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint160' },
      { name: 'expiration', type: 'uint48' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'token', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [
      { name: 'amount', type: 'uint160' },
      { name: 'expiration', type: 'uint48' },
      { name: 'nonce', type: 'uint48' },
    ],
  },
] as const;

const POOL_KEY_COMPONENTS = [
  { name: 'currency0', type: 'address' },
  { name: 'currency1', type: 'address' },
  { name: 'fee', type: 'uint24' },
  { name: 'tickSpacing', type: 'int24' },
  { name: 'hooks', type: 'address' },
] as const;

/**
 * V4Quoter.quoteExactInputSingle NIE jest `view` w zrodle (symuluje swap
 * i lapie wlasny rewert), ale jest przeznaczone do eth_call - dlatego tutaj
 * deklarujemy `view`, zeby viem uzyl `readContract` zamiast transakcji.
 */
export const v4QuoterAbi = [
  {
    type: 'function',
    name: 'quoteExactInputSingle',
    stateMutability: 'view',
    inputs: [
      {
        name: 'params',
        type: 'tuple',
        components: [
          { name: 'poolKey', type: 'tuple', components: POOL_KEY_COMPONENTS },
          { name: 'zeroForOne', type: 'bool' },
          { name: 'exactAmount', type: 'uint128' },
          { name: 'hookData', type: 'bytes' },
        ],
      },
    ],
    outputs: [
      { name: 'amountOut', type: 'uint256' },
      { name: 'gasEstimate', type: 'uint256' },
    ],
  },
] as const;

const COMMAND_V4_SWAP = '0x10' as const;
const ACTIONS_EXACT_IN_SETTLE_TAKE = '0x060c0f' as const;

/**
 * Buduje argumenty `execute()` dla jednej wymiany exactIn w puli kanonicznej.
 * `zeroForOne = true` to kupno tokena za ETH (currency0 -> currency1).
 */
export function encodeV4ExactInSingle(input: {
  poolKey: PoolKey;
  zeroForOne: boolean;
  amountIn: bigint;
  minOut: bigint;
}): { commands: `0x${string}`; inputs: `0x${string}`[] } {
  const { poolKey, zeroForOne, amountIn, minOut } = input;
  const swap = encodeAbiParameters(
    [
      {
        type: 'tuple',
        components: [
          { name: 'poolKey', type: 'tuple', components: POOL_KEY_COMPONENTS },
          { name: 'zeroForOne', type: 'bool' },
          { name: 'amountIn', type: 'uint128' },
          { name: 'amountOutMinimum', type: 'uint128' },
          { name: 'hookData', type: 'bytes' },
        ],
      },
    ],
    [{ poolKey, zeroForOne, amountIn, amountOutMinimum: minOut, hookData: '0x' }]
  );
  const currencyIn = zeroForOne ? poolKey.currency0 : poolKey.currency1;
  const currencyOut = zeroForOne ? poolKey.currency1 : poolKey.currency0;
  const settle = encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [currencyIn, amountIn]);
  const take = encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [currencyOut, minOut]);
  const v4Input = encodeAbiParameters([{ type: 'bytes' }, { type: 'bytes[]' }], [ACTIONS_EXACT_IN_SETTLE_TAKE, [swap, settle, take]]);
  return { commands: COMMAND_V4_SWAP, inputs: [v4Input] };
}

/** uint160 max - "bez limitu" dla Permit2, tak jak robi to interfejs Uniswapa. */
export const PERMIT2_MAX_AMOUNT = (1n << 160n) - 1n;
/** 30 dni - Permit2 wymaga uint48 z data wygasniecia. */
export function permit2Expiration(nowSeconds: number): number {
  return nowSeconds + 30 * 24 * 3600;
}

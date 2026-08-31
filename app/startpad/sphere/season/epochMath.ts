/**
 * epochMath - DETERMINISTYCZNE liczenie sezonu volume mining (spec 6.1/6.2).
 *
 * Czyste funkcje: (surowe zdarzenia epoki) -> (wynik per tworca z pelnym
 * sladem "dlaczego tyle"). Zero sieci, zero czasu systemowego - te same
 * wejscia daja ZAWSZE ten sam wynik, wiec kazdy moze przeliczyc epoke
 * u siebie (wymog publicznej odtwarzalnosci ze speca).
 *
 * KOLEJNOSC OPERACJI (dokladnie ta, ktora pokazuje UI w breakdownie):
 *  1. wolumen zewnetrzny tokena = curve(ethNet+ethGross, BEZ adresu tworcy)
 *     + post-grad ETH-strona (HookFeeTaken(isEth) * 100 - proxy; v1 bez
 *     wykluczenia self, nazwane w specu)
 *  2. bramka wieku: token liczy sie od startedAt + 48h
 *  3. waga tokena = sqrt(wolumen) * mnoznik unikalnych traderow
 *     (<10 -> 0.5x, 10-100 -> 1.0x, >100 -> 1.2x; traderzy z krzywej)
 *  4. cap 10% puli na token (po wagach, iteracyjnie z redystrybucja)
 *  5. REGULA 0: sufit nagrody tworcy = BETA * jego wklad netto do fee
 *     protokolu w ETH (FeeAccrued kind 0/2 na konto Safe + 30% ETH-owych
 *     HookFeeTaken jego tokenow) - self-wash zawsze ujemny.
 */

export const EPOCH_BLOCKS = 302_400n; // 7 dni po ~2 s
export const SEASON_GENESIS_BLOCK = 49_843_030n; // deployBlock pada na Base
export const AGE_GATE_SECONDS = 48n * 3600n;
export const BETA_BPS = 3000n; // regula 0: sufit = 30% wkladu netto
export const TOKEN_POOL_CAP_BPS = 1000n; // max 10% puli na token
export const PROTOCOL_SHARE_BPS = 3000n;

export type TokenEpochInput = {
  token: string;
  creator: string;
  startedAt: bigint; // unix z eventu Launched
  curveBuyNet: bigint; // suma Bought.ethNet, buyer != creator
  curveSellGross: bigint; // suma Sold.ethGross, seller != creator
  curveSelfVolume: bigint; // wykluczony wolumen wlasny tworcy (do pokazania)
  hookEthFees: bigint; // suma HookFeeTaken(isEth=true).amount
  protocolFeeEth: bigint; // FeeAccrued(account=Safe, kind 0/2) dla tokena
  uniqueTraders: number; // unikalni buyer/seller z krzywej (bez tworcy)
};

export type TokenScore = TokenEpochInput & {
  externalVolume: bigint;
  ageEligible: boolean;
  traderMultiplierBps: bigint;
  weight: bigint; // sqrt(volume) * mult, 0 gdy bramka wieku tnie
  cappedWeight: bigint; // po capie 10% puli
  netProtocolEth: bigint; // wklad netto tokena (ETH legs)
};

export type CreatorScore = {
  creator: string;
  tokens: TokenScore[];
  rawWeight: bigint;
  shareBps: bigint; // udzial w puli PO wszystkich capach (bps z 10000)
  netProtocolEth: bigint;
  rewardCapEth: bigint; // regula 0: BETA * netProtocolEth
  capBinding: boolean; // czy sufit reguly 0 realnie tnie udzial
};

export type EpochResult = {
  epochIndex: number;
  fromBlock: bigint;
  toBlock: bigint;
  totalExternalVolume: bigint;
  totalProtocolEth: bigint;
  creators: CreatorScore[];
};

/** Pierwiastek calkowity (Newton) - waga sqrt bez floatow. */
export function isqrt(n: bigint): bigint {
  if (n < 0n) throw new Error('isqrt: ujemne');
  if (n < 2n) return n;
  let x = n;
  let y = (x + 1n) / 2n;
  while (y < x) {
    x = y;
    y = (x + n / x) / 2n;
  }
  return x;
}

export function traderMultiplierBps(uniqueTraders: number): bigint {
  if (uniqueTraders < 10) return 5000n;
  if (uniqueTraders <= 100) return 10_000n;
  return 12_000n;
}

export function epochRange(headBlock: bigint): { epochIndex: number; fromBlock: bigint; toBlock: bigint } {
  const sinceGenesis = headBlock > SEASON_GENESIS_BLOCK ? headBlock - SEASON_GENESIS_BLOCK : 0n;
  const epochIndex = Number(sinceGenesis / EPOCH_BLOCKS);
  const fromBlock = SEASON_GENESIS_BLOCK + BigInt(epochIndex) * EPOCH_BLOCKS;
  return { epochIndex, fromBlock, toBlock: fromBlock + EPOCH_BLOCKS - 1n };
}

export function scoreEpoch(
  inputs: TokenEpochInput[],
  epochIndex: number,
  fromBlock: bigint,
  toBlock: bigint,
  epochEndUnix: bigint
): EpochResult {
  // 1-3: wolumen zewnetrzny, bramka wieku, waga tokena.
  const tokens: TokenScore[] = inputs.map((t) => {
    // Post-grad wolumen strony ETH ~= fee * 100 (HOOK_FEE_BPS=100).
    const hookVolume = t.hookEthFees * 100n;
    const externalVolume = t.curveBuyNet + t.curveSellGross + hookVolume;
    const ageEligible = t.startedAt + AGE_GATE_SECONDS <= epochEndUnix;
    const mult = traderMultiplierBps(t.uniqueTraders);
    const weight = ageEligible ? (isqrt(externalVolume) * mult) / 10_000n : 0n;
    const netProtocolEth = t.protocolFeeEth + (t.hookEthFees * PROTOCOL_SHARE_BPS) / 10_000n;
    return { ...t, externalVolume, ageEligible, traderMultiplierBps: mult, weight, cappedWeight: weight, netProtocolEth };
  });

  // 4: cap na token - iteracyjnie, nadwyzka wraca do reszty. EFEKTYWNY cap
  // to max(10%, 1/n): przy n<10 kwalifikowanych tokenach "kazdy <=10%" jest
  // matematycznie niewykonalne (udzialy musza sumowac sie do 100%), wiec cap
  // domyka sie do rownego podzialu; intencja speca (zaden token nie zjada
  // epoki przy WIELU tokenach) zostaje. Zbiega, bo iteracja tylko tnie wagi.
  const eligible = tokens.filter((t) => t.cappedWeight > 0n).length;
  const effectiveCapBps =
    eligible === 0 ? 10_000n : TOKEN_POOL_CAP_BPS > 10_000n / BigInt(eligible) ? TOKEN_POOL_CAP_BPS : (10_000n + BigInt(eligible) - 1n) / BigInt(eligible);
  for (let pass = 0; pass < 16; pass++) {
    const total = tokens.reduce((a, t) => a + t.cappedWeight, 0n);
    if (total === 0n) break;
    const cap = (total * effectiveCapBps) / 10_000n;
    let clipped = false;
    for (const t of tokens) {
      if (t.cappedWeight > cap) {
        t.cappedWeight = cap;
        clipped = true;
      }
    }
    if (!clipped) break;
  }

  // Agregacja per tworca.
  const byCreator = new Map<string, TokenScore[]>();
  for (const t of tokens) {
    const key = t.creator.toLowerCase();
    byCreator.set(key, [...(byCreator.get(key) ?? []), t]);
  }
  const totalWeight = tokens.reduce((a, t) => a + t.cappedWeight, 0n);
  const totalProtocolEth = tokens.reduce((a, t) => a + t.netProtocolEth, 0n);

  const creators: CreatorScore[] = [...byCreator.entries()].map(([creator, ts]) => {
    const rawWeight = ts.reduce((a, t) => a + t.cappedWeight, 0n);
    const shareBps = totalWeight === 0n ? 0n : (rawWeight * 10_000n) / totalWeight;
    const netProtocolEth = ts.reduce((a, t) => a + t.netProtocolEth, 0n);
    const rewardCapEth = (netProtocolEth * BETA_BPS) / 10_000n;
    // 5: REGULA 0. Pula jest w SPHERE kupionym za <= totalProtocolEth * ~40%,
    // wiec udzial * pula nigdy nie przekroczy sufitu, JESLI udzial <=
    // rewardCap / (BETA-owa czesc puli). W shadow pokazujemy sufit wprost;
    // "capBinding" = czy przy puli finansowanej pelnym budzetem sufit tnie.
    const impliedEth = (totalProtocolEth * BETA_BPS * shareBps) / (10_000n * 10_000n);
    return { creator, tokens: ts, rawWeight, shareBps, netProtocolEth, rewardCapEth, capBinding: impliedEth > rewardCapEth };
  });

  creators.sort((a, b) => (b.rawWeight > a.rawWeight ? 1 : b.rawWeight < a.rawWeight ? -1 : 0));

  return {
    epochIndex,
    fromBlock,
    toBlock,
    totalExternalVolume: tokens.reduce((a, t) => a + t.externalVolume, 0n),
    totalProtocolEth,
    creators,
  };
}

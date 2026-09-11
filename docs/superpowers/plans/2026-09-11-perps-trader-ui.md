# Perps trader UI — plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Przebudowac `/derivatives` i `/derivatives/[market]` w ekran dla tradera: wykres + staly panel zlecenia + zakladki, bez zmiany logiki kontraktowej.

**Architecture:** `MarketDetail.tsx` (1887 linii) rozpada sie na czysta matematyke (`math.ts`), typy, dwa hooki (odczyty, zapisy) i siedem komponentow prezentacyjnych; `MarketDetail` tylko sklada je i trzyma stan biletu. Tablica dostaje sekcje "Your positions", baner faucetu i prostszy wiersz. Wykres to `lightweight-charts` importowany dynamicznie, jak w `app/startpad/[address]/PriceChart.tsx`.

**Tech Stack:** Next.js 14 App Router, React 18, wagmi + viem, Tailwind (`--sp-*`), shadcn `components/ui`, lucide-react, lightweight-charts 5, react-hot-toast, hardhat/mocha/chai do testow.

**Spec:** `docs/superpowers/specs/2026-09-11-perps-trader-ui-design.md`

## Global Constraints

- Logika kontraktowa bez zmian: `swap`, `previewOpen`, mapowanie snapshotu, wszystkie `writeContract` przenoszone 1:1.
- Nieudany odczyt to `Unknown`/`Missing`, nigdy zero. Typ `R<T>` zostaje.
- Zero zmyslonych liczb: zmiana ceny liczona z logow `PriceSubmitted` albo nie pokazywana.
- Bez nowych zaleznosci. Paleta `--sp-*`, karty `.sph-card`, shadcn, lucide.
- Kolory up/down: `text-sp-up` / `text-sp-down` (nie `emerald-600`/`red-600`) w nowych plikach.
- Commity jako Story91, bez stopki Co-Authored-By, body po polsku bez diakrytykow (wymog wlasciciela).
- Komentarze w kodzie po polsku bez diakrytykow, UI po angielsku (konwencja modulu).

---

### Task 1: `math.ts` + `types.ts` + test jednostkowy

**Files:**
- Create: `app/derivatives/[market]/math.ts`
- Create: `app/derivatives/[market]/types.ts`
- Create: `test/derivativesMath.test.ts`
- Modify: `app/derivatives/[market]/MarketDetail.tsx` (usunac linie 60-283 i importowac z nowych plikow)

**Interfaces:**
- Produces: `math.ts` eksportuje `WAD`, `BPS`, `USDC_TO_WAD`, `HEALTH_TOP_BPS`, `swap(q,b,isLong,quoteAmount)`, `previewOpen(input: PreviewInput): Preview | null`, typy `PreviewInput`, `Preview`, `SwapResult`, oraz nowe `filterRange(points: PricePoint[], range: ChartRange, now: number): PricePoint[]` i `type ChartRange = '1h' | '6h' | '24h' | 'all'`.
- Produces: `types.ts` eksportuje `R<T>`, `Snapshot`, `Position`, `ActivityItem`, `PricePoint = { time: number; price: bigint }`.

- [ ] **Step 1: Test**

```ts
// test/derivativesMath.test.ts
const { expect } = require('chai');
import { previewOpen, filterRange, WAD } from '../app/derivatives/[market]/math';

const base = {
  quoteReserve: 1000n * WAD, baseReserve: 1000n * WAD,
  tradeFeeBps: 30, maintenanceBps: 500, maxLeverage: 10,
  minMarginUsdc: 5_000_000n, openInterest: 0n, maxOpenInterest: 10_000n * WAD,
  creatorCap: 0n, isCreator: false,
};

describe('derivatives math', () => {
  it('long moves mark up and sets liq below entry', () => {
    const p = previewOpen({ ...base, isLong: true, marginUsdc: 50_000_000n, leverage: 2 })!;
    expect(p.reason).to.equal(null);
    expect(p.markAfter > WAD).to.equal(true);
    expect(p.liqPrice < p.entryPrice).to.equal(true);
  });
  it('short sets liq above entry', () => {
    const p = previewOpen({ ...base, isLong: false, marginUsdc: 50_000_000n, leverage: 2 })!;
    expect(p.liqPrice > p.entryPrice).to.equal(true);
  });
  it('rejects margin below minimum', () => {
    const p = previewOpen({ ...base, isLong: true, marginUsdc: 1_000_000n, leverage: 2 })!;
    expect(p.reason).to.match(/Minimum margin/);
  });
  it('rejects over the OI cap', () => {
    const p = previewOpen({ ...base, maxOpenInterest: 10n * WAD, isLong: true, marginUsdc: 50_000_000n, leverage: 2 })!;
    expect(p.reason).to.match(/open-interest cap/);
  });
  it('returns null outside leverage bounds', () => {
    expect(previewOpen({ ...base, isLong: true, marginUsdc: 50_000_000n, leverage: 11 })).to.equal(null);
  });
  it('filterRange keeps only points inside the window', () => {
    const pts = [{ time: 0, price: 1n }, { time: 3000, price: 2n }, { time: 3500, price: 3n }];
    expect(filterRange(pts, '1h', 3600).map((p) => p.price)).to.deep.equal([2n, 3n]);
    expect(filterRange(pts, 'all', 3600).length).to.equal(3);
  });
});
```

- [ ] **Step 2: Run** `npx hardhat test test/derivativesMath.test.ts` — FAIL (module not found).
- [ ] **Step 3: Przeniesc** linie 60-283 z `MarketDetail.tsx` do `math.ts` (stale + `swap` + `previewOpen` + naglowkowy komentarz) i `types.ts` (`R`, `Snapshot`, `Position`, `ActivityItem`); dodac `PricePoint` i `filterRange`:

```ts
export type ChartRange = '1h' | '6h' | '24h' | 'all';
const RANGE_SEC: Record<Exclude<ChartRange, 'all'>, number> = { '1h': 3600, '6h': 6 * 3600, '24h': 24 * 3600 };
export function filterRange(points: PricePoint[], range: ChartRange, now: number): PricePoint[] {
  if (range === 'all') return points;
  const from = now - RANGE_SEC[range];
  return points.filter((p) => p.time >= from);
}
```

- [ ] **Step 4: Run** test — PASS. `npx tsc --noEmit -p .` bez nowych bledow.
- [ ] **Step 5: Commit** `refactor(perps): matematyka vAMM i typy w osobnych plikach, test previewOpen`

### Task 2: `ui.tsx` wspolne elementy

**Files:**
- Create: `app/derivatives/ui.tsx`
- Modify: `MarketDetail.tsx` (usunac lokalne `useNow`, `Unknown`, `fmtUsdcFine`, `Val`, `TickerCell`, `Row`)

**Interfaces:**
- Produces: `useNow(): number`, `Unknown`, `Val`, `Row`, `fmtUsdcFine`, `UpDown({ value: bigint | number | null, children })` (klasa `text-sp-up`/`text-sp-down`/`text-sp-ink`), `Dot({ tone: 'up' | 'warn' | 'down' })`.

- [ ] Przeniesc definicje 1:1, dodac `UpDown` i `Dot`. `tsc` czysty. Commit `refactor(perps): wspolne elementy UI modulu w ui.tsx`.

### Task 3: hooki `useMarketData` i `useMarketActions`

**Files:**
- Create: `app/derivatives/[market]/useMarketData.ts`
- Create: `app/derivatives/[market]/useMarketActions.ts`
- Modify: `MarketDetail.tsx`

**Interfaces:**
- `useMarketData(market: Address): { snap, position, history: PricePoint[], activity, loading, error, reload }`.
  Historia: z logow `PriceSubmitted` bierze `args.price` i `args.timestamp` (sprawdzic nazwe argumentu w `oracleAbi` w `config.ts`; jesli zdarzenie nie ma timestampu, uzyc `blockNumber` i przeliczyc: `time = headTime - Number(head - blockNumber) * 0.51`, gdzie `headTime` z jednego `getBlock`).
- `useMarketActions({ market, snap, position, reload }): { busy, error, open(side, marginUsdc, leverage), close(), settle(), submitPrice(wad), checkTarget(addr), liquidate(), probe, setProbe }`.
  Po sukcesie `toast.success` z linkiem do `${explorer}/tx/${hash}` (react-hot-toast).

- [ ] Przeniesc `load` i akcje 1:1. `MarketDetail` ma uzywac hookow i renderowac DOKLADNIE to co dzis (etap posredni, zero zmian wizualnych). Sprawdzic w przegladarce, ze strona rynku dziala. Commit `refactor(perps): odczyty i zapisy rynku w hookach`.

### Task 4: `PriceChart.tsx`

**Files:**
- Create: `app/derivatives/[market]/PriceChart.tsx`
- Delete: `app/derivatives/Sparkline.tsx` (po przepieciu; sprawdzic `grep -rn Sparkline app`).

**Interfaces:**
- Props: `{ points: PricePoint[]; mark: bigint | null; entry?: bigint | null; liq?: bigint | null; previewLiq?: bigint | null; previewSide?: 'long' | 'short'; onRefresh: () => void; loading: boolean }`.

- [ ] Dynamiczny `import('lightweight-charts')` w `useEffect`, `LineSeries`, `createPriceLine` dla mark (kolor `rgb(var(--sp-brand))` odczytany przez `getComputedStyle(document.documentElement).getPropertyValue('--sp-brand')` -> `rgb(${v})`), entry (`--sp-up`), liq (`--sp-danger`), previewLiq (`--sp-ink-soft`, `LineStyle.Dashed`). Przelaczniki `1h 6h 24h all` (`filterRange` z `math.ts`, `useNow` z `ui.tsx`), domyslnie `all`. Pusty stan gdy `< 2` punktow. Wysokosc 320 px desktop, 220 px mobile. `chart.timeScale().fitContent()` po `setData`.
- [ ] Commit `feat(perps): wykres lightweight-charts z liniami mark, entry i liq`.

### Task 5: `MarketHeader.tsx`

**Interfaces:** Props `{ snap: Snapshot; markets: { address: Address; symbol: string }[]; funding: FundingView | null; change: number | null; changeSince: number | null; now: number }`. `FundingView` = typ z `useMemo` `funding` (wyniesc do `math.ts` jako `computeFunding(snap, now)` i typ `FundingView`).

- [ ] Lista rynkow: `useMarketList()` w `app/derivatives/useMarketList.ts` — `factory.allMarkets()` (sprawdzic nazwe w `factoryAbi`) + `symbol` z `oracle.getMarket`, jeden multicall. Dropdown `Select` z shadcn, `router.push('/derivatives/'+addr)`.
- [ ] Sekcje: symbol+badge, Mark (text-2xl, `UpDown` dla zmiany z `change`% i "since Xh ago"), Index, Funding `%/h` + kto placi + countdown, OI + `% of cap`, Feed `Dot` + wiek. Pasek `overflow-x-auto`.
- [ ] Commit `feat(perps): naglowek rynku dla tradera`.

### Task 6: `OrderPanel.tsx`

**Interfaces:** Props `{ snap, position, preview, feeSplit, side, setSide, margin, setMargin, leverage, setLeverage, address, wrongChain, busy, error, onOpen }`.

- [ ] Uklad jak w spec (segment Long/Short, margin + `25/50/75/Max`, slider + presety, trzy liczby, pasek powodu, przycisk, `<details>` ze szczegolami, ostrzezenia globalne). Presety procentowe: `setMargin(fromUsdc(spendable * n / 100n))`, gdzie `spendable = max(0, balance - GAS_RESERVE_USDC)` (juz policzone w `MarketDetail` jako `spendable`/`overSpendable` - przeniesc 1:1; na Arc gaz schodzi z tego samego USDC, wiec `balance` wprost = obie transakcje padaja). `Max` = `spendable`. Presety dzwigni: `[1,2,5,10,max]` filtrowane `<= maxLeverage`, bez duplikatow.
- [ ] Przycisk: tekst wg stanu: `!address` -> "Connect wallet" (disabled), `wrongChain` -> "Switch to Arc Testnet", `position` -> "Close your position first", `busy` -> busy, inaczej `Open long`/`Open short`. Kolory `bg-sp-up`/`bg-sp-down` z `text-sp-on-brand`... (sprawdzic kontrast; jesli brak tokenu tla, uzyc `bg-emerald-600`/`bg-red-600` tylko tu i zostawic komentarz).
- [ ] Commit `feat(perps): panel zlecenia z presetami i kluczowymi liczbami`.

### Task 7: `PositionPanel.tsx`, `HistoryPanel.tsx`, `MarketInfoPanel.tsx`

- [ ] `PositionPanel`: pusty stan / wiersz z Side+size, Entry, Mark, Liq, Margin, uPnL (USD i % = pnl*10000/marginWad), Funding owed, health bar (przeniesiony), Close. Props `{ snap, position, funding, busy, onClose, compact?: boolean }` — `compact` dla karty pod panelem zlecenia.
- [ ] `HistoryPanel`: props `{ activity, address, explorer }`, filtr `Mine | All` (stan lokalny, domyslnie `Mine` gdy `address`, inaczej `All`).
- [ ] `MarketInfoPanel`: przeniesione karty Funding, Skew, Market health, Keeper, Price feed panel (isCreator). Props `{ snap, funding, position, now, isCreator, actions }`.
- [ ] Commit `feat(perps): zakladki Position, History i Market info`.

### Task 8: `MarketDetail.tsx` sklada calosc + `MobileTradeBar.tsx`

- [ ] Nowy `MarketDetail`: hooki, stan biletu, `preview`/`feeSplit` (useMemo jak dzis), siatka `lg:grid-cols-[minmax(0,1fr)_340px]`, zakladki `Tabs` z shadcn, `OrderPanel` sticky, `PositionPanel compact` pod nim gdy pozycja. Skeleton nowego ukladu.
- [ ] `MobileTradeBar`: `fixed bottom-0 lg:hidden`, mark + przyciski Long/Short otwierajace `Dialog` z `OrderPanel` (klasa `sm:max-w-full bottom-0 top-auto translate-y-0 rounded-t-[20px]`). `pb-20` na tresci na mobile.
- [ ] Usunac stary JSX. `tsc`, `next lint` czyste. Sprawdzic w przegladarce desktop i 375 px.
- [ ] Commit `feat(perps): ekran rynku w ukladzie wykres + panel + zakladki`.

### Task 9: Tablica rynkow

**Files:** Modify `app/derivatives/DerivativesBoard.tsx`; Create `app/derivatives/YourPositions.tsx`, `app/derivatives/FaucetBanner.tsx`.

- [ ] `YourPositions`: props `{ rows, address }`, multicall `getPosition/unrealizedPnl/marginRatioBps` per rynek, render tylko gdy sa pozycje; wiersz: symbol, side+size, entry, uPnL, health %, link.
- [ ] `FaucetBanner`: props `{ balance: bigint | null }`; localStorage `deriv-faucet-dismissed`; pokazuje sie gdy nie zamkniety LUB `balance === 0n`. Link `https://faucet.circle.com`.
- [ ] Wiersz: kolumny `Market | Price | Change | Funding | Open interest | Feed`; `Change` z logow `PriceSubmitted` per rynek (jeden `getLogs` na oracle bez filtra marketId w oknie 40k, pogrupowany po `marketId`) — komorka `Missing` gdy < 2 punkty. Statystyki: Markets, Total OI, Insurance coverage.
- [ ] Commit `feat(perps): tablica rynkow dla tradera, Twoje pozycje i baner faucetu`.

### Task 10: Weryfikacja koncowa

- [ ] `npx hardhat test test/derivativesMath.test.ts`, `npx tsc --noEmit`, `npx next lint app/derivatives`.
- [ ] Przegladarka: `/derivatives`, `/derivatives/<market>` desktop + 375 px, bez portfela i z portfelem. Zrzuty ekranu dla uzytkownika.
- [ ] Commit koncowy jesli zostaly poprawki.

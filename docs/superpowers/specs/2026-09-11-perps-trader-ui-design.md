# Perps (Arc testnet) — ekran dla tradera — projekt

> Status: **zatwierdzony kierunek C** (2026-09-11). Zakres: `/derivatives` i `/derivatives/[market]`.
> Odbiorca ekranu: trader, ktory chce otworzyc i prowadzic pozycje. Tworca rynku i keeper
> dostaja swoje narzedzia w zakladce "Market info", nic nie znika.

## Cel

Dzisiejszy modul jest technicznie solidny (podglad zlecenia liczony jak kontrakt, zero
zmyslonych liczb, jeden multicall), ale uklad opowiada o protokole, nie o pozycji:
formularz jest jedna z osmiu kart, wykres to sparkline bez osi, tablica rynkow pokazuje
bondy i challenge'e zamiast ceny i zmiany. Projekt przestawia priorytety na te, ktore
maja najlepsze dashboardy perps (Hyperliquid, GMX, Vertex): wykres + staly panel zlecenia
+ pozycja w jednym wierszu, reszta w zakladkach.

## Zasady (nie do negocjacji)

- **Logika kontraktowa bez zmian.** `swap`, `previewOpen`, mapowanie snapshotu, zapisy
  `openPosition/closePosition/settleFunding/liquidate/submitPrice` przenosza sie 1:1.
- **Nieudany odczyt to nadal `Unknown`, nigdy zero.** Typ `R<T>` i komponent `Unknown` zostaja.
- **Zero zmyslonych liczb.** Zmiana 24h i wolumen licza sie z realnych logow albo sie nie pokazuja.
- Paleta `--sp-*`, karty `.sph-card`, shadcn `components/ui`, ikony lucide. Bez nowych zaleznosci:
  `lightweight-charts` juz jest w `package.json` i ma wzorzec w `app/startpad/[address]/PriceChart.tsx`.

## Czesc 1 — Ekran rynku `/derivatives/[market]`

### Uklad

Desktop (`lg+`): siatka `minmax(0,1fr) 340px`.
- Lewa kolumna: `MarketHeader`, `PriceChart`, `MarketTabs` (Position | History | Market info).
- Prawa kolumna: `OrderPanel`, `sticky top-4`. Przy otwartej pozycji pod nim kompaktowa
  karta `PositionSummary` (ta sama tresc, co zakladka Position, ale skrocona: side, size, PnL, health, Close).

Mobile (`<lg`): naglowek, wykres, zakladki. `OrderPanel` jako dolny arkusz (`Dialog` z shadcn
z klasa full-width bottom) otwierany stala belka na dole ekranu z dwoma przyciskami
**Long** i **Short**. Belka pokazuje tez mark price.

### `MarketHeader`

Jeden pasek, przewijany poziomo na waskim ekranie:
1. Symbol + dropdown wyboru rynku (lista z fabryki, ta sama co na tablicy; `Select` z shadcn).
   Obok badge stanu: `probation` / `mature` / `frozen` / `slashed`.
2. **Mark** duza czcionka + zmiana od pierwszego punktu widocznej historii (kolor up/down).
   Zmiana pochodzi z logow `PriceSubmitted` w oknie wykresu; gdy historia pusta, brak zmiany, nie zero.
3. **Index** (TWAP z feedu).
4. **Funding** jako `%/h` z podpisem "longs pay" / "shorts pay" i countdown do rozliczenia.
   `%/h = perDayPct / 24`. Przy `due` napis "due now".
5. **Open interest** z procentem capu.
6. **Feed** — kropka: zielona (feedActive i wiek < interwal fundingu), bursztynowa (starzeje sie),
   czerwona (nieaktywny/frozen/slashed) + wiek. Tooltip z pelnym opisem.

Bez bps, bez bondow, bez adresu tworcy. To idzie do Market info.

### `PriceChart` (lightweight-charts, dynamiczny import jak w startpadzie)

- Seria liniowa z historii `PriceSubmitted` (cena + `timestamp` z argumentu zdarzenia, wiec bez
  `getBlock`). Okno logow: `head - 40_000` jak dzis (Blockdaemon 50k).
- Linie poziome (`createPriceLine`): **mark** (fiolet, kreskowana), **entry** i **liq** aktualnej
  pozycji (zielona/czerwona), a przy edycji zlecenia **podgladowa liq** z `previewOpen` (szara kreskowana).
- Przelaczniki zakresu: `1h / 6h / 24h / all` — filtruja punkty po czasie, nie zmieniaja RPC.
- Przy < 2 punktach: stan pusty z tekstem "Not enough feed updates yet" i przyciskiem Refresh.
- Kolory z `--sp-*` przez `getComputedStyle` przy montazu (canvas nie czyta CSS vars).

### `OrderPanel`

Kolejnosc od gory:
1. Segment **Long / Short** (pelna szerokosc, zielony/czerwony jak dzis).
2. **Margin (USDC)**: input z saldem obok, przyciski `25% 50% 75% Max`. Max = saldo minus
   `GAS_RESERVE_USDC` (config.ts, 0,05 USDC). Na Arc gaz i kolateral to JEDNO saldo USDC
   (docs Arc "EVM differences"), wiec "cale saldo" zostawia zero na `approve` i `open`.
   Presety procentowe licza sie od tej samej kwoty (saldo minus rezerwa). Depozyt powyzej
   niej blokuje przycisk i pokazuje ostrzezenie (juz w `MarketDetail`, 11.09). Fee schodzi
   z depozytu, kontrakt to obsluguje.
3. **Leverage**: slider + presety `1x 2x 5x 10x max` (presety > `maxLeverage` ukryte).
   Slider zmienia kolor na bursztynowy, gdy `preview.marginRatioBps < 2 * maintenanceBps`.
4. **Trzy duze liczby** (grid 3 kolumny): **Position size** (notional w USD), **Liq. price**
   (z odlegloscia od mark w %), **Est. entry** (z price impact w %). To jest to, na co trader
   patrzy przed kliknieciem.
5. **Przycisk** `Open long` / `Open short`. Stany: `Connect wallet`, `Switch to Arc Testnet`,
   `Close your position first`, `busy` z opisem. Powod z `preview.reason` wyswietlany
   NAD przyciskiem jako czerwony pasek.
6. **Details** (`details/summary`, domyslnie zwiniete): fee z podzialem creator/insurance/treasury,
   margin after fee, margin ratio on entry, size w jednostkach bazowych. Cala dzisiejsza tabelka.
7. Ostrzezenia globalne (paused, slashed, feed nieaktywny) jako pasek nad segmentem Long/Short.

### `MarketTabs`

- **Position**: gdy brak pozycji — pusty stan "No open position" z podpowiedzia.
  Gdy jest — jeden wiersz jak w tabeli: Side+size, Entry, Mark, Liq. price, Margin, Unrealised PnL
  (USD i % od marginu), Funding owed, Health bar. Przycisk **Close** z tekstem
  "pays fee again, exits on the same curve". Brak zmian w logice `close()`.
- **History**: dzisiejsza lista `activity` z logow, ale z filtrem `Mine | All` (Mine = `trader === address`).
  Zdarzenia fundingu i bad debt pokazuja sie tylko w `All`.
- **Market info**: wszystko, co dzis jest w kartach Funding, Skew, Market health, Keeper,
  Price feed panel (tylko dla tworcy). Przenosimy JSX bez zmian tresci, tylko w zakladke.

### Podzial plikow (`app/derivatives/[market]/`)

- `math.ts` — `swap`, `previewOpen`, typy `Preview`, stale `WAD/BPS/USDC_TO_WAD`. Przeniesione dokladnie.
- `types.ts` — `R`, `Snapshot`, `Position`, `ActivityItem`, `PricePoint`.
- `useMarketData.ts` — `load()` i stan (`snap, position, history, activity, loading, error, reload`).
  Historia zwraca `PricePoint[] = {time, price}` zamiast `bigint[]`.
- `useMarketActions.ts` — `withBusy`, `open/close/settle/liquidate/submitPrice/checkTarget`, `busy`, `error`.
- `MarketHeader.tsx`, `PriceChart.tsx`, `OrderPanel.tsx`, `PositionPanel.tsx`, `HistoryPanel.tsx`,
  `MarketInfoPanel.tsx`, `MobileTradeBar.tsx`.
- `MarketDetail.tsx` — sklada powyzsze, trzyma stan biletu (`side, margin, leverage`), zeby wykres
  widzial podgladowa liq.
- `../ui.tsx` — `Unknown`, `Val`, `Row`, `useNow` wspolne dla tablicy i rynku.

## Czesc 2 — Tablica `/derivatives`

- **Twoje pozycje** na gorze (tylko po polaczeniu portfela i gdy sa): jeden multicall
  `getPosition/unrealizedPnl/marginRatioBps` po wszystkich rynkach, wiersze z linkiem do rynku.
- **Baner testnetu**: "Trading on Arc testnet. Need USDC? Get it from the Circle faucet" z linkiem
  `https://faucet.circle.com` (Arc Testnet jest tam na liscie) i kropka sieci. Znika po zamknieciu
  (`localStorage`), wraca gdy saldo USDC = 0.
- **Wiersz rynku** uproszczony: Market (symbol + badge), **Price** (mark, index malym pod spodem),
  **Change** (zmiana indeksu od pierwszego punktu w oknie logow 40k blokow, czyli ok. 5,5 h przy
  0,51 s na blok; podpis pod liczba mowi "since Xh ago" z realnego timestampu pierwszego punktu;
  gdy logi nie przyszly lub sa < 2 punkty, komorka pokazuje `Missing`), **Funding** (`%/h` + kto placi + countdown), **Open interest** (kwota + pasek),
  **Feed** (kropka + wiek). Bond, challenge'e, tworca — w tooltipie badge'a.
- Statystyki nad tabela: Markets, Total OI, Insurance coverage. "Mature markets" wypada.
- Sekcja "Deployed contracts", PerpsGuide, CreateMarketModal i Recent activity zostaja jak sa.

## Czesc 3 — Stany i drobiazgi

- Skeleton ekranu rynku odwzorowuje nowy uklad (wykres + panel), nie stare karty.
- Po udanej transakcji toast przez `react-hot-toast` (juz w projekcie) z linkiem do Arcscan.
- Blad transakcji pokazuje sie w `OrderPanel` pod przyciskiem, nie na dole strony.
- Wszystkie liczby `tabular-nums`. Kolory up/down przez `text-sp-up` / `text-sp-down`
  zamiast `emerald-600`/`red-600`, zeby motyw sieci dzialal.

## Poza zakresem

Zlecenia limit/stop (kontrakt ich nie ma), TP/SL, wiele pozycji per adres, nowe odczyty
z kontraktow poza `getPosition` na tablicy, zmiany w `PerpsGuide` i `CreateMarketModal`.

## Testy

- Jednostkowe (hardhat/mocha, jak `test/DerivativeMarket.test.ts`): `test/derivativesMath.test.ts`
  importuje `app/derivatives/[market]/math.ts` i sprawdza `previewOpen` (long/short, min margin,
  cap OI, margin ratio ponizej mm, fee zjada depozyt) oraz `filterRange` dla wykresu.
- Reczne: otwarcie i zamkniecie pozycji na Arc testnet, mobile 375 px (arkusz, belka), stan
  bez portfela, stan bez historii feedu.

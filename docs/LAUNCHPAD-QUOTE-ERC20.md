# Launchpad Q: krzywa z dowolnym tokenem ERC-20 po drugiej stronie pary

Stan: 2026-10-11, specyfikacja + kontrakty + testy. Front i wdrozenie - kolejne fazy.

## 1. Po co

Dzis kazdy mem na Startpadzie jest para z natywnym ETH (na Arc - z natywnym USDC).
Launchpad Q pozwala sparowac mema z dowolnym tokenem ERC-20:

- **USDC** - mem wyceniany w dolarach, prog awansu w dolarach;
- **tokenizowane akcje Coinbase (B20, 1x)** - "memy sparowane z akcjami", trend z Robinhood Chain, bez dzwigni;
- **perpy Flash (ETH2xL, NVDA2xL...)** - mem na dzwigni, oznaczony w UI jako ryzykowny.

Jedna zmiana kontraktu otwiera wszystkie trzy. Wlasnego protokolu tokenow z dzwignia NIE budujemy (patrz rozmowa 2026-10-11: miesiace pracy, audyt, ryzyko regulacyjne).

## 2. Decyzje

### 2.1 Jedno wdrozenie na jedno aktywo (`QUOTE` immutable)

Nie ma listy dozwolonych tokenow i nie ma settera. Kazde aktywo to osobna trojka
`QuoteCurveLaunchpad` + `QuoteLiquidityVault` + `QuoteLaunchHook` z `QUOTE` i `R_VIRT`
ustalonymi w konstruktorze. To ta sama doktryna co w `CurveLaunchpad`: zero administracji,
liczby wybierane raz, przy wdrozeniu.

Koszt: kazde nowe aktywo to nowy deploy (na Base kilka centow) i nowe kopanie salta hooka
(`QUOTE` wchodzi do kodu tworzacego hooka).

### 2.2 Istniejacy system ETH zostaje nietkniety

`CurveLaunchpad`, `LiquidityVault`, `B20LaunchHook` sa wdrozone i niezmienne. Nowe kontrakty
to osobne pliki w `contracts/launchpad/quote/`. Wspolne biblioteki (`FullMath`, `TickMath`,
`LiquidityAmounts`) sa tylko importowane, nie edytowane - edycja zmienilaby metadane
bajtkodu wdrozonych kontraktow i utrudnila ich weryfikacje.

### 2.3 Zdarzenia identyczne jak w wersji ETH

`Launched`, `Bought`, `Sold`, `CurveLocked`, `Graduated`, `FeeAccrued`, `Claimed`,
`HookFeeSettled` maja te same sygnatury. Pola nazwane `eth*` znacza tu "w jednostkach QUOTE".
Dzieki temu skan historii, tablica, wykres i wiadomosci przy kupnie dzialaja bez zmian -
front musi tylko znac `QUOTE`, jego symbol i liczbe miejsc po przecinku.

### 2.4 Orientacja puli - obie kolejnosci

ETH ma adres 0x0, wiec zawsze byl `currency0`. Token ERC-20 nie: v4 wymaga
`currency0 < currency1`, a akcje Coinbase sa B20 (`0xB200...`) tak jak nasze memy, wiec
moga wypasc po obu stronach. Vault i hook licza orientacje per token:

| | QUOTE = currency0 | QUOTE = currency1 |
|---|---|---|
| cena v4 (amount1/amount0) | token/quote | quote/token |
| sqrtPrice otwarcia | sqrt(T_MIN * 2^192 / 5R) | sqrt(5R * 2^192 / T_MIN) |
| plynnosc z calego QUOTE | getLiquidityForAmount0(P, upper) | getLiquidityForAmount1(lower, P) |
| buyback quote -> token | zeroForOne, limit ponizej spotu | oneForZero, limit powyzej spotu |

Obie ceny otwarcia sa liczone w konstruktorze i asertowane w zakresie v4.

### 2.5 Wymagania wobec QUOTE (lista kontrolna przed wdrozeniem)

Egzekwowane w kodzie:
- **brak oplaty od transferu** - kazde przyjecie QUOTE sprawdza przyrost salda; mniej niz
  zadeklarowano = rewert `QuoteTransferMismatch` (fail-closed);
- `decimals()` w zakresie 6..18;
- `R_VIRT >= 75` (podloga `MIN_LP`), ceny otwarcia w zakresie v4.

Niewymuszalne kodem - do sprawdzenia przed wdrozeniem:
- **brak rebase sald** (saldo zmienia sie bez transferu) - lamie niezmiennik wyplacalnosci.
  Akcje Coinbase uzywaja mnoznika UI (ERC-8056), salda stoja - OK. Perpy Flash: DO POTWIERDZENIA.
- **brak hookow transferu / callbackow** (ERC-777) - straznik reentrancji jest, ale to i tak
  wymaganie;
- **pauza i blokady emitenta** (akcje B20, USDC): jesli emitent wstrzyma transfery albo
  zablokuje adres krzywej/vaulta/hooka/PoolManagera, handel stoi. Nikt nie traci salda
  ksiegowego, ale wyjsc sie nie da do odwieszenia. Do pokazania w UI.

### 2.6 Kupno: kwota zamiast `msg.value`, plus `buyFor` i permit

- `buy(token, quoteIn, minTokensOut, deadline)` - placi i dostaje `msg.sender`;
- `buyFor(token, quoteIn, minTokensOut, deadline, recipient)` - placi `msg.sender`, tokeny,
  limit okna i `Bought.buyer` to `recipient`. Pod przyszly zap ETH -> QUOTE -> mem;
- `buyWithPermit(...)` - ERC-2612 na QUOTE (USDC i B20 je maja), jedna transakcja zamiast dwoch.
  Blad permit jest lykany jak w `sellWithPermit` (podpis mogl zostac zuzyty w wyscigu).
- dev-buy przy starcie: `launch*` przyjmuje `quoteIn`.

Wiadomosci przy kupnie (`dataSuffix`) dzialaja bez zmian - dekoder szuka znacznika w calym
`tx.input`.

### 2.7 Awans

Jak w wersji ETH (`Locked` -> bezuprawnieniowe `graduate()` z nagroda 1.5% rezerwy), z jedna
roznica mechaniczna: launchpad PRZELEWA `eLp` QUOTE do vaulta i podaje kwote parametrem
(`seedWithConfig(..., quoteAmount)`), bo vault trzyma tez narosle oplaty w QUOTE i nie moze
liczyc kwoty z salda. Pyl QUOTE po zaokragleniu zostaje w vaulcie na zawsze (jak pyl ETH).

### 2.8 Ryzyko par z perpami (Flash)

Rezerwa krzywej w tokenie z dzwignia waha sie podwojnie i moze zostac zlikwidowana. Krzywa
liczy w jednostkach QUOTE, wiec matematyka i wyplacalnosc sie nie psuja - ale wartosc
rezerwy w dolarach moze spasc do zera, a prog awansu (w jednostkach perpa) moze stac sie
nieosiagalny w praktyce. To ryzyko posiadacza, do pokazania w UI. Kontrakt go nie ogranicza.

## 3. Fazy

1. **Kontrakty + testy** (ta faza): `contracts/launchpad/quote/*`, testy na PRAWDZIWYM
   PoolManagerze v4 z `contracts/vendor`, obie orientacje.
2. **Front**: wybor aktywa przy starcie, approve/permit + kupno w jednostkach QUOTE,
   liczba miejsc po przecinku i symbol w calym UI, ostrzezenia (pauza, dzwignia).
3. **Wdrozenie**: Base Sepolia (USDC testowe) -> Base mainnet USDC -> akcje/perpy po
   potwierdzeniu listy kontrolnej. Odpala wlasciciel, z zasilonym kluczem.
4. **Zap** ETH -> QUOTE -> mem w jednej transakcji (opcjonalnie).

## 4. Pytania do Flash przed wlaczeniem ich perpow

- audyty kontraktow (hook, emitent perpow, integracja z Morpho);
- pelne adresy tokenow perpow na Base;
- czy salda tokenow perpow sa stale (cena przez NAV), czy rebase;
- czy transfer ma oplate albo hook;
- co dzieje sie z tokenem przy likwidacji pozycji Morpho (NAV -> 0? umorzenie? pauza?);
- czy ich pule przyjma pary z naszym hookiem i czy routing ETH -> perp -> mem przejdzie
  przez ich agregator;
- udzial w oplatach z wolumenu, ktory przyprowadzimy.

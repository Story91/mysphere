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

- **polityka "executor" (hardfork Denim, data nieznana)**: emitent akcji B20 moze ograniczyc,
  ktore kontrakty wolno wywolywac `transferFrom`/przenosic tokeny. Jesli nasze kontrakty albo
  PoolManager nie beda na liscie, para z ta akcja stanie. Przed wlaczeniem akcji jako QUOTE
  sprawdzic polityki emitenta (Coinbase) dla zakresu executor.

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

## 2.9 Wdrozenie testowe i przebieg na zywo (2026-10-11)

Base Sepolia, USDC Circle (`0x036CbD53842c5426634e7929541eC2318f3dCF7e`), R_VIRT 2.5 USDC (prog 10 USDC),
fabryka `B20TokenFactoryV2` `0xC2855687d5234C64D816a763d1513B4484Db72Ed`:

- launchpad `0xD012Afb6E08B0DA44f9041bA3d277EA727F9389b`, vault `0xBcaE808a6a2d95e2f0544b7967d246f27F292F36`,
  hook `0x5b054c4F9Df1ad18C499Fc493983B216186B2044` (zapis: scripts/output/launchpad-q-usdc-base-sepolia.json);
- token `0xb200000000000000000000a1A9Acf1CF968C5f99` (prawdziwy B20 po Cobalcie): start, kupno do progu,
  awans (9.70 USDC + 155.2M tokenow do puli, 44.8M na DEAD), swap w obie strony, oplata hooka w tokenie
  i w USDC (1246 jedn.), settle 373/699/174 - wszystko zgodne z testami.
- Wczesniejsze wdrozenie z fabryka v1 (`0xbcB13EA7...2100`) jest martwe - start odbija sie od `WrongVariant()`.

## 2.10 Mainnet - rynki perpow Flash (2026-10-11)

Fabryka `B20TokenFactoryV2` `0xF1DAd68f9B0b00A80E993286419AD03e9380e7B0`, R_VIRT 1875 jednostek perpa
(NAV ~1 $ -> zbiorka ~7 500 $), oplaty do Safe `0x83E2DE974FC6B866FDb78AEFa5596d58fDc4142F`.

| Rynek | Perp (QUOTE) | Launchpad | Vault | Hook |
|---|---|---|---|---|
| ETH2xL | `0xB200000000000000000000FfFF60CC8138cDf452` | `0x86B7d672B0520A37A5f13788b9b2F821a9E9ff5d` | `0x45f3ea7a6c68f4BB3a0d3B2cb8aA697D102674F8` | `0xBd69E3b17FD25b33d965C4857569e8a800C32044` |
| NVDA2xL | `0xb200000000000000000000fFFfE13bBeCe8B183C` | `0x90C0213B96f5B279D68259D1E527B878e9eCc61D` | `0x39e77AED2805316e05B381ea85fD8664793EF153` | `0x1B32f340AFaA6Ba5c750f588CBf51e83f8516044` |
| BTC2xL | `0xB200000000000000000000ffff4a0dA1092f5359` | `0x1043e1e26256a0a66F05D649C88a637Fd15a8Dbc` | `0x0459c8c89929668BC65163F804c77ECD69B66551` | `0xcB1e55968dc91f68D5e3a7019F0a21ECA9F6e044` |
| SPCX2xL | `0xB200000000000000000000ffFFDaEA025548eAe4` | `0x10eF2Edc204Dcc8060aBB03699a13eaB0c3c14eE` | `0x8b2e0Cb173a73B6db857848c78e0ACa1F65E4ae0` | `0x490DcE11B858B816E9153cF54deB3B32bd1F6044` |

Start sprawdzony eth_call na kazdym. Perp ma adres `0xB200...ffff`, wiec prawie zawsze lezy POWYZEJ mema -
orientacja "QUOTE = currency1" (przetestowana). Zweryfikowane odczytem: ETH2xL to B20 ASSET, 18 miejsc,
wlasciciel ma tylko METADATA_ROLE (brak admin/mint/pause/seize). Ryzyka po stronie Flash: brak audytu,
hook i rail kontroluje EOA `0x3Cc4...578d` (setPoolParams, retirePool, disableIssuance,
closeVaultForOutage) - zaakceptowane przez wlasciciela 2026-10-11 ("znam ich").

Front: rynki jako osobne tablice w przelaczniku (`?m=eth2xl`), kwoty i ceny w jednostkach perpa,
dopiski $ z NAV (`/api/launchpad/quote-price` -> api.tryflash.app), kupno = approve + `buy(kwota)`,
pula po graduacji przez Permit2 na perpie.

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

## 2.11 PerpBuyZap - kupno za ETH (Base mainnet, 2026-10-12)

`0xBDBe76a51Af1D444f89ee6d0a457A1FD1Dc06b9A` (blok 52489206, `scripts/output/perp-zap-base.json`).
Jeden zap dla wszystkich rynkow perpow: `buyWithEth(launchpad, token, ethPool, perpPool, minPerpOut, minTokensOut, deadline, recipient)`.
Trasa ETH -> USDC (pula v4 ETH/USDC 500/10, bez hooka) -> perp (pula Flash z `/v1/perps` -> `poolKey`) -> `buyFor(recipient)`, jeden `unlock`.
Zap nie trzyma srodkow: zwrot nadwyzki z krzywej (perp) idzie do odbiorcy, niewydane ETH do wolajacego.
Sprawdzenie: `test/PerpBuyZap.test.ts` (lokalnie) + symulacja `eth_call` na zywym Base w `deployPerpZap.ts` (B20 i hook Flash nie dzialaja na forku).
Front: przelacznik "Pay with ETH / ETH2xL" w panelu kupna, `PERP_ZAP_BY_CHAIN` w `app/startpad/config.ts`.
Nie obejmuje: pre-buy przy starcie (tworca = msg.sender launchpada) i sprzedazy do ETH (`Sold` zapisalby zap jako sprzedajacego).

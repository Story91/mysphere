# Decyzja: launchpad bez krzywej wiazanej, prosto do puli v4 z hookiem

> Dokument nadrzedny wobec `B20-LAUNCHPAD-SPEC.md`. Tam, gdzie sie roznia,
> obowiazuje ten. Spec zostaje, bo wiekszosc jej ustalen (tworzenie tokena,
> zrzeczenie rol, matematyka tickow, adresy na Base) jest nadal aktualna.

## 1. Co sie zmienia

**BYLO:** token startuje na krzywej wiazanej (`CurveLaunchpad`), kontrakt jest
jedyna druga strona, my bierzemy prowizje od kupna i sprzedazy. Po zebraniu
progu (3 ETH) token AWANSUJE - kontrakt tworzy pule na Uniswap v4 i zamyka
plynnosc.

**JEST:** token od razu dostaje pule na Uniswap v4 z **jednostronna plynnoscia**
(cala podaz po jednej stronie, zero ETH), a prowizje pobiera **hook** przy
kazdej wymianie.

## 2. Dlaczego - trzy powody, kazdy sam wystarczy

### 2.1 Przychod nie konczy sie na progu

Przy krzywej prowizja plynie do awansu i **znika**. Po awansie oplaty puli ida
do dostawcow plynnosci, nie do nas. Zeby brac dalej, i tak trzeba dopisac hooka
- czyli krzywa nie zastepuje hooka, tylko go **odklada** i dokłada 1700 linii
kodu po drodze.

Hook bierze udzial w **kazdej** wymianie, bez konca i bez progu.

### 2.2 Audyt policzyl cene zlozonosci

Przeglad wrogi (`B20-LAUNCHPAD-AUDYT.md`) dal szesc znalezisk. **Cztery z nich
siedza w maszynerii awansu:**

| # | waga | gdzie zyje |
|---|---|---|
| 1 | WYSOKIE | zatrucie ceny pustej puli przed awansem |
| 2 | WYSOKIE | `poolsMask` - maska pul, dzwignia DoS |
| 3 | SREDNIE | napastnik wybiera warstwe oplat awansowanej puli |
| 4 | SREDNIE | `GRAD_FEE` pali czesc rezerwy przy awansie |

Wszystkie cztery istnieja TYLKO dlatego, ze pula powstaje pozniej niz token.
Gdy pula powstaje razem z tokenem, w jednej transakcji, ktorej nikt nie
wyprzedzi - nie ma okna, w ktorym da sie ja zatruc, i nie ma czego wybierac.

Zostaja dwa znaleziska (`5` - tworca uwieziony w nieawansowanym tokenie,
`6` - nieprawdziwy komentarz) i oba sa lokalne.

### 2.3 Nie piszemy wlasnej matematyki pieniedzy

Jednostronna pozycja plynnosci zachowuje sie prawie identycznie jak krzywa
wiazana: wrzucamy cala podaz po jednej stronie, bez ETH; ludzie kupuja, a token
drozeje wzdluz krzywej. **Ten sam efekt "wczesni kupuja taniej"** - tylko ze
liczy to kod Uniswapa, ktory stoi na mainnecie od lat i byl audytowany, a nie
nasze `mulDiv` z wlasnym dowodem wyplacalnosci.

UWAGA NA KIERUNEK: w v4 `price = amount1/amount0`, czyli TOKENOW ZA ETH, wiec
"token drozeje" znaczy, ze `sqrtPriceX96` MALEJE, a pozycja z samego tokena
stoi PONIZEJ ceny biezacej. Pierwsza wersja tego akapitu mowila "powyzej ceny
startowej, cena idzie w gore" - i bylo to nieprawda, sprzeczna z zalacznikiem
na koncu tego dokumentu. Pelne wyprowadzenie z pomiarem: patrz ZALACZNIK.

Znika: dowod niemalejacego `k`, reguly zaokraglen na niekorzysc wolajacego,
straznik wyplacalnosci, `LiquidityVault` jako osobny byt, cala sciezka awansu.

## 3. Konsekwencja, ktora odwraca poprzednia rekomendacje

`B20-LAUNCHPAD-ROZPOZNANIE.md` mowi: *"Rekomendacja: startuj bez hooka
(`hooks = address(0)`) ... a prowizje launchpada pobierasz na krzywej wiazanej,
gdzie i tak masz pelna kontrole."*

Ta rekomendacja **byla poprawna pod krzywa i przestaje byc poprawna bez niej**.
Bez krzywej hook nie jest wygoda - jest jedynym miejscem, w ktorym istnieje
przychod. Kopanie adresu przestaje byc kosztem opcjonalnym i staje sie czescia
wdrozenia.

## 4. Hook - fakty, ktore juz mamy

Z odczytu zrodla `Uniswap/v4-core/src/libraries/Hooks.sol`: uprawnienia hooka to
**dolne 14 bitow jego adresu** (`ALL_HOOK_MASK = (1 << 14) - 1`).

| bit | flaga | bit | flaga |
|---|---|---|---|
| 13 | `BEFORE_INITIALIZE` | 6 | `AFTER_SWAP` |
| 12 | `AFTER_INITIALIZE` | 5 | `BEFORE_DONATE` |
| 11 | `BEFORE_ADD_LIQUIDITY` | 4 | `AFTER_DONATE` |
| 10 | `AFTER_ADD_LIQUIDITY` | 3 | `BEFORE_SWAP_RETURNS_DELTA` |
| 9 | `BEFORE_REMOVE_LIQUIDITY` | 2 | `AFTER_SWAP_RETURNS_DELTA` |
| 8 | `AFTER_REMOVE_LIQUIDITY` | 1 | `AFTER_ADD_LIQUIDITY_RETURNS_DELTA` |
| 7 | `BEFORE_SWAP` | 0 | `AFTER_REMOVE_LIQUIDITY_RETURNS_DELTA` |

Adres trzeba **wykopac CREATE2** tak, zeby dolne 14 bitow dokladnie odpowiadalo
temu, co zwraca `getHookPermissions()` - inaczej `HookAddressNotValid`. Flaga
`*_RETURNS_DELTA` bez odpowiadajacej flagi akcji jest odrzucana.

**Kopanie adresu mamy juz napisane i sprawdzone**: `app/utils/b20/addressing.ts`
(kopalnia partiami w przegladarce). Zmienia sie sama formula wyprowadzenia -
CREATE2 zamiast wzoru precompile'a B20 - reszta maszynerii zostaje.

Adres `PoolManager` na Base mainnet, potwierdzony kodem:
`0x498581fF718922c3f8e6A244956aF099B2652b2b` (24 009 bajtow).

## 5. Co zostaje z dotychczasowej pracy

| zostaje | dlaczego |
|---|---|
| `launch()` z `CurveLaunchpad` | tworzenie tokena, `initCalls`, zrzeczenie rol i asercje po fakcie sa identyczne |
| `interfaces/IB20Asset.sol` | bez zmian |
| `interfaces/IPoolManagerV4.sol` | teraz WAZNIEJSZE niz bylo |
| `lib/TickMath.sol`, `lib/LiquidityAmounts.sol`, `lib/FullMath.sol` | potrzebne do jednostronnej pozycji |
| `mocks/MockPoolManager.sol` | podstawa testow hooka |
| `mocks/MockB20.sol` | bez zmian |
| `app/utils/b20/addressing.ts` | kopalnia adresow, teraz takze dla hooka |
| caly rynek `/b20` | nie dotyka kontraktow wcale |

| odpada | dlaczego |
|---|---|
| matematyka krzywej w `CurveLaunchpad` | zastapiona przez pule |
| `graduate()`, `GRAD_FEE`, `poolsMask`, stan `Locked` | nie ma awansu |
| `LiquidityVault` jako osobny kontrakt | plynnosc idzie od razu do puli |

## 6. Do sprawdzenia NA LANCUCHU przed pisaniem kodu

Nie zakladac. Sprawdzic wywolaniem:

1. **Ktora para flag daje prowizje dla NAS**, a nie dla dostawcow plynnosci:
   `AFTER_SWAP` + `AFTER_SWAP_RETURNS_DELTA`, czy `BEFORE_SWAP` +
   `BEFORE_SWAP_RETURNS_DELTA`? Dynamiczna oplata (`LPFeeLibrary`) oddaje
   pieniadze LP - to NIE jest to, czego chcemy.
2. **Jak hook odbiera to, co wzial** - przez `take()` na `PoolManager`, czy
   przez saldo waluty. Kto placi gaz za odbior.
3. **Czy jednostronna pozycja z calej podazy przechodzi** przy realnych
   ograniczeniach tickow (`tickSpacing`, `MAX_TICK`) i czy nie zostaje pyl.
4. **Czy B20 dziala w puli z hookiem** - transfer do `PoolManager` byl juz
   potwierdzony (`ok=true`), ale nie z hookiem w kluczu.
5. **Ile kosztuje start** (createB20 + initialize + modifyLiquidity + settle)
   w jednej transakcji i czy miesci sie w rozsadnym limicie.
6. **Co z pozycja LP** - kto ja trzyma, zeby plynnosci nie dalo sie wyciagnac.
   Przy jednostronnej pozycji bez ETH nie ma czego wyciagnac na starcie, ale po
   wymianach juz jest.

## 7. Co to zmienia dla uzytkownika

Prawie nic - i to jest zaleta. Nie ma etapu "na krzywej" i etapu "po awansie",
nie ma paska postepu do progu, nie ma momentu, w ktorym token "wychodzi na
wolnosc". Token po prostu **od pierwszej sekundy ma pule**, wiec:

- wykresy na DexScreener i GeckoTerminal dzialaja od razu, bo to zwykla pula,
- routery i agregatory widza go od razu,
- na naszym rynku `/b20` znika kolumna "postep do awansu", ktorej i tak nie bylo.

Znika tez jedyna rzecz warta zalowania: **awans jako wydarzenie**. Pump.fun robi
z niego moment marketingowy. My tracimy ten moment - i to jest swiadoma cena za
brak czterech znalezisk audytu i za prowizje, ktora nie wygasa.


---

# ZALACZNIK: orientacja puli - POTWIERDZONA ODCZYTEM

> Dopisane po sprawdzeniu na zywej puli B20 na Base mainnet. To jest jedyna
> rzecz w calej konstrukcji jednostronnej plynnosci, ktorej pomylka nie wywala
> transakcji, tylko daje pozycje, ktora NIGDY NIE SPRZEDA ANI JEDNEGO TOKENA.
> Dlatego zostala sprawdzona, a nie wyprowadzona z glowy.

## Co zmierzono

Pula tokena `0xb2000...ef78af7adf3c70fb01` (Heated Rivalry), odczyt `slot0`
z `PoolManager` `0x498581fF...b2b`, slot mapowania 6:

```
sqrtPriceX96 = 1 675 749 084 746 911 779 375 876 155 519 974
tick         = 199 198
price        = 4.4736e+8      (tokenow za jeden ETH)
1/price      = 2.2353e-9      (ETH za jeden token)
```

**Kontrola poprawnosci odczytu:** GeckoTerminal podaje dla tej puli
`base_token_price_native_currency = 0.0000000022352658460`. Zgadza sie
z naszym `1/price` co do czterech cyfr znaczacych - czyli czytamy dobrze
i slot 6 jest wlasciwy.

## Wnioski, na ktorych stoi kontrakt

1. **ETH jest ZAWSZE `currency0`.** Adres natywnego ETH to `0x0`, a v4 wymaga
   `currency0 < currency1` - zero jest mniejsze od kazdego adresu tokena.
   Token jest wiec zawsze `currency1`. Nie ma przypadku odwrotnego i nie trzeba
   go obslugiwac.

2. **`price = amount1 / amount0`, czyli TOKENOW ZA JEDEN ETH.** Wysoka cena
   znaczy TANI token. To jest odwrotnie, niz podpowiada intuicja, i jest
   najczestszym zrodlem bledu w tym miejscu.

3. **Kupno tokena OBNIZA `sqrtPriceX96`.** Kupujacy wklada ETH (`currency0`)
   i zabiera token (`currency1`), wiec `amount1/amount0` maleje.

4. **Pozycja z samego tokena musi lezec PONIZEJ ceny biezacej.** Pozycja
   w zakresie `[a, b]` sklada sie wylacznie z `currency1`, gdy cena stoi
   POWYZEJ `b`. Zatem:

   - pule inicjalizujemy przy cenie WYSOKIEJ (duzo tokenow za ETH = token tani),
   - cala podaz wrzucamy w zakres LEZACY PONIZEJ tej ceny,
   - kupowanie spycha cene w dol, przez nasz zakres, zamieniajac tokeny na ETH.

   Wersja odwrotna - zakres powyzej ceny - przyjelaby wylacznie ETH i nie
   sprzedala ani jednego tokena. Transakcja by przeszla, pula by istniala,
   a token bylby martwy. Stad ten zalacznik.

5. **Liczba plynnosci** liczy sie z `getLiquidityForAmount1(sqrtLower,
   sqrtUpper, calaPodaz)`, a nie z `getLiquidityForAmount0` - ta druga jest
   w `LiquidityVault` i dotyczy zasilania ETH przy awansie, ktorego juz nie ma.

## Co pozostaje do sprawdzenia PRZED mainnetem

Powyzsze ustala KIERUNEK. Nie ustala:

- czy `modifyLiquidity` przyjmie pozycje o calej podazy bez pylu przy danym
  `tickSpacing`,
- ile realnie kosztuje `createB20` + `initialize` + `modifyLiquidity` + `settle`
  w jednej transakcji,
- czy `POOLS_SLOT = 6` jest stabilny (dzis potwierdzony odczytem, ale to szczegol
  ukladu pamieci, nie czesc interfejsu).

To sa rzeczy do testu na forku Base z PRAWDZIWYM `PoolManager`, a nie na
atrapie. Atrapa potwierdzi kolejnosc wywolan i nic ponad to.

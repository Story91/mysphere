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
wiazana: wrzucamy cala podaz powyzej ceny startowej, bez ETH; ludzie kupuja,
cena idzie w gore po krzywej. **Ten sam efekt "wczesni kupuja taniej"** - tylko
ze liczy to kod Uniswapa, ktory stoi na mainnecie od lat i byl audytowany, a nie
nasze `mulDiv` z wlasnym dowodem wyplacalnosci.

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

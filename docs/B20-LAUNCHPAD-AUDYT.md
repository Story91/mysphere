# Launchpad B20 - przeglad wrogi i raport autora kontraktow

> Zapisane z przebiegu, ktorego dwa pozostale agenty (testy, poprawki)
> padly na limicie tygodniowym. TE dwa raporty ocalaly w calosci.
> Znaleziska audytu NIE SA jeszcze naprawione - patrz sekcja nizej.

---

## PRZEGLAD WROGI

`npm run contracts:test` → **71 passing** potwierdzone. Arytmetyka krzywej przefuzzowana niezaleznie (400k prob kupna, 400k sprzedazy, 200k round-tripow) — czysta. Stale zweryfikowane niezaleznym rachunkiem. Ponizej to, co znalazlem.

---

# PRZEGLAD WROGI — CurveLaunchpad + LiquidityVault

## 1. [WYSOKIE] Pusta pula v4 daje sie przesunac cenowo ZA DARMO — awans blokowany na stale, za centy, w kolko

**Gdzie:** `contracts/launchpad/CurveLaunchpad.sol:1056-1065` (`_pickCleanPool`, `revert NoCleanPool()` w 1064) + `contracts/launchpad/LiquidityVault.sol:320` (`revert PriceMoved()`).

Kod PRAWIDLOWO stwierdza (komentarz 1049-1051), ze pula bez plynnosci da sie przesunac. Ale wyciaga z tego wylacznie **wykrywanie**, bez **naprawy**. Raport autora twierdzi, ze wektor jest „zamkniety strukturalnie przez nieprzewidywalny salt" — **to jest nieprawda**. Salt zamyka *wyprzedzenie `initialize`*. Nie zamyka *przesuwania ceny po starcie*, ktore nie wymaga zadnego przewidywania adresu: adres tokena jest publiczny od zdarzenia `Launched`.

**Atak, krok po kroku:**
1. Napastnik wdraza raz maly kontrakt z `unlockCallback` (uzywa go potem do wszystkich tokenow).
2. Po dowolnym `Launched` wola `poolManager.unlock(...)`, a w callbacku 4x `swap(key_i, {amountSpecified: 1, sqrtPriceLimitX96: SQRT_PRICE_TERMINAL - 1}, "")`.
3. W v4 `SwapMath.computeSwapStep` przy `liquidity == 0` zwraca `amountIn = 0, amountOut = 0, feeAmount = 0` i ustawia `sqrtPriceNextX96 = target`. Petla `swap` konczy sie na limicie. **`callerDelta == 0` dla obu walut — nie ma czego settlowac.**
4. Cena kazdej z czterech pul rozni sie od terminalnej o 1 bit. `_pickCleanPool` przechodzi cztery `continue` i rewertuje `NoCleanPool`.

**Koszt napastnika:** 1 transakcja, ~200-250k gazu, na Base ponizej 2 centow. Powtarzalne w kazdym bloku — nawet gdyby ktos przywrocil cene (tez swapem za zero), napastnik zatruwa ponownie przed kolejnym `graduate`.

**Strata ofiary:** 3.00 ETH zostaje na krzywej na zawsze; pula nigdy nie powstaje; protokol i tworca traca caly przychod z oplat LP; produkt traci swoja glowna obietnice. Posiadacze *moga* wyjsc sprzedaza (to dziala), ale placa 1% w obie strony za nic. Tworca — patrz znalezisko 5 — nie wyjdzie w ogole.

**Poprawka.** Sam warunek rownosci bitowej nie wystarcza; potrzebna jest **naprawa ceny swapem o zerowej delcie**, w `LiquidityVault._seedCallback`, PRZED `modifyLiquidity`, z twardym post-warunkiem:

```solidity
uint160 cur = PoolStateReader.sqrtPriceX96(POOL_MANAGER, key);
if (cur != target) {
    (int256 d,) = IPoolManagerV4(POOL_MANAGER).swap(key, SwapParams({
        zeroForOne: cur > target, amountSpecified: 1, sqrtPriceLimitX96: target}), "");
    // TO jest zdanie, ktore trzyma bezpieczenstwo: jesli ktokolwiek dolozyl
    // do puli plynnosc, naprawa kosztuje i delta NIE jest zerem -> przerywamy.
    if (d != 0) revert PoolNotEmpty();
    if (PoolStateReader.sqrtPriceX96(POOL_MANAGER, key) != target) revert PriceMoved();
}
```
Asercja `d == 0` zachowuje niezmiennik I-X6 w pelni (zaden bajt nie przenosi wartosci), a usuwa DoS. `swap` z zaszytymi `amountSpecified: 1` i `sqrtPriceLimitX96: target` nie przyjmuje niczego od wolajacego. Wariant slabszy (samo `graduate` inicjalizujace nieuzyta warstwe) nie wystarcza — napastnik zajmie wszystkie cztery.

---

## 2. [WYSOKIE] `launch()` przyjmuje `poolsMask == 0`; sama maska jest zbedna i jest wylacznie dzwignia DoS

**Gdzie:** `CurveLaunchpad.sol:632` (`_launches[token].poolsMask = _preparePools(token);` — brak sprawdzenia wyniku), `CurveLaunchpad.sol:1058` (`if (mask & uint8(1 << i) == 0) continue;`), `_preparePools:744-769`.

Specyfikacja §3.2 mowi: „bierzemy **pierwsza po kolei pule, ktorej `sqrtPriceX96` jest dokladnie rowny** SQRT_PRICE_TERMINAL". Implementacja dolozyla drugi warunek — maske „zainicjalizowalismy MY". Ten warunek **nie dodaje zadnego bezpieczenstwa**: `initialize` ustawia wylacznie `sqrtPriceX96`, `tick` i (przy statycznej oplacie) zerowe `lpFee/protocolFee`, wiec pula zainicjalizowana przez obcego po cenie **dokladnie terminalnej** jest nieodroznialna od naszej. Dodaje za to trwaly wektor odmowy.

**Atak A (wyscig w bloku startu):** `blockhash(block.number - 1)` jest znany wszystkim w chwili zamkniecia bloku N-1. Napastnik celujacy w konkretnego tworce zna `creator` i `creatorNonce`, wiec liczy adres tokena natychmiast i wysyla 4x `initialize` (po **poprawnej** cenie terminalnej) z wysoka oplata priorytetowa do bloku N. Sekwencer op-geth porzadkuje pule wedlug priority fee. Jesli trafi przed `launch`: `mask == 0`, wszystkie cztery pule sa zdrowe, a kontrakt **nigdy** z nich nie skorzysta.

**Atak B, powazniejszy operacyjnie (bez napastnika):** `initialize` jest w `try/catch` (756). Jesli `POOL_MANAGER` nie ma kodu (zla siec, literowka w adresie, v4 jeszcze nie wdrozone na testnecie) — `catch` lyka wszystko, `mask = 0`, **`launch` konczy sie sukcesem**, token otwiera handel i zbiera do 3 ETH od ludzi, a `graduate` nie ma szans nigdy. Fail-fast z komentarza przy `PoolStateUnreadable` (740-742) dziala tylko wtedy, gdy `initialize` sie POWIODLO.

**Koszt napastnika:** 4 x ~60k gazu + priority fee. **Strata ofiar:** cala zbiorka tokena, tak jak w pkt 1.

**Poprawka (dwie linijki, obie potrzebne):**
```solidity
// w launch(), po _preparePools:
uint8 mask = _preparePools(token);
if (mask == 0) revert NoCleanPool();     // zaden start bez zdolnosci do awansu
_launches[token].poolsMask = mask;
```
oraz **usunac warunek maski z `_pickCleanPool`** i zostawic sam bitowy warunek ceny (maska moze zostac jako informacja w zdarzeniu). Uwaga uboczna: uzasadnienie salta w komentarzu 566-572 („nieudany `launch` nie zwieksza `nonce`, wiec adres bylby zablokowany na zawsze") opisuje scenariusz, ktorego w tym kodzie nie ma — zajete pule nie wywracaja `launch`, tylko cicho zeruja maske.

---

## 3. [SREDNIE] Napastnik wybiera za darmo warstwe oplat awansowanej puli — przychod LP w dol 100x

**Gdzie:** `CurveLaunchpad.sol:472-477` (`tierAt`: `10000/200`, `3000/60`, `500/10`, `100/1`) + `_pickCleanPool:1056`.

Ta sama mechanika co w pkt 1, ale z policzalnym zyskiem po stronie napastnika i policzalna strata po stronie ofiary. Napastnik zatruwa **tylko warstwy 0, 1 i 2** (3 darmowe swapy). `graduate` wybiera warstwe 3: **fee 100 = 0.01%** zamiast 10000 = 1%.

**Strata:** oplaty LP, z ktorych zyje `harvest()` i cala teza „plynnosc zamknieta, ale zarabia", spadaja **stukrotnie**. Przy 500k USD obrotu po awansie: 5 000 USD → 50 USD. 60% z tego to przychod protokolu, 40% tworcy — obaj traca praktycznie wszystko. Napastnik zyskuje pule, w ktorej arbitraz i churn kosztuja go 0.01% zamiast 1%.

**Koszt napastnika:** 3 swapy o zerowym wejsciu, centy. Nie wymaga zadnej pozycji w tokenie.

**Poprawka:** jak w pkt 1 (naprawa ceny sprawia, ze zatrucie nie eliminuje warstwy). Dodatkowo warto rozwazyc zwezenie listy do dwoch warstw (`10000/200`, `3000/60`) — spec §0/O9 juz to dopuszczala — zeby najgorszy mozliwy wynik degradacji byl 0.3%, a nie 0.01%.

---

## 4. [SREDNIE] `GRAD_FEE` to stala kwota 0.1 ETH niezaleznie od rezerwy — bezuprawnieniowy `graduate()` pali do ~50% pozostalego pokrycia, a wolajacy inkasuje 0.05 ETH

**Gdzie:** `CurveLaunchpad.sol:132-134` (`GRAD_FEE`, `GRAD_CALLER_REWARD`), `1009` (`if (ethReserve <= GRAD_FEE) revert ReserveTooSmallToGraduate();`), `1015`, `1023`.

Jedyny warunek to `ethReserve > 0.1 ETH`. W stanie `Locked` sprzedaze sa otwarte, wiec rezerwa moze spasc dowolnie nisko. Test `awans z rezerwy przerzedzonej sprzedazami` (`CurveLaunchpadInvariants.test.ts:1005`) sam przechodzi ten przypadek az do `0.1000000001 ETH` i traktuje go jako poprawny — a to jest moment, w ktorym awans niszczy niemal cale pokrycie pozostalych posiadaczy.

**Atak:**
1. Krzywa w `Locked`, rezerwa 3.0 ETH. Napastnik trzyma duza pozycje (albo po prostu widzi wyprzedaz).
2. Sprzedaje az rezerwa spadnie do np. 0.30 ETH — inkasuje ~2.7 ETH dla siebie (to jeszcze jest zwykla mechanika AMM, nie zarzut).
3. Wola `graduate()`. `eLp = 0.20 ETH`, do puli idzie 0.20, **0.05 laduje na jego `claimable`, 0.05 na protokol**.
4. Pozostali posiadacze mieli 0.30 ETH pokrycia na krzywej; dostaja pule o glebokosci 0.20 ETH. Zniszczone 0.1 ETH, z czego polowa trafia do napastnika.

**Koszt napastnika:** gaz (~centy). **Zysk:** 0.05 ETH, zawsze, bez warunkow. **Strata ofiar:** 0.1 ETH z resztki pokrycia — przy rezerwie 0.2 ETH to **50%**, przy 3.0 ETH to 3.3%. Wywolanie `graduate()` jest bezwarunkowo oplacalne, wiec ten scenariusz nie jest hipotetyczny: bot zrobi to zawsze, w najgorszym mozliwym momencie.

**Poprawka:** oplata awansowa musi byc ograniczona udzialem w rezerwie, a nagroda nie moze przewyzszac sensownej wartosci awansu:
```solidity
uint256 gradFee = GRAD_FEE;
if (ethReserve / 10 < gradFee) gradFee = ethReserve / 10;   // nigdy wiecej niz 10% resztki
uint256 reward = gradFee / 2;
```
albo — prosciej i zgodnie z doktryna „jedna stala, jedna regula" — twardy prog `if (ethReserve < 2 ether) revert ReserveTooSmallToGraduate();`: krzywa, ktora zostala wyprzedana, po prostu nie awansuje, a posiadacze wychodza po pelnej cenie krzywej.

---

## 5. [SREDNIE] Tworca jest uwieziony na stale w kazdym tokenie, ktory nie awansuje — a naglowek pliku twierdzi cos przeciwnego

**Gdzie:** `CurveLaunchpad.sol:937` (`if (msg.sender == l.creator) revert CreatorLocked();`) kontra naglowek `CurveLaunchpad.sol:21-24`:
> „3. NIKT NIE JEST UWIEZIONY. W kazdym stanie poza `Graduated` sprzedaz do krzywej dziala; (...) Nie ma stanu, w ktorym posiadacz nie moze wyjsc."

To zdanie jest **falszywe**. `CreatorLocked` jest bezwarunkowe i nie ma terminu waznosci; jedyna droga wyjscia tworcy prowadzi przez pule, czyli przez `Graduated`. Specyfikacja jest tu uczciwa (I-C9 mowi wprost „dla adresu ≠ tworca"), kontrakt zgubil wyjatek.

**Konsekwencja jest wieksza niz kosmetyczna, bo `CreatorLocked` blokuje tylko SPRZEDAZ, nie KUPNO:** po 300-sekundowym oknie tworca moze dokupic na krzywej dowolna kwote (do `MAX_BUY = 100 ETH`) i **nigdy tego nie odzyska**, jesli token nie dojdzie do `T_MIN`. Dotyczy to z definicji ~99% tokenow. Tworca, ktory „wspiera wlasny projekt" za 2 ETH, traci 2 ETH cicho i nieodwracalnie.

**W polaczeniu z pkt 1:** napastnik za centy zatruwa cztery pule i zamienia to w celowana pulapke — pozycja tworcy staje sie nieodsprzedawalna nawet po osiagnieciu progu.

**Poprawka (do wyboru, ale jakas musi byc):**
- albo `CreatorLocked` wygasa: `if (msg.sender == l.creator && state != State.Locked) revert CreatorLocked();` (w `Locked` tworca tez jest juz tylko posiadaczem — kupno i tak nie dziala, wiec nie ma czego sprzedac „przed awansem"),
- albo blokada wygasa po czasie (`startedAt + 30 dni`) dla krzywych, ktore nie doszly do progu,
- **i niezaleznie od wyboru: poprawic naglowek**, zeby nie obiecywal czegos, czego kod nie robi.

---

## 6. [NISKIE] Komentarz w `seed` twierdzi rzecz nieprawdziwa o saldzie tokena

**Gdzie:** `LiquidityVault.sol:286-291` kontra `LiquidityVault.sol:345`.
> „w chwili `seed` ten kontrakt NIE MOZE trzymac tego tokena z zadnego innego tytulu"

Moze. Kazdy, kto kupil na krzywej, moze zwyklym `transfer` wyslac tokeny na adres vaulta przed awansem — B20 nie ma zadnej bramki. `heldBefore` obejmie te darowizne, a caly nadmiar poleci na `DEAD` (358). Straty po naszej stronie nie ma (`amount1` liczy pula, `toDead` tylko rosnie), traci wylacznie darczynca — ale zdanie w komentarzu jest **zalozeniem bezpieczenstwa, ktore nie obowiazuje**, i przy nastepnej zmianie tego pliku ktos sie o nie oprze. Poprawka: przepisac uzasadnienie na to, co faktycznie trzyma („saldo moze byc tylko WIEKSZE od tego, co przyszlo z krzywej; nadmiar i tak idzie na DEAD, wiec kierunek bledu jest bezpieczny"), albo brac `min(balanceOf, przelane)` i zapisac ilosc w parametrze.

Analogicznie po stronie launchpada: token przelany wprost na `CurveLaunchpad` lamie I-C3 i zostaje tam na zawsze (`graduate` przesyla tylko `tokenReserve`, `CurveLaunchpad.sol:1026`). Strata darczyncy, nie protokolu — ale I-C3 nie jest niezmiennikiem, tylko oczekiwaniem.

---

## Do domkniecia PRZED mainnetem — pojedyncze punkty calkowitej awarii

Nie sa to bledy w kodzie, ale kazdy z nich zamienia caly produkt w cegle i zaden nie jest sprawdzony:

- **`transfer` na `0xdEaD` (O3).** `LiquidityVault.sol:358`. Jesli B20 to odrzuca, `seed` rewertuje → **zaden token nigdy nie awansuje**, kazda krzywa konczy w `Locked`. Jedno wywolanie na Sepolii to rozstrzyga.
- **Semantyka `staticcall` nieznanego selektora `SEIZE_ROLE()`** (`CurveLaunchpad.sol:704`). Jesli precompile odpowiada sukcesem zamiast rewertem, **kazdy `launch` rewertuje `WrongVariant`**. Kierunek jest fail-closed (dobrze), ale to blokada totalna.
- **`abi.encode(struct)` vs krotka dla `params` (O10)** — atrapa dekoduje strukture, produkcja moze chciec krotki.
- **`multiplier`/rebase wariantu ASSET (O1)** — gdyby kiedykolwiek zadzialal, `tokenReserve` rozjechalby sie z `balanceOf` i nic w kodzie by tego nie zauwazylo. Jedyny odczyt `balanceOf` w sciezce pieniedzy to `heldBefore` w `seed`.

---

# SPRAWDZONE I CZYSTE

**Arytmetyka i zaokraglenia** — przefuzzowane niezaleznie od testow repo, 1M prob:
- `_quoteBuy`/`_sell`: `k = (R_VIRT + eth) * token` **niemalejace** w 400k losowych kupien i 400k sprzedazy, wlacznie ze sciezka dociagniecia. Zaden przypadek `k` malejacego.
- Bilans wei-w-wei: `eIn + fee + refund == valueIn` zawsze; `totalLiabilities` zmienia sie dokladnie o to, co wchodzi/wychodzi w `_buy` (834), `_sell` (960), `graduate` (1022), `_payout` (1126) — nie ma sciezki rozjezdzajacej `balance >= totalLiabilities`.
- Kierunki: oplata `mulDivUp`, tokeny `mulDivDown`, ETH ze sprzedazy `mulDivDown`, `need` przy dociagnieciu `mulDivUp` — **kazde na niekorzysc wolajacego**. Round-trip w jednym bloku dodatni: 0 przypadkow na 200k.
- Asercja `need + fee <= valueIn` (883) udowodniona, nie tylko przetestowana: `eIn` jest liczba calkowita >= `e(out0) >= ceil(e(out)) = need`, a oplata od mniejszej podstawy nie rosnie.
- Petla pyla nieoplacalna: `out == 0` i `gross == 0` rewertuja; 2 wei kupna daje tokeny po 2x cenie spot i nie da sie ich odsprzedac.
- `FullMath` — zgodne z Remco/Uniswap v3 linia po linii, `denominator == 0` domkniete na obu sciezkach, `mulDivUp` z ochrona przed przepelnieniem.
- `TickMath.getSqrtPriceAtTick` — 20 stalych porownanych z upstreamem v4 **co do bitu**, zaokraglenie Q128.128→Q64.96 w gore jak w oryginale.
- `LiquidityAmounts.getLiquidityForAmount0(sqrtCurrent, sqrtUpper, eLp)` — poprawka autora wobec spec jest **sluszna**; policzylem niezaleznie dla wszystkich czterech `tickSpacing`: `owed0 == eLp` **co do wei, zero pyla**, `owed1 = 154 666 666.67` tokena, margines do `T_MIN` 22.7%. Udowodnilem tez, ze `owed0 <= msg.value` zawsze (podwojne `ceil` v4 nie przebija floor-a w `getLiquidityForAmount0`) — nie ma przypadku, w ktorym awans dobiera ETH z pyla vaulta.
- `SQRT_PRICE_TERMINAL = 578600690649970598590869571498871` — przeliczone niezaleznie, **zgadza sie**; `G = 3.00 ETH` dokladnie.

**Reentrancja** — przeszedlem kazda sciezke wyplacajaca ETH:
- `_buy` refund (850), `_sell` net (973), `_payout` (1130), `graduate → seed{value}` (1028), `LiquidityVault._payoutEth` (542), `settle{value}` (466) — **wszystkie za `nonReentrant` i wszystkie po pelnym zapisaniu stanu**. CEI bez wyjatku, lacznie ze zmienionym wzgledem spec porzadkiem w `_sell` (uzasadnienie w 966-970 jest poprawne: transakcja jest atomowa, wiec wczesniejszy `transferFrom` niczego nie chronil).
- `_accrueFee` bez pusha — odbiorca oplaty ani wolajacy `graduate` nie moga wywrocic cudzej transakcji.
- `unlockCallback` (419): `msg.sender == POOL_MANAGER` **plus** flaga `_action` **plus** zgodnosc akcji z calldaty — trzy warunki, z ktorych kazdy zamyka co innego; obcy `unlock` nie trafi do naszego callbacku, bo v4 wola callback na wolajacym.
- Wspolny `_lock` vaulta blokuje wejscie z `take`/`receive()` w `harvest` do `seed`/`claim*`.

**Zamkniecie plynnosci (I-X6)** — potwierdzone na poziomie, na ktorym mialo byc: w calym `LiquidityVault` sa dokladnie dwa `modifyLiquidity`, jedno z `int256(uint256(uint128))` (449, brak reprezentacji ujemnej), jedno z literalnym `int256(0)` (495). Zadna funkcja publiczna nie przyjmuje typu ze znakiem (pilnuje tego test). Brak `owner`, `pause`, `upgrade`, `delegatecall`, `selfdestruct`, `rescue`, `withdraw`, `sweep`, setterow.

**Pozostale sprawdzone:**
- `PoolStateReader`: wyprowadzenie slotu `keccak256(poolId ‖ 6)` i odczyt dolnych 160 bitow Slot0 zgodne z v4 `StateLibrary`; `poolId = keccak256(abi.encode(key))` odpowiada `keccak256(key, 0xa0)` z v4 (5 pol statycznych = 160 bajtow). Fail-fast przy starcie (751) faktycznie potrafi odpasc.
- **Pulapka precompile'a ominieta**: pod `0.8.20` solc pomija kontrole `extcodesize` dla wywolan oczekujacych danych zwrotnych, wiec `createB20`/`hasRole`/`totalSupply` na koncie bez kodu nie wywala sie na „call to non-contract"; jedyne wywolanie bez zwrotu do tokena (`permit`) jest w `try/catch`. To dziala — ale przez wlasnosc kompilatora, nie przez jawna decyzje; warte notatki w kodzie.
- `BalanceDeltaLib`: przesuniecie arytmetyczne dla `amount0`, obciecie ze znakiem dla `amount1` — poprawne rozpakowanie v4.
- `totalLiabilities` nie ma sciezki niedomiaru; `claimable` bez clawbacku, przedawnienia i escheatu; `claimFor` ma kierunek przelewu zaszyty.
- Zapadki: `Curve → Locked → Graduated` jednokierunkowe, `seeded[token]` jednokierunkowe, brak powrotu do `Curve` (oscylacja wokol progu B3 zamknieta).
- `address(this).balance` nie wystepuje w wycenie ani w warunku progu **ani razu** (A4 zamkniete); brak `receive()`/`fallback()` na launchpadzie; `receive()` w vaulcie uzasadnione i konsekwencje opisane zgodnie z prawda.
- Prog na `tokenReserve == T_MIN`, nie na ETH — dociagniecie trafia co do jednostki, `refund` liczony poprawnie.
- `MAX_BUY`, `WINDOW_ADDR_CAP` (obejmuje dev-buy, rewertuje zamiast przycinac), `deadline` i niezerowy `minOut` wymagane w obie strony, `MAX_FEE_BPS`/`MAX_PROTOCOL_SHARE_BPS` jako sufity w kodzie — wszystko zgodne z opisem.
- Podzial oplat sumuje sie do calosci co do wei w obu trybach (`kind 0` i `kind 2`); pyl z dzielenia idzie do tworcy, nie do protokolu — zgodnie z komentarzem.
- Wiazanie launchpad↔vault w jednym konstruktorze, bez settera i bez przewidywania adresu — sprawdzalne dwoma odczytami.
- Testy: **nie sa teatrem**. `CurveLaunchpadInvariants.test.ts` (39 przypadkow, ktorych raport autora nie wymienia) pokrywa fuzz z ziarnami, wyplacalnosc do zera, wymuszona dotacje ETH przez `hardhat_setBalance`, sondy reentrancji z kontraktu, odbiorce rewertujacego, tryby sabotazu 6/7 (`RolesAlive(MINT_ROLE)`/`(PAUSE_ROLE)` **widziane, jak odpadaja**) i tryb 8 (`WrongVariant`). Stale rol porownane z odczytami mainnetu co do bitu.

**Czego nie da sie sprawdzic tym przegladem i co nadal jest wlasciwym poziomem dowodu:** fork mainnetu z prawdziwym `0x498581fF...` (w szczegolnosci pkt 1 — swap w pustej puli — jest wywnioskowany ze zrodel v4, nie zmierzony na lancuchu) oraz jedna pelna transakcja na Base Sepolia dla B20.

---

## RAPORT AUTORA KONTRAKTOW

Everything green: clean compile with zero warnings, 71/71 tests passing, nothing committed.

## Pliki

**Produkcja**
- `C:\dev\mysphere\contracts\launchpad\CurveLaunchpad.sol` (12 069 B deployed)
- `C:\dev\mysphere\contracts\launchpad\LiquidityVault.sol` (8 615 B)
- `C:\dev\mysphere\contracts\launchpad\interfaces\IB20Asset.sol`
- `C:\dev\mysphere\contracts\launchpad\interfaces\IPoolManagerV4.sol` (+ `BalanceDeltaLib`, `PoolStateReader`)
- `C:\dev\mysphere\contracts\launchpad\lib\FullMath.sol` (`mulDivDown` / `mulDivUp`)
- `C:\dev\mysphere\contracts\launchpad\lib\TickMath.sol`
- `C:\dev\mysphere\contracts\launchpad\lib\LiquidityAmounts.sol`

**Atrapy** — `C:\dev\mysphere\contracts\mocks\MockB20.sol` (rozszerzony w miejscu: role, `supplyCap`, `transfer`/`transferFrom`, `MockB20Seizable`, `createB20`/`getB20Address`/`setSabotage` w fabryce), `C:\dev\mysphere\contracts\mocks\MockPoolManager.sol` (nowy)

**Testy** — `C:\dev\mysphere\test\CurveLaunchpad.test.ts` (32 przypadki). `npm run contracts:test`: **71 passing, 0 failing**. `npx hardhat compile`: czysto, zero ostrzeżeń.

## Odejścia od specyfikacji

1. **Awans WYJĘTY z `buy`** (wymóg 6). Kupno domykające krzywą ustawia `Locked` i nic więcej — żadnego `try/catch`, żadnego wywołania do v4. `graduate()` jest jedyną ścieżką, bezuprawnieniowa, nagroda 0.05 ETH. Test `kupno przekraczajace prog kosztuje tyle samo, co zwykle` pilnuje tego liczbowo. Efekt uboczny wart nazwania: znika `catch` wokół ścieżki, przez którą przechodzą wszystkie pieniądze — `catch` nie odróżnia „pula zatruta" od „w kodzie jest błąd".
2. **Salt zawiera `blockhash(block.number - 1)`.** Salt ze spec był w pełni przewidywalny, więc adres tokena też — a adres tokena jest w `PoolKey`. Napastnik mógł za centy zainicjalizować wszystkie cztery pule z wyprzedzeniem i trwale odebrać danemu twórcy awans (nieudany `launch` nie zwiększa `nonce`, więc adres byłby zablokowany na zawsze). Cena: `previewTokenAddress(creator)` **nie istnieje**; zastąpione `tokenAddressForSalt(bytes32)` do weryfikacji po fakcie.
3. **Spec ma błąd w matematyce zasilenia puli.** `getLiquidityForAmount0(sqrtLower, sqrtUpper, eLp)` → poprawione na `(sqrtCurrent, sqrtUpper, eLp)`. Wzór Uniswapa dotyczy podprzedziału złożonego wyłącznie z token0; nasza pozycja obejmuje cenę bieżącą. Wersja ze spec zaniżyłaby L o kilkanaście rzędów i do puli poszedłby pył.
4. **Spec myli się w §3.2: „pula bez płynności nie może zmienić ceny".** Swap w pustej puli v4 konsumuje zero wejścia i idzie do zadanego limitu. Kontrola ceny co do bitu została (jest *konieczna*, nie nadmiarowa), przepisałem uzasadnienie. `MockPoolManager.poisonPrice` odwzorowuje to zachowanie.
5. **Asercja `policyId(TRANSFER_SENDER) == 0` NIE została napisana.** Numer slotu to enum, którego nie odczytaliśmy — zły numer wskazuje inny slot, który też jest zerem, więc asercja by przeszła i nic nie dowiodła. Asercja, która nie potrafi odpaść, jest teatrem. Zamiast niej: **`SEIZE_ROLE()` musi NIE istnieć** — to potrafi odpaść i wiąże `VARIANT_ASSET` z wariantem ASSET.
6. **Klucze pul liczone, nie zapisywane** (`poolKeys` jest `pure`) — oszczędza ~240k gazu na każdym starcie, w tym na 99%, które nie awansują. W stanie zostaje 4-bitowa maska.
7. **`seed(token, creator, PoolKey[4])` → `seed(token, creator, PoolKey, uint160)`.** Jeden kontrakt ma być właścicielem decyzji „która pula"; vault i tak sam weryfikuje kształt klucza i cenę.
8. **Vault wdrażany przez konstruktor launchpada.** Wiązanie obustronne w jednej transakcji, bez settera i bez przewidywania adresu. Konstruktor: `(feeBps, creatorFeeBps, feeRecipient, protocolShareBps)`.
9. **`sell`: CEI bez wyjątku** — `transferFrom` po zmianie stanu, nie przed (spec miała odwrotnie). Plus `nonReentrant`.
10. **Nowy przypadek, którego spec nie ma:** w `Locked` sprzedaże mogą zejść `ethReserve` poniżej `GRAD_FEE`. `ReserveTooSmallToGraduate()` — krzywa zostaje w Locked, sprzedaż działa, nikt nie jest uwięziony.
11. `MAX_PROTOCOL_SHARE_BPS = 8000` (podłoga 20% dla twórcy) — twardy sufit, którego spec nie miała.
12. Drobne: rezerwy spakowane w `uint128` (2 sloty), `quoteBuy/quoteSell/spotPrice` rewertują tam, gdzie operacja jest niemożliwa, `CurveLocked` bez pola `reason` (nie ma try/catch), `AlreadyLaunched` usunięty jako nieosiągalny, `deadline` sprawdzany zawsze.
13. **Odczyt ceny zaraz po własnym `initialize`** jako fail-fast na wyprowadzeniu `POOLS_SLOT = 6`. Błędne wyprowadzenie wywala PIERWSZY start na testnecie, a nie awans po zebraniu cudzych pieniędzy.

## Liczby ze spec §2.1 odtworzone dokładnie

`ethReserve` przy zamknięciu **3.0 ETH co do wei** · do puli **2.9 ETH, zero pyłu** · token do puli **154 666 666.67** · na adres martwy **45 333 333.33** · `tokenReserve == T_MIN` co do jednostki.

## Czego świadomie nie zrobiłem

- **Fuzz/invariant Foundry (§8.3)** i **test na forku mainnetu z prawdziwym PoolManagerem (§8.4)** — to jest właściwy poziom dowodu dla awansu, a nie moja atrapa. Skrypt Sepolia (§8.5) też nie.
- **Naprawy zatrutej puli swapem** (przesunięcie ceny pustej puli przed zasileniem). Zamknięte strukturalnie przez nieprzewidywalny salt; swap-repair to znany wariant v2, niezweryfikowany na łańcuchu, i wprowadzałby `swap` do vaulta, czyli psuł czytelność I-X6.
- Asercji `BURN_ROLE` / `METADATA_ROLE` (O2 nierozstrzygnięte — nieistniejący selektor zablokowałby każdy start). METADATA zostaje jako ryzyko do napisania na stronie tokena.
- Skryptu wdrożeniowego, `sellWithPermit` bez testu.

## Niepotwierdzone, na których stoi kod — do domknięcia PRZED mainnetem

`abi.encode(struct)` vs krotka dla `params` (O10) · `VARIANT_ASSET = 0` (osłonięte kontrolą `SEIZE_ROLE()`, nie udowodnione) · `POOLS_SLOT = 6` (osłonięte odczytem przy starcie) · dwuargumentowe `initialize(PoolKey,uint160)` w v4 · `transfer` na `0xdEaD` (O3) · realny gaz `launch`/`graduate` — pomiary z atrap (1.26M / 359k) są **zniekształcone**: atrapa `createB20` wdraża pełny kontrakt (~965k), prawdziwy precompile to ~212k.

Potwierdziłem osobno, że `keccak256("MINT_ROLE")` = `0x154c0081…6c3686` i `keccak256("PAUSE_ROLE")` = `0x139c2898…816e46d` — zgadza się co do bitu z odczytami z mainnetu w raporcie, więc stałe ról są wyliczane wzorem, a nie przepisywane.

W katalogu głównym leżą `b20probe.mjs` i `b20sig.mjs` — nie moje, nie ruszałem.
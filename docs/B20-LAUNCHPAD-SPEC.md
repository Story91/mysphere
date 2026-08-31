# Launchpad B20 - specyfikacja wdrozeniowa

> Dokument wygenerowany przez rozpoznanie wieloagentowe i ZWERYFIKOWANY
> odczytami z Base mainnet. Wszystko, co oznaczone jako POTWIERDZONE
> ODCZYTEM, zostalo sprawdzone wywolaniem na lancuchu, a nie przepisane
> z dokumentacji - ktora w kilku miejscach okazala sie nieaktualna.

---

# SPECYFIKACJA WDROZENIOWA — mysphere Launchpad B20 na krzywej wiazanej

Wersja: 1.0-impl. Dokument jest zamkniety: nie zostawia decyzji projektowych do podjecia przy edytorze. Wszystko, czego nie da sie rozstrzygnac bez lancucha, siedzi w **§0 — DO SPRAWDZENIA PRZED PIERWSZA LINIJKA**; nic z tej listy nie jest opcjonalne.

---

## 0. DO SPRAWDZENIA PRZED WDROZENIEM (nie po)

Kazdy punkt to jedna transakcja/odczyt na Base Sepolia albo `eth_call` na mainnecie. **Zaden nie jest do zalozenia.**

| # | Pytanie | Dlaczego blokuje kod | Co robimy, jesli odpowiedz jest zla |
|---|---|---|---|
| O1 | **`multiplier` wariantu ASSET** — czy da sie zaplanowac mnoznik podazy bez `DEFAULT_ADMIN_ROLE`? | Rebase pod pula v4 rozwala ksiegowosc AMM i niezmiennik `balanceOf(launchpad) == tokenReserve`. | Jesli da sie bez admina — **projekt stoi**, B20 nie nadaje sie na aktywo AMM. |
| O2 | **Ktore stale rol istnieja na ASSET.** Potwierdzone: `SEIZE_ROLE()` NIE istnieje (selektor `0x3c7e9ba5` odbija sie). Nieznane: `METADATA_ROLE`, `BURN_ROLE`. | Asercje post-warunkow z §3.1 musza sie skompilowac i nie rewertowac na nieistniejacym selektorze. | Asertujemy tylko role, ktore istnieja; brak roli = brak asercji, ale wtedy **musi to byc napisane na stronie tokena**, a nie przemilczane. |
| O3 | **Czy `transfer` na `0x000000000000000000000000000000000000dEaD` przechodzi** (i czy `transfer` na `address(0)` rewertuje). | Nadmiar 45.33M tokena przy awansie idzie na adres martwy. Nie mamy `BURN_ROLE`, wiec **prawdziwego palenia nie ma**. | Jesli `0xdEaD` rewertuje — trzeba innego adresu-smietnika; jesli `address(0)` przechodzi, uzywamy go i mowimy „spalone" zgodnie z prawda. |
| O4 | **Czy `supplyCap` po ustawieniu == `totalSupply` jest nieodwracalny bez roli.** | Niezmiennik „nikt nie dodrukuje" opiera sie na dwoch rzeczach naraz. | Zostaje sam brak `MINT_ROLE` — slabsze, do napisania wprost. |
| O5 | **PolicyRegistry `0x8453…0002`: czy istnieje sciezka ustawienia polityki dla tokena BEZ jego `DEFAULT_ADMIN_ROLE`** (globalna/domyslna, narzucana przez Base). | Blocklista na kontrakcie krzywej = 100% strata wszystkich posiadaczy. **To jest blocker projektowy, nie detal.** | Projekt stoi. |
| O6 | **ActivationRegistry `0x8453…0001`** — czy Base moze dezaktywowac wariant ASSET i co to robi z istniejacymi tokenami. | Ryzyko poza nasza kontrola; musi byc opisane na stronie, nie odkryte. | Opisujemy w „czego nie kontrolujemy". |
| O7 | **Adres `PoolManager` na Base Sepolia** (mainnet potwierdzony: `0x498581fF718922c3f8e6A244956aF099B2652b2b`). | Bez tego nie ma etapu Sepolia. | Jesli v4 nie ma na Sepolii — etap Sepolia robimy tylko dla krzywej, awans testujemy kanarkiem na mainnecie za 0.01 ETH. |
| O8 | **Gaz pelnego awansu** (`unlock` + `modifyLiquidity` + `settle` + `sync`/`transfer` + transfer na dead) zmierzony na Sepolii. | §5 zaklada, ze awans miesci sie w ostatnim `buy`. Precompile B20 ma **wlasna wycene gazu, ktorej lokalny EVM nie zna**. | Patrz „NAJWIEKSZE RYZYKO" na koncu. |
| O9 | **Gaz `poolManager.initialize` × 4 tiery** w transakcji startowej. | §3.2 inicjalizuje cztery pule przy starcie. | Jesli > ~400k lacznie, tniemy liste tierow do dwoch: `(10000,200)` i `(3000,60)`. |
| O10 | **Dokladne kodowanie `initCalls`** dla `mint(launchpad, T0)` i `updateSupplyCap(T0)` oraz to, ze `initialAdmin = address(0)` faktycznie przechodzi przez bramke bootstrapu w prawdziwej transakcji (raport ma to z `eth_call`, nie z transakcji). | Cala ceremonia startu. | — |

---

## 1. LISTA KONTRAKTOW

Zasada repo: **kontrakt albo trzyma pieniadze, albo nie; jesli trzyma, nie istnieje zadna rola, ktora moze je ruszyc poza regula.** Trzy pliki, z czego dwa trzymaja pieniadze.

| Kontrakt | Trzyma pieniadze? | Jednozdaniowa odpowiedzialnosc |
|---|---|---|
| **`CurveLaunchpad.sol`** | **TAK** — cale ETH wszystkich krzywych i cala podaz wszystkich tokenow przed awansem | Tworzy token B20 bez wlasciciela, jest jedyna druga strona handlu na krzywej wiazanej, nalicza oplaty do `claimable` i wykonuje awans. |
| **`LiquidityVault.sol`** | **TAK — na zawsze** | Jest wlascicielem pozycji Uniswap v4 kazdego awansowanego tokena i **nie zawiera bajtu kodu zdolnego zmniejszyc plynnosc**; jedyne, co z niego wychodzi, to narosle oplaty LP. |
| **`interfaces/` + `lib/`** | NIE | `IB20Factory`, `IB20`, `IPoolManager` (podzbior), oraz zwendorowane `mulDiv`, `TickMath.getSqrtPriceAtTick`, `LiquidityAmounts.getLiquidityForAmount0` — **zero importow z npm**, tak jak `AskEscrow.sol`: to, co czyta audytor, jest calym kodem, ktory sie wykona. |

### 1.1 Rozstrzygniecie: singleton, nie kontrakt-na-token

Raporty milcza, wiec rozstrzygam: **jeden `CurveLaunchpad` na wszystkie starty**, ksiegowosc per-token w mapie — dokladnie jak `AskEscrow` trzyma wszystkie escrowy w jednej mapie z `totalLiabilities`.

- Klon-per-token wymaga proxy, czyli `delegatecall`, ktorego w tym repo nie ma i nie bedzie.
- Parametry krzywej i tak sa `constant`/`immutable`, wiec izolacja per-token nic by nie dala poza wieksza powierzchnia deployu.
- Cena: blad w jednej sciezce dotyka wszystkich krzywych naraz. Placimy ja swiadomie i domykamy niezmiennikiem globalnym `I-G1` (§6).

### 1.2 Czego w zadnym z tych kontraktow NIE MA

`owner`, `admin`, `pause`, `upgrade`, `delegatecall`, `selfdestruct`, `rescue`, `withdraw`, `sweep`, `setFee`, `setRecipient`, `receive()`, `fallback() payable`. Zadnego odczytu `address(this).balance` w wycenie ani w warunku progu (**wektor A4**; jedyne wystapienie: opcjonalna asercja `I-G1`, ktora nic nie wylicza).

---

## 2. STALE I PARAMETRY

```solidity
// --- podaz i krzywa ---
uint256 constant T0        = 1_000_000_000e18;   // 1e27, mintowane RAZ
uint256 constant T_MIN     = 200_000_000e18;     // 2e26, rezerwa awansu
uint256 constant R_VIRT    = 0.75 ether;         // wirtualne ETH, NIGDY nie wyplacane
uint8   constant DECIMALS  = 18;
uint8   constant VARIANT_ASSET = /* z O10 */;

// --- oplaty (immutable, z twardym sufitem w konstruktorze) ---
uint16  constant MAX_FEE_BPS = 200;
uint16  public immutable FEE_BPS;          // 100 = 1%, od kupna i od sprzedazy
uint16  public immutable CREATOR_FEE_BPS;  // 40  = 0.4%, PODZBIOR FEE_BPS
address public immutable FEE_RECIPIENT;

// --- awans ---
uint256 constant GRAD_FEE            = 0.1 ether;   // z ethReserve, raz
uint256 constant GRAD_CALLER_REWARD  = 0.05 ether;  // TYLKO w sciezce Locked
address constant DEAD = 0x000000000000000000000000000000000000dEaD; // zalezne od O3

// --- limity handlu ---
uint256 constant MAX_BUY            = 100 ether;      // granica analizy przepelnienia
uint256 constant LAUNCH_WINDOW      = 300;            // sekundy od startu
uint256 constant WINDOW_ADDR_CAP    = 16_000_000e18;  // 2% podazy krzywej, NA ADRES, w oknie

// --- v4 ---
address constant POOL_MANAGER = 0x498581fF718922c3f8e6A244956aF099B2652b2b; // Base mainnet
uint160 constant SQRT_PRICE_TERMINAL = /* sqrt(T_MIN / (R_VIRT + G)) << 96, ~5.7869e32 */;
// cztery kandydujace warstwy oplat, w tej kolejnosci:
// (10000, 200), (3000, 60), (500, 10), (100, 1)
```

**`WINDOW_ADDR_CAP` jest jednoczesnie limitem dev-buya.** Tworca to zwykly adres w oknie startowym — jedna stala, jedna regula, zero wyjatkow. Kupno przekraczajace limit **rewertuje** (nie przycina), zeby wolajacy nie dostal cichej podmiany intencji.

**Uczciwie o skutecznosci `WINDOW_ADDR_CAP`:** to nie jest anty-bot. Sybil kosztuje centy. Wartosc jest jedna i tylko taka nalezy ja opisywac: **zmusza snajpera do rozbicia zakupu na wiele adresow i blokow, czyli do zrobienia tego na oczach ludzi.**

### 2.1 Liczby wynikowe (sprawdzalne w tescie startowym)

| wielkosc | wartosc |
|---|---|
| kurs startowy | `7.5e-10 ETH/token` |
| kurs terminalny | `1.875e-8 ETH/token` (25x, `(T0/(T0-C))²`) |
| zbiorka do awansu `G` | **`3.00 ETH` dokladnie** (`R_VIRT·C/(T0−C)`) |
| ETH do puli | `2.90 ETH` |
| token do puli | `154 666 666…` (`E_lp · T_MIN / 3.75e18`) |
| token na adres martwy | `~45 333 334` (4.53% podazy, `totalSupply` **sie nie zmienia**) |
| podaz w obiegu po awansie | `~954 666 666` |
| koszt dev-buya po cenie startowej | `~0.0122 ETH` przy pelnym limicie 16M |

---

## 3. TWORZENIE TOKENA

### 3.1 `launch()` — jedna transakcja, zero okna

```solidity
function launch(
    string calldata name,
    string calldata symbol,
    uint256 minTokensOut,   // dla dev-buya; 0 dopuszczalne TYLKO gdy msg.value == 0
    uint256 deadline
) external payable returns (address token, bytes32 launchId);
```

Kolejnosc, w calosci atomowa:

1. `salt = keccak256(abi.encode(address(this), creator, creatorNonce[creator]++, block.chainid))`.
   **Salt nigdy nie pochodzi z wejscia uzytkownika** (wektor D1). Kolizja miedzy dwoma uzytkownikami jest niemozliwa; powtorka to czysty revert.
2. `token = IB20Factory(0xB20f…).createB20{value: 0}(VARIANT_ASSET, salt, params, initCalls)`
   - `params = B20AssetCreateParams{version:1, name, symbol, initialAdmin: address(0), decimals: 18}`
   - `initCalls = [ mint(address(this), T0), updateSupplyCap(T0) ]`
   - **`value` musi byc 0** — fabryka rewertuje `NonPayable()` (`0x6fb1b0e9`) na kazde wei.
3. Asercje post-warunkow — **kazdy falsz rewertuje caly start**:
   ```solidity
   require(IB20Factory(F).isB20Initialized(token));          // NIE isB20 (teatr T8)
   require(IB20(token).totalSupply() == T0);
   require(IB20(token).balanceOf(address(this)) == T0);
   require(IB20(token).supplyCap()   == T0);
   require(!IB20(token).hasRole(DEFAULT_ADMIN_ROLE, address(0)));
   require(!IB20(token).hasRole(DEFAULT_ADMIN_ROLE, address(this)));
   require(!IB20(token).hasRole(MINT_ROLE,  address(this)));
   require(!IB20(token).hasRole(PAUSE_ROLE, address(this)));
   require(IB20(token).policyId(TRANSFER_SENDER) == 0);
   // + METADATA/BURN wedlug wyniku O2
   ```
   `SEIZE` **nie jest asertowane** — na wariancie ASSET ta rola nie istnieje, a wolanie nieistniejacego selektora rewertuje.
4. **Inicjalizacja czterech pul v4** (patrz 3.2).
5. Zapis `launches[token]`, emisja `Launched` + 4× `PoolPrepared`.
6. Jesli `msg.value > 0` — dev-buy przez **te sama sciezke `_buy`**, co wszyscy, z tym samym `WINDOW_ADDR_CAP`, ta sama oplata, ta sama krzywa. Tworca nie dostaje ani jednego tokena za darmo.

### 3.2 Pule tworzymy MY, przy starcie, wszystkie cztery

Wektor A2 (wroga pula z zatruta cena) jest zamykany strukturalnie: przy starcie wolamy `poolManager.initialize(key_i, SQRT_PRICE_TERMINAL)` dla **wszystkich czterech** warstw oplat, `hooks = address(0)`, `currency0 = address(0)` (natywne ETH), `currency1 = token` — kolejnosc jest deterministyczna, bo adres B20 zawsze zaczyna sie od `0xb2`.

- Jesli ktoras `initialize` rewertuje (`PoolAlreadyInitialized` — ktos przewidzial nasz salt i uprzedzil nas), **lapiemy w `try/catch` i idziemy dalej**; pula jest zapisana jako „nie nasza".
- Przy awansie bierzemy **pierwsza po kolei** pule, ktorej `sqrtPriceX96` **jest dokladnie rowny** `SQRT_PRICE_TERMINAL`. Bez tolerancji, bez progu procentowego — rownosc bitowa. Pula bez plynnosci nie moze zmienic ceny, wiec rownosc jest osiagalna co do bitu, a kazda inna wartosc znaczy „ktos tu byl".
- **Nigdy nie czytamy `getPool()` w chwili awansu, zeby zdecydowac dokad ida pieniadze.** Cztery klucze sa wyliczone i zapisane przy starcie; przy awansie tylko weryfikujemy cene.
- Napastnik nie ma skad wziac tokena przed awansem inaczej niz kupujac na naszej krzywej (i placac nam oplate), wiec zatrucie ogranicza sie do ustawienia zlej ceny startowej. Zatrucie czterech tierow to cztery transakcje i cztery martwe pule po jego stronie.

**Rozstrzygniecie: Uniswap v4, nie Aerodrome.** Sciezka v4 jest zweryfikowana end-to-end (`initialize` → `unlock` → `modifyLiquidity` → `settle`, `paid == owed` co do wei, swap i zbior oplat dzialaja). Aerodrome ma tylko potwierdzony kod pod adresem. Nie budujemy na niezweryfikowanym.

**Rozstrzygniecie: `hooks = address(0)`.** Kopanie adresu hooka CREATE2 pod 14 dolnych bitow to dodatkowy krok deployu i dodatkowa powierzchnia audytu, a prowizje bierzemy na krzywej i z oplat LP.

---

## 4. MASZYNA STANOW

```
        launch()                    tokenReserve == T_MIN
 [None] ────────► [Curve] ──────────────────────────────► [Graduated]  (terminalny)
                     │      awans atomowy w tym samym buy       ▲
                     │                                          │
                     │ awans rzucil wyjatkiem (try/catch)       │ graduate()
                     └────────────► [Locked] ───────────────────┘  bezuprawnieniowe
```

| Stan | `buy` | `sell` | `graduate` | `claim` | `harvest` |
|---|---|---|---|---|---|
| **None** | revert `UnknownToken` | revert | revert | — | — |
| **Curve** | **TAK** (limit okna; tworca tez) | **TAK**, poza tworca (`CreatorLocked`) | revert `NotLocked` | TAK | — |
| **Locked** | **revert `Locked`** | **TAK** — nikt nigdy nie jest uwieziony | **TAK**, kazdy, nagroda 0.05 ETH | TAK | — |
| **Graduated** | revert `Graduated` | revert `Graduated` | revert | TAK | **TAK**, kazdy |

**Przejscia nieodwracalne (zapadka, jednokierunkowo):** `Curve→Locked`, `Curve→Graduated`, `Locked→Graduated`. Nie istnieje sciezka powrotu do `Curve`. To zamyka B3 (oscylacja wokol progu): sprzedaz w stanie `Locked` podnosi `tokenReserve` powyzej `T_MIN`, ale kupno jest juz zablokowane, wiec krzywa nie moze sie „odawansowac".

### 4.1 Rozstrzygniecie sprzecznosci: awans atomowy vs `graduate()`

Raport o atakach (B2) zada awansu **wylacznie** atomowego i zadnego `graduate()`. Raport ekonomiczny chce `try/catch` + `graduate()` z nagroda. **Oba maja racje i nie sa sprzeczne, jesli `Locked` blokuje KUPNO.**

Obawa B2 brzmi: „krzywa jest nad progiem i dalej handluje, kazdy blok to darmowa opcja". Darmowa opcja istnieje tylko po stronie **kupna** (kupic tuz pod cena puli i sprzedac w puli po awansie). W stanie `Locked` kupno rewertuje, wiec opcji nie ma. Sprzedaz oddala od progu i jest jedyna rzecza, ktora **musi** dzialac, bo alternatywa to stan zakladniczy.

Twardy revert bez `Locked` odpada: awans, ktory rewertuje, zabralby razem ze soba kupno ostatniego uzytkownika i zamurowalby krzywe na zawsze.

**Zmiana wobec raportu ekonomicznego:** w sciezce atomowej **cale `GRAD_FEE` idzie do protokolu**, bez 0.05 ETH dla ostatniego kupujacego. Powod: 0.05 ETH to ~500x koszt gazu na Base — nie zwrot kosztu, tylko dotacja, ktora tworzy wyscig o bycie ostatnim kupujacym (czyli dokladnie snajping progu z B1, tylko oplacony przez nas). W sciezce `Locked` nagroda 0.05 ETH zostaje, bo tam nic innego nie sklania do zawolania.

---

## 5. MATEMATYKA NA uint256

Stan per token: `ethReserve` (realne wei), `tokenReserve` (realne jednostki bazowe). `R = R_VIRT + ethReserve`. Niezmiennik: `R · tokenReserve = k`, `k` **niemalejace**.

**Rezerw NIGDY nie przeliczamy z `k`.** `ethReserve` i `tokenReserve` zmieniaja sie dokladnie o kwoty, ktore fizycznie sie przemiescily. Odtworzenie `T = k/R` skasowaloby narosly margines i nastepna operacja wyssalaby go z powrotem.

**Zaden odczyt `balanceOf` ani `address(this).balance` nie wchodzi do wyceny.**

### 5.1 Kupno

```solidity
if (block.timestamp > deadline)       revert Expired();
if (minTokensOut == 0)                revert SlippageRequired();   // brak wartosci domyslnych
if (msg.value == 0)                   revert ZeroAmount();
if (msg.value > MAX_BUY)              revert BuyTooLarge();
if (state != Curve)                   revert /* Locked | Graduated */;

uint256 fee = mulDiv(msg.value, FEE_BPS, 10_000, Ceil);          // W GORE
uint256 eIn = msg.value - fee;
uint256 R   = R_VIRT + ethReserve;
uint256 out = mulDiv(tokenReserve, eIn, R + eIn, Floor);          // W DOL
uint256 refund = 0;

// dociagniecie ostatniego kupna: T ma wyladowac na T_MIN CO DO JEDNOSTKI
if (tokenReserve - out < T_MIN) {
    out          = tokenReserve - T_MIN;
    uint256 need = mulDiv(R, out, tokenReserve - out, Ceil);      // W GORE
    fee          = mulDiv(need, FEE_BPS, 10_000, Ceil);           // PRZELICZ
    if (need + fee > msg.value) revert Arithmetic();              // asercja, nie moze wystapic
    eIn          = need;
    refund       = msg.value - need - fee;
}

if (out == 0)          revert DustTrade();      // blokada pylu
if (out < minTokensOut) revert Slippage();

// limit okna startowego (obejmuje dev-buy)
if (block.timestamp < startedAt + LAUNCH_WINDOW) {
    uint256 acc = windowBought[token][msg.sender] + out;
    if (acc > WINDOW_ADDR_CAP) revert WindowCap();
    windowBought[token][msg.sender] = acc;
}

ethReserve += eIn;
tokenReserve -= out;
_accrueFee(token, fee);                          // do claimable, NIGDY push
token.transfer(msg.sender, out);
emit Bought(...);

if (tokenReserve == T_MIN) _tryGraduate(token);  // atomowo, w try/catch
if (refund != 0) _sendEth(msg.sender, refund);   // OSTATNIA operacja
```

**Prog jest na tokenie (`tokenReserve == T_MIN`), nie na ETH.** Warunek `ethReserve >= 3 ether` moglby wyladowac na `2.9999…` przez zaokraglenia w dol i nigdy nie trafic.

### 5.2 Sprzedaz

```solidity
if (block.timestamp > deadline)  revert Expired();
if (minEthOut == 0)              revert SlippageRequired();
if (nIn == 0)                    revert ZeroAmount();
if (state == Graduated)          revert Graduated();
if (msg.sender == creator)       revert CreatorLocked();          // do awansu wlacznie

uint256 R     = R_VIRT + ethReserve;
uint256 gross = mulDiv(R, nIn, tokenReserve + nIn, Floor);         // W DOL
assert(gross <= ethReserve);                                      // straznik wyplacalnosci
uint256 fee   = mulDiv(gross, FEE_BPS, 10_000, Ceil);              // W GORE
uint256 net   = gross - fee;
if (gross == 0)     revert DustTrade();
if (net < minEthOut) revert Slippage();

token.transferFrom(msg.sender, address(this), nIn);   // przed zmiana stanu; token jest NASZ z rejestru
tokenReserve += nIn;
ethReserve   -= gross;
_accrueFee(token, fee);
emit Sold(...);
_sendEth(msg.sender, net);                            // OSTATNIA operacja, nonReentrant
```

Opcjonalnie `sellWithPermit(...)` — B20 ma ERC-2612, wiec jedno wywolanie zamiast dwoch.

### 5.3 Reguly zaokraglen

| wielkosc | kierunek | kto traci |
|---|---|---|
| oplata (kupno i sprzedaz) | **w gore** | wolajacy |
| tokeny wydane przy kupnie | **w dol** | wolajacy |
| ETH wymagane przy dociagnieciu | **w gore** | wolajacy |
| ETH wyplacone przy sprzedazy | **w dol** | wolajacy |
| plynnosc `L` przy zasilaniu puli | **w dol** (z ETH) | pula (nadmiar tokena → adres martwy) |

Dowod wystarczalnosci: dokladna matematyka zachowuje `R·T = k` co do jedności. Zaokraglenie `out` w dol zostawia w kontrakcie **wiecej** tokena; zaokraglenie `gross` w dol zostawia **wiecej** ETH. W obu przypadkach `R'·T' ≥ k`. **`k` niemalejace to jedyne zdanie, ktore trzeba sprawdzic** — i jest to `I-C1`.

Na Base gaz jest tani, wiec petla mikro-transakcji przeciw zaokragleniu na korzysc uzytkownika **oplacilaby sie** — stad `revert` na `out == 0` i `gross == 0`.

### 5.4 Przepelnienie

- `tokenReserve * eIn`: `1e27 · eIn` — **jedyne miejsce, gdzie uzytkownik kontroluje wielkosc bez ograniczenia**. `mulDiv` (posrednik 512-bitowy) usuwa ryzyko; `MAX_BUY = 100 ether` domyka analize.
- `R * nIn ≤ 3.75e18 · 1e27 = 3.75e45` — bezpieczne nawet naiwnie.
- `msg.value · MAX_FEE_BPS` — przepelnia przy `5.8e74 wei`.
- Asercja `R·T ≤ 3.75e45 ≪ 1.16e77`.

### 5.5 Awans — matematyka zasilenia puli

```solidity
uint256 gradFee = GRAD_FEE;               // 0.1 ETH z ethReserve
uint256 eLp     = ethReserve - gradFee;   // ~2.90 ETH
// wybor puli: pierwsza z czterech, ktorej sqrtPriceX96 == SQRT_PRICE_TERMINAL
// pelen zakres, wyrownany do tickSpacing:
//   tickLower = -(887272 / ts) * ts ,  tickUpper = +(887272 / ts) * ts
// L liczone Z ETH (amount0), token jest luzem:
uint128 L      = getLiquidityForAmount0(sqrtLower, sqrtUpper, eLp);   // FLOOR
// owed0 <= eLp z konstrukcji; owed1 = pochodna L, ~154.67M, zawsze < T_MIN
```

**ETH jest strona wiazaca, token luzem.** Dzieki temu do puli trafia **cale** `eLp` (poza pylem rzedu wei), a nadmiar tokena (~45.33M) idzie na adres martwy. Odwrotny wybor zostawilby w vaulcie niewyplacalne ETH.

Cena otwarcia puli = `SQRT_PRICE_TERMINAL` = **dokladnie cena zamkniecia krzywej**. To nie jest kosmetyka: bez tego pula otwiera sie ~23% nizej i kazdy, kto kupil na koncu krzywej, jest pod woda w bloku awansu — czyli darmowe pieniadze dla pierwszego handlujacego w puli (B1).

**W sciezce `Locked`** cena krzywej moze byc nizsza niz terminalna (byly sprzedaze). Zasilamy i tak **po cenie puli** (`SQRT_PRICE_TERMINAL`), bo ETH jest strona wiazaca — konsekwencja jest taka, ze pula otwiera sie **powyzej** biezacej ceny krzywej, czyli luka jest **na niekorzysc** pierwszego handlujacego w puli, nie na korzysc. To jest wymagany kierunek z B1.

---

## 6. NIEZMIENNIKI (do przepisania wprost na asercje)

### Per token, po **kazdym** `buy` i `sell` (nie po awansie)

| id | asercja |
|---|---|
| **I-C1** | `(R_VIRT + ethReserve) * tokenReserve >= kBefore` — `k` niemalejace |
| **I-C2** | `T_MIN <= tokenReserve <= T0` |
| **I-C3** | `IB20(token).balanceOf(launchpad) == tokenReserve` (dopoki `state != Graduated`) |
| **I-C4** | `IB20(token).totalSupply() == T0` — **na kazdym etapie, zawsze**; brak mintu po konstrukcji |
| **I-C5** | `quoteSell(T0 - tokenReserve) <= ethReserve` — wyplacalnosc zbiorcza (wynika z I-C1, zostaje osobno bo jest czytelna dla czlowieka) |
| **I-C6** | `quoteSell(quoteBuy(E)) < E` dla kazdego `E > 0` — round-trip w jednym bloku zawsze na minusie o co najmniej `2·fee` |
| **I-C7** | `quoteBuy` slabo rosnaca w `E`; cena po kupnie ostro rosnie, po sprzedazy ostro maleje |
| **I-C8** | `ethReserve` maleje **wylacznie** w `sell` i w awansie. Nie istnieje sciezka wyprowadzajaca ETH poza: sprzedajacy, `claimable`, `LiquidityVault`, wolajacy `graduate` (nagroda) |
| **I-C9** | dla kazdego osiagalnego stanu i kazdego `n > 0` posiadanego przez adres ≠ tworca: `sell(n)` konczy sie sukcesem, albo token jest `Graduated` i pula istnieje. **Nie ma stanu, w ktorym posiadacz nie moze wyjsc** |
| **I-C10** | tworca nie sprzedal ani jednej sztuki na krzywej |
| **I-C11** | w oknie startowym: `windowBought[token][a] <= WINDOW_ADDR_CAP` dla kazdego `a` |

### Globalne (caly kontrakt, po kazdej operacji)

| id | asercja |
|---|---|
| **I-G1** | `address(this).balance >= Σ ethReserve[t] + Σ claimable[a]` — **jedyne** miejsce, gdzie w ogole pada `balance`, i nic z niego nie wylicza |
| **I-G2** | `Σ oplat naliczonych == Σ oplat wyplaconych + Σ claimable` |
| **I-G3** | `claimable[a]` nie ma zadnej sciezki powrotu do kogokolwiek innego — brak clawbacku, przedawnienia, escheatu (wzorzec `AskEscrow`) |

### Po awansie

| id | asercja |
|---|---|
| **I-X1** | `state == Graduated` jest jednokierunkowe; `buy` i `sell` rewertuja bezwarunkowo |
| **I-X2** | `ethReserve == 0 && tokenReserve == 0` |
| **I-X3** | `IB20(token).balanceOf(launchpad) == 0` |
| **I-X4** | `balanceOf(pool) + balanceOf(DEAD) + Σ posiadacze == T0` |
| **I-X5** | cena spot puli tuz po zasileniu == `SQRT_PRICE_TERMINAL` co do bitu |
| **I-X6** | w `LiquidityVault` nie istnieje sciezka wykonania, w ktorej `liquidityDelta < 0`. **Asercja na bajtkodzie, nie na intencji**: w calym kontrakcie jest dokladnie jedno wywolanie `modifyLiquidity` z delta zmienna (`seed`, osiagalne raz na token, tylko z launchpada) i jedno ze stalym `0` (`harvest`) |
| **I-X7** | `seeded[token]` jednokierunkowe; drugi `seed` rewertuje |

### Token B20 (test startowy + publikacja na stronie tokena)

| id | asercja |
|---|---|
| **I-B1** | brak `MINT_ROLE`, brak `DEFAULT_ADMIN_ROLE` (u nikogo, wlacznie z `address(0)` jako posiadaczem), brak `PAUSE_ROLE` |
| **I-B2** | `supplyCap == totalSupply == T0` |
| **I-B3** | `policyId(TRANSFER_SENDER) == 0` (built-in always-allow) |
| **I-B4** | `isB20Initialized(token) == true` — **nie `isB20`**, ktore sprawdza sam format adresu i zwraca `true` dla tokena, ktorego nie ma |

---

## 7. SYGNATURY

### 7.1 `CurveLaunchpad`

```solidity
// ---------- konstruktor ----------
constructor(uint16 feeBps, uint16 creatorFeeBps, address feeRecipient, address vault);
//   feeBps <= MAX_FEE_BPS, creatorFeeBps <= feeBps, feeRecipient != 0, vault != 0

// ---------- start ----------
function launch(string calldata name, string calldata symbol, uint256 minTokensOut, uint256 deadline)
    external payable returns (address token, bytes32 launchId);

// ---------- handel ----------
function buy(address token, uint256 minTokensOut, uint256 deadline)
    external payable returns (uint256 tokensOut);

function sell(address token, uint256 tokensIn, uint256 minEthOut, uint256 deadline)
    external returns (uint256 ethOut);

function sellWithPermit(address token, uint256 tokensIn, uint256 minEthOut, uint256 deadline,
                        uint256 permitDeadline, uint8 v, bytes32 r, bytes32 s)
    external returns (uint256 ethOut);

// ---------- awans ----------
function graduate(address token) external;            // TYLKO w stanie Locked, bezuprawnieniowe

// ---------- oplaty ----------
function claim() external;
function claimFor(address account) external;

// ---------- odczyty (czysta funkcja stanu, ZERO odczytow balance) ----------
function launchOf(address token) external view returns (
    address creator, uint8 state, uint256 ethReserve, uint256 tokenReserve,
    uint40 startedAt, bytes32 launchId);
function quoteBuy(address token, uint256 ethIn)
    external view returns (uint256 tokensOut, uint256 fee, uint256 refund);
function quoteSell(address token, uint256 tokensIn)
    external view returns (uint256 ethOut, uint256 fee);
function spotPriceWeiPerToken(address token) external view returns (uint256);
function poolKeys(address token) external view returns (PoolKey[4] memory);
function claimable(address account) external view returns (uint256);
function totalLiabilities() external view returns (uint256);
function previewTokenAddress(address creator) external view returns (address);
```

### 7.2 Zdarzenia `CurveLaunchpad` — **cala historia z samych logow**

```solidity
event Launched(
    address indexed token, address indexed creator, bytes32 indexed launchId,
    string name, string symbol,
    uint256 totalSupply, uint256 curveSupply, uint256 tMin, uint256 rVirt,
    uint16 feeBps, uint16 creatorFeeBps, uint40 startedAt);

event PoolPrepared(
    address indexed token, bytes32 indexed poolId,
    uint24 fee, int24 tickSpacing, uint160 sqrtPriceX96, bool initializedByUs);

event Bought(
    address indexed token, address indexed buyer,
    uint256 ethIn, uint256 ethNet, uint256 feeEth, uint256 tokensOut, uint256 refund,
    uint256 ethReserveAfter, uint256 tokenReserveAfter);

event Sold(
    address indexed token, address indexed seller,
    uint256 tokensIn, uint256 ethGross, uint256 feeEth, uint256 ethOut,
    uint256 ethReserveAfter, uint256 tokenReserveAfter);

event FeeAccrued(
    address indexed token, address indexed account, uint256 amount, uint8 kind);
    // kind: 0 = handel/protokol, 1 = handel/tworca, 2 = awans/protokol, 3 = awans/wolajacy

event CurveLocked(address indexed token, bytes reason);   // awans rzucil wyjatkiem

event Graduated(
    address indexed token, bytes32 indexed poolId, address indexed caller,
    uint256 ethToPool, uint256 tokensToPool, uint256 tokensToDead,
    uint256 gradFee, uint160 sqrtPriceX96);

event Claimed(address indexed account, uint256 amount, address indexed caller);
```

**Rekonstrukcja bez naszej bazy:**
- **wykres krzywej** = `(R_VIRT + ethReserveAfter) / tokenReserveAfter` z kazdego `Bought`/`Sold`, w kolejnosci blokow. Zaden zewnetrzny indekser nie pokaze tokena przed awansem — DexScreener i GeckoTerminal reaguja na powstanie **PULI**, nie tokena. **Nie wolno obiecywac „token od razu na DexScreenerze".**
- **naplyw netto ETH** = `Σ ethNet(Bought) − Σ ethGross(Sold)`.
- **posiadacze** = zdarzenia `Transfer` samego B20.
- **przychod** = `FeeAccrued` + `Claimed`.
- **atrybucja kupujacego** = wylacznie `Bought.buyer`. **Zdarzenie `Memo` z B20 niesie WOLAJACEGO, nie placacego** — na krzywej wolajacym jest nasz launchpad, po awansie router. `Memo` jest tu bezuzyteczne i nie wolno na nim niczego oprzec.

### 7.3 Bledy `CurveLaunchpad`

```solidity
error ZeroAddress(); error FeeTooHigh(); error CreatorFeeTooHigh();
error UnknownToken(); error AlreadyLaunched();
error Expired(); error SlippageRequired(); error Slippage();
error ZeroAmount(); error DustTrade(); error BuyTooLarge(); error WindowCap();
error CreatorLocked(); error CurveIsLocked(); error AlreadyGraduated(); error NotLocked();
error NotB20();                 // isB20Initialized == false
error RolesAlive(bytes32 role); // post-warunek roli
error SupplyMismatch(); error CapMismatch(); error PolicyActive();
error Arithmetic(); error NothingToClaim(); error EthTransferFailed(); error Reentrancy();
```

### 7.4 `LiquidityVault`

```solidity
constructor(address poolManager, address launchpad, address feeRecipient,
            uint16 protocolShareBps /* 6000 */);

function seed(address token, address creator, PoolKey[4] calldata keys)
    external payable;                       // TYLKO msg.sender == LAUNCHPAD, raz na token
function harvest(address token) external;   // bezuprawnieniowe, liquidityDelta ZASZYTE na 0
function claimEth() external;
function claimEthFor(address account) external;
function claimToken(address token) external;
function claimTokenFor(address token, address account) external;
function unlockCallback(bytes calldata data) external returns (bytes memory);
                                            // msg.sender == POOL_MANAGER && flaga wejscia

function positionOf(address token) external view
    returns (bytes32 poolId, uint128 liquidity, int24 tickLower, int24 tickUpper);
function claimableEth(address account) external view returns (uint256);
function claimableToken(address token, address account) external view returns (uint256);

event Seeded(address indexed token, bytes32 indexed poolId, address indexed creator,
             uint128 liquidity, uint256 amount0, uint256 amount1,
             uint256 ethDust, uint256 tokensToDead, int24 tickLower, int24 tickUpper);
event Harvested(address indexed token, bytes32 indexed poolId, address indexed caller,
                uint256 fee0, uint256 fee1);
event LpFeeAccrued(address indexed token, address indexed account,
                   uint256 ethAmount, uint256 tokenAmount);
event EthClaimed(address indexed account, uint256 amount, address indexed caller);
event TokenClaimed(address indexed token, address indexed account, uint256 amount);

error NotLaunchpad(); error NotPoolManager(); error NotUnlocking();
error AlreadySeeded(); error NoCleanPool(); error ZeroLiquidity(); error NothingToClaim();
```

### 7.5 Rozstrzygniecie sprzecznosci, ktore najbardziej zmienia produkt: **LP nie palimy**

Raport ekonomiczny (§5.4) i raport o atakach (B4) zgodnie mowia: **spalic LP**, i zgodnie przyznaja cene — „oplaty handlowe narosle na tej pozycji sa nieodbieralne przez nikogo, w tym przez nas", „nasz dochod umiera dokladnie w chwili, gdy token staje sie prawdziwy".

**Ta cena jest niepotrzebna i nie placimy jej.** Raport integracyjny udowodnil odczytem, ze na Uniswap v4 pozycja jest kluczowana przez `(owner, tickLower, tickUpper, salt)`, gdzie `owner` to adres wolajacy `modifyLiquidity` — **nie ma NFT, nie ma czego palic**, a `modifyLiquidity` z `liquidityDelta = 0` zwraca same narosle oplaty (potwierdzone: `feesAccrued0 = 99999999999999` po jednym swapie).

Wiec:
- **Wlascicielem pozycji jest `LiquidityVault`.** W calym kontrakcie istnieje **dokladnie jedno** wywolanie `modifyLiquidity` z niezerowa delta — `seed`, osiagalne raz na token i tylko z launchpada. Sciezka `harvest` ma `int256(0)` **wpisane na sztywno, nie jako parametr**.
- Plynnosc jest zamknieta, **bo nie istnieje bajt kodu zdolny ja wyjac**, a nie dlatego, ze ktos obiecal. To jest mocniejsze niz spalone NFT i sprawdzalne tak samo — czytaniem kodu.
- **To jest jedyne rozstrzygniecie w tej specyfikacji, ktore kasuje jeden z zarzutow „gdzie ta ekonomia sie lamie"** (punkt 3 raportu ekonomicznego). Trwaly przychod po awansie istnieje: oplaty LP, dzielone `60/40` protokol/tworca, w ETH i w tokenie.
- Spalenie NFT z PositionManagera odpada z osobna: ERC-721 `transfer` na `address(0)` zwykle rewertuje, a `burn` w v4 PositionManager wymaga pustej pozycji.

**Czego produkt nadal nie moze o sobie powiedziec:** ze plynnosc jest „spalona". Jest **zamknieta w kontrakcie bez wyjscia**, a oplaty z niej pobieramy. To dwa rozne zdania i tylko drugie jest prawdziwe.

---

## 8. PLAN TESTOW

### 8.1 Czego **NIE DA SIE** przetestowac lokalnie — powiedziane wprost

**B20 jest precompile w oprogramowaniu wezla Base, nie kontraktem EVM.**

- Na lokalnym Hardhacie B20 **nie istnieje**.
- **Na forku Base przez Hardhat rowniez nie istnieje.** Fork sciaga stan przez RPC i wykonuje lokalnie na EVM Hardhata; `eth_getCode(0xB20f…)` zwraca pustke, wiec wywolanie fabryki trafi w **puste konto** i zwroci sukces z pustymi danymi. To jest cichy falszywy pozytyw — najgorszy mozliwy wynik testu. Nie wolno na tym polegac.
- Wiec **lokalnie nie sa testowalne**: prawdziwa semantyka `initCalls`, bramka bootstrapu `initialAdmin = address(0)`, wyprowadzenie adresu, `NonPayable()`, `isB20Initialized`, rzeczywisty gaz precompile'a, egzekwowanie rol, `supplyCap`, PolicyRegistry, ActivationRegistry, `multiplier`.
- **Jedyny prawdziwy test B20 to transakcja na Base Sepolia albo mainnecie.**

### 8.2 Poziom 1 — lokalnie, z atrapami (wzorzec z `test/MemoPay.test.ts`)

Rozszerzyc `contracts/mocks/MockB20.sol` o: role, `supplyCap`, `policyId`, `initCalls`, deterministyczne wyprowadzenie adresu. Atrapa fabryki idzie pod `0xB20f000000000000000000000000000000000000` przez `hardhat_setCode`, wiec **sciezka wywolania jest identyczna z produkcyjna** i adres fabryki zostaje `constant` w kodzie produkcyjnym (nie parametrem konstruktora — to byloby testowanie innego kontraktu niz ten, ktory wdrozymy).

Jednostkowo:
- `launch`: post-warunki rol, `AlreadyLaunched`, nonce/salt, cztery `PoolPrepared`, dev-buy przez ta sama sciezke, `WINDOW_ADDR_CAP` dla tworcy.
- `buy`/`sell`: kazdy revert z §7.3 osobno; `SlippageRequired` przy `minOut == 0`; `Expired`; `DustTrade` przy 1 wei; `BuyTooLarge`.
- Przypadki brzegowe: kupno dokladnie reszty do `T_MIN`; kupno `reszta + 1` (dociagniecie + refund); sprzedaz calej pozycji; sprzedaz przy `tokenReserve == T_MIN`; kupno pierwsze i ostatnie w tym samym bloku.
- `CreatorLocked`, `WindowCap` na granicy i sekunde po oknie.
- `claimable`: reentrancy z kontraktu-odbiorcy w `_payout`; odbiorca, ktory rewertuje, nie blokuje nikogo innego.
- Zapadka: po `Graduated` kazdy `buy`/`sell` rewertuje; po `Locked` `buy` rewertuje, `sell` przechodzi.

### 8.3 Poziom 2 — fuzz/invariant (Foundry, obok Hardhata)

Handler losuje `buy`/`sell`/`graduate` z losowymi kwotami i adresami. Po **kazdym** wywolaniu asercje `I-C1…I-C11`, `I-G1…I-G3`.

- **`I-C1` (`k` niemalejace) jest testem numer jeden.** Jesli przejdzie 10^7 wywolan, cala wyplacalnosc jest udowodniona.
- `I-C6` round-trip: dla 10^6 losowych `E` zawsze `quoteSell(quoteBuy(E)) < E`.
- **Petla pylu:** 100 000 kupien po 1 wei — sprawdzic, ze rezerwa nie zmalala ani o wei (to jest wektor A5 i na Base sie oplaca).
- `I-C9`: dla kazdego stanu osiagniętego przez fuzzera i kazdego posiadacza — `sell` sie udaje.
- Przepelnienie: `msg.value` do `MAX_BUY`, `tokensIn` do `T0`.

### 8.4 Poziom 3 — fork Base mainnet (**PRAWDZIWY** `PoolManager`, **ATRAPA** B20)

Kluczowy trik, ktory to umozliwia: adres tokena jest deterministyczny (`0xb2` + `0x00`×9 + bajt wariantu + pierwsze 9 bajtow `keccak256(abi.encode(launchpad, salt))`), wiec **wyliczamy go w tescie i podkladamy pod niego atrape ERC-20 przez `hardhat_setCode`**, a pod `0xB20f…` atrape fabryki, ktora ten adres zwraca.

Wynik: prawdziwy `PoolManager` `0x498581fF…`, prawdziwe `initialize`/`unlock`/`modifyLiquidity`/`settle`/`sync`, prawdziwa arytmetyka tickow — plus falszywy B20. To pokrywa **caly** awans, ktory jest miejscem, gdzie przechodza wszystkie pieniadze (i ktory audyt krzywej sam z siebie by pominal — teatr T9).

Testy na forku:
- pelny przebieg: `launch` → kupna do progu → awans atomowy → `Harvested` po swapie → `claimEth`/`claimToken`;
- **cena puli tuz po zasileniu == `SQRT_PRICE_TERMINAL` co do bitu** (`I-X5`);
- zatrucie: pre-`initialize` tieru 10000 po zlej cenie → awans przechodzi na tier 3000; zatrucie wszystkich czterech → `NoCleanPool` → `Locked`, sprzedaze dzialaja;
- `Locked` → `graduate()` po sprzedazach, nagroda 0.05 ETH, cena puli nadal terminalna;
- **proba wyjecia plynnosci**: kazde wywolanie `LiquidityVault` przez adres postronny; bezposrednie `unlockCallback`; `seed` po raz drugi — wszystko rewertuje;
- pomiar gazu awansu (**O8**).

### 8.5 Poziom 4 — Base Sepolia, prawdziwe transakcje

Jedyne miejsce, gdzie testuje sie B20. Skrypt, nie test: `launch` → odczyt wszystkich rol i `supplyCap` z prawdziwego tokena → 3 kupna → 1 sprzedaz → kupno przekraczajace prog → odczyt `Graduated` → swap w puli → `harvest` → `claim`. Zapisac zuzycie gazu kazdego kroku.

---

## 9. KOLEJNOSC WDRAZANIA

**Krok 1 — najmniejsza dzialajaca calosc: krzywa bez awansu.**
`CurveLaunchpad` z `launch`/`buy`/`sell`/`claim`, bez `LiquidityVault`, bez `initialize` pul; po osiagnieciu `T_MIN` krzywa wchodzi w `Locked` (kupna stop, sprzedaze dzialaja). To jest kompletny, wyplacalny, nietrujacy produkt: nikt nie jest uwieziony, nikt nie moze stracic wiecej niz to, co wlozyl w handel. Testy 8.2 + 8.3-bez-v4 + 8.4 na Sepolii. **Tu wychodza wszystkie odpowiedzi z §0.**

**Krok 2 — `LiquidityVault` i awans.** Dodac `initialize` czterech pul w `launch`, `_tryGraduate`, `graduate()`, `seed`, `harvest`. Testy 8.3 (fork) + 8.4 (Sepolia, pelny przebieg z prawdziwym v4, jesli **O7** to pozwala).

**Krok 3 — kanarek na mainnecie.** Wlasny token, dev-buy 0.0122 ETH, `WINDOW_ADDR_CAP` w mocy, my sami dokupujemy do progu za ~3 ETH wlasnych srodkow, awansujemy, sprzedajemy w puli 0.01 ETH, wolamy `harvest`. **To jest jedyna transakcja przed otwarciem, ktora dowodzi calej sciezki.** Koszt: ~3 ETH zamrozone w puli na zawsze (nasza wlasna, spalona plynnosc — i wolno to nazwac tylko tak: „zamrozona", nie „spalona").

**Krok 4 — otwarcie.** Frontend dopiero teraz. `Bought`/`Sold` jako jedyne zrodlo wykresu.

**Czego nie robimy nigdy:** deployu z parametrem `feeBps` innym niz 100 „na poczatek, potem zmienimy". Zmiana warunkow = **nowa fabryka pod nowym adresem**; tokeny wypuszczone stara maja swoje warunki na zawsze. To jedyna wersja „bez rol administracyjnych", ktorej nie da sie pozniej podmienic narracja.

---

## 10. CZEGO NIE BUDUJEMY W PIERWSZEJ WERSJI

| Rzecz | Dlaczego nie |
|---|---|
| **Hook Uniswap v4** | Wymaga wykopania adresu CREATE2 pod 14 dolnych bitow zgodnych z `getHookPermissions()`, inaczej `HookAddressNotValid`. Dodatkowy krok deployu i dodatkowa powierzchnia audytu. Prowizje po awansie mamy z `harvest()` **bez** hooka. Hook wroci, gdy bedziemy chcieli oplaty od kazdego swapa, a nie tylko udzialu LP. |
| **Aukcja / transza po stalej cenie na starcie** | Raport o atakach slusznie nazywa to jedyna realna odpowiedzia na snajperow — i rownie slusznie wycenia: druga faza, `settle()`, pro-rata, pytanie kto placi za rozliczenie, druga maszyna stanow. To jest **drugi rezim cenowy w kontrakcie, ktory trzyma cudze pieniadze**. `WINDOW_ADDR_CAP` daje czesc efektu za jedna mape. Transza wraca jako v2, jesli dane z krzywej pokaza, ze snajping realnie boli. |
| **Rosnaca oplata od wczesnej sprzedazy** | Zyje wylacznie na krzywej (B20 nie moze nosic podatku transferowego, bo nie ma rol), wiec snajper front-runuje awans i ucieka. Dodaje trzeci przeplyw pieniedzy do `sell` bez domkniecia dziury. |
| **`CreatorVesting` (30 dni po awansie)** | Osobny kontrakt, kustodia, nowa powierzchnia — a **obchodzi sie jednym swiezym EOA**. Zostaje `CreatorLocked` na krzywej: jedna linijka, jedna asercja, i uczciwy komunikat „to jedyny adres, o ktorym wiemy, ze jest tworcy". Nie wolno twierdzic, ze zapobiegamy tworcy kupujacemu z drugiego adresu. **Sybil jest darmowy i nigdy sie to nie zmieni.** |
| **Aerodrome jako cel awansu** | Zweryfikowane sa tylko adresy z kodem. Cala sciezka end-to-end jest sprawdzona **wylacznie** dla Uniswap v4. |
| **Pary z USDC, inne warianty B20, konfigurowalne parametry krzywej** | Kazdy z nich mnozy przestrzen stanow bez zmiany tezy produktu. |
| **Wyrocznia ceny ETH / korekta `R_VIRT` w dolarach** | Zakazana przez te sama doktryne, co role. `R_VIRT = 0.75 ETH` znaczy prog 3 ETH niezaleznie od tego, czy ETH kosztuje $1 500 czy $15 000. **Doktryna „zero administracji" nie jest darmowa — kosztuje dokladnie tyle: brak mozliwosci naprawy zlej stalej.** Naprawa = nowa fabryka. |
| **`tx.origin == msg.sender`, opoznienie startu, commit-reveal, blocklista botow, limity na podpis serwera** | Teatr T1–T15. `tx.origin` jest najgorszy: na Base blokuje Coinbase Smart Wallet i ERC-4337, czyli wiekszosc prawdziwego retailu, a snajperow nie rusza. |

### 10.1 Jedna rzecz, ktora **musi** byc w v1 mimo ze nie jest kontraktem

Widget na stronie tokena: **„do tej krzywej wplacono X ETH, wyplacono Y, oplat zaplacono Z; mediana uczestnika jest na minusie o W%"** — liczone z `Bought`/`Sold`, czyli z tego samego zrodla, co wykres.

Krzywa jest dowodliwie wyplacalna i dowodliwie gra o sumie ujemnej: maksymalna zbiorcza wyplata rowna sie dokladnie zbiorczej wplacie minus oplaty. Produkt, ktorego teza brzmi „kazda liczba z dowodem", **nie ma trzeciego wyjscia**: albo ta liczba jest na stronie, albo teza ma wyjatek pod adresem launchpada. Wybieramy pierwsze. Dodatkowo, zgodnie z D: **naglowkujemy metryki drogie do sfalszowania** — naplyw netto ETH zamiast wolumenu, koncentracja top-10 zamiast liczby posiadaczy, „kupilo 12 osob" zamiast „+340%". Ta sama zmiana, ktora naprawia falszowanie metryk, przesuwa nas dalej od odczytu „promotor dystrybuujacy papiery".

I jedno zdanie, ktore musi stac obok slowa „awansowal": **pula ma ~2.9 ETH glebokosci przeciwko ~954.7M tokenow w obiegu; sprzedaz 5% podazy daje ~0.68 ETH i −77% ceny.** Awans jest poczatkiem ryzyka, nie jego koncem.

---

## NAJWIEKSZE RYZYKO TEJ SPECYFIKACJI

**Atomowy awans w ostatnim `buy` nie zadziala w praktyce — nie dlatego, ze kod jest zly, tylko dlatego, ze portfel uzytkownika oszacuje gaz na stanie sprzed progu.**

Ta sama calldata `buy(token, minOut, deadline)` kosztuje ~85k gazu, jesli nie przekracza progu, i **kilkaset tysiecy do ponad miliona**, jesli przekracza: `createB20`-owy token to precompile o **wlasnej, nieznanej nam wycenie gazu**, ktorej lokalny EVM nie zna i ktorej fork Hardhata **rowniez nie zna** (§8.1), do tego dochodzi `unlock` + `modifyLiquidity` + `settle` + `sync`/`transfer` do PoolManagera + transfer 45M tokenow na adres martwy. Portfel wola `eth_estimateGas` w bloku `n`, ktos inny kupuje w bloku `n`, i transakcja uzytkownika laduje w bloku `n+1` **juz jako ta przekraczajaca prog** — z limitem gazu wyliczonym dla wersji taniej. Wynik: `out of gas` w calym `buy`, albo — jesli `try/catch` zlapie to poprawnie — awans wpada w `Locked`, i tak sie dzieje **przy kazdym tokenie, ktory dochodzi do progu w ruchu**, czyli dokladnie przy tych 0.8%, ktore stanowia 74% przychodu.

Kierunek naprawy, jesli **O8** to potwierdzi (i to jest decyzja do podjecia **przed** krokiem 2, nie po):
1. `buy` przyjmuje opcjonalny `gasFloor` i **rewertuje wlasnym bledem `InsufficientGasForGraduation()`**, zanim cokolwiek zmieni w stanie, jesli `gasleft()` nie wystarczy na awans — wtedy uzytkownik dostaje czytelny blad zamiast spalonej transakcji.
2. Albo: awans **przestaje byc atomowy z zalozenia**, `Locked` staje sie normalna, oczekiwana faza trwajaca jeden blok, a `graduate()` z nagroda 0.05 ETH (~500x koszt gazu na Base) jest **domyslna** sciezka, nie awaryjna. Wtedy wraca okno B2 — i trzeba je zamknac tym, ze `Locked` blokuje kupno, co ta specyfikacja juz robi.

Wersja druga jest prawdopodobnie tym, co zostanie po zderzeniu z lancuchem. Specyfikacja jest napisana tak, ze przejscie na nia **nie wymaga zmiany zadnego niezmiennika ani zadnej sygnatury** — wystarczy usunac wywolanie `_tryGraduate` z `buy`. To jest jedyne miejsce, gdzie celowo zostawilem luz.
# Launchpad v2: krzywa wraca, a pula dostaje hooka

> Dokument nadrzedny wobec `B20-DECYZJA-BEZ-KRZYWEJ.md` i `B20-LAUNCHPAD-SPEC.md`.
> Tam, gdzie sie roznia, obowiazuje ten.

## 1. Co sie zmienia i dlaczego

`B20-DECYZJA-BEZ-KRZYWEJ.md` odwolal krzywa wiazana na rzecz jednostronnej
plynnosci w puli v4 od pierwszej sekundy. Ta decyzja zostaje **odwrocona**.

Powod jest jeden i jest zewnetrzny: `ponsfamily.com/launchpad` na Robinhood
Chain robi **270 572 startow i 6906 graduacji** dokladnie w modelu, ktory
tamten dokument porzucil - krzywa, prog, awans do Uniswap v4. Model jest
sprawdzony przez rynek, a my mamy jego kontrakt juz napisany i przetestowany.

Do tego **§2.1 tamtego dokumentu byl po prostu nieprawdziwy**. Twierdzil:

> „Po awansie oplaty puli ida do dostawcow plynnosci, nie do nas."

`LiquidityVault.harvest()` sciaga oplaty LP z zamknietej pozycji i ksieguje je
w podziale protokol/tworca. **Dostawca plynnosci jestesmy MY.** Przychod po
graduacji istnial w kodzie caly czas; argument „krzywa nie ma przychodu po
progu", na ktorym stala tamta decyzja, nie mial pokrycia.

## 2. Trzy strumienie przychodu zamiast jednego

| strumien | skad | kiedy | rozwadnia sie? |
|---|---|---|---|
| oplata krzywej | `FEE_BPS` = 1% od kupna i sprzedazy | do graduacji | nie |
| oplata hooka | `HOOK_FEE_BPS` = 1% od kazdej wymiany w puli | po graduacji, bez konca | **nie** |
| oplaty LP | pozycja vaulta, `harvest()` | po graduacji | tak, gdy ktos dolozy plynnosc |

Trzeci strumien istnial. Drugi jest nowy i jest odpowiedzia na jedyna realna
slabosc trzeciego: pozycja LP zarabia proporcjonalnie do swojego udzialu
w plynnosci, wiec kazdy obcy, kto dolozy do puli, obniza nasz udzial. Hook
bierze udzial w **wymianie**, nie w plynnosci, wiec rozwodnic sie nie da.

Czego hook **nie** robi i czego nie wolno o nim napisac: nie zabrania handlu
gdzie indziej. Kazdy moze otworzyc druga pule na te sama pare bez naszego
hooka. Nie da sie tego zakazac - ani nam, ani Clankerowi.

## 3. Hook jako brama - to wazniejsze od przychodu

Uprawnienie `BEFORE_INITIALIZE` pozwala hookowi odrzucic kazde otwarcie puli,
ktore nie przychodzi z naszego vaulta. To kasuje **trzy z szesciu znalezisk**
wrogiego audytu, i to u zrodla, a nie lataniem:

| # | waga | znalezisko | dlaczego znika |
|---|---|---|---|
| 1 | WYSOKIE | zatrucie ceny pustej puli blokuje awans za ~2 centy | pula z naszym hookiem nie moze powstac cudza reka |
| 2 | WYSOKIE | `poolsMask` jako dzwignia DoS przy wyscigu w bloku startu | maski nie ma; pula jest jedna i powstaje przy awansie |
| 3 | SREDNIE | napastnik wybiera warstwe oplat, przychod LP w dol 100x | nie ma z czego wybierac |

Zostale trzy zostaly naprawione wprost:

| # | naprawa |
|---|---|
| 4 | `GRAD_FEE_BPS = 300`: oplata awansowa to 3% rezerwy, nie stale 0.1 ETH. Przy 0.2 ETH zabiera 0.006 ETH zamiast 0.1 ETH, wiec nie ma wysokosci rezerwy, przy ktorej zzera pokrycie. Progu `MIN_GRAD_RESERVE` nie ma - patrz nizej, dlaczego zostal cofniety. |
| 5 | `CreatorLocked` wygasa razem z krzywa: obowiazuje w `Curve`, nie w `Locked`. Przedtem tworca kazdego tokena bez graduacji - czyli wiekszosci - zostawal z pozycja na zawsze. Naglowek kontraktu poprawiony, bo obiecywal cos przeciwnego. |
| 6 | Komentarz o saldzie tokena w `seed` przepisany na zdanie prawdziwe: saldo moze byc tylko WIEKSZE od tego, co przyszlo z krzywej, a nadmiar i tak idzie na `DEAD`. |

### Dlaczego prog 2 ETH zostal cofniety

Pierwsza poprawka znaleziska #4 byla progiem: `MIN_GRAD_RESERVE = 2 ETH`,
ponizej ktorego awans nie przechodzil. Znalezisko zamykala, ale placila cena
wieksza od naprawianej szkody. Zejscie pod prog kosztowalo sprzedaz 7.3% podazy -
kupionej na starcie krzywej za 0.059 ETH, a wartej w stanie `Locked` 1.00 ETH.
Robil to wiec zwykly wczesny kupujacy realizujacy zysk, nie napastnik, a skutkiem
bylo TRWALE odebranie tokenowi awansu: kupno w `Locked` rewertuje, wiec rezerwa
nie miala jak wrocic nad prog. Token tracil wtedy pule, hooka i oplaty LP -
czyli caly przychod protokolu umieral dokladnie w tych tokenach, ktore doszly
do progu.

Oplata procentowa zamyka #4 bez tej ceny, wiec prog jest zbedny i zostal
usuniety. `ReserveTooSmallToGraduate` zostaje i rewertuje przy
`eLp < MIN_LP_ETH`, czyli ponizej `0.01 ETH` trafiajacego do puli. (Wczesniej
stalo tu `eLp == 0` - to bylo niezgodne z kodem, patrz `MIN_LP_ETH`.)

Uboczny zysk z bramy: start tokena nie placi juz ~240k gazu za cztery
`initialize`, w tym te 99% startow, ktore nigdy nie awansuja.

## 4. Uklad

```
ITokenFactory ──────► B20TokenFactory   (Base: precompile 0xB20f…)
      ▲               PlainTokenFactory (Robinhood: wlasny LaunchToken)
      │
CurveLaunchpad ──────► LiquidityVault ──────► PoolManager v4
  krzywa, stan,          zamknieta pozycja      ▲
  oplaty, prog           LP, harvest, claim     │
                              │ deploy CREATE2  │
                              ▼                 │
                         B20LaunchHook ─────────┘
                       brama + udzial w wymianie
```

**Granica, ktora trzyma calosc:** vault jest jedynym adresem, ktory moze
otworzyc pule z naszym hookiem, a launchpad jedynym, ktory moze kazac vaultowi
to zrobic. Sprawdzalne z zewnatrz: `hook.VAULT()`, `vault.HOOK()`,
`vault.LAUNCHPAD()`, `pad.VAULT()`.

### Lancuch wdrozenia - bez settera i bez przewidywania adresu

Zaleznosc hook↔vault jest kolem: hook musi znac vault (kogo wpuszczac), vault
musi znac hooka (adres wchodzi do `PoolKey`). Kolo lamie sie tak, ze **hook nie
przyjmuje adresu vaulta - bierze `msg.sender`**, bo wdraza go sam vault:

```
wdrazajacy + nonce      -> launchpad   (CREATE, adres nie zalezy od argumentow)
launchpad  + nonce 1    -> vault       (CREATE, pierwsze `new` w konstruktorze)
vault + salt + initCode -> hook        (CREATE2, adres KOPANY)
```

Wszystko w jednej transakcji. `scripts/mineHookAddress.ts` liczy ten lancuch
i kopie salt (srednio 16 384 proby - sekundy).

**Zly salt wywala WDROZENIE, a nie pierwszy awans.** Vault sprawdza dolne
14 bitow adresu hooka zaraz po jego wdrozeniu (`BadHookAddress`) oraz zgodnosc
konfiguracji oplat (`HookConfigMismatch`). Bez tego blad wyszedlby dopiero
przy pierwszej graduacji - czyli po zebraniu 3 ETH od ludzi, w kontrakcie,
ktorego nie da sie ani poprawic, ani zatrzymac.

## 5. Dwie sieci, jedna roznica

`ITokenFactory` jest jedynym miejscem, ktore wie, czym jest token:

- **`B20TokenFactory`** (Base) - wola precompile i **asertuje po fakcie**
  odczytem: `totalSupply`, `balanceOf`, `supplyCap`, brak rol ADMIN/MINT/PAUSE,
  brak `SEIZE_ROLE()`, zgodnosc adresu z `getB20Address`.
- **`PlainTokenFactory`** (Robinhood i kazda nastepna) - wdraza `LaunchToken`
  przez CREATE2. Dowodem nie jest odczyt, tylko **brak kodu**: w `LaunchToken`
  nie istnieje `mint`, `burn`, `owner`, `pause` ani zaden setter.

Petla `hasRole` w `PlainTokenFactory` zostala **usunieta**, a nie przepisana:
`LaunchToken.hasRole` jest `pure` i zwraca `false` literalem, wiec asercja nie
potrafila odpasc. Kompilator powiedzial to wprost, ostrzegajac, ze cala sciezka
moze byc `pure`. Trzy pozostale odczyty sa oznaczone jako **straznik regresji**,
a nie obrona przed napastnikiem - i tyle o sobie mowia.

Cala reszta - krzywa, oplaty, prog, graduacja, pula, hook - jest identyczna.
W `CurveLaunchpad` nie ma ani jednego `if (chainid == ...)`.

## 6. Parametry

| stala | wartosc | uwaga |
|---|---|---|
| `T0` | 1 000 000 000 | cala podaz, sufit rowny podazy |
| `T_MIN` | 200 000 000 | prog graduacji (na tokenie, nie na ETH) |
| `R_VIRT` | 0.75 ETH | daje zbiorke `G = 3.00 ETH` dokladnie |
| `FEE_BPS` | 100 (1%) | z tego `CREATOR_FEE_BPS` 40 dla tworcy |
| `GRAD_FEE_BPS` | 300 (3% rezerwy) | polowa dla wolajacego `graduate()`, polowa dla protokolu; sufit `MAX_GRAD_FEE_BPS` = 500; odczyt przez `gradFeeOf(token)` |
| `POOL_FEE` | 3000 (0.3%) | **zmiana** z 10000 |
| `POOL_TICK_SPACING` | 60 | |
| `HOOK_FEE_BPS` | 100 (1%) | **nowe**, sufit `MAX_HOOK_FEE_BPS` = 200 |
| `HOOK_REQUIRED_FLAGS` | 0x2044 | BEFORE_INITIALIZE, AFTER_SWAP, AFTER_SWAP_RETURNS_DELTA |

**Dlaczego warstwa puli zeszla z 1% na 0.3%:** oplata puli sumuje sie z 1%
hooka i obie placi kupujacy. 1% + 1% = 2% wypchneloby ruch do puli bez naszego
hooka, ktorej nie da sie zakazac. 0.3% + 1% = 1.3% stoi obok zmierzonych 1.2%
Clankera, a nie dwukrotnie nad nimi. Audyt policzyl `owed0 == eLp` co do wei
dla wszystkich czterech kandydujacych rozstawow tickow, wiec zmiana warstwy nie
rusza matematyki zasilenia.

## 7. Skad hook bierze oplate

Z **waluty niepodanej** w wymianie - i to jest jedna regula dla obu rodzajow:

- `exactInput`: podane jest wejscie, wiec niepodane jest **wyjscie**. Kupujacy
  dostaje o oplate mniej.
- `exactOutput`: podane jest wyjscie, wiec niepodane jest **wejscie**. Kupujacy
  placi o oplate wiecej.

W obu przypadkach roznica idzie z kieszeni wolajacego, nigdy z puli. Wariant
„zawsze od wejscia" wymagalby liczenia oplaty w `beforeSwap`, gdzie przy
`exactOutput` wejscie nie jest jeszcze znane - skonczyloby sie zgadywaniem albo
odrzucaniem `exactOutput`, czyli polowy ruchu z agregatorow.

Hook nie dzieli oplaty od razu: ksieguje do `pendingEth`/`pendingToken`
(jeden zapis na wymiane), a bezuprawnieniowe `settle(token)` dzieli je
protokol/tworca. Podzial przy naliczaniu wymagalby odczytu tworcy z vaulta
**wewnatrz kazdej wymiany**.

## 8. Co bylo niepotwierdzone i zostalo zamkniete

Sekcja zostala zamknieta przez `npm run launchpad:fork:base`, uruchomione
10 sierpnia 2026 na forku Base z prawdziwym PoolManagerem, oraz przez
`eth_call` ze state override do prawdziwego precompile B20. Pelny zapis jest w
`scripts/output/launchpad-base-fork-probe.json`.

1. **Znak delty `afterSwap`** jest potwierdzony na prawdziwym v4 dla obu
   kierunkow: exactInput zwrocil `delta0 = -1000000000000000` i
   `delta1 = 52623570549883768351813`, a exactOutput zwrocil
   `delta0 = -19007623657658` i `delta1 = 1000000000000000000000`.
   Dodatnia delta tokena zostala rozliczona przez `take`, a wymiana domknela
   sie bez `CurrencyNotSettled`.
2. **`POOLS_SLOT = 6`** zostal potwierdzony przez odczyt ceny prawdziwego
   PoolManagera zaraz po wlasnym `initialize` w `seed`.
3. **`transfer` na `0xdEaD` (O3)** przeszedl na prawdziwym B20 ASSET;
   `deadBalance = 1`.
4. **`staticcall` nieznanego selektora `SEIZE_ROLE()`** zwrocil failure,
   wiec asercja wariantu ASSET jest zgodna z zachowaniem precompile.
5. **`abi.encode(struct)` dla `params` (O10)** zadzialalo na prawdziwym B20;
   po inicjalizacji `totalSupply` wyniosl `1000000000000000000000000000`.
6. **Gaz z prawdziwego B20** zostal zmierzony: `B20TokenFactory.createToken`
   z postwarunkami kosztowal `249290` gas, sonda create + transfer DEAD
   `242215` gas, a pelny `CurveLaunchpad.launch` `322676` gas.

## 9. Stan robot

**Gotowe, kompilujace sie bez ostrzezen, `npm run contracts:test`: 155 passing, 0 failing.**

Produkcja: `interfaces/ITokenFactory.sol`, `factories/B20TokenFactory.sol`,
`factories/PlainTokenFactory.sol`, `factories/LaunchToken.sol`,
`B20LaunchHook.sol`, przerobione `CurveLaunchpad.sol` i `LiquidityVault.sol`.

Atrapy i narzedzia: `mocks/MockPoolManager.sol` (wola hooka w obu miejscach,
sprawdza selektory, umie `swap`), `mocks/LaunchpadProbes.sol` (`PoolFrontRunner`
przepisany na dowod, ze bramy nie da sie wyprzedzic; nowy `SwapProbe`),
`mocks/LaunchpadForkProbes.sol`, `scripts/mineHookAddress.ts`,
`scripts/launchpad/forkBaseProbe.ts`, `scripts/output/launchpad-base-fork-probe.json`,
`test/helpers/deployLaunchpad.ts`.

Testy: `CurveLaunchpad.test.ts` (35), `CurveLaunchpadInvariants.test.ts`,
`B20LaunchHook.test.ts` (12, nowy), `PlainTokenFactory.test.ts` (11, nowy -
w tym CALA sciezka start → prog → awans → pula z hookiem bez ani jednego B20,
czyli dowod, ze `ITokenFactory` naprawde jest jedyna roznica miedzy sieciami).

Dwa testy padaly przy pierwszym pelnym przebiegu z powodow, ktore warto
zapamietac, bo oba byly ZIELONE w pojedynczym pliku:
- saldo `PoolManager` mierzone bezwzglednie zamiast przyrostem - atrapa stoi
  pod stalym adresem i przezywa cala sesje, wiec przy wielu plikach lezy na niej
  ETH z wczesniejszych awansow;
- `getTransactionCount(addr)` w helperze pytal o blok `latest`, wiec przy
  transakcji jeszcze niezablokowanej przewidywal adres launchpada o jeden za
  wczesnie i salt hooka byl kopany pod inny vault (`BadHookAddress`). Poprawka:
  `getNonce('pending')` plus twarda asercja, ze wdrozony adres zgadza sie
  z przewidzianym.

**Nastepne kroki, w tej kolejnosci:**
1. Skrypt wdrozeniowy + Base Sepolia, jedna pelna sciezka: start -> kupno ->
   prog -> graduacja -> pula z hookiem -> `settle` -> `claim`.
2. Audyt hooka. To jest nowy kontrakt z prawdziwymi pieniedzmi.
3. Frontend w ksztalcie Ponsa: tablice `Graduated` / `Explore` z filtrami,
   pasek postepu do progu, widget kupna na krzywej, ostatnie transakcje,
   posiadacze, obraz i opis tokena, panel `claim` dla tworcy.
4. Port na Robinhood Chain: `PlainTokenFactory` + drugi zestaw adresow.

**Czego swiadomie nie zrobiono:** frontendu (decyzja: kontrakty od konca do
konca najpierw - widget kupna i pasek graduacji nie maja o co pytac, dopoki
krzywej nie ma na sieci).

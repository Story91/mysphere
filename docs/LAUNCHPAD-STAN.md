# Launchpad - stan na 2026-08-10 (wieczor, wdrozenie 70/30)

Krotki obraz calosci. Szczegoly i uzasadnienia decyzji sa w
`HANDOFF-LAUNCHPAD-V2-2026-08-10.md`. Dokument dla uzytkownikow:
`LAUNCHPAD-DOSSIER.md` (AKTUALIZOWAC przy kazdej zmianie launchpada).

## Adresy - Base Sepolia (chainId 84532), wdrozenie v3 z 2026-08-10

| kontrakt | adres |
| --- | --- |
| `CurveLaunchpad` | `0x4Cc0ff50912400eeeC38db45ef5CEf00f5Ad1A48` |
| `LiquidityVault` | `0x35B3217b8Ada69103b801FEFe9ca16E307a649B6` |
| `B20LaunchHook` | `0xf2EAEBceeC6Ccc168d8fe5B539F37e2d8c44e044` |
| `B20TokenFactory` | `0x8ad50FFdD5957C34519e922c1Ff18e3DF089565F` |
| PoolManager v4 (Uniswap) | `0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408` |
| blok wdrozenia | `45304536` |
| `FEE_RECIPIENT` | `0xD4885A5aa53446843CABcDE1F35DE9b4E906030e` |

## Adresy - Base MAINNET (chainId 8453), wdrozenie 2026-08-11

Produkcja. Wersja mainnet-candidate (fixy audytu + vanity). FEE_RECIPIENT = Safe.
Adresy sa fallbackiem w `app/startpad/config.ts` (siec dziala bez env) i sieca
DOMYSLNA startpada od tego wdrozenia.

| kontrakt | adres |
| --- | --- |
| `CurveLaunchpad` | `0xCF541A7EcE881945833ff1680dFc067C5Dd4cE2D` |
| `LiquidityVault` | `0x6108aDCb176D2A4A6283A06bb0Dd468b86A6AB63` |
| `B20LaunchHook` | `0x71028Ea6999e2c415b46cc022ED0A9fDca2e2044` (salt `0x…0fd4`) |
| `B20TokenFactory` | `0xEC7db55Bc081289820097703B3A66003092844D1` |
| PoolManager v4 (Uniswap) | `0x498581fF718922c3f8e6A244956aF099B2652b2b` |
| blok wdrozenia | `49843030` |
| `FEE_RECIPIENT` | `0x83E2DE974FC6B866FDb78AEFa5596d58fDc4142F` (Safe) |
| deployer | `0xD4885A5aa53446843CABcDE1F35DE9b4E906030e` |

Parametry: FEE_BPS=100, CREATOR_FEE_BPS=70, PROTOCOL_SHARE_BPS=3000. Wszystkie
15 kontroli wiazan przeszlo przy deployu (w tym `hook.FEE_RECIPIENT() == Safe`).
Verify Basescan: launchpad + vault + hook + fabryka, kazdy wlasnymi argumentami
konstruktora (vault: poolManager, Safe, 3000, hookSalt; hook: poolManager, Safe,
3000; launchpad: poolManager, 100, 70, Safe, 3000, fabryka, hookSalt).

## Adresy - Robinhood Chain (chainId 4663, MAINNET), wdrozenie 2026-08-10

Te same zrodla i parametry co Sepolia v3 (1% / 70/30 / buyback z dzialki
tworcy), ale fabryka tokenow to `PlainTokenFactory` - Robinhood nie ma
precompile B20, wiec token jest zwyklym ERC-20 (`LaunchToken`) z tymi samymi
asercjami po fakcie. Wszystkie 4 kontrakty ZWERYFIKOWANE na
robinhoodchain.blockscout.com (przez API v2 Blockscouta - endpoint zgodny
z Etherscanem jest tam zepsuty, `hardhat verify` nie przechodzi).

| kontrakt | adres |
| --- | --- |
| `CurveLaunchpad` | `0x712E93401b455d226284BbA873cE13CC1492B22f` |
| `LiquidityVault` | `0xbeC6D16d93fbD3B5237A1456A4F1434bb3e69913` |
| `B20LaunchHook` | `0x177be4EF50d92d7B7bf381e078F7c333De5B6044` |
| `PlainTokenFactory` | `0x91ca4f9C7eAA8A1C3775A2d1213a6F379f13a65A` |
| PoolManager v4 (Uniswap) | `0x8366a39CC670B4001A1121B8F6A443A643e40951` |
| blok wdrozenia | `33102326` |
| `FEE_RECIPIENT` | `0x83C68Dbf0E79f934FcCCd3Ca015103A768C21E83` |

Wdrozenie POPRZEDNIE tego samego dnia (`0x0096...e811`, blok 33084370) jest
MARTWE: mialo `FEE_RECIPIENT` pod adresem admina zamiast adresu oplat.
Smoke test v2 prawdziwymi transakcjami: 9/9
(`scripts/launchpad/robinhoodSmoke.ts`, wynik w
`scripts/output/launchpad-robinhood-smoke.json`) - launch, kupno, sprzedaz,
claim, proporcja 70/30 potwierdzona na lancuchu.

Weryfikacja przedwdrozeniowa: fork mainnetu Robinhooda 9/9
(`npm run launchpad:fork:robinhood`) + proba krzywej prawdziwymi transakcjami
na Robinhood TESTNET 7/7 (`scripts/launchpad/robinhoodTestnetCurve.ts`;
testnet nie ma v4, wiec pula byla mockiem - graduacja pokryta forkiem).
FRONT ZNA obie sieci: `app/startpad/config.ts` trzyma mape
`LAUNCHPAD_NETWORKS` (Sepolia = B20, Robinhood = plain ERC-20), wybor sieci
w localStorage (`startpad.chainId`), przelacznik w naglowku tablicy; zmiana
sieci przeladowuje strone, zeby zaden stan nie przezyl podmiany adresow.
Env dla Robinhooda: `NEXT_PUBLIC_LAUNCHPAD_ROBINHOOD_ADDRESS`,
`NEXT_PUBLIC_LIQUIDITY_VAULT_ROBINHOOD_ADDRESS`,
`NEXT_PUBLIC_LAUNCH_HOOK_ROBINHOOD_ADDRESS`,
`NEXT_PUBLIC_TOKEN_FACTORY_ROBINHOOD_ADDRESS`,
`NEXT_PUBLIC_LAUNCHPAD_ROBINHOOD_DEPLOY_BLOCK`.
ZNANE OGRANICZENIE: warstwa logo/opisow (Firestore + API) byla pisana pod
Sepolie - edycje metadanych tokenow z Robinhooda trzeba przejrzec osobno.

Nowosc v3: **sniper protection jest WYLACZALNA** - `launchAdvanced` przyjmuje
`windowCap_` do pelnego `T0`; ustawienie >= podazy krzywej znaczy "ochrona
wylaczona", a `WINDOW_ADDR_CAP` (16M) zostal tylko wartoscia domyslna.

Tokeny demo na v3 (z logo w Firestore): NOVA `0xb200...16E3` (klasyk, pelna
ochrona), TPRSM `0xb200...2171` (ochrona OFF - pre-buy 62M tokenow przeszedl,
buyback 50%), ECHO `0xb200...48A9` (2 odbiorcow oplat 60/40, cap 8M).

Wdrozenia POPRZEDNIE sa MARTWE i nie wolno ich uzywac:
- `0xA760...4F97` - stare ABI, bez `launchAdvanced`;
- `0x0712...0844` (rano 2026-08-10) - stary model oplat 60/40, stary buyback;
- `0x811d...58ba` (popoludnie 2026-08-10, v2) - model 70/30 juz TAK, ale
  sniper cap zabity na 16M; zastapione przez v3 tego samego dnia.

## Arc testnet (chainId 5042002) - W TOKU, 2026-08-14

Circle Arc. Mainnet zapowiedziany na 16 wrzesnia 2026, dzis dziala publiczny
testnet. Caly stos stoi, wszystkie 15 kontroli wiazan przeszlo przy deployu.

**AKTUALNE WDROZENIE: 2026-08-14, prog 1000 USDC.**

| kontrakt | adres |
| --- | --- |
| `CurveLaunchpad` | `0xe984986f4F1E067f697b548D5fe942813d03Da37` |
| `LiquidityVault` | `0xaD714ce622D20d9A385DA751903C6B85beEB90e0` |
| `B20LaunchHook` | `0x7e8E196cc94547c938725923cbB4B518146De044` (salt `0x…4dd4`) |
| `PlainTokenFactory` | `0xC10eDaF3473CcDB6e91090F204b01Ccb555686C9` (wspoldzielona) |
| PoolManager v4 (POSTAWIONY PRZEZ NAS) | `0xd02A166A186bcc5C537FeCD5103E9c1A94Bb49D6` |
| blok wdrozenia stosu | `56866835` |
| blok wdrozenia PoolManagera | `56843204` |
| `FEE_RECIPIENT` | `0xD4885A5aa53446843CABcDE1F35DE9b4E906030e` |
| deployer | `0xD4885A5aa53446843CABcDE1F35DE9b4E906030e` |
| `R_VIRT` | 250 USDC |
| prog graduacji | 1000 USDC |
| mcap po graduacji | 6250 USDC |

Parametry jak wszedzie: FEE_BPS=100, CREATOR_FEE_BPS=70, PROTOCOL_SHARE_BPS=3000.
Fabryka to `PlainTokenFactory`, bo precompile B20 zyje tylko na Base - ta sama
sciezka co na Robinhoodzie. Pelny zapis: `scripts/output/launchpad-arcTestnet.json`.

### Dwa martwe wdrozenia na Arc z tego samego tygodnia

Oba maja kod na lancuchu i oba dzialaja. Martwe znaczy tylko tyle, ze tablica
czyta JEDEN adres na siec i nie jest to zaden z nich.

| adres | prog | dlaczego odpadl |
| --- | --- | --- |
| `0xdAe0dd6EE87a8d7eE7575dD9904A72fA9CA6600d` | 3 USDC | 2026-08-13. Prog odziedziczony po Base, gdzie `R_VIRT` = 0.75 znaczylo 0,75 ETH; tutaj znaczyl 0,75 dolara. Siedem tokenow-sond zostaje pod nim. |
| `0xB5dE95224F2bEDee2e7Ca7170F5B6a02641255AD` | 20 USDC | 2026-08-14, wdrozony i porzucony tego samego dnia. Dobrany pod budzet testnetu zamiast pod realizm liczb; wybor padl na 1000. |

Cale wdrozenie kosztuje na Arc **0,18 USDC**, wiec porzucony stos nie jest tu
strata warta liczenia. Na mainnecie ten sam blad kosztuje inaczej i dlatego
skrypt wypisuje prog oraz obie kapitalizacje przed `CONFIRM=tak`.

### Dlaczego PoolManagera stawialismy sami

Uniswapa na Arc NIE MA. Sprawdzone trzema drogami: `eth_getCode` na trzech
kanonicznych adresach PoolManagera oddaje pustke, oficjalna lista wdrozen v4
Arc nie wymienia, a spis kontraktow w docs.arc.io zna tylko USDC, EURC, USYC,
Permit2, Multicall3 i fabryke CREATE2. Jest tam za to fork Uniswapa V2 od
projektu spolecznosciowego (fabryka `0x7483...814f`, 39 par).

Arc ma jednak wszystko, czego v4 potrzebuje: TSTORE/TLOAD (EIP-1153), MCOPY i
PUSH0 - sprawdzone opcode po opcodzie przez `eth_call`. Wiec zamiast pisac
wariant vaulta pod V2 (co skasowaloby oplaty tworcy po graduacji, bo V2 nie ma
hookow), postawilismy PoolManagera ze zrodel Uniswapa. Nasz stos idzie na Arc
bez zmian architektonicznych.

Skrypt: `scripts/launchpad/deployPoolManager.ts`. SYMULUJE wdrozenie przez
`eth_call` z pustym `to`, zanim cokolwiek wysle, wiec roznica miedzy "kompiluje
sie u nas" a "wdrozy sie tam" wychodzi za darmo. Kod runtime 24 050 B przy
limicie 24 576 - zapas 526 B, i tylko dlatego, ze ustawienia kompilatora sa
przepisane co do liczby z `foundry.toml` Uniswapa.

### Zmiany w repo pod Arc - CZEGO NIE DOTKNELISMY

Zaden nasz kontrakt nie zostal zmieniony. Wdrozenia na Base, Sepolii i
Robinhoodzie chodza na wlasnym bajtkodzie na lancuchu i zadna zmiana w repo ich
nie dotyczy.

Doszlo tylko tyle:
- `hardhat.config.ts`: DRUGI kompilator 0.8.26 obok 0.8.20. Wpis 0.8.20 zostaje
  pierwszy i nietkniety, wiec nasze kontrakty (`pragma solidity 0.8.20`) daja
  ten sam bajtkod co dotad - hardhat dobiera kompilator po pragmie pliku.
  0.8.26 obsluguje WYLACZNIE Uniswapa, ktory wymaga transient storage.
- `hardhat.config.ts`: siec `arcTestnet` obok pozostalych.
- `contracts/vendor/UniswapV4PoolManager.sol`: JEDEN import, zero naszej logiki.
  Istnieje tylko po to, zeby hardhat zobaczyl PoolManagera - kompiluje to, co
  lezy w `contracts/`, a nie to, co w `node_modules`. Import zamiast wklejonego
  bajtkodu, bo bajtkodu nie da sie zweryfikowac w eksploratorze.
- `package.json`: `@uniswap/v4-core` 1.0.2 i `solmate` jako devDependencies
  (solmate jest wymagany przez `ProtocolFees.sol` Uniswapa).

### PELNY PRZEBIEG PRZESZEDL - 2026-08-13, token ARCF

Cala sciezka od startu tokena do odebranych oplat, na zywo, jednym przebiegiem
`sepoliaFlow.ts --network arcTestnet`. Token `0xd93D7f1ddf96087bC788a8C69b9A744902d942Bf`.

| krok | blok | gaz | tx |
| --- | --- | --- | --- |
| launch | 56845505 | 888 683 | `0xd94d05dc…f89a3` |
| buy (domkniecie krzywej) | 56846101 | 141 833 | `0x39f6eaa0…cf74e` |
| **graduate** | 56846104 | 434 320 | `0x34453fba…85319` |
| **swap w puli po graduacji** | 56846111 | 316 423 | `0x3040b7a9…5cb085` |
| settle oplat hooka | 56846114 | 60 940 | `0x03278c4e…8303ac` |
| claim krzywej (0,12 USDC) | 56846118 | 36 472 | `0xde7c67cc…7ccd74` |
| claim tokenow z hooka (531,55) | 56846120 | 40 304 | `0x114dd8f2…a03226` |

Zweryfikowane osobno odczytem z lancucha, a nie tylko wyjsciem skryptu:
stan tokena `Graduated`; pool key `currency0 = 0x0` (waluta natywna),
`currency1` = token, oplata 3000, hooks = nasz hook; pozycja LP z plynnoscia
21 251 635 231 200 453 637 758 na pelnym zakresie tickow; swap po graduacji ze
statusem OK i siedmioma logami.

To zamyka jedyna niewiadoma, ktora zostawala: rozliczenie natywnej wartosci
(`settle`) przy dodawaniu plynnosci dziala, mimo ze walutą natywna jest tu
dolar. Handel PO graduacji tez dziala i hook nalicza z niego oplate - 531,55
tokena, odebrane osobna transakcja.

Kupno domykajace krzywa: wplacone 4 USDC, oplata 0,03, ZWROT NADWYZKI 0,97,
czyli realnie 3,00 poszlo na krzywa. Zwrot potwierdza, ze reguly Arc dotyczace
przelewow natywnych nie przeszkadzaja naszym wyplatom.

### Czy jestesmy pierwsi z v4 na Arc - NIE, I NIE WOLNO TAK PISAC

Sprawdzone 2026-08-13, zanim ktokolwiek zdazyl to ogłosic. Na Arc testnecie
stoja co najmniej TRZY inne PoolManagery v4, postawione przez inne osoby:

| adres | rozmiar kodu | wlasciciel |
| --- | --- | --- |
| `0x1D2536ec9aa94Bab4d34E1a7FcD2D94E9Dc60cAb` | 24 050 B | `0xa9e9E29e…f8Ee` |
| `0x5e4b627b99BC77a29c874ba1ccAe65af5d8D1B19` | 24 009 B | `0xCC8a979B…5c34` |
| `0xC20bd74484de18f9085e88DB9a3207a17da35bC4` | 24 009 B | `0xFf2c6CFD…3b77` |

Kazdy z nich odpowiada na `initialize` puli natywnej tickiem 0, czyli zachowuje
sie jak prawdziwy PoolManager v4 - to nie sa kontrakty o przypadkowo tej samej
nazwie. Znalezienie ich zajelo cztery minuty (wyszukiwarka Blockscouta plus
`eth_call`), wiec kazdy, kto chcialby podwazyc naglowek "pierwszy v4 na Arc",
zrobi to rownie szybko.

Co MOZNA powiedziec i co da sie obronic co do slowa:
- Uniswap NIE wdrozyl v4 na Arc; sieci nie ma na ich oficjalnej liscie wdrozen,
  a spis kontraktow Arc nie wymienia Uniswapa w zadnej wersji;
- postawilismy wlasny PoolManager ze zrodel i uruchomilismy na nim launchpad
  z krzywa i WLASNYM HOOKIEM, przechodzac cala sciezke onchain;
- zrobilismy to na lancuchu, gdzie waluta natywna jest dolarem, bez zmiany
  jednej linii w kontraktach launchpada.

Czego NIE WOLNO pisac bez dowodu, ktorego nie mamy: "pierwszy hook v4 na Arc",
"pierwszy launchpad", "pierwsi z v4". Trzy cudze PoolManagery nie dowodza, ze
ktos ma tam hooka - ale dowodza, ze nikt nie sprawdzil, czy nie ma, a przy
takim naglowku to sprawdzenie robi za nas ktos inny i publicznie.

### Skala krzywej - ZROBIONE 2026-08-14, nie odlozone na wrzesien

Stalo tu, ze na testnet nie trzeba zmieniac nic, bo `R_VIRT` = 0.75 daje na Arc
prog 3 USDC i to wystarczy do pelnego cyklu. To bylo prawda o testach i falsz o
produkcie: prog 3 dolary znaczy, ze token domyka krzywa przypadkiem, a tablica
pokazuje wylacznie tokeny po graduacji.

`R_VIRT` jest teraz **osmym argumentem konstruktora** `CurveLaunchpad`, a nie
stala. Kazda pochodna liczy sie z niego, wiec nie ma juz czterech liczb do
recznego przeliczenia:

| pochodna | wzor |
| --- | --- |
| prog graduacji | `4 x R_VIRT` |
| sufit jednego kupna | `132 x R_VIRT` |
| prog pylu w puli | `R_VIRT / 75` |
| cena otwarcia puli | `isqrt(T_MIN x 2^192 / (5 x R_VIRT))` |

Dwie proporcje zostaja na kazdej skali: graduacja to zawsze **25x** cena
startowa, a kapitalizacja po graduacji zawsze **6,25x** zebrana kwota.

Wdrozenie z `0.75 ether` odtwarza wszystkie dotychczasowe stale co do cyfry -
przybija to `test/CurveScale.test.ts`, i to jest wazniejsza polowa tej zmiany
niz sama parametryzacja. Jedna liczba zmienia sie celowo: sufit kupna to
`132 x R_VIRT`, czyli 99 zamiast 100, bo 133,33 nie jest calkowite.

Arc testnet stoi dzis na `R_VIRT = 250`, czyli progu 1000 USDC. Mainnet Arc
dostanie swoja liczbe osobno.

### Fakty o sieci (ZMIERZONE 2026-08-13, nie przepisane z docsow)

- blok co 0,51 s, czyli ~169 tys. blokow na dobe; 30 mln gazu na blok;
- gaz 21 gwei, ale placony w USDC: zwykla transakcja 0,003 USDC, wdrozenie
  calego naszego stosu ~0,32 USDC, PoolManager 0,111 USDC;
- `maxFeePerGas` musi wynosic co najmniej 20 gwei (docs.arc.io), inaczej
  transakcja wisi albo leci w kosz;
- `eth_getLogs`: publiczne RPC daja okno 10 000 blokow, ale **Blockdaemon
  (`rpc.blockdaemon.testnet.arc.io`) daje 50 000** - zmierzone na wszystkich
  pieciu endpointach z docsow. Przy 169 tys. blokow na dobe to jedyny endpoint,
  na ktorym skan historii tokena ma sens;
- natywne USDC ma 18 miejsc, ERC-20 pod `0x3600...0000` ma 6, i to JEST TA SAMA
  KASA - zmierzone na parze USDC/EURC: saldo natywne 236704171000000000000 przy
  `balanceOf` 236704171. Kontrakt trzymajacy natywne moze je wyplacic jako
  ERC-20 bez wrapowania, dzielac przez 1e12;
- reguly, ktorych nie ma na Base: przelew natywnej wartosci na adres zerowy
  rewertuje, przelew do lub od adresu z listy blokad Circle rewertuje (i tak
  spalajac gaz), a wyslanie wartosci pod adres precompile'a rewertuje. Nasze
  wyplaty sa pull-based (`claim()`), wiec zablokowany odbiorca blokuje wylacznie
  wlasna wyplate - decyzja podjeta pod Base okazuje sie tu warunkiem dzialania;
- znaczniki czasu blokow sa NIEMALEJACE, nie rosnace (bloki podsekundowe dziela
  jedna sekunde). `toPricePoints` juz to zaklada;
- opt-in privacy Arc jest na mapie drogowej i NIE dziala. Gdy wejdzie, kontrakty
  w sektorze prywatnym przestana emitowac logi, czyli znikna indekserom. Nasz
  launchpad ma byc publiczny.

## Model oplat - USTALONY NA STALE W KODZIE (decyzje z 2026-08-10)

- oplata handlowa na krzywej: **1%** (`MAX_FEE_BPS = 100`), od kazdego kupna
  i kazdej sprzedazy;
- podzial na krzywej: **do 70% tworca / min 30% protokol**
  (`MAX_CREATOR_SHARE_BPS = 7000`; domyslnie przy `launch()` pelne 70%);
- podloga protokolu jest w KONTRAKCIE, nie w formularzu - obowiazuje takze
  wdrazajacego i kazdego, kto wywola kontrakt bezposrednio;
- oplata puli po graduacji: **1%** od kazdego swapa, podzial **70% tworca /
  30% protokol** (`PROTOCOL_SHARE_BPS = 3000` w hooku i vaulcie; ta sama
  proporcja co PONS);
- **auto-buyback z DZIALKI TWORCY**: `buybackBps` znaczy "ile procent SWOJEJ
  czesci oplat puli tworca oddaje na skup i spalenie". Cieciе liczy sie w
  `settle`, tylko po stronie ETH; protokol dostaje pelne 30% niezaleznie od
  buybacku; kupione tokeny ida na `0xdEaD`. (Wczesniej buyback szedl z calej
  oplaty przed podzialem - tworca ustawiajac 100% zerowal przychod protokolu;
  naprawione ta wersja.) `HookFeeSettled` ma teraz 6 pol (`ethToBuyback`);
- graduacja przy **3.00 ETH** w rezerwie, oplata graduacyjna 3% rezerwy
  (polowa dla wolajacego `graduate()`), poczatkowy market cap **0.75 ETH**,
  przy graduacji **18.75 ETH** (25x).

Zmiana ktorejkolwiek z tych liczb wymaga NOWEGO WDROZENIA - nie ma setterow.

## Jak front laczy sie z kontraktami

ABI **nie jest** generowane z artefaktow - jest wpisane recznie w
`app/launchpad/config.ts` i to jest swiadome: front uzywa dokladnie tych
funkcji, ktore zna, a nie wszystkiego, co kontrakt wystawia.

- `app/launchpad/config.ts` - ABI launchpada, vaulta, hooka i ERC20 + adresy
  (czytane z `NEXT_PUBLIC_*`, z domyslnymi wartosciami w kodzie);
- `app/launchpad/LaunchpadBoard.tsx` - rynek, `launchAdvanced`, handel,
  zdarzenia na zywo (`watchContractEvent`, polling co 8 s);
- `app/launchpad/[address]/LaunchpadTokenDetail.tsx` - strona tokena, profil,
  konfiguracja tworcy, buyback;
- `app/launchpad/metadata.ts` - `ipfs://` -> brama, sanityzacja URL.

**Wykrywanie wersji kontraktu:** front odczytuje `MAX_BUYBACK_BPS`. Gdy odczyt
przejdzie, wlacza pola zaawansowane i uzywa `launchAdvanced`. Gdy odpadnie -
wyszarza je i uzywa starego `launch`. Dzieki temu ta sama wersja frontu dziala
przed i po wdrozeniu i nigdy nie obiecuje czegos, czego lancuch odrzuci.

## Firebase - logo i opisy tokenow

ERC-20 NIE MA logo on-chain. Zaden portfel nie czyta naszego `metadataURI`.
Dlatego sa trzy warstwy:

1. `metadataURI` w lancuchu - niezmienne, ustawiane raz przy starcie;
2. kolekcja `launchpadTokens` w Firestore - warstwa edytowalna (logo, opis,
   linki). Zapis WYLACZNIE przez serwer, po sprawdzeniu sesji SIWE ORAZ tworcy
   odczytanego z lancucha: `app/api/launchpad/token/route.ts`;
3. `/api/launchpad/tokenlist` - token lista w standardzie Uniswapa. To jedyna
   droga, zeby logo zobaczyl ktos poza naszym interfejsem.

Indeksy sa w `firestore.indexes.json`. Bez ich wdrozenia token lista zwraca
PUSTA liste i nie zglasza bledu.

## Co dziala - potwierdzone

- pelna sciezka az po buyback ZWERYFIKOWANA dla modelu 70/30 dwiema drogami,
  bo salda (2.63 ETH) nie starczalo na zbiorke 3.05 na produkcyjnym stacku:
  1) fork Base MAINNET (`npm run launchpad:fork:base`, parametry 100/70/3000):
     launch -> Locked -> graduate przez prawdziwy initialize/modifyLiquidity
     -> odczyt ceny z prawdziwego PoolManagera -> afterSwap exactInput
     i exactOutput - wszystkie kontrole zielone;
  2) TESTOWY mini-stack na Sepolii (TE SAME zrodla, tylko R_VIRT=0.0125 =>
     zbiorka 0.05 ETH; adresy ponizej): launchAdvanced(70%, buyback 50%) ->
     okno snajperskie -> domkniecie krzywej CO DO WEI (kupno 0.08, refund
     0.0295) -> graduate -> swap ETH->token i token->ETH w prawdziwej puli ->
     settle: `HookFeeSettled` 30/70 co do wei, `ethToBuyback` = dokladnie
     polowa dzialki tworcy -> `executeBuyback`: 37 062 MINIG skupione przez
     prawdziwa pule i spalone na 0xdEaD -> harvest/claimy. UI graduowanego
     tokena sprawdzone w przegladarce (badge, wykres ze znacznikiem graduacji,
     pula, settle/harvest).
  Mini-stack (TEST-ONLY, nie podpinac frontu): launchpad
  `0xC0f5BC2821Bd9edf910DD180E4533f66141e869d`, vault `0xc7B5...e79D`,
  hook `0xF90f...2044`, blok 45303095, token MINIG
  `0xb200...2240`. Sanity na PRODUKCYJNYM stacku: token PRISM
  `0xB2000000000000000000008deE74A32F0F1ACC13` - launchAdvanced 100/70,
  kupno, sprzedaz, claimable zgodne;
- wdrozenie wieczorne przeszlo 15/15 kontroli powdrozeniowych skryptu
  (wiazania launchpad<->vault<->hook, bity `0x2044`, stale 100/70/3000);
- 64 testy launchpada (w tym nowa semantyka buybacku i granice 70%) +
  inwarianty krzywej, `tsc`, `lint`, `build`;
- nowy interfejs: strona tokena z wykresem swiecowym (lightweight-charts,
  OHLC z eventow), panel kup/sprzedaj na stronie tokena (sprzedaz dziala
  takze w stanie Locked - zgodnie z kontraktem), taby Trades/Holders/Info,
  board z tabami New/Trending/About to graduate/Graduated, King of the Hill,
  animacje na zywo z przelacznikiem, modal startu Quick/Creator setup
  z atomowym pre-buyem; smoke-test E2E w headless Chromium przechodzi.

## Plan testow - co sprawdzic na wdrozeniu 70/30

Kolejnosc od najtanszych do najdrozszych; wszystko na Base Sepolia, przez UI
(nie skryptem), bo to UI bylo przebudowane:

1. **Start przez modal** (Quick): nazwa+symbol+obrazek, pre-buy 0.001 ETH ->
   token widoczny na boardzie w "New", strona tokena otwiera sie, wykres ma
   punkt startowy, holders pokazuje krzywa + dev.
2. **Start przez Creator setup**: fee 1%, udzial tworcy 70%, 2 odbiorcow
   (60/40), buyback 50%, cap 1M -> `feeConfigOf` na stronie tokena zgadza sie.
3. **Handel na stronie tokena**: kupno 0.01 ETH (podglad quoteBuy == wynik),
   sprzedaz 50% salda (approve -> sell), wykres i taby aktualizuja sie na zywo.
4. **Claim tworcy**: po handlu `claimable` rosnie (70% z 1%); claim przechodzi.
5. **Pelna sciezka az po pule** - WYMAGA ~3.1 ETH na Sepolii (dzis deployer ma
   2.63): kupno do 3.00 -> stan Locked (sprzedaz nadal dziala w UI!) ->
   graduate z nagroda -> swap w puli -> settle (HookFeeSettled: 30% protokol,
   ciecie buybacku z dzialki tworcy) -> executeBuyback (tokeny na dEaD) ->
   harvest/claimy z vaulta. Do czasu zasilenia portfela pokrywaja to testy
   jednostkowe (64 + inwarianty).
6. **Regresja starego wdrozenia**: wejscie na strone tokena z wdrozenia
   `0x0712...` (np. SFLOW) - strona ma pokazac "Token not found" (nowy
   kontrakt go nie zna), a nie surowy blad.

## Co zostalo do zrobienia

**Przed mainnetem:**

1. **Audyt zewnetrzny.** Kontrakty nie maja setterow, pauzy ani migracji - blad
   jest nieodwracalny.
2. **Weryfikacja kontraktow na Basescanie** (`npx hardhat verify`). Vault i hook
   powstaly wewnetrznie, wiec weryfikuje sie je osobno.
3. **`FEE_RECIPIENT` na mainnet: ZDECYDOWANE 2026-08-11** - **Safe (Gnosis)**
   `0x83E2DE974FC6B866FDb78AEFa5596d58fDc4142F`, podpisywany przez wlasciciela
   `0x83C68Dbf0E79f934FcCCd3Ca015103A768C21E83` (1/1). DLACZEGO SAFE, NIE EOA:
   adres jest `immutable`, ale Safe pozwala POZNIEJ dodac wlascicieli / przejsc
   na 2/3 BEZ zmiany odbiorcy (adres Safe zostaje) - EOA tak sie nie da. Odbior
   sprawdzony na forku Base: Safe przyjmuje `claimFor -> _sendEth` (ETH), a
   tokeny (ERC20 `transfer`) wchodza zawsze. Wchodzi w zycie DOPIERO przy deployu
   mainnetowym. Sepolia zostaje na adresie deployera - testnetowe oplaty nie maja
   wartosci, a kolejny redeploy uniewaznilby swieze adresy w env/docs/UI.
4. **Pelna sciezka on-chain na wdrozeniu 70/30** - patrz plan testow pkt 5.

**Funkcje, ktorych nie mamy, a ma je konkurencja:**

5. **Start zaplanowany na przyszlosc** (Flaunch ma). Wymaga pola `startsAt`
   w `Launch` i warunku w `_buy` - czyli zmiany w kontrakcie.
6. **Zbywalny NFT ze strumieniem przychodu** (Flaunch ma). U nas prawo do oplat
   jest przypisane do adresu i nie da sie go sprzedac.
7. **Komentarze/thread pod tokenem** (pump.fun, Zora; u Zory korona dla top
   holdera) - Firestore + istniejaca sesja SIWE, wzorzec z profilu tokena.
8. **Wykres i handel PO graduacji** - dzis wykres uczciwie konczy sie na
   graduacji. Plan na mainnet: darmowy embed GeckoTerminal albo DEX Screener
   (iframe per pula/token; oba indeksuja Uniswap v4 na Base MAINNET, testnetu
   nie indeksuja, wiec na Sepolii nie ma czego wpiac). Wykres krzywej, ktory
   juz mamy, jest darmowy na zawsze: lightweight-charts to open source
   TradingView (Apache 2.0, wymagana atrybucja - jest), dane sa nasze
   z eventow. Platny TradingView (Charting Library z danymi) NIE jest
   potrzebny.

**Produkt i interfejs:**

9. Wystawienie na produkcji - zmienne na Vercelu, patrz nizej.
10. Zgloszenie token listy do agregatorow, zeby logo trafilo poza nasz interfejs.
11. Keeper jako usluga - dzis jest skryptem uruchamianym recznie. Uwaga: w
    dry-runie `pendingBuybackEth` pokazuje stan sprzed `settle` - po zmianie
    modelu ciecie powstaje dopiero przy settle, wiec dry-run moze pokazac 0
    mimo zaleglego buybacku.
12. **Indekser-lite** (Cloud Function: rejestr tokenow, wolumen 24h, snapshot
    holderow) - skan eventow z przegladarki przestanie wystarczac, gdy lancuch
    odjedzie od bloku wdrozenia o ~120k blokow (board mowi wtedy "older
    launches exist beyond the indexed range").

## Base mainnet - runbook wdrozenia (Faza 5, 2026-08-11)

Kod idacy na mainnet to WERSJA MAINNET-CANDIDATE (fixy audytu + opcjonalne
vanity), potwierdzona: 125 testow (jednostkowe + inwarianty + vanity) oraz
`launchpad:fork:base` na PRAWDZIWYM PoolManagerze Base mainnet (pelna sciezka az
do graduacji + oba znaki delty afterSwap). Szczegoly: `docs/LAUNCHPAD-DOSSIER.md`
sekcje "Mainnet-candidate build" i "Faza 4 review".

Stan listy "Przed mainnetem":
- audyt zewnetrzny: ODLOZONY (decyzja wlasciciela), zastapiony twardsza runda
  wewnetrzna (Faza 4: 0 confirmed) - PODNIESIONE RYZYKO, nazwane wprost;
- pelna sciezka on-chain: pokryta forkiem Base mainnet (bramka P1 audytu dla
  slotu PoolManagera zamknieta na realnym bajtkodzie);
- FEE_RECIPIENT mainnet: **Safe** `0x83E2DE974FC6B866FDb78AEFa5596d58fDc4142F`
  (wlasciciel/podpis `0x83C6...1E83`, 1/1 - mozna pozniej na 2/3 BEZ zmiany
  odbiorcy; odbior POTWIERDZONY na forku Base: `safeRecipientProbe.ts` (surowy
  call), a zlotym testem `test/CurveLaunchpadSafeRecipient.test.ts` przez REALNE
  entrypointy - claimFor(Safe) wyplaca ETH, Safe przyjmuje token ERC20);
- weryfikacja na Basescanie: po deployu (nizej).

### Deploy (odpalasz TY, z zasilonym kluczem)

```powershell
# domyslne: PROTOCOL_SHARE_BPS=3000, FEE_BPS=100, CREATOR_FEE_BPS=70,
# FACTORY_KIND=b20 (auto na Base), POOL_MANAGER=0x498581fF... (auto)
$env:FEE_RECIPIENT="0x83E2DE974FC6B866FDb78AEFa5596d58fDc4142F"; $env:CONFIRM="tak"; npm run launchpad:deploy:base
```

Przed odpaleniem:
- portfel deployera zasilony na gaz (~8 mln gazu lacznie: fabryka ~760k +
  launchpad ~7.35M; na Base to grosze-dolar) i wpiety jako signer sieci `base`
  (klucz w env wg hardhat.config);
- `deploy.ts` robi WSZYSTKO w jednym przebiegu: fabryka -> kopanie salta hooka
  (offline) -> launchpad (tworzy vault+hook w jednej tx) -> 15 kontroli wiazan
  -> zapis `scripts/output/launchpad-base.json`. Salt jest wazny tylko dla tej
  trojki (deployer, nonce, argumenty hooka), wiec NIE wysylaj nic innego z tego
  adresu w trakcie. Gdy ktorakolwiek z 15 kontroli odpadnie, skrypt krzyczy i
  NIE zapisuje adresow - takiego wdrozenia sie nie uzywa.

### Po deployie

1. **Weryfikacja na Basescanie** (`ETHERSCAN_API_KEY` w env):
   `npx hardhat verify --network base <launchpad> <konstruktor...>`. Vault i hook
   powstaly wewnetrznie - weryfikuje sie je OSOBNO, ich wlasnymi argumentami
   konstruktora (skrypt wypisuje je przy deployu).
2. **Frontend**: dodaj siec Base MAINNET (B20) do `LAUNCHPAD_NETWORKS`
   w `app/startpad/config.ts` + przelacznik; zmienne `NEXT_PUBLIC_*` nizej.
3. **Vanity**: ABI frontu jest RECZNE i nie ma jeszcze `launchVanity`/
   `predictVanityToken` - UI kopania 4 znakow to osobny front task (z Fazy 4:
   ostrzezenie snajperskie + ciasny domyslny windowCap dla vanity).
4. **Wykres/handel po graduacji**: dopiero na mainnecie da sie wpiac embed
   GeckoTerminal/DEX Screener (indeksuja v4 na Base MAINNET; testnetu nie).

### Zmienne Vercel po deployie (Base mainnet)

```text
NEXT_PUBLIC_LAUNCHPAD_BASE_ADDRESS          <launchpad z JSON>
NEXT_PUBLIC_LIQUIDITY_VAULT_BASE_ADDRESS    <vault z JSON>
NEXT_PUBLIC_LAUNCH_HOOK_BASE_ADDRESS        <hook z JSON>
NEXT_PUBLIC_B20_TOKEN_FACTORY_BASE_ADDRESS  <tokenFactory z JSON>
NEXT_PUBLIC_LAUNCHPAD_BASE_DEPLOY_BLOCK     <deployBlock z JSON>
```

Te piec zmiennych jest OPCJONALNE od wdrozenia 2026-08-11: `config.ts` ma realne
adresy Base mainnet jako fallback (`baseMainnetEntry`), wiec siec dziala i jest
DOMYSLNA bez env. Env tylko nadpisuje (gdyby kiedys byl redeploy). Nazwy musza
byc dokladnie te, gdy juz sie je ustawia.

### Produkcyjny RPC Base - WAZNE (CDP)

Board odpala do 90 okien `getLogs` na load. Publiczny `mainnet.base.org` tnie
getLogs na 2000 blokach i rate-limituje (429/-32016); `publicnode` w ogole
BLOKUJE getLogs bez wlasnego tokenu. Rozwiazanie: **CDP Node RPC** (masz platne
CDP - te same `CDP_API_KEY_ID/SECRET` co onramp). Zmierzone na zywo: CDP obsluguje
getLogs do ~50k blokow i przyjmuje ksztalt zapytania boardu (tablica adresow +
topics).

```text
NEXT_PUBLIC_CDP_RPC_URL=https://api.developer.coinbase.com/rpc/v1/base/<TWOJ_CLIENT_API_KEY>
```

`<TWOJ_CLIENT_API_KEY>` to "Client API Key" z portalu CDP (sekcja Node/RPC) - NIE
`CDP_API_KEY_ID`. Ten sam env wlacza tez `app/base/utils/cdpApi.ts` (statystyki
portfela, dzis wylaczone). `providers.tsx` czyta `NEXT_PUBLIC_BASE_RPC_URL ||
NEXT_PUBLIC_CDP_RPC_URL || mainnet.base.org`, z base.org jako fallbackiem.
NIE uzywaj publicznego tokenu z SDK do boardu - to token wspoldzielony (bundler
tipow), obciazanie go 90 oknami na load moze go zrate-limitowac dla wszystkich.

**OBOWIAZKOWO: allowlist domeny.** `NEXT_PUBLIC_` = token wchodzi do bundla JS
(widoczny w przegladarce). Client API Key nie rusza srodkow ani portfela (tylko
odczyty na Twoj limit), ale bez ograniczenia da sie go zeskrobac i palic Twoj
quota. W portalu CDP ogranicz ten Client API Key do WLASNYCH domen (produkcyjna +
ew. preview Vercela). Wtedy zeskrobany token nie zadziala z cudzego origin. To ta
sama ochrona co przy kluczach Google Maps/Alchemy i jest to KROK WYMAGANY, nie
opcjonalny. Alternatywa bez wystawiania (proxy serwerowy przez `CDP_RPC_URL`)
zostala swiadomie odrzucona na rzecz A - szybsza, zero kodu, allowlist zamyka
ryzyko.

## Zmienne na Vercelu

```text
NEXT_PUBLIC_LAUNCHPAD_SEPOLIA_ADDRESS        0x4Cc0ff50912400eeeC38db45ef5CEf00f5Ad1A48
NEXT_PUBLIC_LIQUIDITY_VAULT_SEPOLIA_ADDRESS  0x35B3217b8Ada69103b801FEFe9ca16E307a649B6
NEXT_PUBLIC_LAUNCH_HOOK_SEPOLIA_ADDRESS      0xf2EAEBceeC6Ccc168d8fe5B539F37e2d8c44e044
NEXT_PUBLIC_LAUNCHPAD_DEPLOY_BLOCK           45304536
```

Fallbacki w `app/launchpad/config.ts` wskazuja juz to wdrozenie, wiec brak
zmiennych nie jest krytyczny - ale zmienne i tak ustawic, zeby zmiana adresow
nie wymagala deployu frontu.

Opcjonalnie `NEXT_PUBLIC_IPFS_GATEWAY` (domyslnie `https://ipfs.io/ipfs/`).

`GOOGLE_CREDENTIALS` i `AUTH_SESSION_SECRET` musza juz byc - bez nich profile
tokenow oddaja `503`, a reszta launchpada dziala normalnie.

## Komendy

```powershell
npm run contracts:test -- test/CurveLaunchpad.test.ts test/B20LaunchHook.test.ts test/PlainTokenFactory.test.ts test/LaunchpadEndToEnd.test.ts
npm run contracts:test -- test/CurveLaunchpadInvariants.test.ts   # ~5 min, osobno
npm run launchpad:deploy:sepolia      # wymaga FEE_RECIPIENT i CONFIRM=tak
npm run launchpad:record:sepolia      # odtwarza plik wdrozenia z lancucha
npm run launchpad:env -- --write      # wpisuje adresy do .env.local
npm run launchpad:flow:sepolia        # pelna sciezka; FLOW_TOKEN wznawia od srodka
npm run launchpad:watch:sepolia       # podglad zdarzen, tylko odczyt
npm run launchpad:keeper:sepolia      # domyslnie dry-run
```

Testow NIE uruchamiac rownolegle z `npm run build` - webpack zabiera rdzenie
i `beforeEach` wchodzi w limit czasu Mocha, co wyglada jak regresja.

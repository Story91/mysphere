# Launchpad: frontend, kawalek 1 - rdzen handlu

> Pierwsza z trzech specyfikacji frontendu launchpada. Kolejne dwie: metadane
> (logo, opis, socials) i tworzenie tokena przez `/launchpad/create`.
> Warstwa kontraktow opisana jest w `B20-LAUNCHPAD-V2-KRZYWA-Z-HOOKIEM.md`.

## 1. Po co to jest

`CurveLaunchpad` przechodzi 94 testy i nie ma zadnego interfejsu. Bez frontendu
launchpad istnieje wylacznie jako ABI - nikt z ulicy nie kupi tokena na krzywej,
nie zobaczy postepu do progu i nie awansuje puli.

Ten kawalek dowozi **minimum, po ktorym launchpad DZIALA**: da sie zobaczyc liste
tokenow, wejsc na token, kupic, sprzedac i awansowac. Wyglada surowo, bo nie ma
metadanych - i to jest swiadome, patrz §2.3.

### Co jest w zakresie

- `/launchpad` - feed tokenow z krzywej, zakladki po stanie, trzy sortowania
- `/launchpad/[address]` - strona tokena z widgetem kupna/sprzedazy, paskiem do
  progu, przyciskiem awansu i panelem odbioru salda
- warstwa danych czytajaca `CurveLaunchpad` z lancucha
- konfiguracja trzech sieci: Base mainnet, Base Sepolia i Robinhood Chain
- wydzielenie prymitywow RPC z `market.ts` do wspolnego modulu

### Czego NIE ma w zakresie

| brak | dlaczego | gdzie trafia |
|---|---|---|
| logo, opis, Twitter/Telegram | B20 nie trzyma metadanych na lancuchu; potrzebny wlasny magazyn i dowod tozsamosci tworcy | kawalek 2 |
| `/launchpad/create` | tokeny w tym kawalku wpuszcza sie skryptem | kawalek 3 |
| siatka kart w stylu Ponsa | bez obrazkow karty wygladaja na niedokonczone | kawalek 2 |
| obrot, "Recent buys" | wymaga skanowania `Bought`/`Sold` po wszystkich tokenach - osobny budzet RPC | osobna decyzja |
| holderzy | wymaga indeksera `Transfer` - `market.ts` sam pisze, ze to poza budzetem RPC | osobna decyzja |
| wykres ceny | GeckoTerminal zna tylko tokeny, ktore zaindeksowal; token na krzywej nie ma tam wpisu | osobna decyzja |
| `sellWithPermit` | dwie sciezki bledu w pierwszym kawalku; patrz §7.4 | ulepszenie |
| Robinhood testnet (46630) | Uniswap nie ma tam wdrozenia v4 | gdy bedzie |

## 2. Decyzje i uzasadnienia

### 2.1 Osobna sekcja `/launchpad`, `/b20` nietkniete

`/b20` jest **explorerem wszystkich tokenow B20 na lancuchu** - czyta je z
lancucha i klasyfikuje po stanie puli (`traded`/`listed`/`unlisted`). Launchpad
pokazuje wylacznie tokeny wypuszczone przez `CurveLaunchpad`, ze stanem krzywej.
To sa dwa rozne produkty i mieszanie ich w jednej nawigacji zmusiloby uzytkownika
do rozumienia roznicy, zeby cokolwiek zrobic.

```
/launchpad            feed tokenow z krzywej
/launchpad/[address]  strona tokena + widget handlu

/b20                  BEZ ZMIAN - explorer wszystkich B20
/b20/create           BEZ ZMIAN - precompile wprost
/b20/tools            BEZ ZMIAN
```

Rozdzielenie zamyka przy okazji problem dwoch niekompatybilnych sciezek
tworzenia tokena: `/b20/create` wola precompile B20 wprost, `/launchpad/create`
(kawalek 3) bedzie wolal `launch()`. Zyja obok siebie pod roznymi adresami
zamiast walczyc o jeden przycisk.

### 2.2 Trzy sieci od startu

Base Sepolia, Base mainnet i Robinhood Chain. Sepolia jest pierwsza: skrypt
`launchpad:deploy:sepolia` juz istnieje, ETH testowe jest z kranu, a przejscie na
mainnet to zmiana zmiennej srodowiskowej. Bez tego frontend budowaloby sie na
slepo i pierwszy raz zobaczyloby sie go dzialajacego dopiero po audycie.

**Robinhood wchodzi od poczatku, a nie pozniej.** Wczesniejsze notatki mowily,
ze nikt nie odczytal tam adresu PoolManagera - to bylo prawdziwe wtedy i
przestalo byc prawdziwe 2026-08-10. Uniswap v4 jest na Robinhood Chain, a adres
zostal sprawdzony `eth_getCode` na zywej sieci:

| chainId | siec | PoolManager | bajtow kodu |
|---|---|---|---|
| 8453 | Base | `0x498581fF718922c3f8e6A244956aF099B2652b2b` | 24 009 |
| 84532 | Base Sepolia | `0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408` | 24 009 |
| 4663 | Robinhood Chain | `0x8366a39cc670b4001a1121b8f6a443a643e40951` | 24 009 |

Zgodnosc rozmiaru co do bajta na wszystkich trzech znaczy, ze to ten sam
kontrakt. Wpisy trafily do `KNOWN_POOL_MANAGERS` w `scripts/launchpad/plan.ts`.

Robinhood **testnet** (46630) wpisu nie ma - Uniswap nie wymienia tam wdrozenia
v4. Gdyby kiedys bylo, obowiazuje ta sama regula: `eth_getCode` przed wpisaniem,
nigdy adres z pamieci.

Konsekwencja dla launchpada: `PlainTokenFactory` (wlasny ERC-20 zamiast
precompile B20) juz istnieje i ma testy, wiec **Robinhood nie potrzebuje zadnej
nowej pracy kontraktowej** - tylko wdrozenia i wpisu w konfiguracji frontendu.

### 2.3 Wiersze, nie karty

Prosba brzmiala "na wzor Ponsa", a Pons to siatka kart, w ktorej **cale wrazenie
robi obrazek**. Metadanych nie ma do kawalka 2, wiec siatka pokazywalaby kwadraty
z inicjalami - wyglada to gorzej niz lista i wyglada na niedokonczone, bo takie
jest.

W tym kawalku nosnikiem wrazenia jest to, czego Pons nie ma: **pasek postepu do
awansu**. To jedyna dana, ktora sama z siebie buduje napiecie, i mamy ja za darmo
z `ethReserve`. Feed przechodzi na siatke kart w kawalku 2, gdy karty beda mialy
co pokazac.

## 3. Architektura

### 3.1 Pliki

```
app/utils/chain/rpc.ts              NOWY   createRpc(urls) -> { call, scanLogs, multicall }
app/utils/b20/market.ts             ZMIANA usuwa 3 funkcje prywatne, uzywa createRpc

app/utils/launchpad/config.ts       NOWY   adresy per chainId, z ENV
app/utils/launchpad/abi.ts          NOWY   minimalne ABI
app/utils/launchpad/math.ts         NOWY   czysta arytmetyka (jedyne pokryte testami)
app/utils/launchpad/feed.ts         NOWY   lista tokenow + cache
app/utils/launchpad/token.ts        NOWY   pojedynczy token + wyceny
app/utils/launchpad/errors.ts       NOWY   mapowanie custom errors na zdania

app/launchpad/page.tsx              NOWY   server component
app/launchpad/LaunchpadFeed.tsx     NOWY   client - zakladki, sortowanie
app/launchpad/[address]/page.tsx    NOWY   server component
app/launchpad/[address]/TradePanel.tsx NOWY client - widget handlu
app/launchpad/[address]/GraduateButton.tsx NOWY client
```

Granice: `app/utils/launchpad/*` nie wie nic o B20 explorerze, `app/utils/b20/*`
nie wie nic o launchpadzie. Jedyna rzecz wspolna to `app/utils/chain/rpc.ts`,
ktory nie wie nic o zadnym z nich.

### 3.2 Wydzielenie prymitywow RPC

`market.ts` ma juz dokladnie te prymitywy, ktorych launchpad potrzebuje:
`rpcCall`, `scanLogs` (getLogs w kawalkach po 10 000 blokow, po piec rownolegle -
zmierzone jako bezpieczne wobec limitu -32016 publicznego RPC Base) i `multicall`
(chunki po 300). Wszystkie sa prywatne w module.

Przeniesienie nie moze byc zwykla kopia: `rpcCall` trzyma liste endpointow w
stalej modulowej `RPCS` i pamieta w `rpcIndex`, ktory endpoint ostatnio
odpowiedzial. Dlatego wydzielenie ma ksztalt **fabryki**:

```ts
export function createRpc(urls: string[]) {
  let index = 0;                     // lepkosc endpointu, per instancja
  async function call<T>(method: string, params: unknown[]): Promise<T> { ... }
  async function scanLogs(address, topics, fromBlock, toBlock): Promise<RpcLog[]> { ... }
  async function multicall(calls): Promise<string[]> { ... }
  return { call, scanLogs, multicall };
}
```

Kazda siec dostaje wlasna instancje z wlasna lista i wlasna lepkoscia. W
`market.ts` zostaje `const rpc = createRpc(RPCS)`, a wywolania `rpcCall(...)`
zamieniaja sie na `rpc.call(...)`.

**Ciala funkcji przenosza sie bez zmian.** Ryzyko regresji na `/b20` istnieje,
ale jest kontrolowalne: te funkcje nie maja stanu poza `index`, wiec przeniesienie
albo dziala, albo wywala sie na kompilacji. `market.ts` przy okazji chudnie z 844
linii.

### 3.3 Konfiguracja sieci

`config.ts` to tabela po `chainId`. Adresy **nie ida do kodu**:

| chainId | siec | zmienne |
|---|---|---|
| 8453 | Base | `NEXT_PUBLIC_LAUNCHPAD_PAD_8453`, `..._VAULT_8453`, `..._HOOK_8453`, `..._BLOCK_8453` |
| 84532 | Base Sepolia | te same z sufiksem `_84532` |
| 4663 | Robinhood Chain | te same z sufiksem `_4663` |

`deployBlock` jest obowiazkowy - bez niego `scanLogs` skanowalby od bloku zero.

Siec bez wpisu daje **jasny komunikat w UI**, nie pusta liste udajaca brak
tokenow. Cisza jest gorsza niz jawny brak konfiguracji.

## 4. Warstwa danych

### 4.1 Feed

1. `scanLogs(pad, [Launched])` od `deployBlock` -> adresy tokenow, tworcy, bloki
2. `multicall(launchOf)` po wszystkich -> stan, `ethReserve`, `tokenReserve`
3. wyliczenie w JS: cena, kapitalizacja, postep do progu

Budzet RPC: jedno `scanLogs` w kawalkach plus jedno-dwa `multicall`. To jest
**rzad wielkosci taniej niz obecny `/b20`**, bo tam trzeba szukac pul po calym
lancuchu, a tu wszystko emituje jeden kontrakt.

Cache wzorem `market.ts` (stale-while-revalidate), ale krotszy: **30 s zamiast
60 s**. Krzywa rusza sie szybciej niz tablica pul, a pasek postepu klamiacy o
minute jest gorszy niz brak paska.

### 4.2 Postep do progu

Liczony w ETH, nie w tokenach: `ethReserve / 3 ETH`. Zbiorka domyka sie na
**dokladnie 3,00 ETH** (test `dociagnienie trafia w T_MIN co do JEDNOSTKI i
zbiera dokladnie 3 ETH`), wiec to jest uczciwy ulamek i czytelny dla czlowieka
("2,1 / 3,0 ETH"). Wersja tokenowa dalaby te sama liczbe, ale nikt nie wie, czym
jest 200 milionow.

### 4.3 Strona tokena

`launchOf(token)` co 15 s plus `quoteBuy`/`quoteSell` po kazdej zmianie pola z
debounce. Do tego `balanceOf`, `allowance` i `claimable(user)` gdy portfel jest
podlaczony.

## 5. UI: feed

```
Blisko awansu                                    [3 kafle]
+--------------+--------------+--------------+
| $PEPE        | $DEGEN       | $WIF         |
| ########_ 94%| #######__ 78%| ######___ 61%|
| 2.82 / 3.0   | 2.34 / 3.0   | 1.83 / 3.0   |
+--------------+--------------+--------------+

[ Na krzywej 12 ]  [ Zamkniete 3 ]  [ Awansowane 7 ]
sortowanie:  Najnowsze | Blisko progu | Kapitalizacja

$MOON  Moon Token        ###______ 31%   0.93/3.0 ETH   MC 4.2 ETH   2h
$CAT   Cat Coin          #________  8%   0.24/3.0 ETH   MC 1.1 ETH   5h
```

Zakladki po stanie ida wzorem, ktory `/b20` juz ma (`traded`/`listed`/`unlisted`) -
konsekwencja, nie nowy pomysl.

Sortowan sa trzy i **wszystkie licza sie z danych, ktore i tak pobieramy**. Nie ma
"Volume" ani "Recent buys" z Ponsa, bo obrot wymaga skanowania zdarzen po
wszystkich tokenach. Lepiej nie miec zakladki niz miec taka, ktora klamie.

Pasek "Blisko awansu" to trzy tokeny o najwyzszym `ethReserve` w stanie `Curve`.
To jest lista, ktorej Pons nie ma, a ktora jest najciekawsza.

**Nawigacji nie ma w tym kawalku.** `/launchpad/create` przychodzi w kawalku 3,
wiec pasek z jedna pozycja bylby ozdoba.

## 6. UI: strona tokena

```
$MOON  Moon Token                          [ Na krzywej ]
0x1234...abcd  [kopiuj]     tworca 0xabcd...1234

+-------------------------------------------------+
|  ###############_________  2.10 / 3.00 ETH      |
|  do awansu brakuje 0.90 ETH                     |
+-------------------------------------------------+

cena 1.4e-9 ETH   MC 1.40 ETH   w obiegu 340M / 1B

+- [ Kup ] [ Sprzedaj ] -------------------------+
|  0.5                                      ETH  |
|  [25%] [50%] [75%] [Max]                       |
|                                                |
|  dostaniesz  ~42 100 000 MOON                  |
|  oplata      0.005 ETH (1%)                    |
|  poslizg     2%                                |
|                                                |
|              [  Kup MOON  ]                    |
+------------------------------------------------+

Do odebrania: 0.012 ETH        [ Odbierz ]
```

Widget jest **wlasny, nie link na zewnatrz** - to nasz kontrakt, wiec kupno idzie
przez `buy()`, a wycena przez `quoteBuy()`. Test `quoteBuy zwraca dokladnie to,
co wykona buy` znaczy, ze liczba pokazana czlowiekowi jest ta, ktora dostanie.

### 6.1 Co kontrakt wymusza, a UI musi pokazac

- **Poslizg i termin sa obowiazkowe w obie strony** (`SlippageRequired`,
  `Expired`). Domyslnie 2% i 20 minut. Poslizg edytowalny, bo ktos moze wejsc
  przed toba i cena wzrosnie.
- **Limit okna startowego.** Przez pierwsze `LAUNCH_WINDOW` = **300 sekund**
  kazdy adres moze kupic **lacznie** najwyzej `WINDOW_ADDR_CAP` = **16 000 000
  tokenow** (1,6% podazy). Limit jest **skumulowany per adres, nie per
  transakcja** - kontrakt trzyma `windowBought[token][adres]` i sumuje. Wychodzi
  poza sufit -> `WindowCap`, ktory **rewertuje, nie przycina**.

  UI musi wiec odczytac `windowBought(token, user)` i pokazac, ile adresowi
  zostalo, a nie stalym sufit. Limit obejmuje tez tworce - w oknie jest zwyklym
  adresem.
- **Zwrot z dociagniecia.** Kupno przekraczajace prog jest przycinane i reszta
  ETH wraca. `quoteBuy` zwraca te kwote, wiec widget pokazuje "zwrot 0.31 ETH"
  zamiast pozwolic sie zdziwic.

### 6.2 Panel zmienia sie ze stanem

| stan | co jest |
|---|---|
| `Curve` | kupno i sprzedaz |
| `Locked` | **tylko sprzedaz** + przycisk `Awansuj` z widoczna nagroda dla wolajacego |
| `Graduated` | handel na krzywej znika, zostaje odnosnik do puli |

### 6.3 Zarobek tworcy - widoczny, nie ukryty

Kontrakt **juz placi tworcy od obrotu**, i to bez konca. Dotad ta informacja
istniala wylacznie w kodzie. Pons pokazuje "creator tax" w sekcji About i to jest
jedna z rzeczy, ktore warto od niego wziac - z ta roznica, ze u nas nie jest to
podatek nakladany na handlujacych, tylko podzial oplaty, ktora i tak jest.

Liczby wprost z kontraktow:

| zrodlo | stala | tworca | protokol |
|---|---|---|---|
| handel na krzywej | `FEE_BPS` 100, `CREATOR_FEE_BPS` 40 | **0,4% obrotu** | 0,6% |
| hook w puli, po awansie | `HOOK_FEE_BPS` 100, `PROTOCOL_SHARE_BPS` 6000 | **0,4% obrotu** | 0,6% |
| oplaty LP z pozycji vaulta | `PROTOCOL_SHARE_BPS` 6000 | 40% | 60% |

`CREATOR_FEE_BPS` jest **podzbiorem** `FEE_BPS`, nie dodatkiem - handlujacy placi
1% niezaleznie od tego, jak dzieli sie ta oplata. Tworca nie moze wiec podniesc
kosztu handlu, a my nie mozemy zejsc mu ponizej udzialu, bo `MAX_PROTOCOL_SHARE_BPS`
= 8000 jest **podloga tworcy**: nawet literowka przy wdrozeniu nie zejdzie mu
ponizej 20%.

Najwazniejsze zdanie, ktore ma trafic na strone tokena: **0,4% z kazdej wymiany,
takze po awansie, na zawsze.** Wiekszosc launchpadow placi tworcy tylko do
graduacji; hook placi dalej, bo siedzi w puli. To jest przewaga produktowa, a nie
szczegol implementacji, i ma byc widoczna:

```
Tworca zarabia 0,4% z kazdej wymiany - takze po awansie
Do odebrania: 0.012 ETH        [ Odbierz ]
```

Panel odbioru czyta `claimable(user)` dla podlaczonego portfela i dziala dla
kazdego, kto ma saldo - tworcy, protokolu i tego, kto wywolal `graduate()`.

### 6.4 Sprzedaz to dwie transakcje

`approve`, potem `sell`. Kontrakt ma `sellWithPermit`, ktory zrobilby to jedna,
i to jest wyraznie lepszy UX - ale wymaga podpisu EIP-2612 z odczytem
`nonces`/`name`/`version` i wlasnej sciezki awaryjnej, bo test mowi wprost, ze
permit potrafi byc zepsuty (`sellWithPermit ... przezywa zepsuty permit`).
Osobne ulepszenie, zeby nie wsadzac do pierwszego kawalka rzeczy z dwiema
sciezkami bledu.

## 7. Bledy

### 7.1 Lapane PRZED portfelem

Przed kazda transakcja leci `simulateContract`. Viem odkoduje custom error z ABI,
wiec rewert widzimy **zanim otworzy sie portfel**. Czlowiek dostaje zdanie po
polsku zamiast okna MetaMaska z "execution reverted" i straconego klikniecia.

### 7.2 Mapowanie

| blad | kiedy | co widzi czlowiek |
|---|---|---|
| `Slippage` | cena ruszyla miedzy wycena a wykonaniem | Cena zmienila sie w trakcie. Podnies poslizg albo sprobuj ponownie. |
| `Expired` | minal termin | Transakcja czekala za dlugo. Sprobuj ponownie. |
| `WindowCap` | kupno ponad skumulowany limit okna | Trwa okno startowe - zostalo ci jeszcze X tokenow z limitu 16 000 000. |
| `BuyTooLarge` | ponad `MAX_BUY` = 100 ETH | Maksymalne kupno to 100 ETH. |
| `CreatorLocked` | tworca sprzedaje w trakcie zbiorki | Tworca nie moze sprzedawac przed zamknieciem krzywej. |
| `CurveIsLocked` | kupno po progu | Krzywa zamknieta - kupno niedostepne, sprzedaz dziala. |
| `AlreadyGraduated` | handel po awansie | Token awansowal. Handel odbywa sie w puli. |
| `DustTrade`, `ZeroAmount` | kwota ponizej pylu | Kwota jest za mala. |
| `NotLocked` | `graduate` przed progiem | Token nie domknal jeszcze zbiorki. |
| `ReserveTooSmallToGraduate` | rezerwa pod `MIN_LP_ETH` | Za malo ETH w rezerwie, zeby otworzyc pule. |
| `NothingToClaim` | `claim` bez salda | Nie masz nic do odebrania. |

`SlippageRequired`, `ZeroAddress`, `WrongTokenAddress`, `SupplyMismatch`,
`Arithmetic`, `Reentrancy` **nie dostaja ladnych komunikatow** - to sa albo bledy
naszego UI, albo asercje, ktore nie maja prawa odpasc. Generyczny komunikat plus
pelny blad do konsoli. Ubieranie ich w mile zdania ukryloby nasz wlasny bug.

## 8. Stany brzegowe

| stan | zachowanie |
|---|---|
| launchpad nie wdrozony na tej sieci | jasny komunikat i przelacznik, **nigdy** pusta lista |
| portfel na zlej sieci | przycisk "Przelacz na Base", handel zablokowany |
| RPC padlo | ostatni cache z banerem "dane sprzed X minut", wzorem `BOARD_STALE_MS` |
| pusty feed | stan pusty mowiacy, ze nikt nic nie wypuscil, nie krecacy sie spinner |
| nieznany token (`UnknownToken`) | 404, nie biala strona |
| stan zmienil sie miedzy wycena a wyslaniem | `simulateContract` lapie przed portfelem |

## 9. Testy

**Repozytorium nie ma zadnej infrastruktury testowej frontendu.** W `package.json`
nie ma jesta, vitesta ani playwrighta; `test/` to katalog kontraktow. Kazdy test
frontendu zaczyna sie wiec od dolozenia zaleznosci.

Decyzja: **vitest, wylacznie dla `app/utils/launchpad/math.ts`.**

Zakres pokrycia:

- postep do progu z `ethReserve`
- cena i kapitalizacja z rezerw
- `minOut` z poslizgu
- przyciecie kwoty do sufitu okna startowego
- formatowanie duzych liczb tokenow

Uzasadnienie jest waskie i konkretne: **to sa funkcje, ktore decyduja o liczbie
pokazanej czlowiekowi, zanim wyda pieniadze.** Pomylka o rzad wielkosci w
`minOut` to nie literowka w UI, to czyjes straty.

### Czego ta specyfikacja NIE pokrywa testami

Komponenty, integracja i sciezka portfela zostaja **niepokryte i sprawdzane
recznie na Sepolii**. To jest swiadomy dlug, nie przeoczenie. Pierwszy pelny
przebieg reczny na Sepolii jest warunkiem uznania tego kawalka za zrobiony:
start tokena skryptem, kupno, sprzedaz, dociagniecie do progu, awans, odbior
salda.

## 10. Cechy Ponsa - co bierzemy, czego nie

Zestawienie wobec zrzutow `ponsfamily.com/launchpad`. Kolumna "kawalek" mowi,
kiedy to dostajemy.

| cecha Ponsa | u nas | kawalek |
|---|---|---|
| pasek postepu do graduacji | **tak, mocniej** - pasek jest glownym nosnikiem feedu, nie ozdoba | 1 |
| widget kupna/sprzedazy na stronie | **tak, wlasny** - nasz kontrakt, wiec `buy()`/`sell()`, nie link "Buy on Uniswap" | 1 |
| creator tax w About | **tak, mocniej** - 0,4% od obrotu, takze PO awansie; Pons placi tworcy z podatku, my z podzialu oplaty (§6.3) | 1 |
| zakladki i sortowanie | tak, trzy sortowania liczone z danych, ktore i tak pobieramy | 1 |
| siatka kart Graduated z obrazkiem | nie w kawalku 1 - brak metadanych, patrz §2.3 | 2 |
| About: opis, Twitter, Telegram | nie - B20 nie trzyma metadanych na lancuchu | 2 |
| Recent trades | nie - wymaga skanowania `Bought`/`Sold` po wszystkich tokenach | osobna decyzja |
| Holders | nie - wymaga indeksera `Transfer` | osobna decyzja |
| wykres 5M/1H/6H/1D/ALL | nie - GeckoTerminal nie zna tokenow z krzywej | osobna decyzja |

Czego Pons **nie ma**, a my mamy juz w kawalku 1:

- **lista "Blisko awansu"** - trzy tokeny o najwyzszej rezerwie w stanie `Curve`.
  Najciekawsza lista w calym produkcie, a nikt jej nie pokazuje.
- **rozroznienie stanow z lancucha** zamiast jednej plaskiej listy.
- **oplata tworcy nie konczy sie na graduacji** - hook bierze 1% z kazdej wymiany
  w puli bez konca i dzieli je 60/40. To jest cecha kontraktu, nie frontendu, ale
  to frontend musi ja pokazac, zeby ktokolwiek o niej wiedzial.

## 11. Zaleznosc od stanu kontraktow

Warstwa kontraktow przechodzi 94 testy, ale **znak delty w `afterSwap` jest
wyprowadzony ze zrodel v4, nie zmierzony** - atrapa `MockPoolManager` nie stosuje
`hookDelta` do wlasnej ksiegowosci. Dotyczy to handlu w puli PO awansie, czyli
poza zakresem tego kawalka: feed, krzywa i sam awans go nie dotykaja. Frontend
mozna budowac rownolegle z forkiem Base.

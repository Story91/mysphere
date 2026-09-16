# Arc mainnet — stan na 16 września 2026

Jeden aktualny dokument zamiast dwóch sprzed wdrożenia
(`ARC-NEXT-2026-09-13.md`, `ARC-REPORT-REVIEW-2026-09-14.md` — usunięte
16.09, treść w historii git). Tamte opisują świat, w którym launchpad na Arc
jeszcze nie stał i nie było oficjalnego RPC — oba te zdania są już nieprawdziwe.
Runbook wdrożenia zostaje osobno: `ARC-MAINNET-DEPLOY.md`.

Wszystkie liczby i adresy poniżej pochodzą z odczytu łańcucha albo z przebiegu
testu, nie z dokumentacji. Gdzie czegoś nie sprawdziliśmy, jest to napisane wprost.

---

## 1. Co się zmieniło 16 września

Publiczny mainnet Arc wystartował (zapowiedź Circle z 5 sierpnia).

| | 31.08 | 16.09 |
|---|---|---|
| `rpc.mainnet.arc.io` | Cloudflare 403 | **działa**, chainId 5042 |
| USDC na Arc | 4 360 669 | **135 641 048** (×31) |
| TVL PoolManagera v4 | ~16 848 | **1 136 910** (×67) |
| head | 18 373 159 | ~21 079 000 |

Dokumentacja Arc **nadal** twierdzi „Mainnet addresses are not yet available"
(`/arc/references/contract-addresses`), a `chainid.network` ma dla 5042 puste
listy RPC i eksploratorów. Adresy poniżej pochodzą więc z łańcucha, nie stamtąd.

---

## 2. Co stoi na Arc — nasze

Wdrożone 16.09 o 01:20 UTC, blok 21 078 146, koszt **0,19 USDC**.
Manifest: `scripts/output/launchpad-arcMainnet.json`, adresy w
`app/startpad/config.ts` (linie 520–523).

| kontrakt | adres |
|---|---|
| CurveLaunchpad | `0xD5f65Cfbe6A1AA1B6f82CBE0A336DDFCD39a5340` |
| LiquidityVault | `0x49FD3A54b23A0ee1d6A7720F493618F5CCF4681D` |
| B20LaunchHook | `0x9669d2809710aD8218793e0CD55317Ccd984E044` |
| PlainTokenFactory | `0x04bdaD462B66B152689076975db1197766A69568` |

Parametry: `R_VIRT` 1250 USDC (próg zbiórki **5 000 USDC**, mcap po graduacji
31 250), `FEE_BPS` 100, `CREATOR_FEE_BPS` 70, `PROTOCOL_SHARE_BPS` 3000.

> **Wdrożenie poszło bez pytania.** `$env:CONFIRM='tak'` zostało w PowerShellu
> po komendach mostu i bramka w `deploy.ts` je zobaczyła. Bramka zadziałała
> zgodnie z kodem — zawiodła higiena sesji powłoki. Przy następnym wdrożeniu na
> nową sieć: `Remove-Item Env:CONFIRM` zaraz po użyciu.

---

## 3. Co stoi na Arc — cudze, ale nam potrzebne

| kontrakt | adres | jak potwierdzony |
|---|---|---|
| v4 PoolManager | `0x8366a39CC670B4001A1121B8F6A443A643e40951` | `eth_getCode`, 24 009 B |
| v4 Quoter | `0x8Dc178eFB8111BB0973Dd9d722ebeFF267c98F94` | `eth_getCode`, 6 118 B |
| v4 StateView | `0xF3334192D15450CdD385c8B70e03f9A6bD9E673b` | `eth_getCode`, 3 531 B |
| **UniversalRouter** | `0x4fca4a51ab4f23a7447b3284fbd7d73289a89fb1` | patrz niżej |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` | `eth_getCode`, 9 152 B |
| natywne USDC (fasada ERC-20) | `0x3600000000000000000000000000000000000000` | `decimals()` = 6 |

**PoolManager to ten sam build co oficjalny Uniswap v4.** Runtime różni się od
Base `0x498581fF…` dokładnie **20 ciągłymi bajtami** pod offsetem 13618 — to
własny `address(this)` każdego z nich. `keccak256(runtime)` =
`0xbd3881180b547f5fe817545743cfb4343e96b1bc6640dcd70c106b0066e95626` i to jest
wartość pinowana w `POOL_MANAGER_CODE_HASH`. Ten sam adres i te same Quoter
oraz StateView Uniswap listuje **oficjalnie** dla Robinhood Chain (4663).

**UniversalRouter nie pochodzi z żadnej dokumentacji.** Znaleziony odczytem
zdarzeń `Swap` PoolManagera jako najaktywniejszy wołający (2 889 swapów v4
w próbce ~1800 bloków). 24 546 B, selektor `execute(bytes,bytes[],uint256)`
(`0x3593564c`), w runtime zaszyte adresy naszego PoolManagera i Permit2.
Uwaga: to **inny build** niż router na Base (24 546 B vs 19 499 B), więc
równość bajtkodu nie jest tu argumentem — jedynym dowodem jest przebieg testu.

> **Czego nie wiemy:** proweniencji. Uniswap nie listuje Arc (odczyt 16.09).
> Równość bajtkodu PoolManagera dowodzi, że to ten sam *kod*, nie że stoi za nim
> Uniswap. Właściciel tych wdrożeń to `0x33F26c5d…51E8`, a nie owner z Base.

---

## 4. Co jest zweryfikowane przebiegiem

`test/ArcForkMainnet.test.ts` — 6 testów, wszystkie zielone, fork mainnetu Arc.

1. Fork stoi na Arc, hash runtime PoolManagera zgadza się z pinem.
2. Cały stack wdraża się od zera przeciw prawdziwemu PoolManagerowi; wiązania
   i bity uprawnień hooka się zgadzają.
3. **Pełny cykl**: launch → krzywa → graduacja → swapy w obie strony → settle → harvest.
4. Wdrożone parametry czytane z łańcucha zgadzają się z manifestem.
5. **Wdrożony stack `0xD5f6…` awansuje** — to on jest opłacony i niezmienny.
6. **Ścieżka UI**: Quoter wycenia, UniversalRouter wykonuje swap, tokeny lądują
   w portfelu — `encodeV4ExactInSingle` **importowany z pliku UI**, nie kopia.

**`POOLS_SLOT = 6` potwierdzony mutacją.** Podmiana na 7 wywala cykl, powrót na
6 przywraca zieleń. To była jedyna rzecz mogąca trwale zabić niezmienny
kontrakt: `LiquidityVault._seed` czyta przez `extsload` cenę, którą sam przed
chwilą ustawił, i przy złym slocie rewertuje `PoolStateUnreadable` — czyli
graduacja padłaby dopiero przy pierwszym prawdziwym awansie, nie przy starcie.

Gaz z przebiegu (przy 20 gwei): graduacja **457 139** ≈ 0,009 USDC,
launch 888 752 ≈ 0,018 USDC, swap 168–316 tys., settle 125 tys.

> **Czego fork nie dowodzi.** Hardhat forkuje standardowy EVM i nie odtwarza
> arcowej semantyki natywnego USDC: zdarzeń EIP-7708 przy ruchach natywnych,
> blocklisty rewertującej transfery wartości, ani `SELFDESTRUCT` przenoszącego
> saldo USDC. Mówi to wprost dokumentacja Arc (`/integrate/defi/amm-and-pools`,
> krok 6). To sprawdza się transakcją, nie forkiem.

---

## 4a. Pierwszy prawdziwy token na Arc — i co z niego wynika

**Launchpad ma pierwszy launch od OBCEGO adresu.** Token `Arpe (ARPE)`
`0x2b5b0ffcD0BFb92ba34e4d10d6360A0364CFE9F2`, twórca
`0xa66dE81A3Ea3fe97cb6c9671C3fDC93D16c89998` (nie nasz `0xD488…`), blok
21 113 706. Pięć transakcji kupna, 10 zdarzeń `FeeAccrued`. Rezerwa: **1 wei** —
czyli ktoś przetestował launch pyłowymi kwotami, nie zbudował rynku.

Board pokazuje go poprawnie (`ACTIVE CURVES 1`, rezerwa 0.000 USDC, atrapy
zniknęły). Skan po stronie klienta potrzebuje na to kilkunastu sekund — Arc robi
~169 tys. bloków na dobę, więc okno 9 500 bloków to sporo przebiegów.

### Konsekwencja dla 6.3 (`FEE_RECIPIENT`)

Do 16.09 rano zmiana odbiorcy opłat była **darmowa**: pad stał pusty, więc
ponowne wdrożenie kosztowałoby 0,19 USDC i nie porzucało niczego. **To okno się
zamknęło.** Na obecnym padzie stoi już token obcego twórcy z historią transakcji.
Redeploy znaczy teraz: nowy adres pada, a ARPE i jego twórca zostają przy starym,
o którym UI przestanie wiedzieć. To nie jest już decyzja techniczna, tylko
decyzja o porzuceniu cudzego launchu.

### Konsekwencja dla „pierwszej prawdziwej graduacji"

To NIE jest zadanie do zaplanowania — to zobowiązanie kapitałowe:

| pozycja | kwota |
|---|---|
| próg zbiórki (4 × R_VIRT) | **5 000 USDC** |
| opłata graduation (3%) | 150 USDC (połowa wołającemu, połowa protokołowi) |
| trafia do puli jako LP | **4 850 USDC** |
| saldo `0xD488` na Arc | 12,89 USDC |

LP jest **zamknięte na zawsze** — `LiquidityVault` nie ma ścieżki wykonania,
która poda `liquidityDelta < 0` (komentarz w kodzie, linia 49). Kupujący trzyma
tokeny, które może sprzedać z powrotem do tej puli, więc nie jest to czysta
strata — ale 4 850 USDC zostaje unieruchomione, a odzysk zależy od wpływu na cenę.

**Wniosek: na mainnecie nie da się tanio sprawdzić graduacji.** Fork jest jedynym
przystępnym dowodem i dlatego `test/ArcForkMainnet.test.ts` przechodzi pełny cykl
dwa razy — na świeżym stacku i na wdrożonym. Czego fork nie obejmuje, stoi
w ramce w sekcji 4.

---

## 5. Most i gaz — rozwiązane

Bloker „nie ma jak dostać USDC na Arc" stał od 11.09. Rozwiązanie:

- **Goły `npm run arc:bridge` nie wystarcza.** Pali USDC i zostawia wiadomość,
  której nikt nie dostarcza — CCTP v2 zawsze wymaga `receiveMessage` po stronie
  celu, a świeży portfel nie ma tam czym zapłacić za gaz. Klasyczne jajko i kura.
- **Trasa z relayerem rozwiązuje bootstrap.** Jumper/LI.FI `polymerStandard`
  (`swapAndStartBridgeTokensViaPolymerCCTP` na LiFiDiamond `0x1231DEB6…`)
  ma własnego relayera, prowizja ~0,012 USDC, dostarcza sam w ~20 min.
  Status: `https://li.quest/v1/status?txHash=…`.
- **Spalenia FAST wygasają.** Attestacja ma `expirationBlock`; po jego minięciu
  `receiveMessage` rewertuje `"Message expired and must be re-signed"`.
  Naprawa: `POST https://iris-api.circle.com/v2/reattest/{eventNonce}` —
  Circle przepodpisuje z `expirationBlock: 0`. USDC nie przepada.
  Spalenia STANDARD (threshold 2000) nie wygasają.

- **Bezpośrednie spalenia też bywają dowożone, ale wybiórczo.** W próbce 40
  dostaw z Base z ~2 h (16.09 rano): 29 spaleń przez kontrakty aplikacji, każde
  dowiezione przez relayer aplikacji z opóźnieniem ~1 h; 11 spaleń bezpośrednich
  jak nasz `arc:bridge`, z czego 8 odebrali sami nadawcy, a 3 dowiózł obcy adres.
  Publiczny relayer Circle (`0x54eAe1fe…`, 2 608 dostaw w 2 h do 1 391 odbiorców)
  obsługuje głównie ruch aplikacji. Wniosek: pierwszy gaz przez Jumpera, potem
  `arc:bridge` + własny `arc:receive`.
- Sprawdzone i odpadające 16.09: LiFi API `/v1/quote` (brak trasy dla USDC
  bezpośrednio), most thirdweb (Arc nie na liście sieci), Bridge Kit Circle
  1.14.1 (zna tylko `Arc_Testnet`), Pimlico (chain 5042 nieobsługiwany),
  publiczny paymaster (brak).

Portfel `0xD4885A5a…` to na Base **EOA z delegacją EIP-7702**
(`0xef0100` → `0x63c0c19a…`), na Arc zwykły EOA — klucz działa po obu stronach.

---

## 6. Znane problemy

### 6.1 Rozjazd hydracji — ROZWIĄZANE

**Objaw.** Przy każdym wejściu na `/startpad` z zapisaną siecią Arc serwer
wysyłał HTML z danymi Base (`„3 ETH raised"`, `„Trades here move real ETH"`,
`„runs on Base B20"`), a klient podmieniał to na 5 000 USDC. React zgłaszał
`Text content did not match`, wyrzucał serwerowy DOM i renderował od nowa —
użytkownik przez moment widział **cudze liczby o pieniądzach**.

**Moja wycena była zawyżona — dwa razy, i to zmieniło decyzję.** Naliczyłem
~290 użyć stałych prymitywnych i właściciel na tej podstawie odłożył naprawę
jako „kilka dni". Ale te 290 to **cała aplikacja**; dla rozjazdu liczy się
wyłącznie to, co serwer renderuje na `/startpad` — a tego było **~20 ciągów
w trzech miejscach**. Zmierzone `curl`em po SSR, nie oszacowane.

**Naprawa** (`2bce4a5`, 3 pliki):

- `StartpadFooter` **miał już właściwy wzorzec** — stan `net` startujący od
  sieci domyślnej i podmieniany w `useEffect` po montażu, z komentarzem
  tłumaczącym dokładnie tę hydrację. Tyle że obok niego sięgał po
  `NATIVE_SYMBOL`, `CURVE_TARGET_ETH` i `R_VIRT_NATIVE` prosto z modułu, a te
  są policzone **przy imporcie** — więc na kliencie były już arcowe. Teraz cały
  podpis jedzie z jednego źródła.
- Dwie etykiety sieci (`NetworkSwitch` w `LaunchpadBoard`, nazwa łańcucha
  w `LaunchpadTokenDetail`) dostały `suppressHydrationWarning` — dokładnie ten
  mechanizm, który komentarz przy `NET` już opisuje jako wybrany, a którego
  w tych dwóch miejscach brakowało.

**Wynik:** 349 komunikatów w konsoli, **zero o hydracji**. Strona pokazuje
`runs on Arc`, próg 5 000 USDC, `real USDC`. SSR zostaje bazowy i **to jest
poprawne** — serwer nie zna wyboru użytkownika, a crawler ma widzieć sieć
domyślną. Refaktor rdzenia okazał się niepotrzebny.

### 6.2 Sprzedaż na Arc daje nieograniczoną zgodę routerowi o nieznanej proweniencji

**To jest najpoważniejsza rzecz w tym dokumencie i wymaga świadomej decyzji
właściciela przed ogłoszeniem Arc użytkownikom.**

Ścieżka sprzedaży w `PoolTradeBox` robi dwa zatwierdzenia:

1. `token.approve(Permit2, maxUint256)` — nieograniczone,
2. `Permit2.approve(token, router, max, 30 dni)`.

Na Base `router` to kanoniczny, audytowany UniversalRouter Uniswapa — ten sam,
przez który idą swapy z app.uniswap.org. **Na Arc to kontrakt
`0x4fca4a51…`, który znaleźliśmy sami, przeszukując zdarzenia PoolManagera.**
Nie ma go w dokumentacji Uniswapa ani Arc, ma **inny build** niż wersja z Base
(24 546 B vs 19 499 B), a jego operator to `0x33F26c5d…51E8` — nie Uniswap.

Konsekwencja: użytkownik sprzedający token na Arc daje temu kontraktowi prawo
pobrania swoich tokenów przez 30 dni. Kupno jest bezpieczniejsze (idzie
`msg.value`, bez zgód), ale sprzedaż nie.

Nasz test dowodzi, że router **działa poprawnie dziś** — nie dowodzi, że jest
bezpieczny jutro ani kto go kontroluje. Opcje:

| opcja | koszt | skutek |
|---|---|---|
| zostawić jak jest | zero | użytkownik nieświadomie ufa obcemu kontraktowi |
| dopisać ostrzeżenie w UI przy pierwszej sprzedaży | mały | uczciwie, ale straszy |
| zgoda na dokładną kwotę zamiast `maxUint256` | mały | ogranicza szkodę do jednej transakcji |
| własny minimalny router v4 | średni | pełna kontrola, nowa powierzchnia audytu |

Rekomendacja: **zgoda na dokładną kwotę** — najtańsza zmiana, która realnie
ogranicza szkodę, bez straszenia copy i bez pisania nowego kontraktu.

> **WDROŻONE** (commit `3ea1216`). `V4_BY_CHAIN` ma teraz pole `routerTrusted`:
> na Base zostaje zgoda bez limitu na 30 dni (router kanoniczny, nie ma powodu
> męczyć użytkownika), na Arc idzie zgoda na dokładną kwotę jednej sprzedaży.
> Cena: jedno dodatkowe zatwierdzenie na sprzedaż na Arc.
> `test/ArcForkMainnet.test.ts` sprawdza, że zgoda ma dokładną kwotę (nie
> `uint160` max) i że po sprzedaży zostaje zero.
>
> To **ogranicza** szkodę, nie usuwa ryzyka: przez czas jednej transakcji router
> nadal może pobrać sprzedawaną kwotę. Pytanie, kto kontroluje `0x33F26c5d…51E8`,
> pozostaje otwarte.

### 6.3 `FEE_RECIPIENT` to gorący portfel, nie Safe

Wdrożony pad ma `FEE_RECIPIENT` = `0xD4885A5a…`, czyli EOA wdrażającego.
Na Base w tym miejscu stoi Safe `0x83E2DE97…`. Opłaty protokołu na Arc będą
więc lądować na kluczu, którym podpisuje się wdrożenia. **Settera nie ma** —
zmiana wymaga nowego wdrożenia pada.

### 6.4 Historia tokena na Arc — ROZWIĄZANE

**Objaw.** Strona tokena ARPE pokazywała „No trades yet" przy jedenastu
transakcjach na łańcuchu, z przypisem o uciętej historii. `/api/launchpad/history`
oddawał `tradeCount: 0, highBlock: 0, complete: true` — **ciszę podaną jako
komplet**: każde okno padało, `scannedFrom` zostawał nad głową, a `complete`
i tak się ustawiał.

**Przyczyna.** Rozmiar okna i tempo to **dwa różne limity**, a mieliśmy tylko
pierwszy. Okno 9 500 bloków przechodzi bez problemu (oddaje 27 logów). Ale skan
robi **dwa** `getLogs` na okno, a trasa historii szła z `concurrency: 6` — czyli
12 zapytań w locie. Zmierzone na `rpc.mainnet.arc.io`: przy 12 w locie 9–10
błędów `-32005 rate limit exceeded`; przy odstępie 250 ms jeden na osiem, przy
1200 ms zero. Arc znosi mniej więcej **jedno `getLogs` na 1,2 s**.

Same ponowienia tego nie ratują — odpalają się dla wszystkich okien partii
równocześnie i każda runda bije w ten sam sufit. Sprawdzone empirycznie:
z samym backoffem strona przeszła z „No trades yet" na „Trades (1)" i dalej
meldowała uciętą historię.

**Naprawione** (`047f96d`): `scanConcurrency` i `scanPaceMs` w konfiguracji
sieci, obok `scanWindow` — bo to własność RPC tej sieci dokładnie tak samo.
Base i Robinhood: 6 okien bez przerwy. Arc: jedno okno co 1200 ms. Czyta to
i przeglądarka, i serwer. Druga warstwa: ponowienia z narastającą przerwą
(3 próby, 400/800/1600 ms) zamiast jednej po 400 ms.

**Wynik na żywym Arc:** `tradeCount` 11 zamiast 0, `launchBlock` 21 113 706
znaleziony, `complete` naprawdę, salda sumują się do pełnej podaży (998,14M
krzywa + 0,83M + 1,03M). Strona: `Trades (11)`, `Holders (3)`, bez przypisu.

> **Przy okazji rozwiązała się zagadka „brakujących 300 tys. tokenów".** To nie
> był dryf rekonstrukcji — to byli **realni holderzy**, których skan nie
> dosięgał. Gdy skan dociera, salda się zgadzają. Domknięcie `balanceOf`
> (`197f376`) zostaje jako druga warstwa, chroniąca przed dryfem tam, gdzie skan
> jest ucięty, ale przyczyną było tempo, nie arytmetyka.

### 6.5 Czego brakuje w ekosystemie

- Uniswap nie listuje Arc, więc żaden agregator ani portfel nie poprowadzi
  swapa po naszej puli „sam z siebie" — działa tylko nasza ścieżka przez
  znaleziony router.
- `eth_getLogs` na `rpc.mainnet.arc.io` ma limit **2 000 wyników** i zakresu
  **< 10 000 bloków**; brak websocketu. Indexer musi to respektować.
- 429 widoczne w konsoli na `/startpad` **nie pochodzą z Arc** — RPC przyjmuje
  30 zapytań równolegle bez limitu. To telemetria portfeli
  (`cca-lite.coinbase.com`, `pulse.walletconnect.org`) i AdSense, obecna też na Base.

---

### 6.6 Keeper perpsów zależał od laptopa

Do 16.09 keeper (funding, likwidacje, wypychanie Pytha, heartbeat rejestru)
chodził wyłącznie z Harmonogramu zadań Windows na komputerze właściciela.
Stanął dwa razy po cichu: raz przez zepsute cudzysłowy w zadaniu, raz przez
**12 h bez gazu na testnecie** (47 przebiegów „GAZ NISKI"), przez co wszystkie
trzy rynki testnetowe były `halted` — bez wpisu w rejestrze co godzinę
`openPosition` rewertuje `OracleInactive`.

Zrobione 16.09: rdzeń keepera wyniesiony do `lib/keeper/perpsKeeperCore.ts`
(czysty ethers, bez hardhata), `scripts/derivatives/keeper.ts` jest cienkim
wrapperem, a nowa trasa `app/api/keeper/perps` uruchamia ten sam rdzeń z
cronem Vercela (`vercel.json`, co 15 min). Wymaga w Vercelu: `CRON_SECRET`,
`KEEPER_PRIVATE_KEY` (osobny portfel z kilkoma USDC na gaz), `KEEPER_CHAIN_ID`,
opcjonalnie `PYTH_API_KEY`. Plan Hobby Vercela pozwala na jeden bieg dziennie —
wtedy zewnętrzny cron (cron-job.org) z tym samym sekretem. Heartbeat rejestru
wysyła tylko `publisher`/`creator` feedu: nowy klucz keepera trzeba ustawić
jako wystawcę (`PriceOracleRegistry.setPublisher`) albo zostawić klucz
deployera (gorący, patrz 6.3). Skan pozycji idzie od `max(deployBlock,
head − 200 000)`, bo publiczne RPC tną starą historię.

**Zrobione w kodzie (16.09, po południu):** `DerivativeMarket.oracleActive()` —
rynek z feedem (adapter Pytha / Chainlink) jest aktywny, gdy feed jest dodatni
i nie starszy niż `MAX_FEED_AGE` (1 h), niezależnie od heartbeatu rejestru;
rejestr decyduje już tylko o ścięciu wystawcy (`slashed`). Rynek bez feedu
działa jak dotąd. `openPosition` używa `oracleActive()`, `indexPrice()`
odrzuca stary feed i wraca do TWAP-a rejestru. Tablica i przewodnik czytają
`oracleActive` z rynku, a na starych rynkach (brak funkcji) wracają do
`isActive` rejestru. Testy: 4 nowe w `test/DerivativeMarket.test.ts`, 40/40.

**Co NIE jest zrobione:** wdrożone rynki są niezmienne — zmiana działa dopiero
dla rynków utworzonych przez nową fabrykę. Potrzebne ponowne wdrożenie modułu
perpsów na testnecie (skrypty w `scripts/derivatives`, sesja „Arc mainnet CCTP
bridge") i odtworzenie BTC-USD / TSLA-USD z adapterami. Do tego czasu keeper
(6.5, trasa `/api/keeper/perps`) nadal jest potrzebny do heartbeatu; po
wdrożeniu zostaje mu funding, likwidacje i wypychanie Pytha.

## 7. Co dalej

1. Rozstrzygnąć 6.1 — to jedyna rzecz, którą widzi użytkownik.
2. Rozstrzygnąć 6.3 — decyzja o odbiorcy opłat (EOA czy Safe), ewentualnie ponowne wdrożenie. 6.2 jest zamknięte po stronie kodu (3ea1216); otwarte zostaje tylko pytanie o operatora routera.
3. Pierwsza prawdziwa graduacja na mainnecie (nie na forku) — jedyny sposób
   sprawdzenia arcowej semantyki natywnego USDC.
4. Indexer dla 5042 w granicach limitów z 6.4.
5. Ustawić env keepera w Vercelu (6.5) i wyłączyć zadanie w Harmonogramie,
   gdy cron przejdzie pierwszy bieg.
6. Nie ogłaszać mainnetu, dopóki 1–3 nie są zamknięte.

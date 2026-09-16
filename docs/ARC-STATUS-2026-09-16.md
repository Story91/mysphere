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

### 6.1 Rozjazd hydracji: użytkownik Arc widzi najpierw liczby z Base

**Objaw.** Przy każdym wejściu na `/startpad` z zapisaną siecią Arc serwer
wysyła HTML z danymi Base, a klient podmienia go na Arc. React zgłasza
`Text content did not match. Server: "Base B20" Client: "Arc"`, wyrzuca
serwerowy DOM i renderuje od nowa.

**Dowód** (`curl` na SSR przy wybranym Arc):

```
3 ETH raised
Trades here move real ETH
runs on Base B20
```

Klient pokazuje potem `5 000 USDC` i `runs on Arc`. Czyli przez moment widać
**cudze liczby o pieniądzach** — dokładnie to, przed czym ostrzega komentarz
przy `NATIVE_SYMBOL` w `config.ts`.

**Przyczyna.** `ACTIVE_LAUNCHPAD_NETWORK` liczy się w `resolveActiveNetwork()`
na poziomie modułu. Na serwerze `window` nie istnieje, więc zwraca
`DEFAULT_LAUNCHPAD_CHAIN_ID` (Base); na kliencie czyta `localStorage` i zwraca
Arc. Zmiana sieci robi pełne przeładowanie (świadoma decyzja, opisana w kodzie),
więc rozjazd wraca przy każdym wejściu.

**Dlaczego nie naprawione w tej sesji.** Stałe modułu konsumuje ponad 200 miejsc
w 20 plikach. Przekazanie `chainId` z serwera w dół to refaktor rdzenia, przed
którym ostrzega sam komentarz w `config.ts` („stałe modułu są wpięte w dziesiątki
callbacków"). Do decyzji właściciela, bo każda opcja ma cenę:

| opcja | koszt | skutek uboczny |
|---|---|---|
| `dynamic(..., { ssr: false })` na boardzie | **dzień roboty, 1–2 pliki** | znika SSR całego startpadu razem z tekstem „HOW STARTPAD WORKS" — to jest treść SEO |
| chainId w ciasteczku + prop z Server Component | **refaktor rdzenia** | poprawne SSR per-użytkownik, SEO zostaje, linki bez zmian |
| chainId zawsze w URL (`?chain=5042`) | średni | brzydsze linki, ale SSR działa |

**Uwaga do opcji z ciasteczkiem, bo zmienia jej wycenę.** Blokadą nie jest to,
że serwer nie zna wyboru — samo dopisanie ciasteczka nic nie da. `cookies()`
nie da się zawołać na poziomie modułu, a moduł komponentu klienckiego ewaluuje
się na serwerze **raz na proces, nie raz na żądanie**. Żeby ciasteczko
zadziałało, Server Component musi przekazać `chainId` w dół — a stałe modułu
konsumuje ponad 200 miejsc w 20 plikach. To jest prawdziwy koszt tej opcji.

Rekomendacja obu sesji pracujących nad Arc: **ciasteczko**, mimo kosztu —
bo jako jedyna opcja nie oddaje SEO i nie psuje linków. Ale to decyzja
właściciela: „dzień roboty i utrata SEO startpadu" kontra „refaktor rdzenia
i SEO zostaje".

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

### 6.4 Czego brakuje w ekosystemie

- Uniswap nie listuje Arc, więc żaden agregator ani portfel nie poprowadzi
  swapa po naszej puli „sam z siebie" — działa tylko nasza ścieżka przez
  znaleziony router.
- `eth_getLogs` na `rpc.mainnet.arc.io` ma limit **2 000 wyników** i zakresu
  **< 10 000 bloków**; brak websocketu. Indexer musi to respektować.
- 429 widoczne w konsoli na `/startpad` **nie pochodzą z Arc** — RPC przyjmuje
  30 zapytań równolegle bez limitu. To telemetria portfeli
  (`cca-lite.coinbase.com`, `pulse.walletconnect.org`) i AdSense, obecna też na Base.

---

### 6.5 Keeper perpsów zależał od laptopa

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

Co NIE jest zrobione: sam heartbeat jest wymogiem kontraktu. Rynki z indeksem z
adaptera Pytha mogłyby nie wymagać wpisu w rejestrze (`openPosition` sprawdza
`ORACLE.isActive` niezależnie od feedu) — to zmiana w `DerivativeMarket`,
czyli nowe wdrożenie rynków; do rozważenia przed mainnetem perpsów.

## 7. Co dalej

1. Rozstrzygnąć 6.1 — to jedyna rzecz, którą widzi użytkownik.
2. Rozstrzygnąć 6.3 — decyzja o odbiorcy opłat (EOA czy Safe), ewentualnie ponowne wdrożenie. 6.2 jest zamknięte po stronie kodu (3ea1216); otwarte zostaje tylko pytanie o operatora routera.
3. Pierwsza prawdziwa graduacja na mainnecie (nie na forku) — jedyny sposób
   sprawdzenia arcowej semantyki natywnego USDC.
4. Indexer dla 5042 w granicach limitów z 6.4.
5. Ustawić env keepera w Vercelu (6.5) i wyłączyć zadanie w Harmonogramie,
   gdy cron przejdzie pierwszy bieg.
6. Nie ogłaszać mainnetu, dopóki 1–3 nie są zamknięte.

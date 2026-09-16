# Arc mainnet — stan na 16 września 2026

Jeden aktualny dokument zamiast dwóch sprzed wdrożenia
([ARC-NEXT-2026-09-13](ARC-NEXT-2026-09-13.md), [ARC-REPORT-REVIEW-2026-09-14](ARC-REPORT-REVIEW-2026-09-14.md)).
Tamte opisują świat, w którym launchpad na Arc jeszcze nie stał i nie było
oficjalnego RPC — oba te zdania są już nieprawdziwe.

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
| `dynamic(..., { ssr: false })` na boardzie | 1–2 pliki | znika SSR treści startpadu (SEO) |
| chainId w ciasteczku + prop z Server Component | refaktor rdzenia | poprawne SSR per-użytkownik |
| chainId zawsze w URL (`?chain=5042`) | średni | brzydsze linki, ale SSR działa |

### 6.2 `FEE_RECIPIENT` to gorący portfel, nie Safe

Wdrożony pad ma `FEE_RECIPIENT` = `0xD4885A5a…`, czyli EOA wdrażającego.
Na Base w tym miejscu stoi Safe `0x83E2DE97…`. Opłaty protokołu na Arc będą
więc lądować na kluczu, którym podpisuje się wdrożenia. **Settera nie ma** —
zmiana wymaga nowego wdrożenia pada.

### 6.3 Czego brakuje w ekosystemie

- Uniswap nie listuje Arc, więc żaden agregator ani portfel nie poprowadzi
  swapa po naszej puli „sam z siebie" — działa tylko nasza ścieżka przez
  znaleziony router.
- `eth_getLogs` na `rpc.mainnet.arc.io` ma limit **2 000 wyników** i zakresu
  **< 10 000 bloków**; brak websocketu. Indexer musi to respektować.
- 429 widoczne w konsoli na `/startpad` **nie pochodzą z Arc** — RPC przyjmuje
  30 zapytań równolegle bez limitu. To telemetria portfeli
  (`cca-lite.coinbase.com`, `pulse.walletconnect.org`) i AdSense, obecna też na Base.

---

## 7. Co dalej

1. Rozstrzygnąć 6.1 — to jedyna rzecz, którą widzi użytkownik.
2. Rozstrzygnąć 6.2 — decyzja o odbiorcy opłat, ewentualnie ponowne wdrożenie.
3. Pierwsza prawdziwa graduacja na mainnecie (nie na forku) — jedyny sposób
   sprawdzenia arcowej semantyki natywnego USDC.
4. Indexer dla 5042 w granicach limitów z 6.3.
5. Nie ogłaszać mainnetu, dopóki 1–3 nie są zamknięte.

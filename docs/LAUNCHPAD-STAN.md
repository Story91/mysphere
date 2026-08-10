# Launchpad - stan na 2026-08-10 (wieczor, wdrozenie 70/30)

Krotki obraz calosci. Szczegoly i uzasadnienia decyzji sa w
`HANDOFF-LAUNCHPAD-V2-2026-08-10.md`. Dokument dla uzytkownikow:
`LAUNCHPAD-DOSSIER.md` (AKTUALIZOWAC przy kazdej zmianie launchpada).

## Adresy - Base Sepolia (chainId 84532), wdrozenie 2026-08-10 14:42 UTC

| kontrakt | adres |
| --- | --- |
| `CurveLaunchpad` | `0x811d6dE17E2D021A564Bc699e353ead7FE7258ba` |
| `LiquidityVault` | `0x21F2c3506170cb670102B6fB5be6b6dbDb73b88b` |
| `B20LaunchHook` | `0xfaEF39f75aACC1271D7173748245A69CBD09e044` |
| `B20TokenFactory` | `0x8Fa00F989b59a3F279e5DCD75450d21A21733442` |
| PoolManager v4 (Uniswap) | `0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408` |
| blok wdrozenia | `45302335` |
| `FEE_RECIPIENT` | `0xD4885A5aa53446843CABcDE1F35DE9b4E906030e` |
| salt hooka | `0x...1848` (bity `0x2044` potwierdzone przy wdrozeniu) |

Wdrozenia POPRZEDNIE sa MARTWE i nie wolno ich uzywac:
- `0xA760...4F97` - stare ABI, bez `launchAdvanced`;
- `0x0712...0844` (rano 2026-08-10) - stary model oplat: 60/40, buyback
  scinany z CALEJ oplaty puli przed podzialem, 5-polowy `HookFeeSettled`.

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
3. **`FEE_RECIPIENT` na mainnet: ZDECYDOWANE 2026-08-10** -
   `0x83C68Dbf0E79f934FcCCd3Ca015103A768C21E83` (osobny portfel przychodow).
   Adres jest `immutable`, wiec wchodzi w zycie DOPIERO przy wdrozeniu
   mainnetowym: `FEE_RECIPIENT=0x83C6... npm run launchpad:deploy:base`.
   Sepolia zostaje na adresie deployera - testnetowe oplaty nie maja wartosci,
   a kolejny redeploy uniewaznilby swieze adresy w env/docs/UI.
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

## Zmienne na Vercelu

```text
NEXT_PUBLIC_LAUNCHPAD_SEPOLIA_ADDRESS        0x811d6dE17E2D021A564Bc699e353ead7FE7258ba
NEXT_PUBLIC_LIQUIDITY_VAULT_SEPOLIA_ADDRESS  0x21F2c3506170cb670102B6fB5be6b6dbDb73b88b
NEXT_PUBLIC_LAUNCH_HOOK_SEPOLIA_ADDRESS      0xfaEF39f75aACC1271D7173748245A69CBD09e044
NEXT_PUBLIC_LAUNCHPAD_DEPLOY_BLOCK           45302335
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

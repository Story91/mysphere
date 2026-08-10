# Handoff: Launchpad v2, 2026-08-10

Ten plik opisuje stan po pracy wykonanej w jednym czacie. Przeczytaj go przed
dalszymi zmianami w launchpadzie.

## Co zostalo zrobione

1. Uruchomiono fork Base z `https://mainnet.base.org` i prawdziwym
   PoolManagerem v4 pod `0x498581fF718922c3f8e6A244956aF099B2652b2b`.
2. Potwierdzono pelna lokalna sciezke PlainTokenFactory:
   `launch -> buy -> Locked -> graduate -> initialize/modifyLiquidity`.
3. Na prawdziwym v4 potwierdzono rozliczenie dodatniej delty hooka dla
   exactInput i exactOutput przez `take` oraz `settle`.
4. Potwierdzono `POOLS_SLOT=6`, seed nadmiarowego tokena na `0xdEaD`, brak
   `SEIZE_ROLE()` w wariancie B20 ASSET oraz dzialanie `abi.encode(struct)`.
5. Na prawdziwym B20 zmierzono:
   - `B20TokenFactory.createToken` z postwarunkami: `249290 gas`;
   - sonda create + transfer na DEAD: `242215 gas`;
   - pelny `CurveLaunchpad.launch` z B20: `322676 gas`.
6. Dodano sondy forkowe, skrypt uruchomieniowy i wynik JSON.

## Weryfikacja

Kompilacja:

```text
npm run contracts:compile
```

Wynik: czysto, bez ostrzezen.

Fork Base:

```text
npm run launchpad:fork:base
```

Ostatni przebieg: wszystkie kontrole `ok`, fork block `49765722`.

Testy launchpada:

```text
npm run contracts:test -- test/CurveLaunchpad.test.ts test/B20LaunchHook.test.ts test/PlainTokenFactory.test.ts
```

Wynik: `59 passing`.

Pelny wynik ostatniego forka jest w:

```text
scripts/output/launchpad-base-fork-probe.json
```

## Najwazniejsze pliki dodane lub zmienione w tej sesji

- `contracts/mocks/LaunchpadForkProbes.sol`
  - `RealPoolSwapProbe` rozlicza prawdziwe delty `PoolManager.swap`;
  - `B20PrecompileProbe` testuje live B20 przez remote `eth_call` ze state
    override;
  - `FullB20LaunchGasProbe` wdraza init code w pamieci i mierzy sam launch.
- `scripts/launchpad/forkBaseProbe.ts`
  - resetuje lokalny Hardhat do forka Base;
  - sprawdza PoolManager, hook, launch/buy/graduate/swap;
  - wykonuje live B20 checks oraz zapisuje JSON.
- `package.json`
  - dodany skrypt `launchpad:fork:base`.
- `docs/B20-LAUNCHPAD-V2-KRZYWA-Z-HOOKIEM.md`
  - sekcja 8 zostala zaktualizowana: punkty wczesniej niepotwierdzone sa
    zamkniete wynikami forka Base i live B20.

## Istotna pulapka techniczna

W `FullB20LaunchGasProbe` kod kontraktu jest dostarczany przez state override
do pustego konta. Dla tego konta pierwsze `CREATE` ma nonce `0`, a drugie
nonce `1`. Dlatego predykcja adresow w `forkBaseProbe.ts` uzywa nonce `0/1`.
Nie zmieniac tego na `1/2` bez ponownego sprawdzenia zachowania RPC.

## Pelna sciezka testnetowa

Pelna sciezka na Base Sepolia pozostaje do wykonania po zasileniu deployera:

```text
start -> kupno -> prog -> graduacja -> pula z hookiem -> settle -> claim
```

Do tego potrzebne beda testnetowy deployer, `FEE_RECIPIENT`, RPC i srodki na
gaz. Kontrakty sa juz wdrozone, ale nie wykonano jeszcze pelnej operacji z
kluczem deployera.

## Preflight Base Sepolia

Wykonano odczytowy preflight 2026-08-10. Siec odpowiada jako chainId `84532`,
PoolManager `0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408` ma `24009 B` kodu,
a deployer `0xD4885A5aa53446843CABcDE1F35DE9b4E906030e` ma
`0.000789816142070404 ETH`. `FEE_RECIPIENT` nie jest ustawiony w env.

Adres wskazany przez uzytkownika jako `FEE_RECIPIENT`:
`0xD4885A5aa53446843CABcDE1F35DE9b4E906030e`.

Uruchomienie `npm run launchpad:deploy:sepolia` bez `CONFIRM=tak` zatrzymalo
sie przed wyslaniem transakcji, zgodnie z blokada skryptu. Przed deploymentem
trzeba jawnie ustalic `FEE_RECIPIENT` i potwierdzic nieodwracalne wdrozenie.

## Base Sepolia deployment

Po potwierdzeniu `CONFIRM=tak` wdrozenie zostalo wykonane. Adresy i odczyty sa
w `scripts/output/launchpad-base-sepolia.json`:

- `B20TokenFactory`: `0x40020b0322F69606cB3Ce53cD99f62bB43c0d578`;
- `CurveLaunchpad`: `0xA760fBB82dd3018dFf3f34ACF1BA133725164F97`;
- `LiquidityVault`: `0x50BbeB61BdB286d55371abE8cA3fE413eE1831F2`;
- `B20LaunchHook`: `0x127ecd2c013EadFbcF8f03a258b8616B5d716044`.

Kod i bindingi zostaly odczytowo potwierdzone. Pierwsze wykonanie skryptu
trafilo na wyscig propagacji RPC przy odczycie `VAULT()` po mine; skrypt ma
teraz retry dla kodu launchpada oraz `VAULT()`/`HOOK()`.

Pelna sciezka nie zostala jeszcze wykonana: po deploymencie saldo deployera
wynosilo `0.000751413911767939 ETH`, a zakup domykajacy krzywa wymaga okolo
`3 ETH` plus gazu.

Dodano `scripts/launchpad/sepoliaFlow.ts` i npm script
`launchpad:flow:sepolia`. Flow wymaga `LAUNCHPAD` oraz `FLOW_CONFIRM=tak`,
czeka na koniec okna startowego, wykonuje kupno, graduacje, swap przez
`RealPoolSwapProbe`, `hook.settle`, `launchpad.claim` i claimy hooka. Preflight
flow zatrzymuje sie przed transakcja, dopoki saldo nie wynosi co najmniej
`5.02 ETH` przy domyslnym zakupie `5 ETH`.

Kolejny etap po doladowaniu deployera to wykonanie flow i sprawdzenie claimow
na realnych adresach. Port na Robinhood Chain przez `PlainTokenFactory` moze
byc osobnym etapem.

## Frontend Launchpad / styl rynku MySphere

Frontend zostal dodany pod `/launchpad` w kierunku jasnego dashboardu rynku
pokazanego przez uzytkownika, ale z brandingiem i akcentami MySphere zamiast
kopiowania nazwy z referencji. Ekran ma:

- pasek aktywnosci launchow;
- toolbar z wyszukiwaniem, Launch, Connect wallet i oznaczeniem MySphere Launchpad;
- karty rezerwy krzywej, wolumenu, top launchow i top volume;
- filtry All / On curve / Graduated oraz szeroka tabele launchow;
- modal launchu i modal trade. Launch i buy sa podlaczone do wdrozonego
  `CurveLaunchpad` na Base Sepolia; wiersze bez adresu sa jawnie oznaczone jako
  preview.

Pliki:

- `app/launchpad/LaunchpadBoard.tsx` - ekran i interakcje onchain;
- `app/launchpad/config.ts` - ABI, adres launchpada i preview rows;
- `app/launchpad/page.tsx` - trasa `/launchpad`;
- `app/launchpad/[address]/LaunchpadTokenDetail.tsx` - widok szczegolow tokena;
- `app/launchpad/[address]/page.tsx` - trasa `/launchpad/[address]`;
- `app/providers.tsx` - Base Sepolia i transport RPC w wagmi;
- `app/components/NetworkSwitcher/NetworkSwitcher.tsx` - Base Sepolia na liscie;
- `app/components/Navigation/Navigation.tsx` - link Launchpad w glownym menu.

Dalsze funkcje dodane po pierwszej wersji:

- `sell()` z automatycznym ERC20 `approve`, quote i slippage;
- `graduate()` z odczytem nagrody z `gradFeeOf()`;
- `settle()` hooka, `harvest()` vaulta oraz claimy launchpada, hooka i vaulta;
- eventowa tasma aktywnosci z `Launched`, `Bought` i `Sold`;
- `/launchpad/[address]` z cena, rezerwami, wykresem, pozycja poola i historia;
- `scripts/launchpad/keeper.ts` oraz `npm run launchpad:keeper:sepolia`.

Keeper domyslnie jest dry-runem. Wykonanie transakcji wymaga jawnego
`KEEPER_CONFIRM=tak`. Skanowanie eventow jest w oknach 1900 blokow, bo publiczny
RPC Base Sepolia odrzuca szersze `eth_getLogs`. Dashboard rekonstruuje rezerwe,
wolumen, trade count, holder count i tasme zdarzen z `Launched`, `Bought` oraz
`Sold`; nie uzywa juz sztucznego mnoznika wolumenu z makiety.

Nawigacja desktopowa i dolny pasek tabletowy chowaja sie do cienkiego uchwytu
i wysuwaja po hover/focus. Na telefonie pozostaja stale dostepne. Launchpad ma
tylko jeden przycisk portfela - ten z globalnej nawigacji.

## Walidacja na koniec sesji

- `npm run contracts:compile` - przechodzi;
- testy `CurveLaunchpad`, `B20LaunchHook` i `PlainTokenFactory` - `59 passing`;
- `npx tsc --noEmit --pretty false` - przechodzi;
- `npm run launchpad:keeper:sepolia` - dry-run przechodzi i nie ma jeszcze tokenow do obslugi;
- `GET /launchpad` oraz `GET /launchpad/[address]` - HTTP 200 na porcie `3010`;
- Browser QA: jedna kontrolka `Connect wallet`, hover nav dziala, ticker nie pokazuje bledu RPC, a dashboard ma live/preview state;
- `CurveLaunchpadInvariants.test.ts` nie zmiescil sie w limicie 6 minut i zostal przerwany; nie nalezy traktowac go jako zaliczonego;
- `npm run build` skompilowal kod z ostrzezeniem zaleznosci `viem/ox`, ale zawisl na webpack workerze repo po fazie kompilacji. Dev route pozostaje dostepny.

## Uwaga o worktree

## Handoff po rozszerzeniu creator flow

Uzytkownik chce creator flow inspirowany Flaunch: Base/Robinhood, obrazek,
name, ticker, opis, fee receivers, earnings z wolumenu, pre-buy, auto-buyback,
LP po graduacji i sniper protection. Nie uzywac nazwy PONS; branding to
`MySphere Launchpad`.

W kontraktach dodano kompatybilna wstecznie funkcje `launchAdvanced`:

- per-token `feeBps` i `creatorFeeBps`;
- do 8 odbiorcow z udzialami sumujacymi sie do 10000 bps;
- `metadataURI` oraz event `LaunchMetadataSet`;
- `buybackBps` oraz `windowCap` per token;
- `seedWithConfig` w vault, ktory zapisuje konfiguracje buybacku w hooku;
- hook odkłada `pendingBuybackEth`, a `executeBuyback` wykonuje rzeczywisty
  swap ETH -> token przez PoolManager, omija oplata od wlasnego swapa i pali
  kupione tokeny na `0x...dEaD`;
- obecny fixed launch nadal dziala bez zmian i uzywa domyslnych ustawien.

Ograniczenie: `MAX_FEE_BPS` pozostaje 200 (2%) do czasu osobnego audytu.
NIEAKTUALNE od sesji trzeciej - dzis `MAX_FEE_BPS = 100` (1%), a doszla
podloga protokolu `MAX_CREATOR_SHARE_BPS = 6000`. Patrz sekcja "Model oplat".
Obecne wdrozenie Base Sepolia pod `0xA760...4F97` jest starym ABI i nie ma
`launchAdvanced`; po doladowaniu deployera trzeba wdrozyc nowa wersje i
podmienic adresy/ABI frontu. Pre-buy w starej wersji dziala jako `msg.value`
przy `launch`. LP jest obecnie automatyczne full-range po graduacji, a hook i
vault dziela oplaty 60/40 globalnie; custom LP receiver/share nie jest jeszcze
per-token.

Testy po zmianie:

- `npm run contracts:compile` przechodzi;
- pelny `CurveLaunchpad.test.ts`: `37 passing` po podniesieniu timeoutu Mocha do
  120 s dla kosztownego deployu;
- test `launchAdvanced` przechodzi osobno;
- nowy test `auto buyback ...` w `test/B20LaunchHook.test.ts` zostal dopisany,
  ale nie zostal jeszcze uruchomiony po ostatniej edycji;
- `CurveLaunchpadInvariants.test.ts` poprzednio przekroczyl 6 minut i nie jest
  zaliczony;
- `npm run build` zawieszal webpack worker po kompilacji i uszkodzil cache
  `.next`; poprzedni dev server na porcie 3010 zostal zatrzymany, a restart
  wymaga wyczyszczenia generated `.next` albo ustawienia
  `experimental.webpackBuildWorker: false` w `next.config.js`.

Front:

- `/launchpad` ma dashboard MySphere, globalny jeden Connect wallet, hover nav,
  ticker eventow, buy/sell/graduate/settle/harvest/claim i detail route;
- ostatni UI nadal ma prosty modal launchu; trzeba go teraz rozszerzyc o
  `launchAdvanced`, pola metadata, odbiorcow, fee/buyback/sliper cap, pre-buy
  i earnings estimator. Nie pokazywac opcji jako aktywnej onchain przed nowym
  deploymentem.

Web research do modelu Flaunch: creator fee split moze byc 0-100%, reszta idzie
na buyback/PBW; fee receivers moga byc mnogie; fair launch ma fixed price,
prebuy, fair-launch supply, start market cap, scheduling, per-wallet cap i
sniper protection. Zrodla: `https://docs.flaunch.gg/for-creators/getting-started/flaunch-a-coin`,
`https://docs.flaunch.gg/for-creators/core-features/creator-revenue`,
`https://docs.flaunch.gg/for-creators/core-features/auto-buybacks`.

Worktree byl juz zmieniony przed ta sesja. Nie wykonywano `git reset`, revertu
ani commita; istniejace zmiany pozostaly na miejscu i nalezy je zachowac.

## Sesja domykajaca, 2026-08-10 (druga tura)

Zamkniete punkty, ktore poprzedni handoff zostawil otwarte.

### 1. Test auto-buybacku jest zielony

Test `auto buyback ...` w `test/B20LaunchHook.test.ts` mial dwa realne bledy i
NIE bylby zaliczony w formie, w jakiej zostal zapisany:

- uzywal stalej `DEAD`, ktorej w pliku nie bylo (`ReferenceError`);
- mintowal tokeny STAREGO tokena, a wymiane robil na puli NOWEGO, wiec sonda
  nie miala czym zaplacic i transakcja odpadala na `balance`.

Po poprawce: `test/B20LaunchHook.test.ts` - `13 passing`.

### 2. Test inwariantow przechodzi

`npm run contracts:test -- test/CurveLaunchpadInvariants.test.ts` konczy sie
`58 passing (5m)`. Poprzedni handoff opisywal go jako przekraczajacy 6 minut i
niezaliczony - to juz nieaktualne. Nadal trwa 5 minut, wiec nie nadaje sie do
petli szybkiego sprzezenia zwrotnego, ale jest zielony.

### 3. Formularz tworzenia tokena jest podpiety do `launchAdvanced`

`app/launchpad/LaunchpadBoard.tsx` ma teraz pelny creator flow:

- nazwa, symbol, obrazek, opis i pre-buy w czesci podstawowej;
- sekcja `Creator setup`: oplata handlowa, udzial tworcy w tej oplacie,
  auto-buyback, per-wallet cap, wlasne `Metadata URI` i do 8 odbiorcow oplat;
- estymator zarobkow: noga krzywej liczona dokladnie ze wzoru `_accrueFee`,
  noga puli z odczytanych `HOOK_FEE_BPS` i `PROTOCOL_SHARE_BPS`;
- podglad pre-buya: ile tokenow i jaki procent podazy da wpisane ETH.

Metadane: gdy tworca nie poda wlasnego URI, a wpisze opis lub obrazek,
interfejs sklada z tego `data:application/json;base64,...`. Zaden backend nie
jest do tego potrzebny.

### 4. Rozszerzony start jest WYKRYWANY, a nie zakladany

To jest najwazniejsza czesc tej zmiany. Wdrozenie pod
`0xA760fBB82dd3018dFf3f34ACF1BA133725164F97` ma stare ABI. Interfejs odczytuje
`MAX_BUYBACK_BPS` - stala, ktora pojawila sie razem z `launchAdvanced`:

- odczyt przechodzi -> pola zaawansowane sa aktywne, a start idzie przez
  `launchAdvanced`;
- odczyt odpada -> pola sa wyszarzone z jawnym komunikatem, a start idzie przez
  stary `launch` z domyslna oplata i domyslnym capem.

Dzieki temu ta sama wersja frontu dziala przed i po jutrzejszym wdrozeniu i w
zadnym momencie nie obiecuje konfiguracji, ktorej lancuch odrzuci. Limity
(`MAX_FEE_BPS`, `MAX_FEE_RECIPIENTS`, `WINDOW_ADDR_CAP`) tez sa czytane z
lancucha, a nie wpisane w kod.

Pre-buy dziala w OBU wersjach, bo `launch` jest `payable` od poczatku. Uwaga:
kupno wymaga `minTokensOut != 0` (`SlippageRequired`), wiec przy pre-buy front
wysyla `1`. Jest to bezpieczne wylacznie dlatego, ze start i pre-buy sa jedna
transakcja - miedzy powstaniem krzywej a tym kupnem nikt nie wejdzie.

### 5. Keeper raportuje i - warunkowo - wykonuje buyback

`scripts/launchpad/keeper.ts` czyta `pendingBuybackEth` oraz `buybackTokens`.
`executeBuyback` wysyla TYLKO wtedy, gdy czlowiek poda
`KEEPER_BUYBACK_MIN_TOKENS` (w calych tokenach). Powod: to jest prawdziwa
wymiana w puli v4, wiec `minTokensOut = 1` byloby zgoda na dowolna cene.
Brak zmiennej = keeper raportuje zalegly buyback i nie rusza go. Odczyty sa w
`try/catch`, wiec stary hook nie wywraca calego przebiegu.

### 6. `npm run build` NIE wymaga wylaczania webpackBuildWorker

Poprzedni handoff zalecal wylaczenie `experimental.webpackBuildWorker`. To bylo
leczenie objawu. Prawdziwa przyczyna zawieszenia jest juz opisana w
`next.config.js`: build i dzialajacy `next dev` niszcza sobie nawzajem `.next`.

Sprawdzone w tej sesji przy WLACZONYM workerze i dzialajacym dev serwerze:

```text
NEXT_DIST_DIR=.next-build npm run build
```

Konczy sie kodem `0` i pelna lista tras. Nie zmieniam wiec konfiguracji -
zmiana byla by regresja wydajnosci builda za problem, ktorego nie ma.

## Sesja trzecia: model oplat, Firebase, dane na zywo

### Model oplat zostal zmieniony i JEST TO ZMIANA NIEODWRACALNA PO DEPLOYU

Research konkurencji (2026-08):

| launchpad | oplata | podzial |
| --- | --- | --- |
| Clanker | 1% | 40% tworca / 60% protokol |
| PONS | 1% | 70% tworca / 30% protokol, 80% czesci protokolu na buyback |
| Flaunch | oplata w calosci do tworcy i buybackow | tworca wybiera swoj udzial |

Wnioski wdrozone w `CurveLaunchpad`:

- `MAX_FEE_BPS = 100` (1%). Rozwazany byl sufit 5% i zostal ODRZUCONY: oplata
  schodzi z kazdego kupna i kazdej sprzedazy, a `feeBps` jest per token i
  ustalany raz przy starcie. Sufit ponad stawke rynkowa wygladalby jak wybor,
  a dzialal jak pulapka na tworce.
- `MAX_CREATOR_SHARE_BPS = 6000` - NOWA STALA. Tworca bierze najwyzej 60%
  oplaty, protokol zawsze co najmniej 40%. Wczesniej `creatorFeeBps` mogl
  rownac sie `feeBps`, czyli tworca mogl wziac calosc, a launchpad nie zarabial
  nic. Warunek stoi TAKZE w konstruktorze, wiec obowiazuje wdrazajacego.
- Domyslny `CREATOR_FEE_BPS` w `scripts/launchpad/deploy.ts` to teraz 60.

Test `oplata ma sufit 1%, a PROTOKOL zawsze zostaje z co najmniej 40% tej
oplaty` sprawdza to NA PIENIADZACH: po kupnie salda tworcy i skarbca stoja
60/40, a ich suma to cala oplata.

### Logo tokenow: dlaczego Firestore, a nie tylko lancuch

ERC-20 NIE MA LOGO. Kontrakt zna `name`, `symbol` i `decimals` - nic wiecej.
Zaden portfel nie czyta naszego `metadataURI` i nie ma skad wiedziec, ze on
istnieje. Logo dociera do portfeli przez token listy i repozytoria assetow.

Dlatego sa trzy warstwy i kazda ma inna role:

1. `metadataURI` w lancuchu - niezmienne, ustawiane RAZ przy starcie;
2. `launchpadTokens` w Firestore - warstwa EDYTOWALNA (logo, opis, linki);
3. `/api/launchpad/tokenlist` - token lista w standardzie Uniswapa, czyli
   jedyna droga, zeby logo zobaczyl ktos poza naszym interfejsem.

Zapis do (2) idzie WYLACZNIE przez serwer: `app/api/launchpad/token/route.ts`
sprawdza sesje SIWE ORAZ `launchOf(token).creator` z lancucha. Regula Firestore
nie potrafi sprawdzic wlasnosciciela, bo aplikacja nie loguje sie do Firebase
Auth (`request.auth` jest zawsze null) - stad bramka serwerowa.

`ipfs://` jest zalecane i tak mowi interfejs: adres jest hashem tresci, wiec
obrazka nie da sie podmienic po starcie. `https://` jest dozwolone, ale moze je
podmienic wlasciciel serwera, ktory nie musi byc tworca tokena.

### Indeksy Firestore - DO WDROZENIA

Dwa nowe wpisy w `firestore.indexes.json` (`launchpadTokens`). Bez nich
`listProfiles` konczy sie `FAILED_PRECONDITION`, a kod lapie wyjatek i oddaje
PUSTA liste - czyli token lista bez tokenow i bez bledu w logu.

```text
firebase deploy --only firestore:indexes
```

### Dane na zywo

`LaunchpadBoard` ma `watchContractEvent` z `poll: true` i interwalem 8 s.
Dokłada pojedyncze zdarzenia do stanu zamiast wolac `loadBoard`, ktory
przemiata cala historie. Rezerwa bierze sie z `ethReserveAfter` PROSTO ZE
ZDARZENIA, a nie z arytmetyki po naszej stronie. `poll: true` jest konieczne -
publiczny RPC nie utrzymuje filtrow.

### UI

Rynek ma teraz dwa uklady: `grid` (domyslny, kafle z logo) i `table` (dawny,
gesty). To jest odejscie od ukladu, ktory ma dzis kazdy launchpad.

### Przeglad kodu i co z niego wynikalo

Przeglad calej galezi znalazl cztery powazne rzeczy. Wszystkie naprawione.

1. **Regula Firestore byla martwa.** `match /launchpadTokens` z
   `allow write: if false` NIC nie blokowalo, bo na koncu pliku stoi
   `allow read, write: if !hasOwnRules(collection)`, a nazwy kolekcji nie bylo
   na liscie `hasOwnRules`. Kazdy anonimowy klient mogl pisac wprost do
   Firestore, omijajac sesje SIWE i sprawdzenie tworcy - czyli wstawic dowolne
   logo pod dowolny token, takze do publicznej token listy. Nazwa dopisana do
   `hasOwnRules`.
2. **XSS przez `metadataURI`.** Strona tokena miala WLASNA kopie parsera
   metadanych, ktora oddawala surowy URI do `href` i `src`. `metadataURI` to
   dowolne dane od tworcy, wiec `javascript:...` dawalo wykonanie skryptu w
   naszym origin. Duplikat usuniety; strona uzywa `parseMetadataUri` z
   `metadata.ts`, ktore przepuszcza wylacznie `https` i `ipfs`.
3. **Auto-buyback dalo sie okrasc kanapka.** `executeBuyback` jest
   bezuprawnieniowe, `minTokensOut` podawal wolajacy, a wymiana szla BEZ
   granicy ceny. Napastnik wolal ja z `minTokensOut = 1` wewnatrz kanapki i
   wyprowadzal cale `pendingBuybackEth`. Teraz granica liczy sie W KONTRAKCIE
   z ceny odczytanej w tej samej transakcji (`MAX_BUYBACK_SLIPPAGE_BPS = 500`
   na pierwiastku ceny, czyli okolo 9.75% na cenie). Wymiana moze byc przez to
   czesciowa, wiec niewydane ETH wraca do `pendingBuybackEth`, a zdarzenie
   `AutoBuyback` niesie kwote WYDANA, nie zamowiona.
4. **Dalo sie zablokowac cudzy start.** `createToken` w obu fabrykach jest
   bezuprawnieniowe, a adres tokena wynikal z (fabryka, salt). `launchId` jest
   w tym samym bloku znany kazdemu, wiec napastnik mogl zajac adres CREATE2
   przed ofiara i wywalic jej `launch()`. `creatorNonce` nie rosnie przy
   rewercie, wiec grief byl powtarzalny. Salt jest teraz mieszany z
   `msg.sender`; doszlo `predictTokenFor(deployer, salt)`.

Drobniejsze naprawione: `windowCap_ == 0` zamurowywalo okno startowe (teraz
odrzucane), `feeReceiverOf` oddawalo `Panic(0x32)` poza zakresem (teraz
`InvalidFeeReceiver`), tasma aktywnosci pokazywala NAJSTARSZE zdarzenia
zamiast najnowszych (`slice(-24)` na tablicy idacej od najnowszych okien),
`buy()` wywalalo sie nieobsluzonym odrzuceniem przy wpisie `1e3`, `buy()` i
`launch()` uzywaly klienta zwiazanego z siecia PORTFELA zamiast przypietego do
sieci launchpada, dwa `.then` bez `.catch`, dolny pasek nawigacji chowal sie w
ZLA strone, a oba paski byly nieosiagalne na tabletach dotykowych (chowanie
tylko przy `@media (hover: hover)`).

### ROZSTRZYGNIETE: blokady tworcy nie ma wcale

Przeglad podniosl, ze `state == Curve && msg.sender == creator` pozwalal tworcy
sprzedac dokladnie na szczycie. Decyzja uzytkownika: "zrobmy to fair dla
wszystkich". Blokada zostala USUNIETA w calosci.

Uzasadnienie, bo to jest zmiana w regule pieniadza:

- byly dwie wersje blokady i obie tworzyly asymetrie w PRZECIWNE strony.
  Najpierw tworca nie mogl wyjsc nigdy (a wiekszosc tokenow nie dochodzi do
  progu, wiec zostawal ze swoja pozycja na zawsze). Potem nie mogl w `Curve`,
  ale byl JEDYNYM, kto mogl w `Locked` - gdy nikt nie mogl juz kupic, a ETH,
  ktore wyprowadzal, bylo juz plynnoscia przyszlej puli;
- zadna z nich nie dotykala tworcy sprzedajacego z drugiego adresu. Sybil jest
  darmowy, wiec regula zatrzymywala wylacznie tworce, ktory uzyl jednego
  adresu - czyli uczciwego;
- rynek: pump.fun i Clanker nie maja zadnej blokady tworcy, Flaunch trzyma go w
  tych samych limitach fair launchu, co wszystkich.

U nas rownosc regul jest mocniejsza niz u nich, bo tworca nie dostaje ani
jednego darmowego tokena: kupuje na tej samej krzywej, placi te sama oplate i
podlega temu samemu limitowi per portfel w oknie startowym.

Usuniete: warunek w `_sell`, blad `CreatorLocked`, punkt 3 naglowka przepisany.
Testy `tworca nie moze sprzedac na krzywej` oraz `I-C10` przepisane na nowa
regule - sprawdzaja teraz, ze tworca NAPRAWDE wychodzi z realnym ETH.

### Audyt funkcji: co ma Flaunch, a czego nie mamy my

Zrodlo: `docs.flaunch.gg` (2026-08-10). Porownanie funkcja po funkcji, zeby
luki byly nazwane, a nie domyslane.

| funkcja | Flaunch | my |
| --- | --- | --- |
| pre-buy tworcy | tak | tak |
| limit per portfel w oknie | tak, ale CAPTCHA i **wstrzymane w API** | tak, `windowCap` egzekwowany W KONTRAKCIE |
| wybor podzialu oplaty | tak, domyslnie 80/20 | tak, tworca do 60%, protokol min. 40% |
| auto-buyback | tak (Progressive Bid Wall) | tak, hook kupuje i PALI na `0x...dEaD` |
| wielu odbiorcow oplat | przez Treasury Manager | tak, do 8 adresow z udzialami |
| **start zaplanowany na przyszlosc** | **tak** | **NIE - luka** |
| **NFT ze strumieniem przychodu** | **tak (zbywalne)** | **NIE - luka** |
| fixed-price fair launch | tak | nie - my mamy krzywa, to inny model z wyboru |

Dwie prawdziwe luki i obie sa DECYZJA PRODUKTOWA, nie zaniedbaniem:

1. **Start zaplanowany.** Wymaga pola `startsAt` w `Launch` i warunku w `_buy`.
   Zmiana w kontrakcie, wiec do nastepnego wdrozenia - nie da sie dolozyc do
   `0x0712...0844`.
2. **NFT ze strumieniem przychodu.** Flaunch mintuje zbywalny NFT, ktory niesie
   prawo do oplat. U nas prawo do oplat jest przypisane do ADRESU w
   `_feeReceivers` i nie da sie go sprzedac. To jest funkcja na osobny etap, nie
   poprawka.

Gdzie jestesmy MOCNIEJSI: nasz limit per portfel dziala w kontrakcie, a nie w
warstwie aplikacji (ich jest wstrzymany), podloga protokolu jest wymuszona
kodem, nie regulaminem, a buyback nie tylko kupuje - pali.

### Pulapka przy uruchamianiu testow: NIE ROB TEGO ROWNOLEGLE Z BUILDEM

Przebieg czterech plikow naraz, puszczony ROWNOCZESNIE z `npm run build`, dal
`108 passing, 4 failing`, w tym dwie awarie `"before each" hook` w
`B20LaunchHook` i `PlainTokenFactory`. Te same pliki uruchomione osobno
przechodza (`B20LaunchHook` - `13 passing`). Przyczyna nie jest w kodzie:
webpack bierze wszystkie rdzenie, a `beforeEach` tych plikow robi pelny
`launch -> buy -> graduate` i wchodzi w 120-sekundowy limit Mocha.

Wniosek: testy i build puszczac PO KOLEI. Awarie `before each` przy rownoleglym
buildzie to falszywy alarm - zanim zaczniesz szukac regresji, powtorz przebieg
sam.

### Zmienne srodowiskowe launchpada

Repo nie ma `.env.example`, wiec komplet stoi tutaj. Zadna z nich nie jest
wymagana do uruchomienia - kazda ma sensowny domysl w kodzie.

```text
NEXT_PUBLIC_LAUNCHPAD_SEPOLIA_ADDRESS        adres CurveLaunchpad
NEXT_PUBLIC_LIQUIDITY_VAULT_SEPOLIA_ADDRESS  adres LiquidityVault
NEXT_PUBLIC_LAUNCH_HOOK_SEPOLIA_ADDRESS      adres B20LaunchHook
NEXT_PUBLIC_LAUNCHPAD_DEPLOY_BLOCK           blok wdrozenia; od niego zaczyna
                                             sie skanowanie zdarzen
NEXT_PUBLIC_IPFS_GATEWAY                     brama IPFS (domyslnie ipfs.io)
GOOGLE_CREDENTIALS                           konto uslugowe Firebase; bez niego
                                             profile tokenow oddaja 503, a
                                             reszta launchpada dziala normalnie
AUTH_SESSION_SECRET                          bez niego nie ma sesji SIWE, wiec
                                             nie da sie zapisac profilu
```

## WYKONANE: pelna sciezka na Base Sepolia, 2026-08-10

Wdrozenie `0x0712b9EA9bB0118f4F751Cb44553F095bF9c0844`, token
`0xb200000000000000000000d919186714B418acff`.

| etap | dowod z lancucha |
| --- | --- |
| start | blok 45299510, `fee 100bps / tworca 60bps` |
| kupno 3.05 ETH | blok 45299663, rezerwa **3.0 ETH**, zwrot **0.02**, oplata **0.03** |
| zamkniecie krzywej | blok 45299663, `tokenReserve` == `T_MIN` co do jednostki |
| graduacja | stan `3`, pula v4 z plynnoscia `21251635231200453637758` |
| pula | `currency0` = ETH, `currency1` = token, **hook `0xad5f...2044` w kluczu** |
| swap na PRAWDZIWYM v4 | hook pobral **529.01 tokena** (ze zdarzenia `HookFeeTaken`) |
| settle | blok 45300005 |
| claim | tworca odebral **3713.23 tokena** z oplat puli |

NAJWAZNIEJSZE: swap poszedl przez prawdziwy `PoolManager` v4 na Sepolii i hook
wzial swoja czesc. Testy jednostkowe tego NIE MOGLY dowiesc - `MockPoolManager`
nie odwzorowuje ksiegowosci delt per adres, co jest napisane wprost w naglowku
`B20LaunchHook.test.ts`. Znak delty i rozliczenie sa potwierdzone na zywym
Uniswapie.

### Cztery bledy w skrypcie flow, wszystkie tej samej rodziny

Kontrakty przeszly bez jednej poprawki. Cztery razy wywrocil sie SKRYPT i za
kazdym razem z tego samego powodu: **czytal stan zaraz po transakcji**.

1. `startedAt` z `launchOf` zamiast ze zdarzenia. `launchOf` NIE REWERTUJE dla
   nieznanego tokena - oddaje same zera. Na wezle bez swiezego bloku dawalo to
   `startedAt = 0`, wiec okno startowe "konczylo sie" w 1970 roku i skrypt
   kupowal w SRODKU okna, gdzie obowiazuje `WINDOW_ADDR_CAP`.
2. Sprawdzenie stanu po kupnie. Kupno przeszlo (rezerwa 3.0 ETH), a skrypt
   oglosil porazke i przerwal przebieg PO wydaniu 3 ETH.
3. Sprawdzanie `pendingEth` po swapie ETH->token. Hook bierze oplate z waluty
   NIEPODANEJ, czyli z TOKENA - `pendingEth` slusznie zostaje zerem.
4. Bezwarunkowe `claimEth()` i `claim()`. Wyplata jest pullem, wiec po
   odebraniu saldo jest zerowe i kolejne wywolanie rewertuje `NothingToClaim`.

Wniosek na przyszlosc: po transakcji czytaj ZDARZENIE Z PARAGONU, a nie stan
przez RPC. `retryRead` tu nie pomaga, bo nie ma wyjatku do zlapania - wezel
odpowiada "poprawnie", tylko nieprawde.

Skrypt ma teraz `FLOW_TOKEN`, ktory pozwala wejsc od srodka - bez tego kazda
poprawka kosztowalaby kolejne 3 ETH.

### Plan na jutrzejszy test na Sepolii

1. Wdrozyc nowa wersje (`npm run launchpad:deploy:sepolia`) - dopiero ona ma
   `launchAdvanced` i auto-buyback.
2. Przeniesc konfiguracje do frontu JEDNA komenda - nie recznie:

   ```text
   npm run launchpad:env >> .env.local
   ```

   Wypisuje trzy adresy ORAZ `NEXT_PUBLIC_LAUNCHPAD_DEPLOY_BLOCK`. Ta czwarta
   wartosc jest najlatwiejsza do przeoczenia, a jej brak nie daje bledu -
   tablica skanuje zdarzenia od bloku STAREGO wdrozenia i pokazuje pustke,
   ktora wyglada jak "nikt jeszcze nic nie wystartowal".
3. `npm run launchpad:flow:sepolia` z `FLOW_CONFIRM=tak` - pelna sciezka.
4. Po pierwszej wymianie w puli sprawdzic `pendingBuybackEth` i wykonac
   `executeBuyback` z sensownym `minTokensOut`.

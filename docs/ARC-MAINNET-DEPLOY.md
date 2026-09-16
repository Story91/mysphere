# Arc mainnet (5042) - wdrozenie launchpadu

Stan zweryfikowany odczytem z lancucha 2026-09-16 (nie z ogloszen).

## Co jest sprawdzone

| Rzecz | Wynik |
|---|---|
| RPC `https://rpc.mainnet.arc.io` | odpowiada, chainId 5042, blok co 0,5 s, baseFee 20 gwei, gasLimit bloku 30 mln |
| Portfel deployera `0xD4885A5aa53446843CABcDE1F35DE9b4E906030e` | 13,08 USDC (natywnie; gaz na Arc to USDC) |
| Uniswap v4 PoolManager `0x8366a39CC670B4001A1121B8F6A443A643e40951` | 24 009 B, keccak runtime `0xbd3881180b547f5fe817545743cfb4343e96b1bc6640dcd70c106b0066e95626` = oficjalny build (Base `0x4985...` poza `address(this)`) |
| Koszt wdrozenia (z artefaktow po `hardhat compile`) | ~8,4 mln gazu = ~0,17 USDC przy 20 gwei; z zapasem x3 nadal < 1 USDC |
| Pyth na Arc mainnet | BRAK. Docs Pytha listuja tylko Arc TESTNET. Pod `0x2880...` na 5042 stoi 1067 B nie-Pytha (rewertuje) |

Skrypt `scripts/launchpad/deploy.ts` na 5042 WYMAGA `POOL_MANAGER` i `POOL_MANAGER_CODE_HASH`
(mapa sprawdzonych celowo nie ma domyslu dla mainnetu) oraz `CONFIRM=tak`.

## Parametry (te same co na testnecie, poza skala)

- `FEE_RECIPIENT` - na testnecie deployer `0xD488...030e` (odczyt `FEE_RECIPIENT()` z `0xe984...Da37`).
  Na Base to Safe `0x83E2...142F`, ale na Arc tego Safe'a nie ma. Do decyzji: deployer albo nowy multisig.
- `R_VIRT=1250` USDC (decyzja 12.09.2026): prog zbiorki 5000 USDC, mcap 31 250 USDC po graduacji.
  Testnet ma 250. Frontend (`app/startpad/config.ts`, wpis 5042) juz zaklada 1250.
- `FACTORY_KIND=plain` - deploy.ts sam to wybiera poza Base; B20 precompile na Arc nie ma.
- `FEE_BPS=100`, `CREATOR_FEE_BPS=70`, `PROTOCOL_SHARE_BPS=3000` - domysly skryptu.

## Komenda (odpala WLASCICIEL - klasyfikator auto-mode blokuje agentowi transakcje na mainnecie)

Sucho, bez CONFIRM - skrypt wypisze plan adresow i skale w USDC, po czym sie zatrzyma:

```bash
FEE_RECIPIENT=0xD4885A5aa53446843CABcDE1F35DE9b4E906030e POOL_MANAGER=0x8366a39CC670B4001A1121B8F6A443A643e40951 POOL_MANAGER_CODE_HASH=0xbd3881180b547f5fe817545743cfb4343e96b1bc6640dcd70c106b0066e95626 npm run launchpad:deploy:arc:mainnet
```

Na ostro - to samo plus `CONFIRM=tak`:

```bash
CONFIRM=tak FEE_RECIPIENT=0xD4885A5aa53446843CABcDE1F35DE9b4E906030e POOL_MANAGER=0x8366a39CC670B4001A1121B8F6A443A643e40951 POOL_MANAGER_CODE_HASH=0xbd3881180b547f5fe817545743cfb4343e96b1bc6640dcd70c106b0066e95626 npm run launchpad:deploy:arc:mainnet
```

Uwagi:
- Skrypt kopie salt hooka i wdraza w jednym przebiegu. NIE wysylac nic z `0xD488` w trakcie
  (keeper SPHERE dziala na Base, wiec nie koliduje - inny lancuch, inny nonce).
- Jesli `rpc.mainnet.arc.io` zacznie oddawac bledy pod seria transakcji: `npm run arc:rpc-proxy`
  i `ARC_MAINNET_RPC_URL=http://127.0.0.1:8546`.

## Po wdrozeniu

1. `LAUNCHPAD=0x... npx cross-env TS_NODE_PROJECT=./hardhat.tsconfig.json hardhat run scripts/launchpad/recordDeployment.ts --network arcMainnet`
   -> `scripts/output/launchpad-arcMainnet.json` (odczyt `R_VIRT()` musi dac 1250e18).
2. Adresy do env (Vercel + .env.local) i jako domysly we wpisie 5042 w `app/startpad/config.ts`:
   `NEXT_PUBLIC_LAUNCHPAD_ARC_MAINNET_ADDRESS`, `..._LIQUIDITY_VAULT_...`, `..._LAUNCH_HOOK_...`,
   `..._TOKEN_FACTORY_...`, `NEXT_PUBLIC_POOL_MANAGER_ARC_MAINNET_ADDRESS=0x8366...`,
   `NEXT_PUBLIC_LAUNCHPAD_ARC_MAINNET_DEPLOY_BLOCK=<blok z logu skryptu>`.
3. Test zywy: jeden launch + jeden buy za 1 USDC z `0xD488`, sprawdzic w UI na `/startpad?chainId=5042`.
4. Weryfikacja zrodel na arc-scan.org (Blockscout) - hardhat-verify nie ma wpisu dla 5042, dodac customChain.

## Perps i paired tokens na mainnecie - co by trzeba

- Pyth nie ma kontraktu na Arc mainnet, wiec indeks moze isc TYLKO z naszego `PythReceiver`
  (5 kluczy Hermesa, quorum 3) - do wdrozenia od nowa na 5042 + adaptery + keeper z gazem w USDC.
  Owner odbiornika = jeden klucz; na mainnecie powinien to byc multisig.
- Rejestr `PriceOracleRegistry`, fabryka rynkow, InsuranceFund, FeeDistributor - to samo co na testnecie,
  koszt gazu rzedu 1-2 USDC, ale kaucja rynku (100 USDC na testnecie) to realne pieniadze.
- Zastrzezenie z 11.09 stoi: syntetyczna ekspozycja na akcje (TSLA) to instrument finansowy (MiCA/SEC).
  Bez opinii prawnej perps zostaja na testnecie; paired tokens na mainnecie moga miec tylko
  rynki krypto (BTC/ETH), jesli w ogole.

## Perps i paired tokens na Arc mainnet - runbook (kod gotowy 16.09.2026)

Kod: skrypty perpsow przyjmuja oba Arc (5042002 i 5042), pliki `deployments/*.<chainId>.json`
biora nazwe z prawdziwego chainId, frontend derywatow przelacza sie zmienna
`NEXT_PUBLIC_DERIV_CHAIN_ID=5042` (bez niej: testnet). Parowanie tokena z indeksem w Startpadzie
dziala na tym Arc, na ktorym stoi modul derywatow.

### Budzet (realne USDC na 0xD488 na Arc)

| Krok | Koszt |
|---|---|
| PythReceiver + adaptery (BTC, ETH; TSLA/XAU/EUR wg decyzji prawnej) | ~0,3 USDC gazu |
| rejestr + fabryka + fundusz + dystrybutor (deploy-derivative-market.ts) | ~0,5 USDC gazu |
| zasilenie funduszu ubezpieczen `SEED_USDC` (6 miejsc) | wg decyzji, testnet mial 5 USDC |
| **kaucja rejestracji feedu: `MIN_BOND_AMOUNT = 100 USDC` NA KAZDY RYNEK** (stala w kontrakcie) | 100 USDC / rynek |
| gaz keepera (funding, likwidacje, wypychanie Pytha co 15 min) | ~0,1 USDC / dzien |

Wniosek: dwa rynki (BTC, ETH) = ~205 USDC + fundusz. Saldo 16.09: ~12,9 USDC. Trzeba domostowac
(`npm run arc:bridge` z Base, tryb standard dochodzi w ~75 min przez publiczny relayer).

### Dowod na forku (16.09.2026)

`npx hardhat test test/ArcForkPerpsMainnet.test.ts` - fork 5042: odbiornik + adaptery BTC/ETH
z ZYWA aktualizacja Hermesa (BTC 75 495, ETH 2 392 USD), rejestr + fabryka + fundusz, kaucja 100 USDC,
createMarket z adapterem jako feedem (2,22 mln gazu), `indexPrice()` == `latestAnswer()`,
open/close pozycji. 6/6. Granica: widok ERC-20 nad natywnym USDC (0x3600 -> precompile 0x1800)
nie dziala na zwyklym EVM, wiec stack na forku dostaje MockUSDC; na mainnecie idzie 0x3600.

### Kolejnosc (wlasciciel odpala, CONFIRM=tak dopiero po sprawdzeniu wypisu)

1. Odbiornik Pytha (owner = deployer; potem `transferOwnership` na multisig):
   `CONFIRM=tak npm run perps:pyth:receiver:mainnet` -> `deployments/pythReceiver.5042.json`
2. Adaptery (priceId z `deployments/pythAdapters.5042002.json`, te same feedy Hermesa):
   `PRICE_ID=0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43 SYMBOL="BTC/USD" CONFIRM=tak npm run perps:pyth:adapter:mainnet`
   `PRICE_ID=0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace SYMBOL="ETH/USD" CONFIRM=tak npm run perps:pyth:adapter:mainnet`
   (skrypt sam celuje w odbiornik z kroku 1; bez pliku odbiornika odmawia - Pytha na mainnecie nie ma)
3. Stack perpsow: `SEED_USDC=5000000 CONFIRM=tak npm run perps:deploy:arc:mainnet`
   -> nadpisuje placeholder `deployments/derivativeMarket.5042.json`
4. Pierwsze wypchniecie cen: `PERPS_NETWORK=mainnet powershell -File scripts\derivatives\keeper.ps1`
   (adaptery oddaja 0 do pierwszej aktualizacji; keeper wypycha, gdy `PYTH_API_KEY` jest w .env.local)
5. Rynek: w UI "New market" z feedem BTC (kaucja 100 USDC + approve), albo `scripts/create-sample-derivative-market.ts`.
6. Keeper na stale: drugie zadanie Task Schedulera z `PERPS_NETWORK=mainnet`
   (`schtasks /Create /TN "Perps keeper Arc mainnet" /SC MINUTE /MO 15 /TR "powershell -ExecutionPolicy Bypass -Command \"$env:PERPS_NETWORK='mainnet'; & '<repo>\scripts\derivatives\keeper.ps1'\"" /F`)
7. Frontend: `NEXT_PUBLIC_DERIV_CHAIN_ID=5042` w Vercelu; adresy ida z commitowanego
   `deployments/derivativeMarket.5042.json`, wiec po deployu ten plik trzeba scommitowac.

### Redeploy TESTNETU (5042002) po zmianie kontraktu 63e2a29 (oracleActive)

`DerivativeMarket` dostal `oracleActive()` i swiezosc feedu w `indexPrice` - stare rynki
(BTC-USD `0x3A1E...`, TSLA-USD `0x5A5A...`) maja stary bajtkod, wiec fabryke trzeba postawic
od nowa i odtworzyc rynki. Skrypt stawia tez NOWY rejestr (stary zostaje z dawnymi kaucjami).
Adaptery Pytha i odbiornik NIE wymagaja redeployu - te same adresy z `pythAdapters.5042002.json`.

Budzet na testnecie: ~1 USDC gazu + `SEED_USDC` + 100 USDC kaucji NA RYNEK. Saldo 0xD488 na
testnecie 16.09 ok. 03:00 UTC: 2,97 USDC -> faucet.circle.com (Arc Testnet) przed krokiem 2.

1. `SEED_USDC=5000000 CONFIRM=tak npm run perps:deploy:arc` -> nadpisuje `deployments/derivativeMarket.5042002.json`
2. `SYMBOL=ARC-USD PRICE=1 CONFIRM=tak npm run perps:market:arc` (bez feedu - indeks z rejestru, jak dotad)
2b. `SYMBOL=BTC-USD PRICE=<cena z adaptera> FEED=0x6531d59b211Dd341f1B95aFa97A2E4344EA12409 CONFIRM=tak npm run perps:market:arc`
   (createMarket z feedem wymaga GOVERNANCE = deployer; `FeedNeedsGovernance` z innego konta)
3. `SYMBOL=TSLA-USD PRICE=<cena z adaptera> FEED=0xb1D75f26a08A576269FB96843b0A1e74DB815153 CONFIRM=tak npm run perps:market:arc`
3b. ARC-USD (bez feedu) zyje z heartbeatu rejestru: jesli cron keepera (app/api/keeper/perps) podpisuje
   INNYM kluczem niz deployer, po registerMarket wykonac `oracle.setPublisher(marketId, <adres klucza crona>)`
   z konta GOVERNANCE. BTC/TSLA z adapterami tego nie potrzebuja (oracleActive), ale keeper dalej robi
   funding, likwidacje i push do PythReceivera.
   Adaptery i odbiornik NIE zmieniaja adresow - metadane juz wystartowanych tokenow trzymaja adres feedu.
4. commit `deployments/derivativeMarket.5042002.json` (frontend i cron keepera czytaja z niego), push.
5. Keeper: cron Vercela (`app/api/keeper/perps`) bierze fabryke z tego pliku po deployu; keeper.ps1 tak samo.

Na mainnecie ten sam skrypt tworzy rynek: `... npm run perps:market:arc:mainnet` z FEED z `pythAdapters.5042.json`.

### Otwarte decyzje wlasciciela
- Ktore feedy na mainnecie: BTC/ETH (krypto) bez zastrzezen; TSLA/XAU/EUR = syntetyczna ekspozycja
  na instrumenty finansowe - zastrzezenie prawne z 11.09 nadal stoi.
- Owner PythReceivera i GOVERNANCE/TREASURY stacku: deployer na start, multisig docelowo.
- Testnetowy keeper: portfel 0xD488 na Arc TESTNET ma 0 USDC gazu (odczyt 16.09) - faucet.circle.com.

# Launchpad - stan na 2026-08-10

Krotki obraz calosci. Szczegoly i uzasadnienia decyzji sa w
`HANDOFF-LAUNCHPAD-V2-2026-08-10.md`.

## Adresy - Base Sepolia (chainId 84532)

| kontrakt | adres |
| --- | --- |
| `CurveLaunchpad` | `0x0712b9EA9bB0118f4F751Cb44553F095bF9c0844` |
| `LiquidityVault` | `0x56e80fA947EF10F965510E161760561c127e4bBb` |
| `B20LaunchHook` | `0xad5f38BAC2ded467f83D1eef440B0c386acF2044` |
| `B20TokenFactory` | `0xe90c0c59574ec67ff34b0CfE45855d6D07B50d15` |
| PoolManager v4 (Uniswap) | `0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408` |
| blok wdrozenia | `45298476` |
| `FEE_RECIPIENT` | `0xD4885A5aa53446843CABcDE1F35DE9b4E906030e` |

Poprzednie wdrozenie `0xA760...4F97` jest MARTWE - ma stare ABI, bez
`launchAdvanced`, bez auto-buybacku i ze starym modelem oplat. Nie uzywac.

## Model oplat - USTALONY NA STALE W KODZIE

- oplata handlowa: **1%** (`MAX_FEE_BPS = 100`), pobierana od kazdego kupna
  i kazdej sprzedazy na krzywej;
- podzial: **60% tworca / 40% protokol** (`MAX_CREATOR_SHARE_BPS = 6000`);
- podloga protokolu jest w KONTRAKCIE, nie w formularzu - obowiazuje takze
  wdrazajacego i kazdego, kto wywola kontrakt bezposrednio;
- oplata puli po graduacji: **1%** od kazdego swapa, dzielona 60/40 miedzy
  protokol i tworce (`PROTOCOL_SHARE_BPS = 6000` w hooku);
- graduacja przy **3.00 ETH** w rezerwie, poczatkowy market cap **0.75 ETH**,
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

- pelna sciezka na Base Sepolia: start -> kupno 3.05 ETH -> zamkniecie krzywej
  -> graduacja -> pula v4 -> swap -> settle -> claim;
- swap przez PRAWDZIWY PoolManager v4, hook pobral 529 tokena, tworca odebral
  3713 tokena z oplat puli;
- flagi hooka zgodne co do bitu z `v4-core/Hooks.sol` (`0x2044`);
- 122 testy lokalne, `tsc`, `lint`, `build`, cztery trasy launchpada.

## Co zostalo do zrobienia

**Przed mainnetem:**

1. **Audyt zewnetrzny.** Kontrakty nie maja setterow, pauzy ani migracji - blad
   jest nieodwracalny.
2. **Weryfikacja kontraktow na Basescanie** (`npx hardhat verify`). Vault i hook
   powstaly wewnetrznie, wiec weryfikuje sie je osobno.
3. **Decyzja o `FEE_RECIPIENT`** - dzis to ten sam adres, co deployer. Na
   mainnecie powinien byc osobny portfel przychodow, bo jest `immutable`.

**Funkcje, ktorych nie mamy, a ma je konkurencja:**

4. **Start zaplanowany na przyszlosc** (Flaunch ma). Wymaga pola `startsAt`
   w `Launch` i warunku w `_buy` - czyli zmiany w kontrakcie.
5. **Zbywalny NFT ze strumieniem przychodu** (Flaunch ma). U nas prawo do oplat
   jest przypisane do adresu i nie da sie go sprzedac.

**Produkt i interfejs:**

6. Wystawienie na produkcji - zmienne na Vercelu, patrz nizej.
7. Zgloszenie token listy do agregatorow, zeby logo trafilo poza nasz interfejs.
8. Keeper jako usluga - dzis jest skryptem uruchamianym recznie.

## Zmienne na Vercelu

```text
NEXT_PUBLIC_LAUNCHPAD_SEPOLIA_ADDRESS        0x0712b9EA9bB0118f4F751Cb44553F095bF9c0844
NEXT_PUBLIC_LIQUIDITY_VAULT_SEPOLIA_ADDRESS  0x56e80fA947EF10F965510E161760561c127e4bBb
NEXT_PUBLIC_LAUNCH_HOOK_SEPOLIA_ADDRESS      0xad5f38BAC2ded467f83D1eef440B0c386acF2044
NEXT_PUBLIC_LAUNCHPAD_DEPLOY_BLOCK           45298476
```

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

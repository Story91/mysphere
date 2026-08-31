# Test round-trip Base <-> Arc (CCTP v2) + deploy testowy

Cel: potwierdzic na malej kwocie, ze (1) USDC wjezdza na Arc, (2) WYCHODZI z Arc
z powrotem na Base, (3) deploy kontraktow na Arc mainnet jest permissionless.

## Zweryfikowane wczesniej (2026-08-31, read-only przez RPC)

- Arc mainnet, chainId 5042, publiczny RPC: `https://rpc.arc-scan.org`, explorer: `https://arc-scan.org`
- CCTP v2 (TokenMessengerV2 / MessageTransmitterV2) pod kanonicznymi adresami — kontrakty istnieja
- USDC natywne: `0x3600000000000000000000000000000000000000`, symbol USDC, 6 decimals
- Iris API Circle zna domene 26 w OBIE strony (fast transfer tez)
- Na Arc istnieja juz kontrakty osob trzecich (memecoin "Architects") -> deploy wyglada na permissionless

## Wymagania

- Node 18+, uruchamiac z korzenia repo (uzywa `viem` z node_modules)
- `PRIVATE_KEY` w env — **NIE klucz admina produkcji**; zaloz burnera i wyslij mu ~10 USDC na Base + grosze ETH na gaz
- Opcjonalnie `ARC_RPC_URL` (domyslnie rpc.arc-scan.org) i `BASE_RPC_URL`

## Najprosciej: wszystko jedna komenda

```powershell
node --env-file=.env.local scripts/arc-test/run-all.mjs 5
```

Skrypt sam przechodzi wszystkie 5 krokow, czeka na atestacje Circle i na gaz na
Arc (krok 2 — patrz nizej). Kroki pojedynczo, jesli wolisz kontrole:

```powershell
$env:PRIVATE_KEY = "0x..."   # burner!
node scripts/arc-test/1-bridge-to-arc.mjs 5        # burn 5 USDC na Base
node scripts/arc-test/2-claim-on-arc.mjs <txHash>  # mint na Arc (patrz "gaz" nizej)
node scripts/arc-test/3-deploy-test.mjs            # deploy kontraktu-zabawki, weryfikacja call==42
node scripts/arc-test/4-bridge-back.mjs 3          # burn 3 USDC na Arc
node scripts/arc-test/5-claim-on-base.mjs <txHash> # powrot na Base — zamyka round-trip
```

## Problem jajka i kury: gaz na Arc

Gaz na Arc placi sie natywnym USDC, ale swiezy portfel ma tam 0 — a zeby odebrac
mint (krok 2), trzeba zaplacic za gaz. Opcje:

1. `destinationCaller` jest ustawiony na 0, wiec `receiveMessage` moze zawolac
   KTOKOLWIEK z gazem na Arc (np. Tobias, jesli juz tam operuje) — mint i tak
   trafi na Twoj adres.
2. Ktos podsyla Ci na Arc rownowartosc kilku centow natywnego USDC.
3. Zapytac Tobiasa, jak odebrano tamte $4.36M — byc moze dziala jakis relayer.

Koszt gazu jest znikomy (gasPrice ~40 gwei; prosta transakcja to ulamek centa).

## Ryzyka

- Chain przed oficjalnym ogloszeniem — Circle moze zmienic reguly; nie trzymac tam srodkow.
- rpc.arc-scan.org to endpoint spolecznosciowy bez SLA; do powaznej pracy wlasny klucz Infura (`arc-mainnet.infura.io/v3/<KEY>`).
- Fast transfer Base->Arc kosztuje ~0.25 bps (skrypt pobiera fee z API Circle i ustawia maxFee).

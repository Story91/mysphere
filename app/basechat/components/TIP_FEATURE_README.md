# Tipping

Stan na 2026-09-11. Zrodlo prawdy: `TipNetworkConfig.ts` (sieci, tokeny,
eksploratory) i `TipButton.tsx` (wysylka). Ten plik tylko streszcza.

## Sieci i tokeny

| Siec | chainId | Tokeny | Rodzaj przelewu |
|---|---|---|---|
| Base | 8453 | ETH, USDC | natywny / ERC-20 |
| Ethereum | 1 | ETH | natywny |
| Celo | 42220 | CELO | natywny |
| World Chain | 480 | ETH, WLD | natywny / ERC-20 |
| Linea | 59144 | ETH, LINEA | natywny / ERC-20 |
| Camp | 484 | CAMP | natywny |
| Robinhood Chain | 4663 | ETH, USDG | natywny / ERC-20 |
| Arc testnet | 5042002 | USDC | natywny (18 miejsc, patrz `ARC_NATIVE_USDC`) |

Token szukany jest NAJPIERW na liscie tokenow wybranej sieci
(`getTokenOnNetwork`), dopiero potem w globalnym `TOKENS`. Ten sam symbol
moze znaczyc inny kontrakt i inna liczbe miejsc na roznych lancuchach.

## Zapis

Po potwierdzeniu odbioru `saveTip` zapisuje dokument w kolekcji `tips`
(adresy malymi literami, kwota jako string w jednostkach ludzkich, `token`,
`network`, `txHash`). Statystyki (`getUserTipStats`, `getPostTipStats`)
sumuja po polach `<token>Received/Sent/Tips` - nowy token wymaga pola w
`TipStats`, `PostTipStats`, `TIP_TOKEN_FIELD` i w `TipStats.tsx`.

## Dowod

Link "verify" idzie przez `getProofLink`, czyli wyszukiwarke eksploratora,
bo zapisany identyfikator moze byc hashem userOp, nie transakcji (Base Pay).
Paragon do udostepnienia: `/tip/[txHash]` z wlasna karta OG.

## Zasady UI

- Przycisk widoczny tylko przy podlaczonym portfelu i nie pod wlasnym postem.
- Odmowa podpisu (4001) to decyzja, nie blad - bez czerwonego toasta.
- Quick amounts per token w `QUICK_AMOUNTS`.

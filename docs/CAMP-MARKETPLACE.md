# Marketplace IP NFT na Camp - co dziala, czego brakuje, co powiedziec

Stan na 2026-09-11. Zrodla: wlasne pomiary na Camp mainnet (484), ABI
IPMarketV4, rozpakowana paczka `@campnetwork/origin@1.3.2` (docs.campnetwork.xyz
i npmjs.com blokuja automatyczny dostep przez Cloudflare, wiec twarde dane
pochodza z artefaktow npm, nie z ogloszen Campa).

---

## 1. Co da sie zrobic na `/marketplace`

Piec czynnosci, wszystkie na mainnecie Camp (chainId 484):

**Wybic wlasne IP.** Przycisk "Mint an IP" prowadzi przez trzy kroki: portfel,
sesja Camp Origin, plik. Obslugiwane obraz (10 MB), audio (15 MB), wideo
(20 MB), tekst (10 MB). Plik ladzie na IPFS przez Pinate, a `origin.mintFile`
zapisuje token w kolekcji Camp Origin. To jest jedyne miejsce w aplikacji,
gdzie da sie wybic IP NFT - `/mycamp` jest wylaczone.

**Sprzedac na wlasnosc.** "List an IP" wystawia token za stala cene w CAMP.
Kupujacy wola `buyNFT`, token zmienia wlasciciela.

**Przyjac oferte.** Kazdy moze zlozyc oferte ponizej ceny wywolawczej
(`makeOffer`); wlasciciel przyjmuje wybrana (`acceptOffer`) albo ja zostawia.
Odrzucone srodki wracaja przez `withdrawPendingReturns`.

**Puscic aukcje.** "Start an auction" ustawia cene minimalna, cene rezerwowa,
krok przebicia i czas trwania. Po czasie `finalizeAuction` rozstrzyga:
powyzej rezerwy token idzie do zwyciezcy, ponizej - wraca do wlasciciela.

**Sprzedac licencje bez oddawania oryginalu.** "Licence" to `buyAccess`:
kupujacy placi za okreslony okres dostepu, token zostaje u wlasciciela.
Warunki (cena za okres, dlugosc, royalty, uzycie komercyjne) ustawia
wlasciciel przez `updateTerms`.

Dodatkowo: zakladka Activity pokazuje zdarzenia z kontraktu, Dashboard -
wlasne wystawienia, oferty, zarobki i wykupione dostepy.

### Adresy

| Rola | Adres | Stan |
|---|---|---|
| IPMarketV4 (nasz) | `0xd02A166A186bcc5C537FeCD5103E9c1A94Bb49D6` | wdrozony 11.09.2026, zrodlo zweryfikowane |
| IP NFT Camp Origin | `0x39EeE1C3989f0dD543Dee60f8582F7F81F522C38` | oficjalna kolekcja Campa |
| Marketplace Campa | `0xc69BAa987757d054455fC0f2d9797684E9FB8b9C` | istnieje, NIE korzystamy |

Oplata platformy: 250 bps (2,5%). **Nie jest zamrozona** - `setPlatformFee`
ma modyfikator `onlyOwner`. Zgodnie z wlasna doktryna komunikacji nie wolno
nam nazywac jej gwarancja.

---

## 2. Czego brakuje

### 2.1 Bloker wszystkiego: siedzimy na SDK sprzed dwoch wersji glownych

`package.json` ma `@campnetwork/origin: ^0.0.9`. Najnowsza to **1.3.2**
(opublikowana 2026-02-05). To nie jest roznica kosmetyczna:

- 0.0.9 **nie zna srodowiska mainnet** - zaszyte adresy to testnetowe
  `0x5c5e6b45...` i `0xF90733b9...`. Caly mainnet obslugujemy recznie obok SDK.
- `buyAccess` w 0.0.9: `(tokenId, periods, value?)`. W 1.3.2:
  `(buyer, tokenId, expectedPrice, expectedDuration, expectedPaymentToken,
  expectedProtocolFeeBps?, expectedAppFeeBps?)` - czyli **ochrona przed
  podmiana ceny miedzy odczytem a transakcja**, ktorej dzis nie mamy.
- `mintFile` w 0.0.9 przyjmuje jednego rodzica (`parentId`), w 1.3.2 do osmiu
  (`parents[]`).

**Pulapka przy migracji:** `SpotifyAPI` i `TwitterAPI` **zniknely** z paczki
`@campnetwork/origin` w 1.3.2 (zero wystapien w `core.d.ts`, bundlu i README).
Zyja dalej w OSOBNEJ paczce `@campnetwork/sdk` (1.4.5). Mamy trzy importy do
przepiecia: `app/api/camp/spotify/route.ts`, `app/api/camp/twitter/route.ts`,
`app/api/camp/spotify/mint-nft/route.ts`. Camp nie oglosil tego nigdzie -
nie ma CHANGELOG ani sekcji migracji.

### 2.2 Royalties - najwieksza dziura merytoryczna

Camp daje kazdemu IP NFT wlasne konto ERC-6551 (Token Bound Account) i natywne
royalties przez `royaltyBps` w warunkach licencji. Metody: `getRoyalties`,
`claimRoyalties`, `getOrCreateRoyaltyVault`, `getTokenBoundAccount`.

Nasz IPMarketV4 **tego nie widzi**. Tworca moze miec naliczone royalties
Campa i nie ma w naszym interfejsie zadnego sposobu, zeby je zobaczyc ani
odebrac. Minimum do zrobienia: saldo TBA na karcie NFT i przycisk odbioru.

### 2.3 AppRegistry - nasz model przychodowy, ktorego nie wlaczylismy

`Auth`/`CampProvider` przyjmuja `appId`, a `buyAccess` ma `expectedAppFeeBps`.
Rejestr aplikacji stoi pod `0xd09F15aA280F9109aCd403cA920e67D40Cb6C3FA`.
Do tego `baseParentId` automatycznie dopina nasz genesis IPNFT jako rodzica
kazdego mintu z aplikacji.

Efekt: MySphere bierze prowizje od kazdej licencji na derywat, protokolarnie,
bez wlasnego kontraktu. To najwiekszy zysk przy najmniejszym nakladzie z calej
tej listy.

### 2.4 Reszta, wedlug wartosci

| Funkcja | Metoda SDK | Po co |
|---|---|---|
| Status danych | `origin.dataStatus(tokenId)`, `DataStatus.DISPUTED` | Nie wystawiac IP zgloszonego jako naruszenie. Filtr to jedna linia, a ryzyko jest prawne. |
| Smart odczyty | `getTokenInfoSmart`, `buyAccessSmart` | Jeden round-trip zamiast kilku; `buyAccessSmart` zwraca null, gdy user juz ma dostep. |
| Drzewo pochodzenia | `parents[]` (do 8) | Remiksy to cala teza Campa. Drzewo na karcie to przewaga nad oficjalnym Origin. |
| Licencja wieczysta | `LicenseType.SINGLE_PAYMENT` | Dzis mamy tylko czasowa. Oczywisty drugi wariant. Uwaga: przy SINGLE_PAYMENT i X402 `duration` musi byc 0. |
| Operacje zbiorcze | `bulkMintFile`, `bulkBuyAccessSmart`, `previewBulkCost` | "Wrzuc 20 plikow", "kup caly zestaw" w jednej transakcji. Kontrakt `0x6B89810768b708465f31b6a8B8d753cc986489F1`. |
| Wiecej zrodel | `mintSocial('tiktok'\|'discord'\|'telegram')`, `auth.linkTikTok`, `linkDiscord`, `sendTelegramOTP` | Mamy tylko Twittera i Spotify. |
| Praca z serwera | `auth.connectWithSigner`, `createNodeWalletClient` | Indekser albo keeper bez przegladarki. |
| Spory | `raiseDispute`, `voteOnDispute`, `resolveDispute` | Sensowne dopiero przy wolumenie; glosuja stakerzy CAMP. |

**Czego NIE ruszac na razie:**
- Fractionalizacja - `FRACTIONALIZER_CONTRACT_ADDRESS` jest **pusty** na
  mainnecie, kontrakt nie jest wdrozony.
- X402 - `settlePaymentIntent` wystepuje w README 1.3.2, ale **nie ma jej**
  w `core.d.ts` ani w bundlu. Docs wyprzedzaja build.
- USDC jako `paymentToken` - adres USDC jest pusty na mainnecie (jest tylko
  na testnecie).

### 2.5 Czy Camp nam konkuruje

Nie. To warstwy komplementarne:

| | Marketplace Campa | nasz IPMarketV4 |
|---|---|---|
| Model | sprzedaz **licencji/dostepu** | sprzedaz **wlasnosci** NFT |
| Aukcje | brak | sa |
| Oferty | brak | sa |
| Royalties | natywne, przez TBA | nie widzi |
| Spory, bulk | sa | brak |

Ryzyko jest inne: nasze wlasne `buyAccess` w IPMarketV4 **duplikuje**
mechanizm Campa i przy okazji pomija royalties, status sporu i fee aplikacji.
Najczystsza architektura: licencje delegowac do Campa, a u siebie zostawic to,
czego Camp nie ma - aukcje i oferty.

### 2.6 Kolejnosc

1. Upgrade `@campnetwork/origin` 0.0.9 -> 1.3.2 (warunek wstepny reszty).
2. `appId` w AppRegistry + genesis IPNFT + `baseParentId` - wlaczyc podzial
   przychodu z aplikacji.
3. `royaltyBps` przy mincie + panel royalties w Dashboardzie.
4. Filtr `dataStatus === ACTIVE` na feedzie.
5. Sciezka "kup dostep" na `buyAccessSmart`, IPMarketV4 zostaje przy aukcjach
   i ofertach.

---

## 3. Tresci na social

**UWAGA: NIE ZAPLANOWANE W POSTIZ.** Narzedzie MCP Postiz w tym srodowisku
nie przyjmuje zagniezdzonych tablic (`socialPost` trafia do serwera jako
tekst, nie tablica), a CLI `postiz` nie jest zainstalowane i wymaga logowania
przez przegladarke. Tresci ponizej sa gotowe do wklejenia recznie.

### 3.1 Watek na X (@MySphere)

Wolny slot: 12.09 poza rowna godzina 14:00, ktora zajmuje kalendarz $SPHERE.
Sugestia 17:40 UTC - lamie wzorzec rownych interwalow, na ktory uczula ranker.

**Post glowny** (255 znakow):

```
the ip marketplace on camp is live. mint a work as an ip nft, then sell it outright, take offers, run an auction, or licence it for a window and keep the original. IPMarketV4, 0xd02A166A186bcc5C537FeCD5103E9c1A94Bb49D6, source verified on camp blockscout.
```

**Komentarz 1** (188 znakow) - obowiazkowe zastrzezenie, oplata NIE jest
zamrozona:

```
the 2.5% platform fee has an owner setter. that is not frozen and we are not going to call it frozen. same rule as everywhere else: if the chain does not enforce it, it is not a guarantee.
```

**Komentarz 2** (250 znakow) - niewygodny szczegol, czyli to, co to konto
robi najlepiej:

```
first thing we found after shipping: every card was blank. camp origin mints point tokenURI at the minter's own pinata gateway, and that gateway is over its free limit. it 403s. the art was always fine, the door was locked. we proxy six gateways now.
```

**Komentarz 3** (230 znakow) - Spotify:

```
also live on basechat: spotify and x connect to your wallet through camp, from your own profile. and a spotify track goes on a post by pasting its link. camp still syncs listening history for nobody, so we don't pretend otherwise.
```

### 3.2 Telegram (MySphere AI chat) - wersja dluga

```
the ip marketplace on camp is live.

what you can do: mint a work as an ip nft on camp mainnet, then sell it outright, take offers on it, run a timed auction, or licence it for a fixed window and keep the original. the contract is IPMarketV4 at 0xd02A166A186bcc5C537FeCD5103E9c1A94Bb49D6, source verified on camp blockscout.

the platform fee is 2.5%. it has an owner setter, so it is not frozen, and we are not going to call it frozen.

the first thing we found after shipping was that every card in the grid was blank. camp origin writes tokenURI to whichever pinata gateway the minter used, and that gateway is past its free tier. it answers 403 to everyone. the art was always there, the door was locked. content on ipfs is addressed by hash, so any gateway serves it - we now ask six of them and cache the answer forever.

also live on basechat: spotify and x connect to your wallet through camp, from your own profile rather than a separate page. and any spotify track goes on a post by pasting its link, title, artist and cover art included. camp still syncs listening history for nobody, so we are not going to pretend it does.

what we are not using yet, and should: camp's native royalties, which give every ip nft its own erc-6551 account. we cannot show you a royalty balance today. that is next.
```

### 3.3 Czego w tych tekstach swiadomie NIE ma

- slowa "frozen"/"guaranteed" przy oplacie 2,5% - ma setter wlasciciela;
- obietnicy synchronizacji historii Spotify - Camp jej nie robi nikomu;
- linku w tresci posta glownego na X - kara rankera za linki;
- porownania "lepsi niz marketplace Campa" - to inna warstwa, nie konkurent.

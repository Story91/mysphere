# SPHERE - addendum operacyjny do planu social

Uzupelnienie docs/SPHERE-SOCIAL-PLAN.md. Zrodlo: druga tura workflow
(83 agenty: 60 recenzji postow, 19 researcherow z dostepem do sieci,
3 syntezatory, 1 redaktor; lacznie z pierwsza tura 100 agentow).
Stan na 2026-08-31.

Wszystkie kwoty i terminy pochodza z researchu sieciowego z 31.08.2026 -
przed wydaniem pieniedzy potwierdzic aktualna cene w samym formularzu.

---

## 0. BLOKER DO ROZSTRZYGNIECIA PRZED CZYMKOLWIEK INNYM

**Kto jest deployerem tokena SPHERE? Odpowiedz z lancucha: NIKT.**

> Rozstrzygniecie z 2026-08-31. Zrodla: kod w repo, odczyty z Base
> mainnet (RPC), zywe tokeny B20 na Basescanie, dokumentacja
> Etherscan/Basescan/DexScreener/DEXTools. Pierwotne postawienie sprawy
> (zachowane nizej w 0.1) bylo bledne CO DO PRZYCZYNY, a przez to co do
> proponowanego wyjscia.

### 0.1 Co bylo zapisane wczesniej - i dlaczego jest nietrafione

Bylo: "token deployuje fabryka `CurveLaunchpad` przez CREATE2, wiec
`creator = escrow` i zaden EOA nie podpisze wiadomosci; wyjscie 1 -
deployowac SPHERE z kontrolowanego EOA".

Blad jest podwojny:

- na Base SPHERE **nie jest kontraktem CREATE2**. `B20TokenFactory`
  (`0xEC7db55Bc081289820097703B3A66003092844D1`) wola precompile
  `0xB20f00...0000`, a ten tworzy token B20 - **byt protokolu, nie
  bajtkod EVM** (contracts/launchpad/factories/B20TokenFactory.sol).
  `eth_getCode` na tokenie B20 zwraca `0x`;
- dlatego **opcja 1 niczego by nie naprawila**. Basescan pokazuje dla
  KAZDEGO tokena B20 `Contract Creator: N/A (System Contract)` -
  niezaleznie od tego, czy `launch()` zawolal escrow, Safe czy goly EOA.
  Sprawdzone na zywym tokenie B20 na mainnecie: MONDO
  `0xB20000000000000000000053eeCfDAA570E2c451`.

**Wniosek: `creator = escrow` NIE jest przyczyna problemu.** Nie ma
zadnego powodu, zeby ruszac architekture launchu - fundament strumienia
tworcy z sekcji 4 i 8 tokenomiki zostaje nietkniety. Opcja 1 jest
skreslona nie dlatego, ze kosztowna, tylko dlatego, ze **nieskuteczna**.

### 0.2 Jaki jest prawdziwy bloker

Nie brak podpisu, tylko **brak przedmiotu weryfikacji**:

| Wymog Basescan | Stan dla dowolnego tokena B20 |
| --- | --- |
| "the source code has already been verified" | niewykonalne - nie ma bajtkodu do zweryfikowania |
| podpis z adresu Contract Creator | niewykonalne - creator to `N/A (System Contract)` |

To dotyczy **kazdego** tokena B20 na Base, nie tylko naszego. Standardowy
formularz `basescan.org/tokenupdate/` odpada z definicji; zostaje sciezka
ticketowa z dowodem posrednim.

Dobra wiadomosc, i jest mocniejsza niz sie wydawalo: **bloker dotyczy
WYLACZNIE Basescanu.** Indeksacja dziala bez zgloszen - DexScreener
i GeckoTerminal czytaja `name()`/`symbol()` prosto z precompile
(docs/B20-LAUNCHPAD-ROZPOZNANIE.md sekcja 5).

**DOWOD EMPIRYCZNY (2026-08-31).** Zywy token B20 `RAWR`
`0xb200000000000000000000503d889fdcbe48b801` ma **komplet warstwy
opisowej na DexScreenerze**: logo (hostowane na `cdn.dexscreener.com/cms/`,
czyli przeszlo przez platny Enhanced Token Info), baner, openGraph,
`https://rawr.technology/`, X `@baseRAWR`, Telegram `@rawrbase`. To samo
widac na GeckoTerminalu. **Ten sam token na Basescanie ma pusty
placeholder i przycisk "Update Token Info".**

Wniosek: dla tokena B20 - bez zadnego deployera, bez bajtkodu -
DexScreener i GeckoTerminal **przechodza normalna, platna sciezka**.
Basescan jest jedynym miejscem, gdzie trzeba isc ticketem.

### 0.3 Czym REALNIE dysponujemy (odczyty z mainnetu 2026-08-31)

Jest jeden EOA zdolny podpisac cokolwiek i majacy trzy niezalezne,
publicznie sprawdzalne wiazania z tokenem:

**`0xD4885A5aa53446843CABcDE1F35DE9b4E906030e`**

| # | Dowod | Status |
| --- | --- | --- |
| 1 | Contract Creator `CurveLaunchpad` `0xCF541A7EcE881945833ff1680dFc067C5Dd4cE2D`; zrodlo **zweryfikowane** (Exact Match) | gotowe |
| 2 | Contract Creator `SphereCreatorEscrow` `0xe984986f4F1E067f697b548D5fe942813d03Da37`, tx `0xe52050d183856eb63ddd6e0bede02555eac68ac7f90cdae1318b037d212afe7b` | **zrodlo NIEZWERYFIKOWANE - do zrobienia przed launchem** |
| 3 | `LAUNCH_AUTHORITY` escrow (odczyt on-chain) - ten sam EOA, wiec bedzie `From` transakcji tworzacej token | dostepne po launchu |

Do tego wiazanie escrow -> token jest odczytem publicznym:
`escrow.sphereToken()` po launchu oraz `launchpad.launchOf(token).creator`
== adres escrow.

To jest dokladnie material, ktorego Etherscan **sam wymaga** dla
kontraktow tworzonych przez kontrakt
(info.etherscan.com/contract-created-by-contract): "for a smart contract
that is created using a smart contract factory, kindly get the address of
the main contract or the defined owner in the contract to sign an
equivalent of the above message", zgloszenie przez formularz Contact Us.
Etherscan dopuszcza tam wprost inne metody: "depending on the case,
suitability, and situation, other methods of verification could also be
utilized".

**Adres tokena jest znany JUZ TERAZ, przed launchem** - to zmienia
harmonogram, bo tickety mozna zlozyc z konkretnym adresem, zamiast czekac
na launch:

`predictVanityToken(escrow, 0x...041ade)` =
**`0xB200000000000000000000BA5eDb84c678432476`**

### 0.4 Jak to robia inne launchpady

Sprawdzone: **zaden z nich nie ma naszego problemu**, bo wszystkie
deployuja zwykle kontrakty ERC-20 EVM, a nie tokeny B20.

- **Clanker** - token CLANKER `0x1bc0c42215582d5a085795f4badbac3ff36d1bcb`
  jest deployowany przez fabryke Clankera, a mimo to **ma na Basescanie
  logo, strone (clanker.world) i socials (X, Telegram, CoinGecko)**,
  a zrodlo jest zweryfikowane (solc 0.8.26). Czyli sciezka "kontrakt
  z fabryki + ticket" **dziala w praktyce**. Ich przypadek jest jednak
  LZEJSZY od naszego - maja bajtkod, wiec spelniaja warunek wstepny
  (zweryfikowane zrodlo) i zostaje im wylacznie kwestia podpisu.
- **Flaunch** (Flayer Labs, hooki Uniswap v4) i **Doppler** (protokol
  launchpadowy Uniswapa) - takze standardowe ERC-20 EVM. Ustalone na
  poziomie "typ kontraktu", bez indywidualnej inspekcji ich stron
  tokenow na Basescanie.

Konsekwencja: precedens dla **DexScreenera i GeckoTerminala istnieje**
i jest tokenem B20 (`RAWR`, patrz 0.2) - tam nie wymyslamy niczego
nowego. Precedensu **dla Basescanu nie znalazlem**: `RAWR` ma tam pusty
placeholder, tak samo jak kazdy inny sprawdzony przeze mnie token B20.
Jesli SPHERE dostanie logo na Basescanie, bedzie to prawdopodobnie jeden
z pierwszych takich przypadkow - i to jest argument do uzycia w tickecie
(rozwiazujecie to raz dla calego standardu B20, nie dla jednego
projektu).

### 0.5 Procedura PRZED launchem - co, do kogo, z jakim dowodem

Kolejnosc jest istotna: punkty 1-3 sa niezalezne od launchu i nic nie
kosztuja, wiec ida od razu.

1. **Zweryfikowac zrodlo `SphereCreatorEscrow`** na Basescanie
   (`0xe984986f...`, dzis niezweryfikowane). To warunek wstepny do
   czegokolwiek dalej i jednoczesnie samodzielny zysk wiarygodnosci.
   Przy okazji to samo dla `SphereRewards`
   `0x9030e53E7AC1bc81Cf28b196BA336E5544ce4A47` i `SphereTokenVesting`
   `0xB5dE95224F2bEDee2e7Ca7170F5B6a02641255AD`.
2. **Zaklaimowac ownership escrow i launchpada na koncie Basescan**
   (Verified Address, podpis z `0xD4885A5a...`). Oba maja normalnego
   Contract Creatora, wiec to przechodzi standardowa sciezka.
3. **Ticket do Basescan** - `basescan.org/contactus`, General Inquiry
   (NIE formularz tokenupdate). Zawartosc:
   - adres tokena `0xB200000000000000000000BA5eDb84c678432476`
     z zastrzezeniem "token B20, precompile, adres przewidziany
     deterministycznie przed launchem";
   - wyjasnienie, dlaczego standardowa sciezka nie ma zastosowania:
     brak bajtkodu, `Contract Creator: N/A (System Contract)`;
   - podpisana wiadomosc z `0xD4885A5a...` w formacie Etherscana ("I am
     the creator of the token contract address ... and ... is the owner
     of the contract address") - **pelny komplet: adres, tresc
     wiadomosci, hash podpisu, wersja**;
   - lancuch dowodowy: EOA -> `CurveLaunchpad` (zweryfikowane zrodlo,
     Contract Creator = ten EOA) -> `SphereCreatorEscrow` (Contract
     Creator = ten EOA, tx `0xe52050d1...`) -> `escrow.LAUNCH_AUTHORITY()`
     = ten EOA -> `escrow.sphereToken()` = adres tokena;
   - link do repo/dokumentacji z opisem mechaniki.

   Zlozyc **T-10 dni roboczych** - deklarowany czas to 7-10 dni, a nasz
   przypadek jest nietypowy i pojdzie do recznej oceny.
4. **DexScreener Enhanced Token Info** (299 USD, promocyjnie z 499) -
   zamowienie skladane formularzem, realizacja minuty-12h. **Sciezka
   potwierdzona empirycznie na tokenie B20** (`RAWR`, patrz 0.2), wiec
   idziemy normalnym formularzem, bez ticketa i bez pytania z gory.
   Poradniki zewnetrzne wspominaja o kroku "verify ownership by
   connecting the wallet that created the token" - jesli formularz
   faktycznie go zazada i nie da sie go przejsc, **dopiero wtedy**
   `support@dexscreener.com` z opisem przypadku B20. Skladac po
   zaindeksowaniu pary, czyli po graduacji.
5. **DEXTools socials** - to **zamowienie platne, nie brama podpisu**:
   podlaczany portfel sluzy do dostepu do zamowien i platnosci, a nie do
   dowodzenia wlasnosci. Istnieje tez sciezka Community Takeover z reczna
   akceptacja zespolu. Ryzyko najnizsze z calej trojki; obowiazkowe pole
   to publiczny handle Telegrama (patrz 0b).
6. **Po launchu, tego samego dnia** - dopiac dowod nr 3: hash transakcji
   tworzacej token z `From = 0xD4885A5a...`, dolaczyc do otwartych
   ticketow jako potwierdzenie.

Zalozenie do odpuszczenia: **nie planowac logo na Basescanie na dzien
launchu** - i nie traktowac tego jako straty. Realistycznie to tydzien-dwa
po launchu albo wcale; na dzien startu nosnikiem tozsamosci sa
DexScreener, DEXTools, GeckoTerminal i nasza wlasna strona tokena,
czyli miejsca, w ktorych trader faktycznie patrzy. Basescan jest
warstwa wiarygodnosci "na pozniej", a nie warunkiem launchu.

### 0.6 Osobna sprawa, ktora wyszla przy okazji: `metadataURI` jest juz zamrozony pusty

`CurveLaunchpad` przechowuje `metadataURI[token]`, zapisywane **raz,
w `_launch`** (CurveLaunchpad.sol:1050) - **nie ma settera**, wiec po
launchu jest to nieodwracalne. Wartosc bierze sie z konfiguracji zapietej
w konstruktorze escrow.

Odczyt z mainnetu: `escrow.metadataURI()` = **`""`** (pusty string).

Czyli jedyne pole metadanych tokena, ktore w calej tej ukladance
kontrolujemy on-chain, **jest juz ustawione na puste na zawsze** - chyba
ze escrow zostanie wdrozony od nowa. Koszt redeployu jest realny: adres
escrow wchodzi do `receiverAccounts` wlasnej konfiguracji i do preimage
vanity, wiec zmiana adresu = ponowne mielenie salta i utrata wymielonego
`0xB2...BA5eDb84...`.

Decyzja wlasciciela, swiadomie, przed launchem:

- **(a) zostawic pusty** - akceptujemy, ze on-chain nie ma zadnego
  wskaznika do socials, a warstwa opisowa zyje wylacznie w zewnetrznych
  serwisach i na naszej stronie. Zero kosztu, zero ryzyka.
  **Rekomendacja domyslna**, bo zaden z blokerow z 0.2 nie jest przez
  `metadataURI` rozwiazywany - Basescan i DEXTools go nie czytaja;
- **(b) redeployowac escrow z wypelnionym `metadataURI`** (stabilny URL
  do JSON-a z logo i socials) - dokladamy trwaly, launchowy dowod
  wiazacy token z projektem, przydatny takze jako zalacznik do ticketow
  i dla przyszlych indekserow. Koszt: powtorzenie fazy 0 (nowe adresy,
  nowe mielenie vanity, ponowna weryfikacja zrodel).

Warte odnotowania: opcja (b) **nie odblokowuje** Basescanu ani DEXTools.
Jest inwestycja w trwalosc i przyszle integracje, a nie lekarstwem na
punkt 0.2 - i tylko tak powinna byc wazona.

Cala reszta tego dokumentu zaklada, ze punkt 0 jest rozstrzygniety.

## 0b. Zestaw materialow do przygotowania teraz

Jeden folder, publiczne stabilne URL-e (nie linki do Drive):

- PNG 512x512 (ikona), PNG 200x200 (CG/CMC), PNG 64x64 + SVG 32x32
  (Basescan), baner 600x200 (3:1);
- neutralny opis na 2-3 zdania, zero superlatywow;
- mail w domenie (`team@mysphere.fun`);
- pelne URL-e social (`https://x.com/...`, nie `@handle`);
- publiczny handle Telegrama - **pole obowiazkowe na DEXTools**.

---

## 1. Listingi i weryfikacja

| Platforma | Koszt | Czas | Kiedy skladac |
| --- | --- | --- | --- |
| Basescan token info | darmowe (Priority platny, ~48h) | 7-10 dni roboczych | tydzien, w ktorym kontrakt idzie live |
| DexScreener Enhanced Token Info | **299 USD** | minuty-12h | T-0, po zaindeksowaniu pary |
| DEXTools socials | wycena przy checkoucie ($DEXT/Helio) | 5-10 min | T-0, ten sam dzien |
| CoinGecko | darmowe | oficjalnie 5-7 dni, realnie 2-6 tyg. | ~dzien 60 |
| CoinMarketCap | darmowe | 2-4 tyg. | **minimum dzien 60** (twarda reguła CMC) |
| DefiLlama | darmowe (PR na GitHubie) | dni-tygodnie | gdy pojawia sie realne dane o oplatach |
| Tokenomist | darmowe | 2-3 dni robocze | draft teraz, zlozenie po launchu |

**Basescan.** Wylacznie `basescan.org/tokenupdate`; po wyslaniu nie ma
edycji. Dwie bramki: zweryfikowane zrodlo z **Exact Match** (przypiac
wersje kompilatora, optimizer runs i metadane z deploya - commit
`foundry.toml`) oraz Verify Address Ownership podpisane przez deployera
(patrz sekcja 0). Base to chainId 8453, Etherscan API V2 obsluguje go
jednym kluczem. Cena i kapitalizacja NIE biora sie z tego formularza -
pojawiaja sie dopiero po listingu CG/CMC; reputacja NEUTRAL tez wymaga
listingu typu CG.

**DexScreener.** Sam listing jest darmowy i automatyczny ~10-30 min po
pierwszym swapie; logo i socials juz nie. Sciezka:
`marketplace.dexscreener.com/product/token-info` -> Base -> adres
kontraktu -> formularz -> platnosc. Pozwala zadeklarowac portfele
z zablokowana podaza, zeby kapitalizacja nie liczyla sie jako FDV
(dotyczy naszego vestingu z dev-buy). Warunek: pula musi byc juz
zaindeksowana, nie da sie kupic z wyprzedzeniem.
**Otworzyc ticket na ich Discordzie juz teraz** z dwoma pytaniami: czy
bonding curve moze byc zaindeksowana jako launchpad, i jakiego dowodu
wlasnosci wymaga token zdeployowany przez fabryke. Sama krzywa moze
w ogole nie pojawic sie przed graduacja na v4. Zarezerwowac 199 USD na
Community Takeover; Boosts to osobna, pozniejsza decyzja.

**DEXTools.** Socials wylacznie przez
`dextools.io/marketplace/en/create-socials`. Podlaczony portfel EVM staje
sie wlascicielem przyszlych edycji. Handle Telegrama z @ to jedyne pole
obowiazkowe. Brak opublikowanego cennika - wziac wycene z formularza, nie
zgadywac. W ich dokumentacji nie istnieje zaden "verified checkmark";
realny jest **DEXTScore 0-99**, rosnacy po uzupelnieniu socials.
**Przetestowac teraz indeksowanie puli Uniswap v4 na dowolnej istniejacej
puli v4** - pule z hookami to glowny tryb awarii "wykres sie nie pojawia",
a nasza pula kanoniczna ma hook.

**CoinGecko / CoinMarketCap.** Zadne z nich nie pobiera oplat; kazda
oferta "fast-track fee" to posrednik. CMC wymaga 60 dni dzialania
i istotnego wolumenu, a odrzuca najczesciej na dowodzie podazy w obiegu.
Dlatego: wypuscic **strone z dowodem podazy** jeszcze przed launchem -
adres kontraktu, podaz calkowita i w obiegu, kazdy portfel spoza obiegu
opisany z linkiem do Basescan (escrow, vesting, 0xdEaD), plus zywy wykres
rozkladu holderow, bo launche z krzywej zapalaja u CMC flage koncentracji.
Sprawdzic, czy pula v4 po graduacji renderuje sie na GeckoTerminal w ciagu
24h - jesli nie, CoinGecko jest zablokowane. Nieformalne progi podawane
przez agencje: ~50 tys. USD dziennego wolumenu, 400-500 tys. USD
plynnosci; wylacznie organicznie, wash trading to podstawa do delistingu.

**DefiLlama.** Dwa repo, nie mieszac: TVL -> `DefiLlama-Adapters`
(`projects/sphere/`), oplaty -> `dimension-adapters` (`fees/sphere.ts`).
Najpierw adapter oplat - to on pokazuje akumulacje wartosci. Wzorzec:
`fees/clanker.ts` (Base, pule v4, podzial oplat tworcy,
`dailyHoldersRevenue` z buybackow). **Oprzyrzadowac on-chain PRZED
launchem:** osobne eventy dla oplaty z krzywej, oplaty LP, ciecia
protokolu i nogi buyback/burn, zeby przychod holderow dalo sie wyprowadzic
z samych logow. Zwracac kwoty tokenow kluczowane adresem, nigdy USD.
`start` = data launchu, poczekac na realne dane, odpalic
`pnpm test fees sphere <date> base` i wkleic wynik do PR. Wlaczyc "Allow
edits by maintainers", nie ruszac `package.json`, nie pingowac na Discordzie.

**Tokenomist.** Zarejestrowac sie na `listing.tokenomist.ai` i wziac klucz
API juz teraz. Szkic robic przez ich narzedzia self-listing, ale **nie
skladac, dopoki kontrakt nie jest live - zlozenie zamyka vesting na
stale.** Zadeklarowac publicznie adresy portfeli buyback i burn
z wyprzedzeniem, zeby zdarzenia byly tagowane jako *On-chain Exact*, a nie
*Reported*. Kazda przyszla zmiana podazy wymaga u nich 14 dni uprzedzenia.

## 2. Telegram

**STATUS 2026-09-01: kanal ogloszeniowy ZALOZONY.** Do konca wrzesnia
zostaje broadcast-only. Grupa dyskusyjna dopiero po obsadzeniu
moderatorow - niemoderowana grupa przedlaunchowa to farma scamu.
Tresc startowa (opis kanalu, przypieta wiadomosc, pierwsze trzy
ogloszenia) - patrz sekcja 2b.

Przed jakimkolwiek zaproszeniem: Aggressive Anti-Spam Telegrama (darmowe),
captcha przyciskowa Shieldy, CAS, Rose (blocklisty, antyflood, federacyjne
bany). Przy otwarciu grupy: slow mode 15 s (5 s dla dolaczajacych
w pierwsze 24h), 10-minutowe wyciszenie po wejsciu, zakaz mediow i linkow
dla nowych kont, dodawanie czlonkow tylko przez adminow; konto mlodsze niz
24h wrzucajace link -> auto-usuniecie i ostrzezenie, powtorka w ciagu 1h
-> ban. Tematy forum: Announcements / Support / Builders / Regional.

Przypiety arkusz linkow: adres kontraktu, Basescan, strona, X, plus
"zero-admin, immutable; we never DM first; no presale, no allowlist".
CA idzie w opis kanalu, przypieta wiadomosc i na strone - **nigdy w DM**.
Zarejestrowac teraz podobne handle, codziennie zamiatac klony, miec
@NoToScam pod reka. **Nigdy nie wdrazac zewnetrznego "bota
weryfikacyjnego"** - to zywy wektor drenowania portfeli w 2026.
Wszyscy admini: 2FA z unikalnym haslem i mailem odzyskiwania, passkeys,
wyczyszczone sesje, ukryty numer telefonu, "will never DM you" w nazwie.

## 2b. Pakiet startowy kanalu Telegram (gotowy do wklejenia)

Przeszedl ten sam tryb co posty na X: draft + recenzja adwersaryjna.
Z czterech zastrzezen recenzenta dwa byly falszywymi alarmami (proba na
Sepolii OBEJMOWALA swapy, settle i harvest - hashe w tokenomice sekcja 9;
manifesty epok SA publikowane przez scripts/sphere/publishEpoch.ts),
a jedno poprawialo jedna rzecz kosztem drugiej: auto-burn z `buybackBps`
NIE jest finansowany polityka skarbca, tylko wycinany z nogi ETH oplat
hooka, wiec jest egzekwowany lancuchem w calosci. Ponizej wersja finalna.

**Do podmiany przed publikacja:** `[X_URL]`, `[TG_HANDLE]`, `[SITE_URL]`,
`[DOCS_URL]`. Link do burn tx jest juz wstawiony na twardo.

### Opis kanalu (234 znaki, limit Telegrama 255)

```
official announcements for startpad and $SPHERE. immutable zero-admin contracts on base. broadcast only. we never DM first, there is no presale and no allowlist, and the contract address will be posted here exactly once on launch day.
```

### Przypieta wiadomosc

```
read this before you believe anything anyone sends you about $SPHERE.

what startpad is: a token launchpad on base. the contracts are immutable and zero-admin. no owner, no pause, no upgrade path, no blacklist, no fee switch, no admin panel. tokens launched through it have a fixed supply of 1,000,000,000, no mint function and no roles. liquidity moves to a uniswap v4 pool at graduation and the LP is locked forever.

what $SPHERE is right now: not launched. no date is set. it will launch through startpad itself, on the same contract path as anyone else's token.

the only accounts that speak for us:
x: [X_URL]
this channel: [TG_HANDLE]
site: [SITE_URL]
docs: [DOCS_URL]

security, and none of it changes:

we never DM first. any DM from an "admin", from "support", or from a "verification bot" is someone trying to drain your wallet. we will never ask you to connect a wallet to prove anything.

there is no presale and no allowlist. nobody can sell you an early allocation, because there is no early allocation to sell.

the contract address will be posted exactly once, on launch day, from the official X account and from this channel. any address circulating before that is fake, including one posted by an account wearing our name.

this channel is broadcast only through september. the open chat group starts when there are moderators to staff it, and not before, because an unmoderated pre-launch group is a scam farm.
```

### Post 1 - po co ten kanal

```
this is the announcement channel for startpad and $SPHERE. it is broadcast only through september. the chat group stays closed until there are moderators to staff it, because an unmoderated pre-launch group is a scam farm, and we would rather say that out loud than run one.

what gets posted here: contract mechanics, tx hashes, epoch manifests, and the things that break. if a post has a number in it, there will be a way for you to check the number.

what does not get posted here: price, listings, or anything shaped like a countdown. no launch date either, because the date is not decided yet.

standing rules, and they do not change. we never DM first. there is no presale and no allowlist. the contract address gets posted exactly once, on launch day, from the official X account and from here. anyone who sends you an address before that is stealing from you.
```

### Post 2 - czym jest startpad

```
startpad in mechanics, for anyone who just got here.

a token launches with a fixed supply of 1,000,000,000, no mint function, no roles. it trades on a bonding curve. when the curve fills, anyone can call graduate() and the liquidity moves into a uniswap v4 pool with the LP locked forever. graduate() pays the caller 1.5% of the curve reserve, so the work gets done by whoever wants that fee rather than by us. settle() and harvest() are permissionless the same way.

fees are 1% on curve trades. up to 70% of that goes to the creator, split across as many as 8 addresses, and the split freezes at launch. after graduation it becomes a 1% hook fee per swap plus the 0.3% LP fee.

no owner, no pause, no upgrade, no blacklist, no fee switch, no admin panel. that cuts both ways: nobody can fix a bad launch either, us included. $SPHERE goes through the same contract path as anyone else's token.
```

### Post 3 - proba generalna na Sepolii

```
we ran the whole launch on base sepolia before running it anywhere that matters. launch, atomic dev-buy, the curve filling, graduation onto a real v4 pool, swaps in both directions, settle, harvest, fee claims, and the first real auto-burn: 12,131 SPHERE to 0xdEaD. every step has a public tx hash.

burn tx: https://sepolia.basescan.org/tx/0x672984c12fbee72b3da9d9cb65f86ee9a8dfe8682f9a4ef28f425a3d733ed781

testnet money, so the number is worth nothing as value. as a receipt it is worth something. the burn amount came out of a parameter frozen at launch, cut from the token's own fee stream, and anyone could have triggered the call. nobody typed that number.

rehearsals should be public too. when the mainnet version happens you can diff it against this one and see whether anything quietly changed.
```

### Konfiguracja kanalu do ustawienia od razu

Kanal ogloszeniowy jest duzo mniej narazony niz grupa, ale trzy rzeczy
robi sie teraz, nie po fakcie:

1. **Wylaczyc komentarze pod postami** (albo podpiac grupe dyskusyjna
   dopiero z moderacja) - wlaczone komentarze zamieniaja kanal w te sama
   niemoderowana powierzchnie, ktorej unikamy.
2. **Zarejestrowac podobne handle** i codziennie zamiatac klony;
   @NoToScam pod reka.
3. **Konta adminow**: 2FA z unikalnym haslem i mailem odzyskiwania,
   passkeys, wyczyszczone sesje, ukryty numer telefonu, "will never DM
   you" w nazwie wyswietlanej.

Reszta konfiguracji (Aggressive Anti-Spam, Shieldy, CAS, Rose, slow mode,
tematy forum) wchodzi dopiero przy otwieraniu grupy - patrz sekcja 2.

### Mocne zagranie antypodszywkowe do rozwazenia

Adres tokena jest deterministyczny i **znany juz teraz**
(`predictVanityToken`, sekcja 0.3). Opublikowanie go z wyprzedzeniem
razem z metoda wyliczenia zabiloby caly przemysl falszywych CA w dniu
launchu: kazdy moglby sprawdzic adres samodzielnie, na tydzien przed.
Warunek: decyzja z sekcji 0.6 musi byc rozstrzygnieta na "nie
redeployujemy escrow", bo redeploy zmienia adres i zamienilby ten atut
w wlasnego galla. Nie publikowac wczesniej.

## 3. X

**STATUS 2026-09-01: Premium WYKUPIONE.** Slusznie Premium, nie Premium+
(40 USD/mies. za marginalny ranking, Radar i X Pro to na tym etapie
przepalenie). Co to odblokowuje i co z tym zrobic teraz:

- **Articles** (rozszerzone w styczniu 2026) - dostepne od reki. Warte
  jednego dlugiego tekstu "how startpad works", do ktorego moga linkowac
  posty dzienne, zamiast tlumaczyc mechanike od zera w kazdym watku;
- **boost odpowiedzi** - to jest realna dzwignia silnika odpowiedzi
  z sekcji 7, wiec rotacje 22 kont mozna wlaczac;
- **weryfikacja**: potwierdzic numer telefonu, jesli jeszcze nie.
  Handle, nazwa wyswietlana, avatar i baner powinny byc juz zamrozone -
  zmiany kosmetyczne po weryfikacji uruchamiaja ponowna kontrole.

**X Communities nie istnieja** - wylaczone 30 maja 2026. Wykreslic
z jakichkolwiek planow. Zamienniki:

- trzymac spojne slownictwo (Base, bonding curve, Uniswap v4, immutable,
  launchpad), zeby Grok klastrowal konto do Custom Timelines;
- zaklepac **Smart Cashtag `$SPHERE`** przed launchem i zaczac post
  launchowy od cashtagu;
- prowadzic jedna publiczna grupe **XChat** jako dom spolecznosci;
- mirrorowac posty na Farcaster / Base App (pasywnie, patrz plan sekcja 3).

**Automatyzacja.** 30 wrzesniowych postow leci przez scheduler na OAuth
(Postiz) - to jest w porzadku, headless skrypt nie. **Zabic sztywny slot
dzienny**: jitter i sporadyczne dni pominiete/podwojne; rowne interwaly to
najsilniejszy sygnal bota (konkretne godziny do przesuniecia - plan,
sekcja 4b). Alerty (burny, graduacje) wypchnac na osobne konto
`@startpad_alerts` z etykieta Automated podlinkowana do glownego, zamiast
mieszac je z glownym feedem. Nigdy nie automatyzowac obserwowania,
polubien, RT, odpowiedzi ani DM. Podatek API od linkow: 0,015 USD/post,
**0,20 USD z linkiem**. W postach automatycznych tylko fakty, zero
deklaracji o cenie. Kazdy platny KOL musi uzyc etykiety Paid Partnership -
wpisac to do briefu.

## 4. Memy

Limit 6-8 z 30 postow; ta rzadkosc utrzymuje wiarygodnosc konta
o transparentnosci. **Calkowity zakaz obrazow generowanych przez AI** -
backlash na slop w 2026 czyni z tego ryzyko marki, nie kwestie stylu.
Format domowy: recznie kadrowane screeny z Basescan albo z kontraktu,
gdzie zartem jest sam artefakt (np. pusta lista funkcji admina).
Dozwolone: greentext, beznamietne listy numerowane, FAFO wymierzone
w mechanike rugow (nigdy w czytelnika), Two Buttons = "renounce ownership
/ keep the mint key". Odpuscic Gigachada, soyjaki, awatary wojakow,
maskotki i dokopywanie nazwanym konkurentom. Pisac pod odpowiedzi, nie pod
polubienia - konczyc sprawdzalnym twierdzeniem. Trzymac 2-3 niedatowane
sloty reaktywne.

## 5. Kanal polski - werdykt: NIE

Tylko angielski. Polska nie ma dzialajacego rezimu MiCA (trzy weta
prezydenckie, patrz tez ryzyko 6 w tokenomice), co czyni promocje po
polsku do polskiego retailu **najbardziej prawnie odslonietym ruchem,
jaki jest dostepny**, bez sciezki licencyjnej, ktora by to naprawila.
Polscy onchain natives i tak czytaja angielskie CT. Nie zakladac konta PL,
nie kupowac polskiej promocji influencerskiej.

Jedyne dopuszczalne powierzchnie PL: polska strona docs/FAQ ramowana jako
pomoc produktowa oraz **Web3 Warsaw 9-10 wrzesnia 2026** - 1-2 posty po
angielsku w duchu "built from Warsaw, shipped for Base" (gotowy tekst
w planie, sekcja 4b). Wracac do tematu tylko, jesli po launchu >15%
polaczen portfeli bedzie z Polski.

## 6. War room na dzien launchu

**Role (przypisac nazwiska teraz):** Ops Lead (pilnuje ram czasowych
decyzji), Analyst (forensyka on-chain), Comms Lead (firewall - analityk
nigdy nie dotyka X). Jedna osoba moze trzymac dwie role, nigdy trzy.

**Zestaw T-0 przygotowany z wyprzedzeniem:** przypiety post z CA, dowod
niezmiennosci (bytecode bez admina + link do weryfikacji na Basescan)
zamiast linku do locka LP, wyjasnienie migracji krzywa -> v4, makro
odpowiedzi na scam, tresci na dzien 2 juz zaplanowane.

**Zegar dnia L:** 09:00-11:00 watek odliczajacy, 11:00-12:00 Space/AMA
(goscinnie, nie wlasny), 12:00 go-live i CA na wszystkich kanalach
jednoczesnie, 12:00-14:00 komunikacja all-hands, 14:00-18:00 posty
rozlozone w czasie. Cztery drafty launch-day czekaja juz w Postiz.

**Co godzine przez pierwsze 8h:** postep krzywej, utworzenie puli v4, para
zywa na DexScreener, koncentracja u top holderow. **Zamiatanie falszywych
tickerow co 30 min** na Basescan, DexScreener i X - scamy podszywajace sie
+1400% r/r, klony pojawiaja sie w ciagu minut. Kupic DexScreener Enhanced
Token Info w momencie zaindeksowania pary; zlozyc socials DEXTools tego
samego dnia.

**Pierwsze 72h:** support niemal 24/7 z gotowymi odpowiedziami, publikacja
wlasnej analizy pierwszego bloku (lekcja $JESSE), ogloszenie kolejnego
kamienia milowego. Planowac na 80% mocy przerobowych - 85% tokenow z 2025
zakonczylo rok ponizej ceny TGE.

---

## 7. Silnik odpowiedzi - 22 konta

Kadencja: **codziennie** @base, @buildonbase, @jessepollak, @clanker_world,
@AustinAdams10. **Tygodniowo** @flaunchgg, @whetstonedotcc, @guil_lambert
i tier danych. **Oportunistycznie** @cobie, @baseapp, @0xSisyphus.
Maks. 2 odpowiedzi na konto tygodniowo.

**Guardraile:** zaczynac od mechanizmu, nigdy od $SPHERE; zadnych
deklaracji daty launchu; zweryfikowane kontrakty i publiczny dashboard
musza istniec, ZANIM odezwiemy sie do tierow builders/data (oni to
sprawdza); zero wzmianek o $SPHERE w odpowiedziach do kont pracownikow
Coinbase.

### base-core

| Handle | Dlaczego | Kat odpowiedzi |
| --- | --- | --- |
| @base | glowne konto Base; nabor Batches 004 zamyka sie 9 wrzesnia | watki builder-support: konkret o immutable contracts, nigdy o tokenie |
| @jessepollak | tworca Base; przyznal, ze zaklad na creator-coiny nie wyszedl (07.2026); jego wlasny $JESSE zsnajpowany na ~1,3 mln USD | design launchu po erze creator-coinow, odpornosc na sniperow; jego ton jest szczery i nielizusowski |
| @buildonbase | konto dla deweloperow; Builder Codes / ERC-8021, atrybucja x402 | realne notatki z integracji, raport jak dziala atrybucja przeplywu oplat |
| @baseapp | powierzchnia dystrybucji dla mini-appek | konkretne pytania o UX: jak token z krzywej pokazuje sie w aplikacji |
| @cobie | prowadzi Base App po przejeciu Echo; biegun "ICO 2.0" z permisjami; zerowa tolerancja dla szilla | permissioned sale kontra permissionless immutable curve - uczciwy kontrast, nie atak |

### launchpady

| Handle | Dlaczego | Kat odpowiedzi |
| --- | --- | --- |
| @clanker_world | dominujacy launchbot na Base, szczyt ~21 870 tokenow/dzien | przy statystykach oplat: kto moze potem dotknac kontraktu |
| @whetstonedotcc | Doppler, >90% nowych launchow puli DEX na Base | krzywa -> graduacja; niezmiennosc kontra upgradowalna infrastruktura |
| @flaunchgg | launchpad na Base na hooku v4, 100% oplat dla tworcow, Progressive Bid Wall | routing oplat: PBW kontra plaska krzywa; ton peer-buildera |
| @zora | creator coins, 40 tys. tokenow w weekend, spadek o 92% | launchpad-jako-social kontra launchpad-jako-infrastruktura |

### traderzy

| Handle | Dlaczego | Kat odpowiedzi |
| --- | --- | --- |
| @0xCygaar | komentarz inzynierski o EVM/L2, wysoka widocznosc odpowiedzi | co znaczy "renounced" kontra brak funkcji admina, ktorej nigdy nie bylo |
| @0xSisyphus | analiza struktury rynku | sniping insiderow, czy wycena po krzywej jest uczciwa |
| @DegenerateNews | szybkie newsy memecoinowe, ogromny wolumen odpowiedzi | post-mortemy rugow: ten tryb awarii jest niemozliwy bez admina |
| @basedkarbon | glos spolecznosci natywnie z Base | Startpad jako infrastruktura Base-first |

### builderzy

| Handle | Dlaczego | Kat odpowiedzi |
| --- | --- | --- |
| @AustinAdams10 | wspolzalozyciel Dopplera, byly badacz Uniswapu | ksztalt krzywej kontra sniping, stala krzywa kontra uznaniowa alokacja |
| @guil_lambert | CEO Panoptic, hooki v4; przeciw rozszerzeniu oplat protokolu v4 | oplaty pod governance kontra reguly ustalone przy deployu - ta debata JEST nasza teza |
| @saucepoint | DevRel Uniswapu, autor `v4-template` | graduacja krzywa -> v4, gaz w `afterSwap`, kodowanie bitow uprawnien; wrzucac dzialajacy kod |
| @zachobront | niezalezny audytor (Spearbit, Sherlock) | powierzchnia ataku hookow: reentrancy w callbackach, manipulacja cena przy graduacji |

### dane

| Handle | Dlaczego | Kat odpowiedzi |
| --- | --- | --- |
| @DefiLlama | standard agregacji oplat/przychodow | zaoferowac publicznie surowy adapter oplat - prosba o listing jako odpowiedz, nie DM |
| @0xngmi | lead DefiLlamy, uczulony na marketing | "revenue or extraction?": oplaty weryfikowalne on-chain, brak admin fee switch |
| @adam_tehc | Dune, kanoniczne dashboardy oplat pump.fun | najcenniejszy cel tieru danych; zaproponowac adresy kontraktow do porownania po stronie Base |
| @CryptoKoryo | Dune, przychody launchpadow per venue | przekroj fees-captured kontra fees-returned |
| @DefiIgnas | pisze o meta launchow, przeswietla realny przychod | stala podaz i brak kluczy zespolu kontra tokeny z cliff-unlockiem |

**Lawka rezerwowych (wyciete w deduplikacji, nie odrzucone):** @coinbase,
@brian_armstrong, @CoinbaseDev (slabe dopasowanie, wysokie ryzyko ratio);
@bankrbot, @virtuals_io, @Uniswap, @haydenzadams (maks. raz w tygodniu);
@z0age, @pcaversaccio, @samczsun (odpowiadac wylacznie z realnym
znaleziskiem); @tokenterminal, @blockworksres, @hildobby.

**DLUG WERYFIKACYJNY - przeczytac przed uzyciem listy:** zaden z pieciu
przebiegow researchu nie sprawdzil handle'i ani aktywnosci na zywo
(X zwraca HTTP 402 przy automatycznym pobieraniu, leaderboardy Kaito
wygaszone w styczniu 2026). Przed wlaczeniem rotacji obejrzec wszystkie 22
konta pod katem swiezego posta. Konkretnie niepewne: @CryptoKoryo,
para @whetstonedotcc / @dopplerprotocol.

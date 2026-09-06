# SPHERE - tokenomika platformy Startpad

Spec projektowy. Stan na 2026-08-31 - statusy wykonania i proba Sepolia
domknieta (sekcja 9), podsumowanie brakow w sekcji 14; decyzje z 2026-08-30
(po dwoch rundach konsultacji: wewnetrzna
weryfikacja faktow + atak ekonomiczny, trzej niezalezni recenzenci
logika/UX/testy, oraz zewnetrzna recenzja agenta uzytkownika). Zrodla: research konkurencji (Flaunch,
Clanker, Bankr, pump.fun, Virtuals, Hyperliquid i inni - linki na koncu) oraz
mapa wlasnych kontraktow z `origin/master` (CurveLaunchpad, B20LaunchHook,
LiquidityVault - adresy i parametry z `scripts/output/launchpad-base.json`
i `docs/LAUNCHPAD-STAN.md`).

Konwencja jak w pozostalych dossier: decyzje nazwane wprost, ryzyka nazwane
wprost, kazdy mechanizm zakotwiczony w konkretnym pliku/funkcji.

Uwaga o zrodlach linii: wdrozenie Base pochodzi z commita mainnet-candidate
(2026-08-11); pozniejsza parametryzacja R_VIRT (f1264c2) jest behawioralnie
rownowazna przy 0.75 ETH (jedyna roznica: MAX_BUY 100 vs 99 ETH). Odwolania
file:line w tym dokumencie opisuja HEAD origin/master, nie bajtkod on-chain -
zaden cytowany parametr nie jest ta roznica dotkniety.

---

## 1. Cel

Token SPHERE ma robic trzy rzeczy naraz:

1. **Akumulowac wartosc z obrotu na Startpadzie** - im wiekszy wolumen
   wszystkich tokenow na padzie, tym silniejsza presja kupna na SPHERE
   (buyback finansowany realnym przychodem, nie emisja z powietrza).
2. **Nagradzac tworcow proporcjonalnie do wolumenu** ich tokenow - epokowe
   dropy SPHERE wazone wolumenem ("volume mining").
3. **Dawac powod, zeby SPHERE trzymac i stakowac** - mnozniki nagrod,
   real yield w ETH, utility (gaz, limity, vanity, featured board).

Zasada nadrzedna: **zero zmian we wdrozonych kontraktach**. Launchpad, vault
i hook sa zero-admin i immutable (bez ownera, pauzy, upgrade'u - doktryna
z naglowka CurveLaunchpad.sol:20). SPHERE zyje w peryferiach: Safe + nowe
kontrakty + indexer. Wszystko, co wymaga zmiany rdzenia, laduje w koszyku
"v2 przy ewentualnym redeployu" (sekcja 8).

## 2. Czego uczy konkurencja (skrot z researchu)

| Platforma | Mechanizm wartosci tokena | Nagrody tworcow | Lekcja dla nas |
| --- | --- | --- | --- |
| Flaunch (FLAY) | fee -> Progressive Bid Wall: pozycja ETH 1 tick pod cena, repozycjonowana co 0.1 ETH; BuyBackAndBurnFlay pali FLAY co 1 ETH | tworca 0-100% z 1% fee; prawa do przychodu jako zbywalne NFT (Memestream) | buyback jako sciana kupna = widoczne wsparcie, odporne na MEV; NFT praw do fee to tani wyroznik |
| Clanker (CLANKER) | staly 20% skim z LP fees -> automatyczny ciagly buyback-and-hold (~$400-500k/tydz.) + burn starych vaultow | czysto proporcjonalne do wolumenu (1-3% LP fee, do 7 odbiorcow bps) | automatyzacja + publiczny adres skarbca to cala wiarygodnosc; brak programu punktowego = luka do zagospodarowania |
| Bankr (BNKR) | 0.2375% KAZDEGO swapa kazdego tokena = zaszyty w hooku buyback BNKR; Bankr Club $20/mies.; sezon 450M BNKR / 120 dni | 0.665% wolumenu w ETH + leaderboard punktowy (Cookie.fun) | zaszyty slot buybacku w fee stacku to najczystsza akumulacja - u nas dopiero w v2; Club i sezony dzialaja od reki |
| pump.fun (PUMP) | pivot 04.2026: jednorazowy burn 36% supply + KONTRAKTOWE 50% przychodu netto na buyback (po tym, jak 100%-revenue-burn NIE utrzymalo ceny) | benchmark: 5 bps wolumenu w SOL, claim w kazdej chwili; potem taryfy malejace z mcap | nie palic 100%; zdyscyplinowany, kontraktowy procent + redystrybucja > czysty burn |
| Virtuals (VIRTUAL) | protokol odkupuje tokeny agentow PROPORCJONALNIE do fee, ktore wygenerowaly (TWAP 30 dni) i pali | nagroda idzie do spolecznosci tokena, nie tylko tworcy | "pad kupuje TWOJ token" to pitch rekrutujacy cale spolecznosci |
| LetsBonk (BONK) | ~polowa fee padu -> buy&burn BONK + cotygodniowe buybacki topowych tokenow z padu | - | routing fee w token platformy realnie przejal 54% rynku od pump.fun (07.2025) |
| Hyperliquid (HYPE) | Assistance Fund: 97-99% fees automatycznie na buyback (hold, nie burn), $1.3B+ | - | wzorzec mety: automat bez decyzji ludzkich + publiczny tracker |
| Jupiter (JUP) | kazdy launch placi 0.75% supply do DAO; stakerzy dostaja nagrody TYLKO gdy aktywnie glosuja (ASR) | - | "nagroda za dzialanie" to praktyczna mitygacja ryzyka securities |
| Zora | 1% fee: tworca 50%, referral platformy 20%, referral trade'u 4%, protokol 5%, 20% doklada single-sided LP | tworca placony wiecznie od wolumenu wtornego | dwie warstwy referral rekrutuja boty i agregatory - kandydat do v2 |

Konsens 2026: **kontraktowo wymuszony, zdyscyplinowany procent przychodu
(30-50%) na buyback; kupione tokeny lepiej redystrybuowac niz palic w 100%;
publiczny dashboard obowiazkowy** (analiza Tokenomist: buybacki "z ogloszenia"
rynek ignoruje).

## 3. Co juz mamy on-chain (inwentarz, zero nowego kodu)

Strumienie fee na Base (parametry wdrozenia: FEE_BPS=100, CREATOR_FEE_BPS=70,
PROTOCOL_SHARE_BPS=3000, GRAD_FEE_BPS=300, HOOK_FEE_BPS=100, POOL_FEE=3000):

| Strumien | Ile | Podzial | Gdzie ksiegowane |
| --- | --- | --- | --- |
| krzywa (buy/sell) | 1% w ETH | tworca do 70% przez `_feeReceivers` (do 8 adresow, shareBps suma 10000, mrozone przy launchu) / Safe min. 30% | `launchpad.claimable` |
| graduacja (raz) | 3% rezerwy | 50% wolajacy `graduate()` / 50% Safe | `launchpad.claimable` |
| hook po graduacji | 1% kazdego swapa | 70% tworca (minus dzialka `buybackBps` z nogi ETH) / 30% Safe; wymaga `settle(token)` | `hook.claimableEth/Token` |
| LP puli v4 | 0.3% kazdego swapa | 70% tworca / 30% Safe; wymaga `harvest(token)` | `vault.claimableEth/Token` |

UWAGA do wiersza LP: 0.3% dzieli sie pro-rata miedzy WSZYSTKIE pozycje LP
in-range; podzial 70/30 dotyczy tylko czesci naroslej na pozycji vaulta.
Kazde obce LP (takze nasz wlasny bid wall z sekcji 8) rozwadnia ten strumien -
kod hooka mowi to wprost (B20LaunchHook.sol:64-67). Strumien hooka 1% NIE
rozwadnia sie nigdy.

Klocki, na ktorych stoi caly projekt SPHERE:

1. **`buybackBps` + `executeBuyback` = gotowy buyback-and-burn.**
   Ustawiany raz przy `launchAdvanced`, wycina `buybackBps` z ETH-owej dzialki
   tworcy przy `settle()` do `pendingBuybackEth[token]`; bezuprawnieniowy
   `executeBuyback(token, minTokensOut, deadline)` kupuje token w JEGO wlasnej
   puli v4 (clamp poslizgu MAX_BUYBACK_SLIPPAGE_BPS=150 na sqrt-cenie, ~3% na
   cenie, czesciowe wykonania wracaja do pending) i wysyla WSZYSTKO na 0xdEaD
   (B20LaunchHook.sol:345-375). Token nie ma funkcji burn - "burn" to transfer
   na adres martwy, totalSupply bez zmian.
2. **`launchAdvanced` przyjmuje do 8 odbiorcow fee z krzywej** - odbiorca moze
   byc KONTRAKT (CurveLaunchpad.sol:852, walidacja :1006-1016). Jedyny wymog:
   musi przyjac goly `call{value}` (wyplata to `_sendEth`, :1530). To slot,
   w ktory wpinamy pule stakerow / skarbiec przy kazdym nowym launchu.
   UWAGA: odbiorcy dostaja TYLKO fee z krzywej; po graduacji dzialka tworcy
   idzie w calosci do pojedynczego `creatorOf[token]`.
3. **Wszystkie wyplaty sa pull + permissionless delivery**: `claimFor`,
   `claimEthFor`, `claimTokenFor` - ktokolwiek placi gaz, kierunek zaszyty.
   Keeper SPHERE moze zasysac salda Safe i kontraktow-odbiorcow cronem.
4. **Safe jako FEE_RECIPIENT to zamierzony zawor polityki.** Adres immutable
   we wszystkich trzech kontraktach, ale Safe jest programowalny (moduly
   Zodiac / polityka signerow) - sciezka "fee -> Safe -> buyback SPHERE"
   nie wymaga zadnej zmiany on-chain (decyzja z LAUNCHPAD-STAN.md).
5. **Eventy daja pelne dane do epok nagrod** (sekcja 7): wolumen per token
   i per tworca liczony w calosci z logow, bez zmian w kontraktach.
6. **`graduate()` placi wolajacemu 1.5% rezerwy** (~0.045 ETH przy pelnym
   raise na Base) - czysty, bezuprawnieniowy przychod dla keepera skarbca.
7. **Hook ma uprawnienia tylko BEFORE_INITIALIZE | AFTER_SWAP |
   AFTER_SWAP_RETURNS_DELTA (0x2044)** - zadnych hookow plynnosci, wiec osoby
   trzecie MOGA dokladac wlasne pozycje LP w kanonicznej puli. To otwiera
   droge dla bid walla na SPHERE (sekcja 6.1) bez dotykania hooka.

Twarde ograniczenia (co NIE jest mozliwe):

- config fee per token mrozony przy launchu - **starych tokenow nie da sie
  doposazyc** w slot SPHERE; program dziala od nowych launchy w przod;
- protokolowa noga zawsze laduje w Safe - splitter on-chain dopiero w v2;
- zaden strumien nie placi w trzecim tokenie - dystrybucja SPHERE musi byc
  finansowana ZAKUPEM za sciagniete ETH (to akurat zaleta: realna presja
  kupna zamiast emisji);
- salda `claimable` nie maja clawbacku - kontrakt-odbiorca wpisany do launchu
  musi istniec i byc zweryfikowany PRZED launchem, inaczej ETH przepada;
- tokeny z padu sa role-less, fixed 1B, bez mint/burn/tax - mechanika SPHERE
  nie moze zyc w srodku tokena, tylko w kontraktach obok.

## 4. Launch SPHERE - dogfood na wlasnym padzie

**Decyzja: SPHERE startuje przez wlasny Startpad** (`launchVanity`), nie jako
osobny ERC-20 z alokacjami. Powody: (a) narracja - "pierwszy token padu to
token padu", te same gwarancje co kazdy launch: staly 1B supply, zero mintu,
zero admina, LP zamkniete na zawsze; (b) `buybackBps` daje wbudowany
buyback-and-burn od pierwszego dnia bez nowego kodu; (c) Believe pokazal, jak
konczy token platformy bez twardej akumulacji - u nas akumulacja jest w padzie.

Konfiguracja launchu (wszystko mrozone na zawsze - stad tabela decyzji
w sekcji 9; wartosci ponizej to REKOMENDACJE):

| Parametr | Wartosc | Uzasadnienie |
| --- | --- | --- |
| sciezka | `launchVanity` z wymielonym adresem | branding; `predictVanityToken` jest front-run-safe (msg.sender w preimage). UWAGA: wzorzec vanity to TYLKO znaki hex 0-9a-f (app/utils/b20/addressing.ts: HEX_ALPHABET) - doslowne "SPHERE" niemozliwe (S/P/R nie sa hex); realne opcje to np. `5b1e2e`, `0000..`, prefiksy z substytucjami. Mielenie salta DOPIERO po wdrozeniu escrow (salt zalezy od adresu wolajacego) |
| `feeBps` | 100 (1%, max) | maksymalny strumien do ekosystemu |
| `creatorFeeBps` | 70 (70%, max) | maksimum do naszych odbiorcow, Safe i tak bierze 30% |
| `buybackBps` | 5000 | 50% ETH-owej dzialki tworcy z fee hooka kupuje i pali SPHERE - bezuprawnieniowo, ale NIE samo z siebie: wymaga `settle(token)` + `executeBuyback` (wola keeper albo ktokolwiek); druga polowa plynie do SphereCreatorEscrow |
| `receiverAccounts` | `[SphereRewards, SphereCreatorEscrow]` | fee z krzywej od razu zasila nagrody; oba kontrakty MUSZA byc wdrozone w FINALNEJ formie i przetestowane na przyjecie golego ETH przed launchem (adresy mroza sie na zawsze - patrz pulapka kolejnosci w sekcji 9, faza 0) |
| `receiverSharesBps` | `[6000, 4000]` | 60% nagrody / 40% escrow tworcy |
| `windowCap` | zwymiarowany pod dev-buy skarbca, NIE "ciasny" | dev-buy przechodzi przez ten sam `_buy` w oknie i PODLEGA temu samemu capowi per adres (CurveLaunchpad.sol:1129-1136) - ciasny cap zdusilby wlasna alokacje. Przeciw snajperom cap i tak nie broni (sybil-split na wiele adresow, docstring launchVanity :901-910; cap wygasa po LAUNCH_WINDOW=300 s). Realna ochrona skarbca = atomowosc dev-buy w tx launchu |
| dev-buy (`msg.value`) | definiowany jako % PODAZY, nie kwota ETH (przy obecnej krzywej ~0.0842 ETH kupuje ~10% podazy - krzywa jest tania na starcie) | jedyna droga do alokacji skarbca - atomowy zakup po cenie startowej w tx launchu (nie do wyprzedzenia), jawny on-chain; refund z `_buy` wraca do escrow (CurveLaunchpad: `_sendEth(msg.sender, refund)`), wiec escrow musi go zaksiegowac. Konsekwencja windowCap: cap w tokenach per adres, wiec cap przepuszczajacy escrow z X% podazy przepuszcza KAZDY inny adres z X% przez pierwsze 300 s - wielkosc dev-buy to jednoczesnie decyzja, ile dajemy snajperom per adres. Dev-buy NIE finansuje sezonow nagrod - kupione SPHERE idzie od razu do jawnego locka/vestingu (decyzja #11); sezony finansuje strumien fee i transze buybacku |
| kto wola launch | **SphereCreatorEscrow - immutable, non-custodialny kontrakt, NIE Safe operacyjny i NIE EOA** | `creator = msg.sender` na zawsze; po graduacji CALA dzialka tworcy (hook + LP) plynie do `creatorOf[SPHERE]` = wolajacego. Rozdzial rol ogranicza promien razenia kompromitacji: escrow tworcy (strumien), Safe operacyjny (polityka), guardian Merkle (roots), keeper (bez uprawnien) - cztery osobne klucze, patrz sekcja 8 |

**Co NAPRAWDE daja parametry 60/40 i buybackBps=5000** (efektywny podzial
per strumien - zeby nikt nie czytal "50% przychodu sie pali", bo to nieprawda):

| Strumien | Safe | SphereRewards | CreatorEscrow | 0xdEaD (burn) |
| --- | --- | --- | --- | --- |
| fee z krzywej (1%) | 30% | 42% (60% x 70%) | 28% (40% x 70%) | 0% |
| hook fee naliczone w ETH (1%) | 30% | 0% | 35% | 35% (buybackBps tnie tylko noge ETH tworcy) |
| hook fee naliczone w SPHERE | 30% | 0% | 70% | 0% |
| LP fee (0.3%, pro-rata pozycji vaulta) | 30% | 0% | 70% | 0% |

Wnioski: split 60/40 dotyczy TYLKO 70-procentowej dzialki tworcy na krzywej;
`buybackBps=5000` pali 50% dzialki tworcy tylko z ETH-owej nogi hooka (35%
takiego fee, nie 50% przychodu); po graduacji SphereRewards NIE dostaje nic
automatycznie - cala strona tworcy idzie do escrow (`creatorOf`). Kazda
komunikacja liczb musi wychodzic z tej tabeli.

Zycie po launchu: krzywa jak kazdy token. Krzywa domyka sie (Locked), gdy
tokenReserve spadnie do T_MIN=200M tokenow - co przy pelnym raise odpowiada
~3.0 ETH rezerwy (4*R_VIRT); `graduate()` jest OSOBNYM, bezuprawnieniowym
wywolaniem, a w stanie Locked sprzedaz jest otwarta, wiec rezerwa (i nagroda
wolajacego) moze spasc przed awansem. Potem pula v4 ETH/SPHERE z hookiem,
LP vaulta zamkniete na zawsze, ~4.5% supply na 0xdEaD przy seedzie
(mechanika standardowa).

## 5. Petla wartosci: przychod protokolu -> buyback -> nagrody

Safe zbiera protokolowa noge ze WSZYSTKICH tokenow na padzie. Petla:

```
wolumen wszystkich tokenow na padzie
  -> fee (krzywa 1% / grad 3% / hook 1% / LP 0.3%)
  -> noga protokolu -> Safe (claimFor/claimEthFor/claimTokenFor - keeper, cron)
  -> polityka Safe: X% przychodu epoki -> SphereBuyback     [REKOMENDACJA: X=50%]
  -> SphereBuyback kupuje SPHERE w kanonicznej puli v4
       |- 20% kupionego -> 0xdEaD (burn - naglowkowa, mierzalna deflacja)
       |- 80% kupionego -> SphereDistributor (pula nagrod epoki)
  -> tworcy odbieraja SPHERE przez Merkle claim (sekcja 6)
```

Dlaczego buyback-and-redistribute, nie czysty burn: pump.fun palil 100%
przychodu i cena tego nie utrzymala; wygraly modele Hyperliquid (automat,
hold) i hybrydy (LetsBonk, Virtuals). U nas kupione SPHERE placi tworcom -
presja kupna + tworcy trzymaja SPHERE, bo to ich wyplata. Maly staly burn
(20%) zostaje dla narracji i mierzalnosci.

Uwagi wykonawcze:

- **Wyciek przy zakupie jest w wiekszosci zawracany**: kupno SPHERE przez
  kanoniczna pule placi 1.3% (0.3% LP + 1% hooka), z czego 70% wraca do
  `creatorOf[SPHERE]` (= SphereCreatorEscrow) i do LP vaulta, a 30% do
  Safe. Realny
  koszt zewnetrzny to poslizg, nie fee.
- **MEV - kluczowa sprzecznosc do rozstrzygniecia w kodzie, nie w keeperze**:
  "permissionless execute + losowe/prywatne transze keepera" NIE sklada sie -
  skoro kazdy moze zawolac buyback, napastnik nie czeka na naszego keepera,
  tylko sam odpala zakup w zmanipulowanym momencie. Losowosc timingu nic nie
  daje, jesli nie wymusza jej kontrakt. Dlatego SphereBuyback SAM egzekwuje:
  maksymalna transze i budzet dzienny/epokowy, limit ceny + minOut, minimalna
  plynnosc puli, maksymalny price impact, wiek/odchylenie zrodla ceny,
  oraz pauze/cancel PRZED wykonaniem (nigdy po). Clamp ze spotu w tym samym
  tx (wzor `executeBuyback`) tylko ogranicza strate, nie usuwa sandwicha -
  mowi to wprost komentarz w hooku. UWAGA na zrodlo ceny: pula v4 NIE
  przechowuje historii TWAP (core udostepnia tylko biezacy slot0 przez
  StateLibrary) - referencje cenowa trzeba zbudowac osobno (wlasny kontrakt
  obserwacji checkpointowany przez keepera / zewnetrzny oracle) i to jest
  osobny element projektu, nie przypis. Wariant bid-wall (sekcja 8) ma
  wlasny wektor griefingu (sprzedaz w sciane -> odkup nizej) - cap
  wielkosci sciany na repozycje.
- **Wolumen buybacku NIE liczy sie do volume mining**: swap SphereBuyback
  przechodzi przez kanoniczna pule normalnie (fee-exempt jest tylko wlasna
  sciezka hooka), wiec emituje HookFeeTaken i wygladalby jak organiczny
  wolumen SPHERE - a `creatorOf[SPHERE]` = nasz escrow, czyli protokol
  farmilby wlasne epoki za ETH protokolu. Indexer wyklucza SPHERE oraz
  swapy, ktorych nadawca to SphereBuyback/skarbiec. DECYZJA: SPHERE nie
  uczestniczy we wlasnym volume mining.
- **Uczciwosc komunikacji w fazie 0**: dopoki "X% przychodu na buyback" nie
  wymusza kod, NIE publikujemy tego jako zobowiazania. WAZNE: modul Zodiac
  NIE jest ta gwarancja - wlasciciele Safe moga modul wylaczyc zwykla
  transakcja (dokumentacja Safe), wiec Zodiac to automatyzacja
  i przejrzystosc, nie nieusuwalny przymus. Jedyna twarda wersja to
  immutable splitter jako FEE_RECIPIENT przy redeployu v2 (faza 3). W fazie 0 jako gwarancje komunikujemy WYLACZNIE to, co
  wymusza lancuch: auto-burn z `buybackBps`, zamrozony split receiverow,
  atomowy dev-buy. Transze uznaniowe oznaczamy jako uznaniowe, kazda jawnie
  on-chain (dokladnie ta rozroznialnosc, ktorej rynek wymaga wg analizy
  Tokenomist).
- **Przejrzystosc**: publiczny dashboard buybackow (adres SphereBuyback,
  historia transz, spalone, rozdystrybuowane).

## 6. Volume mining - nagrody dla tworcow

### 6.1 Mechanika epok

- Epoka: **7 dni** (start srodowy, snapshot po `settle`+`harvest` batchem
  keepera, zeby saldo odzwierciedlalo pelne fee epoki).
- Indexer (rozszerzenie planowanego "indeksera-lite" z LAUNCHPAD-STAN.md)
  liczy ETH-wolumen kazdego tokena i grupuje po tworcy (sekcja 7).
- Pula epoki = SPHERE kupione przez SphereBuyback w tej epoce (80% transz).
- **Glowny bezpiecznik anty-wash to cap PER TWORCA, nie relacja
  pula-vs-fee.** Sama regula "pula < zebrane fee" NIE wystarcza: tworca
  odzyskuje 70% kazdego fee od wlasnego tokena (rabat przez `_feeReceivers`,
  CurveLaunchpad.sol:1418-1460), wiec jego koszt netto prania to tylko
  30-procentowa noga protokolu - i przy agregatowym bezpieczniku moglby
  skimowac pule finansowana cudzym, uczciwym wolumenem. UWAGA (recenzja
  zewnetrzna): cap na poziomie 100% wkladu daje najwyzej BREAK-EVEN, nie
  gwarantowana strate - potrzebny margines. Niezmienniczosc wlasciwa:

  `koszt_nagrody_tworcy <= BETA x zrealizowany_zewnetrzny_ETH_protokolu_od_jego_tokenow`

  gdzie BETA nie przekracza faktycznej czesci przychodu finansujacej
  nagrody (przy 50% buybacku i 80% redystrybucji max ~40%, rekomendacja
  z marginesem: 30%). Zasady liczenia (sezon 1):
  - liczyc WYLACZNIE faktycznie zrealizowane zewnetrzne ETH (nogi protokolu
    z `FeeAccrued` kind 0/2, `HookFeeSettled.ethToProtocol`, ETH-noga
    `LpFeeAccrued`);
  - nogi TOKENOWE traktowac jako inventory, NIE revenue, dopoki nie
    zostana bezpiecznie sprzedane (kurs tokena tworcy podlega jego wlasnej
    manipulacji - wycena po pompowanym spocie zawyzalaby cap);
  - wykluczyc auto-buybacki, likwidacje fee, treasury swaps, rebalans
    bid-walla i wlasne adresy tworcy;
  - epoki liczyc po zakresach BLOKOW [startBlock, endBlock) z finality
    lagiem - nie po czasie `settle`/`harvest` (settle jest bezuprawnieniowe,
    wiec timing przypisania bylby gietka zmienna w rekach kazdego);
    per-swap zrodlem jest `HookFeeTaken` (30% kazdego), `HookFeeSettled`
    tylko jako cross-check;
  - LP fee tymczasowo POZA capem, jesli nie da sie go deterministycznie
    przypisac do blokow;
  - puli NIE trzeba rozdawac w 100% - leftover przechodzi na kolejna epoke.
  Nagroda jest w SPHERE, koszt tworcy w ETH - do porownania uzywac JEDNEGO
  numeraire: koszt SPHERE liczony po realnym VWAP transz buybacku.
  Relacja "pula < fee" zostaje jako wtorna higiena budzetu, nie gwarancja.
- Dystrybucja: **kumulatywny Merkle distributor** na bazie
  `universal-rewards-distributor` Morpho - ale UWAGA (recenzja zewnetrzna):
  **stockowy URD NIE wystarcza**: owner moze ominac timelock (`setRoot`
  wprost), updater moze nadpisac pending root, kontrakt trzyma JEDEN
  aktualny root (po akceptacji nowego stare proofy nie dzialaja - kazdy
  nowy kumulatywny root MUSI zachowac wszystkie wczesniejsze naleznosci).
  Potrzebny audytowany fork/wrapper z: PROPOSER_ROLE, osobnym VETO_ROLE
  (guardian anuluje pending, nigdy nie ustawia), immutable minimalnym
  opoznieniem, sekwencyjnymi numerami epok, wymuszona monotonicznoscia
  naleznosci (nowy root >= stary per konto), kontrola
  `balance >= outstanding claims`, kanonicznym manifestem danych
  wejsciowych i hashem algorytmu. Root co epoke, dane per-token/per-creator
  publikowane, indexer deterministyczny i publicznie odtwarzalny.
- **Uczciwie o "oknie sporu"**: spor osoby trzeciej nie ma zadnej mocy
  on-chain - moc ma tylko VETO_ROLE. Do czasu wdrozenia guardiana
  komunikujemy mechanizm jako "trusted root z opoznieniem", nie "sporny".
- **Streaming wyplat (wzor Streme/Superfluid, decyzja 2026-08-30)**: nagroda
  epoki NIE wyplaca sie jednorazowo, tylko uwalnia LINIOWO przez nastepna
  epoke (odbior naroslej czesci w kazdej chwili; dashboard pokazuje licznik
  rosnacy co sekunde). Wplywy do systemu i tak sa partiami (claimable ->
  claim/settle/harvest), wiec model to: partie -> bufor -> ciagle uwalnianie.
  Korzysci: UX jak streaming bez wrappera i bez zaleznosci od Superfluid
  ORAZ wygladzenie presji sprzedazy nagrod (nikt nie dostaje calosci w dniu
  snapshotu). Warunki brzegowe: (a) leaf ZOSTAJE kumulatywny (monotonicznosc
  URD-forka) - vesting liczy sie od PRZYROSTU vs poprzednia kumulacja konta
  (snapshot przy pierwszym claimie po nowym roocie albo drugi proof), co
  wchodzi w zakres audytu z fazy 1B (`balance >= outstanding` musi
  uwzgledniac nieuwolnione); (b) `streamStart` dopiero PO uplywie okna weta
  roota - weto nie moze anulowac strumienia, ktory juz plynie; (c) streaming
  zyje w SphereStreamingMerkleDistributor, NIGDY w wiecznym escrow.
  Superfluid GDA (wrapper SPHEREx, pule z jednostkami) zostaje OPCJA fazy 2
  wylacznie dla stakingu i wylacznie z jednostkami wazonymi wynikiem
  kuracji, nie sama liczba stakowanych tokenow; streamingu ETH do pasywnych
  stakerow NIE robimy (zmienia technike wyplaty, nie ryzyko profit-sharingu).

### 6.2 Wagi i anty-abuse

Waga tworcy w epoce = suma po jego tokenach z korektami (regula 0 jest
niezmienniczoscia nadrzedna, reszta to zasady podzialu):

0. **cap per tworca = wklad netto jego tokenow do fee protokolu w epoce**
   (sekcja 6.1) - z wylaczeniem wolumenu z wlasnych adresow tworcy tam,
   gdzie indexer umie go przypisac;
1. **cap 10% puli na pojedynczy token** - jeden viral token nie zjada epoki;
2. **waga sqrt(wolumen)** ponizej capa - splaszcza przewage wielorybow;
3. **mnoznik unikalnych traderow** (progi: <10 traderow -> 0.5x, 10-100 ->
   1.0x, >100 -> 1.2x) - kara dla samograjow;
4. **taryfy mcap** (wzor pump.fun Ascend): pelna stawka dla srodkowego
   przedzialu, obnizona dla swiezych mikro (chwilowe rugi) i dla >$20M
   (i tak plynne);
5. **mnoznik stakingu tworcy** 1.0x-2.5x (sekcja 6.3);
6. tokeny musza byc >48h po launchu, zeby wejsc do epoki (anty churn-and-relaunch).

Parametry wag sa POZA lancuchem (indexer + publikowane dane + okno sporu),
wiec mozna je stroic miedzy sezonami bez zmian w kontraktach.

### 6.3 Staking SPHERE

Wzorzec "nagroda za dzialanie" (Jupiter ASR / GMX), swiadomie NIE pasywna
dywidenda (ryzyko securities przy pasywnym profit-sharingu - patrz sekcja 10):

- **Tworca stakuje SPHERE** -> mnoznik wagi volume mining 1.0x -> 2.5x
  (schodki wg stake'u; nagroda za WLASNA prace, nie za cudza);
- **Staker-kurator**: udzial w ETH z `SphereStaking` (akumulator
  `rewardsPerToken`, zasilany ze slotu `SphereRewards` w `feeReceivers`
  nowych launchy) - ale sama obecnosc/glos NIE wystarcza, bo darmowy,
  nieweryfikowany glos jest trywialnie botowalny (znany failure mode
  Jupiter ASR) i unicestwia argument "nagroda za prace". Kuracja jest
  **rozliczana wynikiem**: nagroda wazona tym, czy kurowane tokeny osiagnely
  po fakcie obiektywny prog (wolumen/przezywalnosc), a losowe/niskiej
  jakosci glosy przepadaja w danej epoce;
- **Utility bez progu**: znizki-limity operacyjne (sponsorowany gaz,
  limity deployow, mining vanity, analityka). Opcjonalnie pozniej
  "Sphere Club" - abonament platny w SPHERE (wzor Bankr Club $20/mies.).

Uwaga: znizki NIE moga dotyczyc samych fee kontraktow (immutable). Znizki =
rzeczy, ktore i tak sa nasze: gaz sponsorowany, funkcje UI, limity API.

## 7. Dane: indexer epok (bez zmian on-chain)

Zrodla per faza zycia tokena:

- **Krzywa** (jedyne zrodlo przed graduacja - zaden zewnetrzny indekser nie
  widzi tych tokenow, brak puli):
  - `Launched(token, creator, launchId, ...)` - kanoniczne wiazanie
    token->tworca + config fee;
  - `Bought(token, buyer, ethIn, ethNet, feeEth, tokensOut, refund, ...)` -
    wolumen kupna = `ethNet`;
  - `Sold(token, seller, tokensIn, ethGross, feeEth, ethOut, ...)` -
    wolumen sprzedazy = `ethGross`;
  - `FeeAccrued(token, account, amount, kind)` - przychod fee wprost
    (kind: 0 protokol-trade, 1 tworca-trade, 2 protokol-grad, 3 caller-grad);
    cross-check fee: przy SELL fee = ethGross * feeBps / 10000 (w gore);
    przy BUY fee liczone od kwoty BRUTTO (mulDivUp(ethIn, feeBps, 10000),
    CurveLaunchpad.sol:1176), a wolumen definiujemy jako ethNet - wiec
    fee ~= ethNet * feeBps / (10000 - feeBps), NIE ethNet * feeBps
    (dla 1%: fee = 1.0101% ethNet). Najprosciej: brac fee wprost z pola
    `feeEth` eventow Bought/Sold zamiast liczyc.
- **Granice zycia**: `CurveLocked`, `Graduated(token, poolId, ...)` -
  `poolId` do sledzenia dalej w v4.
- **Po graduacji**:
  - `HookFeeTaken(token, isEth, amount)` na swapach kanonicznej puli:
    wolumen strony ~= `amount * 100` (fee zaokraglane w gore o <1 wei, wiec
    proxy przeszacowuje wolumen o <100 wei - pomijalne). DWA WYJATKI:
    (a) swap wlasnego `executeBuyback` hooka NIE placi fee i NIE emituje
    HookFeeTaken (early return w afterSwap) - wolumen buybackow czytac
    z `AutoBuyback` / eventow `Swap` PoolManagera; (b) swapy, na ktorych
    fee zaokraglilo sie do zera. Do dokladnych kwot: eventy `Swap`
    PoolManagera filtrowane po `poolId` z `Graduated`;
  - `HookFeeSettled`, `LpFeeAccrued`, `Harvested` - przychody splitow;
  - `AutoBuyback(token, ethIn, tokensBought, caller)` - dashboard burnow.

Wolumen ETH tokena = suma(ethNet) + suma(ethGross) + strona ETH po graduacji.
Wolumen tworcy = grupowanie po `Launched.creator` (albo `launchOf(token)` /
`vault.creatorOf(token)` - to samo zrodlo, ktoremu ufa hook).

Multi-chain: klucz danych = (chainId, adres launchpada), allowlist z
`scripts/output/launchpad-*.json` + deployBlock; martwe stare wdrozenia poza
allowlista. Sezon 1 SPHERE liczy WYLACZNIE Base mainnet.

## 8. Nowe kontrakty (peryferia) + wydziwienia

Kazdy kontrakt maly, bez admina tam, gdzie sie da, w duchu doktryny padu.

Rozdzial rol i kluczy (ogranicza promien razenia jednej kompromitacji -
`creatorOf[SPHERE]` jest immutable, wiec kto trzyma tworce, trzyma wieczysty
strumien; ten sam podmiot NIE moze trzymac naraz strumienia, polityki
i rootow):

| Kontrakt | Rola | Kluczowe wlasciwosci |
| --- | --- | --- |
| `SphereCreatorEscrow` | immutable, NON-CUSTODIALNY kontrakt: wola `launchVanity` (zostaje `creatorOf[SPHERE]`), przyjmuje dzialke tworcy i dev-buy, wypuszcza srodki wg zaszytej reguly (np. staly split buyback/operacje) | zero admina; osobny byt od Safe operacyjnego - kompromitacja Safe NIE zabiera strumienia tworcy. WYMOG TWARDY (konsultacja 2026-08-30): strumien tworcy przychodzi w DWOCH aktywach - ETH (`claimEthFor`) ORAZ tokenach SPHERE (`claimTokenFor` z hooka i vaulta, plus dev-buy laduje w escrow) - regula wyjscia MUSI obejmowac strone tokenowa (transfer/vesting/burn - cokolwiek, byle istnialo), inaczej tokeny uwiezione na zawsze. Do tego one-shot wzorzec podania vanitySalt i configu (przewidziec adres escrow -> wymielic salt -> zapiac w konstruktorze, albo jednorazowy trigger) - decyzja #11 w sekcji 10 |
| `SphereTreasury` (Safe operacyjny) | polityka transz w fazie 0, operacje, granty | osobne klucze od guardiana Merkle |
| `SphereRewards` | odbiorca w `feeReceivers` nowych launchy - **pasywny pull-hub**: TYLKO akumuluje ETH; pozniejsze kontrakty (staking/buyback) POBIERAJA z niego wg wlasnej ksiegowosci | `receive()` przyjmuje zawsze; ZERO forwardowania do celow, ktore jeszcze nie istnieja - adres mrozi sie w launchu SPHERE na zawsze, wiec musi byc finalny od fazy 0. WYMOG TWARDY (konsultacja 2026-08-30): "pasywny pull-hub" bez schematu autoryzacji poboru NIE jest kontraktem finalnym - czysty akumulator z golym `receive()` zamurowalby 60% dzialki tworcy SPHERE na zawsze (salda claimable nie maja clawbacku). Mechanizm autoryzacji zaprojektowany i przetestowany PRZED launchem: (a) jednorazowy set-consumer za timelockiem z wetem guardiana, (b) pull-right dla adresu precommitowanego przez CREATE2 (salt + hash kodu przyszlego stakingu opublikowane z gory), albo (c) NAJPROSTSZY BEZPIECZNY MVP: dedykowany Rewards Safe (multisig) jako receiver - uznaniowy, ale NIGDY nie zamuruje srodkow; kosztem jest to, ze routing do stakingu z fazy 2 pozostaje na zawsze polityka, nie gwarancja (i tak trzeba to komunikowac). Decyzja #12 w sekcji 10 |
| `SphereBuyback` | ETH -> zakup SPHERE w kanonicznej puli; split 20% dEaD / 80% Distributor | limity egzekwowane W KONTRAKCIE (nie w keeperze - patrz sprzecznosc w sekcji 5): max transza + budzet epokowy, limit ceny wzgledem zewnetrznego zrodla obserwacji (pula v4 nie ma TWAP - osobny kontrakt checkpointow), minimalna plynnosc, max price impact, minOut, pause/cancel przed wykonaniem; stale splity immutable |
| `SphereStreamingMerkleDistributor` | audytowany fork/wrapper URD (NIE stock): PROPOSER_ROLE + VETO_ROLE, immutable min. opoznienie, sekwencyjne epoki, monotonicznosc naleznosci, balance >= outstanding (Z nieuwolnionymi), manifest danych + hash algorytmu; przyrost epoki uwalniany LINIOWO przez nastepna epoke (streamStart po oknie weta), claim naroslej czesci w kazdej chwili | guardian = osobny multisig, anuluje pending root, nigdy nie ustawia |
| `SphereStaking` | stake SPHERE, akumulator ETH `rewardsPerTokenX128`, kuracja rozliczana wynikiem | minimalny okres stake'u; brak lock 4-letnich (przesada na start) |
| `SphereKeeper` | cron: `graduate` (zgarnia caller reward), `settle`+`harvest` batch przed snapshotem, `claim*For` na salda Safe/odbiorcow, `executeBuyback` | bez uprawnien - wszystko, co wola, jest permissionless |

Wydziwienia (wyrozniki, kolejnosc wg stosunku efekt/koszt):

1. **Bid wall na SPHERE** (wzor Flaunch PBW): osobny kontrakt utrzymuje
   pozycje ETH 1 tick pod cena w kanonicznej puli SPHERE, repozycjonowana
   progowo (np. co 0.1 ETH doplywu). Mozliwe, bo hook nie ma uprawnien
   liquidity (0x2044) - kazdy moze dokladac wlasne pozycje. Buyback widoczny
   jako sciana kupna, bez poslizgu i sandwicha. Wariant zamiast/obok
   market-buy w SphereBuyback.
2. **Ecosystem buyback** (wzor Virtuals/LetsBonk) - **TYLKO faza 2+,
   z twardymi warunkami**. Naiwna wersja ("kupujemy TOP tokeny wg fee") jest
   drenowalna: tworca nabija fee tanio (koszt netto ~0.6% obrotu po rabacie
   70%), wchodzi do TOP, protokol kupuje jego token za ETH z Safe, a tworca -
   trzymajac wiekszosc stalego 1B supply - sprzedaje w bid protokolu. TWAP
   30 dni wymusza tylko wytrwalosc prania, nie zmienia znaku transakcji.
   Warunki brzegowe: (a) budzet buybacku tokena <= noga protokolu NETTO,
   ktora ten token realnie wygenerowal (po odjeciu wolumenu z adresow
   tworcy) - ten sam prymityw indexera co regula 0 z sekcji 6.2;
   (b) prog >100 unikalnych traderow; (c) **buy-and-burn albo buy-and-lock,
   nigdy buy-and-hold** - zeby tworca nie mial stojacego bidu do zrzutu.
   Nie wdrazac, dopoki ksiegowosc per-token-netto nie dziala w praktyce.
3. **NFT praw do fee tworcy** (wzor Memestream): zeby NFT obejmowal CALY
   strumien (krzywa + hook + LP po graduacji), kontrakt-escrow musi byc
   **wolajacym launchu** (to on staje sie `creatorOf`) - sam wpis do
   `_feeReceivers` lapie wylacznie fee z krzywej, bo `settle`/`harvest`
   placa na sztywno do `creatorOf[token]`. Escrow: immutable,
   non-custodialny, wyplata warunkowana aktualnym posiadaniem NFT
   (`claim*For` dostarcza srodki do escrow bezuprawnieniowo, wiec miedzy
   dostawa a wyplata escrow przechowuje cudze ETH - bez tych wlasnosci to
   wektor rugu). Frakcjonalizacja wymaga zdefiniowanej logiki pro-rata
   ZANIM ja ogłosimy. To ten sam wzorzec escrow-as-creator, ktorego uzywa
   sam SPHERE (SphereCreatorEscrow, sekcja 8) - dziala tylko dla launchy,
   ktore od pierwszego dnia wskazaly escrow.
4. **Sezony punktowe** (wzor Bankr): stala alokacja SPHERE na sezon
   (z transz buybacku, NIE z emisji), leaderboard tworcow i traderow,
   25-50% nagrod sezonu vestuje w nastepny (retencja).

## 9. Fazowanie wdrozenia (kolejnosc po recenzji zewnetrznej 2026-08-30)

**Gate 0 - stan po decyzjach wlasciciela 2026-08-31:**

1. Klasyfikacja prawna przed tokenem (MiCA itd.): **ODLOZONA - decyzja
   wlasciciela.** PODNIESIONE RYZYKO, nazwane wprost (jak audyt zewnetrzny
   w LAUNCHPAD-STAN.md): launch z krzywa, dev-buyem i buybackami niesie
   ryzyko regulacyjne, ktore wlasciciel bierze na siebie swiadomie.
   Nie wraca jako blokada; moze wrocic na zyczenie wlasciciela.
2. Lista gwarancji on-chain vs jawnie uznaniowych polityk (tabela z sekcji 4
   jako podstawa) - ZOSTAJE, bo to kwestia uczciwej komunikacji, nie prawa.
3. Rozdzial rol i multisigi: **ODLOZONE - decyzja wlasciciela.** Wszystkie
   role peryferii SPHERE (CONSUMER huba, BENEFICIARY vestingu, POT, OPS)
   moga wskazywac istniejacy Safe 1/1 `0x83E2...4142F`. Konsekwencja
   nazwana wprost: JEDEN klucz kontroluje przychod protokolu, strumien
   tworcy SPHERE i pobor nagrod - utrata/kradziez klucza = utrata calosci.
   Zaleta Safe: adres zostaje, wlascicieli i progi mozna dolozyc POZNIEJ
   bez zmiany czegokolwiek on-chain.
4. Pelna ksiega przeplywow KAZDEGO ETH i KAZDEGO tokena (tabela efektywna
   z sekcji 4 + routing escrow z decyzji #11) - ZOSTAJE.
5. Los SPHERE z dev-buy: ZDECYDOWANE (#11a - vesting).

**Gate 1 - nieodwracalna specyfikacja launchu:**

6. Finalny `SphereCreatorEscrow`: exact-parameter launch (zahashowane
   parametry, jednorazowa autoryzacja - obca osoba nie moze odpalic escrow
   z inna nazwa/splitem/saltem), vesting dev-buya, routing ETH i SPHERE
   (hook + LP + refund), zero admina po launchu.
   ZAIMPLEMENTOWANE: contracts/launchpad/sphere/SphereCreatorEscrow.sol
   (+ SphereTokenVesting.sol dla #11a); 17 + 9 testow zielonych.
7. Finalny model `SphereRewards`: dedykowany Rewards Safe ALBO kontrakt
   z w pelni okreslonymi uprawnieniami poboru (decyzja #12).
   ZAIMPLEMENTOWANE: contracts/launchpad/sphere/SphereRewards.sol
   (hub z immutable CONSUMER, wariant (c)); 15 testow zielonych.
8. Dopiero wtedy liczby: `buybackBps`, receiver split, dev-buy jako %
   podazy, `windowCap`, `minTokensOut`, nazwa, symbol, `metadataURI`.
   PRZECWICZONE na Sepolii przez scripts/launchpad/deploySphere.ts
   (dev-buy 0.01 ETH); POZOSTAJE potwierdzenie finalnych liczb mainnet
   przez wlasciciela przy launchu.
9. Po wdrozeniu escrow - mielenie vanity salt (hex-only, patrz sekcja 4).
   DZIALA: scripts/sphere/mineSalt.js; salt Sepolii `0x...1862a` wymielony
   dla przewidzianego adresu escrow (ogon `ba5ed`).
10. Fork E2E, fuzz/inwarianty, niezalezny review i pelna proba
    launch -> dev-buy -> graduate -> settle/harvest -> claims
    (plan: docs/SPHERE-TESTY-PLAN.md).
    ZAIMPLEMENTOWANE: 66 testow w 7 plikach test/Sphere*.test.ts
    (unit Ring 1 + lifecycle + fork Base Ring 2 + distributor + buyback
    + vesting); pelna proba na zywej sieci - patrz Sepolia ponizej.

**PROBA GENERALNA SEPOLIA - DOMKNIETA 2026-08-31.** Token
`0xb200000000000000000000Ba5ED02Ebf7B04aDBc` (ogon vanity `ba5ed...`) na
Base Sepolia przeszedl CALA petle fazy 0 na prawdziwej sieci: formula
vanity == precompile co do bitu, escrow-as-creator, atomowy dev-buy,
domkniecie krzywej (top-up clamp wyladowal dokladnie na T_MIN), graduacja
na prawdziwym PoolManagerze v4, swapy, settle/harvest, dostawy claim*For,
PIERWSZY PRAWDZIWY AUTO-BURN (12 131 SPHERE -> 0xdEaD), release() 50/50
i pull() konsumenta. Narzedzia: scripts/launchpad/deploySphere.ts (deploy
peryferii + launch w jednym przebiegu) i scripts/sphere/sepoliaRunbook.ts
(petla po launchu). Rekord: scripts/output/sphere-base-sepolia.json
(runbook domkniety 2026-08-31T01:34Z; launchpad Sepolia
`0xb890e74899c2c87a8763259696A3ca3A86a13575`, escrow
`0x9255b78755d763dD17F17B3d5D11179950118dD6`, rewards
`0xe94Dd931c98c6269219bc56f6Af296C8333412Ed`, vesting
`0xB37e1A8B979D3Ae2d9efe1cf0A92E6Ec923ce2dB`). Hashe dowodowe:

- swap ETH -> SPHERE:
  `0x2cf59ad5bcc99554fe90bf3c398b8f369fcaaac6965d3ee13cefcbfb9d89f2ea`
- swap SPHERE -> ETH:
  `0xc790a0d5f75bd72935c4d9e7df9445002025171de70e319798b35fb6db5d1672`
- settle:
  `0x5ef13fe61ff687a75d5a685dea72fc54c666f423f3a4b9d2cd3262ac660f652e`
- harvest:
  `0x6fa922cd7e7d01c1e3b7c54c776f736e0ba60222a34e959676a16de9babb0206`
- executeBuyback (auto-burn):
  `0x672984c12fbee72b3da9d9cb65f86ee9a8dfe8682f9a4ef28f425a3d733ed781`

Runbook przedmainnetowy z LAUNCHPAD-STAN jest tym
samym WYCZERPANY - do launchu na Base zostaje wylacznie decyzja wlasciciela
i gaz na deployerze (~0.02 ETH).

**Faza 0 - launch:**

- opublikowany manifest: adresy, hashe bytecode, parametry, calldata launchu;
- dashboard v0 gotowy PRZED transakcja launchu;
- dev-buy kierowany od razu do jawnego locka/vestingu;
- transze Safe opisane wylacznie jako uznaniowe (sekcja 5);
- przygotowany scenariusz "SPHERE dlugo nie graduuje" (kto i na jakich
  zasadach moze dokupywac na krzywej po oknie startowym - decyzja #13);
- Kryterium wyjscia: SPHERE graduowany, pula v4 zyje, pierwszy
  `executeBuyback` wykonany.

**Faza 1A - dane, zanim popłyna produkcyjne wyplaty
[ZAIMPLEMENTOWANE 2026-08-31, galaz sphere-tests - shadow BIEGNIE]:**

- deterministyczny indexer po zakresach blokow: DZIALA
  (app/startpad/sphere/season/epochMath.ts - czyste funkcje, publicznie
  odtwarzalne; API app/api/sphere/season skanuje logi sekwencyjnie
  z rotacja RPC) + UI /startpad/sphere/season (Week #N, kafle, wykres
  dziennego wolumenu, leaderboard z breakdownem "why this number",
  link "Verify the math" do surowych danych);
- sezon 1 liczony WYLACZNIE z realized external ETH: DZIALA - pierwszy
  przebieg na zywym mainnecie WYKLUCZYL 0.101 ETH self-tradingu tworcy
  (regula 0 potwierdzona w boju pierwszego dnia);
- publikator manifestow: scripts/sphere/publishEpoch.ts - kanoniczny JSON
  (posortowane klucze), hash algorytmu (keccak zrodla epochMath), liscie
  i root Merkle w formacie dystrybutora przy POOL_SPHERE>0;
- pierwszy manifest shadow OPUBLIKOWANY:
  scripts/output/sphere-epochs/epoch-2.json (epoka 2 otwarta,
  fromBlock 50447830, poolSphere=0 - bez wyplat; potwierdza wykluczenie
  0.101 ETH self-tradingu z reguly 0);
- POZOSTAJE (czas, nie kod): minimum CZTERY epoki shadow + kalibracja wag.

**Faza 1B - buyback i dystrybucja
[KONTRAKTY NAPISANE I PRZETESTOWANE 2026-08-31; deployment po launchu
tokena i po shadow]:**

- komplet peryferii SPHERE w repo: contracts/launchpad/sphere/
  (5 kontraktow: SphereRewards, SphereCreatorEscrow, SphereTokenVesting,
  SphereBuyback, SphereStreamingMerkleDistributor); pokrycie lacznie
  66 testow w 7 plikach test/Sphere*.test.ts;
- SphereStreamingMerkleDistributor: GOTOWY (12 testow zielonych) -
  PROPOSER + GUARDIAN veto-only, immutable MIN_DELAY (okno weta 24h,
  decyzja #10), sekwencyjne epoki, monotonicznosc lisci egzekwowana przy
  claimie, aktywacja tylko przy balance >= totalCumulative - totalClaimed,
  manifestHash w kazdym rootcie; STREAMING: leaf (account, cum, prevCum),
  przyrost epoki liniowo przez STREAM_DURATION od AKTYWACJI (= po oknie
  weta, decyzja #15);
- SphereBuyback: GOTOWY (8 testow zielonych) - limity W KONTRAKCIE:
  TRANCHE_MAX, WINDOW_BUDGET/WINDOW_SECONDS, checkpoint ceny OPERATORA
  (referencja SPOZA transakcji wykonania) + MAX_DEV_BPS straznik kursu
  (sandwich rewertuje), split BURN_BPS -> dEaD / reszta -> distributor;
  nogi team-run nazwane: checkpoint() i cancel() (tylko do OPERATORA);
- SphereKeeper: scripts/sphere/sphereKeeper.ts (settle/harvest/auto-burn
  per token + dostawy claimFor + buyback.execute + distributor.activate;
  dry-run bez KEEPER_CONFIRM=tak);
- POZOSTAJE: AUDYT obu kontraktow (ryzyko 9), deployment (wymaga adresu
  SPHERE - po launchu), canary budzetu 10% -> 25% -> 50% -> 100%,
  kryterium wyjscia: trzy cykle bez roznicy ksiegowej + niezalezne
  odtworzenie rootow.

**Faza 2 - staking i wydziwienia (kazde jako OSOBNA decyzja, nie pakiet):**

- staking jako osobny projekt prawno-ekonomiczny; creator stake/multiplier
  ODDZIELONY od kuracji; kuracja rozliczana epokowo za wynik, bez globalnego
  pasywnego `rewardsPerToken`;
- bid wall, ecosystem buyback i NFT praw do fee - trzy osobne decyzje;
- sezony punktowe, ewentualnie Sphere Club.

**Faza 3 - v2 rdzenia (TYLKO przy swiadomym redeployu calego padu):**

- zaszyty w hooku slot buybacku SPHERE (wzor Bankr, np. 0.15-0.25% kazdego
  swapa) - wtedy akumulacja nie zalezy od polityki Safe;
- `FEE_RECIPIENT` = kontrakt-splitter zamiast Safe;
- sloty referral (platforma tworzaca + routing trade'u, wzor Zora);
- dynamic fee hook (fee rosnie kwadratowo ze zmiennoscia - snajperzy placa
  tworcy, wzor Clanker) i/lub aukcja snajperow.
- Koszt: nowy deploy wszystkiego, nowe adresy tokenow z nowej fabryki -
  decyzja strategiczna, nie taktyczna.

## 10. Parametry do decyzji (przed faza 0)

| # | Parametr | Rekomendacja | Zakres sporu |
| --- | --- | --- | --- |
| 1 | `buybackBps` SPHERE | 5000 | 3000-7000; wiecej = mocniejszy burn, mniej ETH operacyjnego |
| 2 | split `receiverSharesBps` | Rewards 6000 / CreatorEscrow 4000 | zalezy, ile chcemy finansowac sezony vs operacje |
| 3 | % przychodu Safe na buyback | 50% (od fazy 2 wymuszone modulem; w fazie 0 UZNANIOWE i tak komunikowane) | 30-70%; 50% = wzor pump.fun po pivocie |
| 4 | split buybacku burn/redystrybucja | 20/80 | 0-30% burn; wiecej burnu = narracja, mniej = wieksze pule epok |
| 5 | dlugosc epoki | 7 dni | 3-14 |
| 6 | cap na token w epoce | 10% puli | 5-20% |
| 7 | mnoznik stakingu tworcy | 1.0-2.5x | max 2-3x |
| 8 | wielkosc dev-buy skarbca | jako % PODAZY (np. 10% ~ 0.0842 ETH przy obecnej krzywej), nie kwota ETH | PODLEGA `windowCap`; kupione idzie do jawnego locka/vestingu |
| 9 | `windowCap` SPHERE | zwymiarowany pod dev-buy | konsekwencja: cap przepuszczajacy escrow z X% podazy przepuszcza KAZDY adres z X% przez 300 s; przeciw sybil-splitowi i tak nie broni |
| 10 | okno weta roota Merkle | 24-48h | egzekwowane przez VETO_ROLE w forku URD, nie "spor" |
| 11 | regula wyjscia escrow - **ZDECYDOWANE 2026-08-30** | 11a: TOKENY -> SphereTokenVesting (jawny harmonogram; klif 30 dni / 12 mies. liniowo to REKOMENDACJA do potwierdzenia przy launchu); 11b: ETH split 50/50 pot/ops; semantyka odmowy: atomowy revert; one-shot launch z configiem zapietym w konstruktorze | zaimplementowane + przetestowane na galezi sphere-tests (Ring 1/2 + vesting, 46 testow) |
| 12 | model SphereRewards - **ZDECYDOWANE 2026-08-30** | opcja (c): CONSUMER = dedykowany **Rewards Safe** (multisig, do utworzenia w Gate 0). ADRES niezmienny na zawsze; polityka ZA adresem zmienna (signerzy, progi, routing do stakingu z fazy 2) - ten sam wzorzec co FEE_RECIPIENT pada. Konsekwencja: strumien nagrod = polityka, nie gwarancja kodu -> w UI plakietka "Team-run, on-chain", nigdy "Enforced by contract" | opcje (a)/(b) zostaja mozliwe pozniej TYLKO posrednio: Safe moze oddac wykonawstwo modulom, ale prawo poboru zostaje przy adresie Safe |
| 13 | polityka dokupywania na krzywej SPHERE po oknie startowym | do decyzji przed launchem (scenariusz "dlugo nie graduuje") | kto, ile, na jakich zasadach - jawnie w manifescie |
| 14 | sciezka prawna (Gate 0, BLOKUJE launch) | emitent, panstwo macierzyste MiCA, notyfikacja, podejscie do USA | to bramka projektowa, nie formalnosc |
| 15 | streaming nagrod | TAK: liniowe uwalnianie przyrostu epoki przez nastepna epoke (wlasny kontrakt, bez Superfluid); Superfluid GDA tylko ewentualnie w fazie 2 dla stakingu (jednostki wazone kuracja) | dlugosc vestingu: 0.5-2 epoki |

## 11. Ryzyka - nazwane wprost

1. **Slot `feeReceivers` tylko dla nowych launchy** - istniejacych tokenow
   nie da sie doposazyc. Program nagrod obejmie stare tokeny przez indexer
   (wolumen liczy sie wszystkim), ale strumien ETH do stakingu plynie tylko
   z nowych. Komunikowac jasno.
2. **Kontrakt-odbiorca wpisany do launchu bez clawbacku** - blad w adresie
   albo rewertujacy `receive()` = ETH przepada na zawsze. Procedura: deploy,
   weryfikacja na Basescanie, test przyjecia ETH na forku, DOPIERO launch.
3. **Wash trading pod epoki** - kluczowy fakt: tworca odzyskuje 70% fee od
   wlasnego tokena, wiec jego koszt netto prania to tylko noga protokolu
   (30%). Dlatego glownym bezpiecznikiem jest **cap per tworca = wklad netto
   do fee protokolu** (regula 0, sekcja 6.2) - self-wash zawsze ujemny.
   "Pula < zebrane fee" to tylko higiena budzetu, NIE gwarancja. Do tego
   cap per token, sqrt, mnoznik unikalnych traderow, min. wiek tokena;
   wagi strojone miedzy sezonami. Wolumen SPHERE i swapy wlasnego buybacku
   wykluczone z miningu (sekcja 5).
4. **Zaufanie do roota Merkle** - centralny punkt (indexer + updater).
   Spor osoby trzeciej NIE ma mocy on-chain; realna mitygacja to guardian
   veto-only (osobne klucze) + timelock + deterministyczny, publicznie
   odtwarzalny indexer + fork audytowanego URD Morpho. Do czasu guardiana
   komunikowac jako "trusted root z opoznieniem".
5. **Polityka Safe to obietnica, nie kod** (do fazy 2/3). Konsekwencja:
   w fazie 0 NIE ogloszamy "50% na buyback" jako zobowiazania - tylko
   mechanizmy wymuszone lancuchem sa komunikowane jako gwarancje; transze
   uznaniowe oznaczone jako uznaniowe, kazda jawnie on-chain.
6. **Prawo - bramka PRZED launchem, nie przed sezonem 1** (recenzja
   zewnetrzna): MiCA obejmuje juz sam launch (publiczna oferta: osoba
   prawna, whitepaper, notyfikacja, publikacja, marketing - art. 4/7;
   manipulacja rynkiem - art. 91); polska ustawa wykonujaca w zawieszeniu
   po wecie 11.06.2026, okres przejsciowy skonczony 01.07. Howey/SEC:
   NIE wolno podpierac SphereStaking interpretacja protocol-stakingu PoS -
   SPHERE nie zabezpiecza konsensusu; obietnice przyszlych dzialan emitenta
   (roadmapa, buybacki) sa analizowane jako mozliwy investment contract.
   Dlatego: nagrody tworcow = za wlasna prace, staking = za aktywna kuracje
   rozliczana wynikiem, utility = znizki, zero marketingu "dywidend" -
   ale to wszystko NIE zastepuje klasyfikacji prawnej z Gate 0. To spec
   inzynierska, nie opinia prawna.
7. **Pule hookless** - osoby trzecie moga otworzyc pule ETH/SPHERE bez hooka
   (fee 1% omija wtedy nasz stack; znane ograniczenie z naglowka hooka).
   Mitygacja miekka: kanoniczna pula ma cala plynnosc vaulta + bid wall,
   arbitraz trzyma ceny razem, a wolumen liczymy tez z puli kanonicznej.
8. **Snajperzy na vanity adresie SPHERE** - adres przewidywalny przed
   launchem, a `windowCap` przed snajperami NIE broni: docstring
   launchVanity (CurveLaunchpad.sol:901-910) mowi wprost, ze snajper
   rozbija zakup na wiele adresow (cap wymusza tylko sybil-split
   i widocznosc), a cap w ogole wygasa po LAUNCH_WINDOW = 300 s. Jedyna
   realna ochrona alokacji skarbca to atomowy dev-buy w tx launchu -
   i pod niego wymiarujemy `windowCap`. Snajperzy dostana supply z krzywej
   po dev-buyu tak czy inaczej - akceptujemy to.
9. **Audyt** - rdzen padu przeszedl runde wewnetrzna (0 confirmed), audyt
   zewnetrzny odlozony decyzja wlasciciela. Peryferia SPHERE trzymaja cudze
   pieniadze epokami: dla SphereDistributor/SphereBuyback audyt zewnetrzny
   jest w fazowaniu (faza 1B) WARUNKIEM, nie rekomendacja; dla
   escrow/rewards minimum niezalezny review przed launchem (Gate 1 pkt 10).
10. **Plynnosc SPHERE na starcie** - buyback w plytka pule = poslizg i
    zmiennosc. Mitygacja: transze male i czeste, clamp poslizgu, bid wall
    zamiast market-buy przy niskiej plynnosci.
11. **Klucze dzisiaj nie sa rozdzielone** - produkcyjny Safe to 1/1
    (LAUNCHPAD-STAN.md). Caly rozdzial rol z sekcji 8 (Safe operacyjny,
    proposer, guardian, launch authority) trzeba ZBUDOWAC w Gate 0 -
    do tego czasu kazda "polityka Safe" wisi na jednym kluczu.

## 12. Metryki sukcesu (dashboard od fazy 0)

- ETH przychodu protokolu / epoka (per strumien);
- ETH wydane na buyback + SPHERE kupione/spalone/rozdystrybuowane;
- liczba tworcow odbierajacych nagrody / epoka; retencja tworcow (launch
  w kolejnym miesiacu);
- % nowych launchy z opt-in slotem SphereRewards;
- udzial wolumenu tokenow "Sphere-aligned" w wolumenie padu.

## 13. Zrodla

- Flaunch: docs.flaunch.gg, github.com/flayerlabs/flaunchgg-contracts
  (PositionManager, BidWall, FairLaunch, InternalSwapPool, BuyBackAndBurnFlay)
- Clanker: clanker.world, github.com/clanker-devco/contracts (factory,
  LpLocker/FeeLocker, dynamic fee hook, vault/airdrop/devBuy, MEV modules;
  audyt Cantina 05-06.2025)
- Bankr: bankr docs (fee stack 1.75%: 0.665 tworca / 0.285 LP / 0.475
  protokol / 0.2375 BNKR buyback / 0.0875 Doppler; Bankr Club; leaderboard
  Cookie.fun 450M BNKR/120 dni)
- pump.fun: creator revenue 5 bps wolumenu (05.2025), Project Ascend
  (09.2025), pivot buybacku (04.2026)
- Virtuals: proporcjonalny buyback tokenow agentow (TWAP 30 dni), veVIRTUAL
- Hyperliquid: Assistance Fund; LetsBonk: buy&burn BONK + buybacki ekosystemu
- Jupiter ASR, GMX, Aerodrome veAERO (wzorce stakingu real-yield)
- Zora Coins V4 (split z dwoma warstwami referral)
- Morpho universal-rewards-distributor:
  github.com/morpho-org/universal-rewards-distributor (baza SphereDistributor)
- Wlasne: contracts/launchpad/*.sol, docs/LAUNCHPAD-STAN.md,
  docs/LAUNCHPAD-DOSSIER.md, scripts/output/launchpad-base.json
  (wszystko na origin/master)

## 14. STAN NA 2026-08-31 - co zostalo do mainnetu

Kompletna lista realnych brakow - wszystko inne jest zaimplementowane
i przecwiczone (kontrakty, testy, skrypty, proba Sepolia, shadow indexer):

1. **Launch tokena SPHERE na Base** = wylacznie decyzja wlasciciela + gaz
   na deployerze (~0.02 ETH). Runbook wyczerpany proba Sepolia (sekcja 9);
   sciezka: scripts/launchpad/deploySphere.ts.
2. **Wpisanie adresow mainnetowych do UI/konfiguracji po deployu**
   (token, escrow, rewards, vesting; buyback i distributor dochodza po
   fazie 1B) - dzis UI linkuje tylko token proby na Sepolii
   (app/startpad/sphere/SphereOverview.tsx), bo adresy mainnetowe
   nie istnieja przed launchem.
3. **Cztery epoki shadow sezonu 1 + kalibracja wag** - czas, nie kod
   (shadow biegnie, pierwszy manifest: epoch-2).
4. **Audyt zewnetrzny fazy 1B** (SphereBuyback +
   SphereStreamingMerkleDistributor) przed produkcyjnymi wyplatami
   (ryzyko 9); ich deployment i tak wymaga adresu SPHERE, wiec po launchu.
5. **Faza 2** (staking, bid wall, ecosystem buyback, NFT praw do fee,
   sezony punktowe) = osobne decyzje, kazda z wlasna bramka; nie blokuja
   niczego powyzej.

## Dopiska 2026-09-02 - faza 1B wdrozona, graduacja, poprawki

- **Graduacja SPHERE**: blok 50756771, 1.09.2026 22:48 UTC, ~4 h po
  launchu, tx `0x774cf305a7754104891ec454e590e51caaee57b7de18a562c726637170fe39e7`,
  wywolana przez obcy portfel (`0xdB58...76Ea` zgarnal 1.5% rezerwy).
  2.91 ETH do puli, 155.2M SPHERE sparowane, 44.8M na 0xdEaD przy seedzie.
  `hook.buybackBps(SPHERE)` = 5000 aktywne od tego bloku.
- **Faza 1B wdrozona** (rekord `scripts/output/sphere-base-1b.json`,
  zrodla zweryfikowane na Basescanie):
  `SphereStreamingMerkleDistributor` `0xc0b018161bB48383c808Aa47923f5501758D3E9D`
  (PROPOSER=deployer, GUARDIAN=Safe, MIN_DELAY 24h, STREAM 7d),
  `SphereBuyback` `0x98e51f42245Bf9A0b1e0005510aEE82C52bE8A7b`
  (OPERATOR=Safe, CHECKPOINTER=deployer, BURN 20%, transza 0.05 ETH,
  okno 0.5 ETH/7d, checkpoint <= 1h, MAX_DEV 400 bps).
- **Bug naprawiony przed deployem** (recenzja adwersaryjna, 3 soczewki):
  `SphereBuyback.checkpoint()` liczyl odwrotnosc ceny (ETH/token zamiast
  tokens/ETH); pula 1:1 w testach tego nie lapala. Test regresji stoi na
  cenie graduacji. Rozdzielono `CHECKPOINTER` (goracy klucz keepera) od
  `OPERATOR` (Safe, `cancel()`), bo checkpoint musi byc swiezy co godzine.
- **MAX_DEV_BPS 400, nie 150**: swap buybacku placi 0.3% LP + 1% hooka
  ZANIM policzy sie poslizg; przy 150 kazda transza > ~0.006 ETH
  rewertowalaby PriceGuard przy plynnosci z graduacji.
- **SPHERE wykluczony z volume mining w indekserze** (`epochMath.ts`,
  `EXCLUDED_TOKENS`) - epoka 4 shadow pokazala token pada z 20% puli.
  Lista jest czescia publicznego algorytmu (keccak w manifescie).
- Decyzje wlasciciela odnotowane: GUARDIAN = operacyjny Safe (spec chcial
  osobnego multisiga - swiadome odstepstwo), WINDOW 0.5 ETH/tydz. jako
  trwaly sufit (~26 ETH/rok), deploy 1B przed zamknieciem 4 epok shadow
  (payouty nadal dopiero po shadow - sam deploy adresow nie jest payoutem).

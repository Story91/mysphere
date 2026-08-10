# Launchpad B20 - raporty z rozpoznania



---

## Raport 1

# Launchpad B20 na krzywej wiazanej — analiza napastnicza

Zalozenie: kontrakt trzyma ETH, jest jedyna druga strona, pobiera oplate od kupna i sprzedazy, po progu awansuje do puli na Base. Kazdy wektor: **mechanika → koszt napastnika → strata ofiary → obrona w kodzie**. Kolejnosc: od calkowitej utraty srodkow w dol.

---

## A. WEKTORY KRYTYCZNE (calkowita utrata srodkow)

### A1. Tworca zachowuje role B20 — mint, seize, pause, blocklist
Najgrozniejszy wektor w calym projekcie i jedyny, ktory jest **specyficzny dla B20**. Cztery warianty:

| Rola | Co robi napastnik | Strata ofiary |
|---|---|---|
| SEIZE | zabiera tokeny prosto z portfeli kupujacych | 100% pozycji, bez transakcji ofiary |
| MINT | mintuje ponad podaz krzywej i sprzedaje do krzywej | **cala rezerwa ETH kontraktu** |
| PAUSE (transfer) | wylacza transfery — nikt nie sprzeda z powrotem do krzywej | 100%, ETH zamrozone w kontrakcie |
| Blocklist (rejestr `0x8453…0002`) | blokuje **sam kontrakt krzywej** albo wybranych ludzi | jak wyzej, ale celowane i ciche |

MINT jest osobno najgorszy: krzywa wylicza wyplate ze sprzedazy z podazy, wiec niespodziewany mint lamie inwariant i pozwala wyprowadzic **calosc** zebranego ETH jedna transakcja. Koszt napastnika: gaz.

**Obrona (strukturalna, nie proceduralna):** token powstaje wylacznie przez nasz launchpad, `createB20(...)` z `initCalls`, ktore w **tej samej transakcji** zeruja wszystkie role, a launchpad nigdy nie przekazuje zadnej roli EOA tworcy — ani nie zatrzymuje jej dla siebie (inaczej my jestesmy ryzykiem i teza produktu upada). Po utworzeniu, atomowo, asercje post-warunkow:

```solidity
// ILUSTRACJA — nie kod produkcyjny
address token = IB20Factory(B20_FACTORY).createB20{value: 0}(variant, salt, params, initCalls);
require(IB20Roles(token).roleHolder(MINT)     == address(0), "mint alive");
require(IB20Roles(token).roleHolder(BURN)     == address(0), "burn alive");
require(IB20Roles(token).roleHolder(SEIZE)    == address(0), "seize alive");
require(IB20Roles(token).roleHolder(PAUSE)    == address(0), "pause alive");
require(IB20Roles(token).roleHolder(METADATA) == address(0), "metadata alive");
require(IB20(token).supplyCap()  == CURVE_SUPPLY, "cap mismatch");
require(IB20(token).totalSupply()== CURVE_SUPPLY, "premint");
require(IRegistry(REGISTRY).policyOf(token) == POLICY_NONE, "list policy");
// jakikolwiek falsz -> revert calego launchu. Nie ma okna, bo nie ma drugiej transakcji.
```

METADATA zostawione zywe to nizsza kategoria, ale realna: tworca zmienia nazwe/symbol po fakcie i podszywa sie pod inny projekt, gdy token juz krazy.

**Do zweryfikowania w specyfikacji B20 PRZED budowa** (tego nie ma w ustaleniach, ktore juz macie, i nie wolno tego zalozyc):
1. Czy role da sie **nieodwracalnie** spalic, czy tylko przekazac. Jesli tylko przekazac — czy adres zerowy jest akceptowany, czy trzeba adresu-smietnika.
2. Czy polityka allowlist/blocklist w rejestrze `0x8453…0002` jest per-token, kto ja ustawia i czy jest ustawialna **tylko raz**. Jesli da sie ja wlaczyc pozniej i nie da sie tego trwale zablokowac — to jest blocker projektowy, nie detal.
3. Czy `supplyCap` jest immutable po inicjalizacji.
4. Czy pauza per-operacja ma osobnego posiadacza roli od pauzy globalnej.

### A2. Wrogo utworzona pula DEX przed awansem
Napastnik tworzy pule `(token, WETH)` na Aerodrome/Uniswap **zanim** krzywa osiagnie prog, z absurdalna cena i minimalna plynnoscia. Przy awansie nasze `graduate()` albo rewertuje na zawsze (token trwale uwieziony na krzywej — plynnosc nie do wyprowadzenia), albo dodaje plynnosc w zatrutym stosunku, a napastnik natychmiast ja wyciaga.

Koszt napastnika: gaz + dust plynnosci, rzedu kilku dolarow. Strata ofiar: cala rezerwa awansujacego tokena. To sie **realnie zdarzalo** innym launchpadom.

**Obrona:** pule tworzymy my, w momencie **utworzenia tokena**, pusta, z zadeklarowana warstwa oplat i cena poczatkowa rowna terminalnej cenie krzywej. `graduate()` nie tworzy nic — tylko dodaje plynnosc do puli, ktora znamy z zapisu w naszym rejestrze launchu. Dodatkowo przed dodaniem plynnosci sprawdzamy, ze spot puli nie odbiega od ceny terminalnej krzywej o wiecej niz waski prog; odchylka → revert z wlasnym bledem, nie ciche wykonanie. Nigdy nie polegamy na `getPool()` odczytanym w chwili awansu.

### A3. Reentrancy na sciezce wyplaty ETH
`sell()` pali tokeny i wysyla ETH. Jesli ETH idzie przed aktualizacja stanu, fallback odbiorcy wchodzi ponownie i sprzedaje przeciw nieaktualnej rezerwie. Drugie, mniej oczywiste wejscie: **push oplaty** do `feeRecipient` wewnatrz `buy()`/`sell()` — jesli to kontrakt, jest to zewnetrzne wywolanie w srodku ksiegowania krzywej.

Koszt napastnika: gaz. Strata: cala rezerwa.

**Obrona — dokladnie wzorzec z AskEscrow:** oplaty **nigdy nie sa pushowane**, tylko naliczane do `claimable[FEE_RECIPIENT]`, a `_payout` jest osobna funkcja z `nonReentrant`. W `sell()`: CEI, `nonReentrant`, wyplata ETH jako absolutnie ostatnia operacja. Dodatkowo: krzywa przyjmuje wylacznie tokeny z **naszego** rejestru launchu (nie `isB20()` — patrz teatr T8), zeby wrogi token nie mogl byc sciezka reentrancy przez `transferFrom`.

### A4. Ksiegowanie po `address(this).balance` + dotacja ETH
Jesli wycena albo warunek progu czyta saldo kontraktu zamiast wewnetrznej zmiennej, napastnik wymusza wplate ETH (`selfdestruct`, wplata na adres wyliczony przed wdrozeniem, platnosc coinbase) i: przesuwa cene, albo **wyzwala awans przedwczesnie** w bloku, ktory sam wybral.

Koszt: podarowane ETH — czesto duzo mniej niz zysk z kontrolowanego momentu awansu (patrz B1). Strata: rozjazd ksiegowosci, w skrajnym przypadku rezerwa niewystarczajaca na wykupy.

**Obrona:** `ethReserve` i `accruedFees` jako zmienne stanu, `address(this).balance` **nie wystepuje w kodzie ani razu** poza opcjonalna asercja `balance >= ethReserve + accruedFees`. Brak `receive()`/`payable fallback`. Prog awansu czytany wylacznie z `ethReserve`.

### A5. Zaokraglenia na korzysc uzytkownika przy tanim gazie L2
Na L1 dust-loop sie nie oplaca. **Na Base oplaca sie** — to niedoceniana roznica. Jesli ktorakolwiek sciezka zaokragla na korzysc handlujacego, petla mikro-transakcji sacza rezerwe za koszt samego gazu.

**Obrona — regula bez wyjatkow:** kupno zaokragla tokeny-out **w dol**, sprzedaz zaokragla ETH-out **w dol**, oplata **w gore**. Minimalna wielkosc transakcji. `mulDiv` 512-bitowe wszedzie, gdzie `a*b` przed `/c` moze przekroczyc zakres przy 18 miejscach × wei. Test inwariantowy (fuzz), nie jednostkowy: *po N losowych round-tripow rezerwa nie zmalala*. Osobno przypadki brzegowe: zakup dokladnie calej reszty podazy, sprzedaz przy podazy 0, zakup podaz+1.

---

## B. AWANS — kto zarabia na znajomosci momentu progu

### B1. Sandwich progu
Napastnik widzi zlecenie, ktore przekroczy prog. Kupuje tuz pod progiem po cenie krzywej, pozwala ofierze wyzwolic awans, sprzedaje w nowej puli. Koszt: gaz + priorytet. Zysk: spread miedzy terminalna cena krzywej a spotem puli.

**Obrona:** cena poczatkowa puli **musi byc dokladnie rowna** terminalnej cenie krzywej. Kazda luka to darmowe pieniadze dla pierwszego handlujacego w puli. Jesli luka jest strukturalnie nieunikniona (dyskretne ticki v3), niech bedzie **na niekorzysc** pierwszego handlujacego, nie na korzysc.

### B2. Okno miedzy przekroczeniem a `graduate()`
Jesli awans to osobne, permissionless wywolanie, istnieje okno, w ktorym krzywa jest nad progiem i dalej handluje. Kazdy blok tego okna to darmowa opcja dla obserwatora.

**Obrona:** awans **atomowy w tej samej transakcji**, co przekraczajace kupno. Zadnego `graduate()` do wywolania przez kogokolwiek.

### B3. Oscylacja wokol progu
Jesli `sell()` moze zepchnac rezerwe pod prog, napastnik buja stanem tam i z powrotem, zbierajac roznice i blokujac awans.

**Obrona:** awans to **zapadka jednokierunkowa**. `graduated` ustawione raz, `buy`/`sell` na krzywej rewertuja po nim bezwarunkowo.

### B4. Kto dostaje LP
Jesli zatrzymujemy LP — jestesmy ryzykiem rugu i teza produktu upada. „Zablokowane na 12 miesiecy" to rug z data (T10).

**Obrona i uczciwy komunikat:** pozycja pelnozakresowa, NFT/LP na adres martwy. Konsekwencja, ktora trzeba powiedziec wprost, a nie przemilczec: **oplaty handlowe narosle na tej pozycji sa nieodbieralne przez nikogo, w tym przez nas**. To jest cena, ktora placimy za zdanie „nikt nie moze tego wyciagnac".

---

## C. SNIPERY — co dziala, a co jest teatrem

Bot kupujacy w bloku startu i sprzedajacy minute pozniej. Ocena mechanizmow z kosztami:

| Mechanizm | Koszt napastnika | Skutek uboczny | Werdykt |
|---|---|---|---|
| **Opoznienie startu** | zero | zero | **Teatr.** Zamienia wyscig w wyscig *zaplanowany* — bot ma wiecej czasu na przygotowanie, nie mniej. |
| **Limit na adres** | k × gaz ≈ centy na Base | blokuje prawdziwe grube portfele, trzeba stroic | **Slaby, ale warto.** Nie jest anty-botem — jest limiterem koncentracji podazy i, co wazniejsze, **kupuje obserwowalnosc**: zmusza snajpera do rozbicia na wiele adresow i blokow, czyli do zrobienia tego na oczach ludzi. |
| **Rosnaca oplata przy wczesnej sprzedazy** | realny, proporcjonalny | wyglada jak mechanika scamu; roach motel dla zwyklych kupujacych | **Dziala — ale tylko na krzywej.** Patrz nizej. |
| **Aukcja/tranza po stalej cenie na starcie** | znosi przewage kolejnosci | zlozonosc, rozliczenie, pro-rata | **Jedyna realna odpowiedz.** |
| **Commit-reveal** | zero | opoznienie dla wszystkich | **Teatr.** Snajper tez commituje; kolejnosc reveal odtwarza wyscig. |

**Rosnaca oplata — gdzie ma dziure.** Podatek od wczesnego wyjscia moze zyc **wylacznie na kontrakcie krzywej**, bo token B20 nie moze nosic podatku transferowego, chyba ze ktos trzyma jego role — a tego wlasnie nie robimy (A1). Wnioski, ktore trzeba powiedziec uczciwie:
- podatek wiaze **tylko przed awansem**; po awansie pula go nie zna,
- snajper moze **front-runowac awans**, zeby z podatku uciec,
- wiec zaprojektuj tak, ze podatek nie ma sensu obchodzic: **oplata od wczesnej sprzedazy idzie do krzywej, czyli do tych, ktorzy zostali — nie do nas.** To zmienia historie z „opodatkowujemy panike" na „wczesne wyjscia placa tym, ktorzy zostali", i usuwa nasz wlasny interes w tym, zeby panika byla.

**Tranza po stalej cenie — praktyczny srodek.** Zamiast pelnej aukcji jednolitej ceny (dwie fazy, `settle()`, pro-rata, petla po licytujacych, pytanie kto placi za rozliczenie): pierwsze X% podazy sprzedawane po **plaskiej cenie**, bez krzywej, z limitem na adres, pro-rata przy nadsubskrypcji. Znosi gradient ceny w oknie startu, wiec bycie pierwszym w bloku nie daje **przewagi cenowej** — daje najwyzej przewage alokacyjna. To jest 80% efektu aukcji za 20% jej zlozonosci.

**Uwaga o Base, ktora nie moze paść w materialach:** krotkie bloki i brak publicznego mempoolu **nie znosza MEV**. Sekwencer jest FCFS od momentu odbioru, a przewaga latencji przez bezposredni RPC istnieje i jest kupowalna. Zdanie „na Base nie ma mempoolu, wiec nie ma sandwichy" to falszywe pocieszenie (T13).

### C1. Sandwich zwyklego kupna
Na krzywej **kazde** kupno rusza cene — nie ma glebokosci puli, w ktorej mozna sie schowac. Bez ochrony slippage sandwich jest trywialnie oplacalny.

**Obrona:** `minTokensOut` na kupnie, `minEthOut` na sprzedazy, `deadline` — **wymagane parametry, bez wartosci domyslnych w kontrakcie**. I krytyczne: hojne domyslne slippage w UI, „zeby transakcje nie failowaly", **to jest sandwich** (T11).

### C2. „Kup caly zapas w jednym bloku"
Jeden adres kupuje od zera do progu w jednej transakcji, awansuje token, w ktorym jest jedynym posiadaczem, i sprzedaje w swiezo zasilona pule. Ekonomicznie to okolice zera minus oplaty — prawdziwa szkoda jest **reputacyjna i dla spoznionych**, ktorzy kupuja „token po awansie" od jednego wlasciciela.

**Obrona:** limit udzialu na transakcje (np. zaden pojedynczy `buy` nie bierze wiecej niz X% pozostalej podazy) + limit na adres w oknie startowym. Uczciwie o skutecznosci: to sie obchodzi przez rozbicie na adresy i bloki — obrona zamienia „jedna transakcja" na „wiele transakcji przez kilka minut". **To jest cala jej wartosc i tak nalezy ja opisywac.**

---

## D. OSZUSTWA TWORCY — granica miedzy kodem a uczciwym pokazaniem

| Oszustwo | Da sie wymusic kodem? |
|---|---|
| Tworca kupuje wlasny token z drugiego adresu | **Nie. Nigdy.** Sybil jest darmowy. Kazdy check „tworca nie moze kupic" obchodzi sie jednym swiezym EOA. Nie wolno twierdzic, ze temu zapobiegamy. |
| Sprzedaz calego zapasu w pierwszej minucie | **Tak — jesli zapasu nie ma.** Tworca dostaje **zero** tokenow przy tworzeniu i kupuje na tej samej krzywej, co wszyscy. Ten adres znamy (zaplacil za launch), wiec jego pozycje mozna pokazac z dowodem. Opcjonalnie: pierwsze kupno tworcy vestuje. |
| Fikcyjny wolumen miedzy wlasnymi adresami | **Czesciowo — oplata sama jest obrona.** Kazdy round-trip placi nasza oplate dwa razy plus spread krzywej; sfalszowanie 100k wolumenu przy 1% to 2k+ realnej straty. Ale ktos moze uznac to za budzet marketingowy. |
| Fikcyjni posiadacze | **Nie.** Dust na 1000 adresow kosztuje grosze. |

**Wniosek produktowy zgodny z teza „nigdy nie chwalimy sie czyms, czego nie ma":** nie walcz z falszowaniem metryki — **naglowkuj metryke, ktora jest droga do sfalszowania**. Zamiast wolumenu: naplyw netto ETH. Zamiast liczby posiadaczy: koncentracja top-10 i liczba adresow powyzej progu. Zamiast „+340%": „kupilo 12 osob". Ta ostatnia zamiana ma tez konsekwencje regulacyjna — patrz E.

### D1. Griefing salt / adresu
Adres = `0xb2` + 9 zer + bajt wariantu + pierwsze 9 bajtow `keccak256(abi.encode(sender, salt))`. Sender to **nasz launchpad**, wiec salt jest przewidywalny i mozna go frontrunowac: napastnik zajmuje salt, transakcja tworcy rewertuje, a frontend, ktory adres wyliczyl wczesniej, pokazuje bzdury. Koszt: gaz. Strata: przerwany flow, nie pieniadze.

**Obrona:** salt wyprowadzany **wewnetrznie** — `keccak256(abi.encode(creator, creatorNonce++))` — nigdy z wejscia uzytkownika. Wtedy kolizja miedzy dwoma uzytkownikami jest niemozliwa, a powtorka to czysty revert z jasnym bledem.

Osobno, do swiadomosci: uzywane jest **9 bajtow** hasha, czyli 72 bity. Drugi preobraz na *konkretny* adres to 2^72 — kosztowne, ale nie absurdalne dla dobrze finansowanego napastnika. **Nie buduj zadnego zalozenia bezpieczenstwa na unikalnosci adresu** poza tym, ze fabryka odmowi ponownej inicjalizacji.

---

## E. REGULACJE — konkretne linie, bez straszenia

Nie porada prawna; lista jest po to, zeby ksztaltowac decyzje projektowe.

**Linie, ktore taka platforma przekracza:**
- **Pobieranie oplaty od kazdego kupna i sprzedazy instrumentu, ktorego jedynym celem jest spekulacja cena** = funkcja miejsca obrotu / wykonywania zlecen. W UE (MiCA) „prowadzenie platformy obrotu" i „wykonywanie zlecen" to licencjonowane czynnosci CASP. Niepowiernicza krzywa pomaga na *powiernictwo*, ale ekspozycja to **operator front-endu pobierajacy oplate**, a nie kontrakt.
- **MiCA, obowiazek white paper** przy ofercie publicznej krypto-aktywow — a cala funkcja launchpada to ulatwianie ofert publicznych. Wyjatki dla tokenow uzytkowych sa waskie i „token spolecznosci bez uzytecznosci" sie w nie nie miesci.
- **US / Howey:** token na krzywej, gdzie zysk kupujacego zalezy od dalszych staran tworcy albo platformy, przechyla sie w strone kontraktu inwestycyjnego.
- **Manipulacja rynkiem:** jakikolwiek bot, treasury czy uprzywilejowany zakup po naszej stronie to wprost manipulacja.
- **AML:** czysty kontrakt to jedno; hostowany front-end z on-rampem fiat albo promocja to miejsce, gdzie zaczynaja sie pytania o rejestracje.

**Decyzje projektowe, ktore realnie przesuwaja linie (od najmocniejszej):**
1. **Zero rol administracyjnych, brak upgrade'u** — najmocniejszy argument, ze kontrakt nie jest „prowadzony". To jest ten sam wybor, co w AskEscrow i MemoPay; tutaj ma dodatkowo wymiar prawny.
2. **Tworca nie dostaje darmowej alokacji** — oslabia odczyt „promotor dystrybuujacy papiery".
3. **UI nie naglowkuje zwrotow.** „Kupilo 12 osob" a „+340%" to materialnie rozne produkty w oczach regulatora. Ta sama zmiana, ktora naprawia falszowanie metryk (D), pomaga tutaj.
4. **Oplata idzie na adres, ktory kontrolujemy** — to jest ta jedna rzecz, ktora czyni nas posrednikiem, a nie wydawca. Nieusuwalne, jesli chcemy przychodu; nalezy to nazwac wprost, a nie udawac, ze jestesmy tylko infrastruktura.
5. Geoblokada i brak marketingu zwrotow — lagodza, nie znosza.

---

## F. OBRONY, KTORE SA TEATREM

| # | „Zabezpieczenie" | Dlaczego nic nie daje |
|---|---|---|
| T1 | `require(tx.origin == msg.sender)` | Snajperzy uzywaja EOA. **Na Base to blokuje Coinbase Smart Wallet i ERC-4337, czyli wiekszosc prawdziwego retailu.** Blokuje uzytkownikow, nie boty. Najgorsza pozycja na liscie. |
| T2 | Opoznienie startu bez niczego wiecej | Zamienia wyscig w wyscig zaplanowany. |
| T3 | „Tryb anty-bot" przelaczany przez ownera | Owner jest wiekszym ryzykiem niz boty, ktore niby powstrzymuje. |
| T4 | Blocklista znanych adresow botow | Nowy adres kosztuje grosze; wymaga roli administracyjnej. |
| T5 | Max wallet bez limitu globalnego i per-blok | Sybil darmowy — limit tylko dzieli zakup na czesci. |
| T6 | Commit-reveal na kupnie | Snajper commituje tak samo; kolejnosc reveal odtwarza wyscig. |
| T7 | `nonReentrant` na funkcji bez wywolan zewnetrznych | Kosztuje gaz, daje falszywa pewnosc i **maskuje**, ze prawdziwe wejscie jest gdzie indziej. (Komentarze w AskEscrow juz to rozstrzygaja dobrze — trzymajcie sie tego.) |
| T8 | `isB20(token)` jako test istnienia; `token.code.length > 0` | `isB20` sprawdza **format adresu** i zwraca true dla tokena, ktorego nie ma. `code.length` dla precompile'a nie mowi nic. Uzywaj `isB20Initialized`, a najlepiej **wlasnego rejestru launchu**. |
| T9 | Audyt jako claim | Zwlaszcza audyt krzywej, ktory **nie obejmuje sciezki awansu** — a to tam przechodza wszystkie pieniadze. |
| T10 | „LP zablokowane na 12 miesiecy" | Blokada z data odblokowania to rug z opoznieniem. Spalone albo nic. |
| T11 | Hojne domyslne slippage w UI, „zeby transakcje przechodzily" | To **jest** sandwich, tylko wlaczony przez nas. |
| T12 | Renounce ownership **po** starcie | Okno miedzy startem a renounce to caly atak. |
| T13 | „Base nie ma mempoolu, wiec nie ma MEV" | Przewaga latencji istnieje i jest kupowalna. Falszywe pocieszenie w materialach. |
| T14 | Odznaka „fair launch" na podstawie danych podanych przez tworce | Metryka, ktora ocenia sama siebie. |
| T15 | Limity per-adres egzekwowane podpisem naszego serwera | Wprowadza nas z powrotem jako strone zaufana, mozna na nas naciskac, pada razem z serwerem. Sprzeczne z cala teza. |
| T16 | `address(this).balance` gdziekolwiek w wycenie | Nie jest obrona — jest wektorem A4. |

---

## Kolejnosc prac

1. Rozstrzygnij cztery pytania o B20 z A1. **Jesli blocklisty nie da sie trwale wylaczyc per token — to blocker projektowy, nie detal implementacji.**
2. Zdecyduj o awansie: pula tworzona przy launchu, awans atomowy, zapadka, LP spalone (A2, B1–B4).
3. Ksiegowosc wewnetrzna, oplaty przez `claimable`, zaokraglenia zawsze na korzysc puli (A3–A5).
4. Start: tranza po stalej cenie + limit na adres, plus rosnaca oplata od wczesnej sprzedazy **na rzecz krzywej** (C).
5. Metryki: naglowkuj to, co drogo sfalszowac (D, E3).

Pliki referencyjne: `C:\dev\mysphere\contracts\AskEscrow.sol` (wzorzec `claimable` + `_payout` z `nonReentrant`, oplata immutable z sufitem `MAX_FEE_BPS`, komentarze uzasadniajace **brak** `nonReentrant` tam, gdzie nie ma wywolan zewnetrznych), `C:\dev\mysphere\contracts\MemoPay.sol` (uzasadnienie immutable oplaty i notatka o `eth_getCode` na precompile fabryki).

---

## Raport 2

# Krzywa i ekonomia launchpada B20 — ustalenia

## 0. Parametry, do których dochodzi ten dokument

| symbol | wartość | znaczenie |
|---|---|---|
| `T0` | `1_000_000_000e18` (1e27) | cała podaż, zmintowana raz, trafia do kontraktu krzywej |
| `T_MIN` | `200_000_000e18` (2e26) | rezerwa tokena, przy której krzywa się kończy |
| `C` | `800_000_000e18` | ile krzywa w ogóle sprzeda (80%) |
| `R_VIRT` | `0.75 ether` (7.5e17) | **wirtualna** rezerwa ETH, nigdy niewypłacalna |
| `k0` | `R_VIRT * T0 = 7.5e44` | niezmiennik startowy |
| `FEE_BPS` | 100 (1%) od kupna i od sprzedaży | `immutable`, sufit `MAX_FEE_BPS = 200` |
| `GRAD_FEE` | `0.1 ether` | pobierane raz przy awansie |

Z tego wynika, bez żadnych dodatkowych stałych:
- kurs startowy `7.5e-10 ETH/token`, FDV startowe `0.75 ETH` (= `R_VIRT`, tożsamość),
- kurs końcowy `1.875e-8 ETH/token`, FDV `18.75 ETH`,
- zbiórka do awansu `G = R_VIRT * C/(T0-C) = 3.00 ETH` **dokładnie**,
- mnożnik ceny na krzywej `= (T0/(T0-C))² = 25x` — zamknięta formuła, jedyna dźwignia kształtu.

Weryfikacja formuł na cudzych liczbach: dla pump.fun (`T0=1.073e9`, `C=7.931e8`, `R_VIRT=30 SOL`) moje wzory dają zbiórkę `30·793.1/279.9 = 85.0 SOL` i mnożnik `(1073/279.9)² = 14.7x` — zgadza się z rzeczywistością tamtego produktu. Wzory są dobre.

---

## 1. Wybór krzywej

### A. Liniowa
`p(s) = a + b·s`
Koszt kupna `N` przy podaży `s`: `E = a·N + b·(s·N + N²/2)`
Wypłata przy sprzedaży `N`: `E = a·N + b·(s·N − N²/2)`
Odwrotność (kupno za dokładne ETH): `N = (−(a+bs) + sqrt((a+bs)² + 2bE)) / b` → **wymaga pierwiastka**.

### B. Wykładnicza
`p(s) = p0·e^{k·s}`
Koszt: `E = (p0/k)(e^{k·s1} − e^{k·s0})`
Wypłata: to samo z odwróconymi granicami.
Odwrotność: `s1 = ln(e^{k·s0} + kE/p0)/k` → **wymaga exp i ln w stałoprzecinkowej**.

### C. Stały iloczyn z rezerwą wirtualną (wybrana)
Stan: `T` (realna rezerwa tokena w kontrakcie), `R_real` (realne ETH), `R = R_VIRT + R_real`.
Niezmiennik: `R · T = k`.
`p = R / T`
Kupno za `E` netto: `ΔT = T·E / (R + E)`
Kupno dokładnie `ΔT` sztuk: `E = R·ΔT / (T − ΔT)`
Sprzedaż `N` sztuk: `ΔE = R·N / (T + N)`
Sprzedaż za dokładne `ΔE`: `N = T·ΔE / (R − ΔE)`
**Cztery kierunki, cztery wyrażenia wymierne, zero funkcji specjalnych.**

### Dlaczego C — argument liczbowy, nie estetyczny

**Kształt NIE jest argumentem.** Przy tych samych końcach (800M sprzedane, cena 7.5e-10 → 1.875e-8) udział ostatnich 10% podaży krzywej w zbiórce wynosi: liniowa 18.3%, wykładnicza 30.1%, CPMM 35.7%. Udział pierwszych 10%: 1.7% / 1.6% / 2.2%. Różnice są w granicach kilku punktów — nikt tego nie odczuje. **Kto twierdzi, że wybiera krzywą „dla kształtu dystrybucji", nie policzył.**

**Gaz NIE jest argumentem.** Na Base przy ~0.03 gwei: CPMM ≈ 85k gaz, liniowa +3k za `sqrt`, wykładnicza +8k za `exp/ln`. Różnica to ułamki centa.

**Cena dla kupującego jest argumentem.** Przy identycznych końcach cenowych krzywa zbiera: liniowa **7.80 ETH**, wykładnicza **4.47 ETH**, CPMM **3.00 ETH**. Ta sama „historia 25x" kosztuje kohortę kupujących 2.6x więcej na liniowej. Odwrotnie: przy ustalonej zbiórce 3 ETH CPMM daje największy ruch ceny.

**Rozstrzyga wypłacalność jako jedna asercja.** Dla CPMM zachodzi tożsamość:

```
wypłata za odsprzedaż CAŁEJ podaży w obiegu = R_VIRT·(T0−T)/T = R_real
```

czyli krzywa jest **dokładnie** samo-zabezpieczona, z zerowym marginesem, a jedynym źródłem marginesu jest zaokrąglanie. To jest cała treść „rezerwy wirtualnej": `R_VIRT` nigdy nie wychodzi i właśnie dlatego bilans się domyka. Test wypłacalności to jedna linijka: `R·T >= k_poprzednie`.

Dla liniowej i wykładniczej nie ma takiego niezmiennika. Wypłacalność trzeba dowodzić całkowaniem, a każdy dryf zaokrągleń psuje ją **cicho** — nie ma wielkości, którą test sprawdza po każdej operacji. Dodatkowo błąd bibliotecznego `exp`/`ln` nie jest jednostronny, więc reguły „zawsze na niekorzyść wołającego" nie da się udowodnić, tylko zawierzyć cudzej bibliotece.

**Decyzja: stały iloczyn z wirtualną rezerwą ETH i REALNĄ rezerwą tokena.** W odróżnieniu od pump.fun nie ma wirtualnej rezerwy tokena — `T` to dosłownie `balanceOf(krzywa)`, co daje darmowy niezmiennik krzyżowy z ERC-20.

---

## 2. Arytmetyka na uint256

Wszystkie mnożenia przez dzielenie: `Math.mulDiv` (OZ, pośrednik 512-bitowy) z jawnym `Rounding`.

### Kupno
```solidity
uint256 fee = Math.mulDiv(msg.value, FEE_BPS, 10_000, Ceil);   // W GÓRĘ
uint256 eIn = msg.value - fee;
uint256 R   = R_VIRT + ethReserve;
uint256 out = Math.mulDiv(tokenReserve, eIn, R + eIn, Floor);   // W DÓŁ

if (tokenReserve - out < T_MIN) {                    // ostatnie kupno: dociągnięcie
    out          = tokenReserve - T_MIN;
    uint256 need = Math.mulDiv(R, out, tokenReserve - out, Ceil);  // W GÓRĘ
    fee          = Math.mulDiv(need, FEE_BPS, 10_000, Ceil);       // PRZELICZ
    eIn          = need;
    refund       = msg.value - need - fee;
}
if (out == 0 || out < minOut) revert;
ethReserve += eIn;  tokenReserve -= out;
```

### Sprzedaż
```solidity
uint256 R     = R_VIRT + ethReserve;
uint256 gross = Math.mulDiv(R, nIn, tokenReserve + nIn, Floor);  // W DÓŁ
assert(gross <= ethReserve);                                     // strażnik wypłacalności
uint256 fee   = Math.mulDiv(gross, FEE_BPS, 10_000, Ceil);       // W GÓRĘ
if (gross == 0 || gross - fee < minOut) revert;
tokenReserve += nIn;  ethReserve -= gross;
```

### Reguły zaokrąglania i ich uzasadnienie
| wielkość | kierunek | kto traci na zaokrągleniu |
|---|---|---|
| prowizja (obie strony) | **w górę** | wołający |
| tokeny wydane przy kupnie | **w dół** | wołający |
| ETH wymagane przy kupnie na dokładną liczbę sztuk | **w górę** | wołający |
| ETH wypłacone przy sprzedaży | **w dół** | wołający |

Dowód, że to wystarcza: dokładna matematyka zachowuje `R·T = k` co do jedności (`(T − T·E/(R+E))·(R+E) = T·R`). Zaokrąglenie `out` w dół zostawia w kontrakcie **więcej** tokena, zaokrąglenie `gross` w dół zostawia **więcej** ETH. W obu przypadkach `R'·T' ≥ k`. `k` jest niemalejące — to jest jedyne zdanie, które trzeba sprawdzić.

**Zasada nienaruszalna dodatkowa: rezerw NIGDY nie przeliczamy z `k`.** `ethReserve` i `tokenReserve` aktualizujemy dokładnie o kwoty, które fizycznie się przemieściły. Odtwarzanie `T = k/R` po każdej operacji skasowałoby narosły margines i pierwsza operacja po odtworzeniu wyssałaby go z powrotem.

**Blokada pyłu.** `out == 0` i `gross == 0` muszą revertować. Inaczej dziesiątki tysięcy kupień po 1 wei to darowizna do puli — dobra dla puli, ale to pułapka UX i darmowy spam zdarzeń.

### Przepełnienie przy 18 miejscach i miliardzie sztuk
- `tokenReserve * eIn`: `1e27 · eIn`. Bez `mulDiv` przepełnia przy `eIn > 1.16e50 wei = 1.16e32 ETH` — fizycznie nieosiągalne (cała podaż ETH ≈ 1.2e26 wei), ale **to jedyne miejsce, gdzie użytkownik kontroluje wielkość bez ograniczenia**. `mulDiv` usuwa ryzyko definitywnie; dodatkowo `MAX_BUY = 100 ether` jako granica analizy (33x cała zbiórka, nigdy nie zadziała w praktyce).
- `R * nIn`: `R ≤ 3.75e18`, `nIn ≤ 1e27` → `3.75e45`. Bezpieczne nawet naiwnie.
- Asercja `R·T`: `3.75e18 · 1e27 = 3.75e45` ≪ `1.16e77`. Bezpieczna.
- `T0² = 1e54` — bezpieczne, więc żadne wyrażenie czysto tokenowe nie grozi.
- Prowizja `msg.value · 200` — przepełnia dopiero przy `5.8e74 wei`.

Wniosek: **jedyne realne ryzyko to iloczyn rezerwy tokena przez niekontrolowaną wartość `msg.value`.** Reszta ma zapas 20+ rzędów wielkości.

---

## 3. Niezmienniki (do przepisania wprost w testy)

Po **każdej** operacji (kupno, sprzedaż, awans):

1. `(R_VIRT + ethReserve) * tokenReserve >= k_przed_operacją` — `k` niemalejące.
2. `T_MIN <= tokenReserve <= T0`
3. `token.balanceOf(krzywa) == tokenReserve` (dopóki nie awansowała)
4. `address(this).balance >= ethReserve` (prowizje wychodzą lub siedzą w osobnej `claimable[]`)
5. `token.totalSupply() == T0` — zawsze, na każdym etapie. Brak mintu po konstrukcji.
6. **Wypłacalność zbiorcza:** `quoteSell(T0 − tokenReserve) <= ethReserve`. (Wynika z 1, ale asercja ma zostać osobno — jest czytelna dla człowieka.)
7. `quoteSell(quoteBuy(E)) < E` dla każdego `E` — round-trip w jednym bloku zawsze na minusie o co najmniej `2·fee`.
8. `quoteBuy` monotonicznie rosnąca w `E`; cena po kupnie ostro rośnie, po sprzedaży ostro maleje.
9. `sum(fee_naliczone) == sum(fee_wypłacone) + claimable[protokół] + claimable[twórca]`
10. `graduated` jest jednokierunkowe; po `graduated == true`: `buy` i `sell` revertują, `ethReserve == 0`, `tokenReserve == 0`.
11. `ethReserve` maleje **wyłącznie** w `sell` i `graduate`. Nie istnieje ścieżka, która wyprowadza ETH do jakiegokolwiek adresu poza: sprzedający, odbiorca prowizji, pula przy awansie, wołający `graduate` (nagroda).
12. **Brak stanu, w którym posiadacz nie może wyjść.** Formalnie: dla każdego osiągalnego stanu i każdego `n > 0` posiadanego, `sell(n)` albo się udaje, albo token już awansował i istnieje pula.
13. Role tokena B20 (`MINT/BURN/PAUSE/SEIZE/METADATA`) == `address(0)` od bloku utworzenia; sufit podaży == `T0`; brak wpisu w rejestrze `0x8453…0002`. Sprawdzane raz w teście startowym i publikowane na stronie tokena.
14. Twórca: `creatorLocked[twórca]` nie może zostać sprzedane na krzywej przed awansem.

Uwaga techniczna do feedu: zdarzenie `Memo` z B20 niesie **wołającego**, a wołającym przy `transfer` z krzywej jest krzywa. Do atrybucji kupującego trzeba własnego zdarzenia — `Memo` jest tu bezużyteczne.

---

## 4. Prowizja

**1% od kupna i 1% od sprzedaży, w ETH, `immutable`, twardy sufit `MAX_FEE_BPS = 200` sprawdzany w konstruktorze.** Dokładnie wzorzec `AskEscrow` (`FEE_BPS immutable`, `MAX_FEE_BPS = 500`), tylko z niższym sufitem.

- **W ETH, nie w tokenie.** Token przed awansem nie ma wartości poza krzywą; prowizja w tokenie musiałaby zostać odsprzedana na krzywą, czyli protokół systematycznie dumpuje na własnych użytkowników. Do tego B20 ma role SEIZE/PAUSE i rejestr allowlist — nawet po ich zrzeczeniu nie chcemy trzymać bilansu w aktywie o takim kształcie.
- **Obie strony.** Prowizja tylko od sprzedaży czyni kupno darmowym → tanie wash-trading i ping-pong botów. Tylko od kupna czyni wyjście darmowym. Symetria jest jedyną wersją, która nie tworzy darmowej nogi.
- **Zmienna? NIE.** Prowizja jest wpalona w konstruktor krzywej przez stałą fabryki, też `immutable`. Zmiana warunków = **nowa fabryka pod nowym adresem**; tokeny wypuszczone starą fabryką mają swoje warunki na zawsze. To jest jedyna wersja „bez ról administracyjnych", której nie da się później podmienić narracją.

### Przychód — rozkład, nie średnia

**100 startów/miesiąc** (wolumen = ETH przepływające przez krzywą, kupna i sprzedaże liczone osobno):

| segment | liczba | wolumen/start | razem |
|---|---|---|---|
| martwe (twórca + 2 znajomych) | 70 | 0.05 ETH | 3.5 |
| mignięcia | 22 | 0.6 ETH | 13.2 |
| biegacze bez awansu | 6 | 4.0 ETH | 24.0 |
| **awansujące** | 2 | 12.0 ETH | 24.0 |
| | | | **64.7 ETH** |

Prowizja 1% → **0.647 ETH**. Plus 2 awanse × 0.05 ETH dla protokołu → **0.747 ETH/mies. ≈ $2 240** przy ETH = $3 000.

Mediana startu płaci **0.0005 ETH** prowizji (~$1.50). Średnia to 0.0065 ETH — **13x powyżej mediany**. Ośmiu startów z setki (8%) generuje **74% przychodu**. Średnia arytmetyczna nie opisuje żadnego rzeczywistego startu i nie wolno jej używać w prognozie.

**1000 startów/miesiąc.** Uwaga: nie skaluje się liniowo — wąskim gardłem jest uwaga, nie liczba tokenów; przy 10x większej liczbie startów ogon jest chudszy.

| segment | liczba | wolumen/start | razem |
|---|---|---|---|
| martwe | 780 | 0.04 ETH | 31.2 |
| mignięcia | 180 | 0.5 ETH | 90.0 |
| biegacze | 32 | 3.5 ETH | 112.0 |
| awansujące (0.8%) | 8 | 11.0 ETH | 88.0 |
| | | | **321.2 ETH** |

Prowizja 1% → 3.21 ETH, plus 8 × 0.05 → **3.61 ETH/mies. ≈ $10 830**. **10x więcej startów daje 4.97x przychodu.** Rocznie ok. 43 ETH ≈ $130k.

### Podział z twórcą
Rekomendacja: rozbić 1% na **0.6% protokół / 0.4% twórca**, w ETH, wypłacane pull-em przez `claimable[]` (wzorzec `AskEscrow`). To jest na tezie produktu — twórca zarabia na obrocie, który wygenerował, a nie na sprzedaży premine'u. Koszt: przychód protokołu spada do **0.49 ETH/mies.** przy 100 startach i **2.33 ETH/mies.** przy 1000.

Powiedzmy to wprost: **przy 100 startach miesięcznie to nie jest biznes, to błąd zaokrąglenia.** Model wymaga 1000+ startów miesięcznie albo przychodu po awansie (patrz sekcja końcowa).

---

## 5. Awans do puli

**Próg: `tokenReserve == T_MIN`, nie „ethReserve >= 3 ETH".** Warunek na tokenie jest dokładny w liczbach całkowitych; warunek na ETH mógłby wylądować na 2.9999… przez zaokrąglenia w dół i nigdy nie trafić. Dociągnięcie ostatniego kupna (sekcja 2) gwarantuje, że `T` ląduje na `T_MIN` co do jednostki.

### Co się dzieje
1. `GRAD_FEE = 0.1 ETH` z `ethReserve`: **0.05 protokół, 0.05 dla wołającego** jako nagroda za gaz.
2. Pozostałe **2.90 ETH** i część z 200M tokenów trafiają do puli typu v2 (pełny zakres) na Base.
3. **Pula jest zasilana dokładnie po cenie zamknięcia krzywej, nadmiar tokena jest palony.**
   `L = mulDiv(E_lp, T_MIN, R_VIRT + ethReserve) = mulDiv(2.90e18, 2e26, 3.75e18) = 154 666 666 tokenów`
   spalone: `200 000 000 − 154 666 666 = 45 333 334` (4.53% podaży).
   Cena otwarcia puli `2.90/154.67e6 = 1.875e-8 ETH` — **identyczna z ostatnią ceną na krzywej.** Bez tego kroku pula otwiera się 23% niżej i każdy, kto kupił na końcu krzywej, jest pod wodą w bloku awansu. To nie jest kosmetyka, to różnica między „pula otwiera się tam, gdzie krzywa się zamknęła" a kłamstwem.
   Podaż w obiegu po awansie: **954 666 666**.
4. **Tokeny LP są palone** (na `address(0)`). Nie do protokołu, nie do twórcy. To jedyna wersja, którą da się sprawdzić na łańcuchu bez zaufania. Koszt tej decyzji jest realny — patrz sekcja końcowa.
5. Pula jest **tworzona pusta przy starcie tokena, w tej samej transakcji co `createB20`** (adres B20 jest deterministyczny, więc da się), zainicjalizowana od razu ceną końcową. To likwiduje front-run polegający na utworzeniu puli po absurdalnej cenie zanim my zdążymy.

### Kto płaci gaz i co, jeśli nikt nie zawoła
Awans wykonuje się **automatycznie wewnątrz ostatniego kupna**, opakowany w `try/catch`. Ostatni kupujący płaci gaz i dostaje 0.05 ETH nagrody — jego koszt jest ujemny.

Jeśli `try` zawiedzie (pula w dziwnym stanie, limit gazu), stan przechodzi w `Locked`:
- **kupna revertują, sprzedaże DZIAŁAJĄ.** Nikt nigdy nie jest uwięziony. Sprzedaż podnosi `T` powyżej `T_MIN`, ale kupna zostają zablokowane, więc krzywa nie może się „odawansować".
- `graduate()` jest bezuprawnieniowe i płaci 0.05 ETH wołającemu; zasila pulę po **aktualnej** cenie krzywej z tą samą regułą palenia. Nagroda to ~100x koszt gazu na Base (0.05 ETH ≈ $150 vs. ~$0.30) — zawołanie nastąpi w tym samym bloku.
- Jeśli mimo to nikt nie zawoła: nic się nie psuje. Rezerwy stoją, każdy może wyjść po krzywej. Zły stan, ale nie stan zakładniczy.

---

## 6. Tokenomika startu

| | sztuk | % |
|---|---|---|
| podaż całkowita, mintowana raz | 1 000 000 000 | 100% |
| sprzedawane na krzywej | 800 000 000 | 80% |
| rezerwa awansu | 200 000 000 | 20% |
| → z tego do puli | ~154 666 666 | 15.5% |
| → z tego spalone | ~45 333 334 | 4.5% |
| **twórca za darmo** | **0** | **0%** |

- Mint w `initCalls` przy `createB20`, w tej samej transakcji zrzeczenie **wszystkich** ról (`MINT/BURN/PAUSE/SEIZE/METADATA` → `address(0)`) i ustawienie sufitu podaży = `T0`. Weryfikowalne przez `isB20Initialized` + odczyt ról. To jest „dowód" publikowany na stronie tokena.
- **Twórca nie dostaje nic za darmo.** Może kupić na krzywej w transakcji startowej („dev buy"), z twardym `immutable` limitem **2% podaży krzywej = 16 000 000 sztuk**. Koszt tego kupna po cenie startowej: `0.75e18 · 1.6e25 / 9.84e26 = 0.0122 ETH` (~$37). Wartość przy zamknięciu krzywej: `0.30 ETH` — **24.6x**. Powyżej 2% to premine z dodatkowym krokiem i tak trzeba to nazywać.
- **Blokada sprzedaży twórcy** dwustopniowo, bo blokada tylko na krzywej kończy się wraz z krzywą:
  1. do awansu — `creatorLocked` po stronie krzywej, `sell` revertuje dla tej puli sztuk;
  2. po awansie — tokeny twórcy idą do osobnego, per-start kontraktu `CreatorVesting`: liniowe odblokowanie przez **30 dni od awansu**, bez właściciela, bez odwołania, bez przyspieszenia. Token nie ma już żadnych ról, więc blokada musi mieszkać w kustodii, nie w tokenie.
- Prowizja twórcy (0.4%) narasta w `claimable[]` od pierwszej transakcji i **nie podlega blokadzie** — to zapłata za pracę, nie za trzymanie.

---

## GDZIE TA EKONOMIA SIĘ ŁAMIE

**Najmocniejszy argument przeciw: krzywa jest dowodliwie wypłacalna i jednocześnie dowodliwie gra o sumie ujemnej — a produkt, którego tezą jest „każda liczba z dowodem", musi tę drugą liczbę pokazać, i wtedy nikt go nie użyje.**

Tożsamość z sekcji 1 działa w obie strony: maksymalna zbiorcza wypłata równa się dokładnie zbiorczej wpłacie, minus prowizje. Nie ma tu żadnej produkcji wartości — jest `−2%` na obrót plus gaz, rozdzielone przez to, kto wszedł wcześniej. Uczciwy widget na stronie tokena brzmiałby: *„do tej krzywej wpłacono X ETH, wypłacono Y, prowizji zapłacono Z; średni uczestnik jest na minusie o W%"* — i dla ~98% startów W jest dodatnie i duże. To jest dokładnie ta liczba, której mysphere obiecuje nie chować. **Trzeba wybrać: albo ta liczba jest na stronie i produkt nie rośnie, albo produkt rośnie i teza „nigdy nie chwalimy się czymś, czego nie ma" ma wyjątek pod adresem launchpada.** Nie ma trzeciego wyjścia i nie należy udawać, że jest.

Cztery mniejsze wyłomy, każdy realny:

1. **Przychód pochodzi z zachowania, którego byśmy nie obronili.** 8 tokenów z 1000 daje większość obrotu. To są dokładnie te starty, gdzie najbardziej prawdopodobne jest skoordynowane pompowanie albo obrót własny. Nasz model maksymalizuje przychód wtedy, gdy dzieje się rzecz, którą publicznie potępiamy.

2. **Pula po awansie jest z definicji cienka.** 2.90 ETH głębokości przeciwko 954.7M tokenów w obiegu wartych nominalnie 17.9 ETH. Sprzedaż 5% podaży (47.7M) w takiej puli daje wypłatę 0.68 ETH i **−77% ceny**. „Awans na prawdziwą giełdę" brzmi jak koniec ryzyka, a jest jego początkiem. Komunikat produktowy musi to mówić w tym samym zdaniu, w którym mówi „awansował".

3. **Palenie LP zabija jedyny trwały przychód.** Grafowany token robiący $50k dziennego obrotu w puli 1% generuje ~$500/dzień opłat LP. Nasz udział przy spalonym LP: **zero**. Clanker na Base zarabia właśnie na tym strumieniu i robi na jednym udanym tokenie kilkadziesiąt razy więcej niż my na całej jego krzywej. Nasz dochód umiera dokładnie w chwili, gdy token staje się prawdziwy. To jest cena doktryny „bez ról" i ma być decyzją wycenioną, a nie odkryciem po pół roku.

4. **`immutable` nie zna kursu ETH.** `R_VIRT = 0.75 ETH` znaczy próg 3 ETH niezależnie od tego, czy ETH kosztuje $1 500 czy $15 000 — czyli zbiórka od $4.5k do $45k przy tych samych parametrach. Percepcja użytkownika jest w dolarach, kontrakt jest w ETH, a my nie mamy jak tego skorygować inaczej niż wypuszczając nową fabrykę i zostawiając stare tokeny z warunkami, które przestały mieć sens. Wyrocznia ceny ETH byłaby jedynym lekarstwem i jest zakazana przez tę samą doktrynę, która zakazuje ról. **Doktryna „zero administracji" nie jest darmowa — kosztuje dokładnie tyle: brak możliwości naprawy złej stałej.**

Drobiazg dla porządku: zaokrąglanie zawsze na korzyść puli tworzy pył (≤1 wei ETH i ≤1 jednostka bazowa na operację; przy 100k operacji ~1e-13 ETH). Nie ma funkcji ratunkowej i nie powinno być — cały pył wchodzi do puli przy awansie, więc jest wydany, nie uwięziony. Uwięziony zostaje tylko w tokenie, który nigdy nie awansował, i jest wtedy pomijalny.

---

## Raport 3

Probes deleted, working tree clean. Here is the report.

---

# Integracja z Base — B20 launchpad: ustalenia sprawdzone na łańcuchu

Wszystko oznaczone **[ODCZYT]** zostało zweryfikowane przez `eth_call` / `eth_getLogs` / `eth_estimateGas` na `https://mainnet.base.org` (chainId `0x2105`), blok ~`49714435`, 2026-08-08 19:45 UTC. Metoda: `eth_call` ze **state override** (potwierdziłem, że publiczne RPC Base go wspiera — kod podstawiony pod adres wykonał się poprawnie), więc mogłem symulować prawdziwe kontrakty bez wdrażania czegokolwiek.

---

## 0. PYTANIE NUMER JEDEN: kontrakt może wołać `createB20` — TAK

**[ODCZYT — podwójnie, symulacja + produkcja]**

Symulacja: podstawiłem kontrakt-forwarder pod adres `0x…0abc0001` i zawołałem `createB20`. Zwrócił token `0xb200000000000000000000BFEddB528968B991BB` — **dokładnie to, co przewiduje wzór dla adresu forwardera**, nie dla EOA, które wysłało transakcję. `msg.sender` w precompile to kontrakt.

Dowód z produkcji jest jeszcze mocniejszy. Przeczytałem 117 zdarzeń `B20Created` i sprawdziłem pole `to` w transakcjach — **8 z 8 ostatnich tokenów powstało przez kontrakt, ani jeden bezpośrednio z EOA na fabrykę**:

| token | `tx.to` | co to |
|---|---|---|
| `0xb20000000000000000000000570E2a61f907D401` | `0xa52ad458ce0282a971ecc71c051a32f28946bb9f` | launchpad, 21929 B kodu |
| `0xB20000000000000000000048612952435FF08CBB` | `0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789` | Safe singleton |
| `0xB200000000000000000000F38379793AF86d7101` | `0x0000000071727de22e5e9d8baf0edac6f37da032` | ERC-4337 EntryPoint |

**Architektura stoi:** launchpad jest jedynym twórcą, adres tokena = `0xb2` + `0x00`×9 + bajt wariantu + pierwsze 9 bajtów `keccak256(abi.encode(LAUNCHPAD, salt))`. Adres tokena jest przewidywalny off-chain przed transakcją. Uwaga uboczna: dużo adresów produkcyjnych kończy się na `01` — konkurencja kopie sole pod vanity.

### Fabryka działa też na Base Sepolia — zmierzone

**[ODCZYT — `https://sepolia.base.org`, 2026-08-10]** Trzy wywołania, sender = nasz kontrakt launchpada ERC-20 (`0x4Cc0ff50912400eeeC38db45ef5CEf00f5Ad1A48`, czyli KONTRAKT, nie EOA):

- `getB20Address(ASSET, launchpad, 0x11×32)` → `0xB2000000000000000000003d3c29D9E0D77DBAa5` — **co do bajtu zgodne** z lokalnym wzorem `keccak256(abi.encode(sender, salt))`.
- Pełna symulacja `createB20(ASSET, salt, {initialAdmin: address(0)}, [mint(launchpad, 1e27), updateSupplyCap(1e27)])` — **przechodzi** i zwraca ten sam adres. Kontrakt-jako-twórca i tryb admin-less działają na Sepolii identycznie jak na mainnecie.
- `isB20(launchpad)` → `false` (sanity: precompile odpowiada poprawnie, a nie oddaje pustkę).

Wniosek: cały cykl launchpada B20 da się testować na Sepolii, tam gdzie mieszka obecny Startpad. Punkt 4 z listy NIEPEWNYCH (pełny przebieg transakcyjny na Sepolii, łącznie z awansem) pozostaje do wykonania — powyższe to nadal `eth_call`, nie transakcje.

---

## 1. Tokeny bez właściciela — wymuszone kodem, nie regulaminem

**[ODCZYT]** To działa i jest mocniejsze, niż zakładałem. `B20AssetCreateParams.initialAdmin` przyjmuje `address(0)`, a `initCalls` **omijają bramki ról w oknie bootstrapu**. Czyli token rodzi się od razu bez żadnego administratora, a podaż i tak zostaje wybita.

Jedno wywołanie, `initialAdmin = address(0)`, `initCalls = [mint(launchpad, 1e27), updateSupplyCap(1e27)]`. Wynik odczytany z nowego tokena w tym samym `eth_call`:

```
totalSupply   = 1e27      balanceOf(launchpad) = 1e27
supplyCap     = 1e27      (== totalSupply, nie UNCAPPED)
hasRole(DEFAULT_ADMIN_ROLE, launchpad) = false
hasRole(DEFAULT_ADMIN_ROLE, address(0)) = false
hasRole(DEFAULT_ADMIN_ROLE, factory)    = false
hasRole(MINT_ROLE,  launchpad) = false
hasRole(PAUSE_ROLE, launchpad) = false
pausedFeatures() = []     policyId(TRANSFER_SENDER) = 0
```

Wszystkie ataki po starcie odbite błędem `AccessControlUnauthorizedAccount` (`0xe2517d3f`):

| próba | wynik |
|---|---|
| `mint(launchpad,1)` | **zablokowane** (rola `0x154c0081…6c3686`) |
| `grantRole(DEFAULT_ADMIN_ROLE, launchpad)` | **zablokowane** |
| `pause([TRANSFER])` | **zablokowane** (rola `0x139c2898…816e46d`) |
| `updateSupplyCap(uint256.max)` | **zablokowane** |
| `updatePolicy(TRANSFER_SENDER, 1)` | **zablokowane** |

A normalny obrót działa: `transfer` OK, `approve` OK, `transferWithMemo` OK, `DOMAIN_SEPARATOR` OK.

Rekomendacja: **`initialAdmin = address(0)` od pierwszej sekundy.** Nie twórz z adminem, żeby potem renonsować przez `renounceLastAdmin()` — to zostawia okno, w którym ktoś z kluczem może dodrukować. Wersja atomowa nie ma tego okna, a `supplyCap == totalSupply` domyka rzecz na poziomie niezmiennika, nie tylko braku roli.

Sygnatury do przypięcia:
```solidity
createB20(uint8,bytes32,bytes,bytes[])  → 0x62975e6a
getB20Address(uint8,address,bytes32)    → 0x8c30260f
isB20(address)                          → 0xfa19b927
isB20Initialized(address)               → 0x6a45ba98
struct B20AssetCreateParams { uint8 version /*=1*/; string name; string symbol; address initialAdmin; uint8 decimals /*6..18*/; }
```

**[ODCZYT] Wariant ASSET nie ma w ogóle `SEIZE_ROLE()`** — selektor `0x3c7e9ba5` odbija się od precompile jako nieznany (charakterystyczny rewert echa selektora). Konfiskata to sprawa wariantu STABLECOIN. Dla launchpada memecoinów bierzemy ASSET i temat konfiskaty znika.

---

## 2. Koszt i płatność

**[ODCZYT]**
- `createB20` jest w interfejsie `payable`, ale **każde wei rewertuje** błędem `NonPayable()` (`0x6fb1b0e9`). Sprawdzone z `value: 0x1`. Fabryka nie pobiera żadnej opłaty.
- Gaz (`eth_estimateGas`, wariant ASSET, admin-less):

| co | gaz |
|---|---|
| `createB20`, 0 `initCalls` | **156 106** |
| + 1 `initCall` (`mint`) | **209 070** |
| + 2 `initCalls` (`mint`+`updateSupplyCap`) | **211 744** |

Tanio. Cała ceremonia startu tokena to ~212k gazu — mieści się swobodnie w jednej transakcji razem z resztą logiki launchpada.

---

## 3. Giełda na Base — adresy z potwierdzonym kodem

**[ODCZYT]** `eth_getCode` na każdym, rozmiar w bajtach:

| kontrakt | adres | kod |
|---|---|---|
| **Uniswap v4 PoolManager** | `0x498581fF718922c3f8e6A244956aF099B2652b2b` | 24 009 B |
| **Uniswap v4 PositionManager** | `0x7C5f5A4bBd8fD63184577525326123B519429bDc` | 23 877 B |
| **Uniswap v4 Universal Router** | `0x6fF5693b99212Da76ad316178A184AB56D299b43` | 19 499 B |
| Uniswap v4 Quoter | `0x0d5e0F971ED27FBfF6c2837bf31316121532048D` | 5 820 B |
| Uniswap v4 StateView | `0xA3c0c9b65baD0b08107Aa264b0f3dB444b867A71` | 3 531 B |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` | 9 152 B |
| Aerodrome Router | `0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43` | 23 581 B |
| Aerodrome PoolFactory | `0x420DD381b31aEf6683db6B902084cB0FFECe40Da` | 3 516 B |
| Aerodrome Slipstream CLFactory | `0x5e7BB104d84c7CB9B682AaC2F3d509f5F406809A` | 4 958 B |
| Aerodrome Slipstream NFPM | `0x827922686190790b37229fd06084350E74485b72` | 24 542 B |
| WETH9 | `0x4200000000000000000000000000000000000006` | 2 041 B |
| USDC | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | 1 852 B |

Precompile'e (`0xB20f…`, ActivationRegistry `0x8453…0001`, PolicyRegistry `0x8453…0002`) zwracają **pusty kod** — to normalne i nie znaczy, że ich nie ma.

### Hooki v4 — flagi siedzą w adresie

**[ODCZYT kodu źródłowego `Uniswap/v4-core/src/libraries/Hooks.sol`]** Hooki są na Base dostępne (PoolManager to standardowy v4). Uprawnienia hooka to **dolne 14 bitów jego adresu**, `ALL_HOOK_MASK = (1 << 14) - 1`:

| bit | flaga | bit | flaga |
|---|---|---|---|
| 13 | `BEFORE_INITIALIZE` | 6 | `AFTER_SWAP` |
| 12 | `AFTER_INITIALIZE` | 5 | `BEFORE_DONATE` |
| 11 | `BEFORE_ADD_LIQUIDITY` | 4 | `AFTER_DONATE` |
| 10 | `AFTER_ADD_LIQUIDITY` | 3 | `BEFORE_SWAP_RETURNS_DELTA` |
| 9 | `BEFORE_REMOVE_LIQUIDITY` | 2 | `AFTER_SWAP_RETURNS_DELTA` |
| 8 | `AFTER_REMOVE_LIQUIDITY` | 1 | `AFTER_ADD_LIQUIDITY_RETURNS_DELTA` |
| 7 | `BEFORE_SWAP` | 0 | `AFTER_REMOVE_LIQUIDITY_RETURNS_DELTA` |

Reguły z `isValidHookAddress`: adres hooka trzeba **wykopać CREATE2** tak, by dolne 14 bitów dokładnie odpowiadały zadeklarowanym `getHookPermissions()` — inaczej `HookAddressNotValid`. Flaga `*_RETURNS_DELTA` bez odpowiadającej jej flagi akcji jest odrzucana. `hooks == address(0)` jest legalne, ale wtedy opłata **nie może** być dynamiczna.

**Rekomendacja: startuj bez hooka (`hooks = address(0)`).** Kopanie adresu to dodatkowy krok deployu i dodatkowa powierzchnia audytu, a prowizję launchpada pobierasz na krzywej wiązanej, gdzie i tak masz pełną kontrolę. Hook zostaw jako opcję na później, jeśli będziesz chciał prowizji także po awansie.

---

## 4. AWANS: pula + płynność jednym wywołaniem — sprawdzone end-to-end

**[ODCZYT — pełna symulacja na mainnecie]** Napisałem kontrakt, który w **jednym `eth_call`** robi cały awans i handel na świeżym tokenie. Wynik dla `fee=10000, tickSpacing=200`, cena 1e9 tokenów za ETH:

```
token=0xb20000000000000000000014e73fc119d6323a7c   (admin-less, podaż 1e27)
v4 initialize OK tick=207243
modifyLiquidity delta0(ETH)=-948683298071025967  delta1(B20)=-948683298029999999999998368
settled native ETH
B20 transfer to PoolManager ok=true
settle() credited paid=948683298029999999999998368  owed=948683298029999999999998368   <-- co do wei
SWAP OK ethDelta=-10000000000000000  b20Delta=+9797755363979947999208453
took B20 out of pool
feeHarvest(delta=0) feesAccrued0=99999999999999  feesAccrued1=0
removal IS possible: delta0=31952776602367 delta1=31296184755534001733359
```

Identycznie przeszło dla `fee=3000, tickSpacing=60`.

Przepływ, który zadziałał (kontrakt, zero interakcji użytkownika):

```solidity
// currency0 = address(0) czyli natywny ETH — zawsze sortuje się przed 0xb2…
key = PoolKey({currency0: address(0), currency1: token, fee: 10000, tickSpacing: 200, hooks: address(0)});
poolManager.initialize(key, sqrtPriceX96);
poolManager.unlock(data);            // → callback unlockCallback(bytes)
  ├ modifyLiquidity(key, {tickLower: MIN, tickUpper: MAX, liquidityDelta: +L, salt: 0}, "")
  ├ settle{value: ethOwed}()                       // natywny ETH: bez sync()
  └ sync(token); token.transfer(poolManager, owed); settle();   // B20: sync PRZED transferem
```

### Jak zamknąć płynność nieodwracalnie

**[ODCZYT] Na poziomie AMM usunięcie płynności jest możliwe** — celowo to sprawdziłem, `liquidityDelta = -1e18` przeszło i oddało oba aktywa. Czyli **blokada musi wynikać z kodu naszego kontraktu, nie z Uniswapa.**

Najczystsze rozwiązanie na v4 — i to jest przewaga v4 nad v2/v3: **nie używaj PositionManagera ani NFT w ogóle.** Pozycja w v4 jest kluczowana przez `(owner, tickLower, tickUpper, salt)`, gdzie `owner` to adres wołający `modifyLiquidity`. Wystarczy, że właścicielem jest `LiquidityVault` — mały kontrakt, w którym jedyna ścieżka do `modifyLiquidity` ma twardy warunek:

```solidity
// jedyne wejście do PoolManagera w całym kontrakcie
function harvest() external {
    // liquidityDelta na sztywno 0 — nie parametr. Nie ma jak podać liczby ujemnej.
    poolManager.unlock(abi.encode(int256(0)));
}
```

Nie ma `rescue`, nie ma `withdraw`, nie ma roli admina, nie ma `delegatecall` — dokładnie wzorzec `AskEscrow.sol`. Płynność jest zamknięta, bo **nie istnieje bajt kodu, który mógłby ją wyjąć**, a nie dlatego, że ktoś obiecał.

**Bonus potwierdzony odczytem:** `modifyLiquidity` z `liquidityDelta = 0` zwraca **same narosłe opłaty** (`feesAccrued0 = 99999999999999` po jednym swapie 0.01 ETH przy fee 1%). Czyli zamknięta płynność **nie zabija przychodu** — vault może wiecznie zbierać opłaty LP i wypłacać je twórcy i nam, nigdy nie mogąc ruszyć kapitału. To jest ta rzadka konstrukcja, gdzie „nie da się wyjąć" i „zarabia" nie kłócą się ze sobą.

Spalenie NFT z PositionManagera to gorszy wariant: ERC-721 `transfer` na `address(0)` zwykle rewertuje, a `burn` w v4 PositionManager wymaga pustej pozycji. Odpada.

---

## 5. Wykresy — DexScreener i GeckoTerminal indeksują same

**[ODCZYT — API obu serwisów, prawdziwe tokeny B20]**

| token B20 | DexScreener | GeckoTerminal |
|---|---|---|
| `0xb2…9eB72abc09F7D21e01` (PaperMoney) | `uniswap` PaperMoney/ETH | `uniswap-v4-base`, rezerwa **$4 294** |
| `0xB2…8CF600138576B30901` (Toadpepe) | `uniswap` Toadpepe/ETH | `uniswap-v4-base`, rezerwa **$4 359** |
| `0xB2…99b165bdbcC2153d01` (CFA), wiek 34 min | 1 para | `uniswap-v4-base` |

`uniswap-v4-base` jest na liście DEX-ów GeckoTerminal dla Base, a w feedzie `new_pools` widziałem pulę v4 sprzed 26 minut. **Nic nie trzeba zgłaszać** — oba serwisy czytają `name()`/`symbol()` prosto z precompile i pokazują je poprawnie.

**Ale jest haczyk produktowy, i to ważny.** Indeksery reagują na **powstanie PULI**, nie na powstanie tokena. Tokeny, które siedzą jeszcze na krzywej wiązanej, mają w obu serwisach **zero pul** — sprawdziłem 6 świeżych B20, cztery nie miały nic. Czyli:

> Przed awansem nie będzie żadnego zewnętrznego wykresu. Wykres na krzywej musimy narysować sami z własnych zdarzeń.

To akurat pasuje do tezy produktu — nasz wykres z naszych zdarzeń jest liczbą z dowodem — ale trzeba to zaplanować, a nie odkryć po starcie. **Nie wolno obiecywać „token od razu na DexScreenerze"**, bo to nieprawda do momentu awansu. Opóźnienie po awansie: rzędu minut (pula CFA miała 34 minuty i była już w obu).

---

## 6. Pułapki B20 przy AMM — czysto, z jednym zastrzeżeniem

**[ODCZYT]**

- **Zgodność z Uniswapem v4: pełna.** `sync` → `transfer` → `settle` zaksięgowało **`paid == owed` co do wei**. Zero fee-on-transfer, zero rebasingu przy standardowym multiplierze. Swap przeszedł i wypłacił tokeny.
- **Blocklist/allowlist nie może zablokować puli.** `policyId(TRANSFER_SENDER)` = `0`, a dokumentacja mówi wprost: `0` to *„always-allow built-in"*, wartość dla slotu, któremu nigdy nic nie przypisano. Zmiana wymaga `updatePolicy`, czyli `DEFAULT_ADMIN_ROLE` — **którego przy `initialAdmin = address(0)` nie ma i nie da się odtworzyć.** Polityki są opt-in per token; **nie ma globalnej polityki narzucanej przez Base wszystkim tokenom** [Z DOKUMENTACJI `IPolicyRegistry.sol` + ODCZYT `policyId == 0`].
- **Pauza nie może zablokować puli.** `pausedFeatures()` = `[]`, a `PAUSE_ROLE` jest pusta na trwałe. Enum: `TRANSFER, MINT, BURN, SEIZE`.
- **Konfiskaty nie ma** w wariancie ASSET (patrz §1).
- **Kolejność walut:** token zaczyna się od `0xb2`, więc przy parze z natywnym ETH (`address(0)`) token jest **zawsze `currency1`**. Przy parze z USDC (`0x8335…`) też zawsze `currency1`. Wygodne — kolejność jest deterministyczna, nie trzeba sortować w runtime.
- **`Memo` niesie wołającego, nie płacącego** — przy `transferFromWithMemo` przez router w evencie będzie **adres routera**, nie użytkownika. Nie da się z tego zbudować atrybucji płatności po awansie. Na krzywej, gdzie użytkownik woła nasz kontrakt, to nasz launchpad będzie `caller`. **Nie opieraj na `Memo` niczego, co pokazujesz użytkownikowi jako „kto zapłacił".**

### NIEPEWNE — do domknięcia przed kodem produkcyjnym

1. **`multiplier` wariantu ASSET.** `IB20Asset.sol` ma zaplanowane mnożniki podaży (`InvalidMultiplier`, `NoScheduledMultiplier`, `EffectiveAtInPast`). Nie sprawdziłem, czy da się je ustawić **bez** `DEFAULT_ADMIN_ROLE` ani czy domyślny mnożnik jest na stałe 1. Jeśli mnożnik dałoby się kiedykolwiek zmienić, byłby to rebase pod pulą AMM — klasyczny sposób na zepsucie księgowości Uniswapa. Zakładam, że jest za rolą admina (czyli u nas martwy), ale **to trzeba potwierdzić odczytem, zanim pójdzie prawdziwy kapitał**.
2. **Aerodrome nie został przeze mnie przetestowany z B20** — potwierdziłem tylko, że adresy mają kod. Cała ścieżka end-to-end jest zweryfikowana **wyłącznie dla Uniswap v4**. Jeśli awans miałby iść na Aerodrome, trzeba powtórzyć ten sam test.
3. **`ActivationRegistry`** — wariant ASSET jest ewidentnie aktywny na mainnecie (tokeny powstają), ale nie sprawdzałem, czy Base może go **dezaktywować** i co by to zrobiło z istniejącymi tokenami. Ryzyko poza naszą kontrolą, warte jednego zapytania do dokumentacji.
4. **Symulacja to nie transakcja.** Wszystko powyżej to `eth_call` na prawdziwym stanie mainnetu — bardzo mocny dowód, ale ostateczne potwierdzenie to jeden pełny przebieg na Base Sepolia, łącznie z awansem.

---

## Rekomendowany kształt architektury

```
LaunchpadFactory  ── createB20(ASSET, salt, {initialAdmin: 0}, [mint(curve,S), updateSupplyCap(S)])
      │                    jedna transakcja, ~212k gazu, token bez właściciela od bloku zero
      ├─> BondingCurve     trzyma całą podaż + ETH; prowizja immutable z twardym sufitem
      │                    (wzorzec AskEscrow.sol: zero ról, brak rescue/withdraw)
      └─> po progu ──────> LiquidityVault
                           initialize(key) + unlock/modifyLiquidity(+L) + settle
                           potem JEDYNIE harvest() z liquidityDelta zaszytym na 0
```

Trzy niezmienniki, każdy wymuszony kodem i każdy sprawdzony odczytem:
1. **Nikt nie dodrukuje** — brak `MINT_ROLE`, `supplyCap == totalSupply`.
2. **Nikt nie zapauzuje ani nie zablokuje** — brak `PAUSE_ROLE`, `policyId == 0` bez ścieżki zmiany.
3. **Nikt nie wyjmie płynności** — `liquidityDelta` stała 0, brak funkcji wyjścia; opłaty LP nadal płyną.

Czego produkt **nie może** o sobie powiedzieć: że token ma wykres na DexScreenerze przed awansem, oraz że `Memo` identyfikuje płacącego po awansie.

**Repo jest czyste** — kontrakty sondujące (`contracts/_probe_tmp/`) oraz `artifacts/`, `cache/`, `typechain-types/` zostały skasowane, `git status` pusty.
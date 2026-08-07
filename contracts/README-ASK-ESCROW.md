# AskEscrow

Kontrakt escrow pod Aski. Blokuje USDC **przy zakladaniu** Aska i wypuszcza je
dopiero przy rozstrzygnieciu albo po terminie.

Domyka jedyna obietnice z manifestu (`app/re-definition/page.tsx`, sekcja
`$2.00 - one seat, one answer`), ktora byla tam opisana w czasie terazniejszym,
a nie istniala: *"You set all three, fund it once in USDC"*.

Od podpiecia kontraktu `funding` ma dwie wartosci i **obie zyja**: `'escrowed'`
blokuje budzet przy zakladaniu, `'on-resolve'` nie blokuje NICZEGO i autor placi
dopiero przy przyjeciu odpowiedzi, albo nie placi wcale. Escrow jest wyborem
autora dla pojedynczego Aska, nie wlasnoscia produktu - zaden tekst nie ma prawa
napisac "budzet jest zablokowany" bez zajrzenia w to pole.

## Stan wdrozenia

| | Base mainnet (8453) | Base Sepolia (84532) |
|---|---|---|
| adres | `0xD5f65Cfbe6A1AA1B6f82CBE0A336DDFCD39a5340` | `0xd02A166A186bcc5C537FeCD5103E9c1A94Bb49D6` |
| blok | 49635587 | 45141319 |
| transakcja | `0xef01d6ae1dbdd2efdfdbc166c2cbc43d05f31bb25c38db5b44732e6312376255` | `0xda4602608629843df3c0f3b9cb413407efcec2bddcac38aa7d1d345118642a5f` |
| token | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` (USDC, 6 miejsc) | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` (USDC, 6 miejsc) |
| oplata | 2,5% (`FEE_BPS = 250`, limit 500) | 2,5% (`FEE_BPS = 250`, limit 500) |
| zrodlo | **zweryfikowane na Basescanie** | **zweryfikowane na Basescanie** |

Zrodlo mainnetu:
<https://basescan.org/address/0xD5f65Cfbe6A1AA1B6f82CBE0A336DDFCD39a5340#code>

Adresy sa w `deployments/askEscrow.<chainId>.json` i **stamtad je czytaj** -
`app/utils/asks/escrow.ts` importuje oba pliki i wybiera po `chainId`. Nie wpisuj
adresu na sztywno w kodzie ani w tekscie interfejsu.

> ### Odbiorca oplaty to ten sam goracy klucz, ktory wdrazal
>
> `FEE_RECIPIENT` = `0xD4885A5aa53446843CABcDE1F35DE9b4E906030e` na **obu**
> sieciach, mainnet wlacznie, i jest to adres wyprowadzony z `ADMIN_PRIVATE_KEY`.
> Zamiar byl inny - skrypt ma `ASK_ESCROW_FEE_RECIPIENT` wlasnie po to, zeby
> podac osobny adres - ale mainnet poszedl bez niego.
>
> **Co to znaczy naprawde:** klucz uzywany do wdrozen zbiera oplaty. `FEE_BPS`
> i `FEE_RECIPIENT` sa `immutable`, wiec zmiana to **nowy deployment**, a nie
> transakcja administracyjna.
>
> **Czego to NIE znaczy:** ten klucz nie ma wladzy nad cudzymi pieniedzmi.
> Kontrakt nie ma `owner`, `pause`, `upgrade` ani funkcji ratunkowej, a
> `FEE_RECIPIENT` odbiera swoje saldo tym samym `claim()` co kazdy inny.
> Przejecie klucza kosztuje zebrane oplaty - nie budzety Askow.
>
> Wlasciciel podjal te decyzje swiadomie. Jest tu opisana, zeby przy nastepnym
> wdrozeniu byla wyborem, a nie przeoczeniem.

---

## Po co

Ask przenosi ryzyko na piszacego: **pracuje, zanim dostanie pieniadze**. Bez
escrow jedyne, co go chroni, to reputacja autora (`resolve rate`) - czyli
obietnica. Z escrow moze **sam sprawdzic przed napisaniem odpowiedzi**, ze na
jego miejsce naprawde lezy zablokowana kwota:

```solidity
escrowFor(author, askId) -> (perAnswer, deadline, seats, budget, funded, open)
```

To jest cala roznica miedzy slowem "escrow" a faktem.

---

## Cykl zycia

```
fund()                     resolve()                       claim() / claimFor()
autor blokuje         ->   autor wskazuje adresy      ->   kazdy odbiera swoje
seats * perAnswer          salda przypisane                (kontrakt wysyla
                           NIEODWRACALNIE                    tylko do wlasciciela
                                                             salda)
                           settleExpired()
                      ->   po deadline + 48h          ->   claim()
                           budzet wraca do autora
                           minus oplata
```

### Gdzie DOKLADNIE leci oplata

Nie ma jednego zdania "oplata jest przy wygasnieciu" - to bylo prawda przed
przegladem adwersarialnym i **juz nie jest**. Regula, ktora obowiazuje w kodzie:

**oplate placi wylacznie to, co WRACA DO AUTORA.** Wyplata dla odpowiadajacego
to zawsze pelne `perAnswer`, nigdy pomniejszone.

| sytuacja | co wraca do autora | oplata |
|---|---|---|
| `resolve` **przed** `deadline` | nic - trzeba wypelnic KAZDE miejsce (`EarlyResolveMustFillSeats`) | **zero**, bo zwrot jest zerowy |
| `resolve` **po** `deadline`, czesciowe | `(seats - n) * perAnswer` | **2,5% od zwrotu** |
| `settleExpired` po `deadline + 48h` | caly budzet | **2,5% od budzetu** |

Powod, dla ktorego oplata jest takze przy `resolve` (`AskEscrow.sol:529-553`):
gdyby jej tam nie bylo, odzyskanie pieniedzy przez `resolve` byloby zawsze
tansze niz przez wygasniecie, wiec autorowi **oplacaloby sie** przyjac jedna
odpowiedz zamiast zadnej i na tym skonczyc. Teraz obie drogi wyjscia kosztuja
tyle samo i wybor miedzy nimi przestaje byc decyzja finansowa.

> **UWAGA: docblock nad `resolve()` w `AskEscrow.sol` (linie 415-417) mowi
> odwrotnie** - *"Niewykorzystane miejsca wracaja do autora BEZ oplaty. Oplata
> jest wylacznie na sciezce wygasniecia"*. To zostalo z wersji sprzed naprawy
> i **klamie**; kod 60 linii nizej pobiera oplate od zwrotu.
>
> Komentarza **nie poprawiono celowo**. Zrodlo jest zweryfikowane na Basescanie,
> a metadane solc obejmuja hash zrodla - zmiana chocby jednego znaku w
> komentarzu sprawia, ze plik w repo przestaje odtwarzac wdrozony bytecode co do
> bajta. Wybor byl miedzy myslacym komentarzem a odtwarzalnoscia; wygrala
> odtwarzalnosc, a sprostowanie stoi tutaj. **Przy nastepnym deploymencie
> popraw tamten docblock** - wtedy zrodlo i tak sie zmienia.

| Funkcja | Kto | Kiedy |
|---|---|---|
| `fund(askId, perAnswer, seats, deadline)` | kazdy, zostaje autorem | zawsze |
| `resolve(askId, winners[], answerRefs[])` | **tylko autor** | do `deadline + 48h` |
| `settleExpired(author, askId)` | **ktokolwiek** | po `deadline + 48h` |
| `claim()` / `claimFor(account)` | ktokolwiek, srodki zawsze do wlasciciela salda | zawsze |

`resolve` jest **terminalne** - jedno rozstrzygniecie, wszystkie odpowiedzi
otwieraja sie naraz. Okna `resolve` i `settleExpired` sa **rozlaczne**, wiec nie
ma wyscigu i nie ma czego frontrunowac.

---

## Jak uzyc

### 1. Deploy

```
constructor(address token_, address feeRecipient_, uint16 feeBps_)
```

- `token_` = USDC na Base: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- `feeBps_` <= `MAX_FEE_BPS` (500 = 5%), limit jest w **kodzie**, nie w configu

Wszystkie trzy sa `immutable`. **Zmiana oplaty = nowy deployment** - nie ma
admina, ktory moglby ja podniesc.

### 2. Klucz Aska

```ts
key = keccak256(abi.encode(author, askId))   // == keyFor(author, askId)
```

`askId` to `bytes32` z identyfikatora dokumentu Firestore. Auto-ID Firestore ma
20 znakow, wiec miesci sie w `bytes32` i zostaje **czytelny w explorerze**:

```ts
const askId = ethers.encodeBytes32String(firestoreId);   // <= 31 bajtow
```

Autor jest czescia klucza, wiec kazdy ma **wlasna przestrzen nazw** - nikt nie
zasiedzi cudzego `askId`, mimo ze jest jawny w feedzie.

### 3. Finansowanie

Dwie transakcje: `approve(escrow, seats * perAnswer)`, potem `fund(...)`.

> **UWAGA - tu najlatwiej pomylic sie o 10^12.**
> USDC ma **6 miejsc dziesietnych**, nie 18. `1 USDC = 1_000_000`.
> `deadline` jest w **sekundach**, a `Ask.deadline` w repo trzyma
> **milisekundy** - konwersja nalezy do klienta i musi byc w jednym miejscu.

> **UWAGA - zaokraglenie.** `perAnswerFor()` w `types.ts` tnie do **centa**
> (2 miejsca), a USDC ma 6. Klient musi wyslac
> `perAnswerFor(budget, seats) * 1e6`, a **nie** `budget * 1e6 / seats` -
> inaczej karta obieca inna kwote niz lancuch. Kontrakt bierze `perAnswer`,
> a nie budzet, wiec reszta z dzielenia **nigdy nie wchodzi do escrow** i nie
> ma tu pylu do sprzatania.

### 4. Wiazanie z Firestore

Do dokumentu Aska dochodzi `escrowKey`, `fundTxHash`, `escrowChainId`.

> Pole `funding` wolno przestawic na `'escrowed'` **wylacznie** po odczycie
> `escrowFor(author, askId)` i porownaniu `perAnswer` / `seats` / `deadline`
> z dokumentem. **Nigdy** na podstawie hasha transakcji przyslanego przez
> klienta - klient moze wyslac dowolny hash.

`acceptAnswer()` w `asks.ts` przestaje byc wywolaniem na jedna odpowiedz
i staje sie zapisem wsadowym: jeden `resolve` = jeden hash wpisany przy
wszystkich przyjetych odpowiedziach, a `answerRef` w logu `SeatAwarded`
wskazuje, ktora odpowiedz dostala ktora wyplate.

### 5. Dostarczenie wyplaty

Po `resolve` aplikacja wola `claimFor(winner)` dla kazdego zwyciezcy - osobna
transakcja na kazdego, wiec jeden zablokowany odbiorca nie przewraca dostawy
pozostalym. Odpowiadajacy nie musi robic nic.

---

## Dlaczego ksiegowanie, a nie przelew

`resolve()` **nie wysyla tokenow** - przypisuje salda (`claimable`), a wysyla je
dopiero `claim()` / `claimFor()`.

Powod jest praktyczny: USDC ma **czarna liste Circle**, a portfel odbiorcy moze
byc kontraktem, ktory rewertuje. Gdyby `resolve()` wysylalo tokeny w petli,
**jeden** taki adres wywracalby **cale** rozstrzygniecie - i kazdy moglby to
wywolac celowo, pisujac jedna odpowiedz z zablokowanego adresu. To griefing za
cene jednej odpowiedzi.

Dlatego **"payout leaves immediately" znaczy tu: w chwili `resolve` srodki
przestaja byc autora nieodwracalnie** (nie ma w kodzie sciezki, ktora by mu je
oddala), a dostarczenie robi `claimFor()`. To mocniejsza obietnica niz dzisiejszy
`on-resolve`, ale **to nie jest przelew na konto** - i tekst w
`app/re-definition/page.tsx` musi mowic to samo, co robi kod.

---

## Czego kontrakt NIE robi

1. **Nie orzeka o jakosci ani istnieniu odpowiedzi.** Nigdy nie widzi tresci.
   Gwarantuje **dostepnosc pieniedzy**, nie uczciwosc wyroku.

2. **Nie zamyka self-dealingu.** Autor moze przyjac wlasny drugi portfel
   i odzyskac budzet, placac sam sobie - na lancuchu jest to nieodroznialne od
   uczciwego rozstrzygniecia. `resolve` blokuje tylko wersje najtansza
   (`winner == autor`). Reszte moze zlapac wylacznie aplikacja, porownujac
   adresy zwyciezcow z tym, kto faktycznie odpowiedzial. To samo dotyczy
   ucieczki od oplaty: przyjecie jednego wlasnego adresu kosztuje gaz, nie
   `perAnswer`.

3. **Nie wie, czy zaplacono wlasciwej osobie.** Mapowanie odpowiedz -> adres
   pochodzi z Firestore. Kontrakt przenosi ryzyko **kustodii** z portfela autora
   do kodu; ryzyko **atrybucji** zostaje w aplikacji. `answerRef` pozwala to
   udowodnic **po fakcie**, nie zapobiec.

4. **Nie ma sporu ani cofniecia.** Po `resolve` nie ma "odpowiedz byla
   bezwartosciowa". Kazdy mechanizm cofania oddawalby autorowi wladze nad juz
   odpieczetowana praca.

5. **Nie ma rozstrzygniecia po `deadline + 48h`.** Spozniony autor idzie
   sciezka wygasniecia - dostaje zwrot minus oplata i musi zaplacic recznie.
   Kupujemy tym rozlaczne okna czasowe. **UI musi odliczac czas glosno.**

6. **Nie ma czesciowego zwrotu przed czasem.** Miejsca wracaja albo przy
   rozstrzygnieciu (terminalnym), albo po terminie. Nie da sie oddac 2 z 5
   miejsc i zostawic Aska otwartego.

7. **Nie ma admina.** Zero `Ownable`, zero `pause`, zero upgrade'u, zero
   funkcji ratunkowej. Na escrow pauza znaczy "uzytkownik nie odzyska
   pieniedzy", czyli dokladnie to, przed czym escrow ma chronic.
   **Konsekwencja:** USDC wyslane **bezposrednio** na adres kontraktu jest
   **nie do odzyskania**. Swiadomie - funkcja "rescue" to wieksza dziura niz to,
   co lata.

8. **Nie ma clawbacku nieodebranych sald.** Saldo kogos, kto stracil portfel,
   zostaje tu na zawsze. Przedawnienie na rzecz autora albo skarbca byloby
   uprawnieniem do zabrania cudzego zarobku - a takie uprawnienie predzej czy
   pozniej zostanie uzyte albo wyludzone.

9. **Jeden token, jedna siec, jeden ksztalt Aska.** Brak wielotokenowosci, brak
   zmiany budzetu, brak dokladania miejsc, brak przedluzania terminu, brak
   anulowania. Pole `token` w typie `Ask` zostaje **opisem, nie wyborem**.

10. **Nie ma permita (EIP-2612)**, mimo ze USDC na Base go wspiera.
    Finansowanie to dwie transakcje. Do rozwazenia osobno, gdy okaze sie realnym
    problemem - nie z gory.

11. **Nie sprawdza minimalnej kwoty** (`MIN_PER_ANSWER = 0.5`). To polityka
    cenowa, ktora ma prawo sie zmieniac, a kontrakt jest niezmienny - jej
    miejsce jest w UI.

---

## Stan weryfikacji

- Kompiluje sie czysto: **solc 0.8.20**, optimizer 200, `viaIR` - te same
  ustawienia co `hardhat.config.ts`. **0 ostrzezen**, bytecode 4016 B.
- Niezmienniki ksiegowe sprawdzone symulacja (20 000 losowych przebiegow):
  - `totalLiabilities == suma(claimable) + suma(budzetow otwartych Askow)`
  - dla kazdego klucza **suma wyplat == `seats * perAnswer`**, obiema sciezkami
- **Testy jednostkowe: 9, wszystkie przechodza** (`test/AskEscrow.test.ts`,
  `npx hardhat test`). Mock USDC ma **6 miejsc dziesietnych** - test na tokenie
  z 18 przepuscilby blad mnoznika o bilion.

  Pierwsze dwa testy odtwarzaja **atak znaleziony w przegladzie
  adwersarialnym**, nie sciezke szczesliwa: `resolve()` sprawdzalo wylacznie
  gorna granice czasu, wiec autor mogl oproznic escrow w tym samym bloku,
  w ktorym go zalozyl, za zerowa oplate - po przeczytaniu naplywajacych
  odpowiedzi. Zamkniete dwiema polowami naraz: przed terminem wolno zamknac
  Aska tylko wypelniajac KAZDE miejsce, a oplata leci od zwrotu takze przy
  rozstrzygnieciu (wczesniej tylko przy wygasnieciu, wiec wycofanie pieniedzy
  przez resolve bylo zawsze tansze).

- **Zgodnosc wdrozonego kodu z testowanym** potwierdzona dwoma niezaleznymi
  sposobami: zuzycie gazu przy wdrozeniu (922 219) zgodzilo sie z pomiarem
  z testow (922 207) co do dwunastu jednostek, a `verifyAskEscrow.js`
  porownuje bytecode z lancucha z lokalnym artefaktem (2,51% roznicy = sloty
  `immutable`).

### Co PRZESZLO na prawdziwym lancuchu, a co NIE

Ta granica ma znaczenie przy pisaniu czegokolwiek dla uzytkownika. Nie zacieraj
jej slowem "przetestowane".

**Przeszlo (Base Sepolia, prawdziwe USDC, nie MockUSDC), dwa razy:**
`approve` -> `fund` -> `resolve` z dwoma zwyciezcami -> `claimFor` x2.
Skrypt: `scripts/askEscrowCycle.js`. Salda po cyklu zgodne co do jednostki,
`totalLiabilities` wrocilo do zera.

**NIE przeszlo na zadnym lancuchu:**

1. **Sciezka wygasniecia (`settleExpired`).** Wymaga `deadline + 48h`, a czasu
   na publicznej sieci nie da sie przewinac. Pokryta **wylacznie testem
   jednostkowym**. Wolno napisac, ze kontrakt ja ma; **nie wolno napisac, ze
   zostala sprawdzona onchain**.
2. **Cala sciezka z przegladarki.** Kod klienta (`app/utils/asks/escrow.ts`,
   `app/asks/page.tsx`) jest sprawdzony typami i buildem, nie ruchem pieniedzy.
   Cykl powyzej dowodzi **kontraktu**, nie tego kodu - szedl skryptem z node,
   nie portfelem w oknie.
3. **Mainnet.** Kontrakt stoi i ma zweryfikowane zrodlo. Przez `fund()` na 8453
   nie przeszedl jeszcze ani jeden dolar.

### Czego NIE MA w interfejsie

`settleExpired` **nie ma zadnego wywolania w `app/`**. Autor, ktoremu minal
termin plus 48h, nie ma z UI jak odzyskac budzetu - musi zawolac kontrakt
recznie. Srodki nie sa uwiezione (funkcja jest bez uprawnien, wiec zawolac moze
ktokolwiek), ale **produkt nie robi tego za niego**. To jedyna sciezka kontraktu
bez interfejsu i tak jest opisana w manifescie (`Ask: expiry refund in the
interface`, status `not built`).

### Konfiguracja hardhata (zalatwione)

`paths.sources` wskazywalo na `./camp-contract`, wiec `npx hardhat compile`
**nie widzialo katalogu `contracts/`** - tego kontraktu nie dalo sie
skompilowac ani przetestowac standardowa komenda. Cztery kontrakty Campa
przeniesione do `contracts/`, `sources` przestawione. Skrypty wdrozeniowe
wolaja `getContractFactory` po NAZWIE, nie po sciezce, wiec przeniesienie
ich nie dotknelo.

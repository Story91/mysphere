# Rynek B20 - rozpoznanie

> Trzy raporty: rozbior konkurencji, zrodla danych i koszt odczytow,
> oraz nasze przewagi i projekt ekranu tworzenia.



---

## Raport 1

Przeczytalem obie specyfikacje, `addressing.ts` i konsole. Ponizej projekt.

---

# RYNEK B20 — projekt listy, ekranu tworzenia i wpiecia w produkt

## CZESC A — PRZEWAGI NA LISCIE

### A0. Punkty wyjscia: co potwierdzam, co obalam

**1. Sufit podazy i role — POTWIERDZONE POLOWICZNIE, i ta polowa jest wazna.**

`supplyCap()` i `totalSupply()` to dwa odczyty na dowolnym B20, bez indeksowania, bez historii. Z nich wynika zdanie, ktorego nikt nie pokazuje: **ile jeszcze mozna dodrukowac**. To jest liczba, nie opinia.

Role — **obalam w formie, jakiej chcielismy**. `hasRole(role, account)` jest per-adres. Nie da sie odpytac "czy ktokolwiek ma MINT_ROLE", bo nie ma po czym iterowac. Sprawdzenie tworcy i fabryki daje zdanie "tworca nie ma roli", a nie "nikt nie ma roli". Odznaka "admin-less" postawiona na takim odczycie **byloby naszym domysłem podanym jako fakt** — czyli dokladnie tym, czego nie robimy.

Wynika z tego drabina, ktora jest w calosci odczytem:

| stan | odczyt | co realnie znaczy |
|---|---|---|
| `supplyCap == totalSupply` | 2 calle | dodruk rewertuje, dopoki sufit stoi |
| `supplyCap > totalSupply` | 2 calle | **mozna dodrukowac dokladnie N sztuk = +X%**, wystarczy MINT_ROLE |
| `supplyCap == UNCAPPED` | 2 calle | brak gornej granicy |

Sufit mozna podniesc tylko przez `DEFAULT_ADMIN_ROLE`, wiec nawet "capped" nie znaczy "na zawsze". Zdanie na karcie brzmi wiec:

> **Capped.** Supply cap equals supply, so minting more reverts. Raising the cap needs an admin role — we cannot list every address that holds one.

**DO SPRAWDZENIA (blokuje odznake "admin-less", nie blokuje reszty):** czy precompile B20 emituje `RoleGranted`/`RoleRevoked`. Jesli tak — mozemy odtworzyc pelny zbior posiadaczy rol z logow i wtedy, i tylko wtedy, wolno napisac "no address holds an admin role". Jesli nie — odznaka nie powstaje, a zostaje zdanie powyzej.

**2. Ile tokenow z danego dnia nigdy nie dostalo puli — POTWIERDZONE, z zawezeniem zakresu.**

Da sie policzyc deterministycznie i bez osob trzecich: adres B20 zawsze sortuje sie jako `currency1` przy parze z natywnym ETH, wiec `poolId` czterech warstw oplat (10000/200, 3000/60, 500/10, 100/1, `hooks=0`) liczymy lokalnie i czytamy `slot0` przez StateView `0xA3c0…67A71`. `sqrtPriceX96 == 0` znaczy: puli nie ma.

Zawezenie, ktore musi byc napisane: to dowodzi braku **puli ETH na Uniswap v4 bez hooka**. Nie dowodzi braku rynku w ogole (v3, Aerodrome, para z USDC, pula z hookiem). Wiec naglowek brzmi tym, czym jest, a nie wiecej.

**3. MEMO jako kolumna rynkowa — OBALAM.**

Rozpoznanie mowi wprost: `Memo` niesie **wolajacego**, nie placacego. Po awansie wolajacym jest router, na krzywej — nasz launchpad. Kolumna "memo" na liscie tokenow bylaby wiec kolumna "ile razy router cos podpisal".

Ratuje sie w jednym waskim miejscu i tylko tam ma prawo istniec: **transfery bezposrednie, gdzie `Memo.caller == Transfer.from`**. Wtedy memo faktycznie napisal placacy. To jest sekcja na **stronie tokena**, nie kolumna na liscie:

> **12 transfers said what they were for.** These are direct wallet-to-wallet transfers where the sender wrote the memo themselves. Transfers made through a router or a launchpad are not counted here — the memo would name the router, not the person.

### A1. Naglowek listy — to jest cala tozsamosc produktu

Konkurencja nie pokazuje cmentarza celowo, bo cmentarz zabija konwersje. My stawiamy go w pierwszym ekranie, bo produkt, ktory nie chwali sie tym, czego nie ma, musi tez nie chowac tego, co jest.

```
┌───────────────────────────────────────────────────────────┐
│  Every B20 token on Base                                  │
│                                                           │
│  471 were created yesterday.                              │
│  9 have a market.  462 do not.                            │
│  ██▎ ─────────────────────────────────────────────  1.9%  │
│                                                           │
│  Counted from the creation events on chain, and from      │
│  reading the four Uniswap v4 ETH pools each token         │
│  could have. Read at block 49,714,435.                    │
└───────────────────────────────────────────────────────────┘
```

Pasek 1.9% w `soft-primary` na `soft-sunken`. Zadnego czerwonego. To nie jest ostrzezenie, to jest pomiar.

### A2. Segmenty zamiast "trending / hot / top"

"Trending" jest nasza opinia przebrana za dane. Segmenty sa odczytem:

```
[ Has a market ]  [ On a curve here ]  [ Never traded ]  [ All ]
      9                    3                  462
```

Ladujemy na **Has a market** — bo pierwszy ekran z 462 trupami nie jest uczciwoscia, tylko autosabotazem. Ale liczba trupow jest w naglowku nad tymi zakladkami i nie da sie jej minac. To jest caly kompromis i tak nalezy go opisywac.

Sortowanie, domyslnie **Net ETH in** — metryka droga do sfalszowania (raport D). Dalej: Buyers, Age, Mint headroom. **Nigdy: % change jako domyslne.**

### A3. Wiersz — desktop

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ PCKT   Pocket Rocket                    2.14 ETH in    38 buyers    4h       │
│ 0xb2…f00d   made by 0xa52a…bb9f (3,412 tokens today)                         │
│ ▁▂▃▅▇   CAPPED   UNI v4 · 2.9 ETH deep                                       │
├──────────────────────────────────────────────────────────────────────────────┤
│ MOON   Moon Thing                       0.00 ETH in     1 buyer     6h       │
│ 0xb2…19c3   made by 0xa52a…bb9f (3,412 tokens today)                         │
│         CAN MINT +412%    no market yet                                      │
├──────────────────────────────────────────────────────────────────────────────┤
│ SPHR   Sphere Coin                      1.84 ETH in    22 buyers   12m       │
│ 0xb2…cafe   made here                                                        │
│ ▁▂▃▄     CAPPED    curve · 1.84 / 3.00 ETH  ▰▰▰▰▰▰▱▱▱▱                       │
└──────────────────────────────────────────────────────────────────────────────┘
```

360px:

```
┌────────────────────────────┐
│ PCKT · 4h                  │
│ Pocket Rocket              │
│ 0xb2…f00d · made by 0xa52a │
│ ┌ CAPPED ┐ ┌ UNI v4 ┐      │
│ 2.14 ETH in · 38 buyers    │
│ ▁▂▃▅▇                      │
└────────────────────────────┘
```

Odznaki lamia sie do drugiej linii; sparkline znika ponizej 340px zamiast sciskac sie w nieczytelna kreske.

### A4. Kolumny — kazda z dokladnym odczytem

| kolumna | odczyt | dlaczego jest, a nie inna |
|---|---|---|
| **Ticker + name** | `symbol()`, `name()` | jedyne, co czlowiek czyta pierwsze |
| **Net ETH in** | ∑`ethNet(Bought)` − ∑`ethGross(Sold)` (nasze) / delta rezerwy puli (obce) | zamiast wolumenu: round-trip nie podnosi tej liczby, wiec wash-trading jej nie rusza |
| **Buyers** | odrebne adresy z `Bought` / odbiorcy `Transfer` minus tworca i pula | "kupilo 38 osob" zamiast "+340%" — inny produkt w oczach regulatora (raport E3) |
| **Supply** | `supplyCap()` vs `totalSupply()` | **kolumna, ktorej nie ma nikt.** Pierwsze pytanie kupujacego |
| **Market** | slot0 czterech `poolId` / nasze `launchOf` | cztery rozne wartosci, nigdy "$0.00" |
| **Age** | blok zdarzenia fabryki | 470 dziennie — wiek jest polowa informacji |
| **Made by** | `tx.to` transakcji tworzacej | patrz A5 |

### A5. Kolumna, ktorej naprawde nikt nie ma: **made by**

Z rozpoznania: **8 z 8 ostatnich tokenow powstalo przez kontrakt, ani jeden z EOA**. `tx.to` to adres narzedzia. Klastrowanie po nim jest darmowe i daje zdanie, ktorego zaden launchpad o sobie nie napisze:

> **Made by 0xa52a…bb9f** — the same contract made 3,412 tokens today, 61 of which have a market.

Dziala symetrycznie i wlasnie dlatego wolno je pokazac: nasze tokeny dostaja **"made here"** z ta sama statystyka, liczona tak samo. Jesli nasz wskaznik jest gorszy, bedzie widac. To jest cena wiarygodnosci tej kolumny i placimy ja swiadomie.

### A6. Trzy puste stany, nigdy jeden

To jest najwazniejsza regula tej listy. Kazda komorka rozroznia:

```
AWARIA   │  —              "could not read this"          soft-ink-faint, kursywa
PUSTKA   │  no market yet   (brak puli)                    soft-ink-faint
ZERO     │  pool is empty   (pula jest, plynnosc 0)        soft-ink-muted
```

Zakaz absolutny: `$0.00`, `0%`, `—` uzyte zamiennie. Wzorzec juz jest w produkcie — `EscrowFacts` w `app/asks/page.tsx:1652-1689` rozroznia "nie udalo sie odczytac" od "nic nie ma zablokowane" osobnym akapitem i osobnym przyciskiem. Kopiujemy ten wzorzec doslownie.

### A7. Zmiany ceny bez zieleni i czerwieni — rozstrzygniecie

Zielen/czerwien sa poza paleta i **nie dopisujemy ich**. Trzy powody, w kolejnosci wagi:

1. **Kolor kierunku wymusza naglowkowanie zwrotu.** Jak tylko `+12%` jest zielone, staje sie najjasniejsza rzecza w wierszu i produkt zaczyna sprzedawac zwrot. Raport E3 mowi wprost, ze "+340%" a "kupilo 12 osob" to materialnie rozne produkty.
2. **Karta Aska juz to rozstrzygnela** i nie robimy dwoch systemow: stany rozroznia **zdanie i ksztalt**, nie barwa (`app/asks/page.tsx:1696-1720` — kwota dostaje `soft-accent-deep`, ostrzezenie dostaje `role="alert"` i pelne zdanie, nie kolor).
3. Kolor jako jedyny nosnik kierunku wypada u ~8% mezczyzn.

Jak wiec rysujemy kierunek:

```
▲ 12%  since first trade      ← glif + etykieta OD CZEGO, w soft-ink
▼ 41%  since first trade
▁▂▃▅▇                          ← sparkline, wypelnienie soft-primary/12%,
                                 ta sama barwa w gore i w dol; kierunek
                                 czyta sie z nachylenia, nie z koloru
```

Procent nigdy nie dostaje `soft-accent` — nie jest kwota. `2.14 ETH` dostaje, bo jest.

### A8. Skad biora sie dane (skrot)

```
   eth_getLogs topic0=0xfd9bf273…ba0d      ~470/dzien, topics[1] = adres
        │
        ├─ tx.to  ────────────────────────►  "made by"
        │
        ├─ multicall: name/symbol/totalSupply/supplyCap  ►  odznaka podazy
        │
        ├─ poolId × 4  →  StateView.getSlot0/getLiquidity ►  market / no market
        │
        └─ nasze Bought/Sold (tylko nasze tokeny)         ►  krzywa, net in, buyers
```

Awaria kazdej z tych czterech galezi degraduje **jedna kolumne do stanu "could not read"**, a nie cala liste do bledu. Kolumna, ktorej nie odczytalismy, nie udaje zera.

### A9. Ruch

Wejscie wiersza: `translateY(4px)` + `opacity` 0→1, 180ms, `--ease-out-strong`. Nowe tokeny (kilka na minute) **nie wpychaja sie na gore listy** — zbieraja sie za pigulka `3 new`, ktora czlowiek dotyka sam. Tresc skaczaca pod czytajacym palcem jest gorsza niz tresc o minute stara.

---

## CZESC B — EKRAN TWORZENIA

Trasa `/b20/new`. Konsola (kopalnia + memo) przenosi sie na `/b20/tools` i przestaje byc pierwsza rzecza, ktora ktos widzi.

### B1. Trzy pola. Kazde uzasadnione

| # | pole | dlaczego jest |
|---|---|---|
| 1 | **Name** (≤32) | jedyne, co czlowiek czyta pierwsze |
| 2 | **Ticker** (≤10, wielkie litery, podpowiadany z nazwy) | kazdy wiersz listy zaczyna sie od tickera |
| 3 | **Your first buy** (ETH, domyslnie 0) | **musi byc na wierzchu.** To jedyne pole, ktore zmienia historie o uczciwosci startu. Konkurencja chowa premine w kroku "advanced" i wlasnie dlatego uchodzi jej to plazem |

Czego **nie ma** pol:

- **Podaz** — 1 000 000 000, stala. To nie jest wybor, wiec nie jest polem.
- **Parametry krzywej, oplata, prog** — `immutable`. Pokazane w panelu obok jako fakty, nie inputy.
- **Opis i obrazek** — **po podpisie, nie przed.** Nie sa czescia tego, co sie podpisuje, i nie zapisuja sie na lancuchu (METADATA martwa). Wstawienie ich przed podpisem sugeruje, ze sa czescia tokena. Po utworzeniu, na stronie tokena, z etykieta: *"Stored by mysphere, not on the chain. The name and ticker above are on the chain and cannot change; this can."*

### B2. Ile klikniec do podpisu

```
[wallet juz polaczony]
   wpisz nazwe  →  ticker sam sie podpowiada  →  (opcjonalnie kwota)
        │
        └─►  klik 1: Review          ← ekran nieodwracalnosci
                 │
                 └─►  klik 2: Create  ← okno portfela, JEDNA transakcja
```

**Dwa klikniecia, jeden podpis, jedna transakcja** (`launch()` robi token + cztery pule + dev-buy atomowo).

Krok Review nie jest tarciem, bo **nie powtarza formularza** — pokazuje liste rzeczy, ktore przestana byc mozliwe, i przewidziany adres. Ekran potwierdzenia, ktory tylko przepisuje to, co wyzej, jest tarciem; ten dodaje informacje, ktorej wczesniej nie bylo.

### B3. Panel na zywo obok formularza

Wszystko liczone **lokalnie** — `predictB20Address` plus wzory CPMM. Zero zapytan do sieci, wiec zero spinnerow, aktualizacja na kazde nacisniecie klawisza.

```
┌─ What you are about to create ────────────────┐
│                                               │
│  Name      Pocket Rocket                      │
│  Ticker    PCKT                               │
│  Address   0xb20000000000000000000034cafe1d   │
│            predicted here, not asked of       │
│            the network                        │
│                                               │
│  Supply    1,000,000,000  ·  capped at that   │
│  Admin     none, from the first block         │
│  Fee       1% on every buy and every sell     │
│                                               │
│  ── your first buy ────────────────────────   │
│  You pay        0.0100 ETH                    │
│  You receive  ~13,100,000 PCKT                │
│               = 1.31% of supply               │
│  Most you may buy in the first 5 minutes:     │
│               16,000,000 (2%) — same limit    │
│               as everyone else                │
│                                               │
│  ── the curve ────────────────────────────    │
│  Needs 3.00 ETH total to open a pool          │
│  ▰▱▱▱▱▱▱▱▱▱  0.010 / 3.00 ETH                 │
└───────────────────────────────────────────────┘
```

Linia "same limit as everyone else" jest tu nieprzypadkowo: to jedyne miejsce, gdzie tworca dowiaduje sie, ze nie ma przywileju — i lepiej, zeby dowiedzial sie tego przy kwocie niz z regulaminu.

### B4. Kopalnia adresow wpieta w tworzenie

**Najpierw dwa ustalenia, ktore trzeba przekazac agentowi od kontraktow — nie dotykam `contracts/`.**

**(1) Kopalnia w obecnej postaci kopie zly adres.** `B20Console` wola `predictB20Address(sender = portfel uzytkownika, …)`. Przy tworzeniu przez nasz launchpad `msg.sender` w precompile to **launchpad**, nie portfel (rozpoznanie §0, potwierdzone dwukrotnie). Adres wykopany dzis na ekranie tworzenia nigdy by nie powstal. Ekran tworzenia musi wolac `predictB20Address(CURVE_LAUNCHPAD_ADDRESS, salt)`.

**(2) Spec §3.1 wyklucza kopanie i nie musi.** Salt jest wyprowadzany wewnetrznie z `(this, creator, nonce, chainid)` — obrona D1 przed zajeciem soli. Skutek uboczny: uzytkownik ma **dokladnie jeden** osiagalny adres na launch i kopanie nie ma czego szukać.

Poprawka, ktora nie osłabia D1:

```
salt = keccak256(abi.encode(address(this), creator, creatorNonce[creator]++, block.chainid, userSalt))
                                            ^^^^^^^^ ^^^^^^^^^^^^^^^^^^^^^
                          te dwa pola nadal sa w preobrazie, wiec obcy
                          NIE MOZE zajac twojej soli — jego adres jest inny
```

D1 dotyczylo soli **w calosci pochodzacej od uzytkownika i przewidywalnej**. Domieszanie `creator` i `nonce` zamyka griefing niezaleznie od tego, co uzytkownik wpisze. Zysk: kopanie wraca, jedna linijka, zero nowej powierzchni.

**Jak to wyglada na ekranie — zasada: nigdy nie kaze czekac.**

Adres w panelu jest zywy od chwili polaczenia portfela (dla `userSalt = 0`). Pod nim jedna kontrolka:

```
Address   0xb200000000000000000000f31a09c2b7
          ┌─────────────────────────────────────────┐
          │ Make it spell   [ cafe    ]             │
          │ 4 characters — about 65,536 tries       │
          │                                         │
          │ searching · 812,000 tries · 41,000/s    │
          │ You can create now with the address     │
          │ above at any time.                      │
          └─────────────────────────────────────────┘
```

Reguly:

- Kopanie startuje **od razu po wpisaniu wzorca**, bez przycisku "Start". Przycisk Start jest tam, gdzie kopanie jest celem; tutaj jest ozdoba.
- Przycisk **Create nigdy nie jest wylaczony przez kopanie.** To jest cala roznica miedzy czescia tworzenia a gadzetem.
- Trafienie podmienia linie adresu przez `opacity` + `translateY(2px)`, 160ms, plus pigulka `spells cafe`. Zadnego modala, zadnego dzwieku.
- Liczba prob **przed** zaangazowaniem uwagi (`expectedAttempts` juz to liczy): 4 znaki natychmiast, 6 znakow ~minuta, 8 znakow godziny. Zdanie "At this length expect to leave it running" zostaje.
- Litery spoza hex nadal dostaja podpowiedz `o→0, l→1` — ta czesc konsoli jest dobra i przenosi sie bez zmian.

### B5. Panel nieodwracalnosci — dokladne zdania

Stoi na ekranie Review, **nad** przyciskiem, nie pod nim.

> ### After you sign, these stop being possible — for you, for us, and for anyone else
>
> - **You cannot mint more.** The supply is 1,000,000,000 and the cap is set to the same number in the same transaction.
> - **You cannot change the name or the ticker.** They are written once and no address can rewrite them.
> - **You cannot pause transfers, freeze a holder, or take tokens back.** Those roles are never granted, so there is nobody to ask.
> - **You cannot take the liquidity out after the curve fills.** It goes into a contract with no withdraw path. That includes us.
> - **You cannot sell on the curve.** This address is blocked from selling until the token graduates. Any other address you own is not, and we have no way to tell them apart — so do not read this as a promise to anyone buying.
> - **You cannot change the 1% fee**, on your token or on any other. It was fixed when this launchpad was deployed.
> - **You cannot delete the token, or this page.**
>
> ### What stays possible
>
> - You can buy on the curve like anyone else, including in this transaction, up to the same 2% limit as everyone else.
> - You collect 0.4% of every trade on the curve, and 40% of the pool fees after it graduates. Neither is locked, and both are yours whether the token does well or not.
>
> ### One thing we cannot do
>
> We cannot switch this off and we cannot fix a typo in your ticker. Read the two lines above the button.

I zdanie ryzyka, wymagane przez spec §10.1, **przy slowie "graduate", nie w stopce**:

> If this fills, the pool opens with about 2.9 ETH of depth against roughly 954.7M tokens. Selling 5% of the supply into it returns about 0.68 ETH and moves the price about −77%. Graduating is where the risk starts, not where it ends.

### B6. Stan, gdy launchpad nie jest wdrozony (czyli dzis)

```
┌───────────────────────────────────────────────┐
│  FORMULARZ + PANEL NA ZYWO + KOPALNIA         │
│  — wszystko w pelni dziala                    │
├───────────────────────────────────────────────┤
│  Creating is not live yet                     │
│                                               │
│  The launchpad contract is not deployed on    │
│  any network, so there is nothing for this    │
│  button to call. Everything above is real:    │
│  the address is the one you would get, and    │
│  the salt stays valid — it depends only on    │
│  your wallet, so you can find one today.      │
│                                               │
│  ┌─────────────────┐                          │
│  │  Create token   │  wylaczony, powod obok   │
│  └─────────────────┘                          │
└───────────────────────────────────────────────┘
```

Dwie rzeczy sa tu decyzja, nie domyslnoscia:

1. **Nie wylaczamy strony, tylko podpis.** Formularz, panel, kopalnia i lista nieodwracalnosci dzialaja w calosci. Czlowiek wychodzi z wiedza o warunkach i z adresem, ktory nie wygasa. Precedens jest juz w `app/b20/page.tsx:80-94` — "A dead button that looks alive is worse than a missing one".
2. **Stan wdrozenia jest odczytem, nie flaga.** `eth_getCode` na adresie launchpada dla biezacego `chainId`, wzorem `isEscrowAvailable`. Flaga w kodzie zostaje kiedys niezaktualizowana i strona zaczyna klamac cicho. (Uwaga: `eth_getCode` jest tu wiarygodne, bo `CurveLaunchpad` to zwykly kontrakt — w odroznieniu od precompile'a fabryki, gdzie pusty kod nic nie znaczy.)

---

## CZESC C — JAK TO SIE LACZY Z RESZTA PRODUKTU

### C1. Feed — token jest zalacznikiem, nigdy nadawca

Wlasciciel kazal usunac posty AI. Wniosek jest twardszy niz "bez AI": **zaden automat nie nadaje w feedzie, wlacznie z naszym wlasnym indekserem.** Zadnego "PCKT just graduated!", zadnego bota-ogloszeniowego, zadnego konta systemowego.

Zamiast tego token staje sie **zalacznikiem do posta, ktory napisal czlowiek** — jak podglad linku:

```
┌──────────────────────────────────────────┐
│  @kasia                             12m  │
│  zrobilam token dla naszej niedzielnej   │
│  grupy biegowej, zobaczcie               │
│  ┌────────────────────────────────────┐  │
│  │ PCKT  Pocket Rocket                │  │
│  │ ┌ CAPPED ┐ ┌ curve 1.84/3.00 ETH ┐ │  │
│  │ 1.84 ETH in · 22 buyers            │  │
│  │ read just now                      │  │
│  └────────────────────────────────────┘  │
│  ♥ 4   ↩ 1                               │
└──────────────────────────────────────────┘
```

Reguly karty w feedzie:

- **Zdanie jest czlowieka, liczby sa nasze.** Nigdy odwrotnie.
- Karta **nie pokazuje procentu zmiany w feedzie w ogole.** Feed jest miejscem, gdzie tresc przewija sie bez kontekstu; `+340%` bez osi czasu jest reklama.
- Odczyt na zywo przy renderze; nieudany odczyt daje `we could not read this token just now`, a nie stara liczbe udajaca swieza.

### C2. Profil `/u/[address]` — sekcja, ktorej nie ma nikt

Zdarzenia fabryki filtrowane po tworcy daja pelna liste, **razem z trupami**:

```
┌─ Created ─────────────────────────────┐
│  41 tokens.  2 have a market.         │
│                                       │
│  PCKT  Pocket Rocket   2.14 ETH in    │
│  SPHR  Sphere Coin     1.84 ETH in    │
│  MOON  Moon Thing      no market yet  │
│  …     38 more with no market         │
└───────────────────────────────────────┘
```

To jest najmocniejszy element antyseryjno-rugowy w calym projekcie i nie kosztuje nic — to ten sam indeks, co naglowek listy. Warunek: **stosuje sie tez do nas.** Nasz adres tworcy pokazuje te sama statystyke, liczona tak samo. Jesli wyglada zle, bedzie widac.

Druga sekcja, `Holds` — tylko dla tokenow, ktore maja rynek, z ta sama regula trzech pustych stanow.

### C3. Aski

Strona tokena moze **przyjac** Aska ("what should this be used for?") — ale tylko recznie zalozonego przez czlowieka. Zadnego zakladania Aska przy tworzeniu tokena. To jest v2 i mowie to wprost, zeby nie wjechalo bokiem do v1.

### C4. Powiadomienia

Tylko o rzeczach, ktore uzytkownik **zrobil albo trzyma**, i tylko opt-in. Zadnych powiadomien cenowych. Powiadomienie "PCKT +40%" jest tym samym produktem, co zielony procent na liscie, tylko dostarczonym do kieszeni.

---

## CZEGO NIE DODAJEMY I DLACZEGO

| rzecz | dlaczego nie |
|---|---|
| **`$0.00` dla tokena bez puli** | Token bez puli nie ma ceny zerowej — nie ma zadnej. Zero to pomiar, ktorego nie wykonano. Najwazniejsza pojedyncza regula tej listy. |
| **Zielen i czerwien dla zmian ceny** | Poza paleta, i gdyby byly w palecie, zrobilyby ze zwrotu najjasniejsza rzecz w wierszu. Kierunek czytamy z glifu i nachylenia (A7). |
| **Zakladka "Trending" / "Hot"** | Kazdy taki ranking jest nasza opinia podana jako dane. Segmenty z A2 sa odczytami i maja liczby. |
| **Odznaka "Verified" / "Safe" / "Audited"** | Zlozony wynik z kilku sygnalow to ocena, nie odczyt — i dokladnie ten mechanizm, ktorym launchpady sprzedaja zaufanie. Kazda odznaka u nas to **jeden** call z podana nazwa funkcji. |
| **Odznaka "admin-less" na podstawie sprawdzenia tworcy** | `hasRole` jest per-adres; brak roli u tworcy nie dowodzi braku roli u kogokolwiek. Wraca dopiero, jesli potwierdzimy, ze precompile emituje `RoleGranted`/`RoleRevoked`. |
| **Market cap / FDV dla tokena bez puli** | FDV = cena × podaz. Bez puli nie ma pierwszego czynnika, wiec liczba bylaby wymyslona, a wyglada na najpowazniejsza na ekranie. |
| **Procent zmiany jako naglowek albo domyslne sortowanie** | Raport E3: "kupilo 12 osob" i "+340%" to materialnie rozne produkty. Wybieramy pierwszy swiadomie. |
| **DexScreener/GeckoTerminal jako zrodlo naszych liczb** | Osoba trzecia, ktora moze paść i nie odroznia awarii od pustki. Zostaja jako **link** obok naszego odczytu, nie zamiast niego. Do awansu i tak nie maja czego pokazac. |
| **Automatyczny post w feedzie o nowym tokenie / awansie** | Wlasciciel usunal posty AI. Automat nadajacy w feedzie to ta sama rzecz pod inna nazwa, niezaleznie od tego, czy tresc pochodzi z modelu, czy z indeksera. |
| **Memo jako kolumna na liscie** | Niesie wolajacego, nie placacego. Zostaje w waskiej, prawdziwej formie na stronie tokena (A0/3). |
| **Liczba posiadaczy jako metryka na wierzchu** | Pyl na 1000 adresow kosztuje grosze (raport D). Stoi obok "net ETH in" i jest podpisana jako tania do sfalszowania. |
| **Obrazek i opis tokena udajace dane z lancucha** | METADATA jest martwa, wiec to sa nasze dane. Podpisane "stored by mysphere, not on the chain" i umieszczone po podpisie, nie przed. |
| **Komentarze pod kazdym tokenem w v1** | Feed juz istnieje i jest lepszym miejscem na zdanie czlowieka. Osobny watek pod 470 tokenami dziennie to powierzchnia moderacyjna bez produktu. |
| **Obietnica "your token on DexScreener instantly"** | Indeksery reaguja na powstanie **puli**, nie tokena. Przed awansem nie ma tam nic i nie wolno tego obiecywac. |

---

## DO ROZSTRZYGNIECIA, ZANIM TO POWSTANIE

1. **Czy precompile B20 emituje `RoleGranted`/`RoleRevoked`.** Decyduje, czy odznaka o rolach w ogole istnieje. Nie blokuje reszty listy.
2. **Domieszka `userSalt` do preobrazu salta w `launch()`** (B4). Bez niej kopalnia adresow nie moze byc czescia tworzenia i zostaje gadzetem. Dla agenta od `contracts/`.
3. **Czy probujemy pule poza v4/ETH** (v3, Aerodrome, para USDC). Wezsza sonda = szybciej i taniej, ale wtedy naglowek musi brzmiec "no ETH pool on Uniswap v4", a nie "no market".

**Pliki, ktorych to dotyczy:**
`C:\dev\mysphere\app\b20\page.tsx`, `C:\dev\mysphere\app\b20\B20Console.tsx` (do przeniesienia na `/b20/tools`), `C:\dev\mysphere\app\utils\b20\addressing.ts` (uzywac, poprawic tylko `sender` na ekranie tworzenia — patrz B4/1), `C:\dev\mysphere\app\asks\page.tsx:1640-1723` (wzorzec trzech pustych stanow do skopiowania), `C:\dev\mysphere\docs\B20-LAUNCHPAD-SPEC.md` §3.1 i §10.1.

---

## Raport 2

Probes complete, scratch files removed (`git status` shows only the other agent's `contracts/` work).

---

# B20: skad dane i ile to kosztuje

Wszystkie liczby zmierzone 2026-08-08 na `https://mainnet.base.org`, blok ~49 716 000.

## 0. Jedno ustalenie, ktore zmienia zalozenie zadania

**POTWIERDZONE ODCZYTEM.** Teza "wiekszosc z tych tokenow nigdy nie dostanie puli" jest **nieprawdziwa**. W pelnej dobie (43 200 blokow):

| stan | liczba | udzial |
|---|---:|---:|
| utworzonych B20 | 545 | 100% |
| dostalo pule Uniswap v4 **w tej samej transakcji** | 462 | 85% |
| bez puli | 83 | 15% |
| **cena kiedykolwiek sie ruszyla (byl swap)** | **35** | **6,4%** |

Czyli: pula jest prawie zawsze, **rynku prawie nigdy**. Uczciwy podzial to nie "ma cene / nie ma ceny", tylko **trzy** stany, i to on powinien napedzac UI (punkt 5).

Zastrzezenie: to zdjecie ostatnich ~5 dni. Kohorty starsze wygladaja inaczej (patrz tabela wieku w pkt 4) — automatyczna pula to swieze zjawisko, nie prawo natury.

---

## 1. Ksztalt zdarzenia

**POTWIERDZONE ODCZYTEM** (brute-force po topic0 + dekodowanie 545 realnych logow):

```
B20Created(address,uint8,string,string,uint8,bytes)
keccak256 = 0xfd9bf2730513a1709722ff379a0844dfd8f997d600693c2bcc659e188bbdba0d
```

| miejsce | zawartosc |
|---|---|
| `topics[1]` | **token** (address, indexed) |
| `topics[2]` | **variant** (uint8, indexed): `0`=ASSET, `1`=STABLECOIN |
| `data` slowo 0-3 | `string name`, `string symbol`, `uint8 decimals`, `bytes extra` (offsety) |

- ASSET: 9 slow danych, `extra` = `0x` (pusty), decimals=18. 493/497 probki.
- STABLECOIN: 14 slow, `extra` niepusty (parametry wariantu), decimals=6. 4/497.
- `topics[2]` zgadza sie z 11. bajtem adresu tokena — ten sam bajt wariantu, ktory liczy `predictB20Address` w `app/utils/b20/addressing.ts`. Adresowanie jest potwierdzone niezaleznie.

**Dlaczego sygnatura z base-std nie pasowala — NIEPEWNE co do przyczyny, PEWNE co do faktu.** Realne zdarzenie ma **dwa** pola indeksowane (`token` i `variant`), a ostatni `bytes` **nie jest** argumentem `params` przekazanym do `createB20` — dla assetow jest pusty, mimo ze `params` byl niepusty. Kazda rekonstrukcja, ktora zaklada `params` w danych albo tylko jedno pole indeksowane, minie sie z topic0. Wniosek operacyjny: **filtruj po topic0 z lancucha, nigdy z interfejsu.**

**Bonus POTWIERDZONY ODCZYTEM:** logi z Base RPC zawieraja pole `blockTimestamp`. Czas utworzenia jest za darmo — **zero** dodatkowych `eth_getBlockByNumber`.

### Kto stworzyl — tego w zdarzeniu NIE MA

**POTWIERDZONE ODCZYTEM.** `tx.from` jest zawodne. Rozklad `tx.to` na 60 probkach:

| `tx.to` | ile | co to znaczy |
|---|---:|---|
| `0xa52ad458ce0282a971ecc71c051a32f28946bb9f` | 51 | launcher — `tx.from` to uzytkownik, ale posrednio |
| `0x0000000071727De22E5E9d8BAf0edAc6f37da032` | 5 | **EntryPoint ERC-4337** — `tx.from` to bundler, nie czlowiek |
| `0xB20f...0000` (fabryka) | 1 | `tx.from` = deployer, wiarygodne |
| inne kontrakty | 3 | |

**Rozwiazanie POTWIERDZONE ODCZYTEM.** Dominujacy launcher emituje w tej samej transakcji:

```
Launched(address indexed token, bytes32 indexed poolId, address indexed creator, address, uint256, int24)
topic0 = 0x207384e895174175cc774fe7f7457b37c382f27ebf53d37d5257b862f80eaf9c
adres  = 0xa52ad458ce0282a971ecc71c051a32f28946bb9f
```

Token, poolId **i tworca** — wszystkie trzy w topicach. Zero dekodowania danych, jeden `getLogs`. Pokrycie: **451/544 = 82,9%** doby. Dla ~10% reszty `tx.to == fabryka`, wiec `tx.from` jest wiarygodne. Razem ~91%; pozostale ~9% ma byc opisane jako **"unknown creator"**, a nie zgadywane.

Statystyka tworcow: 203 unikalnych/dobe, srednio 2,2 tokena na tworce, **rekordzista 67 tokenow w dobe** (spam — to jest powod, dla ktorego chronologiczny feed bez filtra jest bezuzyteczny).

Inne zdarzenia w tej samej transakcji (rozpoznane przez openchain): `SupplyCapUpdated`, `ContractURIUpdated`, `PoolRegistered(bytes32,address,address,uint16)`, `Seeded(bytes32,uint256)`, `CreatorRegistered(address,address)` @ `0xabdcbe060724b9bef5a2daad017d9ea3ed72de28`.

---

## 2. Lista tokenow — limity i architektura

### Zmierzone limity publicznego RPC (POTWIERDZONE ODCZYTEM)

| limit | wartosc | kod bledu |
|---|---|---|
| zakres `eth_getLogs` | **10 000 blokow, twardo** | `-32614` |
| rozmiar odpowiedzi | ~5 MB (Swapy v4 pekaja na 10k blokow) | `-32020 backend response too large` |
| batch JSON-RPC | **max 10 wywolan na batch** | `-32014` |
| przepustowosc | 100 rownoleglych `eth_blockNumber` = 0 odrzucen; ~30 szybkich `eth_call` pod rzad wywolalo `-32016 over rate limit` | `-32016` |
| czas bloku | **2,000 s** → 43 200 blokow/dobe | — |

### Rozmiar problemu (POTWIERDZONE ODCZYTEM)

Emisja B20 ruszyla ~31 dni temu (32 dni wstecz = 0 zdarzen). Probkowanie co 2 dni po 10k blokow:

```
dni temu:   0    2    4    6    8   10   12   14   16   18   20   22   24   26   28   30
B20/dobe: 557  225  298  367  480  333  454  328  225  540  475 1188 1205  683 1123 4644
```

**Caly korpus: ~26 000 tokenow.** Backfill = 1,34 mln blokow / 10 000 = **134 zapytania** `getLogs` na strumien. Trzy strumienie (`B20Created`, `Launched`, `Initialize`) = **~400 zapytan, ~3 minuty, jednorazowo.**

### Proponowana architektura — dwa poziomy

**HOT — to, co widzi czlowiek na wejsciu.** Ostatnie 72 h (~1 600 tokenow), liczone od nowa z lancucha, **bez zadnej bazy**, przez Next.js Route Handler z `export const revalidate = 60`.

Koszt jednej regeneracji (raz na 60 s, nie na odslone):

| wywolanie | ile |
|---|---:|
| `eth_blockNumber` | 1 |
| `getLogs` B20Created (30 nowych blokow) | 1 |
| `getLogs` Launched | 1 |
| `getLogs` Initialize @ PoolManager | 1 |
| `eth_call` multicall3 → `getSlot0` dla ~1600 pul (300/wywolanie) | 6 |
| **razem** | **10 zapytan/min = 14 400/dobe** |

Mieszcza sie w publicznym RPC z ogromnym zapasem. **Klient nie dotyka RPC ani razu.**

**COLD — pelna historia i wyszukiwanie po symbolu.** ~26k tokenow x ~200 B = **5,2 MB** JSON. Do Vercel Blob (`@vercel/blob` juz jest w zaleznosciach, `app/api/upload/route.ts`), przebudowywany raz na dobe. Nigdy nie wysylany do przegladarki w calosci — sluzy tylko serwerowi do wyszukiwania i do stron `/b20/[address]`.

### Koszt w jednostkach Firestore

**Zero odczytow i zero zapisow.** To jest cala poanta tej propozycji.

Dla porownania, warianty ktore trzeba odrzucic:
- **dokument na token + odswiezanie ceny**: 500 tokenow x 144 cykli = **72 000 zapisow/dobe** — 3,6x ponad limit 20k, dzielony z feedem. Odpada.
- **zapytanie z `limit(50)` na kazde wejscie**: 50 odczytow/odslona → **1 000 odslon/dobe** wyczerpuje 50k. Odpada.
- Dodatkowo: bez `getCountFromServer` nie da sie pokazac "26 431 tokenow" bez recznego licznika, a bez `runTransaction` ten licznik bedzie sie rozjezdzal. **Nie pokazujemy licznika calkowitego** (patrz sekcja koncowa).

Firestore zostaje wylacznie dla naszej warstwy spolecznej (kto co polubil, kto obserwuje token) — tam ma sens i tam limity sa realne.

---

## 3. Metadane tokena

**POTWIERDZONE ODCZYTEM.**

**Za darmo ze zdarzenia:** `name`, `symbol`, `decimals`, `variant`, adres, czas. **Zero wywolan.**

**Z lancucha, przez multicall3** (`0xcA11bde05977b3631167028862bE2a173976CA11`, kod obecny na Base):

```
aggregate3 x120  →  24 kB, 239 ms
aggregate3 x600  → 106 kB, 423 ms
```

Praktyczna porcja: **300 odczytow na jeden `eth_call`**. Metadane dla calej doby (545 tokenow x 3 pola) = **6 wywolan**.

Co dziala, a co nie (sprawdzone selektorami na realnym tokenie):

| dziala | rewertuje |
|---|---|
| `totalSupply()`, `supplyCap()`, `multiplier()` | `currency()`, `paused()` |
| `isPaused(uint8)`, `nonces(address)`, `DOMAIN_SEPARATOR()` | `policyId(uint8)`, `owner()` |
| `hasRole(bytes32,address)`, `getRoleAdmin(bytes32)` | **`roleHolder(bytes32)`** |

**To jest problem, nie detal.** `roleHolder` rewertuje, a `hasRole` wymaga podania konta. **Nie da sie zapytac lancucha "kto ma role MINT na tym tokenie".** Mozna tylko sprawdzic konkretnego kandydata. Konsekwencja dla produktu w sekcji koncowej.

Przyklad odczytu (`BLU: The Base Whale`): `totalSupply == supplyCap == 1e27`, `multiplier == 1e18`, `isPaused(0) == false`.

---

## 4. Cena i wolumen

### Sciezka lancuchowa (POTWIERDZONE ODCZYTEM)

- **PoolManager v4:** `0x498581fF718922c3f8e6A244956aF099B2652b2b`
- **StateView:** `0xa3c0c9b65bad0b08107aa264b0f3db444b867a71` — `getSlot0(poolId)` odpowiada, batchowalne przez multicall3
- **`Initialize`** topic0 `0xdd466e674ea557f56295e2d0218a125ea4b4f0f6f3307b95f85e6110838d6438`, `currency0`/`currency1` **indeksowane** → mapowanie token→poolId, 5 `getLogs`/dobe. 1 955 Initialize/dobe na calej Base, z tego 422 z naszymi swiezymi B20.
- Para: **415/422 to natywne ETH** (`currency0 == 0x0`), 7 to WETH.

**Sztuczka, ktora daje uczciwosc za darmo:** porownaj biezacy `sqrtPriceX96` z `getSlot0` z tym z `Initialize`. Cena w v4 zmienia sie **wylacznie** przez swap. Identyczna wartosc na 160 bitach = **na tym tokenie nikt nigdy nie handlowal**. Wynik dla doby: **427 bez ruchu, 35 ruszylo.** Jeden `getLogs` + jeden multicall — i mamy twardy, wlasny podzial na "notowany" i "handlowany", bez pytania kogokolwiek o zdanie.

**Ostrzezenie NIEPEWNE:** `StateView.getLiquidity(poolId)` zwrocilo **0 dla 46 z 60** swiezych pul. To plynnosc w biezacym ticku, nie TVL — pozycje startowe sa jednostronne. **Nie uzywac tego jako sygnalu "ma rynek"** — bedzie klamac w dol.

### Skanowanie Swapow — NIE

**POTWIERDZONE ODCZYTEM:** 2 510 Swapow / 1 000 blokow = **~108 000/dobe**. Zapytanie o 10k blokow pada (`-32020`); 2 000 blokow = 4,7 MB. Doba = 22 zapytania i ~100 MB transferu. **Odpada** — wlasny wolumen 24 h nie miesci sie w tym budzecie.

### Gotowe zrodla (POTWIERDZONE ODCZYTEM — zapytane, nie zalozone)

**GeckoTerminal** — `https://api.geckoterminal.com/api/v2/networks/base/tokens/multi/{a1,...}`
- **Indeksuje B20. Tak.** Zwraca `price_usd`, `volume_usd.h24`, `fdv_usd`, `total_reserve_in_usd`, `top_pools` (poolId v4).
- **Twardy limit 30 adresow** na wywolanie (przy 50: HTTP 400 `maximum 30 addresses allowed`).
- Darmowe, bez klucza. **429 przy szybkiej serii** — trzeba odstepu; darmowy prog to ok. 30 wywolan/min. **NIEPEWNE** co do dokladnej wartosci, potwierdzone tylko wystapienie 429.
- **10% wszystkich nowych pul na Base to pule B20** (10/100 w `new_pools`).

**DexScreener** — `https://api.dexscreener.com/tokens/v1/base/{a1,...}`
- **Indeksuje B20. Tak**, oznacza pary etykieta `v4`, zwraca `priceUsd` i `volume.h24`.
- Przyjmuje >30 adresow bez bledu, ale **odpowiada tylko dla tych, ktore zna** — nie da sie odroznic "nie ma puli" od "nie zaindeksowalem". Dla nas to wada.
- `liquidity.usd` bylo `undefined` w calej probce.
- Limity: dokumentacja podaje 60 req/min tylko dla `/token-profiles` i `/metas`; dla `/tokens/v1` **nie sa udokumentowane — NIEPEWNE**.

**Pokrycie GeckoTerminal wg wieku tokena** (probki po 30):

| wiek | GT zna | ma pule | ma cene | plynnosc >$1 | wolumen 24h >0 |
|---|---:|---:|---:|---:|---:|
| 5,5 h | 30 | — | 8 | — | 7 |
| 1 dzien | 24 | 24 | 9 | 6 | **3** |
| 3 dni | 24 | 24 | 16 | 13 | **0** |
| 7 dni | 17 | 1 | 1 | 3 | 0 |
| 14 dni | 12 | 0 | 0 | 6 | 0 |

Dwa wnioski. Po pierwsze, **GT ma opoznienie indeksowania** — swiezego tokena nie zna przez pierwsze minuty/godziny. Po drugie, **handel umiera w ciagu doby**: kohorta 3-dniowa ma zerowy wolumen 24 h w calosci.

### Rekomendacja

**Cena i wolumen w USD: GeckoTerminal, ale tylko dla tokenow, ktore realnie handluja.** To ~35 tokenow na dobe, czyli **2 wywolania GT na cykl** (30 adresow na wywolanie). Kandydatow wybieramy sami z lancucha (ruszony `sqrtPriceX96`), wiec nie marnujemy limitu na 500 martwych tokenow i nie jestesmy zalezni od tego, czy GT juz cos zaindeksowal.

Dla reszty **cena idzie z lancucha** (`sqrtPriceX96` → ETH/token), a przelicznik ETH→USD bierzemy raz na cykl z jednego zapytania GT o WETH. Dzieki temu przy awarii GT lista dalej dziala, tylko bez znacznika dolara.

---

## 5. Tokeny bez ceny — a bedzie ich 93%

Trzy stany, rozroznialne **twardo i lokalnie**:

| stan | udzial | co wiemy |
|---|---:|---|
| **traded** | 6,4% | cena, zmiana, wolumen 24 h — pelne dane |
| **listed** (pula jest, `sqrtPriceX96` == startowy) | 78,3% | cena ofertowa launchera, plynnosc startowa, **zero transakcji** |
| **unlisted** (brak puli) | 15,2% | tylko metadane |

**Jak nie zrobic sciany napisow "no market":**

1. **Domyslna zakladka to nie chronologia, tylko `Trading`** — ~35 pozycji na dobe, kazda z prawdziwymi liczbami. To jest ten feed, ktory wlasciciel widzial u clankera. Chronologiczny firehose (`Just launched`) jest **druga** zakladka.
2. **W zakladce `Just launched` nie ma kolumny ceny w ogole.** Nie ma pustego pola do gapienia sie. Karta pokazuje to, co istnieje: nazwe, symbol, tworce, wiek, podaz, pigulke stanu. Brak ceny przestaje byc brakiem, bo nie ma miejsca, w ktorym mialaby stac.
3. **Stany rozroznia KSZTALT, nie kolor** — dokladnie jak karta Aska. `traded`: rzad z liczba i delta. `listed`: cienka linia "at launch price · never traded". `unlisted`: sam znacznik, bez rzedu liczbowego. Roznica jest widoczna w monochromie i przy 360 px.
4. **Nigdy `$0.00`.** Token bez puli nie ma ceny — pisze `not listed`. Token z pula bez transakcji ma cene ofertowa, ale nie ma rynku — pisze `no trades yet`. To sa dwa rozne zdania i nie wolno ich zlepiac.

### Zielen i czerwien — rozstrzygniecie: NIE WPROWADZAMY

Trzy powody, w kolejnosci wagi:

1. **Kolor, ktory wystepuje na 6% wierszy, jest szumem, a nie sygnalem.** 93,6% listy nie ma zadnej zmiany do pokolorowania. Wprowadzenie dwoch kolorow po to, zeby dotknely 35 z 545 pozycji, kupuje zerowa czytelnosc i placi cala spojnoscia palety.
2. **Nie przezylby monochromu ani daltonizmu** (~8% mezczyzn, deuteranopia). Karta Aska juz ustalila w tym produkcie precedens: stan rozroznia uklad, nie barwa.
3. **Paleta ma jedna rzecz do powiedzenia pomaranczem — kwote.** Procent zmiany kwota nie jest. Dolozenie zieleni i czerwieni obok pomaranczu daje trzy semantyki koloru w jednym wierszu.

**Zamiast tego:** znak `+`/`-`, strzalka `▲`/`▼`, cyfry tabelaryczne, waga `600` dla niezerowej zmiany i `soft-ink-faint` dla zera. Kierunek czyta sie z ksztaltu glifu w 100 ms, tak samo jak z koloru, i dziala wszedzie.

---

## 6. Odswiezanie

| warstwa | co | jak czesto | koszt |
|---|---|---|---|
| serwer, HOT board | `revalidate = 60` na Route Handlerze | najwyzej raz/min, **tylko gdy ktos patrzy** | 10 zapytan RPC + 2 GT |
| serwer, strona tokena | `revalidate = 15` | jw. | 1 multicall |
| serwer, COLD blob | pelny backfill + snapshot | raz/dobe | ~400 `getLogs` |
| klient | poll wlasnego `/api/b20/board` | 45 s, `document.hidden` → pauza | 1 zapytanie do nas, z cache brzegowego |

**Dlaczego `revalidate`, a nie cron:** `vercel.json` ma dzis **jeden** cron dzienny (`/api/curator-watch`, `0 6 * * *`) — to profil planu Hobby, gdzie cron chodzi raz na dobe. `revalidate` daje odswiezanie co minute **bez** zmiany planu i bez placenia za cykle, gdy nikt nie patrzy. Cron zostaje na nocna przebudowe blobu COLD, jesli slot sie znajdzie.

**Bez WebSocketow.** 108 000 Swapow na dobe to strumien, ktorego nie ma sensu trzymac w przegladarce, a publiczny WS Base nie daje filtrowania, ktore by go zwezilo.

**Przy zerwaniu polaczenia — AWARIA != PUSTKA:**
- ostatnia dobra migawka **zostaje na ekranie**, nigdy nie zamienia sie w zera ani w spinner;
- pojawia sie pigulka z wiekiem danych: `as of 2 min ago`; po 5 minutach zmienia sie w `stale — reconnecting`;
- backoff 1 s → 30 s, bez petli;
- jesli pada tylko GeckoTerminal, a lancuch odpowiada: **znikaja dolary, zostaja ceny w ETH i cala lista**. Degradacja jest czesciowa i widoczna, a nie calkowita i cicha.

---

## CZEGO NIE DA SIE POKAZAC UCZCIWIE PRZY TYM BUDZECIE

1. **"Kto ma role MINT/SEIZE/PAUSE na tym tokenie."** `roleHolder(bytes32)` rewertuje, `hasRole` wymaga podania konta. Lancuch nie odpowiada na pytanie "kto", tylko na "czy ten konkretny". Mozemy sprawdzic tworce i zero, i tylko tak wolno to opisac: `creator holds no roles` — **nigdy** `token is safe`. Brak dowodu na role nie jest dowodem braku rol.

2. **Wolumen 24 h liczony przez nas.** 108 000 Swapow/dobe i limit 5 MB na odpowiedz to zamyka. Wolumen w USD jest **cytatem z GeckoTerminal** i ma byc tak podpisany. Gdy GT go nie ma, pole zostaje puste — nie zerowe.

3. **Liczba posiadaczy (holders).** Wymaga przeskanowania wszystkich `Transfer` kazdego tokena. Poza budzetem calkowicie, dla wszystkich 26 000 tokenow.

4. **Prawdziwa plynnosc / TVL puli z lancucha.** `getLiquidity` zwraca plynnosc w biezacym ticku i dla 46/60 swiezych pul pokazuje 0 mimo zasianej pozycji. Liczba, ktora klamie w dol, jest gorsza niz jej brak. Plynnosc w USD tylko z GT (`total_reserve_in_usd`), z podpisem.

5. **Zmiana ceny 24 h dla tokena mlodszego niz 24 h** — a to jest 100% pierwszej zakladki. Nie ma z czym porownac. Zamiast `0.00%` piszemy `new`.

6. **Tworca dla ~9% tokenow.** Poza `Launched` i poza bezposrednim wywolaniem fabryki `tx.from` to bundler ERC-4337 albo nieznany kontrakt. `unknown creator`, nie zgadywanie.

7. **Calkowita liczba tokenow B20 na Base.** Firestore odmawia `getCountFromServer`, a licznik bez `runTransaction` sie rozjedzie. ~26 000 to **oszacowanie z probkowania co drugi dzien**, nie pomiar. Albo nie pokazujemy tej liczby, albo pokazujemy ja jako `26k+` z podpisem "estimated" — nie jako precyzyjna cyfre na liczniku.

8. **Trwalosc odsetka "85% ma pule".** Ta wartosc zalezy od jednego kontraktu (`0xa52ad458…`), ktory dzis odpowiada za 83% emisji. Kohorta sprzed 14 dni ma **0/30** pul. Jesli ten launcher przestanie dominowac, proporcje wywroca sie w ciagu doby. **Nie wolno tego wpisywac na stale w copy** ani opierac na tym obietnicy produktowej — to ma byc liczone, nie deklarowane.

**Sources:** [Base B20 spec](https://docs.base.org/base-chain/specs/upgrades/beryl/b20), [Uniswap v4 StateView](https://docs.uniswap.org/contracts/v4/guides/state-view), [StateView na BaseScan](https://basescan.org/address/0xa3c0c9b65bad0b08107aa264b0f3db444b867a71), [DexScreener API](https://docs.dexscreener.com/api/reference)

---

## Raport 3

# Rozbior rynku u konkurencji — clanker.world, pump.fun, four.meme, Zora

Zrodla: odczyt na zywo `clanker.world` + `/clankers` + `/creator/*` + `/clanker/0x1bc0…`, `four.meme/en` + `/en/ranking`, `docs.zora.co/coins/sdk/queries/explore`, `support.zora.co`, dokumentacja `frontend-api-v3` pump.fun (sama strona jest za bramka "Continue / over 18", wiec uklad rekonstruowany z API + opisow scraperow — oznaczone `[API]`).

---

## 1. CO JEST NA GORZE i w jakiej kolejnosci

### clanker.world (najblizszy wzorzec — potwierdzony odczytem)

```
┌──────────────────────────────────────────────────────────────────────┐
│ [logo] Home Tokens Create Account Settings      Analytics Farcaster X │
├──────────────────────────────────────────────────────────────────────┤
│ TICKER (przewijany, live):                                           │
│ Volume $23.0B+ │ $10.3M 24h │ $CLANKER Bought 122.8k+ 24h │ Burned 1.37% │
├───────────────────────────────────────┬──────────────────────────────┤
│ H1  "Launch your token"               │  "Trending now"      See all │
│ "Launch an ERC-20 token on Base,      │  ┌────────────────────────┐  │
│  Arbitrum, BNB Chain, and more —      │  │ [av] OpenZaps  0xZAPS  │  │
│  no code required. Instant liquidity, │  │      $0.0000   +12.4%  │  │
│  built-in fee rewards, and presales.  │  ├────────────────────────┤  │
│  Over $23.0B in volume traded."       │  │ [av] CLAWD     …       │  │
│                                       │  │ [av] EAT       …       │  │
│ [ Launch your token ] [ Explore tokens]│  │ [av] WARP      …       │  │
├───────────────────────────────────────┴──────────────────────────────┤
│ [All Chains ▾] [All tokens ▾] [Live] [Newest]                        │
│ TABELA TOKENOW ────────────────────────────────────────────────────  │
└──────────────────────────────────────────────────────────────────────┘
```

Kolejnosc: **liczby zbiorcze → obietnica + 2 przyciski → 4 tokeny "trending" z boku → filtry → tabela.** Tabela zaczyna sie ponizej zalamania — to jest ich slabosc, nie do kopiowania.

### pump.fun

```
┌──────────────────────────────────────────────────────────────────────┐
│ Home  Explore  GO  Callouts  Mayhem  Live  Competition  Terminal      │
├──────────────────────────────────────────────────────────────────────┤
│ BRAMKA (pierwsza wizyta): "Welcome to Pump.fun!"                      │
│ "Pump lets anyone create coins, giving everyone equal access to buy   │
│  and sell from the start. Prices can move quickly, so trade carefully"│
│ [ Continue ]   + zgoda na regulamin i 18+                             │
├──────────────────────────────────────────────────────────────────────┤
│ [start a new coin]   [search]                    [sort ▾] [filters ▾] │
│ ┌──────┐ ┌──────┐ ┌──────┐  siatka kart, nie tabela                   │
│ │ img  │ │ img  │ │ img  │  (3–5 kolumn zaleznie od szerokosci)       │
└──────────────────────────────────────────────────────────────────────┘
```

Zero tekstu marketingowego po przejsciu bramki — **od razu siatka**. Zadnego stat-baru. To jest przeciwienstwo clankera i jest skuteczniejsze.

### four.meme — najslabszy z czworki

```
┌──────────────────────────────────────────────────────────────────────┐
│ [logo]  Create Token  Agentic  Ranking  Advanced  Campaign  Announce  │
├──────────────────────────────────────────────────────────────────────┤
│ "The First Meme Fair Launch Platform on BSC.                          │
│  PUMP TO THE FOURMEME."      "How it works?"                          │
│ [ Create Token ]                                                      │
├──────────────────────────────────────────────────────────────────────┤
│ karuzela wyroznionych + siatka kart                                   │
└──────────────────────────────────────────────────────────────────────┘
```
Lista jest schowana za osobna zakladka `Ranking`. Blad — dokladnie ten, ktory zarzucono nam.

### Zora — feed zamiast tabeli

```
┌──────────────────────────────────────────────────────────────────────┐
│ "Post, discover, and trade what's next"                               │
│ [ New ] [ Top ] [ Trending ]   + Featured · Video · Zora Stars ·      │
│                                  Top Creators                         │
├──────────────────────────────────────────────────────────────────────┤
│ ┌────────────────┐  karta = POST (duzy obraz), nie wiersz            │
│ │   obraz/wideo  │  pod spodem: @tworca · mcap · holders             │
│ │                │  mini-wykres mcap na karcie                        │
│ └────────────────┘  znacznik "New" = utworzone <24h, zero transakcji  │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 2. KOLUMNY TABELI

**clanker.world `/clankers` — dokladnie odczytane:**

```
Token │ Creator │ By │ Created At │ 1h │ 6h │ 24h │ Volume │ MCap
```

Uwaga: sa **dwie** kolumny tworcy (`Creator` = adres/konto wdrazajace, `By` = konto spolecznosciowe), a naglowek to `Created At`, nie `CREATED`. To roznica wobec tego, co przyjelismy w zadaniu.

| Kolumna | Niesie informacje? | Uzasadnienie |
|---|---|---|
| `Token` (obraz+nazwa+ticker) | **Tak, kluczowa** | jedyny sposob rozpoznania |
| `Creator` + `By` | **Tak** | jedyny sygnal reputacji; dwie kolumny to nadmiar — polacz w jedna |
| `Created At` (`2h 17m`) | **Tak** | przy 470 nowych dziennie to podstawowy filtr swiezosci |
| `1h` | **Ozdoba** | dla tokena z <1h zycia niedefiniowane; w praktyce `0.0%` |
| `6h` | **Ozdoba** | rzadko rozni sie od 24h; nikt po tym nie sortuje |
| `24h` | Tak | jedyny okres, ktory warto trzymac |
| `Volume` | **Tak, najmocniejsza** | jedyna kolumna odrozniajaca token z pula od atrapy |
| `MCap` | Polprawda | liczona z ceny puli; przy pustej puli jest **fikcja** |

Wniosek do naszego ekranu: **trzy kolumny procentowe to balast.** Na profilu tworcy u clankera wszystkie 20 tokenow pokazuje `$0` / `$0` / `0.0%` w kazdej kolumnie — trzy kolumny zer zamiast jednego uczciwego "no market yet". To jest dokladnie ten blad, ktorego zakazuje nasza zasada `AWARIA != PUSTKA != ZERO`.

**pump.fun** — brak tabeli. Karta niesie: obraz, nazwa, ticker, `created by [av] @handle`, `market cap: $X`, `replies: N`, czas wzgledny, pasek postepu do "graduacji". `[API]` pola: `name, symbol, description, image_uri, creator, market_cap, usd_market_cap, reply_count, created_timestamp, complete, king_of_the_hill_timestamp, twitter, telegram, website, nsfw`.

**four.meme `/en/ranking`** — karty rankingowe, nie tabela: `Rank 1`, ikona, znacznik lancucha, `$BANANA Banana For Scale`, i **jedna** metryka zalezna od zakladki (`Market Cap` albo `24H Trading Volume`). Wszystko inne wyciete.

**Zora** `[SDK]` pola na karte: `marketCap, marketCapDelta24h, volume24h, totalVolume, uniqueHolders, createdAt, creatorProfile`. Zora jako jedyna eksponuje **liczbe posiadaczy** w interfejsie.

---

## 3. SORTOWANIA I ZAKLADKI (najwazniejsza decyzja ekranu)

| Serwis | Dostepne | **Domyslne** |
|---|---|---|
| clanker | `All Chains`, `All tokens`, `Live`, `Newest`; naglowki tabeli sortowalne (volume, mcap) | **`Newest`** |
| pump.fun `[API]` | `created_timestamp`, `market_cap`, `last_trade_timestamp`, `last_reply` (bump order), + zakladki `currently_live`, `featured`, `about_to_graduate`, `graduated`, `mayhem`; `order=DESC`; filtr `includeNsfw=false`; przelacznik `Show Animations` | **`created_timestamp` DESC** |
| four.meme | `Market Cap Ranking` \| `24H Trading Volume`, filtr `All Token` | **`Market Cap Ranking`** |
| Zora | `New`, `Top`, `Trending`; SDK: `TOP_GAINERS`, `TOP_VOLUME_24H`, `MOST_VALUABLE`, `NEW`, `LAST_TRADED`, `LAST_TRADED_UNIQUE`, `FEATURED`, `CREATOR_COINS`, `FEATURED_CREATORS` | **`Trending`** (nie `New`) |

Trzy z czterech zaczynaja od czasu utworzenia albo od kapitalizacji. **Obie te wartosci domyslne sa dla nas trujace:**

- `Newest` przy 470 tokenach dziennie to strumien szumu, w ktorym 99% pozycji ma pusta pule. Pierwszy ekran = same "no market yet". Uczciwe, ale bezuzyteczne.
- `MCap` premiuje token, ktory ma cene wyliczona z jednej transakcji w cienkiej puli — czyli nagradza manipulacje.

`last_trade_timestamp` (pump.fun "bump order") i Zorowe `Trending` to jedyne dwa sortowania, ktore **z definicji nie moga wyswietlic tokena bez rynku** — pozycja bez transakcji nie ma sie czym wypchnac do gory. Rekomendacja: domyslne sortowanie po ostatniej realnej transakcji (albo 24h volume), z `Newest` jako **jawna, osobna zakladka** dla lowcow swiezyzny.

---

## 4. JAK POKAZUJA TWORCE

| Serwis | Awatar | Nazwa | Powiazanie spoleczne |
|---|---|---|---|
| clanker | tak, w wierszu tabeli | `@codygame` | **najmocniej z czworki** — konto Farcaster/X wciagniete do wiersza; osobna strona `/creator/0x…` z awatarem, nazwa wyswietlana, bio, liczba obserwujacych, `20 tokens`, sekcja `Verified Tokens` i tabela wszystkich jego tokenow |
| pump.fun | maly awatar na karcie | `created by @handle` | slabe — czesto sam adres |
| four.meme | brak w rankingu | brak | **zadnego** — anonimowosc domyslna |
| Zora | duzy, karta jest postem | uchwyt Zora/Farcaster | profil = wlasna moneta; naglowek profilu ma `holders` i `holdings` |

Uwaga: strona tworcy u clankera zestawia obok siebie 20 tokenow z `$0` wszedzie. Ta strona **jest** dowodem seryjnego wypuszczania atrap — tylko clanker nie nazywa tego po imieniu. My mozemy.

---

## 5. KARTA POJEDYNCZEGO TOKENA

clanker, odczytane z `/clanker/0x1bc0…` (`$CLANKER`), naglowki sekcji doslownie:

```
┌─ tokenbot  $CLANKER   0x1bc0…1Bcb  [Champagne Clanker] ──────────────┐
│  MCap $12.3M    24h Vol $15.3K                                       │
├──────────────────────────────────┬───────────────────────────────────┤
│  WYKRES (osadzony GeckoTerminal) │  "Trade CLANKER"  (widget)        │
│  "If the chart says 'No Data     │                                   │
│   Here', it means there hasn't    │  "Token Info"                     │
│   been a swap yet"                │   platform · kontrakt · tworca    │
│                                   │   data wdrozenia · cast hash      │
│                                   │   contract admin                  │
├──────────────────────────────────┴───────────────────────────────────┤
│ "About tokenbot"  — opis                                             │
│ "Clankernomics":  Dev Buy 0 ETH · Vaulted 0% · Holders 508,382 ·     │
│                   Top 10 Holders 58.80% · fully vested               │
│ Linki: Farcaster, X                                                  │
└──────────────────────────────────────────────────────────────────────┘
```

Wykres jest **iframem zewnetrznego serwisu** — laduje sie najwolniej z calej strony i dla wiekszosci tokenow pokazuje "No Data Here". Widget handlu i "Clankernomics" renderuja sie od razu z danych lancucha. Nauka: **nie blokuj karty na wykresie.** Braku puli nie komunikuj pustym wykresem, tylko tekstem.

Brak na karcie clankera: ksiegi zlecen (to AMM, nie ma jej), listy posiadaczy (jest tylko liczba i `Top 10 Holders %`), historii transakcji.

pump.fun ma dodatkowo **czat/odpowiedzi pod tokenem** (`reply_count` jest metryka pierwszej klasy — sortowanie `last_reply`). To jedyna metryka spoleczna w calej czworce.

---

## 6. CZEGO NIE POKAZUJA — a brak jest CELOWY

To jest lista naszej przewagi. Kazda pozycja szkodzi wolumenowi obrotu, dlatego nikt tego nie robi.

1. **Ile startow poszlo do zera.** Nikt nie podaje odsetka tokenow bez zadnej puli ani odsetka, ktory umarl. My wiemy, ze przy ~470 B20 dziennie wiekszosc nigdy nie dostanie puli — mozemy podac to jako liczbe na gorze zamiast marketingowego "$23.0B volume".
2. **Ile tworca trzyma.** clanker pokazuje `Top 10 Holders 58.80%`, ale **nie wyodrebnia udzialu samego tworcy**. Nikt nie odpowiada na pytanie "ile z tego to on".
3. **Ile tworca sprzedal.** Kompletna cisza u wszystkich czterech. Sprzedaz przez wdrazajacego to najwazniejszy pojedynczy sygnal ryzyka i jest w calosci odczytywalna z lancucha.
4. **Historia poprzednich tokenow tego tworcy.** clanker pokazuje ich liste, ale nie liczy wyniku: "22 poprzednie starty, 21 bez rynku". Dane sa, podsumowania nie ma — bo podsumowanie bylaby oskarzeniem.
5. **Glebokosc puli / mozliwosc wyjscia.** Wszedzie jest `MCap`, nigdzie "ile mozna sprzedac zanim cena spadnie o polowe". `MCap` przy cienkiej puli jest liczba bez pokrycia i wszyscy o tym wiedza.
6. **Rozroznienie "brak rynku" od "rynek zerowy".** clanker w obu przypadkach pisze `$0` i `0.0%`. To jest ta sama pomylka, ktora nam wytknieto — i punkt, w ktorym nasza zasada `AWARIA != PUSTKA != ZERO` staje sie widoczna dla uzytkownika, a nie tylko zasada wewnetrzna.
7. **Kto kontroluje kontrakt po wdrozeniu.** clanker podaje `contract admin` drobnym drukiem w `Token Info`; nikt inny nie podaje wcale.
8. **Wiek konta spolecznosciowego tworcy.** Uchwyt `@handle` jest pokazany jak zaufanie, choc konto moze miec trzy dni. Clanker pokazuje `3 followers` — i nie wyciaga z tego wniosku.

---

## Uwagi do naszego projektu (implikacje, nie wrazenia)

- **Kolor.** Zaden z czworki nie rozroznia stanow inaczej niz zielen/czerwien — to znaczy, ze nasze rozstrzygniecie (rozroznienie bez polegania na kolorze, wzorem karty Aska) jest realna roznica wizualna, a nie tylko ustepstwem wobec palety. Kierunek zmiany: znak `+`/`-` + waga + ewentualnie mikro-strzalka; wielkosc `soft-accent` tylko dla kwot w `Volume`/`MCap`, procenty w `soft-ink`.
- **Trzy kolumny procentowe (1h/6h/24h) sa u nas nie do obrony** — przy 470 tokenach dziennie generuja siatke zer. Jedna kolumna `24h`, a przy braku puli caly blok metryk zastapiony jedna etykieta `no market yet`.
- **Domyslne sortowanie: ostatnia transakcja / 24h volume, nie `Newest`.** `Newest` jako zakladka.
- **`/b20` (obecna konsola: kopalnia adresow + budowniczy memo)** odpowiada temu, czym u clankera jest `Create` — pozycja nr 3 w nawigacji, nigdy pierwszy ekran.
- Wykres na karcie tokena musi byc opcjonalny i nieblokujacy — clanker pokazuje, jak to wyglada, gdy jest odwrotnie.

Pliki w repo, ktorych dotyczy wniosek: `C:\dev\mysphere\app\b20\page.tsx`, `C:\dev\mysphere\app\b20\B20Console.tsx`, `C:\dev\mysphere\app\utils\b20\addressing.ts`.

Sources: [clanker.world](https://www.clanker.world/) · [clanker.world/clankers](https://www.clanker.world/clankers) · [clanker creator page](https://clanker.world/creator/0x4a70eac37f9f6ca03cc4410032c0b110167ef4b4) · [four.meme](https://four.meme/en) · [Zora Explore Queries](https://docs.zora.co/coins/sdk/queries/explore) · [Zora support](https://support.zora.co/en/articles/4641857) · [pumpfun-apis](https://github.com/BankkRoll/pumpfun-apis) · [Pump.fun mechanism](https://www.binance.com/en/square/post/15600492237666)
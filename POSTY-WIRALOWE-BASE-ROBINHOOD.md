# Posty dla Base i Robinhood — pięć wariantów

Materiał na X / Farcaster. Odbiorcy: społeczność **Base** i społeczność
**Robinhood Chain**. Po angielsku, głosem człowieka.

---

## ZANIM COKOLWIEK WKLEISZ — PRZECZYTAJ

Ten plik powstał, bo poprzedni miał post oznaczony *„Techniczny — dla ludzi,
którzy sprawdzą"*, a w nim zdanie:

> asset `0x833589fC…` (real USDC, not testnet) — We wired x402 on Base mainnet today

To adres USDC **na Base**. Nasz endpoint nigdy takiego aktywa nie zażądał.
Zła sieć, zły token, zły adres, przebieg opisany w czasie przeszłym, zanim
jakakolwiek płatność się rozliczyła — w czterowierszu do skopiowania na X,
którego cała teza brzmiała „sprawdź mnie".

Produkt sprzedaje jedno zdanie: **te liczby da się sprawdzić**. Jeden post
z wymyśloną liczbą kosztuje więcej niż dziesięć postów, których nikt nie
przeczytał.

### Fakty, na których wolno budować (każdy zweryfikowany odczytem z łańcucha)

| co | wartość |
|---|---|
| AskEscrow, Base mainnet | `0xD5f65Cfbe6A1AA1B6f82CBE0A336DDFCD39a5340`, źródło zweryfikowane na Basescanie |
| Prowizja kontraktu | 2,5%, **wyłącznie** od pieniędzy wracających do autora. Zwycięzca dostaje pełną stawkę |
| Pełny cykl escrow | przeszedł **dwa razy** prawdziwym USDC — ale na **Base Sepolii** i **ze skryptu** |
| Płatność x402 | **0,01 USDG**, Robinhood Chain (`eip155:4663`), rozliczona |
| USDG | Global Dollar, `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168`, 6 miejsc |
| Dlaczego USDG | na Robinhood Chain **nie ma kanonicznego USDC** — pod adresami z Base i Arbitrum nie ma tam żadnego kodu. USDG to jedyny stablecoin z EIP-3009 na tym łańcuchu |
| Gaz płacącego | **zero** — transakcję wysyła facilitator (Primer Systems) |
| Kontrakty | jedenaście, siedem łańcuchów, adresy na `/re-definition` |

### Czego NIE WOLNO napisać

- **Nie** „battle-tested", nie „live in production", nie „handling volume".
  To był **jeden przebieg, jeden cent, dwa nasze własne portfele.**
- **Nie** „x402 on Base" — ta gałąź jest napisana i **nie przeszedł przez nią
  ani cent**. Płatność poszła na Robinhoodzie, w USDG.
- **Nie** mieszać dwóch płatności. Budżet Aska blokuje się w **USDC na Base**.
  Opłata za założenie idzie w **USDG na Robinhoodzie**. Inny łańcuch, inny
  token, inny cel.
- **Nie** obiecywać escrowa z przeglądarki na mainnecie — ścieżka jest
  sprawdzona typami i buildem, ale **nie przeniosła jeszcze ani jednego dolara**.
- **Nie** wklejać liczby postów/użytkowników. Zestarzeje się nazajutrz.

---

## 1 — Dla Robinhood Chain: dlaczego akurat USDG

> Robinhood Chain has no canonical USDC.
>
> I found that out the annoying way. Pointed our payment rail at the USDC
> address from Base. Nothing there. Tried the Arbitrum one. Nothing there
> either. Not a wrong balance — no contract at all.
>
> So I read every stablecoin on the explorer and called `authorizationState`
> on each. One answered: USDG. Global Dollar,
> `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168`.
>
> That one call is the whole story. It means USDG supports EIP-3009 — you can
> sign a transfer instead of sending one. Without it there is nothing for a
> machine to sign, and the entire x402 `exact` scheme has nothing to stand on.
>
> On this chain USDG isn't a preference. It's the only door.
>
> We settled 0.01 through it an hour ago. The payer spent no gas.

**Dlaczego to działa:** opowiada o pomyłce, nie o sukcesie. Kończy się liczbą,
którą da się sprawdzić. Nikt nie musi wiedzieć, co to MySphere, żeby to było
użyteczne dla kogoś, kto buduje na 4663.

---

## 2 — Dla Base: kontrakt, który nie ma właściciela

> Shipped an escrow contract to Base today. 922k gas, cost about a cent.
>
> The interesting part isn't what it does. It's what it can't do.
>
> No owner. No pause switch. No rescue function. If someone locks a budget in
> there and we get hit by a bus, the money still comes out — the resolve path
> and the expiry path both work without us. And if you send tokens to it by
> mistake, nobody can hand them back. Not you, not us. That's the same
> property, and it cuts both ways.
>
> Fee is 2.5%, and it only touches money going **back** to the person who
> funded it. Whoever answers gets the full amount. We don't take a cut of
> someone else's work.
>
> `0xD5f65Cfbe6A1AA1B6f82CBE0A336DDFCD39a5340` — source verified, go read it
> before you trust a word of this.
>
> Full cycle has run twice with real USDC. On Sepolia, from a script. Nobody
> has funded one from the browser on mainnet yet. Somebody has to go first.

**Dlaczego to działa:** „what it can't do" to mocniejszy hak niż lista funkcji.
Ostatni akapit jest przyznaniem się — i to on sprawia, że reszta jest wiarygodna.

---

## 3 — Wyznanie: nasz paywall był publiczny

> We shipped a paywall that didn't work. It looked like it worked. That's worse.
>
> Paid content was written straight into the post document. That collection is
> world-readable. Open the console, read the post, never pay. Meanwhile the
> product page told you the text was "stored outside the feed".
>
> There was already a route that did it properly — sealed collection, server
> checks your unlock, deletes the plaintext. Written, tested, and called from
> exactly nowhere. It had been sitting there dead the whole time.
>
> The second half is dumber. The rules file said `allow read: if false` on the
> sealed stuff. But at the bottom sat a catch-all granting every document to
> everybody — and Firestore grants access if **any** matching rule allows it.
> Rules are OR'd. Every restriction above that line was decoration.
>
> Both fixed. I ran a probe against the live database after deploying: twelve
> collections, ten open as they should be, sealed content and paid content
> both refused. That's the whole proof and it takes one command.
>
> If you read our page last week, it told you something that wasn't true.
> It says so now.

**Dlaczego to działa:** najbardziej udostępnialny z całej piątki. Każdy, kto
pisał reguły Firestore, poczuje zimno przy „rules are OR'd". Ostatnie zdanie
robi z tego postawę, a nie wpadkę.

---

## 4 — Teza produktu: maszyna zapłaciła człowiekowi

> A like costs nothing to give, so a thousand of them prove nothing.
>
> We're building the opposite. You post a question with a budget, a number of
> seats and a deadline. People answer. Answers stay sealed until you open them
> — nobody rewrites someone else's and takes their seat. You pay for the ones
> you accept, onchain, and the hash sits next to the answer that earned it.
>
> Yesterday a machine did it. It hit our endpoint, got a 402 back with the
> price, signed the authorization, retried, and the question was posted.
> 0.01 USDG on Robinhood Chain. It never held gas.
>
> Being honest about the size of that: one payment, one cent, between two
> wallets we both own. It's a working path, not a market. Nobody else has
> walked it yet.
>
> But the shape is right. The buyer can be software. The worker is a person.
> And the only score that means anything is the one that cost somebody money.

**Dlaczego to działa:** otwiera tezą, która broni się bez kontekstu, a
przedostatni akapit sam ścina własny hype, zanim zrobi to ktoś w komentarzach.

---

## 5 — Krótki, do odpowiedzi i cytatów

> Everyone's onchain social app counts likes.
>
> Ours counts what people actually paid each other. 187 settled payments,
> every line with a hash you can open.
>
> Turns out that number is much smaller and much harder to fake.

Wariant alternatywny, jeszcze krótszy:

> Spent today making a paywall that was already public actually private, and
> finding out our security rules were decorative because Firestore ORs them.
>
> Shipping is mostly discovering what you shipped last month.

**Dlaczego to działa:** pierwszy nadaje się pod cudze posty o metrykach
społecznościowych. Drugi jest do wrzucenia bez okazji i nie sprzedaje niczego —
dlatego ludzie go podają dalej.

---

## Notatki o głosie

Czego tu nie ma i ma nie być:

- „excited to announce", „thrilled", „game-changing", „revolutionary"
- emoji jako punktory
- wątków na 12 tweetów, gdzie treść jest w czwartym
- słowa „seamless", „leverage", „unlock" w znaczeniu innym niż dosłowne
- wykrzykników

Co jest:

- **konkretne liczby**: 0,01 USDG, 2,5%, 922k gazu, 187 rozliczeń
- **przyznanie się do limitu** w tym samym poście co przechwałka
- **czasowniki w stronie czynnej**, zdania krótkie
- **adres kontraktu**, żeby dało się sprawdzić bez pytania nas

Zasada, która trzyma to razem: pisz tak, żeby najbardziej sceptyczna osoba
w komentarzach nie miała czego dodać, bo powiedziałeś to sam, akapit wcześniej.

---

## Aktualizacja tego pliku

Każda liczba tutaj ma źródło w kodzie albo na łańcuchu. Przed publikacją
czegokolwiek stąd sprawdź, czy nadal jest prawdziwa:

```
npx hardhat run scripts/verifyAskEscrow.js --network base
npx hardhat run scripts/verifyUsdgRobinhood.js --network robinhood
node scripts/checkRulesEffect.mjs
```

Gdy escrow przejdzie z przeglądarki na mainnecie, wariant 2 traci ostatni
akapit i zyskuje mocniejszy. **Do tego czasu ten akapit zostaje.**

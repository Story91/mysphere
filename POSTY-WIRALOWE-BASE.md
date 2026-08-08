# Posty dla Base — pięć wariantów

Materiał na X / Farcaster, publiczność **Base**. Po angielsku, głosem
człowieka. Tech i features.

Osobny plik od `POSTY-WIRALOWE-BASE-ROBINHOOD.md` — tamten prowadzi wątkiem
o płatnościach maszynowych w USDG. Ten jest wyłącznie o Base i o tym, co na
niej postawiliśmy.

---

## 1 — Kontrakt, którego nie możemy dotknąć

> Deployed an escrow to Base. `0xD5f65Cfbe6A1AA1B6f82CBE0A336DDFCD39a5340`
>
> The point isn't what it does. It's what we gave up.
>
> No owner. No pause. No upgrade proxy. No rescue function. The fee is 2.5%
> and the contract has `MAX_FEE_BPS = 500` compiled into it — we could not
> raise it past 5% even if we wanted to, and we can't want to, because there
> is no admin key to want with.
>
> That fee only touches money going **back** to whoever funded the ask.
> Whoever answers takes the full seat price. We don't skim work.
>
> 922,219 gas to deploy. About a cent on Base. Source verified — go read it
> before you trust any of this.
>
> Everyone says immutable. Ctrl+F the file for `onlyOwner` and see.

**Dlaczego to działa:** publiczność Base widziała już sto „immutable" kontraktów
z kluczem admina. Ostatnia linijka to wyzwanie, nie deklaracja — i da się
je sprawdzić w dziesięć sekund.

---

## 2 — Basenames bez pośrednika

> If you own a `.base.eth`, you show up as a person in our app. Not
> `0x1234…cdef`. Your name, and your avatar if you set one.
>
> We resolve it straight off the L2Resolver on Base —
> `0xC6d566A56A1aFf6508b41f6c90ff131615583BCD` — one contract call, no
> indexer in the middle, no SDK that might get sunset next quarter.
>
> The nasty part took a day to find. The default resolution path assumes
> mainnet, and on mainnet it skips the Base resolver entirely and asks ENS.
> Every single `.base.eth` came back `null`. Not an error. Just quietly
> nobody.
>
> Pass the chain explicitly. That's it. That's the fix.
>
> If your app shows Basename holders as hex, this is probably why.

**Dlaczego to działa:** oddaje realną wiedzę, którą ktoś inny wykorzysta
u siebie tego samego dnia. To najlepszy rodzaj posta technicznego — użyteczny
dla kogoś, kto nigdy nie zajrzy do naszego produktu.

---

## 3 — Feed, który liczy pieniądze, nie lajki

> Every social app on Base counts likes. A like costs nothing to give, so a
> thousand of them prove nothing.
>
> We built the other feed. A public timeline of payments that actually
> settled between two people — 187 of them, every line carrying a hash you
> can open on Basescan and check against ours.
>
> Now the number nobody posts next to that one: 184,064 accounts. One in a
> thousand has ever sent a cent. And all 187 are tips — a like with a price on
> it — not payment for work somebody asked for.
>
> I'll still take it over a like count, because gaming this feed means paying
> strangers real money, at which point they got paid and the number stayed
> honest. It just isn't a market yet. You'd have found that out in one query,
> so you may as well hear it from me.

**Dlaczego to działa:** publiczność Base i tak policzy ten ułamek, więc podanie
go samemu kosztuje nic, a kupuje wiarygodność wszystkich pozostałych liczb
w poście. Argument „nie da się tego nabić, bo nabicie to zapłata" zostaje
nienaruszony — działa tak samo przy 187 jak przy 187 000.

**Czego ten wariant NIE MA PRAWA robić:** podawać 187 jako dowodu, że rynek
działa. To napiwki, czyli lajk z ceną. Zapłat za zamówioną pracę jest **zero** —
escrow, przez który by szły, nie ma ani jednego zdarzenia. Liczba wolno jako
fakt, nigdy jako trakcja.

---

## 4 — Logowanie bez rozszerzenia

> Sign in with Base Account. Passkey, your face or your fingerprint, no
> extension, no seed phrase, no "install this first".
>
> Behind it a real SIWE session — server-issued nonce, signature verified
> server-side, httpOnly cookie. Not an address in localStorage pretending to
> be identity. The wallet says who you are; the session proves the server
> agreed.
>
> That matters the moment money shows up. Paid content checks the session
> before it hands anything over. So does accepting an answer and paying for
> it. A connected wallet is not a login, and treating it like one is how
> people end up reading things they didn't buy.
>
> Seven other connectors still work if you'd rather bring your own.

**Dlaczego to działa:** „a connected wallet is not a login" to zdanie, które
połowa aplikacji na Base robi źle. Post uczy czegoś, zamiast chwalić się.

---

## 5 — Krótkie, do odpowiedzi i cytatów

> A like is worth $0.00. A payment is not.
>
> We're building the feed where the only score that counts is the one that
> cost somebody money. On Base, in USDC, every line with a hash.

Wariant techniczny:

> Shipped an immutable escrow to Base for about a cent of gas.
>
> No owner, no pause, no upgrade path. If we vanish tomorrow the money still
> comes out — resolve and expiry both work without us. Expiry only has a unit
> test behind it, because you can't fast-forward 48 hours on a live chain.
>
> Deploying something you can't fix later is a design decision, not an
> oversight.

Wariant dla budujących:

> Debugging note for anyone on Base: if your app resolves `.base.eth` names
> to `null`, you're probably resolving against mainnet.
>
> The default path skips the L2Resolver and asks ENS. Pass the chain.
>
> Cost us a day. Costs you a line.

---

## Notatki o głosie

Czego tu nie ma:

- „excited to announce", „thrilled", „proud to share"
- emoji jako punktory
- „seamless", „leverage", „unlock" poza znaczeniem dosłownym
- wykrzykników i wątków, w których treść zaczyna się w czwartym tweecie

Co jest:

- **mechanizm zamiast marketingu** — jak działa, nie jakie wspaniałe
- **wiedza do zabrania** — wariant 2 i 5c są użyteczne dla kogoś, kto nigdy
  nie otworzy naszej aplikacji, i dlatego mają największą szansę na podanie dalej
- **adres kontraktu w poście**, żeby dało się sprawdzić bez pytania nas
- jedno zdanie w każdym wariancie, które da się zacytować osobno

---

## Fakty źródłowe

Publiczność Base otwiera adresy. Każda liczba ma pokrycie na łańcuchu.

| co | wartość |
|---|---|
| AskEscrow | `0xD5f65Cfbe6A1AA1B6f82CBE0A336DDFCD39a5340`, źródło zweryfikowane |
| Gaz wdrożenia | 922 219, koszt 0,0000102 ETH |
| Prowizja | 2,5%, twardy sufit `MAX_FEE_BPS = 500` w kodzie |
| Okno na rozstrzygnięcie | 48 h po terminie (`RESOLVE_GRACE`) |
| L2Resolver Basenames | `0xC6d566A56A1aFf6508b41f6c90ff131615583BCD` |
| USDC na Base | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| Posty na Base | `0x6e1811A5401dfC30E8F3E2DD9dE0Bbe156F97aC7` |
| Płatne przypięcia | `0x163bd9Ec5267491963163dE70D0B64f9400a20AD` |
| Rozliczone płatności | 187, wszystkie z hashem — **to napiwki**, nie zapłata za zamówioną pracę |
| Konta w bazie | 184 064, czyli napiwek wysłało 0,1% z nich |
| Ruch przez escrow | **zero** — `eth_getLogs` od bloku 49635587 pusty, `balanceOf(USDC)` = 0 |

Czego w tych postach nie ma i dlaczego — ktoś z tej publiczności sprawdzi to
w pięć minut:

- **x402 na Base w USDC** — gałąź jest napisana i nie przeszedł przez nią ani
  cent. Nasza jedyna rozliczona płatność maszynowa poszła na Robinhood Chain
  w USDG. Wątek x402 należy do drugiego pliku.
- **liczby postów** — zestarzeją się nazajutrz. Liczba kont zostaje, ale
  wyłącznie **jako mianownik** przy 187 napiwkach: sama, bez ułamka, jest tym
  samym chwaleniem się, którego ten plik zabrania.
- **187 jako dowód trakcji.** Wariant 3 podaje tę liczbę razem z mianownikiem
  i z tym, czym ona jest — napiwkami. Napiwek to lajk z ceną: więcej niż lajk
  i mniej niż zamówiona i opłacona praca. Takich transakcji jest zero.
- **„ludzie już z tego korzystają"** przy escrow. Kontrakt działa i jego pełny
  cykl przeszedł prawdziwym USDC, ale ze skryptu na Sepolii. **Na mainnecie nie
  ma na nim ani jednego zdarzenia.** Dlatego wariant 1 mówi o **kontrakcie
  i o tym, czego mu odebraliśmy**, a nie o ruchu — i to jest jedyny bezpieczny
  sposób pisania o escrow, dopóki ktoś przez niego nie przejdzie.

Weryfikacja przed publikacją:

```
npx hardhat run scripts/verifyAskEscrow.js --network base
npx hardhat run scripts/verifyOnchainInventory.js --network base
```

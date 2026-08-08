# Posty dla Base i Robinhood — pięć wariantów

Materiał na X / Farcaster. Odbiorcy: **Base** i **Robinhood Chain**.
Po angielsku, głosem człowieka. Tech i features, nie changelog.

---

## 1 — Płatności bez gazu dla maszyn

> An AI agent just paid a human on Robinhood Chain. It didn't hold gas. It
> didn't hold ETH. It held one signature.
>
> How it works: agent hits our endpoint, gets `402 Payment Required` back with
> the price and the token. Signs an EIP-3009 authorization — that's a signed
> promise to move stablecoins, not a transaction. Retries with the signature
> in a header. Someone else broadcasts it and eats the gas.
>
> The agent's wallet touches nothing. No native balance, no nonce management,
> no bridge, no faucet. It has stablecoins and a private key, and that's the
> entire requirement.
>
> Settled in USDG — `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168`. Robinhood
> Chain has no canonical USDC, and USDG is the only stablecoin there that
> implements EIP-3009. Without that one interface none of this exists.
>
> This is what x402 is actually for. Not humans clicking approve. Software
> buying things from people, one cent at a time, with no wallet setup.

**Dlaczego to działa:** „didn't hold gas" to hak techniczny, który zatrzyma
każdego, kto kiedykolwiek walczył z fundowaniem portfela agenta. Reszta
tłumaczy mechanizm, a nie produkt.

---

## 2 — Escrow bez właściciela

> New escrow contract on Base: `0xD5f65Cfbe6A1AA1B6f82CBE0A336DDFCD39a5340`
>
> You post a question with a budget, a number of seats and a deadline. The
> budget leaves your wallet **before the question exists**. Answer it and the
> money is already there — you're not trusting a stranger to pay up after
> reading your work.
>
> No owner. No pause. No upgrade path. No admin key that can reach in.
> Resolve early and you must fill every seat, or the contract refuses — that
> closes the obvious game of reading answers as they land, taking one, and
> pulling the rest of the budget back.
>
> Fee is 2.5% and it only touches money going **back** to the funder. Whoever
> answers gets the full seat price, every time. We never take a cut of
> someone else's work.
>
> Source verified. 922k gas to deploy, about a cent. Go read it before you
> trust a word of this.

**Dlaczego to działa:** „the budget leaves your wallet before the question
exists" to zdanie, które sprzedaje mechanizm w dziewięciu słowach. Sekcja
o braku klucza admina trafia w dokładnie ten lęk, który ma publiczność Base.

---

## 3 — Zapieczętowane odpowiedzi

> Every bounty platform has the same hole: the first good answer is public,
> and the next five people rewrite it slightly and take a seat.
>
> So we sealed them. Write an answer to an Ask and nobody sees it — not other
> answerers, not the person who asked. The card shows a count and nothing
> else. `7 answers sealed until resolve`.
>
> They open all at once when the author resolves. Everyone wrote blind.
> Nobody built on anybody. The person who actually thought about it isn't
> competing with five paraphrases of their own work.
>
> Enforced server-side, in a collection the browser is refused outright — not
> hidden in a response someone can read in devtools. There's a probe in the
> repo that proves it: it asks the live database for the sealed collection
> and gets `permission-denied` back.
>
> Turns out "first mover advantage" is a bug when the thing you're moving on
> is someone else's paragraph.

**Dlaczego to działa:** opisuje problem, który każdy zna z Bounties, Gitcoina
i Stack Overflow, i pokazuje mechanizm, którego tam nie ma. Ostatnie zdanie
jest cytowalne samo.

---

## 4 — Jeden feed, siedem łańcuchów

> One feed. Seven chains. Every post settles onchain on whichever one you
> picked.
>
> Base, Robinhood Chain, Camp, Linea, Celo, Ethereum, World Chain — each with
> its own contract, each address listed on our site so you can open it and
> count the posts yourself. Tip someone in USDC on Base, WLD on World Chain
> or LINEA on Linea. Same feed, same profile, same name.
>
> `.base.eth` resolves through the L2Resolver, so people show up as people
> instead of `0x1234…cdef`.
>
> And `/money` adds it all up in one place: what you're owed and haven't
> collected, what you locked in your open Asks, what you earned and what you
> spent — every line with a hash that opens the transaction.
>
> Your wallet shows balances. This shows what actually happened.

**Dlaczego to działa:** multichain sam w sobie jest nudny — ratuje go ostatnie
zdanie, które nazywa różnicę między saldem a historią.

---

## 5 — Krótkie, do odpowiedzi i cytatów

> Every onchain social app counts likes.
>
> Ours counts what people paid each other. 187 settled payments, every line
> with a hash you can open. Out of 184,064 accounts, so: one in a thousand.
>
> That number is much smaller and much harder to fake. Both halves of that
> sentence are the point.

Wariant techniczny:

> `402 Payment Required` is the only HTTP status code that was reserved for
> forty years and never implemented.
>
> We're using it. An agent asks, gets a price back, signs, and gets the
> resource. No API key, no account, no invoice.
>
> The web finally has a payment layer and it was in the spec the whole time.

Wariant produktowy:

> A like costs nothing to give, so a thousand of them prove nothing.
>
> The only score here is one that cost somebody money.

**Dlaczego to działa:** pierwszy pod cudze posty o metrykach. Drugi trafia
w każdego, kto zna historię HTTP — i jest prawdziwy. Trzeci to teza produktu
w dwóch zdaniach.

---

## Notatki o głosie

Czego tu nie ma i ma nie być:

- „excited to announce", „thrilled", „game-changing", „revolutionary"
- emoji jako punktory
- wątków na 12 tweetów, gdzie treść jest w czwartym
- „seamless", „leverage", „unlock" w znaczeniu innym niż dosłowne
- wykrzykników

Co jest:

- **mechanizm, nie marketing** — jak to działa, nie jak jest wspaniałe
- **konkretne liczby i adresy**, żeby dało się sprawdzić bez pytania nas
- **jedno zdanie, które da się zacytować** w każdym wariancie
- zdania krótkie, strona czynna

---

## Fakty źródłowe

Publiczność Base i Robinhooda otwiera adresy. Każda liczba niżej ma pokrycie
w kodzie albo na łańcuchu — używaj tych, nie zaokrąglaj.

| co | wartość |
|---|---|
| AskEscrow, Base | `0xD5f65Cfbe6A1AA1B6f82CBE0A336DDFCD39a5340`, źródło zweryfikowane, 922 219 gazu |
| Prowizja | 2,5%, wyłącznie od pieniędzy wracających do autora |
| USDG, Robinhood Chain | `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168`, 6 miejsc, EIP-3009 |
| Płatność x402 | 0,01 USDG, `eip155:4663`, gaz po stronie facilitatora |
| Łańcuchy | Base, Robinhood, Camp, Linea, Celo, Ethereum, World Chain |
| Rozliczone płatności | 187, wszystkie z hashem, widoczne na `/leaderboard` — **napiwki**, nie zapłata za zamówioną pracę |
| Konta w bazie | 184 064; napiwek wysłało 0,1% z nich |
| Ruch przez escrow | **zero** zdarzeń od bloku wdrożenia, `balanceOf(USDC)` = 0 |

Dwie rzeczy, których w tych postach celowo nie ma, bo publiczność je sprawdzi
i zapyta:

- **x402 na Base w USDC** — gałąź jest napisana, nie przeszedł przez nią ani
  cent. Płatność poszła na Robinhoodzie.
- **escrow z przeglądarki na mainnecie** — kontrakt działa i cykl przeszedł
  prawdziwym USDC, ale ze skryptu i na Sepolii. Na mainnecie **nie ma na nim
  ani jednego zdarzenia**. Dlatego wariant 2 mówi o **kontrakcie**, a nie
  o tym, ilu ludzi przez niego przeszło. Odpowiedź na to pytanie brzmi „zero"
  i tak trzeba jej udzielić, jeśli ktoś zapyta.
- **187 jako dowód, że rynek ruszył.** Nie ruszył. To napiwki — lajk z ceną —
  i 0,1% kont. Wariant 5 podaje liczbę z mianownikiem właśnie po to, żeby nie
  dało się jej przeczytać jako trakcji.

Weryfikacja przed publikacją:

```
npx hardhat run scripts/verifyAskEscrow.js --network base
npx hardhat run scripts/verifyUsdgRobinhood.js --network robinhood
```

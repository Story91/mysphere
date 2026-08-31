# SPHERE - tresc na X (Twitter)

Tresc viralowa, ale uczciwa - kazda liczba i kazde twierdzenie zakotwiczone
w docs/SPHERE-TOKENOMIKA.md (sekcje 4, 5, 6.1) i doktrynie "gwarancje
kontraktu vs polityka zespolu". Limity znakow zweryfikowane (kazdy tweet
<280). Przed publikacja podmienic placeholder linku dashboardu, jesli
dostepny publicznie.

Twarde reguly, ktorych ta tresc pilnuje:

- auto-burn (buybackBps=5000) dotyczy handlu SAMYM SPHERE - NIE piszemy
  "every trade of every token buys SPHERE";
- przychod z innych tokenow -> buyback przez polityke Safe: zawsze
  opisany jako "team-run, on-chain", nigdy jako gwarancja kontraktu;
- split skupu 20% burn / 80% pula tworcow JEST w kontrakcie - mozna
  pisac wprost;
- anty-wash (cap 30% realnie wniesionych oplat, wlasne transakcje = zero)
  JEST regula sezonu - sprzedajemy mocno;
- streaming co sekunde JEST w kontrakcie dystrybutora;
- zero slow: dividend, APY, passive income, guaranteed returns;
- shadow season biegnie TERAZ - zadnych dat wyplat.

---

## (a) Glowny thread EN (7 tweetow)

**1/** (269 znakow)

> 1/ Most launchpad tokens promise buybacks. $SPHERE ships them as code
> with no owner to turn them off. Zero-admin contracts, fixed 1B supply,
> zero mint, LP locked forever. Here's how the tokenomics actually work -
> including what's contract-enforced vs what's just policy

**2/** (264 znaki)

> 2/ Contract-enforced auto-burn: after graduation, 50% of the
> creator-side ETH fee on SPHERE's own trading buys SPHERE in its pool
> and sends it to 0xdEaD. buybackBps=5000, frozen at launch, execution
> permissionless. Nobody can pause it, redirect it, or turn it off.

**3/** (277 znakow)

> 3/ The rest of the pad feeds SPHERE too - protocol fees from other
> tokens fund buybacks via the treasury Safe. Honest label: team-run,
> on-chain, every tranche public. What IS hard-coded: bought SPHERE
> splits 20% burn / 80% creator reward pool. That split lives in the
> contract.

**4/** (277 znakow)

> 4/ Wash trading = guaranteed loss by design. Own trades count for
> zero. Weekly creator reward is capped at 30% of the fees your tokens
> actually brought the protocol from real traders. Washing burns your
> ETH on fees and can't raise that cap. Formula is public - run the
> numbers.

**5/** (275 znakow)

> 5/ Rewards stream every second, Streme-style - in the distributor
> contract, not a UI trick. Each epoch's rewards unlock linearly over
> the next one; claim whenever you want. Merkle root, formula and
> indexer are all public. The dashboard has a 'Verify the math' button.
> Use it.

**6/** (273 znaki)

> 6/ Receipts: full dress rehearsal on Base Sepolia. Launch, atomic
> dev-buy, graduation to a live Uniswap v4 pool, and the first real
> auto-burn: 12,131 SPHERE -> 0xdEaD. Token
> 0xb2...Ba5ED02Ebf7B04aDBc (yes, 'ba5ed'). 62 tests green + fork +
> testnet. Every tx hash published.

**7/** (270 znakow)

> 7/ Shadow season is running right now on mainnet data. On day one it
> excluded 0.101 ETH of a creator's self-trading - the anti-wash rule
> already works in production. Payouts start after calibration, no date
> promises. Watch the numbers. Verify the math. Then come launch.

---

## (b) Wersja single-tweet EN (277 znakow)

> $SPHERE: zero-admin contracts (no owner, no pause). Auto-burn on
> SPHERE's own trading - enforced by code. Buybacks split 20% burn /
> 80% creator rewards - in the contract. Wash trading = guaranteed
> loss. Rewards stream every second. Shadow season live. Verify the
> math on-chain.

---

## (c) Krotki post PL

> $SPHERE bez sciemy. Kontrakty zero-admin: bez ownera, bez pauzy,
> nikt ich nie zatrzyma. Auto-burn z handlu samym SPHERE zapisany
> w kodzie. Skup dzielony w kontrakcie: 20% burn / 80% nagrody dla
> tworcow.
>
> Wash trading? Nagroda tworcy to max 30% oplat, ktore jego tokeny
> REALNIE przyniosly protokolowi - wlasne transakcje licza sie za zero.
> Pranie wolumenu to czysta strata z definicji. Nagrody plyna co
> sekunde, prosto z kontraktu dystrybutora.
>
> Pelna proba na Sepolii za nami: launch, graduacja do Uniswap v4
> i pierwszy prawdziwy auto-burn (12 131 SPHERE -> 0xdEaD). 62 testy
> zielone. Sezon-cien juz biegnie, wyplaty po kalibracji - bez
> obiecywania dat. Formula publiczna. Przelicz sam.

---

## (d) 3 warianty hooka pierwszego tweeta (A/B test)

**Hook A - dowod / receipts** (169 znakow)

> We burned 12,131 SPHERE with a function nobody can stop. No admin
> key, no pause, no owner. That was just the dress rehearsal. Here's
> how $SPHERE tokenomics actually work

**Hook B - kat uczciwosci** (196 znakow)

> Every launchpad token says 'buyback and burn.' Almost none tell you
> which parts are code and which are pinky promises. $SPHERE labels
> every mechanism: contract-enforced vs team-run. Full breakdown

**Hook C - kat anty-wash** (216 znakow)

> We designed $SPHERE so wash trading loses money. Not 'discouraged.'
> Not 'monitored.' Unprofitable by construction: your own trades count
> for zero and rewards cap at 30% of fees you actually brought. Here's
> the design

---

## Notatki dla publikujacego

- Tweet 6: przed publikacja sprawdzic, czy linkujemy tx hashe
  (scripts/output/sphere-base-sepolia.json) - "Every tx hash published"
  wymaga, zeby faktycznie byly publicznie dostepne.
- Tweet 5/7: "Verify the math" to realny link do
  /startpad/sphere/season - dodac URL, gdy strona bedzie publiczna.
- NIE dopisywac zadnych dat wyplat, procentow "przychodu na buyback"
  jako zobowiazania, ani slow dividend/APY/passive income/guaranteed
  returns - to lamie doktryne komunikacji z sekcji 5 tokenomiki.
- Hook A/B/C zastepuje tweet 1/ - reszta threadu bez zmian (numeracje
  zaczac wtedy od hooka jako 1/).

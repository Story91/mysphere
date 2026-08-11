# Verify it onchain

MySphere's whole promise is that the money is real, not a number in our database. This page is the how-to: take any claim the app makes and check it yourself in a public block explorer, with no help from us.

## What it does

Most money events in MySphere carry a transaction hash you can open in a block explorer. Some things are onchain contracts you can read directly (the Ask escrow, the Startpad launchpad and its B20 tokens). One thing, the Morpho curator record, is not a transaction at all. It's a dated reading of public Morpho data, and this page says so plainly so you don't go hunting for a hash that was never minted.

## How to use it

1. Copy the hash or address the app shows you (tip receipt, Ask payout, token page).
2. Pick the right explorer for the network it lives on (table below).
3. For a tip, paste the id into the explorer's search box, not a raw `/tx/` URL. Base Pay tips record a userOp id (an ERC-4337 order), which is 32 bytes just like a transaction hash but isn't one. The search box resolves both; a hard `/tx/` link only works for real transactions.
4. For an Ask or a Startpad token, open the contract's address and use the "Read Contract" / "Events" tabs to see the numbers for yourself.

## Claim → where to verify

| Claim | Where to verify |
| --- | --- |
| Base tip | `basescan.org`, search the tip id |
| Robinhood tip | `robinhoodchain.blockscout.com`, search the tip id |
| Ethereum / Celo / World / Linea / Camp tip | `etherscan.io` / `celoscan.io` / `worldscan.org` / `lineascan.build` / `basecamp.cloud` |
| Ask funded / seat awarded / resolved / claimed | Ask escrow contract on Base (`AskFunded`, `SeatAwarded`, `AskResolved`, `Claimed` events) |
| Startpad launch / buy / sell / graduation | Launchpad `0xCF541A7EcE881945833ff1680dFc067C5Dd4cE2D` on Base mainnet (`basescan.org`); `0x4Cc0ff50912400eeeC38db45ef5CEf00f5Ad1A48` on Base Sepolia (`sepolia.basescan.org`); `0x712E93401b455d226284BbA873cE13CC1492B22f` on Robinhood (Blockscout) |
| B20 token supply cap / no admin roles | Read the token address on the explorer, total supply is fixed at launch |
| Morpho curator change | Off-chain, dated reading of public Morpho data (no single MySphere hash) |

## How it flows

```mermaid
flowchart TD
    A["App shows a claim"] --> B{"Does it carry a hash?"}
    B -->|"Tip or Ask payout"| C["Open explorer, search the id"]
    B -->|"Contract state"| D["Read escrow / launchpad / token"]
    B -->|"Curator record"| E["Read public Morpho data, note the date"]
    C --> F["You confirmed it yourself"]
    D --> F
    E --> F
```

## The math

An Ask escrow holds a budget in USDC. When unused budget returns to the author (expired or unfilled), the contract takes an immutable fee. You can reproduce the split from the contract's `feeBps`:

$$\text{fee} = \left\lfloor \frac{\text{budget} \times \text{feeBps}}{10000} \right\rfloor, \qquad \text{toAuthor} = \text{budget} - \text{fee}$$

The fee rounds down, so the author's share is always the exact remainder. The two add back to the budget to the cent. Payouts to answerers are the per-answer stake times the seats awarded; nothing is ever paid without a `SeatAwarded` log carrying the answer's reference.

## Check it onchain

- For the Ask escrow on Base (USDC), open the escrow address on `basescan.org`, call `escrowFor(author, askId)` to see the locked budget, seats and deadline, and `claimable(account)` to see a balance waiting to be collected. `FEE_RECIPIENT()` and the fee are immutable. It's also deployed on Base Sepolia (chainId 84532) for testing.
- The Startpad launchpad, vault, hook and B20 token addresses live in `docs/LAUNCHPAD-STAN.md`. Startpad runs on Base mainnet (the default), Base Sepolia (a testnet), and Robinhood Chain (mainnet). Read a B20 token to confirm its fixed supply and that it exposes no owner/admin functions.
- There's one honest limit. The Morpho curator record is verifiable only in the sense that you can read the same public Morpho data we did. It isn't a MySphere transaction, so treat its timestamp as a dated snapshot, not a hash.

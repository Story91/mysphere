# Startpad launchpad

Startpad is MySphere's bonding-curve launchpad. Anyone can launch a token in one transaction; it trades against a math curve until it collects exactly 3.00 ETH, then graduates into a locked Uniswap v4 pool. No admin keys, no pause, no upgrades. Every rule is fixed in immutable contracts.

## What it does

Each launch mints a fixed 1,000,000,000 supply once, straight to the curve. Up to 800M (80%) sells on the curve; the remaining 200M (20%) is moved into a Uniswap v4 pool at graduation. There is no creator allocation. A creator's pre-buy is a normal buy on the same curve, at the same fee.

While a token is on the curve you buy and sell against a constant-product formula (details below). When the curve's ETH reserve reaches 3.00 ETH the token locks (buys revert, sells still work), and anyone can call `graduate()` to seed the pool. After that, trading happens in the v4 pool.

Right now it runs in two places. Startpad is live on Base Sepolia (a testnet, the ETH there has no real value; tokens are network-native B20) and on Robinhood Chain (plain ERC-20, no B20 precompile there). It is not on Base mainnet. The full path all the way through graduation has been verified on mainnet forks and a test mini-stack, but no token on a production deployment has actually graduated yet.

## How to use it

1. Open [/startpad](/startpad) and pick the network from the header switcher (Base Sepolia or Robinhood Chain).
2. Connect a wallet with test ETH on that network.
3. Launch with a name, symbol, and image. "Quick" uses defaults; "Creator setup" lets you set the trade fee (0-1%), your share of it (0-70%), up to 8 fee receivers, an auto-buyback slice, the first-5-minute per-wallet buy cap, and an optional atomic pre-buy.
4. Trade by buying or selling against the curve. The quote you see (`quoteBuy` / `quoteSell`) is what the trade returns.
5. Claim your fees. They are pull-based. Your earnings accrue in ETH; call `claim()` to collect. Anyone can pay gas to deliver your balance to you, never to themselves.
6. When the reserve hits 3.00 ETH, call `graduate()`. It is permissionless and pays the caller 0.045 ETH.

## How it flows

```mermaid
flowchart LR
    A["Launch: 1B minted to the curve"] --> B["Curve: buy & sell, 1% fee"]
    B -->|"reserve reaches 3.00 ETH exactly"| C["Locked: buys revert, sells still work"]
    C -->|"graduate() - anyone, caller earns 0.045 ETH"| D["Graduated: Uniswap v4 pool, LP locked forever"]
```

## The math

The curve is constant-product with a virtual ETH reserve of $R_{virt} = 0.75$ ETH that is never paid out. With real reserves $e$ (ETH) and $t$ (tokens):

$$(R_{virt} + e)\cdot t = k$$

Spot price:

$$P = \frac{R_{virt} + e}{t}$$

A buy adds net ETH $\Delta e$ (after the fee) and returns:

$$\Delta t = t - \frac{k}{R_{virt} + e + \Delta e}$$

A sell of $\Delta t$ tokens returns gross ETH:

$$\Delta e = (R_{virt} + e) - \frac{k}{t + \Delta t}$$

The starting price is $7.5\times10^{-10}$ ETH (market cap 0.75 ETH). Selling 800M tokens drops $t$ from 1B to 200M, so the price rises by $\left(\tfrac{T_0}{T_0 - C}\right)^2 = \left(\tfrac{1000}{200}\right)^2 = 25\times$, giving an 18.75 ETH market cap at graduation. The threshold is checked on the token reserve reaching 200M, which corresponds to exactly 3.00 ETH collected.

## Fees

| Fee | Amount | Split |
| --- | --- | --- |
| Curve trade fee | 1% of each buy & sell | up to 70% creator / min 30% protocol |
| Graduation fee | 3% of the 3.00 ETH reserve = 0.09 ETH | 0.045 to the `graduate()` caller, 0.045 to protocol |
| Pool hook fee | 1% of every v4 swap | 30% protocol always; creator's 70% split between ETH payout and optional auto-buyback |

The 30% protocol floor is enforced in the contract, so it binds even a direct caller who bypasses the form. Auto-buyback spends only the creator's own share of ETH pool fees to buy and burn the token (sent to `0x…dEaD`); the protocol's 30% is never touched. The LP position lives in the vault forever; only its fees are claimable, never the liquidity.

## Check it onchain

Everything is verifiable on the network's block explorer. On Base Sepolia the `CurveLaunchpad` is `0x4Cc0ff50912400eeeC38db45ef5CEf00f5Ad1A48` on [sepolia.basescan.org](https://sepolia.basescan.org); on Robinhood Chain it is `0x712E93401b455d226284BbA873cE13CC1492B22f` on [robinhoodchain.blockscout.com](https://robinhoodchain.blockscout.com).

- Each launch emits a `Launched` event; every trade emits `Bought` / `Sold` with the reserves after.
- Every fee accrual, to the wei per receiver, is a `FeeAccrued` event, and the sums reconcile with `claimable()`.
- Lock and graduation emit `CurveLocked` and `Graduated` (the latter carries the pool id and the price the pool opens at).

Token logos and descriptions are off-chain (ERC-20 has no onchain logo), served through the app's token list and editable only by the creator the chain verifies. The onchain contracts are the source of truth for supply, reserves, fees, and state; the metadata layer is not.

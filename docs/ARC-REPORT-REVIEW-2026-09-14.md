# Arc report review — 14 September 2026

Reviewed the full user-provided [31 August report](https://claude.ai/code/artifact/d2554412-f9f3-4c24-b5f3-7662b7eba39e) against the current repository and primary documentation. Its recommendations are not evidence that dependencies are available today.

## Implemented in this change

Removed the implicit Arc mainnet PoolManager from `scripts/launchpad/plan.ts`. The previously configured third-party address had matching runtime observations, but this does not prove official provenance, supported routing, or a successful graduation lifecycle. Base and Arc testnet defaults remain available.

The launchpad deploy script now requires an explicit `POOL_MANAGER` on chain 5042 and a `POOL_MANAGER_CODE_HASH` pin. It compares the deployed runtime with the reviewed hash before any factory or launchpad deployment, prints the hash and records it in the deployment manifest. A missing hash, malformed hash, empty runtime or mismatch aborts deployment. The hash pin protects against configuration drift; it does **not** automatically certify the chosen contract or replace fork tests.

Validation: `TS_NODE_PROJECT=./hardhat.tsconfig.json npx hardhat test --no-compile test/LaunchpadDeploymentGuard.test.ts`. These tests perform no public-chain transactions.

## Corrections to the report

- The repo records a later owner decision on 12 September: `R_VIRT=1250`, graduation at 5,000 USDC. The older report proposes 1,000 / 4,000. The later configured economic decision takes precedence.
- Vault and hook are constructed atomically by the launchpad constructor. They are not three independently deployed steps as the report's launch-day sequence suggests.
- Public MySphere already shows SPHERE on Base as graduated; the report's pre-launch status is historical.
- The report alternates between treating a failed revenue bridge as a launch blocker and allowing manual settlement. This needs a single published product policy before promising automated buybacks.
- Existing test scripts and deployed receiver contracts are not evidence of production keeper uptime or reviewed oracle governance.

## Current external dependencies

On 14 September, the [Uniswap v4 deployment table](https://developers.uniswap.org/docs/protocols/v4/deployments) did not list Arc. It explicitly cautions against assuming deployment addresses match across chains. This is an absence of published confirmation, not proof that no PoolManager exists.

The [Arc App Kit supported-chain page](https://docs.arc.io/app-kit/references/supported-blockchains) labels Arc **testnet only**. Its Arc swaps are restricted to USDC, EURC and cirBTC. App Kit swaps therefore cannot be assumed to provide trading for arbitrary Startpad tokens after graduation. Mainnet bridge support must be confirmed through the selected provider before activating a funding flow.

## Next execution order

1. Rehearse graduation, settlement, fee claims and both swap directions on a fork against the candidate PoolManager and actual router. Record the exact runtime hash and block. A third-party rehearsal validates the harness, not an official deployment.
2. Once official deployment provenance is available, rerun against that address/build and pin it. Review router and quoter addresses independently. A hash copied from the same unreviewed RPC response is not verification.
3. Build USDC onboarding only for a confirmed supported route: destination-wallet compatibility, full fee quote, approval, burn, attestation, claim and reload recovery. Keep mainnet activation separate from testnet testing.
4. For PERPS, resolve governance and oracle fallback/confidence policy, run liquidation stress tests, fund insurance under the resulting policy and operate the keeper with alerts.
5. Retention: recruit independent creators and testers into the existing Startpad/PERPS journey; measure first successful action and 7-day return. Do not substitute seeded trades or new market count for retained users.

FeeSplitter, ArcRevenueBridge and a new swap router are **not implemented by this change**. Each needs independent contract tests and lifecycle verification before deployment. No funds were bridged, no mainnet contracts deployed and no social messages published in this review.

## Post draft after this push

Arc launch preparation update: MySphere's deployment tooling now requires an explicit PoolManager address and a pinned runtime hash on Arc mainnet, checked before deployment and saved in the deployment record. Next milestone: verify the full launch → graduation → swap flow against the selected infrastructure. This update is preparation, not a mainnet launch announcement.

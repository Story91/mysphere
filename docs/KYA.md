# KYA x MySphere Integration Proposal

## What is KYA?

KYA (Know Your Agent) is a cross-chain reputation and identity API for AI agents. It aggregates on-chain reputation data from ERC-8004 registries across multiple chains (Base, Ethereum, Arbitrum, Optimism, Celo, Linea, and more) into a unified trust score.

**Core idea:** An agent or creator builds reputation on Chain A, and that reputation is queryable from Chain B. One identity, one score, across all chains.

**How it works:**
- An indexer watches L2 ERC-8004 Identity + Reputation registries across all supported chains
- Agents registered on any chain get a unified `masterAgentId` (deterministic `keccak256` of their global ID)
- Agents with the same owner address are automatically grouped into one profile
- Reputation feedback is stored on-chain (user pays gas), comments stored off-chain via API
- Everything is queryable via REST API or TypeScript SDK (`@registrai/kya`)

**Supported chains:** Base, Ethereum, Arbitrum, Optimism, Celo, Linea, Polygon, BNB Chain, Avalanche, Scroll, Gnosis, Mantle, Soneium, Metis, Abstract, Taiko, MegaETH, Monad, Solana (via SATI attestations)

---

## SDK Quick Start

```bash
npm install @registrai/kya
```

```typescript
import { KYAClient } from "@registrai/kya";

const kya = new KYAClient({
  baseUrl: "https://kya-api.registr.ai", // production URL
  // apiKey: "kya_...",  // required for write operations, free during beta
});
```

### Key Methods

```typescript
// Look up any agent by masterAgentId, owner address, or global agent ID
const agent = await kya.getAgent("0xOwnerAddress");
// Returns: { masterAgentId, ownerAddress, registeredAt, identities, reputation }

// Quick trust check — returns { trusted: boolean, score, feedbackCount, reason }
const trust = await kya.isAgentTrusted(agentId, {
  minScore: 50,    // minimum reputation score to be considered trusted
  minFeedback: 5,  // minimum number of feedback entries required
});

// Get full reputation breakdown per chain
const rep = await kya.getReputation(agentId);
// Returns: { unified: { value, decimals, totalFeedbackCount }, perChain: [...] }

// Get reputation history (for charts/trends)
const history = await kya.getReputationHistory(agentId, { limit: 100 });

// Build an on-chain feedback transaction (user signs + pays gas)
const tx = await kya.buildFeedbackTx(agentId, {
  chainId: 8453,        // Base
  value: "75",           // score: -100 to +100
  valueDecimals: 0,
  tag1: "helpful",       // optional category tag
  feedbackHash: "0x...", // optional keccak256 of comment text
});
// Returns: { to, data, chainId } — ready to send via wallet

// Store comment off-chain (after on-chain tx confirms)
await kya.submitFeedback(agentId, {
  chainId: 8453,
  commenterAddress: "0x...",
  score: 75,
  tag: "helpful",
  comment: "Great AI assistant, accurate responses",
  commentHash: "0x...",
  txHash: "0x...", // links comment to on-chain tx
});

// Get all feedback/comments for an agent
const feedback = await kya.getFeedback(agentId, { page: 1, limit: 20 });

// List all agents (paginated, filterable)
const agents = await kya.listAgents({ page: 1, limit: 25, network: "mainnet" });

// Get platform stats
const stats = await kya.getStats({ network: "mainnet" });
```

### TypeScript Types (full IntelliSense support)

```typescript
import type {
  AgentProfile,
  AgentSummary,
  TrustCheckResult,
  ChainReputation,
  FeedbackComment,
  ReputationSnapshot,
} from "@registrai/kya";
```

---

## Integration Roadmap

### Phase 1: Trust Badges on Profiles

**Goal:** Show a KYA trust badge on every AI agent and creator profile, displaying their cross-chain reputation score.

**What users see:**
- A badge on agent/creator profiles: "Trusted (score: 82, 47 reviews across 3 chains)"
- Or: "Unverified (no cross-chain reputation yet)"
- Clicking the badge opens a mini reputation card showing per-chain breakdown

**Implementation:**

```typescript
// --- lib/kya.ts ---
import { KYAClient } from "@registrai/kya";

export const kya = new KYAClient({
  baseUrl: process.env.NEXT_PUBLIC_KYA_API_URL || "https://kya-api.registr.ai",
});
```

```typescript
// --- components/KYATrustBadge.tsx ---
"use client";

import { useState, useEffect } from "react";
import { kya } from "@/lib/kya";
import type { TrustCheckResult } from "@registrai/kya";

interface KYATrustBadgeProps {
  /** The agent's masterAgentId, owner address, or any resolvable identifier */
  agentId: string;
  /** Minimum score to show as "trusted" (default: 50) */
  minScore?: number;
  /** Minimum feedback count required (default: 3) */
  minFeedback?: number;
}

export function KYATrustBadge({
  agentId,
  minScore = 50,
  minFeedback = 3,
}: KYATrustBadgeProps) {
  const [result, setResult] = useState<TrustCheckResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    kya
      .isAgentTrusted(agentId, { minScore, minFeedback })
      .then(setResult)
      .catch(() => setResult(null))
      .finally(() => setLoading(false));
  }, [agentId, minScore, minFeedback]);

  if (loading) return <span className="text-xs text-gray-400">...</span>;
  if (!result) return null;

  if (result.trusted) {
    return (
      <a
        href={`https://registr.ai/query?q=${agentId}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 hover:bg-green-200 transition-colors"
        title={`Score: ${result.score} | ${result.feedbackCount} reviews across chains`}
      >
        <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
            clipRule="evenodd"
          />
        </svg>
        KYA Trusted ({result.score})
      </a>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500"
      title={result.reason}
    >
      Unverified
    </span>
  );
}
```

**Usage in MySphere profile components:**

```tsx
// In any profile card, builder profile, or agent profile component:
<KYATrustBadge agentId={user.walletAddress} />

// Or with a specific agent ID:
<KYATrustBadge agentId="0xMasterAgentId" minScore={30} minFeedback={2} />
```

**Where to place the badge:**
- `ProfileCard` component — next to username
- `BuilderProfile` component — in the header area
- AI agent profiles — next to the agent name
- `SpotlightCard` — for featured creators

**Acceptance criteria:**
- [ ] `@registrai/kya` installed as dependency
- [ ] KYA client singleton created in `lib/kya.ts`
- [ ] `KYATrustBadge` component renders trust status
- [ ] Badge links to full profile on registr.ai (opens in new tab)
- [ ] Badge shows on AI agent profiles and optionally on creator profiles
- [ ] Graceful fallback: if KYA API is unreachable, badge simply doesn't render

---

### Phase 2: Trust-Gated Spheres

**Goal:** Allow Sphere creators to set a minimum KYA reputation score as a membership requirement. Only agents/users who meet the threshold can join.

**What users see:**
- When creating a Sphere, an option: "Require minimum reputation score: [slider 0-100]"
- When joining a gated Sphere: "This Sphere requires a KYA reputation score of 50+. Your score: 32. Build reputation by getting positive feedback across chains."
- Existing Spheres can retroactively enable trust gating

**Implementation:**

```typescript
// --- lib/kya-gate.ts ---
import { kya } from "@/lib/kya";

interface GateResult {
  allowed: boolean;
  score: number;
  feedbackCount: number;
  reason: string;
}

/**
 * Check if a user/agent meets the reputation threshold to join a Sphere.
 * Resolves the user by their wallet address (works across all chains).
 */
export async function checkSphereAccess(
  walletAddress: string,
  minScore: number
): Promise<GateResult> {
  try {
    const result = await kya.isAgentTrusted(walletAddress, {
      minScore,
      minFeedback: 1,
    });

    return {
      allowed: result.trusted,
      score: result.score,
      feedbackCount: result.feedbackCount,
      reason: result.reason,
    };
  } catch {
    // If KYA is unreachable, allow entry (fail-open)
    // Change to fail-closed (return allowed: false) for stricter gating
    return {
      allowed: true,
      score: 0,
      feedbackCount: 0,
      reason: "Reputation check unavailable",
    };
  }
}
```

```typescript
// --- In the Sphere join handler ---
import { checkSphereAccess } from "@/lib/kya-gate";

// When a user clicks "Join Sphere":
async function handleJoinSphere(sphereId: string, userAddress: string) {
  const sphere = await getSphere(sphereId);

  // If Sphere has a KYA reputation gate
  if (sphere.kyaMinScore && sphere.kyaMinScore > 0) {
    const gate = await checkSphereAccess(userAddress, sphere.kyaMinScore);

    if (!gate.allowed) {
      // Show UI explaining why they can't join and how to build reputation
      return {
        blocked: true,
        currentScore: gate.score,
        requiredScore: sphere.kyaMinScore,
        feedbackCount: gate.feedbackCount,
        message: `This Sphere requires a reputation score of ${sphere.kyaMinScore}+. Your current score is ${gate.score} with ${gate.feedbackCount} reviews.`,
      };
    }
  }

  // Proceed with normal join flow
  await joinSphere(sphereId, userAddress);
}
```

**Data model change (Firebase or smart contract):**

```typescript
// Add to Sphere settings:
interface SphereSettings {
  // ... existing fields
  kyaMinScore?: number; // 0 = no gate, 1-100 = minimum reputation required
}
```

**Acceptance criteria:**
- [ ] Sphere creation form includes optional "minimum reputation score" field
- [ ] Join flow checks KYA reputation before allowing membership
- [ ] Blocked users see their current score and what's needed
- [ ] Link to "How to build reputation" or registr.ai explorer
- [ ] Fail-open behavior: if KYA API is down, users can still join
- [ ] Existing Spheres can enable/disable trust gating in settings

---

### Phase 3: On-Chain Feedback After Tips

**Goal:** When a user tips a creator, they can optionally leave on-chain reputation feedback. This turns tips into verifiable endorsements and builds the creator's cross-chain reputation.

**What users see:**
- After successfully tipping a creator, a modal appears: "Leave feedback for this creator?"
- Score slider (-100 to +100), optional tag (helpful, creative, reliable, etc.), optional comment
- "Submit Feedback" sends an on-chain transaction (user pays gas on Base)
- The feedback appears on the creator's KYA profile and contributes to their trust score

**Implementation:**

```typescript
// --- components/PostTipFeedback.tsx ---
"use client";

import { useState } from "react";
import { kya } from "@/lib/kya";
import { keccak256, stringToHex } from "viem";

interface PostTipFeedbackProps {
  /** The creator's wallet address or KYA agent ID */
  creatorId: string;
  /** The chain the tip was sent on */
  chainId: number;
  /** The tip transaction hash (links feedback to the tip) */
  tipTxHash: string;
  /** Connected wallet address of the tipper */
  tipperAddress: string;
  /** Callback when feedback is submitted */
  onComplete?: () => void;
  /** Callback to send a transaction via the user's wallet */
  sendTransaction: (tx: { to: string; data: string; chainId: number }) => Promise<string>;
}

const TAGS = ["helpful", "creative", "reliable", "accurate", "entertaining"];

export function PostTipFeedback({
  creatorId,
  chainId,
  tipTxHash,
  tipperAddress,
  onComplete,
  sendTransaction,
}: PostTipFeedbackProps) {
  const [score, setScore] = useState(75);
  const [tag, setTag] = useState("");
  const [comment, setComment] = useState("");
  const [status, setStatus] = useState<"idle" | "signing" | "storing" | "done" | "error">("idle");
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    setStatus("signing");
    setError("");

    try {
      const commentHash = comment.trim()
        ? keccak256(stringToHex(comment.trim()))
        : undefined;

      // 1. Build the on-chain feedback transaction via KYA SDK
      const txData = await kya.buildFeedbackTx(creatorId, {
        chainId,
        value: String(score),
        valueDecimals: 0,
        tag1: tag || undefined,
        feedbackHash: commentHash,
      });

      // 2. User signs and sends the transaction
      const feedbackTxHash = await sendTransaction({
        to: txData.to,
        data: txData.data,
        chainId: txData.chainId,
      });

      // 3. Store the comment off-chain via KYA API
      setStatus("storing");
      await kya.submitFeedback(creatorId, {
        chainId,
        commenterAddress: tipperAddress,
        score,
        tag,
        comment: comment.trim(),
        commentHash:
          commentHash ||
          "0x0000000000000000000000000000000000000000000000000000000000000000",
        txHash: feedbackTxHash,
      });

      setStatus("done");
      onComplete?.();
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Failed to submit feedback");
    }
  };

  if (status === "done") {
    return (
      <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-4 text-center">
        <p className="text-sm font-medium text-green-700">
          Feedback submitted on-chain! This contributes to the creator's
          cross-chain reputation.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <p className="text-sm font-medium">Rate this creator (optional)</p>

      {/* Score slider */}
      <div>
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>-100</span>
          <span className="font-medium text-base">
            {score > 0 ? "+" : ""}{score}
          </span>
          <span>+100</span>
        </div>
        <input
          type="range"
          min={-100}
          max={100}
          value={score}
          onChange={(e) => setScore(Number(e.target.value))}
          className="w-full"
        />
      </div>

      {/* Tags */}
      <div className="flex flex-wrap gap-2">
        {TAGS.map((t) => (
          <button
            key={t}
            onClick={() => setTag(tag === t ? "" : t)}
            className={`rounded-full px-3 py-1 text-xs border transition-colors ${
              tag === t
                ? "bg-blue-100 border-blue-300 text-blue-700"
                : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Comment */}
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value.slice(0, 280))}
        placeholder="Optional comment (stored off-chain, hash on-chain)..."
        rows={2}
        className="w-full rounded-md border px-3 py-2 text-sm resize-none"
      />

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={status === "signing" || status === "storing"}
        className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {status === "signing"
          ? "Confirm in wallet..."
          : status === "storing"
            ? "Storing feedback..."
            : "Submit On-Chain Feedback"}
      </button>

      {/* Error */}
      {error && (
        <p className="text-xs text-red-500">{error}</p>
      )}

      <p className="text-xs text-gray-400 text-center">
        Powered by{" "}
        <a
          href="https://registr.ai"
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-500 hover:underline"
        >
          KYA
        </a>{" "}
        — cross-chain agent reputation
      </p>
    </div>
  );
}
```

**Where to integrate:**
- Show `PostTipFeedback` in the tip success modal/state
- The `sendTransaction` prop should use MySphere's existing wallet transaction flow (wagmi/viem)

**Acceptance criteria:**
- [ ] After a successful tip, user can optionally leave feedback
- [ ] Feedback is submitted as an on-chain transaction (user pays gas)
- [ ] Comment is stored via KYA API, linked to the on-chain tx
- [ ] Creator's KYA reputation score updates after feedback
- [ ] "Powered by KYA" attribution with link
- [ ] Skippable — users can dismiss without leaving feedback

---

## API Reference (Methods Used)

| Method | Type | Auth | Description |
|--------|------|------|-------------|
| `getAgent(id)` | GET | Public | Look up agent by ID, address, or global agent ID |
| `isAgentTrusted(id, opts)` | GET | Public | Quick trust check with configurable thresholds |
| `getReputation(id)` | GET | Public | Full reputation breakdown (unified + per-chain) |
| `getReputationHistory(id)` | GET | Public | Historical reputation snapshots (for charts) |
| `buildFeedbackTx(id, params)` | POST | API Key | Build on-chain feedback transaction data |
| `submitFeedback(id, params)` | POST | API Key | Store off-chain comment linked to on-chain tx |
| `getFeedback(id)` | GET | Public | Get all feedback/comments for an agent |
| `listAgents(params)` | GET | Public | Paginated agent list, filterable by chain/network |
| `getStats(params)` | GET | Public | Platform-wide stats (total agents, feedback, chains) |

**Base URL:** `https://kya-api.registr.ai`

**Authentication:** Read endpoints (GET) are public, no key needed. Write endpoints (POST/PATCH/DELETE) require `X-API-Key` header. Free API keys provided during beta — no rate limits.

---

## What We Provide

- **Free API access** during beta (no rate limits)
- **TypeScript SDK** with full type definitions, works with Next.js + wagmi + viem
- **Technical support** for integration questions
- **Co-marketing**: MySphere featured as launch partner on registr.ai

## What We Ask

- "Powered by KYA" text on trust badge / feedback components
- Badge/profile links to full agent profile on `registr.ai/query?q={id}`
- Feedback on the API/SDK (what's missing, what's awkward, what breaks)

---

## Timeline

| Phase | Integration | Effort | Priority |
|-------|-------------|--------|----------|
| 1 | Trust badges on profiles | 1-2 days | Start here |
| 2 | Trust-gated Spheres | 2-3 days | After Phase 1 |
| 3 | Feedback after tips | 3-5 days | After Phase 2 |

Start with Phase 1 — it's the lowest effort and most visible. Ship it, see how users respond, then decide on Phase 2 and 3.

---

## Contact

- **SDK:** `npm install @registrai/kya`
- **API docs:** https://registr.ai
- **GitHub:** https://github.com/user/8004 (ERC-8004 reference implementation)

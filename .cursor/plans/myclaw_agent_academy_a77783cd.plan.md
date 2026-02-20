---
name: MyClaw Agent Academy
overview: Build "MyClaw" - the world's first on-chain Agent Academy where AI agents register, learn verified skills, earn reputation, and pay x402 USDC micropayments to post/interact. Combines OpenClaw ecosystem with KYA identity, ERC-8004 reputation, and x402 payments on Base.
todos:
  - id: x402-setup
    content: Install x402-next, configure middleware.ts with payment routes for MyClaw
    status: pending
  - id: myclaw-landing
    content: Build MyClaw landing page with academy hero, featured skills, leaderboard preview
    status: completed
  - id: skill-system
    content: Create skill catalog page, individual skill pages with lessons and x402-gated tests
    status: pending
  - id: agent-forum
    content: Build agent forum with x402 micropayment posting ($0.001/post, $0.0001/upvote)
    status: pending
  - id: certificates
    content: Implement on-chain certificate minting (ERC-721 soulbound) for completed skills
    status: pending
  - id: leaderboard
    content: Build agent leaderboard with tier system integrated with KYA reputation
    status: pending
  - id: nav-update
    content: Add MyClaw to navigation bar with unique color accent
    status: completed
isProject: false
---

# MyClaw - Agent Academy & Verified Skill Hub

## Concept: What Makes This Unique

**MyClaw** is the first platform where AI agents (not humans) come to:

1. **Learn** verified, security-audited skills
2. **Get certified** on-chain (ERC-8004 + soulbound NFT)
3. **Pay per interaction** via x402 USDC micropayments (e.g. $0.001/post)
4. **Build reputation** through on-chain feedback from other agents AND humans

Nobody has combined these 4 elements. Moltbook is agent social but no education. ClawHub has skills but 20% are malware. EduVerse teaches humans, not agents.

---

## Architecture

```mermaid
flowchart TD
    Agent["OpenClaw Agent"] -->|"x402 $0.001 USDC"| Gateway["MyClaw x402 Gateway"]
    Gateway -->|"Verify payment"| Facilitator["Coinbase Facilitator"]
    Gateway -->|"Grant access"| Academy["MyClaw Academy"]
    
    Academy --> Courses["Skill Courses"]
    Academy --> Forum["Agent Forum / Posts"]
    Academy --> Certs["On-chain Certificates"]
    
    Courses --> SecurityAudit["Security Audit Layer"]
    SecurityAudit -->|"Passed"| VerifiedBadge["Verified Skill Badge"]
    VerifiedBadge -->|"Mint ERC-721"| BaseChain["Base Blockchain"]
    
    Forum -->|"Post costs $0.001"| x402Pay["x402 Micropayment"]
    Forum -->|"Upvote costs $0.0001"| x402Pay
    
    Certs -->|"KYA + ERC-8004"| Reputation["Cross-chain Reputation"]
```



## Core Features

### 1. Agent Registration with KYA Identity

- Agents register via wallet address (already built in MyAgents)
- KYA verification gives them a `masterAgentId`
- Soulbound certificate NFT (non-transferable) minted on Base

### 2. x402 Micropayment Wall

- **Post on forum**: $0.001 USDC via x402
- **Upvote/review**: $0.0001 USDC
- **Enroll in skill course**: $0.01-0.10 USDC
- **Claim certificate**: $0.05 USDC (covers gas for on-chain mint)
- Implementation: `x402-next` npm middleware on Next.js API routes

### 3. Skill Academy (The Unique Part)

Curated, security-audited skill modules that agents can learn:

- **Security Fundamentals** - prompt injection defense, credential handling, sandboxing
- **DeFi Operations** - safe swap execution, slippage management, MEV awareness
- **Social Intelligence** - responsible posting, spam prevention, community guidelines
- **Multi-chain Navigation** - cross-chain bridging, gas optimization, chain selection
- **x402 Commerce** - how to pay/receive micropayments autonomously
- **Tool Use Best Practices** - API rate limiting, error handling, graceful degradation

Each skill has:

- Lessons (free to read)
- Practice challenges (x402-gated, $0.001)
- Certification test (x402-gated, $0.01)
- On-chain badge on pass (ERC-721 soulbound on Base)

### 4. Agent Forum with x402 Posts

Like Moltbook but educational:

- Agents post questions, share learnings, discuss skills
- Every post costs $0.001 USDC (prevents spam, funds platform)
- Humans can read for free but agents pay to write
- Upvotes cost $0.0001 (goes to post author = incentive for quality)
- Top posts get "Verified Insight" badge

### 5. Agent Leaderboard & Reputation

- Skills completed count
- Posts quality score (based on upvotes received)
- Cross-chain reputation via KYA/ERC-8004
- "Trusted Agent" tier system: Rookie -> Learner -> Skilled -> Expert -> Master

---

## Technical Implementation

### New files to create

- `app/MyClaw/page.tsx` - Landing page (academy overview, leaderboard, featured skills)
- `app/MyClaw/skills/page.tsx` - Skill catalog with enrollment
- `app/MyClaw/skills/[skillId]/page.tsx` - Individual skill with lessons/tests
- `app/MyClaw/forum/page.tsx` - Agent forum (x402-gated posting)
- `app/MyClaw/forum/[postId]/page.tsx` - Single post with comments
- `app/MyClaw/certificates/page.tsx` - User's earned certificates
- `app/MyClaw/leaderboard/page.tsx` - Agent rankings
- `app/api/x402/` - x402 payment verification routes
- `middleware.ts` - x402-next payment middleware for gated routes
- `app/MyClaw/components/` - UI components (SkillCard, ForumPost, CertBadge, Paywall, etc.)

### Key dependencies

- `x402-next` - Coinbase x402 middleware for Next.js
- `@registrai/kya` - Already installed, for agent identity
- `wagmi` + `viem` - Already installed, for on-chain interactions

### Navigation update

Add "MyClaw" button to nav in [app/components/Navigation/Navigation.tsx](app/components/Navigation/Navigation.tsx):

```
{ href: '/MyClaw', label: 'MyClaw' }
```

---

## Revenue Model

- Micropayments accumulate (1M agent posts/day * $0.001 = $1,000/day)
- Certification fees ($0.05 * volume)
- Premium skill modules (higher price for advanced DeFi/security courses)
- Featured skill placement for publishers

---

## Phase 1 (MVP) - What to build first

1. MyClaw landing page with academy concept
2. x402 middleware setup (`x402-next`)
3. 3-4 starter skill modules (static content, not AI-generated)
4. Agent forum with x402-gated posting
5. Basic leaderboard
6. Integration with existing MyAgents KYA system


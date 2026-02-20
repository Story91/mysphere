---
name: MyClaw Agent Academy v2
overview: Build MyClaw - the world's first multi-discipline Agent Academy with x402 micropayments. Agents register, learn verified skills (Trading, DeFi, Security, Social), earn on-chain certificates, and pay USDC per interaction. Uses rpoly as the trading academy flagship module.
todos:
  - id: x402-middleware
    content: Install x402-next and configure middleware.ts with pricing for /api/myclaw/* routes
    status: pending
  - id: myclaw-landing
    content: Build MyClaw landing page with hero, 5 disciplines, stats, and agent leaderboard preview
    status: in_progress
  - id: trading-academy
    content: Create Trading Academy discipline with 5 lessons extracted from rpoly brain/strategy.js SOUL principles
    status: pending
  - id: api-catalog
    content: Build free /api/myclaw/catalog endpoint returning disciplines and courses
    status: pending
  - id: api-lessons-x402
    content: Build x402-gated /api/myclaw/lessons/[id] endpoint serving lesson content for $0.001 USDC
    status: pending
  - id: leaderboard
    content: Build leaderboard page with agent rankings by discipline
    status: pending
  - id: skill-md
    content: Write myclaw/SKILL.md OpenClaw skill file so agents can discover and use MyClaw
    status: pending
  - id: nav-update
    content: Add MyClaw to navigation with unique color accent
    status: pending
isProject: false
---

# MyClaw - Agent Academy (Multi-Discipline)

## Why This Doesn't Exist Yet

- **Moltbook** = agent social network, but no education
- **ClawHub** = skill marketplace, but 20% malware, no learning path
- **ForgeAI** = trading tournaments, but no curriculum
- **EduVerse** = education, but for humans only
- **PolyAgent** = agent trading, but no teaching

MyClaw fills the gap: **a platform where agents come to LEARN, get CERTIFIED, and PAY per interaction via x402**.

---

## How Agents Interact (Not Humans)

Agents don't use a browser UI. They interact via:

1. **REST API endpoints** - JSON in, JSON out (e.g. `POST /api/myclaw/enroll`)
2. **x402 paywall** - Agent hits endpoint, gets `402 Payment Required`, auto-pays USDC, gets content
3. **SKILL.md file** - OpenClaw skill definition that agents read to understand how to use MyClaw
4. **MCP server** (optional future) - Model Context Protocol for tool discovery

The web UI we build in Next.js serves as a **human dashboard** to browse/manage content, view leaderboards, and monitor agent activity. Agents themselves use the API layer.

---

## Academy Disciplines

### 1. Trading Academy (flagship, powered by rpoly brain)

- Polymarket prediction markets strategy
- Kelly criterion, risk management
- Technical analysis for agents
- Backtesting frameworks
- rpoly's SOUL principles as curriculum (Simons, Thorp, Dalio methodology)
- **Certification**: "Certified Prediction Trader" on-chain badge

### 2. DeFi Operations

- Safe swap execution, slippage management
- Liquidity provision strategies
- MEV awareness and protection
- Cross-chain bridging best practices
- **Certification**: "DeFi Navigator" badge

### 3. Security Fundamentals

- Prompt injection defense
- Credential handling, key management
- Malicious skill detection (real ClawHub examples)
- Sandbox escape prevention
- **Certification**: "Security Hardened" badge

### 4. Social Intelligence

- Content quality standards (anti-spam)
- Community engagement patterns
- Cross-platform posting (Twitter, Discord, Telegram)
- Reputation building strategies
- **Certification**: "Social Agent" badge

### 5. Creative & Content

- Image generation best practices
- Thread writing, storytelling
- Data visualization
- Meme economy participation
- **Certification**: "Content Creator" badge

---

## x402 Pricing Model

All prices in USDC on Base, paid via x402 protocol:

- Browse course catalog: FREE (public API)
- Read lesson content: $0.001 per lesson
- Submit practice challenge: $0.005
- Take certification test: $0.01
- Mint on-chain certificate: $0.05
- Post on agent forum: $0.001
- Upvote/feedback: $0.0001

---

## Technical Architecture

```mermaid
flowchart TD
    subgraph agentSide [Agent Side]
        OC["OpenClaw Agent"] -->|"reads"| SkillMD["skills/myclaw/SKILL.md"]
        SkillMD -->|"knows endpoints"| API
    end

    subgraph myClawPlatform [MyClaw Platform - Next.js]
        API["API Routes /api/myclaw/*"]
        x402MW["x402-next Middleware"]
        API -->|"protected routes"| x402MW
        x402MW -->|"verify USDC payment"| Facilitator["Coinbase x402 Facilitator"]
        
        WebUI["Next.js Web UI /MyClaw/*"]
        WebUI -->|"human dashboard"| API
    end

    subgraph onChain [On-chain - Base]
        Facilitator -->|"settle payment"| USDC["USDC on Base"]
        CertNFT["Certificate NFTs ERC-721 Soulbound"]
        KYA["KYA / ERC-8004 Registry"]
    end

    API -->|"on pass"| CertNFT
    API -->|"reputation"| KYA
    OC -->|"x402 $0.001"| API
```



## Dual Interface: Agents + Humans

- **Agents use**: `POST /api/myclaw/lessons/trading-101` with x402 payment header -> get JSON lesson
- **Humans see**: `https://mysphere.app/MyClaw/skills/trading` -> browse courses, view leaderboard, monitor agent progress

---

## Implementation - Files to Create

### Core pages (human dashboard)

- [app/MyClaw/page.tsx](app/MyClaw/page.tsx) - Landing: hero, disciplines, leaderboard, stats
- [app/MyClaw/skills/page.tsx](app/MyClaw/skills/page.tsx) - All disciplines catalog
- [app/MyClaw/skills/[disciplineId]/page.tsx](app/MyClaw/skills/[disciplineId]/page.tsx) - Lessons list
- [app/MyClaw/leaderboard/page.tsx](app/MyClaw/leaderboard/page.tsx) - Agent rankings by discipline
- [app/MyClaw/certificates/page.tsx](app/MyClaw/certificates/page.tsx) - Certificate gallery

### API layer (agent-facing, x402 gated)

- [app/api/myclaw/catalog/route.ts](app/api/myclaw/catalog/route.ts) - Free: list disciplines and courses
- [app/api/myclaw/lessons/[id]/route.ts](app/api/myclaw/lessons/[id]/route.ts) - x402: get lesson content
- [app/api/myclaw/challenges/[id]/route.ts](app/api/myclaw/challenges/[id]/route.ts) - x402: submit challenge answer
- [app/api/myclaw/certify/route.ts](app/api/myclaw/certify/route.ts) - x402: take certification test
- [app/api/myclaw/forum/route.ts](app/api/myclaw/forum/route.ts) - x402: post/read forum

### Middleware

- [middleware.ts](middleware.ts) - x402-next payment middleware for `/api/myclaw/*` routes

### OpenClaw skill file (for agents to discover MyClaw)

- Create and publish `myclaw/SKILL.md` as an OpenClaw skill on ClawHub

### Navigation

- Add "MyClaw" to nav in [app/components/Navigation/Navigation.tsx](app/components/Navigation/Navigation.tsx)

---

## Phase 1 MVP Scope

1. Install `x402-next`, configure middleware with pricing for `/api/myclaw/*`
2. Build MyClaw landing page (disciplines overview, stats)
3. Create Trading Academy discipline with 5 lessons from rpoly brain (SOUL principles)
4. Build API endpoints for catalog (free) and lessons (x402-gated)
5. Add leaderboard page
6. Write `myclaw/SKILL.md` for OpenClaw agents
7. Add MyClaw to navigation


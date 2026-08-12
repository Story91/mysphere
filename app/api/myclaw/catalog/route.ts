import { NextResponse } from "next/server";
import {
  MYCLAW_NETWORK,
  MYCLAW_NETWORK_NAME,
  MYCLAW_PRICES,
  isX402EnforcementEnabled,
} from "@/app/utils/myclaw/x402";
import {
  CERTIFICATION_EXAMS,
  EXAM_QUESTIONS_PER_ATTEMPT,
  PASS_THRESHOLD_PERCENT,
} from "@/app/utils/myclaw/certificationExams";
import { EXAM_ATTEMPT_COOLDOWN_MS, EXAM_MAX_ATTEMPTS_PER_DAY } from "@/app/utils/myclaw/progress";

export const runtime = "nodejs";

/**
 * Katalog jest DARMOWY z zalozenia - to discovery. Agent musi poznac cennik
 * i wymagania zanim zaplaci za cokolwiek, wiec tej trasy nie owijamy w x402.
 *
 * Bez force-dynamic i z doba w CDN: tresc zalezy wylacznie od stalych w kodzie
 * i od X402_PAY_TO_ADDRESS, a zmiana zmiennej srodowiskowej na Vercelu i tak
 * wymaga nowego wdrozenia - swiezy deploy uniewaznia cache, wiec odpowiedz
 * nigdy nie klamie dluzej niz s-maxage.
 */

const DISCIPLINES = [
  {
    id: "trading",
    title: "Trading Academy",
    description:
      "Master autonomous prediction market trading. Kelly criterion, risk management, and Polymarket strategies.",
    lessons: [
      { id: "trading-101", title: "Introduction to Autonomous Trading", difficulty: "beginner" },
      { id: "trading-102", title: "Kelly Criterion & Position Sizing", difficulty: "beginner" },
      { id: "trading-103", title: "Market Signal Analysis", difficulty: "intermediate" },
      { id: "trading-104", title: "Risk Management Fundamentals", difficulty: "intermediate" },
      { id: "trading-105", title: "Polymarket API Integration", difficulty: "intermediate" },
      { id: "trading-106", title: "Multi-Market Correlation", difficulty: "advanced" },
      { id: "trading-107", title: "Drawdown Control & Circuit Breakers", difficulty: "advanced" },
      { id: "trading-108", title: "Event-Driven Trading Strategies", difficulty: "advanced" },
      { id: "trading-109", title: "Portfolio Optimization for Agents", difficulty: "advanced" },
      { id: "trading-110", title: "Backtesting & Simulation", difficulty: "advanced" },
      { id: "trading-111", title: "Live Trading Operations", difficulty: "expert" },
      { id: "trading-112", title: "Jim Simons: Quantitative Mastery", difficulty: "expert" },
    ],
    certificationPrice: "$0.01 USDC",
    badge: "Certified Trader",
  },
  {
    id: "defi",
    title: "DeFi Operations",
    description:
      "Safe swap execution, slippage management, MEV awareness, liquidity provision, and cross-chain bridging.",
    lessons: [
      { id: "defi-101", title: "DEX Fundamentals", difficulty: "beginner" },
      { id: "defi-102", title: "Slippage & Price Impact", difficulty: "beginner" },
      { id: "defi-103", title: "MEV Awareness & Protection", difficulty: "intermediate" },
      { id: "defi-104", title: "Liquidity Pool Operations", difficulty: "intermediate" },
      { id: "defi-105", title: "Cross-Chain Bridging", difficulty: "intermediate" },
      { id: "defi-106", title: "Yield Strategy Execution", difficulty: "advanced" },
      { id: "defi-107", title: "Flash Loan Safety", difficulty: "advanced" },
      { id: "defi-108", title: "Multi-Chain Portfolio Management", difficulty: "expert" },
    ],
    certificationPrice: "$0.01 USDC",
    badge: "DeFi Navigator",
  },
  {
    id: "security",
    title: "Security Fundamentals",
    description:
      "Prompt injection defense, credential handling, malicious skill detection, and sandbox escape prevention.",
    lessons: [
      { id: "sec-101", title: "Threat Landscape for AI Agents", difficulty: "beginner" },
      { id: "sec-102", title: "Prompt Injection Defense", difficulty: "beginner" },
      { id: "sec-103", title: "Credential & Secret Management", difficulty: "intermediate" },
      { id: "sec-104", title: "Malicious Skill Detection", difficulty: "intermediate" },
      { id: "sec-105", title: "Sandbox Escape Prevention", difficulty: "intermediate" },
      { id: "sec-106", title: "Transaction Signing Safety", difficulty: "advanced" },
      { id: "sec-107", title: "Social Engineering Against Agents", difficulty: "advanced" },
      { id: "sec-108", title: "Supply Chain Attacks", difficulty: "advanced" },
      { id: "sec-109", title: "Incident Response for Agents", difficulty: "expert" },
      { id: "sec-110", title: "ClawHub Real Case Studies", difficulty: "expert" },
    ],
    certificationPrice: "$0.01 USDC",
    badge: "Security Hardened",
  },
  {
    id: "social",
    title: "Social Intelligence",
    description:
      "Anti-spam patterns, community engagement, cross-platform posting, and reputation building.",
    lessons: [
      { id: "social-101", title: "Social Platform APIs for Agents", difficulty: "beginner" },
      { id: "social-102", title: "Anti-Spam & Rate Limiting", difficulty: "beginner" },
      { id: "social-103", title: "Community Engagement Patterns", difficulty: "intermediate" },
      { id: "social-104", title: "Cross-Platform Posting Strategy", difficulty: "intermediate" },
      { id: "social-105", title: "Reputation Building", difficulty: "advanced" },
      { id: "social-106", title: "Farcaster x402 Integration", difficulty: "advanced" },
    ],
    certificationPrice: "$0.01 USDC",
    badge: "Social Agent",
  },
  {
    id: "creative",
    title: "Creative & Content",
    description:
      "Image generation, thread writing, storytelling, data visualization, and meme economy.",
    lessons: [
      { id: "creative-101", title: "Content Strategy for Agents", difficulty: "beginner" },
      { id: "creative-102", title: "Image Generation Best Practices", difficulty: "beginner" },
      { id: "creative-103", title: "Thread Writing & Storytelling", difficulty: "intermediate" },
      { id: "creative-104", title: "Data Visualization", difficulty: "intermediate" },
      { id: "creative-105", title: "Meme Economy Participation", difficulty: "advanced" },
      { id: "creative-106", title: "Multimedia Content Pipelines", difficulty: "advanced" },
      { id: "creative-107", title: "Viral Content Analysis", difficulty: "expert" },
    ],
    certificationPrice: "$0.01 USDC",
    badge: "Content Creator",
  },
];

export async function GET() {
  const enforced = isX402EnforcementEnabled();
  const paidStatus = enforced ? "live (x402 enforced)" : "live (free — X402_PAY_TO_ADDRESS not configured)";

  // Wspolny opis metody platnosci dla platnych tras.
  // `amount` bez znaku $ (zgodnosc wsteczna), `x402Price` w formacie Money x402.
  const priceEntry = (price: string) => ({
    amount: price.replace(/^\$/, ""),
    x402Price: price,
    currency: "USDC",
    protocol: "x402",
    x402Version: 2,
    scheme: "exact",
    network: MYCLAW_NETWORK,
    networkName: MYCLAW_NETWORK_NAME,
    enforced,
  });

  return NextResponse.json({
    academy: "MyClaw",
    version: "1.1.0",
    description: "The first multi-discipline academy built for AI agents",
    pricing: {
      lesson: priceEntry(MYCLAW_PRICES.lesson),
      challenge: priceEntry(MYCLAW_PRICES.challenge),
      certification: priceEntry(MYCLAW_PRICES.certification),
      certificate_mint: { ...priceEntry(MYCLAW_PRICES.certificateMint), enforced: false, status: "not implemented" },
    },
    disciplines: DISCIPLINES,
    total_lessons: DISCIPLINES.reduce((sum, d) => sum + d.lessons.length, 0),
    certification: {
      passThresholdPercent: PASS_THRESHOLD_PERCENT,
      questionsPerAttempt: EXAM_QUESTIONS_PER_ATTEMPT,
      questionBankSize: Object.fromEntries(
        Object.entries(CERTIFICATION_EXAMS).map(([discipline, questions]) => [discipline, questions.length])
      ),
      examPaper:
        "GET /api/myclaw/certify?discipline={id}&agentAddress=0x... — free, returns the questions drawn for your next attempt (without answers)",
      grading:
        "POST /api/myclaw/certify — answers are graded against the drawn questions; below threshold returns passed: false",
      attemptLimits: {
        cooldownMs: EXAM_ATTEMPT_COOLDOWN_MS,
        maxAttemptsPer24h: EXAM_MAX_ATTEMPTS_PER_DAY,
        afterPassing: "no further attempts are accepted for that discipline",
        rejection: "HTTP 429 with nextAttemptAt — rejected attempts are not settled, so they are not charged",
      },
      verified: [
        "exam answers (graded server-side)",
        "question selection (8 drawn at random per attempt; drawn ids logged)",
        "retry limits (cooldown + daily cap + lockout after passing, from the agentProgress store)",
        "lesson completion and challenge history (recorded per agent, reported back on certify)",
      ],
      notVerified: [
        "lesson completion as a PRECONDITION for certifying (recorded and reported, but not enforced)",
        "on-chain certificate minting (not wired up)",
      ],
    },
    // UWAGA, TO ZDANIE ZMIENILO SIE SAMO. Gdy ustawiono X402_PAY_TO_ADDRESS,
    // `enforced` przeskoczylo na true i ten publiczny endpoint zaczal oglaszac
    // "active" dla sciezki, przez ktora nie przeszla ANI JEDNA platnosc.
    // Rozliczyla sie tylko trasa Aska - i to na innym lancuchu i w innym
    // tokenie. Egzekwowanie faktycznie jest wlaczone, wiec "active" zostaje,
    // ale bez drugiego zdania byloby to ogloszenie dojrzalosci, ktorej nie ma.
    x402_status: enforced
      ? "active — lessons, challenges and certification require x402 v2 payment (exact scheme, eip155:8453, USDC); settlement occurs only after a successful response. No payment has ever settled through these endpoints: the only x402 payment this deployment has settled went through POST /api/asks, in USDG on Robinhood Chain. Expect to be the first."
      : "inactive — X402_PAY_TO_ADDRESS is not configured on this deployment, so paid endpoints are served for free",
    x402_headers: {
      request: "PAYMENT-SIGNATURE",
      response: "PAYMENT-RESPONSE",
    },
    endpoints: {
      catalog: { path: "/api/myclaw/catalog", method: "GET", price: "FREE", status: "live" },
      exam_paper: { path: "/api/myclaw/certify?discipline={id}", method: "GET", price: "FREE", status: "live" },
      lesson: {
        path: "/api/myclaw/lessons/{id}",
        method: "GET",
        price: `${MYCLAW_PRICES.lesson} USDC`,
        status: paidStatus,
      },
      challenge: {
        path: "/api/myclaw/challenges/{id}",
        method: "POST",
        price: `${MYCLAW_PRICES.challenge} USDC`,
        status: paidStatus,
      },
      certify: {
        path: "/api/myclaw/certify",
        method: "POST",
        price: `${MYCLAW_PRICES.certification} USDC`,
        status: paidStatus,
      },
    },
  }, {
    headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' }
  });
}

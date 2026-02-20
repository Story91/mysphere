import { NextResponse } from "next/server";

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
  return NextResponse.json({
    academy: "MyClaw",
    version: "1.0.0",
    description: "The first multi-discipline academy built for AI agents",
    pricing: {
      lesson: { amount: "0.001", currency: "USDC", network: "base", protocol: "x402" },
      challenge: { amount: "0.005", currency: "USDC", network: "base", protocol: "x402" },
      certification: { amount: "0.01", currency: "USDC", network: "base", protocol: "x402" },
      certificate_mint: { amount: "0.05", currency: "USDC", network: "base", protocol: "x402" },
    },
    disciplines: DISCIPLINES,
    total_lessons: DISCIPLINES.reduce((sum, d) => sum + d.lessons.length, 0),
    endpoints: {
      catalog: "/api/myclaw/catalog (FREE)",
      lesson: "/api/myclaw/lessons/{id} (x402 $0.001)",
      challenge: "/api/myclaw/challenges/{id} (x402 $0.005)",
      certify: "/api/myclaw/certify (x402 $0.01)",
    },
  });
}

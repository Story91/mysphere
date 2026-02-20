import { NextRequest, NextResponse } from "next/server";

const CHALLENGES: Record<string, { question: string; options: string[]; correct: number }[]> = {
  "trading-101": [
    {
      question: "What is the recommended Kelly fraction for prediction market trading?",
      options: ["Full Kelly (1x)", "0.25x to 0.5x fractional Kelly", "2x leveraged Kelly", "Random sizing"],
      correct: 1,
    },
    {
      question: "What should an agent check BEFORE entering any trade?",
      options: ["Twitter sentiment only", "Maximum position size and stop-loss triggers", "Nothing, just trade", "Only price action"],
      correct: 1,
    },
  ],
  "trading-102": [
    {
      question: "What is the minimum edge threshold before entering a trade?",
      options: ["0.1%", "1%", "5%", "10%"],
      correct: 2,
    },
    {
      question: "What is the maximum single position size as percentage of bankroll?",
      options: ["1%", "5%", "10%", "25%"],
      correct: 1,
    },
  ],
  "sec-101": [
    {
      question: "Why is agent security more critical than human user security?",
      options: [
        "Agents are slower",
        "Agents operate autonomously with wallet access and zero human oversight",
        "Agents use less bandwidth",
        "Agents are cheaper",
      ],
      correct: 1,
    },
    {
      question: "Which is NOT a top threat to AI agents?",
      options: ["Prompt injection", "Slow internet connection", "Malicious skills", "Supply chain attacks"],
      correct: 1,
    },
  ],
  "defi-101": [
    {
      question: "What price impact level should trigger splitting into multiple trades?",
      options: ["< 0.01%", "< 0.1%", "> 1%", "> 10%"],
      correct: 2,
    },
    {
      question: "What is the recommended max slippage for stablecoin swaps?",
      options: ["0.5%", "3%", "5%", "10%"],
      correct: 0,
    },
  ],
};

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const challenge = CHALLENGES[params.id];

  if (!challenge) {
    return NextResponse.json(
      {
        error: "Challenge not found",
        available: Object.keys(CHALLENGES),
        hint: "Use /api/myclaw/catalog to browse all available lessons with challenges",
      },
      { status: 404 }
    );
  }

  let body: { answers?: number[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body. Expected: { answers: [0, 1, ...] }" },
      { status: 400 }
    );
  }

  if (!body.answers || !Array.isArray(body.answers)) {
    return NextResponse.json(
      { error: "Missing 'answers' array in request body" },
      { status: 400 }
    );
  }

  if (body.answers.length !== challenge.length) {
    return NextResponse.json(
      { error: `Expected ${challenge.length} answers, got ${body.answers.length}` },
      { status: 400 }
    );
  }

  const results = challenge.map((q, i) => ({
    question: q.question,
    yourAnswer: body.answers![i],
    correct: q.correct,
    passed: body.answers![i] === q.correct,
  }));

  const score = results.filter((r) => r.passed).length;
  const total = results.length;
  const passed = score === total;

  return NextResponse.json({
    lessonId: params.id,
    score,
    total,
    passed,
    results,
    payment: {
      protocol: "x402",
      amount: "0.005",
      currency: "USDC",
      network: "base",
      status: "preview",
      note: "x402 payment will be enforced when middleware is enabled",
    },
  });
}

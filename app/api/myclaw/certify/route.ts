import { NextRequest, NextResponse } from "next/server";

const VALID_DISCIPLINES = ["trading", "defi", "security", "social", "creative"];

export async function POST(request: NextRequest) {
  let body: { discipline?: string; agentAddress?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body. Expected: { discipline: string, agentAddress: string }" },
      { status: 400 }
    );
  }

  if (!body.discipline || !VALID_DISCIPLINES.includes(body.discipline)) {
    return NextResponse.json(
      {
        error: "Invalid or missing discipline",
        valid: VALID_DISCIPLINES,
      },
      { status: 400 }
    );
  }

  if (!body.agentAddress || !/^0x[a-fA-F0-9]{40}$/.test(body.agentAddress)) {
    return NextResponse.json(
      { error: "Invalid or missing agentAddress (must be valid Ethereum address)" },
      { status: 400 }
    );
  }

  // In production: verify all lessons completed, run certification test,
  // then mint soulbound ERC-721 certificate NFT on Base.
  // Current: returns certification preview.

  return NextResponse.json({
    status: "preview",
    discipline: body.discipline,
    agentAddress: body.agentAddress,
    certification: {
      passed: true,
      certificateId: `cert-${body.discipline}-${Date.now()}`,
      tier: "preview",
      note: "Certificate NFT minting will be enabled in production. This is a preview response.",
    },
    payment: {
      protocol: "x402",
      amount: "0.01",
      currency: "USDC",
      network: "base",
      status: "preview",
      note: "x402 payment will be enforced when middleware is enabled",
    },
  });
}

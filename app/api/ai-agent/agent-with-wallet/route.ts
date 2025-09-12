import { AgentRequest, AgentResponse } from "@/app/ai-agent/types/api";
import { NextResponse } from "next/server";
import { createAgentWithUserWallet } from "./create-agent-with-user-wallet";

/**
 * Handles incoming POST requests to interact with the AgentKit-powered AI agent
 * using user's selected wallet (main wallet or CDP wallet).
 * 
 * @function POST
 * @param {Request & { json: () => Promise<AgentRequest & { walletType: 'main' | 'cdp', walletAddress: string }> }} req - The incoming request object containing the user message and wallet info.
 * @returns {Promise<NextResponse<AgentResponse>>} JSON response containing the AI-generated reply or an error message.
 */
export async function POST(
  req: Request & { json: () => Promise<AgentRequest & { walletType: 'main' | 'cdp', walletAddress: string }> },
): Promise<NextResponse<AgentResponse>> {
  try {
    // 1. Extract user message and wallet info from the request body
    const { userMessage, walletType, walletAddress } = await req.json();

    if (!userMessage) {
      return NextResponse.json(
        { error: "userMessage is required" },
        { status: 400 }
      );
    }

    if (!walletType || !walletAddress) {
      return NextResponse.json(
        { error: "walletType and walletAddress are required" },
        { status: 400 }
      );
    }

    // 2. Get the agent with user's wallet
    const agent = await createAgentWithUserWallet(walletType, walletAddress);

    // 3. Start streaming the agent's response
    const stream = await agent.stream(
      { messages: [{ content: userMessage, role: "user" }] },
      { configurable: { thread_id: `user-wallet-${walletAddress}` } },
    );

    // 4. Process the streamed response chunks into a single message
    let agentResponse = "";
    for await (const chunk of stream) {
      if ("agent" in chunk) {
        agentResponse += chunk.agent.messages[0].content;
      }
    }

    // 5. Return the final response
    return NextResponse.json({ 
      response: agentResponse,
      walletType,
      walletAddress 
    });
  } catch (error) {
    console.error("Error processing request:", error);
    return NextResponse.json({
      error:
        error instanceof Error
          ? error.message
          : "I'm sorry, I encountered an issue processing your message. Please try again later.",
    });
  }
}
